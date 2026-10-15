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
function createFixtureImporter({data,fixture,save,isBusy,isOrganiser,gameId}){
  const root=element('section','fixture-import'),status=element('p','rules'),select=element('select'),load=element('button','secondary','Refresh FACEIT games'),preview=element('div');
  load.type='button';select.setAttribute('aria-label','Available FACEIT games');let games=[];const label=element('label','','Import game');label.append(select);root.append(element('h4','','Import FACEIT results'),label,load,status,preview);
  async function refresh(force=false){load.disabled=true;status.textContent='Loading completed queue games…';try{const feed=await loadFaceitFeed(force);games=feed.games||[];select.replaceChildren(element('option','','Select a completed game'));select.firstChild.value='';for(const game of games){const option=element('option','',new Date(game.finishedAt*1000).toLocaleString()+' · '+game.map+' · '+game.teams.map(t=>t.players.map(p=>p.name).join(', ')).join(' vs ')+' · '+game.teams.map(t=>t.score).join('–'));option.value=game.id;const used=importedGameUsage(data,game.id);if(used.length){option.textContent+=' · Already imported: '+used.map(u=>u.label).join(', ');option.disabled=used.some(u=>u.archived || u.fixtureId!==fixture.id);}select.append(option);}status.textContent=games.length+' games available (latest 100 queue entries) · Synced '+new Date(feed.updatedAt).toLocaleString();preview.replaceChildren();if(gameId){select.value=gameId;select.onchange();}}catch(error){status.textContent=error.message;}finally{load.disabled=false;}}
  load.onclick=()=>refresh(true);
  select.onchange=()=>{preview.replaceChildren();const game=games.find(g=>g.id===select.value);if(!game)return;const roster=data.teams.filter(t=>fixture.ids.includes(t.id)).flatMap(t=>t.players),links=Object.create(null),aliases=data.importAliases?.faceit||{};
    preview.append(element('p','rules','Link FACEIT names to fixture players. Scores use rounds won; imported kills, deaths and assists are kept as reported. Check the map and date before importing.'));
    for(const side of game.teams){preview.append(element('strong','',side.name+' · '+side.score));for(const player of side.players){const row=element('label','',player.name+' · '+player.kills+' K / '+player.deaths+' D / '+player.assists+' A'),pick=element('select');pick.append(element('option','','Select leaderboard player'));pick.firstChild.value='';roster.forEach(p=>{const o=element('option','',p.name);o.value=p.id;pick.append(o);});const remembered=aliases[player.name.normalize('NFKC').toLowerCase()];const candidate=roster.filter(p=>p.name===remembered);if(candidate.length===1){pick.value=candidate[0].id;links[player.name]=pick.value;}pick.onchange=()=>{links[player.name]=pick.value;};row.append(pick);preview.append(row);}}
    const confirm=element('button','','Import score & player stats');confirm.type='button';confirm.onclick=async()=>{if(isBusy()||!isOrganiser())return;confirm.disabled=true;try{const result=importedFixtureResult(data,fixture,game,links),remember=Object.assign(Object.create(null),aliases);for(const [name,id] of Object.entries(links))remember[name.normalize('NFKC').toLowerCase()]=roster.find(p=>p.id===id).name;await save(result,remember);}catch(error){status.textContent=error.message;}finally{confirm.disabled=false;}};preview.append(confirm);
  };
  void refresh();return root;
}
if(typeof module!=='undefined')module.exports={normalizeLeetifyProfileUrl,importedFixtureResult,importedGameUsage,suggestImportFixtures};
function importedGameUsage(data,id){
  return [...data.matches.filter(m=>m.result?.importSource?.id===id).map(m=>({fixtureId:m.id,archived:false,label:m.id.toUpperCase()})),...(data.history||[]).flatMap(entry=>entry.tournament.matches.filter(m=>m.result?.importSource?.id===id).map(m=>({fixtureId:m.id,archived:true,label:entry.title+' / '+m.id.toUpperCase()})))];
}
function suggestImportFixtures(data,game,resolve){
  if(importedGameUsage(data,game.id).length)return [];
  const aliases=data.importAliases?.faceit||{},state=resolve(data),suggestions=[];
  for(const fixture of state.matches.filter(m=>!m.result && !m.skipped && m.ids.every(Boolean))){const roster=data.teams.filter(t=>fixture.ids.includes(t.id)).flatMap(t=>t.players),links=Object.create(null);
    for(const p of game.teams.flatMap(t=>t.players)){const candidates=roster.filter(x=>x.name===aliases[p.name.normalize('NFKC').toLowerCase()]);if(candidates.length===1)links[p.name]=candidates[0].id;}
    try{importedFixtureResult(data,fixture,game,links);suggestions.push(fixture.id);}catch{}
  }return suggestions;
}
function createImportCentre({data,resolve,isBusy,isOrganiser,saveImport,saveAliases,saveProfiles,undo,playerContainer}){
  const root=element('details','import-centre'),note=element('p','rules');if(playerContainer){note.setAttribute('role','status');playerContainer.append(note);}
  const button=(text,fn)=>{const b=element('button','secondary',text);b.type='button';b.onclick=async()=>{if(isBusy()||!isOrganiser())return;b.disabled=true;try{await fn();}catch(error){note.textContent=error.message;}finally{b.disabled=false;}};return b;};
  root.append(element('summary','import-centre-heading','Imports & result changes'));root.open=importCentreState.open;root.addEventListener('toggle',event=>{if(event.target===root)importCentreState.open=root.open;});
  const last=data.resultRevisions?.at(-1);if(last){root.append(element('p','rules','Last result change: '+last.fixtureId.toUpperCase()+' · '+new Date(last.at).toLocaleString()),button('Undo last result change',async()=>{if(confirm('Restore the previous results and player stats, including affected playoff results? Name links are unchanged.'))await undo();}));}
  const inbox=element('details','import-inbox'),inboxBody=element('div');inbox.append(element('summary','','FACEIT import inbox'),inboxBody);
  const manager=element(playerContainer?'section':'details','name-link-manager'),managerBody=element('div');manager.append(element(playerContainer?'h3':'summary','','Manage player name links'),element('p','rules','Change or unlink remembered names here. This affects future imports only; to correct an existing result, undo it or reimport the game with the correct links.'),managerBody);root.append(inbox);if(!playerContainer)root.append(note);(playerContainer||root).append(manager);
  inbox.open=importCentreState.inbox;manager.open=importCentreState.links;let feed=null;const profilesBody=element('section','leetify-profile-links');manager.insertBefore(profilesBody,managerBody);renderProfiles();
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
    profilesBody.replaceChildren(element('h4','','Leetify profiles'),element('p','rules','Optional profile URLs are saved in the public repository. These links do not yet enable automatic game discovery. Unlinking a profile leaves your existing name mappings and match stats unchanged.'));
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
