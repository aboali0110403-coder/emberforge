import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyForgeUpgradesToWeapon,
  canUseMaterialWithFurnace,
  createInitialSaveState,
  evaluateLevelUp,
  generateCustomerOrder,
  randInt,
  rollWeaponLevelUp,
} from './rules';
import { MATERIAL_BY_ID } from '../data/materials';
import type { MaterialStackSelection, SaveState } from '../types';

function fixture(ordersCompleted = 0): SaveState {
  const state = createInitialSaveState({
    name: 'Reachability fixture', gender: 'male',
    hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0,
  });
  state.stats.ordersCompleted = ordersCompleted;
  state.popularity.human = 200;
  return state;
}

function scriptedRng(values: number[]) {
  let calls = 0;
  return {
    next: () => {
      assert.ok(calls < values.length, 'unexpected additional RNG call');
      const value = values[calls++];
      assert.ok(value >= 0 && value < 1, 'fixture RNG must stay in [0, 1)');
      return value;
    },
    done: () => assert.equal(calls, values.length, 'RNG draws were removed or skipped'),
  };
}

function generatedAt(state: SaveState, levelDraw: number, royal = false) {
  const rng = scriptedRng(royal
    ? [0, 0.01, 0, levelDraw, 0, 0, 0]
    : [0, 0.99, 0, levelDraw, 0, 0, 0, 0, 0]);
  const order = generateCustomerOrder(state, rng.next);
  rng.done();
  assert.equal(order.kind, royal ? 'royal' : 'standard');
  return order;
}

const mastery: MaterialStackSelection[] = [{ materialId: 'human_mythic', units: 3 }];

// S3 replaces old completed-count range pins; historical source is preserved
// under sim/historical/preS3-progressionReachability.txt.
test('S3 generated order level follows Smith/material capability, not raw completed count', () => {
  for (const completed of [0,8,32,100,10000]) for (const royal of [false,true]) {
    const state = fixture(completed);
    const low = generatedAt(state,0,royal).weapon.level;
    const high = generatedAt(state,.999999,royal).weapon.level;
    assert.ok(low>=1 && high<=4, `novice range ${low}..${high}`);
  }
});
test('S3 late supported workshop retains generated level18 and existing RNG draw order', () => {
  const state=fixture(100); state.smithXp=100000;
  Object.keys(state.equipment).forEach(k => (state.equipment as any)[k]=5);
  for(const royal of [false,true]) {
    assert.equal(generatedAt(state,.999999,royal).weapon.level,18);
    assert.equal(generatedAt(state,0,royal).weapon.level,15);
  }
});
test('S3 higher completed counts saturate instead of raising novice requests without limit', () => {
  assert.equal(generatedAt(fixture(100),.74).weapon.level,generatedAt(fixture(10000),.74).weapon.level);
});
test('S3 standard and royal keep non-level RNG sequence and identity fields', () => {
  for (const royal of [false,true]) {
    const rng=scriptedRng(royal ? [0,.01,.45,.74,.4,.99,.25] : [0,.99,.45,.74,.4,.64,.99,.25,.3]);
    const order=generateCustomerOrder(fixture(100),rng.next);rng.done();
    assert.equal(order.kind,royal?'royal':'standard');assert.equal(order.weapon.type,'shield');
    assert.equal(order.scenarioName,'Bridgewatch Skirmish');assert.equal(order.portraitVariant,2);
    assert.equal(order.deadlineSec,royal?221:177);assert.equal(order.targetPart,royal?'face':'rim');
    assert.ok(order.weapon.level<=4);
  }
});

test('progression reachability: a generated 18 weapon reaches 20 with existing mastery inputs', () => {
  const state = fixture(100); state.smithXp=100000; state.equipment.furnace = 4; state.inventory.human_mythic = 3;
  const order = generatedAt(state, 0.999999);
  assert.equal(order.weapon.level, 18);
  assert.ok(canUseMaterialWithFurnace(MATERIAL_BY_ID.human_mythic, state.equipment.furnace));
  assert.ok(state.inventory.human_mythic >= mastery[0].units);
  const evaluation = evaluateLevelUp(order.weapon.level, order.weapon.type, 0.95, mastery);
  assert.equal(evaluation.canDoubleJump, true); assert.equal(evaluation.meetsStageRarity, true);
  assert.equal(evaluation.potency, 48); assert.ok(Math.abs(evaluation.preq - 23.6) < 1e-12);
  assert.ok(Math.abs(evaluation.chance - 0.6125) < 1e-12);
  const rng = scriptedRng([evaluation.chance]);
  const roll = rollWeaponLevelUp(order.weapon.level, order.weapon.type, 0.95, mastery, rng.next);
  rng.done(); assert.equal(roll.newLevel, 20); assert.equal(roll.jumpedTwo, true);
  const result = applyForgeUpgradesToWeapon(order.weapon, order.targetPart, 0.95,
    mastery, state.equipment, roll.newLevel, order.requestFocus);
  assert.equal(result.updated.level, 20); assert.equal(order.weapon.level, 18);
});

test('progression reachability: 18 requires quality, potency, rarity and a successful roll for 20', () => {
  for (const [quality, materials] of [
    [0.949999, mastery],
    [1, [{ materialId: 'human_mythic', units: 2 }]],
    [1, [{ materialId: 'human_epic', units: 5 }, { materialId: 'orc_epic', units: 5 }]],
    [1, []],
  ] as [number, MaterialStackSelection[]][]) {
    const evaluation = evaluateLevelUp(18, 'sword', quality, materials);
    assert.equal(evaluation.canDoubleJump, false);
    const rng = scriptedRng([0]);
    const result = rollWeaponLevelUp(18, 'sword', quality, materials, rng.next); rng.done();
    assert.equal(result.newLevel, 19); assert.equal(result.jumpedTwo, false);
  }
  const evaluation = evaluateLevelUp(18, 'sword', 0.95, mastery);
  const rng = scriptedRng([evaluation.chance + Number.EPSILON]);
  const failure = rollWeaponLevelUp(18, 'sword', 0.95, mastery, rng.next); rng.done();
  assert.equal(failure.newLevel, 18); assert.equal(failure.jumpedTwo, false);
});

test('progression reachability: existing 19, 20 and above-20 guards do not overshoot or add RNG', () => {
  const plentiful = [{ materialId: 'human_mythic', units: 5 }];
  for (const materials of [plentiful, []]) {
    const success = scriptedRng([0]);
    const result = rollWeaponLevelUp(19, 'sword', 1, materials, success.next); success.done();
    assert.equal(result.newLevel, 20); assert.equal(result.jumpedTwo, false);
  }
  const failure = scriptedRng([0.999999]);
  assert.equal(rollWeaponLevelUp(19, 'sword', 1, plentiful, failure.next).newLevel, 19); failure.done();
  for (const input of [20, 21, 100]) {
    const noDraws = scriptedRng([]);
    const result = rollWeaponLevelUp(input, 'sword', 1, plentiful, noDraws.next); noDraws.done();
    assert.equal(result.newLevel, 20); assert.equal(result.jumpedTwo, false);
  }
});
