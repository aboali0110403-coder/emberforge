import React, { useEffect, useRef } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../data/config';
import { ensureAssetsPreloaded } from '../gfx/assetSheets';
import { ParticlePool } from '../gfx/particles';
import type {
  EquipmentId,
  ForgingSession,
  Order,
  PlayerCustomization,
  SaveState,
} from '../types';
import { computeWalkPose } from './animation';
import {
  createMinigameRuntime,
  handleMinigamePointerDown,
  handleMinigamePointerMove,
  handleMinigamePointerUp,
  renderMinigameScene,
  updateMinigame,
  type MinigameFinishPayload,
  type MinigameRuntime,
} from './minigames';
import {
  WORKSHOP_HOTSPOTS,
  hitTestWorkshop,
  renderWorkshopScene,
  type WorkshopHotspotId,
} from './workshopScene';

export interface GameCanvasProps {
  mode: 'title' | 'workshop' | 'forging';
  save: SaveState | null;
  forging: ForgingSession | null;
  paused: boolean;
  tutorialBlocked: boolean;
  onSelectHotspot: (id: WorkshopHotspotId) => void;
  onForgeProgress: (accuracy: number, streak: number) => void;
  onForgeStepFinish: (payload: MinigameFinishPayload) => void;
}

const DEFAULT_TITLE_PLAYER: PlayerCustomization = {
  name: 'Rowan',
  gender: 'male',
  hairColorIndex: 1,
  skinToneIndex: 0,
  outfitColorIndex: 0,
};

const DEFAULT_EQUIP: Record<EquipmentId, number> = {
  furnace: 1,
  hammer: 1,
  anvil: 1,
  grindstone: 1,
  quench: 1,
  workbench: 1,
};

export const GameCanvas: React.FC<GameCanvasProps> = ({
  mode,
  save,
  forging,
  paused,
  tutorialBlocked,
  onSelectHotspot,
  onForgeProgress,
  onForgeStepFinish,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<ParticlePool>(new ParticlePool());
  const hoveredSpotRef = useRef<WorkshopHotspotId | null>(null);
  const activeSpotRef = useRef<WorkshopHotspotId | null>('anvil');
  const activeCharXRef = useRef<number>(132);
  const targetCharXRef = useRef<number>(132);
  const lastFacingRef = useRef<1 | -1>(1);

  const minigameRef = useRef<MinigameRuntime | null>(null);
  const heldKeysRef = useRef<Set<string>>(new Set());
  const hitStopRef = useRef<number>(0);
  const shakeRef = useRef<number>(0);

  // Store latest props in refs so the 60fps loop never restarts on HUD updates
  const stateRef = useRef({
    mode,
    save,
    forging,
    paused,
    tutorialBlocked,
    onSelectHotspot,
    onForgeProgress,
    onForgeStepFinish,
  });
  stateRef.current = {
    mode,
    save,
    forging,
    paused,
    tutorialBlocked,
    onSelectHotspot,
    onForgeProgress,
    onForgeStepFinish,
  };

  // Initialize or reset minigame runtime whenever forging step changes
  const stepKey = forging
    ? `${forging.order.id}_${forging.stepIndex}_${forging.steps[forging.stepIndex]}`
    : 'none';

  useEffect(() => {
    if (mode === 'forging' && forging && save) {
      const station = forging.steps[forging.stepIndex];
      minigameRef.current = createMinigameRuntime(
        station,
        forging.order.weapon.level,
        save.equipment,
      );
    } else {
      minigameRef.current = null;
    }
  }, [mode, stepKey]);

  useEffect(() => {
    ensureAssetsPreloaded();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const screenToWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * CANVAS_WIDTH;
      const y = ((clientY - rect.top) / Math.max(1, rect.height)) * CANVAS_HEIGHT;
      return { x, y };
    };

    const getCallbacks = () => ({
      onHitStop: (sec: number) => {
        hitStopRef.current = Math.max(hitStopRef.current, sec);
      },
      onShake: (amt: number) => {
        shakeRef.current = Math.max(shakeRef.current, amt);
      },
      onStreak: (streak: number) => {
        const mg = minigameRef.current;
        if (mg) stateRef.current.onForgeProgress(mg.accuracy, streak);
      },
      onFinish: (payload: MinigameFinishPayload) => {
        stateRef.current.onForgeStepFinish(payload);
      },
    });

    const onPointerDown = (e: PointerEvent) => {
      const st = stateRef.current;
      if (st.paused || st.tutorialBlocked) return;
      const { x, y } = screenToWorld(e.clientX, e.clientY);

      if (st.mode === 'workshop') {
        const hit = hitTestWorkshop(x, y);
        if (hit) {
          const spot = WORKSHOP_HOTSPOTS.find((s) => s.id === hit);
          if (spot) {
            targetCharXRef.current = spot.charX;
            activeSpotRef.current = hit;
          }
          st.onSelectHotspot(hit);
        }
      } else if (st.mode === 'forging' && minigameRef.current && st.save) {
        handleMinigamePointerDown(
          minigameRef.current,
          x,
          y,
          st.save.equipment,
          particlesRef.current,
          getCallbacks(),
        );
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const st = stateRef.current;
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      if (st.mode === 'workshop' && !st.paused) {
        hoveredSpotRef.current = hitTestWorkshop(x, y);
      } else if (st.mode === 'forging' && minigameRef.current && !st.paused && !st.tutorialBlocked) {
        handleMinigamePointerMove(minigameRef.current, x);
      }
    };

    const onPointerUp = () => {
      const st = stateRef.current;
      if (st.mode === 'forging' && minigameRef.current) {
        handleMinigamePointerUp(
          minigameRef.current,
          particlesRef.current,
          getCallbacks(),
        );
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.paused || st.tutorialBlocked) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (!heldKeysRef.current.has(e.key)) {
        heldKeysRef.current.add(e.key);
        // Edge-triggered action for Space/Enter in forging
        if (
          st.mode === 'forging' &&
          minigameRef.current &&
          st.save &&
          (e.key === ' ' || e.key === 'Enter')
        ) {
          e.preventDefault();
          const mg = minigameRef.current;
          if (mg.station === 'anvil' || mg.station === 'workbench' || mg.station === 'quench') {
            handleMinigamePointerDown(
              mg,
              240,
              140,
              st.save.equipment,
              particlesRef.current,
              getCallbacks(),
              true,
            );
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key);
      const st = stateRef.current;
      if (
        st.mode === 'forging' &&
        minigameRef.current &&
        (e.key === ' ' || e.key === 'Enter')
      ) {
        handleMinigamePointerUp(
          minigameRef.current,
          particlesRef.current,
          getCallbacks(),
        );
      }
    };

    const clearInputs = () => {
      heldKeysRef.current.clear();
      if (minigameRef.current) {
        minigameRef.current.pointerDown = false;
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);

    let rafId = 0;
    let lastTime = performance.now();
    let totalTime = 0;
    let lastHudSync = 0;

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      const st = stateRef.current;

      if (!st.paused) {
        totalTime += dt;
        // Smooth blacksmith walk interpolation
        activeCharXRef.current += (targetCharXRef.current - activeCharXRef.current) * Math.min(1, dt * 8);

        if (hitStopRef.current > 0) {
          hitStopRef.current = Math.max(0, hitStopRef.current - dt);
        } else if (st.mode === 'forging' && minigameRef.current && st.save && !st.tutorialBlocked) {
          updateMinigame(
            minigameRef.current,
            dt,
            heldKeysRef.current,
            st.save.equipment,
            particlesRef.current,
            getCallbacks(),
          );
          if (totalTime - lastHudSync > 0.12) {
            lastHudSync = totalTime;
            st.onForgeProgress(minigameRef.current.accuracy, minigameRef.current.streak);
          }
        }

        particlesRef.current.update(dt);
        if (shakeRef.current > 0) {
          shakeRef.current = Math.max(0, shakeRef.current - dt * 22);
        }
      }

      ctx.imageSmoothingEnabled = false;
      ctx.save();
      if (shakeRef.current > 0.1) {
        const sx = Math.round((Math.random() - 0.5) * shakeRef.current * 2);
        const sy = Math.round((Math.random() - 0.5) * shakeRef.current * 2);
        ctx.translate(sx, sy);
      }

      if (st.mode === 'forging' && minigameRef.current && st.forging && st.save) {
        renderMinigameScene(
          ctx,
          minigameRef.current,
          st.save.player,
          st.forging.order.weapon,
          particlesRef.current,
          st.save.equipment,
          st.forging.selectedMaterials,
        );
      } else {
        const player = st.save?.player ?? DEFAULT_TITLE_PLAYER;
        const equipment = st.save?.equipment ?? DEFAULT_EQUIP;
        const orders: Order[] = st.mode === 'title' ? [] : (st.save?.orders ?? []);
        const walkPose = computeWalkPose(
          activeCharXRef.current,
          targetCharXRef.current,
          lastFacingRef.current,
          totalTime,
        );
        lastFacingRef.current = walkPose.facing;
        renderWorkshopScene(
          ctx,
          totalTime,
          player,
          equipment,
          orders,
          st.mode === 'workshop' ? hoveredSpotRef.current : null,
          activeCharXRef.current,
          particlesRef.current,
          {
            activeSpot: activeSpotRef.current,
            isWalking: walkPose.isWalking,
            facing: walkPose.facing,
            strideBob: walkPose.strideBob,
          },
        );
      }

      ctx.restore();
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
    };
  }, []);

  return (
    <div
      data-testid="game-canvas-container"
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#120c0a]"
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="pixelated max-h-full max-w-full touch-none select-none object-contain"
        style={{
          width: 'min(100vw, calc(100vh * 16 / 9))',
          height: 'min(100vh, calc(100vw * 9 / 16))',
        }}
      />
    </div>
  );
};
