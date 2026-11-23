import type { KingLetter,QualityGrade,RaceId,WeaponInstance } from '../types';
import { LEGENDARY_MILESTONES } from '../data/config';
/** Selected S4 reputation coefficients, separate from unchanged gold/stat grade data. */
export const REPUTATION = {win:{S:9,A:7,B:4,C:2,D:0},royalMultiplier:1.25,diminishingScale:200,
 loss:3,flawedLoss:5,flawedDelivery:3,missedOrder:6,firstEarnedKingdomTier:8} as const;
export function battleReputationDelta(grade:QualityGrade,won:boolean,royal:boolean,current:number):number {
 if(!won)return -(grade==='D'?REPUTATION.flawedLoss:REPUTATION.loss);
 const base=REPUTATION.win[grade];if(base===0)return 0;
 const raw=base*(royal?REPUTATION.royalMultiplier:1)/Math.sqrt(1+Math.max(0,current)/REPUTATION.diminishingScale);
 return Math.max(1,Math.round(raw));
}
export function deliveryReputationDelta(grade:QualityGrade):number{return grade==='D'?-REPUTATION.flawedDelivery:0;}
/** New already-high-level orders are not earned milestone crossings. The
 * existing per-weapon history still guards duplicate notification. */
export function earnedLegendaryCrossing(oldLevel:number,weapon:WeaponInstance):number|null {
 const selected=[...LEGENDARY_MILESTONES].reverse().find(t=>weapon.level>=t&&oldLevel<t);
 if(selected===undefined||weapon.legendaryNotifiedLevels.some(t=>LEGENDARY_MILESTONES.includes(t as 10|15|20)&&t>=selected))return null;
 return selected;
}
/** Existing permanent letters are sufficient for one reputation award per
 * kingdom/tier. No new save state or migration. Higher tiers suppress catch-up. */
export function earnedMilestoneReputation(race:RaceId,milestone:number|null,letters:readonly KingLetter[]):number {
 if(milestone===null)return 0;
 return letters.some(l=>l.race===race&&LEGENDARY_MILESTONES.includes(l.milestoneLevel as 10|15|20)&&l.milestoneLevel>=milestone)?0:REPUTATION.firstEarnedKingdomTier;
}
