# Open the Door

A tiny mobile-first jump-only platformer. Pick **Mallow** or **Mischko**, then a level:

1. **Open the Door** (portrait) – climb the door to the handle.
2. **Kitchen Raid** (landscape) – hop across the kitchen from bottom left to top right and reach the can of cat food. Watch out for **trampolines** (launch you a few platforms ahead, follow the arrows) and **crackers** (crumble about a second after you land, then grow back).

3. **Street Dash** (landscape) – a sunny street; cars drive by every few seconds. Jump over them (or wait on umbrellas, kiosks, bus stops and shop roofs) and reach the forest at the far right. You hear a car about 2 seconds before it drives into view, and a ⚠ sign shows which side it comes from. Getting hit costs a heart and sends the cat flying.

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
