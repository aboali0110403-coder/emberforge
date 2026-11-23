import { getWorldCycle, WORLD_CYCLE } from './worldCycle';

// Presentation projections only. Never advance or persist either authoritative timer.
export function formatHudDuration(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function deriveWorldClock(activePlaySec: number) {
  const cycle = getWorldCycle(activePlaySec);
  const night = cycle.phase === 'night';
  const elapsed = night ? cycle.cyclePosition - WORLD_CYCLE.dayDurationSec : cycle.cyclePosition;
  const duration = night ? WORLD_CYCLE.nightDurationSec : WORLD_CYCLE.dayDurationSec;
  return { ...cycle, elapsed, duration, remaining: duration - elapsed, nextPhase: night ? 'Day' : 'Night' };
}

export function derivePatience(remainingSec: number, deadlineSec: number) {
  const ratio = Math.max(0, Math.min(1, remainingSec / Math.max(1, deadlineSec)));
  const urgency = ratio <= 0.15 ? 'Imminent' : ratio <= 0.35 ? 'Warning' : 'Calm';
  return { ratio, percent: ratio * 100, urgency, remaining: formatHudDuration(remainingSec) };
}
