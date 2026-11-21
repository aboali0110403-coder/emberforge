import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaintedWeaponTier, PAINTED_WEAPON_TYPES } from './paintedWeaponAssets';
import { createWeaponInstance } from '../game/rules';

test('all ten commissioned classes have a painted asset route', () => {
  assert.equal(new Set(PAINTED_WEAPON_TYPES).size, 10);
  for (const type of PAINTED_WEAPON_TYPES) assert.equal(getPaintedWeaponTier(createWeaponInstance(type, 1, 'test')), 0);
});
test('painted upgrade tiers preserve existing four-level bands and cap', () => {
  for (const [level, tier] of [[1,0],[4,0],[5,1],[8,1],[9,2],[12,2],[13,3],[16,3],[17,4],[30,4]]) {
    const weapon = createWeaponInstance('sword', level, 'test');
    for (const part of Object.values(weapon.parts)) part.rarity = 'common';
    assert.equal(getPaintedWeaponTier(weapon), tier);
  }
});
test('part rarity can promote the painted tier, never lower a level tier', () => {
  const weapon = createWeaponInstance('axe', 1, 'test');
  Object.values(weapon.parts)[0].rarity = 'epic'; assert.equal(getPaintedWeaponTier(weapon), 3);
  weapon.level = 20; assert.equal(getPaintedWeaponTier(weapon), 4);
});

test('all 150 painted files exist, have PNG dimensions, and differ across tiers and heat states', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  for (const type of PAINTED_WEAPON_TYPES) {
    const hashes = new Set<string>();
    for (let tier = 0; tier < 5; tier++) {
      for (const heat of ['cold', 'warm', 'hot']) {
        const data = await readFile(new URL(`../../public/assets/forging-weapons/${type}-t${tier}-${heat}.png`, import.meta.url));
        assert.equal(data.subarray(1, 4).toString(), 'PNG');
        assert.ok(data.readUInt32BE(16) > 8 && data.readUInt32BE(20) > 8);
        hashes.add(createHash('sha256').update(data).digest('hex'));
      }
    }
    assert.equal(hashes.size, 15, `${type} should have 15 distinct tier/heat images`);
  }
});
