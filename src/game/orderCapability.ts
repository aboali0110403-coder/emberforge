import { getStepsForRequest, WEAPONS } from '../data/weapons';
import type { EquipmentId, WeaponTypeId } from '../types';

export interface OrderCapabilityInput {
  smithLevel: number; completedOrders: number; popularity: number;
  furnace: number; relevantToolTier: number;
}
export function materialLevelCeiling(furnace: number): number {
  return furnace < 2 ? 8 : furnace < 3 ? 12 : furnace < 4 ? 16 : 18;
}
export function relevantOrderToolTier(weapon: WeaponTypeId, equipment: Record<EquipmentId,number>): number {
  const stations = new Set(WEAPONS[weapon].possibleRequests.flatMap(r => getStepsForRequest(r.focus,r.targetPart)));
  const tools = [...stations].filter(s => s !== 'furnace').map(s => equipment[s]);
  if (stations.has('anvil')) tools.push(equipment.hammer);
  return tools.length ? Math.min(...tools) : 1;
}
/** Selected S3 model: Smith anchor, bounded experience/access, material-aware
 * distribution and a rare one-level material bridge. Never a mastery bonus. */
export function selectCapabilityOrderLevel(input: OrderCapabilityInput, draw: number): number {
  const smith = Math.max(1,Math.min(20,input.smithLevel));
  const experience = Math.min(1,Math.log2(1+Math.max(0,input.completedOrders))/6);
  const access = Math.min(1,Math.max(0,input.popularity)/240);
  const comfort = Math.min(1,Math.max(0,input.relevantToolTier-1)/4);
  const center = Math.min(18,Math.max(1,smith-1+experience*.75+access*.5+comfort*.5));
  const materialAnchor = Math.min(center,materialLevelCeiling(input.furnace)-1);
  const u = Math.max(0,Math.min(1-Number.EPSILON,draw));
  const offset = u < .15 ? -2 : u < .45 ? -1 : u < .85 ? 0 : u < .98 ? 1 : 2;
  return Math.max(1,Math.min(18,Math.round(materialAnchor)+offset));
}
