/* Tournament editing and GitHub persistence. Optional tab-session credentials. */
const MAP_POOLS = {
  2: ['Inferno','Nuke','Vertigo','Overpass','Poseidon','Debris','Eldorado'],
  5: ['Mirage','Dust2','Inferno','Nuke','Ancient','Anubis','Vertigo','Cache','Train','Overpass','Office','Italy']
};
function assignMaps(data, maps) {
  if (!Array.isArray(maps) || !maps.length || new Set(maps).size !== maps.length || maps.some(map => !MAP_POOLS[data.teamSize]?.includes(map))) throw Error('Select at least one available map for this tournament type.');
  data.mapPool = [...maps];
  let bag = [], previous;
  for (const match of orderedMatches(data.matches)) {
    if (!bag.length) {
      bag = shuffle(maps);
      if (bag.length > 1 && bag[0] === previous) [bag[0],bag[1]] = [bag[1],bag[0]];
    }
    match.map = bag.shift(); previous = match.map;
  }
  return data;
}
function randomIndex(length) {
  const range = 4294967296, limit = range - range % length;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % length;
}
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function makeTournament(players, size, template, groupOrder, groupCount = players.length / size < 6 ? 1 : 2, maps = MAP_POOLS[size]) {
  if (![2, 5].includes(size) || players.length < size * 2 || players.length % size || new Set(players.map(p => p.id)).size !== players.length) throw Error('Select enough unique players for at least two complete teams.');
  const data = structuredClone(template);
  data.teams = Array.from({ length: players.length / size }, (_, i) => ({ id: `t${i+1}`, name: `Team ${String(i+1).padStart(2,'0')}`, tag: String(i+1).padStart(2,'0'), players: players.slice(i*size,(i+1)*size) }));
  const ids = groupOrder || shuffle(data.teams.map(t => t.id));
  if (!Number.isInteger(groupCount) || groupCount < 0 || groupCount > 4 || ids.length < groupCount * 2) throw Error('Choose 0–4 groups, with at least two teams per group.');
  if (ids.length !== data.teams.length || new Set(ids).size !== ids.length || ids.some(id => !data.teams.some(t => t.id === id))) throw Error('Invalid team draw order.');
  let offset = 0;
  data.groups = Array.from({length:groupCount}, (_,i) => {
    const count = Math.floor(ids.length/groupCount) + Number(i < ids.length%groupCount);
    const teams = ids.slice(offset,offset+count); offset += count;
    return {id:String.fromCharCode(65+i),teams,tiebreakOrder:[]};
  });
  data.matches = data.groups.flatMap(group => roundRobinPairs(group.teams).map((teams,i) => ({ id: group.id.toLowerCase()+(i+1), group: group.id, teams, result: null })));
  if (data.groups.length === 1) data.matches.push({id:'f1',round:1,seeds:[['A',0],['A',1]],result:null});
  else if (data.groups.length === 2) data.matches.push({id:'s1',round:0,seeds:[['A',0],['B',1]],result:null},{id:'s2',round:0,seeds:[['B',0],['A',1]],result:null},{id:'f1',round:1,from:['s1','s2'],result:null});
  else {
    // Seed winners above runners-up. Empty seed slots advance as byes, not games.
    const entrants = groupCount ? [0,1].flatMap(place => data.groups.map(g => ({seed:[g.id,place]}))) : ids.map(team => ({team}));
    const capacity = 2 ** Math.ceil(Math.log2(entrants.length));
    let seeds = [1,2];
    while (seeds.length < capacity) seeds = seeds.flatMap(seed => [seed,seeds.length*2+1-seed]);
    let slots = seeds.map(seed => entrants[seed-1] || null), round = 0;
    while (slots.length > 1) {
      const next = [];
      for (let i=0;i<slots.length;i+=2) {
        const sources = slots.slice(i,i+2);
        if (sources.some(source => !source)) { next.push(sources.find(Boolean) || null); continue; }
        const id = slots.length === 2 ? 'f1' : `k${round+1}-${i/2+1}`;
        data.matches.push({id,round,sources,result:null}); next.push({winner:id});
      }
      slots = next; round++;
    }
  }
  data.teamSize = size;
  data.mode = size === 2 ? 'duos' : 'squads';
  return assignMaps(data,maps);
}
function roundRobinPairs(teams) {
  if (teams.length === 4) return [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]].map(pair => pair.map(i => teams[i]));
  const ring = [...teams]; if (ring.length % 2) ring.push(null);
  const pairs = [];
  for (let round = 0; round < ring.length - 1; round++) {
    for (let i = 0; i < ring.length / 2; i++) if (ring[i] && ring[ring.length-1-i]) pairs.push([ring[i],ring[ring.length-1-i]]);
    ring.splice(1,0,ring.pop());
  }
  return pairs;
}
function orderedMatches(matches) {
  const groups = [...new Set(matches.filter(m => m.group).map(m => m.group))].sort();
  const lists = groups.map(group => matches.filter(m => m.group === group));
  const order = [];
  for (let i = 0; i < Math.max(0,...lists.map(list => list.length)); i++) for (const list of lists) if (list[i]) order.push(list[i]);
  return order.concat(matches.filter(m => !m.group).sort((a,b) => a.round-b.round));
}
function playerTotals(data) {
  const totals = new Map(data.teams.flatMap(t => (t.players || []).map(p => [p.id,{...p,team:t.name,games:0,kills:0,deaths:0,assists:0}])));
  for (const match of data.matches) for (const [id, stats] of Object.entries(match.result?.players || {})) {
    const row = totals.get(id);
    if (row) { row.games++; for (const field of ['kills','deaths','assists']) row[field] += stats[field]; }
  }
  return [...totals.values()].sort((a,b) => b.kills-a.kills || a.deaths-b.deaths || a.name.localeCompare(b.name));
}
function tournamentAwards(data) {
  const totals=new Map(data.teams.map(team=>[team.id,{...team,games:0,wins:0,difference:0,streak:0}]));
  // Streaks follow fixture order, so correcting an older result recomputes them.
  for(const match of orderedMatches(data.matches)) {
    if(!match.result)continue;
    match.result.teams.forEach((id,i)=>{const row=totals.get(id);if(!row)return;
      const won=match.result.scores[i]>match.result.scores[1-i] || (match.result.scores[i]===match.result.scores[1-i] && match.result.tiebreakWinner===id);
      row.games++;row.wins+=Number(won);row.difference+=match.result.scores[i]-match.result.scores[1-i];row.streak=won?row.streak+1:0;
    });
  }
  const teams=[...totals.values()].filter(row=>row.games>=2),players=playerTotals(data).filter(row=>row.games>=2);
  function award(title,icon,rule,rows,rank,metric,empty='Awaiting more matches') {
    function compare(a,b){const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]>y[i]?-1:1;}return 0;}
    const sorted=[...rows].sort(compare),winners=sorted.length?sorted.filter(row=>compare(row,sorted[0])===0):[];
    return {title,icon,rule,winners,metric:winners.length?metric(winners[0]):empty};
  }
  const difference=row=>(row.difference>0?'+':'')+row.difference+' round difference';
  const winRate=row=>(100*row.wins/row.games).toFixed(0)+'% wins · '+difference(row);
  const kd=row=>row.deaths?row.kills/row.deaths:row.kills?Infinity:0;
  return {
    teams:[
      award('Top Dogs','🏆','Highest win rate, then round difference.',teams,r=>[r.wins/r.games,r.difference],winRate),
      award('On a Roll','🔥','Longest current winning streak in fixture order.',teams.filter(r=>r.streak>0),r=>[r.streak],r=>r.streak+' consecutive win'+(r.streak===1?'':'s'),teams.length?'No active winning streak':'Awaiting more matches'),
      award('Round Bullies','💥','Best rounds won minus rounds lost.',teams,r=>[r.difference],difference),
      award('Wooden Spoon','🥔','Lowest win rate, then worst round difference.',teams,r=>[-r.wins/r.games,-r.difference],winRate)
    ],
    players:[
      award('MVP','👑','Highest kills per recorded game, then K/D.',players,r=>[r.kills/r.games,kd(r)],r=>(r.kills/r.games).toFixed(1)+' kills/game · '+(kd(r)===Infinity?'∞':kd(r).toFixed(2))+' K/D'),
      award('Top Fragger','🎯','Most total recorded kills.',players,r=>[r.kills],r=>r.kills+' kills'),
      award('Wingman','🤝','Most assists per recorded game.',players,r=>[r.assists/r.games],r=>(r.assists/r.games).toFixed(1)+' assists/game'),
      award('Respawn Regular','💀','Most deaths per recorded game.',players,r=>[r.deaths/r.games],r=>(r.deaths/r.games).toFixed(1)+' deaths/game')
    ]
  };
}
function updateHeaders(data, brand, banner) {
  if(typeof brand!=='string' || !brand.trim() || brand.trim().length>80 || typeof banner!=='string' || !banner.trim() || banner.trim().length>120) throw Error('Enter both headings: top header up to 80 characters and banner up to 120.');
  return {...data,headers:{brand:brand.trim(),banner:banner.trim()}};
}
function validateData(data, resolve) {
  if (!data || typeof data.name !== 'string' || data.name.length > 100 || !Array.isArray(data.teams) || !Array.isArray(data.groups) || data.groups.length > 4 || !Array.isArray(data.matches)) throw Error('Invalid tournament structure.');
  if (data.headers !== undefined) updateHeaders(data,data.headers?.brand,data.headers?.banner);
  if (!data.teams.length && !data.groups.length && !data.matches.length && data.mapPool === undefined) return data;
  if (data.teams.length < 2) throw Error('Invalid tournament structure.');
  const teamIds = data.teams.map(t => t.id);
  if (data.mapPool !== undefined && (!Array.isArray(data.mapPool) || !data.mapPool.length || new Set(data.mapPool).size !== data.mapPool.length || data.mapPool.some(map => !MAP_POOLS[data.teamSize]?.includes(map)) || data.matches.some(match => !data.mapPool.includes(match.map)))) throw Error('Fixtures must use maps from the selected tournament map pool.');
  if (data.mapPool === undefined && data.matches.some(match => match.map !== undefined)) throw Error('A selected map pool is required for fixture maps.');
  if (new Set(teamIds).size !== teamIds.length || data.teams.some(t => typeof t.name !== 'string' || !t.name.trim() || t.name.length > 60)) throw Error('Invalid team names or IDs.');
  const assigned = data.groups.flatMap(g => g.teams);
  if (data.groups.length && (assigned.length !== teamIds.length || new Set(assigned).size !== teamIds.length || assigned.some(id => !teamIds.includes(id)) || data.groups.some(g => g.teams.length < 2))) throw Error('Each team must belong to one group.');
  if (new Set(data.matches.map(m => m.id)).size !== data.matches.length) throw Error('Duplicate match IDs.');
  for (const group of data.groups) {
    const games = data.matches.filter(m => m.group === group.id);
    const pairs = games.map(m => [...m.teams].sort().join('|'));
    if (games.length !== group.teams.length*(group.teams.length-1)/2 || new Set(pairs).size !== pairs.length || games.some(m => m.teams.length !== 2 || m.teams[0] === m.teams[1] || m.teams.some(id => !group.teams.includes(id)))) throw Error('Invalid round-robin schedule.');
  }
  const players = data.teams.flatMap(t => t.players || []);
  if (players.length && (![2,5].includes(data.teamSize) || data.teams.some(t => t.players?.length !== data.teamSize) || new Set(players.map(p => p.id)).size !== players.length || players.some(p => typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40))) throw Error('Invalid player rosters.');
  const state = resolve(data);
  if (orderedMatches(state.matches).some(m => !m)) throw Error('Missing scheduled match.');
  for (const match of state.matches) {
    const eligible = data.teams.filter(t => match.ids.includes(t.id)).flatMap(t => (t.players || []).map(p => p.id));
    for (const [id, stats] of Object.entries(match.result?.players || {})) {
      if (!eligible.includes(id) || ['kills','deaths','assists'].some(f => !Number.isSafeInteger(stats[f]) || stats[f] < 0 || stats[f] > 999)) throw Error('Player stats must belong to this match and be whole numbers from 0 to 999.');
    }
  }
  return data;
}
function applyResult(data, id, result, resolve) {
  const next = structuredClone(data);
  next.matches.find(m => m.id === id).result = result;
  // Recompute later participants. Keep valid results; clear only stale descendants.
  const oldPlayoffs = next.matches.filter(m => !m.group).map(m => [m.id,m.result]);
  next.matches.filter(m => !m.group).forEach(m => { m.result = null; });
  const cleared = [];
  for (const [matchId, old] of oldPlayoffs) {
    if (!old) continue;
    const ids = resolve(next).matches.find(m => m.id === matchId).ids;
    if (old.teams.every((team,i) => team === ids[i])) next.matches.find(m => m.id === matchId).result = old;
    else cleared.push(matchId);
  }
  validateData(next, resolve);
  return { next, cleared };
}
function emptyTournament(data) { return {name:data.name,teams:[],groups:[],matches:[],...(data.headers?{headers:structuredClone(data.headers)}:{})}; }
if (typeof module !== 'undefined') module.exports = { makeTournament, orderedMatches, playerTotals, validateData, applyResult, MAP_POOLS, assignMaps, emptyTournament, tournamentAwards, updateHeaders };
if (typeof document !== 'undefined') (() => {
  const $ = id => document.getElementById(id);
  const api = 'https://api.github.com/repos/wetenhall/csgoleaderboard/contents/tournament.json';
  let current = structuredClone(TOURNAMENT), token = '', fileSha = '', busy = false;
  let pool = [], remaining = [], selected = [], draw = null, spinning = false, locked = false, drawOrder = [];
  const tokenStorageKey = 'friends-cup.organiser-token';
  function storeToken(value) {
    try {
      if (value) sessionStorage.setItem(tokenStorageKey,value);
      else sessionStorage.removeItem(tokenStorageKey);
      return true;
    } catch { return false; }
  }
  const say = text => { $('connection-status').textContent = text; };
  const announce = text => { $('draw-announcement').textContent = text; };
  function controls() {
    $('tab-options').hidden = !token;
    $('save-options').disabled = busy || !token;
    if (!token && $('tab-options').getAttribute('aria-selected') === 'true') selectTab($('tab-setup'));
    $('tab-team-setup').hidden = !token;
    if (!token && $('tab-team-setup').getAttribute('aria-selected') === 'true') selectTab($('tab-setup'));
    $('connected-setup').hidden = !token;
    $('team-setup-locked').hidden = !!token;
    $('group-count').disabled = busy || spinning;
    $('map-options').querySelectorAll('input').forEach(input=>{input.disabled=busy || spinning;});
    $('disconnect').hidden = !token;
    $('connect-form').querySelector('button').disabled = busy || !!token;
    $('refresh-data').disabled = busy;
    $('clear-tournament').disabled = busy || spinning || !token;
    $('spin').disabled = busy || spinning || !remaining.length;
    $('disconnect').disabled = busy;
    $('remember-token').disabled = busy;
    $('publish-draw').disabled = busy || !draw || !token || draw.groups.length !== Number($('group-count').value) || !selectedMaps().length;
    document.querySelectorAll('.result-form button, .tie-form button').forEach(b => { b.disabled = busy || !token; });
  }
  async function request(method, body, credential = token) {
    const response = await fetch(api + (method === 'GET' ? '?ref=main' : ''), { method, cache:'no-store', headers: {Accept:'application/vnd.github+json',Authorization:`Bearer ${credential}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}, ...(body ? {body:JSON.stringify(body)} : {}) });
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) throw Error('The repository changed. Reload the latest saved tournament before editing again; your current inputs have not been published.');
      if ([401,403,404].includes(response.status)) throw Error('GitHub denied access. Check token expiry, repository access and Contents: Read and write permission.');
      throw Error(`GitHub could not save or load this tournament (${response.status}). Try again.`);
    }
    return response.json();
  }
  const decode = content => new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0)));
  const encode = data => btoa(Array.from(new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'),b=>String.fromCharCode(b)).join(''));
  async function publish(next, message) {
    if (!token || busy) throw Error('Connect as organiser before publishing.');
    validateData(next, resolveTournament);
    busy = true; controls(); say('Saving to GitHub…');
    try {
      const saved = await request('PUT',{message,content:encode(next),sha:fileSha,branch:'main'});
      fileSha = saved.content.sha; current = next; renderAll();
      document.querySelector('main').classList.remove('result-saved');void document.querySelector('main').offsetWidth;document.querySelector('main').classList.add('result-saved');
      say('Saved to GitHub. Your stats are updated here; the public site updates after deployment, usually within a minute.');
    } catch(error) { say(error.message); throw error; }
    finally { busy = false; controls(); }
  }
  async function connect(candidate) {
    busy = true; controls(); say('Connecting organiser…');
    try {
      const file = await request('GET',null,candidate);
      const data = validateData(JSON.parse(decode(file.content)),resolveTournament);
      token = candidate; fileSha = file.sha; current = data;
      const remembered = storeToken($('remember-token').checked ? token : '');
      renderAll();
      say(remembered ? 'Organiser connected. Latest repository data loaded.' : 'Organiser connected. Tab storage is unavailable; enter your token again after refreshing.');
    } catch(error) { token = ''; fileSha = ''; storeToken(''); say(error.message); }
    finally { busy = false; controls(); }
  }
  $('connect-form').addEventListener('submit',async event => {
    event.preventDefault(); if (busy || token) return;
    const candidate = $('github-token').value.trim(); $('github-token').value = '';
    if (candidate) await connect(candidate);
  });
  $('remember-token').onchange = () => {
    const saved = storeToken($('remember-token').checked ? token : '');
    if (!saved) say('Tab storage is unavailable; enter your token again after refreshing.');
  };
  $('disconnect').onclick = () => { token = ''; fileSha = ''; storeToken(''); controls(); say('Disconnected. The remembered token has been cleared.'); };
  $('refresh-data').onclick = async () => {
    if (busy || !confirm('Reload saved data? Any unsaved score entries will be discarded. The wheel draw is kept.')) return;
    busy = true; controls();
    try {
      if (token) { const file = await request('GET'); current = validateData(JSON.parse(decode(file.content)),resolveTournament); fileSha = file.sha; }
      else { const response = await fetch(`tournament.json?v=${Date.now()}`,{cache:'no-store'}); if (!response.ok) throw Error('Could not reload the tournament.'); current = validateData(await response.json(),resolveTournament); }
      renderAll(); say(token ? 'Latest repository data loaded.' : 'Latest deployed tournament loaded.');
    } catch(error) { say(error.message); } finally { busy = false; controls(); }
  };
  function renderAll() {
    renderTournament(current); renderAwards(); renderSchedule(); renderStats(); renderTies(); controls();
    $('option-brand').value=current.headers?.brand || current.name;
    $('option-banner').value=current.headers?.banner || current.name;
  }
  $('options-form').onsubmit=async event=>{
    event.preventDefault();if(busy || !token)return;
    try {
      const next=updateHeaders(current,$('option-brand').value,$('option-banner').value);
      await publish(next,'Update page header text');
      if(draw)draw.headers=structuredClone(current.headers);
      say('Headers saved to GitHub. The public page updates after deployment.');
    } catch(error){say(error.message);}
  };
  $('clear-tournament').onclick = async () => {
    if (busy || spinning || !token) return;
    if (!confirm('Clear the published tournament for everyone? This removes all teams, groups, fixtures, results, player stats and map assignments, and discards this tab’s unfinished draw. Your organiser connection will stay active.')) return;
    try {
      await publish(emptyTournament(current),'Clear tournament ready for a new draw');
      pool=[];remaining=[];selected=[];draw=null;drawOrder=[];lock(false);
      $('pool-input').value='';$('pool-list').replaceChildren();$('draw-teams').replaceChildren();$('draw-fixtures').replaceChildren();
      $('group-count').value='1';renderMapOptions();
      $('format-preview').textContent='Choose the format before publishing. Each group needs at least two teams.';
      $('wheel').style.transition='none';$('wheel').style.transform='none';paintWheel([]);resetReveal();selectionCount();controls();
      announce('Tournament cleared. Load players to start a new draw.');
      say('Tournament cleared and saved to GitHub. The public page updates after deployment. Your organiser connection is still active.');
    } catch(error) { say(error.message); }
  };
  function numeric(label, value, max=999) {
    const wrap = element('label','',label); const input = element('input');
    input.type='number'; input.min='0'; input.max=String(max); input.step='1'; input.value=value ?? ''; input.inputMode='numeric'; wrap.append(input); return {wrap,input};
  }
  function renderSchedule() {
    $('schedule').replaceChildren(); const state = resolveTournament(current);
    if (!state.matches.length) { $('schedule').append(element('p','rules','No fixtures yet. Create and publish a tournament in Team setup.')); return; }
    const matches = orderedMatches(state.matches); let markedNext = false;
    const sections = {};
    for (const [key, title] of [['upcoming','Upcoming games'],['played','Played games']]) {
      const section = element('section','fixture-section');
      const heading = element('h3','fixture-heading'); heading.id = 'fixtures-' + key;
      section.setAttribute('aria-labelledby',heading.id);
      const count = matches.filter(match => Boolean(match.result) === (key === 'played')).length;
      heading.textContent = title + ' · ' + count; section.append(heading);
      if (!count) section.append(element('p','rules',key === 'played' ? 'No games played yet. Completed results will appear here.' : 'All games complete.'));
      sections[key] = section; $('schedule').append(section);
    }
    matches.forEach((match,index) => {
      const container = sections[match.result ? 'played' : 'upcoming'];
      const details = element('details','scheduled-match');
      const ready = match.ids.every(Boolean); const next = !markedNext && !match.result && ready;
      if (next) { markedNext = true; details.classList.add('next-match'); }
      const names = match.ids.map((id,i) => state.teams.has(id) ? teamDisplayLabel(state.teams.get(id)) : matchPlaceholder(match,i));
      const summary=element('summary','fixture-summary');
      const meta=element('span','fixture-topline');
      meta.append(element('span','fixture-number','MATCH '+String(index+1).padStart(2,'0')),element('span','fixture-map',match.map || 'Map not assigned'),element('span','fixture-status',match.result?'PLAYED':next?'UP NEXT':ready?'SCHEDULED':'AWAITING TEAMS'));
      const versus=element('span','fixture-versus');
      match.ids.forEach((id,i)=>{
        if(i===1)versus.append(element('span','fixture-score',match.result?match.result.scores.join(' : '):'VS'));
        const identity=element('span','fixture-side'),team=state.teams.get(id);
        if(team)identity.append(teamEmblem(team));
        identity.append(element('span','fixture-team',names[i]));versus.append(identity);
      });
      summary.append(meta,versus);
      if(match.result?.tiebreakWinner)summary.append(element('span','fixture-decision','Tiebreak winner: '+teamDisplayLabel(state.teams.get(match.result.tiebreakWinner))));
      else if(match.result && match.result.scores[0]===match.result.scores[1])summary.append(element('span','fixture-decision','DRAW'));
      details.append(summary);
      const body = element('div','result-body');
      body.append(element('p','rules',`${match.id.toUpperCase()} · ${match.group ? `Group ${match.group}` : knockoutRoundName(match,state.matches)}`));
      if (!ready) { body.append(element('p','','Teams will appear once qualification is confirmed.')); details.append(body); container.append(details); return; }
      const form = element('form','result-form'); const scores = names.map((name,i) => numeric(`${name} rounds`,match.result?.scores[i],99));
      const scoreRow = element('div','score-inputs'); scores.forEach(s => {s.input.required=true;scoreRow.append(s.wrap);}); form.append(scoreRow);
      form.append(element('p','rules','Player stats are optional. Leave all three fields blank if not recorded; enter all three to include that player in averages.'));
      let tiebreakSelect;
      if (!match.group) {
        const label=element('label','','Tiebreak winner (required only when rounds are equal)');
        tiebreakSelect=element('select');const placeholder=element('option','','Select winner');placeholder.value='';tiebreakSelect.append(placeholder);
        match.ids.forEach((id,i)=>{const option=element('option','',names[i]);option.value=id;tiebreakSelect.append(option);});
        tiebreakSelect.value=match.result?.tiebreakWinner || '';label.append(tiebreakSelect);form.append(label);
      }
      const inputs = [];
      for (const teamId of match.ids) {
        const team = state.teams.get(teamId);
        for (const player of team.players || []) {
          const row = element('div','player-entry'); row.append(element('strong','',`${player.name} · ${team.name}`));
          const fields = ['kills','deaths','assists'].map(key => numeric(key,match.result?.players?.[player.id]?.[key])); fields.forEach(field => row.append(field.wrap));
          form.append(row); inputs.push({id:player.id,fields});
        }
      }
      const note = element('p','form-note'); note.setAttribute('role','status');
      const update = element('button','', 'Update & publish result'); update.type='submit';
      form.append(update,note);
      form.onsubmit = async event => {
        event.preventDefault(); if (!token || busy) return;
        try {
          const players = {};
          for (const {id,fields} of inputs) {
            const values = fields.map(f=>f.input.value);
            if (values.every(v=>v==='')) continue;
            if (values.some(v=>v==='')) throw Error('Enter kills, deaths and assists together, or leave all three blank.');
            players[id] = Object.fromEntries(['kills','deaths','assists'].map((key,i)=>[key,Number(values[i])]));
          }
          const result = {teams:match.ids,scores:scores.map(s=>Number(s.input.value)),players};
          if (!match.group && result.scores[0]===result.scores[1]) {
            if (!tiebreakSelect.value) throw Error('Select the tiebreak winner so a team can advance.');
            result.tiebreakWinner=tiebreakSelect.value;
          }
          const {next,cleared} = applyResult(current,match.id,result,resolveTournament);
          if (cleared.length && !confirm(`This changes playoff participants and clears results and player stats for ${cleared.join(', ')}. Publish this correction?`)) return;
          await publish(next,`Update ${match.id.toUpperCase()} result and player stats`);
        } catch(error) {note.textContent=error.message;}
      };
      body.append(form); details.append(body); container.append(details);
    });
  }
  function renderAwards() {
    const awards=tournamentAwards(current);
    for(const type of ['teams','players']) {
      const container=$(type==='teams'?'team-awards':'player-awards');container.replaceChildren();
      for(const award of awards[type]) {
        const card=element('article','award-card'+(!award.winners.length?' award-pending':''));
        const heading=element('h3','award-title');const icon=element('span','award-icon',({'Top Dogs':'01','On a Roll':'↑','Round Bullies':'+','Wooden Spoon':'↓','MVP':'★','Top Fragger':'⌖','Wingman':'Ⅱ','Respawn Regular':'↺'})[award.title]);icon.setAttribute('aria-hidden','true');heading.append(icon,document.createTextNode(award.title));card.append(heading);
        card.append(element('p','award-winner',award.winners.length?award.winners.map(row=>type==='teams'?teamDisplayLabel(row):row.name+' ('+row.team+')').join(' / '):'Still up for grabs'));
        card.append(element('p','award-metric',(award.winners.length>1?'Joint award · ':'')+award.metric),element('p','award-rule',award.rule));container.append(card);
      }
    }
  }
  function renderStats() {
    $('player-stats').replaceChildren(); const rows = playerTotals(current);
    if (!rows.length) { $('player-stats').append(element('p','rules','Draw and publish your teams to start tracking player stats.')); return; }
    const table = element('table'); const head = element('thead'); const header = element('tr');
    ['Player','Team','Recorded games','Kills','Deaths','Assists','K/D','Kills / game'].forEach(label=>{const th=element('th','',label);th.scope='col';header.append(th);});head.append(header);table.append(head);
    const body=element('tbody'); rows.forEach(row=>{const tr=element('tr');[row.name,row.team,row.games,row.kills,row.deaths,row.assists,row.games ? (row.deaths ? (row.kills/row.deaths).toFixed(2) : row.kills ? '∞' : '—') : '—',row.games ? (row.kills/row.games).toFixed(1) : '—'].forEach(value=>tr.append(element('td','',String(value))));body.append(tr);});table.append(body);$('player-stats').append(table);
  }
  function renderTies() {
    $('tie-controls').replaceChildren(); const state=resolveTournament(current);
    for(const group of state.groups.filter(g=>g.tied)) {
      const form=element('form','tie-form');form.append(element('p','',`Group ${group.id}: qualification is tied. Record the finishing order after your tiebreak. This only breaks equal wins and round difference.`));
      const fields=group.rows.map(row=>{const field=numeric(state.teams.get(row.id).name,'',group.rows.length);field.input.min='1';field.input.required=true;form.append(field.wrap);return {id:row.id,input:field.input};});
      const button=element('button','','Publish tiebreak order');const note=element('p');form.append(button,note);form.onsubmit=async e=>{e.preventDefault();try{const ranks=fields.map(f=>Number(f.input.value));if(new Set(ranks).size!==group.rows.length)throw Error(`Use each position from 1 to ${group.rows.length} once.`);const next=structuredClone(current);next.groups.find(g=>g.id===group.id).tiebreakOrder=fields.sort((a,b)=>Number(a.input.value)-Number(b.input.value)).map(f=>f.id);await publish(next,`Resolve Group ${group.id} tiebreak`);}catch(error){note.textContent=error.message;}};$('tie-controls').append(form);
    }
  }
  function selectionCount() { const count=$('pool-list').querySelectorAll('input:checked').length;const size=Number($('team-size').value),teams=Math.floor(count/size),extra=count%size; $('pool-count').textContent=`${count} selected · ${teams} complete ${size===2?'duo':'squad'} teams`+(extra ? ` · Select ${size-extra} more or deselect ${extra} to make full teams.` : teams<2 ? ' · At least 2 teams needed.' : ' · Choose your group count before publishing.');$('start-draw').disabled=locked || teams<2 || extra!==0; }
  function selectedMaps() { return [...$('map-options').querySelectorAll('input:checked')].map(input=>input.value); }
  function renderMapOptions() {
    $('map-options').replaceChildren();
    for (const map of MAP_POOLS[Number($('team-size').value)]) {
      const label=element('label'),input=element('input'); input.type='checkbox'; input.value=map; input.checked=true;
      input.onchange=()=>{updateMapCount();configureDraw();controls();}; label.append(input,document.createTextNode(map)); $('map-options').append(label);
    }
    updateMapCount();
  }
  function updateMapCount() { const count=selectedMaps().length; $('map-count').textContent=count ? count+' maps selected' : 'Select at least one map before publishing.'; }
  $('team-size').onchange=()=>{selectionCount();renderMapOptions();};
  $('load-pool').onclick=()=>{
    if(locked || busy)return;
    const names=$('pool-input').value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
    if(!names.length || names.some(n=>n.length>40) || new Set(names.map(n=>n.toLowerCase())).size!==names.length){announce('Use distinct names, one per line, up to 40 characters each.');return;}
    pool=names.map((name,i)=>({id:`p${i+1}`,name}));$('pool-list').replaceChildren();
    pool.forEach(p=>{const label=element('label');const box=element('input');box.type='checkbox';box.value=p.id;box.checked=true;box.onchange=selectionCount;label.append(box,document.createTextNode(p.name));$('pool-list').append(label);});selectionCount();announce('Select your players, then lock the pool.');
  };
  const teamColours=['#ffad32','#79b9df','#b6a0ee','#73d1a9','#f18e97','#e1cf80'];
  let soundEnabled=true,audioContext=null;
  function initials(name) { return name.trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase(); }
  function playTone(frequency,duration=0.035) {
    if(!soundEnabled || !audioContext || audioContext.state!=='running')return;
    try { const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
      oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0.045,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audioContext.currentTime+duration);
      oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+duration);
    } catch { /* Sound is optional. */ }
  }
  async function prepareSound(){
    try { if(soundEnabled){const Audio=window.AudioContext || window.webkitAudioContext;if(!Audio)throw Error();audioContext ||= new Audio();await audioContext.resume();} }
    catch {soundEnabled=false;}
    $('sound-toggle').setAttribute('aria-pressed',String(soundEnabled));$('sound-toggle').textContent=soundEnabled?'Sound on · Mute':'Sound off';
  }
  $('sound-toggle').onclick=async()=>{
    soundEnabled=!soundEnabled;await prepareSound();
    if(soundEnabled)playTone(660,0.1);
  };
  function paintWheel(names,angle=0,highlight=-1) {
    const ctx=$('wheel').getContext('2d'),n=names.length;ctx.clearRect(0,0,640,640);
    ctx.save();ctx.translate(320,320);ctx.rotate(angle*Math.PI/180);
    if(!n){ctx.fillStyle='#222c35';ctx.beginPath();ctx.arc(0,0,302,0,2*Math.PI);ctx.fill();}
    names.forEach((p,i)=>{
      const start=-Math.PI/2+i*2*Math.PI/n,active=i===highlight;
      ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,302,start,start+2*Math.PI/n);ctx.closePath();
      ctx.fillStyle=active?'#ffe4ad':teamColours[i%teamColours.length];ctx.globalAlpha=active?1:0.78;ctx.fill();ctx.globalAlpha=1;
      ctx.strokeStyle=active?'#fff5df':'#101316';ctx.lineWidth=active?5:2;ctx.stroke();
      ctx.save();ctx.rotate(start+Math.PI/n);ctx.fillStyle='#101820';ctx.font='bold '+(n>24?12:18)+'px Arial';ctx.textAlign='right';
      ctx.fillText(p.name.length>19?p.name.slice(0,18)+'…':p.name,278,6);
      if(n<=18){ctx.beginPath();ctx.arc(112,0,19,0,2*Math.PI);ctx.fillStyle='#111c29';ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillText(initials(p.name),112,4);}
      ctx.restore();
    });ctx.restore();
    ctx.beginPath();ctx.arc(320,320,302,0,2*Math.PI);ctx.strokeStyle='#ffad32';ctx.lineWidth=5;ctx.stroke();
    ctx.beginPath();ctx.arc(320,320,64,0,2*Math.PI);ctx.fillStyle='#10161c';ctx.fill();ctx.strokeStyle='#65717b';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#ffad32';ctx.textAlign='center';ctx.font='bold 19px Arial';ctx.fillText(n?'DRAFT':'PLAYER',320,316);ctx.font='12px Consolas';ctx.fillText(n?n+' LEFT':'DRAW',320,338);
  }
  function resetReveal(){ $('reveal-avatar').textContent='?';$('reveal-label').textContent='NEXT RECRUIT';$('reveal-name').textContent='Who’s joining your team?';$('player-reveal').classList.remove('revealed');$('draw-progress').value=0;$('draw-progress-label').textContent='Load players to start'; }
  function showDrawTeams(latestId=null) {
    $('draw-teams').replaceChildren();const size=Number($('team-size').value),total=selected.length+remaining.length;
    $('draw-progress').max=Math.max(1,total);$('draw-progress').value=selected.length;
    $('draw-progress-label').textContent=total?selected.length+' of '+total+' players selected · '+(remaining.length?'Filling Team '+String(Math.floor(selected.length/size)+1).padStart(2,'0'):'All teams complete'):'Load players to start';
    for(let i=0;i<total/size;i++){
      const members=selected.slice(i*size,(i+1)*size),complete=members.length===size,latest=members.some(p=>p.id===latestId);
      const card=element('div','draw-team'+(complete?' team-complete':'')+(latest&&complete?' team-flash':''));card.style.setProperty('--team-colour',teamColours[i%teamColours.length]);
      const label=element('label','', 'Team '+String(i+1).padStart(2,'0')),name=element('input');name.value=draw?.teams[i].name || 'Team '+String(i+1).padStart(2,'0');name.maxLength=60;name.disabled=!draw;name.oninput=()=>{draw.teams[i].name=name.value.trim();};label.append(name);card.append(label);
      for(let j=0;j<size;j++) {const player=members[j],slot=element('div','draft-slot'+(player?' filled':'')+(player?.id===latestId?' player-arrives':''));slot.append(element('span','slot-avatar',player?initials(player.name):String(j+1)),element('span','',player?player.name:'Awaiting player'));card.append(slot);}
      card.append(element('p','team-state',complete?'TEAM COMPLETE':members.length+' / '+size+' PLAYERS'));
      if(draw)card.append(element('p','accent',draw.groups.length?'Group '+draw.groups.find(g=>g.teams.includes(draw.teams[i].id)).id:'Knockout'));
      $('draw-teams').append(card);
    }
  }
  function lock(value){locked=value;['team-size','pool-input','load-pool','start-draw'].forEach(id=>{$(id).disabled=value;});$('pool-list').querySelectorAll('input').forEach(i=>{i.disabled=value;});}
  $('start-draw').onclick=()=>{if(busy)return;const ids=[...$('pool-list').querySelectorAll('input:checked')].map(i=>i.value);const size=Number($('team-size').value);if(ids.length<size*2 || ids.length%size)return;remaining=pool.filter(p=>ids.includes(p.id));selected=[];draw=null;lock(true);resetReveal();showDrawTeams();paintWheel(remaining);$('spin').disabled=false;announce('Drawing Team 01. Spin to select its first player.');};
  $('spin').onclick=async()=>{
    if(busy || spinning || !remaining.length)return;
    spinning=true;controls();$('reset-draw').disabled=true;
    await prepareSound();$('player-reveal').classList.remove('revealed');
    $('reveal-name').textContent='Selecting a player…';$('reveal-label').textContent='DRAFT IN PROGRESS';$('reveal-avatar').textContent='?';
    const index=randomIndex(remaining.length),picked=remaining[index],names=[...remaining];
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:4400;
    const target=2160+360-(index+.5)*360/names.length;
    let previous=-1,lastTick=0;
    try {
      if(duration)await new Promise(resolve=>{
        const start=performance.now();
        function frame(now){const fraction=Math.min(1,(now-start)/duration),angle=target*(1-Math.pow(1-fraction,4));
          const active=Math.floor(((360-angle%360)%360)/360*names.length)%names.length;
          paintWheel(names,angle,active);
          if(active!==previous && now-lastTick>65){playTone(850,0.025);lastTick=now;}previous=active;
          if(fraction<1)requestAnimationFrame(frame);else resolve();
        }requestAnimationFrame(frame);
      });
      paintWheel(names,target,index);
      remaining.splice(index,1);selected.push(picked);const size=Number($('team-size').value),team=Math.ceil(selected.length/size);
      $('reveal-avatar').textContent=initials(picked.name);$('reveal-name').textContent=picked.name;$('reveal-label').textContent='JOINING TEAM '+String(team).padStart(2,'0');$('player-reveal').classList.add('revealed');
      playTone(selected.length%size===0?1046:784,0.24);
      announce(picked.name+' joins Team '+String(team).padStart(2,'0')+'. '+(selected.length%size===0?'Team complete! ':'')+remaining.length+' players remaining.');
      if(!remaining.length){draw=makeTournament(selected,size,current);drawOrder=draw.groups.flatMap(g=>g.teams);configureDraw();announce('Draw complete. Review team names and tournament format, then publish.');}
      showDrawTeams(picked.id);
    } finally {spinning=false;$('reset-draw').disabled=false;controls();}
  };
  function configureDraw() {
    if (!draw) return;
    try {
      const order = drawOrder;
      const next = makeTournament(selected,draw.teamSize,current,order,Number($('group-count').value),selectedMaps());
      next.teams.forEach((team,i)=>{team.name=draw.teams[i].name;}); draw=next;
      $('format-preview').textContent = draw.groups.length ? draw.groups.map(g=>'Group '+g.id+': '+g.teams.length+' teams').join(' · ') + ' · Top 2 advance from each group.' + (draw.groups.length === 3 ? ' Group A and B winners receive playoff byes.' : '') : 'Straight knockout · '+draw.matches.length+' game'+(draw.matches.length === 1 ? '' : 's')+' · Byes advance automatically.';
      showDrawTeams();
      $('draw-fixtures').replaceChildren(element('h3','fixture-heading','Fixture map preview'));
      const list=element('ol','map-preview');
      orderedMatches(draw.matches).forEach(match=>list.append(element('li','',match.id.toUpperCase()+' · '+match.map)));
      $('draw-fixtures').append(list);
    } catch(error) { $('format-preview').textContent = error.message; $('draw-fixtures').replaceChildren(); }
    controls();
  }
  $('group-count').onchange = configureDraw;
  $('reset-draw').onclick=()=>{if(spinning || busy)return;if(selected.length && !confirm('Discard this unpublished draw?'))return;selected=[];remaining=[];draw=null;lock(false);$('spin').disabled=true;$('draw-teams').replaceChildren();$('draw-fixtures').replaceChildren();$('wheel').style.transition='none';$('wheel').style.transform='none';paintWheel([]);selectionCount();controls();announce('Select your players to start a new draw.');};
  $('publish-draw').onclick=async()=>{if(!draw || !token || busy || draw.groups.length !== Number($('group-count').value) || !selectedMaps().length)return;if(!confirm(`Publish these ${draw.teams.length} ${draw.teamSize===2?'duo':'squad'} teams and replace the current tournament, including all existing results and player stats?`))return;try{await publish(structuredClone(draw),'Publish new player draw and tournament groups');draw=null;selected=[];$('draw-teams').querySelectorAll('input').forEach(input=>{input.disabled=true;});controls();announce('Teams and groups saved. Open Fixtures to run the tournament.');}catch(error){announce(error.message);}};
  window.addEventListener('beforeunload',event=>{if(busy || (selected.length && draw!==null) || (locked && remaining.length)){event.preventDefault();event.returnValue='';}});
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab, focus = false) {
    tabs.forEach(item => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
      $(item.getAttribute('aria-controls')).hidden = !active;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const visibleTabs = tabs.filter(item => !item.hidden), index = visibleTabs.indexOf(tab);
      const target = event.key === 'ArrowRight' ? (index+1)%visibleTabs.length : event.key === 'ArrowLeft' ? (index+visibleTabs.length-1)%visibleTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length-1 : null;
      if (target !== null) { event.preventDefault(); selectTab(visibleTabs[target],true); }
    });
  });
  renderMapOptions();paintWheel([]);renderAll();
  let rememberedToken = '';
  try { rememberedToken = sessionStorage.getItem(tokenStorageKey) || ''; } catch { /* Storage may be disabled by browser settings. */ }
  if (rememberedToken) { $('remember-token').checked = true; void connect(rememberedToken); }
})();
