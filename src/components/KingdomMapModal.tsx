import React, { useEffect, useRef, useState } from 'react';
import { BALANCE } from '../data/balance';
import { CANVAS_HEIGHT, CANVAS_WIDTH, POPULARITY_TIERS } from '../data/config';
import { RACES, RACE_LIST } from '../data/races';
import { getPopularityTier } from '../game/rules';
import { ASSET_PATHS } from '../gfx/assetSheets';
import type { KingLetter, RaceId, SaveState } from '../types';
import { HudIconSprite, PortraitSprite } from './PixelThumbnail';

interface KingdomMapModalProps {
  save: SaveState;
  onClose: () => void;
}

const MAP_PINS: { id: RaceId; left: string; top: string; nx: number; ny: number }[] = [
  { id: 'orc', left: '22%', top: '24%', nx: 0.22, ny: 0.24 },
  { id: 'elf', left: '78%', top: '24%', nx: 0.78, ny: 0.24 },
  { id: 'human', left: '53%', top: '46%', nx: 0.53, ny: 0.46 },
  { id: 'goblin', left: '28%', top: '70%', nx: 0.28, ny: 0.7 },
  { id: 'demon', left: '78%', top: '66%', nx: 0.78, ny: 0.66 },
];

export const KingdomMapModal: React.FC<KingdomMapModalProps> = ({ save, onClose }) => {
  const [selectedLetter, setSelectedLetter] = useState<KingLetter | null>(null);
  const [selectedRace, setSelectedRace] = useState<RaceId>('human');
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();
    const hub = MAP_PINS.find((p) => p.id === 'human')!;
    const hubX = Math.round(hub.nx * CANVAS_WIDTH);
    const hubY = Math.round(hub.ny * CANVAS_HEIGHT);

    const drawFrame = (now: number) => {
      const t = (now - start) / 1000;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. Glowing dashed trade roads from Aldermere to unlocked kingdoms + moving caravan gold dots
      for (const pin of MAP_PINS) {
        if (pin.id === 'human') continue;
        const unlocked = save.unlockedRaces.includes(pin.id);
        if (!unlocked) continue;
        const px = Math.round(pin.nx * CANVAS_WIDTH);
        const py = Math.round(pin.ny * CANVAS_HEIGHT);

        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -t * 14;
        ctx.beginPath();
        ctx.moveTo(hubX, hubY);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.restore();

        // Moving golden trade caravan dot
        const travel = (t * 0.26 + pin.nx) % 1;
        const cx = Math.round(hubX + (px - hubX) * travel);
        const cy = Math.round(hubY + (py - hubY) * travel);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
        ctx.fillStyle = '#fffbeb';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
      }

      // 2. Fog-of-war shroud over locked territories & conquest stars / selection halo
      for (const pin of MAP_PINS) {
        const px = Math.round(pin.nx * CANVAS_WIDTH);
        const py = Math.round(pin.ny * CANVAS_HEIGHT);
        const unlocked = save.unlockedRaces.includes(pin.id);
        const cleared = save.conqueredTerritories?.[pin.id]?.length ?? 0;

        if (!unlocked) {
          const fog = ctx.createRadialGradient(px, py, 14, px, py, 74);
          fog.addColorStop(0, 'rgba(18, 12, 10, 0.52)');
          fog.addColorStop(1, 'rgba(18, 12, 10, 0)');
          ctx.fillStyle = fog;
          ctx.beginPath();
          ctx.arc(px, py, 74, 0, Math.PI * 2);
          ctx.fill();
        } else if (cleared > 0) {
          // Small gold pixel stars above unlocked & conquered realms
          for (let i = 0; i < Math.min(3, cleared); i++) {
            const sx = px - 12 + i * 10;
            const sy = py - 18;
            ctx.fillStyle = '#120c0a';
            ctx.fillRect(sx - 1, sy - 1, 5, 5);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(sx, sy, 3, 3);
            ctx.fillStyle = '#fffbeb';
            ctx.fillRect(sx + 1, sy + 1, 1, 1);
          }
        }

        if (selectedRace === pin.id) {
          const pulseR = 24 + Math.sin(t * 4) * 3;
          ctx.strokeStyle = 'rgba(253, 224, 71, 0.72)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // 3. Subtle drifting pixel clouds across high altitude
      for (let i = 0; i < 4; i++) {
        const cw = 52 + i * 12;
        const ch = 12 + (i % 2) * 4;
        const cloudX = ((t * (6 + i * 2) + i * 130) % (CANVAS_WIDTH + 90)) - 70;
        const cloudY = 18 + i * 58;
        ctx.fillStyle = 'rgba(243, 223, 185, 0.09)';
        ctx.fillRect(Math.round(cloudX), cloudY, cw, ch);
        ctx.fillRect(Math.round(cloudX) + 8, cloudY - 4, cw - 18, 4);
      }

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [save.unlockedRaces, save.conqueredTerritories, selectedRace]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-2 sm:p-4 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between border-b border-[#4a3222] pb-2">
          <div>
            <h2 className="font-display text-xl font-bold text-[#fde047]">
              Realm of the Five Kingdoms
            </h2>
            <p className="font-pixel text-xs text-[#d4b88c]">
              Known (25) unlocks next kingdom · Win battles to conquer territories (+5% gold tribute per territory)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="forge-button font-pixel cursor-pointer px-4 py-2 text-xs"
          >
            Close
          </button>
        </div>

        {/* Interactive Pixel-Art World Map */}
        <div className="relative aspect-video w-full shrink-0 overflow-hidden border-2 border-[#6b4931] bg-[#17100d]">
          <img
            src={ASSET_PATHS.worldMap}
            alt="Map of the Five Kingdoms"
            className="block h-full w-full object-cover"
          />
          <canvas
            ref={overlayCanvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            aria-hidden="true"
            className="pixelated pointer-events-none absolute inset-0 h-full w-full"
          />

          {MAP_PINS.map((pin) => {
            const r = RACES[pin.id];
            const unlocked = save.unlockedRaces.includes(r.id);
            const pop = save.popularity[r.id] ?? 0;
            const tier = getPopularityTier(pop);
            const cleared = save.conqueredTerritories?.[r.id]?.length ?? 0;
            const isSelected = selectedRace === r.id;

            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRace(r.id)}
                style={{ left: pin.left, top: pin.top }}
                aria-label={`${r.kingdomName} (${unlocked ? tier.label : 'Locked'})`}
                className={`font-pixel absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer border-2 px-2 py-1 text-[10px] font-bold shadow-md transition-transform hover:scale-105 ${
                  isSelected
                    ? 'border-[#fde047] bg-[#1a110e] text-[#fde047]'
                    : unlocked
                      ? 'border-[#8c6239] bg-[#17100d]/92 text-[#fffbeb]'
                      : 'border-[#4a3222] bg-[#120c0a]/90 text-[#9ca3af]'
                }`}
              >
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <HudIconSprite icon={unlocked ? 'crown' : 'shield'} size={13} />
                  <span>
                    {unlocked ? `${tier.label} (${pop}) · ${cleared}/3` : 'Locked'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Kingdom Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RACE_LIST.map((race) => {
            const unlocked = save.unlockedRaces.includes(race.id);
            const pop = save.popularity[race.id] ?? 0;
            const tier = getPopularityTier(pop);
            const maxBar = POPULARITY_TIERS[POPULARITY_TIERS.length - 1].min;
            const pct = Math.min(100, Math.round((pop / maxBar) * 100));
            const letters = save.kingLetters.filter((l) => l.race === race.id);
            const clearedList = save.conqueredTerritories?.[race.id] ?? [];
            const tributePct = Math.min(3, clearedList.length) * Math.round(BALANCE.territoryBonusPerClear * 100);
            const highlighted = selectedRace === race.id;

            return (
              <div
                key={race.id}
                onClick={() => setSelectedRace(race.id)}
                className={`flex flex-col justify-between gap-2 border-2 p-3 ${
                  highlighted
                    ? 'border-[#fde047] bg-[#241914]'
                    : unlocked
                      ? 'border-[#6b4931] bg-[#17100d]'
                      : 'border-[#362d2b] bg-[#120c0a] opacity-65'
                }`}
              >
                <div className="flex items-center gap-3">
                  <PortraitSprite race={race.id} variant={0} isKing size={48} />
                  <div>
                    <div className="font-display text-base font-bold text-[#fffbeb]">
                      {race.kingdomName}
                    </div>
                    <div className="font-pixel text-xs text-[#d4b88c]">
                      {race.plural} · {race.kingTitle}
                    </div>
                    <div
                      className="font-pixel text-xs font-bold"
                      style={{ color: unlocked ? race.palette.accent : '#9ca3af' }}
                    >
                      {unlocked ? `${tier.label} (${pop})` : 'Locked'}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="h-2.5 w-full border border-[#4a3222] bg-[#120c0a]">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: race.palette.primary,
                      }}
                    />
                  </div>
                  <div className="font-pixel mt-1 flex justify-between text-[10px] text-[#9ca3af]">
                    <span>{tier.label}</span>
                    <span>
                      {tier.nextMin !== null ? `Next: ${tier.nextMin}` : 'Max Tier'}
                    </span>
                  </div>
                </div>

                {/* Conquered Territories & Tribute */}
                <div className="border-t border-[#362419] pt-2">
                  <div className="font-pixel mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-[#d4b88c]">
                      Territories: {clearedList.length}/3
                    </span>
                    <span className="font-bold text-[#4ade80]">
                      Tribute +{tributePct}%
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {race.scenarios.map((sc) => {
                      const conquered = clearedList.includes(sc.name);
                      return (
                        <div
                          key={sc.name}
                          className={`font-pixel flex items-center justify-between text-[10px] ${
                            conquered ? 'text-[#4ade80]' : 'text-[#9ca3af]'
                          }`}
                        >
                          <span className="truncate">{sc.name}</span>
                          <span>{conquered ? '✓ Cleared' : `Diff ${sc.difficulty}`}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {letters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLetter(letters[letters.length - 1])}
                    className="forge-button font-pixel flex cursor-pointer items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-[#fde047]"
                  >
                    <HudIconSprite icon="scroll" size={14} />
                    <span>Read King's Letter ({letters.length})</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Parchment Letter Reader */}
        {selectedLetter && (
          <div className="border-2 border-[#d97706] bg-[#f3dfb9] p-4 text-[#2c190e]">
            <div className="flex items-center justify-between border-b border-[#b08d57] pb-2">
              <h3 className="font-display text-lg font-bold">{selectedLetter.title}</h3>
              <button
                type="button"
                onClick={() => setSelectedLetter(null)}
                className="cursor-pointer border border-[#6b4931] bg-[#d4b88c] px-3 py-1 text-xs font-bold text-[#2c190e]"
              >
                Close Letter
              </button>
            </div>
            <p className="mt-3 whitespace-pre-line font-display text-sm leading-relaxed">
              {selectedLetter.body}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
