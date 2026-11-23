import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMinigameRuntime,
  handleMinigamePointerDown,
  handleMinigamePointerUp,
  updateMinigame,
  type MinigameFinishPayload,
} from '../canvas/minigames';
import { ParticlePool } from '../gfx/particles';
import { advanceForgeStep } from './hotkeys';
import {
  anvilStrikeJudgment,
  bindBeatJudgment,
  buildStationInsight,
  type ForgeInsightReport,
} from './forgeInsightReport';
import { createTutorialOrder } from './rules';
import type { EquipmentId, ForgingSession, StationId } from '../types';

const equipment: Record<EquipmentId, number> = {
  furnace: 1, anvil: 1, hammer: 1, grindstone: 1, quench: 1, workbench: 1,
};

function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

interface Harness {
  rt: ReturnType<typeof createMinigameRuntime>;
  payload: () => MinigameFinishPayload | null;
  finishes: () => number;
  tick: (dt: number) => void;
  down: (x: number, y: number, fromKeyboard?: boolean) => void;
  up: () => void;
}

function run(station: StationId, level: number, script: (h: Harness) => void, seed = 12345) {
  const orig = Math.random;
  Math.random = seededRandom(seed);
  try {
    const rt = createMinigameRuntime(station, level, equipment, 'sword');
    const particles = new ParticlePool();
    let payload: MinigameFinishPayload | null = null;
    let finishes = 0;
    const cb = {
      onHitStop() {}, onShake() {}, onStreak() {},
      onFinish(p: MinigameFinishPayload) { finishes++; payload = p; },
    };
    const h: Harness = {
      rt,
      payload: () => payload,
      finishes: () => finishes,
      tick: (dt) => updateMinigame(rt, dt, new Set(), equipment, particles, cb),
      down: (x, y, fromKeyboard = false) =>
        handleMinigamePointerDown(rt, x, y, equipment, particles, cb, fromKeyboard),
      up: () => handleMinigamePointerUp(rt, particles, cb),
    };
    script(h);
    return h;
  } finally {
    Math.random = orig;
  }
}

const untilDone = (h: Harness, body: () => void) => {
  for (let i = 0; i < 200000 && !h.rt.finished; i++) body();
  assert.equal(h.rt.finished, true, 'scenario reaches the existing finish path');
};

// Golden accuracy/bestStreak values captured from the accepted V2 baseline
// (manifest b3132a501f866f699ec244a1d25c1cde849fa56fd0b3b205785e1171e7b0aea3)
// running these exact seeded scripts. They pin V2 behavior byte-for-byte.
const scenarios: Record<
  string,
  { station: StationId; accuracy: number; bestStreak: number; script: (h: Harness) => void }
> = {
  furnace_ride: {
    station: 'furnace', accuracy: 1, bestStreak: 0,
    script: (h) => untilDone(h, () => { h.rt.pointerDown = h.rt.heat < h.rt.bandCenter; h.tick(0.016); }),
  },
  furnace_idle: {
    station: 'furnace', accuracy: 0.32797441364605545, bestStreak: 0,
    script: (h) => untilDone(h, () => h.tick(0.016)),
  },
  anvil_mixed: {
    station: 'anvil', accuracy: 0.7587499999999999, bestStreak: 2,
    script: (h) => {
      const pattern: (number | 'timeout')[] = [0.85, 0.85, 0.66, 0.1, 'timeout', 0.85, 0.66, 0.85];
      for (const p of pattern) {
        if (p === 'timeout') { h.rt.ringProgress = 1.15; h.tick(0.1); }
        else { h.rt.ringProgress = p; h.down(h.rt.targetX, h.rt.targetY); h.tick(0.12); h.tick(0.21); }
      }
      untilDone(h, () => h.tick(0.016));
    },
  },
  grind_follow: {
    station: 'grindstone', accuracy: 1, bestStreak: 0,
    script: (h) => untilDone(h, () => { h.rt.cursorX = h.rt.zoneCenter; h.tick(0.016); }),
  },
  grind_idle: {
    station: 'grindstone', accuracy: 0.622, bestStreak: 0,
    script: (h) => untilDone(h, () => h.tick(0.016)),
  },
  quench_perfect: {
    station: 'quench', accuracy: 1, bestStreak: 1,
    script: (h) => {
      h.down(186, 152);
      while (h.rt.temp > 0.39 && !h.rt.finished) h.tick(0.016);
      h.up();
    },
  },
  quench_brittle: {
    station: 'quench', accuracy: 0.32, bestStreak: 0,
    script: (h) => { h.down(186, 152); untilDone(h, () => h.tick(0.016)); },
  },
  quench_early: {
    station: 'quench', accuracy: 0.34, bestStreak: 0,
    script: (h) => { h.down(186, 152); h.tick(0.016); h.up(); },
  },
  workbench_mixed: {
    station: 'workbench', accuracy: 0.7433333333333333, bestStreak: 3,
    script: (h) => {
      h.down(400, 60); // deliberate fit miss away from every slot
      h.down(0, 0, true); h.down(0, 0, true); h.down(0, 0, true); // keyboard fits
      for (const v of [0.8, 0.8, 0.9, 0.5, 0.8]) { h.rt.bindPulse = v; h.down(240, 140); }
      h.rt.bindPulse = 1.14;
      untilDone(h, () => h.tick(0.02));
    },
  },
};

const DERIVED_KEYS = new Set([
  'bandShare', 'scorch', 'zoneShare', 'strikeJudgments', 'judgmentTally',
  'bindJudgments', 'fitPenalty',
]);
const OBSERVED_KEYS = new Set([
  'elapsed', 'inBand', 'overheat', 'inZone', 'strikes', 'strikeScores',
  'fitResults', 'fitMisses', 'binds', 'bindScores', 'judgment', 'releaseTemp', 'window',
]);

for (const [name, s] of Object.entries(scenarios)) {
  test(`seeded ${name}: report equals stored runtime data, accuracy byte-identical to V2`, () => {
    const h = run(s.station, 1, s.script);
    const payload = h.payload()!;
    assert.equal(h.finishes(), 1, 'emission-once on the extended payload path');
    assert.equal(payload.accuracy, s.accuracy, 'seeded accuracy byte-identical to V2 baseline');
    assert.equal(payload.bestStreak, s.bestStreak, 'seeded bestStreak byte-identical to V2 baseline');

    const report = payload.insight;
    assert(report, 'extended payload carries the insight report');
    assert.equal(report.station, s.station);
    assert.equal(report.accuracy, payload.accuracy, 'report accuracy is the payload accuracy');
    assert.equal(report.bestStreak, payload.bestStreak, 'report bestStreak is the payload bestStreak');

    const byKey = new Map(report.entries.map((e) => [e.key, e]));
    const entry = (k: string) => {
      const e = byKey.get(k);
      assert(e, `report has ${k}`);
      return e!;
    };
    const rt = h.rt;
    if (s.station === 'furnace') {
      assert.equal(entry('elapsed').value, rt.elapsed, 'elapsed keeps the raw seconds');
      assert.equal(entry('inBand').value, rt.inBandTime, 'in-band time keeps the raw seconds');
      assert.equal(entry('overheat').value, rt.overheatSec, 'overheat keeps the raw seconds');
      assert.equal(
        entry('bandShare').value,
        rt.inBandTime / Math.max(0.1, rt.elapsed),
        'band share keeps the raw ratio',
      );
    } else if (s.station === 'grindstone') {
      assert.equal(entry('elapsed').value, rt.elapsed, 'elapsed keeps the raw seconds');
      assert.equal(entry('inZone').value, rt.grindInZoneTime, 'in-zone time keeps the raw seconds');
      assert.equal(
        entry('zoneShare').value,
        rt.grindInZoneTime / Math.max(0.1, rt.elapsed),
        'zone share keeps the raw ratio',
      );
    } else if (s.station === 'anvil') {
      assert.deepEqual(
        entry('strikes').value,
        [rt.strikesDone, rt.strikesTotal],
        'strikes keep raw numeric counts',
      );
      assert.deepEqual(
        entry('strikeScores').value,
        rt.strikeScores,
        'per-strike scores keep the raw stored numbers exactly',
      );
      assert((entry('strikeScores').value as number[]).every((v) => typeof v === 'number'));
      assert.deepEqual(
        entry('strikeJudgments').value,
        rt.strikeScores.map(anvilStrikeJudgment),
        'strike judgments keep raw tokens',
      );
      assert.deepEqual(
        entry('judgmentTally').value,
        [
          rt.strikeScores.map(anvilStrikeJudgment).filter((x) => x === 'perfect').length,
          rt.strikeScores.map(anvilStrikeJudgment).filter((x) => x === 'good').length,
          rt.strikeScores.map(anvilStrikeJudgment).filter((x) => x === 'miss').length,
        ],
        'judgment tally keeps raw numeric counts',
      );
    } else if (s.station === 'quench') {
      assert.equal(entry('releaseTemp').value, rt.temp, 'release temperature keeps the raw value');
      assert.deepEqual(
        entry('window').value,
        [rt.targetTempMin, rt.targetTempMax],
        'target window keeps both raw bounds',
      );
      assert(!entry('judgment').derived, 'quench release judgment is observed, not derived');
    } else if (s.station === 'workbench') {
      assert.deepEqual(
        entry('fitResults').value,
        rt.fitResults,
        'per-attempt fit outcomes equal the recorded runtime decisions exactly',
      );
      assert.equal(entry('fitMisses').value, rt.fitMisses);
      assert.deepEqual(
        entry('binds').value,
        [rt.bindBeatsDone, rt.bindBeatsTotal],
        'binds keep raw numeric counts',
      );
      assert.deepEqual(
        entry('bindScores').value,
        rt.bindScores,
        'per-beat scores keep the raw stored numbers exactly',
      );
      assert((entry('bindScores').value as number[]).every((v) => typeof v === 'number'));
      assert.deepEqual(
        entry('bindJudgments').value,
        rt.bindScores.map(bindBeatJudgment),
        'bind judgments keep raw tokens',
      );
    }

    for (const e of report.entries) {
      if (DERIVED_KEYS.has(e.key)) {
        assert.equal(e.derived, true, `${e.key} is explicitly labeled derived`);
      } else {
        assert(OBSERVED_KEYS.has(e.key), `unexpected entry key ${e.key}`);
        assert.equal(e.derived, false, `${e.key} is observed`);
      }
      assert(!('display' in e), 'report entries never carry pre-formatted display strings');
      if (Array.isArray(e.value)) {
        assert(
          (e.value as (number | string)[]).every((v) => typeof v === 'number' || !/[.,]\d|\d\//.test(String(v))),
          `${e.key} stores raw values, not formatted strings`,
        );
      }
    }

    // Report assembly must not mutate the runtime; rebuilding from the same
    // state reproduces the identical report (the quench generic path uses the
    // derived-label fallback for the tier, covered separately below).
    const snapshot = JSON.stringify(rt);
    const rebuilt = buildStationInsight(rt);
    assert.equal(JSON.stringify(rt), snapshot, 'report building never mutates the runtime');
    if (s.station !== 'quench') {
      assert.deepEqual(rebuilt, report, 'rebuild from the same state is identical');
    }

    // Emission-once: further input after finish cannot re-emit.
    h.tick(1);
    h.down(240, 140);
    h.up();
    assert.equal(h.finishes(), 1, 'no duplicate emission after finish');
    assert.equal(h.payload(), payload, 'the single payload is unchanged');
  });
}

test('workbench fit attempts record one actual outcome per attempt at the decision point', () => {
  const h = run('workbench', 1, (hh) => {
    hh.down(400, 60); // pointer miss away from every slot
    assert.deepEqual(hh.rt.fitResults, ['miss'], 'the miss is recorded at the decision point');
    assert.equal(hh.rt.fitMisses, 1, 'the global fitMisses counter is preserved');
    hh.down(185, 124); // pointer attempt on the Core slot: the runtime fits it
    assert.deepEqual(hh.rt.fitResults, ['miss', 'good']);
    assert.equal(hh.rt.slots[0].fitted, true);
    hh.down(0, 0, true); // keyboard attempt fits the next slot (Mount)
    hh.down(0, 0, true); // keyboard attempt fits the last slot (Trim), phase becomes bind
    assert.deepEqual(hh.rt.fitResults, ['miss', 'good', 'good', 'good']);
    assert.equal(hh.rt.fitMisses, 1, 'successful fits never touch the miss counter');
    assert.equal(hh.rt.slots.every((s) => s.fitted), true);
    for (const v of [0.8, 0.8, 0.9, 0.5, 0.8]) { hh.rt.bindPulse = v; hh.down(240, 140); }
    hh.rt.bindPulse = 1.14;
    untilDone(hh, () => hh.tick(0.02));
  });
  const payload = h.payload()!;
  assert.equal(payload.accuracy, 0.7433333333333333, 'fit recording does not alter accuracy');
  assert.equal(payload.bestStreak, 3, 'fit recording does not alter best streak');
  const report = payload.insight!;
  const byKey = new Map(report.entries.map((e) => [e.key, e]));
  assert.deepEqual(
    byKey.get('fitResults')!.value,
    ['miss', 'good', 'good', 'good'],
    'the report carries each actual fit outcome in attempt order',
  );
  assert.equal(byKey.get('fitResults')!.derived, false, 'fit outcomes are observed, not derived');
  assert.equal(byKey.get('fitMisses')!.value, 1);
});

test('quench fallback judgment from stored state is labeled derived', () => {
  const h = run('quench', 1, (hh) => {
    hh.down(186, 152);
    while (hh.rt.temp > 0.39 && !hh.rt.finished) hh.tick(0.016);
    hh.up();
  });
  const fallback = buildStationInsight(h.rt); // generic path re-derives the tier
  const judgment = fallback.entries.find((e) => e.key === 'judgment')!;
  assert.equal(judgment.value, 'perfect');
  assert.equal(judgment.derived, true, 'fallback tier is labeled derived');
  const actual = h.payload()!.insight!;
  assert.equal(actual.entries.find((e) => e.key === 'judgment')!.derived, false);
  assert.equal(actual.entries.find((e) => e.key === 'judgment')!.value, judgment.value);
});

function forgeSession(steps: StationId[]): ForgingSession {
  return {
    order: createTutorialOrder(),
    steps,
    stepIndex: 0,
    stepAccuracies: steps.map(() => 0),
    completedSteps: steps.map(() => false),
    selectedMaterials: [],
    targetPart: 'blade',
    streak: 0,
    bestStreakInForge: 0,
  };
}

const sampleReport = (station: StationId, accuracy: number): ForgeInsightReport => ({
  station,
  accuracy,
  bestStreak: 0,
  entries: [{ key: 'elapsed', value: 15.0, derived: false }],
});

test('advanceForgeStep accumulates reports per step for multi-step and repeated-station forges', () => {
  const session = forgeSession(['furnace', 'anvil', 'anvil']); // royal recipes may repeat a station
  const a = sampleReport('furnace', 0.9);
  const first = advanceForgeStep(session, 0.9, 0, a);
  assert.equal(first.finishedAll, false);
  assert.equal(first.nextSession.stepReports![0], a);
  assert.equal(first.nextSession.stepReports!.length, 3);
  assert.equal(session.stepReports, undefined, 'original session is not mutated');

  const b = sampleReport('anvil', 0.8);
  const second = advanceForgeStep(first.nextSession, 0.8, 1, b);
  assert.equal(second.nextSession.stepReports![1], b);

  const c = sampleReport('anvil', 0.7);
  const third = advanceForgeStep(second.nextSession, 0.7, 2, c);
  assert.equal(third.finishedAll, true);
  assert.deepEqual(
    third.nextSession.stepReports!.map((r) => r!.accuracy),
    [0.9, 0.8, 0.7],
    'reports stay aligned with their own step index, repeats included',
  );
  assert.equal(third.nextSession.stepReports![0], a);
  assert.equal(third.nextSession.stepReports![1], b);
  assert.equal(third.nextSession.stepReports![2], c);
});

test('advanceForgeStep keeps reports aligned when steps complete out of order', () => {
  const session = { ...forgeSession(['furnace', 'anvil', 'quench']), stepIndex: 2 };
  const c = sampleReport('quench', 1);
  const out = advanceForgeStep(session, 1, 1, c);
  assert.equal(out.nextSession.stepReports![2], c);
  assert.equal(out.nextSession.stepReports![0], undefined);
  assert.equal(out.nextSession.stepReports![1], undefined);
});

test('advanceForgeStep without an insight payload preserves prior V2 behavior', () => {
  const session = forgeSession(['furnace', 'quench']);
  const first = advanceForgeStep(session, 0.5, 0);
  assert.equal(first.nextSession.stepReports, undefined);
  const second = advanceForgeStep(first.nextSession, 0.6, 0);
  assert.equal(second.finishedAll, true);
  assert.equal(second.nextSession.stepReports, undefined);
  assert.deepEqual(second.accuracies, [0.5, 0.6]);
});
