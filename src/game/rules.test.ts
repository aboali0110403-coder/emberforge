import './materialCommitmentUI.test';
import './materialCommitment.test';
import './dailyLedger.test';
// The test command lists entry suites explicitly; keep new cycle tests included.
import './worldCycle.test';
import './progressionReachability.test';
import './legendaryMilestones.test';
import './battleHudStatus.test';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyForgeUpgradesToWeapon,
  calculateDeliveryGold,
  calculateDeliveryGoldBreakdown,
  calculateForgeXp,
  calculateTotalPotency,
  checkProgressiveUnlocks,
  createInitialSaveState,
  createTutorialOrder,
  createWeaponInstance,
  decodeBackupCode,
  encodeBackupCode,
  evaluateAchievements,
  evaluateBattlePreview,
  evaluateLevelUp,
  generateCustomerOrder,
  getEquipmentUpgradeCost,
  getMaterialAffinity,
  getMaterialSellPrice,
  getMaterialShapeBonuses,
  getPopularityTier,
  getQualityGrade,
  migrateSaveState,
  resolveBattleOutcome,
  rollRotatingStock,
  rollWeaponLevelUp,
  sellMaterialFromInventory,
} from './rules';
import {
  clearSaveState,
  loadSaveStateWithStatus,
  persistSaveState,
} from './storage';
import { SAVE_BACKUP_KEY, SAVE_STORAGE_KEY, SAVE_VERSION, getSmithProgress } from '../data/config';
import { MATERIALS, MATERIAL_BY_ID } from '../data/materials';
import { RACES, RACE_LIST } from '../data/races';
import { WEAPON_LIST, getStepsForRequest } from '../data/weapons';
import {
  createMinigameRuntime,
  handleMinigamePointerDown,
  handleMinigamePointerUp,
  updateMinigame,
} from '../canvas/minigames';
import { ParticlePool } from '../gfx/particles';
import {
  computeBattleTimeline,
  computeWalkPose,
  computeWorkshopIdlePose,
  easeOutCubic,
  getWeaponHeatSpec,
} from '../canvas/animation';
import {
  advanceForgeStep,
  resolveWorkshopKeyAction,
  switchForgeStation,
} from './hotkeys';
import type { EquipmentId, ForgingSession, PendingBattle, StationId } from '../types';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.get(k) ?? null;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, v);
    },
  };
  return store;
}

test('material affinity multipliers follow 1.5x / 1.0x / 0.6x cycle', () => {
  const goblinIron = MATERIAL_BY_ID['goblin_common']; // Goblin -> Orc
  assert.equal(getMaterialAffinity(goblinIron, 'axe'), 1.5); // Orc signature
  assert.equal(getMaterialAffinity(goblinIron, 'sword'), 1.0); // General
  assert.equal(getMaterialAffinity(goblinIron, 'longbow'), 0.6); // Elf signature
});

test('quality grading maps accuracy thresholds accurately (S/A/B/C/D)', () => {
  assert.equal(getQualityGrade(0.96), 'S');
  assert.equal(getQualityGrade(0.94), 'S');
  assert.equal(getQualityGrade(0.85), 'A');
  assert.equal(getQualityGrade(0.70), 'B');
  assert.equal(getQualityGrade(0.50), 'C');
  assert.equal(getQualityGrade(0.32), 'D');
});

test('material shapes apply distinct stat profiles and Masterwork grants traits', () => {
  const ingotBonus = getMaterialShapeBonuses([{ materialId: 'goblin_rare', units: 3 }], false);
  const crystalBonus = getMaterialShapeBonuses([{ materialId: 'demon_epic', units: 3 }], true);
  assert.ok(ingotBonus.power > crystalBonus.power);
  assert.ok(crystalBonus.arcane > 0);

  const wpn = createWeaponInstance('sword', 4, 'wpn_test_trait');
  const upgraded = applyForgeUpgradesToWeapon(
    wpn,
    'blade',
    0.96,
    [{ materialId: 'goblin_rare', units: 3 }],
    { furnace: 2, hammer: 1, anvil: 1, grindstone: 1, quench: 1, workbench: 1 },
    5,
    'edge',
  );
  assert.equal(upgraded.trait, 'Sunforged');
  assert.ok(upgraded.deltas.power >= 4);
});

test('level-up evaluation caps at 25% when no material meets stage rarity', () => {
  const evalLow = evaluateLevelUp(9, 'sword', 1.0, [
    { materialId: 'human_common', units: 5 },
  ]);
  assert.equal(evalLow.meetsStageRarity, false);
  assert.ok(evalLow.chance <= 0.25);

  const evalMet = evaluateLevelUp(9, 'sword', 1.0, [
    { materialId: 'human_rare', units: 5 },
  ]);
  assert.equal(evalMet.meetsStageRarity, true);
  assert.ok(evalMet.chance > 0.5);
});

test('level-up +2 jump triggers on Q >= 0.95 and P >= 2 * Preq when roll succeeds', () => {
  const result = rollWeaponLevelUp(
    1,
    'sword',
    0.98,
    [{ materialId: 'human_uncommon', units: 5 }],
    () => 0.01,
  );
  assert.equal(result.newLevel, 3);
  assert.equal(result.jumpedTwo, true);
});

test('progressive unlock sequence opens Demon when Human reaches Known (25)', () => {
  const pop = { human: 24, elf: 0, goblin: 0, orc: 0, demon: 0 };
  assert.deepEqual(checkProgressiveUnlocks(pop, ['human']), ['human']);

  pop.human = 25;
  assert.deepEqual(checkProgressiveUnlocks(pop, ['human']), ['human', 'demon']);

  pop.demon = 25;
  assert.deepEqual(checkProgressiveUnlocks(pop, ['human', 'demon']), ['human', 'demon', 'elf']);
});

test('delivery gold breakdown rewards quality, promptness, materials, territories and penalizes Lv3+ zero-material cheese', () => {
  const gold = calculateDeliveryGold(100, 1.0, 0.85);
  assert.equal(gold, 85);

  const lv3Cheese = calculateDeliveryGoldBreakdown({
    baseFee: 100,
    fulfilment: 1.0,
    quality: 0.85,
    weaponLevel: 5,
    stacks: [],
    remainingRatio: 0.2,
    conqueredCount: 0,
  });
  assert.equal(lv3Cheese.unreinforcedApplied, true);

  const lv3Full = calculateDeliveryGoldBreakdown({
    baseFee: 100,
    fulfilment: 1.0,
    quality: 0.96,
    weaponLevel: 5,
    stacks: [{ materialId: 'human_uncommon', units: 2 }],
    remainingRatio: 0.7,
    conqueredCount: 2,
  });
  assert.equal(lv3Full.unreinforcedApplied, false);
  assert.ok(lv3Full.promptBonusGold > 0);
  assert.ok(lv3Full.territoryBonusGold > 0);
  assert.ok(lv3Full.materialReimbursement > 0);
  assert.ok(lv3Full.totalGold > lv3Cheese.totalGold);

  const p = calculateTotalPotency([{ materialId: 'orc_rare', units: 3 }], 'spear');
  assert.equal(p, 18);
});

test('shop sell-back never creates positive gold arbitrage', () => {
  for (const mat of MATERIALS) {
    const sellPrice = getMaterialSellPrice(mat.id);
    assert.ok(sellPrice > 0 && sellPrice < mat.basePrice, `${mat.id} sellPrice ${sellPrice} >= ${mat.basePrice}`);
  }

  const save = createInitialSaveState({
    name: 'Rowan',
    gender: 'male',
    hairColorIndex: 0,
    skinToneIndex: 0,
    outfitColorIndex: 0,
  });
  const startGold = save.gold;
  const { state: afterSell, goldEarned } = sellMaterialFromInventory(save, 'human_common', 2);
  assert.ok(goldEarned > 0);
  assert.equal(afterSell.gold, startGold + goldEarned);
  assert.equal(afterSell.inventory['human_common'], 2);
});

test('rotating stock includes an Epic item when Renowned is reached', () => {
  const normal = rollRotatingStock(() => 0.3, false);
  assert.equal(normal.length, 3);
  assert.ok(normal.every((i) => MATERIAL_BY_ID[i.materialId].rarity === 'rare'));

  const withEpic = rollRotatingStock(() => 0.3, true);
  assert.equal(withEpic.length, 3);
  assert.ok(withEpic.some((i) => MATERIAL_BY_ID[i.materialId].rarity === 'epic'));
});

test('enemy archetype matchups and quality grade affect combat odds and battle outcomes', () => {
  const highArmoredWeapon = createWeaponInstance('axe', 8, 'w_axe');
  const lowArmoredWeapon = createWeaponInstance('dagger', 8, 'w_dag');

  const axePreview = evaluateBattlePreview({
    weapon: highArmoredWeapon,
    race: 'human',
    scenarioName: 'Siege of Ashen Keep',
    scenarioDifficulty: 85,
    enemyArchetype: 'armored',
    smithLevel: 6,
    quality: 0.95,
  });
  const daggerPreview = evaluateBattlePreview({
    weapon: lowArmoredWeapon,
    race: 'human',
    scenarioName: 'Siege of Ashen Keep',
    scenarioDifficulty: 85,
    enemyArchetype: 'armored',
    smithLevel: 1,
    quality: 0.55,
  });
  assert.ok(axePreview.winChancePct > daggerPreview.winChancePct);

  const pending: PendingBattle = {
    id: 'b1',
    orderId: 'o1',
    race: 'orc',
    customerName: 'Urzog',
    portraitVariant: 0,
    weapon: highArmoredWeapon,
    quality: 0.95,
    fulfilment: 1.0,
    scenarioName: 'Red Gorge Clash',
    scenarioDifficulty: 20,
    enemyArchetype: 'armored',
    smithLevel: 4,
    etaSec: 0,
    ready: true,
    rewardMultiplier: 2,
    wasRoyal: false,
  };

  const winRes = resolveBattleOutcome(pending, () => 0.05);
  assert.equal(winRes.won, true);
  assert.equal(winRes.qualityGrade, 'S');
  assert.ok(winRes.popularityDelta > 0);
  assert.ok(winRes.materialRewards.length > 0);
  assert.ok(winRes.materialRewards.every((r) => r.materialId.startsWith('orc_')));
  assert.ok(winRes.breakdown !== undefined);

  const lossRes = resolveBattleOutcome(pending, () => 0.999);
  assert.equal(lossRes.won, false);
  assert.equal(lossRes.materialRewards.length, 0);
});

test('Smith XP and level progression advance properly', () => {
  const xp1 = calculateForgeXp(1, 0.96, false, true);
  const xpRoyal = calculateForgeXp(6, 0.96, true, true);
  assert.ok(xpRoyal > xp1);
  assert.equal(getSmithProgress(0).level, 1);
  assert.ok(getSmithProgress(400).level >= 3);
});

test('popularity tiers and backup code round-trip preserve full v2 save state', () => {
  assert.equal(getPopularityTier(0).id, 'unknown');
  assert.equal(getPopularityTier(25).id, 'known');
  assert.equal(getPopularityTier(140).id, 'renowned');
  assert.equal(getPopularityTier(240).id, 'legendary');

  const save = createInitialSaveState({
    name: 'TestSmith',
    gender: 'female',
    hairColorIndex: 2,
    skinToneIndex: 1,
    outfitColorIndex: 3,
  });
  save.gold = 777;
  save.smithXp = 320;
  save.conqueredTerritories.human = ['Border Bandit Ambush'];
  const code = encodeBackupCode(save);
  const decoded = decodeBackupCode(code);
  assert.ok(decoded !== null);
  assert.equal(decoded?.version, SAVE_VERSION);
  assert.equal(decoded?.player.name, 'TestSmith');
  assert.equal(decoded?.gold, 777);
  assert.equal(decoded?.smithXp, 320);
  assert.deepEqual(decoded?.conqueredTerritories.human, ['Border Bandit Ambush']);
});

test('v1 migration sanitizes invalid values and backfills Smith XP', () => {
  const v1Raw = {
    version: 1,
    player: {
      name: '  Gavin  ',
      gender: 'invalid',
      hairColorIndex: 99,
      skinToneIndex: -4,
      outfitColorIndex: 1,
    },
    gold: 250,
    equipment: { furnace: 9, hammer: -2, anvil: NaN },
    popularity: { human: 50, elf: -10 },
    unlockedRaces: ['bogus_race'],
    inventory: { human_common: 5, fake_item: 99, goblin_common: -3 },
    stats: { ordersCompleted: 4 },
    audio: { musicVolume: 5, sfxVolume: -1, muted: false },
  };
  const migrated = migrateSaveState(v1Raw);
  assert.ok(migrated !== null);
  assert.equal(migrated?.version, SAVE_VERSION);
  assert.equal(migrated?.player.name, 'Gavin');
  assert.equal(migrated?.player.gender, 'male');
  assert.equal(migrated?.equipment.furnace, 5);
  assert.equal(migrated?.equipment.hammer, 1);
  assert.equal(migrated?.popularity.elf, 0);
  assert.ok(migrated?.unlockedRaces.includes('human'));
  assert.ok(migrated?.unlockedRaces.includes('demon')); // Human 50 >= 25 unlocks demon
  assert.equal(migrated?.inventory['fake_item'], undefined);
  assert.equal(migrated?.audio.musicVolume, 1);
  assert.equal(migrated?.audio.sfxVolume, 0);
  assert.equal(migrated?.smithXp, 140); // 4 * 35 backfilled
});

test('dual-slot storage recovers valid backup when primary save is corrupted', () => {
  const store = installMockLocalStorage();
  const valid1 = createInitialSaveState({
    name: 'First',
    gender: 'male',
    hairColorIndex: 0,
    skinToneIndex: 0,
    outfitColorIndex: 0,
  });
  valid1.gold = 333;
  persistSaveState(valid1);

  const valid2 = { ...valid1, gold: 444 };
  persistSaveState(valid2); // valid1 is now in SAVE_BACKUP_KEY

  // Corrupt primary save
  store.set(SAVE_STORAGE_KEY, '{corrupt_json:::');
  const recovered = loadSaveStateWithStatus();
  assert.equal(recovered.recoveredFromBackup, true);
  assert.equal(recovered.state?.gold, 333);

  // Corrupt both slots -> cleanly clears
  store.set(SAVE_STORAGE_KEY, '{corrupt');
  store.set(SAVE_BACKUP_KEY, 'also_corrupt');
  const cleared = loadSaveStateWithStatus();
  assert.equal(cleared.state, null);
  assert.equal(cleared.corruptedCleared, true);

  clearSaveState();
});

test('achievement evaluation awards first order, masterwork, and gold rewards', () => {
  const save = createInitialSaveState({
    name: 'Rowan',
    gender: 'male',
    hairColorIndex: 0,
    skinToneIndex: 0,
    outfitColorIndex: 0,
  });
  save.stats.ordersCompleted = 1;
  save.stats.masterworkCount = 1;
  save.conqueredTerritories.human = [
    'Border Bandit Ambush',
    'Bridgewatch Skirmish',
    'Siege of Ashen Keep',
  ];
  const { newlyUnlocked, goldAwarded } = evaluateAchievements(save);
  assert.ok(newlyUnlocked.includes('first_order'));
  assert.ok(newlyUnlocked.includes('masterwork_first'));
  assert.ok(newlyUnlocked.includes('conquer_one_kingdom'));
  assert.equal(goldAwarded, 40 + 160 + 300);
});

test('all 10 weapon types create valid instances, forge steps, upgrades, and archetype previews', () => {
  assert.equal(WEAPON_LIST.length, 10);
  const equip = { furnace: 2, hammer: 2, anvil: 2, grindstone: 2, quench: 2, workbench: 2 };
  const archetypes = ['skirmishers', 'armored', 'warded', 'beasts', 'void'] as const;

  for (const def of WEAPON_LIST) {
    const wpn = createWeaponInstance(def.id, 3, `uid_${def.id}`);
    assert.equal(wpn.type, def.id);
    assert.equal(Object.keys(wpn.parts).length, def.parts.length);
    assert.equal(def.hasArcane ? wpn.stats.arcane > 0 : wpn.stats.arcane === 0, true);

    for (const req of def.possibleRequests) {
      const steps = getStepsForRequest(req.focus, req.targetPart);
      assert.ok(steps.length >= 1 && steps.length <= 4);
      const { updated, deltas } = applyForgeUpgradesToWeapon(
        wpn,
        req.targetPart,
        0.92,
        [{ materialId: 'human_uncommon', units: 2 }],
        equip,
        4,
        req.focus,
      );
      assert.ok(updated.level === 4);
      assert.ok(deltas.power >= 1 && deltas.edge >= 1 && deltas.durability >= 1);
    }

    for (const arch of archetypes) {
      const preview = evaluateBattlePreview({
        weapon: wpn,
        race: 'human',
        scenarioName: 'Border Bandit Ambush',
        scenarioDifficulty: 40,
        enemyArchetype: arch,
        smithLevel: 3,
        quality: 0.9,
      });
      assert.ok(preview.winChancePct >= 15 && preview.winChancePct <= 96);
    }
  }
});

test('all 5 equipment tiers scale upgrade cost and minigame parameters monotonically', () => {
  const costs = [1, 2, 3, 4].map((t) => getEquipmentUpgradeCost(t));
  for (let i = 1; i < costs.length; i++) {
    assert.ok(Number.isFinite(costs[i]) && costs[i] > costs[i - 1]);
  }
  assert.equal(getEquipmentUpgradeCost(5), Infinity);

  const stations: StationId[] = ['furnace', 'anvil', 'grindstone', 'quench', 'workbench'];
  const makeEquip = (tier: number): Record<EquipmentId, number> => ({
    furnace: tier,
    hammer: tier,
    anvil: tier,
    grindstone: tier,
    quench: tier,
    workbench: tier,
  });

  const t1 = makeEquip(1);
  const t5 = makeEquip(5);
  for (const st of stations) {
    const rt1 = createMinigameRuntime(st, 5, t1);
    const rt5 = createMinigameRuntime(st, 5, t5);
    assert.equal(rt1.station, st);
    assert.equal(rt5.station, st);
  }

  assert.ok(createMinigameRuntime('furnace', 5, t5).bandWidth > createMinigameRuntime('furnace', 5, t1).bandWidth);
  assert.ok(createMinigameRuntime('anvil', 5, t5).ringSpeed < createMinigameRuntime('anvil', 5, t1).ringSpeed);
  assert.ok(createMinigameRuntime('grindstone', 5, t5).zoneWidth > createMinigameRuntime('grindstone', 5, t1).zoneWidth);
  const q1 = createMinigameRuntime('quench', 5, t1);
  const q5 = createMinigameRuntime('quench', 5, t5);
  assert.ok(q5.targetTempMax - q5.targetTempMin > q1.targetTempMax - q1.targetTempMin);
});

test('minigame physics reward accuracy and penalize overheat, brittle quench, and workbench misses', () => {
  const equip = { furnace: 1, hammer: 1, anvil: 1, grindstone: 1, quench: 1, workbench: 1 };
  const particles = new ParticlePool();
  const noopCb = {
    onHitStop: () => {},
    onShake: () => {},
    onStreak: () => {},
    onFinish: () => {},
  };

  // Furnace overheat accumulates overheatSec & scorch banner
  const fRt = createMinigameRuntime('furnace', 3, equip);
  fRt.heat = 0.94;
  updateMinigame(fRt, 0.2, new Set(['Space']), equip, particles, noopCb);
  assert.ok(fRt.overheatSec > 0);
  assert.equal(fRt.statusBanner?.text, 'OVERHEAT! RELEASE BELLOWS!');

  // Quench brittle over-cool vs master temper
  let finishedAcc = 0;
  const qBrittle = createMinigameRuntime('quench', 3, equip);
  qBrittle.submerged = true;
  qBrittle.temp = 0.03;
  handleMinigamePointerUp(qBrittle, particles, { ...noopCb, onFinish: (p) => { finishedAcc = p.accuracy; } });
  assert.equal(finishedAcc, 0.32);
  assert.equal(qBrittle.statusBanner?.text, 'BRITTLE OVER-COOL!');

  let masterAcc = 0;
  const qMaster = createMinigameRuntime('quench', 3, equip);
  qMaster.submerged = true;
  qMaster.temp = (qMaster.targetTempMin + qMaster.targetTempMax) / 2;
  handleMinigamePointerUp(qMaster, particles, { ...noopCb, onFinish: (p) => { masterAcc = p.accuracy; } });
  assert.equal(masterAcc, 1.0);
  assert.equal(qMaster.statusBanner?.text, 'MASTER TEMPER!');

  // Workbench off-slot click increments fitMisses, keyboard fits cleanly
  const wRt = createMinigameRuntime('workbench', 3, equip);
  handleMinigamePointerDown(wRt, 20, 20, equip, particles, noopCb, false);
  assert.equal(wRt.fitMisses, 1);
  assert.equal(wRt.statusBanner?.text, 'CLICK DIRECTLY ON BLUEPRINT SLOT!');

  handleMinigamePointerDown(wRt, 0, 0, equip, particles, noopCb, true);
  handleMinigamePointerDown(wRt, 0, 0, equip, particles, noopCb, true);
  handleMinigamePointerDown(wRt, 0, 0, equip, particles, noopCb, true);
  assert.equal(wRt.wbPhase, 'bind');
});

test('all 15 scenarios across 5 kingdoms and standard/royal/tutorial order modes resolve cleanly', () => {
  const tut = createTutorialOrder();
  assert.equal(tut.isTutorial, true);
  assert.equal(tut.kind, 'standard');

  const save = createInitialSaveState({
    name: 'Tester',
    gender: 'male',
    hairColorIndex: 0,
    skinToneIndex: 0,
    outfitColorIndex: 0,
  });
  save.unlockedRaces = ['human', 'demon', 'elf', 'goblin', 'orc'];
  save.popularity = { human: 160, demon: 160, elf: 160, goblin: 160, orc: 160 };

  const stdOrder = generateCustomerOrder(save, () => 0.99);
  assert.equal(stdOrder.kind, 'standard');

  const royalOrder = generateCustomerOrder(save, () => 0.01);
  assert.equal(royalOrder.kind, 'royal');
  assert.equal(royalOrder.requestFocus, null);

  let scenarioCount = 0;
  for (const raceDef of RACE_LIST) {
    assert.equal(raceDef.scenarios.length, 3);
    for (const sc of raceDef.scenarios) {
      scenarioCount += 1;
      const wpn = createWeaponInstance('sword', 6, `wpn_${raceDef.id}_${scenarioCount}`);
      const pending: PendingBattle = {
        id: `bat_${scenarioCount}`,
        orderId: `ord_${scenarioCount}`,
        race: raceDef.id,
        customerName: raceDef.customerNames[0],
        portraitVariant: 0,
        weapon: wpn,
        quality: 0.88,
        fulfilment: 1.0,
        scenarioName: sc.name,
        scenarioDifficulty: Math.round(22 + sc.difficulty * 0.6 + 6 * 5.2),
        enemyArchetype: sc.archetype,
        smithLevel: 4,
        etaSec: 0,
        ready: true,
        rewardMultiplier: 1,
        wasRoyal: false,
      };
      const win = resolveBattleOutcome(pending, () => 0.05);
      assert.equal(win.won, true);
      assert.ok(win.breakdown !== undefined);
      assert.equal(RACES[raceDef.id].scenarios.some((s) => s.name === win.scenarioName), true);
    }
  }
  assert.equal(scenarioCount, 15);
});

test('hotkeys toggle forge pause, switch stations, and never conflict with modal triggers or minigame keys', () => {
  const sampleOrder = createTutorialOrder();
  const sampleSession: ForgingSession = {
    order: sampleOrder,
    steps: ['furnace', 'anvil', 'grindstone', 'quench'],
    stepIndex: 0,
    stepAccuracies: [0, 0, 0, 0],
    completedSteps: [false, false, false, false],
    selectedMaterials: [],
    targetPart: 'blade',
    streak: 0,
    bestStreakInForge: 0,
  };

  const baseCtx = {
    screen: 'workshop' as const,
    forging: sampleSession,
    activeModal: null,
    showDebug: false,
    forgePaused: false,
    showStationTutorial: false,
    key: 'p',
    repeat: false,
    isEditableTarget: false,
    hasModifier: false,
  };

  // Pause & guide & mute hotkeys during forging
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: 'p' }), { type: 'toggle_forge_pause' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: 'P' }), { type: 'toggle_forge_pause' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: 'Escape' }), { type: 'toggle_forge_pause' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: 'g' }), { type: 'open_station_guide' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: 'm' }), { type: 'toggle_mute' });

  // Station switching while forging and unpaused
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: ']' }), { type: 'switch_station_delta', delta: 1 });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: '[' }), { type: 'switch_station_delta', delta: -1 });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: 'ArrowDown' }), { type: 'switch_station_delta', delta: 1 });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: 'ArrowUp' }), { type: 'switch_station_delta', delta: -1 });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: '3' }), { type: 'switch_station_index', index: 2 });

  // Blocked while paused, tutorial open, editable target, repeat, or modifier held
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, forgePaused: true, key: ']' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, showStationTutorial: true, key: 'Escape' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, showStationTutorial: true, key: 'p' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, showStationTutorial: true, key: '2' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, isEditableTarget: true, key: 'p' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, hasModifier: true, key: 'p' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, repeat: true, key: 'p' }), { type: 'noop' });

  // Modal triggers & debug panel never conflict during active forging (protects Grindstone A/D)
  for (const k of ['o', 's', 'i', 'k', 'a', 'd', 'D', 'A', ' ', 'Enter', 'ArrowLeft', 'ArrowRight']) {
    assert.deepEqual(resolveWorkshopKeyAction({ ...baseCtx, key: k }), { type: 'noop' });
  }

  // Workshop mode modal triggers & blocking guards
  const wsCtx = { ...baseCtx, forging: null };
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, key: 'o' }), { type: 'open_modal', modal: 'orders' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, key: 's' }), { type: 'open_modal', modal: 'shop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, key: 'i' }), { type: 'open_modal', modal: 'inventory' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, key: 'k' }), { type: 'open_modal', modal: 'map' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, key: 'a' }), { type: 'open_modal', modal: 'achievements' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, key: 'd' }), { type: 'toggle_debug' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, showDebug: true, key: 'Escape' }), { type: 'close_debug' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, activeModal: 'orders', key: 'Escape' }), { type: 'close_modal' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, activeModal: null, key: 'Escape' }), { type: 'open_modal', modal: 'settings' });
  // Outcome modals (delivery/battle/legendary) & settings block conflicting modal triggers
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, activeModal: 'delivery', key: 'o' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, activeModal: 'battle', key: 'Escape' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, activeModal: 'settings', key: 'o' }), { type: 'noop' });
  assert.deepEqual(resolveWorkshopKeyAction({ ...wsCtx, activeModal: 'orders', key: 'd' }), { type: 'noop' });
});

test('non-sequential station switching and step completion record per-station accuracies cleanly', () => {
  const session: ForgingSession = {
    order: createTutorialOrder(),
    steps: ['furnace', 'anvil', 'grindstone', 'quench'],
    stepIndex: 0,
    stepAccuracies: [0, 0, 0, 0],
    completedSteps: [false, false, false, false],
    selectedMaterials: [],
    targetPart: 'blade',
    streak: 0,
    bestStreakInForge: 0,
  };

  // Switch forward from Furnace (0) to Grindstone (2)
  const sw1 = switchForgeStation(session, { kind: 'index', index: 2 });
  assert.equal(sw1.changed, true);
  assert.equal(sw1.session.stepIndex, 2);

  // Finish Grindstone (2) -> advances to Quench (3)
  const adv1 = advanceForgeStep(sw1.session, 0.9, 4);
  assert.equal(adv1.finishedAll, false);
  assert.equal(adv1.nextSession.stepIndex, 3);
  assert.equal(adv1.nextSession.completedSteps?.[2], true);

  // Attempting to switch back to completed Grindstone (2) is rejected
  const swCompleted = switchForgeStation(adv1.nextSession, { kind: 'index', index: 2 });
  assert.equal(swCompleted.changed, false);
  assert.equal(swCompleted.reason, 'completed');

  // Cycling backward from Quench (3) skips completed 2 and lands on Anvil (1)
  const swBack = switchForgeStation(adv1.nextSession, { kind: 'delta', delta: -1 });
  assert.equal(swBack.changed, true);
  assert.equal(swBack.session.stepIndex, 1);

  // Finish remaining steps: 1 -> 3 -> 0 -> done
  const adv2 = advanceForgeStep(swBack.session, 0.8, 2);
  assert.equal(adv2.finishedAll, false);
  assert.equal(adv2.nextSession.stepIndex, 3);

  const adv3 = advanceForgeStep(adv2.nextSession, 1.0, 5);
  assert.equal(adv3.finishedAll, false);
  assert.equal(adv3.nextSession.stepIndex, 0);

  const adv4 = advanceForgeStep(adv3.nextSession, 0.7, 1);
  assert.equal(adv4.finishedAll, true);
  assert.deepEqual(adv4.accuracies, [0.7, 0.8, 0.9, 1.0]);
  assert.equal(adv4.nextSession.bestStreakInForge, 5);
});

test('animation helpers compute deterministic walk poses, heat tiers, and battle timeline choreography', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);

  const walkingRight = computeWalkPose(100, 140, -1, 0.25);
  assert.equal(walkingRight.isWalking, true);
  assert.equal(walkingRight.facing, 1);
  assert.equal(walkingRight.breathScaleX, 1);
  assert.equal(walkingRight.breathScaleY, 1);

  const arrivedLeft = computeWalkPose(101, 100, -1, 0.6);
  assert.equal(arrivedLeft.isWalking, false);
  assert.equal(arrivedLeft.facing, -1);
  assert.ok(arrivedLeft.breathScaleX >= 1 && arrivedLeft.breathScaleX <= 1.025);
  assert.ok(arrivedLeft.breathScaleY >= 1 && arrivedLeft.breathScaleY <= 1.04);

  const idleWork = computeWorkshopIdlePose(0.5, 'anvil', 1, 1, 132);
  assert.equal(idleWork.behavior, 'station_work');
  assert.equal(idleWork.action, 'strike');

  const idleBreathe = computeWorkshopIdlePose(3.0, 'anvil', 1, 1, 132);
  assert.equal(idleBreathe.behavior, 'breathe');
  assert.equal(idleBreathe.action, 'idle');

  const idleHeft = computeWorkshopIdlePose(5.8, 'anvil', 1, 1, 132);
  assert.equal(idleHeft.behavior, 'hammer_heft');
  assert.equal(idleHeft.action, 'tend');

  const idleGlance = computeWorkshopIdlePose(10.5, 'anvil', 1, -1, 132);
  assert.equal(idleGlance.behavior, 'glance');
  assert.equal(idleGlance.facing, 1);

  assert.equal(getWeaponHeatSpec(0.1).bucket, 'cold');
  assert.equal(getWeaponHeatSpec(0.3).bucket, 'warm');
  assert.equal(getWeaponHeatSpec(0.6).bucket, 'hot');
  assert.equal(getWeaponHeatSpec(0.95).bucket, 'overheat');
  assert.equal(getWeaponHeatSpec(0.6, true).bucket, 'quenched');

  const tlApproach = computeBattleTimeline(0.3, true, 'S');
  assert.equal(tlApproach.phase, 'approach');
  assert.equal(tlApproach.enemyHpPct, 1);

  const tlWinResolve = computeBattleTimeline(2.8, true, 'S');
  assert.equal(tlWinResolve.phase, 'resolve');
  assert.equal(tlWinResolve.enemyHpPct, 0);
  assert.ok(tlWinResolve.heroHpPct > 0.5);
  assert.ok(tlWinResolve.enemyTopple > 0.8);

  const tlLossResolve = computeBattleTimeline(2.8, false, 'D');
  assert.equal(tlLossResolve.phase, 'resolve');
  assert.equal(tlLossResolve.heroHpPct, 0);
  assert.ok(tlLossResolve.enemyHpPct > 0.15);
  assert.ok(tlLossResolve.heroKneel > 0.8);
});

test('ParticlePool supports splash/ring/smoke/dust/rarity bursts while enforcing ring-buffer cap <= 260', () => {
  const pool = new ParticlePool();
  pool.burstSplash(100, 100, 14);
  pool.spawnRing(100, 100, 32, '#fde047');
  pool.spawnSmoke(50, 20);
  pool.spawnDustMote(120, 80);
  pool.burstRarityCelebration(72, 56, '#38bdf8', 24);
  assert.equal(pool.getActiveCount(), 41);

  // Exceed capacity cleanly without exceeding 260
  for (let i = 0; i < 20; i++) {
    pool.burstRarityCelebration(72, 56, '#fde047', 20);
  }
  assert.ok(pool.getActiveCount() <= 260);

  // Life decays and frees slots cleanly
  pool.update(2.5);
  assert.equal(pool.getActiveCount(), 0);
});



