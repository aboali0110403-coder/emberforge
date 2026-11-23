/** Frozen historical S0 order logic from cd18ede5. Do not tune for S3. */
import { BALANCE } from '../../../data/balance';
import { POPULARITY_TIERS, getSmithProgress } from '../../../data/config';
import { RACES } from '../../../data/races';
import { getWeaponsForRace } from '../../../data/weapons';
import { clamp, pickRandom, randInt, createWeaponInstance, nextUid } from '../../rules';
import type { SaveState, Order, RaceId } from '../../../types';

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

  // Scale level gently with player progress & Smith Level
  const smithLevel = getSmithProgress(state.smithXp).level;
  const avgEquip =
    Object.values(state.equipment).reduce((a, b) => a + b, 0) /
    Object.values(state.equipment).length;
  const maxSuggestedLevel = clamp(
    Math.round(2 + state.stats.ordersCompleted * 0.32 + (avgEquip - 1) * 2.2 + (smithLevel - 1) * 0.4),
    2,
    18,
  );
  const minSuggestedLevel = clamp(maxSuggestedLevel - 4, 1, 14);
  const level = clamp(
    randInt(minSuggestedLevel, maxSuggestedLevel, rng),
    minSuggestedLevel,
    maxSuggestedLevel,
  );

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

