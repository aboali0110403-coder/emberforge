import React from 'react';
import { getSmithProgress } from '../data/config';
import { RACES } from '../data/races';
import { getPopularityTier } from '../game/rules';
import { STRINGS } from '../strings';
import type { ActiveModal, SaveState } from '../types';
import { HudIconSprite } from './PixelThumbnail';

interface HudOverlayProps {
  save: SaveState;
  activeModal: ActiveModal;
  onOpenModal: (m: Exclude<ActiveModal, null>) => void;
  onToggleMute: () => void;
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  save,
  activeModal,
  onOpenModal,
  onToggleMute,
}) => {
  const readyBattles = save.pendingBattles.filter((b) => b.ready);
  const leadOrder = save.orders[0];
  const leadTier = leadOrder
    ? getPopularityTier(save.popularity[leadOrder.race])
    : getPopularityTier(save.popularity.human);
  const smithProg = getSmithProgress(save.smithXp);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-1.5 sm:p-2.5 safe-area-inset">
      {/* Single-row compact perimeter HUD bar */}
      <div className="flex flex-nowrap items-center justify-between gap-1.5 overflow-x-auto">
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

        {/* Right Cluster: Battle Messenger Alert + Navigation Buttons */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-1">
          {readyBattles.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenModal('battle')}
              className="forge-button-primary font-pixel flex cursor-pointer items-center gap-1 whitespace-nowrap px-2.5 py-1.5 text-[11px] font-bold"
            >
              <HudIconSprite icon="swords" size={14} label="Battle Report" />
              <span>Report ({readyBattles.length})</span>
            </button>
          )}

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

      {/* Bottom Compact Station Hint */}
      <div className="flex justify-center">
        <span className="font-pixel bg-[#120c0a]/80 px-2.5 py-0.5 text-[10px] text-[#d4b88c]">
          Tap Stations · Orders (O) · Shop (S) · Vault (I) · Map (K) · Mute (M) · Esc Settings
        </span>
      </div>
    </div>
  );
};
