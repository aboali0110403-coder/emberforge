/**
 * S0 baseline regression assertions for the seeded balance harness.
 *
 * These tests pin the CURRENT gameplay behavior (commit cd18ede5 baseline,
 * DEFAULT_BALANCE untouched) at the fixed seeds (base 20261123, 400 runs,
 * 160 orders per scenario). They are simulation assertions: they verify that
 * the real game formulas, driven through the documented synthetic policies,
 * still produce the recorded baseline metrics. They are NOT gameplay/device
 * validation and they do not assert any future retuned target bands; band
 * assertions arrive only inside the slices that implement those retunes
 * (S2-S5). If a gameplay change is intentional, update these expectations in
 * the same change with before/after evidence (see docs/balance-harness.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE_SCENARIOS, runScenario } from './balanceHarness';
import type { ScenarioSummary } from './balanceHarness';

const EXPECTED: Record<string, ScenarioSummary> = {
  'BASELINE buyer 5/day': {
    label: 'BASELINE buyer 5/day',
    runs: 400,
    maxOrders: 160,
    milestones: {
      allT3: { reached: 400, median: 3, p25: 3, p75: 3 },
      allT5: { reached: 400, median: 7, p25: 7, p75: 7 },
      known: { reached: 400, median: 1, p25: 1, p75: 1 },
      respected: { reached: 400, median: 1, p25: 1, p75: 2 },
      renowned: { reached: 400, median: 3, p25: 2, p75: 3 },
      legendary: { reached: 400, median: 4, p25: 3, p75: 4 },
    },
    firstL18: { reached: 400, median: 24 },
    day3TiersMean: '18.7',
    reqLvDay3Mean: '10.0',
    reqLvDay3P90: 12,
    perOrder: {
      unitsBought: '1.72', stageUnits: '1.37', subUnits: '2.30', dropUnits: '5.10',
      stageMetPct: 71, understockedPct: 45, noMaterialPct: 1,
      royalPct: '26.2', legendaryBonusPct: 93, winRatePct: 96,
    },
    goldPerOrder: { delivery: 701, battle: 60, sellback: 220, achievements: '12.1', matSpend: 78, upgrades: 84 },
  },
  'BASELINE frugal 5/day': {
    label: 'BASELINE frugal 5/day',
    runs: 400,
    maxOrders: 160,
    milestones: {
      allT3: { reached: 400, median: 3, p25: 3, p75: 3 },
      allT5: { reached: 400, median: 7, p25: 6, p75: 7 },
      known: { reached: 400, median: 1, p25: 1, p75: 1 },
      respected: { reached: 400, median: 1, p25: 1, p75: 2 },
      renowned: { reached: 400, median: 3, p25: 2, p75: 3 },
      legendary: { reached: 400, median: 4, p25: 3, p75: 4 },
    },
    firstL18: { reached: 400, median: 24 },
    day3TiersMean: '19.2',
    reqLvDay3Mean: '10.1',
    reqLvDay3P90: 13,
    perOrder: {
      unitsBought: '2.19', stageUnits: '1.17', subUnits: '2.74', dropUnits: '5.11',
      stageMetPct: 63, understockedPct: 55, noMaterialPct: 1,
      royalPct: '26.4', legendaryBonusPct: 93, winRatePct: 96,
    },
    goldPerOrder: { delivery: 675, battle: 60, sellback: 309, achievements: '12.1', matSpend: 41, upgrades: 84 },
  },
  'BASELINE buyer 8/day': {
    label: 'BASELINE buyer 8/day',
    runs: 400,
    maxOrders: 160,
    milestones: {
      allT3: { reached: 400, median: 2, p25: 2, p75: 2 },
      allT5: { reached: 400, median: 5, p25: 4, p75: 5 },
      known: { reached: 400, median: 1, p25: 1, p75: 1 },
      respected: { reached: 400, median: 1, p25: 1, p75: 1 },
      renowned: { reached: 400, median: 2, p25: 2, p75: 2 },
      legendary: { reached: 400, median: 2, p25: 2, p75: 3 },
    },
    firstL18: { reached: 400, median: 24 },
    day3TiersMean: '24.9',
    reqLvDay3Mean: '14.8',
    reqLvDay3P90: 17,
    perOrder: {
      unitsBought: '1.74', stageUnits: '1.36', subUnits: '2.32', dropUnits: '5.12',
      stageMetPct: 71, understockedPct: 46, noMaterialPct: 1,
      royalPct: '26.4', legendaryBonusPct: 93, winRatePct: 96,
    },
    goldPerOrder: { delivery: 701, battle: 60, sellback: 219, achievements: '12.1', matSpend: 73, upgrades: 84 },
  },
  'BASELINE frugal 8/day': {
    label: 'BASELINE frugal 8/day',
    runs: 400,
    maxOrders: 160,
    milestones: {
      allT3: { reached: 400, median: 2, p25: 2, p75: 2 },
      allT5: { reached: 400, median: 4, p25: 4, p75: 4 },
      known: { reached: 400, median: 1, p25: 1, p75: 1 },
      respected: { reached: 400, median: 1, p25: 1, p75: 1 },
      renowned: { reached: 400, median: 2, p25: 2, p75: 2 },
      legendary: { reached: 400, median: 2, p25: 2, p75: 3 },
    },
    firstL18: { reached: 400, median: 23 },
    day3TiersMean: '25.7',
    reqLvDay3Mean: '15.0',
    reqLvDay3P90: 18,
    perOrder: {
      unitsBought: '2.21', stageUnits: '1.16', subUnits: '2.75', dropUnits: '5.12',
      stageMetPct: 63, understockedPct: 55, noMaterialPct: 1,
      royalPct: '26.7', legendaryBonusPct: 93, winRatePct: 96,
    },
    goldPerOrder: { delivery: 675, battle: 60, sellback: 310, achievements: '12.1', matSpend: 41, upgrades: 84 },
  },
};

for (const scenario of BASELINE_SCENARIOS) {
  test(`baseline regression: ${scenario.label}`, () => {
    const summary = withHistoricalReimbursement(() => runScenario(scenario));
    assert.deepStrictEqual(summary, EXPECTED[scenario.label]);
  });
}

test('harness is deterministic at the pinned seeds', () => {
  const scenario = BASELINE_SCENARIOS[0];
  assert.deepStrictEqual(withHistoricalReimbursement(() => runScenario(scenario)), withHistoricalReimbursement(() => runScenario(scenario)));
});

// S5 P1: historical snapshots retain their original .32 economy context.
// Restore synchronously even on failure; production default stays .24.
import { BALANCE as historicalBalance } from '../../data/balance';
function withHistoricalReimbursement<T>(run: () => T): T {
  const previous = historicalBalance.materialValueReimburseRatio;
  try {
    historicalBalance.materialValueReimburseRatio = 0.32;
    return run();
  } finally {
    historicalBalance.materialValueReimburseRatio = previous;
  }
}
