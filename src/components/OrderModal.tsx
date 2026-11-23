import React, { useEffect, useState } from 'react';
import { getStageLabel, getStageMinRarity } from '../data/balance';
import { RARITY_COLORS, RARITY_LABELS, getSmithProgress } from '../data/config';
import { MATERIALS, MATERIAL_BY_ID } from '../data/materials';
import { ENEMY_ARCHETYPE_INFO, RACES } from '../data/races';
import { WEAPONS, getStepsForRequest } from '../data/weapons';
import {
  applyForgeUpgradesToWeapon,
  canUseMaterialWithFurnace,
  evaluateBattlePreview,
  evaluateLevelUp,
  getEnemyArchetypeForScenario,
  getMaterialAffinity,
} from '../game/rules';
import { compareMaterialCommitment } from '../game/materialCommitment';
import { canReceiveNewOrders } from '../game/worldCycle';
import { STRINGS } from '../strings';
import type {
  MaterialShape,
  MaterialStackSelection,
  Order,
  SaveState,
  StationId,
} from '../types';
import { MaterialSprite, PortraitSprite, WeaponSprite } from './PixelThumbnail';

interface OrderModalProps {
  save: SaveState;
  summonCooldownSec: number;
  onClose: () => void;
  onSummonCustomer: () => void;
  onStartForge: (
    order: Order,
    steps: StationId[],
    targetPart: string,
    materials: MaterialStackSelection[],
  ) => void;
}

const ALL_STATIONS: StationId[] = [
  'furnace',
  'anvil',
  'grindstone',
  'quench',
  'workbench',
];

const SHAPE_TAGS: Record<MaterialShape, string> = {
  ingot: '+PWR/DUR',
  hide: '+DUR/BAL',
  wood: '+BAL/PWR',
  thread: '+EDGE/BAL',
  crystal: '+ARC/EDGE',
};

export const OrderModal: React.FC<OrderModalProps> = ({
  save,
  summonCooldownSec,
  onClose,
  onSummonCustomer,
  onStartForge,
}) => {
  const nightClosed = !canReceiveNewOrders(save.activePlaySec);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    save.orders[0]?.id ?? '',
  );
  const [stacks, setStacks] = useState<MaterialStackSelection[]>([]);
  const [royalPart, setRoyalPart] = useState<string>('');
  const [royalSteps, setRoyalSteps] = useState<StationId[]>([
    'furnace',
    'anvil',
    'grindstone',
    'quench',
  ]);

  const activeOrder =
    save.orders.find((o) => o.id === selectedOrderId) ?? save.orders[0] ?? null;

  useEffect(() => {
    if (activeOrder) {
      setSelectedOrderId(activeOrder.id);
      setRoyalPart(activeOrder.targetPart);
    }
  }, [activeOrder?.id]);

  const ownedMaterials = MATERIALS.filter((m) => (save.inventory[m.id] ?? 0) > 0);
  const furnaceTier = save.equipment.furnace;
  const smithLevel = getSmithProgress(save.smithXp).level;

  const toggleMaterial = (materialId: string, delta: number) => {
    const owned = save.inventory[materialId] ?? 0;
    const mat = MATERIAL_BY_ID[materialId];
    if (!mat || !canUseMaterialWithFurnace(mat, furnaceTier)) return;

    setStacks((prev) => {
      const idx = prev.findIndex((s) => s.materialId === materialId);
      if (idx === -1) {
        if (delta <= 0 || prev.length >= 3 || owned <= 0) return prev;
        return [...prev, { materialId, units: 1 }];
      }
      const nextUnits = Math.max(0, Math.min(5, Math.min(owned, prev[idx].units + delta)));
      if (nextUnits === 0) {
        return prev.filter((s) => s.materialId !== materialId);
      }
      return prev.map((s, i) => (i === idx ? { ...s, units: nextUnits } : s));
    });
  };

  const addRoyalStep = (st: StationId) => {
    if (royalSteps.length >= 6) return;
    setRoyalSteps((prev) => [...prev, st]);
  };

  const removeRoyalStep = (index: number) => {
    setRoyalSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const levelEval = activeOrder
    ? evaluateLevelUp(
        activeOrder.weapon.level,
        activeOrder.weapon.type,
        0.85,
        stacks,
      )
    : null;

  // Presentation-only truthfulness at the cap: production progression caps
  // weapon level at 20 and rollWeaponLevelUp performs no Level-Up RNG roll
  // for an incoming weapon already at level 20 or higher, so a probabilistic
  // Level-Up estimate would be misleading there.
  const incomingAtMaxLevel = activeOrder !== null && activeOrder.weapon.level >= 20;

  const materialCommitment = activeOrder
    ? compareMaterialCommitment(activeOrder, save, stacks)
    : null;

  const totalUnitsSelected = stacks.reduce((sum, s) => sum + s.units, 0);
  const showUnreinforcedWarn =
    activeOrder &&
    activeOrder.weapon.level >= 3 &&
    totalUnitsSelected === 0 &&
    activeOrder.kind !== 'royal';

  const battlePreview = activeOrder
    ? (() => {
        const previewUpgrade = applyForgeUpgradesToWeapon(
          activeOrder.weapon,
          activeOrder.kind === 'royal' ? royalPart : activeOrder.targetPart,
          0.85,
          stacks,
          save.equipment,
          activeOrder.weapon.level,
          activeOrder.requestFocus,
        );
        return evaluateBattlePreview({
          weapon: previewUpgrade.updated,
          race: activeOrder.race,
          scenarioName: activeOrder.scenarioName,
          scenarioDifficulty: activeOrder.scenarioDifficulty,
          enemyArchetype: activeOrder.enemyArchetype,
          smithLevel,
          quality: 0.85,
        });
      })()
    : null;

  const activeArchetype = activeOrder
    ? getEnemyArchetypeForScenario(
        activeOrder.race,
        activeOrder.scenarioName,
        activeOrder.enemyArchetype,
      )
    : 'skirmishers';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-2 sm:p-4 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[92vh] w-full max-w-4xl flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center justify-between border-b border-[#4a3222] pb-2">
          <h2 className="font-display text-xl font-bold text-[#fde047]">
            {STRINGS.orders.modalTitle}
          </h2>
          <div className="flex items-center gap-2">
            {save.orders.length < 3 && (
              <button
                type="button"
                disabled={nightClosed || summonCooldownSec > 0}
                onClick={onSummonCustomer}
                className="forge-button font-pixel cursor-pointer px-3 py-2 text-xs text-[#fde047]"
              >
                {nightClosed
                  ? STRINGS.worldCycle.nightClosedShort
                  : summonCooldownSec > 0
                    ? `Door Cooldown (${Math.ceil(summonCooldownSec)}s)`
                    : STRINGS.orders.summonCustomer}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="forge-button font-pixel cursor-pointer px-4 py-2 text-xs"
            >
              Close
            </button>
          </div>
        </div>

        {nightClosed && (
          <p data-testid="night-closed" className="font-pixel border border-[#6b4931] bg-[#120c0a] px-3 py-2 text-xs text-[#fde047]">
            {STRINGS.worldCycle.nightClosed}
          </p>
        )}

        {!save.tutorialsSeen.firstOrder && activeOrder?.isTutorial && (
          <div className="border border-[#f59e0b] bg-[#2e1e12] p-3 text-xs text-[#fef08a]">
            <p className="font-pixel font-bold">{STRINGS.tutorials.firstOrderTitle}</p>
            <p className="mt-1 text-[#f6e7cb]">{STRINGS.tutorials.firstOrderBody}</p>
          </div>
        )}

        {save.orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-pixel text-sm text-[#d4b88c]">{STRINGS.orders.noOrders}</p>
            <button
              type="button"
              disabled={nightClosed || summonCooldownSec > 0}
              onClick={onSummonCustomer}
              className="forge-button-primary font-pixel cursor-pointer px-5 py-3 text-sm font-bold"
            >
              {nightClosed
                ? STRINGS.worldCycle.nightClosedShort
                : summonCooldownSec > 0
                  ? `Door Cooldown (${Math.ceil(summonCooldownSec)}s)`
                  : STRINGS.orders.summonCustomer}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
            {/* Left: Order List */}
            <div className="flex flex-col gap-2">
              {save.orders.map((ord) => {
                const race = RACES[ord.race];
                const wDef = WEAPONS[ord.weapon.type];
                const active = ord.id === activeOrder?.id;
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(ord.id);
                      setStacks([]);
                      setRoyalPart(ord.targetPart);
                    }}
                    className={`flex cursor-pointer items-center gap-2.5 border-2 p-2.5 text-left ${
                      active
                        ? 'border-[#fde047] bg-[#362419]'
                        : 'border-[#4a3222] bg-[#17100d] hover:border-[#8c6239]'
                    }`}
                  >
                    <PortraitSprite
                      race={ord.race}
                      variant={ord.portraitVariant}
                      isKing={ord.kind === 'royal'}
                      size={42}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-pixel truncate text-xs font-bold text-[#fffbeb]">
                        {ord.customerName}
                      </div>
                      <div className="font-pixel text-[11px] text-[#d4b88c]">
                        {race.name} · {wDef.name} Lv {ord.weapon.level}
                      </div>
                      <div className="font-pixel tabular-nums text-[11px] text-[#f59e0b]">
                        {ord.baseFee}g · {Math.ceil(ord.remainingSec)}s
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Active Order Detail & Material Config */}
            {activeOrder && (
              <div className="flex flex-col gap-3 border border-[#4a3222] bg-[#17100d] p-3">
                {/* Customer Counter Dialogue Card */}
                <div className="flex flex-col gap-2 border border-[#6b4931] bg-[#211611] p-2.5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <PortraitSprite
                      race={activeOrder.race}
                      variant={activeOrder.portraitVariant}
                      isKing={activeOrder.kind === 'royal'}
                      size={48}
                    />
                    <div className="sm:hidden">
                      <div className="font-pixel text-xs font-bold text-[#fffbeb]">
                        {activeOrder.customerName}
                      </div>
                      <div className="font-pixel text-[10px] text-[#d4b88c]">
                        {RACES[activeOrder.race].name} Patron
                      </div>
                    </div>
                  </div>
                  <div className="relative flex-1 border border-[#4a3222] bg-[#120c0a] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-pixel text-[11px] font-bold text-[#fde047]">
                        {activeOrder.customerName} ({RACES[activeOrder.race].kingdomName})
                      </span>
                      <span
                        className={`font-pixel tabular-nums text-[10px] font-bold ${
                          activeOrder.remainingSec / Math.max(1, activeOrder.deadlineSec) < 0.35
                            ? 'text-[#f87171]'
                            : 'text-[#4ade80]'
                        }`}
                      >
                        Patience {Math.ceil(activeOrder.remainingSec)}s
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs italic text-[#f6e7cb]">
                      "{activeOrder.requestText}"
                    </p>
                  </div>
                </div>

                <div className="border border-[#4a3222] bg-[#120c0a] px-3 py-2 text-xs text-[#f6e7cb]">
                  <p data-testid="order-deadline-rule">
                    {activeOrder.isTutorial
                      ? STRINGS.orders.timing.tutorial
                      : STRINGS.orders.timing.ordinary}
                  </p>
                  <details key={activeOrder.id} data-testid="order-timing-help" className="mt-1">
                    <summary className="font-pixel cursor-pointer py-1 text-[11px] text-[#fde047]">
                      {STRINGS.orders.timing.summary}
                    </summary>
                    <ul className="mt-2 list-disc space-y-2 pl-4 leading-relaxed">
                      <li>{STRINGS.orders.timing.pause}</li>
                      <li>{STRINGS.orders.timing.skip}</li>
                      <li>{STRINGS.orders.timing.prompt}</li>
                      <li>{STRINGS.orders.timing.warning}</li>
                      <li>{STRINGS.orders.timing.speed}</li>
                    </ul>
                  </details>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#362419] pb-3">
                  <div className="flex items-center gap-3">
                    <WeaponSprite weapon={activeOrder.weapon} size={56} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg font-bold text-[#fffbeb]">
                          {WEAPONS[activeOrder.weapon.type].name} (Lv {activeOrder.weapon.level})
                        </h3>
                        {activeOrder.kind === 'royal' && (
                          <span className="font-pixel text-xs font-bold text-[#fde047]">
                            ★ {STRINGS.orders.royalBadge}
                          </span>
                        )}
                      </div>
                      <p className="font-pixel text-[11px] text-[#9ca3af]">
                        {getStageLabel(activeOrder.weapon.level)} · Min Rarity:{' '}
                        <span style={{ color: RARITY_COLORS[getStageMinRarity(activeOrder.weapon.level)] }}>
                          {RARITY_LABELS[getStageMinRarity(activeOrder.weapon.level)]}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="font-pixel text-right text-xs tabular-nums">
                    <div className="font-bold text-[#fde047]">Base Fee: {activeOrder.baseFee}g</div>
                    <div className="text-[#93c5fd]">
                      Battle: {activeOrder.scenarioName}
                    </div>
                    {battlePreview && (
                      <div
                        className={`font-bold ${
                          battlePreview.winChancePct >= 70
                            ? 'text-[#4ade80]'
                            : battlePreview.winChancePct >= 50
                              ? 'text-[#fbbf24]'
                              : 'text-[#f87171]'
                        }`}
                      >
                        Est. Win Odds: {battlePreview.winChancePct}% ({battlePreview.matchupLabel})
                      </div>
                    )}
                  </div>
                </div>

                {battlePreview && (
                  <p
                    data-testid="battle-preview-assumptions"
                    className="font-pixel -mt-2 text-[11px] leading-relaxed text-[#b89f7d]"
                  >
                    {STRINGS.orders.battlePreviewAssumptions}
                  </p>
                )}

                {/* Enemy Archetype Tactical Hint + Current Weapon Stats */}
                <div className="flex flex-col gap-1 border border-[#362419] bg-[#120c0a] px-2.5 py-1.5 font-pixel text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[#f3dfb9]">
                      Enemy: {ENEMY_ARCHETYPE_INFO[activeArchetype].label}
                    </span>
                    <span className="text-[#93c5fd]">
                      {ENEMY_ARCHETYPE_INFO[activeArchetype].weaknessHint}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] tabular-nums text-[#d4b88c]">
                    <span>PWR {activeOrder.weapon.stats.power}</span>
                    <span>EDGE {activeOrder.weapon.stats.edge}</span>
                    <span>BAL {activeOrder.weapon.stats.balance}</span>
                    <span>DUR {activeOrder.weapon.stats.durability}</span>
                    {activeOrder.weapon.stats.arcane > 0 && (
                      <span className="text-[#c084fc]">ARC {activeOrder.weapon.stats.arcane}</span>
                    )}
                  </div>
                </div>

                {/* Royal Commission Master's Choice Builder */}
                {activeOrder.kind === 'royal' && (
                  <div className="flex flex-col gap-2 border border-[#6b4931] bg-[#211611] p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-pixel text-xs font-bold text-[#fde047]">
                        {STRINGS.orders.mastersChoice}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="royal-part-select" className="font-pixel text-xs text-[#d4b88c]">
                          Target Part:
                        </label>
                        <select
                          id="royal-part-select"
                          value={royalPart}
                          onChange={(e) => setRoyalPart(e.target.value)}
                          className="font-pixel border border-[#6b4931] bg-[#120c0a] px-2 py-1 text-xs text-[#fffbeb]"
                        >
                          {WEAPONS[activeOrder.weapon.type].parts.map((pk) => (
                            <option key={pk} value={pk}>
                              {WEAPONS[activeOrder.weapon.type].partLabels[pk]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {ALL_STATIONS.map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => addRoyalStep(st)}
                          disabled={royalSteps.length >= 6}
                          className="forge-button font-pixel cursor-pointer px-2.5 py-1.5 text-xs"
                        >
                          + {STRINGS.stations[st].title}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {royalSteps.map((st, idx) => (
                        <button
                          key={`${st}_${idx}`}
                          type="button"
                          onClick={() => removeRoyalStep(idx)}
                          title="Tap to remove step"
                          className="font-pixel cursor-pointer border border-[#f59e0b] bg-[#3b2619] px-2 py-1 text-xs text-[#fef08a]"
                        >
                          {idx + 1}. {STRINGS.stations[st].title} ×
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Material Selection */}
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-pixel text-xs font-bold text-[#f3dfb9]">
                      {STRINGS.orders.selectMaterials}
                    </span>
                    {levelEval && (
                      <span className="font-pixel tabular-nums text-xs text-[#4ade80]">
                        {incomingAtMaxLevel
                          ? 'Maximum weapon level reached (20)'
                          : `Est. Level-Up (85% Q): ${Math.round(levelEval.chance * 100)}%${!levelEval.meetsStageRarity ? ' (Cap 25%: low rarity)' : ''}`}
                      </span>
                    )}
                  </div>

                  {showUnreinforcedWarn && (
                    <div className="font-pixel mb-2 border border-[#b45309] bg-[#2e1e12] px-2.5 py-1.5 text-[11px] text-[#fbbf24]">
                      Lv 3+ Unreinforced Warning: Forging without materials incurs a 25% fee penalty and weaker battle odds.
                    </div>
                  )}

                  {ownedMaterials.length === 0 ? (
                    <p className="font-pixel text-xs text-[#9ca3af]">
                      No materials in inventory. Visit the Shop to buy supplies!
                    </p>
                  ) : (
                    <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                      {ownedMaterials.map((mat) => {
                        const count = save.inventory[mat.id] ?? 0;
                        const unlocked = canUseMaterialWithFurnace(mat, furnaceTier);
                        const selected =
                          stacks.find((s) => s.materialId === mat.id)?.units ?? 0;
                        const affinity = getMaterialAffinity(mat, activeOrder.weapon.type);

                        return (
                          <div
                            key={mat.id}
                            className={`flex items-center justify-between gap-2 border p-2 ${
                              selected > 0
                                ? 'border-[#fde047] bg-[#2e2016]'
                                : 'border-[#3b2619] bg-[#120c0a]'
                            } ${!unlocked ? 'opacity-50' : ''}`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <MaterialSprite materialId={mat.id} size={24} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="font-pixel truncate text-xs font-bold"
                                    style={{ color: RARITY_COLORS[mat.rarity] }}
                                  >
                                    {mat.name}
                                  </span>
                                  {affinity >= 1.5 && (
                                    <span className="font-pixel shrink-0 border border-[#ca8a04] bg-[#2e2016] px-1 text-[9px] font-bold text-[#fde047]">
                                      1.5× Match
                                    </span>
                                  )}
                                  {affinity < 1 && (
                                    <span className="font-pixel shrink-0 text-[9px] text-[#f87171]">
                                      0.6×
                                    </span>
                                  )}
                                </div>
                                <div className="font-pixel flex flex-wrap gap-x-1.5 tabular-nums text-[10px] text-[#b89f7d]">
                                  <span>Own {count} · Pot {mat.potency}</span>
                                  <span className="text-[#93c5fd]">{SHAPE_TAGS[mat.shape]}</span>
                                </div>
                              </div>
                            </div>

                            {unlocked ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label={`Remove ${mat.name}`}
                                  onClick={() => toggleMaterial(mat.id, -1)}
                                  disabled={selected === 0}
                                  className="forge-button font-pixel min-h-[36px] min-w-[36px] cursor-pointer px-2 text-xs font-bold"
                                >
                                  -
                                </button>
                                <span className="font-pixel w-5 text-center text-xs tabular-nums text-[#fffbeb]">
                                  {selected}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Add ${mat.name}`}
                                  onClick={() => toggleMaterial(mat.id, 1)}
                                  disabled={
                                    selected >= 5 ||
                                    selected >= count ||
                                    (selected === 0 && stacks.length >= 3)
                                  }
                                  className="forge-button font-pixel min-h-[36px] min-w-[36px] cursor-pointer px-2 text-xs font-bold"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <span className="font-pixel text-[10px] text-[#f87171]">
                                Furnace T{mat.rarity === 'rare' ? 2 : mat.rarity === 'epic' ? 3 : 4}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {materialCommitment && (
                  <section
                    data-testid="material-commitment"
                    aria-label="Material commitment comparison"
                    className="border border-[#6b4931] bg-[#211611] p-2.5"
                  >
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="font-pixel text-xs font-bold text-[#f3dfb9]">Material commitment</h3>
                      <p className="font-pixel text-[11px] text-[#b89f7d]">
                        Hypothetical estimates at {Math.round(materialCommitment.qualityAssumption * 100)}% quality
                      </p>
                    </div>
                    <dl className="font-pixel grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] sm:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="text-[#b89f7d]">With selected materials</dt>
                        <dd data-testid="commitment-selected-fee" className="break-words text-sm font-bold tabular-nums text-[#fde047]">
                          {materialCommitment.selectedEstimatedDeliveryFee}g
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[#b89f7d]">Without materials</dt>
                        <dd data-testid="commitment-zero-fee" className="break-words text-sm font-bold tabular-nums text-[#f3dfb9]">
                          {materialCommitment.zeroMaterialEstimatedDeliveryFee}g
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[#b89f7d]">Conditional fee difference</dt>
                        <dd data-testid="commitment-fee-difference" className="break-words text-sm font-bold tabular-nums text-[#93c5fd]">
                          {materialCommitment.conditionalDeliveryFeeDifference > 0 ? '+' : ''}{materialCommitment.conditionalDeliveryFeeDifference}g
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[#b89f7d]">Selected material units</dt>
                        <dd data-testid="commitment-units" className="text-sm font-bold tabular-nums text-[#f3dfb9]">
                          {materialCommitment.selectedMaterialUnits}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[#b89f7d]">Current sell-back alternative</dt>
                        <dd data-testid="commitment-sell-back" className="break-words text-sm font-bold tabular-nums text-[#f3dfb9]">
                          {materialCommitment.currentSellBackValue}g
                        </dd>
                      </div>
                    </dl>
                    <p className="font-pixel mt-2 text-[11px] leading-relaxed text-[#b89f7d]">
                      Fee difference is not profit or guaranteed additional earnings. Sell-back is a current alternative,
                      not acquisition cost or net profit. Comparing does not reserve or consume materials.
                    </p>
                  </section>
                )}

                {/* Start Forging CTA */}
                <div className="flex items-center justify-between gap-3 border-t border-[#362419] pt-3">
                  <div className="font-pixel text-xs text-[#d4b88c]">
                    Steps:{' '}
                    {(activeOrder.kind === 'royal'
                      ? royalSteps
                      : getStepsForRequest(
                          activeOrder.requestFocus ?? 'edge',
                          activeOrder.targetPart,
                        )
                    )
                      .map((s) => STRINGS.stations[s].title)
                      .join(' → ')}
                  </div>
                  <button
                    type="button"
                    disabled={activeOrder.kind === 'royal' && royalSteps.length === 0}
                    onClick={() => {
                      const steps =
                        activeOrder.kind === 'royal'
                          ? royalSteps
                          : getStepsForRequest(
                              activeOrder.requestFocus ?? 'edge',
                              activeOrder.targetPart,
                            );
                      const targetPart =
                        activeOrder.kind === 'royal' ? royalPart : activeOrder.targetPart;
                      onStartForge(activeOrder, steps, targetPart, stacks);
                    }}
                    className="forge-button-primary font-pixel cursor-pointer px-5 py-2.5 text-sm font-bold"
                  >
                    {STRINGS.orders.startForge}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
