function createSetupMusic(){
  const audio=document.getElementById('setup-music-audio');
  const file=document.getElementById('setup-music-file');
  const volume=document.getElementById('setup-music-volume');
  const status=document.getElementById('setup-music-status');
  const toggle=document.getElementById('setup-music-toggle');
  const drawToggle=document.getElementById('draw-music-toggle');
  let source='';
  function update(){
    const label=audio.paused?'Play music':'Pause music';
    toggle.textContent=drawToggle.textContent=label;
    toggle.disabled=!source;
    drawToggle.hidden=!source;
  }
  async function play(){
    const selected=source;
    try{
      await audio.play();
      if(selected===source)status.textContent='';
    }catch(error){
      if(selected===source && error.name!=='AbortError'){
        status.textContent='Could not play this file. Try an MP3, Ogg, or WAV track.';
      }
    }
    update();
  }
  toggle.onclick=drawToggle.onclick=()=>{
    if(!source)return;
    if(audio.paused)void play();else audio.pause();
  };
  audio.onplay=audio.onpause=update;
  volume.oninput=()=>{audio.volume=Number(volume.value)/100;};
  volume.oninput();
  file.onchange=()=>{
    const track=file.files[0];
    if(!track)return;
    audio.pause();
    if(source)URL.revokeObjectURL(source);
    source=URL.createObjectURL(track);
    audio.src=source;
    status.textContent='';
    update();
    void play();
  };
  return {pause:()=>audio.pause()};
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
