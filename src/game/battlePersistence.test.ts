import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBattleClaimResult,
  createInitialSaveState,
  createWeaponInstance,
  decodeBackupCode,
  encodeBackupCode,
  migrateSaveState,
  resolveBattleOutcome,
  resolvePendingBattleResult,
} from './rules';
import { loadSaveStateWithStatus, persistSaveState } from './storage';
import { SAVE_BACKUP_KEY, SAVE_STORAGE_KEY, SAVE_VERSION } from '../data/config';
import { ACHIEVEMENTS } from '../data/achievements';
import type { BattleResult, PendingBattle, SaveState } from '../types';

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
  } as Storage;
  return store;
}

// Deterministic RNG (mulberry32) so rolls are reproducible.
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const testPlayer = {
  name: 'TestSmith',
  gender: 'male' as const,
  hairColorIndex: 0,
  skinToneIndex: 0,
  outfitColorIndex: 0,
};

function makePendingBattle(overrides: Partial<PendingBattle> = {}): PendingBattle {
  return {
    id: 'bat_test1',
    orderId: 'ord_test1',
    race: 'human',
    customerName: 'Garrick',
    portraitVariant: 0,
    weapon: createWeaponInstance('sword', 3, 'wpn_test1'),
    quality: 0.9,
    fulfilment: 1.0,
    scenarioName: 'Border Bandit Ambush',
    scenarioDifficulty: 18,
    enemyArchetype: 'skirmishers',
    smithLevel: 2,
    etaSec: 0,
    ready: true,
    rewardMultiplier: 1,
    wasRoyal: false,
    ...overrides,
  };
}

function makeSaveWithBattle(battle: PendingBattle): SaveState {
  const save = createInitialSaveState(testPlayer);
  save.pendingBattles = [battle];
  return save;
}

function achievementGold(ids: string[]): number {
  return ids.reduce(
    (sum, id) => sum + (ACHIEVEMENTS.find((a) => a.id === id)?.goldReward ?? 0),
    0,
  );
}

test('resolution at readiness attaches a persisted result (V0.2 scope A/B)', () => {
  const battle = makePendingBattle({ ready: false, etaSec: 1 });
  const resolved = resolvePendingBattleResult(
    { ...battle, etaSec: 0, ready: true },
    seededRng(42),
  );
  assert.ok(resolved.resolvedResult, 'result attached at readiness transition');
  assert.equal(resolved.resolvedResult?.battleId, battle.id);
  assert.equal(typeof resolved.resolvedResult?.won, 'boolean');
  assert.ok(resolved.resolvedResult?.breakdown !== undefined);

  // The ready state and the result persist together.
  installMockLocalStorage();
  persistSaveState(makeSaveWithBattle(resolved));
  const loaded = loadSaveStateWithStatus().state;
  assert.deepEqual(loaded?.pendingBattles[0].resolvedResult, resolved.resolvedResult);
});

test('consuming an existing result never rerolls it (modal-open path)', () => {
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(7));
  // Idempotent: same battle object back, no new roll.
  const again = resolvePendingBattleResult(resolved, seededRng(999));
  assert.equal(again, resolved);
  assert.equal(again.resolvedResult, resolved.resolvedResult);
});

test('reloading a save preserves the resolved result exactly', () => {
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(11));
  const save = makeSaveWithBattle(resolved);
  const roundTripped = migrateSaveState(JSON.parse(JSON.stringify(save)));
  assert.ok(roundTripped);
  assert.deepEqual(
    roundTripped?.pendingBattles[0].resolvedResult,
    resolved.resolvedResult,
  );
});

test('claiming consumes the stored result and applies its rewards', () => {
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(1));
  const result = resolved.resolvedResult as BattleResult;
  assert.ok(result.won, 'seed 1 should win vs a weak scenario');
  const save = makeSaveWithBattle(resolved);

  const outcome = applyBattleClaimResult(save, result);
  assert.equal(outcome.claimed, true);
  assert.equal(outcome.state.pendingBattles.length, 0);
  assert.equal(
    outcome.state.gold,
    save.gold + result.goldBonus + achievementGold(outcome.newlyUnlockedAchievements),
  );
  for (const rw of result.materialRewards) {
    assert.equal(
      outcome.state.inventory[rw.materialId],
      (save.inventory[rw.materialId] ?? 0) + rw.count,
    );
  }
  assert.equal(
    outcome.state.popularity.human,
    save.popularity.human + result.popularityDelta,
  );
  assert.equal(outcome.state.stats.battlesWon, 1);
  const history = outcome.state.battleHistory;
  assert.equal(history.length, 1);
  assert.equal(history[0].battleId, result.battleId);
  assert.equal(history[0].won, result.won);
  assert.equal(history[0].territoryConquered, true);
  assert.ok(outcome.state.conqueredTerritories.human.includes(result.scenarioName));
});

test('claiming uses the persisted result, not a rerolled displayed one', () => {
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(1));
  const stored = resolved.resolvedResult as BattleResult;
  const save = makeSaveWithBattle(resolved);

  // A tampered/stale displayed result for the same battle must be ignored.
  const fakeDisplayed: BattleResult = {
    ...stored,
    goldBonus: stored.goldBonus + 5000,
    materialRewards: [],
    popularityDelta: 0,
    won: !stored.won,
  };
  const outcome = applyBattleClaimResult(save, fakeDisplayed);
  assert.equal(outcome.claimed, true);
  assert.equal(
    outcome.state.gold,
    save.gold + stored.goldBonus + achievementGold(outcome.newlyUnlockedAchievements),
  );
  assert.equal(outcome.state.battleHistory[0].won, stored.won);
  assert.equal(
    outcome.state.stats.battlesWon,
    (save.stats.battlesWon ?? 0) + (stored.won ? 1 : 0),
  );
});

test('a battle cannot be claimed twice', () => {
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(1));
  const save = makeSaveWithBattle(resolved);
  const first = applyBattleClaimResult(save, resolved.resolvedResult as BattleResult);
  assert.equal(first.claimed, true);

  const second = applyBattleClaimResult(
    first.state,
    resolved.resolvedResult as BattleResult,
  );
  assert.equal(second.claimed, false);
  assert.equal(second.state, first.state, 'no rewards granted on a second claim');
  assert.equal(second.state.gold, first.state.gold);
});

test('legacy ready battles without a result are resolved once during migration', () => {
  // A v2-shaped save: ready battle, no resolvedResult.
  const legacyBattle = makePendingBattle();
  const v2Save = makeSaveWithBattle(legacyBattle);
  (v2Save as { version: number }).version = 2;

  const migrated = migrateSaveState(JSON.parse(JSON.stringify(v2Save)));
  assert.ok(migrated);
  assert.equal(migrated?.version, SAVE_VERSION);
  assert.equal(migrated?.version, 3);
  const result = migrated?.pendingBattles[0].resolvedResult;
  assert.ok(result, 'legacy ready battle resolved during migration');
  assert.equal(result?.battleId, legacyBattle.id);

  // Migrating again must not reroll the persisted result.
  const remigrated = migrateSaveState(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(remigrated?.pendingBattles[0].resolvedResult, result);
});

test('legacy load persists resolved results so reloads cannot reroll', () => {
  const store = installMockLocalStorage();
  const v2Save = makeSaveWithBattle(makePendingBattle());
  (v2Save as { version: number }).version = 2;
  store.set(SAVE_STORAGE_KEY, JSON.stringify(v2Save));

  const first = loadSaveStateWithStatus().state;
  const firstResult = first?.pendingBattles[0].resolvedResult;
  assert.ok(firstResult);

  // The write-back landed: the stored JSON now carries the result.
  const storedRaw = JSON.parse(store.get(SAVE_STORAGE_KEY) as string);
  assert.ok(storedRaw.pendingBattles[0].resolvedResult);

  const second = loadSaveStateWithStatus().state;
  assert.deepEqual(second?.pendingBattles[0].resolvedResult, firstResult);
});

test('load writes back sanitized results so crafted values do not persist', () => {
  const store = installMockLocalStorage();
  const battle = makePendingBattle();
  const crafted: BattleResult = {
    ...(resolveBattleOutcome(battle, seededRng(3)) as BattleResult),
    goldBonus: 999_999_999,
  };
  const save = makeSaveWithBattle({ ...battle, resolvedResult: crafted });
  store.set(SAVE_STORAGE_KEY, JSON.stringify(save));

  const loaded = loadSaveStateWithStatus().state;
  assert.ok((loaded?.pendingBattles[0].resolvedResult?.goldBonus ?? 0) <= 500);
  // Clamped value was written back to storage.
  const storedRaw = JSON.parse(store.get(SAVE_STORAGE_KEY) as string);
  assert.ok(storedRaw.pendingBattles[0].resolvedResult.goldBonus <= 500);
});

test('malformed battle results are sanitized or safely re-resolved', () => {
  // Result bound to a different battle id: dropped and re-resolved once.
  const battle = makePendingBattle();
  const mismatched: BattleResult = {
    ...(resolveBattleOutcome(battle, seededRng(3)) as BattleResult),
    battleId: 'bat_other',
  };
  const saveA = makeSaveWithBattle({ ...battle, resolvedResult: mismatched });
  const migratedA = migrateSaveState(JSON.parse(JSON.stringify(saveA)));
  const resultA = migratedA?.pendingBattles[0].resolvedResult;
  assert.ok(resultA);
  assert.equal(resultA?.battleId, battle.id);

  // Crafted rewards inside an otherwise valid result are clamped/stripped.
  const crafted: BattleResult = {
    ...(resolveBattleOutcome(battle, seededRng(3)) as BattleResult),
    goldBonus: 999_999_999,
    popularityDelta: 50_000,
    materialRewards: [
      { materialId: 'not_a_real_material', count: 500 },
      { materialId: 'human_common', count: 10_000 },
    ],
  };
  const saveB = makeSaveWithBattle({ ...battle, resolvedResult: crafted });
  const migratedB = migrateSaveState(JSON.parse(JSON.stringify(saveB)));
  const resultB = migratedB?.pendingBattles[0].resolvedResult;
  assert.ok(resultB, 'result with a matching id survives sanitization');
  assert.ok((resultB?.goldBonus ?? 0) <= 500);
  assert.ok((resultB?.popularityDelta ?? 0) <= 200);
  assert.deepEqual(resultB?.materialRewards, [{ materialId: 'human_common', count: 24 }]);
});

test('v1 and v2 saves migrate to the current version and keep player data', () => {
  const v1Raw = {
    version: 1,
    player: { name: 'OldSmith', gender: 'female' },
    gold: 321,
    stats: { ordersCompleted: 2 },
  };
  const migratedV1 = migrateSaveState(v1Raw);
  assert.ok(migratedV1);
  assert.equal(migratedV1?.version, 3);
  assert.equal(migratedV1?.player.name, 'OldSmith');
  assert.equal(migratedV1?.gold, 321);
  assert.equal(migratedV1?.smithXp, 70); // v1 -> v2 backfill preserved

  const v2Save = makeSaveWithBattle(makePendingBattle());
  v2Save.gold = 555;
  (v2Save as { version: number }).version = 2;
  const migratedV2 = migrateSaveState(JSON.parse(JSON.stringify(v2Save)));
  assert.equal(migratedV2?.version, 3);
  assert.equal(migratedV2?.gold, 555);
  assert.ok(migratedV2?.pendingBattles[0].resolvedResult);
});

test('backup-code round-trip preserves the new schema and resolved results', () => {
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(5));
  const save = makeSaveWithBattle(resolved);
  const code = encodeBackupCode(save);
  assert.ok(code.startsWith('EF1:'));
  const decoded = decodeBackupCode(code);
  assert.ok(decoded);
  assert.equal(decoded?.version, SAVE_VERSION);
  assert.deepEqual(
    decoded?.pendingBattles[0].resolvedResult,
    resolved.resolvedResult,
  );
});

test('backup recovery preserves valid battle results', () => {
  const store = installMockLocalStorage();
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(9));
  store.set(SAVE_STORAGE_KEY, '{corrupted json!!!');
  store.set(SAVE_BACKUP_KEY, JSON.stringify(makeSaveWithBattle(resolved)));

  const status = loadSaveStateWithStatus();
  assert.equal(status.recoveredFromBackup, true);
  assert.deepEqual(
    status.state?.pendingBattles[0].resolvedResult,
    resolved.resolvedResult,
  );
});

test('defeat consequences and victory rewards stay consistent with existing rules', () => {
  // Defeat with a D-grade weapon: -2 popularity, no materials.
  const weakBattle = makePendingBattle({
    quality: 0.2,
    scenarioDifficulty: 400,
  });
  const lossResult = resolveBattleOutcome(weakBattle, () => 0.999);
  assert.equal(lossResult.won, false);
  assert.equal(lossResult.qualityGrade, 'D');
  assert.equal(lossResult.popularityDelta, -2);
  assert.equal(lossResult.materialRewards.length, 0);
  assert.equal(lossResult.goldBonus, 0);

  const lossSave = makeSaveWithBattle({ ...weakBattle, resolvedResult: lossResult });
  const lossOutcome = applyBattleClaimResult(lossSave, lossResult);
  assert.equal(lossOutcome.claimed, true);
  assert.equal(
    lossOutcome.state.popularity.human,
    Math.max(0, lossSave.popularity.human - 2),
  );
  assert.equal(lossOutcome.state.stats.battlesLost, 1);
  assert.equal(lossOutcome.state.stats.battlesWon, 0);
  assert.equal(lossOutcome.state.battleHistory[0].territoryConquered, false);

  // Victory: rewards match resolveBattleOutcome's output exactly.
  const winResult = resolveBattleOutcome(makePendingBattle(), () => 0.01);
  assert.equal(winResult.won, true);
  assert.ok(winResult.popularityDelta > 0);
  const winSave = makeSaveWithBattle({
    ...makePendingBattle(),
    resolvedResult: winResult,
  });
  const winOutcome = applyBattleClaimResult(winSave, winResult);
  assert.equal(winOutcome.state.stats.battlesWon, 1);
  assert.equal(
    winOutcome.state.gold,
    winSave.gold + winResult.goldBonus + achievementGold(winOutcome.newlyUnlockedAchievements),
  );
});

// ---- V0.2.1: backup consistency after migration write-back ----

function seedLegacyV2(store: Map<string, string>): string {
  const v2Save = makeSaveWithBattle(makePendingBattle());
  (v2Save as { version: number }).version = 2;
  const raw = JSON.stringify(v2Save);
  store.set(SAVE_STORAGE_KEY, raw);
  store.set(SAVE_BACKUP_KEY, raw);
  return raw;
}

function failWritesTo(keys: string[]) {
  const ls = (globalThis as unknown as { localStorage: Storage }).localStorage;
  const original = ls.setItem.bind(ls);
  ls.setItem = (k: string, v: string) => {
    if (keys.includes(k)) throw new Error('QuotaExceededError');
    original(k, v);
  };
}

test('A: migration write-back synchronizes the backup slot', () => {
  const store = installMockLocalStorage();
  seedLegacyV2(store);
  const first = loadSaveStateWithStatus().state;
  const result = first?.pendingBattles[0].resolvedResult;
  assert.ok(result);
  const primary = JSON.parse(store.get(SAVE_STORAGE_KEY) as string);
  assert.deepEqual(primary.pendingBattles[0].resolvedResult, result);
  const backupRaw = store.get(SAVE_BACKUP_KEY);
  if (backupRaw !== undefined) {
    const backup = JSON.parse(backupRaw);
    assert.ok(backup.pendingBattles[0].resolvedResult, 'backup must not keep the unresolved battle');
    assert.deepEqual(backup.pendingBattles[0].resolvedResult, result);
    assert.equal(backup.version, SAVE_VERSION);
  }
});

test('B: corrupting the primary right after migration restores the same result', () => {
  const store = installMockLocalStorage();
  seedLegacyV2(store);
  const first = loadSaveStateWithStatus().state;
  const firstResult = first?.pendingBattles[0].resolvedResult;
  assert.ok(firstResult);
  store.set(SAVE_STORAGE_KEY, '{corrupted');
  const second = loadSaveStateWithStatus();
  assert.equal(second.recoveredFromBackup, true);
  assert.deepEqual(second.state?.pendingBattles[0].resolvedResult, firstResult);
  // Third load (after recovery) still agrees.
  assert.deepEqual(loadSaveStateWithStatus().state?.pendingBattles[0].resolvedResult, firstResult);
});

test('B2: recovering from a legacy-only backup refreshes the backup too', () => {
  const store = installMockLocalStorage();
  const raw = seedLegacyV2(store);
  store.set(SAVE_STORAGE_KEY, '{corrupted');
  const recovered = loadSaveStateWithStatus();
  const result = recovered.state?.pendingBattles[0].resolvedResult;
  assert.equal(recovered.recoveredFromBackup, true);
  assert.ok(result);
  assert.notEqual(store.get(SAVE_BACKUP_KEY), raw);
  store.set(SAVE_STORAGE_KEY, '{corrupted again');
  assert.deepEqual(loadSaveStateWithStatus().state?.pendingBattles[0].resolvedResult, result);
});

test('C: failed primary write during migration leaves the last valid saves untouched', () => {
  const store = installMockLocalStorage();
  const raw = seedLegacyV2(store);
  failWritesTo([SAVE_STORAGE_KEY]);
  const loaded = loadSaveStateWithStatus();
  assert.ok(loaded.state, 'game still loads in memory');
  assert.equal(store.get(SAVE_STORAGE_KEY), raw);
  assert.equal(store.get(SAVE_BACKUP_KEY), raw);
  // Both slots are still recoverable afterwards.
  assert.ok(loadSaveStateWithStatus().state);
});

test('C2: failed backup refresh keeps the migrated primary and drops only the stale backup', () => {
  const store = installMockLocalStorage();
  seedLegacyV2(store);
  failWritesTo([SAVE_BACKUP_KEY]);
  const first = loadSaveStateWithStatus().state;
  const result = first?.pendingBattles[0].resolvedResult;
  assert.ok(result);
  const primary = JSON.parse(store.get(SAVE_STORAGE_KEY) as string);
  assert.deepEqual(primary.pendingBattles[0].resolvedResult, result);
  assert.equal(store.has(SAVE_BACKUP_KEY), false, 'stale backup must not survive');
  assert.deepEqual(loadSaveStateWithStatus().state?.pendingBattles[0].resolvedResult, result);
});

test('D: existing valid v3 backup recovery is unchanged', () => {
  const store = installMockLocalStorage();
  const resolved = resolvePendingBattleResult(makePendingBattle(), seededRng(11));
  const save = makeSaveWithBattle(resolved);
  persistSaveState(save);
  persistSaveState({ ...save, gold: save.gold + 1 });
  const backupBefore = store.get(SAVE_BACKUP_KEY);
  assert.ok(backupBefore);
  store.set(SAVE_STORAGE_KEY, '{corrupted');
  const loaded = loadSaveStateWithStatus();
  assert.equal(loaded.recoveredFromBackup, true);
  assert.deepEqual(loaded.state?.pendingBattles[0].resolvedResult, resolved.resolvedResult);
  assert.equal(loaded.state?.gold, save.gold);
  assert.equal(store.get(SAVE_BACKUP_KEY), backupBefore, 'valid backup not rewritten');
});
