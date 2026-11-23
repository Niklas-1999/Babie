# MiMaRo – Handoff for the next Claude session

Everything needed to keep working on this project. Written 2026-11-23, right before the **Christmas special**.
Read this fully before changing anything. Section 13 (gotchas) and section 14 (Christmas checklist) matter most for the next task.

---

## 1. Current state at a glance

| | |
|---|---|
| Game | **MiMaRo – Mischko & Mallow's Adventure**: a mobile-first browser game about two cats, Mallow (white, fluffy, grumpy) and Mischko (Siamese, small, sneaky). Plain HTML/CSS/JS, no build step, no frameworks. |
| Repo | `https://github.com/Niklas-1999/Babie` (public). Local clone: `d:\Bebiprojekt\Babie` |
| Live site | `https://niklas-1999.github.io/Babie/` – **GitHub Pages publishes the `halloween` branch** (verified 2026-11-23: the live page serves the Halloween build; `main` is far behind). If you move work to a new branch, the live site does NOT change until Pages is switched or that branch is merged into `halloween`. |
| Branches | `christmas` (newest: Halloween + asset cleanup + this handoff) · `halloween` (live, what Niklas called "the current up to date branch") · `Testing` (accounts/menus, before Halloween) · `main` (old: Backyard Survivors era, Sept/Oct). |
| Work branch now | **`christmas`** – do the Christmas special here. |
| Database | Firebase Firestore project `mimaro-db`, collection `players`. Working and tested end to end (see section 7). |
| Languages | English + German, everything translated (`js/i18n.js`). |
| Current event | Halloween mode is the default (`theme` = `halloween`). |

Git history (oldest → newest): jump-only door platformer → music/sfx → checkpoints/lives → Girlfriend Mode (+ jetpack) → level select + Kitchen Raid → Street Dash → Vet Visit → **Backyard Survivors** → accounts/menus/story/leaderboards/German/coins → Halloween theme → Halloween minigames + candy corn + secret picture → (other session) secret letter + song → asset cleanup + this handoff.

## 2. The user and how to work with him

- **Niklas** (GitHub `Niklas-1999`). German native speaker, writes to you in English (sometimes typos). Builds this game as a gift for his **girlfriend** (account names "MiMaRo" and "Niklas" are theirs – see the secret letter, section 11). Treat the game as a personal, playful hobby project: cute, polished, juicy.
- He gives big multi-feature requests in one message and often **adds requirements mid-task** ("also…", "oh yes…"). Fold them in as you go; acknowledge each one briefly.
- He drops new art/music into `assets/` himself and tells you the name. Expect Christmas assets with the suffix **`_christmas`** (Halloween ones used `_halloween`). They may arrive unsorted in the wrong folder or with odd names – sort them (see `assets/README.md`).
- **Git**: only commit/push when he asks; he usually wants things pushed ("upload it"). Never push to `main`/the live branch unless asked. He asked for each feature to be done on its own branch (`Testing`, `halloween`, now `christmas`).
- He likes being given: a short summary of what was built, what was tested, honest caveats, and 2–3 concrete ideas/options when he asks "can you think of…". When proposing game ideas, label them clearly and wait for his pick before building (he did that for Halloween: proposals first, then "make game one/two/three").
- **Girlfriend Mode** = infinite lives, *just for fun*: while it's on, nothing counts – no coins, no candy corn, no records, no story unlocks; in Backyard Survivors the cat can't die. Keep this rule for every new game.
- Everything the player earns must be saved in the database ("absolutely everything needs to be saved in the DB").
- Every new game must work in **both orientations** (the setting forces all games into portrait or landscape) and in **both languages**.
- He wants nice animations, sound effects, cat-themed everything.

## 3. Running and testing locally

- Serve the folder: `cd d:\Bebiprojekt\Babie && python -m http.server 8765` → open `http://localhost:8765/index.html`. (Opening the file directly won't work: modules/fetch.)
- **Headless browser testing (essential – do it before every push):**
  - Edge is installed but fails to launch from this environment. Use `puppeteer-core@23` + `chrome-headless-shell` installed into the scratchpad:
    `npm init -y && npm install puppeteer-core@23` then
    `npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path "<ABSOLUTE scratchpad>/browsers"` (path must be absolute).
  - Browser launch and network calls need the Bash tool with `dangerouslyDisableSandbox: true`.
  - Launch with `headless: 'shell'`, a `userDataDir` in the scratchpad, viewport e.g. `390x844, isMobile, hasTouch` (portrait) or `844x390` (landscape). Set `localStorage['otd.orient']` to match, otherwise the "turn your phone" prompt pauses games.
  - Watch `pageerror`, console errors and `response.status() >= 400`. "requestfailed … .mp3" is normal (music downloads cancelled when the song switches).
  - Take screenshots and look at them with the Read tool – this caught most visual bugs.
  - Headless FPS is meaningless (software rendering). Measure JS time instead (Survivor exposes `debug.prof`).
  - Bots: drive games via debug hooks + synthetic `PointerEvent`s on `#game` (Broom Ride bot: flap when `p.y > nextGap.gy + 12`).
- Debug hooks: `window.__game` → `{ game, player, audio, level, LEVELS, jump, startGame, simulateFlight, survivor, hw, Profile }`; `__game.survivor.debug` (S, P, enemies, pickups, gainXp, spawnEnemy, openChest, tick, prof, keys…); `__game.hw.debug` (`env`, `game`); Broom Ride `game.debug()` → `{p, obs, phase}`.
- Quick data tricks in the console: `__game.Profile.set('hwCorn', 250)` (unlock secret), `Profile.set('story', {mallow:4, mischko:4})`.
- Kill the server afterwards (PowerShell: `Get-NetTCPConnection -LocalPort 8765 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`).
- There is no `gh` CLI. GitHub REST via `curl https://api.github.com/...` works unauthenticated for public data only.

## 4. Files and architecture

```
index.html            all screens/HUDs as static HTML (data-i18n attributes); early inline script sets data-theme
style.css             all styles; event themes override via [data-theme="halloween"] … at the end of the file
manifest.webmanifest  PWA name "MiMaRo", any orientation
js/i18n.js            EN/DE dictionaries, t(), tx(), applyI18n(), setLang()  → window.I18N, window.t
js/profile.js         accounts + Firestore sync + leaderboard queries → window.Profile
js/survivor/data.js   Backyard Survivors data (weapons, passives, enemies, waves, events, Cat Tree)
js/survivor/art.js    procedural sprites (critters, pickups, lawn) cached to canvases
js/survivor/audio.js  SV.createSfx(audio): ALL synthesized sound effects (also used for menus + Halloween games)
js/survivor/core.js   Backyard Survivors runner: SV.create(api)
js/halloween/hw.js    Halloween minigame runner: HW.create(api), shared HUD/pause/results/saving/fx, HW.drawGhost/drawCorn
js/halloween/broom.js     HW.games.broom
js/halloween/haunted.js   HW.games.haunted
js/halloween/pumpkin.js   HW.games.pumpkin
js/game.js            the main IIFE: platformer levels, menus, navigation, settings, themes, loading, boot
```
Script order (index.html bottom): i18n → profile → survivor/data, art, audio, core → halloween/hw, broom, haunted, pumpkin → game.js.

### game.js section map (line numbers approximate)
Tuning (5) · Helpers (52) · Levels: `buildDoorLevel/Kitchen/Street/Vet`, `LEVELS` (89–375) · Menu music/art per theme `THEME_MUSIC`, `THEME_ART`, `NORMAL_SCREENS` (377) · Device settings `orientation`, `theme`, `applyView()` (386) · Canvas/view, orientation check, fullscreen (403) · Sprites `loadImage` (501) · Audio `SFX`, `soundUrl`, `setPlaylist`, `playSfx`, car sounds, `setMuted` (515) · Game state, `startGame(cat, levelId, fromSave, mode)`, `saveProgress` (661) · Slingshot input (809) · Physics `step` (884) · cars, needles, coins `makeCoins/updateCoins/drawCoins`, jetpack, checkpoints, `win()` (story unlock, records) · Camera · Rendering (huge) · HUD · Main loop `frame()` (2828) · Screens `showScreen`, `setMenuChrome`, `updateGear`, `floatText`, `plop` (2876) · In-game screens, `stopRun`, `backToMenu` · Title `playIntro`, login · Hub `goHub`, `refreshHub`, settings save/load to account · Secret picture + letter (3085–3210) · Minigames list, `pickCat` (cat picker for every mode) · Story `openStory` · Leaderboards `LB` config, `loadLb` · Settings `openSettings`, `syncSettings`, theme `applyTheme/setTheme`, `setOrientation` · In-game buttons · Survivor + HW runner creation (3536) · Loading `loadAll` (3571) · Boot (3628).

### Mode runners (how the main loop is shared)
`frame(dt)` in game.js: if `survivor.active` → `survivor.frame(dt)`; else if `hw.active` → `hw.frame(dt)`; else the platformer (fixed 1/120 physics step) or, in menus, nothing is drawn (the menu background image covers the canvas: `menuOpen`).
Each runner gets an **api object** from game.js (canvas, ctx, view, audio, store = `Profile`, sfx, sprites, setPlaylist, showScreen, setMuted, toHub/toLevels, `blocked()` = wrong orientation, `gfMode()`, `onRunChange` = checkOrientation, catImage …) and returns `{ active, running, frame, start/openLobby, quit, pause, syncSound, onLanguage, debug }`. **For Christmas, copy the HW runner pattern** (or generalize hw.js into an event runner).

### Navigation flow
Loading screen (cat walks along the bar, `loadAll`) → Title (`playIntro`: logo drops + bounces, flash, then name field / "Play as guest") → **Hub** (per theme) →
- Normal theme: Minigames (`#levels`: levels 1–4 + Backyard Survivors) → `pickCat` → game · Story (`pickCat` first, then `#story` path, levels unlock in order per cat) · Casino (only a floating "Under development") · Leaderboards (level times + most coins).
- Halloween theme: Broom Ride / Haunted House / Pumpkin Patch → `pickCat` → `hw.start(game, cat)` · Leaderboards (Halloween tabs only) · Secret Picture button.
Screens: `screens = ['title','hub','levels','cats','story','leaderboard','pause','win','over']`; Survivor and HW have their own screens (`sv-*`, `hw-*`). `#settings` and `#secret` are overlays. The floating ⚙ (`#btn-settings`) shows whenever no in-game HUD is visible; each HUD has its own gear (`.gear-btn`). Opening settings pauses the running game.

## 5. Event themes (Halloween now, Christmas next)

- `html[data-theme]` = `normal` | `halloween`. Set **before first paint** by the inline script in `index.html` `<head>` – it whitelists theme names (`v === 'normal' || v === 'halloween'`), **add `christmas` there**.
- game.js: `let theme = store.get('theme', 'halloween')` (default), `THEME_MUSIC[theme]` (menu music), `THEME_ART[theme]` ({bg, logo}), `applyTheme()` (sets attribute, logo src, `<meta theme-color>`), `setTheme(t)` (also swaps music, leaves `NORMAL_SCREENS` back to the hub). Settings has `#set-theme` segmented buttons (`data-theme-btn`).
- Theme is also saved in the **account** (`settings.theme`) and applied on login by `loadAccountSettings()` → see gotcha 13.12.
- CSS: everything Halloween is in the block "Halloween event" at the end of `style.css`: CSS variables (`--accent` …), `#menu-bg` image, logo glow, lightning flash, loading screen, `#spooky` ambience (SVG bats, CSS leaves, fog), Creepster headings, `.hub-btn.hw` dripping glowing buttons, candy corn icon, secret picture styles.
- Visibility helpers (currently Halloween-specific – generalize for Christmas): `.normal-only` (hidden in Halloween), `.hw-only` (hub button group), `.hw-only-flex`, `.hw-inline`, `.lb-hw-tabs`. In Halloween mode only Halloween currency + Halloween leaderboards are shown (user requirement – same for Christmas).

## 6. Game modes

### Platformer levels (game.js)
Slingshot jump (drag back + release; "Direct aim" inverts). 7 lives, checkpoints (shelves), Girlfriend Mode jetpack. Levels: 1 Open the Door (vertical climb), 2 Kitchen Raid (trampolines, crumbling crackers, cat food can), 3 Street Dash (cars with engine sound + ⚠ warnings), 4 Vet Visit (survive 120 s of syringes, ranked by fewest hits, then time).
Each level has `views: { portrait: {viewW, viewH}, landscape: {...} }`; `applyView()` picks by the orientation setting. Vet Visit is rebuilt narrower in portrait (`builtFor`).
**Coins**: seeded via `makeCoins(level)` on platforms (vet table spawns them over time); saved immediately to `coins` on the account. Mid-level save (`save`) powers the hub "Continue" button. Story: `story[cat]` = levels cleared; win screen shows "Next level".

### Backyard Survivors (js/survivor/)
Vampire-Survivors-style endless mode, portrait or landscape, floating joystick/WASD. 10 cat weapons with evolutions, 13 passives, 9 critters, 3 bosses (Rat King, Robo-Vacuum, Queen Wasp every 3 min), elites with cardboard-box chests, swarm events, flower pots, day/night, Cat Tree meta upgrades bought with fish coins (`svCoins`, `svMeta`), record `svBest`. All tuning numbers in `data.js`. Mallow starts with Claw Swipe (tanky), Mischko with Fishbone Toss (fast). Music: jaunty_guitar_motif_1/2.

### Halloween minigames (js/halloween/)
Runner `hw.js`: game interface `HW.games.<id> = (env) => ({ update(dt), render(), down(x,y), move?, up?, key?(code) → bool, hud() → string, blur?, debug? })`. `env` offers `ctx, view, sfx, tr, w, h, dpr, cat, score, corn, addScore(n,x,y,color), addCorn(n,x,y), end({title,…}), shake(a), shakeOffset(), burst(...), text(...), drawFx(), drawCat(pose, x, y, h, {frame, flip, rot, alpha, squash, center}), walkFrames()`.
Results: best score saved to `hwBroom|hwHaunted|hwPumpkin` = `{score, cat, corn, at, …}`; candy corn added to `hwCorn` (also when quitting early); skipped in Girlfriend Mode.
- **Broom Ride** (music halloween_2): Flappy-style, tap to rise; chimneys/towers + hanging dead trees, ghosts in gaps from score 8; score = obstacles passed; candy corn in gaps. World height 640, width follows screen.
- **Haunted House** (halloween_3): Pac-Man style on 3 validated 15×17 floors (`FLOORS`; transposed in landscape), swipe/arrows, 3–4 ghosts with different targeting, catnip = scared ghosts, candlelight darkness, 3 lives, floors loop faster.
- **Pumpkin Patch** (halloween_4): 60 s, monsters pop out of jack-o'-lanterns (3×3 portrait / 5×2 landscape), the cat sits at the bottom and pounces to the tap point, combos ×1–5, golden ghost +2 corn, black cat = −30.
Costume sprites: Mischko has 3 walking frames, Mallow 2 (`HW_WALK`), walking_1 doubles as idle; poses sitting/jump/falling/landing/hit.

### Secret picture + letter (Halloween)
Hub button shows progress `hwCorn / HW.SECRET_COST` (200, in hw.js). Unlocked → `#secret` overlay with `assets/secret/halloween_ending.jpg` and `music/secret_ending.mp3` (starts when the picture opens, menu music returns on close).
Added by another session on Oct 30: on accounts **`mimaro` and `niklas` only** (`LETTER_KEYS`), tapping the picture dims it and rolls a **personal German love letter** (`LETTER` array in game.js, Dancing Script font). It is private and personal – do not change, translate, quote or reuse its text unless Niklas asks.
Note: the picture is in the public repo, so it's only "secret" inside the game.

## 7. Accounts, database, saving

- `js/profile.js`: name-based accounts. Doc id = lowercased, trimmed name (`NAME_RE` 2–16 letters/digits/space/-/_). Guests (`__guest`) are local only and never on leaderboards.
- Firebase config is in profile.js (public by design). SDK from `https://www.gstatic.com/firebasejs/12.4.0/` loaded with dynamic `import()`. 8 s timeouts. Writes are debounced 1.5 s (`SYNC_DELAY`) and flushed when the page hides. Every profile is also cached in `localStorage['otd.profile.<key>']` with a `dirty` flag; offline logins use the cache.
- Firestore rules: fully open (`allow read, write: if true`) – Niklas accepted that. Anyone could edit data.
- REST quick test (no auth needed):
  `curl "https://firestore.googleapis.com/v1/projects/mimaro-db/databases/(default)/documents/players?key=<apiKey from profile.js>"`
  Delete test docs you create (e.g. `-X DELETE …/players/claude%20test?key=…`).
- **Player document fields** (`players/<key>`):
  `name, key, created, updated` · `coins` (platform levels) · `story {mallow, mischko}` (levels cleared) · `best1..best3 {time, cat, jumps, hits, at}` · `best4 {…, score}` (vet: `hits*100000 + time*10`, lower is better) · `save` (mid-level continue state or null) · `settings {lang, orient, gf, directAim, muted, theme}` · `svCoins, svMeta {…}, svBest {time, kills, level, cat, at}` · `hwCorn` (total candy corn collected) · `hwBroom, hwHaunted, hwPumpkin {score, cat, corn, at, …}`.
- Leaderboards (`LB` in game.js) query one ordered field each, top 10: `best1.time asc` … `best4.score asc`, `svBest.time desc`, `coins desc`, `hwBroom.score desc`, `hwHaunted.score desc`, `hwPumpkin.score desc`, `hwCorn desc`. Single-field indexes are automatic; avoid queries that need composite indexes.
- Runners save through `api.store = Profile` (`get(key, fb)`, `set(key, value)`, `addCoins(n)`).
- Device-only `localStorage` keys (prefix `otd.`): `lang`, `theme`, `orient`, `muted`, `directAim`, `gfMode`, `cat`, `lastName`, `migrated`, `profile.<key>`.
- New currency/records for Christmas: add top-level fields (e.g. `xmCookies`, `xm<Game>`), save via `store.set`, add `LB` entries.

## 8. Translations

- `js/i18n.js`: `en` and `de` dictionaries. `t(key, {vars})` (in game.js aliased as **`tr`** – see gotcha 13.3), `I18N.tx(key)` returns the German override or null (used for Survivor content whose English lives in data.js: arrays `svw.<weapon>` = [name, desc, unit, units], `svp.`, `svm.`, `svc.`, `sve.`, `svev.<time>`).
- Static HTML: `data-i18n="key"`, `data-i18n-ph` (placeholder), `data-i18n-aria`. `I18N.onChange` re-renders dynamic screens.
- Add every new string to **both** dictionaries. German uses informal "du".

## 9. Assets (sorted 2026-11-23 – see also assets/README.md)

```
assets/cats/<cat>/<cat>_<pose>.png                     normal sprites (idle, sitting, jump, falling, landing, hit, walking_1..4)
assets/cats/<cat>/halloween/<cat>_<pose>_halloween.png costume sprites, game-sized (320 px tall walking_1, uniform scale per cat)
assets/menu/   bg.jpg, bg_halloween.jpg, logo.png, logo_halloween.png
assets/secret/ halloween_ending.jpg
assets/music/  bouncing_two_step_1/2 (menu + door + vet), bouncy_banjo_run_1/2 (kitchen), jaunty_guitar_motif_1/2 (street + survivor),
               halloween_1 (Halloween menu), halloween_2/3/4 (Broom/Haunted/Pumpkin), secret_ending
assets/sfx/    spring_1..3 (jump), bloop_1..3 (land), car_crash, car_driving_1/2
assets/source/ originals NOT loaded by the game (sprite sheets, full-size PNGs, full-size secret picture)
```
- All sprites face **right**; draw flipped for left. Normal walking frames are larger canvases than idle → `drawCat` normalizes them to the idle width; costume sprites share one scale per cat (from walking_1 height).
- Image prep in PowerShell with `System.Drawing` (no PIL installed): backgrounds → JPEG q84 (2.4 MB → ~300 KB), logos/sprites → resized PNG with alpha. Keep originals in `assets/source/`.
- Sound paths in code are relative to `assets/` (`'music/x.mp3'`, `'sfx/x.mp3'`), resolved by `soundUrl()`.

## 10. Audio

- `setPlaylist(list)` compares by **array identity** – always pass a constant array (e.g. `THEME_MUSIC[theme]`, `HW.MUSIC[id]`), never a fresh literal each time, or the song restarts.
- Music is an `<audio>` element (needs a user gesture first: `unlockAudio` on first pointerdown). SFX: decoded samples (`playSfx('jump'|'land'|'crash')`, car engines with panning) plus **synthesized** sounds from `js/survivor/audio.js` (`uiSfx = SV.createSfx(audio)`): hit, kill, pickup (rising pitch streak), coin, heal, levelUp, pick, hurt, swipe, throw, laser, zap, boom, splash, pounce, bigHiss, chest, rattle, warning, powerUp, bossDie, death, whoosh, waka, boo, popup, ghostEat, tick, go, **plop** (menu buttons). Add new synth sounds there.
- `syncAudioPause` suspends the AudioContext while a platform level is paused, so menu plops are silent in the pause menu (known, accepted).

## 11. UI conventions

- Font Fredoka everywhere; Creepster for Halloween headings/buttons; Dancing Script for the letter.
- Hub buttons bounce (`.boing`) + `plop()` sound; "Coming soon" style feedback via `floatText(el, text)`.
- Emoji: avoid Emoji 13+ (🪙, 🪩 render as boxes on Windows 10 / older phones). Coins use a CSS-drawn `.coin-ico`, candy corn `.corn-ico` (clip-path triangle).
- Panels are glassy dark cards; buttons `.btn.primary/.ghost`; segmented controls `.seg`.
- Settings are always reachable (⚙ top right). Orientation setting applies to every game; phones held the wrong way get the rotate prompt (game pauses).

## 12. Ideas / backlog Niklas mentioned
- Casino (gamble coins), skins bought with coins, more events. Main menu Casino button is a placeholder in normal mode.
- Vet Visit still uses the door music (TODO in LEVELS).
- `main` is stale; `Testing` too. Pages serves `halloween`.

## 13. Gotchas / lessons learned (read these!)

1. **Line endings**: files in the working tree may be CRLF. Python patch scripts must normalize (`s.replace('\r\n','\n')`, patch, convert back). The Edit tool is fine for unique single spots.
2. **Bash heredocs mangle backslash escapes** (`'\r\n'` became real newlines). Write non-trivial scripts with the Write tool into the scratchpad, then run them.
3. In game.js never call the global `t()` – many functions have a local `t`. Use **`tr`** (`const tr = window.I18N.t`).
4. `Profile.guest` is a *getter* (is the current player a guest?); the method is `Profile.playAsGuest()`.
5. `level.coins` must exist even for the backdrop level built at boot.
6. `checkOrientation` runs early: `survivor`/`hw` are declared near the top as `let … = null` and created later.
7. GitHub Pages serves the `halloween` branch – changes on `christmas` are not live until merged/switched. Ask Niklas before touching the live branch.
8. Pumpkin/Haunted/Broom read `env.w/h` every frame → they re-layout on rotation; Haunted House only transposes its maze when a floor loads.
9. The leaderboard requires an internet connection; the screen shows a spinner, then "needs internet" after 8 s.
10. Survivor `hurtEnemy` damage numbers / particle caps exist for performance; don't remove.
11. Firestore field names must not contain dots (that's why keys are `svCoins` not `sv.coins`).
12. **Theme is stored per account** (`settings.theme`): players who used Halloween will be switched back to Halloween on login even if the default becomes Christmas. When making Christmas the default, decide with Niklas whether to force it (e.g. migrate saved `halloween` → `christmas`, or pick the event by date) and update the `<head>` whitelist script.
13. Test both themes after CSS changes – theme-specific `display` rules use `!important`.

## 14. Christmas special – checklist (next task)

Niklas said: "Next we are going to implement a christmas special." Expect a request similar to Halloween: new theme as default, new background/logo/music/costume sprites with `_christmas`, 3 new minigames, an exclusive currency, exclusive leaderboards, maybe a secret picture. Before building, ask/confirm what isn't specified (game ideas → propose 3 and wait for his pick, as with Halloween).

Implementation steps (mirror Halloween):
1. Assets: sort his `_christmas` files into `assets/menu/` (bg_christmas.jpg, logo_christmas.png – compress), `assets/cats/<cat>/christmas/` (downscale, uniform scale per cat; note how many walking frames each cat has and what's missing), `assets/music/christmas_N.mp3`, originals to `assets/source/`.
2. Theme plumbing: `THEME_MUSIC.christmas`, `THEME_ART.christmas`, head-script whitelist, `#set-theme` third button (+ i18n `settings.christmas`), default `theme`, account-theme migration (13.12), `meta theme-color`.
3. Generalize the visibility helpers: replace `.hw-only/.normal-only/.hw-inline/.hw-only-flex/.lb-hw-tabs` with theme-agnostic classes (e.g. `.only-normal`, `.only-halloween`, `.only-christmas` + `[data-theme="x"] .only-x { display: … }`). Keep Halloween working.
4. CSS block `[data-theme="christmas"]`: colors, fonts, menu background, ambience (snowfall instead of bats/leaves), button style, loading screen, flash effect.
5. Event runner: reuse hw.js (rename/generalize to an event runner with per-event config: game ids, music, currency field, record fields, secret cost) or copy it to `js/christmas/xm.js`. Register games in their own files.
6. Hub: three Christmas game buttons + Leaderboards + (secret) button; chip shows only the Christmas currency.
7. Leaderboards: Christmas tabs + `LB` entries; hide the others in Christmas mode.
8. Saving: new fields on the player doc, Girlfriend Mode exclusion, guest local only.
9. i18n for every string in EN + DE.
10. Test portrait + landscape, both languages, both theme switches (normal ↔ halloween ↔ christmas), headless screenshots, then commit on `christmas` and push when he asks.
