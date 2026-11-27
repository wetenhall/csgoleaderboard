const {randomInt}=require('node:crypto');
const {Worker}=require('node:worker_threads');
const {EmbedBuilder,MessageFlags,escapeMarkdown}=require('discord.js');
const REVEAL_MS=6200;

async function serverCandidates(guild){
  const candidates=new Map();let after;
  for(;;){
    let page;
    try{page=await guild.members.list({limit:1000,after,cache:false});}
    catch(error){if(error.status===403 || error.code===50001 || error.code===50013)throw Error('To roll all server members, enable Server Members Intent in Discord Developer Portal → this application → Bot → Privileged Gateway Intents, then retry /csroll.');throw error;}
    for(const member of page.values())if(!member.user.bot)candidates.set(member.id,{id:member.id,name:member.displayName,username:member.user.username});
    if(page.size<1000)break;
    const next=[...page.keys()].reduce((a,b)=>BigInt(a)>BigInt(b)?a:b);
    if(next===after)throw Error('Could not finish reading server members. Try again.');after=next;
  }
  return [...candidates.values()];
}

function voiceCandidates(guild,userId){
  const channelId=guild.voiceStates.cache.get(userId)?.channelId;
  if(!channelId)throw Error('Join a voice channel first, then run /csrollchannel.');
  const channel=guild.channels.cache.get(channelId);
  if(!channel?.members)throw Error('Could not read your voice channel. Rejoin it and try again.');
  return [...channel.members.values()].filter(member=>!member.user.bot).map(member=>({id:member.id,name:member.displayName,username:member.user.username}));
}

function planRoll(candidates,pick=randomInt){
  if(!candidates.length)throw Error('There are no non-bot members to draw.');
  const winner=candidates[pick(candidates.length)];
  const cards=Array.from({length:42},()=>candidates[pick(candidates.length)].name);
  const stop=36;cards[stop]=winner.name;
  return {winner,cards,stop,count:candidates.length};
}

function renderRoll(plan){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(require.resolve('./case-roll-image.cjs'),{workerData:{cards:plan.cards,stop:plan.stop,count:plan.count}});
    const timer=setTimeout(()=>{void worker.terminate();reject(Error('The animation took too long to render. Try /csroll again.'));},30000);
    worker.once('message',result=>{clearTimeout(timer);resolve({animation:Buffer.from(result.animation),still:Buffer.from(result.still)});});
    worker.once('error',error=>{clearTimeout(timer);reject(error);});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('Could not render the case animation. Try again.'));});
  });
}

function createCaseRoll({render=renderRoll,candidates=serverCandidates,channelCandidates=voiceCandidates,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,pick=randomInt}={}){
  let busy=false;const lastRoll=new Map();
  return async function handle(i){
    if(!i.isChatInputCommand() || !['csroll','csrollchannel'].includes(i.commandName))return false;
    if(busy || now()-(lastRoll.get(i.guildId)??-Infinity)<15000){await i.reply({content:'A case is opening. Wait a few seconds before rolling again.',flags:MessageFlags.Ephemeral});return true;}
    busy=true;
    try{
      await i.deferReply();
      const channelOnly=i.commandName==='csrollchannel',scope=channelOnly?'members in your voice channel':'server members';
      const plan=planRoll(await (channelOnly?channelCandidates(i.guild,i.user.id):candidates(i.guild)),pick),image=await render(plan);
      const embed=new EmbedBuilder().setTitle('CASE OPENING · RANDOM MEMBER').setColor(0xff9b01).setDescription(plan.count+' non-bot '+scope+' · equal odds.').setImage('attachment://case-roll.gif');
      await i.editReply({embeds:[embed],files:[{attachment:image.animation,name:'case-roll.gif'}],allowedMentions:{parse:[]}});
      lastRoll.set(i.guildId,now());
      await wait(REVEAL_MS);
      embed.setTitle('UNBOXED · '+plan.winner.name.slice(0,100)).setDescription('**'+escapeMarkdown(plan.winner.name)+'** (@'+escapeMarkdown(plan.winner.username)+')\nSelected from '+plan.count+' non-bot '+scope+'.');
      embed.setImage('attachment://case-winner.png');
      await i.editReply({embeds:[embed],attachments:[],files:[{attachment:image.still,name:'case-winner.png'}],allowedMentions:{parse:[]}});
    }finally{busy=false;}
    return true;
  };
}
module.exports={serverCandidates,voiceCandidates,planRoll,renderRoll,createCaseRoll,REVEAL_MS};
