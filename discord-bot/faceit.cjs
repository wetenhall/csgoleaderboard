
function normalizeFaceitMatch(match,stats){
  if(match.status!=='FINISHED')return [];
  return (stats.rounds||[]).map((round,index)=>{
    const teams=(round.teams||[]).map(team=>({name:match.teams?.[team.team_id]?.name||'Team',score:Number(team.team_stats?.['Final Score']),players:(team.players||[]).map(p=>({name:p.nickname,kills:Number(p.player_stats?.Kills),deaths:Number(p.player_stats?.Deaths),assists:Number(p.player_stats?.Assists)}))}));
    if(teams.length!==2 || teams.some(t=>!Number.isInteger(t.score)||t.score<0||t.players.some(p=>!p.name||['kills','deaths','assists'].some(k=>!Number.isInteger(p[k])||p[k]<0||p[k]>999))))return null;
    return {id:match.match_id+':'+index,matchId:match.match_id,provider:'faceit',map:round.round_stats?.Map||'',finishedAt:match.finished_at,teams};
  }).filter(Boolean);
}
async function syncFaceitGames(env=process.env,request=fetch){
  if(!env.FACEIT_API_KEY)return;
  const headers={Authorization:'Bearer '+env.FACEIT_API_KEY},hub=env.FACEIT_HUB_ID||'72f315f4-d4a0-4fe4-b520-b5076e6d9627';
  const get=async endpoint=>{const r=await request('https://open.faceit.com/data/v4/'+endpoint,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok){const error=Error('FACEIT request failed ('+r.status+').');error.status=r.status;throw error;}return r.json();};
  const github='https://api.github.com/repos/'+env.GITHUB_REPOSITORY+'/contents/faceit-games.json',gh={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json'};
  const existing=await request(github+'?ref='+encodeURIComponent(env.GITHUB_BRANCH),{headers:gh,signal:AbortSignal.timeout(15000)});
  if(!existing.ok && existing.status!==404)throw Error('Cannot read imported games.');
  const file=existing.ok?await existing.json():null,old=file?JSON.parse(Buffer.from(file.content,'base64').toString()):{games:[]};
  const matches=await get('hubs/'+hub+'/matches?type=past&limit=100');const games=[];
  for(const match of matches.items||[]){
    if(match.status!=='FINISHED')continue;
    const cached=old.hubId===hub?old.games.filter(g=>g.matchId===match.match_id):[];
    if(cached.length){games.push(...cached);continue;}
    try{games.push(...normalizeFaceitMatch(match,await get('matches/'+match.match_id+'/stats')));}catch(error){if(error.status!==404)throw error;}
  }
  if(old.hubId===hub && JSON.stringify(old.games)===JSON.stringify(games))return;
  const next={version:1,hubId:hub,updatedAt:new Date().toISOString(),games};
  const r=await request(github,{method:'PUT',headers:{...gh,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({message:'Refresh available FACEIT games',branch:env.GITHUB_BRANCH,...(file?{sha:file.sha}:{}),content:Buffer.from(JSON.stringify(next,null,2)+'\n').toString('base64')})});
  if(!r.ok)throw Error('Cannot publish available games ('+r.status+').');
}
module.exports={normalizeFaceitMatch,syncFaceitGames};
if(require.main===module)syncFaceitGames().then(()=>console.log('FACEIT games refreshed.')).catch(error=>{console.error(error.message);process.exitCode=1;});

