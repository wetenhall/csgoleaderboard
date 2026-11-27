const test=require('node:test'),assert=require('node:assert/strict');
const {serverCandidates,planRoll,renderRoll,createCaseRoll,REVEAL_MS}=require('./case-roll.cjs');
const members=[{id:'1',name:'Alice',username:'alice'},{id:'2',name:'Bob',username:'bob'}];
test('case outcome selects each candidate directly and lands on the chosen member',()=>{
  for(let i=0;i<members.length;i++){
    const plan=planRoll(members,n=>i%n);assert.equal(plan.winner.id,members[i].id);assert.equal(plan.cards[plan.stop],members[i].name);assert.equal(plan.count,2);
  }
  assert.throws(()=>planRoll([]),/no non-bot/);
});
test('member list pages through the whole server and excludes bots without using the cache',async()=>{
  const page=new Map(Array.from({length:1000},(_,i)=>[String(i+1),{id:String(i+1),displayName:'Member '+i,user:{username:'user'+i,bot:i===0}}]));let calls=0;
  const result=await serverCandidates({members:{list:async options=>{assert.equal(options.cache,false);calls++;if(calls===1)return page;assert.equal(options.after,'1000');return new Map([['1001',{id:'1001',displayName:'Offline member',user:{username:'offline',bot:false}}]]);}}});
  assert.equal(calls,2);assert.equal(result.length,1000);assert.ok(result.some(m=>m.id==='1001'));assert.ok(!result.some(m=>m.id==='1'));
});
test('missing member access explains the Discord setting',async()=>{
  await assert.rejects(serverCandidates({members:{list:async()=>{throw {status:403};}}}),/Server Members Intent/);
});
test('case command acknowledges before loading, uploads the animation and reveals the same winner',async()=>{
  const calls=[];let payload;const handle=createCaseRoll({candidates:async()=>{calls.push('members');return members;},render:async plan=>{assert.equal(plan.winner.id,'2');return {animation:Buffer.from('gif'),still:Buffer.from('png')};},pick:()=>1,wait:async ms=>{assert.equal(ms,REVEAL_MS);assert.ok(!payload.embeds[0].data.title.includes('Bob'));}});
  const i={isChatInputCommand:()=>true,commandName:'csroll',guildId:'guild',guild:{},deferReply:async()=>calls.push('defer'),editReply:async p=>{payload=p;calls.push(p.files[0].name==='case-roll.gif'?'animation':'reveal');},reply:async()=>calls.push('cooldown')};
  assert.equal(await handle(i),true);assert.deepEqual(calls,['defer','members','animation','reveal']);assert.equal(payload.files[0].name,'case-winner.png');assert.deepEqual(payload.attachments,[]);assert.equal(payload.embeds[0].data.image.url,'attachment://case-winner.png');assert.match(payload.embeds[0].data.description,/Bob/);assert.deepEqual(payload.allowedMentions,{parse:[]});await handle(i);assert.equal(calls.at(-1),'cooldown');
});
test('failed rolls release the render lock and unrelated commands pass through',async()=>{
  const handle=createCaseRoll({candidates:async()=>{throw Error('member access');}}),i={isChatInputCommand:()=>true,commandName:'csroll',guildId:'guild',deferReply:async()=>{}};
  assert.equal(await handle({...i,commandName:'csgame'}),false);
  await assert.rejects(handle(i),/member access/);await assert.rejects(handle(i),/member access/);
});
test('worker produces an animated GIF within Discord attachment size',async()=>{
  const result=await renderRoll(planRoll(members)),bytes=result.animation;assert.equal(result.still.subarray(1,4).toString(),'PNG');assert.equal(bytes.subarray(0,6).toString(),'GIF89a');assert.ok(bytes.length<10*1024*1024);assert.equal(bytes.readUInt16LE(6),720);assert.equal(bytes.readUInt16LE(8),300);
  assert.ok(bytes.includes(Buffer.from([0x21,0xf9,0x04])));
  assert.equal(bytes.includes(Buffer.from('NETSCAPE2.0')),false,'single playback must omit the GIF looping extension');
});

test('voice draw includes only non-bot members of the caller voice channel',()=>{
 const {voiceCandidates}=require('./case-roll.cjs');const human={id:'1',displayName:'Alice',user:{username:'alice',bot:false}},bot={id:'bot',displayName:'Bot',user:{username:'bot',bot:true}};
 const guild={voiceStates:{cache:new Map([['caller',{channelId:'voice'}]])},channels:{cache:new Map([['voice',{members:new Map([['1',human],['bot',bot]])}],['other',{members:new Map([['2',{id:'2',displayName:'Bob',user:{username:'bob',bot:false}}]])}]])}};
 assert.deepEqual(voiceCandidates(guild,'caller'),[members[0]]);assert.throws(()=>voiceCandidates(guild,'disconnected'),/Join a voice channel/);
});
test('channel command uses the voice pool without fetching the server list',async()=>{
 let payload;const handle=createCaseRoll({candidates:async()=>{throw Error('must not read server');},channelCandidates:(guild,userId)=>{assert.equal(userId,'caller');return [members[0]];},render:async plan=>{assert.equal(plan.winner.id,'1');return {animation:Buffer.from('gif'),still:Buffer.from('png')};},wait:async()=>{}});
 await handle({isChatInputCommand:()=>true,commandName:'csrollchannel',guildId:'guild',guild:{},user:{id:'caller'},deferReply:async()=>{},editReply:async p=>{payload=p;}});assert.match(payload.embeds[0].data.description,/Alice/);assert.match(payload.embeds[0].data.description,/voice channel/);
});
