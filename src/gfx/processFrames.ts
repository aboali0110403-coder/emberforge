import type { StationId } from '../types';

/**
 * Scene frames for the forging stations (furnace, anvil, grindstone, quench).
 * Each station has 3 frames in public/assets/process/process-<name>-<1..3>.png.
 * If a frame is not loaded yet (or fails to load) callers get null and fall back
 * to the code-drawn scene, so the game keeps working either way.
 */
export type ProcessStation = 'furnace' | 'anvil' | 'grindstone' | 'quench';

const FILE_NAME: Record<ProcessStation, string> = {
  furnace: 'furnace',
  anvil: 'anvil',
  grindstone: 'grind',
  quench: 'quench',
};

const images = new Map<string, HTMLImageElement>();
let started = false;

export function isProcessStation(id: StationId): id is ProcessStation {
  return id === 'furnace' || id === 'anvil' || id === 'grindstone' || id === 'quench';
}

function key(station: ProcessStation, frame: number): string {
  return `${station}:${frame}`;
}

export function ensureProcessFramesPreloaded(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  (Object.keys(FILE_NAME) as ProcessStation[]).forEach((station) => {
    for (let frame = 1; frame <= 3; frame++) {
      const img = new Image();
      img.onload = () => images.set(key(station, frame), img);
      img.src = `./assets/process/process-${FILE_NAME[station]}-${frame}.png`;
    }
  });
}

/** frame is 1..3. Returns null until that image has loaded. */
export function getProcessFrame(station: ProcessStation, frame: 1 | 2 | 3): HTMLImageElement | null {
  ensureProcessFramesPreloaded();
  const img = images.get(key(station, frame));
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export interface ProcessFrameState {
  heat: number;
  strikesDone: number;
  strikesTotal: number;
  hammerStrikeAnim: number;
  cursorX: number;
  zoneCenter: number;
  zoneWidth: number;
  elapsed: number;
  duration: number;
  submerged: boolean;
  quenchDone: boolean;
  quenchPlunge: number;
}

/** Pick which of a station's 3 frames matches the current moment of its minigame. */
export function pickProcessFrameIndex(station: ProcessStation, s: ProcessFrameState): 1 | 2 | 3 {
  switch (station) {
    case 'furnace':
      // cold blade going in -> glowing -> white-hot
      return s.heat < 0.4 ? 1 : s.heat < 0.72 ? 2 : 3;
    case 'anvil':
      // hammer raised (alternates each blow), then the strike with sparks
      if (s.hammerStrikeAnim > 0.05) return 2;
      return s.strikesDone % 2 === 0 ? 1 : 3;
    case 'grindstone': {
      if (s.elapsed >= s.duration * 0.92) return 3; // final inspection
      const inZone = Math.abs(s.cursorX - s.zoneCenter) <= s.zoneWidth / 2;
      return inZone ? 2 : 1; // hard grinding sparks while on target
    }
    case 'quench':
      if (s.submerged) return 2; // plunged, big steam
      if (s.quenchDone || s.quenchPlunge > 0.05) return 3; // lifted out, cooled
      return 1; // held above the barrel
  }
}

const SCENE = { x: 16, y: 44, w: 448, h: 188 };

/**
 * Draws the frame inside the station diorama: the crisp square scene over the
 * dark workshop diorama. Furnace and quench sit on the left so their gauges stay
 * readable on the right; anvil and grindstone are centered.
 */
export function drawProcessFrame(
  ctx: CanvasRenderingContext2D,
  station: ProcessStation,
  img: HTMLImageElement,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(SCENE.x + 3, SCENE.y + 3, SCENE.w - 6, SCENE.h - 6);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  const size = SCENE.h - 6;
  const left = station === 'furnace' || station === 'quench';
  const x = left ? SCENE.x + 3 : Math.round(SCENE.x + SCENE.w / 2 - size / 2);
  ctx.drawImage(img, x, SCENE.y + 3, size, size);
  ctx.restore();
}
