import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBattleStatus, formatBattleEta, HudOverlay } from '../components/HudOverlay';
import { createInitialSaveState } from './rules';
import type { ActiveModal, PendingBattle } from '../types';

function battle(ready: boolean, etaSec: number, id = 'battle'): PendingBattle {
  // Only these fields are read by this presentation. A result sentinel catches mutation.
  return { id, ready, etaSec, resolvedResult: { battleId: id } } as PendingBattle;
}

type ViewNode = { type?: unknown; props: Record<string, unknown> };
function nodes(value: unknown): ViewNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as ViewNode;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'props' in value) {
    return text((value as ViewNode).props.children);
  }
  return '';
}
function view(queue: PendingBattle[], onOpenModal: (modal: Exclude<ActiveModal, null>) => void) {
  const save = createInitialSaveState({
    name: 'HUD fixture', gender: 'male', hairColorIndex: 0, skinToneIndex: 0, outfitColorIndex: 0,
  });
  save.pendingBattles = queue;
  return HudOverlay({
    save, activeModal: null, canSkipNight: false,
    onSkipNight: () => {}, onToggleMute: () => {}, onOpenModal,
  });
}
function status(queue: PendingBattle[], onOpenModal = (_modal: Exclude<ActiveModal, null>) => {}) {
  return nodes(view(queue, onOpenModal)).find((node) => node.props['data-testid'] === 'hud-battle-status');
}
function unreachable() { assert.fail('presentation must not open a report automatically'); }

test('battle HUD: empty queue has zero counts and no ETA', () => {
  assert.deepEqual(deriveBattleStatus([]), { inProgressCount: 0, readyCount: 0, nextEtaSec: null });
});

test('battle HUD: one unready battle uses its stored ETA', () => {
  assert.deepEqual(deriveBattleStatus([battle(false, 18)]), { inProgressCount: 1, readyCount: 0, nextEtaSec: 18 });
});

test('battle HUD: multiple unready battles find nearest ETA without depending on array order', () => {
  const queue = [battle(false, 44, 'first'), battle(false, 7, 'nearest'), battle(false, 24, 'last')];
  assert.deepEqual(deriveBattleStatus(queue), { inProgressCount: 3, readyCount: 0, nextEtaSec: 7 });
  assert.deepEqual(queue.map((entry) => entry.id), ['first', 'nearest', 'last']);
});

test('battle HUD: one ready battle has no pending ETA', () => {
  assert.deepEqual(deriveBattleStatus([battle(true, 0)]), { inProgressCount: 0, readyCount: 1, nextEtaSec: null });
});

test('battle HUD: multiple ready battles are counted independently', () => {
  assert.deepEqual(deriveBattleStatus([battle(true, 0), battle(true, 0), battle(true, 0)]),
    { inProgressCount: 0, readyCount: 3, nextEtaSec: null });
});

test('battle HUD: mixed states retain both counts and ignore ready ETA', () => {
  assert.deepEqual(deriveBattleStatus([battle(true, 0), battle(false, 18), battle(true, 40), battle(false, 7)]),
    { inProgressCount: 2, readyCount: 2, nextEtaSec: 7 });
});

test('battle HUD: tied ETAs preserve both pending entries', () => {
  assert.deepEqual(deriveBattleStatus([battle(false, 12), battle(false, 12)]),
    { inProgressCount: 2, readyCount: 0, nextEtaSec: 12 });
});

test('battle HUD: ready flag remains authoritative even with positive ETA', () => {
  assert.deepEqual(deriveBattleStatus([battle(true, 1), battle(false, 18)]),
    { inProgressCount: 1, readyCount: 1, nextEtaSec: 18 });
  assert.deepEqual(deriveBattleStatus([battle(true, 600)]),
    { inProgressCount: 0, readyCount: 1, nextEtaSec: null });
});

test('battle HUD: unready zero ETA is not repaired or made ready by presentation', () => {
  assert.deepEqual(deriveBattleStatus([battle(false, 600), battle(false, 0)]),
    { inProgressCount: 2, readyCount: 0, nextEtaSec: 0 });
  const panel = status([battle(false, 0)], unreachable);
  assert.match(text(panel), /1 battle in progress/);
  assert.match(text(panel), /0:00 \(play time\)/);
  assert.ok(!nodes(panel).some((node) => node.type === 'button'));
});

test('battle HUD: ETA formatting reuses current mm:ss conventions around boundaries', () => {
  for (const [seconds, expected] of [
    [0, '0:00'], [1, '0:01'], [9, '0:09'], [59, '0:59'], [60, '1:00'],
    [61, '1:01'], [119, '1:59'], [120, '2:00'], [600, '10:00'], [59.9, '0:59'],
  ] as const) assert.equal(formatBattleEta(seconds), expected);
});

test('battle HUD: malformed non-finite display values remain unknown without changing stored ETA', () => {
  for (const seconds of [NaN, Infinity, -Infinity]) {
    const queue = [battle(false, seconds)];
    const derived = deriveBattleStatus(queue);
    assert.ok(Object.is(derived.nextEtaSec, seconds));
    assert.equal(formatBattleEta(seconds), '--:--');
    assert.ok(Object.is(queue[0].etaSec, seconds));
  }
});

test('battle HUD: pending-only status is informative and has no report action', () => {
  const panel = status([battle(false, 18), battle(false, 24)], unreachable);
  assert.ok(panel);
  assert.match(text(panel), /2 battles in progress/);
  assert.match(text(panel), /Next report in 0:18 \(play time\)/);
  assert.ok(!nodes(panel).some((node) => node.type === 'button' || node.props.onClick));
});

test('battle HUD: ready action invokes the existing battle callback exactly once when clicked', () => {
  const calls: string[] = [];
  const panel = status([battle(true, 0)], (modal) => calls.push(modal));
  assert.deepEqual(calls, []);
  const button = nodes(panel).find((node) => node.props['data-testid'] === 'hud-battle-ready');
  assert.ok(button);
  assert.match(text(button), /1 report awaiting claim/);
  assert.match(String(button.props['aria-label']), /1 battle report awaiting claim\. Open next report/);
  (button.props.onClick as () => void)();
  assert.deepEqual(calls, ['battle']);
});

test('battle HUD: mixed presentation shows pending ETA and ready action simultaneously', () => {
  const panel = status([battle(false, 61), battle(true, 0), battle(true, 35)], unreachable);
  assert.match(text(panel), /1 battle in progress/);
  assert.match(text(panel), /Next report in 1:01 \(play time\)/);
  assert.match(text(panel), /2 reports awaiting claim/);
  assert.equal(nodes(panel).filter((node) => node.type === 'button').length, 1);
});

test('battle HUD: rerender with an emptied queue hides status after existing claim flow removes last entry', () => {
  assert.ok(status([battle(true, 0)], unreachable));
  assert.equal(status([], unreachable), undefined);
});

test('battle HUD: large counts and maximum sanitized ETA remain explicit', () => {
  const queue = [...Array.from({ length: 123 }, (_, index) => battle(false, 600, `pending-${index}`)),
    ...Array.from({ length: 45 }, (_, index) => battle(true, 600, `ready-${index}`))];
  assert.deepEqual(deriveBattleStatus(queue), { inProgressCount: 123, readyCount: 45, nextEtaSec: 600 });
  const panel = status(queue, unreachable);
  assert.match(text(panel), /123 battles in progress/);
  assert.match(text(panel), /10:00 \(play time\)/);
  assert.match(text(panel), /45 reports awaiting claim/);
});

test('battle HUD: frozen queue, entries and resolved results preserve identity and every value', () => {
  const queue = [battle(false, 44, 'a'), battle(true, 5, 'b'), battle(false, 8, 'c')];
  const entries = [...queue]; const results = queue.map((entry) => entry.resolvedResult);
  const before = structuredClone(queue);
  for (const entry of queue) { Object.freeze(entry.resolvedResult); Object.freeze(entry); }
  Object.freeze(queue);
  for (let repeat = 0; repeat < 2; repeat += 1) {
    assert.deepEqual(deriveBattleStatus(queue), { inProgressCount: 2, readyCount: 1, nextEtaSec: 8 });
    status(queue, unreachable);
  }
  assert.deepEqual(queue, before);
  queue.forEach((entry, index) => {
    assert.strictEqual(entry, entries[index]);
    assert.strictEqual(entry.resolvedResult, results[index]);
  });
});

test('battle HUD: pure derivation consumes no RNG and accesses no storage', () => {
  const random = Math.random;
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Math.random = () => assert.fail('derivation must not consume RNG');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get: () => assert.fail('derivation must not access storage'),
  });
  try {
    assert.deepEqual(deriveBattleStatus([battle(false, 9), battle(true, 0)]),
      { inProgressCount: 1, readyCount: 1, nextEtaSec: 9 });
  } finally {
    Math.random = random;
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
