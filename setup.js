function createSetupMusic(){
  const audio=document.getElementById('setup-music-audio');
  const toggle=document.getElementById('setup-music-toggle');
  const volume=document.getElementById('setup-music-volume');
  const status=document.getElementById('setup-music-status');
  const opener=document.getElementById('setup-music-open');
  const musicBar=opener.closest('.setup-music');
  const panel=document.getElementById('setup-music-panel');
  let active=false;
  let manuallyPaused=false;
  let starting=false;

  function setPanel(open){
    panel.hidden=!open;
    opener.setAttribute('aria-expanded',String(open));
  }
  opener.onclick=()=>setPanel(panel.hidden);
  document.addEventListener('click',event=>{
    if(!panel.hidden && !musicBar.contains(event.target))setPanel(false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape' || panel.hidden)return;
    event.preventDefault();
    event.stopPropagation();
    setPanel(false);
    opener.focus();
  },true);

  function syncPlayback(){
    toggle.textContent=audio.paused?'Play music':'Pause music';
    opener.classList.toggle('music-playing',!audio.paused && audio.volume>0);
  }
  async function play(){
    if(!active || manuallyPaused || starting || !audio.paused)return;
    starting=true;
    try{
      await audio.play();
      status.textContent='';
    }catch(error){
      if(active && error.name!=='AbortError'){
        status.textContent=error.name==='NotAllowedError'?'Press Play music to start.':'The CS2 track could not be played.';
      }
    }finally{
      starting=false;
      syncPlayback();
    }
  }
  audio.onplay=audio.onpause=syncPlayback;
  volume.oninput=()=>{audio.volume=Number(volume.value)/100;syncPlayback();};
  volume.oninput();
  toggle.onclick=()=>{
    manuallyPaused=!audio.paused;
    if(manuallyPaused)audio.pause();
    else void play();
  };
  document.getElementById('panel-team-setup').addEventListener('click',event=>{
    if(event.target.closest('button[id^="setup-next-"],#start-draw'))void play();
  },true);
  return {moveControls(before){
    setPanel(false);
    before.before(musicBar);
  },setActive(visible){
    if(visible===active)return;
    active=visible;
    if(active)void play();
    else {setPanel(false);audio.pause();}
  }};
}

function createSetupStages({isBusy,isLocked,validateGame,validateOptions,validatePlayers,preparePlayers,signature,summary,resetDraw}) {
  const $=id=>document.getElementById(id);
  let step=1,unlocked=1,confirmed=null;
  function render(){
    if(confirmed && confirmed!==signature()){
      confirmed=null;unlocked=Math.min(unlocked,3);
      if(step===4 && !isLocked())step=3;
    }
    for(let i=1;i<=4;i++){
      $('setup-stage-'+i).hidden=step!==i;
      $('setup-tab-'+i).disabled=isBusy() || i>unlocked;
      if(step===i)$('setup-tab-'+i).setAttribute('aria-current','step');else $('setup-tab-'+i).removeAttribute('aria-current');
    }
    for(let i=1;i<=3;i++)$('setup-next-'+i).disabled=isBusy();
    for(let i=2;i<=4;i++)$('setup-back-'+i).disabled=isBusy();
    $('setup-summary').textContent=summary();
  }
  function go(next){
    if(isBusy() || next>unlocked)return;
    if(next>1){const error=validateGame?.();if(error){$('setup-status').textContent=error;return;}}
    if(next<4 && isLocked()){
      resetDraw();if(isLocked())return;
      confirmed=null;unlocked=3;
    }
    if(next===3)preparePlayers?.();
    step=next;$('setup-status').textContent='';render();
    $('setup-tab-'+step).focus();
  }
  for(let i=1;i<=4;i++)$('setup-tab-'+i).onclick=()=>go(i);
  for(let i=2;i<=4;i++)$('setup-back-'+i).onclick=()=>go(i-1);
  for(let i=1;i<=3;i++)$('setup-next-'+i).onclick=()=>{
    if(isBusy())return;
    const error=i===1?(validateGame?.() || ''):i===2?validateOptions():i===3?validatePlayers():'';
    if(error){$('setup-status').textContent=error;$('setup-status').scrollIntoView?.({block:'center',behavior:'smooth'});return;}
    if(i===3)confirmed=signature();
    unlocked=Math.max(unlocked,i+1);go(i+1);
  };
  render();return {render,reset:()=>{confirmed=null;unlocked=1;step=1;render();},showDraw:()=>{confirmed=signature();unlocked=4;step=4;render();}};
}
if(typeof module!=='undefined')module.exports={createSetupStages};
