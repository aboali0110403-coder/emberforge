import { REPUTATION } from '../reputation';
import { resolveBattleOutcome } from './historical/preS4BattleOutcome';
import { candidateReputation, type ReputationModel } from './reputationCandidates';
import { generateCustomerOrder } from '../rules';
/**
 * S3 matched-assumption candidate harness. This is not the frozen historical baseline.
 *
 * Instrumentation only: this module imports the real game modules and plays
 * synthetic sessions through the real functions (order generation, forge
 * stat path via applyForgeUpgradesToWeapon on the order's own weapon,
 * resolveBattleOutcome with the seeded RNG driving win and reward rolls,
 * rotating shop stock, unlocks, achievements). It never writes save state,
 * never touches storage or the DOM, and never mutates game configuration:
 * the baseline scenarios run against the shipped DEFAULT_BALANCE untouched.
 *
 * Fixed-seed methodology (from the Balance & Progression Audit):
 * base seed 20261123, run r uses seed base+r, 400 runs per scenario,
 * 160 completed orders per run. Scenario day counts use a fixed
 * completions/day throughput assumption (5 or 8); they are NOT a clock
 * simulation. See docs/balance-harness.md for assumptions and limitations.
 *
 * S3 outputs are pinned separately in orderProgressionHarness.test.ts.
 * Historical S0 assertions and its sim:balance entrypoint are not retuned.
 */
import { MATERIALS } from '../../data/materials';
import { getSmithProgress, QUALITY_GRADE_META } from '../../data/config';
import { BALANCE, getStageMinRarity } from '../../data/balance';
import {
  rollWeaponLevelUp,
  calculateDeliveryGoldBreakdown,
  calculateForgeXp,
  getEquipmentUpgradeCost,
  getMaterialSellPrice,
  checkProgressiveUnlocks,
  getLegendaryMultiplier,
  calculateTotalPotency,
  canUseMaterialWithFurnace,
  getQualityGrade,
  applyForgeUpgradesToWeapon,
  checkLegendaryMilestone,
  rollRotatingStock,
} from '../rules';

export const BASE_SEED = 20261123;
export const RUNS = 400;
export const MAX_ORDERS = 800;
export const DAY_SECONDS = 660; // 480s day + 180s night (worldCycle)
export const QUALITY_TYPICAL = { mean: 0.85, sd: 0.05 } as const;

const EQ = ['furnace', 'hammer', 'anvil', 'grindstone', 'quench', 'workbench'] as const;
const RIDX: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, mythic: 4 };

/** Deterministic PRNG (same implementation as the audit harness). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScenarioOptions {
  label: string;
  qMean: number;
  qSd: number;
  ordersPerDay: number;
  frugal: boolean;
  model?: ReputationModel;
  missRate?:number;
  forceWinRate?:number;
  improveAt?:number;
}

interface MilestoneStats {
  reached: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
}

export interface ScenarioSummary {
  label: string;
  runs: number;
  maxOrders: number;
  milestones: {
    allT3: MilestoneStats;
    allT5: MilestoneStats;
    known: MilestoneStats;
    respected: MilestoneStats;
    renowned: MilestoneStats;
    legendary: MilestoneStats;
  };
  firstL18: { reached: number; median: number | null };
  day3TiersMean: string;
  reqLvDay3Mean: string;
  reqLvDay3P90: number | null;
  perOrder: {
    unitsBought: string;
    stageUnits: string;
    subUnits: string;
    dropUnits: string;
    stageMetPct: number;
    understockedPct: number;
    noMaterialPct: number;
    royalPct: string;
    legendaryBonusPct: number;
    winRatePct: number;
  };
  goldPerOrder: {
    delivery: number;
    battle: number;
    sellback: number;
    achievements: string;
    matSpend: number;
    upgrades: number;
  };
}

export interface ProgressionDiagnostic {
 order: number; requested: number; smith: number; furnace: number;
 toolTier: number; quality: number; stageMet: boolean; potencyMet: boolean;
 units: number; won: boolean; delivery: number; netFlow: number;
}
interface DiagnosticOptions {
 generator?: typeof generateCustomerOrder;
 quality?: (order: ReturnType<typeof generateCustomerOrder>, equipment: Record<(typeof EQ)[number],number>,smith: number) => number;
 rows: ProgressionDiagnostic[];
}
function simulate(rng: () => number, opts: ScenarioOptions, diagnostic?: DiagnosticOptions) {
  const { qMean, qSd, ordersPerDay, frugal } = opts;
  const randn = (m: number, sd: number) => {
    const u = Math.max(1e-9, rng());
    const v = rng();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  let gold = 120;
  const inv: Record<string, number> = { human_common: 4, orc_common: 3, goblin_common: 2 };
  const equip: Record<string, number> = { furnace: 1, hammer: 1, anvil: 1, grindstone: 1, quench: 1, workbench: 1 };
  const pop: Record<string, number> = { human: 0, elf: 0, goblin: 0, orc: 0, demon: 0 };
  let unlocked: any[] = ['human'];
  let smithXp = 0;
  let ordersCompleted = 0;
  const earnedKingdomTiers=new Set<string>();
  const reputationRows:any[]=[];
  const firstAt:Record<string,number|null>={known:null,respected:null,renowned:null,legendary:null};
  let missed=0;
  let masterworks = 0;
  const achDone = new Set<string>();
  let dT5: number | null = null;
  let dT3: number | null = null;
  let dRen: number | null = null;
  let dLeg: number | null = null;
  let firstL18: number | null = null;
  let dKnown: number | null = null;
  let dResp: number | null = null;
  let day3tiers = 0;
  const reqLvDay3: number[] = [];
  // Rotating shop: refresh every 420 active seconds; sim time advances
  // (660 / ordersPerDay) active seconds per completed order.
  const secPerOrder = DAY_SECONDS / ordersPerDay;
  let rotTimer = BALANCE.rotatingStockRefreshSec;
  let rotStock: any[] = rollRotatingStock(rng, Object.values(pop).some((v) => v >= 140));
  const flow: Record<string, number> = {
    delivery: 0, battleGold: 0, sellback: 0, achievements: 0, matSpend: 0, upgSpend: 0,
    unitsBought: 0, unitsConsumed: 0, dropUnits: 0, ordersUnderstocked: 0, ordersNoMaterial: 0,
    ordersStageMet: 0, stageUnits: 0, subUnits: 0, royalOrders: 0, legendaryBonuses: 0,
    battlesWon: 0, battlesLost: 0,
  };
  for (let i = 0; i < MAX_ORDERS; i++) {
    const day = Math.floor(i / ordersPerDay) + 1;
    rotTimer -= secPerOrder;
    if (rotTimer <= 0) {
      rotTimer += BALANCE.rotatingStockRefreshSec;
      rotStock = rollRotatingStock(rng, Object.values(pop).some((v) => v >= 140));
    }
    const startingGold = gold; const furnaceBefore = equip.furnace; const toolBefore = Math.min(...Object.values(equip));
    const order = (diagnostic?.generator ?? generateCustomerOrder)(
      { unlockedRaces: unlocked, popularity: pop, smithXp, equipment: equip, stats: { ordersCompleted } } as any,
      rng,
    );
    if (order.kind === 'royal') flow.royalOrders++;
    // Deterministic miss routing independent of game RNG, identical across candidates.
    if ((i*0.61803398875)%1 < (opts.improveAt!==undefined&&i>=opts.improveAt ? .02 :(opts.missRate??0)) && i>0) {
      const before=pop[order.race]; const penalty=opts.model==='sustained'?6:opts.model==='gentle'?REPUTATION.missedOrder:10;
      pop[order.race]=Math.max(0,before-penalty);missed++;
      reputationRows.push({order:i+1,race:order.race,kind:order.kind,missed:true,loss:before-pop[order.race],battle:0,milestone:0,delivery:0,pop:{...pop}});continue;
    }
    const L0 = order.weapon.level;
    if (day === 3) reqLvDay3.push(L0);
    const wtype = order.weapon.type;
    const stageIdx = RIDX[getStageMinRarity(L0)];
    const preq = 2 + 1.2 * L0;
    const eff = (m: any) => calculateTotalPotency([{ materialId: m.id, units: 1 }], wtype);
    const cands = MATERIALS.filter(
      (m: any) => m.targetRace === order.race && canUseMaterialWithFurnace(m, equip.furnace),
    );
    const stageM = cands
      .filter((m: any) => RIDX[m.rarity] >= stageIdx)
      .sort((a: any, b: any) => a.basePrice / eff(a) - b.basePrice / eff(b));
    const subM = cands
      .filter((m: any) => RIDX[m.rarity] < stageIdx && (m.rarity === 'common' || m.rarity === 'uncommon'))
      .sort((a: any, b: any) => a.basePrice / eff(a) - b.basePrice / eff(b));
    const stacks: { materialId: string; units: number }[] = [];
    // Buy through the real shop channels into inventory, then consume.
    const obtain = (m: any, want: number, buyAllowed: boolean) => {
      const have = inv[m.id] ?? 0;
      let buy = 0;
      if (buyAllowed && want > have) {
        if (m.rarity === 'common' || m.rarity === 'uncommon') {
          buy = Math.min(want - have, Math.floor(gold / m.basePrice));
          gold -= buy * m.basePrice;
          flow.matSpend += buy * m.basePrice;
        } else {
          const item = rotStock.find((it: any) => it.materialId === m.id && it.stock > 0);
          if (item) {
            buy = Math.min(want - have, item.stock, Math.floor(gold / item.price));
            item.stock -= buy;
            gold -= buy * item.price;
            flow.matSpend += buy * item.price;
          }
        }
        flow.unitsBought += buy;
      }
      const take = Math.min(want, have + buy);
      if (take > 0) {
        inv[m.id] = have + buy - take;
        stacks.push({ materialId: m.id, units: take });
        flow.unitsConsumed += take;
      }
      return take;
    };
    if (stacks.length < 3 && stageM.length > 0) {
      const m = stageM[0];
      let u = 0;
      let P = 0;
      while (P < preq && u < 5) {
        u++;
        P = calculateTotalPotency([{ materialId: m.id, units: u }], wtype);
      }
      const buyAllowed = !frugal || m.rarity === 'common' || m.rarity === 'uncommon';
      const got = obtain(m, u, buyAllowed);
      if (got > 0) flow.stageUnits += got;
    }
    let curP = stacks.length ? calculateTotalPotency(stacks, wtype) : 0;
    if (curP < preq && stacks.length < 3 && subM.length > 0) {
      const m = subM[0];
      const need = Math.min(5, Math.ceil((preq - curP) / Math.max(0.01, eff(m))));
      const got = obtain(m, need, true); // both policies buy always-stocked common/uncommon
      if (got > 0) flow.subUnits += got;
      curP = stacks.length ? calculateTotalPotency(stacks, wtype) : 0;
    }
    if (stacks.length === 0) flow.ordersNoMaterial++;
    else {
      if (curP < preq) flow.ordersUnderstocked++;
      const stageMet = stacks.some((s) => {
        const mm = MATERIALS.find((x: any) => x.id === s.materialId) as any;
        return mm && RIDX[mm.rarity] >= stageIdx && s.units > 0;
      });
      if (stageMet) flow.ordersStageMet++;
    }
    const sampledQuality = Math.max(0, Math.min(1, randn(opts.improveAt!==undefined&&i>=opts.improveAt ? .85:qMean,opts.improveAt!==undefined&&i>=opts.improveAt ? .05:qSd)));
    const smithBefore = getSmithProgress(smithXp).level;
    const quality = diagnostic?.quality?.(order,equip,smithBefore) ?? sampledQuality;
    const grade = getQualityGrade(quality);
    const gradeMeta = QUALITY_GRADE_META[grade];
    if (grade === 'S') masterworks++;
    const { newLevel } = rollWeaponLevelUp(L0, wtype, quality, stacks, rng);
    const { updated: delivered } = applyForgeUpgradesToWeapon(
      order.weapon, order.targetPart, quality, stacks, equip, newLevel, order.requestFocus,
    );
    const milestone = checkLegendaryMilestone(delivered);
    const isRoyal = order.kind === 'royal';
    const fulfilment = isRoyal ? 1.15 : 1.0;
    const gb = calculateDeliveryGoldBreakdown({
      baseFee: order.baseFee, fulfilment, quality, weaponLevel: L0, stacks,
      remainingRatio: 0.75, conqueredCount: 0, isRoyal,
    });
    gold += gb.totalGold;
    flow.delivery += gb.totalGold;
    smithXp += calculateForgeXp(newLevel, quality, isRoyal, newLevel > L0);
    // Delivery-time effects (App.tsx handleForgeStepFinish): legendary milestone
    // popularity, D-grade delivery reputation penalty.
    const key=order.race+':'+milestone;
    const preRep=pop[order.race];
    const rep=candidateReputation(opts.model??'historical',{quality,level:delivered.level,royal:isRoyal,current:preRep,won:true,oldLevel:L0,milestone,firstKingdomTier:![10,15,20].some(t=>t>=(milestone??Infinity)&&earnedKingdomTiers.has(order.race+':'+t))});
    if(rep.milestone>0){earnedKingdomTiers.add(key);flow.legendaryBonuses++;}
    pop[order.race]=Math.max(0,pop[order.race]+rep.milestone+rep.delivery);
    const smithLevel = getSmithProgress(smithXp).level;
    const pending: any = {
      id: 'b' + i, orderId: order.id, race: order.race, customerName: order.customerName,
      portraitVariant: 0, weapon: delivered, quality, fulfilment, scenarioName: order.scenarioName,
      scenarioDifficulty: order.scenarioDifficulty, enemyArchetype: order.enemyArchetype,
      smithLevel, etaSec: 0, ready: true,
      rewardMultiplier: getLegendaryMultiplier(delivered.level), wasRoyal: isRoyal,
    };
    // Real battle resolution: the seeded RNG drives the win roll and all reward draws.
    const result = resolveBattleOutcome(pending, rng);
    if(opts.forceWinRate!==undefined)result.won=((i*.754877666)%1)<opts.forceWinRate;
    const battleRep=candidateReputation(opts.model??'historical',{quality,level:delivered.level,royal:isRoyal,current:pop[order.race],won:result.won,oldLevel:L0,milestone,firstKingdomTier:false}).battle;
    result.popularityDelta=battleRep;
    if (result.won) flow.battlesWon++;
    else flow.battlesLost++;
    pop[order.race] = Math.max(0, pop[order.race] + result.popularityDelta);
    if (result.goldBonus) {
      gold += result.goldBonus;
      flow.battleGold += result.goldBonus;
    }
    for (const dr of result.materialRewards) {
      inv[dr.materialId] = (inv[dr.materialId] ?? 0) + dr.count;
      flow.dropUnits += dr.count;
    }
    unlocked = checkProgressiveUnlocks(pop, unlocked);
    ordersCompleted++;
    for(const [id,threshold]of [['known',25],['respected',70],['renowned',140],['legendary',240]]as const)if(firstAt[id]===null&&Object.values(pop).some(v=>v>=threshold))firstAt[id]=i+1;
    reputationRows.push({order:i+1,race:order.race,kind:order.kind,quality,level:L0,newLevel:delivered.level,won:result.won,battle:battleRep,delivery:rep.delivery,milestone:rep.milestone,generatedMilestone:milestone!==null&&L0>=milestone,earnedCrossing:milestone!==null&&L0<milestone,pop:{...pop}});
    const achChecks: [string, boolean, number][] = [
      ['first_order', ordersCompleted >= 1, 40],
      ['orders_10', ordersCompleted >= 10, 120],
      ['orders_50', ordersCompleted >= 50, 400],
      ['orders_100', ordersCompleted >= 100, 1000],
      ['masterwork_first', masterworks >= 1, 160],
      ['smith_rank_5', getSmithProgress(smithXp).level >= 5, 220],
    ];
    for (const [id, met, reward] of achChecks) {
      if (met && !achDone.has(id)) {
        achDone.add(id);
        gold += reward;
        flow.achievements += reward;
      }
    }
    const cap = frugal ? 4 : 8;
    for (const [mid, n] of Object.entries(inv)) {
      if (n > cap) {
        const sell = n - cap;
        gold += getMaterialSellPrice(mid) * sell;
        flow.sellback += getMaterialSellPrice(mid) * sell;
        inv[mid] = cap;
      }
    }
    for (;;) {
      const next = EQ.filter((e) => equip[e] < 5).sort((a, b) => equip[a] - equip[b])[0];
      if (!next) break;
      const cost = getEquipmentUpgradeCost(equip[next]);
      if (gold - cost < 0) break;
      gold -= cost;
      flow.upgSpend += cost;
      equip[next]++;
    }
    if (gold < 0) throw new Error('negative gold');
    if (dT5 === null && EQ.every((e) => equip[e] === 5)) dT5 = day;
    if (dT3 === null && EQ.every((e) => equip[e] >= 3)) dT3 = day;
    if (dKnown === null && Object.values(pop).some((v) => v >= 25)) dKnown = day;
    if (dResp === null && Object.values(pop).some((v) => v >= 70)) dResp = day;
    if (dRen === null && Object.values(pop).some((v) => v >= 140)) dRen = day;
    if (dLeg === null && Object.values(pop).some((v) => v >= 240)) dLeg = day;
    diagnostic?.rows.push({order:i+1,requested:L0,smith:smithBefore,furnace:furnaceBefore,
      toolTier:toolBefore,quality,
      stageMet:stacks.some(s=>RIDX[MATERIALS.find(m=>m.id===s.materialId)!.rarity]>=stageIdx),
      potencyMet:curP>=preq,units:stacks.reduce((a,b)=>a+b.units,0),won:result.won,
      delivery:gb.totalGold,netFlow:gold-startingGold});
    if (firstL18 === null && L0 >= 18) firstL18 = ordersCompleted;
    if (day === 3) day3tiers = EQ.reduce((a, e) => a + equip[e], 0);
  }
  return { dT5, dT3, dRen, dLeg, firstL18, day3tiers, reqLvDay3, flow, dKnown, dResp, reputationRows,firstAt,missed };
}

export const S3_SCENARIOS: ScenarioOptions[] = [
  { label: 'S3 candidate buyer 5/day', qMean: QUALITY_TYPICAL.mean, qSd: QUALITY_TYPICAL.sd, ordersPerDay: 5, frugal: false },
  { label: 'S3 candidate frugal 5/day', qMean: QUALITY_TYPICAL.mean, qSd: QUALITY_TYPICAL.sd, ordersPerDay: 5, frugal: true },
  { label: 'S3 candidate buyer 8/day', qMean: QUALITY_TYPICAL.mean, qSd: QUALITY_TYPICAL.sd, ordersPerDay: 8, frugal: false },
  { label: 'S3 candidate frugal 8/day', qMean: QUALITY_TYPICAL.mean, qSd: QUALITY_TYPICAL.sd, ordersPerDay: 8, frugal: true },
];

/** Run one scenario at the pinned seeds and summarize exactly as recorded. */
export function runScenario(opts: ScenarioOptions, runs = RUNS): ScenarioSummary {
  const days: Record<string, number[]> = { t5: [], t3: [], ren: [], leg: [], known: [], resp: [], l18: [], d3t: [] };
  const rl3: number[] = [];
  const flow: Record<string, number> = {};
  for (let r = 0; r < runs; r++) {
    const res = simulate(mulberry32(BASE_SEED + r), opts);
    if (res.dT5) days.t5.push(res.dT5);
    if (res.dT3) days.t3.push(res.dT3);
    if (res.dRen) days.ren.push(res.dRen);
    if (res.dLeg) days.leg.push(res.dLeg);
    if (res.dKnown) days.known.push(res.dKnown);
    if (res.dResp) days.resp.push(res.dResp);
    if (res.firstL18) days.l18.push(res.firstL18);
    days.d3t.push(res.day3tiers);
    rl3.push(...res.reqLvDay3);
    for (const k in res.flow) flow[k] = (flow[k] ?? 0) + res.flow[k];
  }
  const srt = (a: number[]) => a.sort((x, y) => x - y);
  const med = (a: number[]) => (a.length ? srt(a)[Math.floor(a.length / 2)] : null);
  const p25 = (a: number[]) => (a.length ? srt(a)[Math.floor(a.length * 0.25)] : null);
  const p75 = (a: number[]) => (a.length ? srt(a)[Math.floor(a.length * 0.75)] : null);
  const p90 = (a: number[]) => (a.length ? srt(a)[Math.floor(a.length * 0.9)] : null);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const ms = (a: number[]): MilestoneStats => ({ reached: a.length, median: med(a), p25: p25(a), p75: p75(a) });
  const per = (v: number) => v / runs / MAX_ORDERS;
  return {
    label: opts.label,
    runs,
    maxOrders: MAX_ORDERS,
    milestones: {
      allT3: ms(days.t3),
      allT5: ms(days.t5),
      known: ms(days.known),
      respected: ms(days.resp),
      renowned: ms(days.ren),
      legendary: ms(days.leg),
    },
    firstL18: { reached: days.l18.length, median: med(days.l18) },
    day3TiersMean: mean(days.d3t).toFixed(1),
    reqLvDay3Mean: mean(rl3).toFixed(1),
    reqLvDay3P90: p90(rl3),
    perOrder: {
      unitsBought: per(flow.unitsBought).toFixed(2),
      stageUnits: per(flow.stageUnits).toFixed(2),
      subUnits: per(flow.subUnits).toFixed(2),
      dropUnits: per(flow.dropUnits).toFixed(2),
      stageMetPct: Math.round(per(flow.ordersStageMet) * 100),
      understockedPct: Math.round(per(flow.ordersUnderstocked) * 100),
      noMaterialPct: Math.round(per(flow.ordersNoMaterial) * 100),
      royalPct: (per(flow.royalOrders) * 100).toFixed(1),
      legendaryBonusPct: Math.round(per(flow.legendaryBonuses) * 100),
      winRatePct: Math.round((flow.battlesWon / (flow.battlesWon + flow.battlesLost)) * 100),
    },
    goldPerOrder: {
      delivery: Math.round(per(flow.delivery)),
      battle: Math.round(per(flow.battleGold)),
      sellback: Math.round(per(flow.sellback)),
      achievements: per(flow.achievements).toFixed(1),
      matSpend: Math.round(per(flow.matSpend)),
      upgrades: Math.round(per(flow.upgSpend)),
    },
  };
}

/** Diagnostic-only observations. Original S0 scenarios and their assertions are untouched. */
export function runDiagnosticScenario(opts: ScenarioOptions, runs: number, generator = generateCustomerOrder, quality?: DiagnosticOptions['quality']) {
 const sessions: ProgressionDiagnostic[][]=[];
 for(let r=0;r<runs;r++) {const rows: ProgressionDiagnostic[]=[];simulate(mulberry32(BASE_SEED+r),opts,{rows,generator,quality});sessions.push(rows);}
 return sessions;
}

export function reputationSessions(opts:ScenarioOptions,runs=100){return Array.from({length:runs},(_,r)=>simulate(mulberry32(BASE_SEED+r),opts));}
