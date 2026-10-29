/* Local presentation screen for sharing while waiting for a tournament. */
if (typeof document !== 'undefined') (() => {
  const screen=document.getElementById('waiting-screen');
  const open=document.getElementById('open-waiting-screen');
  const close=document.getElementById('close-waiting-screen');
  if(!screen || !open || !close)return;
  let ownsFullscreen=false;
  async function dismiss(){
    if(screen.open)screen.close();
    document.body.classList.remove('waiting-screen-open');
    if(ownsFullscreen && document.fullscreenElement===screen){
      try{await document.exitFullscreen();}catch{}
    }
    ownsFullscreen=false;
    open.focus();
  }
  open.addEventListener('click',()=>{
    screen.showModal();
    document.body.classList.add('waiting-screen-open');
    document.getElementById('waiting-tournament-name').textContent=document.getElementById('brand-title')?.textContent || 'Friends Cup';
    if(!document.fullscreenElement && screen.requestFullscreen){
      screen.requestFullscreen().then(()=>{ownsFullscreen=true;}).catch(()=>{});
    }
  });
  close.addEventListener('click',dismiss);
  screen.addEventListener('cancel',event=>{event.preventDefault();void dismiss();});
  document.addEventListener('fullscreenchange',()=>{
    if(ownsFullscreen && document.fullscreenElement!==screen)void dismiss();
  });
})();
