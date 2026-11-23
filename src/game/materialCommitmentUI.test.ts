import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compareMaterialCommitment } from './materialCommitment';
import { createInitialSaveState, createTutorialOrder, createWeaponInstance } from './rules';
import { MATERIAL_BY_ID } from '../data/materials';
import { STRINGS } from '../strings';
import { getStepsForRequest } from '../data/weapons';
import type { MaterialStackSelection, Order, SaveState, StationId } from '../types';

const componentUrl = new URL('../components/OrderModal.tsx', import.meta.url);
const source = readFileSync(componentUrl, 'utf8');
// esbuild is an existing devDependency. Compile the actual component, not a
// duplicate presentation. The small hook driver below is not a browser/React
// renderer; real mounted React interactions and pixels are verified separately.
const { transformSync } = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
const compiled = transformSync(source, { loader: 'tsx', format: 'cjs', target: 'es2022', jsx: 'transform' }).code;

type Node = { type: unknown; props: Record<string, any> };
function nodes(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  return [value, ...nodes(value.props.children)];
}
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value && typeof value === 'object' && 'props' in value ? text(value.props.children) : '';
}
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
function fixture() {
  const save = createInitialSaveState({
    name: 'Commitment UI', gender: 'male', hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0,
  });
  const standard: Order = {
    ...createTutorialOrder(), id: 'standard', customerName: 'Standard Lv3', isTutorial: false,
    baseFee: 113, deadlineSec: 200, remainingSec: 100,
    weapon: createWeaponInstance('sword', 3, 'ui_standard'),
  };
  const royal: Order = {
    ...standard, id: 'royal', kind: 'royal', customerName: 'Royal Lv8', requestFocus: null,
    baseFee: 401, weapon: createWeaponInstance('sword', 8, 'ui_royal'),
  };
  save.orders = [standard, royal];
  save.inventory = { human_common: 5, human_uncommon: 5, goblin_common: 5, demon_common: 5, goblin_rare: 2 };
  return { save, standard, royal };
}

function harness(initialSave: SaveState) {
  const state: any[] = [], dependencies: unknown[][] = [];
  let cursor = 0, effectCursor = 0, dirty = false;
  let effects: (() => void)[] = [];
  const quotes: { order: Order; save: SaveState; stacks: MaterialStackSelection[] }[] = [];
  const starts: [Order, StationId[], string, MaterialStackSelection[]][] = [];
  const callbacks: string[] = [];
  let currentSave = initialSave, tree: unknown;
  const react = {
    createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children } }),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (next: any) => {
        const value = typeof next === 'function' ? next(state[index]) : next;
        if (!Object.is(value, state[index])) { state[index] = value; dirty = true; }
      }];
    },
    useEffect(effect: () => void, deps: unknown[]) {
      const index = effectCursor++, previous = dependencies[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        dependencies[index] = [...deps]; effects.push(effect);
      }
    },
  };
  const actualRequire = createRequire(componentUrl);
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', compiled)((id: string) => {
    if (id === 'react') return { __esModule: true, default: react, useState: react.useState, useEffect: react.useEffect };
    if (id === './PixelThumbnail') return { MaterialSprite: 'MaterialSprite', PortraitSprite: 'PortraitSprite', WeaponSprite: 'WeaponSprite' };
    if (id === '../game/materialCommitment') return {
      compareMaterialCommitment(order: Order, save: SaveState, stacks: MaterialStackSelection[]) {
        quotes.push({ order, save, stacks });
        return compareMaterialCommitment(order, save, stacks);
      },
    };
    return actualRequire(id);
  }, module, module.exports);
  function render(save = currentSave) {
    currentSave = save;
    let passes = 0;
    do {
      assert.ok(passes++ < 10, 'existing effects must settle');
      cursor = 0; effectCursor = 0; dirty = false; effects = [];
      tree = module.exports.OrderModal({
        save, summonCooldownSec: 0,
        onClose: () => callbacks.push('close'), onSummonCustomer: () => callbacks.push('summon'),
        onStartForge: (...args: [Order, StationId[], string, MaterialStackSelection[]]) => starts.push(args),
      });
      effects.forEach((effect) => effect());
    } while (dirty);
    return tree;
  }
  function find(predicate: (node: Node) => boolean) {
    const result = nodes(tree).find(predicate); assert.ok(result, 'expected UI node'); return result;
  }
  function click(predicate: (node: Node) => boolean) {
    const button = find(predicate); assert.ok(!button.props.disabled, 'cannot click a disabled control');
    button.props.onClick(); render();
  }
  function material(materialId: string, action: 'Add' | 'Remove') {
    click((node) => node.type === 'button' && node.props['aria-label'] === `${action} ${MATERIAL_BY_ID[materialId].name}`);
  }
  function order(id: string) {
    const name = currentSave.orders.find((entry) => entry.id === id)?.customerName;
    click((node) => node.type === 'button' && !!name && text(node).includes(name));
  }
  render();
  return { render, find, click, material, order, quotes, starts, callbacks, all: () => nodes(tree) };
}
function assertQuote(h: ReturnType<typeof harness>, order: Order, save: SaveState, stacks: MaterialStackSelection[]) {
  const expected = compareMaterialCommitment(order, save, stacks);
  const value = (id: string) => text(h.find((node) => node.props['data-testid'] === id));
  assert.equal(value('commitment-selected-fee'), `${expected.selectedEstimatedDeliveryFee}g`);
  assert.equal(value('commitment-zero-fee'), `${expected.zeroMaterialEstimatedDeliveryFee}g`);
  const difference = expected.conditionalDeliveryFeeDifference;
  assert.equal(value('commitment-fee-difference'), `${difference > 0 ? '+' : ''}${difference}g`);
  assert.equal(value('commitment-units'), String(expected.selectedMaterialUnits));
  assert.equal(value('commitment-sell-back'), `${expected.currentSellBackValue}g`);
  assert.strictEqual(h.quotes.at(-1)?.order, order);
  assert.strictEqual(h.quotes.at(-1)?.save, save);
  assert.deepEqual(h.quotes.at(-1)?.stacks, stacks);
}

test('commitment UI: empty selection displays equal production quotes and all conditional explanations', () => {
  const { save, standard } = fixture(); const h = harness(save);
  assertQuote(h, standard, save, []);
  const panel = h.find((node) => node.props['data-testid'] === 'material-commitment');
  assert.match(text(panel), /Hypothetical estimates at 85% quality/);
  assert.match(text(panel), /not profit or guaranteed additional earnings/);
  assert.match(text(panel), /current alternative, not acquisition cost or net profit/);
  assert.match(text(panel), /does not reserve or consume materials/);
  assert.equal(nodes(panel).filter((node) => node.props.onClick || node.props.onChange || node.type === 'button').length, 0);
  assert.deepEqual(h.callbacks, []); assert.deepEqual(h.starts, []);
});

test('commitment UI: add, change quantity and remove all update immediately without inventory writes', () => {
  const { save, standard } = fixture(); const snapshot = structuredClone(save); freezeDeep(save);
  const h = harness(save);
  h.material('human_common', 'Add');
  assertQuote(h, standard, save, [{ materialId: 'human_common', units: 1 }]);
  h.material('human_common', 'Add'); h.material('human_uncommon', 'Add');
  assertQuote(h, standard, save, [{ materialId: 'human_common', units: 2 }, { materialId: 'human_uncommon', units: 1 }]);
  h.material('human_common', 'Remove'); h.material('human_common', 'Remove'); h.material('human_uncommon', 'Remove');
  assertQuote(h, standard, save, []);
  assert.deepEqual(save, snapshot); assert.deepEqual(h.starts, []); assert.deepEqual(h.callbacks, []);
});

test('commitment UI: ordinary order switching retains existing selection reset and shows royal context', () => {
  const { save, standard, royal } = fixture(); const h = harness(save);
  h.material('human_common', 'Add'); assertQuote(h, standard, save, [{ materialId: 'human_common', units: 1 }]);
  h.order('royal'); assertQuote(h, royal, save, []);
  h.material('human_uncommon', 'Add'); assertQuote(h, royal, save, [{ materialId: 'human_uncommon', units: 1 }]);
  h.order('standard'); assertQuote(h, standard, save, []);
});

test('commitment UI: same-ID order fee, level, ratio and race replacements never reuse a stale quote', () => {
  const { save, standard } = fixture(); const h = harness(save);
  h.material('human_common', 'Add');
  const changed: Order = { ...standard, baseFee: 501, remainingSec: 99, race: 'demon', weapon: { ...standard.weapon, level: 2 } };
  const next = { ...save, orders: [changed, save.orders[1]], conqueredTerritories: { ...save.conqueredTerritories, demon: ['one'] } };
  const snapshot = structuredClone(next); freezeDeep(next);
  h.render(next); assertQuote(h, changed, next, [{ materialId: 'human_common', units: 1 }]);
  assert.deepEqual(next, snapshot);
});

test('commitment UI: same order reference plus new conquered context recomputes both fees', () => {
  const { save, standard } = fixture(); const h = harness(save); h.material('human_common', 'Add');
  const next = { ...save, conqueredTerritories: { ...save.conqueredTerritories, human: ['one', 'two', 'three'] } };
  h.render(next); assertQuote(h, standard, next, [{ materialId: 'human_common', units: 1 }]);
});

test('commitment UI: removing the active order uses the current fallback order without stale context or new clearing', () => {
  const { save, royal } = fixture(); const h = harness(save); h.material('human_common', 'Add');
  const next = { ...save, orders: [royal] };
  h.render(next); assertQuote(h, royal, next, [{ materialId: 'human_common', units: 1 }]);
});

test('commitment UI: no active orders means no comparison and no helper call', () => {
  const { save } = fixture(); save.orders = []; const h = harness(save);
  assert.ok(!h.all().some((node) => node.props['data-testid'] === 'material-commitment'));
  assert.equal(h.quotes.length, 0); assert.deepEqual(h.starts, []);
});

test('commitment UI: quantity and distinct-stack limits and furnace availability remain unchanged', () => {
  const { save, standard } = fixture(); const h = harness(save);
  for (let i = 0; i < 5; i++) h.material('human_common', 'Add');
  assert.equal(h.find((node) => node.props['aria-label'] === `Add ${MATERIAL_BY_ID.human_common.name}`).props.disabled, true);
  h.material('human_uncommon', 'Add'); h.material('goblin_common', 'Add');
  assertQuote(h, standard, save, [
    { materialId: 'human_common', units: 5 }, { materialId: 'human_uncommon', units: 1 }, { materialId: 'goblin_common', units: 1 },
  ]);
  assert.equal(h.find((node) => node.props['aria-label'] === `Add ${MATERIAL_BY_ID.demon_common.name}`).props.disabled, true);
  assert.ok(!h.all().some((node) => node.props['aria-label'] === `Add ${MATERIAL_BY_ID.goblin_rare.name}`));
});

test('commitment UI: standard Start Forge still passes the original order, recipe, part and selected units', () => {
  const { save, standard } = fixture(); const snapshot = structuredClone(save); freezeDeep(save);
  const h = harness(save); h.material('human_common', 'Add');
  h.click((node) => node.type === 'button' && text(node) === STRINGS.orders.startForge);
  assert.equal(h.starts.length, 1); assert.strictEqual(h.starts[0][0], standard);
  assert.deepEqual(h.starts[0], [standard, getStepsForRequest(standard.requestFocus!, standard.targetPart), standard.targetPart, [{ materialId: 'human_common', units: 1 }]]);
  assert.deepEqual(save, snapshot);
});

test('commitment UI: royal part and recipe choices remain untouched by quote updates and Start Forge', () => {
  const { save, royal } = fixture(); const h = harness(save); h.order('royal');
  h.find((node) => node.props.id === 'royal-part-select').props.onChange({ target: { value: 'guard' } }); h.render();
  h.click((node) => node.type === 'button' && text(node) === '+ Workbench');
  h.material('human_common', 'Add'); assertQuote(h, royal, save, [{ materialId: 'human_common', units: 1 }]);
  assert.equal(h.find((node) => node.props.id === 'royal-part-select').props.value, 'guard');
  h.click((node) => node.type === 'button' && text(node) === STRINGS.orders.startForge);
  assert.deepEqual(h.starts, [[royal, ['furnace', 'anvil', 'grindstone', 'quench', 'workbench'], 'guard', [{ materialId: 'human_common', units: 1 }]]]);
});

test('commitment UI: empty royal recipe still disables Start Forge while informational comparison remains', () => {
  const { save, royal } = fixture(); const h = harness(save); h.order('royal');
  while (h.all().some((node) => node.props.title === 'Tap to remove step')) {
    h.click((node) => node.props.title === 'Tap to remove step');
  }
  assert.equal(h.find((node) => node.type === 'button' && text(node) === STRINGS.orders.startForge).props.disabled, true);
  assertQuote(h, royal, save, []); assert.deepEqual(h.starts, []);
});

test('commitment UI: rendering frozen snapshots consumes no RNG or clock and accesses no storage', () => {
  const { save, standard } = fixture(); const snapshot = structuredClone(save); freezeDeep(save);
  const h = harness(save); const random = Math.random, now = Date.now;
  const names = ['localStorage', 'sessionStorage', 'indexedDB'] as const;
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const reject = () => { throw new Error('Informational UI must not use RNG, clock or storage'); };
  try {
    Math.random = reject; Date.now = reject;
    names.forEach((name) => Object.defineProperty(globalThis, name, { configurable: true, get: reject, set: reject }));
    h.material('human_common', 'Add'); h.render();
    assertQuote(h, standard, save, [{ materialId: 'human_common', units: 1 }]);
  } finally {
    Math.random = random; Date.now = now;
    names.forEach((name, i) => {
      const descriptor = descriptors[i];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  assert.deepEqual(save, snapshot); assert.deepEqual(h.starts, []); assert.deepEqual(h.callbacks, []);
});

test('commitment UI: the accepted helper is the only comparison path, without duplicate fee formulas or new effects', () => {
  assert.equal((source.match(/compareMaterialCommitment\(/g) ?? []).length, 1);
  assert.ok(!source.includes('calculateDeliveryGold'));
  assert.ok(source.includes('compareMaterialCommitment(activeOrder, save, stacks)'));
  assert.equal((source.match(/useEffect\(/g) ?? []).length, 1);
});
