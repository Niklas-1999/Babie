# MiMaRo (Babie) – read first

Before doing anything in this repo, read **HANDOFF.md** completely. It has the project state, branches, live-site setup, architecture, data model, asset layout, testing workflow, gotchas, and the Christmas checklist.

Key rules in short:
- Plain HTML/CSS/JS, no build. Serve with `python -m http.server 8765` and test in headless Chrome (puppeteer-core) before pushing.
- Work on the branch Niklas names (currently `christmas`). GitHub Pages serves the `halloween` branch – don't touch it unless asked.
- Every feature: English + German (`js/i18n.js`), portrait + landscape, everything earned saved to the player's Firestore doc, Girlfriend Mode saves nothing.
- New assets: see `assets/README.md`. Sound paths are relative to `assets/` (`music/…`, `sfx/…`).
- In game.js use `tr()` for translations, never `t()`.
