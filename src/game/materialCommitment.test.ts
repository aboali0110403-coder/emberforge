import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../data/balance';
import { MATERIALS } from '../data/materials';
import { compareMaterialCommitment } from './materialCommitment';
import {
  calculateDeliveryGoldBreakdown,
  createInitialSaveState,
  createTutorialOrder,
  createWeaponInstance,
  getMaterialSellPrice,
} from './rules';
import type { MaterialStackSelection, Order, SaveState } from '../types';

function fixture(level = 3, kind: Order['kind'] = 'standard') {
  const order: Order = {
    ...createTutorialOrder(),
    kind,
    isTutorial: false,
    baseFee: 113,
    deadlineSec: 200,
    remainingSec: 100,
    weapon: createWeaponInstance('sword', level, 'commitment_weapon'),
  };
  const save = createInitialSaveState({
    name: 'Commitment', gender: 'male', hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0,
  });
  save.inventory = { human_common: 5, human_uncommon: 5, goblin_rare: 5 };
  save.orders = [order];
  // Other kingdoms must not accidentally supply this order's tribute count.
  save.conqueredTerritories.elf = ['other_1', 'other_2', 'other_3'];
  return { order, save };
}

// Independently spell out the inspected App caller's mapping for the oracle.
function productionQuote(order: Order, save: SaveState, stacks: MaterialStackSelection[], quality = 0.85) {
  return calculateDeliveryGoldBreakdown({
    baseFee: order.baseFee,
    fulfilment: order.kind === 'royal' ? 1.15 : 1.0,
    quality,
    weaponLevel: order.weapon.level,
    stacks,
    remainingRatio: order.deadlineSec > 0 ? order.remainingSec / order.deadlineSec : 0,
    conqueredCount: save.conqueredTerritories?.[order.race]?.length ?? 0,
    isRoyal: order.kind === 'royal',
  });
}

function assertParity(order: Order, save: SaveState, stacks: MaterialStackSelection[]) {
  const result = compareMaterialCommitment(order, save, stacks);
  const selected = productionQuote(order, save, stacks);
  const zero = productionQuote(order, save, []);
  assert.deepEqual(result, {
    selectedEstimatedDeliveryFee: selected.totalGold,
    zeroMaterialEstimatedDeliveryFee: zero.totalGold,
    conditionalDeliveryFeeDifference: selected.totalGold - zero.totalGold,
    selectedMaterialUnits: stacks.reduce((sum, stack) => sum + stack.units, 0),
    currentSellBackValue: stacks.reduce(
      (sum, stack) => sum + getMaterialSellPrice(stack.materialId) * stack.units, 0,
    ),
    qualityAssumption: 0.85,
  });
  return { result, selected, zero };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

test('material commitment: empty selection has identical quotes, zero difference, units and sell-back value', () => {
  const { order, save } = fixture();
  const { result } = assertParity(order, save, []);
  assert.equal(result.selectedEstimatedDeliveryFee, result.zeroMaterialEstimatedDeliveryFee);
  assert.equal(result.conditionalDeliveryFeeDifference, 0);
  assert.equal(result.selectedMaterialUnits, 0);
  assert.equal(result.currentSellBackValue, 0);
  assert.equal(result.qualityAssumption, 0.85);
  assert.equal(Object.keys(result).length, 6);
});

for (const units of [1, 2, 3, 5]) {
  test(`material commitment: one stack with ${units} units matches production fees, subtraction and sell-back`, () => {
    const { order, save } = fixture();
    const { result } = assertParity(order, save, [{ materialId: 'human_common', units }]);
    assert.equal(result.selectedMaterialUnits, units);
    assert.equal(result.currentSellBackValue, getMaterialSellPrice('human_common') * units);
    assert.ok(result.selectedEstimatedDeliveryFee > result.zeroMaterialEstimatedDeliveryFee);
  });
}

test('material commitment: multiple stacks preserve each selected count and sell-back price', () => {
  const { order, save } = fixture();
  const stacks = [
    { materialId: 'human_common', units: 2 },
    { materialId: 'human_uncommon', units: 3 },
    { materialId: 'goblin_rare', units: 1 },
  ];
  const { result } = assertParity(order, save, stacks);
  assert.equal(result.selectedMaterialUnits, 6);
  assert.equal(result.currentSellBackValue,
    2 * getMaterialSellPrice('human_common') +
    3 * getMaterialSellPrice('human_uncommon') + getMaterialSellPrice('goblin_rare'));
});

for (const kind of ['standard', 'royal'] as const) {
  for (const level of [2, 3, 20]) {
    test(`material commitment: ${kind} incoming Lv${level} preserves production fulfilment and penalty behavior`, () => {
      const { order, save } = fixture(level, kind);
      const { result, selected, zero } = assertParity(order, save, [{ materialId: 'human_common', units: 1 }]);
      assert.equal(selected.unreinforcedApplied, false);
      assert.equal(zero.unreinforcedApplied, kind === 'standard' && level >= 3);
      assert.equal(result.qualityAssumption, 0.85);
    });
  }
}

test('material commitment: penalty boundary uses incoming Lv2 versus Lv3, not a forecast upgrade', () => {
  const low = fixture(2);
  const high = fixture(3);
  const stacks = [{ materialId: 'human_common', units: 1 }];
  const before = assertParity(low.order, low.save, stacks).result;
  const after = assertParity(high.order, high.save, stacks).result;
  assert.equal(before.selectedEstimatedDeliveryFee, after.selectedEstimatedDeliveryFee);
  assert.ok(before.zeroMaterialEstimatedDeliveryFee > after.zeroMaterialEstimatedDeliveryFee);
  assert.ok(after.conditionalDeliveryFeeDifference > before.conditionalDeliveryFeeDifference);
});

test('material commitment: royal receives existing 1.15 fulfilment and no zero-material penalty', () => {
  const standard = fixture(3);
  const royal = fixture(3, 'royal');
  const stacks = [{ materialId: 'human_common', units: 1 }];
  const a = assertParity(standard.order, standard.save, stacks).result;
  const b = assertParity(royal.order, royal.save, stacks).result;
  assert.ok(b.selectedEstimatedDeliveryFee > a.selectedEstimatedDeliveryFee);
  assert.ok(b.zeroMaterialEstimatedDeliveryFee > a.zeroMaterialEstimatedDeliveryFee);
});

for (const remainingSec of [99, 100]) {
  test(`material commitment: prompt eligibility at ${remainingSec}/200 matches the start-time ratio`, () => {
    const { order, save } = fixture();
    order.remainingSec = remainingSec;
    const { selected, zero } = assertParity(order, save, [{ materialId: 'human_common', units: 1 }]);
    assert.equal(selected.promptBonusGold > 0, remainingSec === 100);
    assert.equal(zero.promptBonusGold > 0, remainingSec === 100);
  });
}

test('material commitment: nonpositive deadline uses the actual caller fallback, without repairing the order', () => {
  const { order, save } = fixture();
  order.deadlineSec = 0;
  const before = structuredClone(order);
  const { selected } = assertParity(order, save, [{ materialId: 'human_common', units: 1 }]);
  assert.equal(selected.promptBonusGold, 0);
  assert.deepEqual(order, before);
});

test('material commitment: production grade-D prompt exclusion is separate from the fixed 85% model', () => {
  const { order, save } = fixture();
  const stacks = [{ materialId: 'human_common', units: 1 }];
  const gradeD = productionQuote(order, save, stacks, 0.44);
  const hypothetical = productionQuote(order, save, stacks, 0.85);
  assert.equal(gradeD.promptBonusGold, 0);
  assert.ok(hypothetical.promptBonusGold > 0);
  const { result } = assertParity(order, save, stacks);
  assert.equal(result.qualityAssumption, 0.85);
  assert.equal(result.selectedEstimatedDeliveryFee, hypothetical.totalGold);
  assert.notEqual(result.selectedEstimatedDeliveryFee, gradeD.totalGold);
});

for (const count of [0, 1, 3, 4]) {
  test(`material commitment: ${count} order-race territories preserve production tribute and clamp`, () => {
    const { order, save } = fixture();
    save.conqueredTerritories[order.race] = Array.from({ length: count }, (_, i) => `home_${i}`);
    const stacks = [{ materialId: 'human_common', units: 1 }];
    const { result, selected } = assertParity(order, save, stacks);
    assert.equal(selected.territoryBonusGold > 0, count > 0);
    if (count === 4) {
      const three = structuredClone(save);
      three.conqueredTerritories[order.race] = three.conqueredTerritories[order.race].slice(0, 3);
      assert.deepEqual(result, compareMaterialCommitment(order, three, stacks));
    }
  });
}

test('material commitment: absent legacy territory context follows the caller zero-count fallback', () => {
  const { order, save } = fixture();
  save.conqueredTerritories = {} as SaveState['conqueredTerritories'];
  const { selected, zero } = assertParity(order, save, [{ materialId: 'human_common', units: 1 }]);
  assert.equal(selected.territoryBonusGold, 0);
  assert.equal(zero.territoryBonusGold, 0);
  assert.deepEqual(save.conqueredTerritories, {});
});

test('material commitment: reimbursement and each rounded fee component match production exactly', () => {
  const { order, save } = fixture();
  order.baseFee = 101;
  save.conqueredTerritories[order.race] = ['first'];
  const { result, selected, zero } = assertParity(order, save, [{ materialId: 'human_common', units: 1 }]);
  assert.deepEqual(selected, {
    totalGold: 132, baseGold: 111, materialReimbursement: 4,
    promptBonusGold: 11, territoryBonusGold: 6, unreinforcedApplied: false,
  });
  assert.equal(zero.totalGold, 95);
  assert.equal(result.conditionalDeliveryFeeDifference, 37);
  assert.equal(result.currentSellBackValue, 9);
});

test('material commitment: runtime BALANCE changes reach both fee quotes and current sell-back value', () => {
  const { order, save } = fixture();
  save.conqueredTerritories[order.race] = ['first'];
  const stacks = [{ materialId: 'human_common', units: 2 }];
  const before = { ...BALANCE };
  const original = compareMaterialCommitment(order, save, stacks);
  try {
    Object.assign(BALANCE, {
      deliveryGoldBaseMult: 1.37,
      materialValueReimburseRatio: 0.27,
      unreinforcedLv3Penalty: 0.61,
      promptDeliveryBonusMult: 0.13,
      territoryBonusPerClear: 0.07,
      sellBackRatio: 0.41,
    });
    const { result } = assertParity(order, save, stacks);
    assert.notEqual(result.selectedEstimatedDeliveryFee, original.selectedEstimatedDeliveryFee);
    assert.notEqual(result.zeroMaterialEstimatedDeliveryFee, original.zeroMaterialEstimatedDeliveryFee);
    assert.notEqual(result.currentSellBackValue, original.currentSellBackValue);
    assert.equal(result.qualityAssumption, 0.85);
  } finally {
    Object.assign(BALANCE, before);
  }
  assert.deepEqual(BALANCE, before);
  assert.deepEqual(compareMaterialCommitment(order, save, stacks), original);
});

for (const [level, kind] of [[3, 'standard'], [20, 'royal']] as const) {
  test(`material commitment: frozen ${kind} Lv${level} inputs stay unchanged; no RNG, clock or storage`, () => {
    const { order, save } = fixture(level, kind);
    const stacks = [{ materialId: 'human_common', units: 2 }, { materialId: 'goblin_rare', units: 1 }];
    const snapshot = structuredClone({ order, save, stacks, materials: MATERIALS });
    freezeDeep(order);
    freezeDeep(save);
    freezeDeep(stacks);
    const oldRandom = Math.random;
    const oldNow = Date.now;
    const storageNames = ['localStorage', 'sessionStorage', 'indexedDB'] as const;
    const descriptors = storageNames.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    const rejectAccess = () => { throw new Error('Unexpected RNG, clock or storage access'); };
    let first: ReturnType<typeof compareMaterialCommitment> | undefined;
    let second: ReturnType<typeof compareMaterialCommitment> | undefined;
    try {
      Math.random = rejectAccess;
      Date.now = rejectAccess;
      for (const name of storageNames) {
        Object.defineProperty(globalThis, name, { configurable: true, get: rejectAccess, set: rejectAccess });
      }
      first = compareMaterialCommitment(order, save, stacks);
      second = compareMaterialCommitment(order, save, stacks);
    } finally {
      Math.random = oldRandom;
      Date.now = oldNow;
      storageNames.forEach((name, i) => {
        const descriptor = descriptors[i];
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      });
    }
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.deepEqual({ order, save, stacks, materials: MATERIALS }, snapshot);
  });
}

test('material commitment: does not repair selections or clamp them against inventory', () => {
  const { order, save } = fixture();
  // Selection validity belongs to the existing UI/production boundary, not this quote.
  save.inventory.human_common = 1;
  const stacks = [{ materialId: 'human_common', units: 2 }];
  const before = structuredClone({ order, save, stacks });
  const { result } = assertParity(order, save, stacks);
  assert.equal(result.selectedMaterialUnits, 2);
  assert.equal(result.currentSellBackValue, 2 * getMaterialSellPrice('human_common'));
  assert.deepEqual({ order, save, stacks }, before);
});
