const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseDuration,formatRemaining,counterCommand,createCounter}=require('./counter.cjs');
test('counter accepts HH:MM:SS and clamps the countdown at zero without clock drift',()=>{
 assert.equal(parseDuration('01:02:03'),3723000);assert.equal(formatRemaining(3723000,0),'01:02:03');assert.equal(formatRemaining(1000,1),'00:00:01');assert.equal(formatRemaining(1000,2000),'00:00:00');
 for(const value of ['00:00:00','1:00:00','00:60:00','00:00:60','-1:00:00','100:00:00','abc'])assert.throws(()=>parseDuration(value));
 assert.equal(counterCommand().toJSON().name,'cscounter');
});
function setup(){
 let time=0,payload,modal,replies=[],pending=[],edits=0;
 const data={events:[]},message={id:'message',edit:async p=>{payload=p;edits++;}},channel={send:async p=>{payload=p;return message;},messages:{fetch:async()=>message}};
 const counter=createCounter({client:{channels:{fetch:async()=>channel}},data,save(){},admin:i=>i.organiser,now:()=>time,schedule:(fn,ms)=>{pending.push({fn,ms});return pending.length;},unschedule(){},log:{error(){}}});
 const interaction={channelId:'channel',channel,user:{id:'owner'},isChatInputCommand:()=>true,isModalSubmit:()=>false,isButton:()=>false,commandName:'cscounter',options:{getString:()=> '00:00:03'},deferReply:async()=>replies.push('deferred'),editReply:async text=>replies.push(text),reply:async p=>replies.push(p),showModal:async p=>{modal=p;}};
 return {data,counter,interaction,message,replies,pending,get payload(){return payload;},get modal(){return modal;},setTime:value=>{time=value;},get edits(){return edits;}};
}
test('counter starts publicly, updates from deadline and finishes without negative time or mentions',async()=>{
 const s=setup();assert.equal(await s.counter.handle(s.interaction),true);assert.match(s.payload.content,/00:00:03/);assert.deepEqual(s.payload.allowedMentions,{parse:[]});const c=s.data.counters[0];
 s.setTime(2200);await s.counter.tick(c);assert.match(s.payload.content,/00:00:01/);s.setTime(6000);await s.counter.tick(c);assert.match(s.payload.content,/00:00:00/);assert.match(s.payload.content,/Time’s up/);assert.equal(s.payload.components.length,0);assert.equal(s.data.counters.length,0);
});
test('bare command opens duration form and duplicate timers are refused',async()=>{
 const s=setup();s.interaction.options.getString=()=>null;await s.counter.handle(s.interaction);assert.equal(s.modal.toJSON().custom_id,'counter:start');
 s.interaction.options.getString=()=> '00:00:03';await s.counter.handle(s.interaction);await s.counter.handle(s.interaction);assert.equal(s.data.counters.length,1);assert.match(s.replies.at(-1),/already running/);
});
test('only creator or organiser can cancel; unrelated commands pass through',async()=>{
 const s=setup();await s.counter.handle(s.interaction);const c=s.data.counters[0],i={...s.interaction,commandName:'other',isChatInputCommand:()=>false,isButton:()=>true,customId:'counter:cancel:'+c.id,user:{id:'other'},message:s.message,deferUpdate:async()=>{}};
 await s.counter.handle(i);assert.equal(c.status,'running');i.organiser=true;await s.counter.handle(i);assert.match(s.payload.content,/cancelled/);assert.equal(s.data.counters.length,0);
 assert.equal(await s.counter.handle({...s.interaction,commandName:'other'}),false);
});
test('restart completes an expired persisted timer and retries a failed completion edit',async()=>{
 const s=setup();await s.counter.handle(s.interaction);s.setTime(4000);const edit=s.message.edit;s.message.edit=async()=>{throw Error('network');};await s.counter.resume();assert.equal(s.data.counters.length,1);assert.equal(s.pending.at(-1).ms,5000);
 s.message.edit=edit;await s.counter.resume();assert.equal(s.data.counters.length,0);assert.match(s.payload.content,/Time’s up/);
});
