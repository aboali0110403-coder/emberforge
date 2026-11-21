import React, { useEffect, useRef, useState } from 'react';
import { ensurePaintedWeaponsPreloaded, subscribePaintedWeaponLoad } from '../gfx/paintedWeaponAssets';
import {
  ensureAssetsPreloaded,
  getEquipmentSheetSprite,
  getHudIconCanvas,
  subscribeAssetLoad,
  type HudIconId,
} from '../gfx/assetSheets';
import { getPortraitAsset } from '../gfx/generatedAssets';
import {
  getMaterialIconCanvas,
  getPlayerSpriteCanvas,
  getWeaponSpriteCanvas,
} from '../gfx/sprites';
import type {
  EquipmentId,
  PlayerCustomization,
  RaceId,
  WeaponInstance,
} from '../types';

function useAssetRefresh(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    ensureAssetsPreloaded();
    const refresh = () => setVersion((v) => v + 1);
    const unsubscribeAssets = subscribeAssetLoad(refresh);
    const unsubscribePainted = subscribePaintedWeaponLoad(refresh);
    ensurePaintedWeaponsPreloaded();
    return () => { unsubscribeAssets(); unsubscribePainted(); };
  }, []);
  return version;
}

interface PixelCanvasViewProps {
  source: HTMLCanvasElement | HTMLImageElement;
  size: number;
  label: string;
  smooth?: boolean;
}

const PixelCanvasView: React.FC<PixelCanvasViewProps> = ({
  source,
  size,
  label,
  smooth = true,
}) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const w =
    source instanceof HTMLCanvasElement
      ? source.width
      : Math.max(32, source.naturalWidth || 64);
  const h =
    source instanceof HTMLCanvasElement
      ? source.height
      : Math.max(32, source.naturalHeight || 64);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = smooth && w > 32;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
  }, [source, w, h, smooth]);

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      aria-label={label}
      className={w <= 32 ? 'pixelated shrink-0' : 'shrink-0'}
      style={{ width: size, height: size }}
    />
  );
};

export const PortraitSprite: React.FC<{
  race: RaceId;
  variant: number;
  isKing?: boolean;
  size?: number;
}> = ({ race, variant, isKing = false, size = 48 }) => {
  useAssetRefresh();
  const src = getPortraitAsset(race, variant, isKing);
  return <PixelCanvasView source={src} size={size} label={`${race} portrait`} />;
};

export const WeaponSprite: React.FC<{
  weapon: WeaponInstance;
  size?: number;
}> = ({ weapon, size = 48 }) => {
  useAssetRefresh();
  const src = getWeaponSpriteCanvas(weapon);
  return <PixelCanvasView source={src} size={size} label={`${weapon.type} sprite`} />;
};

export const MaterialSprite: React.FC<{
  materialId: string;
  size?: number;
}> = ({ materialId, size = 28 }) => {
  useAssetRefresh();
  const src = getMaterialIconCanvas(materialId);
  return <PixelCanvasView source={src} size={size} label={materialId} />;
};

export const PlayerSpritePreview: React.FC<{
  player: PlayerCustomization;
  size?: number;
}> = ({ player, size = 96 }) => {
  useAssetRefresh();
  const src = getPlayerSpriteCanvas(player, false);
  return <PixelCanvasView source={src} size={size} label="Blacksmith preview" />;
};

export const EquipmentSprite: React.FC<{
  equipmentId: EquipmentId;
  tier: number;
  size?: number;
}> = ({ equipmentId, tier, size = 56 }) => {
  useAssetRefresh();
  const src = getEquipmentSheetSprite(equipmentId, tier, 72);
  if (!src) {
    return (
      <div
        className="shrink-0 border border-[#6b4931] bg-[#241914]"
        style={{ width: size, height: size }}
        aria-label={`${equipmentId} tier ${tier}`}
      />
    );
  }
  return (
    <PixelCanvasView
      source={src}
      size={size}
      label={`${equipmentId} tier ${tier}`}
    />
  );
};

export const HudIconSprite: React.FC<{
  icon: HudIconId;
  size?: number;
  label?: string;
}> = ({ icon, size = 18, label }) => {
  useAssetRefresh();
  const src = getHudIconCanvas(icon, 32);
  if (!src) {
    return <span style={{ width: size, height: size }} className="inline-block shrink-0" />;
  }
  return <PixelCanvasView source={src} size={size} label={label ?? icon} />;
};
