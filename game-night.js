/* Draft review, map vetoes and custom-match conveniences. */
function validServerAddress(value) {
  if(typeof value!=='string')throw Error('Enter a server hostname or IP address, optionally followed by :port.');
  value=value.trim();
  if(value && (!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(value) || value.length>253))throw Error('Use a hostname or IP address with an optional port, without commands or passwords.');
  const port=value.match(/:(\d+)$/);if(port && (+port[1]<1 || +port[1]>65535))throw Error('Server port must be between 1 and 65535.');
  return value;
}
function parseServerConnection(value) {
  const match=String(value).trim().match(/^(?:connect\s+)?([^;\s]+)(?:\s*;\s*password\s+(?:"([^"\r\n]*)"|([^\s;"\r\n]+)))?\s*;?$/i);
  if(!String(value).trim())return {serverAddress:'',serverPassword:''};
  if(!match)throw Error('Paste a server address or connect address:port; password yourpassword.');
  const password=match[2] ?? match[3] ?? '';
  if(password.length>128 || /[;"\r\n\x00-\x1f]/.test(password))throw Error('Invalid server password.');
  return {serverAddress:validServerAddress(match[1]),serverPassword:password};
}
function serverConnectionCommand(data,launch=false) {
  const connection=parseServerConnection((data.serverAddress || '')+(data.serverPassword?' ; password "'+data.serverPassword+'"':''));
  if(!connection.serverAddress)return '';
  const password=connection.serverPassword;
  return launch?(password?'+password "'+password+'" ':'')+'+connect '+connection.serverAddress:'connect '+connection.serverAddress+(password?'; password "'+password+'"':'');
}
function balanceRosters(teams,random=Math.random,{defaultRating=3,maxRating=5}={}) {
  const size=teams[0]?.players.length,players=teams.flatMap(t=>t.players);
  if(!size || teams.some(t=>t.players.length!==size))throw Error('Balance complete teams only.');
  const rating=p=>p.rating ?? defaultRating;
  if(players.some(p=>!Number.isInteger(rating(p)) || rating(p)<1 || rating(p)>maxRating))throw Error('Skill ratings must be whole numbers from 1 to '+maxRating+'.');
  const shuffled=players.map(p=>({p,key:random()})).sort((a,b)=>a.key-b.key).map(x=>x.p);
  let rosters;
  if(teams.length===2){
    const total=players.reduce((sum,p)=>sum+rating(p),0);let best=Infinity,pick=[],ties=0;
    function choose(start,chosen,sum){if(chosen.length===size){const difference=Math.abs(total-2*sum);if(difference<best){best=difference;pick=[...chosen];ties=1;}else if(difference===best && random()<1/++ties)pick=[...chosen];return;}for(let i=start;i<=shuffled.length-(size-chosen.length);i++)choose(i+1,[...chosen,i],sum+rating(shuffled[i]));}
    choose(0,[],0);const indexes=new Set(pick);rosters=[shuffled.filter((p,i)=>indexes.has(i)),shuffled.filter((p,i)=>!indexes.has(i))];
  }else{
    rosters=teams.map(()=>[]);const totals=teams.map(()=>0);
    for(const player of shuffled.sort((a,b)=>rating(b)-rating(a))){const candidates=rosters.map((r,i)=>i).filter(i=>rosters[i].length<size).sort((a,b)=>totals[a]-totals[b] || rosters[a].length-rosters[b].length);const i=candidates[0];rosters[i].push(player);totals[i]+=rating(player);}
  }
  return teams.map((team,i)=>{const next={...team,players:rosters[i]};delete next.captainId;return next;});
}
function rivalryRosters(players,pairs,random=Math.random){
  const size=players.length/2,byId=new Map(players.map(player=>[player.id,player]));
  const rosters=[[],[]],paired=new Set();
  if(!Number.isInteger(size) || size<2 || size>5 || byId.size!==players.length || !pairs.length)throw Error('Select two complete teams and at least one rivalry.');
  for(const [first,second] of pairs){
    if(first===second || !byId.has(first) || !byId.has(second) || paired.has(first) || paired.has(second))throw Error('Each player can be in one rivalry.');
    paired.add(first);paired.add(second);
    const side=random()<.5?0:1;
    rosters[side].push(byId.get(first));rosters[1-side].push(byId.get(second));
  }
  const unpaired=players.filter(player=>!paired.has(player.id));
  for(let i=unpaired.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));[unpaired[i],unpaired[j]]=[unpaired[j],unpaired[i]];
  }
  rosters[0].push(...unpaired.slice(0,size-rosters[0].length));rosters[1].push(...unpaired.slice(size-rosters[1].length));
  return rosters;
}
function swapDraftPlayers(teams,first,second){
  const next=structuredClone(teams),a=next.find(t=>t.players.some(p=>p.id===first)),b=next.find(t=>t.players.some(p=>p.id===second));
  if(!a || !b || a===b)throw Error('Select one player from each of two different teams.');
  const ai=a.players.findIndex(p=>p.id===first),bi=b.players.findIndex(p=>p.id===second);[a.players[ai],b.players[bi]]=[b.players[bi],a.players[ai]];
  for(const team of [a,b])if(!team.players.some(p=>p.id===team.captainId))delete team.captainId;
  return next;
}
function discordMatchText(data,resolve){
  const state=resolve(data),match=state.matches.find(m=>!m.skipped && !m.result) || state.matches.filter(m=>!m.skipped).at(-1);
  const clean=value=>String(value).replace(/[@`*_~|<>\\]/g,'').replace(/[\r\n]/g,' ');
  const lines=[clean(data.headers?.brand || data.name),match?.map?'Map: '+clean(match.map):'Tournament teams'];
  const teams=match?.ids.every(Boolean)?match.ids.map(id=>state.teams.get(id)):data.teams;
  for(const team of teams){lines.push('',clean(team.name));for(const player of team.players || [])lines.push('• '+clean(player.name)+(team.captainId===player.id?' (Captain)':''));}
  if(match?.result)lines.push('','Score: '+match.result.scores.join(' – '));
  return lines.join('\n');
}
function advanceMapVeto(maps,teams,bans,map){
  const remaining=maps.filter(name=>!bans.some(b=>b.map===name));
  if(teams.length!==2 || remaining.length<2 || !remaining.includes(map))throw Error('Choose an available map while at least two remain.');
  const next=[...bans,{teamId:teams[bans.length%2].id,map}],left=remaining.filter(name=>name!==map);
  return {bans:next,selected:left.length===1?left[0]:null};
}
function manualRosters(players,assignments,size){
  if(![2,3,4,5].includes(size) || players.length<size*2 || players.length%size || assignments.length!==players.length)throw Error('Select enough players for complete teams.');
  const byId=new Map(players.map(p=>[p.id,p]));
  if(byId.size!==players.length || new Set(assignments).size!==players.length || assignments.some(id=>!byId.has(id)))throw Error('Assign every selected player once, with no empty slots.');
  return Array.from({length:players.length/size},(_,i)=>assignments.slice(i*size,(i+1)*size).map(id=>structuredClone(byId.get(id))));
}
function createCaptainCases(players,size,captains,caseOrder){
  if(![2,3,4,5].includes(size) || players.length!==size*2 || new Set(players.map(p=>p.id)).size!==players.length)throw Error('Captain cases need exactly two complete teams.');
  const byId=new Map(players.map(p=>[p.id,p]));
  if(captains.length!==2 || captains[0]===captains[1] || captains.some(id=>!byId.has(id)))throw Error('Choose two different captains from the selected players.');
  const remaining=players.filter(p=>!captains.includes(p.id));
  if(caseOrder.length!==remaining.length || new Set(caseOrder).size!==remaining.length || caseOrder.some(id=>!remaining.some(p=>p.id===id)))throw Error('Every remaining player needs one case.');
  return {size,teams:captains.map((id,i)=>({id:'t'+(i+1),name:'Team '+String(i+1).padStart(2,'0'),tag:String(i+1).padStart(2,'0'),captainId:id,players:[structuredClone(byId.get(id))]})),cases:caseOrder.map(id=>({player:structuredClone(byId.get(id)),opened:false})),turn:0};
}
function openCaptainCase(state,index){
  if(!Number.isInteger(index) || !state.cases[index] || state.cases[index].opened || state.turn>=state.cases.length)throw Error('Choose an unopened case.');
  const next=structuredClone(state),team=next.teams[next.turn%2];
  if(team.players.length>=next.size)throw Error('This team is already full.');
  next.cases[index].opened=true;next.cases[index].teamId=team.id;team.players.push(next.cases[index].player);next.turn++;
  return next;
}
if(typeof module!=='undefined')module.exports={validServerAddress,parseServerConnection,serverConnectionCommand,balanceRosters,rivalryRosters,swapDraftPlayers,discordMatchText,advanceMapVeto,manualRosters,createCaptainCases,openCaptainCase};

function renderRosterReveal(root,mode,players,commit){
  const balanced=mode==='balanced',title=balanced?'Balanced Reveal':'Rivalry Draw';
  const ratings=new Map(players.map(player=>[player.id,5]));
  const names=new Map(players.map(player=>[player.id,player.name]));
  const pairs=[];
  const button=(label,action,secondary=false)=>{
    const control=element('button',secondary?'secondary':'',label);
    control.type='button';control.onclick=action;
    return control;
  };
  function setup(){
    root.replaceChildren(element('h3','',title));
    const status=element('p','rules');status.setAttribute('role','status');
    const begin=button('Begin reveal',()=>{
      try{
        const size=players.length/2;
        const rated=players.map(player=>({...player,rating:ratings.get(player.id)}));
        const rosters=balanced
          ? balanceRosters([{players:rated.slice(0,size)},{players:rated.slice(size)}],Math.random,{defaultRating:5,maxRating:10}).map(team=>team.players.map(player=>players.find(original=>original.id===player.id)))
          : rivalryRosters(players,pairs);
        reveal(rosters);
      }catch(error){status.textContent=error.message;}
    });
    if(balanced){
      root.append(element('p','rules','Rate each player from 1 to 10 stars. Everyone starts at 5.'));
      const grid=element('div','roster-rating-grid');
      players.forEach((player,index)=>{
        const field=element('fieldset','roster-rating'),value=element('span','roster-rating-value',ratings.get(player.id)+' / 10');
        const stars=element('div','roster-rating-stars');
        field.append(element('legend','',player.name),stars,value);
        for(let rating=1;rating<=10;rating++){
          const label=element('label','roster-rating-star'),radio=element('input'),star=element('span','','★');
          radio.type='radio';radio.name='roster-rating-'+index;radio.value=rating;radio.checked=ratings.get(player.id)===rating;
          radio.setAttribute('aria-label',rating===1?'1 star':rating+' stars');star.ariaHidden='true';
          radio.onchange=()=>{ratings.set(player.id,rating);value.textContent=rating+' / 10';};
          label.append(radio,star);stars.append(label);
        }
        grid.append(field);
      });
      root.append(grid);
    }else{
      root.append(element('p','rules','Pair players you want on opposite teams. Unpaired players fill the remaining slots at random.'));
      const builder=element('div','rivalry-builder'),list=element('ul','rivalry-pairs');
      const picks=['First rival','Second rival'].map(label=>{
        const field=element('label','',label),select=element('select');
        field.append(select);builder.append(field);return select;
      });
      function refresh(){
        const used=new Set(pairs.flat()),available=players.filter(player=>!used.has(player.id));
        for(const pick of picks){
          const blank=element('option','','Choose a player');blank.value='';
          pick.replaceChildren(blank);
          available.forEach(player=>{const option=element('option','',player.name);option.value=player.id;pick.append(option);});
          pick.disabled=available.length<2;
        }
        add.disabled=true;begin.disabled=!pairs.length;
        list.replaceChildren();
        pairs.forEach(([first,second],index)=>{
          const item=element('li'),remove=button('Remove',()=>{pairs.splice(index,1);refresh();picks[0].focus();},true);
          remove.setAttribute('aria-label','Remove rivalry between '+names.get(first)+' and '+names.get(second));
          item.append(element('strong','',names.get(first)+' vs '+names.get(second)),remove);list.append(item);
        });
      }
      const add=button('Add rivalry',()=>{pairs.push(picks.map(pick=>pick.value));refresh();(picks[0].disabled?begin:picks[0]).focus();},true);
      picks.forEach(pick=>{pick.onchange=()=>{add.disabled=picks.some(input=>!input.value) || picks[0].value===picks[1].value;};});
      builder.append(add);root.append(builder,list);refresh();
    }
    root.append(status,begin);
  }
  function reveal(rosters){
    root.replaceChildren(element('h3','',title));
    const status=element('p','rules');status.setAttribute('role','status');
    const board=element('div','roster-reveal-board');
    const lists=rosters.map((_,index)=>{
      const card=element('section','roster-reveal-team'),list=element('ol');
      card.append(element('h4','',index===0?'Team 01':'Team 02'),list);
      board.append(card);return list;
    });
    let count=0;
    const total=rosters[0].length;
    function show(to){
      const first=count;
      for(;count<to;count++)lists.forEach((list,index)=>list.append(element('li','player-arrives',rosters[index][count].name)));
      const last=count-1;
      status.textContent=first===last && !balanced && last<pairs.length
        ? 'Rivalry revealed · '+rosters[0][last].name+' vs '+rosters[1][last].name
        : count+' / '+total+' players revealed per team';
      next.hidden=all.hidden=count===total;
      finish.hidden=count!==total;
    }
    const actions=element('div','setup-navigation');
    const next=button('Reveal next pair',()=>{show(count+1);if(next.hidden)finish.focus();});
    const all=button('Reveal all',()=>{show(total);finish.focus();},true);
    const finish=button('Continue to map selection',()=>{
      try{commit(rosters,balanced?ratings:null,pairs);}
      catch(error){status.textContent=error.message;}
    });
    actions.append(button(balanced?'Edit ratings':'Edit rivalries',()=>{setup();root.querySelector('input,select')?.focus();},true),all,next,finish);
    root.append(status,board,actions);show(0);next.focus();
  }
  setup();
}

function createGameNightTools({saveServer,getData,getDraft,isOrganiser,isBusy,setMap,getMaps,setMapMethod,beginRematch,notify,getVoteEvent,startMapVote,readMapVote}) {
  const $=id=>document.getElementById(id);
  const draftRoot=element('section','map-draw-options'),methodRoot=element('div','map-method-control'),publicRoot=element('section','match-tools');
  let pendingMethod='',serverEditorOpen=false;
  let voteContext='',vote=null,voteTimer=null,voteError='',fetchingVote=false,voteEpoch=0;
  methodRoot.hidden=true;$('draw-stage').querySelector('.draw-roster').after(methodRoot);
  draftRoot.hidden=true;draftRoot.id='map-draw-options';publicRoot.id='match-tools';methodRoot.after(draftRoot);$('panel-leaderboard').append(publicRoot);
  const makeButton=(label,action)=>{const b=element('button','secondary',label);b.type='button';b.onclick=async()=>{try{await action();}catch(e){notify(e.message);}};return b;};
  function copyButton(label,getText){
    let timer;
    const button=makeButton(label,async()=>{
      if(!await copy(getText()))return;
      button.style.width=button.getBoundingClientRect().width+'px';
      button.textContent='✓ Copied';
      clearTimeout(timer);
      timer=setTimeout(()=>{
        button.textContent=label;
        button.style.removeProperty('width');
      },1600);
    });
    button.setAttribute('aria-live','polite');
    return button;
  }
  async function copy(text){try{await navigator.clipboard.writeText(text);return true;}catch{const dialog=element('dialog','options-dialog'),field=element('textarea');field.value=text;field.rows=12;field.readOnly=true;dialog.append(element('h2','','Copy match details'),field,makeButton('Close',()=>{dialog.close();dialog.remove();}));document.body.append(dialog);dialog.showModal();field.select();}}
  function controls(){$('panel-leaderboard').querySelectorAll('[data-server-toggle]').forEach(button=>{button.hidden=!isOrganiser();button.disabled=isBusy();button.setAttribute('aria-expanded',String(serverEditorOpen && isOrganiser()));});publicRoot.querySelectorAll('[data-server-editor]').forEach(form=>{form.hidden=!isOrganiser() || !serverEditorOpen;form.querySelectorAll('input,button').forEach(el=>el.disabled=isBusy());});publicRoot.hidden=![...publicRoot.children].some(child=>!child.hidden);[draftRoot,methodRoot].forEach(root=>root.querySelectorAll('input,select,button').forEach(el=>el.disabled=isBusy() || !isOrganiser() || (el.hasAttribute('data-map-vote-action') && fetchingVote)));const confirm=$('confirm-map-method');if(confirm)confirm.disabled=isBusy() || !isOrganiser() || !$('map-selection-method').value || !!getDraft()?.mapMethod;$('panel-leaderboard').querySelectorAll('[data-rematch]').forEach(el=>{el.hidden=!isOrganiser();el.disabled=isBusy();});}
  function voteKey(){
    const method=getDraft()?.mapMethod,eventId=getVoteEvent?.();
    return eventId && ['duel','player-vote'].includes(method)?eventId+':'+method:'';
  }
  function mapCandidates(){
    const method=getDraft()?.mapMethod;
    if(method==='player-vote')return voteKey()===voteContext?(vote?.result?.finalists || []):[];
    return ['wheel','case'].includes(method)?getMaps():[];
  }
  async function updateVote(create=false,interactive=false){
    const key=voteKey();
    if(!key || key!==voteContext || fetchingVote || !isOrganiser())return;
    const eventId=getVoteEvent(),previous=vote,epoch=voteEpoch;
    if(!create && !previous)return;
    clearTimeout(voteTimer);
    fetchingVote=true;
    if(interactive)controls();
    let refresh=false;
    try{
      const next=create?await startMapVote(eventId,getDraft().mapMethod,getMaps()):await readMapVote(eventId);
      if(epoch!==voteEpoch || key!==voteKey() || !isOrganiser())return;
      if(!next || !create && next.id!==previous.id)throw Error('This Discord map vote is no longer active.');
      vote=next;
      refresh=Boolean(voteError) || JSON.stringify(previous)!==JSON.stringify(next);
      voteError='';
      if(next.result && !previous?.result){
        setMap(next.mode==='duel'?next.result.finalists[0]:null);
        refresh=false;
      }
    }catch(error){
      if(epoch!==voteEpoch || key!==voteKey())return;
      refresh=voteError!==error.message;
      voteError=error.message;
    }finally{
      if(epoch===voteEpoch){
        fetchingVote=false;
        if(refresh)renderDraft();
        else controls();
        if(vote && !vote.result && isOrganiser())voteTimer=setTimeout(()=>void updateVote(),5000);
      }
    }
  }
  function renderMapVote(section,method){
    const duel=method==='duel';
    section.append(element('h3','',duel?'Map Duel':'Player Vote'));
    if(!vote){
      section.append(element('p','rules',duel?'Two maps drawn from your pool go to Discord. The winning map is selected automatically.':'Players vote on your map pool in Discord. Up to three voted maps go into the case reel.'));
    }else{
      const submitted=vote.submitted || [];
      const status=element('p','rules',vote.result?'Voting closed':vote.closesAt?'Voting open in Discord':'Waiting for the Discord bot to post the vote');
      status.setAttribute('role','status');section.append(status);
      const voters=element('div','map-vote-voters');
      voters.append(element('strong','','Players voted · '+submitted.length));
      if(submitted.length){
        const list=element('ul');
        submitted.forEach(name=>list.append(element('li','',name)));
        voters.append(list);
      }
      section.append(voters);
      const choices=vote.result?vote.result.finalists:duel?vote.maps:[];
      if(choices.length){
        const cards=element('div','map-options map-vote-cards');
        choices.forEach(map=>{
          const card=element('div','map-picker-card');
          setMapBackdrop(card,map);
          card.append(element('span','map-picker-name',map));
          if(vote.result){
            const count=vote.result.counts[vote.maps.indexOf(map)];
            card.append(element('span','map-veto-card-action',count+' vote'+(count===1?'':'s')));
          }
          cards.append(card);
        });
        section.append(cards);
      }
      if(duel && vote.result?.coinFlip)section.append(element('p','rules','A coin flip broke the tie.'));
      if(vote.result && !choices.length)section.append(element('p','rules','No maps received votes. Start a new vote or choose another method.'));
    }
    if(voteError){const error=element('p','rules',voteError);error.setAttribute('role','alert');section.append(error);}
    if(!vote || !vote.result || !vote.result.finalists.length){
      const button=vote && !vote.result?makeButton('Refresh votes',()=>updateVote(false,true)):
        makeButton('Start Discord vote',()=>updateVote(true,true));
      button.dataset.mapVoteAction='';
      section.append(button);
    }
  }
  function renderDraft(){
    const key=voteKey();
    if(key!==voteContext){
      clearTimeout(voteTimer);
      voteEpoch++;
      voteContext=key;vote=null;voteError='';fetchingVote=false;
    }
    const wasHidden=methodRoot.hidden;
    draftRoot.replaceChildren();methodRoot.replaceChildren();const draft=getDraft();methodRoot.hidden=!draft || draft.format!=='single';draftRoot.hidden=true;
    $('draw-stage').classList.toggle('map-selection-stage',!methodRoot.hidden);
    $('draw-stage').classList.toggle('map-veto',!methodRoot.hidden && draft.mapMethod==='veto');
    if(methodRoot.hidden){pendingMethod='';$('draw-stage').querySelector('.draw-roster').before($('draw-stage').querySelector('.wheel-panel'));return;}
    draftRoot.after($('draw-stage').querySelector('.wheel-panel'));
    if(draft.format==='single'){
      const maps=getMaps(),section=element('section','veto-panel'),methodLabel=element('label','','Map selection method'),method=element('select');
      method.id='map-selection-method';
      for(const [value,label] of [['','Select a map selection method'],['wheel','Spinning wheel'],['case','Case-opening reel'],['veto','Teams ban maps'],['duel','Map Duel · Discord'],['player-vote','Player Vote · Discord']]){
        const discord=['duel','player-vote'].includes(value);
        const option=element('option','',discord && !getVoteEvent?.()?label+' (Discord event required)':label);option.value=value;
        option.disabled=discord && (!getVoteEvent?.() || maps.length<2);
        method.append(option);
      }
      method.value=draft.mapMethod || pendingMethod;
      method.onchange=()=>{pendingMethod=method.value;setMapMethod(null);};
      methodLabel.append(method);methodRoot.append(methodLabel);
      const confirm=makeButton(draft.mapMethod?'Method confirmed':'Confirm map selection',()=>{if(!method.value || isBusy() || !isOrganiser())return;pendingMethod=method.value;setMapMethod(method.value);});
      confirm.id='confirm-map-method';methodRoot.append(confirm);
      const note=element('p','rules',draft.mapMethod?'Choose another method to change how the map is selected.':'Select a method and confirm to reveal its controls.');methodRoot.append(note);
      if(!draft.mapMethod){
        controls();
        confirm.disabled=isBusy() || !isOrganiser() || !method.value;
        if(wasHidden && !$('draw-stage').classList.contains('fullscreen-fallback')){
          methodRoot.scrollIntoView({block:'center',behavior:'smooth'});
        }
        return;
      }
      confirm.disabled=true;
      if(method.value==='veto'){
        const bans=draft.mapVeto || [],left=maps.filter(map=>!bans.some(b=>b.map===map)),team=draft.teams[bans.length%2];
        const history=bans.map(ban=>(draft.teams.find(t=>t.id===ban.teamId)?.name || 'Team')+' bans '+ban.map);
        if(history.length){
          const row=element('ol','broadcast-history');
          row.setAttribute('aria-label','Map bans in order');
          history.forEach(line=>row.append(element('li','',line)));
          section.append(row);
        }
        if(left.length===1){
          const hero=element('div','single-match-map');
          setMapBackdrop(hero,left[0]);
          hero.setAttribute('role','status');
          hero.append(element('span','eyebrow','SELECTED MAP / CUSTOM '+draft.teamSize+'V'+draft.teamSize),element('h3','',left[0]));section.append(hero);
        }else if(left.length>1){
          const hero=element('div','single-match-map');hero.setAttribute('role','status');
          hero.append(element('span','eyebrow','MAP VETO / CUSTOM '+draft.teamSize+'V'+draft.teamSize),element('h3','',team.name+' bans next'),element('p','rules','The organiser clicks on behalf of each team.'));section.append(hero);
        }else section.append(element('p','rules','Select at least one map.'));
        if(left.length>1){
          const cards=element('div','map-options map-veto-options');
          maps.forEach(map=>{
            const banned=bans.some(ban=>ban.map===map);
            const card=banned?element('div','map-picker-card map-veto-banned'):makeButton('',()=>{
              if(isBusy() || !isOrganiser())return;
              const result=advanceMapVeto(maps,draft.teams,bans,map);
              draft.mapVeto=result.bans;
              if(result.selected)setMap(result.selected);
              else {
                renderDraft();
                draftRoot.querySelector('.map-veto-options button:not(:disabled)')?.focus({preventScroll:true});
              }
              broadcastBan(team.name+' bans '+map);
            });
            if(!banned){
              card.classList.add('map-picker-card');
              card.setAttribute('aria-label','Ban '+map);
            }
            setMapBackdrop(card,map);
            card.append(element('span','map-picker-name',map),element('span','map-veto-card-action',banned?'Banned':'Ban'));
            cards.append(card);
          });
          section.append(cards);
        }
        if(left.length===1 && draft.matches[0].map!==left[0])section.append(makeButton('Confirm '+left[0],()=>setMap(left[0])));
        const resetRow=element('div','veto-reset-actions'),reset=makeButton('Restart veto',()=>{draft.mapVeto=[];setMap(null);});
        if(bans.length)resetRow.append(makeButton('Undo last ban',()=>{
          if(isBusy() || !isOrganiser())return;
          const restored=bans[bans.length-1].map;
          draft.mapVeto=bans.slice(0,-1);
          setMap(null);
          const buttons=[...draftRoot.querySelectorAll('.map-veto-options button')];
          buttons.find(button=>button.getAttribute('aria-label')==='Ban '+restored)?.focus();
        }));
        reset.classList.add('danger');resetRow.append(reset);section.append(resetRow);
      }
      else if(key)renderMapVote(section,draft.mapMethod);
      draftRoot.hidden=draft.mapMethod!=='veto' && !key;draftRoot.append(section);
    }
    controls();
  }
  function render(){
    publicRoot.replaceChildren();document.querySelector('[data-match-connect]')?.remove();let connectButton=null;const data=getData(),actions=element('div','game-actions');
    if(data.teams.length)actions.append(copyButton('Copy match details for Discord',()=>discordMatchText(getData(),resolveTournament)));
    if(data.serverAddress){
      const connection=parseServerConnection(serverConnectionCommand(data)),connect=element('a','connect-launch match-connect','Connect to match');connect.dataset.matchConnect='';connectButton=connect;
      connect.href='steam://connect/'+connection.serverAddress+(connection.serverPassword?'/'+encodeURIComponent(connection.serverPassword):'');
      actions.append(copyButton('Copy server connection',()=>serverConnectionCommand(getData())));
    }
    if(data.format==='single' && data.teamSize>=2){const rematch=makeButton('Rematch · Same teams, new map',beginRematch);rematch.dataset.rematch='';actions.append(rematch);}
    const matchActions=document.querySelector('.match-published-actions');
    if(matchActions){actions.classList.add('match-extra-actions');matchActions.querySelector('.match-extra-actions')?.remove();matchActions.append(actions);}
    else publicRoot.append(actions);
    if(connectButton)(document.querySelector('.match-broadcast-connect') || publicRoot).prepend(connectButton);
    if(data.format==='single' && data.teams.length){
      const form=element('form','setup-card');form.dataset.serverEditor='';form.id='match-server-editor';
      const toggle=makeButton('Add server',()=>{serverEditorOpen=!serverEditorOpen;controls();if(serverEditorOpen)form.querySelector('input').focus();});toggle.dataset.serverToggle='';toggle.setAttribute('aria-controls',form.id);toggle.classList.remove('secondary');actions.append(toggle);
      form.append(element('h3','','Match server'),element('p','rules','Once your game server is ready, add its address here. Saving updates Connect to match in Discord. Paste the full connect command, including a password if required. These details are published for players on the website and in its public repository. Leave blank to remove them.'));
      const label=element('label','','Server connection details'),input=document.createElement('input');input.value=data.serverAddress?serverConnectionCommand(data):'';input.placeholder='server.example.com:27015';input.maxLength=450;input.autocomplete='off';label.append(input);
      const status=element('p','rules');status.setAttribute('role','status');const serverActions=element('div','setup-navigation'),save=element('button','','Save server details');save.type='submit';serverActions.append(save);form.append(label,status,serverActions);
      form.onsubmit=async event=>{
        event.preventDefault();
        if(!isOrganiser() || isBusy())return;
        try {
          await saveServer(input.value);
          serverEditorOpen=false;
          controls();
          $('panel-leaderboard').querySelector('[data-server-toggle]')?.focus();
          notify('Server details saved. Discord updates automatically within 30 seconds.');
        } catch(error) {
          status.textContent=error.message;
        }
      };
      publicRoot.append(form);
    }
    const past=(data.history || []).filter(entry=>entry.tournament.format==='single').slice(-8).reverse();
    publicRoot.hidden=!data.teams.length && !data.serverAddress && !past.length;
    const completed=data.format==='single' && data.matches[0]?.result;
    if(past.length || completed){publicRoot.append(element('h3','','Recent custom matches'));const list=element('div','recent-matches');
      for(const entry of [...(completed?[{title:'Current match',tournament:data}]:[]),...past]){const state=resolveTournament(entry.tournament),match=state.matches[0],card=element('article','recent-match');card.append(element('strong','',match.map || 'Custom match'),element('p','',match.ids.map(id=>state.teams.get(id).name).join(' vs ')+' · '+match.result.scores.join(' – ')),element('p','rules','Winner: '+(state.teams.get(match.winner)?.name || 'Draw')),element('small','',entry.title));list.append(card);}publicRoot.append(list);
    }publicRoot.hidden=!publicRoot.children.length;controls();
  }
  return {render,renderDraft,controls,mapCandidates};
}
