import {reputationSessions}from './reputationHarness';
import {candidateReputation}from './reputationCandidates';
const results=[];
for(const model of ['historical','crossingOnly','sustained','gentle']as const)for(const [profile,qMean,qSd,missRate] of [['poor',.4,.1,.2],['average',.70,.07,.08],['good',.85,.05,.02],['exceptional',.96,.02,0]]as const)for(const frugal of [false,true]) {
 const sessions=reputationSessions({label:model+' '+profile,qMean,qSd,ordersPerDay:5,frugal,model,missRate},100);
 results.push({model,profile,frugal,qMean,qSd,missRate,sessions});
}
const sensitivities=[];
for(const model of ['historical','sustained','gentle']as const)for(const forceWinRate of [0,.5,1]) {
 const sessions=reputationSessions({label:'battle sensitivity',qMean:.85,qSd:.05,ordersPerDay:5,frugal:false,model,forceWinRate},100);
 sensitivities.push({model,forceWinRate,sessions});
}
const cells=[];for(const model of ['historical','crossingOnly','sustained','gentle']as const)for(const current of [0,25,70,140,240,500])for(const quality of [.3,.55,.75,.85,.97])for(const level of [1,8,18])for(const royal of [false,true])cells.push({model,current,quality,level,royal,...candidateReputation(model,{current,quality,level,royal,won:true,oldLevel:level,milestone:level>=10?10:null,firstKingdomTier:true})});
console.log(JSON.stringify({meta:{seed:20261123,runs:100,attempts:160,syntheticProfiles:true,forceWinSensitivity:'changes popularity outcome only; historical gold/drop draws retained, not a coherent alternative combat simulation'},results,sensitivities,cells},null,1));
