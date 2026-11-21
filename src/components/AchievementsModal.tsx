import React from 'react';
import { ACHIEVEMENTS } from '../data/achievements';
import type { SaveState } from '../types';

interface AchievementsModalProps {
  save: SaveState;
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  save,
  onClose,
}) => {
  const unlockedSet = new Set(save.achievementsUnlocked);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-2 sm:p-4 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[92vh] w-full max-w-4xl flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center justify-between border-b border-[#4a3222] pb-2">
          <div>
            <h2 className="font-display text-xl font-bold text-[#fde047]">
              Guild Deeds & Achievements
            </h2>
            <p className="font-pixel tabular-nums text-xs text-[#d4b88c]">
              Unlocked: {unlockedSet.size} / {ACHIEVEMENTS.length} · Orders:{' '}
              {save.stats.ordersCompleted} · Best Streak: {save.stats.bestPerfectStreak}
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACHIEVEMENTS.map((ach) => {
            const done = unlockedSet.has(ach.id);
            return (
              <div
                key={ach.id}
                className={`flex items-center justify-between gap-3 border p-3 ${
                  done
                    ? 'border-[#fde047] bg-[#2e2016]'
                    : 'border-[#3b2619] bg-[#17100d] opacity-70'
                }`}
              >
                <div>
                  <div className="font-pixel text-xs font-bold text-[#fffbeb]">
                    {done ? '★ ' : '○ '}
                    {ach.title}
                  </div>
                  <div className="mt-0.5 text-xs text-[#d4b88c]">
                    {ach.description}
                  </div>
                </div>
                <span
                  className={`font-pixel shrink-0 tabular-nums text-xs font-bold ${
                    done ? 'text-[#4ade80]' : 'text-[#eab308]'
                  }`}
                >
                  {done ? 'Claimed' : `+${ach.goldReward}g`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
