import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAVE_BACKUP_KEY, SAVE_STORAGE_KEY } from '../data/config';
import { createInitialSaveState, createWeaponInstance, generateCustomerOrder, resolvePendingBattleResult } from './rules';
import { loadSaveStateWithStatus, persistSaveState } from './storage';
import type { PersistenceResult } from './storage';
import {
  advanceAutosave, bindLifecyclePersistence, deliverSaveWarning, persistenceWarning,
  preferHigherWarning, resolveContinueSave, shouldWarn,
} from './saveReliability';
import type { SaveWarning } from './saveReliability';
import type { SaveState } from '../types';

const player = { name: 'SaveSmith', gender: 'male' as const, hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0 };

function richSave(): SaveState {
  const save = createInitialSaveState(player);
  save.gold = 1234;
  save.smithXp = 4321;
  save.inventory = { iron: 12, oak: 3 };
  save.achievementsUnlocked = ['first_order'];
  save.popularity.human = 77;
  save.kingLetters = [{ id: 'letter', race: 'human', milestoneLevel: 10, title: 'Royal thanks', body: 'Keep this letter', timestamp: 123 }];
  save.conqueredTerritories.human = ['Border Bandit Ambush'];
  save.equipment.hammer = 3;
  save.audio = { musicVolume: 0.2, sfxVolume: 0.7, muted: true };
  save.stats.ordersCompleted = 60;
  save.stats.totalGoldEarned = 4567;
  save.orders = [generateCustomerOrder(save)];
  const weapon = createWeaponInstance('sword', 3, 'reliability_weapon');
  const battle = resolvePendingBattleResult({
    id: 'reliability_battle', orderId: 'reliability_order', race: 'human',
    customerName: 'Garrick', portraitVariant: 0, weapon, quality: 0.9,
    fulfilment: 1, scenarioName: 'Border Bandit Ambush', scenarioDifficulty: 18,
    enemyArchetype: 'skirmishers', smithLevel: 2, etaSec: 0, ready: true,
    rewardMultiplier: 1, wasRoyal: false,
  }, () => 0.1);
  const { resolvedResult: _result, ...unresolved } = battle;
  save.pendingBattles = [battle, { ...unresolved, id: 'not_ready', ready: false, etaSec: 10 }];
  save.battleHistory = Array.from({ length: 60 }, (_, i) => ({ ...battle.resolvedResult!, battleId: `history_${i}` }));
  save.completedOrders = Array.from({ length: 60 }, (_, i) => ({
    id: `completed_${i}`, race: 'human', customerName: 'Garrick', weaponType: 'sword',
    weaponLevel: 3, quality: 0.9, grade: 'A', goldEarned: 20, completedAt: i,
  }));
  save.weaponArmory = Array.from({ length: 80 }, (_, i) => ({
    uid: `armory_${i}`, type: 'sword', level: 3, quality: 0.9, grade: 'A',
    trait: null, customerName: 'Garrick', race: 'human', stats: { ...weapon.stats }, forgedAt: i,
  }));
  return save;
}

function mockStorage(fault?: (key: string, value: string) => void) {
  const store = new Map<string, string>();
  const writes: { key: string; value: string }[] = [];
  globalThis.localStorage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => {
      writes.push({ key, value });
      fault?.(key, value);
      store.set(key, value);
    },
  };
  return { store, writes, primary: () => JSON.parse(store.get(SAVE_STORAGE_KEY)!) as SaveState };
}

function quota(): never { throw new DOMException('Test quota', 'QuotaExceededError'); }

function essential(save: SaveState) {
  const { completedOrders, battleHistory, weaponArmory, updatedAt, ...rest } = save;
  return rest;
}

test('V0.3 backup failure does not compact a full primary save', () => {
  const env = mockStorage((key) => { if (key === SAVE_BACKUP_KEY) quota(); });
  const old = richSave();
  env.store.set(SAVE_STORAGE_KEY, JSON.stringify(old));
  const next = { ...old, gold: old.gold + 1 };
  assert.deepEqual(persistSaveState(next), { status: 'ok', backupFailed: true });
  assert.equal(env.primary().weaponArmory.length, 80);
  assert.equal(env.primary().completedOrders.length, 60);
  assert.equal(env.primary().battleHistory.length, 60);
  assert.deepEqual(essential(env.primary()), essential(next));
});

test('V0.3 primary quota fallback trims history before armory and preserves essential state', () => {
  const env = mockStorage((key, value) => {
    if (key === SAVE_STORAGE_KEY && JSON.parse(value).completedOrders.length > 20) quota();
  });
  const save = richSave();
  const before = JSON.stringify(save);
  assert.deepEqual(persistSaveState(save), { status: 'compacted', backupFailed: false, armoryTrimmed: false });
  assert.equal(env.primary().weaponArmory.length, 80);
  assert.equal(env.primary().completedOrders.length, 20);
  assert.equal(env.primary().battleHistory.length, 20);
  assert.deepEqual(essential(env.primary()), essential(save));
  assert.equal(JSON.stringify(save), before, 'in-memory state is not truncated or mutated');
});

test('V0.3 all nonessential history can be removed before any armory reduction', () => {
  const env = mockStorage((key, value) => {
    if (key === SAVE_STORAGE_KEY && JSON.parse(value).battleHistory.length > 0) quota();
  });
  const save = richSave();
  const result = persistSaveState(save);
  assert.equal(result.status, 'compacted');
  assert.equal(result.armoryTrimmed, false);
  assert.equal(env.primary().weaponArmory.length, 80);
  assert.equal(env.primary().completedOrders.length, 0);
  assert.equal(env.primary().battleHistory.length, 0);
  assert.deepEqual(essential(env.primary()), essential(save));
});

test('V0.3 last-resort armory reduction keeps the maximum fitting records and reports degradation', () => {
  const env = mockStorage((key, value) => {
    if (key === SAVE_STORAGE_KEY && JSON.parse(value).weaponArmory.length > 37) quota();
  });
  const save = richSave();
  assert.deepEqual(persistSaveState(save), { status: 'compacted', backupFailed: false, armoryTrimmed: true });
  const attempts = env.writes.filter((w) => w.key === SAVE_STORAGE_KEY).map((w) => JSON.parse(w.value));
  assert.deepEqual(attempts.slice(0, 3).map((s) => [s.completedOrders.length, s.battleHistory.length, s.weaponArmory.length]),
    [[60, 60, 80], [20, 20, 80], [0, 0, 80]]);
  assert.ok(attempts.slice(3).every((s) => s.completedOrders.length === 0 && s.battleHistory.length === 0));
  assert.ok(attempts.length <= 10, 'bounded last-resort search, not 80 sequential writes');
  assert.deepEqual(env.primary().weaponArmory, save.weaponArmory.slice(-37));
  assert.deepEqual(essential(env.primary()), essential(save));
});

test('V0.3 last-resort search handles near-full and essential-only capacity without excess armory loss', () => {
  for (const capacity of [0, 1, 20, 79]) {
    const env = mockStorage((key, value) => {
      if (key === SAVE_STORAGE_KEY && JSON.parse(value).weaponArmory.length > capacity) quota();
    });
    const save = richSave();
    const result = persistSaveState(save);
    assert.equal(result.status, 'compacted');
    assert.equal(result.armoryTrimmed, true);
    assert.deepEqual(env.primary().weaponArmory, capacity === 0 ? [] : save.weaponArmory.slice(-capacity));
    assert.deepEqual(essential(env.primary()), essential(save));
  }
});

test('V0.3 a non-quota failure during compaction remains a failed outcome', () => {
  let primaryWrites = 0;
  mockStorage((key) => {
    if (key !== SAVE_STORAGE_KEY) return;
    primaryWrites += 1;
    if (primaryWrites === 1) quota();
    throw new DOMException('Test blocked', 'SecurityError');
  });
  assert.equal(persistSaveState(richSave()).status, 'failed');
  assert.equal(primaryWrites, 2);
});

test('V0.3 total write failure returns failed and retains the prior primary', () => {
  const env = mockStorage(() => quota());
  const old = JSON.stringify(richSave());
  env.store.set(SAVE_STORAGE_KEY, old);
  assert.equal(persistSaveState({ ...richSave(), gold: 9876 }).status, 'failed');
  assert.equal(env.store.get(SAVE_STORAGE_KEY), old);
});

test('V0.3 non-quota primary error is failed without destructive fallback attempts', () => {
  const env = mockStorage(() => { throw new DOMException('Test blocked', 'SecurityError'); });
  assert.equal(persistSaveState(richSave()).status, 'failed');
  assert.equal(env.writes.length, 1);
});

test('V0.3 serialization failure is observable, not thrown', () => {
  mockStorage();
  const save = richSave();
  Object.defineProperty(save, 'gold', { get() { throw new Error('Test serialization'); } });
  assert.equal(persistSaveState(save).status, 'failed');
});

test('V0.3 unreadable storage is failed without crashing', () => {
  mockStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('Test denied', 'SecurityError'); } });
  try {
    assert.equal(persistSaveState(richSave()).status, 'failed');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
  }
});

test('V0.3 valid backup rotation and recovery still work', () => {
  const env = mockStorage();
  const first = richSave();
  persistSaveState(first);
  const firstRaw = env.store.get(SAVE_STORAGE_KEY);
  persistSaveState({ ...first, gold: 2345 });
  assert.equal(env.store.get(SAVE_BACKUP_KEY), firstRaw);
  env.store.set(SAVE_STORAGE_KEY, '{corrupt');
  const recovered = loadSaveStateWithStatus();
  assert.equal(recovered.recoveredFromBackup, true);
  assert.equal(recovered.state?.gold, first.gold);
  assert.deepEqual(recovered.state?.pendingBattles[0].resolvedResult, first.pendingBattles[0].resolvedResult);
});

test('V0.3 invalid primary never overwrites the valid backup during rotation', () => {
  const env = mockStorage();
  const backup = JSON.stringify(richSave());
  env.store.set(SAVE_BACKUP_KEY, backup);
  env.store.set(SAVE_STORAGE_KEY, '{corrupt');
  assert.equal(persistSaveState(richSave()).status, 'ok');
  assert.equal(env.store.get(SAVE_BACKUP_KEY), backup);
});

test('V0.3 compacted pending battle results survive reload unchanged', () => {
  const env = mockStorage((key, value) => {
    if (key === SAVE_STORAGE_KEY && JSON.parse(value).completedOrders.length > 20) quota();
  });
  const save = richSave();
  persistSaveState(save);
  const loaded = loadSaveStateWithStatus().state;
  assert.deepEqual(loaded?.pendingBattles[0].resolvedResult, save.pendingBattles[0].resolvedResult);
  assert.deepEqual(env.primary().orders, save.orders);
});

test('V0.3 autosave becomes due after 30 active simulation seconds', () => {
  let elapsed = 0;
  for (let tick = 1; tick <= 90; tick += 1) {
    const result = advanceAutosave(elapsed, 1000);
    elapsed = result.elapsedMs;
    assert.equal(result.due, tick % 30 === 0);
  }
});

test('V0.3 UI changes and background pause do not reset elapsed simulation time', () => {
  let elapsed = advanceAutosave(0, 17_000).elapsedMs;
  // Menus/forging/toast renders do not own the accumulator. A hidden page
  // performs no simulation, so it contributes zero, even after a long gap.
  for (let render = 0; render < 50; render += 1) elapsed = advanceAutosave(elapsed, 0).elapsedMs;
  assert.equal(elapsed, 17_000);
  assert.deepEqual(advanceAutosave(elapsed, 13_000), { due: true, elapsedMs: 0 });
});

class TestDocument extends EventTarget { hidden = false; }

function lifecycleHarness(persist: (state: SaveState) => PersistenceResult) {
  const doc = new TestDocument();
  const win = new EventTarget();
  let latest: SaveState | null = richSave();
  let visibleCalls = 0;
  const cleanup = bindLifecyclePersistence(doc, win as Window, () => latest, persist, () => { visibleCalls += 1; });
  return { doc, win, cleanup, setLatest: (state: SaveState | null) => { latest = state; }, visibleCalls: () => visibleCalls };
}

test('V0.3 hidden and pagehide synchronously persist the latest ref value', () => {
  const seen: SaveState[] = [];
  const h = lifecycleHarness((state) => { seen.push(state); return { status: 'ok' }; });
  const latest = richSave(); latest.gold = 999;
  h.setLatest(latest);
  h.doc.hidden = true;
  h.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(seen[0], latest);
  const newer = { ...latest, gold: 1000 };
  h.setLatest(newer);
  h.win.dispatchEvent(new Event('pagehide'));
  assert.equal(seen[1], newer);
  h.doc.hidden = false;
  h.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.visibleCalls(), 1);
  assert.equal(seen.length, 2, 'returning visible only flushes pending warnings');
  h.cleanup();
});

test('V0.3 lifecycle handles no save, a failed write, cleanup and remount', () => {
  let calls = 0;
  const h = lifecycleHarness(() => { calls += 1; return { status: 'failed' }; });
  h.setLatest(null);
  h.win.dispatchEvent(new Event('pagehide'));
  assert.equal(calls, 0);
  h.setLatest(richSave()); h.doc.hidden = true;
  assert.doesNotThrow(() => h.doc.dispatchEvent(new Event('visibilitychange')));
  assert.equal(calls, 1);
  h.cleanup(); h.cleanup();
  h.win.dispatchEvent(new Event('pagehide'));
  h.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1);
  const cleanup = bindLifecyclePersistence(h.doc, h.win as Window, () => richSave(), () => { calls += 1; return { status: 'ok' }; }, () => {});
  h.win.dispatchEvent(new Event('pagehide'));
  assert.equal(calls, 2, 'one listener after cleanup/remount');
  cleanup();
});

test('V0.3 actual storage failure during lifecycle never throws', () => {
  mockStorage(() => quota());
  const h = lifecycleHarness(persistSaveState);
  h.doc.hidden = true;
  assert.doesNotThrow(() => h.doc.dispatchEvent(new Event('visibilitychange')));
  assert.doesNotThrow(() => h.win.dispatchEvent(new Event('pagehide')));
  h.cleanup();
});

test('V0.3 save warnings distinguish failure/degradation and deduplicate for a minute', () => {
  const failed = persistenceWarning({ status: 'failed' })!;
  const history = persistenceWarning({ status: 'compacted' })!;
  assert.equal(persistenceWarning({ status: 'ok' }), null);
  assert.match(failed.message, /Save failed/);
  assert.match(history.message, /reduced history/);
  assert.match(persistenceWarning({ status: 'compacted', armoryTrimmed: true })!.message, /armory/);
  assert.equal(shouldWarn(null, failed, 0), true);
  assert.equal(shouldWarn({ severity: 3, at: 0 }, failed, 59_999), false);
  assert.equal(shouldWarn({ severity: 3, at: 0 }, failed, 60_000), true);
  assert.equal(shouldWarn({ severity: 1, at: 0 }, failed, 1), true);
  assert.equal(shouldWarn({ severity: 3, at: 0 }, history, 1), false);
});

test('V0.3 App integration keeps one interval, ref-based updates, event saves and atomic readiness persistence', () => {
  // Source-level guard complements helper tests without adding a React framework.
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/window\.setInterval\(/g) ?? []).length, 1);
  assert.match(app, /window\.clearInterval\(timer\)/);
  assert.doesNotMatch(app, /setSave\(\(/, 'React save updater must contain no replayable effects');
  assert.match(app, /const prev = saveRef\.current;[\s\S]*?const next = updater\(prev\);[\s\S]*?publishSave\(next\);[\s\S]*?persistCurrent\(next\);/);
  assert.match(app, /if \(result\.status !== 'failed'\) \{\s*autosaveElapsed\.current = 0;/);
  assert.match(app, /if \(!prev \|\| document\.hidden\) return;/);
  assert.match(app, /resolvePendingBattleResult\(\{ \.\.\.b, etaSec: 0, ready: true \},Math.random,prev.popularity\[b.race\]\)/);
  assert.match(app, /cadence\.due \|\| orderExpiredOrArrived \|\| battleJustReady/);
  assert.match(app, /\[screen, bgPaused, showToast, publishSave, persistCurrent\]/);
  assert.doesNotMatch(app, /beforeunload/);
});

test('W1 history-only compaction has a distinct lowest-severity warning', () => {
  const history = persistenceWarning({ status: 'compacted', armoryTrimmed: false })!;
  assert.equal(history.severity, 1);
  assert.match(history.message, /Saved copy has reduced history/);
  assert.doesNotMatch(history.message, /armory|Save failed/);
});

test('W1 armory warning replaces history and describes only the saved-copy reduction', () => {
  const history = persistenceWarning({ status: 'compacted' })!;
  const armory = persistenceWarning({ status: 'compacted', armoryTrimmed: true })!;
  assert.equal(armory.severity, 2);
  assert.equal(preferHigherWarning(history, armory), armory);
  assert.match(armory.message, /Saved copy has reduced history and armory/);
  assert.match(armory.message, /Current-session armory is unchanged/);
});

test('W1 total failure replaces pending armory loss and has highest severity', () => {
  const armory = persistenceWarning({ status: 'compacted', armoryTrimmed: true })!;
  const failed = persistenceWarning({ status: 'failed' })!;
  assert.equal(failed.severity, 3);
  assert.equal(preferHigherWarning(armory, failed), failed);
  assert.equal(preferHigherWarning(failed, armory), failed);
});

test('W1 armory escalation bypasses deduplication and replaces displayed history', () => {
  const history = persistenceWarning({ status: 'compacted' })!;
  const armory = persistenceWarning({ status: 'compacted', armoryTrimmed: true })!;
  assert.equal(deliverSaveWarning(armory, history, { severity: 1, at: 0 }, false, 1).show, armory);
});

test('W1 failure escalation bypasses deduplication and replaces displayed armory loss', () => {
  const armory = persistenceWarning({ status: 'compacted', armoryTrimmed: true })!;
  const failed = persistenceWarning({ status: 'failed' })!;
  assert.equal(deliverSaveWarning(failed, armory, { severity: 2, at: 0 }, false, 1).show, failed);
});

test('W1 history cannot downgrade pending or displayed armory loss even after the repeat window', () => {
  const history = persistenceWarning({ status: 'compacted' })!;
  const armory = persistenceWarning({ status: 'compacted', armoryTrimmed: true })!;
  assert.equal(preferHigherWarning(armory, history), armory);
  assert.equal(deliverSaveWarning(history, armory, { severity: 2, at: 0 }, false, 120_000).show, null);
  const failed = persistenceWarning({ status: 'failed' })!;
  assert.equal(deliverSaveWarning(armory, failed, { severity: 3, at: 0 }, false, 120_000).show, null);
});

test('W1 hidden visibility/pagehide escalation flushes the highest warning when visible', () => {
  const doc = new TestDocument();
  const win = new EventTarget();
  const history = persistenceWarning({ status: 'compacted' })!;
  const armory = persistenceWarning({ status: 'compacted', armoryTrimmed: true })!;
  const incoming = [history, armory, history];
  let pending: SaveWarning | null = null;
  let displayed: SaveWarning | null = null;
  const cleanup = bindLifecyclePersistence(doc, win as Window, richSave, () => {
    pending = preferHigherWarning(pending, incoming.shift()!);
    const deferred = deliverSaveWarning(pending, displayed, null, doc.hidden, 1);
    pending = deferred.pending;
    assert.equal(deferred.show, null);
    return { status: 'compacted' };
  }, () => {
    const delivery = deliverSaveWarning(pending, displayed, null, doc.hidden, 2);
    pending = delivery.pending;
    displayed = delivery.show;
  });
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('pagehide'));
  win.dispatchEvent(new Event('pagehide'));
  assert.equal(pending, armory);
  assert.equal(displayed, null);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(displayed, armory);
  assert.equal(pending, null);
  cleanup();
});

test('W1 hidden failure remains highest despite later history/armory warnings', () => {
  const history = persistenceWarning({ status: 'compacted' })!;
  const armory = persistenceWarning({ status: 'compacted', armoryTrimmed: true })!;
  const failed = persistenceWarning({ status: 'failed' })!;
  let pending = preferHigherWarning(history, armory);
  pending = preferHigherWarning(pending, failed);
  pending = preferHigherWarning(pending, history);
  pending = preferHigherWarning(pending, armory);
  assert.equal(deliverSaveWarning(pending, null, null, true, 1).pending, failed);
  assert.equal(deliverSaveWarning(pending, null, { severity: 1, at: 0 }, false, 2).show, failed);
});

test('I3 failed save and return-to-title retain 170 Gold instead of loading the disk 100 Gold', () => {
  let denyWrites = false;
  const env = mockStorage((key) => { if (denyWrites && key === SAVE_STORAGE_KEY) quota(); });
  const disk = { ...richSave(), gold: 100 };
  assert.equal(persistSaveState(disk).status, 'ok');
  const live = { ...disk, gold: 170 };
  denyWrites = true;
  assert.equal(persistSaveState(live).status, 'failed');
  const returnToTitle = persistSaveState(live);
  let diskReads = 0;
  const continuation = resolveContinueSave(live, returnToTitle.status === 'failed', () => {
    diskReads += 1;
    return loadSaveStateWithStatus().state;
  });
  assert.equal(diskReads, 0);
  assert.equal(continuation.state, live);
  assert.equal(continuation.state?.gold, 170);
  assert.equal(continuation.retryLive, true);
  assert.equal(env.primary().gold, 100);
  assert.equal(persistSaveState(continuation.state!).status, 'failed');
  assert.equal(resolveContinueSave(live, true, () => disk).state?.gold, 170);
});

test('I3 successful retry makes the retained 170 Gold available through normal disk Continue', () => {
  const env = mockStorage();
  const disk = { ...richSave(), gold: 100 };
  persistSaveState(disk);
  const live = { ...disk, gold: 170 };
  const retained = resolveContinueSave(live, true, () => disk);
  const retry = persistSaveState(retained.state!);
  const retryFailed = retry.status === 'failed';
  assert.equal(retry.status, 'ok');
  assert.equal(env.primary().gold, 170);
  let diskReads = 0;
  const normal = resolveContinueSave(live, retryFailed, () => {
    diskReads += 1;
    return loadSaveStateWithStatus().state;
  });
  assert.equal(diskReads, 1);
  assert.equal(normal.retryLive, false);
  assert.equal(normal.state?.gold, 170);
});

test('I3 fresh-document Continue still runs normal disk recovery', () => {
  const env = mockStorage();
  const backup = { ...richSave(), gold: 100 };
  env.store.set(SAVE_STORAGE_KEY, '{corrupt');
  env.store.set(SAVE_BACKUP_KEY, JSON.stringify(backup));
  let recovered = false;
  const continued = resolveContinueSave(null, false, () => {
    const loaded = loadSaveStateWithStatus();
    recovered = loaded.recoveredFromBackup;
    return loaded.state;
  });
  assert.equal(recovered, true);
  assert.equal(continued.retryLive, false);
  assert.equal(continued.state?.gold, 100);
  assert.equal(env.primary().gold, 100);
});

test('I3 no live snapshot falls back to the normal loader even if a failure flag is present', () => {
  const disk = { ...richSave(), gold: 100 };
  let calls = 0;
  assert.equal(resolveContinueSave(null, true, () => { calls += 1; return disk; }).state, disk);
  assert.equal(calls, 1);
  assert.deepEqual(resolveContinueSave(null, false, () => null), { state: null, retryLive: false });
});

test('W1 and I3 App wiring keeps timer cleanup, warning priority, failure tracking and live retry', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /persistenceFailed\.current = result\.status === 'failed'/);
  assert.match(app, /preferHigherWarning\(pendingSaveWarning\.current, warning\)/);
  assert.match(app, /displayedSaveWarning\.current === saveWarning/);
  assert.match(app, /window\.clearTimeout\(timer\)/);
  assert.match(app, /saveWarning\?\.message \?\? toastMsg/);
  assert.match(app, /saveRef\.current, persistenceFailed\.current, loadSaveState/);
  assert.match(app, /if \(continuation\.retryLive\) persistCurrent\(loaded\)/);
  assert.match(app, /persistenceFailed\.current = false/);
});
