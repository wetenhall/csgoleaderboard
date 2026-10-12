function resolveTournament(data) {
  const qualifiers = data.qualifiersPerGroup ?? 2;
  const teams = new Map(data.teams.map(team => [team.id, team]));
  const resolved = new Map();
  const groups = data.groups.map(group => ({ ...group, rows: group.teams.map(id => ({ id, played: 0, wins: 0, draws: 0, losses: 0, difference: 0 })) }));
  function resolve(match, ids) {
    const result = match.result;
    if (result && (!ids.every(id => teams.has(id)) || !Array.isArray(result.teams) || result.teams.length !== 2 || !result.teams.every((id, i) => id === ids[i]) || !Array.isArray(result.scores) || result.scores.length !== 2 || !result.scores.every(score => Number.isInteger(score) && score >= 0))) {
      throw new Error(`Check result for ${match.id}: participants or scores invalid.`);
    }
    const tied = result && result.scores[0] === result.scores[1];
    if (tied && !match.group && !ids.includes(result.tiebreakWinner)) throw Error('Select the tiebreak winner for a tied knockout game.');
    if (result?.tiebreakWinner && (!tied || match.group)) throw Error('Tiebreak winner is only used for tied knockout games.');
    const item = { ...match, ids, winner: result ? tied ? (match.group ? null : result.tiebreakWinner) : ids[result.scores[0] > result.scores[1] ? 0 : 1] : null };
    resolved.set(match.id, item);
    return item;
  }
  for (const match of data.matches.filter(match => match.group)) {
    const item = resolve(match, match.teams);
    const group = groups.find(group => group.id === match.group);
    if (item.result) item.ids.forEach((id, i) => {
      const row = group.rows.find(row => row.id === id);
      row.played++;
      row.wins += Number(id === item.winner);
      row.draws += Number(!item.winner);
      row.losses += Number(!!item.winner && id !== item.winner);
      row.difference += item.result.scores[i] - item.result.scores[1-i];
    });
  }
  for (const group of groups) {
    const order = group.tiebreakOrder;
    if (new Set(order).size !== order.length || order.some(id => !group.teams.includes(id))) throw new Error('Invalid tiebreak order');
    const tie = (a,b) => a.wins === b.wins && a.difference === b.difference;
    group.rows.sort((a,b) => b.wins-a.wins || b.difference-a.difference || ((order.includes(a.id) && order.includes(b.id)) ? order.indexOf(a.id)-order.indexOf(b.id) : group.teams.indexOf(a.id)-group.teams.indexOf(b.id)));
    group.complete = group.rows.every(row => row.played === group.teams.length - 1);
    group.tied = group.complete && group.rows.slice(0,qualifiers).some(row => {
      const peers = group.rows.filter(other => tie(row,other));
      return peers.length > 1 && !peers.every(peer => order.includes(peer.id));
    });
    group.qualified = group.complete && !group.tied;
  }
  for (const match of data.matches.filter(match => !match.group)) {
    const sources = match.sources || (match.seeds ? match.seeds.map(seed => ({seed})) : (match.from || []).map(winner => ({winner})));
    if (sources.length !== 2) throw Error('Invalid knockout participants.');
    if(match.resetOf){const first=resolved.get(match.resetOf);if(!first)throw Error('Invalid reset final.');if(first.winner!==first.ids[1] || !first.winner){if(match.result)throw Error('Reset final is not active.');resolved.set(match.id,{...match,ids:[null,null],winner:null,skipped:!!first.winner});continue;}}
    const ids = sources.map(source => {
      if (source.team) { if (!teams.has(source.team)) throw Error('Unknown knockout team.'); return source.team; }
      if (source.seed) {
        const [id,place] = source.seed, group = groups.find(group => group.id === id);
        if (!group || !Number.isInteger(place) || place < 0 || place >= qualifiers) throw Error('Invalid group seed.');
        return group.qualified ? group.rows[place].id : null;
      }
      if(source.loser){const previous=resolved.get(source.loser);if(!previous)throw Error('Invalid losers bracket source.');return previous.winner ? previous.ids.find(id=>id!==previous.winner) : null;}
      if (!resolved.has(source.winner)) throw Error('Invalid knockout match order.');
      return resolved.get(source.winner).winner;
    });
    resolve(match, ids);
  }
  return { teams, groups, matches: [...resolved.values()] };
}
function matchPlaceholder(match, index) {
  const source = match.sources?.[index] || (match.seeds ? {seed:match.seeds[index]} : {winner:match.from?.[index]});
  return source.seed ? `Group ${source.seed[0]} · ${source.seed[1] === 0 ? '1st' : '2nd'}` : source.winner ? `Winner ${source.winner.toUpperCase()}` : source.loser ? `Loser ${source.loser.toUpperCase()}` : 'Awaiting team';
}
function knockoutRoundName(match, matches) {
  if(match.label)return match.label;
  const labelled=matches.find(m=>m.round===match.round && m.label);if(labelled)return labelled.label;
  const last = Math.max(...matches.filter(m => !m.group).map(m => m.round));
  const remaining = last - match.round;
  return remaining === 0 ? 'Grand final' : remaining === 1 ? 'Semi-finals' : remaining === 2 ? 'Quarter-finals' : `Round of ${2 ** (remaining+1)}`;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function teamDisplayName(team) {
  return (team.players?.length === 1 || team.players?.length === 2) ? team.players.map(player => player.name).join(' + ') : team.name;
}
function teamDisplayLabel(team) {
  const display = teamDisplayName(team);
  return display === team.name ? display : `${display} (${team.name})`;
}
function teamEmblem(team) {
  const badge=element('span','team-emblem',team.tag || team.id.replace(/[^0-9]/g,'').padStart(2,'0'));
  const colours=['#ff9b01','#67afd3','#b6a0ee','#73d1a9','#f18e97','#e1cf80'];
  const number=Number(team.id.replace(/[^0-9]/g,'')) || 1;badge.style.setProperty('--emblem-colour',colours[(number-1)%colours.length]);
  badge.setAttribute('aria-hidden','true');return badge;
}
function teamNameNode(team) {
  const node = element('span', 'team-name');
  const display = teamDisplayName(team);
  node.append(element('span', 'team-display', display));
  if (display !== team.name) node.append(element('small', 'team-identifier', team.name));
  return node;
}
function tournamentPodium(data, state = resolveTournament(data)) {
  const places=[{rank:1,ids:[],note:'Awaiting the final'},{rank:2,ids:[],note:'Awaiting the final'},{rank:3,ids:[],note:'Awaiting results'}];
  const first=state.matches.find(m=>m.id==='f1');
  if(!first)return places;
  const final=data.format==='double' && first.winner && first.winner===first.ids[1] ? state.matches.find(m=>m.id==='f2') : first;
  if(final?.winner){places[0].ids=[final.winner];places[0].note='Champion';places[1].ids=final.ids.filter(id=>id!==final.winner);places[1].note='Runner-up';}
  else if(data.format==='double' && first.winner){places[0].note=places[1].note='Awaiting the reset final';}
  const loser=match=>match?.winner?match.ids.filter(id=>id!==match.winner):[];
  if(data.teams.length<3){places[2].note='Not applicable · two entrants';return places;}
  if(data.format==='double'){
    const lowerFinal=state.matches.filter(m=>m.bracket==='lower').at(-1);
    places[2].ids=loser(lowerFinal);places[2].note=places[2].ids.length?'Third place':'Awaiting the losers final';
  }else{
    const sources=first.sources || (first.from||[]).map(winner=>({winner}));
    const semifinals=sources.filter(s=>s.winner).map(s=>state.matches.find(m=>m.id===s.winner));
    if(semifinals.length && semifinals.every(m=>m?.winner)){
      places[2].ids=semifinals.flatMap(loser);places[2].note=places[2].ids.length>1?'Joint third · no third-place playoff':'Third place';
    }else places[2].note=semifinals.length?'Awaiting the semi-finals':'No third-place playoff';
  }
  return places;
}
function podiumRecord(matches,id){
  const record={played:0,won:0,lost:0,drawn:0};
  for(const match of matches){
    if(!match.result || match.skipped || !match.ids.includes(id))continue;
    record.played++;
    if(match.winner===id)record.won++;
    else if(match.winner)record.lost++;
    else record.drawn++;
  }
  return record;
}
function renderPodium(data,state){
  const root=document.getElementById('podium');root.replaceChildren();
  for(const place of tournamentPodium(data,state)){
    const card=element('article','podium-place podium-'+place.rank+(place.ids.length?' confirmed':''));
    card.append(element('span','podium-medal',place.rank===1?'★':place.rank===2?'◆':'◆'),element('h3','podium-rank',place.rank===1?'1st place':place.rank===2?'2nd place':'3rd place'));
    const names=element('div','podium-names');
    if(place.ids.length)place.ids.forEach(id=>{
      const entrant=element('div','podium-entrant'),record=podiumRecord(state.matches,id);
      entrant.append(element('strong','',teamDisplayName(state.teams.get(id))));
      const stats=element('dl','podium-stats');
      for(const [key,label] of [['played','Played'],['won','Won'],['lost','Lost']]){
        const stat=element('div','podium-stat');stat.append(element('dt','',label),element('dd','',String(record[key])));stats.append(stat);
      }
      entrant.append(stats);
      if(record.drawn)entrant.append(element('p','podium-draws',record.drawn+' drawn'));
      names.append(entrant);
    });
    else names.append(element('strong','','To be decided'));
    card.append(names,element('p','podium-note',place.note));root.append(card);
  }
}
function bracketLayout(matches) {
  const nodes=[],byId=new Map(),width=240,height=84,gap=64,pitch=120;
  const lanes=[['upper','Winners bracket'],['lower','Losers bracket']];
  let top=48,maxColumn=0;const headings=[];
  for(const [lane,title] of lanes){
    const games=matches.filter(m=>m.bracket===lane);
    if(!games.length)continue;
    headings.push({title,y:top-30});
    const rounds=[...new Set(games.map(m=>m.round))].sort((a,b)=>a-b),positions=new Map(),gameIds=new Set(games.map(m=>m.id));let cursor=top,bottom=top;
    function position(match){
      if(positions.has(match.id))return positions.get(match.id);
      const parents=(match.sources||[]).filter(s=>gameIds.has(s.winner)).map(s=>games.find(m=>m.id===s.winner));
      const ys=parents.map(position);const y=ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:cursor;
      if(!ys.length)cursor+=pitch;positions.set(match.id,y);return y;
    }
    position(games.at(-1));
    for(const match of games){
      const column=rounds.indexOf(match.round),y=position(match);
      const node={match,column,x:column*(width+gap)+24,y};nodes.push(node);byId.set(match.id,node);bottom=Math.max(bottom,y+height);maxColumn=Math.max(maxColumn,column);
    }
    top=bottom+100;
  }
  const lastUpper=nodes.filter(n=>n.match.bracket==='upper').at(-1);
  let column=maxColumn+1;
  for(const match of matches.filter(m=>m.bracket==='final')){
    const node={match,column,x:column*(width+gap)+24,y:lastUpper?.y??48};nodes.push(node);byId.set(match.id,node);column++;
  }
  const links=[];
  for(const node of nodes){
    const refs=node.match.resetOf?[{winner:node.match.resetOf}]:(node.match.sources||[]);
    refs.forEach((source,i)=>{const parent=byId.get(source.winner);if(!parent)return;
      const x1=parent.x+width,y1=parent.y+height/2,x2=node.x,y2=node.y+(node.match.resetOf?height/2:i===0?32:64),mid=x2-gap/2;
      links.push({from:parent.match.id,to:node.match.id,path:'M '+x1+' '+y1+' H '+mid+' V '+y2+' H '+x2});
    });
  }
  return {nodes,links,headings,width:Math.max(...nodes.map(n=>n.x+width),width)+24,height:Math.max(...nodes.map(n=>n.y+height),height)+36};
}
function renderConnectedBracket(root,matches,teams) {
  const layout=bracketLayout(matches),canvas=element('div','bracket-canvas');
  const hint=element('p','bracket-hint','Follow the connecting lines from left to right. Losing players drop into the labelled losers-bracket fixtures. Scroll sideways to see the full bracket.');root.append(hint);
  const viewport=element('div','bracket-viewport');viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','Double elimination bracket, scroll horizontally');
  canvas.style.width=layout.width+'px';canvas.style.height=layout.height+'px';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',layout.width);svg.setAttribute('height',layout.height);svg.setAttribute('aria-hidden','true');svg.classList.add('bracket-connectors');
  for(const link of layout.links){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',link.path);svg.append(path);}canvas.append(svg);
  for(const heading of layout.headings){const label=element('h3','bracket-section-title',heading.title);label.style.top=heading.y+'px';canvas.append(label);}
  for(const {match,x,y} of layout.nodes){
    const card=element('article','bracket-game'+(match.result?' is-played':''));card.style.left=x+'px';card.style.top=y+'px';card.setAttribute('aria-label',match.label+' · '+match.id.toUpperCase());
    card.append(element('div','bracket-game-label',match.id.toUpperCase()+' · '+match.label));
    match.ids.forEach((id,i)=>{const team=teams.get(id),name=team?teamDisplayName(team):matchPlaceholder(match,i),row=element('div','bracket-player'+(id && id===match.winner?' winner':'')+(!team?' pending':''));row.title=name;row.append(element('span','bracket-seed',team?.tag||'—'),element('span','bracket-player-name',name),element('strong','bracket-score',match.result?String(match.result.scores[i]):'—'));card.append(row);});
    if(match.resetOf)card.title='Only played if the losers bracket champion wins the first grand final.';
    canvas.append(card);
  }
  viewport.append(canvas);root.append(viewport);
}
async function downloadMatchImage(data) {
  await document.fonts.ready;
  const state=resolveTournament(data),match=state.matches[0],canvas=document.createElement('canvas');
  canvas.width=1600;canvas.height=900;const ctx=canvas.getContext('2d');
  const text=(value,x,y,size,color='#f4f4f4',width=670,align='left')=>{ctx.fillStyle=color;ctx.textAlign=align;ctx.font='700 '+size+'px Rajdhani, sans-serif';while(ctx.measureText(value).width>width && size>12){size--;ctx.font='700 '+size+'px Rajdhani, sans-serif';}ctx.fillText(value,x,y);};
  ctx.fillStyle='#101316';ctx.fillRect(0,0,1600,900);
  const gradient=ctx.createLinearGradient(30,0,1570,250);gradient.addColorStop(0,'#352b1d');gradient.addColorStop(1,'#23272f');ctx.fillStyle=gradient;ctx.fillRect(30,30,1540,230);ctx.fillStyle='#ff9b01';ctx.fillRect(30,30,1540,5);
  text('SELECTED MAP / CUSTOM 5V5',800,90,22,'#ff9b01',1400,'center');text((match.map || 'Map pending').toUpperCase(),800,205,100,'#ff9b01',1400,'center');
  match.ids.forEach((id,i)=>{const team=state.teams.get(id),x=30+i*785,color=i===0?'#70b4cd':'#ff9b01';ctx.fillStyle='#23272f';ctx.fillRect(x,290,755,570);ctx.strokeStyle='#424b55';ctx.strokeRect(x,290,755,570);ctx.fillStyle=color;ctx.fillRect(x,290,755,4);
    text(team.name,x+30,365,42,'#f4f4f4',570);text(match.result?String(match.result.scores[i]):'—',x+715,365,42,'#ff9b01',100,'right');text(match.winner===id?'WINNERS':'5 PLAYERS',x+30,410,20,'#ff9b01');
    team.players.forEach((player,j)=>{const y=445+j*76;ctx.strokeStyle='#424b55';ctx.beginPath();ctx.moveTo(x+30,y);ctx.lineTo(x+725,y);ctx.stroke();text(String(j+1).padStart(2,'0'),x+30,y+48,18,'#b8bcbf',35);text(player.name,x+80,y+48,34,'#f4f4f4',640);});
  });
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not create match image.');
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(match.map || 'custom').replace(/[^a-z0-9_-]+/gi,'-')+'-5v5-match.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

function renderTournament(data) {
  document.getElementById('bracket-heading').textContent=data.format==='single'?'Custom match':'Playoffs';
  document.getElementById('bracket-heading').nextElementSibling.textContent=data.format==='single'?'TWO SQUADS / ONE GAME':'WIN AND ADVANCE';
  const qualifiers = data.qualifiersPerGroup ?? 2;
  document.getElementById('qualification-label').textContent = `ROUND ROBIN / TOP ${qualifiers} ADVANCE`;
  const state = resolveTournament(data);
  renderPodium(data,state);
  const {teams,groups}=state; const matches=state.matches.filter(m=>!m.skipped);
  ['groups', 'bracket', 'teams'].forEach(id => document.getElementById(id).replaceChildren());
  document.getElementById('champion').textContent = 'One team takes it all.';
  document.getElementById('champion-note').textContent = 'Decided in the grand final';
  const headers=data.headers || {brand:data.name,banner:data.name};
  document.title = headers.brand;
  document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]').forEach(meta=>{meta.content=headers.brand;});
  document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]').forEach(meta=>{meta.content=headers.banner;});
  document.getElementById('brand-title').textContent=headers.brand;
  document.getElementById('footer-brand').textContent=headers.brand;
  document.getElementById('broadcast-caption').textContent='COUNTER-STRIKE / '+headers.brand;
  document.getElementById('title').replaceChildren(document.createTextNode(headers.banner), element('span', '', '.'));
  const completed = matches.filter(match => match.result).length;
  document.getElementById('broadcast-status').textContent=matches.length && completed===matches.length?'COMPLETE':completed?'LIVE':'READY';
  document.getElementById('broadcast-status').dataset.state=completed && completed<matches.length?'live':'ready';
  document.getElementById('progress').replaceChildren(document.createTextNode(`${completed} / ${matches.length} `), element('small', '', 'matches complete'));
  document.getElementById('team-count').textContent = `${data.teams.length} teams entered`;
  document.getElementById('format-name').textContent = `${data.teamSize === 1 ? '1v1' : data.teamSize === 2 ? 'Duos' : data.teamSize === 5 ? 'Squads' : 'Teams'} · ${data.format==='single' ? 'One match' : data.format==='double' ? 'Double elimination' : groups.length === 0 ? 'Knockout' : groups.length === 1 ? 'Group → final' : `${groups.length} groups → playoffs`}`;
  document.getElementById('groups-heading').closest('section').hidden = !groups.length;
  document.getElementById('roster-count').textContent = `${data.teams.length} TEAMS / 1 TROPHY`;
  document.getElementById('group-rules').textContent = 'Ranked by wins, then round difference (RD). Remaining ties need a tiebreak decision. Playoff places are confirmed when each team has played every other team in its group.';
  document.getElementById('schedule-rules').textContent = (data.format==='single' ? 'One custom 5v5 game between your two drawn squads.' : data.format==='double' ? 'Lose once to enter the losers bracket; a second loss eliminates you. If the losers bracket winner wins the grand final, play the reset final.' : groups.length ? `Play group games in numbered order. Top ${qualifiers} from each group advance to the knockout stages.` : 'Straight knockout: winners advance. Teams with a first-round bye enter in the following round.') + ' Connect in Settings to enter or correct results in Fixtures.';
  document.getElementById('status').textContent = completed === matches.length ? 'Tournament complete' : completed ? 'Tournament underway' : 'Awaiting first match';
  if (!data.teams.length) {
    document.getElementById('format-name').textContent='Not configured';
    document.getElementById('status').textContent='Ready for a new tournament';
    document.getElementById('champion').textContent='Start a new tournament.';
    document.getElementById('champion-note').textContent='Create teams in Team setup';
    document.getElementById('schedule-rules').textContent='Fixtures appear after you publish a new tournament.';
    document.getElementById('bracket').append(element('p','rules','No tournament yet. Open Team setup to draw teams and publish fixtures.'));
    document.getElementById('teams').append(element('p','rules','No teams entered yet.'));
    return;
  }
  function matchCard(match) {
    const card = element('article', 'match');
    card.setAttribute('aria-label', `Match ${match.id.toUpperCase()}`);
    const meta = element('div', 'match-meta', match.id.toUpperCase() + (match.map ? ' · ' + match.map : ''));
    meta.append(element('span', match.result ? 'finished' : '', match.result ? (match.result.tiebreakWinner ? 'TIEBREAK' : match.winner ? 'FINAL SCORE' : 'DRAW') : match.ids.every(Boolean) ? 'UPCOMING' : 'TO BE DECIDED'));
    card.append(meta);
    match.ids.forEach((id, i) => {
      const team = teams.get(id);
      const placeholder = matchPlaceholder(match,i);
      const row = element('div', `team-row${match.winner === id && id ? ' winner' : ''}${!team ? ' pending' : ''}`);
      row.append(element('span', 'team-tag', team?.tag ?? '—'), team ? teamNameNode(team) : element('span', 'team-name', placeholder), element('span', 'score', match.result ? String(match.result.scores[i]) : '—'));
      card.append(row);
    });
    return card;
  }
  for (const group of groups) {
    const section = element('section', 'group-panel');
    const heading = element('div', 'group-heading');
    heading.append(element('h3', '', `Group ${group.id}`), element('span', '', group.tied ? 'Tiebreak required' : group.qualified ? 'Standings confirmed' : `Top ${qualifiers} advance`));
    section.append(heading);
    const table = element('table');
    table.setAttribute('aria-label', `Group ${group.id} standings`);
    const head = element('thead'); const labels = element('tr');
    ['#','Team','P','W','D','L','RD'].forEach(label => { const cell = element('th','',label); cell.scope='col'; labels.append(cell); });
    head.append(labels); table.append(head);
    const body = element('tbody');
    group.rows.forEach((row,i) => {
      const tr = element('tr', group.qualified && i < qualifiers ? 'qualified' : '');
      [group.complete && !group.tied ? i+1 : '—', teams.get(row.id).name, row.played, row.wins, row.draws, row.losses, row.difference > 0 ? `+${row.difference}` : row.difference].forEach((value, index) => {
        const cell = element('td');
        if (index === 1) { const identity=element('span','scoreboard-identity');identity.append(teamEmblem(teams.get(row.id)),teamNameNode(teams.get(row.id)));cell.append(identity); }
        else cell.textContent = String(value);
        tr.append(cell);
      });
      body.append(tr);
    });
    table.append(body); section.append(table);
    const details = element('details', 'fixtures');
    details.append(element('summary','',`Group ${group.id} fixtures & results`));
    const fixtures = element('div','fixture-grid');
    matches.filter(match => match.group === group.id).forEach(match => fixtures.append(matchCard(match)));
    details.append(fixtures); section.append(details);
    document.getElementById('groups').append(section);
  }
  const singleSquads=data.format==='single' && data.teamSize===5;
  const leaderboardTab=document.getElementById('tab-leaderboard');
  leaderboardTab.textContent=singleSquads?'Match':'Leader board';
  leaderboardTab.setAttribute('aria-label',singleSquads?'Match':'Leader board');
  document.getElementById('teams').closest('section').hidden=singleSquads;
  document.getElementById('team-awards-heading').closest('section').hidden=singleSquads;
  document.getElementById('champion').closest('section').hidden=singleSquads;
  document.getElementById('podium-heading').closest('section').hidden=singleSquads;
  const bracketRoot=document.getElementById('bracket');
  bracketRoot.classList.toggle('single-squads',singleSquads);
  bracketRoot.classList.toggle('double-bracket',data.format==='double');
  if(singleSquads){
    const match=matches[0],hero=element('div','single-match-map');
    hero.append(element('span','eyebrow','SELECTED MAP / CUSTOM 5V5'),element('h3','',match.map || 'Map pending'));
    bracketRoot.append(hero);
    const squads=element('div','single-match-squads');
    match.ids.forEach((id,i)=>{
      const team=teams.get(id),card=element('article','single-squad'+(match.winner===id?' is-winner':''));
      const heading=element('div','single-squad-heading');
      heading.append(teamEmblem(team),element('h3','',team.name),element('strong','single-squad-score',match.result?String(match.result.scores[i]):'—'));
      card.append(heading,element('p','eyebrow',match.winner===id?'WINNERS':'5 PLAYERS'));
      const roster=element('ol','single-squad-players');
      team.players.forEach(player=>roster.append(element('li','',player.name)));
      card.append(roster);squads.append(card);
    });
    bracketRoot.append(squads);
    const download=element('button','secondary match-image-download','Download match image');download.type='button';
    download.onclick=async()=>{download.disabled=true;try{await downloadMatchImage(data);}catch(error){download.textContent='Download failed · Try again';console.error(error);}finally{download.disabled=false;}};
    bracketRoot.append(download);
  }
  else if(data.format==='double')renderConnectedBracket(bracketRoot,matches,teams);
  else [...new Set(matches.filter(match => !match.group).map(match => match.round))].sort((a,b)=>a-b).forEach(round => {
    const column=element('div', 'round round-'+round),heading=element('h3','round-heading',data.format==='single'?'5v5 · '+(matches[0].map || 'Map pending'):knockoutRoundName({round},matches));
    heading.append(element('span','',String(round+1).padStart(2,'0')));column.append(heading);
    const list=element('div','match-list');matches.filter(match=>match.round===round).forEach(match=>list.append(matchCard(match)));
    column.append(list);bracketRoot.append(column);
  });
  const firstFinal=matches.find(match=>match.id==='f1');
  const final = data.format==='double' && firstFinal.winner===firstFinal.ids[1] && firstFinal.winner ? matches.find(match=>match.id==='f2') : firstFinal;
  if (final?.winner) {
    document.getElementById('champion').textContent = teamDisplayLabel(teams.get(final.winner));
    document.getElementById('champion-note').textContent = headers.brand+' champions';
  }
  const eliminated = new Set(matches.filter(match => !match.group && match.winner).flatMap(match => match.ids.filter(id => id !== match.winner)));
  if(data.format==='double'){for(const id of eliminated){if(matches.filter(m=>m.winner && m.ids.includes(id) && m.winner!==id).length<2)eliminated.delete(id);}}
  groups.filter(group => group.qualified).forEach(group => group.rows.slice(qualifiers).forEach(row => eliminated.add(row.id)));
  data.teams.forEach(team => {
    const card = element('article', 'contender'); const details = element('div');
    const group = groups.find(group => group.teams.includes(team.id));
    details.append(element('h3', '', teamDisplayName(team)));
    if (teamDisplayName(team) !== team.name) details.append(element('small', 'team-identifier', team.name));
    details.append(element('p', '', final.winner === team.id ? 'Champion' : eliminated.has(team.id) ? 'Eliminated' : group ? `Group ${group.id}` : 'Knockout'));
    if (team.players && team.players.length > 2) details.append(element('p', 'players-list', team.players.map(player => player.name).join(' · ')));
    card.append(teamEmblem(team), details); document.getElementById('teams').append(card);
  });
}
if (typeof document !== 'undefined') {
  try { renderTournament(TOURNAMENT); }
  catch (error) {
    document.getElementById('status').textContent = 'Results unavailable';
    const alert = document.getElementById('error'); alert.hidden = false;
    alert.textContent = 'Tournament results could not be loaded. Please check back shortly.'; console.error(error);
  }
}
if (typeof module !== 'undefined') module.exports = { resolveTournament, teamDisplayName, teamDisplayLabel, bracketLayout, tournamentPodium, podiumRecord };
