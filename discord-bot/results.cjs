const {resolveTournament}=require('../app.js');
const path=require('node:path');
function resultCards(tournament){
  const state=resolveTournament(tournament);
  return state.matches.filter(m=>m.result && !m.skipped && m.ids.every(Boolean)).map(match=>{const teams=match.ids.map(id=>state.teams.get(id)),names=teams.map(t=>tournament.teamSize===1?t.players[0].name:t.name),winner=match.winner?names[match.ids.indexOf(match.winner)]:null;return {id:match.id,map:match.map||match.result.importSource?.map||'',names,scores:match.result.scores,winner,players:teams.map(t=>t.players.map(p=>p.name)),tiebreak:!!match.result.tiebreakWinner};});
}
function resultImage(card){
  const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');GlobalFonts.registerFromPath(path.join(__dirname,'../assets/fonts/Rajdhani-Bold.ttf'),'Rajdhani');
  const canvas=createCanvas(1200,460),ctx=canvas.getContext('2d');ctx.fillStyle='#101316';ctx.fillRect(0,0,1200,460);ctx.fillStyle='#ff9b01';ctx.fillRect(24,24,1152,5);
  const text=(value,x,y,size,color,width=1100)=>{ctx.textAlign='center';ctx.fillStyle=color;ctx.font='700 '+size+'px Rajdhani';while(ctx.measureText(value).width>width&&size>14){size--;ctx.font='700 '+size+'px Rajdhani';}ctx.fillText(value,x,y);};
  text('FINAL RESULT · '+card.id.toUpperCase()+(card.map?' · '+card.map.toUpperCase():''),600,78,28,'#ff9b01');
  text(card.names[0],300,160,48,'#70b4cd',510);text(card.names[1],900,160,48,'#ff9b01',510);
  text(String(card.scores[0]),300,285,120,'#f4f4f4');text('–',600,270,72,'#b8bcbf');text(String(card.scores[1]),900,285,120,'#f4f4f4');
  text(card.winner?card.winner+' WINS'+(card.tiebreak?' · TIEBREAK':''):'DRAW',600,385,48,'#ff9b01');
  return canvas.toBuffer('image/png');
}
async function syncResultCards({tournament,event,channel,registration,save}){
  const {EmbedBuilder,escapeMarkdown}=require('discord.js'),cards=resultCards(tournament);event.resultMessages ||= {};
  for(const card of cards){const signature=JSON.stringify(card),old=event.resultMessages[card.id];if(old?.signature===signature)continue;
    const payload={embeds:[new EmbedBuilder().setTitle(('Final result · '+card.id.toUpperCase()).slice(0,256)).setColor(0xff9b01).setDescription((card.names.map((name,i)=>escapeMarkdown(name)+' **'+card.scores[i]+'**').join(' vs ')+'\n'+(card.winner?'Winner: '+escapeMarkdown(card.winner):'Draw')).slice(0,3900)).setImage('attachment://result.png')],files:[{attachment:resultImage(card),name:'result.png'}],attachments:[],allowedMentions:{parse:[],repliedUser:false}};
    let message;if(old?.id)try{message=await channel.messages.fetch(old.id);}catch(error){if(error.code!==10008)throw error;}
    if(message)await message.edit(payload);else message=await registration.reply(payload);
    event.resultMessages[card.id]={id:message.id,signature};save();
  }
  for(const [id,entry] of Object.entries(event.resultMessages)){if(cards.some(c=>c.id===id))continue;try{await channel.messages.delete(entry.id);}catch(error){if(error.code!==10008)throw error;}delete event.resultMessages[id];save();}
}
module.exports={resultCards,resultImage,syncResultCards};
