import { assetLoader, assetUrl, requestImage } from './assetLoader';
import type { WeaponInstance } from '../types';
import { drawPaintedWorkpiece } from './paintedWeapons';

const names = ['furnace-backdrop', 'fire-0', 'fire-1', 'fire-2', 'bellows',
  'grind-backdrop', 'wheel', 'quench-backdrop', 'barrel-back', 'barrel-front',
  'water-0', 'water-1', 'water-2', 'steam-0', 'steam-1', 'steam-2'] as const;
type Layer = typeof names[number];
export function ensureStationLayersPreloaded(): void {
  // Demand-loaded when a station is opened.
}
interface StationState {
  station: string; elapsed: number; duration: number; heat: number;
  bellowsPumpAnim: number; pointerDown: boolean; cursorX: number;
  zoneCenter: number; zoneWidth: number; temp: number;
  submerged: boolean; quenchDone: boolean; quenchPlunge: number;
}

/** Layers only: all existing station controls and quality calculations stay intact. */
export function drawStationLayers(ctx: CanvasRenderingContext2D, s: StationState, weapon: WeaponInstance): boolean {
  ensureStationLayersPreloaded();
  if (!['furnace', 'grindstone', 'quench'].includes(s.station)) return false;
  const needed: Record<string, readonly Layer[]> = {
    furnace: ['furnace-backdrop', 'fire-0', 'fire-1', 'fire-2', 'bellows'],
    grindstone: ['grind-backdrop', 'wheel'],
    quench: ['quench-backdrop', 'barrel-back', 'barrel-front', 'water-0', 'water-1', 'water-2', 'steam-0', 'steam-1', 'steam-2'],
  };
  for (const name of needed[s.station]) requestImage(`stations:${name}`, assetUrl(`assets/stations/${name}.png`));
  if (!needed[s.station].every(name => assetLoader.get(`stations:${name}`) !== null)) return false;
  const draw = (name: Layer, x: number, y: number, w?: number, h?: number) => {
    const im = assetLoader.get(`stations:${name}`)!;
    ctx.drawImage(im, Math.round(x), Math.round(y), w ?? im.width, h ?? im.height);
  };
  const workpiece = (heat: number, x: number, y: number, w: number, h: number, angle = 0) => {
    drawPaintedWorkpiece(ctx, weapon, heat, x, y, w,
      weapon.type === 'shield' ? Math.max(h, 68) : Math.max(h, 60), angle);
  };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath(); ctx.rect(19, 47, 442, 182); ctx.clip();
  const frame = Math.floor(s.elapsed * 9) % 3;
  if (s.station === 'furnace') {
    draw('furnace-backdrop', 16, 46, 448, 184);
    // The fire grows with heat and flickers independently of the steel.
    ctx.save(); ctx.globalAlpha = 0.55 + s.heat * 0.45;
    const height = 30 + s.heat * 48;
    for (let n = 0; n < 3; n++) {
      const tongueHeight = height * (n === 1 ? 1 : 0.78);
      draw(`fire-${(frame + n) % 3}` as Layer, 126 + n * 39, 159 - tongueHeight, 45, tongueHeight);
    }
    ctx.restore();
    const insertion = 9 + s.heat * 12;
    workpiece(s.heat, 178 + insertion, 143, 145, 30);
    // Foreground coals partly cover the lower blade edge.
    ctx.fillStyle = '#b91c1c'; ctx.fillRect(131, 155, 120, 3);
    ctx.fillStyle = '#f59e0b';
    for (let x = 136; x < 249; x += 16) ctx.fillRect(x, 155 + (frame % 2), 5, 2);
    const pumping = s.bellowsPumpAnim > 0 || s.pointerDown;
    const squeeze = pumping ? (Math.sin(s.elapsed * 22) + 1) * 5 : 0;
    draw('bellows', 39, 167 + squeeze / 2, 64, 46 - squeeze);
    if (pumping) {
      ctx.fillStyle = '#c48a54';
      ctx.fillRect(106, 182, 5, 1); ctx.fillRect(114, 180, 6, 1);
    }
    // Pixel embers rise from the opening, responding to stronger pumping.
    for (let n = 0; n < (pumping ? 9 : 4); n++) {
      const lift = (s.elapsed * (pumping ? 30 : 17) + n * 11) % 66;
      ctx.fillStyle = n % 2 ? '#f59e0b' : '#fde047';
      ctx.fillRect(115 + n * 9 + Math.round(Math.sin(lift / 12) * 3), 146 - lift, 2, 2);
    }
  } else if (s.station === 'grindstone') {
    draw('grind-backdrop', 16, 46, 448, 184);
    const inZone = Math.abs(s.cursorX - s.zoneCenter) <= s.zoneWidth / 2;
    ctx.save(); ctx.translate(240, 89); ctx.rotate(s.elapsed * (inZone ? 9 : 5));
    draw('wheel', -44, -44, 88, 88); ctx.restore();
    // Horizontal blade meets the wheel's right face. Alignment shifts
    // both the part and the spark origin, not the whole painted background.
    const offset = (s.cursorX - 0.5) * 38;
    workpiece(0, 270 + offset, 105, 151, 60, -0.22 + (s.cursorX - 0.5) * 0.22);
    if (inZone) {
      const x = 252 + offset / 2, y = 108;
      for (let n = 0; n < 17; n++) {
        const t = (s.elapsed * 4 + n * 0.17) % 1;
        ctx.fillStyle = n % 3 ? '#fde047' : '#ea580c';
        ctx.fillRect(Math.round(x + t * (28 + n * 2)), Math.round(y + t * (15 + n * 3) + t * t * 18), n % 2 + 1, 2);
      }
      ctx.fillStyle = '#fffbeb'; ctx.fillRect(x - 1, y - 1, 4, 3);
    }
    // Polishing sweep follows time on this stage, not a static third frame.
    if (s.elapsed / s.duration > 0.7) {
      const gleam = 253 + ((s.elapsed * 32) % 70);
      ctx.fillStyle = '#eef4fa'; ctx.fillRect(gleam, 98, 9, 1);
    }
  } else {
    draw('quench-backdrop', 16, 46, 448, 184);
    draw('barrel-back', 94, 123, 184, 104);
    const plunge = s.quenchDone ? 0 : s.quenchPlunge;
    const bladeY = 106 + (1 - Math.pow(1 - plunge, 3)) * 40;
    workpiece(s.temp <= 0.5 ? 0 : s.temp, 186, bladeY, 108, 25, Math.PI / 2);
    draw(`water-${frame}` as Layer, 115, 141);
    if (s.submerged) {
      // The front water tint and barrel lip occlude the blade below the waterline.
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#0284c7';
      ctx.fillRect(176, 153, 20, 18); ctx.restore();
      for (let n = 0; n < 8; n++) {
        const t = (s.elapsed * 2 + n * 0.19) % 1;
        ctx.fillStyle = '#7dd3fc';
        ctx.fillRect(143 + n * 11, 155 - Math.sin(t * Math.PI) * (12 + n % 3 * 5), 2, 3);
      }
    }
    draw('barrel-front', 94, 123, 184, 104);
    if (s.submerged || s.quenchDone) {
      ctx.save(); ctx.globalAlpha = s.quenchDone ? 0.3 : 0.35 + s.temp * 0.55;
      draw(`steam-${frame}` as Layer, 137, 86 - ((s.elapsed * 12) % 8), 96, 88);
      ctx.restore();
    }
  }
  ctx.restore();
  return true;
}
