(async()=>{
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
  }catch(error){status.textContent=error.message;}
})();
