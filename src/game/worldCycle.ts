import type { ActiveModal, AppScreen, Order, SaveState } from '../types';

// Stable for this save era. This is not a runtime-editable balance setting.
export const WORLD_CYCLE = Object.freeze({
  dayDurationSec: 480,
  nightDurationSec: 180,
  cycleDurationSec: 660,
});

export function assertWorldCycleConfiguration(config: Readonly<{
  dayDurationSec: number; nightDurationSec: number; cycleDurationSec: number;
}>): void {
  if (
    config.dayDurationSec !== 480 || config.nightDurationSec !== 180 ||
    config.cycleDurationSec !== 660 ||
    config.dayDurationSec + config.nightDurationSec !== config.cycleDurationSec
  ) {
    throw new RangeError('World-cycle durations must remain 480 / 180 / 660.');
  }
}
assertWorldCycleConfiguration(WORLD_CYCLE);

function assertSimulationSeconds(seconds: number): void {
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new RangeError('Simulation seconds must be a nonnegative safe integer.');
  }
}

export function getWorldCycle(activePlaySec: number) {
  assertSimulationSeconds(activePlaySec);
  const cyclePosition = activePlaySec % WORLD_CYCLE.cycleDurationSec;
  return {
    dayIndex: Math.floor(activePlaySec / WORLD_CYCLE.cycleDurationSec) + 1,
    cyclePosition,
    phase: cyclePosition < WORLD_CYCLE.dayDurationSec ? 'day' as const : 'night' as const,
  };
}

export function canReceiveNewOrders(activePlaySec: number): boolean {
  return getWorldCycle(activePlaySec).phase === 'day';
}

// The caller supplies the newly advanced tick time, not its rendered snapshot.
// Customer generation and random countdown reset remain in the existing caller.
export function advanceArrivalCountdown(
  advancedPlaySec: number,
  remainingSec: number,
  orderCount: number,
  maxOrders: number,
) {
  if (!canReceiveNewOrders(advancedPlaySec) || orderCount >= maxOrders) {
    return { remainingSec, arrivalDue: false };
  }
  const next = remainingSec - 1;
  return { remainingSec: next, arrivalDue: next <= 0 };
}

// Shared existing expiration rules for a normal tick and explicit skipped time.
// No arrivals, battle processing, persistence, random rolls or wall clock here.
export function advanceOrderDeadlines(
  state: Pick<SaveState, 'orders' | 'popularity' | 'stats'>,
  elapsedSec: number,
  missPenalty: number,
) {
  assertSimulationSeconds(elapsedSec);
  if (elapsedSec === 0) {
    return {
      orders: state.orders, popularity: state.popularity,
      ordersMissed: state.stats.ordersMissed, noMissStreak: state.stats.noMissStreak,
      expiredOrders: [] as Order[],
    };
  }
  const orders: Order[] = [];
  const expiredOrders: Order[] = [];
  let popularity = state.popularity;
  let ordersMissed = state.stats.ordersMissed;
  let noMissStreak = state.stats.noMissStreak;
  for (const order of state.orders) {
    const remainingSec = order.remainingSec - elapsedSec;
    if (remainingSec <= 0 && !order.isTutorial) {
      ordersMissed += 1;
      noMissStreak = 0;
      popularity = {
        ...popularity,
        [order.race]: Math.max(0, popularity[order.race] - missPenalty),
      };
      expiredOrders.push(order);
    } else {
      orders.push({
        ...order,
        remainingSec: order.isTutorial ? Math.max(60, remainingSec) : remainingSec,
      });
    }
  }
  return { orders, popularity, ordersMissed, noMissStreak, expiredOrders };
}

export interface SkipNightContext {
  screen: AppScreen;
  hidden: boolean;
  bgPaused: boolean;
  activeModal: ActiveModal;
  forging: boolean;
  forgePaused: boolean;
}

export function isSkipNightAvailable(activePlaySec: number, context: SkipNightContext): boolean {
  return getWorldCycle(activePlaySec).phase === 'night' &&
    context.screen === 'workshop' && !context.hidden && !context.bgPaused &&
    context.activeModal === null && !context.forging && !context.forgePaused;
}

// Explicitly authorized jump: only world time and existing order deadlines.
// Battle/shop/cooldown counters and arrival countdown do not fast-forward.
export function skipNight(state: SaveState, missPenalty: number) {
  const cycle = getWorldCycle(state.activePlaySec);
  if (cycle.phase !== 'night') return { state, skippedSec: 0, expiredOrders: [] as Order[] };
  const skippedSec = WORLD_CYCLE.cycleDurationSec - cycle.cyclePosition;
  const activePlaySec = state.activePlaySec + skippedSec;
  assertSimulationSeconds(activePlaySec);
  const deadlines = advanceOrderDeadlines(state, skippedSec, missPenalty);
  return {
    skippedSec,
    expiredOrders: deadlines.expiredOrders,
    state: {
      ...state,
      activePlaySec,
      orders: deadlines.orders,
      popularity: deadlines.popularity,
      stats: {
        ...state.stats,
        ordersMissed: deadlines.ordersMissed,
        noMissStreak: deadlines.noMissStreak,
      },
    },
  };
}
