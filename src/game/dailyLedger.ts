import type { DailyBucket, DailyLedger, Order, SaveState } from '../types';
import { getWorldCycle, WORLD_CYCLE } from './worldCycle';

export const DAILY_LEDGER_CLOSED_LIMIT = 30;
// Bound hostile input validation too. Normal persisted ledgers contain <= 30.
const MAX_INPUT_CLOSED_ROWS = 10_000;
// Current accepted delivery output is Math.max(5, ...) in rules.ts. This
// validity bound does not calculate rewards or change the existing economy.
const MIN_ACCEPTED_DELIVERY_FEE = 5;

export function getLedgerDayIndex(activePlaySec: number): number {
  return getWorldCycle(activePlaySec).dayIndex;
}

export function createDailyLedger(
  activePlaySec: number,
  coverage: DailyBucket['coverage'] = 'partial',
): DailyLedger {
  const dayIndex = getLedgerDayIndex(activePlaySec);
  const dayStart = (dayIndex - 1) * WORLD_CYCLE.cycleDurationSec;
  return {
    format: 1,
    current: {
      dayIndex,
      observedFromSec: activePlaySec,
      coverage: coverage === 'complete' && activePlaySec === dayStart ? 'complete' : 'partial',
      deliveries: 0,
      missed: 0,
      deliveryGold: 0,
    },
    closed: [],
  };
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readBucket(raw: unknown): DailyBucket | null {
  if (!isRecord(raw) || !isCounter(raw.dayIndex) || raw.dayIndex < 1 ||
      !isCounter(raw.observedFromSec) || !isCounter(raw.deliveries) ||
      !isCounter(raw.missed) || !isCounter(raw.deliveryGold) ||
      (raw.coverage !== 'complete' && raw.coverage !== 'partial')) return null;
  if (getLedgerDayIndex(raw.observedFromSec) !== raw.dayIndex) return null;
  const dayStart = (raw.dayIndex - 1) * WORLD_CYCLE.cycleDurationSec;
  if (raw.coverage === 'complete' && raw.observedFromSec !== dayStart) return null;
  // Neither metric can exist alone. Divide before comparing so multiplication
  // cannot overflow safe-integer precision for hostile but individually safe counters.
  if ((raw.deliveries === 0) !== (raw.deliveryGold === 0) ||
      raw.deliveries > Math.floor(raw.deliveryGold / MIN_ACCEPTED_DELIVERY_FEE)) return null;
  return {
    dayIndex: raw.dayIndex,
    observedFromSec: raw.observedFromSec,
    coverage: raw.coverage,
    deliveries: raw.deliveries,
    missed: raw.missed,
    deliveryGold: raw.deliveryGold,
  };
}

/**
 * Validate one snapshot only. Invalid accounting becomes unavailable history,
 * represented by a new partial current bucket, never synthetic historical zeros.
 * No events, rollover, rewards or reconciliation against lifetime totals here.
 * Work is bounded independently of clock/day magnitude; inputs above the row
 * validation cap fail closed. Retained rows are copied, never shared/mutated.
 */
export function sanitizeDailyLedger(raw: unknown, activePlaySec: number): DailyLedger {
  const fallback = () => createDailyLedger(activePlaySec);
  const dayIndex = getLedgerDayIndex(activePlaySec);
  if (!isRecord(raw) || raw.format !== 1 || !Array.isArray(raw.closed) ||
      raw.closed.length > MAX_INPUT_CLOSED_ROWS) return fallback();
  const current = readBucket(raw.current);
  if (!current || current.dayIndex !== dayIndex || current.observedFromSec > activePlaySec) {
    return fallback();
  }
  const closed: DailyBucket[] = [];
  let previousDay = 0;
  for (const value of raw.closed) {
    const bucket = readBucket(value);
    if (!bucket || bucket.dayIndex <= previousDay || bucket.dayIndex >= dayIndex) return fallback();
    previousDay = bucket.dayIndex;
    closed.push(bucket);
  }
  return { format: 1, current, closed: closed.slice(-DAILY_LEDGER_CLOSED_LIMIT) };
}


export type DailyLedgerTransition = {
  continuous: boolean;
} & (
  | { kind: 'tick' | 'skip'; expiredOrders: readonly Order[] }
  | { kind: 'delivery'; feeGold: number }
);

/** Project an accepted production transition, never infer events from totals.
 * continuous is runtime lineage evidence, not persisted provenance. On first
 * observation, retain valid accounting but mark current coverage partial.
 * The same before/after/context always produces the same independent result.
 */
export function projectDailyLedger(
  before: SaveState,
  after: SaveState,
  context: DailyLedgerTransition,
): DailyLedger {
  // Like the accepted world-cycle helpers, an invalid destination clock throws:
  // there is no legitimate day identity to invent for an invalid authority.
  getLedgerDayIndex(after.activePlaySec);
  const unavailable = () => createDailyLedger(after.activePlaySec);
  if (!isCounter(before.activePlaySec)) return unavailable();
  const elapsed = after.activePlaySec - before.activePlaySec;
  const cycle = getWorldCycle(before.activePlaySec);
  if (context.kind === 'tick') {
    if (elapsed !== 1) return unavailable();
  } else if (context.kind === 'skip') {
    if (cycle.phase !== 'night' ||
        elapsed !== WORLD_CYCLE.cycleDurationSec - cycle.cyclePosition) return unavailable();
  } else if (context.kind === 'delivery') {
    if (elapsed !== 0 || before === after || !isCounter(context.feeGold) ||
        context.feeGold < MIN_ACCEPTED_DELIVERY_FEE) return unavailable();
  } else {
    return unavailable();
  }

  const events: { atSec: number; feeGold?: number }[] = [];
  if (context.kind === 'delivery') {
    events.push({ atSec: after.activePlaySec, feeGold: context.feeGold });
  } else {
    if (!Array.isArray(context.expiredOrders) || !Array.isArray(before.orders) ||
        !Array.isArray(after.orders) || before.orders.length > MAX_INPUT_CLOSED_ROWS ||
        after.orders.length > MAX_INPUT_CLOSED_ROWS ||
        context.expiredOrders.length > before.orders.length ||
        context.expiredOrders.length > MAX_INPUT_CLOSED_ROWS) return unavailable();
    // Verify actual reducer-entry membership/occurrences, not order-ID receipts.
    // Duplicate order IDs remain legal; no gameplay deduplication is introduced.
    const survivors = new Set(after.orders);
    const available = new Map<Order, number>();
    for (const order of before.orders) available.set(order, (available.get(order) ?? 0) + 1);
    for (const order of context.expiredOrders) {
      const occurrences = available.get(order) ?? 0;
      if (!occurrences || survivors.has(order) || order.isTutorial || !isCounter(order.remainingSec) ||
          order.remainingSec < 1 || order.remainingSec > elapsed) return unavailable();
      available.set(order, occurrences - 1);
      const atSec = before.activePlaySec + order.remainingSec;
      if (!isCounter(atSec) || atSec > after.activePlaySec) return unavailable();
      events.push({ atSec });
    }
    events.sort((a, b) => a.atSec - b.atSec);
  }

  const ledger = sanitizeDailyLedger(before.dailyLedger, before.activePlaySec);
  if (context.continuous !== true) ledger.current.coverage = 'partial';
  const rollTo = (atSec: number) => {
    const dayIndex = getLedgerDayIndex(atSec);
    if (dayIndex !== ledger.current.dayIndex) {
      // Valid tick/Skip intervals cross at most one dawn. Do not walk or fill
      // unobserved days. Incoming coverage is proven by this actual interval.
      ledger.closed.push(ledger.current);
      ledger.closed = ledger.closed.slice(-DAILY_LEDGER_CLOSED_LIMIT);
      ledger.current = createDailyLedger(
        (dayIndex - 1) * WORLD_CYCLE.cycleDurationSec, 'complete',
      ).current;
    }
  };
  for (const event of events) {
    rollTo(event.atSec);
    if (event.feeGold === undefined) {
      ledger.current.missed += 1;
    } else {
      ledger.current.deliveries += 1;
      ledger.current.deliveryGold += event.feeGold;
    }
    if (!isCounter(ledger.current.deliveries) || !isCounter(ledger.current.missed) ||
        !isCounter(ledger.current.deliveryGold)) return unavailable();
  }
  rollTo(after.activePlaySec);
  return sanitizeDailyLedger(ledger, after.activePlaySec);
}
