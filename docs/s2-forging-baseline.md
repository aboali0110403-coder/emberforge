# S2 pre-change baseline, corrected evidence edition

Baseline mechanics are from cd18ede5 before S2. Driver-v2 JSONs supersede the retained v1 measurements. The same driver was run against separate baseline and candidate source trees. See REPRODUCE.md and source-manifest.json in the evidence archive for source identity and commands.

## Driver and sampling

Station grid: 200 runs per cell; isolation, cross-effect and pointer grid: 100; propagation: 300. Seed base 20261123 with per-run offsets; fixed dt 1/60 second. Main grid covers five stations, four synthetic profiles, tiers 1/3/5 and weapon levels 1/10/19. Smith level defaults to 1 in the grid. The profile definitions are in forgingBenchmark.ts, including timing noise, delayed observation, lapses and pixel scatter.

Quench release noise and BIND timing noise are converted from seconds using empirically observed current cooling/pulse rates, rather than fixed baseline rates. The pointer driver uses the real pointer handler in both trees: baseline teleports, candidate tracks at capped speed. FIT attempts reset per slot; exact-click safety after 12 failed attempts is counted in fitForcedMean.

Discrete PERFECT/GOOD/MISS fractions are judgments, not per-forge grade probabilities. Workbench includes FIT and BIND together. Timeout fractions are expired anvil strikes/BIND beats. Continuous stations have zero discrete judgment fractions. No universal 0.70 timeout score or FIT auto-complete exists. The final runner directs source identity to source-manifest.json; legacy measurement files retain their original metadata. New BIND-only and Smith fields do not change old summary values.

## FIT safety bias

- baseline poor: forced exact clicks/run range 0.0000-0.0250.
- baseline average: forced exact clicks/run range 0.0000-0.0000.
- baseline good: forced exact clicks/run range 0.0000-0.0000.
- baseline exceptional: forced exact clicks/run range 0.0000-0.0000.
- candidate poor: forced exact clicks/run range 0.0000-0.0250.
- candidate average: forced exact clicks/run range 0.0000-0.0000.
- candidate good: forced exact clicks/run range 0.0000-0.0000.
- candidate exceptional: forced exact clicks/run range 0.0000-0.0000.

## Station grid (keyboard route)

### baseline tier 1, weapon level 1

| Station | Profile | Tier | Lv | acc median (p25-p75) | PERFECT | GOOD | MISS | timeouts | brittle |
|---|---|---|---|---|---|---|---|---|---|
| furnace | poor | 1 | 1 | 0.967 (0.891-0.967) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | average | 1 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | good | 1 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | exceptional | 1 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| anvil | poor | 1 | 1 | 0.597 (0.511-0.665) | 0.175 | 0.381 | 0.444 | 0.284 | 0.000 |
| anvil | average | 1 | 1 | 0.926 (0.881-0.985) | 0.756 | 0.176 | 0.069 | 0.068 | 0.000 |
| anvil | good | 1 | 1 | 1.000 (1.000-1.000) | 0.981 | 0.000 | 0.019 | 0.019 | 0.000 |
| anvil | exceptional | 1 | 1 | 1.000 (1.000-1.000) | 0.998 | 0.000 | 0.003 | 0.003 | 0.000 |
| grindstone | poor | 1 | 1 | 0.889 (0.842-0.931) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | average | 1 | 1 | 1.000 (0.988-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | good | 1 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | exceptional | 1 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| quench | poor | 1 | 1 | 0.610 (0.571-0.830) | 0.080 | 0.365 | 0.555 | 0.000 | 0.000 |
| quench | average | 1 | 1 | 1.000 (0.830-1.000) | 0.600 | 0.385 | 0.015 | 0.000 | 0.000 |
| quench | good | 1 | 1 | 1.000 (1.000-1.000) | 0.960 | 0.040 | 0.000 | 0.000 | 0.000 |
| quench | exceptional | 1 | 1 | 1.000 (1.000-1.000) | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| workbench | poor | 1 | 1 | 0.382 (0.317-0.477) | 0.054 | 0.316 | 0.630 | 0.192 | 0.000 |
| workbench | average | 1 | 1 | 0.880 (0.807-0.920) | 0.432 | 0.438 | 0.130 | 0.049 | 0.000 |
| workbench | good | 1 | 1 | 1.000 (1.000-1.000) | 0.649 | 0.331 | 0.020 | 0.012 | 0.000 |
| workbench | exceptional | 1 | 1 | 1.000 (1.000-1.000) | 0.665 | 0.333 | 0.002 | 0.002 | 0.000 |

### baseline tier 1, weapon level 19

| Station | Profile | Tier | Lv | acc median (p25-p75) | PERFECT | GOOD | MISS | timeouts | brittle |
|---|---|---|---|---|---|---|---|---|---|
| furnace | poor | 1 | 19 | 0.864 (0.783-0.864) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | average | 1 | 19 | 0.922 (0.922-0.922) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | good | 1 | 19 | 0.986 (0.986-0.986) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | exceptional | 1 | 19 | 0.986 (0.986-0.986) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| anvil | poor | 1 | 19 | 0.442 (0.394-0.488) | 0.096 | 0.230 | 0.674 | 0.554 | 0.000 |
| anvil | average | 1 | 19 | 0.870 (0.820-0.905) | 0.585 | 0.328 | 0.086 | 0.068 | 0.000 |
| anvil | good | 1 | 19 | 1.000 (0.966-1.000) | 0.959 | 0.016 | 0.025 | 0.025 | 0.000 |
| anvil | exceptional | 1 | 19 | 1.000 (1.000-1.000) | 0.995 | 0.000 | 0.005 | 0.005 | 0.000 |
| grindstone | poor | 1 | 19 | 0.789 (0.749-0.837) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | average | 1 | 19 | 0.979 (0.955-0.979) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | good | 1 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | exceptional | 1 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| quench | poor | 1 | 19 | 0.610 (0.571-0.830) | 0.080 | 0.365 | 0.555 | 0.000 | 0.000 |
| quench | average | 1 | 19 | 1.000 (0.830-1.000) | 0.600 | 0.385 | 0.015 | 0.000 | 0.000 |
| quench | good | 1 | 19 | 1.000 (1.000-1.000) | 0.960 | 0.040 | 0.000 | 0.000 | 0.000 |
| quench | exceptional | 1 | 19 | 1.000 (1.000-1.000) | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| workbench | poor | 1 | 19 | 0.382 (0.317-0.477) | 0.054 | 0.316 | 0.630 | 0.192 | 0.000 |
| workbench | average | 1 | 19 | 0.880 (0.807-0.920) | 0.432 | 0.438 | 0.130 | 0.049 | 0.000 |
| workbench | good | 1 | 19 | 1.000 (1.000-1.000) | 0.649 | 0.331 | 0.020 | 0.012 | 0.000 |
| workbench | exceptional | 1 | 19 | 1.000 (1.000-1.000) | 0.665 | 0.333 | 0.002 | 0.002 | 0.000 |

### baseline tier 5, weapon level 1

| Station | Profile | Tier | Lv | acc median (p25-p75) | PERFECT | GOOD | MISS | timeouts | brittle |
|---|---|---|---|---|---|---|---|---|---|
| furnace | poor | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | average | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | good | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | exceptional | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| anvil | poor | 5 | 1 | 0.867 (0.779-0.936) | 0.578 | 0.183 | 0.239 | 0.239 | 0.000 |
| anvil | average | 5 | 1 | 1.000 (1.000-1.000) | 0.932 | 0.000 | 0.068 | 0.068 | 0.000 |
| anvil | good | 5 | 1 | 1.000 (1.000-1.000) | 0.981 | 0.000 | 0.019 | 0.019 | 0.000 |
| anvil | exceptional | 5 | 1 | 1.000 (1.000-1.000) | 0.998 | 0.000 | 0.003 | 0.003 | 0.000 |
| grindstone | poor | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | average | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | good | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | exceptional | 5 | 1 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| quench | poor | 5 | 1 | 0.830 (0.830-1.000) | 0.270 | 0.710 | 0.020 | 0.000 | 0.000 |
| quench | average | 5 | 1 | 1.000 (1.000-1.000) | 0.950 | 0.050 | 0.000 | 0.000 | 0.000 |
| quench | good | 5 | 1 | 1.000 (1.000-1.000) | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| quench | exceptional | 5 | 1 | 1.000 (1.000-1.000) | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| workbench | poor | 5 | 1 | 0.660 (0.580-0.733) | 0.171 | 0.434 | 0.394 | 0.261 | 0.000 |
| workbench | average | 5 | 1 | 1.000 (0.967-1.000) | 0.585 | 0.353 | 0.061 | 0.048 | 0.000 |
| workbench | good | 5 | 1 | 1.000 (1.000-1.000) | 0.652 | 0.331 | 0.017 | 0.011 | 0.000 |
| workbench | exceptional | 5 | 1 | 1.000 (1.000-1.000) | 0.665 | 0.333 | 0.002 | 0.002 | 0.000 |

### baseline tier 5, weapon level 19

| Station | Profile | Tier | Lv | acc median (p25-p75) | PERFECT | GOOD | MISS | timeouts | brittle |
|---|---|---|---|---|---|---|---|---|---|
| furnace | poor | 5 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | average | 5 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | good | 5 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| furnace | exceptional | 5 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| anvil | poor | 5 | 19 | 0.720 (0.652-0.788) | 0.328 | 0.275 | 0.397 | 0.397 | 0.000 |
| anvil | average | 5 | 19 | 1.000 (1.000-1.000) | 0.895 | 0.030 | 0.074 | 0.074 | 0.000 |
| anvil | good | 5 | 19 | 1.000 (1.000-1.000) | 0.977 | 0.000 | 0.023 | 0.023 | 0.000 |
| anvil | exceptional | 5 | 19 | 1.000 (1.000-1.000) | 0.995 | 0.000 | 0.005 | 0.005 | 0.000 |
| grindstone | poor | 5 | 19 | 1.000 (0.980-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | average | 5 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | good | 5 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| grindstone | exceptional | 5 | 19 | 1.000 (1.000-1.000) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| quench | poor | 5 | 19 | 0.830 (0.830-1.000) | 0.270 | 0.710 | 0.020 | 0.000 | 0.000 |
| quench | average | 5 | 19 | 1.000 (1.000-1.000) | 0.950 | 0.050 | 0.000 | 0.000 | 0.000 |
| quench | good | 5 | 19 | 1.000 (1.000-1.000) | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| quench | exceptional | 5 | 19 | 1.000 (1.000-1.000) | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| workbench | poor | 5 | 19 | 0.660 (0.580-0.733) | 0.171 | 0.434 | 0.394 | 0.261 | 0.000 |
| workbench | average | 5 | 19 | 1.000 (0.967-1.000) | 0.585 | 0.353 | 0.061 | 0.048 | 0.000 |
| workbench | good | 5 | 19 | 1.000 (1.000-1.000) | 0.652 | 0.331 | 0.017 | 0.011 | 0.000 |
| workbench | exceptional | 5 | 19 | 1.000 (1.000-1.000) | 0.665 | 0.333 | 0.002 | 0.002 | 0.000 |

## Grindstone pointer route

### grindstone pointer route (capped tracking; baseline had instant teleport)

| Profile | Tier | Lv | baseline acc median (in-zone) | candidate acc median (in-zone) |
|---|---|---|---|---|
| poor | 1 | 19 | 0.785 (0.690) | 0.784 (0.692) |
| poor | 5 | 19 | 1.000 (0.947) | 0.921 (0.880) |
| average | 1 | 19 | 0.992 (0.982) | 0.998 (0.984) |
| average | 5 | 19 | 1.000 (0.999) | 1.000 (0.991) |
| good | 1 | 19 | 1.000 (0.999) | 1.000 (0.999) |
| good | 5 | 19 | 1.000 (1.000) | 1.000 (1.000) |
| exceptional | 1 | 19 | 1.000 (1.000) | 1.000 (1.000) |
| exceptional | 5 | 19 | 1.000 (1.000) | 1.000 (1.000) |



## Final follow-up

The enhanced driver adds BIND-only judgment fractions, continuous precision shares and Smith propagation. Baseline mechanics do not have center-precision accumulation; baseline precisionMean is zero/not applicable, not evidence of zero execution skill. Baseline expanded-driver original grid fields numerically match immutable v2 measurements. Final candidate conclusions are in s2-forging-redesign.md.
