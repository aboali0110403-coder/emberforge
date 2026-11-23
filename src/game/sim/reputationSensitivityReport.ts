import {reputationSessions}from './reputationLongHarness';
const results=[];
const quant=(a:number[])=>{a.sort((x,y)=>x-y);return a.length?{reached:a.length,p10:a[Math.floor((a.length-1)*.1)],median:a[Math.floor((a.length-1)*.5)],p90:a[Math.floor((a.length-1)*.9)]}:{reached:0};};
for(const model of ['gentle']as const)for(const qMean of [.60,.66,.70])for(const missRate of [0,.08,.2]) {
 const sessions=reputationSessions({label:'isolated quality/miss',qMean,qSd:.04,ordersPerDay:5,frugal:false,model,missRate},40);
 results.push({model,qMean,missRate,milestones:Object.fromEntries(['known','respected','renowned','legendary'].map(k=>[k,quant(sessions.map(s=>s.firstAt[k]).filter((v):v is number=>v!==null))])),endTop:quant(sessions.map(s=>Math.max(...Object.values(s.reputationRows.at(-1).pop)as number[])))});
}
console.log(JSON.stringify({seed:20261123,runs:40,attempts:800,results},null,1));
