# Open the Door

A tiny mobile-first jump-only platformer. Pick **Mallow** or **Mischko** and climb the door, platform by platform, until you reach the door handle.

**Play:** enable GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` / root). No build step — it's plain HTML/CSS/JS.

## Controls
- **Slingshot:** touch anywhere, drag *back*, release. The arrow shows direction and power (drag further = stronger jump).
- Release with a very short drag to cancel.
- "Direct aim" (menu/pause) flips it so you drag *toward* where you want to jump.
- Desktop: same with the mouse. `Esc`/`P` pauses.

## Notes
- Progress is saved automatically on every landing (Continue button in the menu).
- Level is generated from a fixed seed in `js/game.js` (`buildLevel`), so everyone plays the same tower. Tuning constants are at the top of that file.
- Run locally: `python3 -m http.server` and open http://localhost:8000.
