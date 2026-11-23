import type { PopularityTierId, QualityGrade, RaceId, RarityId } from '../types';

export const GAME_TITLE = 'Emberforge';
export const APP_ID = 'com.emberforge.game';

export const KINGDOM_NAMES: Record<RaceId, string> = {
  human: 'Aldermere',
  elf: 'Sylvara',
  goblin: 'Grubnak Warrens',
  orc: 'Kharzul Horde',
  demon: 'Infernis',
};

export const LEGENDARY_LEVEL = 10;
export const LEGENDARY_MILESTONES = [10, 15, 20] as const;

export const PROGRESSIVE_UNLOCK = true;

export const UNLOCK_SEQUENCE: RaceId[] = ['human', 'demon', 'elf', 'goblin', 'orc'];

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 270;

export const SAVE_STORAGE_KEY = 'emberforge_save_v1';
export const SAVE_BACKUP_KEY = 'emberforge_save_v1_backup';
// v4: same-snapshot daily ledger; downgrade preservation is unsupported.
export const SAVE_VERSION = 4;

export const POPULARITY_TIERS: {
  id: PopularityTierId;
  label: string;
  min: number;
}[] = [
  { id: 'unknown', label: 'Unknown', min: 0 },
  { id: 'known', label: 'Known', min: 25 },
  { id: 'respected', label: 'Respected', min: 70 },
  { id: 'renowned', label: 'Renowned', min: 140 },
  { id: 'legendary', label: 'Legendary', min: 240 },
];

export const RARITY_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'mythic'];

export const RARITY_LABELS: Record<RarityId, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  mythic: 'Mythic',
};

export const RARITY_COLORS: Record<RarityId, string> = {
  common: '#c8c2b8',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  mythic: '#fbbf24',
};

export const QUALITY_GRADE_META: Record<
  QualityGrade,
  { label: string; color: string; feeMultiplier: number; statBonus: number; popBonus: number }
> = {
  S: { label: 'Masterwork', color: '#fbbf24', feeMultiplier: 1.35, statBonus: 3, popBonus: 6 },
  A: { label: 'Superior', color: '#c084fc', feeMultiplier: 1.18, statBonus: 2, popBonus: 3 },
  B: { label: 'Fine', color: '#4ade80', feeMultiplier: 1.06, statBonus: 1, popBonus: 1 },
  C: { label: 'Passable', color: '#d4b88c', feeMultiplier: 0.95, statBonus: 0, popBonus: 0 },
  D: { label: 'Flawed', color: '#f87171', feeMultiplier: 0.65, statBonus: -1, popBonus: -4 },
};

export const SMITH_TITLES = [
  'Apprentice',
  'Tinker',
  'Artisan',
  'Journeyman',
  'Bladesmith',
  'Metalsmith',
  'Master Smith',
  'Grand Artificer',
  'Royal Forger',
  'Mythic Paragon',
] as const;

export function getSmithProgress(xp: number): {
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
} {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  let threshold = 0;
  let step = 100;
  while (level < 20 && safeXp >= threshold + step) {
    threshold += step;
    level += 1;
    step = Math.round(100 * Math.pow(1.22, level - 1));
  }
  const titleIdx = Math.min(SMITH_TITLES.length - 1, Math.floor((level - 1) / 2));
  const inLevel = safeXp - threshold;
  const progressPct = level >= 20 ? 100 : Math.min(100, Math.round((inLevel / step) * 100));
  return {
    level,
    title: SMITH_TITLES[titleIdx],
    currentLevelXp: inLevel,
    nextLevelXp: step,
    progressPct,
  };
}

export const SKIN_TONES = [
  { name: 'Porcelain', hex: '#f3cfb6', shadow: '#c79679' },
  { name: 'Warm Tan', hex: '#d89b6e', shadow: '#a66b43' },
  { name: 'Chestnut', hex: '#9c623e', shadow: '#6b3e24' },
  { name: 'Deep Umber', hex: '#633c29', shadow: '#3f2216' },
];

export const HAIR_COLORS = [
  { name: 'Charcoal', hex: '#282328', highlight: '#4b434d' },
  { name: 'Copper', hex: '#b85028', highlight: '#e07a3c' },
  { name: 'Honey Gold', hex: '#d9a441', highlight: '#f5d26b' },
  { name: 'Silver Ash', hex: '#b6bec9', highlight: '#e2e8f0' },
  { name: 'Crimson', hex: '#9e2835', highlight: '#d1495b' },
];

export const OUTFIT_COLORS = [
  { name: 'Leather & Amber', main: '#7a4427', trim: '#d97706' },
  { name: 'Cobalt Guild', main: '#2b4c7e', trim: '#e0a938' },
  { name: 'Forest Ranger', main: '#2d5a3c', trim: '#b6c4b0' },
  { name: 'Obsidian Forge', main: '#332d38', trim: '#c44536' },
];
