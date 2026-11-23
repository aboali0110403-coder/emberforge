import type {
  ActiveModal,
  AppScreen,
  ForgingSession,
} from '../types';
import type { ForgeInsightReport } from './forgeInsightReport';

export interface KeyActionContext {
  screen: AppScreen;
  forging: ForgingSession | null;
  activeModal: ActiveModal;
  showDebug: boolean;
  forgePaused: boolean;
  showStationTutorial: boolean;
  key: string;
  repeat: boolean;
  isEditableTarget: boolean;
  hasModifier: boolean;
}

export type KeyActionResult =
  | { type: 'noop' }
  | { type: 'toggle_debug' }
  | { type: 'close_debug' }
  | { type: 'toggle_forge_pause' }
  | { type: 'open_station_guide' }
  | { type: 'switch_station_delta'; delta: 1 | -1 }
  | { type: 'switch_station_index'; index: number }
  | { type: 'close_modal' }
  | { type: 'open_modal'; modal: Exclude<ActiveModal, null> }
  | { type: 'toggle_mute' };

const BLOCKING_OUTCOME_MODALS: ReadonlySet<ActiveModal> = new Set([
  'delivery',
  'battle',
  'legendary',
]);

export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  if (
    typeof HTMLInputElement !== 'undefined' &&
    target instanceof HTMLInputElement
  ) {
    return true;
  }
  if (
    typeof HTMLTextAreaElement !== 'undefined' &&
    target instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  if (
    typeof HTMLSelectElement !== 'undefined' &&
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    target.isContentEditable
  ) {
    return true;
  }
  return false;
}

export function resolveWorkshopKeyAction(ctx: KeyActionContext): KeyActionResult {
  if (ctx.isEditableTarget || ctx.hasModifier || ctx.screen !== 'workshop') {
    return { type: 'noop' };
  }

  const lower = ctx.key.toLowerCase();

  if (ctx.forging !== null) {
    if (ctx.activeModal !== null) {
      if (
        ctx.key === 'Escape' &&
        !ctx.repeat &&
        !BLOCKING_OUTCOME_MODALS.has(ctx.activeModal)
      ) {
        return { type: 'close_modal' };
      }
      return { type: 'noop' };
    }

    if (ctx.showStationTutorial) {
      return { type: 'noop' };
    }

    if ((ctx.key === 'Escape' || lower === 'p') && !ctx.repeat) {
      return { type: 'toggle_forge_pause' };
    }

    if ((lower === 'g' || ctx.key === '?') && !ctx.repeat) {
      return { type: 'open_station_guide' };
    }

    if (lower === 'm' && !ctx.repeat) {
      return { type: 'toggle_mute' };
    }

    if (!ctx.forgePaused && !ctx.repeat) {
      if (ctx.key === '[' || ctx.key === 'ArrowUp' || ctx.key === 'PageUp') {
        return { type: 'switch_station_delta', delta: -1 };
      }
      if (ctx.key === ']' || ctx.key === 'ArrowDown' || ctx.key === 'PageDown') {
        return { type: 'switch_station_delta', delta: 1 };
      }
      if (/^[1-6]$/.test(ctx.key)) {
        return { type: 'switch_station_index', index: Number(ctx.key) - 1 };
      }
    }

    // Do not trigger modal shortcuts (O/S/I/K/A/D) while forging (A/D are Grindstone controls)
    return { type: 'noop' };
  }

  // Workshop mode (not forging)
  if (BLOCKING_OUTCOME_MODALS.has(ctx.activeModal)) {
    if (lower === 'm' && !ctx.repeat) {
      return { type: 'toggle_mute' };
    }
    return { type: 'noop' };
  }

  if (ctx.key === 'Escape' && !ctx.repeat) {
    if (ctx.showDebug) return { type: 'close_debug' };
    if (ctx.activeModal !== null) return { type: 'close_modal' };
    return { type: 'open_modal', modal: 'settings' };
  }

  if (lower === 'm' && !ctx.repeat) {
    return { type: 'toggle_mute' };
  }

  if (lower === 'd' && !ctx.repeat) {
    if (ctx.activeModal !== null) return { type: 'noop' };
    return { type: 'toggle_debug' };
  }

  if (ctx.activeModal === 'settings' || ctx.repeat) {
    return { type: 'noop' };
  }

  if (lower === 'o') return { type: 'open_modal', modal: 'orders' };
  if (lower === 's') return { type: 'open_modal', modal: 'shop' };
  if (lower === 'i') return { type: 'open_modal', modal: 'inventory' };
  if (lower === 'k') return { type: 'open_modal', modal: 'map' };
  if (lower === 'a') return { type: 'open_modal', modal: 'achievements' };

  return { type: 'noop' };
}

function getCompletedMask(session: ForgingSession): boolean[] {
  if (
    session.completedSteps &&
    session.completedSteps.length === session.steps.length
  ) {
    return [...session.completedSteps];
  }
  return session.steps.map((_, i) => i < session.stepAccuracies.length);
}

export function switchForgeStation(
  session: ForgingSession,
  mode: { kind: 'index'; index: number } | { kind: 'delta'; delta: 1 | -1 },
): {
  session: ForgingSession;
  changed: boolean;
  reason?: 'completed' | 'single_step' | 'out_of_range';
} {
  const len = session.steps.length;
  if (len <= 0) {
    return { session, changed: false, reason: 'out_of_range' };
  }
  const completed = getCompletedMask(session);

  if (mode.kind === 'index') {
    if (mode.index < 0 || mode.index >= len) {
      return { session, changed: false, reason: 'out_of_range' };
    }
    if (mode.index === session.stepIndex) {
      return { session, changed: false };
    }
    if (completed[mode.index]) {
      return { session, changed: false, reason: 'completed' };
    }
    return {
      session: { ...session, stepIndex: mode.index, completedSteps: completed },
      changed: true,
    };
  }

  for (let offset = 1; offset < len; offset++) {
    const candidate = (session.stepIndex + mode.delta * offset + len * 2) % len;
    if (!completed[candidate]) {
      return {
        session: { ...session, stepIndex: candidate, completedSteps: completed },
        changed: true,
      };
    }
  }

  return { session, changed: false, reason: 'single_step' };
}

export function advanceForgeStep(
  session: ForgingSession,
  accuracy: number,
  bestStreak: number,
  insight?: ForgeInsightReport,
): {
  finishedAll: boolean;
  nextSession: ForgingSession;
  accuracies: number[];
} {
  const len = session.steps.length;
  const nextAcc = [...session.stepAccuracies];
  while (nextAcc.length < len) {
    nextAcc.push(0);
  }
  nextAcc[session.stepIndex] = accuracy;

  const nextCompleted = getCompletedMask(session);
  nextCompleted[session.stepIndex] = true;

  const updatedBest = Math.max(session.bestStreakInForge, bestStreak);

  // V3-1: carry the step's insight report (when the payload has one) at its
  // own step index, so reports stay aligned with steps even when the player
  // completes stations out of order or repeats a station in a royal recipe.
  let nextReports = session.stepReports;
  if (insight) {
    nextReports = session.stepReports
      ? [...session.stepReports]
      : new Array<ForgeInsightReport | undefined>(len).fill(undefined);
    nextReports[session.stepIndex] = insight;
  }

  let nextIdx = -1;
  for (let offset = 1; offset < len; offset++) {
    const idx = (session.stepIndex + offset) % len;
    if (!nextCompleted[idx]) {
      nextIdx = idx;
      break;
    }
  }

  if (nextIdx !== -1) {
    return {
      finishedAll: false,
      accuracies: nextAcc,
      nextSession: {
        ...session,
        stepIndex: nextIdx,
        stepAccuracies: nextAcc,
        completedSteps: nextCompleted,
        bestStreakInForge: updatedBest,
        stepReports: nextReports,
      },
    };
  }

  return {
    finishedAll: true,
    accuracies: nextAcc,
    nextSession: {
      ...session,
      stepAccuracies: nextAcc,
      completedSteps: nextCompleted,
      bestStreakInForge: updatedBest,
      stepReports: nextReports,
    },
  };
}
