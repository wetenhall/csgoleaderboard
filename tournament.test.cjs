const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { resolveTournament } = require('./app.js');
const { cupMode, cupFinal, completedCup, archiveCup, careerRecords, matchNight } = require('./extras.js');
test('new draws do not inherit another Discord event link and valid links survive validation',()=>{
  const {makeTournament,validateData,emptyTournament}=require('./manager.js');
  const players=Array.from({length:4},(_,i)=>({id:'p'+i,name:'Player '+i}));
  const cup=makeTournament(players,2,{name:'Cup',discordEventId:'previous'},undefined,0,['Nuke']);
  assert.equal(cup.discordEventId,undefined);cup.discordEventId='new-event';validateData(cup,resolveTournament);
  assert.equal(emptyTournament(cup).discordEventId,undefined);
  assert.throws(()=>validateData({...cup,discordEventId:'bad/link'},resolveTournament),/Discord event link/);
});
test('remembered organiser token persists on device and clears both device and legacy storage',()=>{
  const source=fs.readFileSync('manager.js','utf8'),persistent=new Map(),legacy=new Map([['repo','legacy']]);
  const context={tokenStorageKey:'repo',localStorage:{setItem:(k,v)=>persistent.set(k,v),removeItem:k=>persistent.delete(k)},sessionStorage:{removeItem:k=>legacy.delete(k)}};
  vm.runInNewContext(source.slice(source.indexOf('  function storeToken(value)'),source.indexOf('  const say =')),context);
  assert.equal(context.storeToken('test-key'),true);assert.equal(persistent.get('repo'),'test-key');assert.equal(legacy.has('repo'),false);
  context.storeToken('');assert.equal(persistent.has('repo'),false);
  context.localStorage.setItem=()=>{throw Error('Storage unavailable');};assert.equal(context.storeToken('test-key'),false);
});
test('Single Game games support 2v2 through 5v5 with exactly two teams and a working result',()=>{
  const {makeTournament,validateData,applyResult}=require('./manager.js');
  for(const size of [2,3,4,5]){
    const players=Array.from({length:size*2},(_,i)=>({id:'p'+i,name:'Player '+i}));
    const cup=makeTournament(players,size,{name:'Custom match'},undefined,4,['Nuke'],2,'single');
    assert.equal(cup.groups.length,0);assert.equal(cup.matches.length,1);assert.equal(cup.matches[0].label,'Single Game · '+size+'v'+size);
    assert.ok(cup.teams.every(team=>team.players.length===size));validateData(cup,resolveTournament);
    const done=applyResult(cup,'f1',{teams:resolveTournament(cup).matches[0].ids,scores:[13,9]},resolveTournament).next;
    assert.equal(completedCup(done,resolveTournament),true);
    assert.throws(()=>makeTournament([...players,...players.map(p=>({...p,id:p.id+'x'}))],size,{name:'Bad'},undefined,0,['Nuke'],2,'single'),/exactly/);
  }
});
test('custom Load player pool button remains connected to the shared roster loader',()=>{
  const source=fs.readFileSync('manager.js','utf8');
  const loader=source.slice(source.indexOf('  function loadPlayerPool(){'),source.indexOf('  const teamColours='));
  const nodes={'pool-input':{value:'Alice\nBob'},'load-pool':{},'pool-list':{children:[],replaceChildren(){this.children=[];},append(node){this.children.push(node);}}};
  const context={$:id=>nodes[id],loadedDiscordEvent:null,locked:false,busy:false,pool:[],selectionCount(){},announce(){},element:()=>({append(){}}),document:{createTextNode:name=>name}};
  vm.runInNewContext(loader,context);assert.equal(typeof nodes['load-pool'].onclick,'function');nodes['load-pool'].onclick();
  assert.equal(context.pool.length,2);assert.equal(context.pool[0].name,'Alice');assert.equal(nodes['pool-list'].children.length,2);
  context.loadedDiscordEvent={players:['Carol','Don']};nodes['load-pool'].onclick();assert.equal(context.pool[0].name,'Carol');
});
test('setup stages validate forward progress, invalidate changed players and protect active draws',()=>{
  const source=fs.readFileSync('setup.js','utf8'),nodes={};
  for(const prefix of ['setup-stage-','setup-tab-','setup-next-','setup-back-'])for(let i=1;i<=4;i++)nodes[prefix+i]={hidden:true,setAttribute(){},removeAttribute(){},focus(){}};
  nodes['setup-status']={};nodes['setup-summary']={};
  let invalidOptions=true,invalidPlayers=true,locked=false,roster='first',allowReset=false,prepared=0;
  const context={document:{getElementById:id=>nodes[id]}};vm.createContext(context);vm.runInContext(source,context);
  const ui=context.createSetupStages({isBusy:()=>false,isLocked:()=>locked,validateOptions:()=>invalidOptions?'Choose maps':'',validatePlayers:()=>invalidPlayers?'Choose players':'',preparePlayers:()=>{prepared++;},signature:()=>roster,summary:()=>roster,resetDraw:()=>{if(allowReset)locked=false;}});
  assert.equal(nodes['setup-stage-1'].hidden,false);assert.equal(nodes['setup-tab-4'].disabled,true);
  nodes['setup-next-1'].onclick();nodes['setup-next-2'].onclick();assert.equal(nodes['setup-stage-2'].hidden,false);assert.equal(nodes['setup-status'].textContent,'Choose maps');
  invalidOptions=false;nodes['setup-next-2'].onclick();assert.equal(prepared,1);nodes['setup-next-3'].onclick();assert.equal(nodes['setup-stage-3'].hidden,false);
  invalidPlayers=false;nodes['setup-next-3'].onclick();assert.equal(nodes['setup-stage-4'].hidden,false);
  locked=true;nodes['setup-back-4'].onclick();assert.equal(nodes['setup-stage-4'].hidden,false);
  allowReset=true;nodes['setup-back-4'].onclick();assert.equal(nodes['setup-stage-3'].hidden,false);assert.equal(nodes['setup-tab-4'].disabled,true);
  nodes['setup-next-3'].onclick();roster='changed';ui.render();assert.equal(nodes['setup-stage-3'].hidden,false);
  ui.reset();assert.equal(nodes['setup-stage-1'].hidden,false);
});
test('all five sizes support groups and knockout with complete rosters and separate career modes',()=>{
  const {makeTournament,validateData}=require('./manager.js');
  for(const size of [1,2,3,4,5])for(const format of ['groups','knockout']){
    const players=Array.from({length:size*4},(_,i)=>({id:'p'+i,name:'Player '+i}));
    const cup=makeTournament(players,size,{name:'Cup'},undefined,format==='groups'?2:0,undefined,2,format);
    validateData(cup,resolveTournament);
    assert.equal(cup.teams.length,4);assert.ok(cup.teams.every(t=>t.players.length===size));
    assert.equal(cup.groups.length,format==='groups'?2:0);
    assert.equal(new Set(cup.teams.flatMap(t=>t.players.map(p=>p.id))).size,size*4);
    assert.equal(cupMode(cup),['','1v1','duos','trios','quads','squads'][size]);
    if(size>1)assert.ok(cup.matches.every(m=>m.map));
  }
  const {manualRosters,createCaptainCases,openCaptainCase}=require('./game-night.js');
  for(const size of [3,4]){
    const players=Array.from({length:size*2},(_,i)=>({id:'p'+i,name:'Player '+i}));
    assert.ok(manualRosters(players,players.map(p=>p.id),size).every(t=>t.length===size));
    let draft=createCaptainCases(players,size,['p0','p1'],players.slice(2).map(p=>p.id));
    for(let i=0;i<draft.cases.length;i++)draft=openCaptainCase(draft,i);
    assert.ok(draft.teams.every(t=>t.players.length===size));
  }
});
test('skip finishes required 5v5 map selection and leaves veto decisions intact',async()=>{
  const source=fs.readFileSync('manager.js','utf8');
  const handler=source.slice(source.indexOf("  $('skip-animation').onclick="),source.indexOf("  $('spin').onclick="));
  for(const veto of [false,true]){
    let mapSelections=0;
    const nodes={'skip-animation':{disabled:false},spin:{onclick:async()=>context.remaining.pop()}};
    const context={$:id=>nodes[id],remaining:[1,2],token:'test',busy:false,skippingAnimation:false,draw:{format:'single',mapMethod:veto?'veto':'wheel'},drawnMap:null,selectedMaps:()=>['Nuke'],stopAutoSpin(){},controls(){},announce(){},spinMap:async()=>{assert.equal(context.skippingAnimation,true);mapSelections++;context.drawnMap='Nuke';}};
    vm.runInNewContext(handler,context);await nodes['skip-animation'].onclick();
    assert.equal(context.remaining.length,0);assert.equal(mapSelections,veto?0:1);assert.equal(context.skippingAnimation,false);
  }
});
test('completed five-duo knockout draw is publishable and explains blocked settings',()=>{
  const {makeTournament,drawPublishReason}=require('./manager.js');
  const players=Array.from({length:10},(_,i)=>({id:'p'+i,name:'Player '+i}));
  const draw=makeTournament(players,2,{name:'Duos'},undefined,0,['Nuke'],2,'groups');
  const state={connected:true,busy:false,spinning:false,teamSize:2,format:'groups',groups:0,qualifiers:2,maps:['Nuke']};
  assert.equal(drawPublishReason(draw,state),'');
  assert.match(drawPublishReason(draw,{...state,maps:[]}),/fixture map/);
  assert.match(drawPublishReason(draw,{...state,groups:1}),/group count/);
  assert.match(drawPublishReason(draw,{...state,spinning:true}),/spin/);
  assert.match(drawPublishReason(draw,{...state,connected:false}),/organiser/);
});
test('frequent players can be added and removed independently of tournament history',()=>{
  const {savedPlayers,updateSavedPlayers}=require('./extras.js');
  const {emptyTournament,validateData,makeTournament}=require('./manager.js');
  const data=fixture();data.history=[{tournament:{teams:[{players:[{name:'Alice'},{name:'Bob'}]}]}}];
  const saved=updateSavedPlayers(data,[' alice ','Carol']);
  assert.deepEqual(saved.savedPlayers,['Alice','Bob','Carol']);
  assert.equal(data.savedPlayers,undefined);
  const removed=updateSavedPlayers(saved,[],['ALICE']);
  assert.deepEqual(savedPlayers(removed.history,removed.savedPlayers),['Bob','Carol']);
  assert.deepEqual(removed.teams,data.teams);assert.deepEqual(removed.matches,data.matches);
  assert.deepEqual(emptyTournament(removed).savedPlayers,['Bob','Carol']);
  delete removed.history;
  for(const size of [1,2,5]){
    const players=Array.from({length:size*2},(_,i)=>({id:'p'+i,name:'Player '+i}));
    assert.deepEqual(makeTournament(players,size,removed,undefined,size===1?1:0).savedPlayers,['Bob','Carol']);
  }
  validateData(removed,resolveTournament);
  assert.throws(()=>validateData({...removed,savedPlayers:['Bob','bob']},resolveTournament),/saved players/);
  assert.throws(()=>updateSavedPlayers(removed,['x'.repeat(41)]),/40 characters/);
  assert.deepEqual(updateSavedPlayers({...removed,savedPlayers:[]},[]).savedPlayers,[]);
});
function fixture() { return JSON.parse(vm.runInNewContext(fs.readFileSync('tournament.js', 'utf8') + '\nJSON.stringify(TOURNAMENT)')); }
function completeGroups(data) { data.matches.filter(m => m.group).forEach(m => { m.result = { teams: m.teams, scores: [13, 9] }; }); }
test('current tournament data is valid', () => { assert.equal(resolveTournament(fixture()).matches.length, 15); });
test('groups qualify top two into cross-group semi-finals and final', () => {
  const data = fixture(); completeGroups(data);
  let state = resolveTournament(data);
  assert.deepEqual(state.matches.find(m => m.id === 's1').ids, ['t1', 't6']);
  assert.deepEqual(state.matches.find(m => m.id === 's2').ids, ['t5', 't2']);
  assert.equal(state.groups[0].rows[0].difference, 12);
  for (const match of data.matches.filter(m => !m.group)) {
    const current = resolveTournament(data).matches.find(m => m.id === match.id);
    match.result = { teams: current.ids, scores: [13, 9] };
  }
  assert.equal(resolveTournament(data).matches.at(-1).winner, 't1');
  data.matches[0].result.scores = [9, 13];
  assert.throws(() => resolveTournament(data), /participants/);
});
test('incomplete groups do not assign seeds and invalid scores fail', () => {
  const data = fixture();
  assert.deepEqual(resolveTournament(data).matches.find(m => m.id === 's1').ids, [null, null]);
  data.matches[0].result = { teams: ['t1','t2'], scores: [-1,12] };
  assert.throws(() => resolveTournament(data));
});
test('unresolved qualification ties require a recorded tiebreak decision', () => {
  const data = fixture(); completeGroups(data);
  // A beats B, B beats C, C beats A; all three beat D by equal margins.
  const scores = [[13,9],[13,9],[9,13],[13,9],[13,9],[13,9]];
  data.matches.slice(0,6).forEach((m,i) => { m.result.scores = scores[i]; });
  assert.equal(resolveTournament(data).groups[0].tied, true);
  assert.equal(resolveTournament(data).matches.find(m => m.id === 's1').ids[0], null);
  data.groups[0].tiebreakOrder = ['t2','t1','t3'];
  const resolved = resolveTournament(data);
  assert.equal(resolved.groups[0].qualified, true);
  assert.deepEqual(resolved.groups[0].rows.slice(0,2).map(r => r.id), ['t2','t1']);
});
const {makeTournament, orderedMatches, playerTotals, validateData, applyResult} = require('./manager.js');
test('published JSON and player stats are valid', () => {
  validateData(JSON.parse(fs.readFileSync('tournament.json','utf8')), resolveTournament);
});
for (const size of [1,2,5]) test(`draw makes eight complete ${size}-player teams and a valid schedule`, () => {
  const players=Array.from({length:size*8},(_,i)=>({id:`p${i}`,name:`Player ${i}`}));
  const data=makeTournament(players,size,fixture(),['t1','t2','t3','t4','t5','t6','t7','t8']);
  validateData(data,resolveTournament);
  assert.equal(new Set(data.teams.flatMap(t=>t.players.map(p=>p.id))).size,size*8);
  assert.ok(data.teams.every(t=>t.players.length===size));
  assert.equal(data.matches.filter(m=>m.group==='A').length,6);
  assert.deepEqual(orderedMatches(data.matches).slice(0,4).map(m=>m.id),['a1','b1','a2','b2']);
});
test('result corrections replace stats and clear only invalid playoff descendants', () => {
  const players=Array.from({length:16},(_,i)=>({id:`p${i}`,name:`Player ${i}`}));
  const data=makeTournament(players,2,fixture(),['t1','t2','t3','t4','t5','t6','t7','t8']);
  completeGroups(data);
  data.matches[0].result.players={p0:{kills:20,deaths:10,assists:5}};
  let change=applyResult(data,'a1',{teams:['t1','t2'],scores:[13,8],players:{p0:{kills:25,deaths:8,assists:3}}},resolveTournament);
  assert.equal(playerTotals(change.next).find(p=>p.id==='p0').kills,25);
  assert.equal(playerTotals(change.next).find(p=>p.id==='p0').games,1);
  for(const m of change.next.matches.filter(m=>!m.group)) {const ids=resolveTournament(change.next).matches.find(x=>x.id===m.id).ids;m.result={teams:ids,scores:[13,9]};}
  change=applyResult(change.next,'a1',{teams:['t1','t2'],scores:[8,13],players:{}},resolveTournament);
  assert.ok(change.cleared.includes('s1'));
  assert.equal(change.next.matches.find(m=>m.id==='f1').result,null);
});
test('foreign player stats and partial stats cannot publish',()=>{
  const data=fixture();data.matches[0].result={teams:['t1','t2'],scores:[13,9],players:{unknown:{kills:3,deaths:2,assists:1}}};
  assert.throws(()=>validateData(data,resolveTournament),/Player stats/);
});
for (const [count,size] of [[2,1],[3,1],[8,1],[2,2],[3,5],[5,2],[7,2],[10,5]]) test(`${count} teams of ${size}: complete schedule and progression`,()=>{
  const players=Array.from({length:count*size},(_,i)=>({id:`p${i}`,name:`Player ${i}`}));
  const ids=Array.from({length:count},(_,i)=>`t${i+1}`);
  const data=makeTournament(players,size,fixture(),ids);
  validateData(data,resolveTournament);
  assert.equal(data.teams.length,count);
  assert.equal(data.groups.length,count<6?1:2);
  assert.equal(data.mode,size===1?'1v1':size===2?'duos':'squads');
  for(const group of data.groups){
    group.tiebreakOrder=[...group.teams];
    const games=data.matches.filter(m=>m.group===group.id);
    assert.equal(games.length,group.teams.length*(group.teams.length-1)/2);
    for(const id of group.teams)assert.equal(games.filter(m=>m.teams.includes(id)).length,group.teams.length-1);
  }
  assert.equal(new Set(orderedMatches(data.matches).map(m=>m.id)).size,data.matches.length);
  for(const game of orderedMatches(data.matches)){
    const resolved=resolveTournament(data).matches.find(m=>m.id===game.id);
    assert.ok(resolved.ids.every(Boolean));
    game.result={teams:resolved.ids,scores:[13,7]};
  }
  validateData(data,resolveTournament);
  assert.ok(resolveTournament(data).matches.find(m=>m.id==='f1').winner);
  if(count===3)assert.equal(data.matches.length,4);
});
test('draw rejects incomplete teams and too few players',()=>{
  for(const [count,size] of [[1,1],[3,2],[11,5],[5,5],[17,2]]){
    const players=Array.from({length:count},(_,i)=>({id:`p${i}`,name:`P${i}`}));
    assert.throws(()=>makeTournament(players,size,fixture()),/complete teams/);
  }
});

for (const size of [1,2]) for (const [count,groups] of [[2,0],[3,0],[5,0],[9,0],[5,1],[5,2],[6,3],[9,3],[8,4],[11,4]]) test(count+' teams of '+size+' with '+groups+' groups progress to one champion',()=>{
  const players=Array.from({length:count*size},(_,i)=>({id:'p'+i,name:'Player '+i}));
  const ids=Array.from({length:count},(_,i)=>'t'+(i+1));
  let data=makeTournament(players,size,fixture(),ids,groups);
  assert.equal(data.groups.length,groups);
  assert.equal(data.matches.filter(m=>!m.group).length,(groups?groups*2:count)-1);
  data.groups.forEach(g=>g.tiebreakOrder=[...g.teams]);
  const losses=new Map();
  for (const game of orderedMatches(data.matches)) {
    const resolved=resolveTournament(data).matches.find(m=>m.id===game.id);
    assert.equal(resolved.ids.length,2); assert.ok(resolved.ids.every(Boolean));
    assert.notEqual(resolved.ids[0],resolved.ids[1]);
    data=applyResult(data,game.id,{teams:resolved.ids,scores:[13,7],players:{}},resolveTournament).next;
    if(!game.group) losses.set(resolved.ids[1],(losses.get(resolved.ids[1])||0)+1);
  }
  validateData(data,resolveTournament);
  const champion=resolveTournament(data).matches.find(m=>m.id==='f1').winner;
  assert.ok(champion); assert.ok(!losses.has(champion)); assert.ok([...losses.values()].every(n=>n===1));
  if(!groups) assert.equal(losses.size,count-1);
  const first=resolveTournament(data).matches.find(m=>!m.group);
  const corrected=applyResult(data,first.id,{teams:first.ids,scores:[7,13],players:{}},resolveTournament);
  assert.equal(resolveTournament(corrected.next).matches.find(m=>m.id===first.id).winner,first.ids[1]);
  if(first.id!=='f1') assert.ok(corrected.cleared.includes('f1'));
});
test('group counts require two teams per group',()=>{
 const players=Array.from({length:10},(_,i)=>({id:'p'+i,name:'Player '+i}));
 for(const count of [-1,3,4,5,1.5])assert.throws(()=>makeTournament(players,2,fixture(),undefined,count),/groups/);
});

for(const size of [2,5]) test('selected maps rotate across all '+size+' player fixtures and survive score updates',()=>{
 const players=Array.from({length:size*8},(_,i)=>({id:'p'+i,name:'Player '+i}));
 const maps=size===1?['Pool Day','AWP Lego 2','AIM Puma']:size===2?['Poseidon','Debris','Eldorado']:['Mirage','Dust2','Cache'];
 const data=makeTournament(players,size,fixture(),undefined,4,maps);
 validateData(data,resolveTournament); assert.deepEqual(data.mapPool,maps);
 const schedule=orderedMatches(data.matches);
 for(let i=0;i<schedule.length;i+=maps.length)assert.equal(new Set(schedule.slice(i,i+maps.length).map(m=>m.map)).size,Math.min(maps.length,schedule.length-i));
 for(let i=1;i<schedule.length;i++)assert.notEqual(schedule[i].map,schedule[i-1].map);
 const first=schedule[0]; const next=applyResult(data,first.id,{teams:first.teams,scores:[13,4],players:{}},resolveTournament).next;
 assert.deepEqual(next.matches.map(m=>m.map),data.matches.map(m=>m.map));
 const reloaded=JSON.parse(JSON.stringify(next));validateData(reloaded,resolveTournament);
 assert.deepEqual(reloaded.mapPool,maps);
});
test('map selection rejects empty, duplicate and wrong-mode pools; single map covers knockout',()=>{
 const players=Array.from({length:10},(_,i)=>({id:'p'+i,name:'Player '+i}));
 for(const maps of [[],['Mirage'],['Inferno','Inferno']])assert.throws(()=>makeTournament(players,2,fixture(),undefined,0,maps),/map/);
 const data=makeTournament(players,2,fixture(),undefined,0,['Nuke']);
 assert.ok(data.matches.every(m=>m.map==='Nuke'));validateData(data,resolveTournament);
 data.matches[0].map='Dust2';assert.throws(()=>validateData(data,resolveTournament),/maps/);
});

test('clearing a tournament removes all match and player data and supports a new draw',()=>{
 const {emptyTournament}=require('./manager.js');
 const original=JSON.parse(fs.readFileSync('tournament.json','utf8'));
 const snapshot=JSON.stringify(original); const empty=emptyTournament(original);
 assert.deepEqual(empty,{...(original.gameProvider?{gameProvider:original.gameProvider}:{}),...(original.importAliases?{importAliases:original.importAliases}:{}),...(original.savedPlayers!==undefined?{savedPlayers:original.savedPlayers}:{}),...(original.serverAddress?{serverAddress:original.serverAddress}:{}),name:original.name,teams:[],groups:[],matches:[],...(original.history?{history:original.history}:{}),...(original.headers?{headers:original.headers}:{}),...(original.registrationEnabled!==undefined?{registrationEnabled:original.registrationEnabled}:{})});
 assert.equal(JSON.stringify(original),snapshot);validateData(empty,resolveTournament);
 assert.equal(resolveTournament(empty).matches.length,0);assert.deepEqual(playerTotals(empty),[]);
 const players=Array.from({length:4},(_,i)=>({id:'p'+i,name:'Player '+i}));
 validateData(makeTournament(players,2,empty,undefined,0,['Nuke']),resolveTournament);
 assert.throws(()=>validateData({...empty,groups:[{id:'A',teams:['t1']}]},resolveTournament));
 assert.throws(()=>validateData({...empty,matches:[{id:'f1'}]},resolveTournament));
});

test('awards use two-game eligibility, averages, streaks and recorded stats',()=>{
 const {tournamentAwards}=require('./manager.js');
 const data={teams:[{id:'a',name:'A',players:[{id:'p1',name:'One'}]},{id:'b',name:'B',players:[{id:'p2',name:'Two'}]},{id:'c',name:'C',players:[{id:'p3',name:'Three'}]}],matches:[]};
 const stats=(kills,deaths,assists)=>({kills,deaths,assists});
 const game=(id,teams,players)=>({id,group:'A',result:{teams,scores:[13,7],players}});
 data.matches.push(game('a1',['a','b'],{p1:stats(10,0,1),p2:stats(30,10,2)}));
 assert.ok(tournamentAwards(data).teams.every(a=>!a.winners.length));
 assert.ok(tournamentAwards(data).players.every(a=>!a.winners.length));
 data.matches.push(game('a2',['a','c'],{p1:stats(10,0,1),p3:stats(5,20,10)}),game('a3',['b','c'],{p2:stats(10,10,2),p3:stats(5,20,10)}));
 let awards=tournamentAwards(data);
 assert.deepEqual(awards.teams.map(a=>a.winners.map(w=>w.id)),[['a'],['a'],['a'],['c']]);
 assert.deepEqual(awards.players.map(a=>a.winners.map(w=>w.id)),[['p2'],['p2'],['p3'],['p3']]);
 data.matches[0].result.scores=[7,13];awards=tournamentAwards(data);
 assert.equal(awards.teams[0].winners[0].id,'b');assert.equal(awards.teams[1].winners[0].streak,2);
 delete data.matches[2].result.players.p2;
 assert.ok(tournamentAwards(data).players.every(a=>a.winners.every(w=>w.id!=='p2')));
});
test('player award ties include zero-death K/D and empty tournament states',()=>{
 const {tournamentAwards}=require('./manager.js');const players=[{id:'x',name:'X'},{id:'y',name:'Y'}];
 const data={teams:[{id:'a',name:'A',players}],matches:[1,2].map(i=>({id:'m'+i,round:i,result:{teams:['a','b'],scores:[13,7],players:Object.fromEntries(players.map(p=>[p.id,{kills:10,deaths:0,assists:3}]))}}))};
 const awards=tournamentAwards(data);assert.equal(awards.players[0].winners.length,2);assert.match(awards.players[0].metric,/∞/);
 const empty=tournamentAwards({teams:[],matches:[]});assert.ok([...empty.teams,...empty.players].every(a=>!a.winners.length && a.metric==='Awaiting more matches'));
});

test('group draws count as played with no wins or losses and require qualification tiebreaks',()=>{
 const data=fixture();for(const m of data.matches.filter(m=>m.group))m.result={teams:m.teams,scores:[12,12]};
 let state=resolveTournament(data);assert.ok(state.groups.every(g=>g.complete && g.tied));
 assert.ok(state.groups.every(g=>g.rows.every(r=>r.played===3 && r.draws===3 && r.wins===0 && r.losses===0 && r.difference===0)));
 data.groups.forEach(g=>g.tiebreakOrder=[...g.teams]);state=resolveTournament(data);assert.ok(state.matches.find(m=>m.id==='s1').ids.every(Boolean));
});
test('tied knockout results require a valid winner and propagate corrections',()=>{
 const data=fixture();completeGroups(data);
 for(const m of data.matches.filter(m=>!m.group)) {const ids=resolveTournament(data).matches.find(x=>x.id===m.id).ids;m.result={teams:ids,scores:[12,12],tiebreakWinner:ids[0]};}
 validateData(data,resolveTournament);const semi=data.matches.find(m=>m.id==='s1');
 const changed=applyResult(data,'s1',{...semi.result,tiebreakWinner:semi.result.teams[1]},resolveTournament);assert.ok(changed.cleared.includes('f1'));
 delete semi.result.tiebreakWinner;assert.throws(()=>resolveTournament(data),/tiebreak winner/);
 semi.result.tiebreakWinner='unknown';assert.throws(()=>resolveTournament(data),/tiebreak winner/);
});

test('header options validate text and persist through clear and new draws',()=>{
 const {updateHeaders,emptyTournament}=require('./manager.js');const data=fixture();const original=JSON.stringify(data);
 const updated=updateHeaders(data,' Pull up gang cup ',' 12 October 2026 · Friends Cup ');
 assert.equal(updated.headers.brand,'Pull up gang cup');assert.equal(JSON.stringify(data),original);assert.deepEqual(updated.matches,data.matches);
 assert.deepEqual(emptyTournament(updated).headers,updated.headers);
 const players=Array.from({length:4},(_,i)=>({id:'p'+i,name:'Player '+i}));assert.deepEqual(makeTournament(players,2,updated).headers,updated.headers);
 for(const [brand,banner] of [['','Test'],['Test',' '],['x'.repeat(81),'Test'],['Test','x'.repeat(121)]])assert.throws(()=>updateHeaders(data,brand,banner),/headings/);
});

test('repository configuration uses deployed owner and branch, with safe Pages fallback',()=>{
 const {repositorySettings}=require('./manager.js');
 assert.deepEqual(repositorySettings('example-owner/friends-event','release','custom.example','/'),{owner:'example-owner',repo:'friends-event',branch:'release',api:'https://api.github.com/repos/example-owner/friends-event/contents/tournament.json'});
 assert.equal(repositorySettings('','','someone.github.io','/cup/').repo,'cup');
 assert.equal(repositorySettings('','','someone.github.io','/').repo,'someone.github.io');
 assert.equal(repositorySettings('','','localhost','/'),null);
 assert.equal(repositorySettings('https://not-a-repo','main'),null);
 validateData(JSON.parse(fs.readFileSync('tournament.example.json','utf8')),resolveTournament);
});

test('1v1 publishes without maps and clears maps inherited from a previous tournament',()=>{
 const players=Array.from({length:3},(_,i)=>({id:'solo'+i,name:'Solo '+i}));
 const template=makeTournament(Array.from({length:4},(_,i)=>({id:'p'+i,name:'P'+i})),2,fixture());
 for(const groups of [0,1]){
  let data=makeTournament(players,1,template,undefined,groups,[]);
  assert.equal(data.mapPool,undefined);
  assert.ok(data.matches.every(match=>match.map===undefined));
  validateData(data,resolveTournament);
  const match=resolveTournament(data).matches.find(match=>match.ids.every(Boolean));
  data=applyResult(data,match.id,{teams:match.ids,scores:[10,6],players:{}},resolveTournament).next;
  validateData(data,resolveTournament);
  assert.equal(data.mapPool,undefined);
 }
});

test('registration visibility persists across header edits, clearing and new draws',()=>{
 const {updateHeaders,emptyTournament}=require('./manager.js');
 for(const enabled of [true,false]){
  const data={...fixture(),registrationEnabled:enabled};
  assert.equal(validateData(data,resolveTournament).registrationEnabled,enabled);
  assert.equal(updateHeaders(data,'Cup','Next cup').registrationEnabled,enabled);
  const cleared=emptyTournament(data);
  assert.equal(validateData(cleared,resolveTournament).registrationEnabled,enabled);
  const players=Array.from({length:4},(_,i)=>({id:'p'+i,name:'P'+i}));
  assert.equal(makeTournament(players,2,cleared).registrationEnabled,enabled);
 }
 assert.throws(()=>validateData({...emptyTournament(fixture()),registrationEnabled:'false'},resolveTournament),/Registration setting/);
});

test('1v1 wheel order fills balanced groups round robin and preserves assignments into playoffs',()=>{
 const {soloDrawGroups}=require('./manager.js');
 assert.deepEqual(soloDrawGroups(7,3),[[0,3,6],[1,4],[2,5]]);
 for(const [total,count] of [[2,1],[7,2],[7,3],[9,4]]){
  const players=Array.from({length:total},(_,i)=>({id:'p'+i,name:'Player '+i}));
  const slots=soloDrawGroups(total,count);
  const order=slots.flat().map(index=>'t'+(index+1));
  let data=makeTournament(players,1,fixture(),order,count,[]);
  data.groups.forEach((group,i)=>{assert.deepEqual(group.teams,slots[i].map(index=>'t'+(index+1)));group.tiebreakOrder=[...group.teams];});
  for(const match of data.matches.filter(m=>m.group))data=applyResult(data,match.id,{teams:match.teams,scores:[10,5],players:{}},resolveTournament).next;
  const state=resolveTournament(data),qualified=new Set(state.groups.flatMap(g=>g.rows.slice(0,2).map(row=>row.id)));
  assert.equal(qualified.size,count*2);
  for(const match of orderedMatches(data.matches).filter(m=>!m.group)){
   const resolved=resolveTournament(data).matches.find(m=>m.id===match.id);
   assert.ok(resolved.ids.every(id=>qualified.has(id)));
   data=applyResult(data,match.id,{teams:resolved.ids,scores:[10,5],players:{}},resolveTournament).next;
  }
  assert.ok(resolveTournament(data).matches.find(m=>m.id==='f1').winner);
 }
 for(const [total,count] of [[3,2],[4,0],[8,5]])assert.throws(()=>soloDrawGroups(total,count),/groups/);
});

test('1v1 scores automatically produce mirrored kills and deaths, including old results and corrections',()=>{
 const players=[{id:'one',name:'One'},{id:'two',name:'Two'}];
 const data=makeTournament(players,1,fixture(),['t1','t2'],1,[]);
 const game=data.matches.find(m=>m.group);
 game.result={teams:game.teams,scores:[4,6],players:{}};
 let totals=playerTotals(data);
 assert.deepEqual(totals.find(p=>p.id==='one'),{id:'one',name:'One',team:'Team 01',games:1,kills:4,deaths:6,assists:0});
 const updated=applyResult(data,game.id,{teams:game.teams,scores:[7,3],players:{one:{kills:99,deaths:99,assists:99}}},resolveTournament).next;
 assert.deepEqual(updated.matches.find(m=>m.id===game.id).result.players,{one:{kills:7,deaths:3,assists:0},two:{kills:3,deaths:7,assists:0}});
 assert.equal(playerTotals(updated).find(p=>p.id==='one').games,1);
 assert.equal(playerTotals(data).find(p=>p.id==='one').kills,4);
 const tied=applyResult(data,game.id,{teams:game.teams,scores:[0,0],players:{}},resolveTournament).next;
 assert.equal(playerTotals(tied).find(p=>p.id==='one').deaths,0);
 const duo=makeTournament(Array.from({length:4},(_,i)=>({id:'d'+i,name:'D'+i})),2,fixture());
 const dg=duo.matches.find(m=>m.group);
 const manual={d0:{kills:12,deaths:2,assists:5}};
 const saved=applyResult(duo,dg.id,{teams:dg.teams,scores:[4,6],players:manual},resolveTournament).next;
 assert.deepEqual(saved.matches.find(m=>m.id===dg.id).result.players,manual);
});

test('Top 1 and Top 2 qualifiers generate playable brackets for every team size',()=>{
 for(const size of [1,2,5])for(const count of [2,3,4])for(const qualifiers of [1,2]){
  const players=Array.from({length:count*3*size},(_,i)=>({id:'p'+i,name:'Player '+i}));
  let data=makeTournament(players,size,fixture(),undefined,count,undefined,qualifiers);
  assert.equal(data.qualifiersPerGroup,qualifiers);
  assert.equal(data.matches.filter(m=>!m.group).length,count*qualifiers-1);
  completeGroups(data);
  data.groups.forEach(g=>g.tiebreakOrder=[...g.teams]);
  validateData(data,resolveTournament);
  const state=resolveTournament(data),eligible=new Set(state.groups.flatMap(g=>g.rows.slice(0,qualifiers).map(r=>r.id)));
  for(const game of orderedMatches(data.matches).filter(m=>!m.group)){
   const match=resolveTournament(data).matches.find(m=>m.id===game.id);
   assert.ok(match.ids.every(id=>eligible.has(id)));
   data=applyResult(data,game.id,{teams:match.ids,scores:[6,4],players:{}},resolveTournament).next;
  }
  assert.ok(resolveTournament(data).matches.find(m=>m.id==='f1').winner);
 }
});

test('Top 1 ignores ties below first place but blocks tied winners',()=>{
 const players=Array.from({length:6},(_,i)=>({id:'p'+i,name:'P'+i}));
 const data=makeTournament(players,1,fixture(),['t1','t2','t3','t4','t5','t6'],2,[],1);
 data.matches.filter(m=>m.group).forEach(m=>{m.result={teams:m.teams,scores:m.teams.includes('t1')||m.teams.includes('t4')?[6,0]:[0,0]};});
 assert.ok(resolveTournament(data).groups.every(g=>g.qualified));
 data.matches.filter(m=>m.group==='A').forEach(m=>m.result.scores=[0,0]);
 assert.equal(resolveTournament(data).groups[0].tied,true);
 data.groups[0].tiebreakOrder=[...data.groups[0].teams];
 assert.equal(resolveTournament(data).groups[0].qualified,true);
 assert.throws(()=>makeTournament(players,1,fixture(),undefined,1,[],1),/at least two groups/);
 assert.throws(()=>makeTournament(players,1,fixture(),undefined,2,[],3),/Top 1 or Top 2/);
 const legacy=makeTournament(players,1,fixture(),undefined,2,[]);
 delete legacy.qualifiersPerGroup;
 assert.doesNotThrow(()=>validateData(legacy,resolveTournament));
});

test('double elimination supports uneven fields, both final outcomes and two-loss elimination',()=>{
 for(const count of [2,3,4,5,7,8,9,10,16,17])for(const reset of [false,true]){
  const players=Array.from({length:count},(_,i)=>({id:'p'+i,name:'P'+i}));
  let data=makeTournament(players,1,fixture(),undefined,0,[],2,'double');
  assert.equal(data.groups.length,0);
  validateData(data,resolveTournament);
  const losses=new Map();
  for(const game of orderedMatches(data.matches)){
   const match=resolveTournament(data).matches.find(m=>m.id===game.id);
   if(match.skipped)continue;
   assert.ok(match.ids.every(Boolean),count+': '+match.id);
   assert.notEqual(match.ids[0],match.ids[1]);
   assert.ok(match.ids.every(id=>(losses.get(id)||0)<2));
   const right=game.id==='f1'?reset:game.round%2===1;
   const loser=match.ids[right?0:1];losses.set(loser,(losses.get(loser)||0)+1);
   data=applyResult(data,game.id,{teams:match.ids,scores:right?[4,6]:[6,4],players:{}},resolveTournament).next;
  }
  assert.equal([...losses.values()].filter(n=>n===2).length,count-1);
  assert.equal(data.matches.filter(m=>m.result).length,2*count-2+Number(reset));
  const first=data.matches[0];
  const changed=applyResult(data,first.id,{teams:first.result.teams,scores:[first.result.scores[1],first.result.scores[0]],players:{}},resolveTournament);
  assert.ok(changed.cleared.length>0);
  assert.doesNotThrow(()=>validateData(changed.next,resolveTournament));
 }
});

test('draw button accepts solo double elimination without groups and preserves group requirements',()=>{
 const source=fs.readFileSync('manager.js','utf8');
 const selection=source.slice(source.indexOf('  function selectionCount()'),source.indexOf('  function selectedMaps()'));
 function check({count,size=1,groups=0,format='double',locked=false}){
  const nodes={'team-creation':{value:'wheel'},'pool-list':{querySelectorAll:()=>Array(count).fill({})},'team-size':{value:String(size)},'group-count':{value:String(groups)},'qualifiers-per-group':{value:'2'},'tournament-format':{value:format},'pool-count':{},'start-draw':{}};
  vm.runInNewContext(selection+'\nselectionCount();',{$:id=>nodes[id],locked});
  return nodes['start-draw'].disabled;
 }
 for(const count of [2,3,10,17])assert.equal(check({count}),false);
 assert.equal(check({count:1}),true);
 assert.equal(check({count:10,locked:true}),true);
 assert.equal(check({count:3,size:2}),true);
 assert.equal(check({count:4,size:2}),false);
 assert.equal(check({count:10,size:5}),false);
 assert.equal(check({count:3,groups:2,format:'groups'}),true);
 assert.equal(check({count:4,groups:2,format:'groups'}),false);
});

test('connected double bracket positions cards without overlap and links every winner path',()=>{
 const {bracketLayout}=require('./app.js');
 for(const count of [2,3,5,8,10,17,32]){
  const data=makeTournament(Array.from({length:count},(_,i)=>({id:'p'+i,name:'Player '+i})),1,fixture(),undefined,0,[],2,'double');
  const matches=resolveTournament(data).matches,layout=bracketLayout(matches);
  assert.equal(layout.nodes.length,matches.length);
  for(const node of layout.nodes){
   assert.ok(node.x>=0 && node.y>=0 && node.x+240<=layout.width && node.y+84<=layout.height);
   for(const other of layout.nodes)if(other!==node)assert.ok(node.x+240<=other.x || other.x+240<=node.x || node.y+84<=other.y || other.y+84<=node.y);
  }
  for(const link of layout.links){const a=layout.nodes.find(n=>n.match.id===link.from),b=layout.nodes.find(n=>n.match.id===link.to);assert.ok(a.x<b.x);}
  assert.ok(layout.links.some(l=>l.from==='f1' && l.to==='f2'));
  assert.ok(layout.nodes.filter(n=>n.match.bracket==='upper').every(n=>layout.nodes.filter(l=>l.match.bracket==='lower').every(l=>l.y>=n.y+84)));
 }
});

test('podium confirms double elimination third and waits for a required reset final',()=>{
 const {tournamentPodium}=require('./app.js');
 let data=makeTournament(Array.from({length:5},(_,i)=>({id:'p'+i,name:'P'+i})),1,fixture(),undefined,0,[],2,'double');
 assert.ok(tournamentPodium(data).every(p=>!p.ids.length));
 for(const game of orderedMatches(data.matches).filter(m=>m.bracket!=='final')){
  const m=resolveTournament(data).matches.find(m=>m.id===game.id);
  data=applyResult(data,m.id,{teams:m.ids,scores:[6,4],players:{}},resolveTournament).next;
 }
 assert.equal(tournamentPodium(data)[2].ids.length,1);
 let final=resolveTournament(data).matches.find(m=>m.id==='f1');
 data=applyResult(data,'f1',{teams:final.ids,scores:[4,6],players:{}},resolveTournament).next;
 assert.equal(tournamentPodium(data)[0].ids.length,0);
 assert.match(tournamentPodium(data)[0].note,/reset/);
 const reset=resolveTournament(data).matches.find(m=>m.id==='f2');
 data=applyResult(data,'f2',{teams:reset.ids,scores:[6,4],players:{}},resolveTournament).next;
 assert.deepEqual(tournamentPodium(data).slice(0,2).map(p=>p.ids[0]),reset.ids);
 const corrected=applyResult(data,'f1',{teams:final.ids,scores:[6,4],players:{}},resolveTournament).next;
 assert.deepEqual(tournamentPodium(corrected).slice(0,2).map(p=>p.ids[0]),final.ids);
});

test('single elimination podium shares third and handles two entrants and empty tournaments',()=>{
 const {tournamentPodium}=require('./app.js');
 for(const count of [2,3,4,8]){
  let data=makeTournament(Array.from({length:count},(_,i)=>({id:'p'+i,name:'P'+i})),1,fixture(),undefined,0,[]);
  for(const game of orderedMatches(data.matches)){
   const m=resolveTournament(data).matches.find(m=>m.id===game.id);
   data=applyResult(data,m.id,{teams:m.ids,scores:[6,4],players:{}},resolveTournament).next;
  }
  const podium=tournamentPodium(data);
  assert.equal(podium[0].ids.length,1);assert.equal(podium[1].ids.length,1);
  assert.equal(podium[2].ids.length,count===2?0:count===3?1:2);
  assert.equal(new Set(podium.flatMap(p=>p.ids)).size,podium.flatMap(p=>p.ids).length);
 }
 assert.ok(tournamentPodium(require('./manager.js').emptyTournament(fixture())).every(p=>!p.ids.length));
});

test('podium records count played results, draws and knockout tiebreaks without counting byes',()=>{
 const {podiumRecord}=require('./app.js');
 const players=Array.from({length:4},(_,i)=>({id:'p'+i,name:'P'+i}));
 let data=makeTournament(players,1,fixture(),['t1','t2','t3','t4'],2,[]);
 data.matches.filter(m=>m.group).forEach(m=>m.result={teams:m.teams,scores:[4,4]});
 data.groups.forEach(g=>g.tiebreakOrder=[...g.teams]);
 const semi=resolveTournament(data).matches.find(m=>m.id==='s1');
 data=applyResult(data,semi.id,{teams:semi.ids,scores:[6,6],tiebreakWinner:semi.ids[0],players:{}},resolveTournament).next;
 assert.deepEqual(podiumRecord(resolveTournament(data).matches,semi.ids[0]),{played:2,won:1,lost:0,drawn:1});
 assert.deepEqual(podiumRecord(resolveTournament(data).matches,semi.ids[1]),{played:2,won:0,lost:1,drawn:1});
 data=applyResult(data,semi.id,{teams:semi.ids,scores:[4,6],players:{}},resolveTournament).next;
 assert.deepEqual(podiumRecord(resolveTournament(data).matches,semi.ids[0]),{played:2,won:0,lost:1,drawn:1});
 const double=makeTournament(players.slice(0,3),1,fixture(),undefined,0,[],2,'double');
 assert.deepEqual(podiumRecord(resolveTournament(double).matches,'t1'),{played:0,won:0,lost:0,drawn:0});
});

test('archive lifecycle is atomic, preserves settings and history without nested snapshots', () => {
  const {makeTournament,emptyTournament,validateData,applyResult}=require('./manager.js');
  const players=[{id:'p1',name:'Sam'},{id:'p2',name:'Dan'}];
  let data=makeTournament(players,1,{name:'Cup',headers:{brand:'Gang',banner:'October cup'},registrationEnabled:false},['t1','t2'],0,[],2);
  assert.equal(completedCup(data,resolveTournament),false);
  assert.throws(()=>archiveCup(data,resolveTournament,emptyTournament,'Cup'),/Finish/);
  data.activeMatchId='f1';
  data=applyResult(data,'f1',{teams:['t1','t2'],scores:[10,8]},resolveTournament).next;
  assert.equal(data.activeMatchId,undefined);
  assert.equal(completedCup(data,resolveTournament),true);
  const next=archiveCup(data,resolveTournament,emptyTournament,'October cup','2026-10-12T19:00:00Z','archive-1');
  assert.equal(next.matches.length,0);assert.equal(next.history.length,1);
  assert.equal(next.registrationEnabled,false);assert.equal(next.headers.brand,'Gang');
  assert.equal(next.history[0].tournament.history,undefined);assert.equal(next.history[0].tournament.activeMatchId,undefined);
  validateData(next,resolveTournament);
  const fresh=makeTournament(players,1,next,['t1','t2'],0,[],2);
  assert.equal(fresh.history.length,1);assert.equal(fresh.matches[0].result,null);
  const bad=structuredClone(next);bad.history.push(bad.history[0]);assert.throws(()=>validateData(bad,resolveTournament),/history/);
  const nested=structuredClone(next);nested.history[0].tournament.history=[];assert.throws(()=>validateData(nested,resolveTournament),/archived/);
});

test('career records use names across recycled IDs, split modes and keep missing stats out of K/D',()=>{
  const {makeTournament,playerTotals,emptyTournament,applyResult}=require('./manager.js');
  let solo=makeTournament([{id:'p1',name:'Sam'},{id:'p2',name:'Dan'}],1,{name:'Cup'},['t1','t2'],0,[],2);
  solo=applyResult(solo,'f1',{teams:['t1','t2'],scores:[10,8]},resolveTournament).next;
  const blank=archiveCup(solo,resolveTournament,emptyTournament,'One','2026-10-12T19:00:00Z','one');
  let other=makeTournament([{id:'p1',name:'Dan'},{id:'p2',name:' sam '}],1,blank,['t1','t2'],0,[],2);
  other=applyResult(other,'f1',{teams:['t1','t2'],scores:[5,7]},resolveTournament).next;
  const archived=archiveCup(other,resolveTournament,emptyTournament,'Two','2026-10-12T20:00:00Z','two');
  const records=careerRecords(archived.history,'1v1',resolveTournament,playerTotals);
  assert.equal(records.length,2);assert.equal(records[0].name,'Sam');assert.equal(records[0].trophies,2);assert.equal(records[0].kills,17);assert.equal(records[0].deaths,13);assert.equal(records[0].games,2);
  assert.deepEqual(careerRecords(archived.history,'duos',resolveTournament,playerTotals),[]);
  let duo=makeTournament(['Sam','Dan','Alex','Pat'].map((name,i)=>({id:'p'+i,name})),2,{name:'Duo'},['t1','t2'],0,['Nuke']);
  duo=applyResult(duo,'f1',{teams:['t1','t2'],scores:[13,9]},resolveTournament).next;
  const duoArchive=archiveCup(duo,resolveTournament,emptyTournament,'Duos','2026-10-12T21:00:00Z','duo');
  const row=careerRecords(duoArchive.history,'duos',resolveTournament,playerTotals)[0];
  assert.equal(row.games,1);assert.equal(row.wins,1);assert.equal(row.recorded,0);assert.equal(row.trophies,1);
});

test('match queue skips unfinished qualification and rejects stale active matches',()=>{
  const {makeTournament,validateData,applyResult,orderedMatches}=require('./manager.js');
  let data=makeTournament(['A','B','C'].map((name,i)=>({id:'p'+i,name})),1,{name:'Cup'},['t1','t2','t3'],1,[]);
  let night=matchNight(data,resolveTournament,orderedMatches);
  assert.equal(night.next.length,2);assert.ok(night.next.every(m=>m.group));
  data.activeMatchId=night.next[0].id;validateData(data,resolveTournament);
  night=matchNight(data,resolveTournament,orderedMatches);assert.equal(night.active.id,data.activeMatchId);
  const active=night.active;data=applyResult(data,active.id,{teams:active.ids,scores:[5,2]},resolveTournament).next;
  assert.equal(data.activeMatchId,undefined);data.activeMatchId='f1';assert.throws(()=>validateData(data,resolveTournament),/playing fixture/);
});

test('double elimination archive waits for reset final when the lower finalist wins',()=>{
  const {makeTournament,applyResult,emptyTournament,orderedMatches}=require('./manager.js');
  let data=makeTournament([{id:'p1',name:'A'},{id:'p2',name:'B'}],1,{name:'Cup'},['t1','t2'],0,[],2,'double');
  while(!resolveTournament(data).matches.find(m=>m.id==='f1').result){
    const m=orderedMatches(resolveTournament(data).matches).find(m=>!m.result && m.ids.every(Boolean));
    data=applyResult(data,m.id,{teams:m.ids,scores:m.id==='f1'?[2,5]:[5,2]},resolveTournament).next;
  }
  assert.equal(cupFinal(data,resolveTournament).id,'f2');assert.equal(completedCup(data,resolveTournament),false);
  assert.throws(()=>archiveCup(data,resolveTournament,emptyTournament,'Cup'),/Finish/);
  const final=resolveTournament(data).matches.find(m=>m.id==='f2');data=applyResult(data,final.id,{teams:final.ids,scores:[5,2]},resolveTournament).next;
  assert.equal(completedCup(data,resolveTournament),true);assert.equal(cupMode(data),'1v1');
});

test('saved players deduplicate archive rosters by name and merge with new players',()=>{
 const {savedPlayers,mergePlayerNames}=require('./extras.js');
 const history=[{tournament:{teams:[{players:[{id:'p1',name:' Sam '},{id:'p2',name:'Dan'}]}]}},{tournament:{teams:[{players:[{id:'p9',name:'sam'},{id:'p1',name:'Alex'}]}]}}];
 assert.deepEqual(savedPlayers(history),['Alex','Dan','Sam']);
 assert.equal(mergePlayerNames('New player\n sam\n\n',['Sam','Dan','Alex']),'New player\nsam\nDan\nAlex');
 assert.deepEqual(savedPlayers(),[]);
 assert.throws(()=>mergePlayerNames('', ['x'.repeat(41)]),/40/);
 assert.equal(mergePlayerNames('SAM',['ＳＡＭ']),'SAM');
 assert.throws(()=>mergePlayerNames('',Array.from({length:200},(_,i)=>('Player '+i).padEnd(40,'x'))),/full/);
});

test('removing archived cups keeps the active tournament intact and recalculates saved players and records',()=>{
 const {removeCupHistory,savedPlayers,careerRecords}=require('./extras.js');
 const {makeTournament,applyResult,emptyTournament,playerTotals,validateData}=require('./manager.js');
 let cup=makeTournament([{id:'p1',name:'Sam'},{id:'p2',name:'Dan'}],1,{name:'Cup'},['t1','t2'],0,[]);
 cup=applyResult(cup,'f1',{teams:['t1','t2'],scores:[5,3]},resolveTournament).next;
 const archived=archiveCup(cup,resolveTournament,emptyTournament,'One','2026-10-12T19:00:00Z','one');
 const current={...structuredClone(cup),history:archived.history,activeMatchId:undefined};
 delete current.activeMatchId;
 const second=structuredClone(current.history[0]);second.id='two';second.title='Two';second.tournament.teams[1].players[0].name='Alex';current.history.push(second);
 const original=structuredClone(current);
 const next=removeCupHistory(current,'one');
 assert.equal(next.history.length,1);assert.equal(next.history[0].id,'two');
 assert.deepEqual(next.matches,current.matches);assert.deepEqual(next.teams,current.teams);assert.deepEqual(current,original);
 assert.deepEqual(savedPlayers(next.history),['Alex','Sam']);
 assert.equal(careerRecords(next.history,'1v1',resolveTournament,playerTotals).find(p=>p.name==='Sam').trophies,1);
 validateData(next,resolveTournament);
 const cleared=removeCupHistory(next);assert.deepEqual(cleared.history,[]);assert.deepEqual(cleared.matches,current.matches);
 assert.deepEqual(savedPlayers(cleared.history),[]);assert.deepEqual(careerRecords(cleared.history,'1v1',resolveTournament,playerTotals),[]);
 assert.throws(()=>removeCupHistory(next,'missing'),/no longer exists/);
});

test('squad wheel assigns one player to each team in rotation and preserves rosters in every format',()=>{
 const {drawTeamMembers,makeTournament}=require('./manager.js');
 for(const count of [2,3,4]){
  const players=Array.from({length:count*5},(_,i)=>({id:'p'+i,name:'Player '+i}));
  assert.deepEqual(drawTeamMembers(players.slice(0,count+1),5,players.length).map(t=>t.map(p=>p.id)),Array.from({length:count},(_,i)=>i===0?['p0','p'+count]:['p'+i]));
  const expected=Array.from({length:count},(_,i)=>Array.from({length:5},(_,slot)=>'p'+(i+slot*count)));
  for(const format of ['groups','double']){
   const cup=makeTournament(players,5,{name:'Cup'},undefined,format==='groups'?1:0,['Nuke'],2,format);
   assert.deepEqual(cup.teams.map(t=>t.players.map(p=>p.id)),expected);
   validateData(cup,resolveTournament);
  }
 }
 const duos=Array.from({length:6},(_,i)=>({id:'p'+i,name:'P'+i}));
 assert.deepEqual(drawTeamMembers(duos,2).map(t=>t.map(p=>p.id)),[['p0','p1'],['p2','p3'],['p4','p5']]);
});

test('5v5 Single Game requires ten players and publishes one rotating-team fixture',()=>{
 const {makeTournament,applyResult,validateData}=require('./manager.js');
 const players=Array.from({length:10},(_,i)=>({id:'p'+i,name:'Player '+i}));
 const cup=makeTournament(players,5,{name:'Custom game'},['t1','t2'],4,['Nuke'],1,'single');
 assert.equal(cup.format,'single');assert.deepEqual(cup.groups,[]);assert.equal(cup.matches.length,1);
 assert.equal(cup.matches[0].id,'f1');assert.equal(cup.matches[0].map,'Nuke');
 assert.deepEqual(cup.teams[0].players.map(p=>p.id),['p0','p2','p4','p6','p8']);
 assert.deepEqual(cup.teams[1].players.map(p=>p.id),['p1','p3','p5','p7','p9']);
 const state=resolveTournament(cup);assert.deepEqual(state.matches[0].ids,['t1','t2']);validateData(cup,resolveTournament);
 const done=applyResult(cup,'f1',{teams:['t1','t2'],scores:[13,9]},resolveTournament).next;
 assert.equal(completedCup(done,resolveTournament),true);
 assert.throws(()=>makeTournament(players,2,{name:'Bad'},undefined,0,['Nuke'],2,'single'),/exactly 4/);
 assert.throws(()=>makeTournament(players.slice(0,2),1,{name:'Bad'},undefined,0,[],2,'single'),/2v2–5v5 only/);
 assert.throws(()=>makeTournament([...players,...players.map(p=>({...p,id:p.id+'x'}))],5,{name:'Bad'},undefined,0,['Nuke'],2,'single'),/exactly 10/);
 const bad=structuredClone(cup);bad.matches.push({...bad.matches[0],id:'f2'});assert.throws(()=>validateData(bad,resolveTournament),/exactly one/);
});

test('balanced squads find the closest possible totals while preserving every player',()=>{
  const {balanceRosters}=require('./game-night.js');
  const teams=[0,1].map(t=>({id:'t'+t,players:Array.from({length:5},(_,i)=>({id:'p'+(t*5+i),name:'Player',rating:t?1:5})),captainId:'p'+t*5}));
  const balanced=balanceRosters(teams,()=>0.5),totals=balanced.map(t=>t.players.reduce((sum,p)=>sum+p.rating,0));
  assert.equal(Math.abs(totals[0]-totals[1]),4);
  assert.equal(new Set(balanced.flatMap(t=>t.players.map(p=>p.id))).size,10);
  assert.ok(balanced.every(t=>t.players.length===5 && !t.captainId));
  assert.equal(teams[0].players[0].rating,5);
});
test('balancing three squads keeps five unique players per squad',()=>{
  const {balanceRosters}=require('./game-night.js');const teams=Array.from({length:3},(_,t)=>({id:'t'+t,players:Array.from({length:5},(_,i)=>({id:'p'+(t*5+i),rating:i+1}))}));
  const balanced=balanceRosters(teams);assert.ok(balanced.every(t=>t.players.length===5));assert.equal(new Set(balanced.flatMap(t=>t.players.map(p=>p.id))).size,15);
});
test('player swaps preserve rosters and remove a captain who moved teams',()=>{
  const {swapDraftPlayers}=require('./game-night.js');const teams=[{id:'a',captainId:'p1',players:[{id:'p1'},{id:'p2'}]},{id:'b',players:[{id:'p3'},{id:'p4'}]}];const next=swapDraftPlayers(teams,'p1','p3');assert.equal(next[0].players[0].id,'p3');assert.equal(next[1].players[0].id,'p1');assert.equal(next[0].captainId,undefined);assert.equal(teams[0].players[0].id,'p1');assert.throws(()=>swapDraftPlayers(teams,'p1','p2'));
});
test('map veto alternates teams and selects the last remaining map',()=>{
  const {advanceMapVeto}=require('./game-night.js'),maps=['Mirage','Nuke','Cache'],teams=[{id:'a'},{id:'b'}];const first=advanceMapVeto(maps,teams,[],'Mirage');assert.equal(first.bans[0].teamId,'a');assert.equal(first.selected,null);const second=advanceMapVeto(maps,teams,first.bans,'Nuke');assert.equal(second.bans[1].teamId,'b');assert.equal(second.selected,'Cache');assert.throws(()=>advanceMapVeto(maps,teams,second.bans,'Cache'));assert.throws(()=>advanceMapVeto(maps,teams,first.bans,'Mirage'));
});
test('server connection accepts addresses but rejects command injection and invalid ports',()=>{
  const {validServerAddress}=require('./game-night.js');for(const address of ['','server.example.com:27015','127.0.0.1','[::1]:27015'])assert.equal(validServerAddress(address),address);for(const address of ['host; quit','host 27015','https://host','host:99999','host:0','host\nquit'])assert.throws(()=>validServerAddress(address));
});
test('Discord details include captains and avoid mentions or formatting from names',()=>{
  const {discordMatchText}=require('./game-night.js'),{makeTournament}=require('./manager.js');const data=makeTournament(Array.from({length:10},(_,i)=>({id:'p'+i,name:i?'Player '+i:'@everyone'})),5,{name:'Friends'},undefined,0,['Cache'],2,'single');data.teams[0].captainId=data.teams[0].players[0].id;const text=discordMatchText(data,resolveTournament);assert.ok(text.includes('Map: Cache'));assert.ok(text.includes('(Captain)'));assert.ok(!text.includes('@everyone'));
});

test('manual squads preserve chosen rosters and reject duplicate or missing players',()=>{
  const {manualRosters}=require('./game-night.js');const players=Array.from({length:10},(_,i)=>({id:'p'+i,name:'Player '+i}));const order=['p9','p8','p7','p6','p5','p4','p3','p2','p1','p0'];const rosters=manualRosters(players,order,5);assert.deepEqual(rosters.map(r=>r.map(p=>p.id)),[order.slice(0,5),order.slice(5)]);rosters[0][0].name='Changed';assert.equal(players[9].name,'Player 9');assert.throws(()=>manualRosters(players,[...order.slice(0,9),'p9'],5));assert.throws(()=>manualRosters(players,[...order.slice(0,9),''],5));assert.throws(()=>manualRosters(players,order.slice(1),5));
});
test('manual duos support arbitrary complete teams',()=>{
  const {manualRosters}=require('./game-night.js');const players=Array.from({length:6},(_,i)=>({id:'p'+i,name:'Player '+i}));const rosters=manualRosters(players,players.map(p=>p.id),2);assert.equal(rosters.length,3);assert.ok(rosters.every(r=>r.length===2));assert.throws(()=>manualRosters(players.slice(1),players.slice(1).map(p=>p.id),2));
});

test('captain cases alternate picks, include captains and retain every squad player once',()=>{
  const {createCaptainCases,openCaptainCase}=require('./game-night.js');
  const players=Array.from({length:10},(_,i)=>({id:'p'+i,name:'Player '+i}));
  let draft=createCaptainCases(players,5,['p0','p9'],players.slice(1,9).map(p=>p.id));
  const original=structuredClone(draft);
  for(const index of [7,0,5,2,1,6,3,4]){
    const turn=draft.turn,player=draft.cases[index].player.id;
    draft=openCaptainCase(draft,index);
    assert.equal(draft.teams[turn%2].players.at(-1).id,player);
    assert.throws(()=>openCaptainCase(draft,index));
  }
  assert.ok(draft.teams.every(t=>t.players.length===5 && t.players[0].id===t.captainId));
  assert.equal(new Set(draft.teams.flatMap(t=>t.players.map(p=>p.id))).size,10);
  assert.equal(original.turn,0);assert.equal(original.teams[0].players.length,1);
  const cup=makeTournament(players,5,{name:'Captain match'},undefined,0,['Cache'],2,'single');cup.teams=draft.teams;
  assert.deepEqual(resolveTournament(cup).matches[0].ids.slice().sort(),['t1','t2']);
});
test('captain duos validate captains, pool and hidden case assignments',()=>{
  const {createCaptainCases,openCaptainCase}=require('./game-night.js');
  const players=Array.from({length:4},(_,i)=>({id:'p'+i,name:'Player '+i}));
  const draft=createCaptainCases(players,2,['p0','p1'],['p3','p2']);
  const done=openCaptainCase(openCaptainCase(draft,1),0);
  assert.deepEqual(done.teams.map(t=>t.players.map(p=>p.id)),[['p0','p2'],['p1','p3']]);
  assert.throws(()=>createCaptainCases(players,2,['p0','p0'],['p3','p2']));
  assert.throws(()=>createCaptainCases(players,2,['p0','missing'],['p3','p2']));
  assert.throws(()=>createCaptainCases(players,2,['p0','p1'],['p3','p3']));
  assert.throws(()=>createCaptainCases(players,5,['p0','p1'],['p3','p2']));
  assert.throws(()=>openCaptainCase(draft,-1));
});

test('server connections accept pasted commands and preserve required passwords',()=>{
  const {parseServerConnection,serverConnectionCommand}=require('./game-night.js');
  const connection=parseServerConnection('connect 127.0.0.1:27015; password example123');
  assert.deepEqual(connection,{serverAddress:'127.0.0.1:27015',serverPassword:'example123'});
  assert.equal(serverConnectionCommand(connection),'connect 127.0.0.1:27015; password "example123"');
  assert.equal(serverConnectionCommand(connection,true),'+password "example123" +connect 127.0.0.1:27015');
  assert.deepEqual(parseServerConnection(''),{serverAddress:'',serverPassword:''});
  assert.equal(parseServerConnection('host:27015; password "two words"').serverPassword,'two words');
  for(const value of ['connect host; quit','connect host; password x; quit','connect host; password "x\ny"'])assert.throws(()=>parseServerConnection(value));
});
