import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_LIST } from '../data/weapons';
import { getSmithProgress } from '../data/config';
import { generateCustomerOrder,createInitialSaveState,canUseMaterialWithFurnace } from './rules';
import { generateCustomerOrder as historical } from './sim/historical/s0OrderLogic';
import { selectCapabilityOrderLevel,materialLevelCeiling,relevantOrderToolTier } from './orderCapability';
import { MATERIALS } from '../data/materials';
import { getStageMinRarity } from '../data/balance';
import { mulberry32 } from './sim/forgingBenchmark';
const eq={furnace:5,anvil:5,hammer:5,grindstone:5,quench:5,workbench:5};
function fixture(){return createInitialSaveState({name:'S3',gender:'male',hairColorIndex:0,skinToneIndex:0,outfitColorIndex:0});}
test('S3 asymmetric weapon repertoire ignores unrelated grindstone for shield/staff',()=>{
 const e={...eq,grindstone:1};
 assert.equal(relevantOrderToolTier('sword',e),1);
 assert.equal(relevantOrderToolTier('shield',e),5);
 assert.equal(relevantOrderToolTier('staff',e),5);
});
test('S3 hammer and workbench constrain all current weapon repertoires',()=>{
 const e={...eq,hammer:1};
 assert.equal(relevantOrderToolTier('sword',e),1);
 for(const w of WEAPON_LIST)assert.equal(relevantOrderToolTier(w.id,e),1);
 for(const w of WEAPON_LIST)assert.equal(relevantOrderToolTier(w.id,{...eq,workbench:1}),1);
});
test('S3 furnace access is separate from tool comfort and agrees with existing material rules',()=>{
 for(let furnace=1;furnace<=5;furnace++) {
  assert.equal(relevantOrderToolTier('sword',{...eq,furnace}),5);
  for(let l=1;l<=18;l++)assert.equal(MATERIALS.some(m=>m.targetRace==='human'&&m.rarity===getStageMinRarity(l)&&canUseMaterialWithFurnace(m,furnace)),l<=materialLevelCeiling(furnace));
 }
});
test('S3 production generator uses selected model for same ordinal level draw; other RNG fields preserved',()=>{
 const s=fixture();s.stats.ordersCompleted=100; s.smithXp=1400;s.popularity.human=240;
 for(const w of WEAPON_LIST)for(const draw of [0,.1499,.15,.45,.85,.98,.999999]) {
  const defs=WEAPON_LIST.filter(x=>x.ownerRace==='general'||x.ownerRace==='human');
  const index=defs.findIndex(x=>x.id===w.id); if(index<0)continue;
  const values=[0,.99,(index+.1)/defs.length,draw,.1,.2,.3,.4,.5];
  let i=0;const a=generateCustomerOrder(s,()=>values[i++]);assert.equal(i,9);
  let j=0;const b=historical(s,()=>values[j++]);assert.equal(j,9);
  assert.equal(a.weapon.type,b.weapon.type);assert.equal(a.requestFocus,b.requestFocus);
  assert.equal(a.scenarioName,b.scenarioName);assert.equal(a.deadlineSec,b.deadlineSec);
  assert.equal(a.weapon.level,selectCapabilityOrderLevel({smithLevel:getSmithProgress(s.smithXp).level,completedOrders:100,popularity:240,furnace:1,relevantToolTier:1},draw));
 }
});
test('S3 actual seeded orders have repeatable distributions independent of generated IDs',()=>{
 const collect=()=>{const rng=mulberry32(20261123);const s=fixture();return Array.from({length:500},()=>{const o=generateCustomerOrder(s,rng);return [o.kind,o.weapon.type,o.weapon.level,o.requestFocus,o.scenarioName];});};
 assert.deepEqual(collect(),collect());
});
test('S3 no raw order-count or tool-only runaway, including unlocked royal customers',()=>{
 const s=fixture();s.stats.ordersCompleted=1e9;s.popularity.human=1e9;s.equipment={...eq};
 const rng=mulberry32(777);const a=Array.from({length:10000},()=>generateCustomerOrder(s,rng));
 assert.ok(a.some(o=>o.kind==='royal'));assert.ok(a.some(o=>o.kind==='standard'));
 assert.ok(a.every(o=>o.weapon.level<=4));
});
