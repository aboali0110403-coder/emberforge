// S2 Stage A — Forging station measurement harness.
//
// Drives the REAL station minigame runtimes (src/canvas/minigames.ts) headlessly
// with deterministic, seeded synthetic input profiles. The minigame code is not
// modified or reimplemented here; measurements describe the live mechanics.
//
// Determinism: fixed dt, a per-run mulberry32 RNG for all skill noise, and
// Math.random replaced for the duration of each run (the anvil target spawner
// and particle cosmetics use Math.random; only the target spawner can affect
// outcomes). Tests run sequentially, so the patch is safe.
//
// Profiles are SYNTHETIC execution policies (reaction delay, timing noise,
// lapse rate, tracking deadband, click scatter), not measured human data. What
// is measured here is how the mechanics respond to better or worse execution,
// which separates skill-driven outcomes from equipment forgiveness.
import {
  createMinigameRuntime,
  handleMinigamePointerDown,
  handleMinigamePointerMove,
  handleMinigamePointerUp,
  updateMinigame,
  type MinigameCallbacks,
  type MinigameFinishPayload,
  type MinigameRuntime,
} from '../../canvas/minigames';
import { anvilStrikeJudgment, bindBeatJudgment } from '../forgeInsightReport';
import { ParticlePool } from '../../gfx/particles';
import {
  applyForgeUpgradesToWeapon,
  evaluateLevelUp,
  getQualityGrade,
} from '../rules';
import { getStageMinRarity } from '../../data/balance';
import { getStepsForRequest, WEAPONS } from '../../data/weapons';
import type {
  EquipmentId,
  MaterialStackSelection,
  QualityGrade,
  StationId,
  WeaponInstance,
} from '../../types';

export type ProfileId = 'poor' | 'average' | 'good' | 'exceptional';

export interface SkillProfile {
  id: ProfileId;
  // Gaussian timing noise, seconds (applied through each station's own rate).
  timingSigma: number;
  // Observation delay, seconds: the player acts on stale state.
  reactionSec: number;
  // Per discrete event: probability of not acting at all (beat/strike lost).
  // Per continuous second (furnace/grindstone): hazard of an input freeze.
  lapseProb: number;
  // Duration of a continuous input freeze, seconds.
  lapseSec: number;
  // Tracking deadband around the target (normalized units) for continuous stations.
  trackDeadband: number;
  // Gaussian click scatter, canvas px (workbench fit).
  pixelSigma: number;
  // 0..1: how much of the reaction delay the player anticipates when timing.
  anticipation: number;
}

export const SKILL_PROFILES: Record<ProfileId, SkillProfile> = {
  poor: { id: 'poor', timingSigma: 0.16, reactionSec: 0.30, lapseProb: 0.22, lapseSec: 0.9, trackDeadband: 0.10, pixelSigma: 32, anticipation: 0.0 },
  average: { id: 'average', timingSigma: 0.09, reactionSec: 0.18, lapseProb: 0.07, lapseSec: 0.5, trackDeadband: 0.05, pixelSigma: 16, anticipation: 0.5 },
  good: { id: 'good', timingSigma: 0.045, reactionSec: 0.10, lapseProb: 0.02, lapseSec: 0.3, trackDeadband: 0.025, pixelSigma: 8, anticipation: 0.8 },
  exceptional: { id: 'exceptional', timingSigma: 0.02, reactionSec: 0.05, lapseProb: 0.004, lapseSec: 0.15, trackDeadband: 0.01, pixelSigma: 3, anticipation: 1.0 },
};

export const PROFILE_IDS: ProfileId[] = ['poor', 'average', 'good', 'exceptional'];
export const STATION_IDS: StationId[] = ['furnace', 'anvil', 'grindstone', 'quench', 'workbench'];

export const DT = 1 / 60;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = rng();
    v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

export interface Judgments { perfect: number; good: number; miss: number }

export interface StationRunResult {
  station: StationId;
  accuracy: number;
  bestStreak: number;
  elapsedSec: number;
  judgments: Judgments; // discrete judgments: anvil strikes, wb fits+beats, quench release
  timeouts: number;     // anvil expired strikes, wb expired beats
  brittle: boolean;     // quench over-cool
  fitMisses: number;    // workbench
  fitForced: number; bindJudgments: Judgments; precisionFrac: number | null;    // workbench safety-net exact fits after 12 genuine attempts
  inBandFrac: number | null;   // furnace
  inZoneFrac: number | null;   // grindstone
  overheatSec: number | null;  // furnace
}

interface Obs {
  t: number;
  heat: number; bandCenter: number;
  ringProgress: number;
  zoneCenter: number; cursorX: number;
  temp: number;
  pulse: number;
}

function observeAt(hist: Obs[], lag: number): Obs {
  const target = hist[hist.length - 1].t - lag;
  let i = hist.length - 1;
  while (i > 0 && hist[i - 1].t > target) i--;
  return hist[i];
}

export function runOne(
  station: StationId,
  weaponLevel: number,
  equipment: Record<EquipmentId, number>,
  profile: SkillProfile,
  seed: number,
  smithLevel = 1,
  inputMode: 'keyboard' | 'pointer' = 'keyboard',
): StationRunResult {
  const rng = mulberry32(seed);
  const gauss = gaussian(rng);
  const origRandom = Math.random;
  Math.random = rng;
  try {
    const rt = createMinigameRuntime(station, weaponLevel, equipment, 'sword', smithLevel);
    const particles = new ParticlePool();
    let payload: MinigameFinishPayload | null = null;
    const cb: MinigameCallbacks = {
      onHitStop: () => {}, onShake: () => {}, onStreak: () => {},
      onFinish: (p) => { payload = p; },
    };
    const keys = new Set<string>();
    const hist: Obs[] = [];
    const push = () => hist.push({
      t: rt.elapsed, heat: rt.heat, bandCenter: rt.bandCenter,
      ringProgress: rt.ringProgress, zoneCenter: rt.zoneCenter, cursorX: rt.cursorX,
      temp: rt.temp, pulse: rt.bindPulse,
    });
    push();

    let pumping = false;
    let freezeLeft = 0;
    // Continuous empirical rate estimates (mechanics-agnostic): updated from
    // consecutive observations, used to convert timing noise into the
    // station's own units. Defaults match the unscaled base rates.
    let pulseRateEst = 0.92;
    let coolRateEst = 0.34;
    // anvil / bind beat plans. A strike can only be armed after the DELAYED
    // observation shows a fresh ring/pulse (a real player watches the ring
    // reset); otherwise the stale pre-reset reading triggers a phantom click.
    let plannedThreshold: number | null = null;
    let plannedLapse = false;
    let armed = false;
    let discreteEventsSeen = 0;
    // quench
    let quenchTarget: number | null = null;
    let quenchStarted = false;
    // workbench fit
    let fitAttemptsOnSlot = 0;
    let fittedSeen = 0;
    let forcedFits = 0;

    const maxTicks = 60 * 90; // safety
    for (let tick = 0; tick < maxTicks && !rt.finished; tick++) {
      const obs = observeAt(hist, profile.reactionSec);
      if (station === 'furnace') {
        if (freezeLeft > 0) {
          freezeLeft -= DT;
        } else {
          if (rng() < (profile.lapseProb * DT) / 1.5) {
            freezeLeft = profile.lapseSec;
          } else {
            const hyst = profile.trackDeadband / 2;
            if (obs.heat < obs.bandCenter - hyst) pumping = true;
            else if (obs.heat > obs.bandCenter + hyst) pumping = false;
          }
        }
        if (pumping) keys.add(' '); else keys.delete(' ');
        updateMinigame(rt, DT, keys, equipment, particles, cb);
      } else if (station === 'grindstone') {
        if (inputMode === 'pointer') {
          // Mouse route: aim at the observed zone center (with tracking error);
          // the runtime moves the cursor toward it at the capped pointer speed.
          if (freezeLeft > 0) {
            freezeLeft -= DT;
          } else if (rng() < (profile.lapseProb * DT) / 1.5) {
            freezeLeft = profile.lapseSec;
          } else {
            const aim = obs.zoneCenter + gauss() * profile.trackDeadband * 0.5;
            handleMinigamePointerMove(rt, 110 + Math.max(0.08, Math.min(0.92, aim)) * 260);
          }
        } else if (freezeLeft > 0) {
          freezeLeft -= DT;
          keys.delete('a'); keys.delete('d');
        } else {
          if (rng() < (profile.lapseProb * DT) / 1.5) {
            freezeLeft = profile.lapseSec;
          } else {
            const dead = profile.trackDeadband / 2;
            const err = obs.zoneCenter - obs.cursorX;
            if (err > dead) { keys.add('d'); keys.delete('a'); }
            else if (err < -dead) { keys.add('a'); keys.delete('d'); }
            else { keys.delete('a'); keys.delete('d'); }
          }
        }
        updateMinigame(rt, DT, keys, equipment, particles, cb);
      } else if (station === 'anvil') {
        if (rt.strikeScores.length !== discreteEventsSeen) {
          discreteEventsSeen = rt.strikeScores.length;
          plannedThreshold = null;
          armed = false;
        }
        if (!armed && rt.strikesDone < rt.strikesTotal && obs.ringProgress <= 0.35) {
          armed = true;
          const speed = rt.ringSpeed;
          const e = gauss() * profile.timingSigma * speed;
          plannedLapse = rng() < profile.lapseProb;
          plannedThreshold = 0.85 + e - profile.anticipation * profile.reactionSec * speed;
        }
        if (
          armed && plannedThreshold !== null && !plannedLapse &&
          rt.hammerStrikeAnim <= 0 && obs.ringProgress >= plannedThreshold &&
          obs.ringProgress < 1.1
        ) {
          handleMinigamePointerDown(rt, rt.targetX, rt.targetY, equipment, particles, cb);
          plannedThreshold = null;
          armed = false;
        }
        updateMinigame(rt, DT, keys, equipment, particles, cb);
      } else if (station === 'quench') {
        if (!quenchStarted) {
          quenchStarted = true;
          handleMinigamePointerDown(rt, 186, 152, equipment, particles, cb);
        }
        // Plan the release once ~0.45s of cooling gives an empirical rate
        // estimate (the candidate scales cooling with weapon level).
        if (quenchStarted && quenchTarget === null && rt.submerged && rt.elapsed >= 0.45) {
          const mid = (rt.targetTempMin + rt.targetTempMax) / 2;
          quenchTarget = mid + gauss() * profile.timingSigma * coolRateEst
            + profile.anticipation * profile.reactionSec * coolRateEst;
        }
        if (!rt.quenchDone && quenchTarget !== null && obs.temp <= quenchTarget) {
          handleMinigamePointerUp(rt, particles, cb);
        }
        updateMinigame(rt, DT, keys, equipment, particles, cb);
      } else {
        // workbench
        if (rt.wbPhase === 'fit') {
          const fitted = rt.slots.filter((s) => s.fitted).length;
          if (fitted !== fittedSeen) { fittedSeen = fitted; fitAttemptsOnSlot = 0; }
          const slot = rt.slots.find((s) => !s.fitted);
          if (slot && fitAttemptsOnSlot < 12) {
            fitAttemptsOnSlot++;
            const lapse = rng() < profile.lapseProb;
            const x = lapse ? 240 + (rng() - 0.5) * 200 : slot.x + gauss() * profile.pixelSigma;
            const y = lapse ? 140 + (rng() - 0.5) * 120 : slot.y + gauss() * profile.pixelSigma;
            handleMinigamePointerDown(rt, x, y, equipment, particles, cb);
          } else if (slot) {
            // Safety net after 12 genuine attempts: exact click, counted so the
            // bias is explicit in the results (fitForcedMean).
            forcedFits++;
            handleMinigamePointerDown(rt, slot.x, slot.y, equipment, particles, cb);
          }
        } else {
          if (rt.bindScores.length !== discreteEventsSeen) {
            discreteEventsSeen = rt.bindScores.length;
            plannedThreshold = null;
            armed = false;
          }
          if (!armed && rt.bindBeatsDone < rt.bindBeatsTotal && obs.pulse <= 0.3) {
            armed = true;
            const e = gauss() * profile.timingSigma * pulseRateEst;
            plannedLapse = rng() < profile.lapseProb;
            plannedThreshold = 0.8 + e - profile.anticipation * profile.reactionSec * pulseRateEst;
          }
          if (
            armed && plannedThreshold !== null && !plannedLapse &&
            obs.pulse >= plannedThreshold && obs.pulse < 1.1
          ) {
            handleMinigamePointerDown(rt, 240, 108, equipment, particles, cb);
            plannedThreshold = null;
            armed = false;
          }
        }
        updateMinigame(rt, DT, keys, equipment, particles, cb);
      }
      // Update empirical rate estimates from consecutive observations.
      {
        const prev = hist[hist.length - 2];
        const cur = hist[hist.length - 1];
        if (prev && cur.t > prev.t) {
          const dp = (cur.pulse - prev.pulse) / (cur.t - prev.t);
          if (dp > 0.4 && dp < 1.6) pulseRateEst = dp;
          const dc = (prev.temp - cur.temp) / (cur.t - prev.t);
          if (dc > 0.15 && dc < 0.9) coolRateEst = dc;
        }
      }
      push();
    }

    const judgments: Judgments = { perfect: 0, good: 0, miss: 0 };
    const bindJudgments: Judgments = { perfect: 0, good: 0, miss: 0 };
    let timeouts = 0;
    if (station === 'anvil') {
      for (const s of rt.strikeScores) {
        if (s === 0.25) timeouts++;
        judgments[anvilStrikeJudgment(s)]++;
      }
    } else if (station === 'workbench') {
      for (const f of rt.fitResults) judgments[f === 'good' ? 'good' : 'miss']++;
      for (const s of rt.bindScores) {
        if (s === 0.32) timeouts++;
        judgments[bindBeatJudgment(s)]++;
        bindJudgments[bindBeatJudgment(s)]++;
      }
    } else if (station === 'quench') {
      const fin = payload as MinigameFinishPayload | null;
      const j = fin?.insight?.entries.find((e: { key: string }) => e.key === 'judgment');
      const v = j?.value;
      if (v === 'perfect') judgments.perfect++;
      else if (v === 'good') judgments.good++;
      else judgments.miss++;
    }
    const brittle = station === 'quench' && rt.temp <= 0.04;
    return {
      station,
      accuracy: rt.accuracy,
      bestStreak: rt.bestStreak,
      elapsedSec: rt.elapsed,
      judgments,
      timeouts,
      brittle,
      fitMisses: rt.fitMisses,
      fitForced: forcedFits, bindJudgments,
      precisionFrac: station === 'furnace' ? ((rt as any).furnacePreciseTime ?? 0) / Math.max(0.1, rt.elapsed) : station === 'grindstone' ? ((rt as any).grindPreciseTime ?? 0) / Math.max(0.1, rt.elapsed) : null,
      inBandFrac: station === 'furnace' ? rt.inBandTime / Math.max(0.1, rt.elapsed) : null,
      inZoneFrac: station === 'grindstone' ? rt.grindInZoneTime / Math.max(0.1, rt.elapsed) : null,
      overheatSec: station === 'furnace' ? rt.overheatSec : null,
    };
  } finally {
    Math.random = origRandom;
  }
}

export interface CellKey {
  station: StationId;
  profile: ProfileId;
  tier: number;
  weaponLevel: number;
  smithLevel?: number;
  inputMode?: 'keyboard' | 'pointer';
}

export interface CellSummary extends CellKey {
  runs: number;
  accMean: number; accMedian: number; accP25: number; accP75: number; accMin: number; accMax: number;
  perfectFrac: number; goodFrac: number; missFrac: number;
  bindPerfectFrac: number; bindGoodFrac: number; bindMissFrac: number; precisionMean: number | null;
  timeoutFrac: number; brittleRate: number; fitMissMean: number; fitForcedMean: number;
  inBandMean: number | null; inZoneMean: number | null; overheatMean: number | null;
}

function bindFraction(results: StationRunResult[], kind: keyof Judgments): number {
  const sum = results.reduce((a, r) => a + r.bindJudgments[kind], 0);
  const total = results.reduce((a, r) => a + r.bindJudgments.perfect + r.bindJudgments.good + r.bindJudgments.miss, 0);
  return total ? sum / total : 0;
}
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function runCell(cell: CellKey, runs: number, seedBase: number): { results: StationRunResult[]; summary: CellSummary } {
  const profile = SKILL_PROFILES[cell.profile];
  const equipment = {
    furnace: cell.tier, hammer: cell.tier, anvil: cell.tier,
    grindstone: cell.tier, quench: cell.tier, workbench: cell.tier,
  } as Record<EquipmentId, number>;
  const results: StationRunResult[] = [];
  for (let r = 0; r < runs; r++) {
    results.push(runOne(cell.station, cell.weaponLevel, equipment, profile, seedBase + r, cell.smithLevel ?? 1, cell.inputMode ?? 'keyboard'));
  }
  const accs = results.map((x) => x.accuracy).sort((a, b) => a - b);
  const j = results.reduce((a, x) => ({
    perfect: a.perfect + x.judgments.perfect,
    good: a.good + x.judgments.good,
    miss: a.miss + x.judgments.miss,
  }), { perfect: 0, good: 0, miss: 0 });
  const jTotal = Math.max(1, j.perfect + j.good + j.miss);
  const timeouts = results.reduce((a, x) => a + x.timeouts, 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const summary: CellSummary = {
    ...cell,
    runs,
    accMean: mean(accs),
    accMedian: quantile(accs, 0.5),
    accP25: quantile(accs, 0.25),
    accP75: quantile(accs, 0.75),
    accMin: accs[0] ?? 0,
    accMax: accs[accs.length - 1] ?? 0,
    perfectFrac: j.perfect / jTotal,
    goodFrac: j.good / jTotal,
    missFrac: j.miss / jTotal,
    timeoutFrac: timeouts / jTotal,
    brittleRate: results.filter((x) => x.brittle).length / runs,
    fitMissMean: mean(results.map((x) => x.fitMisses)),
    fitForcedMean: mean(results.map((x) => x.fitForced)),
    bindPerfectFrac: bindFraction(results, 'perfect'), bindGoodFrac: bindFraction(results, 'good'), bindMissFrac: bindFraction(results, 'miss'),
    precisionMean: (cell.station === 'furnace' || cell.station === 'grindstone') ? mean(results.map((x) => x.precisionFrac ?? 0)) : null,
    inBandMean: cell.station === 'furnace' ? mean(results.map((x) => x.inBandFrac ?? 0)) : null,
    inZoneMean: cell.station === 'grindstone' ? mean(results.map((x) => x.inZoneFrac ?? 0)) : null,
    overheatMean: cell.station === 'furnace' ? mean(results.map((x) => x.overheatSec ?? 0)) : null,
  };
  return { results, summary };
}

// Isolation grid: vary ONLY the named equipment tier, hold everything else at 1.
export function runCellIsolated(
  station: StationId,
  profileId: ProfileId,
  equipTier: Partial<Record<EquipmentId, number>>,
  weaponLevel: number,
  runs: number,
  seedBase: number,
): CellSummary {
  const equipment = {
    furnace: 1, hammer: 1, anvil: 1, grindstone: 1, quench: 1, workbench: 1,
    ...equipTier,
  } as Record<EquipmentId, number>;
  const profile = SKILL_PROFILES[profileId];
  const results: StationRunResult[] = [];
  for (let r = 0; r < runs; r++) results.push(runOne(station, weaponLevel, equipment, profile, seedBase + r));
  const accs = results.map((x) => x.accuracy).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const j = results.reduce((a, x) => ({
    perfect: a.perfect + x.judgments.perfect,
    good: a.good + x.judgments.good,
    miss: a.miss + x.judgments.miss,
  }), { perfect: 0, good: 0, miss: 0 });
  const jTotal = Math.max(1, j.perfect + j.good + j.miss);
  return {
    station, profile: profileId, tier: equipTier[station] ?? equipTier.hammer ?? 1, weaponLevel,
    runs,
    accMean: mean(accs), accMedian: quantile(accs, 0.5), accP25: quantile(accs, 0.25),
    accP75: quantile(accs, 0.75), accMin: accs[0] ?? 0, accMax: accs[accs.length - 1] ?? 0,
    perfectFrac: j.perfect / jTotal, goodFrac: j.good / jTotal, missFrac: j.miss / jTotal,
    timeoutFrac: results.reduce((a, x) => a + x.timeouts, 0) / jTotal,
    brittleRate: results.filter((x) => x.brittle).length / runs,
    fitMissMean: mean(results.map((x) => x.fitMisses)),
    fitForcedMean: mean(results.map((x) => x.fitForced)),
    bindPerfectFrac: bindFraction(results, 'perfect'), bindGoodFrac: bindFraction(results, 'good'), bindMissFrac: bindFraction(results, 'miss'),
    precisionMean: (station === 'furnace' || station === 'grindstone') ? mean(results.map((x) => x.precisionFrac ?? 0)) : null,
    inBandMean: station === 'furnace' ? mean(results.map((x) => x.inBandFrac ?? 0)) : null,
    inZoneMean: station === 'grindstone' ? mean(results.map((x) => x.inZoneFrac ?? 0)) : null,
    overheatMean: station === 'furnace' ? mean(results.map((x) => x.overheatSec ?? 0)) : null,
  };
}

// Full-forge propagation: run the canonical edge sequence and push the combined
// quality through the real level-up evaluation and stat pipeline.
export interface ForgeRunResult {
  quality: number;
  grade: QualityGrade;
  levelChance: number;
  canDoubleJump: boolean;
  stepAccuracies: number[];
  deltas: { power: number; edge: number; balance: number; durability: number; arcane: number };
}

export function runForge(
  profileId: ProfileId,
  tier: number,
  weaponLevel: number,
  runs: number,
  seedBase: number,
  smithLevel = 1,
): ForgeRunResult[] {
  const profile = SKILL_PROFILES[profileId];
  const equipment = {
    furnace: tier, hammer: tier, anvil: tier,
    grindstone: tier, quench: tier, workbench: tier,
  } as Record<EquipmentId, number>;
  const steps = getStepsForRequest('edge', 'blade');
  const out: ForgeRunResult[] = [];
  for (let r = 0; r < runs; r++) {
    const accs: number[] = [];
    steps.forEach((st, i) => {
      accs.push(runOne(st, weaponLevel, equipment, profile, seedBase + r * 7919 + i * 104729, smithLevel).accuracy);
    });
    const quality = accs.reduce((a, b) => a + b, 0) / accs.length;
    const stage = getStageMinRarity(weaponLevel);
    const stacks: MaterialStackSelection[] = [{ materialId: `human_${stage}`, units: 5 }];
    const evaluation = evaluateLevelUp(weaponLevel, 'sword', quality, stacks);
    const weapon: WeaponInstance = {
      type: 'sword', level: weaponLevel, parts: {}, legendaryNotifiedLevels: [],
      uid: 'bench', stats: { ...WEAPONS.sword.baseStats },
    };
    const { deltas } = applyForgeUpgradesToWeapon(
      weapon, 'blade', quality, stacks, equipment, Math.min(20, weaponLevel + 1), 'edge',
    );
    out.push({
      quality,
      grade: getQualityGrade(quality),
      levelChance: evaluation.chance,
      canDoubleJump: evaluation.canDoubleJump,
      stepAccuracies: accs,
      deltas,
    });
  }
  return out;
}

export function summarizeForges(runs: ForgeRunResult[]): {
  runs: number; qMean: number; qMedian: number; qP25: number; qP75: number;
  gradeDist: Record<QualityGrade, number>;
  levelChanceMean: number; doubleJumpRate: number; powerDeltaMean: number;
} {
  const qs = runs.map((r) => r.quality).sort((a, b) => a - b);
  const gradeDist = { S: 0, A: 0, B: 0, C: 0, D: 0 } as Record<QualityGrade, number>;
  for (const r of runs) gradeDist[r.grade]++;
  const n = Math.max(1, runs.length);
  (Object.keys(gradeDist) as QualityGrade[]).forEach((g) => { gradeDist[g] /= n; });
  return {
    runs: runs.length,
    qMean: qs.reduce((a, b) => a + b, 0) / n,
    qMedian: quantile(qs, 0.5),
    qP25: quantile(qs, 0.25),
    qP75: quantile(qs, 0.75),
    gradeDist,
    levelChanceMean: runs.reduce((a, r) => a + r.levelChance, 0) / n,
    doubleJumpRate: runs.filter((r) => r.canDoubleJump).length / n,
    powerDeltaMean: runs.reduce((a, r) => a + r.deltas.power, 0) / n,
  };
}
