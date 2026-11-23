import React from 'react';
import { getSmithProgress } from '../data/config';
import { RACES } from '../data/races';
import { getPopularityTier } from '../game/rules';
import { getWorldCycle } from '../game/worldCycle';
import { STRINGS } from '../strings';
import type { ActiveModal, PendingBattle, SaveState } from '../types';
import { HudIconSprite } from './PixelThumbnail';

interface HudOverlayProps {
  save: SaveState;
  activeModal: ActiveModal;
  canSkipNight: boolean;
  onSkipNight: () => void;
  onOpenModal: (m: Exclude<ActiveModal, null>) => void;
  onToggleMute: () => void;
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function deriveBattleStatus(
  battles: readonly Pick<PendingBattle, 'ready' | 'etaSec'>[],
) {
  let inProgressCount = 0;
  let readyCount = 0;
  let nextEtaSec: number | null = null;
  for (const battle of battles) {
    if (battle.ready === true) {
      readyCount += 1;
    } else if (battle.ready === false) {
      inProgressCount += 1;
      nextEtaSec = nextEtaSec === null ? battle.etaSec : Math.min(nextEtaSec, battle.etaSec);
    }
  }
  return { inProgressCount, readyCount, nextEtaSec };
}

export function formatBattleEta(sec: number): string {
  return Number.isFinite(sec) ? formatTimer(sec) : '--:--';
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  save,
  activeModal,
  canSkipNight,
  onSkipNight,
  onOpenModal,
  onToggleMute,
}) => {
  const worldCycle = getWorldCycle(save.activePlaySec);
  const battleStatus = deriveBattleStatus(save.pendingBattles);
  const leadOrder = save.orders[0];
  const leadTier = leadOrder
    ? getPopularityTier(save.popularity[leadOrder.race])
    : getPopularityTier(save.popularity.human);
  const smithProg = getSmithProgress(save.smithXp);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-1.5 sm:p-2.5 safe-area-inset">
      <div className="flex w-full flex-col items-start gap-1.5">
      {/* Single-row compact perimeter HUD bar */}
      <div className="flex w-full flex-nowrap items-center justify-between gap-1.5 overflow-x-auto">
        {/* Left Cluster: Smith Lv + Gold + Active Order Timer + Kingdom Rep */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-2 border-2 border-[#6b4931] bg-[#1a110e]/92 px-2.5 py-1.5 shadow-md">
          <span
            data-testid="hud-smith-level"
            title={`${smithProg.title} (${smithProg.currentLevelXp}/${smithProg.nextLevelXp} XP)`}
            className="font-pixel whitespace-nowrap border border-[#6b4931] bg-[#2a1c15] px-1.5 py-0.5 text-[11px] font-bold text-[#93c5fd]"
          >
            Lv {smithProg.level}
          </span>

          <div className="flex items-center gap-1">
            <HudIconSprite icon="coins" size={16} label="Gold" />
            <span
              data-testid="hud-gold"
              className="font-pixel tabular-nums text-sm font-bold text-[#fde047]"
            >
              {Math.round(save.gold)}
            </span>
          </div>

          <span className="text-[#6b4931]" aria-hidden="true">
            ·
          </span>

          <button
            type="button"
            onClick={() => onOpenModal('orders')}
            className="font-pixel min-h-[30px] cursor-pointer whitespace-nowrap text-left text-[11px] text-[#f6e7cb] hover:text-[#fde047]"
          >
            {leadOrder ? (
              <span className="tabular-nums">
                {RACES[leadOrder.race].name}
                {leadOrder.kind === 'royal' ? ' ★' : ''} · {formatTimer(leadOrder.remainingSec)} (
                {save.orders.length}/3)
              </span>
            ) : (
              <span>Orders: 0/3</span>
            )}
          </button>

          <span className="hidden text-[#6b4931] xl:inline" aria-hidden="true">
            ·
          </span>

          <span className="font-pixel hidden whitespace-nowrap text-[11px] text-[#d4b88c] xl:inline">
            {leadOrder ? RACES[leadOrder.race].kingdomName : 'Aldermere'}: {leadTier.label}
          </span>
        </div>

        {/* Right Cluster: Navigation Buttons */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenModal('orders')}
            aria-label={STRINGS.hud.orders}
            className={`forge-button font-pixel cursor-pointer whitespace-nowrap px-2.5 py-1.5 text-[11px] ${
              activeModal === 'orders' ? 'border-[#fde047]' : ''
            }`}
          >
            {STRINGS.hud.orders}
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('shop')}
            aria-label={STRINGS.hud.shop}
            className={`forge-button font-pixel cursor-pointer whitespace-nowrap px-2.5 py-1.5 text-[11px] ${
              activeModal === 'shop' ? 'border-[#fde047]' : ''
            }`}
          >
            {STRINGS.hud.shop}
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('inventory')}
            aria-label={STRINGS.hud.inventory}
            className={`forge-button font-pixel cursor-pointer whitespace-nowrap px-2.5 py-1.5 text-[11px] ${
              activeModal === 'inventory' ? 'border-[#fde047]' : ''
            }`}
          >
            {STRINGS.hud.inventory}
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('map')}
            aria-label={STRINGS.hud.map}
            className={`forge-button font-pixel cursor-pointer whitespace-nowrap px-2.5 py-1.5 text-[11px] ${
              activeModal === 'map' ? 'border-[#fde047]' : ''
            }`}
          >
            {STRINGS.hud.map}
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('achievements')}
            aria-label={STRINGS.hud.achievements}
            className={`forge-button font-pixel hidden cursor-pointer whitespace-nowrap px-2.5 py-1.5 text-[11px] sm:inline-flex sm:items-center ${
              activeModal === 'achievements' ? 'border-[#fde047]' : ''
            }`}
          >
            {STRINGS.hud.achievements}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={save.audio.muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            title="Mute [M]"
            className="forge-button font-pixel flex min-w-[40px] cursor-pointer items-center justify-center px-2 py-1.5 text-xs"
          >
            {save.audio.muted ? '🔇' : '🔊'}
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('settings')}
            aria-label="Settings [Esc]"
            title="Settings [Esc]"
            className="forge-button font-pixel flex min-w-[40px] cursor-pointer items-center justify-center px-2 py-1.5 text-xs"
          >
            ⚙
          </button>
        </div>
      </div>

      {(battleStatus.inProgressCount > 0 || battleStatus.readyCount > 0) && (
        <div
          role="group"
          aria-label="Battle status"
          data-testid="hud-battle-status"
          className="font-pixel flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 border border-[#6b4931] bg-[#1a110e]/95 px-2 py-1 text-[11px] text-[#f6e7cb]"
        >
          {battleStatus.inProgressCount > 0 && (
            <div data-testid="hud-battle-pending" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{battleStatus.inProgressCount} {battleStatus.inProgressCount === 1 ? 'battle' : 'battles'} in progress</span>
              <span className="tabular-nums text-[#d4b88c]">
                Next report in {formatBattleEta(battleStatus.nextEtaSec!)} (play time)
              </span>
            </div>
          )}
          {battleStatus.readyCount > 0 && (
            <button
              type="button"
              data-testid="hud-battle-ready"
              onClick={() => onOpenModal('battle')}
              aria-label={`${battleStatus.readyCount} ${battleStatus.readyCount === 1 ? 'battle report' : 'battle reports'} awaiting claim. Open next report`}
              className="forge-button-primary pointer-events-auto flex min-h-[36px] max-w-full cursor-pointer items-center gap-1 px-2.5 py-1.5 text-left text-[11px] font-bold"
            >
              <HudIconSprite icon="swords" size={14} label="Battle Report" />
              <span aria-live="polite" aria-atomic="true">
                {battleStatus.readyCount} {battleStatus.readyCount === 1 ? 'report' : 'reports'} awaiting claim
              </span>
            </button>
          )}
        </div>
      )}
      </div>

      {/* Bottom Compact Station Hint */}
      <div className="flex flex-col items-center gap-1">
        <div className="pointer-events-auto flex items-center gap-2 border border-[#6b4931] bg-[#1a110e]/95 px-2 py-1">
          <span data-testid="hud-world-cycle" className="font-pixel whitespace-nowrap text-[11px] font-bold text-[#fde047]">
            {STRINGS.worldCycle.dayLabel} {worldCycle.dayIndex} · {worldCycle.phase === 'night' ? STRINGS.worldCycle.night : STRINGS.worldCycle.day}
          </span>
          {worldCycle.phase === 'night' && (
            <button
              type="button"
              data-testid="skip-night"
              disabled={!canSkipNight}
              onClick={onSkipNight}
              title={canSkipNight ? STRINGS.worldCycle.skipHelp : STRINGS.worldCycle.skipUnavailable}
              className="forge-button font-pixel min-h-[30px] px-2 py-1 text-[11px]"
            >
              {STRINGS.worldCycle.skipNight}
            </button>
          )}
        </div>
        <span className="font-pixel bg-[#120c0a]/80 px-2.5 py-0.5 text-[10px] text-[#d4b88c]">
          Tap Stations · Orders (O) · Shop (S) · Vault (I) · Map (K) · Mute (M) · Esc Settings
        </span>
      </div>
    </div>
  );
};
