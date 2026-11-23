import { battleReputationDelta } from './reputation';
import { relevantOrderToolTier, selectCapabilityOrderLevel } from './orderCapability';
import { createDailyLedger, sanitizeDailyLedger } from './dailyLedger';
import { ACHIEVEMENTS } from '../data/achievements';
import { BALANCE, getStageMinRarity } from '../data/balance';
import {
  LEGENDARY_LEVEL,
  LEGENDARY_MILESTONES,
  POPULARITY_TIERS,
  PROGRESSIVE_UNLOCK,
  QUALITY_GRADE_META,
  RARITY_ORDER,
  SAVE_VERSION,
  UNLOCK_SEQUENCE,
  getSmithProgress,
} from '../data/config';
import { MATERIALS, MATERIAL_BY_ID } from '../data/materials';
import { ENEMY_ARCHETYPE_INFO, RACES } from '../data/races';
import { WEAPONS, getWeaponsForRace } from '../data/weapons';
import type {
  BattleBreakdown,
  BattleResult,
  CompletedOrderRecord,
  EnemyArchetype,
  EquipmentId,
  KingLetter,
  MaterialDef,
  MaterialStackSelection,
  Order,
  PendingBattle,
  PlayerCustomization,
  PopularityTierId,
  QualityGrade,
  RaceId,
  RarityId,
  RequestFocus,
  RotatingShopItem,
  SaveState,
  WeaponInstance,
  WeaponRecord,
  WeaponStats,
  WeaponTypeId,
} from '../types';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function randRange(min: number, max: number, rng: () => number = Math.random): number {
  return min + rng() * (max - min);
}

export function randInt(min: number, max: number, rng: () => number = Math.random): number {
  return Math.floor(randRange(min, max + 1, rng));
}

export function pickRandom<T>(arr: readonly T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function getRarityIndex(r: RarityId): number {
  return RARITY_ORDER.indexOf(r);
}

export function maxRarity(a: RarityId, b: RarityId): RarityId {
  return getRarityIndex(a) >= getRarityIndex(b) ? a : b;
}

export function getQualityGrade(quality: number): QualityGrade {
  const q = clamp(Number.isFinite(quality) ? quality : 0, 0, 1);
  if (q >= 0.94) return 'S';
  if (q >= 0.82) return 'A';
  if (q >= 0.65) return 'B';
  if (q >= 0.45) return 'C';
  return 'D';
}

export function getRequiredFurnaceTierForRarity(rarity: RarityId): number {
  switch (rarity) {
    case 'common':
    case 'uncommon':
      return 1;
    case 'rare':
      return 2;
    case 'epic':
      return 3;
    case 'mythic':
      return 4;
  }
}

export function canUseMaterialWithFurnace(material: MaterialDef, furnaceTier: number): boolean {
  return furnaceTier >= getRequiredFurnaceTierForRarity(material.rarity);
}

/**
 * Affinity multiplier:
 * 1.5 on target race's signature weapons,
 * 1.0 on general weapons (Sword, Shield, Dagger),
 * 0.6 on other races' signature weapons.
 */
export function getMaterialAffinity(
  material: MaterialDef,
  weaponType: WeaponTypeId,
): number {
  const weapon = WEAPONS[weaponType];
  if (weapon.ownerRace === 'general') {
    return BALANCE.affinityGeneralWeapon;
  }
  if (weapon.ownerRace === material.targetRace) {
    return BALANCE.affinityTargetRace;
  }
  return BALANCE.affinityOtherRace;
}

export function calculateTotalPotency(
  stacks: MaterialStackSelection[],
  weaponType: WeaponTypeId,
): number {
  let total = 0;
  for (const stack of stacks) {
    const mat = MATERIAL_BY_ID[stack.materialId];
    if (!mat || stack.units <= 0) continue;
    const affinity = getMaterialAffinity(mat, weaponType);
    total += stack.units * mat.potency * affinity;
  }
  return total;
}

export function getMaterialShapeBonuses(
  stacks: MaterialStackSelection[],
  hasArcane: boolean,
): WeaponStats {
  const bonus: WeaponStats = { power: 0, edge: 0, balance: 0, durability: 0, arcane: 0 };
  for (const stack of stacks) {
    const mat = MATERIAL_BY_ID[stack.materialId];
    if (!mat || stack.units <= 0) continue;
    const tierScale = 1 + getRarityIndex(mat.rarity) * 0.45;
    const qty = Math.min(5, stack.units);
    switch (mat.shape) {
      case 'ingot':
        bonus.power += Math.round(qty * 0.65 * tierScale);
        bonus.durability += Math.round(qty * 0.4 * tierScale);
        break;
      case 'hide':
        bonus.durability += Math.round(qty * 0.7 * tierScale);
        bonus.balance += Math.round(qty * 0.35 * tierScale);
        break;
      case 'wood':
        bonus.balance += Math.round(qty * 0.65 * tierScale);
        bonus.power += Math.round(qty * 0.35 * tierScale);
        break;
      case 'thread':
        bonus.edge += Math.round(qty * 0.65 * tierScale);
        bonus.balance += Math.round(qty * 0.4 * tierScale);
        break;
      case 'crystal':
        if (hasArcane) {
          bonus.arcane += Math.round(qty * 0.85 * tierScale);
        } else {
          bonus.power += Math.round(qty * 0.45 * tierScale);
        }
        bonus.edge += Math.round(qty * 0.4 * tierScale);
        break;
    }
  }
  return bonus;
}

export function deriveWeaponTrait(
  grade: QualityGrade,
  stacks: MaterialStackSelection[],
  focus: RequestFocus | null,
): string | null {
  if (grade !== 'S' && grade !== 'A') return null;
  let crystalCount = 0;
  let ingotCount = 0;
  let hideCount = 0;
  let woodCount = 0;
  let threadCount = 0;
  for (const s of stacks) {
    const mat = MATERIAL_BY_ID[s.materialId];
    if (!mat || s.units <= 0) continue;
    if (mat.shape === 'crystal') crystalCount += s.units;
    else if (mat.shape === 'ingot') ingotCount += s.units;
    else if (mat.shape === 'hide') hideCount += s.units;
    else if (mat.shape === 'wood') woodCount += s.units;
    else if (mat.shape === 'thread') threadCount += s.units;
  }

  const maxShape = Math.max(crystalCount, ingotCount, hideCount, woodCount, threadCount);
  if (maxShape > 0) {
    if (crystalCount === maxShape) return grade === 'S' ? 'Star-Runed' : 'Arcane-Etched';
    if (ingotCount === maxShape) return grade === 'S' ? 'Sunforged' : 'Heavy-Tempered';
    if (hideCount === maxShape) return grade === 'S' ? 'Ironbound' : 'Reinforced';
    if (woodCount === maxShape) return grade === 'S' ? 'Wind-Balanced' : 'Poised';
    if (threadCount === maxShape) return grade === 'S' ? 'Razor-Woven' : 'Keen-Bound';
  }

  if (focus === 'edge') return grade === 'S' ? 'Razor-Honed' : 'Keen';
  if (focus === 'power') return grade === 'S' ? 'Titan-Forged' : 'Crushing';
  if (focus === 'durability') return grade === 'S' ? 'Unbreakable' : 'Stalwart';
  if (focus === 'arcane') return grade === 'S' ? 'Astral-Tempered' : 'Glyph-Bound';
  return grade === 'S' ? 'Master-Balanced' : 'Well-Balanced';
}

export function calculateRequiredPotency(weaponLevel: number): number {
  return BALANCE.preqBase + BALANCE.preqPerLevel * weaponLevel;
}

export interface LevelUpEvaluation {
  chance: number;
  potency: number;
  preq: number;
  meetsStageRarity: boolean;
  canDoubleJump: boolean;
}

export function evaluateLevelUp(
  weaponLevel: number,
  weaponType: WeaponTypeId,
  quality: number,
  stacks: MaterialStackSelection[],
): LevelUpEvaluation {
  const P = calculateTotalPotency(stacks, weaponType);
  const Preq = calculateRequiredPotency(weaponLevel);
  const stageMinRarity = getStageMinRarity(weaponLevel);
  const stageMinIdx = getRarityIndex(stageMinRarity);

  const meetsStageRarity =
    stacks.length > 0 &&
    stacks.some((s) => {
      const m = MATERIAL_BY_ID[s.materialId];
      return m && s.units > 0 && getRarityIndex(m.rarity) >= stageMinIdx;
    });

  const raw =
    BALANCE.levelBaseChance +
    BALANCE.levelQualityWeight * quality +
    BALANCE.levelPotencyWeight * Math.min(1, P / Math.max(0.01, Preq)) -
    BALANCE.levelPenaltyPerLevel * weaponLevel;

  let chance = clamp(raw, BALANCE.levelMinChance, BALANCE.levelMaxChance);
  if (!meetsStageRarity) {
    chance = Math.min(chance, BALANCE.rarityInsufficientCap);
  }

  const canDoubleJump =
    quality >= BALANCE.doubleJumpMinQuality &&
    P >= BALANCE.doubleJumpPotencyMultiplier * Preq &&
    meetsStageRarity;

  return { chance, potency: P, preq: Preq, meetsStageRarity, canDoubleJump };
}

export function rollWeaponLevelUp(
  weaponLevel: number,
  weaponType: WeaponTypeId,
  quality: number,
  stacks: MaterialStackSelection[],
  rng: () => number = Math.random,
): { newLevel: number; jumpedTwo: boolean; evaluation: LevelUpEvaluation } {
  const evaluation = evaluateLevelUp(weaponLevel, weaponType, quality, stacks);
  if (weaponLevel >= 20) {
    return { newLevel: 20, jumpedTwo: false, evaluation };
  }
  const roll = rng();
  if (roll <= evaluation.chance) {
    const step = evaluation.canDoubleJump ? 2 : 1;
    const newLevel = Math.min(20, weaponLevel + step);
    return { newLevel, jumpedTwo: step === 2 && newLevel === weaponLevel + 2, evaluation };
  }
  return { newLevel: weaponLevel, jumpedTwo: false, evaluation };
}

export function getTerritoryTributeMultiplier(
  conqueredTerritories: Record<RaceId, string[]> | undefined,
  race: RaceId,
): number {
  const clears = conqueredTerritories?.[race]?.length ?? 0;
  return 1 + Math.min(3, clears) * BALANCE.territoryBonusPerClear;
}

export interface DeliveryGoldBreakdown {
  totalGold: number;
  baseGold: number;
  materialReimbursement: number;
  promptBonusGold: number;
  territoryBonusGold: number;
  unreinforcedApplied: boolean;
}

export function calculateDeliveryGoldBreakdown(params: {
  baseFee: number;
  fulfilment: number;
  quality: number;
  weaponLevel: number;
  stacks: MaterialStackSelection[];
  remainingRatio?: number;
  conqueredCount?: number;
  isRoyal?: boolean;
}): DeliveryGoldBreakdown {
  const grade = getQualityGrade(params.quality);
  const gradeMult = QUALITY_GRADE_META[grade].feeMultiplier;
  const totalMatUnits = params.stacks.reduce((acc, s) => acc + Math.max(0, s.units), 0);

  // Prevent infinite zero-material exploits on Lv 3+ commissions while keeping Lv 1-2 forgiving
  const unreinforcedApplied = params.weaponLevel >= 3 && totalMatUnits === 0 && !params.isRoyal;
  const unreinforcedFactor = unreinforcedApplied ? BALANCE.unreinforcedLv3Penalty : 1.0;

  let matValue = 0;
  for (const s of params.stacks) {
    const mat = MATERIAL_BY_ID[s.materialId];
    if (!mat || s.units <= 0) continue;
    matValue += mat.basePrice * s.units;
  }
  const materialReimbursement = Math.round(matValue * BALANCE.materialValueReimburseRatio);

  const baseGold = Math.max(
    5,
    Math.round(
      params.baseFee *
        params.fulfilment *
        (0.55 + params.quality * 0.45) *
        gradeMult *
        unreinforcedFactor *
        BALANCE.deliveryGoldBaseMult,
    ),
  );

  const promptEligible = (params.remainingRatio ?? 0) >= 0.5 && grade !== 'D';
  const promptBonusGold = promptEligible
    ? Math.round(baseGold * BALANCE.promptDeliveryBonusMult)
    : 0;

  const clears = Math.min(3, Math.max(0, params.conqueredCount ?? 0));
  const territoryBonusGold = clears > 0
    ? Math.round(baseGold * clears * BALANCE.territoryBonusPerClear)
    : 0;

  const totalGold = Math.max(5, baseGold + materialReimbursement + promptBonusGold + territoryBonusGold);

  return {
    totalGold,
    baseGold,
    materialReimbursement,
    promptBonusGold,
    territoryBonusGold,
    unreinforcedApplied,
  };
}

export function calculateDeliveryGold(
  baseFee: number,
  fulfilment: number,
  quality: number,
): number {
  return Math.max(5, Math.round(baseFee * fulfilment * quality * BALANCE.deliveryGoldBaseMult));
}

export function calculateForgeXp(
  weaponLevel: number,
  quality: number,
  isRoyal: boolean,
  leveledUp: boolean,
): number {
  const grade = getQualityGrade(quality);
  const gradeXpBonus = grade === 'S' ? 28 : grade === 'A' ? 18 : grade === 'B' ? 10 : grade === 'C' ? 4 : 0;
  const base = 24 + weaponLevel * 6 + gradeXpBonus + (leveledUp ? 12 : 0);
  return Math.round(base * (isRoyal ? 1.45 : 1.0));
}

export function getEquipmentUpgradeCost(currentTier: number): number {
  if (currentTier >= 5) return Infinity;
  return Math.round(BALANCE.equipmentBasePrice * Math.pow(BALANCE.equipmentPriceGrowth, currentTier - 1));
}

export function getMaterialSellPrice(materialId: string): number {
  const mat = MATERIAL_BY_ID[materialId];
  if (!mat) return 0;
  return Math.max(1, Math.floor(mat.basePrice * BALANCE.sellBackRatio));
}

export function sellMaterialFromInventory(
  state: SaveState,
  materialId: string,
  qty = 1,
): { state: SaveState; goldEarned: number } {
  const owned = state.inventory[materialId] ?? 0;
  const units = Math.min(owned, Math.max(0, Math.floor(qty)));
  if (units <= 0) return { state, goldEarned: 0 };

  const unitPrice = getMaterialSellPrice(materialId);
  if (unitPrice <= 0) return { state, goldEarned: 0 };

  const goldEarned = unitPrice * units;
  const nextInv = { ...state.inventory };
  const rem = owned - units;
  if (rem <= 0) {
    delete nextInv[materialId];
  } else {
    nextInv[materialId] = rem;
  }

  return {
    goldEarned,
    state: {
      ...state,
      gold: state.gold + goldEarned,
      inventory: nextInv,
      stats: {
        ...state.stats,
        totalGoldEarned: state.stats.totalGoldEarned + goldEarned,
      },
    },
  };
}

export function getPopularityTier(score: number): {
  id: PopularityTierId;
  label: string;
  min: number;
  nextMin: number | null;
} {
  let current = POPULARITY_TIERS[0];
  let nextMin: number | null = POPULARITY_TIERS[1].min;
  for (let i = 0; i < POPULARITY_TIERS.length; i++) {
    if (score >= POPULARITY_TIERS[i].min) {
      current = POPULARITY_TIERS[i];
      nextMin = i + 1 < POPULARITY_TIERS.length ? POPULARITY_TIERS[i + 1].min : null;
    }
  }
  return { ...current, nextMin };
}

export function computeWeaponRating(weapon: WeaponInstance): number {
  const s = weapon.stats;
  const traitBonus = weapon.trait ? 4 : 0;
  return Math.round(
    s.power * 1.1 +
      s.edge * 1.0 +
      s.balance * 0.8 +
      s.durability * 0.8 +
      s.arcane * 1.15 +
      weapon.level * 2.5 +
      traitBonus,
  );
}

export function getEnemyArchetypeForScenario(
  race: RaceId,
  scenarioName: string,
  explicit?: EnemyArchetype,
): EnemyArchetype {
  if (explicit && ENEMY_ARCHETYPE_INFO[explicit]) return explicit;
  const found = RACES[race]?.scenarios.find((sc) => sc.name === scenarioName);
  return found?.archetype ?? 'skirmishers';
}

export function evaluateBattlePreview(params: {
  weapon: WeaponInstance;
  race: RaceId;
  scenarioName: string;
  scenarioDifficulty: number;
  enemyArchetype?: EnemyArchetype;
  smithLevel?: number;
  quality?: number;
}): BattleBreakdown {
  const archetype = getEnemyArchetypeForScenario(
    params.race,
    params.scenarioName,
    params.enemyArchetype,
  );
  const s = params.weapon.stats;
  const rating = computeWeaponRating(params.weapon);
  const q = clamp(params.quality ?? 0.85, 0, 1);
  const smithLevel = Math.max(1, params.smithLevel ?? 1);

  let archetypeScore = 0;
  switch (archetype) {
    case 'skirmishers':
      archetypeScore = s.edge * 0.32 + s.balance * 0.28 - 4;
      break;
    case 'armored':
      archetypeScore = s.power * 0.35 + s.durability * 0.25 - 4;
      break;
    case 'warded':
      archetypeScore = s.arcane * 0.45 + s.edge * 0.2 - 3;
      break;
    case 'beasts':
      archetypeScore = s.power * 0.22 + s.durability * 0.25 + s.edge * 0.18 - 5;
      break;
    case 'void':
      archetypeScore = s.arcane * 0.4 + s.power * 0.2 + params.weapon.level * 0.7 - 6;
      break;
  }

  const matchupBonus = clamp(Math.round(archetypeScore), -8, 16);
  const qualityBonus = Math.round((q - 0.5) * 16);
  const smithBonus = Math.min(10, Math.floor((smithLevel - 1) * 1.1));

  const effectivePower = rating + matchupBonus + qualityBonus + smithBonus;
  const winProb = clamp(
    0.5 + (effectivePower - params.scenarioDifficulty) * 0.024,
    0.15,
    0.96,
  );

  return {
    weaponRating: rating,
    scenarioThreat: params.scenarioDifficulty,
    matchupLabel: ENEMY_ARCHETYPE_INFO[archetype].label,
    matchupBonus,
    qualityBonus,
    smithBonus,
    winChancePct: Math.round(winProb * 100),
  };
}

export function resolveBattleOutcome(
  pending: PendingBattle,
  rng: () => number = Math.random,
  currentPopularity = 0,
): BattleResult {
  const breakdown = evaluateBattlePreview({
    weapon: pending.weapon,
    race: pending.race,
    scenarioName: pending.scenarioName,
    scenarioDifficulty: pending.scenarioDifficulty,
    enemyArchetype: pending.enemyArchetype,
    smithLevel: pending.smithLevel ?? 1,
    quality: pending.quality,
  });

  const winProb = breakdown.winChancePct / 100;
  const won = rng() <= winProb;
  const grade = getQualityGrade(pending.quality);
  const gradeMeta = QUALITY_GRADE_META[grade];

  const baseSat = won ? 56 : 22;
  const satisfaction = Math.round(
    clamp(
      baseSat +
        pending.quality * 26 +
        (pending.fulfilment - 0.8) * 18 +
        pending.weapon.level * 1.2 +
        (pending.weapon.trait ? 4 : 0),
      12,
      100,
    ),
  );

  let popularityDelta = 0;
  const materialRewards: { materialId: string; count: number }[] = [];
  let goldBonus = 0;

  if (won) {
    popularityDelta = battleReputationDelta(grade,true,Boolean(pending.wasRoyal),currentPopularity);
    if (pending.wasRoyal) {
      goldBonus = Math.round(45 + satisfaction * 0.9);
    } else if (grade === 'S' || grade === 'A') {
      goldBonus = Math.round(12 + pending.weapon.level * 2.5);
    }

    // Material drops from customer's own sourceRace
    const raceMats = MATERIALS.filter((m) => m.sourceRace === pending.race);
    const maxRarityIdx =
      satisfaction >= 90 && pending.weapon.level >= 12
        ? 4
        : satisfaction >= 75 && pending.weapon.level >= 7
          ? 3
          : satisfaction >= 60 && pending.weapon.level >= 3
            ? 2
            : satisfaction >= 45
              ? 1
              : 0;

    const dropRolls = (pending.wasRoyal ? 2 : 1) * pending.rewardMultiplier;
    const rewardMap = new Map<string, number>();

    for (let i = 0; i < dropRolls; i++) {
      // Bias toward higher allowed rarity when satisfaction is high
      const tierPick = clamp(
        Math.floor(rng() * (maxRarityIdx + 1) * (0.65 + (satisfaction / 100) * 0.5)),
        0,
        maxRarityIdx,
      );
      const chosen = raceMats[tierPick] ?? raceMats[0];
      const qty = chosen.rarity === 'mythic' ? 1 : chosen.rarity === 'epic' ? 1 : randInt(1, 3, rng);
      rewardMap.set(chosen.id, (rewardMap.get(chosen.id) ?? 0) + qty);
    }

    for (const [materialId, count] of rewardMap.entries()) {
      materialRewards.push({ materialId, count });
    }
  } else {
    popularityDelta = battleReputationDelta(grade,false,Boolean(pending.wasRoyal),currentPopularity);
  }

  return {
    battleId: pending.id,
    race: pending.race,
    customerName: pending.customerName,
    portraitVariant: pending.portraitVariant,
    weapon: pending.weapon,
    scenarioName: pending.scenarioName,
    enemyArchetype: pending.enemyArchetype,
    won,
    satisfaction,
    qualityGrade: grade,
    popularityDelta,
    materialRewards,
    goldBonus,
    breakdown,
  };
}

// V0.2: resolve a pending battle's outcome exactly once and return the battle
// with the persisted result attached. Idempotent: a battle that already
// carries its own resolved result is returned unchanged, never rerolled.
export function resolvePendingBattleResult(
  battle: PendingBattle,
  rng: () => number = Math.random,
  currentPopularity = 0,
): PendingBattle {
  if (battle.resolvedResult && battle.resolvedResult.battleId === battle.id) {
    return battle;
  }
  return { ...battle, resolvedResult: resolveBattleOutcome(battle, rng,currentPopularity) };
}

export interface BattleClaimOutcome {
  state: SaveState;
  claimed: boolean;
  newlyUnlockedAchievements: string[];
  newlyUnlockedRaces: RaceId[];
}

// V0.2: claim a resolved battle. Consumes the outcome persisted on the
// pending battle; it never rerolls. Defensive idempotency: if the battle is
// no longer pending (already claimed), nothing is granted. Atomic within a
// single save-state update.
export function applyBattleClaimResult(
  prev: SaveState,
  displayedResult: BattleResult,
): BattleClaimOutcome {
  const noop: BattleClaimOutcome = {
    state: prev,
    claimed: false,
    newlyUnlockedAchievements: [],
    newlyUnlockedRaces: [],
  };
  const pending = prev.pendingBattles.find((b) => b.id === displayedResult.battleId);
  if (!pending) return noop;

  // The persisted result is authoritative. The displayed result is only a
  // fallback for a battle whose result could not be persisted (legacy path).
  const result = pending.resolvedResult ?? displayedResult;

  const nextInv = { ...prev.inventory };
  const mythics = new Set(prev.stats.mythicsCollected);
  for (const rw of result.materialRewards) {
    nextInv[rw.materialId] = (nextInv[rw.materialId] ?? 0) + rw.count;
    const matDef = MATERIAL_BY_ID[rw.materialId];
    if (matDef?.rarity === 'mythic') {
      mythics.add(matDef.id);
    }
  }

  const nextPop = {
    ...prev.popularity,
    [result.race]: Math.max(0, prev.popularity[result.race] + result.popularityDelta),
  };
  const nextUnlocked = checkProgressiveUnlocks(nextPop, prev.unlockedRaces);

  const prevTerritories = prev.conqueredTerritories?.[result.race] ?? [];
  const conqueredNow = result.won && !prevTerritories.includes(result.scenarioName);
  const nextTerritories = conqueredNow
    ? [...prevTerritories, result.scenarioName]
    : prevTerritories;

  const historyEntry: BattleResult = {
    ...result,
    enemyArchetype: result.enemyArchetype ?? pending.enemyArchetype,
    territoryConquered: conqueredNow,
  };

  const draft: SaveState = {
    ...prev,
    gold: prev.gold + result.goldBonus,
    inventory: nextInv,
    popularity: nextPop,
    unlockedRaces: nextUnlocked,
    conqueredTerritories: {
      ...prev.conqueredTerritories,
      [result.race]: nextTerritories,
    },
    pendingBattles: prev.pendingBattles.filter((b) => b.id !== result.battleId),
    battleHistory: [...(prev.battleHistory ?? []), historyEntry].slice(-60),
    stats: {
      ...prev.stats,
      totalGoldEarned: prev.stats.totalGoldEarned + result.goldBonus,
      mythicsCollected: Array.from(mythics),
      battlesWon: (prev.stats.battlesWon ?? 0) + (result.won ? 1 : 0),
      battlesLost: (prev.stats.battlesLost ?? 0) + (result.won ? 0 : 1),
    },
  };

  const achRes = evaluateAchievements(draft);
  if (achRes.newlyUnlocked.length > 0) {
    draft.achievementsUnlocked = [
      ...draft.achievementsUnlocked,
      ...achRes.newlyUnlocked,
    ];
    draft.gold += achRes.goldAwarded;
    draft.stats.totalGoldEarned += achRes.goldAwarded;
  }

  return {
    state: draft,
    claimed: true,
    newlyUnlockedAchievements: achRes.newlyUnlocked,
    newlyUnlockedRaces: nextUnlocked.slice(prev.unlockedRaces.length),
  };
}

export function checkProgressiveUnlocks(
  popularity: Record<RaceId, number>,
  currentUnlocked: RaceId[],
): RaceId[] {
  if (!PROGRESSIVE_UNLOCK) {
    return [...UNLOCK_SEQUENCE];
  }
  const unlocked = new Set<RaceId>(currentUnlocked);
  unlocked.add('human');

  for (let i = 1; i < UNLOCK_SEQUENCE.length; i++) {
    const prevRace = UNLOCK_SEQUENCE[i - 1];
    const nextRace = UNLOCK_SEQUENCE[i];
    if (unlocked.has(prevRace) && popularity[prevRace] >= POPULARITY_TIERS[1].min) {
      unlocked.add(nextRace);
    }
  }
  return UNLOCK_SEQUENCE.filter((r) => unlocked.has(r));
}

export function createWeaponInstance(
  type: WeaponTypeId,
  level: number,
  uid: string,
): WeaponInstance {
  const def = WEAPONS[type];
  const stageRarity = getStageMinRarity(level);
  const parts: Record<string, { partKey: string; rarity: RarityId; level: number }> = {};
  for (const partKey of def.parts) {
    parts[partKey] = { partKey, rarity: stageRarity, level };
  }
  const scale = 1 + (level - 1) * 0.14;
  return {
    uid,
    type,
    level,
    stats: {
      power: Math.round(def.baseStats.power * scale),
      edge: Math.round(def.baseStats.edge * scale),
      balance: Math.round(def.baseStats.balance * scale),
      durability: Math.round(def.baseStats.durability * scale),
      arcane: def.hasArcane ? Math.round(def.baseStats.arcane * scale) : 0,
    },
    parts,
    legendaryNotifiedLevels: [],
    trait: null,
  };
}

let uidCounter = 1;
export function nextUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

export function createTutorialOrder(): Order {
  return {
    id: 'order_tutorial_1',
    kind: 'standard',
    race: 'human',
    customerName: 'Sir Garrick',
    portraitVariant: 0,
    weapon: createWeaponInstance('sword', 1, 'wpn_tut_1'),
    requestFocus: 'edge',
    requestText: 'Sharper blade edge',
    targetPart: 'blade',
    baseFee: 65,
    deadlineSec: 360,
    remainingSec: 360,
    scenarioName: 'Border Bandit Ambush',
    scenarioDifficulty: 30,
    enemyArchetype: 'skirmishers',
    isTutorial: true,
  };
}

export function generateCustomerOrder(
  state: SaveState,
  rng: () => number = Math.random,
): Order {
  const unlocked = state.unlockedRaces.length > 0 ? state.unlockedRaces : (['human'] as RaceId[]);
  const race = pickRandom(unlocked, rng);
  const raceDef = RACES[race];

  // Check if eligible for Royal Commission (Renowned >= 140)
  const isRenowned = state.popularity[race] >= POPULARITY_TIERS[3].min;
  const kind: 'standard' | 'royal' =
    isRenowned && rng() < BALANCE.royalCommissionChance ? 'royal' : 'standard';

  const weaponDefs = getWeaponsForRace(race);
  const weaponDef = pickRandom(weaponDefs, rng);

  // S3 capability anchor, bounded experience, weapon-repertoire tools and material access.
  const smithLevel = getSmithProgress(state.smithXp).level;
  const level = selectCapabilityOrderLevel({
    smithLevel, completedOrders: state.stats.ordersCompleted,
    popularity: state.popularity[race], furnace: state.equipment.furnace,
    relevantToolTier: relevantOrderToolTier(weaponDef.id,state.equipment),
  }, rng());

  const weapon = createWeaponInstance(weaponDef.id, level, nextUid('wpn'));
  const scenario = pickRandom(raceDef.scenarios, rng);
  const scenarioDifficulty = Math.round(22 + scenario.difficulty * 0.6 + level * 5.2);

  const customerName =
    kind === 'royal'
      ? `Royal Envoy of ${raceDef.kingdomName}`
      : pickRandom(raceDef.customerNames, rng);
  const portraitVariant = randInt(0, 2, rng);

  const deadlineSec = randInt(BALANCE.orderDeadlineMinSec, BALANCE.orderDeadlineMaxSec, rng);

  if (kind === 'royal') {
    const baseFee = Math.round((55 + level * 16) * BALANCE.royalCommissionFeeMult);
    return {
      id: nextUid('ord'),
      kind: 'royal',
      race,
      customerName,
      portraitVariant,
      weapon,
      requestFocus: null,
      requestText: `Royal Commission: Craft freely to impress ${raceDef.kingTitle}.`,
      targetPart: weaponDef.parts[0],
      baseFee,
      deadlineSec: Math.round(deadlineSec * 1.25),
      remainingSec: Math.round(deadlineSec * 1.25),
      scenarioName: scenario.name,
      scenarioDifficulty,
      enemyArchetype: scenario.archetype,
    };
  }

  const req = pickRandom(weaponDef.possibleRequests, rng);
  const baseFee = Math.round(48 + level * 14);

  return {
    id: nextUid('ord'),
    kind: 'standard',
    race,
    customerName,
    portraitVariant,
    weapon,
    requestFocus: req.focus,
    requestText: req.text,
    targetPart: req.targetPart,
    baseFee,
    deadlineSec,
    remainingSec: deadlineSec,
    scenarioName: scenario.name,
    scenarioDifficulty,
    enemyArchetype: scenario.archetype,
  };
}

export function rollRotatingStock(
  rng: () => number = Math.random,
  includeEpic = false,
): RotatingShopItem[] {
  const rares = MATERIALS.filter((m) => m.rarity === 'rare');
  const shuffledRares = [...rares].sort(() => rng() - 0.5);
  const items: RotatingShopItem[] = shuffledRares.slice(0, includeEpic ? 2 : 3).map((m) => ({
    materialId: m.id,
    stock: randInt(2, 4, rng),
    price: Math.round(m.basePrice * BALANCE.rareShopPriceMultiplier),
  }));

  if (includeEpic) {
    const epics = MATERIALS.filter((m) => m.rarity === 'epic');
    const chosenEpic = pickRandom(epics, rng);
    items.push({
      materialId: chosenEpic.id,
      stock: randInt(1, 2, rng),
      price: Math.round(chosenEpic.basePrice * BALANCE.rareShopPriceMultiplier),
    });
  }

  return items;
}

export function createInitialSaveState(player: PlayerCustomization): SaveState {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    activePlaySec: 0,
    dailyLedger: createDailyLedger(0, 'complete'),
    smithXp: 0,
    player,
    gold: 120,
    inventory: {
      human_common: 4,
      orc_common: 3,
      goblin_common: 2,
    },
    equipment: {
      furnace: 1,
      hammer: 1,
      anvil: 1,
      grindstone: 1,
      quench: 1,
      workbench: 1,
    },
    popularity: {
      human: 0,
      elf: 0,
      goblin: 0,
      orc: 0,
      demon: 0,
    },
    unlockedRaces: PROGRESSIVE_UNLOCK ? ['human'] : [...UNLOCK_SEQUENCE],
    conqueredTerritories: {
      human: [],
      elf: [],
      goblin: [],
      orc: [],
      demon: [],
    },
    orders: [createTutorialOrder()],
    pendingBattles: [],
    kingLetters: [],
    weaponArmory: [],
    completedOrders: [],
    battleHistory: [],
    achievementsUnlocked: [],
    tutorialsSeen: {
      firstOrder: false,
      stations: {
        furnace: false,
        anvil: false,
        grindstone: false,
        quench: false,
        workbench: false,
      },
    },
    rotatingStock: rollRotatingStock(),
    rotatingStockTimerSec: BALANCE.rotatingStockRefreshSec,
    nextCustomerTimerSec: 12,
    stats: {
      ordersCompleted: 0,
      ordersMissed: 0,
      noMissStreak: 0,
      bestPerfectStreak: 0,
      totalGoldEarned: 0,
      racesServed: [],
      highestWeaponLevel: 1,
      mythicsCollected: [],
      legendaryWeaponsForged: 0,
      battlesWon: 0,
      battlesLost: 0,
      masterworkCount: 0,
    },
    audio: {
      musicVolume: 0.45,
      sfxVolume: 0.75,
      muted: false,
    },
  };
}

export function evaluateAchievements(state: SaveState): {
  newlyUnlocked: string[];
  goldAwarded: number;
} {
  const unlockedSet = new Set(state.achievementsUnlocked);
  const newlyUnlocked: string[] = [];
  let goldAwarded = 0;

  for (const ach of ACHIEVEMENTS) {
    if (!unlockedSet.has(ach.id) && ach.check(state)) {
      unlockedSet.add(ach.id);
      newlyUnlocked.push(ach.id);
      goldAwarded += ach.goldReward;
    }
  }

  return { newlyUnlocked, goldAwarded };
}

export function getLegendaryMultiplier(level: number): number {
  if (level >= 20) return 4;
  if (level >= 15) return 3;
  if (level >= LEGENDARY_LEVEL) return 2;
  return 1;
}

export function checkLegendaryMilestone(
  weapon: WeaponInstance,
): number | null {
  if (Number.isFinite(weapon.level)) {
    const selected = [...LEGENDARY_MILESTONES]
      .reverse()
      .find((milestone) => weapon.level >= milestone);
    if (selected === undefined) return null;
    const alreadyNotified = LEGENDARY_MILESTONES.some(
      (milestone) =>
        milestone >= selected &&
        weapon.legendaryNotifiedLevels.includes(milestone),
    );
    return alreadyNotified ? null : selected;
  }

  // Preserve the existing public behavior for non-finite weapon levels.
  for (const milestone of LEGENDARY_MILESTONES) {
    if (
      weapon.level >= milestone &&
      !weapon.legendaryNotifiedLevels.includes(milestone)
    ) {
      return milestone;
    }
  }
  return null;
}

export function createKingLetter(
  race: RaceId,
  playerName: string,
  weapon: WeaponInstance,
  milestoneLevel: number,
): KingLetter {
  const raceDef = RACES[race];
  const weaponDef = WEAPONS[weapon.type];
  return {
    id: nextUid('ltr'),
    race,
    milestoneLevel,
    title: raceDef.letterTitle,
    body: raceDef.letterBody(playerName, weaponDef.name, weapon.level),
    timestamp: Date.now(),
  };
}

function isValidRaceId(val: unknown): val is RaceId {
  return typeof val === 'string' && val in RACES;
}

function isValidWeaponType(val: unknown): val is WeaponTypeId {
  return typeof val === 'string' && val in WEAPONS;
}

function sanitizePositiveNumber(val: unknown, fallback: number, max = 10_000_000): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return clamp(val, 0, max);
}

function sanitizeWeaponInstance(raw: unknown): WeaponInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Partial<WeaponInstance>;
  if (!isValidWeaponType(w.type)) return null;
  const level = Math.round(clamp(typeof w.level === 'number' && Number.isFinite(w.level) ? w.level : 1, 1, 20));
  const def = WEAPONS[w.type];
  const base = createWeaponInstance(w.type, level, typeof w.uid === 'string' && w.uid ? w.uid : nextUid('wpn'));
  if (w.stats && typeof w.stats === 'object') {
    base.stats = {
      power: Math.round(sanitizePositiveNumber(w.stats.power, base.stats.power, 9999)),
      edge: Math.round(sanitizePositiveNumber(w.stats.edge, base.stats.edge, 9999)),
      balance: Math.round(sanitizePositiveNumber(w.stats.balance, base.stats.balance, 9999)),
      durability: Math.round(sanitizePositiveNumber(w.stats.durability, base.stats.durability, 9999)),
      arcane: def.hasArcane ? Math.round(sanitizePositiveNumber(w.stats.arcane, base.stats.arcane, 9999)) : 0,
    };
  }
  if (w.parts && typeof w.parts === 'object') {
    const cleanParts: WeaponInstance['parts'] = { ...base.parts };
    for (const partKey of def.parts) {
      const p = w.parts[partKey];
      if (p && typeof p === 'object' && RARITY_ORDER.includes(p.rarity)) {
        cleanParts[partKey] = {
          partKey,
          rarity: p.rarity,
          level: Math.round(clamp(Number.isFinite(p.level) ? p.level : level, 1, 20)),
        };
      }
    }
    base.parts = cleanParts;
  }
  if (Array.isArray(w.legendaryNotifiedLevels)) {
    base.legendaryNotifiedLevels = w.legendaryNotifiedLevels.filter(
      (n): n is number => typeof n === 'number' && Number.isFinite(n),
    );
  }
  base.trait = typeof w.trait === 'string' ? w.trait.slice(0, 32) : null;
  return base;
}

function sanitizeOrder(raw: unknown): Order | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Order>;
  if (!isValidRaceId(o.race)) return null;
  const weapon = sanitizeWeaponInstance(o.weapon);
  if (!weapon) return null;
  const wDef = WEAPONS[weapon.type];
  const kind = o.kind === 'royal' ? 'royal' : 'standard';
  const baseFee = Math.max(10, Math.round(sanitizePositiveNumber(o.baseFee, 60, 100_000)));
  const deadlineSec = Math.max(30, Math.round(sanitizePositiveNumber(o.deadlineSec, 180, 3600)));
  const remainingSec = Math.max(1, Math.round(sanitizePositiveNumber(o.remainingSec, deadlineSec, 3600)));
  const targetPart =
    typeof o.targetPart === 'string' && wDef.parts.includes(o.targetPart)
      ? o.targetPart
      : wDef.parts[0];
  const validFocuses: RequestFocus[] = ['edge', 'power', 'grip', 'durability', 'arcane'];
  const requestFocus =
    o.requestFocus && validFocuses.includes(o.requestFocus) ? o.requestFocus : kind === 'royal' ? null : 'edge';

  return {
    id: typeof o.id === 'string' && o.id ? o.id : nextUid('ord'),
    kind,
    race: o.race,
    customerName:
      typeof o.customerName === 'string' && o.customerName.trim()
        ? o.customerName.trim().slice(0, 48)
        : RACES[o.race].customerNames[0],
    portraitVariant: Math.round(clamp(typeof o.portraitVariant === 'number' && Number.isFinite(o.portraitVariant) ? o.portraitVariant : 0, 0, 2)),
    weapon,
    requestFocus,
    requestText: typeof o.requestText === 'string' && o.requestText ? o.requestText : 'Forge request',
    targetPart,
    baseFee,
    deadlineSec,
    remainingSec,
    scenarioName:
      typeof o.scenarioName === 'string' && o.scenarioName
        ? o.scenarioName
        : RACES[o.race].scenarios[0].name,
    scenarioDifficulty: Math.max(5, Math.round(sanitizePositiveNumber(o.scenarioDifficulty, 15, 500))),
    enemyArchetype: getEnemyArchetypeForScenario(
      o.race,
      typeof o.scenarioName === 'string' ? o.scenarioName : RACES[o.race].scenarios[0].name,
      o.enemyArchetype,
    ),
    isTutorial: Boolean(o.isTutorial),
  };
}

// V0.2: validate a persisted battle result. Anything malformed, mismatched
// or out of range is dropped or clamped so crafted save data cannot grant
// arbitrary rewards. Returns null when the result cannot be trusted at all;
// the caller then re-resolves the battle once through the normal rules.
function sanitizeBattleResult(raw: unknown, expectedBattleId: string): BattleResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<BattleResult>;
  if (typeof r.battleId !== 'string' || r.battleId !== expectedBattleId) return null;
  if (!isValidRaceId(r.race)) return null;
  if (typeof r.won !== 'boolean') return null;
  const weapon = sanitizeWeaponInstance(r.weapon);
  if (!weapon) return null;

  const scenarioName =
    typeof r.scenarioName === 'string' && r.scenarioName
      ? r.scenarioName
      : RACES[r.race].scenarios[0].name;

  // Reward clamps match the maximum values resolveBattleOutcome can produce.
  const materialRewards: { materialId: string; count: number }[] = [];
  if (Array.isArray(r.materialRewards)) {
    for (const m of r.materialRewards.slice(0, 8)) {
      if (m && typeof m === 'object' && MATERIAL_BY_ID[(m as { materialId?: unknown }).materialId as string]) {
        const entry = m as { materialId: string; count?: unknown };
        const count = Math.round(
          clamp(
            typeof entry.count === 'number' && Number.isFinite(entry.count) ? entry.count : 0,
            0,
            24,
          ),
        );
        if (count > 0) materialRewards.push({ materialId: entry.materialId, count });
      }
    }
  }

  const breakdown =
    r.breakdown &&
    typeof r.breakdown === 'object' &&
    typeof (r.breakdown as Partial<BattleBreakdown>).winChancePct === 'number' &&
    Number.isFinite((r.breakdown as Partial<BattleBreakdown>).winChancePct)
      ? (r.breakdown as BattleBreakdown)
      : undefined;

  const clean: BattleResult = {
    battleId: r.battleId,
    race: r.race,
    customerName:
      typeof r.customerName === 'string' && r.customerName
        ? r.customerName
        : RACES[r.race].customerNames[0],
    portraitVariant: Math.round(
      clamp(
        typeof r.portraitVariant === 'number' && Number.isFinite(r.portraitVariant)
          ? r.portraitVariant
          : 0,
        0,
        2,
      ),
    ),
    weapon,
    scenarioName,
    enemyArchetype: getEnemyArchetypeForScenario(r.race, scenarioName, r.enemyArchetype),
    won: r.won,
    satisfaction: Math.round(
      clamp(
        typeof r.satisfaction === 'number' && Number.isFinite(r.satisfaction)
          ? r.satisfaction
          : 50,
        0,
        100,
      ),
    ),
    qualityGrade:
      typeof r.qualityGrade === 'string' && r.qualityGrade in QUALITY_GRADE_META
        ? r.qualityGrade
        : undefined,
    popularityDelta: Math.round(
      clamp(
        typeof r.popularityDelta === 'number' && Number.isFinite(r.popularityDelta)
          ? r.popularityDelta
          : 0,
        -10,
        200,
      ),
    ),
    materialRewards,
    goldBonus: Math.round(
      clamp(
        typeof r.goldBonus === 'number' && Number.isFinite(r.goldBonus) ? r.goldBonus : 0,
        0,
        500,
      ),
    ),
  };
  // Keep optional keys absent (not undefined) so sanitized results stay
  // deep-equal to their pre-serialization form.
  if (typeof r.territoryConquered === 'boolean') clean.territoryConquered = r.territoryConquered;
  if (breakdown) clean.breakdown = breakdown;
  if (clean.qualityGrade === undefined) delete clean.qualityGrade;
  return clean;
}

function sanitizePendingBattle(raw: unknown): PendingBattle | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<PendingBattle>;
  if (!isValidRaceId(b.race)) return null;
  const weapon = sanitizeWeaponInstance(b.weapon);
  if (!weapon) return null;
  const etaSec = Math.max(0, Math.round(sanitizePositiveNumber(b.etaSec, 0, 600)));
  const ready = Boolean(b.ready) || etaSec <= 0;
  const id = typeof b.id === 'string' && b.id ? b.id : nextUid('bat');
  const resolvedResult = sanitizeBattleResult(b.resolvedResult, id) ?? undefined;
  return {
    id,
    orderId: typeof b.orderId === 'string' ? b.orderId : '',
    race: b.race,
    customerName: typeof b.customerName === 'string' && b.customerName ? b.customerName : RACES[b.race].customerNames[0],
    portraitVariant: Math.round(clamp(typeof b.portraitVariant === 'number' && Number.isFinite(b.portraitVariant) ? b.portraitVariant : 0, 0, 2)),
    weapon,
    quality: clamp(typeof b.quality === 'number' && Number.isFinite(b.quality) ? b.quality : 0.75, 0, 1),
    fulfilment: clamp(typeof b.fulfilment === 'number' && Number.isFinite(b.fulfilment) ? b.fulfilment : 1, 0.5, 1.5),
    scenarioName: typeof b.scenarioName === 'string' && b.scenarioName ? b.scenarioName : RACES[b.race].scenarios[0].name,
    scenarioDifficulty: Math.max(5, Math.round(sanitizePositiveNumber(b.scenarioDifficulty, 15, 500))),
    enemyArchetype: getEnemyArchetypeForScenario(
      b.race,
      typeof b.scenarioName === 'string' ? b.scenarioName : RACES[b.race].scenarios[0].name,
      b.enemyArchetype,
    ),
    smithLevel: Math.max(1, Math.round(sanitizePositiveNumber(b.smithLevel, 1, 20))),
    etaSec,
    ready,
    rewardMultiplier: Math.round(clamp(typeof b.rewardMultiplier === 'number' && Number.isFinite(b.rewardMultiplier) ? b.rewardMultiplier : 1, 1, 4)),
    wasRoyal: Boolean(b.wasRoyal),
    resolvedResult,
  };
}

// Ordered, explicit save migrations. Each step upgrades the sanitized state
// by one schema version; keep them in ascending order. Generic field
// sanitization above always runs first and targets the CURRENT schema, so
// every step receives structurally valid data.
function applyOrderedMigrations(state: SaveState, fromVersion: number): SaveState {
  let next = state;
  // v1 -> v2: smithXp backfill; applied during sanitization (smithXp falls
  // back to ordersCompleted * 35 when the field is absent).
  if (fromVersion < 3) {
    next = migrateV2toV3(next);
  }
  // Repair pass (any incoming version): a ready battle must always carry a
  // persisted result. Fires when sanitization dropped a malformed result.
  if (next.pendingBattles.some((b) => b.ready && !b.resolvedResult)) {
    next = {
      ...next,
      pendingBattles: next.pendingBattles.map((b) =>
        b.ready ? resolvePendingBattleResult(b) : b,
      ),
    };
  }
  return next;
}

// v2 -> v3: battles now persist their resolved outcome. Legacy saves can hold
// ready battles whose outcome was never resolved (it used to be rolled at
// modal-open time). Resolve each of them exactly once here; the result is
// persisted with the save, so no later reload, modal open or claim can reroll.
function migrateV2toV3(state: SaveState): SaveState {
  return {
    ...state,
    pendingBattles: state.pendingBattles.map((b) =>
      b.ready ? resolvePendingBattleResult(b) : b,
    ),
  };
}

export function migrateSaveState(raw: unknown): SaveState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<SaveState>;
  if (!obj.player || typeof obj.player !== 'object') return null;
  if (typeof obj.gold !== 'number' || !Number.isFinite(obj.gold)) return null;
  const fromVersion =
    typeof obj.version === 'number' && Number.isFinite(obj.version)
      ? Math.max(1, Math.floor(obj.version))
      : 1;

  const p = obj.player as Partial<PlayerCustomization>;
  const cleanPlayer: PlayerCustomization = {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 24) : 'Rowan',
    gender: p.gender === 'female' ? 'female' : 'male',
    hairColorIndex: Math.round(clamp(typeof p.hairColorIndex === 'number' && Number.isFinite(p.hairColorIndex) ? p.hairColorIndex : 0, 0, 4)),
    skinToneIndex: Math.round(clamp(typeof p.skinToneIndex === 'number' && Number.isFinite(p.skinToneIndex) ? p.skinToneIndex : 0, 0, 3)),
    outfitColorIndex: Math.round(clamp(typeof p.outfitColorIndex === 'number' && Number.isFinite(p.outfitColorIndex) ? p.outfitColorIndex : 0, 0, 3)),
  };

  const base = createInitialSaveState(cleanPlayer);

  // Sanitize equipment tiers (1..5)
  const cleanEquipment = { ...base.equipment };
  if (obj.equipment && typeof obj.equipment === 'object') {
    for (const eqKey of Object.keys(cleanEquipment) as EquipmentId[]) {
      const val = obj.equipment[eqKey];
      if (typeof val === 'number' && Number.isFinite(val)) {
        cleanEquipment[eqKey] = Math.round(clamp(val, 1, 5));
      }
    }
  }

  // Sanitize popularity (>= 0)
  const cleanPopularity = { ...base.popularity };
  if (obj.popularity && typeof obj.popularity === 'object') {
    for (const rKey of UNLOCK_SEQUENCE) {
      cleanPopularity[rKey] = Math.round(sanitizePositiveNumber(obj.popularity[rKey], 0, 100_000));
    }
  }

  // Sanitize unlocked races
  const rawUnlocked = Array.isArray(obj.unlockedRaces)
    ? obj.unlockedRaces.filter(isValidRaceId)
    : base.unlockedRaces;
  const cleanUnlocked = checkProgressiveUnlocks(cleanPopularity, rawUnlocked);

  // Sanitize inventory
  const cleanInventory: Record<string, number> = {};
  if (obj.inventory && typeof obj.inventory === 'object') {
    for (const [matId, qty] of Object.entries(obj.inventory)) {
      if (MATERIAL_BY_ID[matId] && typeof qty === 'number' && Number.isFinite(qty) && qty > 0) {
        cleanInventory[matId] = Math.floor(clamp(qty, 0, 9999));
      }
    }
  }

  // Sanitize conquered territories
  const cleanConquered: Record<RaceId, string[]> = {
    human: [],
    elf: [],
    goblin: [],
    orc: [],
    demon: [],
  };
  if (obj.conqueredTerritories && typeof obj.conqueredTerritories === 'object') {
    for (const rKey of UNLOCK_SEQUENCE) {
      const list = obj.conqueredTerritories[rKey];
      if (Array.isArray(list)) {
        const validScenarios = new Set(RACES[rKey].scenarios.map((s) => s.name));
        cleanConquered[rKey] = Array.from(
          new Set(list.filter((s): s is string => typeof s === 'string' && validScenarios.has(s))),
        );
      }
    }
  }

  // Sanitize rotating stock
  const cleanRotStock: RotatingShopItem[] = [];
  if (Array.isArray(obj.rotatingStock)) {
    for (const item of obj.rotatingStock) {
      if (item && typeof item === 'object' && MATERIAL_BY_ID[item.materialId]) {
        cleanRotStock.push({
          materialId: item.materialId,
          stock: Math.round(clamp(Number.isFinite(item.stock) ? item.stock : 0, 0, 99)),
          price: Math.max(1, Math.round(sanitizePositiveNumber(item.price, MATERIAL_BY_ID[item.materialId].basePrice, 50_000))),
        });
      }
    }
  }

  // Sanitize orders & battles
  const cleanOrders = Array.isArray(obj.orders)
    ? obj.orders.map(sanitizeOrder).filter((o): o is Order => o !== null).slice(0, 5)
    : base.orders;

  const cleanBattles = Array.isArray(obj.pendingBattles)
    ? obj.pendingBattles.map(sanitizePendingBattle).filter((b): b is PendingBattle => b !== null).slice(0, 12)
    : [];

  // Sanitize armory, completedOrders, battleHistory
  const cleanArmory: WeaponRecord[] = Array.isArray(obj.weaponArmory)
    ? obj.weaponArmory
        .filter((r): r is WeaponRecord => Boolean(r && typeof r === 'object' && isValidWeaponType(r.type) && isValidRaceId(r.race)))
        .slice(-80)
    : [];

  const cleanCompleted: CompletedOrderRecord[] = Array.isArray(obj.completedOrders)
    ? obj.completedOrders
        .filter((r): r is CompletedOrderRecord => Boolean(r && typeof r === 'object' && isValidWeaponType(r.weaponType) && isValidRaceId(r.race)))
        .slice(-60)
    : [];

  const cleanBattleHistory: BattleResult[] = Array.isArray(obj.battleHistory)
    ? obj.battleHistory
        .filter((b): b is BattleResult => Boolean(b && typeof b === 'object' && isValidRaceId(b.race) && b.weapon && isValidWeaponType(b.weapon.type)))
        .slice(-60)
    : [];

  const cleanKingLetters: KingLetter[] = Array.isArray(obj.kingLetters)
    ? obj.kingLetters.filter(
        (l): l is KingLetter =>
          Boolean(l && typeof l === 'object' && isValidRaceId(l.race) && typeof l.title === 'string' && typeof l.body === 'string'),
      )
    : [];

  const validAchSet = new Set(ACHIEVEMENTS.map((a) => a.id));
  const cleanAchievements = Array.isArray(obj.achievementsUnlocked)
    ? Array.from(new Set(obj.achievementsUnlocked.filter((id): id is string => typeof id === 'string' && validAchSet.has(id))))
    : [];

  const rawStats = obj.stats ?? ({} as Partial<SaveState['stats']>);
  const cleanStats: SaveState['stats'] = {
    ordersCompleted: Math.round(sanitizePositiveNumber(rawStats.ordersCompleted, 0, 1_000_000)),
    ordersMissed: Math.round(sanitizePositiveNumber(rawStats.ordersMissed, 0, 1_000_000)),
    noMissStreak: Math.round(sanitizePositiveNumber(rawStats.noMissStreak, 0, 1_000_000)),
    bestPerfectStreak: Math.round(sanitizePositiveNumber(rawStats.bestPerfectStreak, 0, 1_000_000)),
    totalGoldEarned: Math.round(sanitizePositiveNumber(rawStats.totalGoldEarned, 0, 100_000_000)),
    racesServed: Array.isArray(rawStats.racesServed)
      ? Array.from(new Set(rawStats.racesServed.filter(isValidRaceId)))
      : [],
    highestWeaponLevel: Math.round(clamp(typeof rawStats.highestWeaponLevel === 'number' && Number.isFinite(rawStats.highestWeaponLevel) ? rawStats.highestWeaponLevel : 1, 1, 20)),
    mythicsCollected: Array.isArray(rawStats.mythicsCollected)
      ? Array.from(new Set(rawStats.mythicsCollected.filter((id): id is string => typeof id === 'string' && Boolean(MATERIAL_BY_ID[id]))))
      : [],
    legendaryWeaponsForged: Math.round(sanitizePositiveNumber(rawStats.legendaryWeaponsForged, 0, 1_000_000)),
    battlesWon: Math.round(sanitizePositiveNumber(rawStats.battlesWon, 0, 1_000_000)),
    battlesLost: Math.round(sanitizePositiveNumber(rawStats.battlesLost, 0, 1_000_000)),
    masterworkCount: Math.round(sanitizePositiveNumber(rawStats.masterworkCount, 0, 1_000_000)),
  };

  // Backfill smithXp gracefully when migrating v1 saves
  const inferredXp = Math.max(0, cleanStats.ordersCompleted * 35);
  const cleanSmithXp = Math.round(
    sanitizePositiveNumber(obj.smithXp, inferredXp, 10_000_000),
  );

  const rawAudio = obj.audio ?? ({} as Partial<SaveState['audio']>);
  const cleanAudio = {
    musicVolume: clamp(typeof rawAudio.musicVolume === 'number' && Number.isFinite(rawAudio.musicVolume) ? rawAudio.musicVolume : 0.45, 0, 1),
    sfxVolume: clamp(typeof rawAudio.sfxVolume === 'number' && Number.isFinite(rawAudio.sfxVolume) ? rawAudio.sfxVolume : 0.75, 0, 1),
    muted: Boolean(rawAudio.muted),
  };

  // Preserve the existing gameplay clock sanitizer exactly. A changed clock
  // cannot authenticate accounting from the raw snapshot.
  const cleanActivePlaySec = Math.round(sanitizePositiveNumber(obj.activePlaySec, 0, 100_000_000));
  const dailyLedger = obj.version === 4 && obj.activePlaySec === cleanActivePlaySec
    ? sanitizeDailyLedger(obj.dailyLedger, cleanActivePlaySec)
    : createDailyLedger(cleanActivePlaySec);

  const sanitized: SaveState = {
    version: SAVE_VERSION,
    createdAt: Math.round(sanitizePositiveNumber(obj.createdAt, base.createdAt, Number.MAX_SAFE_INTEGER)),
    updatedAt: Math.round(sanitizePositiveNumber(obj.updatedAt, Date.now(), Number.MAX_SAFE_INTEGER)),
    activePlaySec: cleanActivePlaySec,
    dailyLedger,
    smithXp: cleanSmithXp,
    player: cleanPlayer,
    gold: Math.round(sanitizePositiveNumber(obj.gold, 120, 9_999_999)),
    inventory: cleanInventory,
    equipment: cleanEquipment,
    popularity: cleanPopularity,
    unlockedRaces: cleanUnlocked,
    conqueredTerritories: cleanConquered,
    orders: cleanOrders,
    pendingBattles: cleanBattles,
    kingLetters: cleanKingLetters,
    weaponArmory: cleanArmory,
    completedOrders: cleanCompleted,
    battleHistory: cleanBattleHistory,
    achievementsUnlocked: cleanAchievements,
    tutorialsSeen: {
      firstOrder: Boolean(obj.tutorialsSeen?.firstOrder),
      stations: {
        furnace: Boolean(obj.tutorialsSeen?.stations?.furnace),
        anvil: Boolean(obj.tutorialsSeen?.stations?.anvil),
        grindstone: Boolean(obj.tutorialsSeen?.stations?.grindstone),
        quench: Boolean(obj.tutorialsSeen?.stations?.quench),
        workbench: Boolean(obj.tutorialsSeen?.stations?.workbench),
      },
    },
    rotatingStock: cleanRotStock.length > 0 ? cleanRotStock : base.rotatingStock,
    rotatingStockTimerSec: Math.round(sanitizePositiveNumber(obj.rotatingStockTimerSec, BALANCE.rotatingStockRefreshSec, 3600)),
    nextCustomerTimerSec: Math.round(sanitizePositiveNumber(obj.nextCustomerTimerSec, 12, 600)),
    stats: cleanStats,
    audio: cleanAudio,
  };

  return applyOrderedMigrations(sanitized, fromVersion);
}

export function encodeBackupCode(state: SaveState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return `EF1:${btoa(bin)}`;
}

export function decodeBackupCode(code: string): SaveState | null {
  try {
    const trimmed = code.trim();
    const payload = trimmed.startsWith('EF1:') ? trimmed.slice(4) : trimmed;
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return migrateSaveState(JSON.parse(json));
  } catch {
    return null;
  }
}

export function applyForgeUpgradesToWeapon(
  weapon: WeaponInstance,
  targetPart: string,
  quality: number,
  stacks: MaterialStackSelection[],
  equipment: Record<EquipmentId, number>,
  newLevel: number,
  focus: RequestFocus | null = null,
): { updated: WeaponInstance; deltas: WeaponStats; trait: string | null } {
  const def = WEAPONS[weapon.type];
  const grade = getQualityGrade(quality);
  const gradeMeta = QUALITY_GRADE_META[grade];

  const highestMatRarity = stacks.reduce<RarityId>((best, s) => {
    const m = MATERIAL_BY_ID[s.materialId];
    return m && s.units > 0 ? maxRarity(best, m.rarity) : best;
  }, getStageMinRarity(weapon.level));

  const potencyBonus = Math.round(calculateTotalPotency(stacks, weapon.type) * 0.28);
  const shapeBonuses = getMaterialShapeBonuses(stacks, def.hasArcane);
  const levelGain = Math.max(0, newLevel - weapon.level);
  const gradeStatBonus = gradeMeta.statBonus;

  const dPower = Math.max(
    grade === 'D' ? 0 : 1,
    Math.round(
      (1 + quality * 2.5 + potencyBonus * 0.4 + levelGain * 2 + gradeStatBonus + shapeBonuses.power) *
        (1 + (equipment.hammer - 1) * 0.14),
    ),
  );
  const dEdge = Math.max(
    grade === 'D' ? 0 : 1,
    Math.round(
      (1 + quality * 2.5 + potencyBonus * 0.4 + levelGain * 2 + gradeStatBonus + shapeBonuses.edge) *
        (1 + (equipment.grindstone - 1) * 0.14),
    ),
  );
  const dBalance = Math.max(
    grade === 'D' ? 0 : 1,
    Math.round(
      (1 + quality * 2.0 + potencyBonus * 0.3 + levelGain * 1.5 + gradeStatBonus + shapeBonuses.balance) *
        (1 + (equipment.workbench - 1) * 0.14),
    ),
  );
  const dDurability = Math.max(
    grade === 'D' ? 0 : 1,
    Math.round(
      (1 + quality * 2.2 + potencyBonus * 0.35 + levelGain * 1.8 + gradeStatBonus + shapeBonuses.durability) *
        (1 + (equipment.quench - 1) * 0.14),
    ),
  );
  const dArcane = def.hasArcane
    ? Math.max(
        grade === 'D' ? 0 : 1,
        Math.round(1 + quality * 2.2 + potencyBonus * 0.45 + levelGain * 2 + gradeStatBonus + shapeBonuses.arcane),
      )
    : 0;

  const updatedParts = { ...weapon.parts };
  const prevPart = updatedParts[targetPart] ?? {
    partKey: targetPart,
    rarity: getStageMinRarity(weapon.level),
    level: weapon.level,
  };
  updatedParts[targetPart] = {
    partKey: targetPart,
    rarity: maxRarity(prevPart.rarity, highestMatRarity),
    level: Math.max(prevPart.level, newLevel),
  };

  const trait = deriveWeaponTrait(grade, stacks, focus) ?? weapon.trait ?? null;

  const updated: WeaponInstance = {
    ...weapon,
    level: newLevel,
    stats: {
      power: weapon.stats.power + dPower,
      edge: weapon.stats.edge + dEdge,
      balance: weapon.stats.balance + dBalance,
      durability: weapon.stats.durability + dDurability,
      arcane: weapon.stats.arcane + dArcane,
    },
    parts: updatedParts,
    trait,
  };

  return {
    updated,
    trait,
    deltas: {
      power: dPower,
      edge: dEdge,
      balance: dBalance,
      durability: dDurability,
      arcane: dArcane,
    },
  };
}
