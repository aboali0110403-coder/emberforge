import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { createInitialSaveState, createTutorialOrder } from './rules';
import { STRINGS } from '../strings';
import type { DeliverySummary } from '../types';

const componentUrl = new URL('../components/ForgingOverlay.tsx', import.meta.url);
const source = readFileSync(componentUrl, 'utf8');
const { transformSync } = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
const compiled = transformSync(source, { loader: 'tsx', format: 'cjs', target: 'es2022', jsx: 'transform' }).code;
type Node = { type: unknown; props: Record<string, any> };
function nodes(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === 'object' && 'props' in value
    ? [value, ...nodes(value.props.children)] : [];
}
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value && typeof value === 'object' && 'props' in value ? text(value.props.children) : '';
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value); }
  return value;
}
// Compile the actual receipt and inspect its real element props/callback. This
// small hook driver is not a mounted React/browser or pixel-layout test.
const react = {
  createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children } }),
  useEffect: () => {},
  useRef: () => { throw new Error('Unexpected receipt ref'); },
  useState: () => { throw new Error('Unexpected receipt state'); },
};
const actualRequire = createRequire(componentUrl);
const module = { exports: {} as Record<string, any> };
new Function('require', 'module', 'exports', compiled)((id: string) => {
  if (id === 'react') return { __esModule: true, default: react, ...react };
  if (id === '../audio/soundEngine') return { soundEngine: {} };
  if (id === './PixelThumbnail') return { MaterialSprite: 'MaterialSprite' };
  return actualRequire(id);
}, module, module.exports);
const DeliveryModal = module.exports.DeliveryModal as (props: { summary: DeliverySummary; notification?: unknown; onConfirm: () => void }) => Node;
function fixture(overrides: Partial<DeliverySummary> = {}): DeliverySummary {
  return {
    order: createTutorialOrder(), quality: 0.85, qualityGrade: 'A', masterworkTrait: null,
    fulfilment: 1, goldEarned: 127, promptBonusGold: 11, reputationPenalty: 0,
    xpEarned: 78, smithLevelBefore: 3, smithLevelAfter: 3, oldLevel: 3, newLevel: 3,
    levelUpChance: 0.22, leveledUp: false,
    statDeltas: { power: 2, edge: 3, balance: 4, durability: 5, arcane: 0 },
    selectedMaterials: [{ materialId: 'human_common', units: 1 }],
    legendaryMilestone: null, newAchievements: [], ...overrides,
  };
}
const tutorial = createTutorialOrder();
const variants: [string, Partial<DeliverySummary>][] = [
  ['ordinary A', { order: { ...tutorial, isTutorial: false, kind: 'standard' } }],
  ['Royal S, milestone, achievement and Smith level', {
    order: { ...tutorial, isTutorial: false, kind: 'royal' }, quality: 1, qualityGrade: 'S',
    smithLevelAfter: 4, oldLevel: 9, newLevel: 10, leveledUp: true,
    masterworkTrait: 'Keen', legendaryMilestone: 10, newAchievements: ['first_forge'],
    statDeltas: { power: 8, edge: 7, balance: 6, durability: 5, arcane: 4 },
  }],
  ['tutorial B without tip', { qualityGrade: 'B', quality: 0.7, promptBonusGold: 0 }],
  ['ordinary C', { order: { ...tutorial, isTutorial: false }, qualityGrade: 'C', quality: 0.5 }],
  ['D with reputation penalty and no materials', {
    qualityGrade: 'D', quality: 0.2, promptBonusGold: 0, reputationPenalty: -2, selectedMaterials: [],
  }],
];
for (const [name, overrides] of variants) {
  test(`actual receipt acknowledgement preserves summary and one confirmation: ${name}`, () => {
    const summary = freezeDeep(fixture(overrides));
    const before = JSON.stringify(summary);
    let confirmations = 0;
    const onConfirm = () => { confirmations++; };
    const tree = DeliveryModal({ summary, onConfirm });
    const all = nodes(tree), content = text(tree);
    const buttons = all.filter(n => n.type === 'button');
    assert.equal(buttons.length, 1);
    const button = buttons[0];
    assert.equal(text(button), 'Continue');
    assert.equal(button.props.onClick, onConfirm, 'existing callback passed through without a new handler');
    const acknowledgement = all.find(n => n.type === 'p' && text(n) === STRINGS.delivery.acknowledgement);
    assert(acknowledgement, 'acknowledgement is a normal visible paragraph');
    assert.equal(STRINGS.delivery.acknowledgement, 'Delivery complete. The delivery fee and Smith XP have already been applied.');
    assert(!acknowledgement.props.hidden && acknowledgement.props['aria-hidden'] !== true);
    assert(!/\b(hidden|invisible|sr-only)\b/.test(acknowledgement.props.className));
    assert(content.includes(`+${summary.goldEarned}g`));
    assert(content.includes(`+${summary.xpEarned} Smith XP`));
    assert(content.includes(`Grade ${summary.qualityGrade}`));
    assert(content.includes(`Forging Quality: ${Math.round(summary.quality * 100)}%`));
    assert(content.includes(`Level-Up Roll: ${Math.round(summary.levelUpChance * 100)}%`));
    for (const [stat, label] of [['power', 'PWR'], ['edge', 'EDGE'], ['balance', 'BAL'], ['durability', 'DUR']] as const) {
      assert(content.includes(`${label} +${summary.statDeltas[stat]}`));
    }
    assert.equal(content.includes('ARC +'), summary.statDeltas.arcane > 0);
    assert.equal(content.includes('Prompt Tip'), summary.promptBonusGold > 0);
    assert.equal(content.includes('Flawed Work'), summary.reputationPenalty < 0);
    assert.equal(content.includes('→ Smith Lv'), summary.smithLevelAfter > summary.smithLevelBefore);
    if (summary.promptBonusGold > 0) assert(content.includes(`Prompt Tip +${summary.promptBonusGold}g`));
    if (summary.reputationPenalty < 0) assert(content.includes(`Flawed Work: ${summary.reputationPenalty} Rep`));
    assert.doesNotMatch(content, /Collect .*Return to Forge|durably saved|save succeeded|saving succeeded|all rewards.*claimed/i);
    assert.equal(confirmations, 0);
    button.props.onClick();
    assert.equal(confirmations, 1);
    assert.equal(JSON.stringify(summary), before, 'receipt and acknowledgement never mutate real summary props');
  });
}

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const marker = '          onConfirm={() => {';
const start = app.indexOf(marker, app.indexOf('<DeliveryModal'));
const end = app.indexOf('\n          }}', start);
assert(start >= 0 && end > start);
const confirmationBody = app.slice(start + marker.length, end);
for (const legendary of [false, true]) {
  test(`actual receipt action runs unchanged App ${legendary ? 'legendary reveal' : 'workshop return'} branch without rewards`, () => {
    const save = freezeDeep(createInitialSaveState({ name: 'Receipt', gender: 'male', hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0 }));
    const before = JSON.stringify(save), events: string[] = [];
    const env = {
      setDeliverySummary: (value: unknown) => { assert.equal(value, null); events.push('clear-receipt'); },
      legendaryPayload: legendary ? { tier: 10 } : null,
      soundEngine: { playLegendaryFanfare: () => events.push('fanfare') },
      setActiveModal: (value: string | null) => events.push(`modal:${value}`),
      // Any accidental transaction/storage reference in the actual body fails:
      commitSave: () => { throw new Error('Confirmation must not commit rewards'); },
      persistCurrent: () => { throw new Error('Confirmation must not persist'); },
      saveRef: { current: save },
    };
    const js = stripTypeScriptTypes(`function confirm() {${confirmationBody}\n}`);
    const onConfirm = new Function(...Object.keys(env), `${js}; return confirm;`)(...Object.values(env));
    const tree = DeliveryModal({ summary: freezeDeep(fixture()), onConfirm });
    nodes(tree).find(n => n.type === 'button')!.props.onClick();
    assert.deepEqual(events, legendary ? ['clear-receipt', 'fanfare', 'modal:legendary'] : ['clear-receipt', 'modal:null']);
    assert.equal(JSON.stringify(save), before, 'all gold/XP/material/ledger/battle state unchanged');
  });
}

for (const [name, overrides] of variants) {
  test(`receipt-local notification stays outside the scroll area: ${name}`, () => {
    const summary = freezeDeep(fixture(overrides));
    const notification = freezeDeep({ type: 'div', props: { children: 'Existing ordinary message' } });
    const before = JSON.stringify({ summary, notification });
    let confirmations = 0;
    const onConfirm = () => { confirmations++; };
    const tree = DeliveryModal({ summary, notification, onConfirm });
    const all = nodes(tree);
    const layout = all.find(n => n.props['data-testid'] === 'delivery-layout')!;
    const scroll = all.find(n => n.props['data-testid'] === 'delivery-scroll')!;
    const footer = all.find(n => n.props['data-testid'] === 'delivery-notification')!;
    assert(layout && scroll && footer);
    assert(nodes(layout).includes(scroll) && nodes(layout).includes(footer));
    assert(!nodes(scroll).includes(footer), 'notification cannot scroll with receipt content');
    assert(nodes(footer).includes(notification), 'existing notification presentation passes through');
    assert.match(layout.props.className, /max-h-\[94vh\]/);
    assert.match(scroll.props.className, /min-h-0/);
    assert.match(scroll.props.className, /overflow-y-auto/);
    assert.match(footer.props.className, /shrink-0/);
    assert.match(footer.props.className, /pointer-events-none/);
    assert(!footer.props.style?.height, 'notification height is natural, not fixed');
    const buttons = all.filter(n => n.type === 'button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.onClick, onConfirm);
    buttons[0].props.onClick();
    assert.equal(confirmations, 1);
    assert.equal(JSON.stringify({ summary, notification }), before);
    assert(!nodes(DeliveryModal({ summary, onConfirm })).some(n => n.props['data-testid'] === 'delivery-notification'));
  });
}

test('actual App presentation conditions keep notification exclusive and save warnings global', () => {
  const visibility = app.match(/const deliveryReceiptVisible\s*=\s*([^;]+);/)!;
  const local = app.match(/notification=\{([^?]+)\?/)!;
  const global = app.match(/\{\((saveWarning \|\| \(toastMsg && !deliveryReceiptVisible\))\) && \(/)!;
  assert(visibility && local && global);
  const isVisible = new Function('screen', 'save', 'activeModal', 'deliverySummary', `return ${visibility[1]};`);
  const hasLocal = new Function('saveWarning', 'toastMsg', `return Boolean(${local[1]});`);
  const hasGlobal = new Function('saveWarning', 'toastMsg', 'deliveryReceiptVisible', `return Boolean(${global[1]});`);
  const cases = [
    ['workshop', {}, 'delivery', {}, null, 'toast', true, false],
    ['workshop', {}, 'delivery', {}, { message: 'warning' }, 'toast', false, true],
    ['workshop', {}, 'delivery', {}, null, null, false, false],
    ['workshop', {}, null, {}, null, 'toast', false, true],
    ['workshop', {}, 'legendary', {}, null, 'toast', false, true],
    ['title', {}, 'delivery', {}, null, 'toast', false, true],
    ['workshop', null, 'delivery', {}, null, 'toast', false, true],
    ['workshop', {}, 'delivery', null, null, 'toast', false, true],
    ['workshop', {}, 'delivery', {}, { message: 'warning' }, null, false, true],
  ];
  for (const [screen, save, modal, summary, warning, toast, expectedLocal, expectedGlobal] of cases) {
    const visible = isVisible(screen, save, modal, summary);
    assert.equal(Boolean(visible && hasLocal(warning, toast)), expectedLocal);
    assert.equal(hasGlobal(warning, toast, visible), expectedGlobal);
  }
});

test('actual App notification owner preserves the existing timeout and replacement semantics', () => {
  const start = app.indexOf('const showToast = useCallback((msg: string) => {');
  const end = app.indexOf('  }, []);', start);
  assert(start >= 0 && end > start);
  const body = app.slice(start + 'const showToast = useCallback((msg: string) => {'.length, end);
  let current: string | null = null;
  const timers: { callback: () => void; delay: number }[] = [];
  const show = new Function('setToastMsg', 'window', `return function(msg) {${body}};`)(
    (value: string | null | ((v: string | null) => string | null)) => { current = typeof value === 'function' ? value(current) : value; },
    { setTimeout: (callback: () => void, delay: number) => { timers.push({ callback, delay }); } },
  );
  show('first');
  show('newer');
  assert.equal(timers.length, 2);
  assert(timers.every(t => t.delay === 3400));
  timers[0].callback();
  assert.equal(current, 'newer', 'older different message cannot clear its replacement');
  timers[1].callback();
  assert.equal(current, null);
  show('same');
  show('same');
  timers[2].callback();
  assert.equal(current, null, 'existing same-message matching behavior is intentionally retained');
});
