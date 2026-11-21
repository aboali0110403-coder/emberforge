import type { RarityId } from '../types';

/**
 * Shared 32-color SNES warm forge + 5-race palette.
 */
export const SNES_PALETTE = {
  // Deep Forge Shadows & Stone
  voidBlack: '#120c0a',
  charcoal: '#211815',
  slateDark: '#362d2b',
  slateMid: '#544a47',
  slateLight: '#827772',
  // Warm Wood & Leather
  woodDark: '#3b2416',
  woodMid: '#633c23',
  woodLight: '#945b35',
  leatherTan: '#c48a54',
  parchment: '#f3dfb9',
  // Fire, Embers & Gold
  emberRed: '#b91c1c',
  forgeOrange: '#ea580c',
  flameAmber: '#f59e0b',
  flameYellow: '#fde047',
  whiteHot: '#fffbeb',
  // Metals
  ironDark: '#3f4754',
  ironMid: '#6c7787',
  steelLight: '#b3c0cf',
  steelShine: '#eef4fa',
  // Humans (Blue / Gold)
  humanBlue: '#2563eb',
  humanGold: '#eab308',
  // Elves (Green / Silver)
  elfGreen: '#15803d',
  elfSilver: '#cbd5e1',
  // Goblins (Olive / Brown)
  goblinOlive: '#65a30d',
  goblinBrown: '#854d0e',
  // Orcs (Rust / Iron)
  orcRust: '#b45309',
  orcSkin: '#6e8c54',
  // Demons (Crimson / Violet)
  demonCrimson: '#dc2626',
  demonViolet: '#7e22ce',
  // Water & Arcane
  quenchBlue: '#0284c7',
  quenchFoam: '#7dd3fc',
  arcaneCyan: '#38bdf8',
} as const;

export const PART_RARITY_PALETTES: Record<
  RarityId,
  { dark: string; mid: string; light: string; trim: string }
> = {
  common: {
    dark: '#3f4754',
    mid: '#6c7787',
    light: '#b3c0cf',
    trim: '#633c23',
  },
  uncommon: {
    dark: '#14532d',
    mid: '#22c55e',
    light: '#bbf7d0',
    trim: '#854d0e',
  },
  rare: {
    dark: '#1e3a8a',
    mid: '#3b82f6',
    light: '#bae6fd',
    trim: '#eab308',
  },
  epic: {
    dark: '#4c1d95',
    mid: '#9333ea',
    light: '#f3e8ff',
    trim: '#f59e0b',
  },
  mythic: {
    dark: '#991b1b',
    mid: '#f59e0b',
    light: '#fef9c3',
    trim: '#fef08a',
  },
};
