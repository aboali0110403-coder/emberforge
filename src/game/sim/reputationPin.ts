import {reputationSessions}from './reputationHarness';
export function summarizeS4(sessions:ReturnType<typeof reputationSessions>){
 const q=(a:number[])=>{a.sort((x,y)=>x-y);return a.length?{reached:a.length,p10:a[Math.floor((a.length-1)*.1)],p25:a[Math.floor((a.length-1)*.25)],median:a[Math.floor((a.length-1)*.5)],p75:a[Math.floor((a.length-1)*.75)],p90:a[Math.floor((a.length-1)*.9)]}:{reached:0};};
 const rows=sessions.flatMap(s=>s.reputationRows);
 return {milestones:Object.fromEntries(['known','respected','renowned','legendary'].map(k=>[k,q(sessions.map(s=>s.firstAt[k]).filter((v):v is number=>v!==null))])),source:Object.fromEntries(['battle','delivery','milestone','loss'].map(k=>[k,rows.reduce((a,r)=>a+(r[k]??0),0)])),royal:rows.filter(r=>r.kind==='royal').length,generatedMilestoneAwards:rows.filter(r=>r.generatedMilestone&&r.milestone>0).length};
}
