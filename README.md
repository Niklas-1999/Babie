# MiMaRo – Mischko & Mallow's Adventure

A small mobile-first cat game collection, in English and German.

**Start:** a loading screen, then the title where you type your name (your account, saved online) or play as a guest (this device only). The hub has four buttons:

- **Minigames:** play any level, then pick a cat.
- **Story:** pick a cat, then play levels 1–4 in order. The next level unlocks when you beat the previous one, and each cat has its own progress.
- **Casino:** coming soon.
- **Leaderboards:** best times per level, longest Backyard Survivors run, and most coins.

⚙ **Settings** (top right, always there): language, portrait/landscape for *all* games, sound, fullscreen, direct aim, Girlfriend Mode (infinite lives, just for fun: nothing is saved while it's on), switch player.

Gold **coins** sit on platforms in every level (they pop up over time on the vet table). They're kept on your account for the casino and skins later. Backyard Survivors has its own fish coins for the Cat Tree.

## Accounts and saving (Firebase Firestore)

Each player is one document in the `players` collection, keyed by the lowercased name: name, coins, fish coins, Cat Tree upgrades, best times for every level, Backyard Survivors record, story progress per cat, the mid-level "Continue" save and the settings. Everything is cached on the device too and synced about 1.5 s after a change, so it keeps working offline and catches up later. The setup is in `js/profile.js` (Firebase config at the top). Leaderboards query that collection directly.

## Levels

1. **Open the Door** (portrait) – climb the door to the handle.
2. **Kitchen Raid** (landscape) – hop across the kitchen from bottom left to top right and reach the can of cat food. Watch out for **trampolines** (launch you a few platforms ahead, follow the arrows) and **crackers** (crumble about a second after you land, then grow back).

3. **Street Dash** (landscape) – a sunny street; cars drive by every few seconds. Jump over them (or wait on umbrellas, kiosks, bus stops and shop roofs) and reach the forest at the far right. You hear a car about 2 seconds before it drives into view, and a ⚠ sign shows which side it comes from. Getting hit costs a heart and sends the cat flying.

4. **Vet Visit** (landscape, fixed camera) – survive 2 minutes on the exam table while syringes drop from the ceiling. A red target marks where each one will land the moment it appears; the shrinking ring shows when. It gets faster over time, with occasional rows of syringes that leave one gap. Ranked by fewest hits.

∞. **Backyard Survivors** (portrait, endless) – a "Vampire Survivors"-style horde mode. Drag anywhere to move (floating joystick, or WASD/arrows on desktop); all attacks fire on their own. Critters drop treats (XP); every level you pick 1 of 3 upgrades. See [below](#backyard-survivors).

Each level has its own music. The ⛶ button (menu and in-game) switches to fullscreen; on iPhone use Share → Add to Home Screen instead.

On phones the game pauses with a "turn your phone" prompt if it's held the wrong way for the level (Android also tries to lock landscape automatically for level 2).

**Play:** enable GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` / root). No build step — it's plain HTML/CSS/JS.

## Controls
- **Slingshot:** touch anywhere, drag *back*, release. The arrow shows direction and power (drag further = stronger jump).
- Release with a very short drag to cancel.
- "Direct aim" (menu/pause) flips it so you drag *toward* where you want to jump.
- Desktop: same with the mouse. `Esc`/`P` pauses.

## Notes
- Progress is saved automatically on every landing (Continue button in the menu).
- Levels are generated from fixed seeds in `js/game.js` (`buildDoorLevel`, `buildKitchenLevel`), so everyone plays the same layout. Trampoline arcs are verified at build time; any that wouldn't land on their target become normal platforms. Tuning constants are at the top of that file.
- Run locally: `python3 -m http.server` and open http://localhost:8000.

## Backyard Survivors

Endless survival mode. The code lives in `js/survivor/`, separate from the platformer:

| File | What's in it |
| --- | --- |
| `data.js` | Weapons, passives, critters, spawn waves, swarm events, bosses, Cat Tree upgrades (all the numbers to tune) |
| `art.js` | Procedurally drawn critters, pickups and lawn, cached as sprites (plus a white hit-flash copy) |
| `audio.js` | Synthesized sound effects (no extra files) |
| `core.js` | The game: player, enemies and boss AI, weapons, pickups, level-ups, boxes, rendering, UI |

**The run:** critters spawn in growing numbers and toughness. An elite (golden glow) shows up about every 70 s and drops a cardboard box (chest). A boss arrives every 3 minutes (The Rat King, Robo-Vacuum, The Queen Wasp, then repeating stronger). Swarm events (ant ambush, cockroach stampede, bee swarm, …) mix things up, and the garden goes through sunset, night (fireflies!) and dawn.

**Build:** up to 6 weapons and 6 passives, weapons go to level 8, passives to 5. A max-level weapon plus its paired passive **evolves** when you open a box:

| Weapon (classic archetype) | + Passive | Evolution |
| --- | --- | --- |
| 🐾 Claw Swipe (whip) | 🗡️ Sharp Claws | 🌪️ Shredder Storm |
| 🐟 Fishbone Toss (magic wand) | ⏱️ Cat Reflexes | 🍣 Sushi Barrage |
| 🧶 Yarn Orbit (orbiting bible) | ⏳ Long Tail | 🌌 Yarn Galaxy |
| 😾 Grumpy Aura (garlic) | ☁️ Fluffy Coat | 👿 Grumpy Storm |
| 🥛 Spilled Milk (holy water) | 🔍 Big Paws | 🌊 Milk Flood |
| 🔴 Laser Pointer (bouncing) | 🍀 Lucky Paw | 🌈 Disco Laser |
| 🐭 Toy Mouse (boomerang) | 💨 Zoomies | 🐁 Mouse Stampede |
| ⚡ Static Fur (lightning) | 🛡️ Thick Fur | 🌩️ Thunder Floof |
| 🤢 Hairball (AoE lob) | 👯 Copycat | ☄️ Hairball Apocalypse |
| 🐈 Kitten Pal (summon) | 📖 Curiosity | 😸 Kitten Army |

Other passives: 🧲 Long Whiskers (pickup range), 💤 Cat Nap (regen), 💖 Nine Lives (revive).

**Pickups:** treats (XP, merge into big ones when there are too many), coins, and from breakable flower pots: 🐟 sardine (heal), 🥫 can opener (pulls in every treat), 🌿 catnip (frenzy: faster and faster attacks), HISS bomb (clears the screen).

**Cat Tree:** coins from each run buy permanent upgrades in the mode's lobby (damage, health, armor, speed, rerolls, an extra life, …). Mallow starts with Claw Swipe (tanky), Mischko with Fishbone Toss (fast).

Debug: `__game.survivor.debug` in the console exposes the run state (`S`, `P`), `gainXp(n)`, `spawnEnemy(type, x, y)` and `openChest(isBoss)`.
