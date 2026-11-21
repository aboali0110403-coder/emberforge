# Emberforge — Supreme Prompt for Google AI Studio

Pixel-art blacksmith game · Web + Android (Capacitor) · Build mode · v1.0

**How to use:** open Google AI Studio, choose Build, paste everything between PROMPT START and PROMPT END. If the output is cut off, send: "Continue from the last completed tier. Do not rewrite finished files." When it finishes, export to GitHub or ZIP and follow README\_ANDROID.md.

**— PROMPT START —**

## 0. MISSION

You are a senior game developer, game designer and pixel artist. Build the complete game described below as a polished, playable web app in one autonomous pass. Do not ask me questions or for confirmation. Where this spec is silent, choose the most sensible option and list it in the final report.

Editable constants (put them in src/data/config.ts): GAME\_TITLE = "Emberforge" (working title), APP\_ID = "com.emberforge.game" (placeholder), kingdom names (Humans: Aldermere, Elves: Sylvara, Goblins: Grubnak Warrens, Orcs: Kharzul Horde, Demons: Infernis), LEGENDARY\_LEVEL = 10, PROGRESSIVE\_UNLOCK = true.

## 1. HOW TO WORK (output-limit safety)

- Build in priority tiers P0 to P3 (section 14). After each tier the app must compile and run with zero errors. Never leave stubs, TODOs or half-written files.
- Be data-driven: races, weapons, parts, materials, equipment, orders, achievements and balance live in compact tables under src/data. Keep functions small and reuse generic code across the five forging steps and the ten weapons.
- If you are about to run out of space, finish the current item cleanly, write the final report and stop. I will reply "Continue" and you resume from the next unfinished item without rewriting finished files.

## 2. TECH STACK AND PLATFORM

- React + TypeScript (strict) + Vite. Game scenes on HTML5 Canvas 2D; menus and HUD as React DOM overlays. No game engine, no backend.
- Targets: web (desktop and mobile browsers) and Android via Capacitor. Stay Capacitor-ready: Vite base './', relative asset paths, no server calls, no API keys anywhere, Pointer Events for mouse and touch plus keyboard shortcuts on desktop, responsive from 360x640 to 1920x1080 (landscape preferred; in portrait show a friendly rotate-your-device hint), safe-area insets, block pinch-zoom, long-press menus and overscroll, pause on visibilitychange/blur.
- Render at an internal 480x270, integer-scaled with nearest-neighbor (image-rendering: pixelated, imageSmoothingEnabled = false). Target 60 FPS on low-end Android: fixed-timestep loop, cached sprite canvases, pooled particles.
- Persistence is local only: localStorage with a versioned save schema and migration stub, autosave on every meaningful event and every 30 s, Continue / New Game / Delete Save, plus an optional copy-paste backup code. No accounts, no cloud, no analytics, no ads, no purchases. The game is free.
- In-game language is English only. Keep all text in src/strings.ts.
- Never call Gemini, Imagen or any network API at runtime.
- Generate capacitor.config.ts and README\_ANDROID.md with exact steps: install Capacitor packages, cap init with the placeholder APP\_ID, npm run build, cap add android, cap sync, open Android Studio, build APK/AAB, and bundle fonts locally for offline use.

## 3. VISUAL STYLE AND ASSET PIPELINE

- Style: classic 16-bit (SNES-era) pixel art. 32x32 character and weapon sprites, 16x16 tiles and icons, one shared palette of about 32 colors, subtle dithering, a warm firelit workshop with strong glow. Race palettes: Elves green/silver, Humans blue/gold, Goblins olive/brown, Orcs rust/iron, Demons crimson/violet/black.
- Hybrid pipeline. Images are generated once at development time, never at runtime.
  - Code-made: UI frames, tiles, icons, particles, fire and steam, the player character (layered body/hair/outfit with palette swaps), and every weapon assembled from separately drawn parts so each upgrade visibly changes it (new grip, blade, string, crystal...). Define sprites as compact palette-indexed string maps rendered into cached canvases.
  - Generated art: customer portraits (5 races x 3 variants), 5 king portraits, the kingdom map, 5 battle backdrops, the workshop background. Ship procedural placeholders for ALL of these so the game is fully playable without them. The asset loader must automatically prefer /public/assets/generated/\<id>.png when it exists. If your environment can generate images, generate them now, snap them to the pixel grid (nearest-neighbor, limited palette) and save them there.
  - Always output ASSET\_PROMPTS.md listing every generated asset: id, pixel size and a ready Gemini/Imagen prompt that ends with "16-bit SNES pixel art, limited palette, crisp pixels, no anti-aliasing, flat magenta background".
- Game feel: hit-stop, screen shake, sparks, heat glow, steam, floating judgment text (PERFECT / GOOD / MISS), streak counter, coin bursts, level-up flash.

## 4. AUDIO

Web Audio only, no audio files. Synthesize SFX (hammer clang, bellows whoosh, grindstone scrape, quench hiss, UI blip, coin, level-up, legendary fanfare) and looping 8-bit chiptune music (workshop, kingdom map, battle, legendary jingle) with a tiny step sequencer: square lead, triangle bass, noise hi-hat. Give each kingdom its own scale flavor. Unlock audio on the first user gesture, provide music and SFX sliders plus mute in Settings, and suspend audio when the app is backgrounded.

## 5. CORE FANTASY AND LOOP

The player is a blacksmith in a fantasy world serving five races. Customers bring weapons. The player improves them by hands-on forging, is paid in gold, and spends gold on better materials and equipment. Customers then use the improved weapon in battle: the better it performs, the more they like the player, and the more material rewards they give. One race's materials upgrade another race's weapons, so the player must serve everyone.

Loop: take order, forge, deliver (gold), battle report (satisfaction, materials, popularity), shop and equipment, harder orders.

## 6. CHARACTER

After the title screen the player chooses a Male or Female blacksmith, enters a name, and picks simple customization: hair color, skin tone and outfit colors (palette swaps). The character is shown at every station.

## 7. WORLD, RACES AND THE MATERIAL CYCLE

Five kingdoms: Humans, Elves, Goblins, Orcs, Demons.

Material cycle. A race's customers pay in materials that best upgrade the NEXT race's weapons: Goblin to Orc to Human to Demon to Elf to Goblin.

Five rarity tiers with potency: Common 1, Uncommon 2, Rare 4, Epic 8, Mythic 16. Any material can be used on any weapon. Potency is multiplied by 1.5 on the target race's weapons, 1.0 on general weapons, 0.6 on other races' weapons.

Material lines (Common to Mythic):

- Goblin (for Orc): Scrap Iron, Tinker Alloy, Deepvein Steel, Gloomgem Shard, Motherlode Core
- Orc (for Human): Boar Hide, Tusk Ivory, Blood Iron, Warchief Plate, Titanbone
- Human (for Demon): Hardened Oak, Tempered Steel, Silver Thread, Royal Gold Leaf, Sunsteel
- Demon (for Elf): Ember Ash, Brimstone, Soul Cinder, Voidglass, Hellfire Heart
- Elf (for Goblin): Moonwood, Spidersilk, Dew Crystal, Starleaf Resin, Worldtree Heartwood

Material icons are code-drawn by shape (ingot, hide, wood, thread, crystal) with a palette swap per rarity.

Progressive unlock (when PROGRESSIVE\_UNLOCK is true): the game starts with Humans only. A kingdom unlocks when popularity with the previous race in the cycle reaches "Known": Human, then Demon, Elf, Goblin, Orc.

## 8. WEAPONS (10 types) AND PARTS

General weapons (any race can order them):

- Sword: blade, guard, grip, pommel
- Shield: face, rim, strap, boss
- Dagger: blade, guard, grip

Racial signature weapons (ordered only by their race):

- Elf: Longbow (limbs, string, grip) and Magic Staff (shaft, crystal, cap)
- Human: Spear (head, shaft, binding)
- Goblin: Serrated Cleaver (blade, grip, wrap)
- Orc: Battle Axe (head, haft, binding)
- Demon: Scythe (blade, snath, grip) and Trident (prongs, shaft, binding)

Stats: Power, Edge, Balance, Durability, Arcane (Arcane only on staffs and enchanted pieces). Each upgrade targets a part and raises stats according to quality, material potency and equipment.

## 9. FORGING: FIVE STATIONS, FIVE MINI-GAMES

Each step produces an accuracy from 0 to 100 percent. The average is the Quality Q. There is NO failure state: mistakes only lower Q.

1. Furnace (bellows): tap or hold to keep the heat gauge inside the glowing band for the whole step.
2. Anvil (hammer): shrinking rings close on hot spots; tap at the right moment for PERFECT / GOOD / MISS, 8 to 12 strikes.
3. Grindstone (sharpen): drag along the blade path at a steady speed inside the pressure zone.
4. Quench (cool): lower the piece into the trough and release inside the target temperature window.
5. Workbench (assemble): drag new parts into their slots, then tap-to-bind to the rhythm. Used for new grips, handles, bow strings, shafts, crystals.

Step sequence depends on the requested improvement:

- Edge: Furnace, Anvil, Grindstone, Quench
- Power: Furnace, Anvil (extra strikes), Quench
- Grip, handle, string, shaft, binding: Workbench (plus a short Anvil for metal parts)
- Durability: Furnace, Anvil, long Quench
- Arcane: Furnace, Workbench (socket the crystal), Quench
- Royal commissions: a free "Master's Choice" menu where the player picks any steps and parts, up to 6 actions.

Each step takes about 15 to 30 seconds. Difficulty scales with weapon level and material rarity.

## 10. EQUIPMENT AND SHOP

Equipment, 5 tiers each, with a visible sprite change in the workshop:

- Furnace: heat stability. Gates materials: Rare needs tier 2, Epic tier 3, Mythic tier 4.
- Hammer: wider strike windows and more Power gain.
- Anvil: more forgiving misses and a higher Q ceiling.
- Grindstone: more Edge gain and a wider pressure zone.
- Quench trough: wider window and more Durability gain.
- Workbench: more forgiving part fitting and more Balance gain.

Shop: Common and Uncommon materials always in stock; Rare materials in a rotating stock (refreshes every \~10 active minutes) at high prices; Epic and Mythic are reward-only. Prices scale with rarity and tier (exponential, tunable).

## 11. ORDERS, DEADLINES, LEVELS, POPULARITY, BATTLES

**Type A, Specific Request (available from the start):** a customer with portrait, weapon and current level, a stated request ("Improve the grip", "Sharper edge", "More damage"), a gold fee and a deadline. Up to 3 active orders; new customers arrive at the door over time.

**Type B, Royal Commission (per kingdom):** unlocks when popularity with that kingdom reaches "Renowned" (the king hears of you). Palace letters bring a weapon with NO stated request. The player improves it freely and skill decides the outcome. Higher fees and rewards.

**Deadlines:** the countdown runs in active play time. It pauses in menus, in the shop and when the app is backgrounded. It also pauses during a mini-game step and is checked between steps. If it expires, the customer leaves, popularity with that kingdom drops and the order is removed.

**Delivery:** gold = base fee x fulfilment of the request x Q.

**Weapon levels 1 to 20** with rarity stages: 1-4 Common, 5-8 Uncommon, 9-12 Rare, 13-16 Epic, 17-20 Mythic. The player picks up to 3 material stacks (1 to 5 units each). After forging, roll a level-up:

- chance = clamp(0.15 + 0.55*Q + 0.30*min(1, P/Preq) - 0.02\*L, 0.05, 0.95)
- P = sum of units x potency x affinity; Preq = 2 + 1.2\*L; L = current level
- If no material meets the stage's minimum rarity, cap the chance at 25 percent.
- Q >= 0.95 and P >= 2\*Preq allows a +2 level jump.
- Put every constant in src/data/balance.ts and add a hidden debug panel (key D) to tweak them live.

**Popularity:** tracked per kingdom with tiers Unknown, Known, Respected, Renowned, Legendary (thresholds in config). It rises when customers win battles with weapons the player improved (more for higher level and Q) and falls on missed deadlines.

**Battle report:** 30 to 60 active seconds after delivery a messenger arrives. The player taps to watch a short animated pixel battle with a weapon-specific animation (slash, arrow, spell bolt, thrust, axe swing, scythe sweep), then a result text. Win chance comes from the weapon rating vs the scenario difficulty. Satisfaction (0 to 100 percent) depends on the win, how well the request was fulfilled and the weapon level. On a win: popularity gain plus material rewards from that customer's race, with amount and rarity scaling with satisfaction. On a loss: no material rewards and no popularity change.

**Legendary moments:** the first time a delivered weapon reaches LEGENDARY\_LEVEL (10), and again at levels 15 and 20: the owner's amazed reaction scene, a thank-you letter from the king (parchment modal, race-flavored text), a popularity bonus, extra battle rewards for that weapon (x2, x3, x4) and an achievement.

## 12. ACHIEVEMENTS

About 16 in a data table, each with a small gold reward: First Order; 10, 50 and 100 orders; a PERFECT streak of 10; First Legendary; a king's letter from all five kingdoms; serve all five races; reach Renowned in a kingdom; reach Legendary popularity; a Level 20 weapon; max one equipment piece; max all equipment; collect every Mythic material; earn 10,000 gold; 10 orders in a row without a missed deadline.

## 13. SCREENS AND UX

Title; Character creation; Workshop (side view with tappable stations: furnace, anvil, grindstone, quench trough, workbench, door/counter for customers, shop counter, kingdom map); Order dialog; Forging flow; Shop; Inventory; Kingdom Map (5 regions with popularity bars, locked/unlocked state, royal letters); Battle report; Achievements; Settings (volumes, replay tutorials, delete save).

Mobile-first: tap targets of at least 44 px, a clear HUD (gold, active orders with timers, kingdom popularity), keyboard shortcuts on desktop.

Tutorial: a full guided tutorial for each station (furnace, anvil, grindstone, quench, workbench) on first use, with highlight pointers and a practice attempt; skippable and replayable from Settings. The first order is scripted: an easy Human sword.

## 14. BUILD TIERS

- P0, playable core: scaffold, game loop, input, save, title, character creation, workshop, Human customers, Sword and Shield orders, the five mini-games, gold, shop (Common and Uncommon), deadlines, basic SFX, tutorial for the first order.
- P1, full content: all five races, all ten weapons, the material cycle with affinity, level-up system, equipment tiers, popularity and kingdom map, battle report scenes, per-station tutorials.
- P2, depth: Royal Commissions, legendary moments and king's letters, achievements, music, game-feel polish, progressive kingdom unlock.
- P3, delivery: asset loader and ASSET\_PROMPTS.md, README\_ANDROID.md, capacitor.config.ts, debug panel, performance pass.

## 15. QA GATE AND FINAL REPORT

Before finishing, verify:

- the project builds with zero TypeScript errors and the console is clean;
- the full loop works: New Game, create character, accept order, all steps, deliver, gold, shop, battle report, popularity;
- layouts work at 360x640 (rotate hint) and 800x360 landscape; mouse, touch and keyboard all work;
- save and load survive a refresh; audio unlocks on the first gesture;
- there are no network calls or API keys, and no copyrighted characters or IP.

Final report: tiers completed, file overview, every assumption or default you chose, known gaps, and how to continue.

**— PROMPT END —**
