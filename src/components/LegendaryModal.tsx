import React from 'react';
import { RACES } from '../data/races';
import { WEAPONS } from '../data/weapons';
import { getLegendaryMultiplier } from '../game/rules';
import type { KingLetter, Order } from '../types';
import { PortraitSprite, WeaponSprite } from './PixelThumbnail';

interface LegendaryModalProps {
  order: Order;
  milestoneLevel: number;
  letter: KingLetter;
  popBonus: number;
  onClose: () => void;
}

export const LegendaryModal: React.FC<LegendaryModalProps> = ({
  order,
  milestoneLevel,
  letter,
  popBonus,
  onClose,
}) => {
  const race = RACES[order.race];
  const weaponDef = WEAPONS[order.weapon.type];
  const mult = getLegendaryMultiplier(milestoneLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-5 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[94vh] w-full max-w-xl flex-col gap-4 overflow-y-auto border-2 border-[#fde047] p-5">
        <div className="text-center">
          <div className="font-pixel text-xs font-bold tracking-widest text-[#f59e0b]">
            LEGENDARY MILESTONE · LEVEL {milestoneLevel}
          </div>
          <h2 className="font-display mt-1 text-2xl font-bold text-[#fde047]">
            Legendary Milestone Reached!
          </h2>
        </div>

        {/* Customer Amazed Reaction */}
        <div className="flex items-center gap-3 border border-[#6b4931] bg-[#17100d] p-3">
          <PortraitSprite race={order.race} variant={order.portraitVariant} size={56} />
          <WeaponSprite weapon={order.weapon} size={56} />
          <div className="flex-1 text-xs">
            <p className="font-pixel font-bold text-[#fffbeb]">
              {order.customerName} stares in awe!
            </p>
            <p className="mt-1 text-[#d4b88c]">
              "By the stars! This {weaponDef.name} radiates pure power! Every smith in{' '}
              {race.kingdomName} will speak of your name!"
            </p>
            <p className="font-pixel mt-1 text-[#4ade80]">
              +{popBonus} Popularity · ×{mult} Battle Material Rewards!
            </p>
          </div>
        </div>

        {/* Parchment Royal Letter */}
        <div className="border-2 border-[#b45309] bg-[#f3dfb9] p-4 text-[#2c190e] shadow-inner">
          <div className="flex items-center gap-3 border-b border-[#b08d57] pb-2">
            <PortraitSprite race={order.race} variant={0} isKing size={40} />
            <div>
              <h3 className="font-display text-lg font-bold">{letter.title}</h3>
              <span className="font-pixel text-[11px] text-[#6b4931]">
                From the Court of {race.kingdomName}
              </span>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-line font-display text-sm leading-relaxed">
            {letter.body}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="forge-button-primary font-pixel w-full cursor-pointer py-3 text-sm font-bold"
        >
          Honor the Realm & Continue
        </button>
      </div>
    </div>
  );
};
