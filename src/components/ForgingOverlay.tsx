import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { QUALITY_GRADE_META, RARITY_COLORS } from '../data/config';
import { MATERIAL_BY_ID } from '../data/materials';
import { WEAPONS } from '../data/weapons';
import { getQualityGrade } from '../game/rules';
import { ParticlePool } from '../gfx/particles';
import { getWeaponSpriteCanvas } from '../gfx/sprites';
import { STRINGS } from '../strings';
import type { ForgeInsightEntry, ForgeInsightReport } from '../game/forgeInsightReport';
import type {
  AudioSettings,
  DeliverySummary,
  ForgingSession,
  QualityGrade,
  StationId,
  WeaponInstance,
} from '../types';
import { MaterialSprite } from './PixelThumbnail';

// Presentation-only formatting for forge insight entries. Report data stores
// raw numeric measurements; every toFixed/percent/join mapping happens here,
// never in the stored report.
const formatInsightEntryValue = (entry: ForgeInsightEntry): string => {
  const judgmentLabels = STRINGS.delivery.insight.judgments as Record<string, string>;
  const v = entry.value;
  switch (entry.key) {
    case 'elapsed':
    case 'inBand':
    case 'overheat':
    case 'inZone':
      return `${(v as number).toFixed(1)}s`;
    case 'bandShare':
    case 'zoneShare':
      return `${Math.round((v as number) * 100)}%`;
    case 'scorch':
      return `${(v as number) > 0 ? '-' : ''}${(v as number).toFixed(3)}`;
    case 'fitPenalty':
      return `${(v as number) > 0 ? '-' : ''}${(v as number).toFixed(2)}`;
    case 'releaseTemp':
      return (v as number).toFixed(2);
    case 'strikeScores':
    case 'bindScores':
      return (v as number[]).map((x) => x.toFixed(2)).join(', ');
    case 'window': {
      const [min, max] = v as number[];
      return `${min.toFixed(2)} - ${max.toFixed(2)}`;
    }
    case 'strikes':
    case 'binds': {
      const [done, total] = v as number[];
      return `${done}/${total}`;
    }
    case 'judgment':
      return judgmentLabels[v as string] ?? String(v);
    case 'fitResults':
    case 'strikeJudgments':
    case 'bindJudgments':
      return (v as string[]).map((x) => judgmentLabels[x] ?? x).join(', ');
    case 'judgmentTally': {
      const [perfect, good, miss] = v as number[];
      return `${perfect} ${judgmentLabels.perfect} · ${good} ${judgmentLabels.good} · ${miss} ${judgmentLabels.miss}`;
    }
    default:
      return String(v);
  }
};

// Step identity for a step whose insight report is unavailable: ordering and
// station come from the actual forge step list; no measurement is fabricated.
const missingStepTitle = (summary: DeliverySummary, stepIdx: number): string => {
  const station = summary.steps?.[stepIdx];
  const base = `${STRINGS.delivery.insight.stepLabel} ${stepIdx + 1}`;
  return station ? `${base} · ${STRINGS.stations[station].title}` : base;
};

interface ForgingOverlayProps {
  forging: ForgingSession;
  liveAccuracy: number;
  liveStreak: number;
  showTutorial: boolean;
  isPaused: boolean;
  audio: AudioSettings;
  onSetPaused: (paused: boolean) => void;
  onSwitchStation: (index: number) => void;
  onShowGuide: () => void;
  onUpdateAudio: (audio: AudioSettings) => void;
  onDismissTutorial: (skipAll?: boolean) => void;
  onCancelForge: () => void;
}

export const ForgingOverlay: React.FC<ForgingOverlayProps> = ({
  forging,
  liveAccuracy,
  liveStreak,
  showTutorial,
  isPaused,
  audio,
  onSetPaused,
  onSwitchStation,
  onShowGuide,
  onUpdateAudio,
  onDismissTutorial,
  onCancelForge,
}) => {
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const station: StationId = forging.steps[forging.stepIndex];
  const stStrings = STRINGS.stations[station];
  const tutStrings = STRINGS.tutorials.stations[station];
  const liveGrade = getQualityGrade(liveAccuracy);
  const gradeMeta = QUALITY_GRADE_META[liveGrade];
  const completedMask =
    forging.completedSteps &&
    forging.completedSteps.length === forging.steps.length
      ? forging.completedSteps
      : forging.steps.map((_, i) => i < forging.stepAccuracies.length);

  return (
    <>
      {/* Minimal top forging bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 p-2 sm:p-3 safe-area-inset">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 border-2 border-[#6b4931] bg-[#1a110e]/92 px-3 py-1.5">
          <span className="font-pixel text-xs font-bold text-[#fde047]">
            Step {forging.stepIndex + 1}/{forging.steps.length}: {stStrings.title}
          </span>
          <span className="text-[#6b4931]" aria-hidden="true">
            ·
          </span>
          <span className="font-pixel tabular-nums text-xs text-[#4ade80]">
            Quality {Math.round(liveAccuracy * 100)}%
          </span>
          <span
            className="font-pixel border border-[#4a3222] bg-[#120c0a] px-1.5 py-0.5 text-[11px] font-bold"
            style={{ color: gradeMeta.color }}
          >
            {liveGrade} · {gradeMeta.label}
          </span>
          {liveStreak >= 2 && (
            <>
              <span className="text-[#6b4931]" aria-hidden="true">
                ·
              </span>
              <span className="font-pixel tabular-nums text-xs font-bold text-[#fbbf24]">
                Streak ×{liveStreak}
              </span>
            </>
          )}
          {forging.steps.length > 1 && (
            <div
              className="hidden items-center gap-1 border-l border-[#4a3222] pl-2 sm:flex"
              aria-label="Forge Stations"
            >
              {forging.steps.map((st, idx) => {
                const isCurrent = idx === forging.stepIndex;
                const isDone = Boolean(completedMask[idx]);
                const stName = STRINGS.stations[st].title;
                return (
                  <button
                    key={`${st}_${idx}`}
                    type="button"
                    disabled={isDone || isCurrent}
                    onClick={() => onSwitchStation(idx)}
                    aria-label={`Station ${idx + 1}: ${stName}${isDone ? ' (Completed)' : ''}`}
                    title={`${stName} [${idx + 1}]`}
                    className={`font-pixel px-1.5 py-0.5 text-[10px] border ${
                      isCurrent
                        ? 'border-[#fde047] bg-[#3b2619] text-[#fde047] font-bold'
                        : isDone
                          ? 'border-[#2e4736] bg-[#111c15] text-[#4ade80] opacity-75 cursor-default'
                          : 'border-[#4a3222] bg-[#120c0a] text-[#d4b88c] hover:border-[#f59e0b] hover:text-[#fffbeb] cursor-pointer'
                    }`}
                  >
                    {idx + 1}:{isDone ? '✓' : stName.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setConfirmAbandon(false);
            onSetPaused(true);
          }}
          className="pointer-events-auto forge-button font-pixel cursor-pointer px-3 py-1.5 text-xs"
        >
          Pause [P / Esc]
        </button>
      </div>

      {/* Bottom instruction strip */}
      <div className="pointer-events-none fixed inset-x-0 bottom-2 z-20 flex justify-center px-3 safe-area-inset">
        <span className="font-pixel bg-[#120c0a]/85 px-3 py-1 text-center text-xs text-[#f6e7cb]">
          {stStrings.hint}
          <span className="hidden text-[#d4b88c] md:inline">
            {forging.steps.length > 1
              ? ` · [1-${forging.steps.length} / [ ]] Station · [P] Pause · [G] Guide`
              : ' · [P / Esc] Pause · [G] Guide'}
          </span>
        </span>
      </div>

      {/* Forge Pause Menu */}
      {isPaused && !showTutorial && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 safe-area-inset">
          <div className="forge-panel flex w-full max-w-md flex-col gap-3 p-5">
            <div className="flex items-center justify-between border-b border-[#4a3222] pb-2">
              <h3 className="font-display text-xl font-bold text-[#fde047]">
                {STRINGS.forgePause.title}
              </h3>
              <span className="font-pixel text-xs text-[#d4b88c]">
                {stStrings.title} ({forging.stepIndex + 1}/{forging.steps.length})
              </span>
            </div>

            <div className="flex flex-col gap-2 border border-[#4a3222] bg-[#17100d] p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="font-pixel text-xs text-[#f3dfb9]">
                  Music ({Math.round(audio.musicVolume * 100)}%)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audio.musicVolume}
                  onChange={(e) =>
                    onUpdateAudio({ ...audio, musicVolume: Number(e.target.value) })
                  }
                  className="w-36 accent-[#f59e0b]"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-pixel text-xs text-[#f3dfb9]">
                  SFX ({Math.round(audio.sfxVolume * 100)}%)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audio.sfxVolume}
                  onChange={(e) =>
                    onUpdateAudio({ ...audio, sfxVolume: Number(e.target.value) })
                  }
                  className="w-36 accent-[#f59e0b]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between">
                <span className="font-pixel text-xs text-[#f3dfb9]">Mute Audio</span>
                <input
                  type="checkbox"
                  checked={audio.muted}
                  onChange={(e) =>
                    onUpdateAudio({ ...audio, muted: e.target.checked })
                  }
                  className="h-4 w-4 accent-[#f59e0b]"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onSetPaused(false)}
                className="forge-button-primary font-pixel cursor-pointer py-2.5 text-sm font-bold"
              >
                {STRINGS.forgePause.resume}
              </button>
              <button
                type="button"
                onClick={onShowGuide}
                className="forge-button font-pixel cursor-pointer py-2 text-xs text-[#fde047]"
              >
                {STRINGS.forgePause.guide}
              </button>

              {!confirmAbandon ? (
                <button
                  type="button"
                  onClick={() => setConfirmAbandon(true)}
                  className="font-pixel cursor-pointer border-2 border-[#991b1b] bg-[#450a0a] py-2 text-xs font-bold text-[#fca5a5]"
                >
                  {STRINGS.forgePause.abandon}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmAbandon(false);
                      onCancelForge();
                    }}
                    className="font-pixel flex-1 cursor-pointer border-2 border-[#ef4444] bg-[#b91c1c] py-2 text-xs font-bold text-white"
                  >
                    {STRINGS.forgePause.confirmAbandon}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAbandon(false)}
                    className="forge-button font-pixel cursor-pointer px-3 py-2 text-xs"
                  >
                    {STRINGS.settings.cancel}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guided First-Use Station Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 safe-area-inset">
          <div className="forge-panel flex max-w-md flex-col gap-3 p-5">
            <h3 className="font-display text-xl font-bold text-[#fde047]">
              {tutStrings.title}
            </h3>
            <p className="text-sm leading-relaxed text-[#f6e7cb]">
              {tutStrings.body}
            </p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onDismissTutorial(true)}
                className="forge-button font-pixel cursor-pointer px-4 py-2 text-xs text-[#d4b88c]"
              >
                {STRINGS.tutorials.skipTutorial}
              </button>
              <button
                type="button"
                onClick={() => onDismissTutorial(false)}
                className="forge-button-primary font-pixel cursor-pointer px-5 py-2 text-xs font-bold"
              >
                {STRINGS.tutorials.gotIt}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface WeaponRevealStageProps {
  weapon: WeaponInstance;
  grade: QualityGrade;
  leveledUp: boolean;
}

const WeaponRevealStage: React.FC<WeaponRevealStageProps> = ({
  weapon,
  grade,
  leveledUp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pool = new ParticlePool();
    const gradeColor = QUALITY_GRADE_META[grade].color;
    const burstCount = grade === 'S' ? 28 : grade === 'A' ? 22 : grade === 'B' ? 16 : 10;
    pool.burstRarityCelebration(72, 56, gradeColor, burstCount);
    if (leveledUp) {
      pool.spawnRing(72, 56, 46, '#fde047');
    }

    let rafId = 0;
    let last = performance.now();
    let elapsed = 0;
    let ambientTimer = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      elapsed += dt;
      ambientTimer += dt;

      if ((grade === 'S' || grade === 'A') && ambientTimer >= 0.28) {
        ambientTimer = 0;
        pool.spawn(
          28 + Math.random() * 88,
          20 + Math.random() * 68,
          (Math.random() - 0.5) * 14,
          -18 - Math.random() * 14,
          0.65,
          2,
          grade === 'S' ? '#fde047' : gradeColor,
          0,
          'star',
        );
      }

      pool.update(dt);

      const W = 144;
      const H = 118;
      ctx.imageSmoothingEnabled = false;

      // Obsidian backdrop & subtle forge pedestal glow
      ctx.fillStyle = '#120c0a';
      ctx.fillRect(0, 0, W, H);
      const rad = ctx.createRadialGradient(72, 54, 4, 72, 54, 62);
      rad.addColorStop(0, grade === 'S' || grade === 'A' ? 'rgba(253, 224, 71, 0.24)' : 'rgba(249, 115, 22, 0.16)');
      rad.addColorStop(1, 'rgba(18, 12, 10, 0)');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, W, H);

      // Rotating celebration rays strictly BEHIND the weapon
      const rayCount = grade === 'S' ? 8 : grade === 'A' ? 6 : 4;
      ctx.save();
      ctx.translate(72, 54);
      ctx.rotate(elapsed * (grade === 'S' ? 0.55 : 0.35));
      ctx.globalAlpha = grade === 'S' ? 0.18 : 0.11;
      ctx.fillStyle = gradeColor;
      for (let i = 0; i < rayCount; i++) {
        ctx.rotate((Math.PI * 2) / rayCount);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-9, -68);
        ctx.lineTo(9, -68);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Stone display pedestal
      ctx.fillStyle = '#2c221e';
      ctx.fillRect(36, 94, 72, 12);
      ctx.fillStyle = '#4a3222';
      ctx.fillRect(42, 90, 60, 5);
      ctx.fillStyle = gradeColor;
      ctx.fillRect(44, 90, 56, 1);

      // Floating weapon silhouette + metallic shine pulse
      const floatY = Math.round(Math.sin(elapsed * 3.1) * 3);
      const sprite = getWeaponSpriteCanvas(weapon);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(50, 91, 44, 3);
      ctx.drawImage(sprite, 36, 16 + floatY, 72, 72);

      // Periodic diagonal blade gleam across the showcase
      const gleamCycle = elapsed % 2.4;
      if (gleamCycle < 0.45) {
        const gx = 32 + (gleamCycle / 0.45) * 80;
        ctx.save();
        ctx.beginPath();
        ctx.rect(36, 16 + floatY, 72, 72);
        ctx.clip();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#fffbeb';
        ctx.beginPath();
        ctx.moveTo(gx, 16 + floatY);
        ctx.lineTo(gx + 10, 16 + floatY);
        ctx.lineTo(gx - 8, 88 + floatY);
        ctx.lineTo(gx - 18, 88 + floatY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      pool.draw(ctx);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [weapon, grade, leveledUp]);

  return (
    <canvas
      ref={canvasRef}
      width={144}
      height={118}
      className="pixelated shrink-0 border-2 border-[#6b4931] bg-[#120c0a]"
      style={{ width: 132, height: 108 }}
    />
  );
};

interface DeliveryModalProps {
  summary: DeliverySummary;
  notification?: React.ReactNode;
  onConfirm: () => void;
}

export const DeliveryModal: React.FC<DeliveryModalProps> = ({
  summary,
  notification,
  onConfirm,
}) => {
  const wDef = WEAPONS[summary.order.weapon.type];
  const gradeMeta = QUALITY_GRADE_META[summary.qualityGrade];
  const smithLeveled = summary.smithLevelAfter > summary.smithLevelBefore;

  useEffect(() => {
    soundEngine.playWeaponReveal(summary.qualityGrade);
    let lvlTimer: number | undefined;
    if (summary.leveledUp || smithLeveled) {
      lvlTimer = window.setTimeout(() => {
        soundEngine.playLevelUp();
      }, 220);
    }
    return () => {
      if (lvlTimer !== undefined) window.clearTimeout(lvlTimer);
    };
  }, [summary.qualityGrade, summary.leveledUp, smithLeveled]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-2 sm:p-4 safe-area-inset">
      <div data-testid="delivery-layout" className="flex max-h-[94vh] min-h-0 w-full max-w-xl flex-col gap-2">
        <div data-testid="delivery-scroll" className="forge-panel forge-scroll flex min-h-0 w-full flex-col gap-3 overflow-y-auto p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-[#4a3222] pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold text-[#fde047] sm:text-2xl">
                Order Delivered!
              </h2>
              <span
                data-testid="delivery-grade-badge"
                className="font-pixel border border-[#6b4931] bg-[#120c0a] px-2 py-0.5 text-xs font-bold"
                style={{ color: gradeMeta.color }}
              >
                Grade {summary.qualityGrade} · {gradeMeta.label}
              </span>
            </div>
            <span className="font-pixel tabular-nums text-lg font-bold text-[#facc15]">
              +{summary.goldEarned}g
            </span>
          </div>

          <div className="flex flex-col items-center gap-3 border border-[#4a3222] bg-[#17100d] p-3 sm:flex-row sm:items-stretch">
            <WeaponRevealStage
              weapon={summary.order.weapon}
              grade={summary.qualityGrade}
              leveledUp={summary.leveledUp}
            />
            <div className="flex flex-1 flex-col justify-between gap-2">
              <div>
                <div className="font-pixel text-sm font-bold text-[#fffbeb]">
                  {summary.masterworkTrait && (
                    <span className="mr-1.5 text-[#fbbf24]">[{summary.masterworkTrait}]</span>
                  )}
                  {wDef.name} · Level {summary.newLevel}
                  {summary.leveledUp && (
                    <span className="ml-2 text-[#4ade80]">
                      (UP from Lv {summary.oldLevel}!)
                    </span>
                  )}
                </div>
                <div className="font-pixel tabular-nums text-xs text-[#d4b88c]">
                  {/* Truthful at the cap: production performs no Level-Up roll when the incoming level is already 20 or higher. */}
                  Forging Quality: {Math.round(summary.quality * 100)}% ·{' '}
                  {summary.oldLevel >= 20
                    ? 'Level-Up: Maximum level (20)'
                    : `Level-Up Roll: ${Math.round(summary.levelUpChance * 100)}%`}
                </div>
                <div className="font-pixel mt-1.5 flex flex-wrap gap-2.5 text-xs tabular-nums text-[#93c5fd]">
                  <span>PWR +{summary.statDeltas.power}</span>
                  <span>EDGE +{summary.statDeltas.edge}</span>
                  <span>BAL +{summary.statDeltas.balance}</span>
                  <span>DUR +{summary.statDeltas.durability}</span>
                  {summary.statDeltas.arcane > 0 && (
                    <span>ARC +{summary.statDeltas.arcane}</span>
                  )}
                </div>
              </div>

              {summary.selectedMaterials && summary.selectedMaterials.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[#362419] pt-2">
                  <span className="font-pixel text-[10px] text-[#b89f7d]">Forged With:</span>
                  {summary.selectedMaterials.map((stack) => {
                    const mat = MATERIAL_BY_ID[stack.materialId];
                    if (!mat) return null;
                    return (
                      <span
                        key={stack.materialId}
                        className="font-pixel flex items-center gap-1 border border-[#4a3222] bg-[#120c0a] px-1.5 py-0.5 text-[10px]"
                        style={{ color: RARITY_COLORS[mat.rarity] }}
                      >
                        <MaterialSprite materialId={mat.id} size={14} />
                        <span>
                          {mat.name} ×{stack.units}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border border-[#362419] bg-[#120c0a] px-3 py-2 font-pixel text-xs">
            <span className="text-[#93c5fd]">
              +{summary.xpEarned} Smith XP
              {smithLeveled && (
                <span className="ml-1.5 font-bold text-[#fde047]">
                  → Smith Lv {summary.smithLevelAfter}!
                </span>
              )}
            </span>
            {summary.promptBonusGold > 0 && (
              <span className="text-[#4ade80]">Prompt Tip +{summary.promptBonusGold}g</span>
            )}
            {summary.reputationPenalty < 0 && (
              <span className="text-[#f87171]">
                Flawed Work: {summary.reputationPenalty} Rep
              </span>
            )}
          </div>

          {(() => {
            const reports = summary.stepReports;
            const stepsList = summary.steps;
            const hasSteps = Boolean(stepsList && stepsList.length > 0);
            // V2 summaries (no step list, no reports) render no section.
            if (!hasSteps && (!reports || !reports.some(Boolean))) return null;
            const count = hasSteps ? stepsList!.length : reports!.length;
            return (
            <div
              data-testid="forge-insight"
              className="flex flex-col gap-2 border border-[#4a3222] bg-[#17100d] p-3"
            >
              <div className="font-pixel text-xs font-bold text-[#fde047]">
                {STRINGS.delivery.insight.title}
              </div>
              <div className="font-pixel text-[10px] text-[#b89f7d]">
                {STRINGS.delivery.insight.legend}
              </div>
              {Array.from({ length: count }, (_, stepIdx) => {
                const report = reports?.[stepIdx];
                return (
                <div
                  key={stepIdx}
                  data-testid={`forge-insight-step-${stepIdx}`}
                  className="flex flex-col gap-1 border-t border-[#362419] pt-1.5"
                >
                  {report ? (
                    <>
                      <div className="font-pixel flex flex-wrap items-baseline gap-x-2 text-xs font-bold text-[#fffbeb]">
                        <span>
                          {STRINGS.delivery.insight.stepLabel} {stepIdx + 1} ·{' '}
                          {STRINGS.stations[report.station].title}
                        </span>
                        <span className="tabular-nums text-[#93c5fd]">
                          {STRINGS.delivery.insight.labels.accuracy}:{' '}
                          {Math.round(report.accuracy * 100)}%
                        </span>
                        <span className="text-[10px] font-normal text-[#4ade80]">
                          ({STRINGS.delivery.insight.observedTag})
                        </span>
                      </div>
                      <div className="font-pixel flex flex-wrap items-baseline gap-x-1 text-[10px] tabular-nums text-[#d4b88c]">
                        <span>
                          {STRINGS.delivery.insight.labels.bestStreak}: {report.bestStreak}
                        </span>
                        <span className="text-[#4ade80]">
                          ({STRINGS.delivery.insight.observedTag})
                        </span>
                      </div>
                      {report.entries.map((entry) => (
                        <div
                          key={entry.key}
                          className="font-pixel flex flex-wrap items-baseline gap-x-1 text-[10px] text-[#d4b88c]"
                        >
                          <span className="tabular-nums">
                            {STRINGS.delivery.insight.labels[entry.key] ?? entry.key}:{' '}
                            {formatInsightEntryValue(entry)}
                          </span>
                          <span className={entry.derived ? 'text-[#b89f7d]' : 'text-[#4ade80]'}>
                            (
                            {entry.derived
                              ? STRINGS.delivery.insight.derivedTag
                              : STRINGS.delivery.insight.observedTag}
                            )
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="font-pixel flex flex-wrap items-baseline gap-x-2 text-xs font-bold text-[#fffbeb]">
                      <span>{missingStepTitle(summary, stepIdx)}</span>
                      <span className="text-[10px] font-normal text-[#b89f7d]">
                        ({STRINGS.delivery.insight.unavailable})
                      </span>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            );
          })()}

          <p className="font-pixel text-xs text-[#d4b88c]">
            {summary.order.customerName} heads to {summary.order.scenarioName}. A
            messenger will bring the Battle Report shortly!
          </p>

          <p className="font-pixel text-xs text-[#d4b88c]">
            {STRINGS.delivery.acknowledgement}
          </p>

          <button
            type="button"
            onClick={onConfirm}
            className="forge-button-primary font-pixel w-full cursor-pointer py-3 text-sm font-bold"
          >
            {STRINGS.delivery.continueBtn}
          </button>
        </div>
        {notification && (
          <div data-testid="delivery-notification" className="pointer-events-none flex w-full shrink-0 justify-center">
            {notification}
          </div>
        )}
      </div>
    </div>
  );
};
