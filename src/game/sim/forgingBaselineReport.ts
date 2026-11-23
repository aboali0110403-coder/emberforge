// S2 Stage A — Baseline measurement grid runner.
// Prints the full measurement grid as JSON on stdout. Deterministic: fixed
// seeds, fixed dt, seeded RNG per run (see forgingBenchmark.ts). Regenerate the
// Stage A record with: npm run sim:forging > evidence/forging-baseline.json
import {
  runCell,
  runCellIsolated,
  runForge,
  summarizeForges,
  STATION_IDS,
  PROFILE_IDS,
  type CellSummary,
} from './forgingBenchmark';
import type { StationId } from '../../types';

const RUNS_CELL = 200;
const RUNS_ISO = 100;
const RUNS_FORGE = 300;
const SEED_BASE = 20261123;

const grid: CellSummary[] = [];
for (const station of STATION_IDS) {
  for (const profile of PROFILE_IDS) {
    for (const tier of [1, 3, 5]) {
      for (const weaponLevel of [1, 10, 19]) {
        grid.push(runCell({ station, profile, tier, weaponLevel }, RUNS_CELL, SEED_BASE).summary);
      }
    }
  }
}

// Isolation: vary ONLY the station's own relevant equipment (anvil: anvil and
// hammer separately), everything else tier 1, weapon level 19.
const isoStations: [StationId, string][] = [
  ['furnace', 'furnace'], ['anvil', 'anvil'], ['anvil', 'hammer'],
  ['grindstone', 'grindstone'], ['quench', 'quench'], ['workbench', 'workbench'],
];
const isolation: CellSummary[] = [];
for (const [station, equip] of isoStations) {
  for (const profile of PROFILE_IDS) {
    for (const tier of [1, 5]) {
      isolation.push(runCellIsolated(station, profile, { [equip]: tier } as never, 19, RUNS_ISO, SEED_BASE));
    }
  }
}
// Cross-effect: anvil tier applied to stations that do not use an anvil.
const cross: CellSummary[] = [];
for (const station of ['furnace', 'grindstone', 'workbench', 'quench'] as StationId[]) {
  for (const profile of PROFILE_IDS) {
    for (const tier of [1, 5]) {
      cross.push(runCellIsolated(station, profile, { [station]: tier, anvil: tier } as never, 19, RUNS_ISO, SEED_BASE));
    }
  }
}

// Grindstone pointer route (real supported input): capped-speed tracking in the
// candidate, teleport in the baseline — measured, not assumed.
const pointer: CellSummary[] = [];
for (const profile of PROFILE_IDS) {
  for (const tier of [1, 5]) {
    for (const weaponLevel of [1, 19]) {
      pointer.push(runCell({ station: 'grindstone', profile, tier, weaponLevel, inputMode: 'pointer' }, RUNS_ISO, SEED_BASE).summary);
    }
  }
}

// Smith effect grid varies only Smith level, across progression endpoints.
const smith: CellSummary[] = [];
for (const station of STATION_IDS) for (const profile of PROFILE_IDS) for (const tier of [1,5]) for (const weaponLevel of [1,19]) for (const smithLevel of [1,20]) {
  smith.push(runCell({station,profile,tier,weaponLevel,smithLevel},RUNS_ISO,SEED_BASE).summary);
}
const propagation: unknown[] = [];
for (const profile of PROFILE_IDS) {
  for (const tier of [1, 3, 5]) {
    for (const weaponLevel of [1, 10, 19]) {
      const runs = runForge(profile, tier, weaponLevel, RUNS_FORGE, SEED_BASE);
      propagation.push({ profile, tier, weaponLevel, ...summarizeForges(runs) });
    }
  }
}

const smithPropagation: unknown[] = [];
for (const profile of PROFILE_IDS) for (const tier of [1,5]) for (const weaponLevel of [1,19]) for (const smithLevel of [1,20]) {
 smithPropagation.push({profile,tier,weaponLevel,smithLevel,...summarizeForges(runForge(profile,tier,weaponLevel,RUNS_ISO,SEED_BASE,smithLevel))});
}
console.log(JSON.stringify({
  meta: {
    runsCell: RUNS_CELL, runsIso: RUNS_ISO, runsForge: RUNS_FORGE,
    seedBase: SEED_BASE, dt: 1 / 60,
    generatedFrom: 'Use source-manifest.json to identify baseline or candidate overlay; no mechanics identity is inferred by the driver',
  },
  grid, isolation, cross, pointer, smith, propagation, smithPropagation,
}, null, 1));
