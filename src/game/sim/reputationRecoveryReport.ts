import {reputationSessions}from './reputationLongHarness';
const q=(a:number[])=>{a.sort((x,y)=>x-y);return a.length?{reached:a.length,p10:a[Math.floor((a.length-1)*.1)],median:a[Math.floor((a.length-1)*.5)],p90:a[Math.floor((a.length-1)*.9)]}:{reached:0};};
const results=[];
for(const [profile,qMean,qSd,missRate]of [['synthetic poor',.4,.1,.2],['S2 poor mean proxy',.66,.04,.08]]as const)for(const improveAt of [undefined,160]){
 const sessions=reputationSessions({label:'recovery',qMean,qSd,ordersPerDay:5,frugal:false,model:'gentle',missRate,improveAt},40);
 results.push({profile,qMean,qSd,missRate,improveAt:improveAt??null,runs:40,milestones:Object.fromEntries(['known','respected','renowned','legendary'].map(k=>[k,q(sessions.map(s=>s.firstAt[k]).filter((v):v is number=>v!==null))]))});
}
console.log(JSON.stringify({seed:20261123,attempts:800,improvedProfile:{qMean:.85,qSd:.05,missRate:.02},results},null,1));
