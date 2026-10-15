(async()=>{
  const dialog=document.getElementById('connect-dialog');
  const requested=new URLSearchParams(location.search).get('connect')==='1';
  if(dialog){
    const close=()=>dialog.close();document.getElementById('close-connect').onclick=close;document.getElementById('dismiss-connect').onclick=close;
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)close();}});
    dialog.addEventListener('close',()=>{const url=new URL(location.href);url.searchParams.delete('connect');url.searchParams.delete('event');url.searchParams.delete('autoconnect');history.replaceState(null,'',url);});
    if(!requested)return;dialog.showModal();
  }
  const status=document.getElementById('status');
  try{
    const response=await fetch('tournament.json',{cache:'no-store'});
    if(!response.ok)throw Error('Could not load the match. Please try again.');
    const data=await response.json(),event=new URLSearchParams(location.search).get('event');
    if(event && data.discordEventId!==event)throw Error('This event is no longer the current match. Check the latest team announcement.');
    const server=validServerAddress(data.serverAddress || '');
    if(!server)throw Error('The organiser has not added a server address yet.');
    const command=serverConnectionCommand(data);
    document.getElementById('command').textContent=command;
    document.getElementById('launch').href='steam://connect/'+server+(data.serverPassword?'/'+encodeURIComponent(data.serverPassword):'');
    document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(command);status.textContent='Connection command copied.';}catch{status.textContent='Copy the command shown below into the CS2 console.';}};
    status.textContent='Your match server: '+server;
    document.getElementById('connection').hidden=false;
    if(new URLSearchParams(location.search).get('autoconnect')==='1'){status.textContent='Opening Steam to connect… If nothing happens, use Open CS2 & connect below.';location.href=document.getElementById('launch').href;}
  }catch(error){status.textContent=error.message;}
})();
