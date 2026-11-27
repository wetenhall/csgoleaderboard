const path=require('node:path');
const {mapImageUrl}=require('../app.js');

const width=1600;
const accent='#ff9b01';
const blue='#67afd3';
const border='#51606d';
let fontLoaded=false;

async function renderTeamAnnouncementImages(data,request=fetch){
  const map=data.format==='single' && data.teams?.length ? data.matches?.[0]?.map : null;
  const url=mapImageUrl(map);
  let backdrop=null;
  if(url){
    try{
      const response=await request(url,{signal:AbortSignal.timeout(3500)});
      if(response.ok){
        const {loadImage}=require('@napi-rs/canvas');
        backdrop=await loadImage(Buffer.from(await response.arrayBuffer()));
      }
    }catch{
      // A missing screenshot must not prevent the team announcement.
    }
  }
  return renderTeamImages(data,backdrop);
}

function drawShield(ctx,x,y,colour,symbol){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle=colour;
  ctx.beginPath();
  [[5,0],[45,0],[50,8],[45,42],[25,54],[5,42],[0,8]].forEach(([a,b],index)=>{
    if(index===0)ctx.moveTo(a,b);else ctx.lineTo(a,b);
  });
  ctx.closePath();ctx.fill();
  ctx.fillStyle='#141920';
  ctx.translate(25,24);
  ctx.beginPath();
  if(symbol==='star'){
    for(let i=0;i<10;i++){
      const angle=-Math.PI/2+i*Math.PI/5,radius=i%2?6:15;
      const a=Math.cos(angle)*radius,b=Math.sin(angle)*radius;
      if(i===0)ctx.moveTo(a,b);else ctx.lineTo(a,b);
    }
  }else{
    [[-17,-10],[-6,-4],[0,-10],[6,-4],[17,-10],[12,1],[7,4],[5,10],[0,14],[-5,10],[-7,4],[-12,1]].forEach(([a,b],index)=>{
      if(index===0)ctx.moveTo(a,b);else ctx.lineTo(a,b);
    });
  }
  ctx.closePath();ctx.fill();ctx.restore();
}

function renderTeamImages(data,backdrop=null){
  const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
  if(!fontLoaded){
    GlobalFonts.registerFromPath(path.join(__dirname,'../assets/fonts/Rajdhani-Bold.ttf'),'Rajdhani');
    fontLoaded=true;
  }
  const images=[],teams=data.teams || [];
  const single=data.format==='single' && teams.length===2;
  const map=single?data.matches?.[0]?.map:null;
  const title=data.headers?.banner || data.name || 'Teams';
  const format=data.teamSize+'V'+data.teamSize;
  const headerHeight=single?270:140;
  const rosterTop=headerHeight+50;

  for(let offset=0;offset<teams.length;offset+=8){
    const page=teams.slice(offset,offset+8),rows=Math.ceil(page.length/2);
    const cardHeight=105+Math.max(1,...page.map(team=>team.players?.length || 0))*70;
    const height=rosterTop+rows*cardHeight+(rows-1)*20+30;
    const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
    const text=(value,x,y,size,colour='#f4f4f4',maxWidth=670,align='left')=>{
      const label=String(value);
      ctx.fillStyle=colour;ctx.textAlign=align;ctx.font='700 '+size+'px Rajdhani, sans-serif';
      const measured=ctx.measureText(label).width;
      if(measured>maxWidth)ctx.font='700 '+Math.max(16,Math.floor(size*maxWidth/measured))+'px Rajdhani, sans-serif';
      ctx.fillText(label,x,y,maxWidth);
    };
    ctx.fillStyle='#101318';ctx.fillRect(0,0,width,height);
    const gradient=ctx.createLinearGradient(30,30,1570,30+headerHeight);
    gradient.addColorStop(0,'#352b1d');gradient.addColorStop(1,'#171b23');
    ctx.fillStyle=gradient;ctx.fillRect(30,30,1540,headerHeight);
    if(single && backdrop){
      const scale=Math.max(1540/backdrop.width,headerHeight/backdrop.height);
      const cropWidth=1540/scale,cropHeight=headerHeight/scale;
      ctx.drawImage(backdrop,(backdrop.width-cropWidth)/2,(backdrop.height-cropHeight)/2,cropWidth,cropHeight,30,30,1540,headerHeight);
      const tint=ctx.createLinearGradient(0,30,0,30+headerHeight);
      tint.addColorStop(0,'#15171bd9');tint.addColorStop(.4,'#412b0d55');tint.addColorStop(1,'#101318f5');
      ctx.fillStyle=tint;ctx.fillRect(30,30,1540,headerHeight);
    }
    ctx.fillStyle=accent;ctx.fillRect(30,30,1540,4);
    if(single){
      text('CUSTOM '+format,58,69,23,'#ffd28a',250);
      text('TEAMS READY',1540,69,23,'#ffd28a',250,'right');
      text((map || 'Map pending').toUpperCase(),800,160,82,accent,1390,'center');
      ctx.fillStyle='#11151ce8';ctx.fillRect(115,195,1370,78);
      ctx.strokeStyle=border;ctx.strokeRect(115,195,1370,78);
      ctx.fillStyle=accent;ctx.fillRect(115,195,4,78);
      ctx.fillStyle=blue;ctx.fillRect(1481,195,4,78);
      ctx.strokeStyle=border;ctx.beginPath();ctx.moveTo(738,195);ctx.lineTo(738,273);ctx.moveTo(862,195);ctx.lineTo(862,273);ctx.stroke();
      drawShield(ctx,139,207,accent,'star');
      drawShield(ctx,1411,207,blue,'wings');
      text(teams[0].name,207,250,42,'#f4f4f4',506);
      text('VS',800,249,38,'#f8ecce',108,'center');
      text(teams[1].name,1393,250,42,'#f4f4f4',506,'right');
    }else{
      text('PUBLISHED TEAMS / '+format,800,78,26,'#ffd28a',1400,'center');
      text(title.toUpperCase(),800,146,54,accent,1400,'center');
    }

    page.forEach((team,i)=>{
      const x=30+(i%2)*780,y=rosterTop+Math.floor(i/2)*(cardHeight+20);
      const players=team.players || [],colour=i%2===0?accent:blue;
      ctx.fillStyle='#22262e';ctx.fillRect(x,y,760,cardHeight);
      ctx.strokeStyle='#424b55';ctx.strokeRect(x,y,760,cardHeight);
      ctx.fillStyle=colour;ctx.fillRect(x,y,760,3);
      text(team.name+(single?' roster':''),x+26,y+47,39,'#f4f4f4',708);
      text(players.length+' PLAYER'+(players.length===1?'':'S'),x+26,y+79,21,colour);
      players.forEach((player,j)=>{
        const line=y+99+j*70;
        ctx.strokeStyle='#424b55';ctx.beginPath();ctx.moveTo(x+26,line);ctx.lineTo(x+734,line);ctx.stroke();
        text(String(j+1).padStart(2,'0'),x+26,line+47,23,'#b8bcbf',35);
        text(player.name+(team.captainId && team.captainId===player.id?' (C)':''),x+72,line+47,39,'#f4f4f4',662);
      });
    });
    images.push({name:'teams-'+(images.length+1)+'.png',attachment:canvas.toBuffer('image/png')});
  }
  return images;
}

module.exports={renderTeamImages,renderTeamAnnouncementImages};
