import React, { useState } from 'react';
import { BALANCE, DEFAULT_BALANCE, resetBalance } from '../data/balance';
import type { BalanceConfig } from '../data/balance';

interface DebugPanelProps {
  onClose: () => void;
  onGrantResources: () => void;
  onFastForwardBattles: () => void;
  onAddPopularities: () => void;
}

const NUMERIC_KEYS: (keyof BalanceConfig)[] = [
  'levelBaseChance',
  'levelQualityWeight',
  'levelPotencyWeight',
  'levelPenaltyPerLevel',
  'preqBase',
  'preqPerLevel',
  'rarityInsufficientCap',
  'affinityTargetRace',
  'affinityGeneralWeapon',
  'affinityOtherRace',
  'popularityWinBase',
  'furnaceDurationSec',
  'grindstoneDurationSec',
  'quenchDurationSec',
];

export const DebugPanel: React.FC<DebugPanelProps> = ({
  onClose,
  onGrantResources,
  onFastForwardBattles,
  onAddPopularities,
}) => {
  const [, setTick] = useState(0);

  return (
    <div className="fixed right-2 top-14 z-50 w-80 border-2 border-[#f59e0b] bg-[#120c0a]/95 p-3 text-xs text-[#f6e7cb] shadow-2xl">
      <div className="mb-2 flex items-center justify-between border-b border-[#4a3222] pb-1.5">
        <span className="font-pixel font-bold text-[#fde047]">
          Balance Debug (Key D)
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              resetBalance();
              setTick((t) => t + 1);
            }}
            className="cursor-pointer border border-[#6b4931] px-2 py-0.5 text-[10px]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[#6b4931] px-2 py-0.5 text-[10px]"
          >
            ×
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onGrantResources}
          className="cursor-pointer border border-[#4ade80] bg-[#14532d] px-2 py-1 text-[10px]"
        >
          +500g & Mats
        </button>
        <button
          type="button"
          onClick={onFastForwardBattles}
          className="cursor-pointer border border-[#60a5fa] bg-[#1e3a8a] px-2 py-1 text-[10px]"
        >
          Battles Ready
        </button>
        <button
          type="button"
          onClick={onAddPopularities}
          className="cursor-pointer border border-[#c084fc] bg-[#581c87] px-2 py-1 text-[10px]"
        >
          +30 All Pop
        </button>
      </div>

      <div className="forge-scroll flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
        {NUMERIC_KEYS.map((key) => (
          <label key={key} className="flex items-center justify-between gap-2">
            <span className="font-pixel truncate text-[10px] text-[#d4b88c]">
              {key}
            </span>
            <input
              type="number"
              step={DEFAULT_BALANCE[key] >= 1 ? 0.5 : 0.05}
              value={BALANCE[key]}
              onChange={(e) => {
                BALANCE[key] = Number(e.target.value);
                setTick((t) => t + 1);
              }}
              className="font-pixel w-20 border border-[#4a3222] bg-[#1f1612] px-1.5 py-0.5 text-right text-[11px] text-[#fffbeb]"
            />
          </label>
        ))}
      </div>
    </div>
  );
};
