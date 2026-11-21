import { RACES } from '../data/races';
import { getEquipmentSheetSprite, getVfxSprite, getLoadedSheet } from '../gfx/assetSheets';
import { getPortraitAsset, getWorkshopBgAsset } from '../gfx/generatedAssets';
import { ParticlePool } from '../gfx/particles';
import { getPlayerSpriteCanvas } from '../gfx/sprites';
import type { EquipmentId, Order, PlayerCustomization } from '../types';
import { computeWorkshopIdlePose } from './animation';

export type WorkshopHotspotId =
  | 'furnace'
  | 'anvil'
  | 'grindstone'
  | 'quench'
  | 'workbench'
  | 'counter'
  | 'shop'
  | 'map';

export interface HotspotRect {
  id: WorkshopHotspotId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  charX: number;
}

// Aligned directly to the 480x270 scaled features of the workshop interior scene
export const WORKSHOP_HOTSPOTS: HotspotRect[] = [
  { id: 'furnace', label: 'Furnace', x: 24, y: 34, w: 136, h: 174, charX: 132 },
  { id: 'map', label: 'World Map', x: 148, y: 34, w: 46, h: 52, charX: 158 },
  { id: 'counter', label: 'Orders', x: 196, y: 40, w: 54, h: 112, charX: 186 },
  { id: 'anvil', label: 'Anvil', x: 166, y: 152, w: 78, h: 84, charX: 132 },
  { id: 'grindstone', label: 'Grindstone', x: 248, y: 110, w: 54, h: 78, charX: 222 },
  { id: 'quench', label: 'Quench', x: 302, y: 118, w: 64, h: 78, charX: 280 },
  { id: 'workbench', label: 'Workbench', x: 362, y: 128, w: 112, h: 98, charX: 330 },
  { id: 'shop', label: 'Shop Shelf', x: 390, y: 36, w: 86, h: 82, charX: 350 },
];

export function hitTestWorkshop(wx: number, wy: number): WorkshopHotspotId | null {
  for (const spot of WORKSHOP_HOTSPOTS) {
    if (wx >= spot.x && wx <= spot.x + spot.w && wy >= spot.y && wy <= spot.y + spot.h) {
      return spot.id;
    }
  }
  return null;
}

const TIER_METAL_COLORS = ['#544a47', '#788496', '#3b82f6', '#a855f7', '#f59e0b'];
const TIER_TRIM_COLORS = ['#3b2416', '#94a3b8', '#93c5fd', '#e9d5ff', '#fef08a'];

export interface WorkshopRenderOptions {
  activeSpot?: WorkshopHotspotId | null;
  isWalking?: boolean;
  facing?: 1 | -1;
  strideBob?: number;
  strideTilt?: number;
  breathScaleX?: number;
  breathScaleY?: number;
}

export function renderWorkshopScene(
  ctx: CanvasRenderingContext2D,
  time: number,
  player: PlayerCustomization,
  equipment: Record<EquipmentId, number>,
  orders: Order[],
  hoveredSpot: WorkshopHotspotId | null,
  activeCharX: number,
  particles: ParticlePool,
  opts: WorkshopRenderOptions = {},
): void {
  const hasRichBg = Boolean(getLoadedSheet('workshopBg'));
  const bg = getWorkshopBgAsset();
  ctx.drawImage(bg, 0, 0, 480, 270);

  // Ambient forge atmosphere: embers, subtle chimney smoke, drifting sunlit/forge dust motes
  if (Math.random() < 0.22) {
    particles.spawn(
      hasRichBg ? 92 + (Math.random() - 0.5) * 26 : 46 + (Math.random() - 0.5) * 18,
      hasRichBg ? 136 : 172,
      (Math.random() - 0.5) * 16,
      -20 - Math.random() * 28,
      0.7 + Math.random() * 0.65,
      Math.random() > 0.7 ? 2 : 1,
      Math.random() > 0.4 ? '#fde047' : '#fb923c',
      -10,
      'ember',
    );
  }
  if (hasRichBg && Math.random() < 0.08) {
    particles.spawnSmoke(92 + (Math.random() - 0.5) * 14, 108);
  }
  if (Math.random() < 0.07) {
    particles.spawnDustMote(40 + Math.random() * 400, 36 + Math.random() * 175);
  }

  if (!hasRichBg) {
    drawProceduralStations(ctx, time, equipment);
  } else {
    // 1. World Map Scroll pinned cleanly inside upper-left wall frame with warm lantern glint
    const mapImg = getLoadedSheet('worldMap');
    ctx.fillStyle = '#2c190e';
    ctx.fillRect(154, 42, 34, 24);
    if (mapImg) {
      ctx.drawImage(mapImg, 156, 44, 30, 20);
    }
    ctx.strokeStyle = hoveredSpot === 'map' ? '#fde047' : '#d4b88c';
    ctx.lineWidth = 1;
    ctx.strokeRect(155.5, 43.5, 31, 21);

    // 2. Animated hearth flame pulse (layered size synced with furnace tier)
    const furnaceTier = equipment.furnace ?? 1;
    const fireIdx = Math.floor(time * 9) % 3;
    const fireSprite = getVfxSprite(`fire${fireIdx}` as 'fire0' | 'fire1' | 'fire2', 28, 36);
    if (fireSprite) {
      ctx.save();
      ctx.globalAlpha = 0.72 + Math.sin(time * 12) * 0.16;
      const fScale = 1 + (furnaceTier - 1) * 0.04;
      const fw = Math.round(28 * fScale);
      const fh = Math.round(36 * fScale);
      ctx.drawImage(fireSprite, 82 - Math.round((fw - 28) / 2), 114 - Math.round(fh - 36), fw, fh);
      ctx.restore();
    }

    // 3. Quench barrel mist & subtle cool aqua sheen
    const steamSprite = getVfxSprite('steam', 32, 32);
    if (steamSprite) {
      const floatY = (time * 10) % 10;
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, 0.45 - floatY * 0.036);
      ctx.drawImage(steamSprite, 314, 106 - floatY, 30, 28);
      ctx.restore();
    }

    // 4. Upgraded equipment stations (Tier >= 2 visually transforms the workshop)
    const upgradeSpots: { id: EquipmentId; x: number; y: number; w: number; h: number }[] = [
      { id: 'furnace', x: 30, y: 46, w: 120, h: 145 },
      { id: 'anvil', x: 174, y: 150, w: 62, h: 62 },
      { id: 'grindstone', x: 248, y: 112, w: 54, h: 64 },
      { id: 'quench', x: 302, y: 122, w: 62, h: 66 },
      { id: 'workbench', x: 366, y: 132, w: 96, h: 80 },
    ];
    for (const st of upgradeSpots) {
      const tier = equipment[st.id] ?? 1;
      if (tier >= 2) {
        const eqSprite = getEquipmentSheetSprite(st.id, tier, 96);
        if (eqSprite) {
          ctx.fillStyle = 'rgba(0,0,0,0.34)';
          ctx.fillRect(st.x + 8, st.y + st.h - 6, st.w - 16, 6);
          ctx.drawImage(eqSprite, st.x, st.y, st.w, st.h);
          if (tier >= 4) {
            const runeAlpha = 0.14 + Math.sin(time * 4 + st.x) * 0.08;
            ctx.save();
            ctx.globalAlpha = Math.max(0.05, runeAlpha);
            ctx.strokeStyle = tier >= 5 ? '#fde047' : '#38bdf8';
            ctx.lineWidth = 1;
            ctx.strokeRect(st.x + 4, st.y + 4, st.w - 8, st.h - 8);
            ctx.restore();
          }
        }
      }
    }

    // 5. Upgraded Forge Hammer mounted beside the Anvil when tier >= 2
    const hammerTier = equipment.hammer ?? 1;
    if (hammerTier >= 2) {
      const hammerSprite = getEquipmentSheetSprite('hammer', hammerTier, 48);
      if (hammerSprite) {
        ctx.save();
        ctx.translate(230, 198);
        ctx.rotate(0.45);
        ctx.drawImage(hammerSprite, -14, -14, 28, 28);
        ctx.restore();
      }
    }

    // 6. Subtle pulsing candlelight over Shop Shelf
    const shelfGlow = ctx.createRadialGradient(426, 84, 4, 426, 84, 46);
    shelfGlow.addColorStop(0, `rgba(251, 191, 36, ${0.14 + Math.sin(time * 6) * 0.03})`);
    shelfGlow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = shelfGlow;
    ctx.fillRect(378, 38, 96, 92);
  }

  // Warm Multi-Layered Hearth Light Cone across floor & anvil
  const hearthCenterX = hasRichBg ? 94 : 48;
  const hearthCenterY = hasRichBg ? 136 : 174;
  const flicker = 0.15 + Math.sin(time * 9) * 0.035 + Math.cos(time * 15) * 0.015;
  const grad = ctx.createRadialGradient(
    hearthCenterX,
    hearthCenterY,
    8,
    hearthCenterX,
    hearthCenterY,
    165,
  );
  grad.addColorStop(0, `rgba(255, 180, 56, ${flicker + 0.12})`);
  grad.addColorStop(0.45, `rgba(234, 88, 12, ${flicker * 0.85})`);
  grad.addColorStop(1, 'rgba(234, 88, 12, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 36, 265, 228);

  // Subtle floor hearth reflection glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const floorLight = ctx.createRadialGradient(135, 206, 6, 135, 206, 95);
  floorLight.addColorStop(0, `rgba(249, 115, 22, ${0.11 + Math.sin(time * 7) * 0.025})`);
  floorLight.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = floorLight;
  ctx.fillRect(36, 135, 200, 120);
  ctx.restore();

  // Animated Customer Character waiting at Counter when orders exist
  if (orders.length > 0) {
    const lead = orders[0];
    const race = RACES[lead.race];
    const portrait = getPortraitAsset(lead.race, lead.portraitVariant, lead.kind === 'royal');
    const urgencyRatio = lead.deadlineSec > 0 ? lead.remainingSec / lead.deadlineSec : 1;
    const isUrgent = urgencyRatio < 0.35;
    const idleFreq = isUrgent ? 7.5 : 3.4;
    const bounce = Math.round(Math.sin(time * idleFreq) * (isUrgent ? 1.6 : 1.0));
    const cx = hasRichBg ? 203 : 426;
    const cy = (hasRichBg ? 74 : 122) + bounce;

    // Beveled Oak Patron Ledge & Shaded Cloak Shoulders behind portrait badge
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(cx - 5, cy + 37, 42, 16);
    // Cloak shoulders with dark outline & secondary trim
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(cx + 2, cy + 28, 28, 12);
    ctx.fillStyle = race.palette.primary;
    ctx.fillRect(cx + 4, cy + 30, 24, 9);
    ctx.fillStyle = race.palette.secondary;
    ctx.fillRect(cx + 12, cy + 30, 8, 9);
    // Brass-riveted oak counter rail
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(cx - 4, cy + 37, 40, 14);
    ctx.fillStyle = '#633c23';
    ctx.fillRect(cx - 3, cy + 38, 38, 12);
    ctx.fillStyle = '#8c6239';
    ctx.fillRect(cx - 3, cy + 38, 38, 2);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx - 1, cy + 40, 2, 2);
    ctx.fillRect(cx + 31, cy + 40, 2, 2);

    // Ornate RPG Portrait Head Badge
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(cx - 2, cy - 2, 36, 36);
    ctx.fillStyle = race.palette.badgeBg;
    ctx.fillRect(cx, cy, 32, 32);
    ctx.drawImage(portrait, cx + 1, cy + 1, 30, 30);

    // Royal Crown trim or Kingdom Banner
    ctx.strokeStyle = lead.kind === 'royal' ? '#fde047' : '#d97706';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 1.5, cy - 1.5, 35, 35);

    // Nameplate ribbon set cleanly inside oak counter rail
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(cx - 1, cy + 41, 34, 8);
    ctx.fillStyle = race.palette.primary;
    ctx.fillRect(cx, cy + 42, 32, 6);
    ctx.fillStyle = '#fffbeb';
    ctx.font = 'bold 6px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(race.name.toUpperCase(), cx + 16, cy + 47);

    // Floating speech / urgency indicator "!"
    const bubbleY = cy - 18 + Math.round(Math.cos(time * 5) * 1);
    ctx.fillStyle = isUrgent ? '#fef2f2' : '#fffbeb';
    ctx.fillRect(cx + 4, bubbleY, 24, 13);
    ctx.strokeStyle = isUrgent ? '#dc2626' : '#120c0a';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 4.5, bubbleY + 0.5, 23, 12);
    ctx.fillStyle = lead.kind === 'royal' ? '#b45309' : isUrgent ? '#dc2626' : '#991b1b';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.fillText(lead.kind === 'royal' ? '★!' : `${orders.length}!`, cx + 16, bubbleY + 9);
    ctx.textAlign = 'left';
  }

  // Player Blacksmith walking or subtle breathing & idle routine while waiting
  const isWalking = Boolean(opts.isWalking);
  const baseFacing: 1 | -1 = opts.facing ?? 1;
  const strideBob = isWalking ? (opts.strideBob ?? 0) : 0;
  const baseTilt = opts.strideTilt ?? (isWalking ? 0 : Math.sin(time * 1.45) * 0.014);
  const fallbackBreath = Math.pow(0.5 + 0.5 * Math.sin(time * 2.6), 1.35);
  const breathScaleX = isWalking ? 1 : (opts.breathScaleX ?? 1 + fallbackBreath * 0.018);
  const breathScaleY = isWalking ? 1 : (opts.breathScaleY ?? 1 + fallbackBreath * 0.032);

  let charAction: 'idle' | 'walk' | 'bellows' | 'strike' | 'tend' = 'idle';
  let charFrame = 0;
  let charFacing: 1 | -1 = baseFacing;
  let extraTilt = 0;

  if (isWalking) {
    charAction = 'walk';
    charFrame = Math.floor(time * 9) % 2;
    if (hasRichBg && Math.random() < 0.25) {
      particles.spawn(
        activeCharX + 26,
        218,
        -charFacing * (10 + Math.random() * 14),
        -4 - Math.random() * 6,
        0.35,
        2,
        '#786a62',
        20,
        'dust',
      );
    }
  } else {
    const idlePose = computeWorkshopIdlePose(
      time,
      opts.activeSpot ?? 'anvil',
      orders.length,
      baseFacing,
      activeCharX,
    );
    charAction = idlePose.action;
    charFrame = idlePose.frame;
    charFacing = idlePose.facing;
    extraTilt = idlePose.extraTilt;

    if (
      hasRichBg &&
      idlePose.behavior === 'station_work' &&
      (opts.activeSpot ?? 'anvil') === 'anvil' &&
      charFrame === 3 &&
      Math.random() < 0.22
    ) {
      particles.burstSparks(activeCharX + 58, 170, 2, '#fde047');
    }
  }

  const pSprite = getPlayerSpriteCanvas(
    player,
    charAction === 'strike',
    charAction,
    charFrame,
    charFacing,
  );
  const px = Math.round(activeCharX);
  const basePy = hasRichBg ? 158 : 178;
  const pw = hasRichBg ? 56 : 32;
  const ph = hasRichBg ? 64 : 32;
  const footX = px + pw / 2;
  const footY = basePy + ph - 3;

  // Soft ground ellipse shadow anchored beneath boots
  const shadowRx = Math.round((pw - 22) * 0.5 * (isWalking ? 0.92 : 1 - (breathScaleY - 1) * 0.6));
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.beginPath();
  ctx.ellipse(footX, footY + 1, Math.max(8, shadowRx), 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bottom-pivoted draw so boots stay planted on the floor during breathing & sway
  ctx.save();
  ctx.translate(footX, footY + strideBob);
  ctx.rotate(baseTilt + extraTilt);
  ctx.scale(breathScaleX, breathScaleY);
  ctx.drawImage(pSprite, -pw / 2, -ph + 3, pw, ph);
  ctx.restore();

  // Corner-bracket reticle + tier tag on hovered station
  if (hoveredSpot) {
    const spot = WORKSHOP_HOTSPOTS.find((s) => s.id === hoveredSpot);
    if (spot) {
      drawCornerReticle(ctx, spot.x, spot.y, spot.w, spot.h, '#fde047');

      const eqTier =
        spot.id === 'furnace' ||
        spot.id === 'anvil' ||
        spot.id === 'grindstone' ||
        spot.id === 'quench' ||
        spot.id === 'workbench'
          ? equipment[spot.id]
          : null;
      const tagText = eqTier ? `${spot.label} T${eqTier}` : spot.label;
      const tagW = tagText.length * 6 + 12;
      const tagX = Math.max(4, Math.min(480 - tagW - 4, spot.x + spot.w / 2 - tagW / 2));
      const tagY = Math.max(24, spot.y - 16);
      ctx.fillStyle = 'rgba(18, 12, 10, 0.92)';
      ctx.fillRect(tagX, tagY, tagW, 14);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagW - 1, 13);
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 8px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tagText, tagX + tagW / 2, tagY + 9.5);
      ctx.textAlign = 'left';
    }
  }

  particles.draw(ctx);
}

function drawCornerReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  const len = Math.min(10, Math.floor(Math.min(w, h) * 0.25));
  ctx.save();
  ctx.fillStyle = 'rgba(253, 224, 71, 0.08)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  // Top-right
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  // Bottom-right
  ctx.moveTo(x + w, y + h - len);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - len, y + h);
  // Bottom-left
  ctx.moveTo(x + len, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - len);
  ctx.stroke();
  ctx.restore();
}

function drawProceduralStations(
  ctx: CanvasRenderingContext2D,
  time: number,
  equipment: Record<EquipmentId, number>,
): void {
  ctx.fillStyle = '#3b2416';
  ctx.fillRect(298, 46, 36, 34);
  ctx.fillStyle = '#e7cfa2';
  ctx.fillRect(301, 49, 30, 28);
  const metal = TIER_METAL_COLORS[equipment.furnace - 1] ?? TIER_METAL_COLORS[0];
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(16, 114, 62, 96);
  ctx.fillStyle = metal;
  ctx.fillRect(18, 116, 58, 92);
  const pulse = Math.sin(time * 11) * 2;
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(33, 164 - Math.max(0, pulse), 28, 26);
  ctx.fillStyle = '#633c23';
  ctx.fillRect(120, 186, 26, 22);
  ctx.fillStyle = TIER_METAL_COLORS[equipment.anvil - 1] ?? '#544a47';
  ctx.fillRect(112, 170, 40, 12);
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(182, 174, 32, 24);
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(252, 154, 24, 24);
  ctx.fillStyle = TIER_TRIM_COLORS[equipment.workbench - 1] ?? '#7c4d25';
  ctx.fillRect(312, 172, 56, 12);
}
