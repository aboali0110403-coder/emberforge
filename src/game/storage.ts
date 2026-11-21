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

export function loadSaveStateWithStatus(): SaveLoadStatus {
  try {
    const primaryRaw = localStorage.getItem(SAVE_STORAGE_KEY);
    const primaryParsed = tryParseSave(primaryRaw);
    if (primaryParsed) {
      return { state: primaryParsed, recoveredFromBackup: false, corruptedCleared: false };
    }

    const backupRaw = localStorage.getItem(SAVE_BACKUP_KEY);
    const backupParsed = tryParseSave(backupRaw);
    if (backupParsed) {
      // Restore backup back into primary slot cleanly
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(backupParsed));
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
