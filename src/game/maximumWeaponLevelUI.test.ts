import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  createInitialSaveState,
  createTutorialOrder,
  createWeaponInstance,
  evaluateLevelUp,
  migrateSaveState,
  rollWeaponLevelUp,
} from './rules';
import type { DeliverySummary, Order, SaveState } from '../types';

// Presentation-only slice: the components are compiled and inspected through the
// same established element-tree harnesses as the other UI tests. This is not a
// mounted React/browser or pixel-layout test; mounted coverage is separate.
// rules.ts is used read-only and is not modified by this slice.

type ViewNode = { type: unknown; props: Record<string, any> };
function nodes(value: any): ViewNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === 'object' && 'props' in value
    ? [value, ...nodes(value.props.children)]
    : [];
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
// Rendering these presentations must never consume gameplay RNG, storage or timers.
function guarded(run: () => void) {
  const keys = ['window', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'requestAnimationFrame'] as const;
  const descriptors = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const random = Math.random;
  try {
    for (const key of keys) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get() {
          assert.fail(`maximum-level presentation must not access ${key}`);
        },
      });
    }
    Math.random = () => assert.fail('maximum-level presentation must not consume gameplay RNG');
    run();
  } finally {
    Math.random = random;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
}

// ---------------------------------------------------------------------------
// Production boundary truth (read-only; rules.ts unchanged by this slice)
// ---------------------------------------------------------------------------

test('production performs no Level-Up RNG roll at the level 20 cap', () => {
  const rng = () => assert.fail('maximum-level roll must not consume RNG');
  for (const level of [20, 21]) {
    const result = rollWeaponLevelUp(level, 'sword', 0.95, [], rng);
    assert.equal(result.newLevel, 20);
    assert.equal(result.jumpedTwo, false);
  }
});

test('production still performs legitimate Level-Up rolls at levels 18 and 19', () => {
  for (const level of [18, 19]) {
    const evaluation = evaluateLevelUp(level, 'sword', 0.95, []);
    assert(evaluation.chance > 0 && evaluation.chance <= 1);
    const success = rollWeaponLevelUp(level, 'sword', 0.95, [], () => 0);
    assert.equal(success.newLevel, level + 1, 'a successful roll still levels the weapon');
    const failure = rollWeaponLevelUp(level, 'sword', 0.95, [], () => 0.999999);
    assert.equal(failure.newLevel, level, 'a failed roll still keeps the level');
  }
});

// ---------------------------------------------------------------------------
// Order preview (actual OrderModal element tree through the hook-driver harness)
// ---------------------------------------------------------------------------

const orderModalUrl = new URL('../components/OrderModal.tsx', import.meta.url);
const orderModalRequire = createRequire(orderModalUrl);
const { transformSync } = orderModalRequire('esbuild') as typeof import('esbuild');
const compiledOrderModal = transformSync(readFileSync(orderModalUrl, 'utf8'), {
  loader: 'tsx',
  format: 'cjs',
  target: 'es2022',
  jsx: 'transform',
}).code;

function renderOrderModal(save: SaveState): ViewNode {
  const state: any[] = [];
  const dependencies: unknown[][] = [];
  let cursor = 0;
  let effectCursor = 0;
  let dirty = false;
  let effects: (() => void)[] = [];
  const react = {
    createElement: (type: unknown, props: any, ...children: unknown[]) => ({
      type,
      props: { ...props, children },
    }),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [
        state[index],
        (next: any) => {
          const value = typeof next === 'function' ? next(state[index]) : next;
          if (!Object.is(value, state[index])) {
            state[index] = value;
            dirty = true;
          }
        },
      ];
    },
    useEffect(effect: () => void, deps: unknown[]) {
      const index = effectCursor++;
      const previous = dependencies[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        dependencies[index] = [...deps];
        effects.push(effect);
      }
    },
  };
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', compiledOrderModal)((id: string) => {
    if (id === 'react') {
      return { __esModule: true, default: react, useState: react.useState, useEffect: react.useEffect };
    }
    if (id === './PixelThumbnail') {
      return { MaterialSprite: 'MaterialSprite', PortraitSprite: 'PortraitSprite', WeaponSprite: 'WeaponSprite' };
    }
    return orderModalRequire(id);
  }, module, module.exports);
  let passes = 0;
  let tree: unknown;
  do {
    assert.ok(passes++ < 10, 'existing effects must settle');
    cursor = 0;
    effectCursor = 0;
    dirty = false;
    effects = [];
    tree = module.exports.OrderModal({
      save,
      summonCooldownSec: 0,
      onClose: () => {},
      onSummonCustomer: () => {},
      onStartForge: () => {},
    });
    effects.forEach((effect) => effect());
  } while (dirty);
  return tree as ViewNode;
}

function saveWithIncomingOrder(level: number, uid: string): { save: SaveState; order: Order } {
  const save = createInitialSaveState({
    name: 'Max level preview',
    gender: 'male',
    hairColorIndex: 0,
    skinToneIndex: 0,
    outfitColorIndex: 0,
  });
  const order: Order = {
    ...createTutorialOrder(),
    id: uid,
    customerName: `Incoming Lv${level}`,
    isTutorial: false,
    weapon: createWeaponInstance('sword', level, uid),
  };
  save.orders = [order];
  save.inventory = { human_common: 5 };
  return { save, order };
}

for (const level of [3, 18, 19]) {
  test(`order preview keeps the legitimate Level-Up estimate for incoming level ${level}`, () => {
    const { save, order } = saveWithIncomingOrder(level, `ui_lv${level}`);
    const before = JSON.stringify(save);
    freezeDeep(save);
    let tree: ViewNode | undefined;
    guarded(() => {
      tree = renderOrderModal(save);
    });
    const content = text(tree);
    const expected = evaluateLevelUp(order.weapon.level, order.weapon.type, 0.85, []);
    assert(
      content.includes(`Est. Level-Up (85% Q): ${Math.round(expected.chance * 100)}%`),
      `level ${level} still shows its production Level-Up estimate`,
    );
    assert(!content.includes('Maximum weapon level reached'), 'no maximum-level message below the cap');
    assert.equal(JSON.stringify(save), before, 'preview rendering never mutates the save');
  });
}

test('order preview shows an explicit maximum-level explanation for an incoming level 20 weapon', () => {
  const { save } = saveWithIncomingOrder(20, 'ui_lv20');
  const before = JSON.stringify(save);
  freezeDeep(save);
  let tree: ViewNode | undefined;
  guarded(() => {
    tree = renderOrderModal(save);
  });
  const content = text(tree);
  assert(content.includes('Maximum weapon level reached (20)'), 'truthful maximum-level explanation is shown');
  assert(!content.includes('Est. Level-Up'), 'no probabilistic Level-Up estimate is shown at the cap');
  assert.doesNotMatch(content, /Level-Up[^\n]*\d+%/, 'no Level-Up percentage is presented at the cap');
  assert.equal(JSON.stringify(save), before, 'preview rendering never mutates the save');
});

test('order preview keeps the maximum-level explanation for a restored/imported level 20 weapon', () => {
  const { save } = saveWithIncomingOrder(20, 'ui_lv20_restored');
  // Round-trip through the production import/restore sanitizer, the same path a
  // loaded or imported save takes before the preview ever renders.
  const restored = migrateSaveState(JSON.parse(JSON.stringify(save)));
  assert(restored, 'production restore accepts the fixture save');
  assert.equal(restored.orders[0]?.weapon.level, 20, 'restore preserves the incoming level 20 weapon');
  const before = JSON.stringify(restored);
  freezeDeep(restored);
  let tree: ViewNode | undefined;
  guarded(() => {
    tree = renderOrderModal(restored);
  });
  const content = text(tree);
  assert(content.includes('Maximum weapon level reached (20)'));
  assert(!content.includes('Est. Level-Up'), 'restored level 20 weapon gets no Level-Up estimate');
  assert.equal(JSON.stringify(restored), before, 'preview rendering never mutates the restored save');
});

// ---------------------------------------------------------------------------
// Delivery receipt (actual DeliveryModal element tree, established stub pattern)
// ---------------------------------------------------------------------------

const receiptUrl = new URL('../components/ForgingOverlay.tsx', import.meta.url);
const receiptRequire = createRequire(receiptUrl);
const { transformSync: transformReceipt } = receiptRequire('esbuild') as typeof import('esbuild');
const compiledReceipt = transformReceipt(readFileSync(receiptUrl, 'utf8'), {
  loader: 'tsx',
  format: 'cjs',
  target: 'es2022',
  jsx: 'transform',
}).code;
const receiptReact = {
  createElement: (type: unknown, props: any, ...children: unknown[]) => ({
    type,
    props: { ...props, children },
  }),
  useEffect: () => {},
  useRef: () => {
    throw new Error('Unexpected receipt ref');
  },
  useState: () => {
    throw new Error('Unexpected receipt state');
  },
};
const receiptModule = { exports: {} as Record<string, any> };
new Function('require', 'module', 'exports', compiledReceipt)((id: string) => {
  if (id === 'react') return { __esModule: true, default: receiptReact, ...receiptReact };
  if (id === '../audio/soundEngine') return { soundEngine: {} };
  if (id === './PixelThumbnail') return { MaterialSprite: 'MaterialSprite' };
  return receiptRequire(id);
}, receiptModule, receiptModule.exports);
const DeliveryModal = receiptModule.exports.DeliveryModal as (props: {
  summary: DeliverySummary;
  notification?: unknown;
  onConfirm: () => void;
}) => ViewNode;

function receiptFixture(overrides: Partial<DeliverySummary> = {}): DeliverySummary {
  return {
    order: createTutorialOrder(),
    quality: 0.85,
    qualityGrade: 'A',
    masterworkTrait: null,
    fulfilment: 1,
    goldEarned: 127,
    promptBonusGold: 11,
    reputationPenalty: 0,
    xpEarned: 78,
    smithLevelBefore: 3,
    smithLevelAfter: 3,
    oldLevel: 3,
    newLevel: 3,
    levelUpChance: 0.22,
    leveledUp: false,
    statDeltas: { power: 2, edge: 3, balance: 4, durability: 5, arcane: 0 },
    selectedMaterials: [{ materialId: 'human_common', units: 1 }],
    legendaryMilestone: null,
    newAchievements: [],
    ...overrides,
  };
}

const receiptVariants: [string, Partial<DeliverySummary>][] = [
  ['ordinary level 3', {}],
  ['level 18 without level-up', { oldLevel: 18, newLevel: 18, levelUpChance: 0.3 }],
  ['level 19 to 20 level-up', { oldLevel: 19, newLevel: 20, levelUpChance: 0.3, leveledUp: true }],
];

for (const [name, overrides] of receiptVariants) {
  test(`receipt keeps the legitimate Level-Up roll presentation: ${name}`, () => {
    const summary = freezeDeep(receiptFixture(overrides));
    const before = JSON.stringify(summary);
    let confirmations = 0;
    const onConfirm = () => {
      confirmations++;
    };
    let tree: ViewNode | undefined;
    guarded(() => {
      tree = DeliveryModal({ summary, onConfirm });
    });
    const all = nodes(tree);
    const content = text(tree);
    assert(
      content.includes(`Level-Up Roll: ${Math.round(summary.levelUpChance * 100)}%`),
      `incoming level ${summary.oldLevel} still shows the actual roll probability`,
    );
    assert(!content.includes('Level-Up: Maximum level'), 'no maximum-level wording below the cap');
    assert.equal(content.includes('(UP from Lv 19!)'), summary.leveledUp, 'existing level-up marker unchanged');
    const buttons = all.filter((node) => node.type === 'button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.onClick, onConfirm, 'existing callback passed through without a new handler');
    assert.equal(confirmations, 0);
    buttons[0].props.onClick();
    assert.equal(confirmations, 1);
    assert.equal(JSON.stringify(summary), before, 'receipt rendering never mutates the summary');
  });
}

for (const oldLevel of [20, 21]) {
  test(`receipt shows a truthful maximum-level outcome for incoming level ${oldLevel}`, () => {
    const summary = freezeDeep(
      receiptFixture({ oldLevel, newLevel: 20, levelUpChance: 0.22, leveledUp: false }),
    );
    const before = JSON.stringify(summary);
    let confirmations = 0;
    const onConfirm = () => {
      confirmations++;
    };
    let tree: ViewNode | undefined;
    guarded(() => {
      tree = DeliveryModal({ summary, onConfirm });
    });
    const all = nodes(tree);
    const content = text(tree);
    assert(content.includes('Level-Up: Maximum level (20)'), 'truthful maximum-level outcome is shown');
    assert(!content.includes('Level-Up Roll:'), 'no Level-Up probability is presented at the cap');
    assert.doesNotMatch(content, /Level-Up[^\n]*\d+%/, 'no Level-Up percentage survives at the cap');
    assert(!content.includes('UP from Lv'), 'no level increase is implied at the cap');
    assert(content.includes(`Level 20`), 'the actual weapon level remains visible');
    assert(
      content.includes(`Forging Quality: ${Math.round(summary.quality * 100)}%`),
      'the rest of the receipt summary is unchanged',
    );
    const buttons = all.filter((node) => node.type === 'button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.onClick, onConfirm, 'existing callback passed through without a new handler');
    assert.equal(confirmations, 0);
    buttons[0].props.onClick();
    assert.equal(confirmations, 1);
    assert.equal(JSON.stringify(summary), before, 'receipt rendering never mutates the summary');
  });
}
