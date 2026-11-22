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
      // The recovered backup may itself have been migrated; refresh it so a
      // second corruption cannot restore a different outcome.
      if (resolvedResultsChangedOnLoad(backupRaw, backupParsed)) {
        try {
          localStorage.setItem(SAVE_BACKUP_KEY, serialized);
        } catch {
          // Primary now holds the migrated state; keep the old backup as is.
        }
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

export function persistSaveState(state: SaveState): void {
  try {
    const toSave: SaveState = {
      ...state,
      weaponArmory: state.weaponArmory.slice(-80),
      completedOrders: state.completedOrders.slice(-60),
      battleHistory: state.battleHistory.slice(-60),
      updatedAt: Date.now(),
    };
    const serialized = JSON.stringify(toSave);
    if (!serialized || serialized.length < 20) return;

    const existingPrimary = localStorage.getItem(SAVE_STORAGE_KEY);
    if (existingPrimary && tryParseSave(existingPrimary)) {
      localStorage.setItem(SAVE_BACKUP_KEY, existingPrimary);
    }
    localStorage.setItem(SAVE_STORAGE_KEY, serialized);
  } catch {
    // Retry with trimmed history on storage quota pressure
    try {
      const compact: SaveState = {
        ...state,
        weaponArmory: state.weaponArmory.slice(-20),
        completedOrders: state.completedOrders.slice(-20),
        battleHistory: state.battleHistory.slice(-20),
        updatedAt: Date.now(),
      };
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore quota errors on restricted environments
    }
  }
}

export function clearSaveState(): void {
  try {
    localStorage.removeItem(SAVE_STORAGE_KEY);
    localStorage.removeItem(SAVE_BACKUP_KEY);
  } catch {
    // Ignore
  }
}
