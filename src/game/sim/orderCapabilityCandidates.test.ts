import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateOrderLevel,materialLevelCeiling} from './orderCapabilityCandidates';
const input={smithLevel:1,completedOrders:0,popularity:0,furnace:1,relevantToolTier:1};
test('bounded experience and popularity cannot substitute for Smith progression',()=>{
 const levels=Array.from({length:1000},(_,i)=>candidateOrderLevel('softMaterial',{...input,completedOrders:1e9,popularity:1e9,relevantToolTier:5},i/1000));
 assert.ok(Math.max(...levels)<=4);
 assert.ok(Math.min(...levels)>=1);
});
test('higher Smith anchor advances access without completed-count runaway',()=>{
 const mean=(smithLevel:number,completedOrders:number)=>Array.from({length:1000},(_,i)=>candidateOrderLevel('softMaterial',{...input,smithLevel,completedOrders,furnace:5},i/1000)).reduce((a,b)=>a+b,0)/1000;
 assert.ok(mean(16,100)>mean(8,100)+5);
 assert.equal(mean(8,100),mean(8,1e9));
});
test('material boundaries come from existing furnace rarity unlocks',()=>{
 assert.deepEqual([1,2,3,4,5].map(materialLevelCeiling),[8,12,16,18,18]);
});
test('soft material distribution avoids a hard ceiling pileup and keeps rare bridge orders',()=>{
 for(const furnace of [1,2,3]){
  const levels=Array.from({length:1000},(_,i)=>candidateOrderLevel('softMaterial',{...input,smithLevel:20,completedOrders:500,popularity:240,furnace},i/1000));
  const end=materialLevelCeiling(furnace);
  assert.ok(new Set(levels).size>=4);
  assert.equal(levels.filter(l=>l>end).length,20);
  assert.ok(Math.max(...levels)<=end+1);
 }
});
test('candidate boundary clamping is deterministic for valid and out-of-range draws',()=>{
 for(const model of ['smithLinear','boundedExperience','materialCoherent','softMaterial']as const){
  for(const draw of [-1,0,.1,.98,1-Number.EPSILON,1,2]){
   const a=candidateOrderLevel(model,input,draw);assert.ok(a>=1&&a<=18&&Number.isInteger(a));assert.equal(a,candidateOrderLevel(model,input,draw));
  }
 }
});
test('hard-clamp candidate is retained as a rejected comparison, not hidden',()=>{
 const levels=Array.from({length:100},(_,i)=>candidateOrderLevel('materialCoherent',{...input,smithLevel:20,completedOrders:500,popularity:240},i/100));
 assert.deepEqual([...new Set(levels)],[8]);
});
