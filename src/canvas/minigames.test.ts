import './workshopAtmosphere.test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMinigameRuntime, handleMinigamePointerDown, handleMinigamePointerUp, updateMinigame } from './minigames';
import { ParticlePool } from '../gfx/particles';
import type { EquipmentId } from '../types';

const equipment: Record<EquipmentId, number> = { furnace: 1, anvil: 1, hammer: 1, grindstone: 1, quench: 1, workbench: 1 };
function fixture(station: 'anvil' | 'furnace' | 'grindstone' | 'quench') {
  const rt = createMinigameRuntime(station, 1, equipment);
  const particles = new ParticlePool();
  let finishes = 0;
  const callbacks = { onHitStop() {}, onShake() {}, onStreak() {}, onFinish() { finishes++; } };
  const tick = (dt: number) => updateMinigame(rt, dt, new Set(), equipment, particles, callbacks);
  const hit = () => handleMinigamePointerDown(rt, rt.targetX, rt.targetY, equipment, particles, callbacks);
  return { rt, particles, callbacks, tick, hit, finishes: () => finishes };
}

test('anvil targets remain on the blade', () => {
  for (let i = 0; i < 100; i++) {
    const { rt } = fixture('anvil');
    assert.ok(rt.targetX >= 185 && rt.targetX <= 295);
    assert.ok(rt.targetY >= 121 && rt.targetY <= 129);
  }
});
test('timing grades are preserved and the strike anchor is captured', () => {
  for (const [progress, quality] of [[.85, 'perfect'], [.66, 'good'], [.1, 'miss']] as const) {
    const f = fixture('anvil'); f.rt.ringProgress = progress;
    const x = f.rt.targetX, y = f.rt.targetY; f.hit();
    assert.equal(f.rt.anvilStrikeQuality, quality);
    assert.equal(f.rt.popup?.kind, quality);
    assert.equal(f.rt.anvilStrikeX, x); assert.equal(f.rt.anvilStrikeY, y);
    f.tick(.12); assert.equal(f.rt.targetX, x); assert.equal(f.rt.targetY, y);
  }
});
test('a held or repeated input cannot skip the downstroke', () => {
  const f = fixture('anvil'); f.rt.ringProgress = .85; f.hit(); f.hit(); f.hit();
  assert.equal(f.rt.strikesDone, 1); assert.equal(f.rt.strikeScores.length, 1);
  f.tick(.05); assert.equal(f.rt.anvilImpactEmitted, false);
  f.tick(.05); assert.equal(f.rt.anvilImpactEmitted, true);
  f.tick(.23); assert.equal(f.rt.ringProgress, 0); assert.equal(f.rt.hammerStrikeAnim, 0);
});
test('all anvil strikes complete and final impact is visible before finishing', () => {
  const f = fixture('anvil');
  for (let i = 0; i < f.rt.strikesTotal; i++) {
    f.rt.ringProgress = .85; f.hit(); assert.equal(f.rt.finished, false);
    f.tick(.12); assert.equal(f.rt.finished, false);
    f.tick(.21);
  }
  assert.equal(f.rt.finished, true); assert.equal(f.finishes(), 1);
  assert.equal(f.rt.accuracy, 1); f.tick(1); f.hit(); assert.equal(f.finishes(), 1);
});
test('timing out still counts a missed strike', () => {
  const f = fixture('anvil'); f.rt.ringProgress = 1.15; f.tick(.1);
  assert.equal(f.rt.strikesDone, 1); assert.equal(f.rt.strikeScores[0], .25);
});
test('furnace and grindstone still finish with bounded quality', () => {
  for (const station of ['furnace', 'grindstone'] as const) {
    const f = fixture(station);
    for (let i = 0; i < 2000 && !f.rt.finished; i++) {
      if (station === 'furnace') f.rt.pointerDown = f.rt.heat < f.rt.bandCenter;
      else f.rt.cursorX = f.rt.zoneCenter;
      f.tick(.016);
    }
    assert.equal(f.rt.finished, true); assert.equal(f.finishes(), 1);
    assert.ok(f.rt.accuracy >= .18 && f.rt.accuracy <= 1);
  }
});
test('quenching still plunges, cools and rewards release in the band', () => {
  const f = fixture('quench'); f.hit();
  while (f.rt.temp > .39) f.tick(.016);
  assert.equal(f.rt.quenchPlunge, 1);
  handleMinigamePointerUp(f.rt, f.particles, f.callbacks);
  assert.equal(f.rt.finished, true); assert.equal(f.rt.quenchDone, true);
  assert.equal(f.rt.accuracy, 1); assert.equal(f.finishes(), 1);
});
