import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as rules from './rules';
import { ACHIEVEMENTS } from '../data/achievements';
import { DEFAULT_BALANCE, BALANCE } from '../data/balance';
import { QUALITY_GRADE_META, SAVE_BACKUP_KEY, SAVE_STORAGE_KEY, getSmithProgress } from '../data/config';
import { advanceForgeStep } from './hotkeys';
import { advanceAutosave, resolveContinueSave } from './saveReliability';
import { advanceArrivalCountdown, advanceOrderDeadlines, canReceiveNewOrders, isSkipNightAvailable, skipNight } from './worldCycle';
import { createDailyLedger, projectDailyLedger } from './dailyLedger';
import type { DailyLedgerTransition } from './dailyLedger';
import { loadSaveStateWithStatus, persistSaveState } from './storage';
import type { Order, SaveState } from '../types';

const player = { name: 'Accounting', gender: 'male' as const, hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0 };
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
function fixture(time = 570): SaveState {
  const s = rules.createInitialSaveState(player);
  s.activePlaySec = time; s.dailyLedger = createDailyLedger(time);
  s.orders = []; s.nextCustomerTimerSec = 30; s.rotatingStockTimerSec = 300;
  s.popularity.human = 50; s.stats.noMissStreak = 4;
  return s;
}
function order(s: SaveState, remainingSec: number, kind: 'standard' | 'royal' = 'standard', tutorial = false): Order {
  return { ...rules.createTutorialOrder(), id: 'o-' + remainingSec + '-' + kind + '-' + tutorial, kind, isTutorial: tutorial, remainingSec };
}
function tick(s: SaveState, paused = false, continuous = true) {
  const d = paused ? null : advanceOrderDeadlines(s, 1, DEFAULT_BALANCE.popularityMissDeadlinePenalty);
  const after = { ...s, activePlaySec: s.activePlaySec + 1, orders: d?.orders ?? s.orders,
    popularity: d?.popularity ?? s.popularity,
    stats: { ...s.stats, ordersMissed: d?.ordersMissed ?? s.stats.ordersMissed, noMissStreak: d?.noMissStreak ?? s.stats.noMissStreak } };
  const context: DailyLedgerTransition = { kind: 'tick', expiredOrders: d?.expiredOrders ?? [], continuous };
  return { after: { ...after, dailyLedger: projectDailyLedger(s, after, context) }, context };
}
function skipped(s: SaveState, continuous = true) {
  const result = skipNight(s, DEFAULT_BALANCE.popularityMissDeadlinePenalty);
  const context: DailyLedgerTransition = { kind: 'skip', expiredOrders: result.expiredOrders, continuous };
  return { ...result, context, state: { ...result.state, dailyLedger: projectDailyLedger(s, result.state, context) } };
}
function withoutLedger(s: SaveState) { const { dailyLedger: _ignored, ...gameplay } = s; return gameplay; }
function compile(body: string, env: Record<string, any>, parameter = '') {
  const js = stripTypeScriptTypes('function callback(' + parameter + ') {' + body + '\n}');
  return new Function(...Object.keys(env), js + '; return callback;')(...Object.values(env));
}
function callback(name: string, env: Record<string, any>) {
  const marker = '  const ' + name + ' = useCallback(() => {';
  const start = app.indexOf(marker), end = app.indexOf('\n  }, [', start);
  assert.ok(start >= 0 && end > start);
  return compile(app.slice(start + marker.length, end), env);
}
function actualTick(env: Record<string, any>) {
  const marker = '    const timer = window.setInterval(() => {';
  const start = app.indexOf(marker), end = app.indexOf('\n    }, 1000);', start);
  assert.ok(start >= 0 && end > start);
  return compile(app.slice(start + marker.length, end), env);
}
function delivery(env: Record<string, any>, ord: Order) {
  env.forging = { order: ord, steps: ['furnace'], stepIndex: 0, stepAccuracies: [0], completedSteps: [false], selectedMaterials: [], targetPart: ord.targetPart, streak: 0, bestStreakInForge: 0 };
  const marker = '    (payload: MinigameFinishPayload) => {';
  const anchor = app.indexOf('  const handleForgeStepFinish = useCallback(');
  const start = app.indexOf(marker, anchor), end = app.indexOf('\n    },\n    [forging, commitSave, showToast]', start);
  assert.ok(start >= 0 && end > start);
  return compile(app.slice(start + marker.length, end), env, 'payload: MinigameFinishPayload');
}
function harness(s: SaveState, observed = false) {
  const writes: SaveState[] = [], toasts: string[] = [];
  const noop = () => {};
  const env: Record<string, any> = {
    ...rules, BALANCE, QUALITY_GRADE_META, getSmithProgress, ACHIEVEMENTS, advanceForgeStep,
    projectDailyLedger, ledgerObservation: { current: observed ? s.dailyLedger : null },
    saveRef: { current: s }, save: s, autosaveElapsed: { current: 0 },
    simulationUi: { current: { screen: 'workshop', hidden: false, bgPaused: false, activeModal: null, forging: null, forgePaused: false } },
    document: { hidden: false }, soundEngine: new Proxy({}, { get: () => noop }),
    setSummonCooldownSec: noop, canReceiveNewOrders, advanceArrivalCountdown, advanceOrderDeadlines,
    isSkipNightAvailable, skipNight, advanceAutosave,
    publishSave: (next: SaveState) => { env.saveRef.current = next; },
    persistCurrent: (next: SaveState) => { writes.push(next); },
    showToast: (message: string) => { toasts.push(message); },
    setForging: noop, setForgePaused: noop, setLiveAccuracy: noop, setLiveStreak: noop,
    setDeliverySummary: (summary: any) => { env.summary = summary; },
    setLegendaryPayload: noop, setActiveModal: noop,
  };
  env.commitSave = (updater: (prev: SaveState) => SaveState) => {
    const next = updater(env.saveRef.current); env.publishSave(next); env.persistCurrent(next);
  };
  return { env, writes, toasts };
}

for (const kind of ['ordinary', 'royal', 'tutorial'] as const) {
  test('ledger production delivery: ' + kind + ' counts actual accepted fee, excluding achievements', () => {
    const s = fixture(100); const ord = order(s, 200, kind === 'royal' ? 'royal' : 'standard', kind === 'tutorial');
    s.orders = [ord]; const startGold = s.gold; const h = harness(s);
    delivery(h.env, ord)({ accuracy: 0.85, bestStreak: 1 });
    const next = h.env.saveRef.current as SaveState, summary = h.env.summary;
    assert.equal(next.dailyLedger.current.deliveries, 1);
    assert.equal(next.dailyLedger.current.deliveryGold, summary.goldEarned);
    assert.equal(next.dailyLedger.current.missed, 0);
    assert.equal(next.dailyLedger.current.coverage, 'partial');
    const achievementGold = summary.newAchievements.reduce((sum: number, id: string) => sum + (ACHIEVEMENTS.find(a => a.id === id)?.goldReward ?? 0), 0);
    assert.ok(achievementGold > 0, 'actual production achievement award is exercised');
    assert.equal(next.gold - startGold, summary.goldEarned + achievementGold);
    assert.equal(next.dailyLedger.current.deliveryGold, next.gold - startGold - achievementGold);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].dailyLedger, next.dailyLedger);
  });
}

test('ledger production duplicate callback remains two accepted transactions, no new order-ID guard', () => {
  const s = fixture(100); const ord = order(s, 200); s.orders = [ord]; const h = harness(s);
  const finish = delivery(h.env, ord); finish({ accuracy: 0.85, bestStreak: 1 }); const fee = h.env.summary.goldEarned;
  finish({ accuracy: 0.85, bestStreak: 1 }); const next = h.env.saveRef.current as SaveState;
  assert.equal(next.stats.ordersCompleted, 2); assert.equal(next.pendingBattles.length, 2);
  assert.equal(next.dailyLedger.current.deliveries, 2); assert.equal(next.dailyLedger.current.deliveryGold, fee * 2);
  assert.equal(next.orders.length, 0);
});

test('ledger delivery uses authoritative live day at second660, not stale rendered time', () => {
  const s = fixture(660); const ord = order(s, 200); s.orders = [ord]; const h = harness(s);
  h.env.save = { ...s, activePlaySec: 659 };
  delivery(h.env, ord)({ accuracy: 0.85, bestStreak: 1 });
  assert.equal(h.env.saveRef.current.dailyLedger.current.dayIndex, 2);
  assert.equal(h.env.saveRef.current.dailyLedger.current.deliveries, 1);
  assert.equal(h.env.saveRef.current.dailyLedger.closed.length, 0);
});

for (const kind of ['standard', 'royal'] as const) {
  for (const seconds of [658, 659]) {
    test(`ledger actual tick: ${kind} expiry at${seconds + 1} has exact day and unchanged consequences`, () => {
      const s = fixture(seconds); s.orders = [order(s, 1, kind)]; const expected = advanceOrderDeadlines(s, 1, DEFAULT_BALANCE.popularityMissDeadlinePenalty);
      const h = harness(s, true); actualTick(h.env)(); const next = h.env.saveRef.current as SaveState;
      assert.equal(next.dailyLedger.current.dayIndex, seconds === 658 ? 1 : 2);
      assert.equal(next.dailyLedger.current.missed, 1); assert.equal(next.stats.ordersMissed, expected.ordersMissed);
      assert.deepEqual(next.popularity, expected.popularity); assert.equal(next.stats.noMissStreak, expected.noMissStreak);
      assert.deepEqual(next.orders, expected.orders); assert.equal(next.dailyLedger.current.deliveries, 0);
      if (seconds === 659) assert.equal(next.dailyLedger.closed[0].missed, 0);
    });
  }
}

test('ledger actual tick excludes tutorial deadline floor', () => {
  const s = fixture(658); s.orders = [order(s, 1, 'standard', true)]; const h = harness(s);
  actualTick(h.env)(); assert.equal(h.env.saveRef.current.orders[0].remainingSec, 60);
  assert.equal(h.env.saveRef.current.dailyLedger.current.missed, 0);
  assert.equal(h.env.saveRef.current.stats.ordersMissed, 0);
});

for (const mode of ['modal', 'forge'] as const) {
  test('ledger actual ' + mode + ' dawn advances day without false deadline misses or special save', () => {
    const s = fixture(659); s.orders = [order(s, 1)]; const h = harness(s, true);
    if (mode === 'modal') h.env.simulationUi.current.activeModal = 'shop';
    else h.env.simulationUi.current.forging = {};
    actualTick(h.env)(); const next = h.env.saveRef.current as SaveState;
    assert.equal(next.activePlaySec, 660); assert.equal(next.orders[0].remainingSec, 1);
    assert.equal(next.dailyLedger.current.dayIndex, 2); assert.equal(next.dailyLedger.current.coverage, 'complete');
    assert.equal(next.dailyLedger.current.missed, 0); assert.equal(next.dailyLedger.closed[0].missed, 0);
    assert.equal(h.writes.length, 0, 'no extra dawn persistence trigger');
  });
}

test('ledger actual hidden tick is a no-op', () => {
  const s = fixture(659); const h = harness(s); h.env.document.hidden = true;
  actualTick(h.env)(); assert.equal(h.env.saveRef.current, s); assert.equal(h.writes.length, 0);
});

test('ledger actual Skip uses each89/90/91offset, chronological order, tutorial exclusion and unchanged gameplay', () => {
  const s = fixture(570); s.orders = [order(s, 90), order(s, 89, 'royal'), order(s, 91), order(s, 1, 'standard', true)];
  const expected = skipNight(s, DEFAULT_BALANCE.popularityMissDeadlinePenalty).state;
  const h = harness(s); callback('handleSkipNight', h.env)(); const next = h.env.saveRef.current as SaveState;
  assert.deepEqual(withoutLedger(next), withoutLedger(expected));
  assert.equal(next.dailyLedger.closed[0].dayIndex, 1); assert.equal(next.dailyLedger.closed[0].missed, 1);
  assert.equal(next.dailyLedger.closed[0].coverage, 'partial');
  assert.equal(next.dailyLedger.current.dayIndex, 2); assert.equal(next.dailyLedger.current.missed, 1);
  assert.equal(next.dailyLedger.current.coverage, 'complete');
  assert.equal(next.orders.find(o => !o.isTutorial)?.remainingSec, 1);
  assert.equal(next.orders.find(o => o.isTutorial)?.remainingSec, 60);
  assert.equal(next.dailyLedger.current.deliveries, 0); assert.equal(next.dailyLedger.current.deliveryGold, 0);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].dailyLedger, next.dailyLedger);
  callback('handleSkipNight', h.env)(); assert.equal(h.env.saveRef.current, next); assert.equal(h.writes.length, 1);
});

test('ledger no-expiry Skip closes old day and opens complete incoming day without invented events', () => {
  const s = fixture(570); const next = skipped(s).state;
  assert.equal(next.dailyLedger.closed.length, 1); assert.equal(next.dailyLedger.current.dayIndex, 2);
  assert.equal(next.dailyLedger.current.coverage, 'complete');
  assert.deepEqual([next.dailyLedger.current.deliveries, next.dailyLedger.current.missed, next.dailyLedger.current.deliveryGold], [0, 0, 0]);
});

test('ledger first observation keeps current counts/history but downgrades only coverage', () => {
  const s = fixture(800); s.dailyLedger.current.deliveries = 2; s.dailyLedger.current.deliveryGold = 50;
  s.dailyLedger.closed = [createDailyLedger(0, 'complete').current];
  const h = harness(s); actualTick(h.env)(); const next = h.env.saveRef.current as SaveState;
  assert.equal(next.dailyLedger.current.deliveries, 2); assert.equal(next.dailyLedger.current.deliveryGold, 50);
  assert.equal(next.dailyLedger.current.coverage, 'partial'); assert.deepEqual(next.dailyLedger.closed, s.dailyLedger.closed);
  assert.equal(next.dailyLedger.current.observedFromSec, s.dailyLedger.current.observedFromSec);
});

test('ledger approved conservative policy includes fresh/reset Day1 then proves later day from dawn', () => {
  const s = rules.createInitialSaveState(player); const h = harness(s);
  actualTick(h.env)(); assert.equal(h.env.saveRef.current.dailyLedger.current.coverage, 'partial');
  let live = h.env.saveRef.current as SaveState;
  for (let i = 1; i < 660; i++) live = tick(live).after;
  assert.equal(live.dailyLedger.closed[0].coverage, 'partial');
  assert.equal(live.dailyLedger.current.dayIndex, 2); assert.equal(live.dailyLedger.current.coverage, 'complete');
  assert.equal(live.dailyLedger.current.observedFromSec, 660);
});

test('ledger actual runtime lineage preserves established complete coverage but reload/replacement restarts partial', () => {
  const s = fixture(570); const h = harness(s); callback('handleSkipNight', h.env)();
  assert.equal(h.env.saveRef.current.dailyLedger.current.coverage, 'complete'); actualTick(h.env)();
  assert.equal(h.env.saveRef.current.dailyLedger.current.coverage, 'complete');
  const restored = rules.decodeBackupCode(rules.encodeBackupCode(h.env.saveRef.current))!;
  const rows = structuredClone(restored.dailyLedger.closed); h.env.saveRef.current = restored;
  actualTick(h.env)(); assert.equal(h.env.saveRef.current.dailyLedger.current.coverage, 'partial');
  assert.deepEqual(h.env.saveRef.current.dailyLedger.closed, rows);
});

test('ledger actual forge cancel and material sale do not record delivery/miss/gold', () => {
  const s = fixture(100); s.inventory.human_common = 4; const h = harness(s);
  const cancelMarker = '          onCancelForge={() => {'; const a = app.indexOf(cancelMarker), b = app.indexOf('\n          }}', a);
  assert.ok(a >= 0 && b > a); compile(app.slice(a + cancelMarker.length, b), h.env)();
  assert.equal(h.env.saveRef.current, s);
  const saleMarker = '          onSellMaterial={(materialId) => {'; const c = app.indexOf(saleMarker), d = app.indexOf('\n          }}', c);
  assert.ok(c >= 0 && d > c); compile(app.slice(c + saleMarker.length, d), h.env, 'materialId: string')('human_common');
  assert.ok(h.env.saveRef.current.gold > s.gold); assert.deepEqual(h.env.saveRef.current.dailyLedger, s.dailyLedger);
});

test('ledger unrelated order removal is not inferred as a miss', () => {
  const s = fixture(100); s.orders = [order(s, 20)]; const removed = { ...s, orders: [] };
  const next = tick(removed, true).after; assert.equal(next.dailyLedger.current.missed, 0);
});

test('ledger repeated projection of same accepted transition including already-projected after is immutable/idempotent', () => {
  const s = fixture(570); s.orders = [order(s, 89), order(s, 90)];
  const result = skipNight(s, DEFAULT_BALANCE.popularityMissDeadlinePenalty);
  const context: DailyLedgerTransition = { kind: 'skip', expiredOrders: result.expiredOrders, continuous: true };
  const original = structuredClone(s), afterOriginal = structuredClone(result.state);
  const first = projectDailyLedger(s, result.state, context), second = projectDailyLedger(s, { ...result.state, dailyLedger: first }, context);
  assert.deepEqual(first, second); assert.notEqual(first, second); assert.deepEqual(s, original); assert.deepEqual(result.state, afterOriginal);
  second.closed[0].missed++; assert.equal(first.closed[0].missed, 1);
});

test('ledger retention stays bounded and sparse across rollover, never synthesizes missing days', () => {
  const s = fixture(32 * 660 - 1); s.dailyLedger.closed = Array.from({ length: 31 }, (_, i) => createDailyLedger(i * 660, 'complete').current);
  const next = tick(s).after.dailyLedger;
  assert.equal(next.current.dayIndex, 33); assert.equal(next.closed.length, 30);
  assert.deepEqual(next.closed.map(b => b.dayIndex), Array.from({ length: 30 }, (_, i) => i + 3));
  s.dailyLedger.closed = [createDailyLedger(0, 'complete').current, createDailyLedger(29 * 660, 'complete').current];
  assert.deepEqual(tick(s).after.dailyLedger.closed.map(b => b.dayIndex), [1, 30, 32]);
});

test('ledger unexplained clock transitions, invalid fee, invalid expired entries and overflow fail closed', () => {
  const s = fixture(570); const expected = (time: number) => createDailyLedger(time);
  for (const time of [569, 572, 100000000]) assert.deepEqual(projectDailyLedger(s, { ...s, activePlaySec: time }, { kind: 'tick', expiredOrders: [], continuous: true }), expected(time));
  assert.deepEqual(projectDailyLedger(s, { ...s, activePlaySec: 659 }, { kind: 'skip', expiredOrders: [], continuous: true }), expected(659));
  for (const feeGold of [NaN, Infinity, -1, 4, 5.5, Number.MAX_SAFE_INTEGER + 1]) assert.deepEqual(projectDailyLedger(s, { ...s }, { kind: 'delivery', feeGold, continuous: true }), expected(570));
  const tutorial = order(s, 1, 'standard', true); s.orders = [tutorial];
  assert.deepEqual(projectDailyLedger(s, { ...s, activePlaySec: 571, orders: [] }, { kind: 'tick', expiredOrders: [tutorial], continuous: true }), expected(571));
  const ordinary = order(s, 1); s.orders = [ordinary];
  assert.deepEqual(projectDailyLedger(s, { ...s, activePlaySec: 571, orders: [] }, { kind: 'tick', expiredOrders: [{ ...ordinary }], continuous: true }), expected(571));
  assert.deepEqual(projectDailyLedger(s, { ...s, activePlaySec: 571 }, { kind: 'tick', expiredOrders: [ordinary], continuous: true }), expected(571));
  s.dailyLedger.current.missed = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(tick(s).after.dailyLedger, expected(571));
});

test('ledger duplicate order IDs are not an ID-dedup mechanism for actual expiry entries', () => {
  const s = fixture(570); const a = order(s, 1), b = { ...a }; s.orders = [a, b];
  assert.equal(tick(s).after.dailyLedger.current.missed, 2);
});

test('ledger safe huge clock projection is bounded and invalid destination has no invented identity', () => {
  const s = fixture(Number.MAX_SAFE_INTEGER - 1); const next = tick(s, true).after;
  assert.ok(next.dailyLedger.closed.length <= 1); assert.equal(next.dailyLedger.current.dayIndex, Math.floor(Number.MAX_SAFE_INTEGER / 660) + 1);
  assert.throws(() => projectDailyLedger(s, { ...s, activePlaySec: Infinity }, { kind: 'tick', expiredOrders: [], continuous: true }), RangeError);
});

test('ledger persists/reloads and EF1 round-trips the same snapshot without recovery-policy changes', () => {
  const s = fixture(570); s.orders = [order(s, 89), order(s, 90)]; const next = skipped(s).state;
  const store = new Map<string, string>(); const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
  try {
    assert.equal(persistSaveState(next).status, 'ok'); assert.deepEqual(loadSaveStateWithStatus().state?.dailyLedger, next.dailyLedger);
    assert.deepEqual(rules.decodeBackupCode(rules.encodeBackupCode(next))?.dailyLedger, next.dailyLedger);
    store.set(SAVE_BACKUP_KEY, JSON.stringify(s)); store.set(SAVE_STORAGE_KEY, 'invalid');
    const recovered = loadSaveStateWithStatus(); assert.equal(recovered.recoveredFromBackup, true);
    assert.deepEqual(recovered.state?.dailyLedger, s.dailyLedger); assert.equal(recovered.state?.activePlaySec, 570);
    const continuation = resolveContinueSave(next, true, () => { throw new Error('must not read stale storage'); });
    assert.equal(continuation.state?.dailyLedger, next.dailyLedger); assert.equal(continuation.retryLive, true);
  } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('ledger production hook scope remains exactly tick/Skip/delivery, with original single clock/persistence cadence', () => {
  assert.equal((app.match(/projectDailyLedger\(/g) ?? []).length, 3);
  assert.equal((app.match(/window\.setInterval\(/g) ?? []).length, 1);
  assert.match(app, /cadence\.due \|\| orderExpiredOrArrived \|\| battleJustReady/);
  assert.match(readFileSync(new URL('./rules.ts', import.meta.url), 'utf8'), /const dailyLedger = obj\.version === 4/);
});
