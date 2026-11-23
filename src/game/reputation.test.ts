import {persistSaveState,loadSaveStateWithStatus}from './storage';
import {SAVE_STORAGE_KEY,SAVE_BACKUP_KEY}from '../data/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from 'node:fs';
import {battleReputationDelta,deliveryReputationDelta,earnedLegendaryCrossing,earnedMilestoneReputation,REPUTATION}from './reputation';
import {createWeaponInstance,createInitialSaveState,resolveBattleOutcome,resolvePendingBattleResult,applyBattleClaimResult,migrateSaveState}from './rules';
import {resolveBattleOutcome as historical}from './sim/historical/preS4BattleOutcome';
import {advanceOrderDeadlines}from './worldCycle';
import {candidateReputation}from './sim/reputationCandidates';
import {reputationSessions}from './sim/reputationHarness';
const player={name:'S4 lifecycle',gender:'male' as const,hairColorIndex:0,skinToneIndex:0,outfitColorIndex:0};
function pending(quality=.85){return {id:'s4battle',orderId:'s4order',race:'human' as const,customerName:'Test',portraitVariant:0,weapon:createWeaponInstance('sword',12,'s4weapon'),quality,fulfilment:1,scenarioName:'Bridgewatch Skirmish',scenarioDifficulty:60,enemyArchetype:'skirmishers' as const,smithLevel:10,etaSec:0,ready:true,rewardMultiplier:2,wasRoyal:false};}
test('S4 quality, diminishing returns and Royal reward stay bounded and ordered',()=>{
 for(const current of [0,25,70,140,240,500,10000]){
  const values=(['D','C','B','A','S']as const).map(g=>battleReputationDelta(g,true,false,current));
  assert.deepEqual(values,[...values].sort((a,b)=>a-b));assert.equal(values[0],0);
  assert.ok(battleReputationDelta('S',true,true,current)>=values[4]);
 }
 for(const grade of ['C','B','A','S']as const){let prev=Infinity;for(const current of [0,25,70,140,240,500,10000]){const v=battleReputationDelta(grade,true,false,current);assert.ok(v<=prev&&v>=1);prev=v;}}
 assert.equal(battleReputationDelta('A',false,false,0),-3);assert.equal(battleReputationDelta('D',false,true,0),-5);
 assert.equal(deliveryReputationDelta('D'),-3);assert.equal(deliveryReputationDelta('S'),0);
});
test('S4 generated high-level weapons do not earn milestone credit without crossing',()=>{
 for(const l of [10,14,15,18,20])assert.equal(earnedLegendaryCrossing(l,createWeaponInstance('sword',l,'new')),null);
 for(const [from,to,tier]of [[9,10,10],[14,15,15],[19,20,20]])assert.equal(earnedLegendaryCrossing(from,createWeaponInstance('sword',to,'earned')),tier);
});
test('S4 weapon notification and kingdom letter lifetime prevent duplicate reputation',()=>{
 const weapon=createWeaponInstance('sword',10,'earned');assert.equal(earnedLegendaryCrossing(9,weapon),10);
 weapon.legendaryNotifiedLevels=[10];assert.equal(earnedLegendaryCrossing(9,weapon),null);
 const letter={id:'earned',race:'human' as const,milestoneLevel:10,title:'Earned',body:'History',timestamp:1};
 assert.equal(earnedMilestoneReputation('human',10,[]),8);
 assert.equal(earnedMilestoneReputation('human',10,[letter]),0);
 assert.equal(earnedMilestoneReputation('elf',10,[letter]),8);
 assert.equal(earnedMilestoneReputation('human',15,[letter]),8);
 assert.equal(earnedMilestoneReputation('human',10,[{...letter,milestoneLevel:20}]),0);
});
test('S4 permanent letter history survives save load without new schema',()=>{
 const s=createInitialSaveState(player);s.kingLetters=[{id:'earned',race:'human',milestoneLevel:15,title:'Earned',body:'History',timestamp:1}];
 const loaded=migrateSaveState(JSON.parse(JSON.stringify(s)))!;
 assert.equal(earnedMilestoneReputation('human',15,loaded.kingLetters),0);
 assert.equal(loaded.version,s.version);assert.deepEqual(Object.keys(loaded).sort(),Object.keys(s).sort());
});
test('S4 battle reputation changes neither outcome/RNG nor gold/material/combat outputs',()=>{
 for(const quality of [.2,.55,.75,.85,.97])for(const current of [0,140,500])for(const royal of [false,true])for(const draw of [.01,.9999]){
  const p={...pending(quality),wasRoyal:royal};let oldCalls=0,newCalls=0;
  const old=historical(p,()=>{oldCalls++;return draw;});const now=resolveBattleOutcome(p,()=>{newCalls++;return draw;},current);
  const {popularityDelta:_old,...oldOther}=old;const {popularityDelta:_new,...newOther}=now;
  assert.deepEqual(newOther,oldOther);assert.equal(newCalls,oldCalls);
  assert.equal(now.popularityDelta,battleReputationDelta(now.qualityGrade!,now.won,royal,current));
 }
});
test('S4 persisted battle claim applies once and floors losses at zero',()=>{
 const p=resolvePendingBattleResult({...pending(.2),scenarioDifficulty:400},()=>.9999,2);
 const s=createInitialSaveState(player);s.popularity.human=2;s.pendingBattles=[p];
 const result=p.resolvedResult!;assert.equal(result.popularityDelta,-5);
 const first=applyBattleClaimResult(s,result);assert.equal(first.state.popularity.human,0);
 const again=applyBattleClaimResult(first.state,result);assert.equal(again.claimed,false);assert.strictEqual(again.state,first.state);
 assert.strictEqual(resolvePendingBattleResult(p,()=>{throw Error('rerolled');},1000),p);
});
test('S4 deadline applies six once and never penalizes tutorial',()=>{
 const s=createInitialSaveState(player);s.popularity.human=20;
 const order={id:'miss',kind:'standard' as const,race:'human' as const,customerName:'Test',portraitVariant:0,weapon:createWeaponInstance('sword',1,'x'),requestFocus:'edge' as const,requestText:'test',targetPart:'blade',baseFee:1,deadlineSec:1,remainingSec:1,scenarioName:'test',scenarioDifficulty:1,enemyArchetype:'skirmishers' as const};
 s.orders=[order,{...order,id:'tutorial',isTutorial:true}];
 const a=advanceOrderDeadlines(s,1,REPUTATION.missedOrder);assert.equal(a.popularity.human,14);assert.equal(a.ordersMissed,1);
 const b=advanceOrderDeadlines({...s,...a,stats:{...s.stats,ordersMissed:a.ordersMissed}},1,REPUTATION.missedOrder);assert.equal(b.popularity.human,14);assert.equal(b.ordersMissed,1);
});
test('S4 selected research candidate delegates exactly to production reputation',()=>{
 for(const quality of [.2,.55,.75,.85,.97])for(const current of [0,70,240,1000])for(const royal of [false,true])for(const won of [false,true]){
 const x=candidateReputation('gentle',{quality,current,royal,won,level:18,oldLevel:18,milestone:15,firstKingdomTier:true});
 const grade=quality>=.94?'S':quality>=.82?'A':quality>=.65?'B':quality>=.45?'C':'D';
 assert.equal(x.battle,battleReputationDelta(grade,won,royal,current));assert.equal(x.milestone,0);
 }
});
test('S4 application passes kingdom reputation at resolution and actual award to modal',()=>{
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 assert.match(app,/resolveBattleOutcome\(ready,Math.random,curSave.popularity\[ready.race\]\)/);
 assert.match(app,/resolvePendingBattleResult\(\{ \.\.\.b, etaSec: 0, ready: true \},Math.random,prev.popularity\[b.race\]\)/);
 assert.match(app,/earnedLegendaryCrossing\(oldLevel,upgradedWeapon\)/);
 assert.match(app,/earnedMilestoneReputation\(ord.race,milestone,prev.kingLetters\)/);
 assert.match(app,/popBonus: milestonePopBonus/);
});
test('S4 seeded candidate sessions repeat exactly and distinguish source contributions',()=>{
 const opts={label:'S4',qMean:.85,qSd:.05,ordersPerDay:5,frugal:false,model:'gentle' as const};
 const a=reputationSessions(opts,4);assert.deepEqual(a,reputationSessions(opts,4));
 assert.ok(a.some(s=>s.reputationRows.some(r=>r.battle>0)));assert.ok(a.every(s=>s.reputationRows.every(r=>!r.generatedMilestone||r.milestone===0)));
});

test('S4 letters survive primary/backup/reload and quota history compaction',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const map=new Map<string,string>();let quota=false;
 const storage={getItem:(k:string)=>map.get(k)??null,removeItem:(k:string)=>{map.delete(k);},setItem:(k:string,v:string)=>{
 if(quota&&k===SAVE_STORAGE_KEY&&JSON.parse(v).weaponArmory.length>0){const e=new Error('quota');e.name='QuotaExceededError';throw e;}map.set(k,v);
 }};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 try{
 const s=createInitialSaveState(player);s.kingLetters=[{id:'tier15',race:'human',milestoneLevel:15,title:'Earned',body:'History',timestamp:1}];
 s.weaponArmory=[{uid:'old',type:'sword',level:15,quality:.85,grade:'A',trait:null,customerName:'Test',race:'human',stats:createWeaponInstance('sword',15,'x').stats,forgedAt:1}];
 assert.equal(persistSaveState(s).status,'ok');
 assert.equal(earnedMilestoneReputation('human',15,loadSaveStateWithStatus().state!.kingLetters),0);
 // Put exact current save into backup, corrupt primary and recover, preserving letters.
 map.set(SAVE_BACKUP_KEY,JSON.stringify(s));map.set(SAVE_STORAGE_KEY,'invalid');
 const recovered=loadSaveStateWithStatus();assert.equal(recovered.recoveredFromBackup,true);assert.deepEqual(recovered.state!.kingLetters,s.kingLetters);
 quota=true;assert.equal(persistSaveState(s).status,'compacted');
 const compacted=loadSaveStateWithStatus().state!;assert.deepEqual(compacted.kingLetters,s.kingLetters);assert.equal(compacted.weaponArmory.length,0);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

// S4.2 approved coefficient and formula regression, all other S4 rules retained.
test('S4.2 approved coefficients match exact bounded formula across grades and reputation',()=>{
 assert.equal(REPUTATION.diminishingScale,200);assert.equal(REPUTATION.missedOrder,6);
 assert.deepEqual(REPUTATION.win,{S:9,A:7,B:4,C:2,D:0});
 assert.equal(REPUTATION.royalMultiplier,1.25);assert.equal(REPUTATION.flawedDelivery,3);assert.equal(REPUTATION.firstEarnedKingdomTier,8);
 for(const grade of ['S','A','B','C','D']as const)for(const royal of [false,true])for(const current of [-100,0,25,70,140,240,500,10000,Number.MAX_SAFE_INTEGER]){
  const base=REPUTATION.win[grade];const expected=base===0?0:Math.max(1,Math.round(base*(royal?1.25:1)/Math.sqrt(1+Math.max(0,current)/200)));
  assert.equal(battleReputationDelta(grade,true,royal,current),expected);
  assert.equal(battleReputationDelta(grade,false,royal,current),grade==='D'?-5:-3);
 }
});
