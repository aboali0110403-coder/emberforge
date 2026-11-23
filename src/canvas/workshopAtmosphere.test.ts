import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceWorkshopNightMix, getWorkshopAtmosphereSpec } from './animation';
import { drawWorkshopAmbient } from './workshopScene';
import { getWorldCycle, skipNight } from '../game/worldCycle';
import { createInitialSaveState } from '../game/rules';

const canvasSource = readFileSync(new URL('./GameCanvas.tsx', import.meta.url), 'utf8');
const sceneSource = readFileSync(new URL('./workshopScene.ts', import.meta.url), 'utf8');

function contextSpy() {
  const calls: any[] = [], stack: any[] = [];
  const ctx: any = {
    globalCompositeOperation: 'source-over', fillStyle: '#123456',
    globalAlpha: 0.8, imageSmoothingEnabled: false,
    save() { stack.push({ op: this.globalCompositeOperation, fill: this.fillStyle, alpha: this.globalAlpha }); calls.push(['save']); },
    restore() { const s = stack.pop(); this.globalCompositeOperation = s.op; this.fillStyle = s.fill; this.globalAlpha = s.alpha; calls.push(['restore']); },
    fillRect(...args: number[]) { calls.push(['fill', this.globalCompositeOperation, this.fillStyle, ...args]); },
    createLinearGradient(...args: number[]) {
      const stops: any[] = []; calls.push(['gradient', ...args, stops]);
      return { addColorStop(offset: number, color: string) { stops.push([offset, color]); } };
    },
  };
  return { ctx, calls, stack };
}

test('atmosphere: a newly entered or restored workshop seeds its saved phase without a flash', () => {
  assert.equal(advanceWorkshopNightMix(null, 'day', 1 / 60), 0);
  assert.equal(advanceWorkshopNightMix(null, 'night', 1 / 60), 1);
  assert.equal(advanceWorkshopNightMix(NaN, 'night', 1 / 60), 1);
});

test('atmosphere: dusk starts on the next render and converges smoothly without overshoot', () => {
  let mix = 0;
  for (let i = 0; i < 180; i++) {
    const next = advanceWorkshopNightMix(mix, 'night', 1 / 60);
    assert.ok(next >= mix && next <= 1); assert.ok(next - mix < 0.047);
    if (i === 0) assert.ok(next > 0 && next < 1);
    mix = next;
    if (i === 95) assert.ok(mix > 0.98);
  }
  assert.equal(mix, 1);
});

test('atmosphere: dawn and Skip Night begin easing immediately, not by a full-color snap', () => {
  let mix = 1;
  for (let i = 0; i < 180; i++) {
    const next = advanceWorkshopNightMix(mix, 'day', 1 / 60);
    assert.ok(next <= mix && next >= 0); assert.ok(mix - next < 0.047);
    if (i === 0) assert.ok(next > 0 && next < 1);
    mix = next;
  }
  assert.equal(mix, 0);
});

test('atmosphere: frame-rate-independent easing and bounded stalled-frame deltas', () => {
  let at30 = 0, at60 = 0;
  for (let i = 0; i < 30; i++) at30 = advanceWorkshopNightMix(at30, 'night', 1 / 30);
  for (let i = 0; i < 60; i++) at60 = advanceWorkshopNightMix(at60, 'night', 1 / 60);
  assert.ok(Math.abs(at30 - at60) < 1e-12);
  assert.equal(advanceWorkshopNightMix(0.4, 'night', 100), advanceWorkshopNightMix(0.4, 'night', 0.05));
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(advanceWorkshopNightMix(0.4, 'night', dt), 0.4);
});

test('atmosphere: reversing the phase mid-transition remains continuous and deterministic', () => {
  const middle = advanceWorkshopNightMix(0.5, 'night', 1 / 60);
  const reversed = advanceWorkshopNightMix(middle, 'day', 1 / 60);
  assert.ok(reversed < middle && reversed > 0);
  assert.ok(middle - reversed < 0.047);
  assert.equal(advanceWorkshopNightMix(middle, 'day', 1 / 60), reversed);
});

test('atmosphere: stable phases do not oscillate and invalid blends are bounded', () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(advanceWorkshopNightMix(0, 'day', 1 / 60), 0);
    assert.equal(advanceWorkshopNightMix(1, 'night', 1 / 60), 1);
  }
  assert.equal(advanceWorkshopNightMix(-5, 'day', 1 / 60), 0);
  assert.equal(advanceWorkshopNightMix(5, 'night', 1 / 60), 1);
});

test('atmosphere: controlled day/night/midpoint inputs keep ambient and existing VFX gains modest', () => {
  const day = getWorkshopAtmosphereSpec(0), night = getWorkshopAtmosphereSpec(1), mid = getWorkshopAtmosphereSpec(0.5);
  assert.deepEqual(day, { ambientShade: 0, daylight: 0.06, hearthBoost: 0, floorBoost: 0, flameBoost: 0, shelfBoost: 0 });
  assert.deepEqual(night, { ambientShade: 0.24, daylight: 0, hearthBoost: 0.08, floorBoost: 0.04, flameBoost: 0.06, shelfBoost: 0.04 });
  for (const key of Object.keys(day) as (keyof typeof day)[]) assert.equal(mid[key], (day[key] + night[key]) / 2);
  assert.deepEqual(getWorkshopAtmosphereSpec(-1), day);
  assert.deepEqual(getWorkshopAtmosphereSpec(2), night);
  assert.deepEqual(getWorkshopAtmosphereSpec(NaN), day);
});

test('atmosphere render: daytime uses a directional warm gradient, not a flat white overlay', () => {
  const h = contextSpy(); drawWorkshopAmbient(h.ctx, 0);
  assert.equal(h.calls.filter(c => c[0] === 'fill').length, 1);
  assert.equal(h.calls.find(c => c[0] === 'fill')[1], 'screen');
  const gradient = h.calls.find(c => c[0] === 'gradient');
  assert.deepEqual(gradient.slice(1, 5), [450, 0, 150, 270]);
  assert.equal(gradient[5][0][1], 'rgba(255, 218, 160, 0.06)');
  assert.equal(gradient[5][2][1], 'rgba(255, 218, 160, 0)');
});

test('atmosphere render: nighttime attenuates existing environment without new scene art', () => {
  const h = contextSpy(); drawWorkshopAmbient(h.ctx, 1);
  assert.deepEqual(h.calls.filter(c => c[0] === 'fill'), [['fill', 'multiply', 'rgba(18, 28, 52, 0.24)', 0, 0, 480, 270]]);
  assert.equal(h.calls.some(c => c[0] === 'gradient'), false);
});

test('atmosphere render: transition draws both bounded layers and restores context state', () => {
  const h = contextSpy(); drawWorkshopAmbient(h.ctx, 0.5);
  assert.deepEqual(h.calls.filter(c => c[0] === 'fill').map(c => c[1]), ['multiply', 'screen']);
  assert.equal(h.ctx.globalCompositeOperation, 'source-over');
  assert.equal(h.ctx.fillStyle, '#123456'); assert.equal(h.ctx.globalAlpha, 0.8);
  assert.equal(h.ctx.imageSmoothingEnabled, false); assert.equal(h.stack.length, 0);
});

test('atmosphere: authoritative dusk/dawn and Skip result drive presentation without changing save', () => {
  assert.equal(getWorldCycle(479).phase, 'day'); assert.equal(getWorldCycle(480).phase, 'night');
  assert.ok(advanceWorkshopNightMix(0, getWorldCycle(480).phase, 1 / 60) > 0);
  assert.ok(advanceWorkshopNightMix(1, getWorldCycle(660).phase, 1 / 60) < 1);
  const state = createInitialSaveState({ name: 'Visual', gender: 'male', hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0 });
  state.activePlaySec = 570;
  const dawn = skipNight(state, 10).state, before = JSON.stringify(dawn);
  const mix = advanceWorkshopNightMix(1, getWorldCycle(dawn.activePlaySec).phase, 1 / 60);
  assert.ok(mix < 1 && mix > 0); assert.equal(JSON.stringify(dawn), before);
});

test('atmosphere wiring: reuses latest saved phase and existing RAF, outside simulation pause', () => {
  assert.match(canvasSource, /getWorldCycle\(st\.save\.activePlaySec\)\.phase/);
  assert.match(canvasSource, /advanceWorkshopNightMix\(workshopNightMix, getWorldCycle\(st\.save\.activePlaySec\)\.phase, dt\)/);
  assert.equal((canvasSource.match(/requestAnimationFrame\(frame\)/g) ?? []).length, 2);
  assert.doesNotMatch(canvasSource, /setInterval|setTimeout|Date\.now|activePlaySec\s*(?:\+\+|\+=|=)/);
  const frame = canvasSource.slice(canvasSource.indexOf('const frame = (now: number)'));
  assert.ok(frame.indexOf('advanceWorkshopNightMix') < frame.indexOf('if (!st.paused)'));
  assert.match(canvasSource, /st\.mode === 'workshop' && st\.save/);
  assert.match(canvasSource, /nightMix: workshopNightMix \?\? undefined/);
});

test('atmosphere wiring: title keeps baseline option and grading precedes readable interactive layers', () => {
  assert.match(sceneSource, /opts\.nightMix === undefined \? null : getWorkshopAtmosphereSpec/);
  const grade = sceneSource.indexOf('if (opts.nightMix !== undefined) drawWorkshopAmbient');
  assert.ok(grade > sceneSource.indexOf('drawProceduralStations(ctx, time, equipment)'));
  assert.ok(grade < sceneSource.indexOf('// Animated Customer Character'));
  assert.ok(grade < sceneSource.indexOf('// Player Blacksmith'));
  assert.ok(grade < sceneSource.indexOf('// Corner-bracket reticle'));
  assert.match(sceneSource, /particles\.draw\(ctx\)/);
  assert.doesNotMatch(sceneSource, /ctx\.filter|imageSmoothingEnabled\s*=\s*true/);
});
