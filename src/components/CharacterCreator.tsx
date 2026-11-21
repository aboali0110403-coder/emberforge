import React, { useState } from 'react';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../data/config';
import { STRINGS } from '../strings';
import type { PlayerCustomization } from '../types';
import { PlayerSpritePreview } from './PixelThumbnail';

interface CharacterCreatorProps {
  onConfirm: (player: PlayerCustomization) => void;
  onBack: () => void;
}

export const CharacterCreator: React.FC<CharacterCreatorProps> = ({
  onConfirm,
  onBack,
}) => {
  const [name, setName] = useState(STRINGS.charCreate.nameDefault);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [skinToneIndex, setSkinToneIndex] = useState(0);
  const [hairColorIndex, setHairColorIndex] = useState(1);
  const [outfitColorIndex, setOutfitColorIndex] = useState(0);
  const [nameError, setNameError] = useState(false);

  const player: PlayerCustomization = {
    name: name.trim() || STRINGS.charCreate.nameDefault,
    gender,
    skinToneIndex,
    hairColorIndex,
    outfitColorIndex,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    onConfirm({
      ...player,
      name: name.trim().slice(0, 18),
    });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#120c0a]/90 p-3 sm:p-6 safe-area-inset">
      <form
        onSubmit={handleSubmit}
        className="forge-panel forge-scroll flex max-h-[94vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4 sm:p-6"
      >
        <div className="flex items-center justify-between border-b border-[#4a3222] pb-3">
          <h1 className="font-display text-2xl font-bold text-[#fde047]">
            {STRINGS.charCreate.heading}
          </h1>
          <button
            type="button"
            onClick={onBack}
            className="forge-button font-pixel cursor-pointer px-4 py-2 text-xs"
          >
            {STRINGS.charCreate.back}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[180px_1fr]">
          {/* Live 32x32 Pixel Preview */}
          <div className="flex flex-col items-center justify-center border border-[#4a3222] bg-[#17100d] p-4">
            <PlayerSpritePreview player={player} size={112} />
            <span className="font-pixel mt-2 text-sm font-bold text-[#fef08a]">
              {player.name}
            </span>
            <span className="font-pixel text-xs text-[#b89f7d]">
              {OUTFIT_COLORS[outfitColorIndex]?.name}
            </span>
          </div>

          {/* Customization Controls */}
          <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="smith-name-input"
                className="font-pixel mb-1 block text-xs text-[#d4b88c]"
              >
                {STRINGS.charCreate.nameLabel}
              </label>
              <input
                id="smith-name-input"
                type="text"
                maxLength={18}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(false);
                }}
                className="font-pixel w-full border-2 border-[#6b4931] bg-[#120c0a] px-3 py-2 text-sm text-[#fffbeb] focus:border-[#f59e0b] focus:outline-none"
              />
              {nameError && (
                <p className="mt-1 text-xs text-[#f87171]">Please enter a smith name.</p>
              )}
            </div>

            <div>
              <span className="font-pixel mb-1 block text-xs text-[#d4b88c]">
                {STRINGS.charCreate.genderLabel}
              </span>
              <div className="flex gap-2">
                {(['male', 'female'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`font-pixel flex-1 cursor-pointer border-2 px-4 py-2 text-xs font-bold ${
                      gender === g
                        ? 'border-[#f59e0b] bg-[#b45309] text-[#fffbeb]'
                        : 'border-[#6b4931] bg-[#241914] text-[#d4b88c]'
                    }`}
                  >
                    {g === 'male' ? STRINGS.charCreate.male : STRINGS.charCreate.female}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="font-pixel mb-1 block text-xs text-[#d4b88c]">
                {STRINGS.charCreate.skinLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                {SKIN_TONES.map((tone, idx) => (
                  <button
                    key={tone.name}
                    type="button"
                    aria-label={`Skin tone ${tone.name}`}
                    onClick={() => setSkinToneIndex(idx)}
                    className={`h-11 w-11 cursor-pointer border-2 ${
                      skinToneIndex === idx ? 'border-[#fde047] scale-105' : 'border-[#4a3222]'
                    }`}
                    style={{ backgroundColor: tone.hex }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="font-pixel mb-1 block text-xs text-[#d4b88c]">
                {STRINGS.charCreate.hairLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                {HAIR_COLORS.map((hair, idx) => (
                  <button
                    key={hair.name}
                    type="button"
                    aria-label={`Hair color ${hair.name}`}
                    onClick={() => setHairColorIndex(idx)}
                    className={`h-11 w-11 cursor-pointer border-2 ${
                      hairColorIndex === idx ? 'border-[#fde047] scale-105' : 'border-[#4a3222]'
                    }`}
                    style={{ backgroundColor: hair.hex }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="font-pixel mb-1 block text-xs text-[#d4b88c]">
                {STRINGS.charCreate.outfitLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                {OUTFIT_COLORS.map((outfit, idx) => (
                  <button
                    key={outfit.name}
                    type="button"
                    aria-label={`Outfit ${outfit.name}`}
                    onClick={() => setOutfitColorIndex(idx)}
                    className={`flex h-11 min-w-[44px] cursor-pointer items-center justify-center border-2 px-2 ${
                      outfitColorIndex === idx ? 'border-[#fde047]' : 'border-[#4a3222]'
                    }`}
                    style={{ backgroundColor: outfit.main }}
                  >
                    <span
                      className="h-4 w-4 border border-black/40"
                      style={{ backgroundColor: outfit.trim }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          data-start="true"
          className="forge-button-primary font-pixel mt-1 w-full cursor-pointer py-3 text-base font-bold tracking-wide"
        >
          {STRINGS.charCreate.startWorkshop}
        </button>
      </form>
    </div>
  );
};
