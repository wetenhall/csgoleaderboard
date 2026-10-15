/* Draft review, map vetoes and custom-match conveniences. */
function validServerAddress(value) {
  if(typeof value!=='string')throw Error('Enter a server hostname or IP address, optionally followed by :port.');
  value=value.trim();
  if(value && (!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(value) || value.length>253))throw Error('Use a hostname or IP address with an optional port, without commands or passwords.');
  const port=value.match(/:(\d+)$/);if(port && (+port[1]<1 || +port[1]>65535))throw Error('Server port must be between 1 and 65535.');
  return value;
}
function parseServerConnection(value) {
  const match=String(value).trim().match(/^(?:connect\s+)?([^;\s]+)(?:\s*;\s*password\s+(?:"([^"\r\n]*)"|([^\s;"\r\n]+)))?\s*;?$/i);
  if(!String(value).trim())return {serverAddress:'',serverPassword:''};
  if(!match)throw Error('Paste a server address or connect address:port; password yourpassword.');
  const password=match[2] ?? match[3] ?? '';
  if(password.length>128 || /[;"\r\n\x00-\x1f]/.test(password))throw Error('Invalid server password.');
  return {serverAddress:validServerAddress(match[1]),serverPassword:password};
}
function serverConnectionCommand(data,launch=false) {
  const connection=parseServerConnection((data.serverAddress || '')+(data.serverPassword?' ; password "'+data.serverPassword+'"':''));
  if(!connection.serverAddress)return '';
  const password=connection.serverPassword;
  return launch?(password?'+password "'+password+'" ':'')+'+connect '+connection.serverAddress:'connect '+connection.serverAddress+(password?'; password "'+password+'"':'');
}
function balanceRosters(teams,random=Math.random) {
  const size=teams[0]?.players.length,players=teams.flatMap(t=>t.players);
  if(!size || teams.some(t=>t.players.length!==size))throw Error('Balance complete teams only.');
  const rating=p=>p.rating ?? 3;
  if(players.some(p=>!Number.isInteger(rating(p)) || rating(p)<1 || rating(p)>5))throw Error('Skill ratings must be whole numbers from 1 to 5.');
  const shuffled=players.map(p=>({p,key:random()})).sort((a,b)=>a.key-b.key).map(x=>x.p);
  let rosters;
  if(teams.length===2){
    const total=players.reduce((sum,p)=>sum+rating(p),0);let best=Infinity,pick=[];
    function choose(start,chosen,sum){if(chosen.length===size){const difference=Math.abs(total-2*sum);if(difference<best){best=difference;pick=[...chosen];}return;}for(let i=start;i<=shuffled.length-(size-chosen.length);i++)choose(i+1,[...chosen,i],sum+rating(shuffled[i]));}
    choose(0,[],0);const indexes=new Set(pick);rosters=[shuffled.filter((p,i)=>indexes.has(i)),shuffled.filter((p,i)=>!indexes.has(i))];
  }else{
    rosters=teams.map(()=>[]);const totals=teams.map(()=>0);
    for(const player of shuffled.sort((a,b)=>rating(b)-rating(a))){const candidates=rosters.map((r,i)=>i).filter(i=>rosters[i].length<size).sort((a,b)=>totals[a]-totals[b] || rosters[a].length-rosters[b].length);const i=candidates[0];rosters[i].push(player);totals[i]+=rating(player);}
  }
  return teams.map((team,i)=>{const next={...team,players:rosters[i]};delete next.captainId;return next;});
}
function swapDraftPlayers(teams,first,second){
  const next=structuredClone(teams),a=next.find(t=>t.players.some(p=>p.id===first)),b=next.find(t=>t.players.some(p=>p.id===second));
  if(!a || !b || a===b)throw Error('Select one player from each of two different teams.');
  const ai=a.players.findIndex(p=>p.id===first),bi=b.players.findIndex(p=>p.id===second);[a.players[ai],b.players[bi]]=[b.players[bi],a.players[ai]];
  for(const team of [a,b])if(!team.players.some(p=>p.id===team.captainId))delete team.captainId;
  return next;
}
function discordMatchText(data,resolve){
  const state=resolve(data),match=state.matches.find(m=>!m.skipped && !m.result) || state.matches.filter(m=>!m.skipped).at(-1);
  const clean=value=>String(value).replace(/[@`*_~|<>\\]/g,'').replace(/[\r\n]/g,' ');
  const lines=[clean(data.headers?.brand || data.name),match?.map?'Map: '+clean(match.map):'Tournament teams'];
  const teams=match?.ids.every(Boolean)?match.ids.map(id=>state.teams.get(id)):data.teams;
  for(const team of teams){lines.push('',clean(team.name));for(const player of team.players || [])lines.push('• '+clean(player.name)+(team.captainId===player.id?' (Captain)':''));}
  if(match?.result)lines.push('','Score: '+match.result.scores.join(' – '));
  return lines.join('\n');
}
function advanceMapVeto(maps,teams,bans,map){
  const remaining=maps.filter(name=>!bans.some(b=>b.map===name));
  if(teams.length!==2 || remaining.length<2 || !remaining.includes(map))throw Error('Choose an available map while at least two remain.');
  const next=[...bans,{teamId:teams[bans.length%2].id,map}],left=remaining.filter(name=>name!==map);
  return {bans:next,selected:left.length===1?left[0]:null};
}
function manualRosters(players,assignments,size){
  if(![2,3,4,5].includes(size) || players.length<size*2 || players.length%size || assignments.length!==players.length)throw Error('Select enough players for complete teams.');
  const byId=new Map(players.map(p=>[p.id,p]));
  if(byId.size!==players.length || new Set(assignments).size!==players.length || assignments.some(id=>!byId.has(id)))throw Error('Assign every selected player once, with no empty slots.');
  return Array.from({length:players.length/size},(_,i)=>assignments.slice(i*size,(i+1)*size).map(id=>structuredClone(byId.get(id))));
}
function createCaptainCases(players,size,captains,caseOrder){
  if(![2,3,4,5].includes(size) || players.length!==size*2 || new Set(players.map(p=>p.id)).size!==players.length)throw Error('Captain cases need exactly two complete teams.');
  const byId=new Map(players.map(p=>[p.id,p]));
  if(captains.length!==2 || captains[0]===captains[1] || captains.some(id=>!byId.has(id)))throw Error('Choose two different captains from the selected players.');
  const remaining=players.filter(p=>!captains.includes(p.id));
  if(caseOrder.length!==remaining.length || new Set(caseOrder).size!==remaining.length || caseOrder.some(id=>!remaining.some(p=>p.id===id)))throw Error('Every remaining player needs one case.');
  return {size,teams:captains.map((id,i)=>({id:'t'+(i+1),name:'Team '+String(i+1).padStart(2,'0'),tag:String(i+1).padStart(2,'0'),captainId:id,players:[structuredClone(byId.get(id))]})),cases:caseOrder.map(id=>({player:structuredClone(byId.get(id)),opened:false})),turn:0};
}
function openCaptainCase(state,index){
  if(!Number.isInteger(index) || !state.cases[index] || state.cases[index].opened || state.turn>=state.cases.length)throw Error('Choose an unopened case.');
  const next=structuredClone(state),team=next.teams[next.turn%2];
  if(team.players.length>=next.size)throw Error('This team is already full.');
  next.cases[index].opened=true;next.cases[index].teamId=team.id;team.players.push(next.cases[index].player);next.turn++;
  return next;
}
if(typeof module!=='undefined')module.exports={validServerAddress,parseServerConnection,serverConnectionCommand,balanceRosters,swapDraftPlayers,discordMatchText,advanceMapVeto,manualRosters,createCaptainCases,openCaptainCase};

function createGameNightTools({saveServer,getData,getDraft,isOrganiser,isBusy,setMap,getMaps,setMapMethod,beginRematch,notify}) {
  const $=id=>document.getElementById(id);
  const draftRoot=element('section','map-draw-options'),methodRoot=element('div','map-method-control'),publicRoot=element('section','match-tools');
  let pendingMethod='',serverEditorOpen=false;
  methodRoot.hidden=true;$('draw-stage').querySelector('.draw-roster').after(methodRoot);
  draftRoot.hidden=true;draftRoot.id='map-draw-options';publicRoot.id='match-tools';methodRoot.after(draftRoot);$('panel-leaderboard').append(publicRoot);
  const makeButton=(label,action)=>{const b=element('button','secondary',label);b.type='button';b.onclick=async()=>{try{await action();}catch(e){notify(e.message);}};return b;};
  async function copy(text){try{await navigator.clipboard.writeText(text);notify('Copied to clipboard.');}catch{const dialog=element('dialog','options-dialog'),field=element('textarea');field.value=text;field.rows=12;field.readOnly=true;dialog.append(element('h2','','Copy match details'),field,makeButton('Close',()=>{dialog.close();dialog.remove();}));document.body.append(dialog);dialog.showModal();field.select();}}
  function controls(){publicRoot.querySelectorAll('[data-server-toggle]').forEach(button=>{button.hidden=!isOrganiser();button.disabled=isBusy();button.setAttribute('aria-expanded',String(serverEditorOpen && isOrganiser()));});publicRoot.querySelectorAll('[data-server-editor]').forEach(form=>{form.hidden=!isOrganiser() || !serverEditorOpen;form.querySelectorAll('input,button').forEach(el=>el.disabled=isBusy());});[draftRoot,methodRoot].forEach(root=>root.querySelectorAll('input,select,button').forEach(el=>el.disabled=isBusy() || !isOrganiser()));const confirm=$('confirm-map-method');if(confirm)confirm.disabled=isBusy() || !isOrganiser() || !$('map-selection-method').value || !!getDraft()?.mapMethod;$('panel-leaderboard').querySelectorAll('[data-rematch]').forEach(el=>{el.hidden=!isOrganiser();el.disabled=isBusy();});}
  function renderDraft(){
    const wasHidden=methodRoot.hidden;
    draftRoot.replaceChildren();methodRoot.replaceChildren();const draft=getDraft();methodRoot.hidden=!draft || draft.format!=='single';draftRoot.hidden=true;
    $('draw-stage').classList.toggle('map-selection-stage',!methodRoot.hidden);
    $('draw-stage').classList.toggle('map-veto',!methodRoot.hidden && draft.mapMethod==='veto');
    if(methodRoot.hidden){pendingMethod='';$('draw-stage').querySelector('.draw-roster').before($('draw-stage').querySelector('.wheel-panel'));return;}
    draftRoot.after($('draw-stage').querySelector('.wheel-panel'));
    if(draft.format==='single'){
      const maps=getMaps(),section=element('section','veto-panel'),methodLabel=element('label','','Map selection method'),method=element('select');
      method.id='map-selection-method';
      for(const [value,label] of [['','Select a map selection method'],['wheel','Spinning wheel'],['case','Case-opening reel'],['veto','Teams ban maps']]){const option=element('option','',label);option.value=value;method.append(option);}
      method.value=draft.mapMethod || pendingMethod;
      method.onchange=()=>{pendingMethod=method.value;setMapMethod(null);};
      methodLabel.append(method);methodRoot.append(methodLabel);
      const confirm=makeButton(draft.mapMethod?'Method confirmed':'Confirm map selection',()=>{if(!method.value || isBusy() || !isOrganiser())return;pendingMethod=method.value;setMapMethod(method.value);});
      confirm.id='confirm-map-method';methodRoot.append(confirm);
      const note=element('p','rules',draft.mapMethod?'Choose another method to change how the map is selected.':'Select a method and confirm to reveal its controls.');methodRoot.append(note);
      if(!draft.mapMethod){controls();confirm.disabled=isBusy() || !isOrganiser() || !method.value;if(wasHidden)methodRoot.scrollIntoView({block:'center',behavior:'smooth'});return;}
      confirm.disabled=true;
      if(method.value==='veto'){
        const bans=draft.mapVeto || [],left=maps.filter(map=>!bans.some(b=>b.map===map)),team=draft.teams[bans.length%2];
        if(left.length===1){
          const hero=element('div','single-match-map');
          hero.setAttribute('role','status');
          hero.append(element('span','eyebrow','SELECTED MAP / CUSTOM '+draft.teamSize+'V'+draft.teamSize),element('h3','',left[0]));section.append(hero);
        }else if(left.length>1){
          const hero=element('div','single-match-map');hero.setAttribute('role','status');
          hero.append(element('span','eyebrow','MAP VETO / CUSTOM '+draft.teamSize+'V'+draft.teamSize),element('h3','',team.name+' bans next'),element('p','rules','The organiser clicks on behalf of each team.'));section.append(hero);
        }else section.append(element('p','rules','Select at least one map.'));
        const buttons=element('div','game-actions');if(left.length>1)left.forEach(map=>buttons.append(makeButton('Ban '+map,()=>{if(isBusy() || !isOrganiser())return;const result=advanceMapVeto(maps,draft.teams,bans,map);draft.mapVeto=result.bans;if(result.selected)setMap(result.selected);else renderDraft();})));
        if(left.length===1 && draft.matches[0].map!==left[0])buttons.append(makeButton('Confirm '+left[0],()=>setMap(left[0])));
        section.append(buttons);
        const resetRow=element('div','veto-reset-actions'),reset=makeButton('Restart veto',()=>{draft.mapVeto=[];setMap(null);});
        reset.classList.add('danger');resetRow.append(reset);section.append(resetRow);
      }draftRoot.hidden=draft.mapMethod!=='veto';draftRoot.append(section);
    }
    controls();
  }
  function render(){
    publicRoot.replaceChildren();const data=getData(),actions=element('div','game-actions');
    if(data.teams.length)actions.append(makeButton('Copy match details for Discord',()=>copy(discordMatchText(getData(),resolveTournament))));
    if(data.serverAddress)actions.append(makeButton('Copy server connection',()=>copy(serverConnectionCommand(getData()))));
    if(data.format==='single' && data.teamSize>=2){const rematch=makeButton('Rematch · Same teams, new map',beginRematch);rematch.dataset.rematch='';actions.append(rematch);}
    const matchActions=document.querySelector('.match-published-actions');
    if(matchActions){actions.classList.add('match-extra-actions');matchActions.querySelector('.match-extra-actions')?.remove();matchActions.append(actions);}
    else publicRoot.append(actions);
    if(data.format==='single' && data.teams.length){
      const form=element('form','setup-card');form.dataset.serverEditor='';form.id='match-server-editor';
      const toggle=makeButton('Add server',()=>{serverEditorOpen=!serverEditorOpen;controls();if(serverEditorOpen)form.querySelector('input').focus();});toggle.dataset.serverToggle='';toggle.setAttribute('aria-controls',form.id);publicRoot.append(toggle);
      form.append(element('h3','','Match server'),element('p','rules','Once your game server is ready, add its address here. Saving updates Connect to match in Discord. Paste the full connect command, including a password if required. These details are published for players on the website and in its public repository. Leave blank to remove them.'));
      const label=element('label','','Server connection details'),input=document.createElement('input');input.value=data.serverAddress?serverConnectionCommand(data):'';input.placeholder='server.example.com:27015';input.maxLength=450;input.autocomplete='off';label.append(input);
      const status=element('p','rules');status.setAttribute('role','status');const actions=element('div','setup-navigation'),save=element('button','','Save server details');save.type='submit';actions.append(save);form.append(label,status,actions);
      form.onsubmit=async event=>{event.preventDefault();if(!isOrganiser() || isBusy())return;try{await saveServer(input.value);notify('Server details saved. Discord updates automatically within 30 seconds.');}catch(error){status.textContent=error.message;}};
      publicRoot.append(form);
    }
    const past=(data.history || []).filter(entry=>entry.tournament.format==='single').slice(-8).reverse();
    publicRoot.hidden=!data.teams.length && !data.serverAddress && !past.length;
    const completed=data.format==='single' && data.matches[0]?.result;
    if(past.length || completed){publicRoot.append(element('h3','','Recent custom matches'));const list=element('div','recent-matches');
      for(const entry of [...(completed?[{title:'Current match',tournament:data}]:[]),...past]){const state=resolveTournament(entry.tournament),match=state.matches[0],card=element('article','recent-match');card.append(element('strong','',match.map || 'Custom match'),element('p','',match.ids.map(id=>state.teams.get(id).name).join(' vs ')+' · '+match.result.scores.join(' – ')),element('p','rules','Winner: '+(state.teams.get(match.winner)?.name || 'Draw')),element('small','',entry.title));list.append(card);}publicRoot.append(list);
    }publicRoot.hidden=!publicRoot.children.length;controls();
  }
  return {render,renderDraft,controls};
}
