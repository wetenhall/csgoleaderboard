function createSetupStages({isBusy,isLocked,validateOptions,validatePlayers,signature,summary,resetDraw}) {
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
    if(next<4 && isLocked()){
      resetDraw();if(isLocked())return;
      confirmed=null;unlocked=3;
    }
    step=next;$('setup-status').textContent='';render();
    $('setup-tab-'+step).focus();
  }
  for(let i=1;i<=4;i++)$('setup-tab-'+i).onclick=()=>go(i);
  for(let i=2;i<=4;i++)$('setup-back-'+i).onclick=()=>go(i-1);
  for(let i=1;i<=3;i++)$('setup-next-'+i).onclick=()=>{
    if(isBusy())return;
    const error=i===2?validateOptions():i===3?validatePlayers():'';
    if(error){$('setup-status').textContent=error;return;}
    if(i===3)confirmed=signature();
    unlocked=Math.max(unlocked,i+1);go(i+1);
  };
  render();return {render,reset:()=>{confirmed=null;unlocked=1;step=1;render();},showDraw:()=>{confirmed=signature();unlocked=4;step=4;render();}};
}
if(typeof module!=='undefined')module.exports={createSetupStages};
