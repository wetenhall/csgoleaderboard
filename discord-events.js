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
  let events=[],fetching=false,request=0;
  function render(){
    const event=events.find(e=>e.id===select.value);
    select.disabled=fetching || !canLoad();refresh.disabled=fetching || !canLoad();
    if(!fetching)status.textContent=event?event.players.length+' Discord players loaded: '+event.players.join(', '):'Custom game · Add saved players or enter your own names below.';
  }
  async function reload(){
    const id=++request;fetching=true;render();status.textContent='Loading published Discord events…';
    try{
      const response=await fetch('discord-events.json?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw Error('Could not load Discord events. Try Refresh after deployment finishes.');
      const next=validateDiscordEvents(await response.json());if(id!==request)return;
      const previous=select.value;events=next;select.replaceChildren(new Option('Custom game',''));
      for(const event of events)select.add(new Option(event.title+' · '+event.players.length+' players',event.id));
      if(events.some(e=>e.id===previous))select.value=previous;
      fetching=false;if(previous && canLoad())load(events.find(e=>e.id===previous) || null);render();
    }catch(error){if(id!==request)return;fetching=false;render();status.textContent=error.message;}
  }
  select.onchange=()=>{if(!canLoad())return;const event=events.find(e=>e.id===select.value) || null;if(load(event)===false)return;render();notify(event?'Loaded '+event.players.length+' players from '+event.title+'. Choose your format and create teams as usual.':'Custom game selected. Add your players below.');};refresh.onclick=reload;
  reload();return {render,getSelectedEvent:()=>events.find(event=>event.id===select.value) || null,resetChoice:()=>{select.value='';render();}};
}
if(typeof module!=='undefined')module.exports={validateDiscordEvents};
