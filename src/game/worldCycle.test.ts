import { projectDailyLedger } from './dailyLedger';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_BALANCE } from '../data/balance';
import { SAVE_STORAGE_KEY } from '../data/config';
import {
  createInitialSaveState, generateCustomerOrder,
} from './rules';
import { resolvePendingBattleResult, rollRotatingStock } from './rules';
import { loadSaveStateWithStatus, persistSaveState } from './storage';
import { advanceAutosave, resolveContinueSave } from './saveReliability';
import {
  WORLD_CYCLE, advanceArrivalCountdown, advanceOrderDeadlines,
  assertWorldCycleConfiguration, canReceiveNewOrders, getWorldCycle,
  isSkipNightAvailable, skipNight,
} from './worldCycle';
import type { SkipNightContext } from './worldCycle';
import type { SaveState } from '../types';

function fixture(time = 480): SaveState {
  const state = createInitialSaveState({
    name: 'CycleSmith', gender: 'male', hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0,
  });
  state.activePlaySec = time;
  state.orders = [];
  state.nextCustomerTimerSec = 7;
  state.rotatingStockTimerSec = 300;
  state.popularity.human = 25;
  state.stats.noMissStreak = 4;
  return state;
}
function order(state: SaveState, id: string, remainingSec: number, tutorial = false) {
  const generated = generateCustomerOrder(state, () => 0.99);
  return { ...generated, id, race: 'human' as const, remainingSec, isTutorial: tutorial };
}
const safeContext: SkipNightContext = {
  screen: 'workshop', hidden: false, bgPaused: false,
  activeModal: null, forging: false, forgePaused: false,
};
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

// Executes the actual simple App callback body with controlled refs/services.
// This is callback integration coverage, not a mounted React/browser test.
function appCallback(name: string, env: Record<string, any>) {
  const marker = `  const ${name} = useCallback(() => {`;
  const start = app.indexOf(marker);
  assert.ok(start >= 0, `Actual App callback ${name} exists`);
  const end = app.indexOf('\n  }, [', start);
  assert.ok(end > start);
  return new Function(...Object.keys(env), app.slice(start + marker.length, end)).bind(null, ...Object.values(env));
}
function appTick(env: Record<string, any>) {
  const marker = '    const timer = window.setInterval(() => {';
  const start = app.indexOf(marker), end = app.indexOf('\n    }, 1000);', start);
  assert.ok(start >= 0 && end > start);
  const body = app.slice(start + marker.length, end).replace('const next: SaveState =', 'const next =');
  return new Function(...Object.keys(env), body).bind(null, ...Object.values(env));
}
function harness(state: SaveState, rendered = state) {
  const writes: SaveState[] = [], toasts: string[] = [];
  const env: any = {
    saveRef: { current: state }, save: rendered,
    projectDailyLedger, ledgerObservation: { current: null },
    simulationUi: { current: { ...safeContext, forging: null } },
    document: { hidden: false }, BALANCE: DEFAULT_BALANCE,
    summonCooldownSec: 0, cooldown: 0,
    soundEngine: { playUiBlip() {} },
    setSummonCooldownSec: (value: any) => { env.cooldown = typeof value === 'function' ? value(env.cooldown) : value; },
    canReceiveNewOrders, advanceArrivalCountdown, advanceOrderDeadlines,
    isSkipNightAvailable, skipNight, advanceAutosave,
    generateCustomerOrder, resolvePendingBattleResult, rollRotatingStock,
    randInt: (min: number) => min,
    autosaveElapsed: { current: 0 },
    publishSave: (next: SaveState) => { env.saveRef.current = next; },
    persistCurrent: (next: SaveState) => { writes.push(next); },
    showToast: (text: string) => { toasts.push(text); },
  };
  env.commitSave = (updater: (prev: SaveState) => SaveState) => {
    const next = updater(env.saveRef.current); env.publishSave(next); env.persistCurrent(next);
  };
  return { env, writes, toasts };
}

test('world cycle: approved stable configuration and invalid configuration rejection', () => {
  assert.deepEqual(WORLD_CYCLE, { dayDurationSec: 480, nightDurationSec: 180, cycleDurationSec: 660 });
  assert.equal(Object.isFrozen(WORLD_CYCLE), true);
  assert.equal(Reflect.set(WORLD_CYCLE, 'dayDurationSec', 0), false);
  for (const invalid of [
    { dayDurationSec: 0, nightDurationSec: 180, cycleDurationSec: 180 },
    { dayDurationSec: 480, nightDurationSec: -1, cycleDurationSec: 479 },
    { dayDurationSec: 480, nightDurationSec: 181, cycleDurationSec: 661 },
    { dayDurationSec: NaN, nightDurationSec: 180, cycleDurationSec: 660 },
    { dayDurationSec: 480.5, nightDurationSec: 179.5, cycleDurationSec: 660 },
    { dayDurationSec: 480, nightDurationSec: 180, cycleDurationSec: 661 },
  ]) assert.throws(() => assertWorldCycleConfiguration(invalid), RangeError);
});

test('world cycle: zero, D-1, D, D+1 and C-1, C, C+1 boundaries', () => {
  for (const [time, dayIndex, cyclePosition, phase] of [
    [0, 1, 0, 'day'], [479, 1, 479, 'day'], [480, 1, 480, 'night'],
    [481, 1, 481, 'night'], [659, 1, 659, 'night'], [660, 2, 0, 'day'], [661, 2, 1, 'day'],
  ] as const) assert.deepEqual(getWorldCycle(time), { dayIndex, cyclePosition, phase });
});

test('world cycle: deterministic multi-cycle phase and day index', () => {
  for (const cycle of [1, 2, 10, 1000]) {
    assert.deepEqual(getWorldCycle(cycle * 660 + 480), { dayIndex: cycle + 1, cyclePosition: 480, phase: 'night' });
    assert.deepEqual(getWorldCycle(cycle * 660 + 480), getWorldCycle(cycle * 660 + 480));
  }
});

test('world cycle: invalid simulation counters cannot create an invalid phase', () => {
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getWorldCycle(value), RangeError);
  }
});

test('arrivals: dusk closes and dawn reopens using the newly advanced tick', () => {
  assert.deepEqual(advanceArrivalCountdown(480, 1, 0, 3), { remainingSec: 1, arrivalDue: false });
  assert.deepEqual(advanceArrivalCountdown(660, 1, 0, 3), { remainingSec: 0, arrivalDue: true });
});

test('arrivals: all night ticks preserve the saved countdown', () => {
  for (let time = 480; time < 660; time += 1) {
    assert.deepEqual(advanceArrivalCountdown(time, 5, 0, 3), { remainingSec: 5, arrivalDue: false });
  }
});

test('arrivals: full slots retain the current no-decrement behavior', () => {
  for (const count of [3, 5]) assert.deepEqual(advanceArrivalCountdown(660, 1, count, 3), { remainingSec: 1, arrivalDue: false });
});

test('actual App tick: dusk blocks arrival, preserves countdown and still expires existing orders', () => {
  const state = fixture(479); state.nextCustomerTimerSec = 1; state.orders = [order(state, 'expires', 1)];
  const h = harness(state); appTick(h.env)();
  const next = h.env.saveRef.current;
  assert.equal(next.activePlaySec, 480); assert.equal(next.nextCustomerTimerSec, 1);
  assert.equal(next.orders.length, 0); assert.equal(next.stats.ordersMissed, 1);
  assert.equal(next.popularity.human, 15); assert.equal(h.writes.length, 1);
});

test('actual App tick: dawn permits at most one arrival and normal subsequent countdown', () => {
  const state = fixture(659); state.nextCustomerTimerSec = 1;
  const h = harness(state); const tick = appTick(h.env); tick();
  assert.equal(h.env.saveRef.current.activePlaySec, 660);
  assert.equal(h.env.saveRef.current.orders.length, 1);
  assert.equal(h.env.saveRef.current.nextCustomerTimerSec, 18);
  tick(); assert.equal(h.env.saveRef.current.orders.length, 1);
  assert.equal(h.env.saveRef.current.nextCustomerTimerSec, 17);
});

test('actual App tick: full order slots preserve countdown on dawn', () => {
  const state = fixture(659); state.nextCustomerTimerSec = 1;
  state.orders = ['a', 'b', 'c'].map((id) => order(state, id, 100));
  const h = harness(state); appTick(h.env)();
  assert.equal(h.env.saveRef.current.orders.length, 3); assert.equal(h.env.saveRef.current.nextCustomerTimerSec, 1);
});

test('actual App tick: normal night decrements deadlines with existing miss and tutorial rules', () => {
  const state = fixture(500); state.orders = [order(state, 'alive', 80), order(state, 'tutorial', 60, true)];
  const h = harness(state); appTick(h.env)();
  assert.deepEqual(h.env.saveRef.current.orders.map((o: any) => o.remainingSec), [79, 60]);
  assert.equal(h.env.saveRef.current.stats.ordersMissed, 0); assert.equal(h.env.saveRef.current.nextCustomerTimerSec, 7);
});

test('actual App tick: every modal preserves deadline/arrival pause while the active clock advances', () => {
  for (const activeModal of ['orders', 'shop', 'inventory', 'map', 'battle', 'achievements', 'settings', 'legendary', 'delivery']) {
    const state = fixture(500); state.orders = [order(state, 'alive', 80)];
    const h = harness(state); h.env.simulationUi.current.activeModal = activeModal;
    appTick(h.env)(); assert.equal(h.env.saveRef.current.activePlaySec, 501);
    assert.equal(h.env.saveRef.current.orders[0].remainingSec, 80); assert.equal(h.env.saveRef.current.nextCustomerTimerSec, 7);
  }
});

test('actual App tick: forging and forge pause preserve the established clock/deadline matrix', () => {
  for (const forgePaused of [false, true]) {
    const state = fixture(500); state.orders = [order(state, 'alive', 80)];
    const h = harness(state); h.env.simulationUi.current.forging = {}; h.env.simulationUi.current.forgePaused = forgePaused;
    appTick(h.env)(); assert.equal(h.env.saveRef.current.activePlaySec, 501);
    assert.equal(h.env.saveRef.current.orders[0].remainingSec, 80);
  }
});

test('actual App tick: hidden document performs no work, outer effect still excludes title/character', () => {
  const state = fixture(479); const h = harness(state); h.env.document.hidden = true;
  appTick(h.env)(); assert.equal(h.env.saveRef.current, state); assert.equal(h.writes.length, 0);
  assert.match(app, /if \(screen !== 'workshop' \|\| bgPaused\) return;/);
  assert.equal((app.match(/window\.setInterval\(/g) ?? []).length, 1);
});

test('manual Summon: actual handler rejects night even with a stale daytime UI save', () => {
  const live = fixture(480), rendered = fixture(479); const h = harness(live, rendered);
  appCallback('handleSummonCustomer', h.env)();
  assert.equal(h.env.saveRef.current.orders.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.env.cooldown, 0);
});

test('manual Summon: actual handler uses live dawn even if its rendered UI was night', () => {
  const live = fixture(660), rendered = fixture(659); const h = harness(live, rendered);
  appCallback('handleSummonCustomer', h.env)();
  assert.equal(h.env.saveRef.current.orders.length, 1); assert.equal(h.writes.length, 1);
});

test('manual Summon: both existing UI buttons are disabled and explain night closure', () => {
  const source = readFileSync(new URL('../components/OrderModal.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/disabled=\{nightClosed \|\| summonCooldownSec > 0\}/g) ?? []).length, 2);
  assert.equal((source.match(/STRINGS\.worldCycle\.nightClosedShort/g) ?? []).length, 2);
  assert.match(source, /canReceiveNewOrders\(save\.activePlaySec\)/);
  assert.match(source, /STRINGS\.worldCycle\.nightClosed\}/);
});

test('deadlines: shared helper preserves survivors, miss penalty floor and one consequence per expired order', () => {
  const state = fixture(); state.orders = [order(state, 'a', 1), order(state, 'b', 70), order(state, 'c', 200)];
  state.popularity.human = 15; const before = JSON.stringify(state);
  const next = advanceOrderDeadlines(state, 90, 10);
  assert.deepEqual(next.orders.map((o) => [o.id, o.remainingSec]), [['c', 110]]);
  assert.equal(next.ordersMissed, 2); assert.equal(next.noMissStreak, 0); assert.equal(next.popularity.human, 0);
  assert.equal(next.expiredOrders.length, 2); assert.equal(JSON.stringify(state), before);
  const again = advanceOrderDeadlines({ ...state, ...next, stats: { ...state.stats, ordersMissed: next.ordersMissed, noMissStreak: next.noMissStreak } }, 1, 10);
  assert.equal(again.ordersMissed, 2); assert.equal(again.expiredOrders.length, 0);
});

test('deadlines: tutorial floor and zero elapsed time preserve the current rules', () => {
  const state = fixture(); state.orders = [order(state, 'tutorial', 100, true)];
  const result = advanceOrderDeadlines(state, 180, 10);
  assert.equal(result.orders[0].remainingSec, 60); assert.equal(result.ordersMissed, 0);
  assert.equal(advanceOrderDeadlines(state, 0, 10).orders, state.orders);
  assert.throws(() => advanceOrderDeadlines(state, -1, 10), RangeError);
});

test('deadlines: aggregate skip is equivalent to repeated existing one-second deadline processing', () => {
  for (const elapsed of [1, 90, 180]) {
    let repeated = fixture(); repeated.orders = [order(repeated, 'a', 30), order(repeated, 'b', 300), order(repeated, 'tutorial', 100, true)];
    const original = repeated;
    for (let i = 0; i < elapsed; i += 1) {
      const step = advanceOrderDeadlines(repeated, 1, 10);
      repeated = { ...repeated, orders: step.orders, popularity: step.popularity, stats: { ...repeated.stats, ordersMissed: step.ordersMissed, noMissStreak: step.noMissStreak } };
    }
    const batch = advanceOrderDeadlines(original, elapsed, 10);
    assert.deepEqual(batch.orders, repeated.orders); assert.deepEqual(batch.popularity, repeated.popularity);
    assert.equal(batch.ordersMissed, repeated.stats.ordersMissed); assert.equal(batch.noMissStreak, repeated.stats.noMissStreak);
  }
});

test('Skip Night: exact dawn from night start, middle and last second across multiple cycles', () => {
  for (const [time, target, skippedSec] of [[480, 660, 180], [570, 660, 90], [659, 660, 1], [1140, 1320, 180]]) {
    const result = skipNight(fixture(time), 10);
    assert.equal(result.state.activePlaySec, target); assert.equal(result.skippedSec, skippedSec);
    assert.equal(getWorldCycle(result.state.activePlaySec).phase, 'day');
  }
});

test('Skip Night: daytime is a no-op and stale duplicate activation cannot jump another day', () => {
  const state = fixture(480); const first = skipNight(state, 10); const second = skipNight(first.state, 10);
  assert.equal(second.state, first.state); assert.equal(second.skippedSec, 0);
  assert.equal(skipNight(fixture(479), 10).skippedSec, 0);
});

test('Skip Night: no orders creates no arrivals or free rewards and preserves unrelated counters', () => {
  const state = fixture(570); const before = JSON.stringify(state); const result = skipNight(state, 10);
  const { activePlaySec, orders, popularity, stats, ...rest } = result.state;
  const { activePlaySec: _t, orders: _o, popularity: _p, stats: _s, ...originalRest } = state;
  assert.deepEqual(rest, originalRest); assert.deepEqual(stats, state.stats); assert.equal(orders.length, 0);
  assert.equal(result.state.pendingBattles, state.pendingBattles);
  assert.equal(result.state.rotatingStock, state.rotatingStock);
  assert.equal(result.state.nextCustomerTimerSec, 7); assert.equal(JSON.stringify(state), before);
});

test('Skip Night: surviving orders keep IDs and exact remaining time; only ordinary expiry removes orders', () => {
  const state = fixture(570); state.orders = [order(state, 'late', 90), order(state, 'alive', 91), order(state, 'tutorial', 90, true)];
  const result = skipNight(state, 10);
  assert.deepEqual(result.state.orders.map((o) => [o.id, o.remainingSec]), [['alive', 1], ['tutorial', 60]]);
  assert.equal(result.state.stats.ordersMissed, 1); assert.equal(result.state.popularity.human, 15);
  assert.equal(result.state.gold, state.gold); assert.equal(result.state.stats.ordersCompleted, 0);
});

test('Skip Night: nonempty ready/unready battles and rotating stock remain byte-for-byte unchanged', () => {
  const state = fixture(570); const source = order(state, 'battle-source', 100);
  const battle = {
    id: 'ready-battle', orderId: source.id, race: source.race,
    customerName: source.customerName, portraitVariant: source.portraitVariant,
    weapon: source.weapon, quality: 0.9, fulfilment: 1,
    scenarioName: source.scenarioName, scenarioDifficulty: source.scenarioDifficulty,
    enemyArchetype: source.enemyArchetype, smithLevel: 1,
    etaSec: 0, ready: true, rewardMultiplier: 1, wasRoyal: false,
  };
  state.pendingBattles = [resolvePendingBattleResult(battle, () => 0.1), { ...battle, id: 'unready-battle', ready: false, etaSec: 27 }];
  const before = JSON.stringify({ battles: state.pendingBattles, stock: state.rotatingStock, timer: state.rotatingStockTimerSec });
  const next = skipNight(state, 10).state;
  assert.equal(JSON.stringify({ battles: next.pendingBattles, stock: next.rotatingStock, timer: next.rotatingStockTimerSec }), before);
  assert.equal(next.pendingBattles, state.pendingBattles);
  assert.equal(next.gold, state.gold); assert.deepEqual(next.inventory, state.inventory);
  assert.equal(next.stats.battlesWon, state.stats.battlesWon);
});

test('Skip Night availability: night only, visible workshop without any deadline-pausing UI', () => {
  assert.equal(isSkipNightAvailable(480, safeContext), true); assert.equal(isSkipNightAvailable(0, safeContext), false);
  for (const changed of [
    { screen: 'title' }, { screen: 'character' }, { hidden: true }, { bgPaused: true },
    { activeModal: 'orders' }, { activeModal: 'settings' }, { forging: true }, { forgePaused: true },
  ]) assert.equal(isSkipNightAvailable(480, { ...safeContext, ...changed } as SkipNightContext), false);
});

test('actual Skip Night handler: one live-ref publication/save, same expiration toast, no cooldown/reward work', () => {
  const state = fixture(570); state.orders = [order(state, 'late', 20), order(state, 'alive', 120)];
  const h = harness(state); h.env.cooldown = 5; const skip = appCallback('handleSkipNight', h.env); skip();
  assert.equal(h.env.saveRef.current.activePlaySec, 660); assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0], h.env.saveRef.current); assert.equal(h.env.saveRef.current.orders[0].remainingSec, 30);
  assert.equal(h.toasts.length, 1); assert.match(h.toasts[0], /Missed deadline/); assert.equal(h.env.cooldown, 5);
  skip(); assert.equal(h.writes.length, 1); assert.equal(h.env.saveRef.current.activePlaySec, 660);
});

test('actual Skip Night handler: stale enabled UI cannot bypass current visibility/modal/forge guards', () => {
  for (const changed of [{ activeModal: 'settings' }, { activeModal: 'orders' }, { forging: {} }, { forgePaused: true }, { bgPaused: true }, { screen: 'title' }]) {
    const state = fixture(); const h = harness(state); Object.assign(h.env.simulationUi.current, changed);
    appCallback('handleSkipNight', h.env)(); assert.equal(h.env.saveRef.current, state); assert.equal(h.writes.length, 0);
  }
  const state = fixture(); const h = harness(state); h.env.document.hidden = true;
  appCallback('handleSkipNight', h.env)(); assert.equal(h.env.saveRef.current, state); assert.equal(h.writes.length, 0);
});

test('actual Skip Night then normal tick: no skipped arrivals and one resumed countdown step after dawn', () => {
  const state = fixture(570); state.nextCustomerTimerSec = 1; const h = harness(state);
  appCallback('handleSkipNight', h.env)(); assert.equal(h.env.saveRef.current.orders.length, 0);
  assert.equal(h.env.saveRef.current.nextCustomerTimerSec, 1);
  appTick(h.env)(); assert.equal(h.env.saveRef.current.activePlaySec, 661); assert.equal(h.env.saveRef.current.orders.length, 1);
});

function storageHarness() {
  const store = new Map<string, string>(); let fail = false;
  globalThis.localStorage = {
    get length() { return store.size; }, clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null, key: (i) => [...store.keys()][i] ?? null,
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { if (fail) throw new DOMException('Test quota', 'QuotaExceededError'); store.set(key, value); },
  };
  return { store, setFail: (value: boolean) => { fail = value; } };
}

test('Skip Night persistence: save/reload preserves dawn, deadlines and unchanged battle/shop data', () => {
  storageHarness(); const state = fixture(570); state.orders = [order(state, 'alive', 120)];
  const result = skipNight(state, 10); assert.equal(persistSaveState(result.state).status, 'ok');
  const loaded = loadSaveStateWithStatus().state!;
  assert.equal(loaded.activePlaySec, 660); assert.equal(getWorldCycle(loaded.activePlaySec).dayIndex, 2);
  assert.equal(loaded.orders[0].remainingSec, 30); assert.equal(loaded.nextCustomerTimerSec, 7);
  assert.equal(loaded.rotatingStockTimerSec, 300); assert.deepEqual(loaded.pendingBattles, state.pendingBattles);
});

test('Skip Night persistence failure: newer live dawn survives I3 Continue until retry succeeds', () => {
  const storage = storageHarness(); const before = fixture(570); assert.equal(persistSaveState(before).status, 'ok');
  storage.setFail(true); const h = harness(before); let failed = false;
  h.env.persistCurrent = (state: SaveState) => { h.writes.push(state); failed = persistSaveState(state).status === 'failed'; };
  appCallback('handleSkipNight', h.env)(); assert.equal(h.env.saveRef.current.activePlaySec, 660); assert.equal(failed, true);
  assert.equal(JSON.parse(storage.store.get(SAVE_STORAGE_KEY)!).activePlaySec, 570);
  let reads = 0; const continuation = resolveContinueSave(h.env.saveRef.current, failed, () => { reads += 1; return loadSaveStateWithStatus().state; });
  assert.equal(reads, 0); assert.equal(continuation.state!.activePlaySec, 660);
  storage.setFail(false); assert.equal(persistSaveState(continuation.state!).status, 'ok');
  assert.equal(loadSaveStateWithStatus().state!.activePlaySec, 660);
});

test('actual App tick: 30-second cadence continues across dusk/dawn and UI churn without extra intervals', () => {
  const state = fixture(470); state.nextCustomerTimerSec = 100; const h = harness(state); const tick = appTick(h.env);
  h.env.autosaveElapsed.current = 20_000;
  for (let i = 0; i < 10; i += 1) { h.env.simulationUi.current.activeModal = i % 2 ? 'shop' : null; tick(); }
  assert.equal(h.env.saveRef.current.activePlaySec, 480); assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].activePlaySec, 480);
  assert.match(app, /bindLifecyclePersistence\(/); assert.match(app, /\[screen, bgPaused, showToast, publishSave, persistCurrent\]/);
});

test('actual App tick: two periodic boundaries survive dawn and modal churn without arrivals', () => {
  const state = fixture(650); state.orders = ['a', 'b', 'c'].map((id) => order(state, id, 1000));
  const h = harness(state); const tick = appTick(h.env);
  for (let i = 0; i < 60; i += 1) { h.env.simulationUi.current.activeModal = i % 2 ? 'shop' : null; tick(); }
  assert.deepEqual(h.writes.map((s) => s.activePlaySec), [680, 710]);
  assert.equal(h.env.saveRef.current.orders.length, 3);
});

test('HUD: phase/day and night-only Skip Night use existing strings and disabled availability', () => {
  const source = readFileSync(new URL('../components/HudOverlay.tsx', import.meta.url), 'utf8');
  assert.match(source, /getWorldCycle\(save\.activePlaySec\)/);
  assert.match(source, /worldCycle\.phase === 'night' &&/);
  assert.match(source, /disabled=\{!canSkipNight\}/);
  assert.match(source, /STRINGS\.worldCycle\.skipNight/);
  assert.match(source, /STRINGS\.worldCycle\.dayLabel/);
});
