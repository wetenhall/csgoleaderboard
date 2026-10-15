let importCentreState={open:false,inbox:false,links:false,linkTab:'faceit'};
let faceitFeedCache=null;
async function loadFaceitFeed(force=false){if(!faceitFeedCache || force)faceitFeedCache=fetch('faceit-games.json?v='+Date.now(),{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Game list is not available yet. Check that the bot is running.');return response.json();}).catch(error=>{faceitFeedCache=null;throw error;});return faceitFeedCache;}
function normalizeLeetifyProfileUrl(value){
  if(!String(value).trim())return '';
  let url;try{url=new URL(String(value).trim());}catch{throw Error('Enter a complete Leetify profile URL.');}
  const match=url.pathname.match(/^\/app\/profile\/([a-z0-9-]+)(?:\/.*)?$/i);
  if(url.protocol!=='https:' || !['leetify.com','www.leetify.com'].includes(url.hostname) || url.port || url.username || url.password || !match || !/^(?:[0-9]{17}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(match[1]))throw Error('Use a Leetify profile link such as https://leetify.com/app/profile/your-profile-id.');
  return 'https://leetify.com/app/profile/'+match[1].toLowerCase();
}
function importedFixtureResult(data,fixture,game,links){
  if(!fixture.ids?.every(Boolean))throw Error('This fixture is not ready.');
  if(!['faceit','leetify'].includes(game.provider) || game.teams?.length!==2)throw Error('Invalid imported game.');
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
  return {teams:[...fixture.ids],scores,players,importSource:{provider:game.provider,id:game.id,matchId:game.matchId,map:game.map}};
}
function createFixtureImporter({data,fixture,save,isBusy,isOrganiser,gameId,preloadedGame}){
  const provider=preloadedGame?.provider||'faceit',providerName=provider==='leetify'?'Leetify':'FACEIT';
  const root=element('section','fixture-import'),status=element('p','rules'),select=element('select'),load=element('button','secondary','Refresh '+providerName+' games'),preview=element('div');
  load.type='button';select.setAttribute('aria-label','Available '+providerName+' games');let games=[];const label=element('label','','Import game');label.append(select);root.append(element('h4','','Import '+providerName+' results'),label,load,status,preview);
  async function refresh(force=false){load.disabled=true;status.textContent='Loading completed queue games…';try{const feed=preloadedGame?{games:[preloadedGame],updatedAt:new Date().toISOString()}:await loadFaceitFeed(force);games=feed.games||[];select.replaceChildren(element('option','','Select a completed game'));select.firstChild.value='';for(const game of games){const option=element('option','',new Date(game.finishedAt*1000).toLocaleString()+' · '+game.map+' · '+game.teams.map(t=>t.players.map(p=>p.name).join(', ')).join(' vs ')+' · '+game.teams.map(t=>t.score).join('–'));option.value=game.id;const used=importedGameUsage(data,game.id);if(used.length){option.textContent+=' · Already imported: '+used.map(u=>u.label).join(', ');option.disabled=used.some(u=>u.archived || u.fixtureId!==fixture.id);}select.append(option);}status.textContent=games.length+' games available · Synced '+new Date(feed.updatedAt).toLocaleString();preview.replaceChildren();if(gameId||preloadedGame){select.value=gameId||preloadedGame.id;select.onchange();}}catch(error){status.textContent=error.message;}finally{load.disabled=false;}}
  if(preloadedGame)load.hidden=true;
  load.onclick=()=>refresh(true);
  select.onchange=()=>{preview.replaceChildren();const game=games.find(g=>g.id===select.value);if(!game)return;const roster=data.teams.filter(t=>fixture.ids.includes(t.id)).flatMap(t=>t.players),links=Object.create(null),aliases=importPlayerAliases(data,game);
    preview.append(element('p','rules','Link '+providerName+' names to fixture players. Scores use rounds won; imported kills, deaths and assists are kept as reported. Check the map and date before importing.'));
    for(const side of game.teams){preview.append(element('strong','',side.name+' · '+side.score));for(const player of side.players){const row=element('label','',player.name+' · '+player.kills+' K / '+player.deaths+' D / '+player.assists+' A'),pick=element('select');pick.append(element('option','','Select leaderboard player'));pick.firstChild.value='';roster.forEach(p=>{const o=element('option','',p.name);o.value=p.id;pick.append(o);});const remembered=aliases[player.name.normalize('NFKC').toLowerCase()];const candidate=roster.filter(p=>p.name===remembered);if(candidate.length===1){pick.value=candidate[0].id;links[player.name]=pick.value;}pick.onchange=()=>{links[player.name]=pick.value;};row.append(pick);preview.append(row);}}
    const confirm=element('button','','Import score & player stats');confirm.type='button';confirm.onclick=async()=>{if(isBusy()||!isOrganiser())return;confirm.disabled=true;try{const result=importedFixtureResult(data,fixture,game,links),remember=Object.assign(Object.create(null),aliases);for(const [name,id] of Object.entries(links))remember[name.normalize('NFKC').toLowerCase()]=roster.find(p=>p.id===id).name;await save(result,remember);}catch(error){status.textContent=error.message;}finally{confirm.disabled=false;}};preview.append(confirm);
  };
  void refresh();return root;
}
if(typeof module!=='undefined')module.exports={normalizeLeetifyMatch,leetifyMatchId,importPlayerAliases,normalizeLeetifyProfileUrl,importedFixtureResult,importedGameUsage,suggestImportFixtures};
function importedGameUsage(data,id){
  return [...data.matches.filter(m=>m.result?.importSource?.id===id).map(m=>({fixtureId:m.id,archived:false,label:m.id.toUpperCase()})),...(data.history||[]).flatMap(entry=>entry.tournament.matches.filter(m=>m.result?.importSource?.id===id).map(m=>({fixtureId:m.id,archived:true,label:entry.title+' / '+m.id.toUpperCase()})))];
}
function suggestImportFixtures(data,game,resolve){
  if(importedGameUsage(data,game.id).length)return [];
  const aliases=importPlayerAliases(data,game),state=resolve(data),suggestions=[];
  for(const fixture of state.matches.filter(m=>!m.result && !m.skipped && m.ids.every(Boolean))){const roster=data.teams.filter(t=>fixture.ids.includes(t.id)).flatMap(t=>t.players),links=Object.create(null);
    for(const p of game.teams.flatMap(t=>t.players)){const candidates=roster.filter(x=>x.name===aliases[p.name.normalize('NFKC').toLowerCase()]);if(candidates.length===1)links[p.name]=candidates[0].id;}
    try{importedFixtureResult(data,fixture,game,links);suggestions.push(fixture.id);}catch{}
  }return suggestions;
}
function createImportCentre({data,resolve,isBusy,isOrganiser,saveImport,saveAliases,saveProfiles,undo,playerContainer,dedicated=false}){
  const root=element(dedicated?'section':'details','import-centre'),note=element('p','rules');if(playerContainer){note.setAttribute('role','status');playerContainer.append(note);}
  const button=(text,fn)=>{const b=element('button','secondary',text);b.type='button';b.onclick=async()=>{if(isBusy()||!isOrganiser())return;b.disabled=true;try{await fn();}catch(error){note.textContent=error.message;}finally{b.disabled=false;}};return b;};
  if(!dedicated)root.append(element('summary','import-centre-heading','Imports & result changes'));root.open=importCentreState.open;root.addEventListener('toggle',event=>{if(event.target===root)importCentreState.open=root.open;});
  const last=data.resultRevisions?.at(-1);if(last){root.append(element('p','rules','Last result change: '+last.fixtureId.toUpperCase()+' · '+new Date(last.at).toLocaleString()),button('Undo last result change',async()=>{if(confirm('Restore the previous results and player stats, including affected playoff results? Name links are unchanged.'))await undo();}));}
  const inbox=element('details','import-inbox'),inboxBody=element('div');inbox.append(element('summary','','FACEIT import inbox'),inboxBody);
  const manager=element(playerContainer?'section':'details','name-link-manager'),managerBody=element('div');manager.append(element(playerContainer?'h3':'summary','','Manage player name links'),element('p','rules','Change or unlink remembered names here. This affects future imports only; to correct an existing result, undo it or reimport the game with the correct links.'),managerBody);if(dedicated)root.append(element('h3','','FACEIT matches'));root.append(dedicated?inboxBody:inbox);root.append(createLeetifyInbox({data,resolve,isBusy,isOrganiser,saveImport}));if(!playerContainer)root.append(note);(playerContainer||root).append(manager);
  inbox.open=dedicated || importCentreState.inbox;manager.open=importCentreState.links;let feed=null;const profilesBody=element('section','leetify-profile-links');manager.insertBefore(profilesBody,managerBody);renderProfiles();
  const linkTabs=element('div','player-link-tabs');linkTabs.setAttribute('role','tablist');linkTabs.setAttribute('aria-label','Player link provider');const tabButtons=[];
  for(const [provider,title,panel] of [['faceit','FACEIT',managerBody],['leetify','Leetify',profilesBody]]){const tab=element('button','secondary',title);tab.type='button';tab.id='player-links-tab-'+provider;panel.id='player-links-panel-'+provider;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);tab.onclick=()=>showLinkTab(provider);tabButtons.push({provider,tab,panel});linkTabs.append(tab);}
  function showLinkTab(provider){importCentreState.linkTab=provider;tabButtons.forEach(item=>{const selected=item.provider===provider;item.tab.setAttribute('aria-selected',String(selected));item.tab.tabIndex=selected?0:-1;item.panel.hidden=!selected;});}
  tabButtons.forEach((item,index)=>item.tab.onkeydown=event=>{const next=event.key==='ArrowRight'?(index+1)%2:event.key==='ArrowLeft'?(index+1)%2:event.key==='Home'?0:event.key==='End'?1:null;if(next!==null){event.preventDefault();showLinkTab(tabButtons[next].provider);tabButtons[next].tab.focus();}});
  manager.insertBefore(linkTabs,profilesBody);showLinkTab(importCentreState.linkTab||'faceit');
  const load=async(force=false)=>{note.textContent='Loading FACEIT games…';try{feed=await loadFaceitFeed(force);if(!root.isConnected)return;renderInbox();renderLinks();note.textContent='Game list synced '+new Date(feed.updatedAt).toLocaleString()+'.';}catch(error){note.textContent=error.message;}};
  inboxBody.append(button('Load available games',()=>load()));managerBody.append(button('Load player name links',()=>load()));if(playerContainer)queueMicrotask(()=>{if(root.isConnected)void load();});
  inbox.addEventListener('toggle',()=>{importCentreState.inbox=inbox.open;if(inbox.open&&!feed)void load();});manager.addEventListener('toggle',()=>{importCentreState.links=manager.open;if(manager.open&&!feed)void load();});
  function renderInbox(){inboxBody.replaceChildren(button('Refresh games',()=>load(true)));const games=feed.games||[],pending=games.filter(g=>!importedGameUsage(data,g.id).length);inboxBody.append(element('p','rules',pending.length+' new games · '+(games.length-pending.length)+' already imported'));
    for(const game of games){const used=importedGameUsage(data,game.id),card=element('details','import-game'),body=element('div'),suggestions=suggestImportFixtures(data,game,resolve);card.append(element('summary','',game.map+' · '+game.teams.map(t=>t.players.map(p=>p.name).join(', ')).join(' vs ')+' · '+game.teams.map(t=>t.score).join('–')+' · '+new Date(game.finishedAt*1000).toLocaleString()+(used.length?' · Already imported: '+used.map(u=>u.label).join(', '):suggestions.length===1?' · Suggested '+suggestions[0].toUpperCase():suggestions.length>1?' · Multiple possible fixtures':' · Link players to suggest a fixture')));
      if(!used.length){const label=element('label','','Choose fixture'),pick=element('select'),preview=element('div');pick.append(element('option','','Select fixture'));pick.firstChild.value='';for(const fixture of resolve(data).matches.filter(m=>!m.skipped && m.ids.every(Boolean))){const o=element('option','',fixture.id.toUpperCase()+' · '+fixture.ids.map(id=>data.teams.find(t=>t.id===id).players.map(p=>p.name).join(', ')).join(' vs ')+(fixture.result?' · Replace saved result':''));o.value=fixture.id;pick.append(o);}label.append(pick);body.append(label,preview);pick.onchange=()=>{preview.replaceChildren();const fixture=resolve(data).matches.find(m=>m.id===pick.value);if(fixture)preview.append(createFixtureImporter({data,fixture,gameId:game.id,isBusy,isOrganiser,save:(result,aliases)=>saveImport(fixture.id,result,aliases)}));};if(suggestions.length===1)pick.value=suggestions[0];let opened=false;card.addEventListener('toggle',()=>{if(card.open&&!opened){opened=true;if(pick.value)pick.onchange();}});}
      card.append(body);inboxBody.append(card);
    }
  }
  function renderProfiles(){
    profilesBody.replaceChildren(element('h4','','Leetify profiles'),element('p','rules','Optional profile URLs are saved in the public repository. Use Fixture Import to find recent matches from these profiles. Unlinking a profile leaves your existing name mappings and match stats unchanged.'));
    const profiles=data.leetifyProfiles||{},names=new Map();
    for(const name of [...(data.savedPlayers||[]),...data.teams.flatMap(t=>t.players.map(p=>p.name)),...Object.values(data.importAliases?.faceit||{})])names.set(name.normalize('NFKC').toLowerCase(),name);
    for(const key of Object.keys(profiles))if(!names.has(key))names.set(key,key);
    if(!names.size)profilesBody.append(element('p','rules','Save players or create a tournament to link profiles.'));
    for(const [key,name] of [...names].sort((a,b)=>Number(!!profiles[a[0]])-Number(!!profiles[b[0]]) || a[1].localeCompare(b[1]))){const row=element('div','name-link-row leetify-profile-row'+(profiles[key]?' profile-saved':'')),label=element('label'),input=element('input');label.append(element('span','leetify-player-name',name));input.type='url';input.placeholder='https://leetify.com/app/profile/…';input.maxLength=300;input.value=profiles[key]||'';input.setAttribute('aria-label',name+' Leetify profile');label.append(input);
      row.append(label,button('Save profile',async()=>{const next=Object.assign(Object.create(null),profiles),url=normalizeLeetifyProfileUrl(input.value);if(url)next[key]=url;else delete next[key];await saveProfiles(next);}),button('Unlink profile',async()=>{const next=Object.assign(Object.create(null),profiles);delete next[key];await saveProfiles(next);}));profilesBody.append(row);
    }
  }
  function renderLinks(){managerBody.replaceChildren();const aliases=data.importAliases?.faceit||{},names=[...new Set([...Object.keys(aliases),...(feed.games||[]).flatMap(g=>g.teams.flatMap(t=>t.players.map(p=>p.name.normalize('NFKC').toLowerCase())))])].sort(),choices=[...new Set([...(data.savedPlayers||[]),...data.teams.flatMap(t=>t.players.map(p=>p.name)),...Object.values(aliases)])].sort();
    if(!names.length)managerBody.append(element('p','rules','No imported names or remembered links yet.'));
    for(const name of names.sort((a,b)=>Number(!!aliases[a])-Number(!!aliases[b]) || a.localeCompare(b))){const row=element('div','name-link-row leetify-profile-row faceit-link-row'+(aliases[name]?' profile-saved':'')),label=element('label'),pick=element('select');label.append(element('span','leetify-player-name',name));pick.setAttribute('aria-label',name+' leaderboard player');pick.append(element('option','','Unlinked'));pick.firstChild.value='';choices.forEach(value=>{const o=element('option','',value);o.value=value;pick.append(o);});pick.value=aliases[name]||'';label.append(pick);row.append(label,button('Save link',async()=>{const next=Object.assign(Object.create(null),aliases);if(pick.value)next[name]=pick.value;else delete next[name];await saveAliases(next);}),button('Unlink',async()=>{const next=Object.assign(Object.create(null),aliases);delete next[name];await saveAliases(next);}));managerBody.append(row);}
  }
  return root;
}
const LEETIFY_API='https://api-public.cs-prod.leetify.com';
function leetifyMatchId(value){
  let id=String(value).trim();
  if(id.startsWith('https://')){let url;try{url=new URL(id);}catch{throw Error('Enter a Leetify match URL or match ID.');}if(!['leetify.com','www.leetify.com'].includes(url.hostname)||url.port||url.username||url.password)throw Error('Use a match link from leetify.com.');id=url.pathname.match(/^\/app\/match-details\/([a-f0-9-]+)\/?$/i)?.[1]||'';}
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('Enter a Leetify match URL or match ID.');return id.toLowerCase();
}
async function leetifyRequest(path){
  const response=await fetch(LEETIFY_API+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status===429?'Leetify request limit reached. Wait a moment and try again.':[403,404].includes(response.status)?'Leetify data is unavailable. The profile or match may be private, unregistered or not processed yet.':'Leetify request failed ('+response.status+'). Try again later.');return response.json();
}
function normalizeLeetifyMatch(match,profileNames={}){
  const matchId=leetifyMatchId(match.id),finishedAt=Date.parse(match.finished_at)/1000;
  if(!Number.isFinite(finishedAt)||!Array.isArray(match.team_scores)||match.team_scores.length!==2||!Array.isArray(match.stats)||!match.stats.length)throw Error('Leetify has not provided complete match scores and player stats.');
  const numbers=match.team_scores.map(t=>t.team_number);
  if(new Set(numbers).size!==2||match.stats.some(p=>!numbers.includes(p.initial_team_number)))throw Error('Leetify returned invalid team assignments.');
  const teams=match.team_scores.map(t=>({name:'Team '+t.team_number,score:t.score,players:match.stats.filter(p=>p.initial_team_number===t.team_number).map(p=>({name:p.name,kills:p.total_kills,deaths:p.total_deaths,assists:p.total_assists,...(profileNames[p.steam64_id]?{leaderboardName:profileNames[p.steam64_id]}:{})}))}));
  if(teams.some(t=>!Number.isInteger(t.score)||t.score<0||t.score>99||!t.players.length||t.players.some(p=>typeof p.name!=='string'||!p.name.trim()||['kills','deaths','assists'].some(k=>!Number.isInteger(p[k])||p[k]<0||p[k]>999))))throw Error('Leetify has not provided complete player stats for both teams.');
  return {id:'leetify:'+matchId,matchId,provider:'leetify',map:match.map_name||'',finishedAt,teams};
}
function importPlayerAliases(data,game){
  if(game.provider!=='leetify')return data.importAliases?.faceit||{};
  const names=[...(data.savedPlayers||[]),...data.teams.flatMap(t=>t.players.map(p=>p.name))],aliases=Object.create(null);
  for(const player of game.teams.flatMap(t=>t.players)){const key=player.name.normalize('NFKC').toLowerCase(),candidates=[...new Set(names)].filter(n=>n.normalize('NFKC').toLowerCase()===key);if(player.leaderboardName){const linked=[...new Set(names)].filter(n=>n.normalize('NFKC').toLowerCase()===player.leaderboardName.normalize('NFKC').toLowerCase());if(linked.length===1)aliases[key]=linked[0];}else if(candidates.length===1)aliases[key]=candidates[0];}return aliases;
}
function createLeetifyInbox({data,resolve,isBusy,isOrganiser,saveImport}){
  const root=element('section','leetify-import'),status=element('p','rules'),profiles=element('select'),matches=element('select'),url=element('input'),preview=element('div');status.setAttribute('role','status');
  root.append(element('h3','','Leetify matches'),element('p','rules','Find recent matches from a saved profile, or paste a Leetify match link. Review both teams before importing. Leetify must have processed the demo and made player stats available.'));
  const attribution=element('a','leetify-attribution'),badge=element('img');attribution.href='https://leetify.com/';attribution.target='_blank';attribution.rel='noopener noreferrer';badge.src='assets/images/leetify-data-badge.png';badge.alt='Data Provided by Leetify';attribution.append(badge);root.append(attribution);
  const profileNames=Object.create(null);for(const [name,profile] of Object.entries(data.leetifyProfiles||{})){const option=element('option','',name);option.value=profile;profiles.append(option);const id=profile.split('/').pop();if(/^\d{17}$/.test(id))profileNames[id]=name;}
  const playerLabel=element('label','','Saved player profile');playerLabel.append(profiles);const matchLabel=element('label','','Recent Leetify matches');matchLabel.append(matches);matches.append(element('option','','Load a profile to find matches'));matches.disabled=true;
  const urlLabel=element('label','','Leetify match URL or ID');url.type='text';url.placeholder='https://leetify.com/app/match-details/…';url.maxLength=300;urlLabel.append(url);
  let loading=false;const action=(title,fn)=>{const button=element('button','secondary',title);button.type='button';button.onclick=async()=>{if(loading||isBusy()||!isOrganiser())return;loading=true;button.disabled=true;status.textContent='Loading from Leetify…';try{await fn();}catch(error){status.textContent=error.message;}finally{loading=false;button.disabled=false;}};return button;};
  const loadHistory=action('Find recent matches',async()=>{preview.replaceChildren();matches.disabled=true;matches.replaceChildren();const id=profiles.value.split('/').pop(),query=/^\d{17}$/.test(id)?'steam64_id=':'id=';const history=await leetifyRequest('/v3/profile/matches?'+query+encodeURIComponent(id));if(!Array.isArray(history))throw Error('Leetify returned an invalid match list.');const unique=new Map(history.map(match=>[match.id,match]));for(const match of unique.values()){const option=element('option','',new Date(match.finished_at).toLocaleString()+' · '+match.map_name+' · '+(match.team_scores||[]).map(t=>t.score).join('–'));option.value=leetifyMatchId(match.id);matches.append(option);}matches.disabled=!matches.options.length;status.textContent=matches.options.length+' recent matches found. Select one to load the full teams and stats.';});
  loadHistory.disabled=!profiles.options.length;if(!profiles.options.length)root.append(element('p','rules','Save profile URLs in Manage Players to enable match discovery. You can still paste a match link below.'));
  profiles.onchange=()=>{matches.replaceChildren();matches.disabled=true;preview.replaceChildren();status.textContent='';};
  async function showMatch(value){preview.replaceChildren();const id=leetifyMatchId(value),match=await leetifyRequest('/v2/matches/'+id);for(const [name,profile] of Object.entries(data.leetifyProfiles||{})){const key=profile.split('/').pop();if(/^\d{17}$/.test(key))continue;try{const p=await leetifyRequest('/v3/profile?id='+encodeURIComponent(key));if(p.steam64_id)profileNames[p.steam64_id]=name;}catch{/* Players can still be linked manually if profile lookup is unavailable. */}}
    const game=normalizeLeetifyMatch(match,profileNames),source=element('a','leetify-source','View on Leetify');source.href='https://leetify.com/app/match-details/'+game.matchId;source.target='_blank';source.rel='noopener noreferrer';preview.append(element('p','rules',game.map+' · '+new Date(game.finishedAt*1000).toLocaleString()+' · '+game.teams.map(t=>t.players.map(p=>p.name).join(', ')).join(' vs ')),source);
    const uses=importedGameUsage(data,game.id);if(uses.some(use=>use.archived)){status.textContent='This match was already imported into an archived tournament.';return;}
    const label=element('label','','Choose fixture'),pick=element('select'),body=element('div');pick.append(element('option','','Select fixture'));pick.firstChild.value='';for(const fixture of resolve(data).matches.filter(f=>!f.skipped&&f.ids.every(Boolean))){const option=element('option','',fixture.id.toUpperCase()+' · '+fixture.ids.map(id=>data.teams.find(t=>t.id===id).players.map(p=>p.name).join(', ')).join(' vs ')+(fixture.result?' · Replace saved result':''));option.value=fixture.id;option.disabled=uses.some(use=>use.fixtureId!==fixture.id);pick.append(option);}label.append(pick);preview.append(label,body);pick.onchange=()=>{body.replaceChildren();const fixture=resolve(data).matches.find(f=>f.id===pick.value);if(fixture)body.append(createFixtureImporter({data,fixture,preloadedGame:game,isBusy,isOrganiser,save:(result,aliases)=>saveImport(fixture.id,result,aliases)}));};const suggested=suggestImportFixtures(data,game,resolve);if(suggested.length===1){pick.value=suggested[0];pick.onchange();}status.textContent='Full match loaded: '+game.teams.reduce((n,t)=>n+t.players.length,0)+' players. Every fixture player must be linked to the correct team before saving.';
  }
  const loadSelected=action('Load selected match',()=>{if(matches.disabled||!matches.value)throw Error('Find recent matches first.');return showMatch(matches.value);});
  root.append(playerLabel,loadHistory,matchLabel,loadSelected,urlLabel,action('Load match link',()=>showMatch(url.value)),status,preview);return root;
}
