import { enqueueProcessing, yieldProcessing, processNativeCrop } from './spriteProcessing';
import { assetLoader, assetUrl, requestImage } from './assetLoader';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../data/config';
import type {
  EquipmentId,
  MaterialShape,
  PlayerCustomization,
  RaceId,
  RarityId,
  WeaponTypeId,
} from '../types';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ASSET_PATHS = {
  portraits16: assetUrl('./assets/aistudio/Gemini_Generated_Image_3lnh4y3lnh4y3lnh_f30c433a.jfif'),
  portraits5: assetUrl('./assets/aistudio/Gemini_Generated_Image_kodsrvkodsrvkods__2__df5a6c58.jfif'),
  kings5: assetUrl('./assets/aistudio/Gemini_Generated_Image_kodsrvkodsrvkods__3__c61fe9db.jfif'),
  mixedWeapons: assetUrl('./assets/aistudio/Gemini_Generated_Image_kodsrvkodsrvkods__1__f46350f3.jfif'),
  forgeUi: assetUrl('./assets/aistudio/Gemini_Generated_Image_rcbthrcbthrcbthr__1__2cdcb958.jfif'),
  icons15: assetUrl('./assets/aistudio/Gemini_Generated_Image_v9haxuv9haxuv9ha_61afac88.jfif'),
  weaponsA: assetUrl('./assets/aistudio/Gemini_Generated_Image_verhr1verhr1verh__1__a01853ef.jfif'),
  weaponsB: assetUrl('./assets/aistudio/Gemini_Generated_Image_verhr1verhr1verh_eebccb49.jfif'),
  equipment: assetUrl('./assets/aistudio/Gemini_Generated_Image_v9haxuv9haxuv9ha__1__5addd03b.jfif'),
  vfx9: assetUrl('./assets/aistudio/Gemini_Generated_Image_rcbthrcbthrcbthr_6b92715f.jfif'),
  playerSheet: assetUrl('./assets/aistudio/Gemini_Generated_Image_rcbthrcbthrcbthr__2__14fbd82c.jfif'),
  workshopBg: assetUrl('./assets/aistudio/Gemini_Generated_Image_kodsrvkodsrvkods__5__b083e146.jfif'),
  worldMap: assetUrl('./assets/aistudio/Gemini_Generated_Image_kodsrvkodsrvkods__4__9bd21ea9.jfif'),
  battleHuman: assetUrl('./assets/aistudio/Gemini_Generated_Image_kodsrvkodsrvkods_e144a380.jfif'),
  battleElf: assetUrl('./assets/aistudio/Gemini_Generated_Image_oaxk7qoaxk7qoaxk__3__87723133.jfif'),
  battleGoblin: assetUrl('./assets/aistudio/Gemini_Generated_Image_oaxk7qoaxk7qoaxk__2__8088079b.jfif'),
  battleOrc: assetUrl('./assets/aistudio/Gemini_Generated_Image_oaxk7qoaxk7qoaxk__1__1b5ba3c7.jfif'),
  battleDemon: assetUrl('./assets/aistudio/Gemini_Generated_Image_oaxk7qoaxk7qoaxk_66664de1.jfif'),
} as const;

export type AssetSheetKey = keyof typeof ASSET_PATHS;

const processingSprites = new Set<string>();
const failedSprites = new Map<string, number>();
const spriteCache = new Map<string, HTMLCanvasElement>();
export const subscribeAssetLoad = assetLoader.subscribe;
export function ensureAssetsPreloaded(): void {
  requestImage('sheet:workshopBg', ASSET_PATHS.workshopBg, 0);
}
export function getLoadedSheet(key: AssetSheetKey): HTMLImageElement | null {
  return requestImage(`sheet:${key}`, ASSET_PATHS[key], key === 'workshopBg' ? 0 : 1);
}

function makeCanvas(w: number, h: number, willReadFrequently = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  if (willReadFrequently) {
    c.getContext('2d', { willReadFrequently: true });
  }
  return c;
}

/**
 * Chroma-keys bright magenta backgrounds and despills anti-aliased pink edge pixels
 * cleanly in place on an ImageData buffer.
 */
function keyOutMagentaInPlace(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const magentaExcess = r + b - 2 * g;
    if (r > 145 && b > 115 && g < 118 && magentaExcess > 115) {
      data[i + 3] = 0;
    } else if (magentaExcess > 48 && r > g + 22 && b > g + 16) {
      // Edge fringe despill & smooth alpha falloff
      const strength = Math.min(1, (magentaExcess - 48) / 72);
      const avg = Math.min(r, b);
      data[i] = Math.round(r * (1 - strength) + g * strength);
      data[i + 2] = Math.round(b * (1 - strength) + g * strength);
      if (avg > g + 30) {
        data[i + 3] = Math.round(data[i + 3] * (1 - strength * 0.72));
      }
    }
  }
}

/**
 * Extracts a rectangular region from a loaded sheet, strips magenta background,
 * and scales into target dimensions using either fit (contain) or cover cropping.
 */
function extractChromaSprite(
  cacheKey: string,
  sheetKey: AssetSheetKey,
  rect: CropRect,
  outW: number,
  outH: number,
  mode: 'contain' | 'cover' | 'stretch' = 'contain',
  postProcess?: (data: Uint8ClampedArray, w: number, h: number, offsetY: number, fullHeight: number) => void,
): HTMLCanvasElement | null {
  const existing = spriteCache.get(cacheKey);
  if (existing) return existing;

  const img = getLoadedSheet(sheetKey);
  if (!img) return null;

  const sx = Math.max(0, Math.round(rect.x));
  const sy = Math.max(0, Math.round(rect.y));
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(rect.w)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(rect.h)));

  if (processingSprites.has(cacheKey) || failedSprites.get(cacheKey) === assetLoader.getRetryVersion()) return null;
  processingSprites.add(cacheKey);
  assetLoader.markProcessing(`sheet:${sheetKey}|${cacheKey}`, true);
  enqueueProcessing(async () => {
  // Step 1: Extract source region and strip magenta at native detail
  const work = makeCanvas(sw, sh, true);
  const wCtx = work.getContext('2d', { willReadFrequently: true })!;
  const native = await processNativeCrop(img, sx, sy, sw, sh);
  if (!native) wCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  // Process small native-detail stripes; preserve whole-image coordinates for tinting.
  for (let y = 0; y < sh; y += 16) {
    const rows = Math.min(16, sh - y);
    const imgData = native ? new ImageData(native.slice(y * sw * 4, (y + rows) * sw * 4), sw, rows) : wCtx.getImageData(0, y, sw, rows);
    if (!native) keyOutMagentaInPlace(imgData.data);
    postProcess?.(imgData.data, sw, rows, y, sh);
    wCtx.putImageData(imgData, 0, y);
    await yieldProcessing();
  }

  // Step 2: Blit into crisp target canvas
  const out = makeCanvas(outW, outH);
  const oCtx = out.getContext('2d')!;
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = 'medium';

  if (mode === 'stretch') {
    oCtx.drawImage(work, 0, 0, sw, sh, 0, 0, outW, outH);
  } else if (mode === 'cover') {
    const scale = Math.max(outW / sw, outH / sh);
    const cropW = outW / scale;
    const cropH = outH / scale;
    const cropX = (sw - cropW) / 2;
    const cropY = Math.max(0, (sh - cropH) * 0.28); // Favor upper-center for faces
    oCtx.drawImage(work, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
  } else {
    const scale = Math.min(outW / sw, outH / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (outW - dw) / 2;
    const dy = (outH - dh) / 2;
    oCtx.drawImage(work, 0, 0, sw, sh, dx, dy, dw, dh);
  }

  spriteCache.set(cacheKey, out);
  processingSprites.delete(cacheKey);
  assetLoader.markProcessing(`sheet:${sheetKey}|${cacheKey}`, false);
  }).catch(() => {
    processingSprites.delete(cacheKey);
    failedSprites.set(cacheKey, assetLoader.getRetryVersion());
    assetLoader.markProcessing(`sheet:${sheetKey}|${cacheKey}`, false, 'Sprite processing failed');
  });
  return null;
}

// ============================================================================
// 1. PORTRAIT & KING ASSETS
// ============================================================================

const CUSTOMER_PORTRAIT_RECTS: Record<RaceId, CropRect[]> = {
  human: [
    { x: 10, y: 10, w: 392, h: 392 },
    { x: 422, y: 10, w: 388, h: 392 },
    { x: 832, y: 10, w: 390, h: 392 },
    { x: 1240, y: 10, w: 392, h: 392 },
  ],
  elf: [
    { x: 10, y: 418, w: 392, h: 394 },
    { x: 422, y: 418, w: 388, h: 394 },
    { x: 832, y: 418, w: 390, h: 394 },
  ],
  goblin: [
    { x: 10, y: 826, w: 530, h: 394 },
    { x: 832, y: 826, w: 390, h: 394 },
    { x: 1378, y: 826, w: 660, h: 394 },
  ],
  orc: [
    { x: 10, y: 1236, w: 662, h: 394 },
    { x: 810, y: 1236, w: 428, h: 394 },
    // Third orc comes from portraits5 (Orc Warrior) so no stray human sneaks in!
  ],
  demon: [
    { x: 10, y: 1648, w: 662, h: 392 },
    { x: 826, y: 1648, w: 398, h: 392 },
    { x: 1378, y: 1648, w: 660, h: 392 },
  ],
};

const REP_PORTRAIT_RECTS: Record<RaceId, CropRect> = {
  human: { x: 16, y: 14, w: 656, h: 966 },
  elf: { x: 698, y: 14, w: 650, h: 966 },
  goblin: { x: 1374, y: 14, w: 658, h: 966 },
  orc: { x: 16, y: 1012, w: 994, h: 1018 },
  demon: { x: 1036, y: 1012, w: 996, h: 1018 },
};

const KING_PORTRAIT_RECTS: Record<RaceId, CropRect> = {
  human: { x: 10, y: 10, w: 1004, h: 1004 },
  elf: { x: 1034, y: 10, w: 1004, h: 1004 },
  goblin: { x: 10, y: 1028, w: 660, h: 1008 },
  demon: { x: 686, y: 1028, w: 676, h: 1008 },
  orc: { x: 1376, y: 1028, w: 662, h: 1008 },
};

export function getSheetPortrait(
  race: RaceId,
  variant: number,
  isKing: boolean,
  size = 64,
): HTMLCanvasElement | null {
  if (isKing) {
    return extractChromaSprite(
      `king_${race}_${size}`,
      'kings5',
      KING_PORTRAIT_RECTS[race],
      size,
      size,
      'cover',
    );
  }
  const idx = ((variant % 3) + 3) % 3;
  if (race === 'orc' && idx === 2) {
    return extractChromaSprite(
      `portrait_orc_rep_${size}`,
      'portraits5',
      REP_PORTRAIT_RECTS.orc,
      size,
      size,
      'cover',
    );
  }
  const list = CUSTOMER_PORTRAIT_RECTS[race];
  if (list && list[idx]) {
    return extractChromaSprite(
      `portrait_${race}_${idx}_${size}`,
      'portraits16',
      list[idx],
      size,
      size,
      'cover',
    );
  }
  return extractChromaSprite(
    `portrait_rep_${race}_${size}`,
    'portraits5',
    REP_PORTRAIT_RECTS[race],
    size,
    size,
    'cover',
  );
}

// ============================================================================
// 2. WEAPON ASSETS (10 TYPES x 5 TIERS)
// ============================================================================

const WEAPON_SHEET_POS: Record<
  WeaponTypeId,
  { sheet: 'weaponsA' | 'weaponsB'; row: number }
> = {
  sword: { sheet: 'weaponsA', row: 0 },
  shield: { sheet: 'weaponsA', row: 1 },
  dagger: { sheet: 'weaponsA', row: 2 },
  spear: { sheet: 'weaponsA', row: 3 },
  cleaver: { sheet: 'weaponsA', row: 4 },
  longbow: { sheet: 'weaponsB', row: 0 },
  staff: { sheet: 'weaponsB', row: 1 },
  axe: { sheet: 'weaponsB', row: 2 },
  scythe: { sheet: 'weaponsB', row: 3 },
  trident: { sheet: 'weaponsB', row: 4 },
};

const RARITY_TIER_INDEX: Record<RarityId, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  mythic: 4,
};

export function getWeaponSheetSprite(
  type: WeaponTypeId,
  highestPartRarity: RarityId,
  weaponLevel: number,
  size = 64,
): HTMLCanvasElement | null {
  const pos = WEAPON_SHEET_POS[type];
  const levelTier = Math.min(4, Math.floor(Math.max(0, weaponLevel - 1) / 4));
  const rarityTier = RARITY_TIER_INDEX[highestPartRarity] ?? 0;
  const col = Math.max(levelTier, rarityTier);

  const cellW = 2048 / 5;
  const cellH = 2048 / 5;
  return extractChromaSprite(
    `weapon_${type}_t${col}_${size}`,
    pos.sheet,
    {
      x: Math.round(col * cellW) + 4,
      y: Math.round(pos.row * cellH) + 4,
      w: Math.round(cellW) - 8,
      h: Math.round(cellH) - 8,
    },
    size,
    size,
    'contain',
  );
}

// ============================================================================
// 3. EQUIPMENT ASSETS (6 STATIONS x 5 TIERS)
// ============================================================================

const EQUIP_ROW_MAP: Record<EquipmentId, number> = {
  furnace: 0,
  anvil: 1,
  hammer: 2,
  grindstone: 3,
  quench: 4,
  workbench: 5,
};

const EQUIPMENT_ROW_BOUNDS: readonly [number, number][] = [
  [8, 396],
  [420, 306],
  [732, 290],
  [1029, 340],
  [1368, 332],
  [1704, 340],
];

export function getEquipmentSheetSprite(
  id: EquipmentId,
  tier: number,
  size = 64,
): HTMLCanvasElement | null {
  const row = EQUIP_ROW_MAP[id];
  const col = Math.max(0, Math.min(4, tier - 1));
  const cellW = 2048 / 5;
  const [rowY, rowH] = EQUIPMENT_ROW_BOUNDS[row] ?? [row * (2048 / 6), 2048 / 6];

  return extractChromaSprite(
    `equip_${id}_t${col}_${size}_v2`,
    'equipment',
    {
      x: Math.round(col * cellW) + 6,
      y: rowY,
      w: Math.round(cellW) - 12,
      h: rowH,
    },
    size,
    size,
    'contain',
  );
}

// ============================================================================
// 4. MATERIAL & HUD ICON ASSETS (15 ICONS + RARITY COLORIZE)
// ============================================================================

export type HudIconId =
  | 'coins'
  | 'crown'
  | 'scroll'
  | 'swords'
  | 'shield'
  | 'flame'
  | 'heart'
  | 'star'
  | 'anvil'
  | 'hammer';

const ICON_CELL_POS: Record<HudIconId | MaterialShape, { row: number; col: number }> = {
  coins: { row: 0, col: 0 },
  crown: { row: 0, col: 1 },
  scroll: { row: 0, col: 2 },
  swords: { row: 1, col: 0 },
  shield: { row: 1, col: 1 },
  flame: { row: 1, col: 2 },
  heart: { row: 2, col: 0 },
  star: { row: 2, col: 1 },
  anvil: { row: 2, col: 2 },
  hammer: { row: 3, col: 0 },
  hide: { row: 3, col: 1 },
  wood: { row: 3, col: 2 },
  thread: { row: 4, col: 0 },
  crystal: { row: 4, col: 1 },
  ingot: { row: 4, col: 2 },
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function getHudIconCanvas(icon: HudIconId, size = 32): HTMLCanvasElement | null {
  const pos = ICON_CELL_POS[icon];
  const cellW = 2048 / 3;
  const cellH = 2048 / 5;
  return extractChromaSprite(
    `hudicon_${icon}_${size}`,
    'icons15',
    {
      x: Math.round(pos.col * cellW) + 12,
      y: Math.round(pos.row * cellH) + 8,
      w: Math.round(cellW) - 24,
      h: Math.round(cellH) - 16,
    },
    size,
    size,
    'contain',
  );
}

export function getMaterialSheetSprite(
  materialId: string,
  shape: MaterialShape,
  colors: [string, string, string],
  size = 32,
): HTMLCanvasElement | null {
  const pos = ICON_CELL_POS[shape];
  const cellW = 2048 / 3;
  const cellH = 2048 / 5;
  const cDark = hexToRgb(colors[0]);
  const cMid = hexToRgb(colors[1]);
  const cLight = hexToRgb(colors[2]);

  return extractChromaSprite(
    `mat_${materialId}_${size}`,
    'icons15',
    {
      x: Math.round(pos.col * cellW) + 12,
      y: Math.round(pos.row * cellH) + 8,
      w: Math.round(cellW) - 24,
      h: Math.round(cellH) - 16,
    },
    size,
    size,
    'contain',
    (data) => {
      // Luminance-mapped recoloring while preserving dark ink outlines & shading contrast
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 20) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (lum < 0.16) continue; // Keep crisp pixel-art black outline

        // Skip dark wooden spool caps on thread so only the spool yarn is tinted
        if (shape === 'thread' && r > g + 22 && r > b + 28 && lum < 0.62) {
          continue;
        }

        const t = Math.min(1, Math.max(0, (lum - 0.16) / 0.84));
        let tr: number;
        let tg: number;
        let tb: number;
        if (t < 0.5) {
          const u = t * 2;
          tr = cDark[0] * (1 - u) + cMid[0] * u;
          tg = cDark[1] * (1 - u) + cMid[1] * u;
          tb = cDark[2] * (1 - u) + cMid[2] * u;
        } else {
          const u = (t - 0.5) * 2;
          tr = cMid[0] * (1 - u) + cLight[0] * u;
          tg = cMid[1] * (1 - u) + cLight[1] * u;
          tb = cMid[2] * (1 - u) + cLight[2] * u;
        }
        // Blend 85% target palette + 15% original shading warmth
        data[i] = Math.round(tr * 0.86 + r * 0.14);
        data[i + 1] = Math.round(tg * 0.86 + g * 0.14);
        data[i + 2] = Math.round(tb * 0.86 + b * 0.14);
      }
    },
  );
}

// ============================================================================
// 5. PLAYER BLACKSMITH SPRITES (8x6 SHEET + CUSTOMIZATION TINTING)
// ============================================================================

export type PlayerAction = 'idle' | 'strike' | 'bellows' | 'tend' | 'walk';

export function getPlayerSheetSprite(
  player: PlayerCustomization,
  action: PlayerAction,
  frame = 0,
  size = 64,
): HTMLCanvasElement | null {
  const isFemale = player.gender === 'female';
  let row = 2;
  let col = isFemale ? 4 : 0;

  if (action === 'strike') {
    row = 0;
    const f = ((frame % 4) + 4) % 4;
    col = (isFemale ? 4 : 0) + f;
  } else if (action === 'bellows') {
    row = 1;
    const f = ((frame % 3) + 3) % 3;
    col = (isFemale ? 5 : 1) + f;
  } else if (action === 'tend') {
    row = 3;
    if (isFemale) {
      const f = ((frame % 2) + 2) % 2;
      col = 5 + f;
    } else {
      const f = ((frame % 3) + 3) % 3;
      col = 1 + f;
    }
  } else if (action === 'walk') {
    const f = ((frame % 2) + 2) % 2;
    row = f === 0 ? 2 : 3;
    col = isFemale ? 4 : 0;
  } else {
    // Idle frame: Row 2 col 0 (male) or Row 2 col 4 (female) has clean neutral pose
    row = 2;
    col = isFemale ? 4 : 0;
  }

  const skin = SKIN_TONES[player.skinToneIndex] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[player.hairColorIndex] ?? HAIR_COLORS[0];
  const outfit = OUTFIT_COLORS[player.outfitColorIndex] ?? OUTFIT_COLORS[0];

  const skinMain = hexToRgb(skin.hex);
  const skinShad = hexToRgb(skin.shadow);
  const hairMain = hexToRgb(hair.hex);
  const hairHigh = hexToRgb(hair.highlight);
  const tunicMain = hexToRgb(outfit.main);
  const tunicTrim = hexToRgb(outfit.trim);

  const cellW = 2048 / 8;
  const ROW_BOUNDS: readonly [number, number][] = [
    [16, 360],
    [378, 306],
    [696, 330],
    [1034, 332],
    [1372, 336],
    [1714, 330],
  ];
  const [rowY, rowH] = ROW_BOUNDS[row] ?? [row * 341, 332];

  const key = `player_${player.gender}_${player.skinToneIndex}_${player.hairColorIndex}_${player.outfitColorIndex}_${action}_${col}_${size}`;

  return extractChromaSprite(
    key,
    'playerSheet',
    {
      x: Math.round(col * cellW) + 4,
      y: rowY,
      w: Math.round(cellW) - 8,
      h: rowH,
    },
    size,
    size,
    'contain',
    (data, w, h, offsetY, fullHeight) => {
      // Recolor shirt tunic sleeves, skin, and hair while preserving leather apron & outlines
      for (let py = 0; py < h; py++) {
        const yFrac = (py + offsetY) / fullHeight;
        for (let px = 0; px < w; px++) {
          const i = (py * w + px) * 4;
          if (data[i + 3] < 20) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (lum < 0.16) continue;

          // 1. Hair/Beard cluster (upper 34%)
          if (
            yFrac < 0.34 &&
            r > g + 8 &&
            g >= b &&
            lum < 0.48 &&
            !(r > 165 && g > 110)
          ) {
            const k = Math.min(1, lum / 0.45);
            data[i] = Math.round(hairMain[0] * (1 - k * 0.45) + hairHigh[0] * (k * 0.45));
            data[i + 1] = Math.round(hairMain[1] * (1 - k * 0.45) + hairHigh[1] * (k * 0.45));
            data[i + 2] = Math.round(hairMain[2] * (1 - k * 0.45) + hairHigh[2] * (k * 0.45));
            continue;
          }

          // 2. Skin cluster (warm peach tones)
          if (yFrac < 0.65 && r > 135 && r > g + 26 && g > b + 12 && r - b > 42) {
            const k = Math.min(1, Math.max(0, (lum - 0.35) / 0.55));
            data[i] = Math.round(skinShad[0] * (1 - k) + skinMain[0] * k);
            data[i + 1] = Math.round(skinShad[1] * (1 - k) + skinMain[1] * k);
            data[i + 2] = Math.round(skinShad[2] * (1 - k) + skinMain[2] * k);
            continue;
          }

          // 3. Tunic Shirt sleeves & collar cluster (warm khaki/olive-grey: r~g, b>60, low r-g diff)
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
          if (
            yFrac > 0.20 &&
            yFrac < 0.54 &&
            sat < 0.45 &&
            (r - g) <= 26 &&
            g > b + 4 &&
            b > 62 &&
            lum > 0.30 &&
            lum < 0.88
          ) {
            const k = Math.min(1, Math.max(0, (lum - 0.3) / 0.48));
            data[i] = Math.round(tunicMain[0] * (0.72 + k * 0.28) + tunicTrim[0] * (k * 0.14));
            data[i + 1] = Math.round(tunicMain[1] * (0.72 + k * 0.28) + tunicTrim[1] * (k * 0.14));
            data[i + 2] = Math.round(tunicMain[2] * (0.72 + k * 0.28) + tunicTrim[2] * (k * 0.14));
          }
        }
      }
    },
  );
}

// ============================================================================
// 6. FORGING MINI-GAME UI & BATTLE VFX SPRITES
// ============================================================================

export type ForgeUiSpriteId =
  | 'thermometer'
  | 'targetRing'
  | 'ringPerfect'
  | 'sliderGreen'
  | 'quenchArc'
  | 'slotBox'
  | 'handCursor'
  | 'wordPerfect'
  | 'wordGood'
  | 'wordMiss';

const FORGE_UI_RECTS: Record<ForgeUiSpriteId, CropRect> = {
  thermometer: { x: 62, y: 60, w: 184, h: 554 },
  targetRing: { x: 798, y: 138, w: 202, h: 202 },
  ringPerfect: { x: 1502, y: 128, w: 220, h: 222 },
  sliderGreen: { x: 798, y: 476, w: 936, h: 124 },
  quenchArc: { x: 1656, y: 666, w: 196, h: 472 },
  slotBox: { x: 280, y: 1304, w: 208, h: 206 },
  handCursor: { x: 640, y: 1430, w: 120, h: 110 },
  wordPerfect: { x: 1042, y: 1186, w: 964, h: 274 },
  wordGood: { x: 1242, y: 1490, w: 582, h: 242 },
  wordMiss: { x: 1260, y: 1790, w: 556, h: 200 },
};

export function getForgeUiSprite(
  id: ForgeUiSpriteId,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  return extractChromaSprite(
    `forgeui_${id}_${w}x${h}`,
    'forgeUi',
    FORGE_UI_RECTS[id],
    w,
    h,
    'contain',
  );
}

export type VfxSpriteId =
  | 'sparks'
  | 'steam'
  | 'impact'
  | 'slash'
  | 'cleave'
  | 'scythe'
  | 'arrow'
  | 'spell'
  | 'fire0'
  | 'fire1'
  | 'fire2';

// Strictly cropped above text labels in Gemini_Generated_Image_rcbthrcbthrcbthr_6b92715f.jfif!
const VFX_RECTS: Record<VfxSpriteId, CropRect> = {
  sparks: { x: 96, y: 68, w: 450, h: 470 },
  steam: { x: 790, y: 68, w: 480, h: 470 },
  impact: { x: 1460, y: 68, w: 495, h: 470 },
  slash: { x: 84, y: 750, w: 550, h: 518 },
  cleave: { x: 774, y: 750, w: 505, h: 518 },
  scythe: { x: 1398, y: 750, w: 600, h: 518 },
  arrow: { x: 136, y: 1514, w: 510, h: 128 },
  spell: { x: 824, y: 1514, w: 510, h: 134 },
  fire0: { x: 1418, y: 1516, w: 156, h: 400 },
  fire1: { x: 1622, y: 1516, w: 156, h: 400 },
  fire2: { x: 1822, y: 1516, w: 180, h: 400 },
};

export function getVfxSprite(
  id: VfxSpriteId,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  return extractChromaSprite(
    `vfx_${id}_${w}x${h}`,
    'vfx9',
    VFX_RECTS[id],
    w,
    h,
    'contain',
  );
}
