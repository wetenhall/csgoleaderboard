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
  }
  return data.events;
}
function createDiscordEventLoader({canLoad,load,notify}) {
  const select=document.getElementById('discord-event'),refresh=document.getElementById('refresh-discord-events'),status=document.getElementById('discord-event-status');
  const source=document.getElementById('game-source'),choice=document.getElementById('discord-event-choice');
  let events=[],fetching=false,request=0;
  function render(){
    const event=source.value==='discord'?events.find(e=>e.id===select.value):null;
    choice.hidden=refresh.hidden=source.value!=='discord';source.disabled=!canLoad();
    select.disabled=fetching || !canLoad();refresh.disabled=fetching || !canLoad();
    if(!fetching)status.textContent=event?event.players.length+' Discord players loaded: '+event.players.join(', '):source.value==='discord'?(events.length?'Select a published Discord event to continue.':'No published Discord events yet. Publish from Discord, then refresh.'):'Custom game · Add saved players or enter your own names in the Players stage.';
  }
  async function reload(){
    const id=++request;fetching=true;render();status.textContent='Loading published Discord events…';
    try{
      const response=await fetch('discord-events.json?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw Error('Could not load Discord events. Try Refresh after deployment finishes.');
      const next=validateDiscordEvents(await response.json());if(id!==request)return;
      const previous=select.value;events=next;select.replaceChildren(new Option('Select a Discord event',''));
      for(const event of events)select.add(new Option(event.title+' · '+event.players.length+' players',event.id));
      if(events.some(e=>e.id===previous))select.value=previous;
      fetching=false;if(previous && canLoad() && source.value==='discord')load(events.find(e=>e.id===previous) || null);render();
    }catch(error){if(id!==request)return;fetching=false;render();status.textContent=error.message;}
  }
  select.onchange=()=>{if(!canLoad() || source.value!=='discord')return;const event=events.find(e=>e.id===select.value) || null;if(load(event)===false)return;render();if(event)notify('Loaded '+event.players.length+' players from '+event.title+'. Choose your format and create teams as usual.');};refresh.onclick=reload;
  source.onchange=()=>{if(!canLoad())return;load(source.value==='discord'?(events.find(e=>e.id===select.value) || null):null);render();};
  reload();return {render,getSelectedEvent:()=>source.value==='discord'?(events.find(event=>event.id===select.value) || null):null,resetChoice:()=>{source.value='custom';select.value='';render();}};
}
if(typeof module!=='undefined')module.exports={validateDiscordEvents};
