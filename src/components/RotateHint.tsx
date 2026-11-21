import React from 'react';
import { STRINGS } from '../strings';

export const RotateHint: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 hidden flex-col items-center justify-center bg-[#120c0a]/95 p-6 text-center max-[520px]:portrait:flex">
      <div className="forge-panel flex max-w-xs flex-col items-center gap-3 p-6">
        <svg viewBox="0 0 48 48" className="h-14 w-14 text-[#fde047]" aria-hidden="true">
          <rect
            x="14"
            y="6"
            width="20"
            height="34"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <circle cx="24" cy="35" r="2" fill="currentColor" />
          <path
            d="M8 22 C8 14, 14 10, 20 10"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
          />
        </svg>
        <h2 className="font-display text-lg font-bold text-[#fde047]">
          {STRINGS.hud.rotateTitle}
        </h2>
        <p className="text-xs leading-relaxed text-[#d4b88c]">
          {STRINGS.hud.rotateBody}
        </p>
      </div>
    </div>
  );
};
