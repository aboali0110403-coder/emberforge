# Emberforge S4: popularity and reputation

23 November 2026. Implemented and verified for Technical Director review. S4 is a candidate, not accepted by this report. Stop before S5.

## Result

Reputation now rewards sustained quality-weighted battle performance, with diminishing positive returns as a kingdom's reputation rises. Losses and missed orders have fixed, bounded consequences. Raw weapon level no longer directly multiplies reputation. Royal wins retain a modest premium. Freshly generated high-level weapons no longer repeatedly earn a weapon-milestone reputation windfall.

In 100 seeded buyer runs per profile, Renowned moves from a median 18 to 237 attempts for the average synthetic profile, 13 to 92 for good, and 12 to 63 for exceptional. Legendary remains reached in all 100 runs within the 800-attempt horizon for those profiles, with medians 602, 230 and 154. These are attempts, not hours or measured human pacing. Full percentile/reach counts and caveats follow.

The accepted S3 capability-aware generator is byte-identical. S0, S2 and S3 assertion files are unchanged and passing. No save schema, migrations, economy coefficients, combat, material, forging, dependency or asset changes. No installs, commits, pushes, merges or deployment.

## Authorized baseline and preservation

Repository `aboali0110403-coder/emberforge`, branch `integration/v0.3-v3-1`, historical HEAD `cd18ede5fdb20e9f669d604b9b1174440aead2af`, plus accepted cumulative V0.3, V2, V3-1, frozen S0, S2 and S3. Accepted pre-S4 source is preserved separately in this evidence.

The TD authorized S4 measurement, comparison, reputation-only changes and verification. A disposable trial changing only battle reputation failed all four S0 and four S3 full-session assertions, with both determinism checks still passing. These harnesses still depended on the live battle reward function. In direct reply to the explicit historical-routing question, the TD approved extending their frozen boundary to accepted pre-S4 reputation behavior.

Only the accepted historical harness imports now route to an exact pre-S4 battle resolver. Full assertion files, seeds, assumptions and S3 order formula remain unchanged. The original function body is retained byte-for-byte. New S4 regressions are distinct; no historical expectations were overwritten and no competing baseline was created.

## Stage A: every reputation source and consumer

| Source/path | Accepted pre-S4 behavior | S4 behavior |
|---|---|---|
| Battle win, `resolveBattleOutcome` | `max(2,round((14 + 1.4*weaponLevel + gradeBonus)*(0.6 + 0.6*Q)*royalFactor))`, royal factor1.4 | Quality base, modest royal premium, current-reputation decay |
| Battle loss | -2 only for D; all other grades0 | -5 for D, -3 for other grades |
| Delivery quality | D-4; positive grade bonuses enter battle formula, not delivery directly | D-3; no unconditional positive delivery award |
| Weapon milestone notification | +35 for fresh notification at weapon10/15/20, even when generated above tier | +8 only for an earned crossing and first recognized kingdom/tier award |
| Missed order, tick and Skip Night | -10 floored at0; tutorial excluded | -8 floored at0; tutorial exclusion unchanged |
| Achievements | Gold only, no direct reputation award | Same gold amounts and achievement definitions |
| Debug resource action | Adds30 to all kingdoms by explicit debug button | Preserved as a non-gameplay override; excluded from measurements |
| Import/reset | Imports saved reputation or starts initial state | Same; no retrospective recalculation |

Reputation is per kingdom. Thresholds remain Known25, Respected70, Renowned140, Legendary240. Progressive race unlocks remain at Known25 in sequence. Renowned140 still enables Royal eligibility and epic rotating-shop access. The accepted S3 model still uses bounded popularity access `min(1,popularity/240)` worth at most0.5 center level. Kingdom-map and HUD displays consume the same reputation values. There is no new reputation currency or system.

### Lifecycle finding: weapon milestones are not reputation tiers

Weapon-level milestones10/15/20 are distinct from kingdom reputation tiers25/70/140/240. Previously, `createWeaponInstance` gave every newly generated order an empty `legendaryNotifiedLevels` list. Delivery checked only the weapon's current selected tier and notification history. A fresh level15 or18 weapon therefore qualified for +35, a letter and a legendary-forged count even without crossing any threshold. Per-weapon suppression prevented repeating the same marked notification but did not prevent the stream of fresh high-level order weapons from triggering again.

This is different from duplicate battle claiming. Existing battle results persist exactly once and claims consume the pending entry atomically. Those protections were retained. No attack, duplicate network reward or storage corruption is assumed.

In initial 160-attempt buyer traces over100runs, fresh already-at-tier notifications appeared 8,693/11,258/12,466/13,117 times for synthetic poor/average/good/exceptional profiles, versus actual threshold crossings480/550/591/588. These are notification eligibility events, not reputation-tier achievements. The old per-attempt mean +35-source contribution was20.07/25.83/28.56/29.98 reputation. Battle contributions were19.55/33.71/42.13/49.89, showing why removing only unearned milestone rewards is insufficient.

## Compared models and selection

Four models were compared with identical seeds, initial state and policy assumptions. Every model uses the accepted S3 generator; no formula redesign occurred.

| Model | Change | Finding |
|---|---|---|
| Historical pre-S4 | Original reputation and fresh-weapon notifications | Runaway battle and notification gains |
| Crossing only | +35 only on earned weapon crossing; battle model otherwise unchanged | Cleans lifecycle but barely slows average/good/exceptional reputation |
| Strict sustained | Win bases S7/A5/B3/C1/D0, reciprocal decay `1/(1+rep/100)` | Average Legendary remains unreached in800 attempts; rejected as too restrictive for this candidate |
| Gentle sustained, selected | Win bases S9/A7/B4/C2/D0, inverse-square-root decay | Differentiates performance and keeps average+ Legendary reachable in measured horizon |

Strict and selected candidates also include -3 ordinary loss/-5 flawed loss, D-delivery-3 and earned first kingdom/weapon-tier+8. Strict miss penalty6 and selected8 were compared. Historical/crossing-only retain miss10. No final coefficients were selected before measurements.

### Selected rules, exact coefficients

- Winning reputation: `round(gradeBase * royalFactor / sqrt(1 + max(0,currentKingdomRep)/100))`. Positive grade bases have a minimum of1. D base is0, with no minimum award. Bases are S9, A7, B4, C2, D0. Royal factor1.25, otherwise1.
- Loss: -3 for S/A/B/C, -5 for D. Flawed delivery adds-3 separately. All applications floor reputation at0.
- Miss: -8, once per expired non-tutorial order, including Skip Night's existing expiry handling.
- Earned weapon crossing: original level must be below the selected10/15/20 threshold and delivered level at/above it. Existing per-weapon history guards repeat notification. A freshly generated level15/18/20 weapon delivered at that level is not an earned crossing.
- Kingdom milestone reputation: +8 only if existing permanent letters for that kingdom contain no recognized equal-or-higher weapon tier. There can be at most three such reputation awards per kingdom on a normal fresh progression. A repeated genuine crossing may still create a letter and forged count, but earns0 reputation if already recognized.
- Reputation thresholds and race/Royal access conditions are unchanged. Weapon-level rewards, gold values, drop multiplier and combat formulas are not retuned. Crossing eligibility can delay existing related achievements/letters; that is an intentional milestone-lifecycle consequence, not a new gold coefficient.

### Diminishing returns and challenge sensitivity

| Current kingdom reputation | C win | B win | A win | S win | Royal S win |
|---|---|---|---|---|---|
| 0 | 2 | 4 | 7 | 9 | 11 |
| 25 | 2 | 4 | 6 | 8 | 10 |
| 70 | 2 | 3 | 5 | 7 | 9 |
| 140 | 1 | 3 | 5 | 6 | 7 |
| 240 | 1 | 2 | 4 | 5 | 6 |
| 500 | 1 | 2 | 3 | 4 | 5 |

Weapon level is no longer a direct reputation multiplier. Quality and Royal work matter, and earned threshold crossings reward challenge. There is no new level-versus-Smith difficulty bonus in S4. The S3 order generator already aligns capability; this report does not claim perfect challenge pricing. Diminishing returns depend on current kingdom reputation, not a new persistent win streak. This avoids adding save state but does not distinguish two different win histories ending at the same reputation.

## Before/after reputation milestone distributions

100 runs per model/profile/policy,800attempts/run. Table entries are p10 / median / p90 attempt counts and reached runs. p25/p75 are also retained in JSON. Quantiles use sorted reached runs at index floor((n-1)*q). A censored run is not assigned a fake completion at800. Conditional quantiles are never a population median when fewer than half reach.

Synthetic buyer profile assumptions: poor Q~N(.40,.10),20%miss; average N(.70,.07),8%miss; good N(.85,.05),2%miss; exceptional N(.96,.02),0%miss. Q is clamped0..1. These labels are not measured player categories and the deliberately harsh poor profile is not the accepted S2 poor benchmark.

| Profile | Model | Known25 | Respected70 | Renowned140 | Legendary240 |
|---|---|---|---|---|---|
| poor | historical | 2/4/10 (100/100) | 13/22/31 (100/100) | 28/41/49 (100/100) | 44/52/59 (100/100) |
| poor | crossingOnly | 2/4/10 (100/100) | 13/22/34 (100/100) | 28/43/54 (100/100) | 51/65/80 (100/100) |
| poor | sustained | Not reached (0/100) | Not reached (0/100) | Not reached (0/100) | Not reached (0/100) |
| poor | gentle | Not reached (0/100) | Not reached (0/100) | Not reached (0/100) | Not reached (0/100) |
| average | historical | 2/2/2 (100/100) | 4/7/10 (100/100) | 12/18/24 (100/100) | 23/32/37 (100/100) |
| average | crossingOnly | 2/2/2 (100/100) | 4/7/10 (100/100) | 12/18/24 (100/100) | 23/33/41 (100/100) |
| average | sustained | 9/11/19 (100/100) | 60/97/167 (100/100) | 482/597/731 (93/100) | Not reached (0/100) |
| average | gentle | 7/8/10 (100/100) | 38/61/84 (100/100) | 157/237/301 (100/100) | 502/602/695 (100/100) |
| good | historical | 2/2/2 (100/100) | 4/6/8 (100/100) | 9/13/19 (100/100) | 19/24/30 (100/100) |
| good | crossingOnly | 2/2/2 (100/100) | 4/6/8 (100/100) | 9/13/19 (100/100) | 19/25/33 (100/100) |
| good | sustained | 6/7/9 (100/100) | 28/42/66 (100/100) | 169/218/265 (100/100) | 483/561/603 (100/100) |
| good | gentle | 4/5/6 (100/100) | 17/24/37 (100/100) | 66/92/119 (100/100) | 184/230/262 (100/100) |
| exceptional | historical | 1/1/2 (100/100) | 3/4/8 (100/100) | 8/12/16 (100/100) | 16/21/25 (100/100) |
| exceptional | crossingOnly | 1/1/2 (100/100) | 3/4/8 (100/100) | 8/12/16 (100/100) | 16/21/25 (100/100) |
| exceptional | sustained | 4/5/6 (100/100) | 20/28/42 (100/100) | 94/124/151 (100/100) | 292/334/363 (100/100) |
| exceptional | gentle | 3/3/4 (100/100) | 13/18/29 (100/100) | 43/63/78 (100/100) | 118/154/178 (100/100) |

### Material-purchasing sensitivity, selected model

Frugal and buyer rules are the accepted session policies, not redesigned purchasing. All reported average/good/exceptional cells reach Legendary100/100; poor remains0/100.

| Profile | Policy | Renowned p10/median/p90 | Legendary p10/median/p90 |
|---|---|---|---|
| average | buyer | 157/237/301 (100/100) | 502/602/695 (100/100) |
| average | frugal | 172/239/282 (100/100) | 498/602/695 (100/100) |
| good | buyer | 66/92/119 (100/100) | 184/230/262 (100/100) |
| good | frugal | 68/93/117 (100/100) | 188/231/261 (100/100) |
| exceptional | buyer | 43/63/78 (100/100) | 118/154/178 (100/100) |
| exceptional | frugal | 44/66/81 (100/100) | 126/152/177 (100/100) |

### Source contribution, 800-attempt buyer sessions

Mean totals per run. Battle is a signed sum including battle losses. Delivery is signed. Miss loss is the actual amount removed after the zero floor, shown positive. Weapon-tier award is not a reputation-tier award. These are source accounting totals, not independent causal effects; changing reputation also changes customer/race mix and downstream session state.

| Profile | Model | Battle signed | Flawed delivery | Weapon-tier award | Miss loss removed |
|---|---|---|---|---|---|
| poor | historical | 19235.67 | -1769.24 | 21130.55 | 1586.67 |
| poor | gentle | 256.46 | -1331.52 | 14.16 | 152.83 |
| average | historical | 30381.28 | -0.48 | 24747.80 | 627.90 |
| average | gentle | 1668.08 | -0.30 | 38.48 | 498.95 |
| good | historical | 37063.90 | 0.00 | 26514.95 | 160.00 |
| good | gentle | 2611.45 | 0.00 | 40.80 | 127.44 |
| exceptional | historical | 43229.16 | 0.00 | 27196.75 | 0.00 |
| exceptional | gentle | 3353.78 | 0.00 | 40.00 | 0.00 |

### Early/mid/late reputation and Royal access

The next table is selected-model buyer snapshot p10/median/p90 of the highest kingdom reputation. These are attempt-index snapshots, not elapsed gameplay stages. Royal rate is cumulative generated Royal orders divided by attempts, including generated orders later missed.

| Profile | Attempt | Highest kingdom p10/median/p90 | Royal rate |
|---|---|---|---|
| poor | 20 | 0/0/2 | 0.0% |
| poor | 80 | 0/0/5 | 0.0% |
| poor | 160 | 0/0/2 | 0.0% |
| poor | 400 | 0/0/3 | 0.0% |
| poor | 800 | 0/0/2 | 0.0% |
| average | 20 | 28/38/47 | 0.0% |
| average | 80 | 64/81/104 | 0.0% |
| average | 160 | 93/112/135 | 0.1% |
| average | 400 | 170/187/209 | 4.3% |
| average | 800 | 260/287/316 | 16.0% |
| good | 20 | 48/63/77 | 0.0% |
| good | 80 | 107/129/151 | 0.2% |
| good | 160 | 168/189/218 | 3.9% |
| good | 400 | 323/344/372 | 18.4% |
| good | 800 | 530/553/588 | 24.2% |
| exceptional | 20 | 61/71/98 | 0.0% |
| exceptional | 80 | 142/160/186 | 1.8% |
| exceptional | 160 | 221/245/281 | 10.6% |
| exceptional | 400 | 439/457/486 | 22.2% |
| exceptional | 800 | 706/727/759 | 26.0% |

S3 remains byte-identical and uses the changing reputation state normally. Slower race unlocks and Royal eligibility therefore alter the customer mix and requested levels indirectly without redesigning its formula. Early customer access remains attainable for average+ profiles; the isolated poor/no-miss results below show it is not a permanent locked state. Renowned and Legendary no longer arrive routinely within a few good deliveries.

## Poor quality, misses, losses and recovery

The harsh Q.40/20%miss synthetic profile stays near the zero floor. Its D-delivery penalties and misses overwhelm tiny positive C/B results; D wins themselves earn0. This is not a claim that accepted S2 poor execution produces Q.40. Accepted S2 closed-loop poor proxy means were around.66, with weapon-geometry and station-mean limitations already disclosed in S3.

To separate effects,40runs/cell use fixed synthetic mean Q.60/.66/.70, SD.04 and independently varied miss rate. Values below are Legendary reach count/40 and conditional p10/median/p90 among reachers; all runs are right-censored at800attempts if unreached.

| Mean Q | Miss rate | Renowned reached/40 | Legendary reached/40 | Legendary conditional p10/median/p90 |
|---|---|---|---|---|
| 0.60 | 0% | 40 | 20 | 658/745/788 |
| 0.60 | 8% | 29 | 0 | Not reached |
| 0.60 | 20% | 0 | 0 | Not reached |
| 0.66 | 0% | 40 | 40 | 397/477/525 |
| 0.66 | 8% | 40 | 25 | 608/731/777 |
| 0.66 | 20% | 12 | 0 | Not reached |
| 0.70 | 0% | 40 | 40 | 330/402/440 |
| 0.70 | 8% | 40 | 40 | 515/561/647 |
| 0.70 | 20% | 38 | 0 | Not reached |

At mean Q.66 with no misses,40/40reach Legendary, median477attempts. At8%miss,25/40reach by800, with a conditional median731;15remain censored. Thus lower-quality consistent work can progress, while repeated misses have a material late-game cost. Q.60/8%miss does not reach Legendary by800; that is a review tradeoff, not hidden success.

Recovery experiment: after160attempts, switch to Q~N(.85,.05) and2%miss, retaining the existing state. Harsh poor recovers to Legendary40/40, p10/median/p90 352/399/426 total attempts. The S2-poor-mean proxy Q.66/8%miss improves to40/40,306/346/368. There is no persistent negative streak/debt that prevents recovery. These experiments prove model recovery under assumptions, not human learning rates.

A separate forced battle-win sensitivity changes popularity outcome only while retaining historical gold/drop draws, so it is not a coherent alternative combat simulation. Over160attempts, historical Q.85 sessions reach Legendary100/100even when every battle is assigned a loss, median46, due to repeating weapon notifications. Selected reputation does not reach Legendary in the all-loss or50%-win cases within160; all-win reaches8/100with conditional median139. Exact loss rules and outcome/reward invariance are separately tested. No combat difficulty changed.

## Letter durability and compatibility

- `kingLetters` already exists, is serialized by normal save, preserved by backup recovery, and retained unbounded through load sanitization if race/title/body are valid. Recognized numeric milestone levels10/15/20 gate S4 reward; malformed/unrecognized tiers do not create a false recognized award.
- Quota compaction explicitly preserves letters while reducing historical display records and armory. Tests exercise primary save/reload, backup recovery and quota compaction. Battle claiming and armory/history trimming do not delete letters. No individual letter delete/archive path exists in current source. New Game/reset intentionally begins a new lifetime; restoring an older backup restores that historical state and is not an external anti-rollback guarantee.
- Existing saves keep their reputation and letters, no recalculation or migration. A preexisting recognized kingdom tier letter suppresses future equal/lower +8awards, even if originally earned under the old generous model. Duplicates do not multiply rewards. New higher earned tiers remain eligible. A higher existing tier suppresses lower catch-up.
- The per-weapon notification list is still used. New generated high-tier stock gets no milestone credit without an actual crossing. A second genuine crossing at an already-recognized kingdom tier may still create a letter/stat event but adds0reputation. The milestone UI displays the computed+8or+0and retains the unchanged material multiplier. Both states were mounted in a real browser and visually inspected; screenshots are included. This is component visual evidence, not end-to-end physical playtesting.
- Already persisted pre-S4 battle results remain authoritative and claim once, including their old reputation delta. They are not retroactively rewritten.
- Existing save-load repair for a ready battle lacking a valid persisted result invokes the resolver without kingdom-reputation context. Its existing optional default0means that one legacy repaired result can receive an undiminished S4win. Normal readiness and modal fallback pass current kingdom reputation. Existing migration plumbing/schema is unchanged under the no-migration boundary. This edge is bounded by persisted-result idempotence, not silently treated as fully context-aware.

## Verification

| Check | Result |
|---|---|
| Frozen S0 complete assertions and determinism | 5/5pass, assertion file unchanged |
| Accepted S2 benchmark assertions | 15/15pass, mechanics/benchmark/tests unchanged |
| Accepted S3 progression tests | 17/17pass, assertions and generator unchanged |
| New focused S4 tests | 15/15pass:11rule/lifecycle/persistence/invariance tests and4seeded summary regressions |
| Actual delivery callback lifecycle | Pass, fresh-high stock0award, first earned crossing+8, repeated kingdom tier0 |
| Full discovered suite | 789/789executions,29test files, no skipped failures |
| TypeScript | Pass, no diagnostics |
| Production build | Pass |
| Reward/combat invariant | Matched outcomes, RNG count, gold, materials, satisfaction and breakdown exact; only reputation differs |
| S3 generator and protected source | Byte-identical to accepted S3; hashes included |

The accepted suite had771executions. The new actual-delivery test executes3times via direct/imported suites, plus11new reputation tests and4new summary regressions, yielding789. Counts are executions, not unique individual assertions. Four directly related nonprotected test files were adapted to new runtime dependency injection, explicit reputation consequences and contextual resolver arguments; original sources are retained. Protected S0/S2/S3 assertions were not edited.

Both existing build warnings remain: `__dirname` use in Vite config is unsupported by the future default native loader, and a minified JavaScript chunk is above500kB. Neither is suppressed. Source CSS/config are unchanged. The first isolated build had a narrower source-scan root and smaller CSS; final build restored the accepted surrounding source-scan environment. Comparing final S3/S4 CSS shows only the extra Tailwind `.grow{flex-grow:1}` utility detected from text in retained project documentation. No UI CSS source was retuned.

## Exact files

Modified (10):

- `src/App.tsx`
- `src/game/battlePersistence.test.ts`
- `src/game/rules.ts`
- `src/game/worldCycle.test.ts`
- `src/game/saveReliability.test.ts`
- `src/game/dailyLedgerTransitions.test.ts`
- `src/game/sim/balanceHarness.ts`
- `src/game/sim/orderProgressionHarness.ts`
- `src/components/DebugPanel.tsx`
- `package.json`

New (13):

- `src/game/reputation.ts`
- `src/game/reputation.test.ts`
- `src/game/sim/reputationRecoveryReport.ts`
- `src/game/sim/reputationHarness.ts`
- `src/game/sim/reputationLongReport.ts`
- `src/game/sim/reputationSensitivityReport.ts`
- `src/game/sim/reputationLongHarness.ts`
- `src/game/sim/reputationCandidates.ts`
- `src/game/sim/reputationHarness.test.ts`
- `src/game/sim/reputationReport.ts`
- `src/game/sim/reputationPin.ts`
- `src/game/sim/historical/preS4BattleOutcome.ts`
- `docs/s4-reputation.md`

`package.json` adds only the dedicated `sim:reputation` script, with dependencies untouched. `DebugPanel` removes the obsolete `popularityWinBase` live control because S4 no longer uses it. Historical balance constants remain for exact S0/S3 references, not as active S4 tuning controls. `types.ts`, storage, world-cycle mechanics, data thresholds/economy/achievements and accepted S2/S3 models remain unchanged.

## Reproduce and limits

```sh
npm run sim:balance
npm run sim:progression
npm run sim:reputation
./node_modules/.bin/tsx --test src/game/sim/forgingBenchmark.test.ts
./node_modules/.bin/tsx --test $(find src -name '*.test.ts' | sort)
npm run lint
npm run build
./node_modules/.bin/tsx src/game/sim/reputationReport.ts > reputation-160.json
./node_modules/.bin/tsx src/game/sim/reputationLongReport.ts > reputation-800.json
./node_modules/.bin/tsx src/game/sim/reputationSensitivityReport.ts > reputation-sensitivity.json
./node_modules/.bin/tsx src/game/sim/reputationRecoveryReport.ts > reputation-recovery.json
```

Base seed20261123, run r adds r. Long comparisons use100runs/model/profile/policy,800attempts; sensitivity/recovery use40. The initial trace dataset preserves every160-attempt session. Long output retains aggregate percentiles and one full representative trace per cell. The four main profiles total32model/profile/policy cells, not32distinctplayer categories.

Session completion remains synthetic: no real-time minigame driver/deadline model; quality distribution is assumed, and misses follow a deterministic independent schedule. Purchases, stock, gold/drop/combat/forging functions are unchanged, with material supply and weapon upgrading from the accepted session policy. Attempts advance customer generation even for misses, while Smith/completed progress does not. A nominal5completed-orders/day time parameter is retained for shop refresh comparability, but misses break any interpretation as an actual day clock. No attempt-to-hours conversion is claimed. S2 mean-proxy sensitivity is not a measured full human quality distribution.

Reputation at battle resolution is snapshotted into the persisted result. Several simultaneously ready battles may use the same pre-claim reputation, and may be slightly more generous than serial claims. No win-history state was added to enforce stricter sequential decay. The integer minimum1also means positive quality wins can continue advancing at very high reputation. These choices keep rules predictable without adding a new persistent system.

The evidence includes cumulative candidate source, exact pre-S4 source, S4-only patch, rejected comparisons, raw/summary measurements, original adapted tests, protected hashes, browser screenshots and verification logs. Existing accepted S0/S2/S3 evidence remains preserved; no file was overwritten on Drive. This concludes S4 implementation only. Await Technical Director review before S5.
