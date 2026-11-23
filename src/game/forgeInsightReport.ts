import type { StationId } from '../types';
import type { MinigameRuntime } from '../canvas/minigames';

// V3-1 Forge Insight: per-step performance reports assembled only from data the
// minigame runtime already stores at the finish boundary. Reports are ephemeral
// (session/receipt plumbing only): nothing here is persisted, and no judgment is
// invented for continuous stations. Entries flagged `derived` are computed from
// observed counters and must be labeled as derived wherever they are shown.

export interface ForgeInsightEntry {
  key: string;
  // The raw recorded or computed value. Numeric measurements stay numeric
  // here: no toFixed/percent/join formatting is applied when the report is
  // built. Display formatting happens only in the receipt presentation layer.
  value: number | string | number[] | string[];
  derived: boolean; // true = computed from observed counters, not directly recorded
}

export interface ForgeInsightReport {
  station: StationId;
  accuracy: number; // observed: the exact finish-payload accuracy
  bestStreak: number; // observed: the exact finish-payload bestStreak
  entries: ForgeInsightEntry[];
}

const observed = (
  key: string,
  value: ForgeInsightEntry['value'],
): ForgeInsightEntry => ({
  key,
  value,
  derived: false,
});
const derived = (
  key: string,
  value: ForgeInsightEntry['value'],
): ForgeInsightEntry => ({
  key,
  value,
  derived: true,
});

// Score-to-label mapping mirrors the station scoring branches exactly; the
// ranges are disjoint (perfect 1.0-1.04, good 0.76, miss <= 0.50, expiry 0.25),
// so a label derived from a stored score is unambiguous. It is still a derived
// measurement and is labeled as such.
export function anvilStrikeJudgment(score: number): 'perfect' | 'good' | 'miss' {
  if (score >= 1) return 'perfect';
  if (score >= 0.76) return 'good';
  return 'miss';
}

export function bindBeatJudgment(score: number): 'perfect' | 'good' | 'miss' {
  if (score >= 1) return 'perfect';
  if (score >= 0.76) return 'good';
  return 'miss';
}

// Raw judgment tokens and numeric tallies are stored; label names and joining
// exist only in the receipt presentation layer.
function judgmentTally(judgments: ('perfect' | 'good' | 'miss')[]): number[] {
  const count = (kind: 'perfect' | 'good' | 'miss') =>
    judgments.filter((x) => x === kind).length;
  return [count('perfect'), count('good'), count('miss')];
}

function buildFurnaceInsight(rt: MinigameRuntime): ForgeInsightReport {
  const elapsed = Math.max(0.1, rt.elapsed);
  const bandShare = rt.inBandTime / elapsed;
  const scorchPenalty = Math.min(0.18, rt.overheatSec * 0.045);
  return {
    station: 'furnace',
    accuracy: rt.accuracy,
    bestStreak: rt.bestStreak,
    entries: [
      observed('elapsed', rt.elapsed),
      observed('inBand', rt.inBandTime),
      observed('overheat', rt.overheatSec),
      derived('bandShare', bandShare),
      derived('scorch', scorchPenalty),
    ],
  };
}

function buildAnvilInsight(rt: MinigameRuntime): ForgeInsightReport {
  const judgments = rt.strikeScores.map(anvilStrikeJudgment);
  return {
    station: 'anvil',
    accuracy: rt.accuracy,
    bestStreak: rt.bestStreak,
    entries: [
      observed('strikes', [rt.strikesDone, rt.strikesTotal]),
      observed('strikeScores', [...rt.strikeScores]),
      derived('strikeJudgments', [...judgments]),
      derived('judgmentTally', judgmentTally(judgments)),
    ],
  };
}

function buildGrindstoneInsight(rt: MinigameRuntime): ForgeInsightReport {
  const elapsed = Math.max(0.1, rt.elapsed);
  const zoneShare = rt.grindInZoneTime / elapsed;
  return {
    station: 'grindstone',
    accuracy: rt.accuracy,
    bestStreak: rt.bestStreak,
    entries: [
      observed('elapsed', rt.elapsed),
      observed('inZone', rt.grindInZoneTime),
      derived('zoneShare', zoneShare),
    ],
  };
}

function buildWorkbenchInsight(rt: MinigameRuntime): ForgeInsightReport {
  const judgments = rt.bindScores.map(bindBeatJudgment);
  const fitPenalty = Math.min(0.16, rt.fitMisses * 0.04);
  return {
    station: 'workbench',
    accuracy: rt.accuracy,
    bestStreak: rt.bestStreak,
    entries: [
      // One entry per actual fit attempt, exactly as the runtime decided it
      // (successful fit or recorded miss). Nothing is inferred from the
      // aggregate fitMisses counter, which is preserved alongside.
      observed('fitResults', [...rt.fitResults]),
      observed('fitMisses', rt.fitMisses),
      observed('binds', [rt.bindBeatsDone, rt.bindBeatsTotal]),
      observed('bindScores', [...rt.bindScores]),
      derived('bindJudgments', [...judgments]),
      derived('fitPenalty', fitPenalty),
    ],
  };
}

export type QuenchJudgment = 'perfect' | 'good' | 'miss' | 'brittle';

// Re-derives the release tier from stored state with the same conditions as
// releaseQuench. Used only as a fallback; the emission path passes the actual
// branch judgment, which is observed.
function quenchJudgmentFromState(rt: MinigameRuntime): QuenchJudgment {
  if (rt.temp <= 0.04) return 'brittle';
  const mid = (rt.targetTempMin + rt.targetTempMax) / 2;
  const half = (rt.targetTempMax - rt.targetTempMin) / 2;
  const dist = Math.abs(rt.temp - mid);
  if (dist <= half * 0.42) return 'perfect';
  if (dist <= half * 1.15) return 'good';
  return 'miss';
}

export function buildQuenchInsight(
  rt: MinigameRuntime,
  judgment: QuenchJudgment,
  judgmentDerived = false,
): ForgeInsightReport {
  return {
    station: 'quench',
    accuracy: rt.accuracy,
    bestStreak: rt.bestStreak,
    entries: [
      // The release judgment token is stored raw; the receipt maps it to the
      // display label. Observed on the emission path (actual branch), derived
      // on the generic fallback path.
      { key: 'judgment', value: judgment, derived: judgmentDerived },
      observed('releaseTemp', rt.temp),
      observed('window', [rt.targetTempMin, rt.targetTempMax]),
    ],
  };
}

// Builds the report for every station whose finish flows through
// finishMinigame. Quench finishes through releaseQuench with its actual branch
// judgment; the quench arm here is a derived-label fallback only.
export function buildStationInsight(rt: MinigameRuntime): ForgeInsightReport {
  switch (rt.station) {
    case 'furnace':
      return buildFurnaceInsight(rt);
    case 'anvil':
      return buildAnvilInsight(rt);
    case 'grindstone':
      return buildGrindstoneInsight(rt);
    case 'workbench':
      return buildWorkbenchInsight(rt);
    default:
      return buildQuenchInsight(rt, quenchJudgmentFromState(rt), true);
  }
}
