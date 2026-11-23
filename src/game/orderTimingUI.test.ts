import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compareMaterialCommitment } from './materialCommitment';
import { calculateDeliveryGoldBreakdown, createInitialSaveState, createTutorialOrder, createWeaponInstance, getQualityGrade } from './rules';
import { MATERIAL_BY_ID } from '../data/materials';
import { STRINGS } from '../strings';
import { advanceOrderDeadlines } from './worldCycle';
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


function timingText(h: ReturnType<typeof harness>) {
  return text(h.find((node) => node.props['data-testid'] === 'order-timing-help'));
}
function deadlineText(h: ReturnType<typeof harness>) {
  return text(h.find((node) => node.props['data-testid'] === 'order-deadline-rule'));
}
function patienceClass(h: ReturnType<typeof harness>) {
  return String(h.find((node) => node.type === 'span' && text(node).startsWith('Patience ')).props.className);
}
function actualPrompt(order: Order, quality: number) {
  return calculateDeliveryGoldBreakdown({
    baseFee: order.baseFee, fulfilment: 1, quality,
    weaponLevel: order.weapon.level, stacks: [],
    remainingRatio: order.remainingSec / Math.max(1, order.deadlineSec),
    isRoyal: order.kind === 'royal',
  }).promptBonusGold;
}

test('timing UI: compact native disclosure defaults closed and localizes the complete explanation', () => {
  const { save } = fixture(); const h = harness(save);
  const help = h.find((node) => node.props['data-testid'] === 'order-timing-help');
  assert.equal(help.type, 'details'); assert.equal(help.props.open, undefined);
  assert.equal(text(h.find((node) => node.type === 'summary')), STRINGS.orders.timing.summary);
  assert.equal(deadlineText(h), STRINGS.orders.timing.ordinary);
  for (const key of ['pause', 'skip', 'prompt', 'warning', 'speed'] as const) {
    assert.ok(timingText(h).includes(STRINGS.orders.timing[key]));
  }
});

test('timing UI: 99/200 has no production prompt tip without a red Patience warning', () => {
  const { save, standard } = fixture(); standard.remainingSec = 99;
  const h = harness(save);
  assert.equal(actualPrompt(standard, 0.85), 0);
  assert.ok(patienceClass(h).includes('text-[#4ade80]'));
  assert.ok(!patienceClass(h).includes('text-[#f87171]'));
  assert.match(timingText(h), /99\/200, the ratio is below 50% but above 35%/);
  assertQuote(h, standard, save, []);
});

test('timing UI: 100/200 meets the production ratio condition, never a final-grade guarantee', () => {
  const { save, standard } = fixture(); const h = harness(save);
  assert.ok(actualPrompt(standard, 0.85) > 0);
  assert.match(timingText(h), /100\/200, the ratio condition is met, but the final grade still matters/);
  assert.match(timingText(h), /actual final quality grade must not be D/);
  assert.match(timingText(h), /tip is not guaranteed/);
  assertQuote(h, standard, save, []);
});

test('timing UI: actual grade D disqualifies the prompt even with all time remaining', () => {
  const { save, standard } = fixture(); standard.remainingSec = 200;
  const h = harness(save);
  assert.equal(getQualityGrade(0), 'D');
  assert.equal(actualPrompt(standard, 0), 0);
  assert.match(timingText(h), /at least 50%.*and the actual final quality grade must not be D/);
});

test('timing UI: existing red boundary remains strictly below 35%, not the prompt threshold', () => {
  const { save, standard } = fixture(); standard.remainingSec = 70;
  const h = harness(save); assert.ok(patienceClass(h).includes('text-[#4ade80]'));
  const next = { ...save, orders: [{ ...standard, remainingSec: 69 }, save.orders[1]] };
  h.render(next); assert.ok(patienceClass(h).includes('text-[#f87171]'));
  assert.match(timingText(h), /Red Patience means below 35%, a different threshold/);
});

test('timing UI: tutorial exemption matches the actual deadline helper after excessive elapsed time', () => {
  const { save } = fixture(); const tutorial = { ...createTutorialOrder(), id: 'tutorial', remainingSec: 1 };
  save.orders = [tutorial];
  const advanced = advanceOrderDeadlines(save, 1000, 10);
  assert.equal(advanced.expiredOrders.length, 0); assert.equal(advanced.orders[0].remainingSec, 60);
  const h = harness({ ...save, orders: advanced.orders });
  assert.equal(deadlineText(h), STRINGS.orders.timing.tutorial);
  assert.match(deadlineText(h), /tutorial order does not expire/);
});

test('timing UI: ordinary and Royal zero expiry explanation matches the production helper', () => {
  const { save, standard, royal } = fixture(); standard.remainingSec = 1; royal.remainingSec = 1;
  const h = harness(save); assert.equal(deadlineText(h), STRINGS.orders.timing.ordinary);
  h.order(royal.id); assert.equal(deadlineText(h), STRINGS.orders.timing.ordinary);
  assert.deepEqual(advanceOrderDeadlines(save, 1, 10).expiredOrders.map((order) => order.id), [standard.id, royal.id]);
});

test('timing UI: menu and forge pause, independent world time and Skip Night are explicit', () => {
  const h = harness(fixture().save);
  assert.match(timingText(h), /not real-world time/);
  assert.match(timingText(h), /deadlines pause in Orders, other menus and throughout forging/);
  assert.match(timingText(h), /World time may still advance/);
  assert.match(timingText(h), /Skip Night advances existing deadlines and can expire non-tutorial orders/);
});

test('timing UI: forging speed cannot preserve or improve the start-captured prompt ratio', () => {
  const h = harness(fixture().save);
  assert.match(timingText(h), /when forging starts/);
  assert.match(timingText(h), /Forging faster cannot preserve or improve the prompt-tip ratio: deadlines pause throughout forging/);
  assert.ok(!/forge faster to|hurry.*forg|real-world countdown/i.test(timingText(h)));
});

test('timing UI: order selection and same-ID context changes never retain a stale exemption or warning', () => {
  const { save, standard } = fixture();
  const tutorial = { ...createTutorialOrder(), id: 'tutorial' }; save.orders.push(tutorial);
  const h = harness(save);
  assert.equal(deadlineText(h), STRINGS.orders.timing.ordinary);
  h.order(tutorial.id); assert.equal(deadlineText(h), STRINGS.orders.timing.tutorial);
  h.order(standard.id); assert.equal(deadlineText(h), STRINGS.orders.timing.ordinary);
  const next = { ...save, orders: [{ ...standard, isTutorial: true, remainingSec: 69 }, save.orders[1], tutorial] };
  h.render(next); assert.equal(deadlineText(h), STRINGS.orders.timing.tutorial);
  assert.ok(patienceClass(h).includes('text-[#f87171]'));
  assert.match(timingText(h), /99\/200/); assert.match(timingText(h), /100\/200/);
});

test('timing UI: material comparison and exact existing Start payload stay unchanged and read-only', () => {
  const { save, standard } = fixture(); const before = JSON.stringify(save); freezeDeep(save);
  const h = harness(save); h.material('human_common', 'Add');
  const stacks = [{ materialId: 'human_common', units: 1 }]; assertQuote(h, standard, save, stacks);
  h.click((node) => node.type === 'button' && text(node).includes(STRINGS.orders.startForge));
  assert.deepEqual(h.starts, [[standard, getStepsForRequest(standard.requestFocus!, standard.targetPart), standard.targetPart, stacks]]);
  assert.equal(JSON.stringify(save), before); assert.deepEqual(h.callbacks, []);
});
