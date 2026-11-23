/** Historical pre-S4 battle/reputation reference, approved TD routing23Nov2026. */
import { evaluateBattlePreview,getQualityGrade,clamp,randInt } from '../../rules';
import { QUALITY_GRADE_META } from '../../../data/config';
import { BALANCE } from '../../../data/balance';
import { MATERIALS } from '../../../data/materials';
import type { PendingBattle,BattleResult } from '../../../types';
export function resolveBattleOutcome(
  pending: PendingBattle,
  rng: () => number = Math.random,
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
    popularityDelta = Math.max(
      2,
      Math.round(
        (BALANCE.popularityWinBase + pending.weapon.level * 1.4 + gradeMeta.popBonus) *
          (0.6 + pending.quality * 0.6) *
          (pending.wasRoyal ? 1.4 : 1.0),
      ),
    );
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
  } else if (grade === 'D') {
    popularityDelta = -2;
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

