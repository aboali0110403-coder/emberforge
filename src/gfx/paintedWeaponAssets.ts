import type { RarityId, WeaponInstance, WeaponTypeId } from '../types';
export const PAINTED_WEAPON_TYPES: readonly WeaponTypeId[] = [
  'sword', 'shield', 'dagger', 'longbow', 'staff', 'spear', 'cleaver', 'axe', 'scythe', 'trident',
];
export type PaintedHeat = 'cold' | 'warm' | 'hot';
const RARITIES: readonly RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'mythic'];
const canvases = new Map<string, HTMLCanvasElement>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
export function subscribePaintedWeaponLoad(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getPaintedWeaponTier(weapon: WeaponInstance): number {
  const levelTier = Math.min(4, Math.floor(Math.max(0, weapon.level - 1) / 4));
  const partTier = Math.max(0, ...Object.values(weapon.parts).map(part => RARITIES.indexOf(part.rarity)));
  return Math.max(levelTier, partTier);
}
function request(type: WeaponTypeId, tier: number, heat: PaintedHeat): void {
  const key = `${type}-t${tier}-${heat}`;
  if (loading.has(key) || typeof Image === 'undefined') return;
  loading.add(key);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    canvases.set(key, canvas);
    for (const listener of listeners) listener();
  };
  image.src = `${import.meta.env.BASE_URL}assets/forging-weapons/${key}.png`;
}
export function ensurePaintedWeaponsPreloaded(): void {
  for (const type of PAINTED_WEAPON_TYPES) {
    for (let tier = 0; tier < 5; tier++) request(type, tier, 'cold');
  }
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
