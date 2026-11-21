import React, { useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { getSmithProgress } from '../data/config';
import { encodeBackupCode } from '../game/rules';
import { STRINGS } from '../strings';
import type { AudioSettings, SaveState } from '../types';

interface SettingsModalProps {
  save: SaveState;
  onClose: () => void;
  onUpdateAudio: (audio: AudioSettings) => void;
  onReplayTutorials: () => void;
  onImportBackup: (code: string) => boolean;
  onResetGame: () => void;
  onDeleteSave: () => void;
  onReturnToTitle: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  save,
  onClose,
  onUpdateAudio,
  onReplayTutorials,
  onImportBackup,
  onResetGame,
  onDeleteSave,
  onReturnToTitle,
}) => {
  const [copied, setCopied] = useState(false);
  const [tutResetDone, setTutResetDone] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const backupCode = encodeBackupCode(save);
  const smithProg = getSmithProgress(save.smithXp);
  const totalConquered = Object.values(save.conqueredTerritories ?? {}).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(backupCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select input manually
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3 sm:p-4 safe-area-inset">
      <div className="forge-panel forge-scroll flex max-h-[92vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center justify-between border-b border-[#4a3222] pb-2">
          <h2 className="font-display text-xl font-bold text-[#fde047]">
            {STRINGS.settings.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="forge-button-primary font-pixel cursor-pointer px-4 py-2 text-xs font-bold"
          >
            {STRINGS.settings.resume}
          </button>
        </div>

        {/* Career Snapshot */}
        <div className="grid grid-cols-3 gap-2 border border-[#4a3222] bg-[#17100d] p-3 font-pixel text-xs">
          <div>
            <div className="text-[#9ca3af]">Smith Rank</div>
            <div className="font-bold text-[#93c5fd]">
              Lv {smithProg.level} · {smithProg.title}
            </div>
          </div>
          <div>
            <div className="text-[#9ca3af]">Territories</div>
            <div className="font-bold text-[#4ade80]">{totalConquered} / 15</div>
          </div>
          <div>
            <div className="text-[#9ca3af]">Orders Built</div>
            <div className="font-bold text-[#fde047]">{save.stats.ordersCompleted}</div>
          </div>
        </div>

        {/* Audio Sliders */}
        <div className="flex flex-col gap-3 border border-[#4a3222] bg-[#17100d] p-3">
          <label className="flex items-center justify-between gap-4">
            <span className="font-pixel text-xs text-[#f3dfb9]">
              {STRINGS.settings.musicVol} ({Math.round(save.audio.musicVolume * 100)}%)
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={save.audio.musicVolume}
              onChange={(e) =>
                onUpdateAudio({ ...save.audio, musicVolume: Number(e.target.value) })
              }
              className="w-36 accent-[#f59e0b]"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="font-pixel text-xs text-[#f3dfb9]">
              {STRINGS.settings.sfxVol} ({Math.round(save.audio.sfxVolume * 100)}%)
            </span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={save.audio.sfxVolume}
                onChange={(e) =>
                  onUpdateAudio({ ...save.audio, sfxVolume: Number(e.target.value) })
                }
                className="w-28 accent-[#f59e0b]"
              />
              <button
                type="button"
                onClick={() => soundEngine.playTestSfx()}
                className="forge-button font-pixel cursor-pointer px-2 py-1 text-[10px]"
              >
                {STRINGS.settings.testSfx}
              </button>
            </div>
          </label>

          <label className="flex cursor-pointer items-center justify-between">
            <span className="font-pixel text-xs text-[#f3dfb9]">
              {STRINGS.settings.muteAll}
            </span>
            <input
              type="checkbox"
              checked={save.audio.muted}
              onChange={(e) =>
                onUpdateAudio({ ...save.audio, muted: e.target.checked })
              }
              className="h-5 w-5 accent-[#f59e0b]"
            />
          </label>
        </div>

        {/* Tutorials */}
        <div className="flex items-center justify-between border border-[#4a3222] bg-[#17100d] p-3">
          <span className="font-pixel text-xs text-[#d4b88c]">
            {tutResetDone ? STRINGS.settings.tutorialsReset : 'Station Guides'}
          </span>
          <button
            type="button"
            onClick={() => {
              onReplayTutorials();
              setTutResetDone(true);
            }}
            className="forge-button font-pixel cursor-pointer px-3 py-2 text-xs"
          >
            {STRINGS.settings.replayTutorials}
          </button>
        </div>

        {/* Save Backup Code */}
        <div className="flex flex-col gap-2 border border-[#4a3222] bg-[#17100d] p-3">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-xs font-bold text-[#f3dfb9]">
              {STRINGS.settings.backupTitle}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="forge-button font-pixel cursor-pointer px-3 py-1.5 text-xs text-[#fde047]"
            >
              {copied ? STRINGS.settings.copied : STRINGS.settings.copyCode}
            </button>
          </div>
          <input
            type="text"
            readOnly
            aria-label="Backup code"
            value={backupCode}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="font-pixel w-full border border-[#3b2619] bg-[#120c0a] px-2 py-1.5 text-[11px] text-[#9ca3af]"
          />

          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(false);
              }}
              placeholder={STRINGS.settings.importPlaceholder}
              className="font-pixel flex-1 border border-[#6b4931] bg-[#120c0a] px-2 py-1.5 text-xs text-[#fffbeb]"
            />
            <button
              type="button"
              onClick={() => {
                if (!onImportBackup(importText)) setImportError(true);
              }}
              className="forge-button font-pixel cursor-pointer px-3 py-1.5 text-xs"
            >
              {STRINGS.settings.importBtn}
            </button>
          </div>
          {importError && (
            <p className="text-xs text-[#f87171]">{STRINGS.title.backupInvalid}</p>
          )}
        </div>

        {/* Reset Forge (Start Fresh) & Return / Delete */}
        <div className="flex flex-col gap-2 border-t border-[#362419] pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onReturnToTitle}
              className="forge-button font-pixel cursor-pointer px-4 py-2 text-xs"
            >
              {STRINGS.settings.returnTitle}
            </button>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(true);
                  setConfirmDelete(false);
                }}
                className="forge-button font-pixel cursor-pointer px-3 py-2 text-xs text-[#fbbf24]"
              >
                {STRINGS.settings.resetGame}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onResetGame}
                  className="font-pixel cursor-pointer border-2 border-[#f59e0b] bg-[#92400e] px-3 py-2 text-xs font-bold text-white"
                >
                  {STRINGS.settings.confirmReset}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="forge-button font-pixel cursor-pointer px-3 py-2 text-xs"
                >
                  {STRINGS.settings.cancel}
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(true);
                  setConfirmReset(false);
                }}
                className="font-pixel cursor-pointer border-2 border-[#991b1b] bg-[#450a0a] px-4 py-2 text-xs font-bold text-[#fca5a5]"
              >
                {STRINGS.settings.deleteSave}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onDeleteSave}
                  className="font-pixel cursor-pointer border-2 border-[#ef4444] bg-[#b91c1c] px-3 py-2 text-xs font-bold text-white"
                >
                  {STRINGS.settings.confirmDelete}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="forge-button font-pixel cursor-pointer px-3 py-2 text-xs"
                >
                  {STRINGS.settings.cancel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
