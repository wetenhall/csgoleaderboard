const {validateMapVoteRequest}=require('../discord-events.js');

function openMapVote(request,players,now=Date.now()){
  validateMapVoteRequest(request);
  return {
    id:request.id,mode:request.mode,maps:[...request.maps],closesAt:now+90_000,
    voters:players.map(player=>({id:player.userId,name:player.name})),ballots:[]
  };
}

function castMapVote(vote,userId,index,now=Date.now()){
  if(vote.result || now>=vote.closesAt)throw Error('This map vote is closed.');
  if(!vote.voters.some(voter=>voter.id===userId))throw Error('Only registered players can vote.');
  if(!Number.isInteger(index) || index<0 || index>=vote.maps.length)throw Error('Choose a map from the ballot.');
  if(vote.ballots.some(ballot=>ballot.userId===userId))throw Error('Your map vote is already locked in.');
  vote.ballots.push({userId,index});
}

function mapVoteCounts(vote){
  const counts=vote.maps.map(()=>0);
  for(const ballot of vote.ballots)counts[ballot.index]++;
  return counts;
}

function closeMapVote(vote,random=Math.random){
  if(vote.result)return vote.result;
  const counts=mapVoteCounts(vote);
  let finalists,coinFlip=false;
  if(vote.mode==='duel'){
    coinFlip=counts[0]===counts[1];
    const winner=coinFlip?(random()<.5?0:1):counts[0]>counts[1]?0:1;
    finalists=[vote.maps[winner]];
  }else{
    const ranked=vote.maps.map((map,index)=>({map,count:counts[index],tie:random()}));
    finalists=ranked.filter(entry=>entry.count>0)
      .sort((a,b)=>b.count-a.count || a.tie-b.tie)
      .slice(0,3).map(entry=>entry.map);
  }
  vote.result={counts,finalists,coinFlip};
  return vote.result;
}

function websiteMapVote(vote){
  const submittedIds=new Set(vote.ballots.map(ballot=>ballot.userId));
  const submitted=vote.voters.filter(voter=>submittedIds.has(voter.id)).map(voter=>voter.name);
  return {id:vote.id,mode:vote.mode,maps:vote.maps,closesAt:vote.closesAt,submitted,...(vote.result?{result:vote.result}:{})};
}

module.exports={openMapVote,castMapVote,mapVoteCounts,closeMapVote,websiteMapVote};
