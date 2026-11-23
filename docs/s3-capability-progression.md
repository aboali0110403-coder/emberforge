# Emberforge S3: weapon and order capability progression

23 November 2026. Implementation and verification complete for Technical Director review. S3 is a candidate, not an accepted checkpoint. Stop before S4.

## Decision and result

Selected the soft material-aware capability model after comparing four alternatives against the original generator. Smith level now anchors requested weapon level. Completed-order experience, popularity and tool comfort are bounded contributions, not uncontrolled multipliers. Material access shapes the request distribution, retaining a rare one-level bridge challenge instead of collapsing all requests onto a hard ceiling.

In matched 400-run sessions, first level-18 requests move from median orders 23-24 to 74-75. Early and mid snapshots no longer routinely ask for material-inaccessible weapon stages. Late supported workshops still receive level18, and the existing level19/20 upgrade reachability remains tested. Failure and supply friction remain possible. No economy, combat, popularity, materials, forging scoring, save schema or assets were retuned.

## Source and authority

Repository `aboali0110403-coder/emberforge`, branch `integration/v0.3-v3-1`, starting HEAD `cd18ede5fdb20e9f669d604b9b1174440aead2af`, plus the accepted uncommitted S0 and final S2v5 cumulative candidate. Both accepted checkpoints and their evidence are preserved.

The TD's 23 November S3 instruction authorized measurement, model comparison, focused implementation and tests. The later explicit TD decision froze S0 against its original old order logic, preserved all original scenario assertions, seeds, assumptions and determinism test, and required separate S3 candidate regressions. Neither authorization permitted commit, push, merge or deployment. None was performed.

## Historical S0 versus S3 routing

- `npm run sim:balance` still runs the original `balanceHarness.test.ts`, byte-for-byte unchanged, including all four complete scenario assertions and the determinism test.
- Only S0's generator import routes to `sim/historical/s0OrderLogic.ts`. Its generator body is byte-for-byte the accepted pre-S3 generator. All other S0 simulation policies and common game functions are unchanged.
- `orderProgressionHarness.ts` and its new regression tests explicitly identify the production S3 model and its own expected outputs. They reuse the same seeds, 400 runs, 160 orders, synthetic quality and purchasing assumptions. They are not a competing baseline.
- Historical S0 documentation remains untouched. Its references to current/shipped behavior describe the historical checkpoint; this document records the explicit S3 routing change.
- Historical old-range test source is retained in `sim/historical/preS3-progressionReachability.txt`. Thirteen obsolete order-range/RNG cases were replaced with four S3 cases. The downstream level19/20, material and upgrade safeguards remain.

## Measurement before implementation

The old generator's maximum was `round(2 + 0.32*completed + 2.2*(average equipment-1) + 0.4*(Smith-1))`, clamped to2..18; orders drew uniformly from up to four levels below it. Completed count and equipment average overpowered Smith progression. Popularity changed royal access and race unlocks rather than this old level range.

Stage A sampled 420 states, each with 200 actual pre-change orders, using seed20261123. Grid: Smith1/3/5/8/12/16/20, popularity0/70/240, completed0/8/32/100/10000, uniform station tier1/2/3/5. All84,000 original samples are retained. The final integrated comparison repeats both actual generators over the same420states and seeds,168,000 orders total. Raw kinds, weapon types, levels, focus, target parts, fees and rarity distribution are retained.

## Alternatives and selected calculation

| Model | Behavior | Decision |
|---|---|---|
| Original | Completed-count and average-equipment uniform range | Historical reference only |
| Smith-linear | Broad uniform range around Smith with small tool effect | Better anchor, no material-access coherence |
| Bounded experience | Smith plus saturating experience, popularity and tool effects | Avoids count runaway, but undergeared workshops remain material-blocked |
| Hard material clamp | Bounded model capped at accessible material stage | Rejected: high-Smith tier1 workshops pile up at level8 |
| Soft material-aware | Capability anchor plus weighted offsets below/at/above material boundary | Selected: varied requests, bounded rare bridge |

Selected calculation:

1. Smith is clamped to the existing1..20 progression. Experience is `min(1,log2(1+completed)/6)`, popularity access is `min(1,popularity/240)`, tool comfort is `min(1,(relevantTier-1)/4)`.
2. Center is `clamp(Smith-1 + 0.75*experience + 0.5*access + 0.5*comfort,1,18)`.
3. Existing furnace rarity boundaries imply material-stage endpoints8/12/16/18 for furnace tiers1/2/3/4+. The distribution anchor is the lesser of center and endpoint minus1.
4. Weighted offsets -2/-1/0/+1/+2 have probabilities15%/30%/40%/13%/2%; round anchor, add offset, clamp1..18.

These are measured candidate coefficients, not user-mandated thresholds. For an advanced material-limited workshop the theoretical bridge rate is2%, at most one level above the accessible material stage. A particular finite seed may sample more or fewer. It is not a flat hard ceiling: the distribution has several levels and moves when Smith/material capability improves.

Tool comfort uses the minimum relevant tool over the selected weapon's current request repertoire, adding hammer when anvil is used. This conservative weapon-level choice preserves the original RNG draw order because request focus is chosen after level. It does not claim exact per-request mastery. Grindstone affects edged weapons but not shield/staff; every current repertoire includes anvil and a grip/workbench route, verified by asymmetric tests. Furnace access is handled separately. Changing an unrelated station cannot boost weapon capability. Equipment changes the center by at most0.5, not an automatic mastery multiplier.

## Actual integrated request distributions

Same seed20261123,200orders per row. Counts are `level:orders`. Early/mid/late here are explicit snapshots, not assumed elapsed days. All other state is held fixed.

| Snapshot (Smith/popularity/completed/tier) | Generator | Request distribution | Stage inaccessible | More than Smith+3 |
|---|---|---|---|---|
| Early (1/70/8/1) | historical | 1:44, 2:43, 3:40, 4:36, 5:37 | 0.0% | 18.5% |
| Early (1/70/8/1) | S3 | 1:170, 2:27, 3:3 | 0.0% | 0.0% |
| Early high traffic (3/240/32/1) | historical | 9:41, 10:35, 11:44, 12:40, 13:40 | 100.0% | 100.0% |
| Early high traffic (3/240/32/1) | S3 | 1:28, 2:61, 3:80, 4:25, 5:6 | 0.0% | 0.0% |
| Mid (8/240/100/2) | historical | 14:41, 15:35, 16:44, 17:40, 18:40 | 100.0% | 100.0% |
| Mid (8/240/100/2) | S3 | 6:28, 7:61, 8:80, 9:25, 10:6 | 0.0% | 0.0% |
| Late supported (16/240/100/5) | historical | 14:41, 15:35, 16:44, 17:40, 18:40 | 0.0% | 0.0% |
| Late supported (16/240/100/5) | S3 | 15:28, 16:61, 17:80, 18:31 | 0.0% | 0.0% |
| Late undergeared (16/240/10000/1) | historical | 14:41, 15:35, 16:44, 17:40, 18:40 | 100.0% | 0.0% |
| Late undergeared (16/240/10000/1) | S3 | 5:28, 6:61, 7:80, 8:25, 9:6 | 3.0% | 0.0% |

The advanced-undergeared actual sample contains6/200 bridge orders,3%, versus the model's2% theoretical probability. All other194 are within furnace access. Material-stage inaccessibility is not an automatic delivery failure; it blocks/caps part of the existing weapon-level-up path. Raw inventory, potency and rotating-stock availability are separate constraints.

## Matched historical versus S3 sessions

Same seed20261123+r,400runs/scenario,160completed orders/run, synthetic Q~N(0.85,0.05), buyer/frugal purchasing rules unchanged. Day3 assumes5or8completions per in-game day, not observed human throughput.

| Scenario | Old first L18 median | S3 first L18 median | Old/S3 day3 mean request | Old/S3 day3 P90 | Old/S3 stage-rarity met | Old/S3 no-material orders |
|---|---|---|---|---|---|---|
| buyer 5/day | 24 | 74 | 10.0/5.3 | 12/7 | 71%/77% | 1%/1% |
| frugal 5/day | 24 | 75 | 10.1/5.3 | 13/7 | 63%/67% | 1%/1% |
| buyer 8/day | 24 | 74 | 14.8/7.5 | 17/9 | 71%/76% | 1%/1% |
| frugal 8/day | 23 | 75 | 15.0/7.5 | 18/9 | 63%/67% | 1%/1% |

All400runs reach a level18request in both models. These sessions force every order to complete, including weak/no-material forging. They do not measure actual acceptance, missed deadlines or abandonment. S3 candidate expectations are independently pinned in new tests; no historical expectation was relaxed.

## Accepted S2 quality and material-stock diagnostics

The independent comparison contains100scenario/model/profile cells: five snapshots x five models x four skill profiles. An earlier research checkpoint said80;100is the correct count after the fourth alternative was added. Its counterfactual candidates share the original sampled weapon/customer mix and a separate seeded level draw; they are comparisons, not actual production-generator traces. The420-state integrated experiment above and the matched sessions are actual production traces.

An additional16closed-loop comparisons use actual historical/S3 generators, buyer/frugal policies,20seeded sessions per cell,160orders/session, and accepted S2 station-runtime means. Each quality cell averages12S2runs per station at the actual equipment/Smith/weapon level, combined over the actual focus's station sequence. This uses sword target geometry as a proxy for all weapons, not a full weapon-specific human quality distribution. Royal null focus uses the existing edge proxy. Forge stat changes, material selection, purchases, shop stock, drops, upgrades, XP and battles then run through the existing formulas.

| Model | Policy | S2 profile | Mean Q | Stage rarity met | Potency met | Battle win | Net gold flow/order |
|---|---|---|---|---|---|---|---|
| historical | buyer | poor | 0.660 | 71.8% | 53.3% | 95.6% | 689 |
| historical | buyer | average | 0.801 | 70.4% | 53.1% | 95.9% | 776 |
| historical | buyer | good | 0.842 | 71.0% | 53.9% | 95.5% | 825 |
| historical | buyer | exceptional | 0.910 | 71.5% | 54.4% | 95.8% | 873 |
| historical | frugal | poor | 0.659 | 63.5% | 44.5% | 95.7% | 788 |
| historical | frugal | average | 0.801 | 63.5% | 44.4% | 95.6% | 861 |
| historical | frugal | good | 0.842 | 63.1% | 44.3% | 95.3% | 925 |
| historical | frugal | exceptional | 0.910 | 63.8% | 45.5% | 95.8% | 957 |
| S3 | buyer | poor | 0.659 | 77.7% | 58.6% | 94.8% | 587 |
| S3 | buyer | average | 0.800 | 77.1% | 58.5% | 95.1% | 676 |
| S3 | buyer | good | 0.843 | 77.2% | 59.0% | 95.8% | 729 |
| S3 | buyer | exceptional | 0.908 | 76.1% | 58.9% | 95.6% | 759 |
| S3 | frugal | poor | 0.659 | 68.9% | 48.2% | 94.8% | 680 |
| S3 | frugal | average | 0.801 | 66.6% | 47.7% | 95.4% | 787 |
| S3 | frugal | good | 0.843 | 68.1% | 49.0% | 96.1% | 822 |
| S3 | frugal | exceptional | 0.909 | 66.8% | 48.9% | 95.5% | 856 |

Net flow above is actual simulated gold change across delivery, battles, sales, achievements, materials and upgrades under this policy, not gross delivery reward. It is not a real-player profit forecast. Snapshot comparison JSON separately records gross delivery gold and battle previews and labels them accordingly.

### Completion and failure implications

- Early/mid order difficulty is better aligned without changing accepted S2 quality rules. There is no systematic Q inflation; mean S2 proxy quality is similar between models. Novice high-traffic requests no longer jump straight into rare/epic requirements.
- Material feasibility improves but is not solved: even S3 buyer diagnostics meet stage rarity only about76-78% overall and potency about59%; frugal stage coverage is about67-69% and potency48-49%. Rare/epic stock, mythic drops, quantity and affordability remain meaningful constraints. No supply/pricing redesign was smuggled into S3.
- Existing battles remain easy under these forced-completion policies, around95-96%wins even at poor quality. Candidate gross/net income falls with lower requested levels, while high-tier equipment still arrives quickly. These are downstream review issues, not evidence that S3 solved combat/economy pacing.
- Material bridge orders can fail the rarity/potency checks or yield reduced level-up chance. Existing poor quality, understock, battle loss and level-up randomness remain. The simulation does not measure actual deadline or minigame failure rates.
- Late supported generation still tops out at18, preserving the existing earned19/20upgrade path. Hard limits17+mythic and existing furnace unlocks were reused rather than new material systems.

## Verification and preservation

| Check | Result |
|---|---|
| Original S0 four full scenario assertions plus determinism | 5/5pass, assertion file byte-identical |
| Accepted S2 benchmark assertions | 15/15pass, benchmark and tests byte-identical |
| Separate S3 regressions | 17/17pass:6pure candidates,6integration/asymmetry,4full-session outputs,1determinism |
| Full discovered project suite | 771/771executions pass across27test files |
| TypeScript | Pass, no diagnostics |
| Production build | Pass; warnings for future native-config __dirname support and a JS chunk above500kB |
| Generator preservation | Frozen function body exact; production rules outside order generator and its import exact |
| Accepted S2 scoring/mechanics and historical S0 docs | Unchanged |
| Seeds/reproduction | Both S0 and S3 determinism pass; full integrated raw JSON replay also matches byte-for-byte; exact commands/source/hash manifest included |

The pre-S3 full suite had772executions across24files. Replacing13obsolete order cases with4S3cases reduces18executions because the file is both imported and directly run;17new S3executions bring the final total to771. Counts are executions, not771unique assertions. No failing test was skipped. Original old test source is retained for audit.

## Exact S3 file changes

Modified from accepted S2 (four paths):

- `package.json`
- `src/game/progressionReachability.test.ts`
- `src/game/rules.ts`
- `src/game/sim/balanceHarness.ts`

New S3 files (eleven paths):

- `src/game/orderCapability.ts`
- `src/game/orderCapability.test.ts`
- `src/game/sim/orderProgressionHarness.ts`
- `src/game/sim/orderCapabilityReport.ts`
- `src/game/sim/orderCapabilityCandidates.ts`
- `src/game/sim/orderProgressionHarness.test.ts`
- `src/game/sim/orderCapabilityCandidates.test.ts`
- `src/game/sim/orderProgressionReport.ts`
- `src/game/sim/historical/preS3-progressionReachability.txt`
- `src/game/sim/historical/s0OrderLogic.ts`
- `docs/s3-capability-progression.md`

### Build output reconciliation

Source `src/index.css` and `vite.config.ts` are byte-identical to accepted S2. S3 CSS output is30,576bytes (`index-CF70QVnN.css`) versus S2's30,402bytes (`index-DXBxDX7G.css`). The sole added CSS declaration block is Tailwind's `.ordinal` utility, detected from that word in a new S3 test label by the existing automatic source scanner. A disposable control changing only that label word produced CSS byte-identical to accepted S2; restoring the exact S3 test restored the S3 CSS hash. No production CSS/config was edited and no gameplay source was changed for this check. The verification evidence records both control and restored build logs.

Both production-build warnings are retained: the existing `__dirname` use is unsupported by the future default native config loader, and the minified JavaScript chunk exceeds500kB. Neither is a build failure; neither was suppressed or fixed outside S3 scope.

## Reproduce

Use the authorized working candidate and its existing installed dependencies. No dependency install/update is required or performed.

```sh
npm run sim:balance
npm run sim:progression
./node_modules/.bin/tsx --test src/game/sim/forgingBenchmark.test.ts
./node_modules/.bin/tsx --test $(find src -name '*.test.ts' | sort)
npm run lint
npm run build
./node_modules/.bin/tsx src/game/sim/orderCapabilityReport.ts > s3-candidate-comparison.json
./node_modules/.bin/tsx src/game/sim/orderProgressionReport.ts > s3-production-results.json
```

The archive contains cumulative source, S3-only patch, historical reference, raw pre-change and final results, test/build logs, preserved S0/S2 evidence and a SHA-256manifest. The report is review material. No publish/deploy, commit, push or merge occurred. Await explicit TD review before S4.
