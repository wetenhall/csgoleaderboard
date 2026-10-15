const path=require('node:path');
let fontLoaded=false;
function renderTeamImages(data){
  const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
  if(!fontLoaded){GlobalFonts.registerFromPath(path.join(__dirname,'../assets/fonts/Rajdhani-Bold.ttf'),'Rajdhani');fontLoaded=true;}
  const images=[],teams=data.teams || [];
  for(let offset=0;offset<teams.length;offset+=8){
    const page=teams.slice(offset,offset+8),rows=Math.ceil(page.length/2),cardHeight=145+Math.max(1,...page.map(t=>t.players?.length||0))*86,height=200+rows*cardHeight+(rows-1)*30+30;
    const canvas=createCanvas(1600,height),ctx=canvas.getContext('2d');
    const text=(value,x,y,size,color='#f4f4f4',width=670,align='left')=>{ctx.fillStyle=color;ctx.textAlign=align;ctx.font='700 '+size+'px Rajdhani, sans-serif';while(ctx.measureText(String(value)).width>width && size>12){size--;ctx.font='700 '+size+'px Rajdhani, sans-serif';}ctx.fillText(String(value),x,y);};
    ctx.fillStyle='#101316';ctx.fillRect(0,0,1600,height);
    const gradient=ctx.createLinearGradient(30,0,1570,170);gradient.addColorStop(0,'#352b1d');gradient.addColorStop(1,'#23272f');ctx.fillStyle=gradient;ctx.fillRect(30,30,1540,140);ctx.fillStyle='#ff9b01';ctx.fillRect(30,30,1540,5);
    const map=data.format==='single'?data.matches?.[0]?.map:null;
    text((map?'SELECTED MAP / CUSTOM ':'PUBLISHED TEAMS / ')+data.teamSize+'V'+data.teamSize,800,76,28,'#ff9b01',1400,'center');
    text((map || data.headers?.banner || data.name || 'Teams').toUpperCase(),800,143,map?64:52,'#ff9b01',1400,'center');
    page.forEach((team,i)=>{
      const x=30+(i%2)*820,y=200+Math.floor(i/2)*(cardHeight+30),players=team.players || [];
      ctx.fillStyle='#23272f';ctx.fillRect(x,y,720,cardHeight);ctx.strokeStyle='#424b55';ctx.strokeRect(x,y,720,cardHeight);ctx.fillStyle=i%2===0?'#70b4cd':'#ff9b01';ctx.fillRect(x,y,720,4);
      text(team.name,x+30,y+57,46,i%2===0?'#70b4cd':'#ff9b01',660);text(players.length+' PLAYER'+(players.length===1?'':'S'),x+30,y+94,24,i%2===0?'#70b4cd':'#ff9b01');
      players.forEach((player,j)=>{
        const line=y+120+j*86;ctx.strokeStyle='#424b55';ctx.beginPath();ctx.moveTo(x+30,line);ctx.lineTo(x+690,line);ctx.stroke();
        text(String(j+1).padStart(2,'0'),x+30,line+57,24,'#b8bcbf',35);text(player.name+(team.captainId && team.captainId===player.id?' (C)':''),x+80,line+57,48,'#f4f4f4',605);
      });
    });
    if(page.length===2)text('VS',800,200+cardHeight/2,30,'#b8bcbf',70,'center');
    images.push({name:'teams-'+(images.length+1)+'.png',attachment:canvas.toBuffer('image/png')});
  }
  return images;
}
module.exports={renderTeamImages};

