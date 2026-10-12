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
for (const size of [2,5]) test(`draw makes eight complete ${size}-player teams and a valid schedule`, () => {
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
for (const [count,size] of [[2,2],[3,5],[5,2],[7,2],[10,5]]) test(`${count} teams of ${size}: complete schedule and progression`,()=>{
  const players=Array.from({length:count*size},(_,i)=>({id:`p${i}`,name:`Player ${i}`}));
  const ids=Array.from({length:count},(_,i)=>`t${i+1}`);
  const data=makeTournament(players,size,fixture(),ids);
  validateData(data,resolveTournament);
  assert.equal(data.teams.length,count);
  assert.equal(data.groups.length,count<6?1:2);
  assert.equal(data.mode,size===2?'duos':'squads');
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
  for(const [count,size] of [[3,2],[11,5],[5,5],[17,2]]){
    const players=Array.from({length:count},(_,i)=>({id:`p${i}`,name:`P${i}`}));
    assert.throws(()=>makeTournament(players,size,fixture()),/complete teams/);
  }
});

for (const [count,groups] of [[2,0],[3,0],[5,0],[9,0],[5,1],[5,2],[6,3],[9,3],[8,4],[11,4]]) test(count+' teams with '+groups+' groups progress to one champion',()=>{
  const players=Array.from({length:count*2},(_,i)=>({id:'p'+i,name:'Player '+i}));
  const ids=Array.from({length:count},(_,i)=>'t'+(i+1));
  let data=makeTournament(players,2,fixture(),ids,groups);
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
 const maps=size===2?['Poseidon','Debris','Eldorado']:['Mirage','Dust2','Cache'];
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
