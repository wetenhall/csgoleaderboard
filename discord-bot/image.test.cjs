const test=require('node:test');
const assert=require('node:assert/strict');
const {loadImage}=require('@napi-rs/canvas');
const {renderTeamImages}=require('./team-image.cjs');
test('team cards render valid PNGs for each team size',async()=>{
  for(let size=1;size<=5;size++){
    const data={format:'single',teamSize:size,matches:[{map:'Italy'}],teams:Array.from({length:2},(_,i)=>({name:'Team '+(i+1),players:Array.from({length:size},(_,j)=>({id:String(j),name:'Player '+j}))}))};
    const files=renderTeamImages(data);
    assert.equal(files.length,1);
    assert.equal(files[0].attachment.subarray(1,4).toString(),'PNG');
    const image=await loadImage(files[0].attachment);
    assert.equal(image.width,1600);assert.equal(image.height,375+size*86);
  }
});
test('large tournaments paginate without losing teams',()=>{
  const teams=Array.from({length:17},()=>({name:'A very long team name '.repeat(5),players:[{name:'Unicode player 🎮'}]}));
  const files=renderTeamImages({teamSize:1,teams});
  assert.deepEqual(files.map(f=>f.name),['teams-1.png','teams-2.png','teams-3.png']);
  assert.deepEqual(renderTeamImages({teams:[]}),[]);
});

test('Discord result cards resolve the winner and generate a readable image',async()=>{
  const {resultCards,resultImage}=require('./results.cjs'),{makeTournament,applyResult}=require('../manager.js'),{resolveTournament}=require('../app.js'),{loadImage}=require('@napi-rs/canvas');
  const data=makeTournament([{id:'a',name:'Alice'},{id:'b',name:'Bob'}],1,{name:'Cup'},['t1','t2'],0,[],2,'knockout');
  assert.deepEqual(resultCards(data),[]);const next=applyResult(data,'f1',{teams:['t1','t2'],scores:[13,10]},resolveTournament).next,card=resultCards(next)[0];assert.equal(card.winner,'Alice');assert.deepEqual(card.scores,[13,10]);const image=await loadImage(resultImage(card));assert.equal(image.width,1200);assert.equal(image.height,460);
});
