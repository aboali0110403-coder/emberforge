import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createTutorialOrder } from './rules';
import { STRINGS } from '../strings';
import type { DeliverySummary } from '../types';
import type { ForgeInsightReport } from './forgeInsightReport';

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
// Same approach as deliveryReceiptUI.test.ts: compile the actual receipt and
// inspect real element props/callbacks. Not a mounted React/browser test.
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

const furnaceReport: ForgeInsightReport = {
  station: 'furnace',
  accuracy: 0.72,
  bestStreak: 0,
  entries: [
    { key: 'elapsed', value: 15.0, derived: false },
    { key: 'inBand', value: 10.8, derived: false },
    { key: 'overheat', value: 0.4, derived: false },
    { key: 'bandShare', value: 0.72, derived: true },
    { key: 'scorch', value: 0.018, derived: true },
  ],
};
const anvilReport: ForgeInsightReport = {
  station: 'anvil',
  accuracy: 0.88,
  bestStreak: 4,
  entries: [
    { key: 'strikes', value: [8, 8], derived: false },
    { key: 'strikeScores', value: [1, 1, 0.76, 1, 1, 1, 0.76, 1], derived: false },
    { key: 'strikeJudgments', value: ['perfect', 'perfect', 'good', 'perfect', 'perfect', 'perfect', 'good', 'perfect'], derived: true },
    { key: 'judgmentTally', value: [6, 2, 0], derived: true },
  ],
};
const quenchReport: ForgeInsightReport = {
  station: 'quench',
  accuracy: 1,
  bestStreak: 1,
  entries: [
    { key: 'judgment', value: 'perfect', derived: false },
    { key: 'releaseTemp', value: 0.39, derived: false },
    { key: 'window', value: [0.3, 0.48], derived: false },
  ],
};
const workbenchReport: ForgeInsightReport = {
  station: 'workbench',
  accuracy: 0.7433333333333333,
  bestStreak: 3,
  entries: [
    { key: 'fitResults', value: ['miss', 'good', 'good', 'good'], derived: false },
    { key: 'fitMisses', value: 1, derived: false },
    { key: 'binds', value: [6, 6], derived: false },
    { key: 'bindScores', value: [0.8, 0.8, 0.9, 0.5, 0.8, 0.38], derived: false },
    { key: 'bindJudgments', value: ['good', 'good', 'good', 'miss', 'good', 'miss'], derived: true },
    { key: 'fitPenalty', value: 0.04, derived: true },
  ],
};

function fixture(overrides: Partial<DeliverySummary> = {}): DeliverySummary {
  return {
    order: createTutorialOrder(), quality: 0.85, qualityGrade: 'A', masterworkTrait: null,
    fulfilment: 1, goldEarned: 127, promptBonusGold: 11, reputationPenalty: 0,
    xpEarned: 78, smithLevelBefore: 3, smithLevelAfter: 3, oldLevel: 3, newLevel: 3,
    levelUpChance: 0.22, leveledUp: false,
    statDeltas: { power: 2, edge: 3, balance: 4, durability: 5, arcane: 0 },
    selectedMaterials: [{ materialId: 'human_common', units: 1 }],
    legendaryMilestone: null, newAchievements: [],
    stepReports: [furnaceReport, anvilReport, quenchReport, workbenchReport],
    steps: ['furnace', 'anvil', 'quench', 'workbench'],
    ...overrides,
  };
}

test('receipt renders the complete per-step forge insight for a multi-step forge', () => {
  const summary = freezeDeep(fixture());
  const before = JSON.stringify(summary);
  let confirmations = 0;
  const tree = DeliveryModal({ summary, onConfirm: () => { confirmations++; } });
  const all = nodes(tree);
  const content = text(tree);

  const section = all.find((n) => n.props['data-testid'] === 'forge-insight');
  assert(section, 'insight section is present at the existing receipt boundary');
  for (const i of [0, 1, 2, 3]) {
    assert(
      all.some((n) => n.props['data-testid'] === `forge-insight-step-${i}`),
      `step ${i} report is rendered`,
    );
  }

  assert(content.includes(STRINGS.delivery.insight.title));
  assert(content.includes(STRINGS.delivery.insight.legend));
  // Station names and actual accuracies
  assert(content.includes(STRINGS.stations.furnace.title));
  assert(content.includes(STRINGS.stations.anvil.title));
  assert(content.includes(STRINGS.stations.quench.title));
  assert(content.includes(STRINGS.stations.workbench.title));
  assert(content.includes('72%'));
  assert(content.includes('88%'));
  assert(content.includes('100%'));
  // Stored counters and judgments appear verbatim, formatted only in presentation
  assert(content.includes('15.0s'));
  assert(content.includes('10.8s'));
  assert(content.includes('8/8'));
  assert(content.includes('1.00, 1.00, 0.76, 1.00, 1.00, 1.00, 0.76, 1.00'));
  assert(content.includes('0.39'));
  assert(content.includes('0.30 - 0.48'));
  assert(content.includes('Miss, Good, Good, Good'), 'each actual fit outcome is listed in order');
  assert(content.includes('0.80, 0.80, 0.90, 0.50, 0.80, 0.38'), 'raw beat scores formatted in presentation');
  // Derived measurements are shown but explicitly labeled
  assert(content.includes('72%'));
  assert(content.includes('-0.018'));
  assert(content.includes('-0.04'));
  assert(content.includes('6 Perfect · 2 Good · 0 Miss'));
  const derivedTags = content.match(/\(derived\)/g) ?? [];
  const observedTags = content.match(/\(observed\)/g) ?? [];
  const allReports = [furnaceReport, anvilReport, quenchReport, workbenchReport];
  const totalDerived = allReports
    .flatMap((r) => r.entries)
    .filter((e) => e.derived).length;
  const totalObserved = allReports
    .flatMap((r) => r.entries)
    .filter((e) => !e.derived).length;
  assert.equal(derivedTags.length, totalDerived, 'every derived entry carries the derived tag');
  assert.equal(
    observedTags.length,
    totalObserved + 4 * 2, // entries plus each step's accuracy and best-streak lines
    'observed entries and per-step accuracy/streak carry the observed tag',
  );
  // Presentation formatting never mutates the stored raw report data
  const scores = workbenchReport.entries.find((e) => e.key === 'bindScores')!;
  assert(Array.isArray(scores.value), 'score entries stay raw arrays in the report data');
  assert.equal(typeof (scores.value as number[])[0], 'number');
  assert.equal(typeof furnaceReport.entries.find((e) => e.key === 'elapsed')!.value, 'number');
  // No invented judgments for the continuous stations
  const furnaceStep = all.find((n) => n.props['data-testid'] === 'forge-insight-step-0')!;
  assert(!text(furnaceStep).includes('Strike judgments'));
  assert(!text(furnaceStep).includes('Release judgment'));

  const buttons = all.filter((n) => n.type === 'button');
  assert.equal(buttons.length, 1, 'existing single Continue action is preserved');
  assert.equal(text(buttons[0]), STRINGS.delivery.continueBtn);
  buttons[0].props.onClick();
  assert.equal(confirmations, 1);
  assert.equal(JSON.stringify(summary), before, 'receipt rendering never mutates the summary');
});

test('receipt omits the insight section when no reports and no step list exist (V2 summaries unaffected)', () => {
  const summary = freezeDeep(fixture({ stepReports: undefined, steps: undefined }));
  const tree = DeliveryModal({ summary, onConfirm: () => {} });
  const all = nodes(tree);
  assert(!all.some((n) => n.props['data-testid'] === 'forge-insight'));
  assert.equal(all.filter((n) => n.type === 'button').length, 1);
  const content = text(tree);
  assert(content.includes(STRINGS.delivery.acknowledgement));
});

test('steps without a payload render explicitly as unavailable, in order, with step identity', () => {
  const summary = freezeDeep(fixture({
    stepReports: [undefined, anvilReport, undefined],
    steps: ['furnace', 'anvil', 'quench'],
  }));
  const tree = DeliveryModal({ summary, onConfirm: () => {} });
  const all = nodes(tree);
  const content = text(tree);
  assert(all.some((n) => n.props['data-testid'] === 'forge-insight'));
  for (const i of [0, 1, 2]) {
    assert(
      all.some((n) => n.props['data-testid'] === `forge-insight-step-${i}`),
      `step ${i} keeps its position and identity`,
    );
  }
  const step0 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-0')!;
  const step2 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-2')!;
  assert(text(step0).includes(STRINGS.delivery.insight.unavailable), 'missing step 1 is explicit');
  assert(text(step0).includes(STRINGS.stations.furnace.title), 'missing step keeps its station identity');
  assert(!text(step0).includes('Accuracy'), 'no measurement is fabricated for a missing step');
  assert(text(step2).includes(STRINGS.delivery.insight.unavailable), 'missing step 3 is explicit');
  assert(!text(step2).includes('Accuracy'));
  const unavailableCount = content.match(/Report unavailable/g) ?? [];
  assert.equal(unavailableCount.length, 2, 'exactly the missing steps are marked unavailable');
  // The valid report still renders exactly as before
  const step1 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-1')!;
  assert(text(step1).includes('88%'));
  assert(!text(step1).includes(STRINGS.delivery.insight.unavailable));
});

test('a step list with no payloads at all renders every step unavailable, in order, with identity', () => {
  const summary = freezeDeep(fixture({
    stepReports: undefined,
    steps: ['furnace', 'anvil', 'quench', 'workbench'],
  }));
  const tree = DeliveryModal({ summary, onConfirm: () => {} });
  const all = nodes(tree);
  const content = text(tree);
  assert(all.some((n) => n.props['data-testid'] === 'forge-insight'));
  const stationTitles = ['furnace', 'anvil', 'quench', 'workbench'] as const;
  for (const i of [0, 1, 2, 3]) {
    const stepNode = all.find((n) => n.props['data-testid'] === `forge-insight-step-${i}`)!;
    assert(stepNode, `step ${i} keeps its order position`);
    assert(text(stepNode).includes(STRINGS.delivery.insight.unavailable));
    assert(text(stepNode).includes(STRINGS.stations[stationTitles[i]].title), 'station identity preserved');
    assert(!text(stepNode).includes('Accuracy'), 'no measurement is fabricated');
  }
  const unavailableCount = content.match(/Report unavailable/g) ?? [];
  assert.equal(unavailableCount.length, 4, 'every step is marked unavailable');
});

test('short report arrays: steps beyond the reports length render unavailable with identity', () => {
  const summary = freezeDeep(fixture({
    stepReports: [furnaceReport],
    steps: ['furnace', 'anvil', 'quench'],
  }));
  const tree = DeliveryModal({ summary, onConfirm: () => {} });
  const all = nodes(tree);
  for (const i of [0, 1, 2]) {
    assert(all.some((n) => n.props['data-testid'] === `forge-insight-step-${i}`), `step ${i} rendered`);
  }
  const step0 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-0')!;
  assert(text(step0).includes('72%'), 'the available report renders unchanged');
  assert(!text(step0).includes(STRINGS.delivery.insight.unavailable));
  for (const i of [1, 2]) {
    const stepNode = all.find((n) => n.props['data-testid'] === `forge-insight-step-${i}`)!;
    assert(text(stepNode).includes(STRINGS.delivery.insight.unavailable), `missing step ${i + 1} is explicit`);
  }
  const step1 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-1')!;
  const step2 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-2')!;
  assert(text(step1).includes(STRINGS.stations.anvil.title));
  assert(text(step2).includes(STRINGS.stations.quench.title));
});

test('sparse report arrays: holes between reports render unavailable at their order positions', () => {
  const summary = freezeDeep(fixture({
    stepReports: [anvilReport, undefined, anvilReport],
    steps: ['anvil', 'anvil', 'anvil'],
  }));
  const tree = DeliveryModal({ summary, onConfirm: () => {} });
  const all = nodes(tree);
  const content = text(tree);
  // repeated stations keep their per-position identity
  for (const i of [0, 1, 2]) {
    const stepNode = all.find((n) => n.props['data-testid'] === `forge-insight-step-${i}`)!;
    assert(text(stepNode).includes(STRINGS.stations.anvil.title), `step ${i + 1} keeps station identity`);
  }
  const step1 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-1')!;
  assert(text(step1).includes(STRINGS.delivery.insight.unavailable), 'the hole renders unavailable');
  const unavailableCount = content.match(/Report unavailable/g) ?? [];
  assert.equal(unavailableCount.length, 1, 'only the hole is marked unavailable');
  const step0 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-0')!;
  const step2 = all.find((n) => n.props['data-testid'] === 'forge-insight-step-2')!;
  assert(text(step0).includes('88%'));
  assert(text(step2).includes('88%'));
});

test('App wires the extended payload through the existing completion path only', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  // The single existing advanceForgeStep call carries the optional insight.
  const advanceCalls = app.match(/advanceForgeStep\(/g) ?? [];
  assert.equal(advanceCalls.length, 1, 'no new completion entry point is added');
  assert(app.includes('payload.insight'), 'insight comes from the finish payload');
  assert(
    app.includes('stepReports: stepOutcome.nextSession.stepReports'),
    'receipt summary receives the accumulated reports',
  );
  // No new emitters in the canvas layer: GameCanvas still forwards unchanged.
  const canvas = readFileSync(new URL('../canvas/GameCanvas.tsx', import.meta.url), 'utf8');
  assert.equal((canvas.match(/onForgeStepFinish\(/g) ?? []).length, 1);
  const minigames = readFileSync(new URL('../canvas/minigames.ts', import.meta.url), 'utf8');
  assert.equal((minigames.match(/cb\.onFinish\(/g) ?? []).length, 2, 'exactly the two existing emission sites remain');
});
