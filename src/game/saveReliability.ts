import type { SaveState } from '../types';
import type { PersistenceResult } from './storage';

export const AUTOSAVE_INTERVAL_MS = 30_000;

// Advance only for simulation work actually performed, never wall-clock gaps.
export function advanceAutosave(elapsedMs: number, activeDeltaMs: number) {
  const total = elapsedMs + Math.max(0, activeDeltaMs);
  return { due: total >= AUTOSAVE_INTERVAL_MS, elapsedMs: total % AUTOSAVE_INTERVAL_MS };
}

// No timers and no captured save snapshot. The caller owns one registration.
export function bindLifecyclePersistence(
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  getSave: () => SaveState | null,
  persist: (state: SaveState) => PersistenceResult,
  onVisible: () => void,
) {
  const saveLatest = () => {
    const state = getSave();
    if (state) persist(state);
  };
  const onVisibility = () => {
    if (doc.hidden) saveLatest();
    else onVisible();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', saveLatest);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', saveLatest);
  };
}

export interface SaveWarning {
  severity: 1 | 2 | 3;
  message: string;
}

export interface ShownSaveWarning {
  severity: SaveWarning['severity'];
  at: number;
}

export function persistenceWarning(result: PersistenceResult): SaveWarning | null {
  if (result.status === 'failed') {
    return { severity: 3, message: 'Save failed. Progress may be lost. Free storage and try again.' };
  }
  if (result.status === 'compacted') {
    return result.armoryTrimmed
      ? { severity: 2, message: 'Storage low. Saved copy has reduced history and armory. Current-session armory is unchanged.' }
      : { severity: 1, message: 'Storage low. Saved copy has reduced history.' };
  }
  return null;
}

export function preferHigherWarning(current: SaveWarning | null, incoming: SaveWarning): SaveWarning {
  return current && current.severity >= incoming.severity ? current : incoming;
}

export function shouldWarn(previous: ShownSaveWarning | null, warning: SaveWarning, now: number) {
  return !previous || warning.severity > previous.severity || now - previous.at >= 60_000;
}

// Keep the highest deferred warning. Do not downgrade an active banner, and
// let escalation bypass the normal one-minute repeat-warning limit.
export function deliverSaveWarning(
  pending: SaveWarning | null,
  displayed: SaveWarning | null,
  previous: ShownSaveWarning | null,
  hidden: boolean,
  now: number,
): { pending: SaveWarning | null; show: SaveWarning | null } {
  if (hidden || !pending) return { pending, show: null };
  const lowerThanDisplayed = displayed !== null && pending.severity < displayed.severity;
  return {
    pending: null,
    show: !lowerThanDisplayed && shouldWarn(previous, pending, now) ? pending : null,
  };
}

// A failed write in this document leaves the live ref authoritative. A fresh
// document (or a document with a successful latest save) uses normal disk load,
// including the existing migration/recovery path, without changing its rules.
export function resolveContinueSave(
  live: SaveState | null,
  persistenceFailed: boolean,
  loadFromDisk: () => SaveState | null,
): { state: SaveState | null; retryLive: boolean } {
  if (live && persistenceFailed) return { state: live, retryLive: true };
  return { state: loadFromDisk(), retryLive: false };
}
