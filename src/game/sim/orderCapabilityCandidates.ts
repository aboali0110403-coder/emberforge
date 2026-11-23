import { selectCapabilityOrderLevel } from '../orderCapability';
// S3 research alternatives. softMaterial delegates to the selected production model.
export type CapabilityCandidate = 'smithLinear' | 'boundedExperience' | 'materialCoherent' | 'softMaterial';
export interface CapabilityInput {
  smithLevel: number; completedOrders: number; popularity: number;
  furnace: number; relevantToolTier: number;
}
export function materialLevelCeiling(furnace: number): number {
  // Existing stage rarity and furnace-unlock boundaries, not invented progression caps.
  return furnace < 2 ? 8 : furnace < 3 ? 12 : furnace < 4 ? 16 : 18;
}
export function candidateOrderLevel(model: CapabilityCandidate, input: CapabilityInput, draw: number): number {
  const smith = Math.max(1, Math.min(20, input.smithLevel));
  const experience = Math.min(1, Math.log2(1 + Math.max(0,input.completedOrders)) / 6);
  const access = Math.min(1, Math.max(0,input.popularity) / 240);
  const comfort = Math.min(1, Math.max(0,input.relevantToolTier-1) / 4);
  const u = Math.max(0,Math.min(1-Number.EPSILON,draw));
  if (model === 'smithLinear') {
    const max = Math.min(18,Math.max(2,Math.round(smith + 1 + comfort)));
    return Math.max(1,max-4)+Math.floor(u*(max-Math.max(1,max-4)+1));
  }
  const center = Math.min(18, Math.max(1,smith - 1 + experience*.75 + access*.5 + comfort*.5));
  // Nonuniform challenge tail. Experience/access alter within-capability demand,
  // but neither raw order count nor station average grows the anchor without bound.
  const offset = u < .20 ? -2 : u < .55 ? -1 : u < .90 ? 0 : 1;
  const level = Math.max(1,Math.min(18,Math.round(center)+offset));
  if (model === 'materialCoherent') return Math.min(materialLevelCeiling(input.furnace),level);
  if (model === 'softMaterial') return selectCapabilityOrderLevel(input,draw);

  return level;
}
