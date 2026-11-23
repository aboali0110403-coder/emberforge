import test from 'node:test';
import assert from 'node:assert/strict';
import{reputationSessions}from'./reputationHarness';
import{summarizeS4}from'./reputationPin';
const cases=[
 {
  "opts": {
   "label": "S4 selected",
   "qMean": 0.7,
   "qSd": 0.05,
   "ordersPerDay": 5,
   "frugal": false,
   "model": "gentle",
   "missRate": 0.02
  },
  "expected": {
   "milestones": {
    "known": {
     "reached": 100,
     "p10": 7,
     "p25": 7,
     "median": 8,
     "p75": 9,
     "p90": 10
    },
    "respected": {
     "reached": 100,
     "p10": 26,
     "p25": 31,
     "median": 40,
     "p75": 48,
     "p90": 56
    },
    "renowned": {
     "reached": 60,
     "p10": 100,
     "p25": 116,
     "median": 129,
     "p75": 148,
     "p90": 153
    },
    "legendary": {
     "reached": 0
    }
   },
   "source": {
    "battle": 47642,
    "delivery": 0,
    "milestone": 3912,
    "loss": 1765
   },
   "royal": 108,
   "generatedMilestoneAwards": 0
  }
 },
 {
  "opts": {
   "label": "S4 selected",
   "qMean": 0.85,
   "qSd": 0.05,
   "ordersPerDay": 5,
   "frugal": false,
   "model": "gentle",
   "missRate": 0.02
  },
  "expected": {
   "milestones": {
    "known": {
     "reached": 100,
     "p10": 4,
     "p25": 4,
     "median": 4,
     "p75": 5,
     "p90": 6
    },
    "respected": {
     "reached": 100,
     "p10": 16,
     "p25": 20,
     "median": 23,
     "p75": 28,
     "p90": 38
    },
    "renowned": {
     "reached": 100,
     "p10": 58,
     "p25": 70,
     "median": 82,
     "p75": 95,
     "p90": 107
    },
    "legendary": {
     "reached": 12,
     "p10": 131,
     "p25": 132,
     "median": 142,
     "p75": 151,
     "p90": 151
    }
   },
   "source": {
    "battle": 78220,
    "delivery": 0,
    "milestone": 4032,
    "loss": 1772
   },
   "royal": 894,
   "generatedMilestoneAwards": 0
  }
 },
 {
  "opts": {
   "label": "S4 selected",
   "qMean": 0.7,
   "qSd": 0.05,
   "ordersPerDay": 5,
   "frugal": true,
   "model": "gentle",
   "missRate": 0.02
  },
  "expected": {
   "milestones": {
    "known": {
     "reached": 100,
     "p10": 7,
     "p25": 7,
     "median": 8,
     "p75": 9,
     "p90": 10
    },
    "respected": {
     "reached": 100,
     "p10": 27,
     "p25": 30,
     "median": 40,
     "p75": 49,
     "p90": 56
    },
    "renowned": {
     "reached": 62,
     "p10": 102,
     "p25": 116,
     "median": 126,
     "p75": 147,
     "p90": 151
    },
    "legendary": {
     "reached": 0
    }
   },
   "source": {
    "battle": 47847,
    "delivery": 0,
    "milestone": 3688,
    "loss": 1760
   },
   "royal": 123,
   "generatedMilestoneAwards": 0
  }
 },
 {
  "opts": {
   "label": "S4 selected",
   "qMean": 0.85,
   "qSd": 0.05,
   "ordersPerDay": 5,
   "frugal": true,
   "model": "gentle",
   "missRate": 0.02
  },
  "expected": {
   "milestones": {
    "known": {
     "reached": 100,
     "p10": 4,
     "p25": 4,
     "median": 4,
     "p75": 5,
     "p90": 6
    },
    "respected": {
     "reached": 100,
     "p10": 16,
     "p25": 20,
     "median": 23,
     "p75": 28,
     "p90": 40
    },
    "renowned": {
     "reached": 100,
     "p10": 61,
     "p25": 71,
     "median": 83,
     "p75": 97,
     "p90": 107
    },
    "legendary": {
     "reached": 13,
     "p10": 122,
     "p25": 141,
     "median": 150,
     "p75": 155,
     "p90": 158
    }
   },
   "source": {
    "battle": 78309,
    "delivery": 0,
    "milestone": 3720,
    "loss": 1754
   },
   "royal": 875,
   "generatedMilestoneAwards": 0
  }
 }
] as const;
for(const c of cases)test(`S4 selected production reputation Q${c.opts.qMean}, frugal=${c.opts.frugal}`,()=>assert.deepEqual(summarizeS4(withHistoricalReimbursement(() => reputationSessions(c.opts,100))),c.expected));

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
