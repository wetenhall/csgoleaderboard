const {randomUUID}=require('node:crypto');
const {resolveTournament,teamDisplayLabel,tournamentPodium}=require('../app.js');
const {orderedMatches,playerTotals,tournamentAwards,validateData}=require('../manager.js');
const {completedCup,cupFinal}=require('../extras.js');
const key=value=>value.trim().normalize('NFKC').toLowerCase();
function joinWaitingList(event,userId,name){
  name=name.trim();if(!name||name.length>40||/[\r\n]/.test(name))throw Error('Use a gaming name of 1–40 characters.');
  if(event.players.some(p=>p.userId===userId))throw Error('You are already registered.');
  event.waitingList ||= [];if([...event.players,...event.waitingList].some(p=>p.userId!==userId&&key(p.name)===key(name)))throw Error('That name is already in use.');
  const existing=event.waitingList.find(p=>p.userId===userId);if(existing){existing.name=name;return;}
  if(event.waitingList.length>=64)throw Error('The waiting list is full.');event.waitingList.push({userId,name,joinedAt:new Date().toISOString()});
}
function substitutePlayer(tournament,event,outId,inId){
  const next=structuredClone(tournament),e=structuredClone(event),out=e.players.find(p=>p.userId===outId),incoming=e.waitingList?.find(p=>p.userId===inId);
  if(!out||!incoming)throw Error('Player or substitute is no longer available.');
  if(next.discordEventId && next.discordEventId!==e.id)throw Error('This event is not the current tournament.');
  const team=next.teams?.find(t=>t.players.some(p=>key(p.name)===key(out.name)));
  if(next.teams?.length && next.discordEventId===e.id){
    if(!team)throw Error('The departing player is not in the published teams.');
    const state=resolveTournament(next);if(!state.matches.some(m=>!m.result&&!m.skipped))throw Error('The tournament is complete.');
    if(state.matches.some(m=>m.id===next.activeMatchId&&!m.result&&m.ids.includes(team.id)))throw Error('Finish the player’s active match before confirming a substitute.');
    if(!state.matches.some(m=>!m.result&&!m.skipped&&m.ids.includes(team.id)))throw Error('This player has no upcoming fixture to substitute into.');
    for(const match of next.matches)if(match.result && !match.result.lineups)match.result.lineups=Object.fromEntries(match.result.teams.map(id=>[id,structuredClone(next.teams.find(t=>t.id===id).players)]));
    const old=team.players.find(p=>key(p.name)===key(out.name));next.retiredPlayers ||= [];next.retiredPlayers.push({...old,teamId:team.id,team:team.name});
    const replacement={id:'sub-'+randomUUID(),name:incoming.name};if(next.teams.some(t=>t.players.some(p=>p.id===replacement.id)))throw Error('This substitute is already in a team.');
    team.players[team.players.indexOf(old)]=replacement;if(team.captainId===old.id)delete team.captainId;delete next.resultRevisions;validateData(next,resolveTournament);
  }
  e.players[e.players.indexOf(out)]={userId:incoming.userId,name:incoming.name};e.waitingList=e.waitingList.filter(p=>p.userId!==inId);e.withdrawalRequests=(e.withdrawalRequests||[]).filter(id=>id!==outId);delete e.offer;
  return {tournament:next,event:e};
}
function upcomingFixtures(data){
  if(data.format==='single')return null;const state=resolveTournament(data),pending=orderedMatches(state.matches).filter(m=>!m.result&&!m.skipped),ready=pending.filter(m=>m.ids.every(Boolean));
  const active=ready.find(m=>m.id===data.activeMatchId),next=ready.filter(m=>m!==active).slice(0,3),line=m=>m.id.toUpperCase()+' · '+m.ids.map(id=>teamDisplayLabel(state.teams.get(id))).join(' vs ')+' · '+(m.map||'Map chosen in server');
  return {active:active?line(active):null,next:next.map(line),waiting:pending.filter(m=>!m.ids.every(Boolean)).length,serverReady:!!data.serverAddress,done:pending.length===0};
}
function recapData(data){
  if(!completedCup(data,resolveTournament))return null;const state=resolveTournament(data),final=cupFinal(data,resolveTournament),awards=tournamentAwards(data),totals=playerTotals(data);
  const standings=data.teams.map(t=>({name:teamDisplayLabel(t),wins:state.matches.filter(m=>m.result&&m.winner===t.id).length,champion:t.id===final.winner})).sort((a,b)=>Number(b.champion)-Number(a.champion)||b.wins-a.wins||a.name.localeCompare(b.name));
  const top=totals.filter(p=>p.games).sort((a,b)=>b.kills-a.kills),mvp=awards.players.find(a=>a.title==='MVP');
  return {podium:tournamentPodium(data,state).filter(p=>p.ids.length).map(p=>({rank:p.rank,names:p.ids.map(id=>teamDisplayLabel(state.teams.get(id))).join(', ')})),champion:standings[0]?.name,standings,topFragger:top.length?top.filter(p=>p.kills===top[0].kills).map(p=>p.name).join(', '):'No recorded stats',mvp:mvp?.winners?.map(p=>p.name).join(', ')||'Not enough recorded games',final:final.result.scores.join('–')};
}
function voicePlan(tournament,event){
  if(tournament.discordEventId!==event.id)throw Error('Publish this event’s teams on the website first.');
  return tournament.teams.map(team=>({teamId:team.id,name:team.name.slice(0,100),members:team.players.map(p=>event.players.filter(x=>key(x.name)===key(p.name))).filter(matches=>matches.length===1).map(matches=>matches[0].userId)}));
}
module.exports={joinWaitingList,substitutePlayer,upcomingFixtures,recapData,voicePlan};
