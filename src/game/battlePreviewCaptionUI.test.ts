import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compareMaterialCommitment } from './materialCommitment';
import { applyForgeUpgradesToWeapon, createInitialSaveState, createTutorialOrder, createWeaponInstance, evaluateBattlePreview } from './rules';
import { MATERIAL_BY_ID } from '../data/materials';
import { STRINGS } from '../strings';
import { getSmithProgress } from '../data/config';
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
  const upgrades: Parameters<typeof applyForgeUpgradesToWeapon>[] = [];
  const battles: { input: Parameters<typeof evaluateBattlePreview>[0]; output: ReturnType<typeof evaluateBattlePreview> }[] = [];
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
    if (id === '../game/rules') {
      const actual = actualRequire(id);
      return { ...actual,
        applyForgeUpgradesToWeapon(...args: Parameters<typeof applyForgeUpgradesToWeapon>) {
          upgrades.push(args); return actual.applyForgeUpgradesToWeapon(...args);
        },
        evaluateBattlePreview(input: Parameters<typeof evaluateBattlePreview>[0]) {
          const output = actual.evaluateBattlePreview(input); battles.push({ input, output }); return output;
        },
      };
    }
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
  return { render, find, click, material, order, quotes, starts, callbacks, upgrades, battles, all: () => nodes(tree) };
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


function previewNode(h: ReturnType<typeof harness>) {
  return h.find((node) => node.type === 'div' && text(node).startsWith('Est. Win Odds:'));
}
function assertPreview(h: ReturnType<typeof harness>, order: Order, save: SaveState, stacks: MaterialStackSelection[], part = order.targetPart) {
  const upgradeArgs = [order.weapon, part, 0.85, stacks, save.equipment, order.weapon.level, order.requestFocus];
  assert.deepEqual(h.upgrades.at(-1), upgradeArgs);
  const upgraded = applyForgeUpgradesToWeapon(order.weapon, part, 0.85, stacks, save.equipment, order.weapon.level, order.requestFocus);
  const expected = {
    weapon: upgraded.updated, race: order.race, scenarioName: order.scenarioName,
    scenarioDifficulty: order.scenarioDifficulty, enemyArchetype: order.enemyArchetype,
    smithLevel: getSmithProgress(save.smithXp).level, quality: 0.85,
  };
  assert.deepEqual(h.battles.at(-1)?.input, expected);
  const result = evaluateBattlePreview(expected);
  assert.deepEqual(h.battles.at(-1)?.output, result);
  assert.equal(text(previewNode(h)), `Est. Win Odds: ${result.winChancePct}% (${result.matchupLabel})`);
  assert.equal(text(h.find((node) => node.props['data-testid'] === 'battle-preview-assumptions')), STRINGS.orders.battlePreviewAssumptions);
  assertQuote(h, order, save, stacks);
}

test('battle caption UI: actual caption follows the existing preview in standard, Royal and tutorial contexts', () => {
  const { save, standard, royal } = fixture(); const tutorial = { ...createTutorialOrder(), id: 'tutorial' };
  save.orders.push(tutorial); const h = harness(save);
  for (const order of [standard, royal, tutorial]) {
    h.order(order.id); assertPreview(h, order, save, []);
    const all = h.all(); const odds = all.indexOf(previewNode(h));
    const caption = all.findIndex((node) => node.props['data-testid'] === 'battle-preview-assumptions');
    assert.equal(caption, odds + 1, 'caption is immediately after the existing estimate header');
    assert.equal(all.filter((node) => node.props['data-testid'] === 'battle-preview-assumptions').length, 1);
  }
});

test('battle caption UI: no orders means no estimate, caption or model call', () => {
  const { save } = fixture(); save.orders = []; const h = harness(save);
  assert.ok(!h.all().some((node) => node.props['data-testid'] === 'battle-preview-assumptions'));
  assert.ok(!h.all().some((node) => node.type === 'div' && text(node).startsWith('Est. Win Odds:')));
  assert.deepEqual(h.battles, []); assert.deepEqual(h.upgrades, []); assert.deepEqual(h.quotes, []);
});

test('battle caption UI: rendered localized copy states every conditional assumption without advice', () => {
  const h = harness(fixture().save);
  const caption = text(h.find((node) => node.props['data-testid'] === 'battle-preview-assumptions'));
  assert.match(caption, /hypothetical 85% quality/);
  assert.match(caption, /selected materials and current equipment/);
  assert.match(caption, /no weapon-level gain from this delivery/);
  assert.match(caption, /current Smith level before delivery XP/);
  assert.match(caption, /odds may be higher or lower/);
  assert.match(caption, /victory is not guaranteed/);
  assert.ok(!/best|recommended|always higher|always lower|reserved/i.test(caption));
});

test('battle caption UI: add, quantity, mixed and remove transitions retain the exact production preview inputs/results', () => {
  const { save, standard } = fixture(); const h = harness(save); assertPreview(h, standard, save, []);
  h.material('human_common', 'Add'); assertPreview(h, standard, save, [{ materialId: 'human_common', units: 1 }]);
  h.material('human_common', 'Add'); assertPreview(h, standard, save, [{ materialId: 'human_common', units: 2 }]);
  h.material('demon_common', 'Add'); assertPreview(h, standard, save, [{ materialId: 'human_common', units: 2 }, { materialId: 'demon_common', units: 1 }]);
  h.material('demon_common', 'Remove'); h.material('human_common', 'Remove'); h.material('human_common', 'Remove');
  assertPreview(h, standard, save, []);
});

test('battle caption UI: switching orders preserves the existing selection reset and Royal context', () => {
  const { save, standard, royal } = fixture(); const h = harness(save);
  h.material('human_common', 'Add'); assertPreview(h, standard, save, [{ materialId: 'human_common', units: 1 }]);
  h.order(royal.id); assertPreview(h, royal, save, []);
  h.material('human_uncommon', 'Add'); assertPreview(h, royal, save, [{ materialId: 'human_uncommon', units: 1 }]);
  h.order(standard.id); assertPreview(h, standard, save, []);
});

test('battle caption UI: same-ID order and scenario replacement uses current inputs without stale values', () => {
  const { save, standard } = fixture(); const h = harness(save); h.material('human_common', 'Add');
  const replacement: Order = { ...standard, race: 'demon', baseFee: 211, remainingSec: 99,
    weapon: createWeaponInstance('sword', 6, 'same_id'), scenarioDifficulty: 170, enemyArchetype: 'armored' };
  const next = { ...save, orders: [replacement, save.orders[1]] }; h.render(next);
  assertPreview(h, replacement, next, [{ materialId: 'human_common', units: 1 }]);
});

test('battle caption UI: equipment and Smith-XP context changes use only the existing production dependencies', () => {
  const { save, standard } = fixture(); const h = harness(save); h.material('human_common', 'Add');
  const next = { ...save, smithXp: save.smithXp + 10000, equipment: { ...save.equipment, hammer: save.equipment.hammer + 1 } };
  h.render(next); assertPreview(h, standard, next, [{ materialId: 'human_common', units: 1 }]);
  assert.equal(h.battles.at(-1)?.input.smithLevel, getSmithProgress(next.smithXp).level);
});

test('battle caption UI: fee-only territory/gold/time changes do not become new battle inputs', () => {
  const { save, standard } = fixture(); const h = harness(save); const previous = h.battles.at(-1)?.input;
  const next = { ...save, gold: save.gold + 100, activePlaySec: save.activePlaySec + 3,
    conqueredTerritories: { ...save.conqueredTerritories, human: ['Border Bandit Ambush'] } };
  h.render(next); assertPreview(h, standard, next, []); assert.deepEqual(h.battles.at(-1)?.input, previous);
});

test('battle caption UI: standard Start keeps exact order, recipe, part and selected units', () => {
  const { save, standard } = fixture(); const h = harness(save); h.material('human_common', 'Add');
  const stacks = [{ materialId: 'human_common', units: 1 }]; assertPreview(h, standard, save, stacks);
  h.click((node) => node.type === 'button' && text(node).includes(STRINGS.orders.startForge));
  assert.deepEqual(h.starts, [[standard, getStepsForRequest(standard.requestFocus!, standard.targetPart), standard.targetPart, stacks]]);
});

test('battle caption UI: Royal part and recipe changes retain exact preview and Start behavior', () => {
  const { save, royal } = fixture(); const h = harness(save); h.order(royal.id);
  h.find((node) => node.props.id === 'royal-part-select').props.onChange({ target: { value: 'guard' } }); h.render();
  h.click((node) => node.type === 'button' && text(node) === `+ ${STRINGS.stations.workbench.title}`);
  h.material('human_common', 'Add'); const stacks = [{ materialId: 'human_common', units: 1 }];
  assertPreview(h, royal, save, stacks, 'guard');
  h.click((node) => node.type === 'button' && text(node).includes(STRINGS.orders.startForge));
  assert.deepEqual(h.starts, [[royal, ['furnace', 'anvil', 'grindstone', 'quench', 'workbench'], 'guard', stacks]]);
});

test('battle caption UI: accepted timing help and material panel remain present without new side effects', () => {
  const { save, standard } = fixture(); const before = JSON.stringify(save); freezeDeep(save);
  const random = Math.random, now = Date.now, interval = globalThis.setInterval;
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Math.random = () => { throw new Error('unexpected RNG'); };
  Date.now = () => { throw new Error('unexpected clock'); };
  globalThis.setInterval = (() => { throw new Error('unexpected interval'); }) as typeof globalThis.setInterval;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('unexpected storage'); } });
  try {
    const h = harness(save); assertPreview(h, standard, save, []);
    const help = h.find((node) => node.props['data-testid'] === 'order-timing-help');
    assert.equal(help.type, 'details'); assert.equal(help.props.open, undefined);
    assert.ok(text(help).includes(STRINGS.orders.timing.speed));
    assert.equal(JSON.stringify(save), before); assert.deepEqual(h.starts, []); assert.deepEqual(h.callbacks, []);
  } finally {
    Math.random = random; Date.now = now; globalThis.setInterval = interval;
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete (globalThis as any).localStorage;
  }
});
