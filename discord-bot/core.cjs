const {validateDiscordEvents}=require('../discord-events.js');
function register(event,userId,name){
  if(event.publishedAt)throw Error('This event is published. Registration is closed.');
  name=name.trim();
  if(!name || name.length>40 || /[\r\n]/.test(name))throw Error('Use a gaming name of 1–40 characters on one line.');
  if((event.waitingList||[]).some(p=>p.userId!==userId && p.name.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase()))throw Error('That name is already on the waiting list.');
  if(event.players.some(p=>p.userId!==userId && p.name.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase()))throw Error('That gaming name is already registered.');
  const existing=event.players.find(p=>p.userId===userId);
  if(existing)existing.name=name;
  else {if(event.players.length>=event.capacity)throw Error('This event is full.');event.players.push({userId,name});}
  if(event.waitingList)event.waitingList=event.waitingList.filter(p=>p.userId!==userId);
}
async function publishEvent(event,config,request=fetch){
  if(event.players.length!==event.capacity)throw Error('Fill all '+event.capacity+' places before publishing.');
  const url='https://api.github.com/repos/'+config.repository+'/contents/discord-events.json';
  const headers={Authorization:'Bearer '+config.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const publishedAt=new Date().toISOString();
  const next={id:event.id,title:event.title,players:event.players.map(p=>p.name),...(event.captainVote?.status==='confirmed' && event.captainVote.roster===JSON.stringify(event.players.map(p=>[p.userId,p.name]))?{captains:event.captainVote.captains.map(id=>event.players.find(p=>p.userId===id).name)}:{}),publishedAt};
  const readUrl=url+'?ref='+encodeURIComponent(config.branch);
  const conflict='The event file changed. Click Publish again to reload and retry.';
  let originalEvent;
  let lastError;
  for(let attempt=0;attempt<=3;attempt++){
    if(attempt)await new Promise(resolve=>setTimeout(resolve,250*2**(attempt-1)));
    const response=await request(readUrl,{headers,signal:AbortSignal.timeout(10000)});
    if(!response.ok){
      if(response.status<500)throw Error('GitHub read failed ('+response.status+').');
      lastError=Error('GitHub read failed ('+response.status+').');
      continue;
    }
    const file=await response.json(),data=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
    validateDiscordEvents(data);
    const index=data.events.findIndex(e=>e.id===event.id);
    const current=data.events[index];
    if(current?.publishedAt===publishedAt && JSON.stringify(current)===JSON.stringify(next))return publishedAt;
    const currentEvent=JSON.stringify(current ?? null);
    originalEvent ??= currentEvent;
    if(currentEvent!==originalEvent)throw Error(conflict);
    if(attempt===3)break;
    if(index<0)data.events.push(next);else data.events[index]=next;
    validateDiscordEvents(data);
    try{
      const result=await request(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({message:'Publish Discord event roster',branch:config.branch,sha:file.sha,content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64')})});
      if(result.ok)return publishedAt;
      if(result.status<500)throw Error(result.status===409?conflict:'GitHub publish failed ('+result.status+').');
      lastError=Error('GitHub publish failed ('+result.status+'). Try publishing again in a moment.');
    }catch(error){
      if(!(error instanceof TypeError) && error.name!=='TimeoutError')throw error;
      lastError=Error('GitHub did not confirm the publish. Try publishing again in a moment.');
    }
  }
  throw lastError;
}
function teamAnnouncements(tournament,escape=value=>value){
  if(!tournament.discordEventId || !Array.isArray(tournament.teams) || !tournament.teams.length)return [];
  const map=tournament.format==='single'?tournament.matches?.[0]?.map:null;
  const heading=tournament.teamSize+'v'+tournament.teamSize+(map?' · '+escape(map):'');
  const chunks=[];let text=heading;
  for(const team of tournament.teams){
    const players=team.players || [];
    const title=tournament.teamSize===1?escape(players[0]?.name || team.name):escape(team.name);
    const block='\n\n**'+title+'**'+(tournament.teamSize===1?'':'\n'+players.map(player=>escape(player.name)+(player.id===team.captainId?' · Captain':'')).join('\n'));
    if(text.length+block.length>3900){chunks.push(text);text=heading;}
    text+=block;
  }
  if(text)chunks.push(text);return chunks;
}
module.exports={register,publishEvent,teamAnnouncements};
