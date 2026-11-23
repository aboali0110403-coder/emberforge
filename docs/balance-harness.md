# Balance Regression Harness (S0)

Seeded, reproducible balance-regression harness for Emberforge. S0 is an
instrumentation slice: it measures current gameplay behavior through the real
game logic and pins it as a regression baseline. It changes no gameplay,
balance, coefficient, save-schema, or asset behavior.

## Run

```
npm run sim:balance
```

(equivalent: `npx tsx --test src/game/sim/balanceHarness.test.ts`)

The suite asserts the recorded baseline metrics for four scenarios and a
determinism check, and exits non-zero if current game logic no longer
reproduces them at the pinned seeds. Expected runtime: a few seconds.

Files:

- `src/game/sim/balanceHarness.ts` — harness library (scenarios, simulation,
  metrics). No side effects on import; no I/O; no storage or DOM access.
- `src/game/sim/balanceHarness.test.ts` — baseline assertions (this is the
  regression anchor) plus a determinism test.

## What the harness runs

Every run plays 160 completed orders through the real, unmodified game
modules: `generateCustomerOrder`, `calculateTotalPotency`,
`canUseMaterialWithFurnace`, `rollWeaponLevelUp`,
`applyForgeUpgradesToWeapon` (on the order's own weapon instance, so battles
see real post-forge stats), `checkLegendaryMilestone`,
`calculateDeliveryGoldBreakdown`, `calculateForgeXp`, `resolveBattleOutcome`
(the seeded RNG drives the win roll and every reward/drop draw inside the
real function), `checkProgressiveUnlocks`, `getEquipmentUpgradeCost`,
`getMaterialSellPrice`, `rollRotatingStock`.

Isolation: the harness constructs its own in-memory state (gold, inventory,
equipment, popularity, XP). It never reads or writes save state, storage, or
the DOM, and it never mutates game configuration — baseline scenarios run
against the shipped `DEFAULT_BALANCE` untouched. It is not imported by any
production code path.

## Fixed-seed methodology

- PRNG: mulberry32; base seed **20261123**; run `r` uses seed `base + r`.
- **400 runs per scenario**, **160 completed orders** per run.
- Scenarios: buyer/frugal material policies x 5/8 completed orders per
  in-game day, all at typical play quality Q ~ N(0.85, 0.05) clamped to
  [0, 1]. Quality distributions are assumptions, not measurements.
- Rerunning the same seeds reproduces every recorded number exactly (pinned
  by the determinism test).

## Modeled policies (assumptions, not measured player behavior)

- Every order is forged, always targeting the requested part (fulfilment 1.0
  standard, 1.15 royal). No order is missed or abandoned.
- Materials honor the real constraints: at most 3 stacks x 5 units, selected
  from inventory; zero-material and under-potency forging is permitted by the
  UI and exercised by the sim. Buyer also purchases stage-rarity materials;
  frugal purchases only common/uncommon; both top up with always-stocked
  common/uncommon when short of potency (which caps level-up chance at 0.25
  via the real formula).
- Shop follows the real mechanics: common/uncommon unlimited at list price;
  rare/epic only from rotating stock (3 random rares, stock 2-4, plus 1
  random epic, stock 1-2, once any race is Renowned; all at 1.35x; mythic
  never sold); refresh every 420 active seconds, approximated in sim time as
  one refresh per `420 / (660 / ordersPerDay)` orders.
- Surplus inventory above 8 units (buyer) or 4 (frugal) is sold at sell-back.
- The cheapest available equipment upgrade is bought whenever affordable
  (materials and upgrades are the only gold sinks in the game).
- Delivery-time effects honored: legendary milestone popularity, D-grade
  delivery reputation penalty, royal fulfilment. Prompt-delivery bonus is
  assumed earned at remainingRatio 0.75. Battles resolve immediately at
  delivery (their real etaSec delay is a timing-only difference in a
  throughput model).

## Time model (throughput, not a clock)

One in-game day = 660 active seconds. The sim counts completed orders and
maps them to days at a fixed 5 or 8 completions/day. It does not model
real-time session length, idle time, or completions per real hour; real
cadence is an open empirical input for later device playtests. Milestone
days are medians over 400 seeded runs under the stated policies —
comparative evidence (baseline vs future candidates), not predictions of
individual sessions.

## Exclusions (deliberate, disclosed)

Territory bonuses and the 300g conquest achievement (no conquest modeled);
missed-deadline popularity penalties (zero misses assumed — optimistic);
Debug Panel grants (not gameplay); battle ETA timing; real-time clock
behavior; human skill/grade distributions.

## Recorded baseline outputs (commit cd18ede5, DEFAULT_BALANCE)

Median in-game day (p25-p75); every milestone reached by 400/400 runs.

| Scenario | Known (25) | Respected (70) | Renowned (140) | Legendary (240) | All tier 3 | All tier 5 |
|---|---|---|---|---|---|---|
| buyer 5/day | 1 (1-1) | 1 (1-2) | 3 (2-3) | 4 (3-4) | 3 (3-3) | 7 (7-7) |
| frugal 5/day | 1 (1-1) | 1 (1-2) | 3 (2-3) | 4 (3-4) | 3 (3-3) | 7 (6-7) |
| buyer 8/day | 1 (1-1) | 1 (1-1) | 2 (2-2) | 2 (2-3) | 2 (2-2) | 5 (4-5) |
| frugal 8/day | 1 (1-1) | 1 (1-1) | 2 (2-2) | 2 (2-3) | 2 (2-2) | 4 (4-4) |

| Scenario | First Lv-18 request (median order) | Day-3 avg tiers (of 30) | Day-3 requested level (mean / p90) |
|---|---|---|---|
| buyer 5/day | 24 | 18.7 | 10.0 / 12 |
| frugal 5/day | 24 | 19.2 | 10.1 / 13 |
| buyer 8/day | 24 | 24.9 | 14.8 / 17 |
| frugal 8/day | 23 | 25.7 | 15.0 / 18 |

Per-order flows (buyer 5/day): delivery 701, battle 60, sell-back 220,
achievements 12.1 gold; materials 78, upgrades 84 spent; drops 5.10 units;
stage rarity met 71%; under potency 45%; royal 26.2% of orders; legendary
milestone bonus on 93%; win rate 96%.

## Updating the baseline

These assertions pin CURRENT behavior so that later slices (S2-S5) can show
before/after evidence. Do not relax or regenerate them to make a failing
gameplay change pass silently: an intentional gameplay change updates this
file and the expectations in the same PR, with the harness diff quoted in
the PR description. Target-band assertions for retuned pacing are added only
by the slice that implements that retune — S0 deliberately asserts the
baseline, not the targets.
