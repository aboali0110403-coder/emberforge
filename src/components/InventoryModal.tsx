import React, { useState } from 'react';
import { QUALITY_GRADE_META, RARITY_COLORS, RARITY_LABELS, getSmithProgress } from '../data/config';
import { MATERIALS } from '../data/materials';
import { RACES } from '../data/races';
import { WEAPONS } from '../data/weapons';
import { createWeaponInstance } from '../game/rules';
import type { RaceId, SaveState } from '../types';
import { MaterialSprite, WeaponSprite } from './PixelThumbnail';

interface InventoryModalProps {
  save: SaveState;
  onClose: () => void;
}

const RACE_ORDER: RaceId[] = ['human', 'demon', 'elf', 'goblin', 'orc'];

export const InventoryModal: React.FC<InventoryModalProps> = ({ save, onClose }) => {
  const [tab, setTab] = useState<'materials' | 'armory' | 'ledger'>('materials');
  const smithProg = getSmithProgress(save.smithXp);
  const armory = [...(save.weaponArmory ?? [])].reverse();
  const completedOrders = [...(save.completedOrders ?? [])].reverse();
  const battleHistory = [...(save.battleHistory ?? [])].reverse();
  const lastClosedDay = save.dailyLedger.closed[save.dailyLedger.closed.length - 1];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-2 sm:p-4 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#4a3222] pb-2">
          <div>
            <h2 className="font-display text-xl font-bold text-[#fde047]">
              Workshop Vault & Armory
            </h2>
            <p className="font-pixel text-xs text-[#d4b88c]">
              Smith Lv {smithProg.level} ({smithProg.title}) · {smithProg.currentLevelXp}/
              {smithProg.nextLevelXp} XP
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('materials')}
              className={`font-pixel cursor-pointer border-2 px-3 py-1.5 text-xs font-bold ${
                tab === 'materials'
                  ? 'border-[#fde047] bg-[#b45309] text-[#fffbeb]'
                  : 'border-[#6b4931] bg-[#241914] text-[#d4b88c]'
              }`}
            >
              Materials
            </button>
            <button
              type="button"
              onClick={() => setTab('armory')}
              className={`font-pixel cursor-pointer border-2 px-3 py-1.5 text-xs font-bold ${
                tab === 'armory'
                  ? 'border-[#fde047] bg-[#b45309] text-[#fffbeb]'
                  : 'border-[#6b4931] bg-[#241914] text-[#d4b88c]'
              }`}
            >
              Armory ({armory.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('ledger')}
              className={`font-pixel cursor-pointer border-2 px-3 py-1.5 text-xs font-bold ${
                tab === 'ledger'
                  ? 'border-[#fde047] bg-[#b45309] text-[#fffbeb]'
                  : 'border-[#6b4931] bg-[#241914] text-[#d4b88c]'
              }`}
            >
              Ledger
            </button>
            <button
              type="button"
              onClick={onClose}
              className="forge-button font-pixel cursor-pointer px-4 py-1.5 text-xs"
            >
              Close
            </button>
          </div>
        </div>

        {tab === 'materials' && (
          <div className="flex flex-col gap-3">
            <p className="font-pixel text-xs text-[#d4b88c]">
              Material Cycle: Goblin → Orc → Human → Demon → Elf → Goblin (1.5× Affinity)
            </p>
            {RACE_ORDER.map((sourceRace) => {
              const mats = MATERIALS.filter((m) => m.sourceRace === sourceRace);
              const targetRace = mats[0].targetRace;
              return (
                <div
                  key={sourceRace}
                  className="border border-[#4a3222] bg-[#17100d] p-3"
                >
                  <div className="font-pixel mb-2 text-xs font-bold text-[#f3dfb9]">
                    {RACES[sourceRace].plural} Drops · Best for{' '}
                    <span style={{ color: RACES[targetRace].palette.accent }}>
                      {RACES[targetRace].plural}
                    </span>{' '}
                    (×1.5 Potency)
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                    {mats.map((m) => {
                      const count = save.inventory[m.id] ?? 0;
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center gap-2 border p-2 ${
                            count > 0
                              ? 'border-[#6b4931] bg-[#241914]'
                              : 'border-[#2c1d16] bg-[#120c0a] opacity-50'
                          }`}
                        >
                          <MaterialSprite materialId={m.id} size={24} />
                          <div className="min-w-0">
                            <div
                              className="font-pixel truncate text-[11px] font-bold"
                              style={{ color: RARITY_COLORS[m.rarity] }}
                            >
                              {m.name}
                            </div>
                            <div className="font-pixel tabular-nums text-[10px] text-[#d4b88c]">
                              {RARITY_LABELS[m.rarity]} · ×{count}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'armory' && (
          <div className="flex flex-col gap-3">
            {armory.length === 0 ? (
              <p className="font-pixel py-8 text-center text-xs text-[#9ca3af]">
                No forged weapons archived yet. Deliver an order to catalog your craftsmanship!
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {armory.map((rec) => {
                  const preview = createWeaponInstance(rec.type, rec.level, rec.uid);
                  preview.stats = rec.stats;
                  preview.trait = rec.trait;
                  const gradeMeta = QUALITY_GRADE_META[rec.grade];
                  const wDef = WEAPONS[rec.type];
                  return (
                    <div
                      key={rec.uid}
                      className="flex items-center gap-3 border border-[#4a3222] bg-[#17100d] p-3"
                    >
                      <WeaponSprite weapon={preview} size={54} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-pixel truncate text-xs font-bold text-[#fffbeb]">
                            {rec.trait ? `[${rec.trait}] ` : ''}
                            {wDef.name} Lv {rec.level}
                          </span>
                          <span
                            className="font-pixel text-xs font-bold"
                            style={{ color: gradeMeta.color }}
                          >
                            {rec.grade} ({Math.round(rec.quality * 100)}%)
                          </span>
                        </div>
                        <div className="font-pixel text-[11px] text-[#d4b88c]">
                          For {rec.customerName} ({RACES[rec.race].name})
                        </div>
                        <div className="font-pixel mt-1 flex flex-wrap gap-2 text-[10px] tabular-nums text-[#93c5fd]">
                          <span>PWR {rec.stats.power}</span>
                          <span>EDGE {rec.stats.edge}</span>
                          <span>BAL {rec.stats.balance}</span>
                          <span>DUR {rec.stats.durability}</span>
                          {rec.stats.arcane > 0 && <span>ARC {rec.stats.arcane}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'ledger' && (
          <div className="flex shrink-0 flex-col gap-4">
            <section
              aria-labelledby="last-closed-day-heading"
              className="min-w-0 shrink-0 border border-[#4a3222] bg-[#17100d] p-3 font-pixel text-xs text-[#f6e7cb]"
            >
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 id="last-closed-day-heading" className="min-w-0 break-words font-bold text-[#fde047]">
                  Last recorded closed day{lastClosedDay && `: Day ${lastClosedDay.dayIndex}`}
                </h3>
                {lastClosedDay && (
                  <p className="min-w-0 break-words">
                    Coverage: {lastClosedDay.coverage === 'complete' ? 'Complete' : 'Partial'}
                  </p>
                )}
              </div>
              {lastClosedDay ? (
                <>
                  <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="min-w-0">
                      <dt className="break-words">Deliveries completed</dt>
                      <dd className="break-all text-sm font-bold tabular-nums">{lastClosedDay.deliveries}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="break-words">Orders missed</dt>
                      <dd className="break-all text-sm font-bold tabular-nums">{lastClosedDay.missed}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="break-words">Delivery gold earned</dt>
                      <dd className="break-all text-sm font-bold tabular-nums">{lastClosedDay.deliveryGold}g</dd>
                    </div>
                  </dl>
                  {lastClosedDay.coverage === 'partial' && (
                    <p className="mt-2 break-words">Partial record. Some activity may be missing.</p>
                  )}
                </>
              ) : (
                <p className="mt-2 break-words">No closed-day summary available.</p>
              )}
            </section>
            <div className="grid grid-cols-2 gap-2 border border-[#4a3222] bg-[#17100d] p-3 font-pixel text-xs sm:grid-cols-4">
              <div>
                <div className="text-[#9ca3af]">Orders Built</div>
                <div className="text-sm font-bold text-[#fde047]">{save.stats.ordersCompleted}</div>
              </div>
              <div>
                <div className="text-[#9ca3af]">S Masterworks</div>
                <div className="text-sm font-bold text-[#fbbf24]">{save.stats.masterworkCount ?? 0}</div>
              </div>
              <div>
                <div className="text-[#9ca3af]">Battles Won / Lost</div>
                <div className="text-sm font-bold text-[#4ade80]">
                  {save.stats.battlesWon ?? 0} / {save.stats.battlesLost ?? 0}
                </div>
              </div>
              <div>
                <div className="text-[#9ca3af]">Total Gold Earned</div>
                <div className="text-sm font-bold text-[#facc15]">{save.stats.totalGoldEarned}g</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="border border-[#4a3222] bg-[#17100d] p-3">
                <h3 className="font-pixel mb-2 text-xs font-bold text-[#fde047]">
                  Recent Completed Orders
                </h3>
                {completedOrders.length === 0 ? (
                  <p className="font-pixel text-xs text-[#9ca3af]">None recorded yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {completedOrders.slice(0, 12).map((co) => (
                      <div
                        key={co.id}
                        className="flex items-center justify-between border border-[#362419] bg-[#120c0a] px-2 py-1.5 font-pixel text-[11px]"
                      >
                        <span className="truncate text-[#f3dfb9]">
                          {WEAPONS[co.weaponType].name} Lv{co.weaponLevel} · {co.customerName}
                        </span>
                        <span className="shrink-0 tabular-nums text-[#facc15]">
                          {co.grade} · +{co.goldEarned}g
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-[#4a3222] bg-[#17100d] p-3">
                <h3 className="font-pixel mb-2 text-xs font-bold text-[#93c5fd]">
                  Recent Battle Outcomes
                </h3>
                {battleHistory.length === 0 ? (
                  <p className="font-pixel text-xs text-[#9ca3af]">No battle reports claimed yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {battleHistory.slice(0, 12).map((bh) => (
                      <div
                        key={bh.battleId}
                        className="flex items-center justify-between border border-[#362419] bg-[#120c0a] px-2 py-1.5 font-pixel text-[11px]"
                      >
                        <span className="truncate text-[#f3dfb9]">
                          {bh.scenarioName} ({bh.customerName})
                        </span>
                        <span
                          className={`shrink-0 font-bold ${
                            bh.won ? 'text-[#4ade80]' : 'text-[#f87171]'
                          }`}
                        >
                          {bh.won ? 'WIN' : 'LOSS'} ({bh.satisfaction}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
