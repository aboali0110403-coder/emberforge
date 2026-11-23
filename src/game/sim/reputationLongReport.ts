import {reputationSessions}from './reputationLongHarness';
const results=[];
const quant=(a:number[])=>{a.sort((x,y)=>x-y);return a.length?{reached:a.length,p10:a[Math.floor((a.length-1)*.1)],p25:a[Math.floor((a.length-1)*.25)],median:a[Math.floor((a.length-1)*.5)],p75:a[Math.floor((a.length-1)*.75)],p90:a[Math.floor((a.length-1)*.9)]}:{reached:0};};
for(const model of ['historical','crossingOnly','sustained','gentle']as const)for(const [profile,qMean,qSd,missRate]of [['poor',.4,.1,.2],['average',.70,.07,.08],['good',.85,.05,.02],['exceptional',.96,.02,0]]as const)for(const frugal of [false,true]){
 const sessions=reputationSessions({label:'long horizon',qMean,qSd,ordersPerDay:5,frugal,model,missRate},100);
 const milestones=Object.fromEntries(['known','respected','renowned','legendary'].map(k=>[k,quant(sessions.map(s=>s.firstAt[k]).filter((v):v is number=>v!==null))]));
 const source=Object.fromEntries(['battle','delivery','milestone','loss'].map(k=>[k,sessions.reduce((a,s)=>a+s.reputationRows.reduce((b,r)=>b+(r[k]??0),0),0)/100]));
 const snapshots=[20,80,160,400,800].map(at=>({at,topKingdom:quant(sessions.map(s=>Math.max(...Object.values(s.reputationRows[at-1].pop)as number[]))),unlocked:quant(sessions.map(s=>Object.values(s.reputationRows[at-1].pop).filter(v=>(v as number)>=25).length)),royalRate:sessions.reduce((a,s)=>a+s.reputationRows.slice(0,at).filter(r=>r.kind==='royal').length,0)/(at*100)}));
 results.push({model,profile,frugal,milestones,source,snapshots,sample:sessions[0].reputationRows});
}
console.log(JSON.stringify({seed:20261123,runs:100,attempts:800,results},null,1));
