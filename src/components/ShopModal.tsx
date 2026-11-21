import React, { useState } from 'react';
import { RARITY_COLORS, RARITY_LABELS } from '../data/config';
import { EQUIPMENT_LIST } from '../data/equipment';
import { MATERIALS, MATERIAL_BY_ID } from '../data/materials';
import { RACES } from '../data/races';
import { getEquipmentUpgradeCost, getMaterialSellPrice } from '../game/rules';
import { STRINGS } from '../strings';
import type { EquipmentId, SaveState } from '../types';
import { EquipmentSprite, MaterialSprite } from './PixelThumbnail';

interface ShopModalProps {
  save: SaveState;
  onClose: () => void;
  onBuyMaterial: (materialId: string, price: number, isRotating: boolean) => void;
  onSellMaterial: (materialId: string) => void;
  onUpgradeEquipment: (equipmentId: EquipmentId, cost: number) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  save,
  onClose,
  onBuyMaterial,
  onSellMaterial,
  onUpgradeEquipment,
}) => {
  const [tab, setTab] = useState<'materials' | 'equipment'>('materials');
  const standardMats = MATERIALS.filter(
    (m) => m.rarity === 'common' || m.rarity === 'uncommon',
  );
  const surplusMats = MATERIALS.filter((m) => (save.inventory[m.id] ?? 0) > 0);
  const anyRenowned = Object.values(save.popularity).some((v) => v >= 140);

  const refreshMin = Math.floor(save.rotatingStockTimerSec / 60);
  const refreshSec = Math.floor(save.rotatingStockTimerSec % 60);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-2 sm:p-4 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[92vh] w-full max-w-4xl flex-col gap-3 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#4a3222] pb-2">
          <div className="flex items-center gap-4">
            <h2 className="font-display text-xl font-bold text-[#fde047]">
              {STRINGS.shop.title}
            </h2>
            <span className="font-pixel tabular-nums text-sm font-bold text-[#facc15]">
              Gold: {Math.round(save.gold)}g
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('materials')}
              className={`font-pixel cursor-pointer border-2 px-3 py-2 text-xs font-bold ${
                tab === 'materials'
                  ? 'border-[#fde047] bg-[#b45309] text-[#fffbeb]'
                  : 'border-[#6b4931] bg-[#241914] text-[#d4b88c]'
              }`}
            >
              {STRINGS.shop.materialsTab}
            </button>
            <button
              type="button"
              onClick={() => setTab('equipment')}
              className={`font-pixel cursor-pointer border-2 px-3 py-2 text-xs font-bold ${
                tab === 'equipment'
                  ? 'border-[#fde047] bg-[#b45309] text-[#fffbeb]'
                  : 'border-[#6b4931] bg-[#241914] text-[#d4b88c]'
              }`}
            >
              {STRINGS.shop.equipmentTab}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="forge-button font-pixel cursor-pointer px-4 py-2 text-xs"
            >
              Close
            </button>
          </div>
        </div>

        {tab === 'materials' ? (
          <div className="flex flex-col gap-4">
            {/* Rotating Rare & Renowned Epic Stock */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-pixel text-xs font-bold text-[#60a5fa]">
                  {STRINGS.shop.rotatingTitle}
                  {anyRenowned && ' + Renowned Epic'}
                </h3>
                <span className="font-pixel tabular-nums text-xs text-[#9ca3af]">
                  Refreshes in {refreshMin}:{refreshSec.toString().padStart(2, '0')}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {save.rotatingStock.map((item) => {
                  const mat = MATERIAL_BY_ID[item.materialId];
                  if (!mat) return null;
                  const canAfford = save.gold >= item.price && item.stock > 0;
                  return (
                    <div
                      key={item.materialId}
                      className="flex items-center justify-between gap-2 border border-[#3b82f6]/50 bg-[#17100d] p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <MaterialSprite materialId={mat.id} size={28} />
                        <div>
                          <div
                            className="font-pixel text-xs font-bold"
                            style={{ color: RARITY_COLORS[mat.rarity] }}
                          >
                            {mat.name}
                          </div>
                          <div className="font-pixel text-[10px] text-[#b89f7d]">
                            For {RACES[mat.targetRace].name} · Stock: {item.stock} · Own:{' '}
                            {save.inventory[mat.id] ?? 0}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuyMaterial(mat.id, item.price, true)}
                        className="forge-button-primary font-pixel cursor-pointer px-3 py-1.5 text-xs font-bold tabular-nums"
                      >
                        {item.stock > 0 ? `${item.price}g` : STRINGS.shop.soldOut}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Always-In-Stock Common & Uncommon */}
            <div>
              <h3 className="font-pixel mb-2 text-xs font-bold text-[#f3dfb9]">
                {STRINGS.shop.alwaysStockTitle}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {standardMats.map((mat) => {
                  const canAfford = save.gold >= mat.basePrice;
                  return (
                    <div
                      key={mat.id}
                      className="flex items-center justify-between gap-2 border border-[#4a3222] bg-[#17100d] p-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <MaterialSprite materialId={mat.id} size={28} />
                        <div>
                          <div
                            className="font-pixel text-xs font-bold"
                            style={{ color: RARITY_COLORS[mat.rarity] }}
                          >
                            {mat.name} ({RARITY_LABELS[mat.rarity]})
                          </div>
                          <div className="font-pixel tabular-nums text-[10px] text-[#b89f7d]">
                            Pot {mat.potency} · Best on {RACES[mat.targetRace].name} · Own:{' '}
                            {save.inventory[mat.id] ?? 0}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuyMaterial(mat.id, mat.basePrice, false)}
                        className="forge-button font-pixel cursor-pointer px-3 py-1.5 text-xs font-bold tabular-nums text-[#fde047]"
                      >
                        Buy {mat.basePrice}g
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sell Surplus Materials (50% base value) */}
            {surplusMats.length > 0 && (
              <div>
                <h3 className="font-pixel mb-2 text-xs font-bold text-[#d4b88c]">
                  Sell Surplus Materials (50% Value)
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {surplusMats.map((mat) => {
                    const owned = save.inventory[mat.id] ?? 0;
                    const sellPrice = getMaterialSellPrice(mat.id);
                    return (
                      <div
                        key={mat.id}
                        className="flex items-center justify-between gap-2 border border-[#362419] bg-[#120c0a] p-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <MaterialSprite materialId={mat.id} size={22} />
                          <div className="min-w-0">
                            <div
                              className="font-pixel truncate text-[11px] font-bold"
                              style={{ color: RARITY_COLORS[mat.rarity] }}
                            >
                              {mat.name}
                            </div>
                            <div className="font-pixel tabular-nums text-[10px] text-[#9ca3af]">
                              Own ×{owned}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSellMaterial(mat.id)}
                          className="forge-button font-pixel cursor-pointer px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#4ade80]"
                        >
                          Sell +{sellPrice}g
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EQUIPMENT_LIST.map((eq) => {
              const tier = save.equipment[eq.id];
              const isMax = tier >= 5;
              const cost = getEquipmentUpgradeCost(tier);
              const canAfford = !isMax && save.gold >= cost;

              return (
                <div
                  key={eq.id}
                  className="flex flex-col justify-between gap-2 border border-[#4a3222] bg-[#17100d] p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="border border-[#6b4931] bg-[#120c0a] p-1">
                      <EquipmentSprite equipmentId={eq.id} tier={tier} size={56} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-display text-base font-bold text-[#fde047]">
                          {eq.name} · Tier {tier}/5
                        </span>
                        <span className="font-pixel text-xs text-[#93c5fd]">
                          {eq.tierNames[tier - 1]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#d4b88c]">{eq.effectSummary}</p>
                      <p className="font-pixel mt-1 text-[11px] text-[#4ade80]">
                        Current: {eq.tierBonuses[tier - 1]}
                      </p>
                      {!isMax && (
                        <p className="font-pixel mt-0.5 text-[11px] text-[#fbbf24]">
                          Next (T{tier + 1}): {eq.tierBonuses[tier]}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isMax || !canAfford}
                    onClick={() => onUpgradeEquipment(eq.id, cost)}
                    className={`${
                      isMax ? 'forge-button' : 'forge-button-primary'
                    } font-pixel w-full cursor-pointer py-2 text-xs font-bold tabular-nums`}
                  >
                    {isMax
                      ? STRINGS.shop.maxedBtn
                      : `${STRINGS.shop.upgradeBtn} to T${tier + 1} (${cost}g)`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
