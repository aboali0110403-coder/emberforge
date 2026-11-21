import type { WeaponInstance } from '../types';
import { drawPaintedWorkpiece } from './paintedWeapons';

/** Separate painted layers cut by scripts/cut-painted-assets.py. */
const names = ['backdrop', 'blade-hot', 'blade-shaped', 'blade-finished',
  'hammer-raised', 'hammer-fall', 'hammer-impact', 'sparks', 'grip', 'guard', 'pommel'] as const;
type Layer = typeof names[number];
const images = new Map<Layer, HTMLImageElement>();
let started = false;
export const ANVIL_SWING_SECONDS = 0.32;
export const ANVIL_IMPACT_AT = 0.09;

export function ensureAnvilLayersPreloaded(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  for (const name of names) {
    const image = new Image();
    image.onload = () => images.set(name, image);
    image.src = `${import.meta.env.BASE_URL}assets/anvil/${name}.png`;
  }
}

export function getAnvilLayer(name: Layer): HTMLImageElement | null {
  ensureAnvilLayersPreloaded();
  return images.get(name) ?? null;
}

export interface AnvilLayerState {
  targetX: number;
  targetY: number;
  anvilStrikeX: number;
  anvilStrikeY: number;
  hammerStrikeAnim: number;
  anvilStrikeQuality: 'perfect' | 'good' | 'miss';
  strikesDone: number;
  strikesTotal: number;
}

/** Draws art only. Timing rings, scores and hit testing remain in minigames.ts. */
export function drawAnvilLayers(
  ctx: CanvasRenderingContext2D,
  rt: AnvilLayerState,
  weapon: WeaponInstance,
): boolean {
  ensureAnvilLayersPreloaded();
  if (!names.every(name => images.has(name))) return false;
  const draw = (name: Layer, x: number, y: number, w?: number, h?: number) => {
    const image = images.get(name)!;
    ctx.drawImage(image, Math.round(x), Math.round(y), w ?? image.width, h ?? image.height);
  };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath();
  ctx.rect(19, 47, 442, 182);
  ctx.clip();
  draw('backdrop', 16, 46, 448, 184);
  const ratio = rt.strikesDone / Math.max(1, rt.strikesTotal);
  const active = rt.hammerStrikeAnim > 0;
  const t = ANVIL_SWING_SECONDS - rt.hammerStrikeAnim;
  const impact = active && t >= ANVIL_IMPACT_AT && t < 0.17;
  const bounce = impact ? 1 : 0;
  // Each commissioned weapon has its own painted silhouette and heat stages.
  drawPaintedWorkpiece(ctx, weapon, ratio < 0.34 ? 1 : ratio < 0.76 ? 0.5 : 0,
    240, 124 + bounce, weapon.type === 'dagger' ? 132 : 192, 62);
  // Unassembled pieces sit in a tray, not attached to a hot blade. These are
  // reusable assets for a later assembly pass, not a new assembly minigame.
  ctx.fillStyle = '#211815';
  ctx.fillRect(354, 170, 92, 28);
  ctx.strokeStyle = '#945b35';
  ctx.strokeRect(354.5, 170.5, 91, 27);
  draw('grip', 378, 174, 36, 18);
  draw('guard', 361, 173, 10, 22);
  draw('pommel', 424, 176, 12, 15);

  ctx.restore();
  return true;
}

/** Hammer stays above the timing overlay so contact reads clearly. */
export function drawAnvilHammer(ctx: CanvasRenderingContext2D, rt: AnvilLayerState): void {
  const draw = (name: Layer, x: number, y: number, w?: number, h?: number) => {
    const image = images.get(name);
    if (image) ctx.drawImage(image, Math.round(x), Math.round(y), w ?? image.width, h ?? image.height);
  };
  const active = rt.hammerStrikeAnim > 0;
  const t = ANVIL_SWING_SECONDS - rt.hammerStrikeAnim;
  const impact = active && t >= ANVIL_IMPACT_AT && t < 0.17;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath(); ctx.rect(19, 47, 442, 182); ctx.clip();
  const x = active ? rt.anvilStrikeX : rt.targetX;
  const y = active ? rt.anvilStrikeY : rt.targetY;
  // Fast downstroke, impact hold, then recovery. The head's local anchor is
  // different in each pose, so all three land on the same captured strike.
  if (!active || t > 0.24) {
    draw('hammer-raised', x + 28 - 24, y - 48 - 45, 96, 96);
  } else if (t < ANVIL_IMPACT_AT) {
    const p = t / ANVIL_IMPACT_AT;
    draw('hammer-fall', x + 18 * (1 - p) - 36, y - 38 * (1 - p) - 39, 96, 96);
  } else if (t < 0.17) {
    draw('hammer-impact', x - 48, y - 37, 96, 96);
  } else {
    const p = (t - 0.17) / 0.07;
    draw('hammer-fall', x + 18 * p - 36, y - 38 * p - 39, 96, 96);
  }
  if (impact && rt.anvilStrikeQuality !== 'miss') {
    draw('sparks', x - 48, y - 48, 96, 96);
  }
  ctx.restore();
}
