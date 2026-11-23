/** S3 integrated production and historical comparison. stdout is reproducible JSON. */
import { S3_SCENARIOS,runScenario,runDiagnosticScenario } from './orderProgressionHarness';
import { BASELINE_SCENARIOS,runScenario as runHistorical } from './balanceHarness';
import { generateCustomerOrder as historical } from './historical/s0OrderLogic';
import { generateCustomerOrder,createInitialSaveState } from '../rules';
import { getSmithProgress } from '../../data/config';
import { getStageMinRarity } from '../../data/balance';
import { getStepsForRequest } from '../../data/weapons';
import { relevantOrderToolTier,materialLevelCeiling } from '../orderCapability';
import { mulberry32,runOne,SKILL_PROFILES } from './forgingBenchmark';
const snapshot=[];
for(const smith of [1,3,5,8,12,16,20])for(const pop of [0,70,240])for(const completed of [0,8,32,100,10000])for(const tier of [1,2,3,5]) {
 let xp=0;while(getSmithProgress(xp).level<smith)xp++;
 const state=createInitialSaveState({name:'S3 snapshot',gender:'male',hairColorIndex:0,skinToneIndex:0,outfitColorIndex:0});
 state.smithXp=xp;state.popularity.human=pop;state.stats.ordersCompleted=completed;
 for(const k of Object.keys(state.equipment))(state.equipment as any)[k]=tier;
 for(const [model,generator]of [['historical',historical],['S3',generateCustomerOrder]]as const) {
  const rng=mulberry32(20261123);const samples=Array.from({length:200},()=>{const o=generator(state,rng);return {level:o.weapon.level,kind:o.kind,weapon:o.weapon.type,focus:o.requestFocus,part:o.targetPart,fee:o.baseFee,tool:relevantOrderToolTier(o.weapon.type,state.equipment),rarity:getStageMinRarity(o.weapon.level)};});
  snapshot.push({model,smith,pop,completed,tier,samples,materialGateGap:samples.filter(o=>o.level>materialLevelCeiling(tier)).length/200,aheadBy3:samples.filter(o=>o.level>smith+3).length/200});
 }
}
const matched={historical:BASELINE_SCENARIOS.map(s=>runHistorical(s)),S3:S3_SCENARIOS.map(s=>runScenario(s))};
const cache=new Map<string,number>();
// Synthetic sword-runtime station means only, not device or full-order quality distribution.
const qualityFor=(profile:keyof typeof SKILL_PROFILES)=>(order:any,equipment:any,smith:number)=>{
 const steps=getStepsForRequest(order.requestFocus??'edge',order.targetPart);
 return steps.reduce((total,station)=>{const key=[profile,station,order.weapon.level,smith,...Object.values(equipment)].join(':');
 if(!cache.has(key)){let sum=0;for(let r=0;r<12;r++)sum+=runOne(station,order.weapon.level,equipment,SKILL_PROFILES[profile],20261123+r,smith).accuracy;cache.set(key,sum/12);}return total+cache.get(key)!;
 },0)/steps.length;
};
const closedLoop=[];
for(const [model,generator] of [['historical',historical],['S3',generateCustomerOrder]]as const)for(const policy of [S3_SCENARIOS[0],S3_SCENARIOS[1]])for(const profile of ['poor','average','good','exceptional']as const){
 const sessions=runDiagnosticScenario(policy,20,generator,qualityFor(profile));
 closedLoop.push({model,policy:policy.frugal?'frugal':'buyer',profile,runs:20,sessions});
}
console.log(JSON.stringify({meta:{seed:20261123,snapshotStates:420,samplesPerState:200,matchedRuns:400,ordersPerSession:160,diagnosticRuns:20,diagnosticQuality:'S2 sword-runtime station means,12runs/station/cell; actual focus sequence, synthetic completion and no timeout or rejection'},snapshot,matched,closedLoop},null,1));
