/* Published rosters contain gaming names only; Discord account IDs stay with the bot. */
function validateDiscordEvents(data) {
  if(data?.version!==1 || !Array.isArray(data.events) || data.events.length>100)throw Error('Invalid Discord event file.');
  const ids=new Set();
  for(const event of data.events){
    if(typeof event.id!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(event.id) || ids.has(event.id) || typeof event.title!=='string' || !event.title.trim() || event.title.length>100 || !Array.isArray(event.players) || event.players.length<1 || event.players.length>64)throw Error('Invalid Discord event.');
    ids.add(event.id);
    const names=new Set();
    for(const name of event.players){
      if(typeof name!=='string' || name!==name.trim() || !name || name.length>40 || /[\r\n]/.test(name))throw Error('Invalid Discord player name.');
      const key=name.normalize('NFKC').toLocaleLowerCase('en');
      if(names.has(key))throw Error('Duplicate Discord player name.');names.add(key);
    }
    if(event.captains!==undefined && (!Array.isArray(event.captains)||event.captains.length!==2||new Set(event.captains).size!==2||event.captains.some(name=>!event.players.includes(name))))throw Error('Voted captains must be two registered players.');
    if(event.mapVoteRequest!==undefined)validateMapVoteRequest(event.mapVoteRequest);
  }
  return data.events;
}
function validateMapVoteRequest(vote){
  const maps=vote?.maps;
  if(!vote || !/^[a-f0-9-]{36}$/.test(vote.id) || !['duel','player-vote'].includes(vote.mode) ||
    !Array.isArray(maps) || maps.length<2 || maps.length>25 || (vote.mode==='duel' && maps.length!==2) ||
    new Set(maps).size!==maps.length || maps.some(map=>typeof map!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9 -]{0,39}$/.test(map)))throw Error('Invalid Discord map vote.');
  if(vote.closesAt!==undefined && (!Number.isSafeInteger(vote.closesAt) || vote.closesAt<0))throw Error('Invalid map vote deadline.');
  if(vote.submitted!==undefined && (!Array.isArray(vote.submitted) || vote.submitted.length>64 ||
    new Set(vote.submitted).size!==vote.submitted.length ||
    vote.submitted.some(name=>typeof name!=='string' || !name || name.length>40 || /[\r\n]/.test(name))))throw Error('Invalid map voter list.');
  const result=vote.result;
  if(result!==undefined && (!Array.isArray(result?.counts) || result.counts.length!==maps.length ||
    result.counts.some(count=>!Number.isInteger(count)||count<0||count>64) ||
    !Array.isArray(result.finalists) || new Set(result.finalists).size!==result.finalists.length ||
    result.finalists.some(map=>!maps.includes(map)) || (vote.mode==='duel'?result.finalists.length!==1:
      result.finalists.length!==Math.min(3,result.counts.filter(Boolean).length) || result.finalists.some(map=>!result.counts[maps.indexOf(map)]))))throw Error('Invalid Discord map vote result.');
  return vote;
}
async function readPublishedDiscordEvents(config,request=fetch){
  const response=await request(config.api+'?ref='+encodeURIComponent(config.branch),{cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+config.token}});
  if(!response.ok)throw Error('Could not read Discord events from GitHub ('+response.status+').');
  const file=await response.json();
  const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
  validateDiscordEvents(data);return {sha:file.sha,data};
}
async function clearPublishedDiscordEvents(config,request=fetch){
  const file=await readPublishedDiscordEvents(config,request);
  const response=await request(config.api,{method:'PUT',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({message:'Clear published Discord events',branch:config.branch,sha:file.sha,content:btoa(JSON.stringify({version:1,events:[]})+'\n')})});
  if(!response.ok)throw Error(response.status===409 || response.status===422?'Discord events changed while clearing. Refresh and try again.':'Could not clear Discord events ('+response.status+').');
}
async function requestDiscordCaptainVote(config,eventId,request=fetch){
  const file=await readPublishedDiscordEvents(config,request),event=file.data.events.find(e=>e.id===eventId);
  if(!event)throw Error('This Discord event was removed. Reload the event first.');
  event.captainVoteRequest={id:crypto.randomUUID(),players:[...event.players]};
  const content=btoa(Array.from(new TextEncoder().encode(JSON.stringify(file.data,null,2)+'\n'),b=>String.fromCharCode(b)).join(''));
  const response=await request(config.api,{method:'PUT',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({message:'Request Discord captain vote',branch:config.branch,sha:file.sha,content})});
  if(!response.ok)throw Error('Could not request the vote. Refresh the event and try again ('+response.status+').');
}
async function requestDiscordMapVote(config,eventId,mode,maps,request=fetch){
  const file=await readPublishedDiscordEvents(config,request),event=file.data.events.find(entry=>entry.id===eventId);
  if(!event)throw Error('This Discord event is no longer published.');
  const current=event.mapVoteRequest;
  if(current && !current.result){
    if(current.mode===mode && current.maps.every(map=>maps.includes(map)) &&
      (mode==='duel' || current.maps.length===maps.length))return current;
    throw Error('A map vote is already open for this event. Close it in Discord first.');
  }
  const choices=[...maps];
  if(mode==='duel'){
    for(let i=choices.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];
    }
    choices.splice(2);
  }
  const vote=validateMapVoteRequest({id:crypto.randomUUID(),mode,maps:choices});
  event.mapVoteRequest=vote;
  const content=btoa(Array.from(new TextEncoder().encode(JSON.stringify(file.data,null,2)+'\n'),byte=>String.fromCharCode(byte)).join(''));
  const response=await request(config.api,{method:'PUT',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({message:'Request Discord map vote',branch:config.branch,sha:file.sha,content})});
  if(!response.ok)throw Error('Could not post the map vote request. Try again ('+response.status+').');
  return vote;
}
function createDiscordEventLoader({canLoad,load,notify,readEvents,clearEvents}) {
  const select=document.getElementById('discord-event'),refresh=document.getElementById('refresh-discord-events'),status=document.getElementById('discord-event-status');
  const source=document.getElementById('game-source'),choice=document.getElementById('discord-event-choice');
  const clear=document.getElementById('clear-discord-events');
  let events=[],fetching=false,request=0;
  function render(){
    const event=source.value==='discord'?events.find(e=>e.id===select.value):null;
    choice.hidden=refresh.hidden=source.value!=='discord';source.disabled=!canLoad();
    select.disabled=fetching || !canLoad();refresh.disabled=fetching || !canLoad();
    if(clear){clear.hidden=source.value!=='discord';clear.disabled=fetching || !canLoad() || !events.length;}
    if(!fetching)status.textContent=event?event.players.length+' Discord players loaded: '+event.players.join(', '):source.value==='discord'?(events.length?'Select a published Discord event to continue.':'No published Discord events yet. Publish from Discord, then refresh.'):'Custom game · Add saved players or enter your own names in the Players stage.';
  }
  async function reload(){
    const id=++request;fetching=true;render();status.textContent='Loading published Discord events…';
    try{
      let data=await readEvents?.();
      if(!data){const response=await fetch('discord-events.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('Could not load Discord events. Try Refresh after deployment finishes.');data=await response.json();}
      const next=validateDiscordEvents(data);if(id!==request)return;
      const previous=select.value;events=next;select.replaceChildren(new Option('Select a Discord event',''));
      for(const event of events)select.add(new Option(event.title+' · '+event.players.length+' players',event.id));
      if(events.some(e=>e.id===previous))select.value=previous;
      fetching=false;if(previous && canLoad() && source.value==='discord')load(events.find(e=>e.id===previous) || null);render();
    }catch(error){if(id!==request)return;fetching=false;render();status.textContent=error.message;}
  }
  select.onchange=()=>{if(!canLoad() || source.value!=='discord')return;const event=events.find(e=>e.id===select.value) || null;if(load(event)===false)return;render();if(event)notify('Loaded '+event.players.length+' players from '+event.title+'. Choose your format and create teams as usual.');};refresh.onclick=reload;
  source.onchange=()=>{if(!canLoad())return;load(source.value==='discord'?(events.find(e=>e.id===select.value) || null):null);render();};
  if(clear)clear.onclick=async()=>{
    if(!canLoad() || fetching || !clearEvents || !events.length)return;
    if(!confirm('Delete all published Discord events from the website? Discord messages and current tournament results will remain.'))return;
    fetching=true;render();status.textContent='Clearing published Discord events…';
    try{await clearEvents();++request;events=[];select.replaceChildren(new Option('Select a Discord event',''));source.value='custom';load(null);fetching=false;render();notify('Discord events cleared. The public site updates after deployment.');}
    catch(error){fetching=false;render();status.textContent=error.message;}
  };
  reload();return {render,getSelectedEvent:()=>source.value==='discord'?(events.find(event=>event.id===select.value) || null):null,resetChoice:()=>{source.value='custom';select.value='';render();}};
}
if(typeof module!=='undefined')module.exports={validateDiscordEvents,validateMapVoteRequest,readPublishedDiscordEvents,clearPublishedDiscordEvents,requestDiscordCaptainVote,requestDiscordMapVote};
