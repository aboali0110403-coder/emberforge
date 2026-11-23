/** S3 selected production model, not the historical S0 baseline.
 * Identical S0 seed, synthetic quality and purchasing assumptions, with
 * independently recorded candidate outputs. See docs/s3-capability-progression.md. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { S3_SCENARIOS, runScenario } from './orderProgressionHarness';
const EXPECTED = [
  {
    "label": "S3 candidate buyer 5/day",
    "runs": 400,
    "maxOrders": 160,
    "milestones": {
      "allT3": {
        "reached": 400,
        "median": 4,
        "p25": 4,
        "p75": 4
      },
      "allT5": {
        "reached": 400,
        "median": 10,
        "p25": 10,
        "p75": 10
      },
      "known": {
        "reached": 400,
        "median": 1,
        "p25": 1,
        "p75": 1
      },
      "respected": {
        "reached": 400,
        "median": 2,
        "p25": 1,
        "p75": 2
      },
      "renowned": {
        "reached": 400,
        "median": 3,
        "p25": 3,
        "p75": 4
      },
      "legendary": {
        "reached": 400,
        "median": 5,
        "p25": 5,
        "p75": 6
      }
    },
    "firstL18": {
      "reached": 400,
      "median": 74
    },
    "day3TiersMean": "16.8",
    "reqLvDay3Mean": "5.3",
    "reqLvDay3P90": 7,
    "perOrder": {
      "unitsBought": "1.76",
      "stageUnits": "1.72",
      "subUnits": "1.95",
      "dropUnits": "4.74",
      "stageMetPct": 77,
      "understockedPct": 40,
      "noMaterialPct": 1,
      "royalPct": "25.1",
      "legendaryBonusPct": 84,
      "winRatePct": 96
    },
    "goldPerOrder": {
      "delivery": 658,
      "battle": 57,
      "sellback": 173,
      "achievements": "12.1",
      "matSpend": 79,
      "upgrades": 84
    }
  },
  {
    "label": "S3 candidate frugal 5/day",
    "runs": 400,
    "maxOrders": 160,
    "milestones": {
      "allT3": {
        "reached": 400,
        "median": 4,
        "p25": 3,
        "p75": 4
      },
      "allT5": {
        "reached": 400,
        "median": 9,
        "p25": 9,
        "p75": 10
      },
      "known": {
        "reached": 400,
        "median": 1,
        "p25": 1,
        "p75": 1
      },
      "respected": {
        "reached": 400,
        "median": 2,
        "p25": 1,
        "p75": 2
      },
      "renowned": {
        "reached": 400,
        "median": 3,
        "p25": 3,
        "p75": 4
      },
      "legendary": {
        "reached": 400,
        "median": 5,
        "p25": 5,
        "p75": 6
      }
    },
    "firstL18": {
      "reached": 400,
      "median": 75
    },
    "day3TiersMean": "17.0",
    "reqLvDay3Mean": "5.3",
    "reqLvDay3P90": 7,
    "perOrder": {
      "unitsBought": "2.26",
      "stageUnits": "1.46",
      "subUnits": "2.48",
      "dropUnits": "4.72",
      "stageMetPct": 67,
      "understockedPct": 51,
      "noMaterialPct": 1,
      "royalPct": "25.1",
      "legendaryBonusPct": 83,
      "winRatePct": 96
    },
    "goldPerOrder": {
      "delivery": 625,
      "battle": 57,
      "sellback": 266,
      "achievements": "12.1",
      "matSpend": 48,
      "upgrades": 84
    }
  },
  {
    "label": "S3 candidate buyer 8/day",
    "runs": 400,
    "maxOrders": 160,
    "milestones": {
      "allT3": {
        "reached": 400,
        "median": 3,
        "p25": 2,
        "p75": 3
      },
      "allT5": {
        "reached": 400,
        "median": 6,
        "p25": 6,
        "p75": 7
      },
      "known": {
        "reached": 400,
        "median": 1,
        "p25": 1,
        "p75": 1
      },
      "respected": {
        "reached": 400,
        "median": 1,
        "p25": 1,
        "p75": 1
      },
      "renowned": {
        "reached": 400,
        "median": 2,
        "p25": 2,
        "p75": 3
      },
      "legendary": {
        "reached": 400,
        "median": 4,
        "p25": 3,
        "p75": 4
      }
    },
    "firstL18": {
      "reached": 400,
      "median": 74
    },
    "day3TiersMean": "19.9",
    "reqLvDay3Mean": "7.5",
    "reqLvDay3P90": 9,
    "perOrder": {
      "unitsBought": "1.75",
      "stageUnits": "1.72",
      "subUnits": "1.95",
      "dropUnits": "4.74",
      "stageMetPct": 76,
      "understockedPct": 40,
      "noMaterialPct": 1,
      "royalPct": "25.0",
      "legendaryBonusPct": 83,
      "winRatePct": 96
    },
    "goldPerOrder": {
      "delivery": 657,
      "battle": 57,
      "sellback": 171,
      "achievements": "12.1",
      "matSpend": 76,
      "upgrades": 84
    }
  },
  {
    "label": "S3 candidate frugal 8/day",
    "runs": 400,
    "maxOrders": 160,
    "milestones": {
      "allT3": {
        "reached": 400,
        "median": 2,
        "p25": 2,
        "p75": 3
      },
      "allT5": {
        "reached": 400,
        "median": 6,
        "p25": 6,
        "p75": 6
      },
      "known": {
        "reached": 400,
        "median": 1,
        "p25": 1,
        "p75": 1
      },
      "respected": {
        "reached": 400,
        "median": 1,
        "p25": 1,
        "p75": 1
      },
      "renowned": {
        "reached": 400,
        "median": 2,
        "p25": 2,
        "p75": 3
      },
      "legendary": {
        "reached": 400,
        "median": 4,
        "p25": 3,
        "p75": 4
      }
    },
    "firstL18": {
      "reached": 400,
      "median": 75
    },
    "day3TiersMean": "20.2",
    "reqLvDay3Mean": "7.5",
    "reqLvDay3P90": 9,
    "perOrder": {
      "unitsBought": "2.26",
      "stageUnits": "1.47",
      "subUnits": "2.48",
      "dropUnits": "4.73",
      "stageMetPct": 67,
      "understockedPct": 51,
      "noMaterialPct": 1,
      "royalPct": "24.9",
      "legendaryBonusPct": 83,
      "winRatePct": 96
    },
    "goldPerOrder": {
      "delivery": 623,
      "battle": 57,
      "sellback": 264,
      "achievements": "12.1",
      "matSpend": 48,
      "upgrades": 84
    }
  }
] as const;
for (const [i,scenario] of S3_SCENARIOS.entries()) {
 test(`S3 production progression: ${scenario.label}`,()=>assert.deepStrictEqual(withHistoricalReimbursement(() => runScenario(scenario)),EXPECTED[i]));
}
test('S3 production scenario is deterministic at the pinned S0 seeds',()=>{
 assert.deepStrictEqual(withHistoricalReimbursement(() => runScenario(S3_SCENARIOS[0])),withHistoricalReimbursement(() => runScenario(S3_SCENARIOS[0])));
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
