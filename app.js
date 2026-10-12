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
function renderTournament(data) {
  const qualifiers = data.qualifiersPerGroup ?? 2;
  document.getElementById('qualification-label').textContent = `ROUND ROBIN / TOP ${qualifiers} ADVANCE`;
  const state = resolveTournament(data);
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
  document.getElementById('format-name').textContent = `${data.teamSize === 1 ? '1v1' : data.teamSize === 2 ? 'Duos' : data.teamSize === 5 ? 'Squads' : 'Teams'} · ${data.format==='double' ? 'Double elimination' : groups.length === 0 ? 'Knockout' : groups.length === 1 ? 'Group → final' : `${groups.length} groups → playoffs`}`;
  document.getElementById('groups-heading').closest('section').hidden = !groups.length;
  document.getElementById('roster-count').textContent = `${data.teams.length} TEAMS / 1 TROPHY`;
  document.getElementById('group-rules').textContent = 'Ranked by wins, then round difference (RD). Remaining ties need a tiebreak decision. Playoff places are confirmed when each team has played every other team in its group.';
  document.getElementById('schedule-rules').textContent = (data.format==='double' ? 'Lose once to enter the losers bracket; a second loss eliminates you. If the losers bracket winner wins the grand final, play the reset final.' : groups.length ? `Play group games in numbered order. Top ${qualifiers} from each group advance to the knockout stages.` : 'Straight knockout: winners advance. Teams with a first-round bye enter in the following round.') + ' Connect in Settings to enter or correct results in Fixtures.';
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
  const bracketRoot=document.getElementById('bracket');
  bracketRoot.classList.toggle('double-bracket',data.format==='double');
  const lanes={};
  if(data.format==='double')for(const [key,title] of [['upper','Winners bracket'],['lower','Losers bracket'],['final','Finals']]){const lane=element('section','bracket-lane');lane.append(element('h3','',title));const rounds=element('div','bracket-lane-rounds');lane.append(rounds);bracketRoot.append(lane);lanes[key]=rounds;}
  [...new Set(matches.filter(match => !match.group).map(match => match.round))].sort((a,b)=>a-b).forEach(round => {
    const name = knockoutRoundName({round},matches);
    const column = element('div', `round round-${round}`);
    const heading = element('h3', 'round-heading', name);
    heading.append(element('span', '', `0${round+1}`));
    column.append(heading);
    const list = element('div', 'match-list');
    matches.filter(match => match.round === round).forEach(match => list.append(matchCard(match)));
    column.append(list); (lanes[matches.find(m=>m.round===round)?.bracket] || bracketRoot).append(column);
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
if (typeof module !== 'undefined') module.exports = { resolveTournament, teamDisplayName, teamDisplayLabel };
