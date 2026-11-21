import React, { useEffect, useState } from 'react';
import { GAME_TITLE } from '../data/config';
import { STRINGS } from '../strings';

interface TitleScreenProps {
  hasSave: boolean;
  recoveryNotice?: string | null;
  onContinue: () => void;
  onNewGame: () => void;
  onImportBackup: (code: string) => boolean;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hasSave,
  recoveryNotice,
  onContinue,
  onNewGame,
  onImportBackup,
}) => {
  const [showBackupInput, setShowBackupInput] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [backupError, setBackupError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showBackupInput) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (hasSave) onContinue();
        else onNewGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSave, onContinue, onNewGame, showBackupInput]);

  const handleRestore = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onImportBackup(backupCode);
    if (!ok) {
      setBackupError(true);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-8 safe-area-inset">
      {/* Subtle dark atmospheric scrim over right calm region */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 28% 55%, rgba(18,12,10,0.12) 0%, rgba(18,12,10,0.72) 65%, rgba(18,12,10,0.88) 100%)',
        }}
      />

      {/* Top empty spacer for balanced vertical framing */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        {recoveryNotice ? (
          <div className="border border-[#f59e0b] bg-[#2e1e12]/95 px-3 py-1 font-pixel text-xs text-[#fde047]">
            {recoveryNotice}
          </div>
        ) : (
          <span />
        )}
        <span className="font-pixel text-xs tracking-wider text-[#d4b88c]/80">
          {STRINGS.title.subtitle}
        </span>
      </div>

      {/* Main Title Lockup & <= 3 Primary Actions */}
      <div className="pointer-events-auto relative z-10 mx-auto flex w-full max-w-md flex-col items-center text-center md:ml-auto md:mr-12 md:items-end md:text-right">
        {/* Bespoke inline SVG Title Emblem (Anvil + Flame + Wordmark) */}
        <svg
          viewBox="0 0 360 112"
          className="mb-4 w-full max-w-[340px] drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]"
          role="img"
          aria-label={GAME_TITLE}
        >
          {/* Flame Crest */}
          <path
            d="M180 4 C188 18, 198 22, 194 36 C191 44, 184 48, 180 48 C176 48, 169 44, 166 36 C162 22, 172 18, 180 4 Z"
            fill="#f59e0b"
            stroke="#120c0a"
            strokeWidth="3"
          />
          <path
            d="M180 16 C184 24, 188 28, 185 36 C183 40, 177 40, 175 36 C172 28, 176 24, 180 16 Z"
            fill="#fef08a"
          />
          {/* Crossed Anvil Silhouette bar */}
          <path
            d="M48 44 L152 44 L158 50 L42 50 Z M208 44 L312 44 L318 50 L202 50 Z"
            fill="#945b35"
            stroke="#120c0a"
            strokeWidth="2"
          />
          {/* Display Wordmark */}
          <text
            x="180"
            y="92"
            textAnchor="middle"
            fontFamily="Palatino Linotype, Book Antiqua, Georgia, serif"
            fontWeight="bold"
            fontSize="44"
            letterSpacing="3"
            fill="#fde047"
            stroke="#120c0a"
            strokeWidth="6"
            paintOrder="stroke fill"
          >
            EMBERFORGE
          </text>
        </svg>

        <div className="flex w-full max-w-xs flex-col gap-3">
          {hasSave && (
            <button
              type="button"
              data-start="true"
              onClick={onContinue}
              className="forge-button-primary font-pixel w-full cursor-pointer px-6 py-3 text-base font-bold tracking-wide"
            >
              {STRINGS.title.continueBtn}
            </button>
          )}

          <button
            type="button"
            data-start={hasSave ? undefined : 'true'}
            onClick={onNewGame}
            className={`${hasSave ? 'forge-button' : 'forge-button-primary'} font-pixel w-full cursor-pointer px-6 py-3 text-base font-bold tracking-wide`}
          >
            {STRINGS.title.newGameBtn}
          </button>

          {!showBackupInput ? (
            <button
              type="button"
              onClick={() => {
                setShowBackupInput(true);
                setBackupError(false);
              }}
              className="forge-button font-pixel w-full cursor-pointer px-4 py-2 text-xs text-[#d4b88c]"
            >
              {STRINGS.title.restoreBtn}
            </button>
          ) : (
            <form onSubmit={handleRestore} className="forge-panel flex flex-col gap-2 p-3 text-left">
              <label htmlFor="title-backup-input" className="font-pixel text-xs text-[#f3dfb9]">
                {STRINGS.settings.backupTitle}
              </label>
              <input
                id="title-backup-input"
                type="text"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value);
                  setBackupError(false);
                }}
                placeholder={STRINGS.title.backupPlaceholder}
                className="font-pixel w-full border border-[#6b4931] bg-[#120c0a] px-2 py-2 text-xs text-[#fffbeb] focus:border-[#f59e0b] focus:outline-none"
              />
              {backupError && (
                <p className="text-xs text-[#f87171]">{STRINGS.title.backupInvalid}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="forge-button-primary font-pixel flex-1 cursor-pointer px-3 py-2 text-xs font-bold"
                >
                  {STRINGS.settings.importBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBackupInput(false)}
                  className="forge-button font-pixel cursor-pointer px-3 py-2 text-xs"
                >
                  {STRINGS.settings.cancel}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Single flat borderless control-hint line */}
      <div className="relative z-10 text-center">
        <p className="font-pixel text-xs tracking-wide text-[#e7cfa2]/90 drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">
          {STRINGS.title.controlHint}
        </p>
      </div>
    </div>
  );
};
