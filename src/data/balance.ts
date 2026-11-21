import type { RarityId } from '../types';

export interface BalanceConfig {
  // Level-up probability formula: clamp(base + qWeight*Q + pWeight*min(1, P/Preq) - levelPenalty*L, minChance, maxChance)
  levelBaseChance: number;
  levelQualityWeight: number;
  levelPotencyWeight: number;
  levelPenaltyPerLevel: number;
  levelMinChance: number;
  levelMaxChance: number;
  // Preq = preqBase + preqPerLevel * L
  preqBase: number;
  preqPerLevel: number;
  // Low-rarity material cap
  rarityInsufficientCap: number;
  // +2 level jump thresholds
  doubleJumpMinQuality: number;
  doubleJumpPotencyMultiplier: number;
  // Material affinity multipliers
  affinityTargetRace: number;
  affinityGeneralWeapon: number;
  affinityOtherRace: number;
  // Gold delivery & economy multipliers
  deliveryGoldBaseMult: number;
  royalCommissionFeeMult: number;
  materialValueReimburseRatio: number;
  unreinforcedLv3Penalty: number;
  promptDeliveryBonusMult: number;
  sellBackRatio: number;
  territoryBonusPerClear: number;
  // Orders & timers (active seconds)
  maxActiveOrders: number;
  customerArrivalSecMin: number;
  customerArrivalSecMax: number;
  orderDeadlineMinSec: number;
  orderDeadlineMaxSec: number;
  royalCommissionChance: number;
  summonCooldownSec: number;
  // Shop rotating stock
  rotatingStockRefreshSec: number;
  rareShopPriceMultiplier: number;
  equipmentBasePrice: number;
  equipmentPriceGrowth: number;
  // Battle timings & rewards
  battleDelayMinSec: number;
  battleDelayMaxSec: number;
  popularityWinBase: number;
  popularityMissDeadlinePenalty: number;
  legendaryPopBonus: number;
  // Mini-game step lengths (seconds)
  furnaceDurationSec: number;
  grindstoneDurationSec: number;
  quenchDurationSec: number;
}

export const DEFAULT_BALANCE: BalanceConfig = {
  levelBaseChance: 0.15,
  levelQualityWeight: 0.55,
  levelPotencyWeight: 0.30,
  levelPenaltyPerLevel: 0.02,
  levelMinChance: 0.05,
  levelMaxChance: 0.95,
  preqBase: 2.0,
  preqPerLevel: 1.2,
  rarityInsufficientCap: 0.25,
  doubleJumpMinQuality: 0.95,
  doubleJumpPotencyMultiplier: 2.0,
  affinityTargetRace: 1.5,
  affinityGeneralWeapon: 1.0,
  affinityOtherRace: 0.6,
  deliveryGoldBaseMult: 1.0,
  royalCommissionFeeMult: 2.2,
  materialValueReimburseRatio: 0.32,
  unreinforcedLv3Penalty: 0.75,
  promptDeliveryBonusMult: 0.10,
  sellBackRatio: 0.50,
  territoryBonusPerClear: 0.05,
  maxActiveOrders: 3,
  customerArrivalSecMin: 18,
  customerArrivalSecMax: 32,
  orderDeadlineMinSec: 150,
  orderDeadlineMaxSec: 260,
  royalCommissionChance: 0.3,
  summonCooldownSec: 6,
  rotatingStockRefreshSec: 420,
  rareShopPriceMultiplier: 1.35,
  equipmentBasePrice: 120,
  equipmentPriceGrowth: 2.2,
  battleDelayMinSec: 24,
  battleDelayMaxSec: 44,
  popularityWinBase: 14,
  popularityMissDeadlinePenalty: 10,
  legendaryPopBonus: 35,
  furnaceDurationSec: 15,
  grindstoneDurationSec: 16,
  quenchDurationSec: 14,
};

// Mutable runtime balance reference for the hidden Debug Panel (key D)
export const BALANCE: BalanceConfig = { ...DEFAULT_BALANCE };

export function resetBalance(): void {
  Object.assign(BALANCE, DEFAULT_BALANCE);
}

export function getStageMinRarity(level: number): RarityId {
  if (level <= 4) return 'common';
  if (level <= 8) return 'uncommon';
  if (level <= 12) return 'rare';
  if (level <= 16) return 'epic';
  return 'mythic';
}

export function getStageLabel(level: number): string {
  if (level <= 4) return 'Common Stage (Lv 1-4)';
  if (level <= 8) return 'Uncommon Stage (Lv 5-8)';
  if (level <= 12) return 'Rare Stage (Lv 9-12)';
  if (level <= 16) return 'Epic Stage (Lv 13-16)';
  return 'Mythic Stage (Lv 17-20)';
}
