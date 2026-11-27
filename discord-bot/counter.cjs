const {randomUUID}=require('node:crypto');
const {SlashCommandBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags}=require('discord.js');
function parseDuration(value){
  const match=/^(\d{2}):([0-5]\d):([0-5]\d)$/.exec(String(value).trim());
  if(!match)throw Error('Enter a duration as HH:MM:SS, for example 00:10:00.');
  const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  if(!seconds)throw Error('The countdown must be longer than 00:00:00.');return seconds*1000;
}
function formatRemaining(endAt,now=Date.now()){
  const seconds=Math.max(0,Math.ceil((endAt-now)/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
function counterCommand(){return new SlashCommandBuilder().setName('cscounter').setDescription('Start a countdown in hours, minutes and seconds').setDMPermission(false).addStringOption(o=>o.setName('duration').setDescription('HH:MM:SS, for example 00:10:00. Leave blank to open the timer form.').setMaxLength(8));}
function createCounter({client,data,save,admin,now=Date.now,schedule=setTimeout,unschedule=clearTimeout,log=console}){
  const timers=new Map(),starting=new Set();data.counters ||= [];
  function payload(counter){const running=counter.status==='running',remaining=formatRemaining(counter.endAt,now());return {content:'⏱️ **Countdown**\n# '+(running?remaining:counter.status==='cancelled'?remaining:'00:00:00')+'\n'+(running?'Hours : Minutes : Seconds':counter.status==='cancelled'?'Countdown cancelled.':'Time’s up!'),components:running?[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('counter:cancel:'+counter.id).setLabel('Cancel timer').setStyle(ButtonStyle.Secondary))]:[],allowedMentions:{parse:[]}};}
  function stop(id){if(timers.has(id)){unschedule(timers.get(id));timers.delete(id);}}
  async function tick(counter){
    stop(counter.id);if(!['running','finished'].includes(counter.status))return;
    let updated=false;
    try{
      if(now()>=counter.endAt){counter.status='finished';save();}
      const channel=await client.channels.fetch(counter.channelId),message=await channel.messages.fetch(counter.messageId);
      await message.edit(payload(counter));updated=true;
    }catch(error){
      log.error('Countdown update failed:',error?.code||error?.name||'unknown');
      if([10003,10008,50001,50013].includes(error?.code)){counter.status='stopped';save();return;}
      // Retry transient errors without queuing overlapping message edits.
    }
    if(counter.status==='running' || (counter.status==='finished'&&!updated))timers.set(counter.id,schedule(()=>void tick(counter),updated?1000:5000));
    else if(counter.status==='finished'){data.counters=data.counters.filter(c=>c.id!==counter.id);save();}
  }
  async function resume(){for(const counter of [...data.counters]){if(['running','finished'].includes(counter.status))await tick(counter);} }
  async function handle(i){
    const command=i.isChatInputCommand() && i.commandName==='cscounter',modal=i.isModalSubmit?.() && i.customId==='counter:start',cancel=i.isButton?.() && i.customId?.startsWith('counter:cancel:');
    if(!command&&!modal&&!cancel)return false;
    if(cancel){
      const counter=data.counters.find(c=>c.id===i.customId.split(':')[2]);
      if(!counter || counter.status!=='running'){await i.reply({content:'This countdown has already ended.',flags:MessageFlags.Ephemeral});return true;}
      if(counter.ownerId!==i.user.id&&!admin(i)){await i.reply({content:'Only the timer creator or an organiser can cancel it.',flags:MessageFlags.Ephemeral});return true;}
      await i.deferUpdate();counter.status='cancelled';stop(counter.id);save();await i.message.edit(payload(counter));data.counters=data.counters.filter(c=>c.id!==counter.id);save();return true;
    }
    const duration=command?i.options.getString('duration'):i.fields.getTextInputValue('duration');
    if(!duration){await i.showModal(new ModalBuilder().setCustomId('counter:start').setTitle('Start countdown').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Hours : Minutes : Seconds').setPlaceholder('00:10:00').setStyle(TextInputStyle.Short).setMinLength(8).setMaxLength(8).setRequired(true))));return true;}
    const milliseconds=parseDuration(duration);
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if(starting.has(i.channelId) || data.counters.some(c=>c.channelId===i.channelId && c.status==='running')){await i.editReply('A countdown is already running in this channel. Cancel it before starting another.');return true;}
    starting.add(i.channelId);
    try{
      const counter={id:randomUUID(),channelId:i.channelId,ownerId:i.user.id,endAt:now()+milliseconds,status:'running'};
      const message=await i.channel.send(payload(counter));counter.messageId=message.id;data.counters.push(counter);save();
      timers.set(counter.id,schedule(()=>void tick(counter),1000));await i.editReply('Countdown started.');
    }finally{starting.delete(i.channelId);}return true;
  }
  return {handle,resume,tick,stop};
}
module.exports={parseDuration,formatRemaining,counterCommand,createCounter};
