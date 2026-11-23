import { SAVE_BACKUP_KEY, SAVE_STORAGE_KEY } from '../data/config';
import { migrateSaveState } from './rules';
import type { SaveState } from '../types';

export interface SaveLoadStatus {
  state: SaveState | null;
  recoveredFromBackup: boolean;
  corruptedCleared: boolean;
}

function tryParseSave(raw: string | null): SaveState | null {
  if (!raw) return null;
  try {
    return migrateSaveState(JSON.parse(raw));
  } catch {
    return null;
  }
}

// True when loading changed a ready battle's persisted result: either the raw
// JSON had none (a pre-v3 save that migration just resolved) or sanitization
// repaired a malformed one. The migrated state is written back immediately so
// a later reload can never reroll those outcomes.
function resolvedResultsChangedOnLoad(raw: string | null, parsed: SaveState): boolean {
  if (!raw) return false;
  try {
    const obj = JSON.parse(raw) as { pendingBattles?: { id?: unknown; resolvedResult?: unknown }[] };
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.pendingBattles)) return false;
    const rawBattles = obj.pendingBattles;
    return parsed.pendingBattles.some((b) => {
      if (!b.ready || !b.resolvedResult) return false;
      const rawBattle = rawBattles.find((r) => r && typeof r === 'object' && r.id === b.id);
      if (!rawBattle) return true;
      return (
        JSON.stringify(rawBattle.resolvedResult ?? null) !== JSON.stringify(b.resolvedResult)
      );
    });
  } catch {
    return false;
  }
}

// After a load write-back landed in the primary slot, make sure the backup
// slot cannot restore a different outcome for the same ready battle. Only runs
// once the primary read-back matches what was written, and only touches the
// backup when it is stale (its results are missing or differ from the primary).
// If the refresh fails (quota), the stale backup is removed: the verified
// primary is the valid save, and a stale backup could reroll a battle.
function syncBackupAfterWriteBack(serialized: string, parsed: SaveState): void {
  try {
    if (localStorage.getItem(SAVE_STORAGE_KEY) !== serialized) return;
    const backupRaw = localStorage.getItem(SAVE_BACKUP_KEY);
    if (backupRaw === null || backupRaw === serialized) return;
    if (!tryParseSave(backupRaw)) return;
    if (!resolvedResultsChangedOnLoad(backupRaw, parsed)) return;
    try {
      localStorage.setItem(SAVE_BACKUP_KEY, serialized);
    } catch {
      try {
        localStorage.removeItem(SAVE_BACKUP_KEY);
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore
  }
}

export function loadSaveStateWithStatus(): SaveLoadStatus {
  try {
    const primaryRaw = localStorage.getItem(SAVE_STORAGE_KEY);
    const primaryParsed = tryParseSave(primaryRaw);
    if (primaryParsed) {
      if (resolvedResultsChangedOnLoad(primaryRaw, primaryParsed)) {
        try {
          const serialized = JSON.stringify(primaryParsed);
          localStorage.setItem(SAVE_STORAGE_KEY, serialized);
          syncBackupAfterWriteBack(serialized, primaryParsed);
        } catch {
          // Ignore quota errors; the next persist will carry the results.
        }
      }
      return { state: primaryParsed, recoveredFromBackup: false, corruptedCleared: false };
    }

    const backupRaw = localStorage.getItem(SAVE_BACKUP_KEY);
    const backupParsed = tryParseSave(backupRaw);
    if (backupParsed) {
      // Restore backup back into primary slot cleanly
      const serialized = JSON.stringify(backupParsed);
      localStorage.setItem(SAVE_STORAGE_KEY, serialized);
      // The recovered backup may itself have been migrated; sync it so a
      // second corruption cannot restore a different outcome. This runs the
      // same verified-primary sync as the migration write-back: the backup is
      // only touched once the primary read-back confirms the restore landed,
      // and if the refresh fails the stale backup is removed rather than left
      // able to reroll the battle.
      if (resolvedResultsChangedOnLoad(backupRaw, backupParsed)) {
        syncBackupAfterWriteBack(serialized, backupParsed);
      }
      return { state: backupParsed, recoveredFromBackup: true, corruptedCleared: false };
    }

    if (primaryRaw !== null || backupRaw !== null) {
      localStorage.removeItem(SAVE_STORAGE_KEY);
      localStorage.removeItem(SAVE_BACKUP_KEY);
      return { state: null, recoveredFromBackup: false, corruptedCleared: true };
    }

    return { state: null, recoveredFromBackup: false, corruptedCleared: false };
  } catch {
    return { state: null, recoveredFromBackup: false, corruptedCleared: false };
  }
}

export function loadSaveState(): SaveState | null {
  return loadSaveStateWithStatus().state;
}

export interface PersistenceResult {
  status: 'ok' | 'compacted' | 'failed';
  backupFailed?: boolean;
  armoryTrimmed?: boolean;
}

let lastDiagnostic = '';
function persistenceOutcome(result: PersistenceResult): PersistenceResult {
  const diagnostic = `${result.status}:${!!result.backupFailed}:${!!result.armoryTrimmed}`;
  if (diagnostic !== lastDiagnostic) {
    if (result.status !== 'ok' || result.backupFailed) {
      // Status only: never log player state or storage contents.
      console.warn('[Emberforge save]', result);
    }
    lastDiagnostic = diagnostic;
  }
  return result;
}

function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  );
}

export function persistSaveState(state: SaveState): PersistenceResult {
  let backupFailed = false;
  try {
    const toSave: SaveState = { ...state, updatedAt: Date.now() };
    const serialized = JSON.stringify(toSave);
    if (!serialized || serialized.length < 20) {
      return persistenceOutcome({ status: 'failed' });
    }

    // Rotate only a valid primary, before replacing it. A backup failure must
    // not prevent a full primary write or force needless data reduction.
    try {
      const existingPrimary = localStorage.getItem(SAVE_STORAGE_KEY);
      if (existingPrimary && tryParseSave(existingPrimary)) {
        localStorage.setItem(SAVE_BACKUP_KEY, existingPrimary);
      }
    } catch {
      backupFailed = true;
    }
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, serialized);
      return persistenceOutcome({ status: 'ok', backupFailed });
    } catch (error) {
      if (!isQuotaError(error)) return persistenceOutcome({ status: 'failed', backupFailed });
    }

    // Historical display records first. Preserve every gameplay field,
    // including pending/resolved battles, letters, inventory and achievements.
    const historiesReduced: SaveState = {
      ...toSave,
      completedOrders: toSave.completedOrders.slice(-20),
      battleHistory: toSave.battleHistory.slice(-20),
    };
    const historiesRemoved: SaveState = {
      ...historiesReduced, completedOrders: [], battleHistory: [],
    };
    let previousPayload = serialized;
    for (const compact of [historiesReduced, historiesRemoved]) {
      // Do not retry identical payloads or claim degradation when nothing changed.
      const payload = JSON.stringify(compact);
      if (payload === previousPayload) continue;
      previousPayload = payload;
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, payload);
        return persistenceOutcome({
          status: 'compacted', backupFailed,
          armoryTrimmed: compact.weaponArmory.length < toSave.weaponArmory.length,
        });
      } catch (error) {
        if (!isQuotaError(error)) return persistenceOutcome({ status: 'failed', backupFailed });
      }
    }

    // Last resort only: find the largest fitting suffix instead of dropping
    // straight to 20 weapons. Quota capacity is monotonic in payload size;
    // failed setItem calls leave the last successful candidate intact.
    // At the game's 80-record cap this takes at most seven more writes.
    let low = 0;
    let high = toSave.weaponArmory.length - 1;
    let kept = -1;
    while (low <= high) {
      const count = Math.floor((low + high) / 2);
      const compact: SaveState = {
        ...historiesRemoved,
        weaponArmory: count === 0 ? [] : toSave.weaponArmory.slice(-count),
      };
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(compact));
        kept = count;
        low = count + 1;
      } catch (error) {
        if (!isQuotaError(error)) return persistenceOutcome({ status: 'failed', backupFailed });
        high = count - 1;
      }
    }
    if (kept >= 0) {
      return persistenceOutcome({ status: 'compacted', backupFailed, armoryTrimmed: true });
    }
  } catch {
    // Includes serialization and storage access failures; the caller sees failure.
  }
  return persistenceOutcome({ status: 'failed', backupFailed });
}

export function clearSaveState(): void {
  try {
    localStorage.removeItem(SAVE_STORAGE_KEY);
    localStorage.removeItem(SAVE_BACKUP_KEY);
  } catch {
    // Ignore
  }
}
