function broadcastNode(tag,cls,text){
  const node=document.createElement(tag);
  node.className=cls;
  node.textContent=text;
  return node;
}
function drawBroadcast(stage,scene){
  stage.replaceChildren();
  stage.style.backgroundImage=scene.art?'linear-gradient(110deg,#101216ed,#17191c88),url("'+scene.art+'")':'';
  stage.append(broadcastNode('p','eyebrow',scene.label || 'Tournament broadcast'),broadcastNode('h1','',scene.title));
  if(scene.detail)stage.append(broadcastNode('p','broadcast-detail',scene.detail));
  if(scene.history?.length){
    const row=document.createElement('ol');
    row.className='broadcast-history';
    scene.history.forEach(line=>row.append(broadcastNode('li','',line)));
    stage.append(row);
  }
}
function broadcastBan(text){
  const actions=document.querySelector('#draw-stage .veto-reset-actions');
  if(!actions)return;
  actions.querySelector('.broadcast-lower-third')?.remove();
  const cue=broadcastNode('div','broadcast-lower-third',text);
  cue.setAttribute('role','status');
  actions.prepend(cue);
  setTimeout(()=>cue.remove(),2400);
}
function broadcastResult(data,id){
  const state=resolveTournament(data),match=state.matches.find(item=>item.id===id);
  if(!match?.result)return;
  const names=match.ids.map(team=>teamDisplayName(state.teams.get(team)));
  const winner=match.ids.indexOf(match.winner);
  const scene={label:'Final score'+(match.map?' · '+match.map:''),title:winner<0?'Draw':names[winner]+' win',detail:names[0]+'   '+match.result.scores.join(' : ')+'   '+names[1],art:mapImageUrl(match.map)};
  document.querySelector('.result-sting')?.remove();
  const sting=document.createElement('aside');
  sting.className='broadcast-stage result-sting';
  sting.setAttribute('role','status');
  drawBroadcast(sting,scene);
  document.body.append(sting);
  setTimeout(()=>sting.remove(),4200);
}
