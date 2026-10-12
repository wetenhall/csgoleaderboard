const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { resolveTournament } = require('./app.js');
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
 assert.deepEqual(empty,{name:original.name,teams:[],groups:[],matches:[],...(original.headers?{headers:original.headers}:{})});
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
  const nodes={'pool-list':{querySelectorAll:()=>Array(count).fill({})},'team-size':{value:String(size)},'group-count':{value:String(groups)},'qualifiers-per-group':{value:'2'},'tournament-format':{value:format},'pool-count':{},'start-draw':{}};
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
