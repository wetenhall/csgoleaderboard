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
function validateData(data, resolve) {
  if (!data || typeof data.name !== 'string' || data.name.length > 100 || !Array.isArray(data.teams) || !Array.isArray(data.groups) || data.groups.length > 4 || !Array.isArray(data.matches)) throw Error('Invalid tournament structure.');
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
function emptyTournament(data) { return {name:data.name,teams:[],groups:[],matches:[]}; }
if (typeof module !== 'undefined') module.exports = { makeTournament, orderedMatches, playerTotals, validateData, applyResult, MAP_POOLS, assignMaps, emptyTournament };
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
    renderTournament(current); renderSchedule(); renderStats(); renderTies(); controls();
  }
  $('clear-tournament').onclick = async () => {
    if (busy || spinning || !token) return;
    if (!confirm('Clear the published tournament for everyone? This removes all teams, groups, fixtures, results, player stats and map assignments, and discards this tab’s unfinished draw. Your organiser connection will stay active.')) return;
    try {
      await publish(emptyTournament(current),'Clear tournament ready for a new draw');
      pool=[];remaining=[];selected=[];draw=null;drawOrder=[];lock(false);
      $('pool-input').value='';$('pool-list').replaceChildren();$('draw-teams').replaceChildren();$('draw-fixtures').replaceChildren();
      $('group-count').value='1';renderMapOptions();
      $('format-preview').textContent='Choose the format before publishing. Each group needs at least two teams.';
      $('wheel').style.transition='none';$('wheel').style.transform='none';paintWheel([]);selectionCount();controls();
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
      details.append(element('summary','',`${String(index+1).padStart(2,'0')} · ${names.join(' vs ')} · ${match.map || 'Map not assigned'} · ${match.result ? match.result.scores.join(' – ') : next ? 'UP NEXT' : ready ? 'Scheduled' : 'Awaiting qualifiers'}`));
      const body = element('div','result-body');
      body.append(element('p','rules',`${match.id.toUpperCase()} · ${match.group ? `Group ${match.group}` : knockoutRoundName(match,state.matches)}`));
      if (!ready) { body.append(element('p','','Teams will appear once qualification is confirmed.')); details.append(body); container.append(details); return; }
      const form = element('form','result-form'); const scores = names.map((name,i) => numeric(`${name} rounds`,match.result?.scores[i],99));
      const scoreRow = element('div','score-inputs'); scores.forEach(s => {s.input.required=true;scoreRow.append(s.wrap);}); form.append(scoreRow);
      form.append(element('p','rules','Player stats are optional. Leave all three fields blank if not recorded; enter all three to include that player in averages.'));
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
          const {next,cleared} = applyResult(current,match.id,result,resolveTournament);
          if (cleared.length && !confirm(`This changes playoff participants and clears results and player stats for ${cleared.join(', ')}. Publish this correction?`)) return;
          await publish(next,`Update ${match.id.toUpperCase()} result and player stats`);
        } catch(error) {note.textContent=error.message;}
      };
      body.append(form); details.append(body); container.append(details);
    });
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
  function paintWheel(names) {
    const canvas=$('wheel'),ctx=canvas.getContext('2d'),n=names.length;ctx.clearRect(0,0,640,640);
    if(!n){ctx.fillStyle='#222c35';ctx.beginPath();ctx.arc(320,320,304,0,2*Math.PI);ctx.fill();ctx.fillStyle='#ffad32';ctx.font='bold 28px Arial';ctx.textAlign='center';ctx.fillText('PLAYER DRAW',320,328);return;}
    names.forEach((p,i)=>{const start=-Math.PI/2+i*2*Math.PI/n;ctx.beginPath();ctx.moveTo(320,320);ctx.arc(320,320,304,start,start+2*Math.PI/n);ctx.closePath();ctx.fillStyle=['#eaa33b','#325875','#d2b27c','#243c51'][i%4];ctx.fill();ctx.strokeStyle='#101316';ctx.lineWidth=2;ctx.stroke();ctx.save();ctx.translate(320,320);ctx.rotate(start+Math.PI/n);ctx.fillStyle=i%2?'#ffffff':'#12181d';ctx.font=`bold ${n>24?13:17}px Arial`;ctx.textAlign='right';ctx.fillText(p.name.length>19?p.name.slice(0,18)+'…':p.name,288,6);ctx.restore();});
    ctx.beginPath();ctx.arc(320,320,34,0,2*Math.PI);ctx.fillStyle='#101316';ctx.fill();
  }
  function showDrawTeams() {
    $('draw-teams').replaceChildren();const size=Number($('team-size').value);
    for(let i=0;i<(selected.length+remaining.length)/size;i++){const card=element('div','draw-team');const label=element('label','',`Team ${i+1}`);const name=element('input');name.value=draw?.teams[i].name || `Team ${String(i+1).padStart(2,'0')}`;name.maxLength=60;name.disabled=!draw;name.oninput=()=>{draw.teams[i].name=name.value.trim();};label.append(name);card.append(label);selected.slice(i*size,(i+1)*size).forEach(p=>card.append(element('p','',p.name)));if(draw)card.append(element('p','accent',draw.groups.length ? `Group ${draw.groups.find(g=>g.teams.includes(draw.teams[i].id)).id}` : 'Knockout'));$('draw-teams').append(card);}
  }
  function lock(value){locked=value;['team-size','pool-input','load-pool','start-draw'].forEach(id=>{$(id).disabled=value;});$('pool-list').querySelectorAll('input').forEach(i=>{i.disabled=value;});}
  $('start-draw').onclick=()=>{if(busy)return;const ids=[...$('pool-list').querySelectorAll('input:checked')].map(i=>i.value);const size=Number($('team-size').value);if(ids.length<size*2 || ids.length%size)return;remaining=pool.filter(p=>ids.includes(p.id));selected=[];draw=null;lock(true);showDrawTeams();paintWheel(remaining);$('spin').disabled=false;announce('Drawing Team 01. Spin to select its first player.');};
  $('spin').onclick=async()=>{
    if(busy || spinning || !remaining.length)return;spinning=true;$('spin').disabled=true;$('reset-draw').disabled=true;
    const index=randomIndex(remaining.length),picked=remaining[index],canvas=$('wheel');canvas.style.transition='none';canvas.style.transform='rotate(0deg)';paintWheel(remaining);void canvas.offsetWidth;
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:2400;
    canvas.style.transition=`transform ${duration}ms cubic-bezier(.12,.6,.12,1)`;canvas.style.transform=`rotate(${1800+360-(index+.5)*360/remaining.length}deg)`;
    await new Promise(resolve=>setTimeout(resolve,duration+30));
    remaining.splice(index,1);selected.push(picked);const size=Number($('team-size').value);announce(`${picked.name} joins Team ${Math.ceil(selected.length/size)}. ${remaining.length} players remaining.`);
    if(!remaining.length){draw=makeTournament(selected,size,current);drawOrder=draw.groups.flatMap(g=>g.teams);configureDraw();announce('Draw complete. Review team names and tournament format, then publish.');}
    showDrawTeams();spinning=false;$('spin').disabled=!remaining.length;$('reset-draw').disabled=false;controls();
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
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const target = event.key === 'ArrowRight' ? (index+1)%tabs.length : event.key === 'ArrowLeft' ? (index+tabs.length-1)%tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : null;
      if (target !== null) { event.preventDefault(); selectTab(tabs[target],true); }
    });
  });
  renderMapOptions();paintWheel([]);renderAll();
  let rememberedToken = '';
  try { rememberedToken = sessionStorage.getItem(tokenStorageKey) || ''; } catch { /* Storage may be disabled by browser settings. */ }
  if (rememberedToken) { $('remember-token').checked = true; void connect(rememberedToken); }
})();
