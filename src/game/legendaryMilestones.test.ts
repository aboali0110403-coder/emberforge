import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLegendaryMilestone, createWeaponInstance } from './rules';

function weaponAt(level: number, history: number[] = []) {
  const weapon = createWeaponInstance('sword', level, 'milestone-fixture');
  // Assign directly so invalid/fractional inputs test the selector, not a factory guard.
  weapon.level = level;
  weapon.legendaryNotifiedLevels = history;
  return weapon;
}

for (const [level, expected] of [
  [9, null], [10, 10], [14, 10], [15, 15], [19, 15], [20, 20], [21, 20],
] as const) {
  test(`legendary milestone: empty history at level ${level} selects ${expected}`, () => {
    assert.equal(checkLegendaryMilestone(weaponAt(level)), expected);
  });
}

test('legendary milestone: selected tier already recorded never falls back', () => {
  for (const [level, history] of [
    [10, [10]], [14, [10]], [15, [15]], [17, [15]], [19, [15]],
    [20, [20]], [100, [20]], [20, [10, 20]], [17, [10, 15]],
  ] as [number, number[]][]) {
    assert.equal(checkLegendaryMilestone(weaponAt(level, history)), null);
  }
});

test('legendary milestone: any higher recognized tier suppresses the current tier', () => {
  for (const [level, history] of [
    [10, [15]], [10, [20]], [14, [20]], [15, [20]], [17, [20]], [19, [20]],
    [10, [20, 10]], [17, [20, 10]],
  ] as [number, number[]][]) {
    assert.equal(checkLegendaryMilestone(weaponAt(level, history)), null);
  }
});

test('legendary milestone: lower recorded tiers do not suppress a higher current tier', () => {
  for (const [level, history, expected] of [
    [15, [10], 15], [17, [10], 15], [19, [10], 15],
    [20, [10], 20], [20, [15], 20], [20, [15, 10], 20], [100, [10, 15], 20],
  ] as [number, number[], number][]) {
    assert.equal(checkLegendaryMilestone(weaponAt(level, history)), expected);
  }
});

test('legendary milestone: mixed unsorted history uses recognized selected-or-higher entries only', () => {
  for (const [level, history, expected] of [
    [17, [99, 10, 15.5, -2], 15], [20, [15, 99, 10, 10], 20],
    [17, [99, 20, -2, 10], null], [10, [99, 15, 10.5], null],
    [20, [10, 20, 15, -1], null], [17, [15, 10, 15, 99], null],
  ] as [number, number[], number | null][]) {
    assert.equal(checkLegendaryMilestone(weaponAt(level, history)), expected);
  }
});

test('legendary milestone: unknown duplicate fractional and unusual finite history is preserved verbatim', () => {
  const histories = [
    [99, -1, 10.5, 19.999, 20.5, 99, -0, Number.MIN_VALUE, Number.MAX_VALUE],
    [20, 10.5, 15, 20, -100, 10, 15],
    [15.000001, 10, 10, 9.999999, -Number.MAX_VALUE],
  ];
  for (const history of histories) {
    for (const level of [9, 10, 17, 20]) {
      const entries = [...history];
      const weapon = weaponAt(level, history);
      const before = structuredClone(weapon);
      Object.freeze(history); Object.freeze(weapon);
      const selected = checkLegendaryMilestone(weapon);
      assert.equal(checkLegendaryMilestone(weapon), selected);
      assert.strictEqual(weapon.legendaryNotifiedLevels, history);
      assert.deepEqual(history, entries);
      assert.deepEqual(weapon, before);
    }
  }
});

test('legendary milestone: unknown tiers above the current level do not suppress recognized tiers', () => {
  const history = [11, 14, 16, 19, 21, 99, 10.5, 15.5, 20.5];
  for (const [level, expected] of [[10, 10], [17, 15], [20, 20]]) {
    assert.equal(checkLegendaryMilestone(weaponAt(level, history)), expected);
  }
});

test('legendary milestone: all levels below ten select nothing regardless of history', () => {
  for (const level of [-Number.MAX_VALUE, -10, -0, 0, 1, 9, 9.999999]) {
    for (const history of [[], [10], [20], [99, -1, 10.5]]) {
      assert.equal(checkLegendaryMilestone(weaponAt(level, history)), null);
    }
  }
});

test('legendary milestone: finite fractional levels retain threshold comparisons without rounding', () => {
  for (const [level, expected] of [[10.1, 10], [14.999999, 10], [15.1, 15], [19.999999, 15], [20.1, 20]]) {
    assert.equal(checkLegendaryMilestone(weaponAt(level)), expected);
  }
});

test('legendary milestone: NaN and negative infinity preserve existing null behavior', () => {
  for (const level of [NaN, -Infinity]) {
    for (const history of [[], [10], [15], [20], [10, 15, 20], [99, 10.5]]) {
      assert.equal(checkLegendaryMilestone(weaponAt(level, history)), null);
    }
  }
});

test('legendary milestone: positive infinity preserves existing first-unrecorded behavior', () => {
  // Compatibility exception for invalid non-finite levels, not finite-tier catch-up.
  for (const [history, expected] of [
    [[], 10], [[10], 15], [[10, 15], 20], [[10, 15, 20], null],
    [[20], 10], [[15], 10], [[20, 10], 15], [[99, 10.5, 20], 10],
  ] as [number[], number | null][]) {
    const before = [...history];
    assert.equal(checkLegendaryMilestone(weaponAt(Infinity, history)), expected);
    assert.deepEqual(history, before);
  }
});
