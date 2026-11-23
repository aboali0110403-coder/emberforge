import { battleReputationDelta,deliveryReputationDelta,REPUTATION } from '../reputation';
/** Experimental S4 candidates only. No production reputation mutation. */
import { getQualityGrade } from '../rules';
export type ReputationModel='historical'|'crossingOnly'|'sustained'|'gentle';
export interface ReputationInput {quality:number;level:number;royal:boolean;current:number;won:boolean;oldLevel:number;milestone:number|null;firstKingdomTier:boolean;}
export function candidateReputation(model:ReputationModel,x:ReputationInput){
 const grade=getQualityGrade(x.quality);
 if(model==='historical'||model==='crossingOnly')return {battle:x.won?Math.max(2,Math.round((14+x.level*1.4+({S:6,A:3,B:1,C:0,D:-4}[grade]))*(.6+x.quality*.6)*(x.royal?1.4:1))):grade==='D'?-2:0,delivery:grade==='D'?-4:0,milestone:x.milestone!==null&&(model==='historical'||x.oldLevel<x.milestone)?35:0,miss:10};
 if(model==='gentle')return {battle:battleReputationDelta(grade,x.won,x.royal,x.current),delivery:deliveryReputationDelta(grade),milestone:x.milestone!==null&&x.oldLevel<x.milestone&&x.firstKingdomTier?REPUTATION.firstEarnedKingdomTier:0,miss:REPUTATION.missedOrder};
 const bases=model==='sustained'?{S:7,A:5,B:3,C:1,D:0}:{S:9,A:7,B:4,C:2,D:0};
 const factor=model==='sustained'?1/(1+x.current/100):1/Math.sqrt(1+x.current/100);
 const raw=bases[grade]*(x.royal?1.25:1);
 return {battle:x.won?(raw>0?Math.max(1,Math.round(raw*factor)):0):grade==='D'?-5:-3,delivery:grade==='D'?-3:0,
 milestone:x.milestone!==null&&x.oldLevel<x.milestone&&x.firstKingdomTier?8:0,miss:model==='sustained'?6:8};
}
