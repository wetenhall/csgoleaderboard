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
  data.matches[0].result = { teams: ['t1','t2'], scores: [12,12] };
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
