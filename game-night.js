/* Draft review, map vetoes and custom-match conveniences. */
function validServerAddress(value) {
  if(typeof value!=='string')throw Error('Enter a server hostname or IP address, optionally followed by :port.');
  value=value.trim();
  if(value && (!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(value) || value.length>253))throw Error('Use a hostname or IP address with an optional port, without commands or passwords.');
  const port=value.match(/:(\d+)$/);if(port && (+port[1]<1 || +port[1]>65535))throw Error('Server port must be between 1 and 65535.');
  return value;
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
if(typeof module!=='undefined')module.exports={validServerAddress,balanceRosters,swapDraftPlayers,discordMatchText,advanceMapVeto};

function createGameNightTools({getData,getDraft,isOrganiser,isBusy,refreshDraft,setMap,getMaps,beginRematch,notify}) {
  const $=id=>document.getElementById(id);
  const draftRoot=element('section','draft-review'),publicRoot=element('section','match-tools');
  draftRoot.hidden=true;draftRoot.id='draft-review';publicRoot.id='match-tools';$('publish-draw').before(draftRoot);$('panel-leaderboard').append(publicRoot);
  const makeButton=(label,action)=>{const b=element('button','secondary',label);b.type='button';b.onclick=async()=>{try{await action();}catch(e){notify(e.message);}};return b;};
  async function copy(text){try{await navigator.clipboard.writeText(text);notify('Copied to clipboard.');}catch{const dialog=element('dialog','options-dialog'),field=element('textarea');field.value=text;field.rows=12;field.readOnly=true;dialog.append(element('h2','','Copy match details'),field,makeButton('Close',()=>{dialog.close();dialog.remove();}));document.body.append(dialog);dialog.showModal();field.select();}}
  function controls(){draftRoot.querySelectorAll('input,select,button').forEach(el=>el.disabled=isBusy() || !isOrganiser());publicRoot.querySelectorAll('[data-rematch]').forEach(el=>{el.hidden=!isOrganiser();el.disabled=isBusy();});}
  function renderDraft(){
    draftRoot.replaceChildren();const draft=getDraft();draftRoot.hidden=!draft || draft.teamSize===1;if(draftRoot.hidden)return;
    draftRoot.append(element('h3','','Review teams before publishing'),element('p','rules','Swap players, pick captains, or optionally rate players from 1 (new) to 5 (experienced) and balance teams. Ratings default to 3. Balancing clears captain picks; pick captains afterward.'));
    const ratings=element('div','rating-grid');
    draft.teams.forEach(team=>{const block=element('div');block.append(element('h4','',team.name+' · Skill total '+team.players.reduce((sum,p)=>sum+(p.rating??3),0)));for(const player of team.players){const label=element('label','rating-row',player.name),input=element('input');input.type='number';input.min='1';input.max='5';input.step='1';input.value=player.rating??3;input.onchange=()=>{if(!input.checkValidity() || !input.value){input.reportValidity();return;}player.rating=Number(input.value);block.querySelector('h4').textContent=team.name+' · Skill total '+team.players.reduce((sum,p)=>sum+(p.rating??3),0);};label.append(input);block.append(label);}ratings.append(block);});draftRoot.append(ratings);
    const actions=element('div','game-actions');
    actions.append(makeButton('Balance teams by skill',()=>{if(!isOrganiser() || isBusy())return;for(const input of draftRoot.querySelectorAll('input')){if(!input.value || !input.checkValidity()){input.reportValidity();return;}}draft.teams=balanceRosters(draft.teams);refreshDraft();notify('Teams balanced using your skill ratings. Review before publishing.');}),makeButton('Pick random captains',()=>{if(!isOrganiser() || isBusy())return;draft.teams.forEach(team=>{team.captainId=team.players[randomIndex(team.players.length)].id;});refreshDraft();}));
    const picks=[0,1].map(i=>{const label=element('label','','Swap player '+(i+1)),select=element('select');draft.teams.forEach(team=>team.players.forEach(player=>{const option=element('option','',team.name+' · '+player.name);option.value=player.id;select.append(option);}));select.value=draft.teams[i].players[0].id;label.append(select);actions.append(label);return select;});
    actions.append(makeButton('Swap selected players',()=>{if(!isOrganiser() || isBusy())return;draft.teams=swapDraftPlayers(draft.teams,picks[0].value,picks[1].value);refreshDraft();}));draftRoot.append(actions);
    if(draft.format==='single'){
      const maps=getMaps(),section=element('section','veto-panel'),methodLabel=element('label','','Map selection'),method=element('select');
      for(const [value,label] of [['wheel','Spin the wheel'],['veto','Teams ban maps']]){const option=element('option','',label);option.value=value;method.append(option);}method.value=draft.mapMethod || 'wheel';method.onchange=()=>{draft.mapMethod=method.value;draft.mapVeto=[];setMap(null);};methodLabel.append(method);section.append(methodLabel);
      if(method.value==='veto'){
        const bans=draft.mapVeto || [],left=maps.filter(map=>!bans.some(b=>b.map===map)),team=draft.teams[bans.length%2];
        section.append(element('p','rules',left.length>1?team.name+' bans next. The organiser clicks on behalf of each team.':left.length===1?'Selected map: '+left[0]:'Select at least one map.'));
        const buttons=element('div','game-actions');if(left.length>1)left.forEach(map=>buttons.append(makeButton('Ban '+map,()=>{if(isBusy() || !isOrganiser())return;const result=advanceMapVeto(maps,draft.teams,bans,map);draft.mapVeto=result.bans;if(result.selected)setMap(result.selected);else renderDraft();})));
        if(left.length===1 && draft.matches[0].map!==left[0])buttons.append(makeButton('Confirm '+left[0],()=>setMap(left[0])));
        buttons.append(makeButton('Restart veto',()=>{draft.mapVeto=[];setMap(null);}));section.append(buttons);
        const list=element('ul');bans.forEach(b=>list.append(element('li','',(draft.teams.find(t=>t.id===b.teamId)?.name || 'Team')+' banned '+b.map)));section.append(list);
      }draftRoot.append(section);
    }
    controls();
  }
  function render(){
    publicRoot.replaceChildren();const data=getData(),actions=element('div','game-actions');
    if(data.teams.length)actions.append(makeButton('Copy match details for Discord',()=>copy(discordMatchText(getData(),resolveTournament))));
    if(data.serverAddress)actions.append(makeButton('Copy server connection',()=>copy('connect '+validServerAddress(getData().serverAddress))));
    if(data.format==='single' && data.teamSize===5){const rematch=makeButton('Rematch · Same squads, new map',beginRematch);rematch.dataset.rematch='';actions.append(rematch);}
    publicRoot.append(actions);
    const past=(data.history || []).filter(entry=>entry.tournament.format==='single').slice(-8).reverse();
    publicRoot.hidden=!data.teams.length && !data.serverAddress && !past.length;
    const completed=data.format==='single' && data.matches[0]?.result;
    if(past.length || completed){publicRoot.append(element('h3','','Recent custom matches'));const list=element('div','recent-matches');
      for(const entry of [...(completed?[{title:'Current match',tournament:data}]:[]),...past]){const state=resolveTournament(entry.tournament),match=state.matches[0],card=element('article','recent-match');card.append(element('strong','',match.map || 'Custom match'),element('p','',match.ids.map(id=>state.teams.get(id).name).join(' vs ')+' · '+match.result.scores.join(' – ')),element('p','rules','Winner: '+(state.teams.get(match.winner)?.name || 'Draw')),element('small','',entry.title));list.append(card);}publicRoot.append(list);
    }controls();
  }
  return {render,renderDraft,controls};
}
