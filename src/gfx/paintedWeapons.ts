import type { WeaponInstance } from '../types';
import { getHeatedWeaponCanvas } from './sprites';
import { getPaintedWeaponCanvas, ensurePaintedWeaponsPreloaded } from './paintedWeaponAssets';
export { ensurePaintedWeaponsPreloaded, PAINTED_WEAPON_TYPES } from './paintedWeaponAssets';

/** Fit, never stretch: shields stay broad, bows keep their curve, heads stay
 * distinct. Bow/staff heat variants affect only their metal fittings. */
export function drawPaintedWorkpiece(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponInstance,
  temperature: number,
  x: number,
  y: number,
  width: number,
  maxHeight: number,
  angle = 0,
): void {
  const heat = temperature > 0.65 ? 'hot' : temperature > 0.35 ? 'warm' : 'cold';
  const source = getPaintedWeaponCanvas(weapon, heat) ?? getHeatedWeaponCanvas(weapon, heat);
  const scale = Math.min(width / source.width, maxHeight / source.height);
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  ctx.restore();
}
