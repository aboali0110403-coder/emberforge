import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  applyForgeUpgradesToWeapon, createInitialSaveState, createKingLetter,
  createTutorialOrder, createWeaponInstance, getLegendaryMultiplier, getQualityGrade,
} from './rules';
import { RACES } from '../data/races';
import { WEAPONS } from '../data/weapons';
import { BALANCE } from '../data/balance';
import type { QualityGrade } from '../types';

// Inspect the actual component's element tree. Thumbnail children are sentinels,
// not pixel renders; real mounted-App delivery/reveal checks cover those separately.
const componentUrl = new URL('../components/LegendaryModal.tsx', import.meta.url);
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
const react = { createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children } }) };
const module = { exports: {} as Record<string, any> };
new Function('require', 'module', 'exports', compiled)((id: string) => {
  if (id === 'react') return { __esModule: true, default: react, ...react };
  if (id === './PixelThumbnail') return { PortraitSprite: 'PortraitSprite', WeaponSprite: 'WeaponSprite' };
  return actualRequire(id);
}, module, module.exports);
function guarded(run: () => void) {
  const keys = ['window', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'requestAnimationFrame'] as const;
  const descriptors = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const random = Math.random;
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, get() { assert.fail(`reveal must not access ${key}`); } });
    Math.random = () => assert.fail('reveal must not consume gameplay RNG');
    run();
  } finally {
    Math.random = random;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
}
const qualities: [QualityGrade, number][] = [['D', 0.2], ['C', 0.5], ['B', 0.7], ['A', 0.85], ['S', 0.95]];
for (const milestone of [10, 15, 20]) {
  for (const [grade, quality] of qualities) {
    test(`legendary terminology: level ${milestone}, ${grade} quality, truthful immutable reveal`, () => {
      const save = createInitialSaveState({ name: 'Milestone fixture', gender: 'male', hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0 });
      const initial = createWeaponInstance('sword', milestone, `weapon-${milestone}-${grade}`);
      const upgraded = applyForgeUpgradesToWeapon(initial, 'blade', quality, [], save.equipment, milestone, 'edge');
      const order = { ...createTutorialOrder(), isTutorial: false, customerName: `Customer ${grade}`, portraitVariant: 2, weapon: upgraded.updated };
      const letter = createKingLetter(order.race, save.player.name, order.weapon, milestone);
      assert.equal(getQualityGrade(quality), grade);
      let calls = 0;
      const onClose = () => { calls++; };
      // There is intentionally no grade prop added to the production interface.
      const props = frozen({ order, milestoneLevel: milestone, letter, popBonus: BALANCE.legendaryPopBonus, onClose });
      const before = JSON.stringify(props), saveBefore = JSON.stringify(save);
      guarded(() => {
        for (let repeat = 0; repeat < 3; repeat++) {
          const tree = module.exports.LegendaryModal(props) as ViewNode;
          const all = nodes(tree), content = text(tree), headings = all.filter(node => node.type === 'h2');
          assert.equal(headings.length, 1);
          assert.equal(text(headings[0]), 'Legendary Milestone Reached!');
          assert.doesNotMatch(text(headings[0]), /Masterwork|S-grade|S-Rank/);
          assert(content.includes(`LEGENDARY MILESTONE · LEVEL ${milestone}`));
          assert(content.includes(`${order.customerName} stares in awe!`));
          assert(content.includes(WEAPONS[order.weapon.type].name));
          assert(content.includes(RACES[order.race].kingdomName));
          assert(content.includes(`+${props.popBonus} Popularity · ×${getLegendaryMultiplier(milestone)} Battle Material Rewards!`));
          assert.equal(text(all.find(node => node.type === 'h3')), letter.title);
          assert(all.some(node => node.type === 'p' && text(node) === letter.body));
          const weapon = all.find(node => node.type === 'WeaponSprite');
          assert.equal(weapon!.props.weapon, order.weapon); assert.equal(weapon!.props.size, 56);
          const portraits = all.filter(node => node.type === 'PortraitSprite');
          assert.equal(portraits.length, 2);
          assert.equal(portraits[0].props.race, order.race); assert.equal(portraits[0].props.variant, order.portraitVariant);
          assert.equal(portraits[1].props.race, order.race); assert.equal(portraits[1].props.isKing, true);
          const buttons = all.filter(node => node.type === 'button');
          assert.equal(buttons.length, 1); assert.equal(text(buttons[0]), 'Honor the Realm & Continue');
          assert.equal(buttons[0].props.onClick, onClose);
          assert.equal(calls, 0, 'rendering and rerendering cannot close or award');
          assert.equal(JSON.stringify(props), before); assert.equal(JSON.stringify(save), saveBefore);
        }
        const button = nodes(module.exports.LegendaryModal(props)).find(node => node.type === 'button')!;
        button.props.onClick(); assert.equal(calls, 1, 'one activation invokes the original callback once');
        assert.equal(JSON.stringify(props), before); assert.equal(JSON.stringify(save), saveBefore);
      });
    });
  }
}
