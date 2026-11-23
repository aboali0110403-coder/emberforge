import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { renderBattleFrame } from '../canvas/battleScene';
import { CANVAS_HEIGHT, CANVAS_WIDTH, QUALITY_GRADE_META, RARITY_COLORS } from '../data/config';
import { MATERIAL_BY_ID } from '../data/materials';
import { RACES } from '../data/races';
import { WEAPONS } from '../data/weapons';
import type { BattleResult } from '../types';
import { MaterialSprite } from './PixelThumbnail';

interface BattleReportModalProps {
  result: BattleResult;
  onClaim: () => void;
}

export const BattleReportModal: React.FC<BattleReportModalProps> = ({
  result,
  onClaim,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const skippedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const [animDone, setAnimDone] = useState(false);

  const clearTimers = () => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  };

  useEffect(() => {
    skippedRef.current = false;
    setAnimDone(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Schedule synchronized combat audio cues along the 3.0s timeline
    timersRef.current = [
      window.setTimeout(() => {
        if (!skippedRef.current) soundEngine.playBattleSlash();
      }, 1050),
      window.setTimeout(() => {
        if (!skippedRef.current) soundEngine.playBattleImpact(result.won);
      }, 1300),
      window.setTimeout(() => {
        if (!skippedRef.current) {
          if (result.won) {
            soundEngine.playLevelUp();
          } else {
            soundEngine.playWarningTone();
          }
        }
      }, 2050),
    ];

    let rafId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      ctx.imageSmoothingEnabled = false;
      if (skippedRef.current) {
        renderBattleFrame(ctx, 3.0, result);
        return;
      }
      const elapsed = (now - start) / 1000;
      renderBattleFrame(ctx, Math.min(3.0, elapsed), result);
      if (elapsed >= 2.25) {
        setAnimDone(true);
      }
      if (elapsed < 3.0) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimers();
    };
  }, [result]);

  const handleSkip = () => {
    skippedRef.current = true;
    clearTimers();
    setAnimDone(true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      renderBattleFrame(ctx, 3.0, result);
    }
  };

  const race = RACES[result.race];
  const weapon = WEAPONS[result.weapon.type];
  const grade = result.qualityGrade;
  const gradeMeta = grade ? QUALITY_GRADE_META[grade] : null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2 sm:p-4 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[94vh] w-full max-w-2xl flex-col gap-2.5 overflow-y-auto p-3 sm:gap-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 border-b border-[#4a3222] pb-2">
          <div className="min-w-0">
            <h2 className="font-display truncate text-lg font-bold text-[#fde047] sm:text-xl">
              Battle Report · {result.scenarioName}
            </h2>
            <p className="font-pixel truncate text-xs text-[#d4b88c]">
              {result.customerName} ({race.name}) wielded your{' '}
              {result.weapon.trait ? `[${result.weapon.trait}] ` : ''}
              {weapon.name} (Lv {result.weapon.level})
            </p>
          </div>
          {!animDone && (
            <button
              type="button"
              onClick={handleSkip}
              className="forge-button font-pixel shrink-0 cursor-pointer px-3 py-1.5 text-xs"
            >
              Skip
            </button>
          )}
        </div>

        {/* Pixel Battle Canvas */}
        <div className="flex justify-center border-2 border-[#4a3222] bg-[#120c0a]">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="pixelated aspect-video max-h-[42vh] w-full max-w-[520px] object-contain"
          />
        </div>

        {/* Result Breakdown */}
        {animDone && (
          <div className="flex flex-col gap-3 border border-[#4a3222] bg-[#17100d] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`font-pixel text-base font-bold ${
                    result.won ? 'text-[#4ade80]' : 'text-[#f87171]'
                  }`}
                >
                  {result.won
                    ? `Victory! Satisfaction ${result.satisfaction}%`
                    : `Defeat · Satisfaction ${result.satisfaction}%`}
                </span>
                {gradeMeta && (
                  <span
                    className="font-pixel border border-[#4a3222] bg-[#120c0a] px-2 py-0.5 text-xs font-bold"
                    style={{ color: gradeMeta.color }}
                  >
                    {grade} · {gradeMeta.label}
                  </span>
                )}
              </div>
              <span className="font-pixel tabular-nums text-xs text-[#fde047]">
                {result.popularityDelta > 0
                  ? `+${result.popularityDelta} ${race.kingdomName} Popularity`
                  : result.popularityDelta < 0
                    ? `${result.popularityDelta} ${race.kingdomName} Popularity`
                    : 'No Popularity Change'}
              </span>
            </div>

            {result.territoryConquered && result.won && (
              <div className="font-pixel border border-[#fde047] bg-[#2e2016] px-3 py-1.5 text-xs font-bold text-[#fde047]">
                Claim to clear {result.scenarioName} and gain +5% {race.kingdomName} Gold Tribute.
              </div>
            )}

            {result.breakdown && (
              <div className="grid grid-cols-2 gap-2 border border-[#362419] bg-[#120c0a] p-2.5 font-pixel text-[11px] sm:grid-cols-4">
                <div>
                  <span className="text-[#9ca3af]">Weapon Rating</span>
                  <div className="font-bold text-[#fffbeb]">{result.breakdown.weaponRating}</div>
                </div>
                <div>
                  <span className="text-[#9ca3af]">Threat ({result.breakdown.matchupLabel})</span>
                  <div className="font-bold text-[#f87171]">{result.breakdown.scenarioThreat}</div>
                </div>
                <div>
                  <span className="text-[#9ca3af]">Tactical Matchup</span>
                  <div className="font-bold text-[#93c5fd]">
                    {result.breakdown.matchupBonus >= 0 ? '+' : ''}
                    {result.breakdown.matchupBonus} · Smith +{result.breakdown.smithBonus}
                  </div>
                </div>
                <div>
                  <span className="text-[#9ca3af]">Roll Odds</span>
                  <div className="font-bold text-[#fde047]">{result.breakdown.winChancePct}%</div>
                </div>
              </div>
            )}

            {result.won && result.materialRewards.length > 0 ? (
              <div>
                <div className="font-pixel mb-1.5 text-xs text-[#d4b88c]">
                  {race.name} Spoils to Claim:
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.materialRewards.map((rw) => {
                    const mat = MATERIAL_BY_ID[rw.materialId];
                    if (!mat) return null;
                    return (
                      <div
                        key={rw.materialId}
                        className="flex items-center gap-2 border border-[#6b4931] bg-[#241914] px-2.5 py-1.5"
                      >
                        <MaterialSprite materialId={mat.id} size={22} />
                        <span
                          className="font-pixel text-xs font-bold"
                          style={{ color: RARITY_COLORS[mat.rarity] }}
                        >
                          {mat.name} ×{rw.count}
                        </span>
                      </div>
                    );
                  })}
                  {result.goldBonus > 0 && (
                    <div className="font-pixel flex items-center border border-[#eab308] bg-[#362419] px-3 py-1.5 text-xs font-bold text-[#fde047]">
                      +{result.goldBonus}g Battle Bonus
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="font-pixel text-xs text-[#9ca3af]">
                {result.won
                  ? 'Victory secured!'
                  : 'The battle was fierce. Matching enemy weaknesses, quality grade, and higher weapon tiers improve win odds!'}
              </p>
            )}

            <p className="font-pixel text-xs text-[#d4b88c]">
              {result.won
                ? 'Claim applies the battle rewards and popularity changes and records any new territory clear.'
                : 'Acknowledging applies any battle popularity change.'}
            </p>

            <button
              type="button"
              onClick={onClaim}
              className="forge-button-primary font-pixel mt-1 w-full cursor-pointer py-2.5 text-sm font-bold"
            >
              {result.won ? 'Claim Spoils & Continue' : 'Acknowledge Report'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
