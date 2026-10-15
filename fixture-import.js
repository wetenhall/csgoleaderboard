let faceitFeedCache=null;
async function loadFaceitFeed(force=false){if(!faceitFeedCache || force)faceitFeedCache=fetch('faceit-games.json?v='+Date.now(),{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Game list is not available yet. Check that the bot is running.');return response.json();}).catch(error=>{faceitFeedCache=null;throw error;});return faceitFeedCache;}
function importedFixtureResult(data,fixture,game,links){
  if(!fixture.ids?.every(Boolean))throw Error('This fixture is not ready.');
  if(game.provider!=='faceit' || game.teams?.length!==2)throw Error('Invalid imported game.');
  if([...data.matches.filter(m=>m.id!==fixture.id),...(data.history||[]).flatMap(e=>e.tournament.matches)].some(m=>m.result?.importSource?.id===game.id))throw Error('This game is already linked to another fixture.');
  const roster=data.teams.filter(t=>fixture.ids.includes(t.id)).flatMap(t=>t.players),seen=new Set(),players=Object.create(null),sideIds=[];
  for(const side of game.teams){
    const ids=side.players.map(p=>links[p.name]);
    if(ids.some(id=>!id || seen.has(id) || !roster.some(p=>p.id===id)))throw Error('Link every imported player to a different player in this fixture.');
    ids.forEach(id=>seen.add(id));
    const team=data.teams.find(t=>fixture.ids.includes(t.id)&&t.players.length===ids.length&&t.players.every(p=>ids.includes(p.id)));
    if(!team)throw Error('The linked players must match the fixture teams.');sideIds.push(team.id);
    side.players.forEach(p=>{if(['kills','deaths','assists'].some(k=>!Number.isSafeInteger(p[k])||p[k]<0||p[k]>999))throw Error('Invalid imported player stats.');players[links[p.name]]={kills:p.kills,deaths:p.deaths,assists:p.assists};});
  }
  if(new Set(sideIds).size!==2 || seen.size!==roster.length)throw Error('Link both complete teams.');
  const scores=fixture.ids.map(id=>game.teams[sideIds.indexOf(id)].score);
  if(scores.some(s=>!Number.isInteger(s)||s<0||s>99))throw Error('Invalid imported scores.');
  if(!fixture.group && scores[0]===scores[1])throw Error('A knockout game must have a winner.');
  if(game.teams.flatMap(t=>t.players).some((p,i,a)=>a.findIndex(x=>x.name===p.name)!==i))throw Error('Duplicate imported names require manual result entry.');
  return {teams:[...fixture.ids],scores,players,importSource:{provider:'faceit',id:game.id,matchId:game.matchId,map:game.map}};
}
function createFixtureImporter({data,fixture,save,isBusy,isOrganiser}){
  const root=element('section','fixture-import'),status=element('p','rules'),select=element('select'),load=element('button','secondary','Refresh FACEIT games'),preview=element('div');
  load.type='button';select.setAttribute('aria-label','Available FACEIT games');let games=[];const label=element('label','','Import game');label.append(select);root.append(element('h4','','Import FACEIT results'),label,load,status,preview);
  async function refresh(force=false){load.disabled=true;status.textContent='Loading completed queue games…';try{const feed=await loadFaceitFeed(force);games=feed.games||[];select.replaceChildren(element('option','','Select a completed game'));select.firstChild.value='';for(const game of games){const option=element('option','',new Date(game.finishedAt*1000).toLocaleString()+' · '+game.map+' · '+game.teams.map(t=>t.players.map(p=>p.name).join(', ')).join(' vs ')+' · '+game.teams.map(t=>t.score).join('–'));option.value=game.id;select.append(option);}status.textContent=games.length+' games available (latest 100 queue entries) · Synced '+new Date(feed.updatedAt).toLocaleString();preview.replaceChildren();}catch(error){status.textContent=error.message;}finally{load.disabled=false;}}
  load.onclick=()=>refresh(true);
  select.onchange=()=>{preview.replaceChildren();const game=games.find(g=>g.id===select.value);if(!game)return;const roster=data.teams.filter(t=>fixture.ids.includes(t.id)).flatMap(t=>t.players),links=Object.create(null),aliases=data.importAliases?.faceit||{};
    preview.append(element('p','rules','Link FACEIT names to fixture players. Scores use rounds won; imported kills, deaths and assists are kept as reported. Check the map and date before importing.'));
    for(const side of game.teams){preview.append(element('strong','',side.name+' · '+side.score));for(const player of side.players){const row=element('label','',player.name+' · '+player.kills+' K / '+player.deaths+' D / '+player.assists+' A'),pick=element('select');pick.append(element('option','','Select leaderboard player'));pick.firstChild.value='';roster.forEach(p=>{const o=element('option','',p.name);o.value=p.id;pick.append(o);});const remembered=aliases[player.name.normalize('NFKC').toLowerCase()];const candidate=roster.filter(p=>p.name===remembered);if(candidate.length===1){pick.value=candidate[0].id;links[player.name]=pick.value;}pick.onchange=()=>{links[player.name]=pick.value;};row.append(pick);preview.append(row);}}
    const confirm=element('button','','Import score & player stats');confirm.type='button';confirm.onclick=async()=>{if(isBusy()||!isOrganiser())return;confirm.disabled=true;try{const result=importedFixtureResult(data,fixture,game,links),remember=Object.assign(Object.create(null),aliases);for(const [name,id] of Object.entries(links))remember[name.normalize('NFKC').toLowerCase()]=roster.find(p=>p.id===id).name;await save(result,remember);}catch(error){status.textContent=error.message;}finally{confirm.disabled=false;}};preview.append(confirm);
  };
  void refresh();return root;
}
if(typeof module!=='undefined')module.exports={importedFixtureResult};
