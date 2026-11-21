import { RACES } from '../data/races';
import type { RaceId } from '../types';

import { getLoadedSheet, getSheetPortrait, type AssetSheetKey } from './assetSheets';

const canvasCache = new Map<string, HTMLCanvasElement>();

const BATTLE_BG_SHEETS: Record<RaceId, AssetSheetKey> = {
  human: 'battleHuman',
  elf: 'battleElf',
  goblin: 'battleGoblin',
  orc: 'battleOrc',
  demon: 'battleDemon',
};

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function renderProceduralPortrait(
  race: RaceId,
  variant: number,
  isKing: boolean,
): HTMLCanvasElement {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d')!;
  const def = RACES[race];

  // Rich frame background
  ctx.fillStyle = def.palette.badgeBg;
  ctx.fillRect(0, 0, 32, 32);
  // Subtle dithered checker highlight
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < 32; y += 2) {
    for (let x = (y % 4 === 0 ? 0 : 1); x < 32; x += 2) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Shoulders & tunic
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(5, 22, 22, 10);
  ctx.fillStyle = def.palette.primary;
  ctx.fillRect(6, 23, 20, 9);
  ctx.fillStyle = def.palette.secondary;
  ctx.fillRect(11, 23, 10, 3);
  if (isKing) {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(7, 23, 3, 9);
    ctx.fillRect(22, 23, 3, 9);
  }

  // Head silhouette
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(9, 8, 14, 15);
  ctx.fillStyle = def.palette.skin;
  ctx.fillRect(10, 9, 12, 13);

  // Racial features
  if (race === 'elf') {
    // Pointed ears
    ctx.fillStyle = def.palette.skin;
    ctx.fillRect(6, 13, 4, 3);
    ctx.fillRect(22, 13, 4, 3);
    ctx.fillRect(5, 12, 2, 2);
    ctx.fillRect(25, 12, 2, 2);
  } else if (race === 'goblin') {
    // Wide goblin ears & toothy grin
    ctx.fillStyle = def.palette.skin;
    ctx.fillRect(4, 13, 6, 4);
    ctx.fillRect(22, 13, 6, 4);
    ctx.fillRect(3, 12, 3, 2);
    ctx.fillRect(26, 12, 3, 2);
  } else if (race === 'orc') {
    // Broad jaw & tusks
    ctx.fillStyle = def.palette.skin;
    ctx.fillRect(9, 15, 14, 7);
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(11, 18, 2, 3);
    ctx.fillRect(19, 18, 2, 3);
  } else if (race === 'demon') {
    // Horns
    ctx.fillStyle = '#27121b';
    ctx.fillRect(8, 3, 3, 7);
    ctx.fillRect(21, 3, 3, 7);
    ctx.fillRect(6, 2, 3, 3);
    ctx.fillRect(23, 2, 3, 3);
  }

  // Hair / hood / variant differences
  const hairColors = ['#3b2416', '#cbd5e1', '#1e1b18'];
  ctx.fillStyle =
    race === 'elf'
      ? variant === 1
        ? '#f8fafc'
        : '#cbd5e1'
      : race === 'demon'
        ? '#450a0a'
        : hairColors[variant % hairColors.length];

  if (race !== 'goblin' || variant === 1) {
    ctx.fillRect(10, 7, 12, 4);
    if (variant === 1) {
      ctx.fillRect(9, 10, 2, 8);
      ctx.fillRect(21, 10, 2, 8);
    }
  }
  if (race === 'goblin' && variant === 0) {
    // Tinker brass goggles
    ctx.fillStyle = '#eab308';
    ctx.fillRect(10, 8, 5, 4);
    ctx.fillRect(17, 8, 5, 4);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(11, 9, 3, 2);
    ctx.fillRect(18, 9, 3, 2);
  }

  // Eyes
  ctx.fillStyle = race === 'demon' ? '#fde047' : '#120c0a';
  ctx.fillRect(12, 14, 2, 2);
  ctx.fillRect(18, 14, 2, 2);

  // Mouth / beard
  ctx.fillStyle = '#4a2518';
  ctx.fillRect(14, 19, 4, 1);
  if (variant === 2 && (race === 'human' || race === 'orc')) {
    ctx.fillStyle = '#2c2523';
    ctx.fillRect(11, 18, 10, 4);
  }

  // King crown
  if (isKing) {
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(9, 4, 14, 5);
    ctx.fillStyle = race === 'elf' ? '#e2e8f0' : race === 'demon' ? '#f59e0b' : '#facc15';
    ctx.fillRect(10, 6, 12, 3);
    ctx.fillRect(10, 4, 2, 2);
    ctx.fillRect(15, 3, 2, 3);
    ctx.fillRect(20, 4, 2, 2);
    ctx.fillStyle = def.palette.primary;
    ctx.fillRect(15, 7, 2, 1);
  }

  // Crisp inner border
  ctx.strokeStyle = def.palette.secondary;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 31, 31);

  return c;
}

export function getPortraitAsset(
  race: RaceId,
  variant: number,
  isKing = false,
): HTMLCanvasElement | HTMLImageElement {
  const sheetPortrait = getSheetPortrait(race, variant, isKing, 72);
  if (sheetPortrait) return sheetPortrait;

  const id = isKing ? `king_${race}` : `portrait_${race}_${variant % 3}`;
  const cached = canvasCache.get(id);
  if (cached) return cached;

  const c = renderProceduralPortrait(race, variant, isKing);
  canvasCache.set(id, c);
  return c;
}

function renderProceduralWorkshopBg(): HTMLCanvasElement {
  const c = makeCanvas(480, 270);
  const ctx = c.getContext('2d')!;

  // Back wall stone bricks
  ctx.fillStyle = '#211815';
  ctx.fillRect(0, 0, 480, 210);

  for (let row = 0; row < 13; row++) {
    const y = row * 16;
    const offset = row % 2 === 0 ? 0 : 16;
    for (let col = -1; col < 16; col++) {
      const x = col * 32 + offset;
      ctx.fillStyle = (row + col) % 3 === 0 ? '#2b201c' : '#251b18';
      ctx.fillRect(x + 1, y + 1, 30, 14);
      ctx.fillStyle = '#19110f';
      ctx.fillRect(x, y, 32, 1);
      ctx.fillRect(x, y, 1, 16);
    }
  }

  // Timber rafters & beams
  ctx.fillStyle = '#3b2416';
  ctx.fillRect(0, 0, 480, 16);
  ctx.fillStyle = '#2c190e';
  ctx.fillRect(0, 14, 480, 4);
  for (let x = 20; x < 480; x += 110) {
    ctx.fillStyle = '#3b2416';
    ctx.fillRect(x, 16, 12, 194);
    ctx.fillStyle = '#543420';
    ctx.fillRect(x + 2, 16, 2, 194);
  }

  // Window with twilight sky on right wall
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(344, 46, 52, 54);
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(348, 50, 44, 46);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(350, 52, 18, 20);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(378, 58, 4, 4);
  // Window mullions
  ctx.fillStyle = '#3b2416';
  ctx.fillRect(369, 50, 3, 46);
  ctx.fillRect(348, 72, 44, 3);

  // Hanging shelf & wall rack
  ctx.fillStyle = '#633c23';
  ctx.fillRect(152, 62, 130, 6);
  ctx.fillStyle = '#945b35';
  ctx.fillRect(152, 62, 130, 2);

  // Stone flagstone floor
  ctx.fillStyle = '#362d2b';
  ctx.fillRect(0, 208, 480, 62);
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(0, 208, 480, 2);
  for (let row = 0; row < 4; row++) {
    const fy = 212 + row * 15;
    for (let col = 0; col < 12; col++) {
      const fx = col * 42 + (row % 2) * 20;
      ctx.fillStyle = (col + row) % 2 === 0 ? '#453b38' : '#3d3330';
      ctx.fillRect(fx, fy, 39, 12);
    }
  }

  // Door frame on far right for arriving customers
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(422, 86, 46, 122);
  ctx.fillStyle = '#4e2f1d';
  ctx.fillRect(426, 90, 38, 118);
  ctx.fillStyle = '#7c4d25';
  ctx.fillRect(430, 94, 30, 114);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(434, 152, 4, 4);

  return c;
}

function renderProceduralBattleBg(race: RaceId): HTMLCanvasElement {
  const c = makeCanvas(480, 270);
  const ctx = c.getContext('2d')!;

  const palettes: Record<
    RaceId,
    { skyTop: string; skyBot: string; hill: string; ground: string; detail: string }
  > = {
    human: {
      skyTop: '#1d4ed8',
      skyBot: '#93c5fd',
      hill: '#15803d',
      ground: '#3f6212',
      detail: '#cbd5e1',
    },
    elf: {
      skyTop: '#064e3b',
      skyBot: '#10b981',
      hill: '#065f46',
      ground: '#14532d',
      detail: '#a7f3d0',
    },
    goblin: {
      skyTop: '#1c1917',
      skyBot: '#3f3f46',
      hill: '#292524',
      ground: '#44403c',
      detail: '#a3e635',
    },
    orc: {
      skyTop: '#7c2d12',
      skyBot: '#ea580c',
      hill: '#9a3412',
      ground: '#57534e',
      detail: '#fca5a5',
    },
    demon: {
      skyTop: '#3b0764',
      skyBot: '#991b1b',
      hill: '#450a0a',
      ground: '#1c1917',
      detail: '#f97316',
    },
  };

  const p = palettes[race];
  ctx.fillStyle = p.skyTop;
  ctx.fillRect(0, 0, 480, 100);
  ctx.fillStyle = p.skyBot;
  ctx.fillRect(0, 100, 480, 90);

  // Distant jagged hills/mountains
  ctx.fillStyle = p.hill;
  for (let x = 0; x < 480; x += 24) {
    const h = 25 + Math.floor(Math.sin(x * 0.04 + race.length) * 18 + 18);
    ctx.fillRect(x, 190 - h, 24, h);
  }

  // Ground plane
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 190, 480, 80);
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(0, 190, 480, 2);

  // Ambient details (trees, mushrooms, spires, castle)
  ctx.fillStyle = p.detail;
  for (let i = 0; i < 6; i++) {
    const dx = 35 + i * 78;
    ctx.fillRect(dx, 145 + (i % 2) * 10, 6, 45);
    ctx.fillRect(dx - 8, 136 + (i % 2) * 10, 22, 14);
  }

  return c;
}

export function getWorkshopBgAsset(): HTMLCanvasElement | HTMLImageElement {
  const loaded = getLoadedSheet('workshopBg');
  if (loaded) return loaded;

  const id = 'workshop_bg';
  const cached = canvasCache.get(id);
  if (cached) return cached;

  const c = renderProceduralWorkshopBg();
  canvasCache.set(id, c);
  return c;
}

export function getBattleBgAsset(race: RaceId): HTMLCanvasElement | HTMLImageElement {
  const loaded = getLoadedSheet(BATTLE_BG_SHEETS[race]);
  if (loaded) return loaded;

  const id = `battle_bg_${race}`;
  const cached = canvasCache.get(id);
  if (cached) return cached;

  const c = renderProceduralBattleBg(race);
  canvasCache.set(id, c);
  return c;
}
