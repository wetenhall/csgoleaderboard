function resolveTournament(data) {
  const teams = new Map(data.teams.map(team => [team.id, team]));
  const resolved = new Map();
  const groups = data.groups.map(group => ({ ...group, rows: group.teams.map(id => ({ id, played: 0, wins: 0, losses: 0, difference: 0 })) }));
  function resolve(match, ids) {
    const result = match.result;
    if (result && (!ids.every(id => teams.has(id)) || !Array.isArray(result.teams) || result.teams.length !== 2 || !result.teams.every((id, i) => id === ids[i]) || !Array.isArray(result.scores) || result.scores.length !== 2 || !result.scores.every(score => Number.isInteger(score) && score >= 0) || result.scores[0] === result.scores[1])) {
      throw new Error(`Check result for ${match.id}: participants or scores invalid.`);
    }
    const item = { ...match, ids, winner: result ? ids[result.scores[0] > result.scores[1] ? 0 : 1] : null };
    resolved.set(match.id, item);
    return item;
  }
  for (const match of data.matches.filter(match => match.group)) {
    const item = resolve(match, match.teams);
    const group = groups.find(group => group.id === match.group);
    if (item.winner) item.ids.forEach((id, i) => {
      const row = group.rows.find(row => row.id === id);
      row.played++;
      row.wins += Number(id === item.winner);
      row.losses += Number(id !== item.winner);
      row.difference += item.result.scores[i] - item.result.scores[1-i];
    });
  }
  for (const group of groups) {
    const order = group.tiebreakOrder;
    if (new Set(order).size !== order.length || order.some(id => !group.teams.includes(id))) throw new Error('Invalid tiebreak order');
    const tie = (a,b) => a.wins === b.wins && a.difference === b.difference;
    group.rows.sort((a,b) => b.wins-a.wins || b.difference-a.difference || ((order.includes(a.id) && order.includes(b.id)) ? order.indexOf(a.id)-order.indexOf(b.id) : group.teams.indexOf(a.id)-group.teams.indexOf(b.id)));
    group.complete = group.rows.every(row => row.played === 3);
    group.tied = group.complete && group.rows.slice(0,2).some(row => {
      const peers = group.rows.filter(other => tie(row,other));
      return peers.length > 1 && !peers.every(peer => order.includes(peer.id));
    });
    group.qualified = group.complete && !group.tied;
  }
  for (const match of data.matches.filter(match => !match.group)) {
    const ids = match.seeds ? match.seeds.map(([id,place]) => { const group = groups.find(group => group.id === id); return group.qualified ? group.rows[place].id : null; }) : match.from.map(id => resolved.get(id)?.winner ?? null);
    resolve(match, ids);
  }
  return { teams, groups, matches: [...resolved.values()] };
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderTournament(data) {
  const { teams, groups, matches } = resolveTournament(data);
  document.title = `${data.name} · Counter-Strike`;
  document.getElementById('title').replaceChildren(document.createTextNode(data.name), element('span', '', '.'));
  const completed = matches.filter(match => match.winner).length;
  document.getElementById('progress').replaceChildren(document.createTextNode(`${completed} / 15 `), element('small', '', 'matches complete'));
  document.getElementById('status').textContent = completed === 15 ? 'Tournament complete' : completed ? 'Tournament underway' : 'Awaiting first match';
  function matchCard(match) {
    const card = element('article', 'match');
    card.setAttribute('aria-label', `Match ${match.id.toUpperCase()}`);
    const meta = element('div', 'match-meta', match.id.toUpperCase());
    meta.append(element('span', match.winner ? 'finished' : '', match.winner ? 'FINAL SCORE' : match.ids.every(Boolean) ? 'UPCOMING' : 'TO BE DECIDED'));
    card.append(meta);
    match.ids.forEach((id, i) => {
      const team = teams.get(id);
      const placeholder = match.seeds ? `Group ${match.seeds[i][0]} · ${match.seeds[i][1] === 0 ? '1st' : '2nd'}` : `Winner of ${match.from?.[i].toUpperCase()}`;
      const row = element('div', `team-row${match.winner === id && id ? ' winner' : ''}${!team ? ' pending' : ''}`);
      row.append(element('span', 'team-tag', team?.tag ?? '—'), element('span', 'team-name', team?.name ?? placeholder), element('span', 'score', match.result ? String(match.result.scores[i]) : '—'));
      card.append(row);
    });
    return card;
  }
  for (const group of groups) {
    const section = element('section', 'group-panel');
    const heading = element('div', 'group-heading');
    heading.append(element('h3', '', `Group ${group.id}`), element('span', '', group.tied ? 'Tiebreak required' : group.qualified ? 'Standings confirmed' : 'Top 2 advance'));
    section.append(heading);
    const table = element('table');
    table.setAttribute('aria-label', `Group ${group.id} standings`);
    const head = element('thead'); const labels = element('tr');
    ['#','Team','P','W','L','RD'].forEach(label => { const cell = element('th','',label); cell.scope='col'; labels.append(cell); });
    head.append(labels); table.append(head);
    const body = element('tbody');
    group.rows.forEach((row,i) => {
      const tr = element('tr', group.qualified && i < 2 ? 'qualified' : '');
      [group.complete && !group.tied ? i+1 : '—', teams.get(row.id).name, row.played, row.wins, row.losses, row.difference > 0 ? `+${row.difference}` : row.difference].forEach(value => tr.append(element('td','',String(value))));
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
  ['Semi-finals', 'Grand final'].forEach((name, round) => {
    const column = element('div', `round round-${round}`);
    const heading = element('h3', 'round-heading', name);
    heading.append(element('span', '', `0${round+1}`));
    column.append(heading);
    const list = element('div', 'match-list');
    matches.filter(match => match.round === round).forEach(match => list.append(matchCard(match)));
    column.append(list); document.getElementById('bracket').append(column);
  });
  const final = matches.find(match => match.id === 'f1');
  if (final.winner) {
    document.getElementById('champion').textContent = teams.get(final.winner).name;
    document.getElementById('champion-note').textContent = 'Friends Cup champions';
  }
  const eliminated = new Set(matches.filter(match => !match.group && match.winner).flatMap(match => match.ids.filter(id => id !== match.winner)));
  groups.filter(group => group.qualified).forEach(group => group.rows.slice(2).forEach(row => eliminated.add(row.id)));
  data.teams.forEach(team => {
    const card = element('article', 'contender'); const details = element('div');
    const group = groups.find(group => group.teams.includes(team.id));
    details.append(element('h3', '', team.name), element('p', '', final.winner === team.id ? 'Champion' : eliminated.has(team.id) ? 'Eliminated' : `Group ${group.id}`));
    card.append(element('span', 'roster-tag', team.tag), details); document.getElementById('teams').append(card);
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
if (typeof module !== 'undefined') module.exports = { resolveTournament };
