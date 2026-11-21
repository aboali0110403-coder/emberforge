import type { QualityGrade } from '../types';

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - (1 - u) * (1 - u) * (1 - u);
}

export function easeInOutQuad(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

export function easeOutBack(t: number): number {
  const u = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

export interface WalkPoseState {
  isWalking: boolean;
  facing: 1 | -1;
  strideBob: number;
  strideTilt: number;
}

/**
 * Computes workshop character walk state, facing direction, and stride bounce.
 * Uses a 2.5px arrival deadzone to prevent jitter when standing at a station.
 */
export function computeWalkPose(
  activeX: number,
  targetX: number,
  lastFacing: 1 | -1,
  time: number,
): WalkPoseState {
  const dx = targetX - activeX;
  const isWalking = Math.abs(dx) > 2.5;
  const facing: 1 | -1 = isWalking ? (dx >= 0 ? 1 : -1) : lastFacing;
  if (!isWalking) {
    return {
      isWalking: false,
      facing,
      strideBob: Math.round(Math.sin(time * 3.2) * 0.8),
      strideTilt: 0,
    };
  }
  const cycle = Math.sin(time * 18);
  return {
    isWalking: true,
    facing,
    strideBob: -Math.abs(Math.round(cycle * 2.5)),
    strideTilt: cycle * 0.055,
  };
}

export type WeaponHeatBucket = 'cold' | 'warm' | 'hot' | 'overheat' | 'quenched';

export interface HeatVisualSpec {
  bucket: WeaponHeatBucket;
  glowColor: string;
  glowAlpha: number;
  coreColor: string;
}

export function getWeaponHeatSpec(heat: number, quenched = false): HeatVisualSpec {
  if (quenched) {
    return {
      bucket: 'quenched',
      glowColor: '#7dd3fc',
      glowAlpha: 0.36,
      coreColor: '#bae6fd',
    };
  }
  const h = clamp01(heat);
  if (h >= 0.87) {
    return {
      bucket: 'overheat',
      glowColor: '#fffbeb',
      glowAlpha: 0.72,
      coreColor: '#fef08a',
    };
  }
  if (h >= 0.45) {
    return {
      bucket: 'hot',
      glowColor: '#f97316',
      glowAlpha: 0.48,
      coreColor: '#fb923c',
    };
  }
  if (h >= 0.22) {
    return {
      bucket: 'warm',
      glowColor: '#dc2626',
      glowAlpha: 0.28,
      coreColor: '#ef4444',
    };
  }
  return {
    bucket: 'cold',
    glowColor: '#94a3b8',
    glowAlpha: 0,
    coreColor: '#94a3b8',
  };
}

export interface BattleTimelineState {
  phase: 'approach' | 'windup' | 'strike' | 'counter' | 'resolve';
  heroX: number;
  heroWalkPhase: number;
  enemyX: number;
  enemyShakeX: number;
  heroShakeX: number;
  windupRatio: number; // 0..1
  attackRatio: number; // 0..1
  heroImpactFlash: boolean;
  enemyImpactFlash: boolean;
  heroHpPct: number; // 0..1
  enemyHpPct: number; // 0..1
  enemyTopple: number; // 0..1
  heroKneel: number; // 0..1
  damagePopupAlpha: number;
  damagePopupYOffset: number;
  bannerAlpha: number;
}

/**
 * Deterministic 3.1-second battle choreography timeline for renderBattleFrame.
 */
export function computeBattleTimeline(
  t: number,
  won: boolean,
  qualityGrade: QualityGrade = 'B',
): BattleTimelineState {
  const safeT = Math.max(0, t);
  const gradeMult =
    qualityGrade === 'S'
      ? 1.0
      : qualityGrade === 'A'
        ? 0.94
        : qualityGrade === 'B'
          ? 0.86
          : qualityGrade === 'C'
            ? 0.76
            : 0.58;

  // Approach: 0..0.72s
  const approachRatio = easeOutCubic(safeT / 0.72);
  const baseHeroX = lerp(84, 142, approachRatio);

  // Windup: 0.72..1.05s
  const windupRatio = clamp01((safeT - 0.72) / 0.33);

  // Hero strike / projectile: 1.05..1.62s
  const attackRatio = clamp01((safeT - 1.05) / 0.57);
  const enemyImpactWindow = safeT >= 1.28 && safeT <= 1.56;
  const enemyImpactProgress = clamp01((safeT - 1.28) / 0.38);

  // Enemy counter if lost (or weak graze if close win): 1.62..2.18s
  const counterRatio = clamp01((safeT - 1.62) / 0.52);
  const heroImpactWindow = !won && safeT >= 1.78 && safeT <= 2.08;
  const heroImpactProgress = clamp01((safeT - 1.78) / 0.42);

  // Compute lunges & knockbacks
  const heroLunge =
    attackRatio > 0 && attackRatio < 0.85
      ? Math.sin(clamp01(attackRatio / 0.85) * Math.PI) * 26
      : 0;
  const heroCounterRecoil = !won ? -Math.sin(heroImpactProgress * Math.PI) * 14 : 0;

  const enemyLunge =
    !won && counterRatio > 0 && counterRatio < 0.9
      ? -Math.sin(clamp01(counterRatio / 0.9) * Math.PI) * 34
      : 0;
  const enemyKnockback =
    Math.sin(enemyImpactProgress * Math.PI) * (won ? 20 : 10 * gradeMult);

  const heroX = baseHeroX + heroLunge + heroCounterRecoil;
  const enemyX = 324 + enemyLunge + enemyKnockback;

  // HP bars drain cleanly across impact windows
  const enemyFinalHp = won ? 0 : Math.max(0.18, 0.55 - gradeMult * 0.32);
  const enemyHpPct =
    safeT < 1.28
      ? 1
      : lerp(1, enemyFinalHp, easeOutCubic(enemyImpactProgress));

  const heroFinalHp = won ? Math.max(0.55, 0.55 + gradeMult * 0.35) : 0;
  const heroHpPct = won
    ? safeT < 1.75
      ? 1
      : lerp(1, heroFinalHp, clamp01((safeT - 1.75) / 0.3))
    : safeT < 1.78
      ? 1
      : lerp(1, 0, easeOutCubic(heroImpactProgress));

  const enemyTopple = won && safeT > 1.58 ? easeOutCubic((safeT - 1.58) / 0.42) : 0;
  const heroKneel = !won && safeT > 2.05 ? easeOutCubic((safeT - 2.05) / 0.42) : 0;

  const phase: BattleTimelineState['phase'] =
    safeT < 0.72
      ? 'approach'
      : safeT < 1.05
        ? 'windup'
        : safeT < 1.62
          ? 'strike'
          : safeT < 2.2
            ? 'counter'
            : 'resolve';

  const damagePopupProgress = clamp01((safeT - 1.28) / 0.72);
  const damagePopupAlpha =
    safeT >= 1.28 && safeT <= 2.05 ? Math.sin(clamp01(damagePopupProgress) * Math.PI) : 0;

  return {
    phase,
    heroX,
    heroWalkPhase: safeT < 0.72 ? safeT * 15 : 0,
    enemyX,
    enemyShakeX: enemyImpactWindow ? Math.sin(safeT * 75) * 4 : 0,
    heroShakeX: heroImpactWindow ? Math.sin(safeT * 75) * 4 : 0,
    windupRatio,
    attackRatio,
    heroImpactFlash: heroImpactWindow,
    enemyImpactFlash: enemyImpactWindow,
    heroHpPct,
    enemyHpPct,
    enemyTopple,
    heroKneel,
    damagePopupAlpha,
    damagePopupYOffset: damagePopupProgress * 22,
    bannerAlpha: safeT > 2.05 ? easeOutCubic((safeT - 2.05) / 0.3) : 0,
  };
}
