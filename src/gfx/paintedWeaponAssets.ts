import { assetLoader, assetUrl, requestImage } from './assetLoader';
import type { RarityId, WeaponInstance, WeaponTypeId } from '../types';
export const PAINTED_WEAPON_TYPES: readonly WeaponTypeId[] = [
  'sword', 'shield', 'dagger', 'longbow', 'staff', 'spear', 'cleaver', 'axe', 'scythe', 'trident',
];
export type PaintedHeat = 'cold' | 'warm' | 'hot';
const RARITIES: readonly RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'mythic'];
const canvases = new Map<string, HTMLCanvasElement>();
export const subscribePaintedWeaponLoad = assetLoader.subscribe;
export function getPaintedWeaponTier(weapon: WeaponInstance): number {
  const levelTier = Math.min(4, Math.floor(Math.max(0, weapon.level - 1) / 4));
  const partTier = Math.max(0, ...Object.values(weapon.parts).map(part => RARITIES.indexOf(part.rarity)));
  return Math.max(levelTier, partTier);
}
function request(type: WeaponTypeId, tier: number, heat: PaintedHeat): void {
  const key = `${type}-t${tier}-${heat}`;
  const image = requestImage(`weapon:${key}`, assetUrl(`assets/forging-weapons/${key}.png`));
  if (!image || canvases.has(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  canvases.set(key, canvas);
}
export function ensurePaintedWeaponsPreloaded(): void {
  // Only the requested type/tier/heat is loaded by getPaintedWeaponCanvas.
}
export function getPaintedWeaponCanvas(weapon: WeaponInstance, heat: PaintedHeat = 'cold', square = false): HTMLCanvasElement | null {
  const tier = getPaintedWeaponTier(weapon);
  request(weapon.type, tier, heat);
  const key = `${weapon.type}-t${tier}-${heat}`;
  const raw = canvases.get(key);
  if (!raw || !square) return raw ?? null;
  const cached = canvases.get(`${key}-square`);
  if (cached) return cached;
  const side = Math.max(raw.width, raw.height);
  const padded = document.createElement('canvas');
  padded.width = side; padded.height = side;
  padded.getContext('2d')!.drawImage(raw, Math.round((side - raw.width) / 2), Math.round((side - raw.height) / 2));
  canvases.set(`${key}-square`, padded);
  return padded;
}
