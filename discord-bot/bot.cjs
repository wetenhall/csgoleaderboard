const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Client,GatewayIntentBits,Events,PermissionFlagsBits,SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,EmbedBuilder,escapeMarkdown,MessageFlags}=require('discord.js');
const {register,publishEvent,teamAnnouncements}=require('./core.cjs');
const {renderTeamImages}=require('./team-image.cjs');
for(const key of ['DISCORD_TOKEN','DISCORD_GUILD_ID','GITHUB_TOKEN','GITHUB_REPOSITORY','GITHUB_BRANCH','SITE_URL'])if(!process.env[key])throw Error('Missing '+key);
if(!/^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY))throw Error('Invalid repository.');
if(new URL(process.env.SITE_URL).protocol!=='https:')throw Error('SITE_URL must use HTTPS.');
const file=path.resolve(process.env.DATA_FILE || './data/events.json');
let data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{events:[]};
function save(){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);}
function admin(i){return i.memberPermissions?.has(PermissionFlagsBits.Administrator) || (process.env.DISCORD_ADMIN_ROLE_ID && i.member.roles.cache.has(process.env.DISCORD_ADMIN_ROLE_ID));}
const client=new Client({intents:[GatewayIntentBits.Guilds]});
function card(event){
  const rows=[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('register:'+event.id).setLabel('Register me to play').setStyle(ButtonStyle.Primary).setDisabled(!!event.publishedAt),
    new ButtonBuilder().setCustomId('withdraw:'+event.id).setLabel('Withdraw').setStyle(ButtonStyle.Secondary).setDisabled(!!event.publishedAt),
    new ButtonBuilder().setCustomId('publish:'+event.id).setLabel('Publish game').setStyle(ButtonStyle.Success).setDisabled(!!event.publishedAt || event.players.length!==event.capacity))];
  if(event.publishedAt)rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('View tournament').setStyle(ButtonStyle.Link).setURL(process.env.SITE_URL)));
  return {embeds:[new EmbedBuilder().setTitle(event.title).setColor(0xf5a623).setDescription(event.players.length?event.players.map((p,i)=>(i+1)+'. '+escapeMarkdown(p.name)).join('\n'):'No players registered yet.').setFooter({text:event.players.length+'/'+event.capacity+' players · '+(event.publishedAt?'Published · roster locked':'Submit your gaming name to register. Names become public when published.')})],components:rows,allowedMentions:{parse:[]}};
}
async function update(event){const channel=await client.channels.fetch(event.channelId);const message=await channel.messages.fetch(event.messageId);await message.edit(card(event));}
client.once(Events.ClientReady,async()=>{
  const command=new SlashCommandBuilder().setName('playgame').setDescription('Create a tournament registration event').setDMPermission(false).addStringOption(o=>o.setName('title').setDescription('Event title').setRequired(true).setMaxLength(100)).addIntegerOption(o=>o.setName('players').setDescription('Required players').setRequired(true).setMinValue(2).setMaxValue(64));
  await client.application.commands.create(command,process.env.DISCORD_GUILD_ID);
  const commands=await client.application.commands.fetch({guildId:process.env.DISCORD_GUILD_ID});
  for(const old of commands.values())if(['event','event-admin'].includes(old.name))await client.application.commands.delete(old.id,process.env.DISCORD_GUILD_ID);
  await client.application.commands.create(new SlashCommandBuilder().setName('playpublish').setDescription('Open your private event publishing panel').setDMPermission(false),process.env.DISCORD_GUILD_ID);
  for(const event of data.events){try{await update(event);}catch{console.error('Could not refresh an existing event card. Check channel permissions.');}}
  console.log('Registration bot ready.');
  void syncTeams();setInterval(()=>void syncTeams(),30000);
});
let queue=Promise.resolve();
let syncingTeams=false;
async function syncTeams(){
  if(syncingTeams)return;syncingTeams=true;
  const operation=queue.then(async()=>{
    const url='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/contents/tournament.json?ref='+encodeURIComponent(process.env.GITHUB_BRANCH);
    const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Team sync read failed.');
    const file=await response.json(),tournament=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
    const event=data.events.find(event=>event.id===tournament.discordEventId && event.publishedAt);
    if(!event || !tournament.teams?.length)return;
    const roster=teamAnnouncements(tournament,escapeMarkdown),signature='team-connect-v1:'+JSON.stringify([roster,tournament.serverAddress||'']);
    const map=tournament.format==='single'?tournament.matches?.[0]?.map:null;
    const descriptions=['Teams ready · '+tournament.teamSize+'v'+tournament.teamSize+(map?' · '+escapeMarkdown(map):'')];
    if(event.teamSignature===signature)return;
    const channel=await client.channels.fetch(event.channelId),registration=await channel.messages.fetch(event.messageId);
    const images=renderTeamImages(tournament);
    event.teamMessageIds ||= [];
    for(let i=0;i<descriptions.length;i++){
      const payload={embeds:[new EmbedBuilder().setTitle((event.title+' · Teams').slice(0,256)).setColor(0xf5a623).setDescription(descriptions[i]).setURL(process.env.SITE_URL)],allowedMentions:{parse:[],repliedUser:false}};
      payload.attachments=[];
      const actions=new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('View game').setStyle(ButtonStyle.Link).setURL(process.env.SITE_URL));
      if(tournament.serverAddress){const link=new URL('connect.html',process.env.SITE_URL.endsWith('/')?process.env.SITE_URL:process.env.SITE_URL+'/');link.searchParams.set('event',event.id);actions.addComponents(new ButtonBuilder().setLabel('Connect to match').setStyle(ButtonStyle.Link).setURL(link.href));}
      payload.components=[actions];
      if(i===0 && images.length){
        payload.files=images;payload.embeds[0].setImage('attachment://'+images[0].name);
        for(const image of images.slice(1))payload.embeds.push(new EmbedBuilder().setImage('attachment://'+image.name));
      }
      let message=null;
      if(event.teamMessageIds[i])try{message=await channel.messages.fetch(event.teamMessageIds[i]);}catch(error){if(error.code!==10008)throw error;}
      if(message)await message.edit(payload);
      else {message=await registration.reply(payload);event.teamMessageIds[i]=message.id;save();}
    }
    for(const id of event.teamMessageIds.slice(descriptions.length))try{await channel.messages.delete(id);}catch(error){if(error.code!==10008)throw error;}
    event.teamMessageIds=event.teamMessageIds.slice(0,descriptions.length);event.teamSignature=signature;save();
  });
  queue=operation.catch(()=>{});
  try{await operation;}catch{console.error('Could not sync published teams to Discord. Will retry automatically.');}finally{syncingTeams=false;}
}
client.on(Events.InteractionCreate,async i=>{
  if(i.guildId!==process.env.DISCORD_GUILD_ID)return;
  try{
    if(i.isChatInputCommand() && i.commandName==='playpublish'){
      if(!admin(i))return i.reply({content:'Only event organisers can open this panel.',flags:MessageFlags.Ephemeral});
      const events=data.events.filter(e=>!e.publishedAt).slice(-25).reverse();
      if(!events.length)return i.reply({content:'No unpublished events. Create one with /playgame.',flags:MessageFlags.Ephemeral});
      const menu=new StringSelectMenuBuilder().setCustomId('admin-select').setPlaceholder('Select an event to publish').addOptions(events.map(e=>({label:e.title,value:e.id,description:e.players.length+'/'+e.capacity+' players registered'})));
      return i.reply({content:'Select an event. This panel is visible only to you. Showing the latest 25 unpublished events.',components:[new ActionRowBuilder().addComponents(menu)],flags:MessageFlags.Ephemeral});
    }
    if(i.isStringSelectMenu() && i.customId==='admin-select'){
      if(!admin(i))throw Error('Only event organisers can publish.');
      const event=data.events.find(e=>e.id===i.values[0]);if(!event)throw Error('Event unavailable.');
      return i.update({content:escapeMarkdown(event.title)+' · '+event.players.length+'/'+event.capacity+' players. Publishing locks registrations and makes gaming names public.',components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('publish:'+event.id).setLabel('Publish to site').setStyle(ButtonStyle.Success).setDisabled(!!event.publishedAt || event.players.length!==event.capacity))]});
    }
    if(i.isChatInputCommand() && i.commandName==='playgame'){
      if(!admin(i))return i.reply({content:'Only event organisers can create events.',flags:MessageFlags.Ephemeral});
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const event={id:randomUUID(),title:i.options.getString('title').trim(),capacity:i.options.getInteger('players'),players:[],channelId:i.channelId};
      if(!event.title)throw Error('Enter an event title.');
      const message=await i.channel.send(card(event));event.messageId=message.id;data.events.push(event);save();return i.editReply('Event created.');
    }
    if(!i.isButton() && !i.isModalSubmit())return;
    const [action,id]=i.customId.split(':'),event=data.events.find(e=>e.id===id);if(!event)throw Error('Event unavailable.');
    if(action==='register'){
      if(event.publishedAt)throw Error('Registration is closed.');
      const input=new TextInputBuilder().setCustomId('name').setLabel('Gaming name · Submit registers you to play').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setValue((event.players.find(p=>p.userId===i.user.id)?.name || i.member.displayName).slice(0,40));
      return i.showModal(new ModalBuilder().setCustomId('submit:'+id).setTitle('Register me to play').addComponents(new ActionRowBuilder().addComponents(input)));
    }
    if(!['submit','withdraw','publish'].includes(action))return;
    if(action==='publish' && !admin(i))throw Error('Only event organisers can publish.');
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const operation=queue.then(async()=>{
      if(action==='submit')register(event,i.user.id,i.fields.getTextInputValue('name'));
      if(action==='withdraw'){if(event.publishedAt)throw Error('Registration is closed.');event.players=event.players.filter(p=>p.userId!==i.user.id);}
      if(action==='publish'){
        if(event.publishedAt)throw Error('Already published.');
        event.publishedAt=await publishEvent(event,{repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,branch:process.env.GITHUB_BRANCH});
      }
      save();
      try{await update(event);}catch{throw Error('Your change was saved, but the event card could not update. Check bot channel permissions.');}
      await i.editReply(action==='publish'?'Roster published to GitHub. It will appear after deployment; use Refresh events on the site.':action==='withdraw'?'Registration removed.':'You are registered.');
    });queue=operation.catch(()=>{});await operation;
  }catch(error){const content=error.message || 'Action failed. Try again.';if(i.deferred || i.replied)await i.editReply({content}).catch(()=>{});else await i.reply({content,flags:MessageFlags.Ephemeral}).catch(()=>{});}
});
client.on(Events.Error,()=>console.error('Discord connection error. Check connection and credentials.'));
client.login(process.env.DISCORD_TOKEN);
