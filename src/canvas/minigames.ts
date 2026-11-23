import { drawStationLayers } from '../gfx/stationLayers';
import { ANVIL_IMPACT_AT, ANVIL_SWING_SECONDS, drawAnvilHammer, drawAnvilLayers } from '../gfx/anvilLayers';
import { soundEngine } from '../audio/soundEngine';
import { BALANCE } from '../data/balance';
import { getEquipmentSheetSprite, getForgeUiSprite, getVfxSprite } from '../gfx/assetSheets';
import { getWorkshopBgAsset } from '../gfx/generatedAssets';
import {
  drawProcessFrame,
  getProcessFrame,
  isProcessStation,
  pickProcessFrameIndex,
} from '../gfx/processFrames';
import { ParticlePool } from '../gfx/particles';
import {
  getHeatedWeaponCanvas,
  getMaterialIconCanvas,
  getPlayerSpriteCanvas,
  getWeaponSpriteCanvas,
} from '../gfx/sprites';
import type {
  EquipmentId,
  MaterialStackSelection,
  PlayerCustomization,
  StationId,
  WeaponInstance,
  WeaponTypeId,
} from '../types';
import {
  buildQuenchInsight,
  buildStationInsight,
  type ForgeInsightReport,
  type QuenchJudgment,
} from '../game/forgeInsightReport';
import { easeOutCubic, getWeaponHeatSpec } from './animation';

// S2: single source of truth for the discrete-station PERFECT tolerances.
// Scoring and the rendered indicators both use these so the UI cannot
// misrepresent the mechanic.
export const ANVIL_PERFECT_WINDOW = 0.008;
export const QUENCH_PERFECT_TOL = 0.005;
export const BIND_PERFECT_WINDOW = 0.018;
// Pointer repositioning on the grindstone moves at a capped speed instead of
// teleporting, so the mouse cannot bypass the tracking skill.
export const GRIND_POINTER_SPEED = 1.2;
// Fixed center precision earns the final 20% of continuous-station accuracy.
// Upgrades widen the outer comfort zone only.
export const CONTINUOUS_PRECISE_WIDTH = 0.04;
export function quenchGoodTolerance(rt: Pick<MinigameRuntime, 'targetTempMin' | 'targetTempMax' | 'quenchTier' | 'smithLevel'>): number {
  const half = (rt.targetTempMax - rt.targetTempMin) / 2;
  return half * (1.15 + (rt.quenchTier - 1) * 0.1) + Math.max(0, Math.min(19, rt.smithLevel - 1)) * 0.004;
}

export interface MinigameFinishPayload {
  accuracy: number; // 0..1
  bestStreak: number;
  // V3-1: optional per-step performance report assembled from the runtime's
  // stored counters at the existing emission sites. GameCanvas forwards the
  // payload object unchanged, so no canvas change is needed.
  insight?: ForgeInsightReport;
}

export interface JudgmentPopup {
  kind: 'perfect' | 'good' | 'miss';
  x: number;
  y: number;
  timer: number;
}

export interface MinigameRuntime {
  station: StationId;
  elapsed: number;
  duration: number;
  finished: boolean;
  accuracy: number;
  streak: number;
  bestStreak: number;
  popup: JudgmentPopup | null;
  statusBanner: { text: string; color: string } | null;
  // Furnace state
  heat: number; // 0..1
  heatVel: number;
  bandCenter: number;
  bandWidth: number;
  inBandTime: number; furnacePreciseTime: number;
  overheatSec: number;
  overheatWarnTimer: number;
  bellowsPumpAnim: number;
  // Anvil state
  strikesDone: number;
  strikesTotal: number;
  targetX: number;
  targetY: number;
  ringProgress: number; // 0 -> 1.25
  ringSpeed: number;
  strikeScores: number[];
  hammerStrikeAnim: number;
  anvilStrikeX: number;
  anvilStrikeY: number;
  anvilStrikeQuality: 'perfect' | 'good' | 'miss';
  anvilImpactEmitted: boolean;
  anvilTargetSpan: number;
  // Grindstone state
  cursorX: number; // 0..1
  cursorTarget: number; // pointer-aimed position the cursor moves toward
  zoneCenter: number;
  zoneWidth: number;
  zoneDir: number;
  grindInZoneTime: number; grindPreciseTime: number;
  pointerDown: boolean;
  // Quench state
  temp: number; // 1.0 -> 0.0
  submerged: boolean;
  targetTempMin: number;
  targetTempMax: number;
  quenchDone: boolean;
  quenchPlunge: number; // 0..1 smooth dip animation
  // Workbench state
  wbPhase: 'fit' | 'bind';
  slots: { x: number; y: number; fitted: boolean; label: string }[];
  fitMisses: number;
  // V3-1: one recorded outcome per actual fit attempt, captured where the
  // runtime decides success (slot fitted) or failure (fitMisses increment).
  fitResults: ('good' | 'miss')[];
  bindBeatsDone: number;
  bindBeatsTotal: number;
  bindPulse: number; // 0..1
  bindScores: number[];
  bindFlashAnim: number;
  // S2: context recorded on the runtime so scoring functions stay honest.
  smithLevel: number;
  diffScale: number;
  quenchTier: number;
}

export function createMinigameRuntime(
  station: StationId,
  weaponLevel: number,
  equipment: Record<EquipmentId, number>,
  weaponType: WeaponTypeId = 'sword',
  smithLevel = 1,
): MinigameRuntime {
  const diffScale = Math.min(1, (weaponLevel - 1) / 18);
  // S2: Smith level grants technique — a small, level-scaled widening of the
  // GOOD tolerance bands only. It never widens PERFECT windows: mastery stays
  // an execution outcome, progression makes GOOD more reliable.
  const smithGoodAssist = Math.max(0, Math.min(19, smithLevel - 1)) * 0.004;
  const smithBandAssist = Math.max(0, Math.min(19, smithLevel - 1)) * 0.0015;
  const fTier = equipment.furnace;
  const hTier = equipment.hammer;
  const gTier = equipment.grindstone;
  const qTier = equipment.quench;


  const rt: MinigameRuntime = {
    station,
    elapsed: 0,
    duration:
      station === 'furnace'
        ? BALANCE.furnaceDurationSec
        : station === 'grindstone'
          ? BALANCE.grindstoneDurationSec
          : station === 'quench'
            ? BALANCE.quenchDurationSec
            : 25,
    finished: false,
    accuracy: 1,
    streak: 0,
    bestStreak: 0,
    popup: null,
    statusBanner: null,
    // Furnace
    heat: 0.45,
    heatVel: 0,
    bandCenter: 0.56,
    // S2: deeper level scaling; equipment gives a small width bonus plus the
    // stability effect below (comfort), not a trivially wide band.
    bandWidth: 0.24 - diffScale * 0.075 + (fTier - 1) * 0.015 + smithBandAssist,
    inBandTime: 0, furnacePreciseTime: 0,
    overheatSec: 0,
    overheatWarnTimer: 0,
    bellowsPumpAnim: 0,
    // Anvil
    strikesDone: 0,
    strikesTotal: 8 + Math.min(4, Math.floor(weaponLevel / 5)),
    targetX: 240,
    targetY: 146,
    ringProgress: 0,
    ringSpeed: 0.62 + diffScale * 0.30 - (hTier - 1) * 0.04,
    strikeScores: [],
    hammerStrikeAnim: 0,
    anvilStrikeX: 240,
    anvilStrikeY: 144,
    anvilStrikeQuality: 'miss',
    anvilImpactEmitted: false,
    anvilTargetSpan: { sword: 110, dagger: 72, shield: 28, longbow: 94, staff: 100,
      spear: 100, cleaver: 44, axe: 26, scythe: 68, trident: 70 }[weaponType],
    // Grindstone
    cursorX: 0.5,
    cursorTarget: 0.5,
    zoneCenter: 0.5,
    zoneWidth: 0.28 - diffScale * 0.075 + (gTier - 1) * 0.015 + smithBandAssist,
    zoneDir: 1,
    grindInZoneTime: 0, grindPreciseTime: 0,
    pointerDown: false,
    // Quench
    temp: 1.0,
    submerged: false,
    targetTempMin: 0.30 - (qTier - 1) * 0.025,
    targetTempMax: 0.48 + (qTier - 1) * 0.025,
    quenchDone: false,
    quenchPlunge: 0,
    // Workbench
    wbPhase: 'fit',
    slots: [
      { x: 185, y: 124, fitted: false, label: 'Core' },
      { x: 240, y: 152, fitted: false, label: 'Mount' },
      { x: 295, y: 124, fitted: false, label: 'Trim' },
    ],
    fitMisses: 0,
    fitResults: [],
    bindBeatsDone: 0,
    // S2: higher-level weapons demand more bind beats (level scaling, like the
    // anvil's strike count).
    bindBeatsTotal: 6 + Math.min(2, Math.floor(weaponLevel / 8)),
    bindPulse: 0,
    bindScores: [],
    bindFlashAnim: 0,
    smithLevel,
    diffScale,
    quenchTier: qTier,
  };

  if (station === 'anvil') {
    spawnNextAnvilSpot(rt);
  }
  return rt;
}

function spawnNextAnvilSpot(rt: MinigameRuntime): void {
  rt.targetX = 240 + (Math.random() - 0.5) * rt.anvilTargetSpan;
  // Keep every target on the blade's broad working edge.
  rt.targetY = 121 + Math.random() * 8;
  rt.ringProgress = 0;
}

export interface MinigameCallbacks {
  onHitStop: (sec: number) => void;
  onShake: (amount: number) => void;
  onStreak: (streak: number) => void;
  onFinish: (payload: MinigameFinishPayload) => void;
}

function triggerPopup(
  rt: MinigameRuntime,
  kind: 'perfect' | 'good' | 'miss',
  x: number,
  y: number,
): void {
  rt.popup = { kind, x, y, timer: 0.62 };
}

export function handleMinigamePointerDown(
  rt: MinigameRuntime,
  wx: number,
  wy: number,
  equipment: Record<EquipmentId, number>,
  particles: ParticlePool,
  cb: MinigameCallbacks,
  fromKeyboard = false,
): void {
  if (rt.finished) return;
  rt.pointerDown = true;

  if (rt.station === 'furnace') {
    soundEngine.playBellows();
    rt.heatVel += 0.22;
    rt.bellowsPumpAnim = 0.22;
  } else if (rt.station === 'anvil') {
    triggerAnvilStrike(rt, equipment, particles, cb);
  } else if (rt.station === 'grindstone') {
    rt.cursorTarget = Math.max(0.08, Math.min(0.92, (wx - 110) / 260));
  } else if (rt.station === 'quench') {
    if (!rt.submerged) {
      rt.submerged = true;
      soundEngine.playQuenchHiss();
      particles.burstSplash(186, 152, 14);
      particles.burstSteam(186, 154, 12);
      particles.spawnRing(186, 156, 26, '#7dd3fc');
    }
  } else if (rt.station === 'workbench') {
    if (rt.wbPhase === 'fit') {
      const snapRadius = 30 + (equipment.workbench - 1) * 5;
      let hitAny = false;
      if (fromKeyboard) {
        const nextSlot = rt.slots.find((s) => !s.fitted);
        if (nextSlot) {
          nextSlot.fitted = true;
          hitAny = true;
          rt.fitResults.push('good');
          soundEngine.playUiBlip(780);
          particles.burstSparks(nextSlot.x, nextSlot.y, 10, '#60a5fa');
          particles.spawnRing(nextSlot.x, nextSlot.y, 24, '#93c5fd');
          triggerPopup(rt, 'good', nextSlot.x, nextSlot.y - 24);
        }
      } else {
        for (const slot of rt.slots) {
          if (!slot.fitted && Math.hypot(wx - slot.x, wy - slot.y) <= snapRadius) {
            slot.fitted = true;
            hitAny = true;
            rt.fitResults.push('good');
            soundEngine.playUiBlip(780);
            particles.burstSparks(slot.x, slot.y, 10, '#60a5fa');
            particles.spawnRing(slot.x, slot.y, 24, '#93c5fd');
            triggerPopup(rt, 'good', slot.x, slot.y - 24);
            rt.statusBanner = null;
            break;
          }
        }
      }

      if (!hitAny) {
        rt.fitMisses += 1;
        rt.fitResults.push('miss');
        rt.streak = 0;
        cb.onStreak(0);
        soundEngine.playWarningTone();
        triggerPopup(rt, 'miss', Math.min(410, Math.max(70, wx)), Math.min(200, Math.max(75, wy)));
        rt.statusBanner = { text: 'CLICK DIRECTLY ON BLUEPRINT SLOT!', color: '#f87171' };
      }

      if (rt.slots.every((s) => s.fitted)) {
        rt.wbPhase = 'bind';
        rt.bindPulse = 0;
        rt.statusBanner = null;
        particles.spawnRing(240, 140, 38, '#fde047');
      }
    } else {
      triggerWorkbenchBind(rt, equipment, particles, cb);
    }
  }
}

export function handleMinigamePointerMove(rt: MinigameRuntime, wx: number): void {
  if (rt.finished) return;
  if (rt.station === 'grindstone') {
    // S2: pointer input sets a target; the cursor approaches it at a capped
    // speed in updateMinigame (no instant teleport bypass).
    rt.cursorTarget = Math.max(0.08, Math.min(0.92, (wx - 110) / 260));
  }
}

export function handleMinigamePointerUp(
  rt: MinigameRuntime,
  particles: ParticlePool,
  cb: MinigameCallbacks,
): void {
  rt.pointerDown = false;
  if (rt.finished) return;
  if (rt.station === 'quench' && rt.submerged && !rt.quenchDone) {
    releaseQuench(rt, particles, cb);
  }
}

function triggerAnvilStrike(
  rt: MinigameRuntime,
  equipment: Record<EquipmentId, number>,
  particles: ParticlePool,
  cb: MinigameCallbacks,
): void {
  if (rt.hammerStrikeAnim > 0 || rt.strikesDone >= rt.strikesTotal) return;
  rt.hammerStrikeAnim = ANVIL_SWING_SECONDS;
  rt.anvilStrikeX = rt.targetX;
  rt.anvilStrikeY = rt.targetY;
  rt.anvilImpactEmitted = false;
  const targetAt = 0.85;
  const dist = Math.abs(rt.ringProgress - targetAt);
  const hammerBonus = (equipment.hammer - 1) * 0.02;
  const anvilForgive = (equipment.anvil - 1) * 0.025;
  // S2: Smith level widens the GOOD band only.
  const smithGoodAssist = Math.max(0, Math.min(19, (rt.smithLevel ?? 1) - 1)) * 0.004;

  // S2: PERFECT window is fixed and measured separately from the GOOD band;
  // equipment and Smith level widen only the GOOD band (forgiveness), and the
  // miss score is a flat 0.30 (no unconditional tier floor).
  let score = 0.25;
  if (dist <= ANVIL_PERFECT_WINDOW) {
    rt.streak += 1;
    rt.bestStreak = Math.max(rt.bestStreak, rt.streak);
    const streakBonus = rt.streak >= 3 ? 0.04 : 0;
    score = Math.min(1.04, 1.0 + streakBonus);
    rt.anvilStrikeQuality = 'perfect';
    triggerPopup(rt, 'perfect', rt.targetX, rt.targetY - 26);
  } else if (dist <= 0.24 + hammerBonus + anvilForgive + smithGoodAssist) {
    score = 0.76;
    rt.streak = 0;
    rt.anvilStrikeQuality = 'good';
    triggerPopup(rt, 'good', rt.targetX, rt.targetY - 24);
  } else {
    score = 0.3;
    rt.streak = 0;
    rt.anvilStrikeQuality = 'miss';
    triggerPopup(rt, 'miss', rt.targetX, rt.targetY - 22);
  }

  cb.onStreak(rt.streak);
  rt.strikeScores.push(score);
  rt.strikesDone += 1;
  rt.accuracy = Math.min(
    1,
    rt.strikeScores.reduce((a, b) => a + b, 0) / rt.strikeScores.length,
  );

  // Advance the spot (or finish) after recovery, so the hammer and impact
  // stay on the point that was actually struck, including the last strike.
}

function triggerWorkbenchBind(
  rt: MinigameRuntime,
  equipment: Record<EquipmentId, number>,
  particles: ParticlePool,
  cb: MinigameCallbacks,
): void {
  const dist = Math.abs(rt.bindPulse - 0.8);
  const wBonus = (equipment.workbench - 1) * 0.025;
  // S2: Smith level widens the GOOD band only.
  const smithGoodAssist = Math.max(0, Math.min(19, (rt.smithLevel ?? 1) - 1)) * 0.004;
  let score = 0.4;
  if (dist <= BIND_PERFECT_WINDOW) {
    score = 1.0;
    rt.streak += 1;
    rt.bestStreak = Math.max(rt.bestStreak, rt.streak);
    rt.bindFlashAnim = 0.25;
    soundEngine.playHammer('perfect');
    particles.burstSparks(240, 145, 16, '#93c5fd');
    particles.spawnRing(240, 140, 36, '#fde047');
    triggerPopup(rt, 'perfect', 240, 108);
    cb.onHitStop(0.035);
    cb.onShake(3);
  } else if (dist <= 0.28 + wBonus + smithGoodAssist) {
    score = 0.76;
    rt.streak = 0;
    rt.bindFlashAnim = 0.15;
    soundEngine.playUiBlip(820);
    particles.spawnRing(240, 140, 26, '#60a5fa');
    triggerPopup(rt, 'good', 240, 108);
  } else {
    score = 0.38;
    rt.streak = 0;
    soundEngine.playWarningTone();
    triggerPopup(rt, 'miss', 240, 108);
  }

  cb.onStreak(rt.streak);
  rt.bindScores.push(score);
  rt.bindBeatsDone += 1;
  rt.bindPulse = 0;
  const fitPenalty = Math.min(0.16, rt.fitMisses * 0.04);
  rt.accuracy = Math.max(
    0.25,
    rt.bindScores.reduce((a, b) => a + b, 0) / rt.bindScores.length - fitPenalty,
  );

  if (rt.bindBeatsDone >= rt.bindBeatsTotal) {
    finishMinigame(rt, equipment, cb);
  }
}

function releaseQuench(
  rt: MinigameRuntime,
  particles: ParticlePool,
  cb: MinigameCallbacks,
): void {
  rt.quenchDone = true;
  let judgment: QuenchJudgment;
  const mid = (rt.targetTempMin + rt.targetTempMax) / 2;
  const dist = Math.abs(rt.temp - mid);

  if (rt.temp <= 0.04) {
    rt.accuracy = 0.32;
    judgment = 'brittle';
    rt.statusBanner = { text: 'BRITTLE OVER-COOL!', color: '#f87171' };
    soundEngine.playWarningTone();
    triggerPopup(rt, 'miss', 186, 108);
  } else if (dist <= QUENCH_PERFECT_TOL) {
    // S2: PERFECT temper window is fixed (about +/-0.011-0.015s of cooling); tier and
    // Smith level widen only the GOOD tolerance below.
    rt.accuracy = 1.0;
    judgment = 'perfect';
    rt.streak += 1;
    rt.bestStreak = Math.max(rt.bestStreak, rt.streak);
    rt.statusBanner = { text: 'MASTER TEMPER!', color: '#fde047' };
    soundEngine.playLevelUp();
    particles.burstSteam(186, 150, 24);
    particles.spawnRing(186, 148, 34, '#fde047');
    triggerPopup(rt, 'perfect', 186, 108);
  } else if (dist <= quenchGoodTolerance(rt)) {
    rt.accuracy = 0.83;
    judgment = 'good';
    soundEngine.playQuenchHiss();
    particles.burstSteam(186, 150, 14);
    triggerPopup(rt, 'good', 186, 108);
  } else {
    rt.accuracy = Math.max(0.34, 0.72 - dist);
    judgment = 'miss';
    soundEngine.playWarningTone();
    triggerPopup(rt, 'miss', 186, 108);
  }
  rt.finished = true;
  cb.onFinish({
    accuracy: rt.accuracy,
    bestStreak: rt.bestStreak,
    insight: buildQuenchInsight(rt, judgment),
  });
}

function finishMinigame(
  rt: MinigameRuntime,
  equipment: Record<EquipmentId, number>,
  cb: MinigameCallbacks,
): void {
  if (rt.finished) return;
  void equipment;
  // S2: the unconditional +2%/anvil-tier cross-station finish bonus is removed;
  // equipment forgiveness now lives only in the per-station GOOD bands.
  rt.accuracy = Math.min(1, Math.max(0.22, rt.accuracy));
  rt.finished = true;
  cb.onFinish({
    accuracy: rt.accuracy,
    bestStreak: rt.bestStreak,
    insight: buildStationInsight(rt),
  });
}

export function updateMinigame(
  rt: MinigameRuntime,
  dt: number,
  heldKeys: Set<string>,
  equipment: Record<EquipmentId, number>,
  particles: ParticlePool,
  cb: MinigameCallbacks,
): void {
  if (rt.finished) return;
  rt.elapsed += dt;
  if (rt.hammerStrikeAnim > 0) {
    rt.hammerStrikeAnim = Math.max(0, rt.hammerStrikeAnim - dt);
    if (rt.station === 'anvil') {
      const swingTime = ANVIL_SWING_SECONDS - rt.hammerStrikeAnim;
      if (!rt.anvilImpactEmitted && swingTime >= ANVIL_IMPACT_AT) {
        rt.anvilImpactEmitted = true;
        soundEngine.playHammer(rt.anvilStrikeQuality);
        cb.onShake(rt.anvilStrikeQuality === 'perfect' ? 4 : rt.anvilStrikeQuality === 'good' ? 2 : 1.5);
        if (rt.anvilStrikeQuality !== 'miss') {
          cb.onHitStop(rt.anvilStrikeQuality === 'perfect' ? 0.045 : 0.02);
          const perfect = rt.anvilStrikeQuality === 'perfect';
          const color = perfect ? '#fde047' : '#fb923c';
          particles.burstSparks(rt.anvilStrikeX, rt.anvilStrikeY, perfect ? 22 : 12, color);
          particles.spawnRing(rt.anvilStrikeX, rt.anvilStrikeY, perfect ? 28 : 20, color);
        }
      }
      if (rt.hammerStrikeAnim === 0) {
        if (rt.strikesDone >= rt.strikesTotal) finishMinigame(rt, equipment, cb);
        else spawnNextAnvilSpot(rt);
        return;
      }
    }
  }
  if (rt.bellowsPumpAnim > 0) {
    rt.bellowsPumpAnim = Math.max(0, rt.bellowsPumpAnim - dt);
  }
  if (rt.bindFlashAnim > 0) {
    rt.bindFlashAnim = Math.max(0, rt.bindFlashAnim - dt);
  }
  if (rt.overheatWarnTimer > 0) {
    rt.overheatWarnTimer = Math.max(0, rt.overheatWarnTimer - dt);
  }
  if (rt.popup) {
    rt.popup.timer -= dt;
    rt.popup.y -= dt * 14;
    if (rt.popup.timer <= 0) {
      rt.popup = null;
    }
  }

  const spaceHeld = heldKeys.has(' ') || heldKeys.has('Space');

  if (rt.station === 'furnace') {
    const pumping = rt.pointerDown || spaceHeld;
    if (pumping) rt.bellowsPumpAnim = 0.14;
    const furnaceStability = 1 - Math.min(0.24, (equipment.furnace - 1) * 0.06);
    if (pumping) {
      rt.heatVel += 0.95 * dt;
      if (Math.random() < 0.42) {
        particles.spawn(
          155 + Math.random() * 44,
          164,
          (Math.random() - 0.5) * 32,
          -36 - Math.random() * 28,
          0.45,
          2,
          Math.random() > 0.4 ? '#fde047' : '#fb923c',
          -20,
          'ember',
        );
      }
    } else {
      rt.heatVel -= 0.72 * furnaceStability * dt;
    }
    rt.heatVel *= 0.92;
    rt.heat = Math.max(0.05, Math.min(0.99, rt.heat + rt.heatVel * dt));
    rt.bandCenter = 0.54 + Math.sin(rt.elapsed * 0.75) * 0.14;
    const dist = Math.abs(rt.heat - rt.bandCenter);
    if (dist <= CONTINUOUS_PRECISE_WIDTH / 2) rt.furnacePreciseTime += dt;
    if (dist <= rt.bandWidth / 2) {
      rt.inBandTime += dt;
    }

    if (rt.heat > 0.87) {
      rt.overheatSec += dt;
      rt.statusBanner = { text: 'OVERHEAT! RELEASE BELLOWS!', color: '#f87171' };
      if (Math.random() < 0.45) {
        particles.burstSparks(170, 140, 2, '#ef4444');
      }
      if (rt.overheatWarnTimer <= 0) {
        soundEngine.playWarningTone();
        rt.overheatWarnTimer = 0.75;
      }
    } else if (rt.heat < 0.22) {
      rt.statusBanner = { text: 'COLD FORGE — PUMP BELLOWS!', color: '#93c5fd' };
    } else {
      rt.statusBanner = null;
    }

    const scorchPenalty = Math.min(0.18, rt.overheatSec * 0.045);
    rt.accuracy = Math.max(
      0.18,
      Math.min(1, 0.32 + (rt.inBandTime / Math.max(0.1, rt.elapsed)) * 0.48 + (rt.furnacePreciseTime / Math.max(0.1, rt.elapsed)) * 0.20 - scorchPenalty),
    );

    if (rt.elapsed >= rt.duration) {
      finishMinigame(rt, equipment, cb);
    }
  } else if (rt.station === 'anvil') {
    if (rt.hammerStrikeAnim > 0 || rt.finished) return;
    rt.ringProgress += rt.ringSpeed * dt;
    if (rt.ringProgress >= 1.16) {
      rt.streak = 0;
      cb.onStreak(0);
      soundEngine.playHammer('miss');
      triggerPopup(rt, 'miss', rt.targetX, rt.targetY - 20);
      rt.strikeScores.push(0.25);
      rt.strikesDone += 1;
      rt.accuracy =
        rt.strikeScores.reduce((a, b) => a + b, 0) / rt.strikeScores.length;
      if (rt.strikesDone >= rt.strikesTotal) {
        finishMinigame(rt, equipment, cb);
      } else {
        spawnNextAnvilSpot(rt);
      }
    }
  } else if (rt.station === 'grindstone') {
    if (heldKeys.has('ArrowLeft') || heldKeys.has('a') || heldKeys.has('A')) {
      rt.cursorX = Math.max(0.08, rt.cursorX - 0.58 * dt);
      rt.cursorTarget = rt.cursorX; // key input takes over the target
    }
    if (heldKeys.has('ArrowRight') || heldKeys.has('d') || heldKeys.has('D')) {
      rt.cursorX = Math.min(0.92, rt.cursorX + 0.58 * dt);
      rt.cursorTarget = rt.cursorX;
    }
    // S2: capped pointer tracking (no teleport bypass).
    if (rt.cursorTarget !== rt.cursorX) {
      const step = GRIND_POINTER_SPEED * dt;
      const dx = rt.cursorTarget - rt.cursorX;
      rt.cursorX = Math.abs(dx) <= step ? rt.cursorTarget : rt.cursorX + Math.sign(dx) * step;
    }

    rt.zoneCenter += rt.zoneDir * (0.24 + Math.sin(rt.elapsed) * 0.06) * dt;
    if (rt.zoneCenter > 0.82) {
      rt.zoneCenter = 0.82;
      rt.zoneDir = -1;
    } else if (rt.zoneCenter < 0.18) {
      rt.zoneCenter = 0.18;
      rt.zoneDir = 1;
    }

    const inZone = Math.abs(rt.cursorX - rt.zoneCenter) <= rt.zoneWidth / 2;
    if (inZone) {
      rt.grindInZoneTime += dt;
      rt.statusBanner = { text: 'KEEN EDGE HONING', color: '#4ade80' };
      // Tangential directional spark spray off spinning wheel
      if (Math.random() < 0.65) {
        const contactX = 228 + (rt.cursorX - 0.5) * 32;
        const contactY = 98;
        particles.spawn(
          contactX,
          contactY,
          55 + Math.random() * 85,
          -15 + Math.random() * 45,
          0.26 + Math.random() * 0.24,
          Math.random() > 0.45 ? 2 : 1,
          Math.random() > 0.35 ? '#fde047' : '#fffbeb',
          220,
          'spark',
        );
      }
      if (Math.random() < 0.16) {
        soundEngine.playGrindstone();
      }
    } else {
      rt.statusBanner = { text: 'ALIGN TO GREEN ZONE!', color: '#fbbf24' };
    }
    if (Math.abs(rt.cursorX - rt.zoneCenter) <= CONTINUOUS_PRECISE_WIDTH / 2) rt.grindPreciseTime += dt;
    rt.accuracy = Math.min(1, 0.30 + (rt.grindInZoneTime / Math.max(0.1, rt.elapsed)) * 0.50 + (rt.grindPreciseTime / Math.max(0.1, rt.elapsed)) * 0.20);

    if (rt.elapsed >= rt.duration) {
      finishMinigame(rt, equipment, cb);
    }
  } else if (rt.station === 'quench') {
    const holding = rt.pointerDown || spaceHeld;
    if (holding) {
      if (!rt.submerged) {
        rt.submerged = true;
        soundEngine.playQuenchHiss();
        particles.burstSplash(186, 152, 14);
        particles.spawnRing(186, 156, 26, '#7dd3fc');
      }
      rt.quenchPlunge = Math.min(1, rt.quenchPlunge + dt * 5.2);
      // S2: cooling rate scales with weapon level (quench had no level scaling).
      rt.temp = Math.max(0.02, rt.temp - (0.34 + ((rt.diffScale ?? 0) * 0.1)) * dt);
      if (Math.abs(rt.temp - (rt.targetTempMin + rt.targetTempMax) / 2) <= quenchGoodTolerance(rt)) {
        rt.statusBanner = { text: 'GOOD BAND: CENTER FOR PERFECT', color: '#4ade80' };
      } else if (rt.temp < rt.targetTempMin) {
        rt.statusBanner = { text: 'TOO COLD — RELEASE SOON!', color: '#f87171' };
      } else {
        rt.statusBanner = { text: 'COOLING STEEL...', color: '#93c5fd' };
      }
      if (Math.random() < 0.38) {
        particles.burstSteam(186, 154, 2);
      }
      if (rt.temp <= 0.03) {
        releaseQuench(rt, particles, cb);
      }
    } else if (rt.submerged && !rt.quenchDone) {
      releaseQuench(rt, particles, cb);
    }
    // S2: the configured quench duration is now enforced; holding too long
    // releases (and likely over-cools), never stalling the forge.
    if (!rt.quenchDone && rt.elapsed >= rt.duration) {
      releaseQuench(rt, particles, cb);
    }
  } else if (rt.station === 'workbench') {
    if (rt.wbPhase === 'bind') {
      // S2: bind pulse speed scales with weapon level (workbench had none).
      rt.bindPulse += (0.92 + ((rt.diffScale ?? 0) * 0.25)) * dt;
      if (rt.bindPulse >= 1.15) {
        rt.streak = 0;
        cb.onStreak(0);
        rt.bindScores.push(0.32);
        rt.bindBeatsDone += 1;
        rt.bindPulse = 0;
        soundEngine.playWarningTone();
        triggerPopup(rt, 'miss', 240, 108);
        const fitPenalty = Math.min(0.16, rt.fitMisses * 0.04);
        rt.accuracy = Math.max(
          0.25,
          rt.bindScores.reduce((a, b) => a + b, 0) / rt.bindScores.length - fitPenalty,
        );
        if (rt.bindBeatsDone >= rt.bindBeatsTotal) {
          finishMinigame(rt, equipment, cb);
        }
      }
    }
  }
}

export function renderMinigameScene(
  ctx: CanvasRenderingContext2D,
  rt: MinigameRuntime,
  player: PlayerCustomization,
  weapon: WeaponInstance,
  particles: ParticlePool,
  equipment?: Record<EquipmentId, number>,
  selectedMaterials: MaterialStackSelection[] = [],
): void {
  const eq = equipment ?? {
    furnace: 1,
    anvil: 1,
    hammer: 1,
    grindstone: 1,
    quench: 1,
    workbench: 1,
  };

  ctx.fillStyle = '#140d0a';
  ctx.fillRect(0, 0, 480, 270);

  // Subtle workshop depth behind station viewport
  const workshopBg = getWorkshopBgAsset();
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.drawImage(workshopBg, 0, 0, 480, 270);
  ctx.restore();

  // Tactile iron & brass workshop diorama frame
  ctx.fillStyle = 'rgba(24, 16, 12, 0.91)';
  ctx.fillRect(16, 44, 448, 188);
  ctx.strokeStyle = '#8c6239';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 44, 448, 188);
  ctx.strokeStyle = '#3b2416';
  ctx.lineWidth = 1;
  ctx.strokeRect(19, 47, 442, 182);
  // Corner brass rivets
  ctx.fillStyle = '#d97706';
  for (const [rx, ry] of [
    [20, 48],
    [456, 48],
    [20, 224],
    [456, 224],
  ]) {
    ctx.fillRect(rx, ry, 4, 4);
  }

  // Independent layered sprites are preferred; old scene art is only a fallback.
  const layeredScene = rt.station === 'anvil'
    ? drawAnvilLayers(ctx, rt, weapon)
    : drawStationLayers(ctx, rt, weapon);
  const processFrame = !layeredScene && rt.station !== 'anvil' && isProcessStation(rt.station)
    ? getProcessFrame(rt.station, pickProcessFrameIndex(rt.station, rt))
    : null;
  if (processFrame && isProcessStation(rt.station)) {
    drawProcessFrame(ctx, rt.station, processFrame);
  }

  // Animated Blacksmith Avatar using player sprite sheet (unlocks tend pose too!)
  let pAction: 'idle' | 'strike' | 'bellows' | 'tend' = 'idle';
  let pFrame = 0;
  if (rt.station === 'furnace') {
    pAction = 'bellows';
    pFrame = rt.pointerDown || rt.bellowsPumpAnim > 0 ? Math.floor(rt.elapsed * 9) % 3 : 0;
  } else if (rt.station === 'anvil' && rt.hammerStrikeAnim > 0) {
    pAction = 'strike';
    const progress = 1 - rt.hammerStrikeAnim / 0.24;
    pFrame = Math.min(3, Math.floor(progress * 4));
  } else if (rt.station === 'grindstone' || rt.station === 'quench' || rt.station === 'workbench') {
    pAction = 'tend';
    pFrame = Math.floor(rt.elapsed * 4) % 3;
  }
  if (!processFrame && !layeredScene) {
  const pSprite = getPlayerSpriteCanvas(player, rt.hammerStrikeAnim > 0, pAction, pFrame);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(60, 203, 22, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(pSprite, 24, 128, 72, 76);
  }

  const wSprite = getWeaponSpriteCanvas(weapon);

  if (rt.station === 'furnace') {
    const heatSpec = getWeaponHeatSpec(rt.heat);
    if (!processFrame && !layeredScene) {
    // Upgraded Furnace exterior silhouette behind active hearth throat
    const furnaceSprite = getEquipmentSheetSprite('furnace', eq.furnace, 128);
    if (furnaceSprite) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(furnaceSprite, 102, 68, 138, 144);
      ctx.restore();
    }

    // Masonry hearth chamber & coal firebox
    ctx.fillStyle = '#4a2e1b';
    ctx.fillRect(114, 82, 114, 124);
    ctx.strokeStyle = '#8c6239';
    ctx.lineWidth = 2;
    ctx.strokeRect(115, 83, 112, 122);
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(126, 98, 90, 92);

    // Hearth heat glow scaling with rt.heat
    const glow = Math.min(1, rt.heat + 0.15);
    const hearthGrad = ctx.createRadialGradient(171, 152, 8, 171, 152, 54);
    hearthGrad.addColorStop(
      0,
      rt.heat > 0.87 ? 'rgba(254, 240, 138, 0.95)' : `rgba(251, 146, 60, ${glow * 0.92})`,
    );
    hearthGrad.addColorStop(1, 'rgba(124, 45, 18, 0.25)');
    ctx.fillStyle = hearthGrad;
    ctx.fillRect(128, 104, 86, 82);

    // Animated Pleated Leather Bellows compressing on pump + iron air nozzle
    const squeeze = rt.bellowsPumpAnim > 0 ? Math.sin(rt.elapsed * 26) * 4 + 5 : 0;
    const bTopY = 170 + squeeze * 0.65;
    const bBotY = 197 - squeeze * 0.45;
    ctx.fillStyle = '#3b2010';
    ctx.beginPath();
    ctx.moveTo(92, bTopY);
    ctx.lineTo(122, 177);
    ctx.lineTo(122, 191);
    ctx.lineTo(92, bBotY);
    ctx.closePath();
    ctx.fill();
    // Pleated leather highlight bands
    ctx.fillStyle = '#6b3d22';
    ctx.fillRect(96, Math.round(bTopY + 3), 20, Math.max(4, Math.round(bBotY - bTopY - 6)));
    ctx.strokeStyle = '#24130a';
    ctx.lineWidth = 1;
    for (const rx of [101, 108, 115]) {
      ctx.beginPath();
      ctx.moveTo(rx, bTopY + 2);
      ctx.lineTo(rx, bBotY - 2);
      ctx.stroke();
    }
    // Iron nozzle & wooden board trim
    ctx.fillStyle = '#64748b';
    ctx.fillRect(120, 180, 7, 8);
    ctx.fillStyle = '#c48a54';
    ctx.fillRect(91, Math.round(bTopY) - 1, 30, 3);
    ctx.fillRect(91, Math.round(bBotY) - 2, 30, 3);

    // Glowing coal bed along hearth bottom
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(130, 176, 82, 10);
    ctx.fillStyle = `rgba(253, 186, 116, ${0.42 + glow * 0.55})`;
    for (let cx = 134; cx < 206; cx += 12) {
      ctx.fillRect(cx, 178, 8, 5);
    }

    // Layered hearth flames reacting to heat
    const fireIdx = Math.floor(rt.elapsed * 10) % 3;
    const fireSprite = getVfxSprite(`fire${fireIdx}` as 'fire0' | 'fire1' | 'fire2', 36, 44);
    if (fireSprite) {
      const fH = 34 + Math.round(rt.heat * 16);
      ctx.drawImage(fireSprite, 134, 178 - fH, 36, fH);
      ctx.drawImage(fireSprite, 172, 178 - fH, 36, fH);
    }

    // Heated weapon in coals shifting cold -> cherry -> orange -> blinding white-hot
    const heatedWeapon = getHeatedWeaponCanvas(weapon, heatSpec.bucket);
    if (heatSpec.glowAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = heatSpec.glowAlpha * 0.55;
      const wGlow = ctx.createRadialGradient(171, 143, 4, 171, 143, 34);
      wGlow.addColorStop(0, heatSpec.coreColor);
      wGlow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = wGlow;
      ctx.fillRect(136, 108, 70, 70);
      ctx.restore();
    }
    ctx.drawImage(heatedWeapon, 144, 116, 54, 54);
    }

    // Diegetic vertical thermometer + heat band gauge
    const thermSprite = getForgeUiSprite('thermometer', 34, 102);
    if (thermSprite) {
      ctx.drawImage(thermSprite, 242, 80, 34, 102);
    }

    const gx = 290;
    const gy = 88;
    const gw = 144;
    const gh = 26;
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#6b4931';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx - 0.5, gy - 0.5, gw + 1, gh + 1);

    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.fillRect(gx + 0.87 * gw, gy + 2, 0.13 * gw, gh - 4);

    const bandX = gx + (rt.bandCenter - rt.bandWidth / 2) * gw;
    const bandW = rt.bandWidth * gw;
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(bandX, gy + 2, bandW, gh - 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(bandX, gy + 2, bandW, 3);
    ctx.fillRect(bandX, gy + gh - 5, bandW, 3);

    ctx.fillStyle = 'rgba(253, 224, 71, 0.65)';
    ctx.fillRect(gx + (rt.bandCenter - CONTINUOUS_PRECISE_WIDTH / 2) * gw, gy + 2, CONTINUOUS_PRECISE_WIDTH * gw, gh - 4);
    const needleX = gx + rt.heat * gw;
    ctx.fillStyle = rt.heat > 0.87 ? '#f87171' : '#fffbeb';
    ctx.fillRect(needleX - 2, gy - 4, 4, gh + 8);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('CENTER STRIPE: PRECISION BONUS', 110, 228);
    const pct = Math.min(1, rt.elapsed / rt.duration);
    ctx.fillStyle = '#362d2b';
    ctx.fillRect(gx, 136, gw, 12);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(gx + 2, 138, (gw - 4) * pct, 8);

    ctx.fillStyle = '#f6e7cb';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.fillText('HOLD BELLOWS TO HEAT', gx, 174);
    ctx.fillStyle = heatSpec.coreColor;
    ctx.fillText(`FORGE TEMP: ${heatSpec.bucket.toUpperCase()}`, gx, 190);
  } else if (rt.station === 'anvil') {
    if (!layeredScene) {
    // Timber floor shadow & upgraded Anvil sprite
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(240, 200, 56, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const anvilSprite = getEquipmentSheetSprite('anvil', eq.anvil, 140);
    if (anvilSprite) {
      ctx.drawImage(anvilSprite, 170, 96, 140, 110);
    } else {
      ctx.fillStyle = '#3f4754';
      ctx.fillRect(128, 114, 232, 78);
      ctx.fillStyle = '#6c7787';
      ctx.fillRect(132, 118, 224, 70);
    }

    // Heated weapon cooling gradually across strikes
    const coolRatio = rt.strikesDone / Math.max(1, rt.strikesTotal);
    const anvilHeatBucket = coolRatio < 0.35 ? 'hot' : coolRatio < 0.75 ? 'warm' : 'cold';
    const forgedWeapon = getHeatedWeaponCanvas(weapon, anvilHeatBucket);
    const bounceY = rt.hammerStrikeAnim > 0.14 ? 2 : 0;
    ctx.drawImage(forgedWeapon, 209, 116 + bounceY, 64, 64);
    }

    // Target Ring UI Sprite + shrinking strike timing ring
    const targetRing = getForgeUiSprite('ringPerfect', 36, 36);
    if (targetRing) {
      ctx.drawImage(targetRing, rt.targetX - 18, rt.targetY - 18, 36, 36);
    } else {
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rt.targetX, rt.targetY, 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    const rCurrent = Math.max(4, (1.15 - rt.ringProgress) * 34);
    ctx.strokeStyle = Math.abs(rt.ringProgress - 0.85) <= ANVIL_PERFECT_WINDOW ? '#fde047' : '#fffbeb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rt.targetX, rt.targetY, rCurrent, 0, Math.PI * 2);
    ctx.stroke();

    if (layeredScene) drawAnvilHammer(ctx, rt);

    // Upgraded Hammer swinging arc on strike
    const hammerSprite = getEquipmentSheetSprite('hammer', eq.hammer, 64);
    if (hammerSprite && !layeredScene) {
      const swingT = rt.hammerStrikeAnim > 0 ? 1 - rt.hammerStrikeAnim / 0.24 : 0;
      const angle = rt.hammerStrikeAnim > 0 ? -0.95 + easeOutCubic(swingT) * 1.45 : -0.65;
      ctx.save();
      ctx.translate(rt.targetX + 26, rt.targetY - 26);
      ctx.rotate(angle);
      ctx.drawImage(hammerSprite, -30, -24, 46, 46);
      ctx.restore();
    }

    if (!layeredScene && rt.hammerStrikeAnim > 0.08) {
      const impact = getVfxSprite('impact', 52, 52);
      if (impact) {
        ctx.drawImage(impact, rt.targetX - 26, rt.targetY - 26, 52, 52);
      }
    }

    // Strike counter pips
    for (let s = 0; s < rt.strikesTotal; s++) {
      const pipX = 160 + s * 14;
      ctx.fillStyle = s < rt.strikesDone ? '#fde047' : s === rt.strikesDone ? '#fb923c' : '#362d2b';
      ctx.fillRect(pipX, 208, 10, 6);
    }
    ctx.fillStyle = '#f6e7cb';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.fillText(`STRIKE ${Math.min(rt.strikesDone + 1, rt.strikesTotal)}/${rt.strikesTotal}`, 342, 214);
  } else if (rt.station === 'grindstone') {
    if (!processFrame && !layeredScene) {
    const grindSprite = getEquipmentSheetSprite('grindstone', eq.grindstone, 112);
    if (grindSprite) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.drawImage(grindSprite, 112, 62, 92, 92);
      ctx.restore();
    }

    const wheelCx = 240;
    const wheelCy = 104;
    const wheelR = 38;
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(194, 122, 92, 16);
    ctx.fillStyle = '#3f2614';
    ctx.fillRect(202, 130, 14, 16);
    ctx.fillRect(264, 130, 14, 16);

    ctx.fillStyle = eq.grindstone >= 5 ? '#0369a1' : '#475569';
    ctx.beginPath();
    ctx.arc(wheelCx, wheelCy, wheelR + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eq.grindstone >= 5 ? '#7dd3fc' : '#94a3b8';
    ctx.beginPath();
    ctx.arc(wheelCx, wheelCy, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eq.grindstone >= 5 ? '#bae6fd' : '#cbd5e1';
    ctx.beginPath();
    ctx.arc(wheelCx - 4, wheelCy - 4, wheelR - 9, 0, Math.PI * 2);
    ctx.fill();

    // Rotating grit spokes
    const angle = rt.elapsed * 10;
    ctx.strokeStyle = eq.grindstone >= 5 ? '#38bdf8' : '#64748b';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const a = angle + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(wheelCx + Math.cos(a) * 12, wheelCy + Math.sin(a) * 12);
      ctx.lineTo(wheelCx + Math.cos(a) * (wheelR - 4), wheelCy + Math.sin(a) * (wheelR - 4));
      ctx.stroke();
    }
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(wheelCx, wheelCy, 9, 0, Math.PI * 2);
    ctx.fill();

    // Tilted weapon riding wheel edge + progressive keen polish gleam
    const tilt = (rt.cursorX - 0.5) * 0.45;
    ctx.save();
    ctx.translate(240 + (rt.cursorX - 0.5) * 28, 96);
    ctx.rotate(tilt);
    ctx.drawImage(wSprite, -28, -28, 56, 56);
    // Gleam highlight proportional to grindInZoneTime
    const gleamProg = Math.min(1, rt.grindInZoneTime / Math.max(1, rt.duration * 0.5));
    if (gleamProg > 0.15) {
      const sweep = ((rt.elapsed * 70) % 52) - 26;
      ctx.globalAlpha = 0.25 + gleamProg * 0.35;
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(sweep, -18, 4, 36);
    }
    ctx.restore();

    }

    const tx = 110;
    const ty = 158;
    const tw = 260;
    const th = 28;
    if (processFrame) {
      ctx.fillStyle = 'rgba(18, 12, 10, 0.72)';
      ctx.fillRect(tx - 6, ty - 8, tw + 12, 72);
    }
    const sliderImg = getForgeUiSprite('sliderGreen', tw, th);
    if (sliderImg) {
      ctx.drawImage(sliderImg, tx, ty, tw, th);
    } else {
      ctx.fillStyle = '#120c0a';
      ctx.fillRect(tx, ty, tw, th);
    }

    const zx = tx + (rt.zoneCenter - rt.zoneWidth / 2) * tw;
    const zw = rt.zoneWidth * tw;
    ctx.fillStyle = 'rgba(74, 222, 128, 0.44)';
    ctx.fillRect(zx, ty + 4, zw, th - 8);
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(zx, ty + 4, zw, th - 8);

    ctx.fillStyle = 'rgba(253, 224, 71, 0.5)';
    ctx.fillRect(tx + (rt.zoneCenter - CONTINUOUS_PRECISE_WIDTH / 2) * tw, ty + 4, CONTINUOUS_PRECISE_WIDTH * tw, th - 8);
    const cx = tx + rt.cursorX * tw;
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 3, ty - 4, 6, th + 8);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('CENTER STRIPE: PRECISION BONUS', 110, 228);
    const pct = Math.min(1, rt.elapsed / rt.duration);
    ctx.fillStyle = '#362d2b';
    ctx.fillRect(tx, 202, tw, 10);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(tx + 2, 204, (tw - 4) * pct, 6);
  } else if (rt.station === 'quench') {
    if (!processFrame && !layeredScene) {
    const quenchEq = getEquipmentSheetSprite('quench', eq.quench, 104);
    if (quenchEq) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(quenchEq, 102, 128, 78, 78);
      ctx.restore();
    }

    // Cutaway quenching tank
    ctx.fillStyle = '#4a2e1b';
    ctx.fillRect(156, 144, 168, 70);
    ctx.strokeStyle = '#8c6239';
    ctx.lineWidth = 2;
    ctx.strokeRect(157, 145, 166, 68);
    ctx.fillStyle = '#475569';
    ctx.fillRect(156, 160, 168, 5);
    ctx.fillRect(156, 196, 168, 5);

    ctx.fillStyle = '#0369a1';
    ctx.fillRect(164, 152, 152, 54);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(164, 152, 152, 22);

    // Smooth eased plunge + temperature-based weapon glow/temper transition
    const plungeEase = easeOutCubic(rt.quenchPlunge);
    const bladeY = Math.round(86 + plungeEase * 62);
    const quenchBucket =
      rt.temp > 0.68
        ? 'hot'
        : rt.temp > 0.50
          ? 'warm'
          : rt.temp <= rt.targetTempMax
            ? 'quenched'
            : 'cold';
    const bladeSprite = getHeatedWeaponCanvas(weapon, quenchBucket);
    ctx.drawImage(bladeSprite, 212, bladeY, 56, 56);

    // Animated water meniscus waves in front of submerged blade
    ctx.fillStyle = '#38bdf8';
    const waveShift = Math.round(Math.sin(rt.elapsed * (rt.submerged ? 11 : 5)) * 6);
    ctx.fillRect(172 + waveShift, 154, 48, 3);
    ctx.fillRect(244 - waveShift, 156, 42, 2);
    if (rt.submerged) {
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(202 - waveShift * 0.5, 152, 76, 2);
      const steam = getVfxSprite('steam', 48, 48);
      if (steam) {
        const lift = (rt.elapsed * 22) % 14;
        ctx.drawImage(steam, 216, 118 - lift, 48, 48);
      }
    }

    }

    const quenchArc = getForgeUiSprite('quenchArc', 44, 96);
    if (quenchArc) {
      ctx.drawImage(quenchArc, 324, 102, 44, 96);
    }

    const vx = 376;
    const vy = 76;
    const vh = 130;
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(vx, vy, 26, vh);
    ctx.strokeStyle = '#6b4931';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx - 0.5, vy - 0.5, 27, vh + 1);

    const temperMid = (rt.targetTempMin + rt.targetTempMax) / 2;
    const goodTolerance = quenchGoodTolerance(rt);
    const minY = vy + (1 - Math.min(1, temperMid + goodTolerance)) * vh;
    const maxY = vy + (1 - Math.max(0.04, temperMid - goodTolerance)) * vh;
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(vx + 2, minY, 22, maxY - minY);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(vx + 2, minY, 22, 2);
    ctx.fillRect(vx + 2, maxY - 2, 22, 2);
    // S2: the narrow PERFECT temper band is drawn so the target matches the
    // actual scoring tolerance (QUENCH_PERFECT_TOL around the window mid).
    {
      const midY = vy + (1 - (rt.targetTempMin + rt.targetTempMax) / 2) * vh;
      const ph = QUENCH_PERFECT_TOL * vh;
      ctx.fillStyle = '#fde047';
      ctx.fillRect(vx + 2, midY - ph, 22, ph * 2);
    }

    const fillY = vy + (1 - rt.temp) * vh;
    ctx.fillStyle = rt.temp > 0.5 ? '#ea580c' : '#bae6fd';
    ctx.fillRect(vx + 7, fillY, 12, vy + vh - fillY - 2);
    // Keep the exact narrow precision stripe visible over the temperature fill.
    ctx.fillStyle = '#fde047';
    ctx.fillRect(vx + 2, vy + (1 - temperMid - QUENCH_PERFECT_TOL) * vh, 22, QUENCH_PERFECT_TOL * vh * 2);

    ctx.fillStyle = '#f6e7cb';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.fillText(
      rt.submerged ? 'BLUE: GOOD / YELLOW: PERFECT' : 'HOLD TO SUBMERGE BLADE',
      processFrame || layeredScene ? 214 : 166,
      processFrame || layeredScene ? 214 : 78,
    );
  } else if (rt.station === 'workbench') {
    const wbEq = getEquipmentSheetSprite('workbench', eq.workbench, 120);
    if (wbEq) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(wbEq, 344, 98, 108, 108);
      ctx.restore();
    }

    // Parchment-trimmed cobalt drafting blueprint sheet
    ctx.fillStyle = '#7c4d25';
    ctx.fillRect(132, 72, 216, 132);
    ctx.fillStyle = '#172e6e';
    ctx.fillRect(136, 76, 208, 124);
    // Blueprint grid lines
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.16)';
    ctx.lineWidth = 1;
    for (let gx = 152; gx < 340; gx += 16) {
      ctx.beginPath();
      ctx.moveTo(gx, 78);
      ctx.lineTo(gx, 198);
      ctx.stroke();
    }
    for (let gy = 92; gy < 196; gy += 16) {
      ctx.beginPath();
      ctx.moveTo(138, gy);
      ctx.lineTo(342, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = '#93c5fd';
    ctx.strokeRect(140.5, 80.5, 199, 115);

    if (rt.bindFlashAnim > 0) {
      ctx.save();
      ctx.globalAlpha = rt.bindFlashAnim * 2;
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(140, 80, 200, 116);
      ctx.restore();
    }

    ctx.drawImage(wSprite, 212, 110, 56, 56);

    if (rt.wbPhase === 'fit') {
      const slotSprite = getForgeUiSprite('slotBox', 34, 34);
      const handSprite = getForgeUiSprite('handCursor', 22, 22);
      const firstUnfitted = rt.slots.find((s) => !s.fitted);

      rt.slots.forEach((slot, idx) => {
        if (slotSprite) {
          ctx.save();
          if (slot.fitted) ctx.globalAlpha = 0.55;
          ctx.drawImage(slotSprite, slot.x - 17, slot.y - 17, 34, 34);
          ctx.restore();
        } else {
          ctx.fillStyle = slot.fitted ? '#15803d' : '#b45309';
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, 16, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = slot.fitted ? '#4ade80' : '#fde047';
        ctx.lineWidth = 2;
        ctx.strokeRect(slot.x - 17, slot.y - 17, 34, 34);

        const selMat = selectedMaterials[idx % Math.max(1, selectedMaterials.length)];
        if (slot.fitted && selMat) {
          const matIcon = getMaterialIconCanvas(selMat.materialId);
          ctx.drawImage(matIcon, slot.x - 10, slot.y - 10, 20, 20);
        } else {
          ctx.fillStyle = '#fffbeb';
          ctx.font = 'bold 8px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(slot.fitted ? 'OK' : slot.label, slot.x, slot.y + 3);
          ctx.textAlign = 'left';
        }

        if (handSprite && firstUnfitted === slot) {
          const bounce = Math.sin(rt.elapsed * 8) * 3;
          ctx.drawImage(handSprite, slot.x + 8, slot.y + 8 + bounce, 20, 20);
        }
      });
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 9px "Courier New", monospace';
      ctx.fillText('TAP EACH PART SLOT DIRECTLY', 160, 214);
    } else {
      const rx = 240;
      const ry = 140;
      const ring = getForgeUiSprite('targetRing', 40, 40);
      if (ring) {
        ctx.drawImage(ring, rx - 20, ry - 20, 40, 40);
      } else {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, 18, 0, Math.PI * 2);
        ctx.stroke();
      }

      const outerR = Math.max(4, (1.1 - rt.bindPulse) * 40);
      ctx.strokeStyle = Math.abs(rt.bindPulse - 0.8) <= BIND_PERFECT_WINDOW ? '#4ade80' : '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, outerR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 9px "Courier New", monospace';
      ctx.fillText(
        `TAP ON BEAT TO BIND (${rt.bindBeatsDone}/${rt.bindBeatsTotal})`,
        154,
        214,
      );
    }
  }

  if (rt.statusBanner) {
    ctx.fillStyle = 'rgba(18, 12, 10, 0.88)';
    ctx.fillRect(142, 50, 196, 16);
    ctx.strokeStyle = rt.statusBanner.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(142, 50, 196, 16);
    ctx.fillStyle = rt.statusBanner.color;
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(rt.statusBanner.text, 240, 61);
    ctx.textAlign = 'left';
  }

  particles.draw(ctx);

  if (rt.popup) {
    const spriteId =
      rt.popup.kind === 'perfect'
        ? 'wordPerfect'
        : rt.popup.kind === 'good'
          ? 'wordGood'
          : 'wordMiss';
    const pw = rt.popup.kind === 'perfect' ? 92 : 68;
    const ph = rt.popup.kind === 'perfect' ? 28 : 26;
    const wordSprite = getForgeUiSprite(spriteId, pw, ph);
    if (wordSprite) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, rt.popup.timer * 3);
      ctx.drawImage(
        wordSprite,
        Math.round(rt.popup.x - pw / 2),
        Math.round(rt.popup.y - ph / 2),
        pw,
        ph,
      );
      ctx.restore();
    }
  }
}
