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
