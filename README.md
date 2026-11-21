# Emberforge

A 16-bit pixel-art fantasy blacksmith game. React 19 + TypeScript + Vite, rendered on a 480x270 Canvas 2D view. Saves live in browser localStorage.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint    # tsc --noEmit
```

Android packaging (Capacitor) is described in [README_ANDROID.md](README_ANDROID.md).

## Forging stations

Each commission is a chain of timing minigames. Station order depends on the commission:

- edge: furnace, anvil, grindstone, quench
- power / durability: furnace, anvil, quench
- arcane: furnace, workbench, quench

The furnace, anvil, grindstone and quench scenes use scene frames from `public/assets/process/` (`process-<furnace|anvil|grind|quench>-<1..3>.png`). The frame shown follows the minigame state (for example heat level, hammer raised vs strike, on-target grinding). If a frame has not loaded, the scene falls back to the original code-drawn art. The loader is `src/gfx/processFrames.ts`.

Other art comes from the `.jfif` sheets in `public/assets/aistudio/`, mapped in `src/gfx/assetSheets.ts`.
