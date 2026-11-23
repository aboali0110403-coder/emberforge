import { generateCustomerOrder } from './historical/s0OrderLogic';
import {createInitialSaveState,canUseMaterialWithFurnace,evaluateLevelUp,calculateDeliveryGoldBreakdown,evaluateBattlePreview,applyForgeUpgradesToWeapon,createWeaponInstance,calculateForgeXp} from '../rules';
import {getSmithProgress} from '../../data/config';
import {getStageMinRarity} from '../../data/balance';
import {MATERIALS} from '../../data/materials';
import {getStepsForRequest} from '../../data/weapons';
import {runOne,SKILL_PROFILES,mulberry32} from './forgingBenchmark';
import {candidateOrderLevel,materialLevelCeiling} from './orderCapabilityCandidates';
const levels=[1,3,5,8,12,16,20], pops=[0,70,240], counts=[0,8,32,100,10000], tiers=[1,2,3,5];
function xpFor(l:number){let x=0;while(getSmithProgress(x).level<l)x++;return x;}
const xps=new Map(levels.map(l=>[l,xpFor(l)]));
const player={name:'S3 measurement',gender:'male' as const,hairColorIndex:0,skinToneIndex:0,outfitColorIndex:0};
const cache=new Map<string,number>();
function quality(order:any,profile:keyof typeof SKILL_PROFILES,tier:number,smith:number){
 const steps=getStepsForRequest(order.requestFocus??'edge',order.targetPart);
 const qs=steps.map(st=>{const key=[st,profile,tier,order.weapon.level,smith].join(':');if(!cache.has(key)){
 const eq={furnace:tier,anvil:tier,hammer:tier,grindstone:tier,quench:tier,workbench:tier};let sum=0;for(let r=0;r<12;r++)sum+=runOne(st,order.weapon.level,eq,SKILL_PROFILES[profile],20261123+r,smith).accuracy;cache.set(key,sum/12);}return cache.get(key)!;});return qs.reduce((a,b)=>a+b,0)/qs.length;
}
const rawBaseline:unknown[]=[];
const grid=[];
// Snapshot sampling does not simulate purchases, affordability or inventory supply.
// Quality is an accepted S2 sword-runtime proxy applied to the actual request's
// station sequence. Other weapon-specific anvil target spans need playtesting.

for(const smith of levels)for(const pop of pops)for(const completed of counts)for(const tier of tiers){
 const state=createInitialSaveState(player);state.smithXp=xps.get(smith)!;state.stats.ordersCompleted=completed;state.popularity.human=pop;for(const k of Object.keys(state.equipment)) (state.equipment as any)[k]=tier;
 const rng=mulberry32(20261123);const samples=[];
 for(let r=0;r<200;r++){const o=generateCustomerOrder(state,rng);samples.push({level:o.weapon.level,kind:o.kind,weapon:o.weapon.type,focus:o.requestFocus,part:o.targetPart,fee:o.baseFee});}
 rawBaseline.push({smith,pop,completed,tier,samples});
 for(const model of ['baseline','smithLinear','boundedExperience','materialCoherent','softMaterial'] as const){
  const dr=mulberry32(20261123);const requested=samples.map(o=>model==='baseline'?o.level:candidateOrderLevel(model,{smithLevel:smith,completedOrders:completed,popularity:pop,furnace:tier,relevantToolTier:tier},dr()));const rarityDist:Record<string,number>={};for(const l of requested){const rarity=getStageMinRarity(l);rarityDist[rarity]=(rarityDist[rarity]??0)+1;}const sorted=[...requested].sort((a,b)=>a-b);const n=sorted.length;const dist:Record<string,number>={};for(const l of sorted)dist[l]=(dist[l]??0)+1;
  grid.push({model,smith,pop,completed,tier,n,mean:sorted.reduce((a,b)=>a+b,0)/n,min:sorted[0],max:sorted[n-1],p90:sorted[Math.floor(n*.9)],aheadBy3:requested.filter(l=>l>smith+3).length/n,materialGateGap:requested.filter(l=>l>materialLevelCeiling(tier)).length/n,rarityDist,dist});
 }
}
const scenarios=[];
for(const [name,smith,completed,pop,tier]of [['early',1,8,70,1],['earlyHighTraffic',3,32,240,1],['mid',8,100,240,2],['late',16,500,240,4],['lateUndergeared',16,500,240,1]] as const){
 const state=createInitialSaveState(player);state.smithXp=xpFor(smith);state.stats.ordersCompleted=completed;state.popularity.human=pop;for(const k of Object.keys(state.equipment))(state.equipment as any)[k]=tier;
 const rng=mulberry32(777);const orders=Array.from({length:120},()=>generateCustomerOrder(state,rng));
 for(const model of ['baseline','smithLinear','boundedExperience','materialCoherent','softMaterial']as const)for(const profile of ['poor','average','good','exceptional']as const){
 let q=0,gate=0,chance=0,gold=0,win=0;const dist:Record<string,number>={};const dr=mulberry32(777);
 for(const original of orders){const l=model==='baseline'?original.weapon.level:candidateOrderLevel(model,{smithLevel:smith,completedOrders:completed,popularity:pop,furnace:tier,relevantToolTier:tier},dr());
 const o={...original,weapon:createWeaponInstance(original.weapon.type,l,'s3-measurement')};
 const qual=quality(o,profile,tier,smith);q+=qual;dist[l]=(dist[l]??0)+1;
 const accessible=MATERIALS.filter(m=>m.targetRace==='human'&&canUseMaterialWithFurnace(m,tier));const stage=getStageMinRarity(l);const chosen=accessible.find(m=>m.rarity===stage)??accessible[accessible.length-1];const stacks=[{materialId:chosen.id,units:3}];const ev=evaluateLevelUp(l,o.weapon.type,qual,stacks);chance+=ev.chance;if(!ev.meetsStageRarity)gate++;
 // Fees use unchanged formulas at selected level, not economy coefficients retuned.
 const baseFee=o.kind==='royal'?Math.round((55+l*16)*2.2):Math.round(48+l*14);
 gold+=calculateDeliveryGoldBreakdown({baseFee,fulfilment:o.kind==='royal'?1.15:1,quality:qual,weaponLevel:l,stacks,remainingRatio:.75,conqueredCount:0,isRoyal:o.kind==='royal'}).totalGold;
 const delivered=applyForgeUpgradesToWeapon(o.weapon,o.targetPart,qual,stacks,state.equipment,l,o.requestFocus).updated;
 win+=evaluateBattlePreview({weapon:delivered,race:o.race,scenarioName:o.scenarioName,scenarioDifficulty:Math.round(original.scenarioDifficulty + (l-original.weapon.level)*5.2),enemyArchetype:o.enemyArchetype,smithLevel:smith,quality:qual}).winChancePct/100;
 }
 scenarios.push({name,smith,completed,pop,tier,model,profile,n:orders.length,quality:q/orders.length,stageBlocked:gate/orders.length,levelUpChance:chance/orders.length,deliveryGold:gold/orders.length,battleWinPreview:win/orders.length,dist});
 }
}
console.log(JSON.stringify({meta:{base:'accepted S2v5 cumulative candidate, pre-S3 production unchanged',seed:20261123,runsCell:200,qualityRunsPerStation:12,scenarioSeed:777,scenarioOrders:120,qualityScope:'sword timing-runtime proxy for actual focus station sequence; mean quality, not a sampled full-order distribution',materialPolicy:'three units of accessible stage-rarity material, else highest furnace-usable; hypothetical supply, not inventory affordability'},rawBaseline,grid,scenarios},null,1));
