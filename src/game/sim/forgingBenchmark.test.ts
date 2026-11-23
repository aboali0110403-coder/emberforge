// S2 — Forging benchmark regression tests.
// Stage A recorded the pre-change baseline (docs/s2-forging-baseline.md,
// evidence/forging-baseline.json). Stage B changed the mechanics per the
// measured findings (docs/s2-forging-redesign.md); these tests pin the NEW
// measured candidate behavior plus the structural properties the redesign
// must guarantee. Baseline numbers live immutably in the Stage A record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCell, runForge, summarizeForges } from './forgingBenchmark';
import { createMinigameRuntime, handleMinigamePointerDown, updateMinigame } from '../../canvas/minigames';
import { ParticlePool } from '../../gfx/particles';

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;

// Reference cells (deterministic: fixed seed base, fixed dt, seeded RNG).
function cell(station: 'furnace' | 'anvil' | 'grindstone' | 'quench' | 'workbench', profile: 'poor' | 'average' | 'good' | 'exceptional', tier: number, weaponLevel: number, runs = 60, smithLevel = 1) {
  return runCell({ station, profile, tier, weaponLevel, smithLevel }, runs, 424242).summary;
}

test('deterministic: identical seeds reproduce identical cell summaries', () => {
  const a = cell('anvil', 'average', 1, 10);
  const b = cell('anvil', 'average', 1, 10);
  assert.deepEqual(a, b);
  const c1 = summarizeForges(runForge('average', 1, 10, 25, 777));
  const c2 = summarizeForges(runForge('average', 1, 10, 25, 777));
  assert.deepEqual(c1, c2);
});

test('candidate reference cells match the measured candidate record', () => {
  // Reference cell values are produced by runCell(...,60,424242) on the S2
  // candidate mechanics; see docs/s2-forging-redesign.md comparison tables.
  const anvilAvg19 = cell('anvil', 'average', 1, 19);
  assert.equal(r3(anvilAvg19.accMedian), 0.727);
  assert.equal(r2(anvilAvg19.perfectFrac), 0.05);
  const anvilPoor19 = cell('anvil', 'poor', 1, 19);
  assert.equal(r3(anvilPoor19.accMedian), 0.435);
  const quenchAvg19 = cell('quench', 'average', 1, 19);
  assert.equal(r2(quenchAvg19.perfectFrac), 0.07);
  const wbAvg19 = cell('workbench', 'average', 1, 19);
  assert.equal(r3(wbAvg19.accMedian), 0.684);
  const furnacePoor19 = cell('furnace', 'poor', 1, 19);
  assert.equal(r3(furnacePoor19.accMedian), 0.694);
  const grindPoor19 = cell('grindstone', 'poor', 1, 19);
  assert.equal(r3(grindPoor19.accMedian), 0.680);
});

test('skill gradient: better execution strictly improves median accuracy', () => {
  for (const station of ['furnace', 'anvil', 'grindstone', 'quench', 'workbench'] as const) {
    for (const tier of [1, 5]) {
      const poor = cell(station, 'poor', tier, 19, 40).accMedian;
      const avg = cell(station, 'average', tier, 19, 40).accMedian;
      const good = cell(station, 'good', tier, 19, 40).accMedian;
      const exc = cell(station, 'exceptional', tier, 19, 40).accMedian;
      assert.ok(poor <= avg && avg <= good && good <= exc,
        `${station} t${tier}: ${poor} <= ${avg} <= ${good} <= ${exc}`);
    }
  }
});

test('upgrades improve forgiveness, not automatic mastery', () => {
  // Equipment must help weaker executions (poor/average) reach GOOD outcomes,
  // but must not manufacture PERFECT: perfect fractions stay flat or move only
  // with genuine timing easing (slower ring), never via widened perfect windows.
  for (const p of ['poor', 'average'] as const) {
    const t1 = cell('anvil', p, 1, 19, 60);
    const t5 = cell('anvil', p, 5, 19, 60);
    assert.ok(t5.accMedian > t1.accMedian, 'anvil forgiveness improves');
    assert.ok(t5.perfectFrac - t1.perfectFrac <= 0.15, `no manufactured perfect (${t1.perfectFrac} -> ${t5.perfectFrac})`);
    const q1 = cell('quench', p, 1, 19, 60);
    const q5 = cell('quench', p, 5, 19, 60);
    assert.ok(Math.abs(q5.perfectFrac - q1.perfectFrac) < 0.05, 'quench perfect window fixed');
    assert.ok(q5.missFrac <= q1.missFrac, 'quench misses do not increase with tier');
  }
  // The tier widened GOOD tolerance is most visible on weak execution.
  const qp1 = cell('quench', 'poor', 1, 19, 60);
  const qp5 = cell('quench', 'poor', 5, 19, 60);
  assert.ok(qp5.goodFrac > qp1.goodFrac + 0.3, `quench good tolerance widens (${qp1.goodFrac} -> ${qp5.goodFrac})`);
});

test('no unconditional quality floors: misses persist at every tier', () => {
  // The flat 0.30 miss score and the removed cross-station finish bonus mean
  // weak execution still misses at max tier; forgiveness moves misses to GOOD,
  // never erases them wholesale.
  for (const tier of [1, 3, 5]) {
    const c = cell('anvil', 'poor', tier, 19, 60);
    assert.ok(c.missFrac >= 0.3, `poor anvil still misses at t${tier} (${c.missFrac})`);
  }
  const q5 = cell('quench', 'poor', 5, 19, 60);
  assert.ok(q5.perfectFrac <= 0.05, `quench t5 perfect stays rare for poor (${q5.perfectFrac})`);
});

test('weapon level scales difficulty on every station', () => {
  for (const station of ['furnace', 'anvil', 'grindstone', 'quench', 'workbench'] as const) {
    const l1 = cell(station, 'average', 1, 1, 60);
    const l19 = cell(station, 'average', 1, 19, 60);
    // Mean, not median: quench/workbench medians sit on discrete GOOD values.
    assert.ok(l19.accMean < l1.accMean, `${station}: L1 ${l1.accMean} > L19 ${l19.accMean}`);
  }
});

test('smith level widens GOOD outcomes without manufacturing PERFECT', () => {
  for (const station of ['anvil', 'quench', 'workbench'] as const) {
    const s1 = cell(station, 'average', 1, 19, 60, 1);
    const s20 = cell(station, 'average', 1, 19, 60, 20);
    assert.ok(s20.accMedian >= s1.accMedian, `${station} smith helps`);
    assert.ok(Math.abs(s20.perfectFrac - s1.perfectFrac) <= 0.03,
      `${station} perfect fraction unchanged (${s1.perfectFrac} -> ${s20.perfectFrac})`);
    assert.ok(s20.missFrac <= s1.missFrac, `${station} misses reduced`);
  }
});

test('combined forge quality and downstream outcomes match candidate record', () => {
  // Level-up chance and stat deltas flow through the REAL pipeline
  // (evaluateLevelUp, applyForgeUpgradesToWeapon) with a reference material stack.
  const poor19 = summarizeForges(runForge('poor', 1, 19, 60, 777));
  const avg19 = summarizeForges(runForge('average', 1, 19, 60, 777));
  const avg19t5 = summarizeForges(runForge('average', 5, 19, 60, 777));
  assert.ok(poor19.qMean < avg19.qMean && avg19.qMean < avg19t5.qMean);
  assert.ok(avg19.gradeDist.S <= 0.05, `average t1 S rate ${avg19.gradeDist.S}`);
  assert.ok(avg19t5.gradeDist.S <= 0.5, `average t5 S rate ${avg19t5.gradeDist.S}`);
  assert.ok(poor19.gradeDist.S === 0, 'poor play never reaches S');
  assert.ok(avg19.levelChanceMean > 0 && avg19.levelChanceMean < 1);
  assert.ok(avg19.powerDeltaMean > poor19.powerDeltaMean);
});

test('quench cannot stall: duration is enforced for never-start and held inputs', () => {
  // Drive the real runtime directly at the boundary cases.
  const equipment = { furnace: 1, hammer: 1, anvil: 1, grindstone: 1, quench: 1, workbench: 1 } as never;
  const mkRt = () => {
    const rt = createMinigameRuntime('quench', 19, equipment, 'sword');
    const particles = new ParticlePool();
    const cb = { onHitStop() {}, onShake() {}, onStreak() {}, onFinish() {} };
    return { rt, particles, cb };
  };
  // Never start: no input at all -> force-released at the configured duration,
  // judged as a miss (temp never left the top), not an infinite stall.
  {
    const { rt, particles, cb } = mkRt();
    let ticks = 0;
    while (!rt.finished && ticks < 60 * 60) { updateMinigame(rt, 1 / 60, new Set(), equipment, particles, cb); ticks++; }
    assert.ok(rt.finished, 'never-start quench finishes');
    assert.ok(rt.elapsed <= 14.05, `finished by duration (${rt.elapsed})`);
    assert.ok(rt.temp > 0.9 && rt.accuracy <= 0.34, `judged miss at full temp (${rt.accuracy})`);
  }
  // Held forever: temp floors and auto-releases as brittle well before duration.
  {
    const { rt, particles, cb } = mkRt();
    handleMinigamePointerDown(rt, 186, 152, equipment, particles, cb);
    let ticks = 0;
    while (!rt.finished && ticks < 60 * 60) { updateMinigame(rt, 1 / 60, new Set([' ']), equipment, particles, cb); ticks++; }
    assert.ok(rt.finished, 'held quench finishes');
    assert.ok(rt.temp <= 0.04 && rt.accuracy === 0.32, `brittle over-cool (${rt.accuracy})`);
  }
  // And the benchmark driver's poor profile always completes within duration.
  const s = runCell({ station: 'quench', profile: 'poor', tier: 1, weaponLevel: 19 }, 25, 424242);
  assert.ok(s.results.every((x) => x.elapsedSec <= 14.1), 'quench finishes by duration');
});

test('grindstone pointer route is measured and aiming improves outer-zone tracking', () => {
  // Pointer input moves the cursor at a capped speed toward the aim; it is not
  // an instant jump. The pointer and keyboard routes stay within each other's
  // noise for equal profiles.
  const kb = cell('grindstone', 'average', 1, 19, 60);
  const ptr = runCell({ station: 'grindstone', profile: 'average', tier: 1, weaponLevel: 19, inputMode: 'pointer' }, 60, 424242).summary;
  assert.ok(kb.inZoneMean !== null && ptr.inZoneMean !== null);
  assert.ok(Math.abs((kb.inZoneMean ?? 0) - (ptr.inZoneMean ?? 0)) < 0.1,
    `pointer vs keyboard in-zone parity (${kb.inZoneMean} vs ${ptr.inZoneMean})`);
  // Compare delayed/noisy poor aim with the average profile, not a no-input claim.
  const still = runCell({ station: 'grindstone', profile: 'poor', tier: 1, weaponLevel: 19, inputMode: 'pointer' }, 60, 424242).summary;
  assert.ok((still.inZoneMean ?? 1) < (ptr.inZoneMean ?? 0), 'aiming matters on the pointer route');
});

test('rendered indicators match the scoring windows', async () => {
  // The draw thresholds for the PERFECT highlights must be the scoring
  // constants themselves (single source of truth).
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../../canvas/minigames.ts', import.meta.url), 'utf8'));
  assert.ok(src.includes('Math.abs(rt.ringProgress - 0.85) <= ANVIL_PERFECT_WINDOW'), 'anvil ring highlight uses the scoring window');
  assert.ok(src.includes('Math.abs(rt.bindPulse - 0.8) <= BIND_PERFECT_WINDOW'), 'bind highlight uses the scoring window');
  assert.ok(src.includes('QUENCH_PERFECT_TOL * vh'), 'quench perfect band drawn at the scoring tolerance');
});

test('all four skill profiles produce distinct anvil grade distributions', () => {
  const ps = (['poor', 'average', 'good', 'exceptional'] as const).map(
    (p) => cell('anvil', p, 1, 19, 60).perfectFrac,
  );
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] > ps[i - 1], `perfect fractions ascending ${ps}`);
});


// Provisional S2 design judgment, not owner-supplied acceptance thresholds.
// Ordinary good execution should usually be GOOD, not PERFECT. Exceptional
// execution should retain a real advantage, not a guaranteed outcome.
test('provisional rarity criterion across levels, tiers and Smith endpoints', () => {
  for (const station of ['anvil','quench','workbench'] as const) {
    for (const tier of [1,3,5]) for (const weaponLevel of [1,10,19]) for (const smithLevel of [1,20]) {
      const summaries = (['average','good','exceptional'] as const).map(profile =>
        runCell({station,profile,tier,weaponLevel,smithLevel},100,20261123).summary);
      const p = (s: typeof summaries[number]) => station === 'workbench' ? s.bindPerfectFrac : s.perfectFrac;
      const g = (s: typeof summaries[number]) => station === 'workbench' ? s.bindGoodFrac : s.goodFrac;
      assert.ok(p(summaries[0]) <= .20, `${station} average PERFECT ${p(summaries[0])}`);
      assert.ok(p(summaries[1]) <= .40, `${station} good PERFECT ${p(summaries[1])}`);
      assert.ok(g(summaries[1]) > p(summaries[1]), `${station} GOOD exceeds PERFECT for good execution`);
      assert.ok(p(summaries[1])+g(summaries[1]) >= .95, `${station} good success remains forgiving`);
      assert.ok(p(summaries[2]) > p(summaries[1]), `${station} exceptional execution earns more precision`);
    }
  }
});
test('continuous center precision removes automatic max-tier accuracy without changing comfort', () => {
  for (const station of ['furnace','grindstone'] as const) for (const tier of [1,5]) for (const smithLevel of [1,20]) {
    const good = runCell({station,profile:'good',tier,smithLevel,weaponLevel:19},60,20261123).summary;
    const exc = runCell({station,profile:'exceptional',tier,smithLevel,weaponLevel:19},60,20261123).summary;
    assert.ok(good.accMean < .95 && good.accMean > .80, 'good continuous play earns good but not near-perfect accuracy');
    assert.ok(exc.accMean > good.accMean+.03, 'exceptional center tracking retains an advantage');
    assert.ok((exc.precisionMean ?? 0) > (good.precisionMean ?? 1));
  }
  const goodPointer = runCell({station:'grindstone',profile:'good',tier:5,smithLevel:20,weaponLevel:19,inputMode:'pointer'},60,20261123).summary;
  const excPointer = runCell({station:'grindstone',profile:'exceptional',tier:5,smithLevel:20,weaponLevel:19,inputMode:'pointer'},60,20261123).summary;
  assert.ok(goodPointer.accMean < .95 && excPointer.accMean > goodPointer.accMean+.05);
});
test('pointer cannot teleport and exact center tracking can still earn full continuous accuracy', () => {
  const equipment = {furnace:5,hammer:5,anvil:5,grindstone:5,quench:5,workbench:5};
  const rt = createMinigameRuntime('grindstone',19,equipment,'sword',20);
  const particles = new ParticlePool();
  const cb = {onHitStop(){},onShake(){},onStreak(){},onFinish(){}};
  handleMinigamePointerDown(rt,110+.9*260,0,equipment,particles,cb);
  assert.equal(rt.cursorX,.5);
  updateMinigame(rt,1/60,new Set(),equipment,particles,cb);
  assert.ok(rt.cursorX <= .52000001);
  const idle = createMinigameRuntime('grindstone',19,equipment,'sword',20);
  while (!idle.finished) updateMinigame(idle,1/60,new Set(),equipment,particles,cb);
  assert.ok(idle.accuracy < .75, 'no-input stationary cursor cannot earn mastery');

  const perfect = createMinigameRuntime('furnace',19,equipment,'sword',20);
  perfect.elapsed = 1; perfect.inBandTime = 1; perfect.furnacePreciseTime = 1;
  perfect.heat = .54+Math.sin((1+1/60)*.75)*.14; perfect.heatVel = 0;
  updateMinigame(perfect,1/60,new Set(),equipment,particles,cb);
  assert.ok(perfect.accuracy > .99, 'precision remains achievable');
});
