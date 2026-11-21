# Emberforge

A pixel-art fantasy blacksmith game. React 19 + TypeScript + Vite, rendered on a 480x270 Canvas 2D view. Saves live in browser localStorage.

## Run

```bash
npm install --legacy-peer-deps
npm run dev     # http://localhost:3000
npm run build
npm run lint    # tsc --noEmit
npm test
```

Android packaging (Capacitor) is described in [README_ANDROID.md](README_ANDROID.md).

## Painted, layered forging stations

Each commission remains a chain of timing minigames. Station order depends on the commission:

- edge: furnace, anvil, grindstone, quench
- power / durability: furnace, anvil, quench
- arcane: furnace, workbench, quench

The four metalworking stations combine painted backgrounds with separately moving art:

- **Furnace:** masonry backdrop, three independently flickering fire tongues, heat-colored weapon, pumping bellows and rising embers.
- **Anvil:** overhead anvil, the actual commissioned weapon, separate hammer and parts tray. A 320ms downstroke/contact/recovery cycle keeps the hammer on the captured strike point. Sound, sparks, shake and hit-stop occur at contact. Repeated input cannot skip the swing; the next target and final completion wait for recovery.
- **Grindstone:** painted workbench, rotating stone, moving weapon and alignment-driven contact sparks.
- **Quench:** painted workshop, separate barrel back/front, descending weapon, ripples and steam. The front lip occludes the submerged weapon.

Timing gauges, strike rings, quality calculations, controls and station routing remain. The parts tray is decorative, not a new assembly minigame. The workbench minigame is unchanged. Forging shows the current weapon design with heat states, not a physical simulation of individual components.

## Weapon upgrades across the game

All ten weapon classes have five painted designs: sword, shield, dagger, longbow, staff, spear, cleaver, axe, scythe and trident. Each design has cold, warm and hot art, for **50 designs and 150 PNG states**.

The existing visual tier rule is preserved:

| Level | Design tier |
| --- | --- |
| 1-4 | 1 |
| 5-8 | 2 |
| 9-12 | 3 |
| 13-16 | 4 |
| 17+ | 5 |

The highest part rarity can promote the design above its level tier: common, uncommon, rare, epic, mythic map to tiers 1-5. This does not add stat bonuses or alter progression.

`getWeaponSpriteCanvas` and `getHeatedWeaponCanvas` prefer painted art, so existing UI and gameplay consumers share the same upgrades. Station art uses tight silhouettes. Icon consumers get square transparent padding to preserve aspect ratio. Heat processing targets neutral/cool metal rather than applying a solid tint to wood, leather and colored gems. It is an artistic mask, not a material simulation.

## Assets and rebuilding

- `art-source/painted/`: original generated painted backgrounds and transparent component/weapon atlases.
- `public/assets/anvil/`: overhead background, hammer, blade-stage fallback art and parts.
- `public/assets/stations/`: backgrounds, wheel, bellows, barrel layers, fire, water and steam.
- `public/assets/forging-weapons/`: 150 class/tier/heat PNGs.
- `src/gfx/anvilLayers.ts`, `stationLayers.ts`: scene composition and animation.
- `src/gfx/paintedWeaponAssets.ts`, `paintedWeapons.ts`: shared tier selection, caching and fitted rendering.
- `src/canvas/minigames.ts`: gameplay and overlays.

To reproduce the runtime PNGs from the checked-in painted sources, install Pillow and run:

```bash
python scripts/cut-painted-assets.py
python scripts/cut-painted-weapons.py
```

The weapon cutter uses row-specific atlas boundaries and connected-silhouette cleanup to exclude neighboring fragments. It preserves alpha and generates heat variants. Original process frames in `public/assets/process/` and the older sprite-sheet/code renderers remain as loading fallbacks. Other game art remains in `public/assets/aistudio/`.

## Checks

`npm test` covers gameplay rules, anvil placement and timing, captured hit anchors, input guards, impact timing, final-strike recovery, timeouts, furnace/grindstone completion, quench quality, tier selection and all 150 asset files.

The browser verification fixture is at `/verification/` during Vite development only. It is not an app entry point in the production build. With Vite running, install Playwright separately and run:

```bash
npm install --no-save --legacy-peer-deps playwright
node verification/verify.mjs
node verification/order-playthrough.mjs
```

Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`. Set `VERIFY_OUTPUT` to change the screenshot folder from `/tmp/emberforge-verification`. The checks cover nine animation/timing assertions, all 150 loaded heat states, 50 shared sprite routes, station previews, delayed-load thumbnail refresh, and a fresh real-UI tutorial order from furnace to delivery. They use an isolated browser context and do not modify existing saves. The playthrough also writes 140 animation frames to `/tmp/emberforge-video` for optional video encoding.
