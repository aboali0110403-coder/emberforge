import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDailyLedger,
  DAILY_LEDGER_CLOSED_LIMIT,
  getLedgerDayIndex,
  sanitizeDailyLedger,
} from './dailyLedger';
import { createInitialSaveState, decodeBackupCode, encodeBackupCode, migrateSaveState } from './rules';
import { SAVE_VERSION } from '../data/config';
import { WORLD_CYCLE } from './worldCycle';
import type { DailyBucket, DailyLedger } from '../types';

const player = { name: 'Ledger', gender: 'male' as const, hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0 };
const dayLength = WORLD_CYCLE.cycleDurationSec;
const clone = <T,>(value: T): T => structuredClone(value);
function bucket(dayIndex: number): DailyBucket {
  return createDailyLedger((dayIndex - 1) * dayLength, 'complete').current;
}
function ledger(day = 3): DailyLedger {
  return { format: 1, current: { ...bucket(day), deliveries: 2, missed: 1, deliveryGold: 50 }, closed: [bucket(1)] };
}
function migrated(raw: unknown) {
  const result = migrateSaveState(raw);
  assert.ok(result);
  return result;
}

for (const [seconds, day] of [[0, 1], [479, 1], [480, 1], [659, 1], [660, 2], [661, 2], [1320, 3]]) {
  test(`ledger day identity at ${seconds}`, () => assert.equal(getLedgerDayIndex(seconds), day));
}

test('ledger fresh save is complete-so-far Day1 without recorded activity', () => {
  const state = createInitialSaveState(player);
  assert.equal(state.version, 4);
  assert.equal(SAVE_VERSION, 4);
  assert.deepEqual(state.dailyLedger, {
    format: 1, current: { dayIndex: 1, observedFromSec: 0, coverage: 'complete', deliveries: 0, missed: 0, deliveryGold: 0 }, closed: [],
  });
});

test('ledger initialization never claims a full day when observation starts mid-day', () => {
  assert.equal(createDailyLedger(479, 'complete').current.coverage, 'partial');
  assert.equal(createDailyLedger(660, 'complete').current.coverage, 'complete');
  assert.equal(createDailyLedger(660).current.coverage, 'partial');
});

for (const version of [1, 2, 3]) {
  for (const seconds of [0, 479, 480, 659, 660, 661, 1800]) {
    test(`ledger legacy v${version} at ${seconds} starts partial with no invented history`, () => {
      const raw = { ...createInitialSaveState(player), version, activePlaySec: seconds, dailyLedger: ledger() };
      raw.stats.ordersCompleted = 100;
      raw.stats.ordersMissed = 50;
      raw.stats.totalGoldEarned = 99999;
      const state = migrated(raw);
      assert.equal(state.activePlaySec, seconds);
      assert.deepEqual(state.dailyLedger, createDailyLedger(seconds));
      const twice = migrated(state);
      assert.deepEqual(twice.dailyLedger, state.dailyLedger);
    });
  }
}

test('ledger valid v4 JSON and EF1 backup round trips preserve same-snapshot accounting', () => {
  const raw = { ...createInitialSaveState(player), activePlaySec: 1400, dailyLedger: ledger() };
  const frozen = clone(raw);
  assert.deepEqual(migrated(JSON.parse(JSON.stringify(raw))).dailyLedger, raw.dailyLedger);
  const encoded = encodeBackupCode(raw);
  assert.ok(encoded.startsWith('EF1:'));
  assert.deepEqual(decodeBackupCode(encoded)?.dailyLedger, raw.dailyLedger);
  assert.deepEqual(raw, frozen);
});

test('ledger valid partial rows and gaps stay partial and sparse, never zero-filled', () => {
  const raw = ledger(10);
  raw.current.observedFromSec = 6000;
  raw.current.coverage = 'partial';
  raw.closed = [{ ...bucket(2), observedFromSec: 700, coverage: 'partial' }, bucket(8)];
  assert.deepEqual(sanitizeDailyLedger(raw, 6100), raw);
});

for (const value of [undefined, null, [], 4, {}, { format: 2 }, { format: 1, current: null, closed: [] }]) {
  test(`ledger missing/malformed root ${JSON.stringify(value)} becomes partial only`, () => {
    const raw = { ...createInitialSaveState(player), activePlaySec: 480, dailyLedger: value };
    const state = migrated(raw);
    assert.deepEqual(state.dailyLedger, createDailyLedger(480));
    assert.equal(state.gold, raw.gold);
    assert.deepEqual(state.orders, raw.orders);
  });
}

for (const field of ['deliveries', 'missed', 'deliveryGold'] as const) {
  for (const invalid of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null]) {
    test(`ledger rejects ${field} counter ${String(invalid)}`, () => {
      const raw = ledger();
      (raw.current as unknown as Record<string, unknown>)[field] = invalid;
      assert.deepEqual(sanitizeDailyLedger(raw, 1400), createDailyLedger(1400));
    });
  }
}

test('ledger accepts safe integer counters without rounding or clamping', () => {
  const raw = ledger();
  raw.current.deliveries = Math.floor(Number.MAX_SAFE_INTEGER / 5);
  raw.current.deliveryGold = Number.MAX_SAFE_INTEGER;
  raw.current.missed = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(sanitizeDailyLedger(raw, 1400), raw);
});

for (const coverage of ['unknown', '', null, true, 1]) {
  test(`ledger rejects invalid coverage ${String(coverage)}`, () => {
    const raw = ledger();
    (raw.current as unknown as Record<string, unknown>).coverage = coverage;
    assert.deepEqual(sanitizeDailyLedger(raw, 1400), createDailyLedger(1400));
  });
}

test('ledger rejects impossible accounting pair, day identity and observation coverage', () => {
  const mutations: ((l: DailyLedger) => void)[] = [
    l => { l.current.deliveries = 0; },
    l => { l.current.deliveryGold = 0; },
    l => { l.current.deliveryGold = 1; },
    l => { l.current.deliveryGold = 3; },
    l => { l.current.dayIndex = 2; },
    l => { l.current.dayIndex = Number.MAX_SAFE_INTEGER; },
    l => { l.current.observedFromSec = 1500; l.current.coverage = 'partial'; },
    l => { l.current.observedFromSec = 1300; },
    l => { l.current.observedFromSec = 1321; },
    l => { l.current.observedFromSec = -1; },
    l => { l.current.observedFromSec = 1320.1; },
    l => { l.current.observedFromSec = Infinity; },
  ];
  for (const mutate of mutations) {
    const raw = ledger(); mutate(raw);
    assert.deepEqual(sanitizeDailyLedger(raw, 1400), createDailyLedger(1400));
  }
});

test('ledger rejects duplicate, unsorted, current/future, invalid and mismatched closed rows', () => {
  const invalidRows = [
    [bucket(1), bucket(1)], [bucket(2), bucket(1)], [bucket(3)], [bucket(4)],
    [{ ...bucket(1), dayIndex: 0 }], [{ ...bucket(1), dayIndex: 2 }],
    [{ ...bucket(1), missed: -1 }], [{ ...bucket(1), coverage: 'invalid' }],
  ];
  for (const closed of invalidRows) {
    assert.deepEqual(sanitizeDailyLedger({ ...ledger(), closed }, 1400), createDailyLedger(1400));
  }
});

test('ledger keeps exactly newest30closed rows ordered, never trims current or fills gaps', () => {
  const raw = ledger(100);
  raw.closed = Array.from({ length: 45 }, (_, i) => bucket(i * 2 + 1));
  const original = clone(raw);
  const result = sanitizeDailyLedger(raw, 99 * dayLength);
  assert.equal(DAILY_LEDGER_CLOSED_LIMIT, 30);
  assert.equal(result.closed.length, 30);
  assert.deepEqual(result.closed, raw.closed.slice(-30));
  assert.deepEqual(result.current, raw.current);
  assert.deepEqual(raw, original);
  result.closed[0].missed++;
  result.current.deliveries++;
  assert.deepEqual(raw, original);
});

test('ledger huge valid clocks and malformed day/clock inputs do bounded work without history expansion', () => {
  const seconds = Number.MAX_SAFE_INTEGER;
  const raw = createDailyLedger(seconds);
  assert.deepEqual(sanitizeDailyLedger(raw, seconds), raw);
  assert.equal(raw.closed.length, 0);
  assert.equal(raw.current.dayIndex, Math.floor(seconds / dayLength) + 1);
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getLedgerDayIndex(invalid), RangeError);
    assert.throws(() => sanitizeDailyLedger({}, invalid), RangeError);
  }
  assert.deepEqual(sanitizeDailyLedger({ ...raw, closed: Array(10001).fill(bucket(1)) }, seconds), createDailyLedger(seconds));
});

test('ledger migration uses unchanged sanitized gameplay clock and distrusts changed raw clocks', () => {
  for (const activePlaySec of [-2, 0.4, Infinity, NaN, Number.MAX_SAFE_INTEGER, '660']) {
    const state = migrated({ ...createInitialSaveState(player), activePlaySec });
    assert.equal(state.activePlaySec, typeof activePlaySec === 'number' && Number.isFinite(activePlaySec)
      ? Math.round(Math.max(0, Math.min(100_000_000, activePlaySec))) : 0);
    assert.deepEqual(state.dailyLedger, createDailyLedger(state.activePlaySec));
  }
});

test('ledger mismatched stale current resets partial rather than silently recording rollover or merging history', () => {
  const raw = { ...createInitialSaveState(player), activePlaySec: 661 };
  const state = migrated(raw);
  assert.deepEqual(state.dailyLedger, createDailyLedger(661));
  for (let i = 0; i < 5; i++) assert.deepEqual(migrated(state).dailyLedger, state.dailyLedger);
  assert.equal(raw.dailyLedger.current.coverage, 'complete');
});

test('ledger future schema is not treated as trusted v4 accounting', () => {
  const state = migrated({ ...createInitialSaveState(player), version: 999 });
  assert.deepEqual(state.dailyLedger, createDailyLedger(0));
});


test('ledger existing minimum fee invariant is enforced in migration and closed rows without overflow', () => {
  for (const [deliveries, deliveryGold] of [[2, 3], [2, 9], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], [Math.floor(Number.MAX_SAFE_INTEGER / 5) + 1, Number.MAX_SAFE_INTEGER]]) {
    const dailyLedger = ledger();
    dailyLedger.current.deliveries = deliveries;
    dailyLedger.current.deliveryGold = deliveryGold;
    const raw = { ...createInitialSaveState(player), activePlaySec: 1400, dailyLedger };
    assert.deepEqual(migrated(raw).dailyLedger, createDailyLedger(1400));
    dailyLedger.current = bucket(3);
    dailyLedger.closed[0] = { ...bucket(1), deliveries, deliveryGold };
    assert.deepEqual(sanitizeDailyLedger(dailyLedger, 1400), createDailyLedger(1400));
  }
  for (const [deliveries, deliveryGold] of [[1, 5], [2, 10], [Math.floor(Number.MAX_SAFE_INTEGER / 5), Number.MAX_SAFE_INTEGER]]) {
    const raw = ledger();
    raw.current.deliveries = deliveries; raw.current.deliveryGold = deliveryGold;
    assert.deepEqual(sanitizeDailyLedger(raw, 1400), raw);
  }
});


test('TD correction: exact raw numeric version 4 preserves valid ledger at unchanged clock', () => {
  const raw = { ...createInitialSaveState(player), version: 4, activePlaySec: 1400, dailyLedger: ledger() };
  const state = migrated(raw);
  assert.deepEqual(state.dailyLedger, raw.dailyLedger);
  assert.equal(state.activePlaySec, 1400);
  assert.equal(state.version, SAVE_VERSION);
});

for (const version of [4.9, '4', 3, 5, 999, undefined, NaN, Infinity]) {
  test(`TD correction: raw version ${String(version)} (${typeof version}) cannot trust supplied ledger`, () => {
    const raw = { ...createInitialSaveState(player), version, activePlaySec: 1400, dailyLedger: ledger() };
    const state = migrated(raw);
    assert.deepEqual(state.dailyLedger, createDailyLedger(1400));
    assert.equal(state.dailyLedger.current.coverage, 'partial');
    assert.equal(state.dailyLedger.closed.length, 0);
    assert.equal(state.activePlaySec, 1400);
    assert.equal(state.version, SAVE_VERSION);
    const control = migrated({ ...raw, version: 4 });
    const { dailyLedger: _ignored, ...gameplay } = state;
    const { dailyLedger: _controlLedger, ...controlGameplay } = control;
    assert.deepEqual(gameplay, controlGameplay);
  });
}

import './dailyLedgerTransitions.test';
