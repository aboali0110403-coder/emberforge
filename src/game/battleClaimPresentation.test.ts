import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createWeaponInstance, resolveBattleOutcome } from './rules';
import { RACES } from '../data/races';
import { MATERIAL_BY_ID } from '../data/materials';
import { QUALITY_GRADE_META } from '../data/config';
import type { BattleResult, PendingBattle } from '../types';

// Exercise the actual component and its unchanged effect/Skip control flow.
// Sound and canvas painting are spies, not an unmuted-audio/global RNG claim.
// Mounted-App checks separately cover real canvas pixels and claim economics.
const componentUrl = new URL('../components/BattleReportModal.tsx', import.meta.url);
const source = readFileSync(componentUrl, 'utf8');
const actualRequire = createRequire(componentUrl);
const { transformSync } = actualRequire('esbuild') as typeof import('esbuild');
const compiled = transformSync(source, { loader: 'tsx', format: 'cjs', target: 'es2022', jsx: 'transform' }).code;
type ViewNode = { type: unknown; props: Record<string, any> };
function nodes(value: any): ViewNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === 'object' && 'props' in value ? [value, ...nodes(value.props.children)] : [];
}
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value && typeof value === 'object' && 'props' in value ? text(value.props.children) : '';
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function fixture(won: boolean, firstClear = false): BattleResult {
  const pending: PendingBattle = {
    id: 'presentation-battle', orderId: 'presentation-order', race: 'human',
    customerName: 'Battle fixture', portraitVariant: 0,
    weapon: createWeaponInstance('sword', 10, 'presentation-weapon'),
    quality: won ? 0.85 : 0.2, fulfilment: 1,
    scenarioName: RACES.human.scenarios[0].name,
    scenarioDifficulty: RACES.human.scenarios[0].difficulty,
    enemyArchetype: RACES.human.scenarios[0].archetype,
    smithLevel: 3, etaSec: 0, ready: true, rewardMultiplier: 2, wasRoyal: false,
  };
  return frozen({ ...resolveBattleOutcome(pending, () => won ? 0 : 0.999999), territoryConquered: firstClear });
}
function driver(result: BattleResult, onClaim: () => void, complete = true) {
  let done = complete, refIndex = 0, effect: (() => void | (() => void)) | undefined;
  const refs: { current: any }[] = [], paints: { time: number; result: BattleResult }[] = [], sounds: string[] = [];
  const react = {
    createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children } }),
    useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
    useState: () => [done, (value: boolean) => { done = value; }],
    useEffect: (fn: () => void | (() => void)) => { effect = fn; },
  };
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', compiled)((id: string) => {
    if (id === 'react') return { __esModule: true, default: react, ...react };
    if (id === '../audio/soundEngine') return { soundEngine: {
      playBattleSlash: () => sounds.push('slash'),
      playBattleImpact: (won: boolean) => sounds.push(`impact:${won}`),
      playLevelUp: () => sounds.push('victory'),
      playWarningTone: () => sounds.push('defeat'),
    } };
    if (id === '../canvas/battleScene') return { renderBattleFrame: (_ctx: unknown, time: number, value: BattleResult) => paints.push({ time, result: value }) };
    if (id === './PixelThumbnail') return { MaterialSprite: 'MaterialSprite' };
    return actualRequire(id);
  }, module, module.exports);
  return {
    render() { refIndex = 0; return module.exports.BattleReportModal({ result, onClaim }) as ViewNode; },
    mountEffect() { refs[0].current = { getContext: () => ({ imageSmoothingEnabled: true }) }; return effect!(); },
    paints, sounds,
  };
}
function claimButton(tree: ViewNode) {
  return nodes(tree).find(node => node.type === 'button' && /^(Claim Spoils & Continue|Acknowledge Report)$/.test(text(node)));
}
function guarded<T>(run: (clock: {
  frame: (ms: number) => void; fireSounds: () => void;
  timers: Map<number, { fn: () => void; delay: number }>; rafs: Map<number, (ms: number) => void>;
}) => T): T {
  const keys = ['window', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'performance'] as const;
  const descriptors = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const random = Math.random;
  const timers = new Map<number, { fn: () => void; delay: number }>(), rafs = new Map<number, (ms: number) => void>();
  let nextId = 0;
  const storage = new Proxy({}, { get() { assert.fail('presentation must not access storage'); } });
  const fakeWindow = {
    setTimeout: (fn: () => void, delay: number) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); }, localStorage: storage,
  };
  const values = { window: fakeWindow,
    requestAnimationFrame: (fn: (ms: number) => void) => { const id = ++nextId; rafs.set(id, fn); return id; },
    cancelAnimationFrame: (id: number) => { rafs.delete(id); },
    localStorage: storage, performance: { now: () => 0 },
  };
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] });
    Math.random = () => assert.fail('presentation/control flow must not consume gameplay RNG');
    return run({ timers, rafs,
      frame(ms) { const queue = [...rafs.values()]; rafs.clear(); queue.forEach(fn => fn(ms)); },
      fireSounds() { const queue = [...timers.values()]; timers.clear(); queue.forEach(({ fn }) => fn()); },
    });
  } finally {
    Math.random = random;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
}

const cases = [
  ['victory first clear', fixture(true, true)],
  ['victory already cleared', fixture(true, false)],
  ['defeat', fixture(false, false)],
] as const;
for (const [name, result] of cases) {
  test(`battle claim presentation: truthful copy and unchanged data, ${name}`, () => guarded(() => {
    let calls = 0;
    const before = JSON.stringify(result), onClaim = () => { calls++; };
    const view = driver(result, onClaim), tree = view.render(), content = text(tree), race = RACES[result.race];
    assert.doesNotMatch(content, /Spoils Awarded|Territory Liberated|is now cleared|already cleared/);
    assert.equal(content.includes(`Claim to clear ${result.scenarioName} and gain +5% ${race.kingdomName} Gold Tribute.`), Boolean(result.won && result.territoryConquered));
    assert(content.includes(`${result.qualityGrade} · ${QUALITY_GRADE_META[result.qualityGrade!].label}`));
    const popularity = result.popularityDelta > 0 ? `+${result.popularityDelta} ${race.kingdomName} Popularity`
      : result.popularityDelta < 0 ? `${result.popularityDelta} ${race.kingdomName} Popularity` : 'No Popularity Change';
    assert(content.includes(popularity));
    assert(content.includes(`${result.won ? 'Victory!' : 'Defeat ·'} Satisfaction ${result.satisfaction}%`));
    if (result.won) {
      assert(content.includes(`${race.name} Spoils to Claim:`));
      for (const reward of result.materialRewards) assert(content.includes(`${MATERIAL_BY_ID[reward.materialId].name} ×${reward.count}`));
      assert(content.includes(`+${result.goldBonus}g Battle Bonus`));
      assert(content.includes('Claim applies the battle rewards and popularity changes and records any new territory clear.'));
    } else {
      assert(!content.includes('Spoils to Claim'));
      assert(content.includes('Acknowledging applies any battle popularity change.'));
      assert(!content.includes('gain +5%'));
    }
    for (const key of ['weaponRating', 'scenarioThreat', 'matchupLabel', 'matchupBonus', 'smithBonus', 'winChancePct'] as const) {
      const value = result.breakdown![key];
      assert(content.includes(String(value)), `displayed breakdown field preserved: ${key}=${value}`);
    }
    assert(!content.includes('Smith XP') && !content.includes('delivery fee'));
    assert.equal(claimButton(tree)!.props.onClick, onClaim);
    assert.equal(text(claimButton(tree)), result.won ? 'Claim Spoils & Continue' : 'Acknowledge Report');
    assert.equal(calls, 0);
    for (let repeat = 0; repeat < 3; repeat++) view.render();
    assert.equal(calls, 0);
    claimButton(tree)!.props.onClick(); assert.equal(calls, 1, 'one activation calls original callback once');
    claimButton(tree)!.props.onClick(); assert.equal(calls, 2, 'raw callback is deliberately not a one-shot wrapper');
    assert.equal(JSON.stringify(result), before);
  }));

  test(`battle claim presentation: unchanged natural animation control flow, ${name}`, () => guarded(clock => {
    let calls = 0;
    const before = JSON.stringify(result), onClaim = () => { calls++; }, view = driver(result, onClaim, false);
    assert.equal(claimButton(view.render()), undefined);
    const cleanup = view.mountEffect();
    assert.deepEqual([...clock.timers.values()].map(t => t.delay), [1050, 1300, 2050]);
    clock.frame(2249); assert.equal(claimButton(view.render()), undefined);
    clock.frame(2250); assert.equal(claimButton(view.render())!.props.onClick, onClaim);
    clock.fireSounds();
    assert.deepEqual(view.sounds, ['slash', `impact:${result.won}`, result.won ? 'victory' : 'defeat']);
    clock.frame(3000); assert.equal(clock.rafs.size, 0);
    assert.deepEqual(view.paints.map(paint => paint.time), [2.249, 2.25, 3]);
    assert(view.paints.every(paint => paint.result === result));
    assert.equal(calls, 0, 'animation cannot claim');
    if (cleanup) cleanup();
    assert.equal(clock.timers.size, 0); assert.equal(clock.rafs.size, 0);
    assert.equal(JSON.stringify(result), before);
  }));

  test(`battle claim presentation: unchanged Skip cannot claim or mutate, ${name}`, () => guarded(clock => {
    let calls = 0;
    const before = JSON.stringify(result), view = driver(result, () => { calls++; }, false), tree = view.render();
    const cleanup = view.mountEffect();
    const skip = nodes(tree).find(node => node.type === 'button' && text(node) === 'Skip');
    assert(skip); skip.props.onClick();
    assert.equal(clock.timers.size, 0); assert.equal(view.paints[0].time, 3);
    assert(claimButton(view.render())); assert.equal(calls, 0);
    clock.frame(1000); assert.equal(clock.rafs.size, 0);
    if (cleanup) cleanup();
    assert.equal(JSON.stringify(result), before);
  }));
}

for (const [won, flag] of [[true, true], [true, false], [false, true], [false, false]] as const) {
  test(`battle claim presentation: first-clear gate requires victory and flag (${won}/${flag})`, () => guarded(() => {
    const result = frozen({ ...fixture(won), territoryConquered: flag });
    const content = text(driver(result, () => assert.fail('render cannot claim')).render());
    assert.equal(content.includes('Claim to clear'), won && flag);
  }));
}

test('battle claim presentation: exact multi-material counts and signed breakdown survive rendering', () => guarded(() => {
  const base = fixture(true);
  const result = frozen({ ...base, goldBonus: 91, popularityDelta: -7,
    materialRewards: [{ materialId: 'human_common', count: 7 }, { materialId: 'human_mythic', count: 2 }],
    breakdown: { ...base.breakdown!, matchupBonus: -9, smithBonus: 4, winChancePct: 61 },
  });
  const content = text(driver(result, () => assert.fail('render cannot claim')).render());
  assert(content.includes(`${MATERIAL_BY_ID.human_common.name} ×7`));
  assert(content.includes(`${MATERIAL_BY_ID.human_mythic.name} ×2`));
  assert(content.includes('+91g Battle Bonus')); assert(content.includes('-7 Aldermere Popularity'));
  assert(content.includes('-9 · Smith +4')); assert(content.includes('61%'));
}));

test('battle claim presentation: defeat with zero popularity never promises rewards or a territory', () => guarded(() => {
  const result = frozen({ ...fixture(false), popularityDelta: 0, territoryConquered: true });
  const content = text(driver(result, () => assert.fail('render cannot claim')).render());
  assert(content.includes('No Popularity Change'));
  assert(content.includes('Acknowledging applies any battle popularity change.'));
  assert(!content.includes('Spoils to Claim') && !content.includes('Claim to clear'));
}));
