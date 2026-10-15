const {test}=require('node:test'),assert=require('node:assert/strict');
const {register,publishEvent}=require('./core.cjs');
const {validateDiscordEvents}=require('../discord-events.js');
test('Discord sync posts once, skips unchanged teams and edits the existing reply on changes',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'bot.cjs'),'utf8');
  const event={id:'event1',publishedAt:'now',title:'Cup',channelId:'channel',messageId:'registration'};
  const tournament={discordEventId:'event1',teamSize:2,teams:[{name:'Team 01',players:[{name:'Alice'},{name:'Bob'}]}]};
  let sent=0,edited=0,postedPayload;
  class Embed{setTitle(){return this;}setColor(){return this;}setDescription(){return this;}setURL(){return this;}setImage(){return this;}}
  const message={id:'teams',edit:async()=>{edited++;}},registration={reply:async payload=>{sent++;postedPayload=payload;return message;}};
  const context={queue:Promise.resolve(),syncingTeams:false,process:{env:{GITHUB_REPOSITORY:'owner/repo',GITHUB_BRANCH:'main',GITHUB_TOKEN:'fake',SITE_URL:'https://example.com'}},data:{events:[event]},Buffer,AbortSignal,EmbedBuilder:Embed,ActionRowBuilder:class{addComponents(){return this;}},ButtonBuilder:class{setLabel(){return this;}setStyle(){return this;}setURL(){return this;}},ButtonStyle:{Link:5},escapeMarkdown:value=>value,teamAnnouncements:require('./core.cjs').teamAnnouncements,renderTeamImages:()=>[{name:'teams-1.png',attachment:Buffer.from('png')}],save(){},console:{error(){}},fetch:async()=>({ok:true,json:async()=>({content:Buffer.from(JSON.stringify(tournament)).toString('base64')})}),client:{channels:{fetch:async()=>({messages:{fetch:async id=>id==='registration'?registration:message,delete:async()=>{}}})}}};
  vm.runInNewContext(source.slice(source.indexOf('async function syncTeams(){'),source.indexOf('client.on(Events.InteractionCreate')),context);
  await context.syncTeams();assert.equal(sent,1);assert.equal(postedPayload.files[0].name,'teams-1.png');assert.deepEqual(Array.from(event.teamMessageIds),['teams']);
  await context.syncTeams();assert.equal(sent,1);assert.equal(edited,0);
  tournament.teams[0].name='Renamed team';await context.syncTeams();assert.equal(sent,1);assert.equal(edited,1);
});
test('team announcement includes rosters, captains and map, and ignores score changes',()=>{
  const {teamAnnouncements}=require('./core.cjs');
  const data={discordEventId:'cup',teamSize:2,format:'single',matches:[{map:'Nuke'}],teams:[{name:'Team 01',captainId:'a',players:[{id:'a',name:'Alice'},{id:'b',name:'Bob'}]},{name:'Team 02',players:[{id:'c',name:'Carol'},{id:'d',name:'Don'}]}]};
  const text=teamAnnouncements(data)[0];assert.match(text,/2v2 · Nuke/);assert.match(text,/Alice · Captain\nBob/);assert.match(text,/Team 02/);
  data.matches[0].result={scores:[13,9]};assert.equal(teamAnnouncements(data)[0],text);
  delete data.discordEventId;assert.deepEqual(teamAnnouncements(data),[]);
});
test('large team announcements keep every player within Discord message limits',()=>{
  const {teamAnnouncements}=require('./core.cjs');
  const teams=Array.from({length:32},(_,i)=>({name:('Team '+i+' ').padEnd(60,'X'),players:[{name:('Player '+i+'a ').padEnd(40,'a')},{name:('Player '+i+'b ').padEnd(40,'b')}]}));
  const chunks=teamAnnouncements({discordEventId:'cup',teamSize:2,teams});
  assert.ok(chunks.length>1);assert.ok(chunks.every(text=>text.length<=3900));
  for(const team of teams)for(const player of team.players)assert.ok(chunks.join('\n').includes(player.name));
});
test('clear events updates only the event file using the latest GitHub SHA',async()=>{
  const {clearPublishedDiscordEvents}=require('../discord-events.js');let saved;
  const config={api:'https://api.github.com/repos/owner/repo/contents/discord-events.json',branch:'main',token:'test'};
  await clearPublishedDiscordEvents(config,async(url,options)=>{
    assert.ok(url.startsWith(config.api));
    if(options.method==='PUT'){saved=JSON.parse(options.body);return {ok:true};}
    return {ok:true,json:async()=>({sha:'latest',content:Buffer.from(JSON.stringify({version:1,events:[{id:'cup',title:'Cup',players:['Alice']}]})).toString('base64')})};
  });
  assert.equal(saved.sha,'latest');assert.equal(saved.branch,'main');assert.deepEqual(JSON.parse(atob(saved.content)),{version:1,events:[]});
  await assert.rejects(clearPublishedDiscordEvents(config,async(url,options)=>options.method==='PUT'?{ok:false,status:409}:{ok:true,json:async()=>({sha:'old',content:btoa('{"version":1,"events":[]}')})}),/changed/);
});
test('registrations update by account, reject duplicate names and respect capacity',()=>{
  const e={capacity:2,players:[]};register(e,'1',' Alice ');register(e,'1','Alicia');register(e,'2','Bob');
  assert.equal(e.players.length,2);assert.throws(()=>register(e,'3','Carol'),/full/);assert.throws(()=>register(e,'2','ALICIA'),/already/);
  e.publishedAt='now';assert.throws(()=>register(e,'1','New'),/closed/);
});
test('publish preserves other events, sends SHA and excludes account IDs',async()=>{
  const original={version:1,events:[{id:'old',title:'Old cup',players:['Don']}]};let body;
  const request=async(url,options)=>{if(options.method==='PUT'){body=JSON.parse(options.body);return {ok:true};}return {ok:true,json:async()=>({sha:'original-sha',content:Buffer.from(JSON.stringify(original)).toString('base64')})};};
  await publishEvent({id:'new',title:'Friday',capacity:2,players:[{userId:'123',name:'Alice'},{userId:'456',name:'Bob'}]},{repository:'owner/repo',branch:'main',token:'test'},request);
  const published=JSON.parse(Buffer.from(body.content,'base64'));assert.equal(body.sha,'original-sha');assert.deepEqual(published.events[0],original.events[0]);assert.deepEqual(published.events[1].players,['Alice','Bob']);assert.equal(JSON.stringify(published).includes('userId'),false);validateDiscordEvents(published);
});
test('publish fails on concurrent GitHub modification and incomplete attendance',async()=>{
  const e={id:'cup',title:'Cup',capacity:2,players:[{name:'Alice'},{name:'Bob'}]};
  await assert.rejects(publishEvent({...e,capacity:3},{},()=>{throw Error('must not fetch');}),/Fill all/);
  await assert.rejects(publishEvent(e,{repository:'a/b',branch:'main',token:'x'},async(url,o)=>o.method?{ok:false,status:409}:{ok:true,json:async()=>({sha:'x',content:Buffer.from('{"version":1,"events":[]}').toString('base64')})}),/changed/);
});
test('event input rejects unsafe roster shape, duplicate IDs and names',()=>{
  for(const players of [['Bob','bob'],[''],['a\nb'],['x'.repeat(41)]])assert.throws(()=>validateDiscordEvents({version:1,events:[{id:'cup',title:'Cup',players}]}));
  assert.throws(()=>validateDiscordEvents({version:1,events:[{id:'cup',title:'Cup',players:['Bob']},{id:'cup',title:'Cup',players:['Alice']}]}));
});
test('website loads selected roster, handles cancellation and locks controls during a draw',async()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  const nodes=Object.fromEntries(['game-source','discord-event-choice','discord-event','load-discord-event','refresh-discord-events','discord-event-status'].map(id=>[id,{value:'',replaceChildren(){},add(){}}]));
  let allowed=true,loaded=null,cancel=false,notices=0;
  const context={document:{getElementById:id=>nodes[id]},Option:function(text,value){this.text=text;this.value=value;},fetch:async()=>({ok:true,json:async()=>({version:1,events:[{id:'friday',title:'Friday',players:['Alice','Bob']}]})})};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../discord-events.js'),'utf8'),context);
  const loader=context.createDiscordEventLoader({canLoad:()=>allowed,load:e=>{if(cancel)return false;loaded=e;},notify:()=>notices++});
  await new Promise(resolve=>setImmediate(resolve));nodes['game-source'].value='discord';nodes['discord-event'].value='friday';nodes['discord-event'].onchange();
  assert.equal(loaded.title,'Friday');assert.equal(loader.getSelectedEvent().title,'Friday');assert.equal(notices,1);
  cancel=true;nodes['discord-event'].onchange();assert.equal(notices,1);
  cancel=false;nodes['discord-event'].value='';nodes['discord-event'].onchange();assert.equal(loaded,null);assert.equal(notices,1);nodes['game-source'].value='custom';nodes['game-source'].onchange();assert.equal(nodes['discord-event-choice'].hidden,true);
  allowed=false;loader.render();assert.equal(nodes['discord-event'].disabled,true);assert.equal(nodes['refresh-discord-events'].disabled,true);
});

test('match connection validates the server and refuses stale event links',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../connect.js'),'utf8');
  async function run(data,event){const nodes=Object.fromEntries(['status','command','launch','copy','connection'].map(id=>[id,{hidden:true}]));await vm.runInNewContext(source,{document:{getElementById:id=>nodes[id]},location:{search:'?event='+event},URLSearchParams,encodeURIComponent,validServerAddress:require('../game-night.js').validServerAddress,serverConnectionCommand:require('../game-night.js').serverConnectionCommand,fetch:async()=>({ok:true,json:async()=>data})});return nodes;}
  const data={discordEventId:'cup',serverAddress:'server.example.com:27015'};
  const ok=await run(data,'cup');assert.equal(ok.connection.hidden,false);assert.equal(ok.launch.href,'steam://connect/server.example.com:27015');
  const protectedMatch=await run({...data,serverPassword:'test password/#'},'cup');assert.equal(protectedMatch.launch.href,'steam://connect/server.example.com:27015/test%20password%2F%23');
  const stale=await run(data,'old');assert.equal(stale.connection.hidden,true);assert.match(stale.status.textContent,/no longer/);
  const unsafe=await run({...data,serverAddress:'host;quit'},'cup');assert.equal(unsafe.connection.hidden,true);
  const missing=await run({...data,serverAddress:''},'cup');assert.match(missing.status.textContent,/not added/);
});

test('FACEIT normalization retains stats and excludes Steam and account identifiers',()=>{
  const {normalizeFaceitMatch}=require('./faceit.cjs');const match={match_id:'match',status:'FINISHED',finished_at:100,teams:{one:{name:'Blue'},two:{name:'Orange'}}};
  const stats={rounds:[{round_stats:{Map:'de_nuke'},teams:['one','two'].map((id,i)=>({team_id:id,team_stats:{'Final Score':String(13-i)},players:[{nickname:'Player '+i,player_id:'private-faceit-id',game_player_id:'private-steam-id',player_stats:{Kills:'15',Deaths:'10',Assists:'3'}}]}))}]};
  const games=normalizeFaceitMatch(match,stats);assert.equal(games.length,1);assert.equal(games[0].teams[0].players[0].assists,3);assert.equal(JSON.stringify(games).includes('private-'),false);assert.deepEqual(normalizeFaceitMatch({...match,status:'CANCELLED'},stats),[]);
});

test('FACEIT sync excludes cancelled games and avoids unchanged GitHub writes',async()=>{
  const {syncFaceitGames}=require('./faceit.cjs');let writes=0,statsCalls=0;
  const game={id:'done:0',matchId:'done',teams:[]};
  const old={hubId:'hub',games:[game]};
  await syncFaceitGames({FACEIT_API_KEY:'fake',FACEIT_HUB_ID:'hub',GITHUB_REPOSITORY:'owner/repo',GITHUB_BRANCH:'main',GITHUB_TOKEN:'fake'},async(url,options)=>{
    if(options.method==='PUT'){writes++;throw Error('Unexpected write');}
    if(url.includes('api.github.com'))return {ok:true,json:async()=>({sha:'sha',content:Buffer.from(JSON.stringify(old)).toString('base64')})};
    if(url.includes('/stats')){statsCalls++;throw Error('Unexpected stats request');}
    return {ok:true,json:async()=>({items:[{match_id:'cancelled',status:'CANCELLED'},{match_id:'done',status:'FINISHED'}]})};
  });assert.equal(writes,0);assert.equal(statsCalls,0);
});
