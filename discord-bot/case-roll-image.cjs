const path=require('node:path');
const {isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createCanvas,GlobalFonts,GifEncoder}=require('@napi-rs/canvas');
const WIDTH=720,HEIGHT=300,STEP=156,CARD=146,FRAMES=80;
GlobalFonts.registerFromPath(path.join(__dirname,'../assets/fonts/Rajdhani-Bold.ttf'),'Rajdhani');

function frame(plan,progress){
  const canvas=createCanvas(WIDTH,HEIGHT),ctx=canvas.getContext('2d');
  const text=(s,x,y,size,color,width=680)=>{ctx.textAlign='center';ctx.fillStyle=color;ctx.font='700 '+size+'px Rajdhani, sans-serif';while(ctx.measureText(s).width>width&&size>10){ctx.font='700 '+(--size)+'px Rajdhani, sans-serif';}ctx.fillText(s,x,y);};
  ctx.fillStyle='#101316';ctx.fillRect(0,0,WIDTH,HEIGHT);
  text('PULL UP / MEMBER CASE',WIDTH/2,36,25,'#ffad32');
  text(progress<1?'UNLOCKING…':'MEMBER UNBOXED',WIDTH/2,63,15,'#a9b2bf');
  ctx.save();ctx.beginPath();ctx.rect(12,82,WIDTH-24,154);ctx.clip();
  const start=2*STEP,finish=plan.stop*STEP,offset=start+(finish-start)*(1-Math.pow(1-progress,4));
  const colors=['#4b86e8','#9062da','#d04ac2','#d85460','#d8ad48'];
  plan.cards.forEach((name,index)=>{
    const x=WIDTH/2+(index*STEP-offset)-CARD/2;if(x+CARD<0||x>WIDTH)return;
    const selected=progress===1&&index===plan.stop,color=selected?'#ffbd45':colors[index%colors.length];
    const gradient=ctx.createLinearGradient(0,86,0,230);gradient.addColorStop(0,selected?'#49371e':'#2b303e');gradient.addColorStop(1,'#181d27');ctx.fillStyle=gradient;ctx.fillRect(x,86,CARD,144);
    ctx.fillStyle=color;ctx.fillRect(x,226,CARD,4);ctx.strokeStyle=selected?'#ffbd45':'#3c4453';ctx.lineWidth=selected?2:1;ctx.strokeRect(x+1,87,CARD-2,142);
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(x+CARD/2,126,14,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(x+CARD/2,156,25,13,0,Math.PI,Math.PI*2);ctx.fill();
    text(name,x+CARD/2,199,22,'#f5f6fa',CARD-14);
    text(selected?'SELECTED':'SERVER MEMBER',x+CARD/2,219,11,color,CARD-12);
  });
  ctx.restore();
  for(const [x,end] of [[12,82],[WIDTH-12,WIDTH-82]]){const g=ctx.createLinearGradient(x,0,end,0);g.addColorStop(0,'#101316');g.addColorStop(1,'#10131600');ctx.fillStyle=g;ctx.fillRect(Math.min(x,end),82,70,154);}
  ctx.fillStyle='#ffbd45';ctx.fillRect(WIDTH/2-1,80,2,159);ctx.beginPath();ctx.moveTo(WIDTH/2-7,75);ctx.lineTo(WIDTH/2+7,75);ctx.lineTo(WIDTH/2,85);ctx.closePath();ctx.fill();
  text(progress===1?plan.cards[plan.stop]:plan.count+' MEMBERS · ONE RANDOM PICK',WIDTH/2,275,progress===1?27:18,progress===1?'#ffbd45':'#a9b2bf');
  return canvas;
}
function renderAnimation(plan){
  const encoder=new GifEncoder(WIDTH,HEIGHT,{repeat:1,quality:12});
  try{
    for(let i=0;i<=FRAMES;i++){
      const canvas=frame(plan,i/FRAMES),ctx=canvas.getContext('2d');
      const pixels=ctx.getImageData(0,0,WIDTH,HEIGHT).data;
      encoder.addFrame(new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength),WIDTH,HEIGHT,{delay:i===FRAMES?1800:50});
    }
    // A NETSCAPE loop count of 1 means one repeat after the first playback.
    // Omit that extension entirely so Discord plays the GIF only once.
    const gif=encoder.finish();
    const loop=Buffer.from([0x21,0xff,0x0b,...Buffer.from('NETSCAPE2.0'),0x03,0x01,0x01,0x00,0x00]);
    const index=gif.indexOf(loop);
    return index<0?gif:Buffer.concat([gif.subarray(0,index),gif.subarray(index+loop.length)]);
  }finally{encoder.dispose();}
}
if(!isMainThread)parentPort.postMessage({animation:renderAnimation(workerData),still:frame(workerData,1).toBuffer('image/png')});
module.exports={frame,renderAnimation,WIDTH,HEIGHT};
