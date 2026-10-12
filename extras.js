/* Match night, immutable tournament archives and career records. */
function cupMode(data) { return data.teamSize===1?'1v1':data.teamSize===5?'squads':'duos'; }
function cupFinal(data, resolve) {
  const state=resolve(data), first=state.matches.find(m=>m.id==='f1');
  return data.format==='double' && first?.winner && first.winner===first.ids[1] ? state.matches.find(m=>m.id==='f2') : first;
}
function completedCup(data, resolve) {
  return !!cupFinal(data,resolve)?.winner && resolve(data).matches.every(m=>m.skipped || m.result);
}
function archiveCup(data, resolve, blank, title, date=new Date().toISOString(), id=crypto.randomUUID()) {
  if(!completedCup(data,resolve))throw Error('Finish all tournament fixtures before archiving.');
  if(typeof title!=='string' || !title.trim() || title.trim().length>120)throw Error('Give this cup a name of up to 120 characters.');
  const snapshot=structuredClone(data);delete snapshot.history;delete snapshot.activeMatchId;
  const entry={id,title:title.trim(),archivedAt:date,tournament:snapshot};
  return {...blank(data),history:[...(data.history || []),entry]};
}
function careerRecords(history, mode, resolve, totals) {
  const records=new Map();
  for(const entry of history || []) {
    const data=entry.tournament;if(cupMode(data)!==mode)continue;
    const state=resolve(data),champion=cupFinal(data,resolve)?.winner,stats=new Map(totals(data).map(p=>[p.id,p]));
    // Draw IDs are reused each cup: a normalized player name is the career identity.
    const seen=new Set();
    for(const team of data.teams)for(const player of team.players || []) {
      const key=player.name.trim().normalize('NFKC').toLocaleLowerCase('en');
      let row=records.get(key);if(!row){row={name:player.name.trim(),cups:0,trophies:0,games:0,wins:0,draws:0,recorded:0,kills:0,deaths:0,assists:0};records.set(key,row);}
      if(!seen.has(key)){row.cups++;row.trophies+=Number(team.id===champion);seen.add(key);}
      for(const match of state.matches)if(match.result && match.ids.includes(team.id) && !match.skipped){row.games++;row.wins+=Number(match.winner===team.id);row.draws+=Number(!match.winner);}
      const stat=stats.get(player.id);if(stat){row.recorded+=stat.games;for(const field of ['kills','deaths','assists'])row[field]+=stat[field];}
    }
  }
  return [...records.values()].sort((a,b)=>b.trophies-a.trophies || b.wins-a.wins || b.kills-a.kills || a.name.localeCompare(b.name));
}
function matchNight(data, resolve, ordered) {
  const state=resolve(data),pending=ordered(state.matches).filter(m=>!m.result && !m.skipped);
  const ready=pending.filter(m=>m.ids.every(Boolean));
  const active=ready.find(m=>m.id===data.activeMatchId) || null;
  return {state,active,next:ready.filter(m=>m!==active).slice(0,2),pending:pending.length};
}
if(typeof module!=='undefined')module.exports={cupMode,cupFinal,completedCup,archiveCup,careerRecords,matchNight};

function createTournamentExtras({getData,isOrganiser,isBusy,save,resetDraw,notify,goToFixtures}) {
  const $=id=>document.getElementById(id);
  let mode='duos';
  const label=data=>data.headers?.banner || data.name;
  const modeLabel=value=>value==='1v1'?'1v1':value==='squads'?'Squads':'Duos';
  const teamLabel=(state,id)=>teamDisplayLabel(state.teams.get(id));
  const button=(text,action)=>{const b=element('button','secondary',text);b.type='button';b.dataset.organiserAction='';b.onclick=async()=>{try{await action();}catch(e){notify(e.message);}};return b;};
  function controls() {
    document.querySelectorAll('[data-organiser-action]').forEach(b=>{b.hidden=!isOrganiser();b.disabled=isBusy();});
    $('archive-cup').disabled=isBusy() || !completedCup(getData(),resolveTournament);
    $('archive-cup').hidden=!isOrganiser();
  }
  function renderNight(data) {
    const root=$('match-night');root.replaceChildren();
    const night=matchNight(data,resolveTournament,orderedMatches);
    root.hidden=data.registrationEnabled!==false && !isOrganiser();
    const heading=element('div','section-heading');heading.append(element('h2','','Match night'),element('span','',night.active?'MATCH IN PROGRESS':'FIXTURE QUEUE'));root.append(heading);
    const cards=element('div','night-grid');
    function card(match,title) {
      const box=element('article','night-card'+(title==='Playing now'?' night-active':''));box.append(element('span','eyebrow',title));
      if(!match){
        const message=!data.matches.length?'Create a tournament in Team setup.':!night.pending?'All fixtures complete.':night.active?'The current match is underway.':'Waiting for results or qualification.';
        box.append(element('h3','',!data.matches.length?'No tournament yet':!night.pending?'Tournament complete':title==='Playing now'?'Ready when you are':'No ready fixtures'),element('p','rules',message));return box;
      }
      box.append(element('h3','',match.ids.map(id=>teamLabel(night.state,id)).join(' vs ')),element('p','night-map',match.id.toUpperCase()+' · '+(match.map || 'Choose map in server')));
      const roster=match.ids.map(id=>(night.state.teams.get(id).players || []).map(p=>p.name).join(', ')).join(' / ');
      box.append(element('p','rules',roster));
      box.append(button(title==='Playing now'?'Clear playing status':'Mark as playing',async()=>{
        const next=structuredClone(getData());if(title==='Playing now')delete next.activeMatchId;else next.activeMatchId=match.id;
        await save(next,title==='Playing now'?'Clear active fixture':'Mark '+match.id+' as playing');
      }));
      const view=element('button','secondary','Open fixtures');view.type='button';view.onclick=goToFixtures;box.append(view);return box;
    }
    if(night.active){$('broadcast-status').textContent='PLAYING NOW';$('broadcast-status').dataset.state='live';}
    cards.append(card(night.active,'Playing now'),...night.next.map((m,i)=>card(m,i?'Then':'Up next')));
    if(!night.next.length)cards.append(card(null,'Up next'));root.append(cards);
  }
  function renderCareer(data) {
    const rows=careerRecords(data.history,mode,resolveTournament,playerTotals),root=$('career-table');root.replaceChildren();
    $('career-caption').textContent=modeLabel(mode)+' · Archived cups only · Ranked by trophies, wins, then kills';
    if(!rows.length){root.append(element('p','rules','No archived '+modeLabel(mode)+' tournaments yet. Archive a completed cup to start these records.'));return;}
    const table=element('table');table.setAttribute('aria-label',modeLabel(mode)+' all-time player records');
    const head=element('thead'),tr=element('tr');['#','Player','Cups','Trophies','P','W','D','Win %','K','D','A','K/D','Stats games'].forEach(t=>tr.append(element('th','',t)));head.append(tr);table.append(head);
    const body=element('tbody');rows.forEach((r,i)=>{const row=element('tr');[i+1,r.name,r.cups,r.trophies,r.games,r.wins,r.draws,r.games?(100*r.wins/r.games).toFixed(0)+'%':'—',r.recorded?r.kills:'—',r.recorded?r.deaths:'—',r.recorded?r.assists:'—',r.recorded?(r.deaths?(r.kills/r.deaths).toFixed(2):r.kills?'∞':'0.00'):'—',r.recorded].forEach(v=>row.append(element('td','',String(v))));body.append(row);});table.append(body);root.append(table);
  }
  function renderHistory(data) {
    const root=$('cup-history');root.replaceChildren();
    if(!data.history?.length){root.append(element('p','rules','No archived tournaments yet. When your cup finishes, use Archive & start new tournament in Team setup.'));return;}
    [...data.history].reverse().forEach(entry=>{
      const cup=entry.tournament,state=resolveTournament(cup),final=cupFinal(cup,resolveTournament),details=element('details','history-cup'),summary=element('summary');
      summary.append(element('strong','',entry.title),element('span','',modeLabel(cupMode(cup))+' · '+new Date(entry.archivedAt).toLocaleDateString()+' · '+cup.teams.length+' teams'));
      details.append(summary,element('h3','history-winner','★ '+teamLabel(state,final.winner)),element('p','rules','Final: '+final.ids.map(id=>teamLabel(state,id)).join(' vs ')+' · '+final.result.scores.join(' – ')));
      const download=element('button','secondary','Download champion card');download.type='button';download.onclick=()=>downloadCard(cup,entry.title);details.append(download);
      const list=element('ol','history-results');orderedMatches(state.matches).filter(m=>m.result).forEach(m=>list.append(element('li','',m.ids.map(id=>teamLabel(state,id)).join(' vs ')+' · '+m.result.scores.join(' – ')+' · '+(m.map || m.id.toUpperCase())+(m.result.tiebreakWinner?' · Tiebreak: '+teamLabel(state,m.result.tiebreakWinner):''))));details.append(list);
      const playerList=element('div','table-scroll'),table=element('table'),head=element('tr');['#','Player','Games','Kills','Deaths','Assists'].forEach(v=>head.append(element('th','',v)));const thead=element('thead');thead.append(head);table.append(thead);const tbody=element('tbody');playerTotals(cup).forEach((p,i)=>{const row=element('tr');[i+1,p.name,p.games,p.games?p.kills:'—',p.games?p.deaths:'—',p.games?p.assists:'—'].forEach(v=>row.append(element('td','',String(v))));tbody.append(row);});table.append(tbody);playerList.append(table);details.append(playerList);root.append(details);
    });
  }
  async function downloadCard(data,title=label(data)) {
    try {
      const final=cupFinal(data,resolveTournament);if(!final?.winner)throw Error('A champion card is available once the final is decided.');
      await document.fonts.ready;
      const state=resolveTournament(data),winner=state.teams.get(final.winner),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#101316';ctx.fillRect(0,0,1200,675);ctx.fillStyle='#ff9b01';ctx.fillRect(0,0,1200,14);ctx.fillRect(60,80,6,440);
      const text=(value,x,y,size,color='#f4f4f4',max=1070)=>{ctx.fillStyle=color;ctx.font='700 '+size+'px Rajdhani, sans-serif';while(ctx.measureText(value).width>max && size>14){size--;ctx.font='700 '+size+'px Rajdhani, sans-serif';}ctx.fillText(value,x,y);};
      text(data.headers?.brand || data.name,90,110,30,'#b8bcbf');text(title,90,175,45);text('TOURNAMENT CHAMPIONS',90,270,28,'#ff9b01');text(teamDisplayName(winner),90,360,74);
      text((winner.players || []).map(p=>p.name).join(' / '),90,415,28,'#b8bcbf');text('FINAL  '+final.result.scores.join(' – ')+(final.result.tiebreakWinner?'  ·  TIEBREAK WIN':''),90,505,42,'#ff9b01');
      text(final.ids.map(id=>teamLabel(state,id)).join(' vs '),90,550,24,'#b8bcbf');text(modeLabel(cupMode(data))+'  //  '+(final.map || 'COUNTER-STRIKE'),90,620,22);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not generate the card.');
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(title.replace(/[^a-z0-9_-]+/gi,'-').slice(0,80) || 'tournament')+'-champions.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(e){notify(e.message);}
  }
  $('career-mode').onchange=()=>{mode=$('career-mode').value;renderCareer(getData());};
  $('champion-card').onclick=()=>downloadCard(getData());
  $('archive-cup').onclick=()=>{
    $('archive-title').value=label(getData());$('archive-status').textContent='';$('archive-dialog').showModal();$('archive-title').focus();
  };
  $('close-archive').onclick=()=>$('archive-dialog').close();
  $('archive-form').onsubmit=async event=>{
    event.preventDefault();if(!isOrganiser() || isBusy())return;
    $('confirm-archive').disabled=true;
    try{const next=archiveCup(getData(),resolveTournament,emptyTournament,$('archive-title').value);await save(next,'Archive completed cup and start a new tournament');resetDraw();$('archive-dialog').close();notify('Cup archived. Load players in Team setup for your next tournament.');}
    catch(e){$('archive-status').textContent=e.message;}finally{$('confirm-archive').disabled=false;}
  };
  return {controls,render(data){renderNight(data);renderHistory(data);renderCareer(data);$('champion-card').hidden=!cupFinal(data,resolveTournament)?.winner;controls();}};
}
