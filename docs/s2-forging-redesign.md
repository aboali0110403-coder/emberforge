# Emberforge S2: measured forging mastery redesign

Date: 23 November 2026. Base: integration/v0.3-v3-1 at cd18ede5fdb20e9f669d604b9b1174440aead2af. All implementation changes remain uncommitted. No S3, dependency install/update, economy/order/material/save-schema change, asset replacement, commit, push, merge or deployment.

## What changed and why

The recorded baseline let equipment widen PERFECT and add unconditional accuracy. The first S2 candidate narrowed windows but still made PERFECT routine for good execution. This edition compares multiple candidate sets and tests a defensible separation: progression makes GOOD more reliable; precision is earned by execution.

The provisional criterion below is the implementer's design judgment, not an owner-supplied acceptance threshold or a human-playtest result:

- Average synthetic execution: at most 20% discrete PERFECT; good: at most 40%, with GOOD more common than PERFECT and GOOD-or-better at least 95%.
- Exceptional execution earns more PERFECT than good execution in matched cells. It need not be rare for the explicitly exceptional profile, but must not be guaranteed by upgrades.
- Good continuous-station mean accuracy stays below .95 and above .80; exceptional center tracking has a measurable advantage. Full accuracy remains mathematically achievable with exact tracking.
- Check tiers 1/3/5, weapon levels 1/10/19, Smith endpoints, independent seeds and frame-rate sensitivity. Retain poor execution's failures rather than inflate it with floors.

All tested discrete cells meet these provisional bounds. This is evidence that the candidate is defensible, not proof of human feel or a claim that the owner has accepted the design.

## Exact selected mechanics

Difficulty = min(1,(weaponLevel-1)/18). Smith assistance caps at 19 levels above level 1.

- Anvil PERFECT: abs(ringProgress-.85) <= .008. Earlier candidate .075; baseline .11 plus .02 per hammer tier above 1. GOOD stays .24 + hammer bonus + .025 per anvil tier above 1 + .004 per Smith level above 1. Miss score flat .30. Existing strike count, animation and ring speed remain.
- Quench PERFECT: abs(temp-midpoint) <= .005, independent of equipment/Smith. GOOD half-width = nominal band half-width * (1.15 + .1 per quench tier above 1) + .004 per Smith level above 1. Cooling .34 + difficulty*.10 per second. Existing 14-second duration is enforced. Held input auto-releases near the cold limit; never-start input finishes as a miss.
- Workbench BIND PERFECT: abs(bindPulse-.8) <= .018. GOOD stays .28 + .025 per workbench tier above 1 + Smith assistance. Pulse speed .92 + difficulty*.25; beats 6 + min(2,floor(weaponLevel/8)). FIT remains untimed and is not mislabeled as PERFECT.
- Furnace outer band = .24 - difficulty*.075 + .015 per furnace tier above 1 + .0015 per Smith level above 1. Its fixed .04-wide center stripe earns precision. Accuracy = .32 + .48*outer-band time share + .20*center time share - existing scorch penalty, clamped as before.
- Grindstone outer width = .28 - difficulty*.075 + .015 per grindstone tier above 1 + Smith width assistance. Fixed .04 center stripe earns precision. Accuracy = .30 + .50*outer-zone share + .20*center share. Pointer moves at most 1.2 units/second toward its target instead of teleporting. Keyboard remains .58.
- Removed unconditional +.02 per anvil tier above 1 from station completion. Quality aggregation, grade thresholds, leveling and stat pipelines remain unchanged. The continuous precision contribution changes station accuracy only.
- Rendered anvil/BIND highlights use their scoring constants. Furnace/grindstone show fixed center stripes. Quench shows the actual GOOD scoring band and a narrow yellow PERFECT stripe above the temperature fill; its instruction distinguishes blue GOOD from yellow PERFECT. Existing art remains unchanged.

## Candidate comparison and choice

Same profiles, seeds and real runtimes, 100 runs per endpoint cell. Maximum PERFECT across tiers 1/5 and levels 1/19 (Smith 1); workbench here uses the older FIT+BIND aggregate for initial sweep comparability, not the final BIND-only metric:

| Window set (anvil/quench/BIND) | Avg anvil / good anvil | Avg quench / good quench | Avg workbench / good workbench |
|---|---|---|---|
| .020/.008/.025 | 22.6% / 60.8% | 19.0% / 45.0% | 8.9% / 24.9% |
| .012/.005/.018 | 13.5% / 38.1% | 11.0% / 27.0% | 5.3% / 16.6% |
| .008/.0035/.012 | 10.1% / 24.9% | 6.0% / 15.0% | 2.8% / 8.6% |

The .020 anvil window still gave good execution up to 60.8% PERFECT. The .012 anvil candidate passed 60-Hz checks but reached 52.9% at 30 Hz in an additional seed-family sweep. The final .008 anvil width removes that observed quantization spike; quench .005 and BIND .018 retain more precision opportunity than the narrower alternative while meeting the criterion. No claim is made that these are uniquely optimal values.

For continuous scoring, .02/.04/.06 center widths were compared. .02 reduced good furnace accuracy to .823-.839, making the precision share too hard to earn. .06 gave exceptional furnace .966-.984 and grindstone .992, near-saturation. .04 retains good performance without flattening good and exceptional together. These are measured tradeoffs, not a new economy retune.

## Before/after discrete execution

Maximum PERFECT over the full 180-cell station grid, Smith 1. Workbench uses BIND-only judgments, excluding FIT:

| Station | Profile | Baseline max PERFECT | Selected max PERFECT |
|---|---|---|---|
| anvil | poor | 57.8% | 1.2% |
| anvil | average | 93.2% | 8.9% |
| anvil | good | 98.1% | 26.3% |
| anvil | exceptional | 99.8% | 56.3% |
| quench | poor | 27.0% | 1.0% |
| quench | average | 95.0% | 7.0% |
| quench | good | 100.0% | 21.5% |
| quench | exceptional | 100.0% | 52.5% |
| workbench | poor | 29.7% | 0.9% |
| workbench | average | 89.0% | 8.1% |
| workbench | good | 98.3% | 27.3% |
| workbench | exceptional | 99.8% | 57.3% |

Good GOOD-or-better minima across the full grid: anvil 98.1%, quench 100%, BIND 98.3%. Thus less PERFECT became mainly GOOD, not repeated failure for good execution.

Independent 200-run checks use seed bases 777, 424242 and 20261123; additional 30/120-Hz checks use 777. Their full summaries are in measurements/. At 30 Hz the final good PERFECT maxima are 25.7% anvil, 26.0% quench, 29.3% BIND; at 120 Hz 24.6%, 27.5%, 30.4%. The independent-seed and Smith-endpoint checks also pass. This tests sensitivity, not universal frame-rate invariance.

## Continuous-station results

Mean accuracy, tier 5 / weapon level 19 / Smith 1:

| Station | Profile | Baseline | Selected |
|---|---|---|---|
| furnace | poor | 0.985 | 0.730 |
| furnace | average | 1.000 | 0.843 |
| furnace | good | 1.000 | 0.863 |
| furnace | exceptional | 1.000 | 0.941 |
| grindstone | poor | 0.984 | 0.732 |
| grindstone | average | 1.000 | 0.852 |
| grindstone | good | 1.000 | 0.899 |
| grindstone | exceptional | 1.000 | 0.952 |

Pointer grindstone at tier 5 / level 19: poor accuracy 0.748; average accuracy 0.812; good accuracy 0.860; exceptional accuracy 0.980. Keyboard and pointer need not have identical accuracy; both now require center precision for the last 20%, and both were measured. Pointer tracking is no longer a teleport. No-input and exact-center focused tests pin the boundary properties.

## Upgrade and Smith effects

Only the named equipment changes in isolation runs, while other equipment remains tier 1. All isolated and cross-effect results are in the JSON. Fixed PERFECT widths do not grow with equipment, though a slower hammer ring legitimately changes time available. Cross-station unconditional anvil bonuses are removed. Width/GOOD assistance remains local.

Average execution, tier 1 / weapon level 19, Smith 1 -> 20, mean accuracy:

- furnace: 0.747 -> 0.806.
- anvil: 0.727 -> 0.735.
- grindstone: 0.828 -> 0.843.
- quench: 0.832 -> 0.838.
- workbench: 0.692 -> 0.703.

Smith's gain is largest when width assistance rescues imperfect continuous tracking; fixed precision bands do not widen. Separate Smith propagation runs preserve the resulting grade/level/stat effects for review.

## Quality propagation, not assumed Q

Canonical edge/blade sequence, real evaluateLevelUp and applyForgeUpgradesToWeapon, 300 runs/profile, reference material stack as defined in the harness. Mean station accuracies are combined by the existing pipeline, not sampled from an assumed quality distribution.

Tier 5 / weapon level 19:

| Profile | Baseline Q | Selected Q | Baseline S | Selected S | Selected A/B/C/D | Selected level chance | Selected double jump |
|---|---|---|---|---|---|---|---|
| poor | 0.889 | 0.709 | 10.3% | 0.0% | 0.0%/98.3%/1.7%/0.0% | 46.0% | 0.0% |
| average | 0.995 | 0.817 | 100.0% | 0.0% | 44.0%/56.0%/0.0%/0.0% | 51.9% | 0.0% |
| good | 1.000 | 0.848 | 100.0% | 0.0% | 100.0%/0.0%/0.0%/0.0% | 53.7% | 0.0% |
| exceptional | 1.000 | 0.902 | 100.0% | 8.3% | 91.7%/0.0%/0.0%/0.0% | 56.6% | 0.3% |

S-grade is intentionally no longer normal good execution at max level. This reduces level-up/double-jump outcomes through existing quality rules without changing those rules. Lower expected yields are a consequence to review in S3, not permission to retune gold/economy here. The complete tier/level grade distributions, quality quartiles, level chances and power-delta means are retained in both JSONs.

## Verification and evidence

- 772/772 tests across the 24 files listed in testfiles.txt. Includes 15 S2 tests, focused quench never-start/held boundaries, pointer speed, exact precision attainability, rarity across progression/Smith values and real downstream propagation.
- Accepted S0 harness 5/5, source/test/docs byte-identical; package.json retains its exact script and adds only sim:forging relative to accepted S0.
- TypeScript noEmit clean; Vite production build successful, with the existing configLoader and chunk-size warnings. Existing dependencies only: Node 22.23.5, tsx 4.23.15, TypeScript 7.0.2, Vite 8.3.8.
- Existing scenario goldens updated only where S2 intentionally changed station scoring: four continuous station scenarios and the prior two workbench scenarios. No S0 assertion was edited.
- Actual Chrome Canvas2D captures inspected for all five stations, with loaded game assets. BIND is reached through FIT clicks using the real handler. Anvil/BIND inside and outside PERFECT states are included. Quench banner overflow was corrected and recaptured. These are isolated-scene checks, not a complete menu-to-forge playthrough.
- Baseline expanded-driver original summary values exactly match the preserved driver-v2 grid. Baseline mechanics remain immutable; richer BIND-only/Smith output adds measurements, not baseline changes.

## Changed files

- src/canvas/minigames.ts: scoped mechanics and scoring/indicator communication.
- src/canvas/GameCanvas.tsx: pass actual Smith level.
- src/game/forgeInsightReport.test.ts: documented scoring-golden changes.
- src/game/sim/forgingBenchmark.ts, forgingBenchmark.test.ts, forgingBaselineReport.ts: deterministic driver, explicit BIND-only/precision metrics, grids/tests.
- docs/s2-forging-baseline.md, docs/s2-forging-redesign.md: measurement/design record.
- package.json: sim:forging script, accepted S0 script retained.

## Limits and remaining concerns

Synthetic profiles are timing/scatter/delay models, not validated human-skill classifications. The provisional criterion is a design judgment. Exceptional play can still make PERFECT common, but upgrades alone do not widen its precision window. Tight anvil/quench windows are on the order of a frame; 30/60/120-Hz tests reduce one known quantization risk but do not prove device latency or accessibility. Physical playtesting must assess whether aiming for GOOD feels fair and chasing PERFECT feels rewarding rather than frustrating.

FIT remains intentionally untimed and can await input. The benchmark exact-click safety after 12 failed attempts is counted as fitForcedMean (mean count/run, not fraction of slots). Its rate and per-profile failures remain visible. Workbench aggregate judgments mix FIT/BIND; use bindPerfectFrac/bindGoodFrac/bindMissFrac for mastery claims. Furnace/grindstone have continuous accuracy, not discrete PERFECT events; zero discrete judgment columns are not failure. No claim of all possible input strategies being exhausted is made.

No S3 work has begun. Stop after implementation and verification for Technical Director review.
