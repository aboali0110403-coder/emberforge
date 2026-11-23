import { calculateDeliveryGoldBreakdown, getMaterialSellPrice } from './rules';
import type { MaterialStackSelection, Order, SaveState } from '../types';

export interface MaterialCommitmentComparison {
  selectedEstimatedDeliveryFee: number;
  zeroMaterialEstimatedDeliveryFee: number;
  conditionalDeliveryFeeDifference: number;
  selectedMaterialUnits: number;
  currentSellBackValue: number;
  qualityAssumption: 0.85;
}

/** Compare an existing selection, without validating, reserving or spending it.
 * Fees are conditional estimates, not profit or guaranteed rewards. Sell-back
 * value is the current sale alternative, not acquisition cost or a sale promise.
 */
export function compareMaterialCommitment(
  order: Readonly<Order>,
  save: Readonly<Pick<SaveState, 'conqueredTerritories'>>,
  selectedMaterials: readonly Readonly<MaterialStackSelection>[],
): MaterialCommitmentComparison {
  const qualityAssumption = 0.85;
  const stacks = selectedMaterials.map((stack) => ({ ...stack }));
  // Mirror App's delivery caller: normal UI matches the requested part, and
  // fees use incoming level and the remaining ratio captured at forge start.
  const context = {
    baseFee: order.baseFee,
    fulfilment: order.kind === 'royal' ? 1.15 : 1.0,
    quality: qualityAssumption,
    weaponLevel: order.weapon.level,
    remainingRatio: order.deadlineSec > 0 ? order.remainingSec / order.deadlineSec : 0,
    conqueredCount: save.conqueredTerritories?.[order.race]?.length ?? 0,
    isRoyal: order.kind === 'royal',
  };
  const selected = calculateDeliveryGoldBreakdown({ ...context, stacks });
  const zeroMaterial = calculateDeliveryGoldBreakdown({ ...context, stacks: [] });

  return {
    selectedEstimatedDeliveryFee: selected.totalGold,
    zeroMaterialEstimatedDeliveryFee: zeroMaterial.totalGold,
    conditionalDeliveryFeeDifference: selected.totalGold - zeroMaterial.totalGold,
    selectedMaterialUnits: stacks.reduce((sum, stack) => sum + stack.units, 0),
    currentSellBackValue: stacks.reduce(
      (sum, stack) => sum + getMaterialSellPrice(stack.materialId) * stack.units,
      0,
    ),
    qualityAssumption,
  };
}
