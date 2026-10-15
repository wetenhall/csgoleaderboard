const {test}=require('node:test'),assert=require('node:assert/strict');
const {register,publishEvent}=require('./core.cjs');
const {validateDiscordEvents}=require('../discord-events.js');
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
