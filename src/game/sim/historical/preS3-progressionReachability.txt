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

for (const [completed, min, max] of [
  [0, 1, 2], [1, 1, 2], [2, 1, 3], [7, 1, 4],
  [8, 1, 5], [16, 3, 7], [32, 8, 12], [48, 13, 17],
] as const) {
  test(`progression generation: ${completed} completed orders retains ${min}..${max}`, () => {
    for (const royal of [false, true]) {
      const state = fixture(completed);
      assert.equal(generatedAt(state, 0, royal).weapon.level, min);
      assert.equal(generatedAt(state, 0.999999, royal).weapon.level, max);
    }
  });
}

test('progression generation: equipment average, Smith level and rounding remain active', () => {
  const oneTool = fixture(); oneTool.equipment.furnace = 2;
  assert.equal(generatedAt(oneTool, 0.999999).weapon.level, 2);
  oneTool.equipment.hammer = 2;
  assert.equal(generatedAt(oneTool, 0.999999).weapon.level, 3);

  const smith = fixture(); smith.smithXp = 221;
  assert.equal(generatedAt(smith, 0.999999).weapon.level, 2);
  smith.smithXp = 222;
  assert.equal(generatedAt(smith, 0.999999).weapon.level, 3);

  const half = fixture();
  half.equipment.furnace = 2; half.equipment.hammer = 2; half.equipment.anvil = 2;
  half.smithXp = 100;
  assert.equal(generatedAt(half, 0.999999).weapon.level, 4);
  half.smithXp = 99;
  assert.equal(generatedAt(half, 0.999999).weapon.level, 3);

  const threshold = fixture(44);
  threshold.equipment.furnace = 2; threshold.equipment.hammer = 2; threshold.equipment.anvil = 2;
  assert.equal(generatedAt(threshold, 0.999999).weapon.level, 17);
  threshold.stats.ordersCompleted = 45;
  assert.equal(generatedAt(threshold, 0.999999).weapon.level, 18);
});

test('progression generation: terminal range has five existing inclusive RNG buckets, 14..18', () => {
  const samples = [
    [0, 14], [0.199999, 14], [0.2, 15], [0.399999, 15],
    [0.4, 16], [0.599999, 16], [0.6, 17], [0.799999, 17],
    [0.8, 18], [0.999999, 18],
  ];
  for (const completed of [49, 100, 10000]) {
    for (const royal of [false, true]) {
      const state = fixture(completed);
      const seen = new Set<number>();
      for (const [draw, expected] of samples) {
        const level = generatedAt(state, draw, royal).weapon.level;
        assert.equal(level, expected); assert.ok(level >= 14 && level <= 18); seen.add(level);
      }
      assert.deepEqual([...seen], [14, 15, 16, 17, 18]);
    }
  }
});

test('progression generation: valid near-one RNG values stay within each selected maximum', () => {
  for (const [completed, maximum] of [[0, 2], [2, 3], [8, 5], [16, 7], [32, 12], [48, 17], [100, 18]]) {
    for (const royal of [false, true]) {
      for (const draw of [1 - Number.EPSILON, 1 - Number.EPSILON / 2]) {
        assert.equal(generatedAt(fixture(completed), draw, royal).weapon.level, maximum);
      }
    }
  }
});

test('progression generation: full interval defensively bounds a negative level draw without redrawing', () => {
  // A negative draw is outside Math.random's contract. This defensive probe
  // distinguishes the approved full clamp from an upper-only bound.
  for (const [completed, minimum, maximum] of [[0, 1, 2], [16, 3, 7], [100, 14, 18]]) {
    assert.ok(randInt(minimum, maximum, () => -0.25) < minimum);
    for (const royal of [false, true]) {
      const rng = scriptedRng(royal
        ? [0, 0.01, 0, 0, 0, 0, 0]
        : [0, 0.99, 0, 0, 0, 0, 0, 0, 0]);
      let position = 0;
      const order = generateCustomerOrder(fixture(completed), () => {
        const draw = rng.next();
        position += 1;
        return position === 4 ? -0.25 : draw;
      });
      rng.done();
      assert.equal(order.kind, royal ? 'royal' : 'standard');
      assert.equal(order.weapon.level, minimum);
      assert.equal(position, royal ? 7 : 9);
    }
  }
});

test('progression generation: standard, Royal and non-Renowned RNG call order is unchanged', () => {
  for (const royal of [false, true]) {
    const rng = scriptedRng(royal
      ? [0, 0.01, 0.45, 0.74, 0.4, 0.99, 0.25]
      : [0, 0.99, 0.45, 0.74, 0.4, 0.64, 0.99, 0.25, 0.3]);
    const order = generateCustomerOrder(fixture(100), rng.next); rng.done();
    assert.equal(order.kind, royal ? 'royal' : 'standard');
    assert.equal(order.weapon.type, 'shield'); assert.equal(order.weapon.level, 17);
    assert.equal(order.scenarioName, 'Bridgewatch Skirmish'); assert.equal(order.portraitVariant, 2);
    assert.equal(order.deadlineSec, royal ? 221 : 177);
    assert.equal(order.customerName, royal ? 'Royal Envoy of Aldermere' : 'Alden Marsh');
    assert.equal(order.targetPart, royal ? 'face' : 'rim');
  }
  const state = fixture(100); state.popularity.human = 0;
  const rng = scriptedRng([0, 0.45, 0.74, 0.4, 0.64, 0.99, 0.25, 0.3]);
  const order = generateCustomerOrder(state, rng.next); rng.done();
  assert.equal(order.kind, 'standard'); assert.equal(order.weapon.type, 'shield');
  assert.equal(order.weapon.level, 17); assert.equal(order.customerName, 'Alden Marsh');
  assert.equal(order.scenarioName, 'Bridgewatch Skirmish'); assert.equal(order.portraitVariant, 2);
  assert.equal(order.deadlineSec, 177); assert.equal(order.targetPart, 'rim');
});

test('progression reachability: a generated 18 weapon reaches 20 with existing mastery inputs', () => {
  const state = fixture(100); state.equipment.furnace = 4; state.inventory.human_mythic = 3;
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
