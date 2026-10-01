(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------
  const W = 360;              // width of the door level, in world units
  const MIN_VIEW_H = 600;     // portrait levels always show at least this much world height
  const G = 2400;             // gravity (units/s^2)
  const MAX_FALL = 1900;      // terminal velocity
  const VMAX = 1150;          // launch speed at full power
  const MIN_POWER = 0.12;     // below this a release cancels the jump
  const MIN_ANGLE = 12 * Math.PI / 180;   // flattest allowed launch angle
  const WALL_BOUNCE = 0.45;   // horizontal velocity kept after hitting the door frame
  const LAND_TIME = 0.22;     // seconds the landing pose is shown
  const WAIT_TO_IDLE = 4;     // seconds of waiting before the cat sits down
  const BIG_FALL = 320;       // landing this far below takeoff counts as a "big fall"
  const MAX_LIVES = 7;
  const CP_FALL_MARGIN = 90;  // how far below a checkpoint you must fall to lose a life
  const BLINK_TIME = 2.5;     // seconds the cat blinks after respawning
  const JET_TIME = 3.2;       // seconds the jetpack flight to the goal takes
  const BREAK_DELAY = 1.1;    // seconds a cracker platform holds after being landed on
  const BREAK_RESPAWN = 3.5;  // seconds until a broken platform comes back
  const TRAMP_SKIP = 3;       // trampolines launch you this many platforms ahead
  const STEP = 1 / 120;       // fixed physics step

  const HW = 18;              // player hitbox half-width
  const PH = 38;              // player hitbox height
  const FOOT = 13;            // half-width of the "feet" used for landing checks
  const SPRITE_H = 50;        // on-screen height of the standing pose

  const CATS = {
    mallow:  { name: 'Mallow',  dir: 'assets/Mallow/',  prefix: 'mallow_' },
    mischko: { name: 'Mischko', dir: 'assets/Mischko/', prefix: 'mischko_' },
  };
  const POSE_FILES = ['idle', 'jump', 'falling', 'landing', 'sitting'];
  // game state -> sprite file
  const POSE_FOR_STATE = {
    waiting: 'idle',      // standing side view
    idle: 'sitting',      // after waiting a while, the cat sits down
    aim: 'landing',       // crouched, ready to jump
    land: 'landing',
    jump: 'jump',
    fall: 'falling',
    won: 'sitting',
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('otd.' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('otd.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    del(key) {
      try { localStorage.removeItem('otd.' + key); } catch (e) { /* ignore */ }
    },
  };

  function formatTime(t, tenths = true) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const base = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return tenths ? base + '.' + Math.floor((t * 10) % 10) : base;
  }

  // ---------------------------------------------------------------------------
  // Levels
  // ---------------------------------------------------------------------------
  const SECTIONS = 5;
  const PER_SECTION = 11;

  // Level 1: climb the door to the handle.
  function buildDoorLevel() {
    const rnd = mulberry32(20260929);
    const R = (a, b) => a + (b - a) * rnd();
    const plats = [];
    plats.push({ kind: 'floor', x: -600, y: 0, w: W + 1200, h: 800 });

    const total = SECTIONS * PER_SECTION;
    let cx = W / 2;
    let y = 0;
    let n = 0;

    for (let s = 0; s < SECTIONS; s++) {
      for (let i = 0; i < PER_SECTION; i++, n++) {
        const t = n / total;
        const w = Math.round(lerp(104, 58, t) * R(0.9, 1.1));
        y -= Math.round(lerp(118, 170, t) + R(-14, 14));
        const dir = rnd() < 0.5 ? -1 : 1;
        const dx = R(lerp(50, 90, t), lerp(130, 185, t)) * dir;
        const minC = w / 2 + 12;
        const maxC = W - w / 2 - 12;
        let nx = cx + dx;
        if (nx < minC || nx > maxC) nx = cx - dx;
        nx = clamp(nx, minC, maxC);

        const p = { kind: 'normal', x: nx - w / 2, y, w, h: 16 };
        if (s >= 2 && rnd() < 0.12 + 0.08 * s) makeMoving(p, R, W);
        if (p.kind === 'moving') nx = p.baseX + w / 2;
        plats.push(p);
        cx = nx;
      }

      if (s < SECTIONS - 1) {
        // Wide shelf attached to the door frame: a checkpoint.
        y -= 150;
        const sw = 210;
        const left = cx < W / 2;
        plats.push({ kind: 'shelf', x: left ? 0 : W - sw, y, w: sw, h: 22, label: (s + 2) + ' / ' + SECTIONS });
        cx = left ? sw / 2 : W - sw / 2;
      }
    }

    // The goal: the door handle.
    y -= 165;
    const pivotX = W - 34;
    const barW = 140;
    const handle = { kind: 'handle', x: pivotX - barW, y, w: barW, h: 14, pivotX, pivotY: y + 7 };
    handle.jetX = handle.x + handle.w * 0.35;
    handle.jetY = handle.y - 70;
    plats.push(handle);

    return { id: 1, theme: 'door', width: W, viewW: W, viewH: MIN_VIEW_H, plats, goal: handle, topY: y - 320, spawnX: W / 2, jetX: W / 2 + 110, decor: [] };
  }

  // Level 2 (landscape): hop across the kitchen, bottom left to top right, to the cat food.
  function buildKitchenLevel() {
    const rnd = mulberry32(20261001);
    const R = (a, b) => a + (b - a) * rnd();
    const plats = [];
    const floor = { kind: 'floor', x: -600, y: 0, w: 0, h: 800 };
    plats.push(floor);

    const total = SECTIONS * PER_SECTION;
    let cx = 90;
    let y = 0;
    let n = 0;

    for (let s = 0; s < SECTIONS; s++) {
      for (let i = 0; i < PER_SECTION; i++, n++) {
        const t = n / total;
        const w = Math.round(lerp(110, 66, t) * R(0.9, 1.1));
        y -= Math.round(lerp(72, 104, t) + R(-12, 12));
        // mostly to the right, sometimes a step back
        const back = i > 0 && rnd() < 0.15;
        const dx = back ? -R(60, 110) : R(lerp(110, 140, t), lerp(165, 210, t));
        let nx = Math.max(cx + dx, w / 2 + 12);

        const p = { kind: 'normal', x: nx - w / 2, y, w, h: 16 };
        const prev = plats[plats.length - 1];
        const plain = prev.kind === 'normal' || prev.kind === 'shelf' || prev.kind === 'floor';
        const roll = rnd();
        const trampSlot = s >= 1 && i === 1 + (s * 2) % 5;   // at least one trampoline per section
        if (s >= 1 && i <= PER_SECTION - 1 - TRAMP_SKIP && (trampSlot || (plain && roll < 0.08))) {
          p.kind = 'trampoline';
          p.h = 18;
        } else if (s >= 1 && plain && roll >= 0.08 && roll < 0.38) {
          p.kind = 'breakable';
        } else if (s >= 2 && roll > 0.88 - 0.03 * s) {
          makeMoving(p, R, Infinity);
          nx = p.baseX + w / 2;
        }
        plats.push(p);
        cx = nx;
      }

      if (s < SECTIONS - 1) {
        // Countertop: a checkpoint.
        y -= 90;
        const sw = 240;
        const sx = cx + R(40, 90) - sw / 2;
        plats.push({ kind: 'shelf', x: sx, y, w: sw, h: 22, label: (s + 2) + ' / ' + SECTIONS });
        cx = sx + sw / 2;
      }
    }

    // The goal: a can of cat food on the top shelf.
    y -= 110;
    const goalShelf = { kind: 'normal', x: cx + 40, y, w: 230, h: 18 };
    plats.push(goalShelf);
    const can = { kind: 'can', x: goalShelf.x + goalShelf.w - 84, y: y - 62, w: 58, h: 62, shelfY: y };
    can.jetX = can.x + can.w / 2;
    can.jetY = can.y - 70;
    plats.push(can);

    const width = Math.round(goalShelf.x + goalShelf.w + 16);
    floor.w = width + 1200;
    const level = {
      id: 2, theme: 'kitchen', width, plats, goal: can, topY: y - 260,
      spawnX: 90, jetX: 220, landscape: true, viewW: 640, viewH: 400,
    };

    // Trampolines launch to the platform TRAMP_SKIP ahead; keep only the ones that really land there.
    for (let k = 0; k < plats.length; k++) {
      const p = plats[k];
      if (p.kind !== 'trampoline') continue;
      const target = plats[k + TRAMP_SKIP];
      if (!target || (target.kind !== 'normal' && target.kind !== 'moving')) { p.kind = 'normal'; p.h = 16; continue; }
      if (target.kind === 'moving') { target.kind = 'normal'; target.x = target.baseX; }  // landing spot must hold still
      const x0 = p.x + p.w / 2;
      const x1 = target.x + target.w / 2;
      const dy = target.y - p.y;
      const apex = Math.max(-dy, 0) + 110;
      p.launchVy = -Math.sqrt(2 * G * apex);
      const tUp = -p.launchVy / G;
      const tDown = Math.sqrt(2 * (dy + apex) / G);
      p.launchVx = (x1 - x0) / (tUp + tDown);
      if (simulateFlight(level, x0, p.y, p.launchVx, p.launchVy) !== target) { p.kind = 'normal'; p.h = 16; }
    }

    // Background decoration along the diagonal
    level.decor = [];
    const N = Math.round(width / 260);
    const kinds = ['cabinet', 'window', 'cabinet', 'clock', 'frame'];
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      level.decor.push({
        kind: kinds[Math.floor(rnd() * kinds.length)],
        x: clamp(lerp(40, width - 300, t) + R(-80, 80), 20, width - 280),
        y: lerp(-230, level.topY + 380, t) + R(-140, 60),
        w: R(150, 240), h: R(110, 170),
      });
    }
    return level;
  }

  function makeMoving(p, R, width) {
    p.kind = 'moving';
    p.amp = R(30, 60);
    p.speed = R(0.8, 1.4);
    p.phase = R(0, Math.PI * 2);
    p.baseX = clamp(p.x, p.amp + 4, width - p.w - p.amp - 4);
    p.x = p.baseX + Math.sin(p.phase) * p.amp;
  }

  // Ballistic flight with the same rules as the game; returns the platform it lands on.
  function simulateFlight(lvl, x, y, vx, vy) {
    for (let i = 0; i < 1200; i++) {
      const prev = y;
      vy = Math.min(vy + G * STEP, MAX_FALL);
      x += vx * STEP;
      y += vy * STEP;
      if (x - HW < 0) { x = HW; vx = Math.abs(vx) * WALL_BOUNCE; }
      if (x + HW > lvl.width) { x = lvl.width - HW; vx = -Math.abs(vx) * WALL_BOUNCE; }
      if (vy >= 0) {
        let hit = null;
        for (const pl of lvl.plats) {
          if (prev <= pl.y + 0.5 && y >= pl.y && x + FOOT > pl.x && x - FOOT < pl.x + pl.w) {
            if (!hit || pl.y < hit.y) hit = pl;
          }
        }
        if (hit) return hit;
      }
    }
    return null;
  }

  const LEVELS = {
    1: { name: 'Open the Door', build: buildDoorLevel, winTitle: 'Door opened!', loseText: 'The door stays shut… for now.' },
    2: { name: 'Kitchen Raid', build: buildKitchenLevel, winTitle: 'Dinner time!', loseText: 'The can stays closed… for now.' },
  };

  let level = buildDoorLevel();

  // ---------------------------------------------------------------------------
  // Canvas / view
  // ---------------------------------------------------------------------------
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const view = { cssW: 0, cssH: 0, dpr: 1, scale: 1, viewW: 0, viewH: 0 };
  const cam = { x: 0, y: 0 };

  function resize() {
    view.cssW = window.innerWidth;
    view.cssH = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.cssW * view.dpr);
    canvas.height = Math.round(view.cssH * view.dpr);
    view.scale = Math.min(view.cssW / level.viewW, view.cssH / level.viewH);
    view.viewW = view.cssW / view.scale;
    view.viewH = view.cssH / view.scale;
    checkOrientation();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---------------------------------------------------------------------------
  // Orientation: level 1 is played in portrait, level 2 in landscape
  // ---------------------------------------------------------------------------
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  let wrongOrientation = false;

  function checkOrientation() {
    const portrait = window.innerHeight >= window.innerWidth;
    const want = level.landscape ? 'landscape' : 'portrait';
    wrongOrientation = isTouch && game.running && !game.wonAt && !game.over && portrait !== (want === 'portrait');
    const el = $('rotate');
    el.classList.toggle('hidden', !wrongOrientation);
    $('rotate-text').textContent = 'Turn your phone ' + (want === 'landscape' ? 'sideways' : 'upright');
    el.classList.toggle('to-landscape', want === 'landscape');
    if (wrongOrientation) aim.active = false;
  }

  // Android can lock orientation (only in fullscreen); iOS just gets the rotate prompt.
  function lockOrientation(want) {
    if (!isTouch) return;
    const so = screen.orientation;
    const el = document.documentElement;
    if (want === 'landscape') {
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().then(() => so && so.lock && so.lock('landscape')).catch(() => {});
      } else if (so && so.lock) {
        so.lock('landscape').catch(() => {});
      }
    } else if (so && so.unlock && document.fullscreenElement) {
      try { so.unlock(); } catch (e) { /* ignore */ }
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Sprites
  // ---------------------------------------------------------------------------
  const sprites = {};

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn('Could not load', src); resolve(null); };
      img.src = src;
    });
  }

  async function loadSprites() {
    const jobs = [];
    for (const [key, cat] of Object.entries(CATS)) {
      sprites[key] = {};
      for (const pose of POSE_FILES) {
        jobs.push(loadImage(cat.dir + cat.prefix + pose + '.png').then((img) => { sprites[key][pose] = img; }));
      }
    }
    await Promise.all(jobs);
    for (const key of Object.keys(CATS)) {
      const ref = sprites[key].idle;
      sprites[key].scale = ref ? SPRITE_H / ref.height : 0.25;
    }
  }

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------
  const SOUND_DIR = 'assets/sounds/';
  const MUSIC = ['Bouncing Two-Step.mp3', 'Bouncing Two-Step2.mp3'];
  const SFX = {
    jump: ['spring.mp3', 'spring2.mp3', 'spring3.mp3'],
    land: ['bloop1.mp3', 'bloop2.mp3', 'bloop3.mp3'],
  };
  const MUSIC_VOLUME = 0.35;
  const SFX_VOLUME = 0.8;

  const audio = {
    muted: !!store.get('muted', false),
    ctx: null,
    gain: null,
    buffers: { jump: [], land: [] },
    music: null,
    track: 0,
    unlocked: false,
  };

  function soundUrl(file) { return SOUND_DIR + encodeURIComponent(file); }

  function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audio.ctx = new AC();
      audio.gain = audio.ctx.createGain();
      audio.gain.gain.value = SFX_VOLUME;
      audio.gain.connect(audio.ctx.destination);
      for (const [kind, files] of Object.entries(SFX)) {
        files.forEach((file, i) => {
          fetch(soundUrl(file))
            .then((r) => r.arrayBuffer())
            .then((data) => new Promise((res, rej) => audio.ctx.decodeAudioData(data, res, rej)))
            .then((buf) => { audio.buffers[kind][i] = buf; })
            .catch(() => console.warn('Could not load sound', file));
        });
      }
    }

    audio.music = new Audio();
    audio.music.preload = 'auto';
    audio.music.volume = MUSIC_VOLUME;
    audio.music.src = soundUrl(MUSIC[0]);
    audio.music.addEventListener('ended', () => {
      audio.track = (audio.track + 1) % MUSIC.length;
      audio.music.src = soundUrl(MUSIC[audio.track]);
      playMusic();
    });
  }

  function playMusic() {
    if (audio.muted || !audio.unlocked || document.hidden) return;
    const p = audio.music.play();
    if (p && p.catch) p.catch(() => { /* blocked until next gesture */ });
  }

  // Browsers only allow audio after a user gesture.
  function unlockAudio() {
    audio.unlocked = true;
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    if (audio.music.paused) playMusic();
  }

  function playSfx(kind) {
    if (audio.muted || !audio.ctx) return;
    const loaded = audio.buffers[kind].filter(Boolean);
    if (!loaded.length) return;
    const src = audio.ctx.createBufferSource();
    src.buffer = loaded[Math.floor(Math.random() * loaded.length)];
    src.connect(audio.gain);
    src.start();
  }

  function setMuted(m) {
    audio.muted = m;
    store.set('muted', m);
    if (m) audio.music.pause(); else playMusic();
    $('btn-sound').classList.toggle('muted', m);
    $('btn-sound').setAttribute('aria-label', m ? 'Unmute' : 'Mute');
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const game = {
    running: false,
    paused: false,
    catKey: store.get('cat', null),
    time: 0,
    clock: 0,      // drives moving platforms, always advancing while running
    jumps: 0,
    falls: 0,
    wonAt: 0,
    goalAnim: 0,
    lives: MAX_LIVES,
    checkpoint: null,  // the shelf platform the cat respawns on
    blink: 0,
    over: false,
  };

  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    grounded: true, on: null,
    state: 'waiting', stateTime: 0,
    facing: 1, squash: 1,
    takeoffY: 0,
  };

  const aim = { active: false, id: null, sx: 0, sy: 0, cx: 0, cy: 0, power: 0, angle: 0 };
  const particles = [];
  let accumulator = 0;
  let directAim = !!store.get('directAim', false);
  let gfMode = !!store.get('gfMode', false); // infinite lives

  function setState(s) {
    if (player.state !== s) { player.state = s; player.stateTime = 0; }
  }

  function resetPlayer() {
    player.x = level.spawnX; player.y = 0; player.vx = 0; player.vy = 0;
    player.grounded = true; player.on = level.plats[0];
    player.facing = 1; player.squash = 1; player.takeoffY = 0;
    setState('waiting');
  }

  function startGame(catKey, levelId, fromSave) {
    game.catKey = catKey;
    store.set('cat', catKey);
    level = LEVELS[levelId].build();
    game.levelId = levelId;
    game.running = true;
    game.paused = false;
    game.wonAt = 0;
    game.goalAnim = 0;
    game.lives = MAX_LIVES;
    game.checkpoint = null;
    game.blink = 0;
    game.over = false;
    game.jetpackTaken = false;
    game.jet = null;
    particles.length = 0;
    aim.active = false;
    resetPlayer();

    if (fromSave) {
      game.time = fromSave.time || 0;
      game.jumps = fromSave.jumps || 0;
      game.falls = fromSave.falls || 0;
      game.lives = fromSave.lives || MAX_LIVES;
      const cp = level.plats[fromSave.checkpoint];
      if (cp && cp.kind === 'shelf') game.checkpoint = cp;
      const pl = level.plats[fromSave.plat];
      if (pl && pl !== level.goal) {
        player.on = pl;
        player.x = clamp(pl.x + (fromSave.rel != null ? fromSave.rel : pl.w / 2), pl.x + 4, pl.x + pl.w - 4);
        player.y = pl.y;
        player.x = clamp(player.x, HW, level.width - HW);
      }
    } else {
      game.time = 0; game.jumps = 0; game.falls = 0;
      store.del('save');
    }

    resize();
    lockOrientation(level.landscape ? 'landscape' : 'portrait');
    cam.x = player.x - view.viewW * 0.35;
    cam.y = player.y - view.viewH * 0.62;
    clampCamera();
    showScreen(null);
    checkOrientation();
    $('hud').classList.remove('hidden');
    $('hint').classList.toggle('hidden', game.jumps >= 2);
    $('hint').classList.remove('fade');
    updateHud(true);
  }

  function saveProgress() {
    if (!game.running || game.wonAt || !player.grounded || !player.on) return;
    const idx = level.plats.indexOf(player.on);
    store.set('save', {
      cat: game.catKey, level: game.levelId, plat: idx, rel: player.x - player.on.x,
      time: game.time, jumps: game.jumps, falls: game.falls,
      lives: game.lives, checkpoint: game.checkpoint ? level.plats.indexOf(game.checkpoint) : -1,
      progress: progress(),
    });
  }

  function progress() {
    if (level.landscape) return clamp((player.x - level.spawnX) / (level.goal.x - level.spawnX), 0, 1);
    return clamp(-player.y / -level.goal.y, 0, 1);
  }

  // ---------------------------------------------------------------------------
  // Input (slingshot)
  // ---------------------------------------------------------------------------
  function canAim() {
    return game.running && !game.paused && !game.wonAt && !game.over && !wrongOrientation && player.grounded;
  }

  function maxDrag() {
    return clamp(Math.min(view.cssW, view.cssH) * 0.38, 110, 240);
  }

  function updateAim() {
    let dx = aim.sx - aim.cx;
    let dy = aim.sy - aim.cy; // screen-space launch vector (pull back)
    if (directAim) { dx = -dx; dy = -dy; }
    const dist = Math.hypot(dx, dy);
    aim.power = clamp(dist / maxDrag(), 0, 1);
    // angle measured from +x, counter-clockwise, "up" positive
    let a = Math.atan2(-dy, dx);
    if (a < MIN_ANGLE) a = (a > -Math.PI / 2) ? MIN_ANGLE : Math.PI - MIN_ANGLE;
    if (a > Math.PI - MIN_ANGLE) a = Math.PI - MIN_ANGLE;
    aim.angle = a;
    if (aim.power >= MIN_POWER) player.facing = Math.cos(a) >= 0 ? 1 : -1;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (aim.active || !canAim()) return;
    e.preventDefault();
    aim.active = true;
    aim.id = e.pointerId;
    aim.sx = aim.cx = e.clientX;
    aim.sy = aim.cy = e.clientY;
    aim.power = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setState('aim');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!aim.active || e.pointerId !== aim.id) return;
    aim.cx = e.clientX;
    aim.cy = e.clientY;
    updateAim();
  });

  function endAim(e, cancel) {
    if (!aim.active || e.pointerId !== aim.id) return;
    aim.active = false;
    if (!player.grounded || game.paused || game.wonAt) return;
    updateAim();
    if (cancel || aim.power < MIN_POWER) {
      setState('waiting');
      return;
    }
    jump(aim.angle, aim.power);
  }
  canvas.addEventListener('pointerup', (e) => endAim(e, false));
  canvas.addEventListener('pointercancel', (e) => endAim(e, true));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function jump(angle, power) {
    const v = VMAX * power;
    player.vx = Math.cos(angle) * v;
    player.vy = -Math.sin(angle) * v;
    player.facing = player.vx >= 0 ? 1 : -1;
    player.grounded = false;
    player.on = null;
    player.takeoffY = player.y;
    player.squash = 0.78;
    game.jumps++;
    setState('jump');
    playSfx('jump');
    spawnDust(player.x, player.y, 6, 0.6);
    if (game.jumps >= 2) $('hint').classList.add('fade');
  }

  // ---------------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------------
  function updatePlatforms(dt) {
    for (const p of level.plats) {
      if (p.kind === 'moving') {
        const nx = p.baseX + Math.sin(game.clock * p.speed + p.phase) * p.amp;
        p.dx = nx - p.x;
        p.x = nx;
      } else if (p.kind === 'breakable') {
        if (p.broken) {
          p.respawnT += dt;
          if (p.respawnT >= BREAK_RESPAWN) { p.broken = false; p.cracking = false; }
        } else if (p.cracking) {
          p.crackT += dt;
          if (p.crackT >= BREAK_DELAY) breakPlatform(p);
        }
      } else if (p.kind === 'trampoline' && p.boing > 0) {
        p.boing = Math.max(0, p.boing - dt * 3);
      }
    }
  }

  function breakPlatform(p) {
    p.broken = true;
    p.cracking = false;
    p.respawnT = 0;
    for (let i = 0; i < 14; i++) {
      particles.push({
        x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h,
        vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 150,
        life: 0.7 + Math.random() * 0.4, t: 0, r: 2 + Math.random() * 4,
        color: 'rgba(214,160,70,', grav: 1400,
      });
    }
  }

  function restoreBreakables() {
    for (const p of level.plats) {
      if (p.kind === 'breakable') { p.broken = false; p.cracking = false; }
    }
  }

  function step(dt) {
    game.clock += dt;
    updatePlatforms(dt);

    const p = player;
    if (game.wonAt || game.over) return;
    if (game.jet) { updateJet(dt); return; }
    if (touchesJetpack()) { startJet(); return; }

    if (p.grounded) {
      const pl = p.on;
      if (pl && pl.dx) p.x += pl.dx;
      p.x = clamp(p.x, HW, level.width - HW);
      if (!pl || pl.broken || p.x + FOOT < pl.x || p.x - FOOT > pl.x + pl.w) {
        // walked (or got carried) off the edge
        p.grounded = false;
        p.on = null;
        p.takeoffY = p.y;
        aim.active = false;
        setState('fall');
      }
      return;
    }

    const prevBottom = p.y;
    p.vy = Math.min(p.vy + G * dt, MAX_FALL);
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Side walls
    if (p.x - HW < 0) { p.x = HW; p.vx = Math.abs(p.vx) * WALL_BOUNCE; p.facing = 1; }
    if (p.x + HW > level.width) { p.x = level.width - HW; p.vx = -Math.abs(p.vx) * WALL_BOUNCE; p.facing = -1; }

    if (level.goal.kind === 'can' && touchesCan()) { reachCan(); return; }

    if (p.vy >= 0) {
      let hit = null;
      for (const pl of level.plats) {
        if (pl.broken) continue;
        if (prevBottom <= pl.y + 0.5 && p.y >= pl.y &&
            p.x + FOOT > pl.x && p.x - FOOT < pl.x + pl.w) {
          if (!hit || pl.y < hit.y) hit = pl;
        }
      }
      if (hit) { land(hit); return; }
    }

    const cp = game.checkpoint;
    if (cp && p.y > cp.y + CP_FALL_MARGIN) { fellBelowCheckpoint(); return; }

    setState(p.vy < 0 ? 'jump' : 'fall');
  }

  // ---------------------------------------------------------------------------
  // Jetpack (Girlfriend Mode only): flies the cat straight to the door handle
  // ---------------------------------------------------------------------------
  function jetpackAvailable() {
    return gfMode && !game.jetpackTaken;
  }

  function touchesJetpack() {
    const p = player;
    return jetpackAvailable() && Math.abs(p.x - level.jetX) < HW + 14 && p.y > -34 && p.y - PH < 0;
  }

  function startJet() {
    const p = player;
    const goal = level.goal;
    game.jetpackTaken = true;
    game.jet = { t: 0, x0: p.x, y0: p.y, x1: goal.jetX, y1: goal.jetY };
    p.grounded = false;
    p.on = null;
    p.vx = 0; p.vy = 0;
    p.facing = game.jet.x1 >= p.x ? 1 : -1;
    aim.active = false;
    $('hint').classList.add('fade');
    setState('jump');
    playSfx('jump');
    showToast('Jetpack! \u2191');
  }

  function updateJet(dt) {
    const p = player;
    const j = game.jet;
    j.t += dt;
    const u = clamp(j.t / JET_TIME, 0, 1);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    p.x = lerp(j.x0, j.x1, e);
    p.y = lerp(j.y0, j.y1, e);
    if (Math.random() < 0.6) {
      particles.push({
        x: p.x - p.facing * 12 + (Math.random() - 0.5) * 8, y: p.y - 4,
        vx: (Math.random() - 0.5) * 60, vy: 150 + Math.random() * 200,
        life: 0.25 + Math.random() * 0.2, t: 0, r: 3 + Math.random() * 3,
        color: Math.random() < 0.5 ? 'rgba(255,170,60,' : 'rgba(255,230,120,', grav: 0,
      });
    }
    if (u >= 1) {
      // switch the engine off above the goal and drop onto it
      game.jet = null;
      p.takeoffY = p.y;
      setState('fall');
    }
  }

  function drawJetpackShape(cx, cy, flame) {
    // flames
    if (flame) {
      const f = 10 + Math.random() * 8;
      for (const nx of [cx - 6, cx + 6]) {
        ctx.fillStyle = '#ffb347';
        ctx.beginPath(); ctx.moveTo(nx - 4, cy + 12); ctx.lineTo(nx + 4, cy + 12); ctx.lineTo(nx, cy + 12 + f); ctx.fill();
        ctx.fillStyle = '#fff3a0';
        ctx.beginPath(); ctx.moveTo(nx - 2, cy + 12); ctx.lineTo(nx + 2, cy + 12); ctx.lineTo(nx, cy + 12 + f * 0.55); ctx.fill();
      }
    }
    // nozzles
    ctx.fillStyle = '#6b6f7a';
    ctx.fillRect(cx - 9, cy + 8, 6, 5);
    ctx.fillRect(cx + 3, cy + 8, 6, 5);
    // tanks
    for (const tx of [cx - 11, cx + 1]) {
      roundRect(tx, cy - 12, 10, 22, 5);
      ctx.fillStyle = '#e0524f';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(tx + 2, cy - 8, 2, 13);
      roundRect(tx + 1, cy - 14, 8, 5, 2);
      ctx.fillStyle = '#9aa0ab';
      ctx.fill();
    }
    // strap
    ctx.fillStyle = '#3d3f47';
    ctx.fillRect(cx - 11, cy - 3, 22, 3);
  }

  function drawJetpackItem() {
    if (!jetpackAvailable() || game.jet) return;
    const JET_X = level.jetX;
    const bob = Math.sin(game.clock * 3) * 3;
    const cy = -22 + bob;
    // glow
    const g = ctx.createRadialGradient(JET_X, cy, 2, JET_X, cy, 34);
    g.addColorStop(0, 'rgba(255, 200, 120, 0.55)');
    g.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(JET_X, cy, 34, 0, Math.PI * 2); ctx.fill();
    drawJetpackShape(JET_X, cy, false);
    // up arrow + label
    const ay = cy - 30 + Math.sin(game.clock * 5) * 3;
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath();
    ctx.moveTo(JET_X, ay - 10); ctx.lineTo(JET_X + 9, ay); ctx.lineTo(JET_X + 3, ay);
    ctx.lineTo(JET_X + 3, ay + 8); ctx.lineTo(JET_X - 3, ay + 8); ctx.lineTo(JET_X - 3, ay);
    ctx.lineTo(JET_X - 9, ay); ctx.closePath(); ctx.fill();
    ctx.font = '700 10px Fredoka, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20, 10, 30, 0.6)';
    ctx.strokeText('JETPACK', JET_X, ay - 18);
    ctx.fillStyle = '#fff';
    ctx.fillText('JETPACK', JET_X, ay - 18);
  }

  function fellBelowCheckpoint() {
    if (!gfMode) game.lives--;
    updateHud(true);
    const hearts = $('hud-hearts');
    hearts.classList.remove('hurt');
    void hearts.offsetWidth; // restart the shake animation
    hearts.classList.add('hurt');
    if (navigator.vibrate) { try { navigator.vibrate([40, 40, 40]); } catch (e) { /* ignore */ } }
    if (game.lives <= 0) { gameOver(); return; }
    respawnAtCheckpoint();
    saveProgress();
  }

  function respawnAtCheckpoint() {
    const p = player;
    const cp = game.checkpoint;
    p.x = clamp(cp.x + cp.w / 2, HW, level.width - HW);
    restoreBreakables();
    p.y = cp.y;
    p.vx = 0; p.vy = 0;
    p.grounded = true;
    p.on = cp;
    p.squash = 1;
    aim.active = false;
    game.blink = BLINK_TIME;
    setState('waiting');
    spawnDust(p.x, p.y, 10, 0.8);
  }

  function gameOver() {
    game.over = true;
    aim.active = false;
    store.del('save');
    setTimeout(() => {
      $('over-progress').textContent = Math.round(progress() * 100) + '%';
      $('over-time').textContent = formatTime(game.time, false);
      $('over-jumps').textContent = game.jumps;
      $('over-sub').textContent = LEVELS[game.levelId].loseText;
      $('hud').classList.add('hidden');
      showScreen('over');
    }, 700);
  }

  function showToast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  function land(pl) {
    if (pl.kind === 'trampoline') { bounce(pl); return; }
    const p = player;
    const impact = p.vy;
    p.y = pl.y;
    p.vx = 0;
    p.vy = 0;
    p.grounded = true;
    p.on = pl;
    p.squash = 1 + clamp(impact / 2600, 0.08, 0.3);
    setState('land');
    playSfx('land');
    spawnDust(p.x, p.y, 8 + Math.round(impact / 200), 1);
    if (pl.y - p.takeoffY > BIG_FALL) game.falls++;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
    if (pl.kind === 'shelf' && (!game.checkpoint || pl.y < game.checkpoint.y)) {
      game.checkpoint = pl;
      showToast('Checkpoint ' + pl.label.replace(/ /g, ''));
    }
    if (pl.kind === 'breakable' && !pl.cracking) { pl.cracking = true; pl.crackT = 0; }
    if (pl === level.goal) win();
    else saveProgress();
  }

  function bounce(pl) {
    const p = player;
    p.x = pl.x + pl.w / 2;
    p.y = pl.y;
    p.vx = pl.launchVx;
    p.vy = pl.launchVy;
    p.grounded = false;
    p.on = null;
    p.takeoffY = p.y;
    p.facing = p.vx >= 0 ? 1 : -1;
    p.squash = 0.72;
    pl.boing = 1;
    setState('jump');
    playSfx('jump');
    spawnDust(p.x, p.y, 8, 0.8);
    if (navigator.vibrate) { try { navigator.vibrate(20); } catch (e) { /* ignore */ } }
  }

  function touchesCan() {
    const c = level.goal;
    const p = player;
    return p.x + HW > c.x && p.x - HW < c.x + c.w && p.y > c.y && p.y - PH < c.y + c.h;
  }

  // Touching the can from any side wins; put the cat somewhere sensible to sit.
  function reachCan() {
    const c = level.goal;
    const p = player;
    if (p.y <= c.y + 14) {
      p.y = c.y;
      p.x = clamp(p.x, c.x + 6, c.x + c.w - 6);
    } else {
      p.y = c.shelfY;
      p.x = p.x < c.x + c.w / 2 ? c.x - HW + 4 : c.x + c.w + HW - 4;
    }
    p.vx = 0; p.vy = 0;
    p.grounded = true;
    p.on = c;
    playSfx('land');
    win();
  }

  function updatePlayerAnim(dt) {
    const p = player;
    p.stateTime += dt;
    if (game.blink > 0) game.blink = Math.max(0, game.blink - dt);
    p.squash += (1 - p.squash) * Math.min(1, dt * 12);
    if (p.state === 'land' && p.stateTime >= LAND_TIME) setState('waiting');
    if (p.state === 'waiting' && p.stateTime >= WAIT_TO_IDLE) setState('idle');
  }

  // ---------------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------------
  function spawnDust(x, y, count, strength) {
    for (let i = 0; i < count; i++) {
      const a = Math.PI + Math.random() * Math.PI;
      const s = (40 + Math.random() * 120) * strength;
      particles.push({
        x: x + (Math.random() - 0.5) * 24, y: y - 2,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5,
        life: 0.4 + Math.random() * 0.3, t: 0, r: 2 + Math.random() * 3,
        color: 'rgba(255,245,230,', grav: 150,
      });
    }
  }

  function spawnConfetti(x, y) {
    const colors = ['#ffb454', '#ff7a8a', '#7ee0a8', '#8ec5ff', '#f7e27a', '#d59bff'];
    for (let i = 0; i < 90; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 250 + Math.random() * 450;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1.6 + Math.random() * 1.2, t: 0, r: 3 + Math.random() * 3,
        color: colors[i % colors.length], grav: 700, confetti: true, rot: Math.random() * 6,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.t += dt;
      if (q.t >= q.life) { particles.splice(i, 1); continue; }
      q.vy += q.grav * dt;
      q.vx *= 1 - dt * 2;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.confetti) q.rot += dt * 8;
    }
  }

  // ---------------------------------------------------------------------------
  // Win
  // ---------------------------------------------------------------------------
  function bestKey(id) { return id === 1 ? 'best' : 'best' + id; }

  function win() {
    game.wonAt = game.clock;
    setState('won');
    aim.active = false;
    store.del('save');
    $('hint').classList.add('fade');
    spawnConfetti(level.goal.x + level.goal.w / 2, level.goal.y);
    if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30]); } catch (e) { /* ignore */ } }

    const key = bestKey(game.levelId);
    const best = store.get(key, null);
    const isBest = !best || game.time < best.time;
    if (isBest) store.set(key, { time: game.time, cat: game.catKey, jumps: game.jumps });

    setTimeout(() => {
      $('win-img').src = CATS[game.catKey].dir + CATS[game.catKey].prefix + 'sitting.png';
      $('win-img').alt = CATS[game.catKey].name;
      $('win-time').textContent = formatTime(game.time, false);
      $('win-jumps').textContent = game.jumps;
      $('win-falls').textContent = game.falls;
      const b = store.get(key, null);
      $('win-title').textContent = LEVELS[game.levelId].winTitle;
      $('win-best').textContent = isBest ? 'New best time!' : (b ? 'Best: ' + formatTime(b.time) : '');
      $('hud').classList.add('hidden');
      checkOrientation();
      showScreen('win');
    }, 1800);
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------
  function clampCamera() {
    const maxY = 90 - view.viewH;          // don't show much below the floor
    const minY = level.topY;               // don't go past the top of the level
    cam.y = clamp(cam.y, minY, Math.max(minY, maxY));
    if (level.width <= view.viewW) cam.x = (level.width - view.viewW) / 2;   // center narrow levels
    else cam.x = clamp(cam.x, -40, level.width - view.viewW + 40);
  }

  function updateCamera(dt) {
    let tx = player.x - view.viewW * (level.landscape ? 0.35 : 0.5);
    let ty = player.y - view.viewH * (level.landscape ? 0.55 : 0.62);
    if (game.wonAt) {
      tx = level.goal.x + level.goal.w / 2 - view.viewW * 0.5;
      ty = level.goal.y - view.viewH * 0.5;
    }
    // lock onto the cat while flying so it never leaves the screen
    // speed up when the cat is fast (trampolines) so it stays on screen
    const rate = game.jet ? 30 : 5 + Math.hypot(player.vx, player.vy) / 180;
    if (game.jet) { tx = player.x - view.viewW * 0.5; ty = player.y - view.viewH * 0.5; }
    cam.x += (tx - cam.x) * Math.min(1, dt * rate);
    cam.y += (ty - cam.y) * Math.min(1, dt * rate);
    clampCamera();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    // Screen-space wall behind the door (visible on wide screens)
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, view.cssH);
    g.addColorStop(0, '#2a2038');
    g.addColorStop(1, '#1b1526');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.cssW, view.cssH);
  }

  function worldTransform() {
    const s = view.scale * view.dpr;
    ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
  }

  function drawDoor() {
    const top = cam.y - 10;
    const bottom = cam.y + view.viewH + 10;
    const doorTop = level.topY + 120;

    // door slab
    const y0 = Math.max(top, doorTop);
    const y1 = Math.min(bottom, 0);
    if (y1 > y0) {
      ctx.fillStyle = '#b77b4f';
      ctx.fillRect(0, y0, W, y1 - y0);

      // subtle wood grain stripes
      ctx.fillStyle = 'rgba(90, 50, 25, 0.08)';
      for (let x = 18; x < W; x += 36) ctx.fillRect(x, y0, 3, y1 - y0);

      // raised panels
      const PANEL = 1100;
      const first = Math.floor(y0 / PANEL) * PANEL;
      for (let py = first; py < y1; py += PANEL) {
        const px = 34, pw = W - 68, ph = PANEL - 120, pyy = py + 60;
        if (pyy > 0 || pyy + ph < doorTop) continue;
        roundRect(px, pyy, pw, ph, 14);
        ctx.fillStyle = 'rgba(80, 40, 20, 0.14)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 220, 180, 0.12)';
        ctx.stroke();
      }

      // frame edges
      ctx.fillStyle = '#8a5634';
      ctx.fillRect(0, y0, 8, y1 - y0);
      ctx.fillRect(W - 8, y0, 8, y1 - y0);
    }

    // top frame
    if (doorTop > top && doorTop < bottom + 40) {
      ctx.fillStyle = '#8a5634';
      ctx.fillRect(-20, doorTop - 30, W + 40, 30);
    }

    // height marks every section on the left edge
    ctx.fillStyle = 'rgba(255, 240, 220, 0.25)';
    for (let h = 500; h < -level.goal.y; h += 500) {
      const yy = -h;
      if (yy < top || yy > bottom) continue;
      ctx.fillRect(8, yy, 10, 2);
    }
  }

  function drawFloor() {
    if (cam.y + view.viewH < 0) return;
    // Wide floor across the whole screen, even outside the level
    const left = cam.x - 10;
    const right = cam.x + view.viewW + 10;
    if (level.theme === 'kitchen') {
      // checkered tiles
      const T = 40;
      for (let x = Math.floor(left / T) * T; x < right; x += T) {
        for (let r = 0; r < 4; r++) {
          ctx.fillStyle = ((x / T + r) & 1) ? '#4b4458' : '#625a72';
          ctx.fillRect(x, r * T, T, T);
        }
      }
      ctx.fillStyle = '#3a3346';
      ctx.fillRect(left, 160, right - left, 640);
      ctx.fillStyle = '#8a7a66';
      ctx.fillRect(left, -6, right - left, 8);   // baseboard
      roundRect(level.spawnX - 60, -4, 120, 10, 5);
      ctx.fillStyle = '#6aa3c9';
      ctx.fill();
      return;
    }
    ctx.fillStyle = '#4a3a5a';
    ctx.fillRect(left, 0, right - left, 800);
    ctx.fillStyle = '#5c4870';
    ctx.fillRect(left, 0, right - left, 6);
    // doormat
    roundRect(W / 2 - 90, -4, 180, 10, 5);
    ctx.fillStyle = '#c96a5a';
    ctx.fill();
  }

  function drawKitchen() {
    const top = cam.y - 10;
    const bottom = cam.y + view.viewH + 10;
    const left = cam.x - 10;
    const right = cam.x + view.viewW + 10;
    const y0 = Math.max(top, level.topY + 120);
    const y1 = Math.min(bottom, 0);
    const x0 = Math.max(left, 0);
    const x1 = Math.min(right, level.width);
    if (y1 <= y0 || x1 <= x0) return;

    // tiled wall
    ctx.fillStyle = '#efe2c8';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const T = 48;
    ctx.fillStyle = 'rgba(150, 120, 80, 0.13)';
    for (let x = Math.ceil(x0 / T) * T; x < x1; x += T) ctx.fillRect(x, y0, 2, y1 - y0);
    for (let y = Math.ceil(y0 / T) * T; y < y1; y += T) ctx.fillRect(x0, y, x1 - x0, 2);

    for (const d of level.decor) {
      if (d.y > bottom || d.y + d.h < top || d.x > right || d.x + d.w < left) continue;
      drawDecor(d);
    }

    // side walls and ceiling
    ctx.fillStyle = '#b89c74';
    ctx.fillRect(0, y0, 8, y1 - y0);
    ctx.fillRect(level.width - 8, y0, 8, y1 - y0);
    const ceil = level.topY + 120;
    if (ceil > top && ceil < bottom + 40) ctx.fillRect(-20, ceil - 30, level.width + 40, 30);
  }

  function drawDecor(d) {
    const { x, y, w, h } = d;
    if (d.kind === 'cabinet') {
      roundRect(x, y, w, h, 8);
      ctx.fillStyle = 'rgba(160, 110, 70, 0.32)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 80, 45, 0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 10, y + 10, w / 2 - 15, h - 20);
      ctx.strokeRect(x + w / 2 + 5, y + 10, w / 2 - 15, h - 20);
      ctx.fillStyle = 'rgba(120, 80, 45, 0.45)';
      ctx.fillRect(x + w / 2 - 12, y + h / 2 - 8, 4, 16);
      ctx.fillRect(x + w / 2 + 8, y + h / 2 - 8, 4, 16);
    } else if (d.kind === 'window') {
      roundRect(x, y, w, h, 6);
      ctx.fillStyle = 'rgba(150, 200, 235, 0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
      ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
      ctx.stroke();
    } else if (d.kind === 'clock') {
      const r = Math.min(w, h) * 0.28;
      const cx = x + w / 2, cy = y + h / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120, 90, 60, 0.5)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.7);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.5, cy + r * 0.2);
      ctx.stroke();
    } else {
      roundRect(x + w * 0.2, y + h * 0.15, w * 0.6, h * 0.7, 4);
      ctx.fillStyle = 'rgba(255, 180, 120, 0.3)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140, 95, 55, 0.4)';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  function drawPlatform(p) {
    if (p.kind === 'floor') return;
    if (p.kind === 'handle') { drawHandle(p); return; }
    if (p.kind === 'can') { drawCan(p); return; }
    if (p.kind === 'trampoline') { drawTrampoline(p); return; }
    if (p.kind === 'breakable') { drawBreakable(p); return; }

    const kitchen = level.theme === 'kitchen';
    const colors = {
      normal: kitchen ? ['#e2b07a', '#a8703f'] : ['#fff3dd', '#e8cfa6'],
      moving: ['#bfe3ff', '#7fb5e6'],
      shelf: kitchen ? ['#f4f5f7', '#b5bac4'] : ['#e3a86e', '#b87a47'],
      checkpoint: ['#b6f0c8', '#5fbf85'],
    }[p === game.checkpoint ? 'checkpoint' : p.kind];

    // shadow
    roundRect(p.x + 3, p.y + 5, p.w, p.h, 6);
    ctx.fillStyle = 'rgba(40, 20, 10, 0.25)';
    ctx.fill();

    roundRect(p.x, p.y, p.w, p.h, 6);
    ctx.fillStyle = colors[1];
    ctx.fill();
    roundRect(p.x, p.y, p.w, Math.min(8, p.h * 0.5), 6);
    ctx.fillStyle = colors[0];
    ctx.fill();

    if (p.kind === 'moving') {
      ctx.fillStyle = 'rgba(40, 80, 130, 0.5)';
      const cy = p.y + p.h * 0.62;
      ctx.beginPath();
      ctx.moveTo(p.x + 8, cy); ctx.lineTo(p.x + 14, cy - 4); ctx.lineTo(p.x + 14, cy + 4); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x + p.w - 8, cy); ctx.lineTo(p.x + p.w - 14, cy - 4); ctx.lineTo(p.x + p.w - 14, cy + 4); ctx.fill();
    }

    if (p.kind === 'shelf' && p.label) {
      ctx.fillStyle = 'rgba(70, 35, 15, 0.55)';
      ctx.font = '600 11px Fredoka, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p === game.checkpoint ? 'CHECKPOINT ' + p.label.replace(/ /g, '') : p.label,
        p.x + p.w / 2, p.y + p.h * 0.65);
    }
  }

  function drawTrampoline(p) {
    const sq = Math.sin(p.boing * Math.PI) * 6;   // mat dips when bounced on
    const cx = p.x + p.w / 2;
    // springs
    ctx.strokeStyle = '#6b6f7a';
    ctx.lineWidth = 2.5;
    for (const sx of [p.x + 10, p.x + p.w - 10]) {
      ctx.beginPath();
      ctx.moveTo(sx, p.y + 4 + sq);
      for (let k = 1; k <= 4; k++) ctx.lineTo(sx + (k % 2 ? 4 : -4), p.y + 4 + sq + k * (14 - sq) / 4);
      ctx.stroke();
    }
    // base
    roundRect(p.x + 2, p.y + 16, p.w - 4, 6, 3);
    ctx.fillStyle = '#3d3f47';
    ctx.fill();
    // mat
    roundRect(p.x, p.y + sq, p.w, 8, 4);
    ctx.fillStyle = '#ff5d73';
    ctx.fill();
    roundRect(p.x + 4, p.y + sq + 1, p.w - 8, 3, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
    // launch direction chevrons
    const a = Math.atan2(p.launchVy, p.launchVx);
    const bob = (game.clock * 1.5) % 1;
    ctx.save();
    ctx.translate(cx, p.y - 14);
    ctx.rotate(a);
    for (let k = 0; k < 2; k++) {
      const o = (k + bob) * 9;
      ctx.strokeStyle = `rgba(255, 93, 115, ${0.9 - (k + bob) * 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(o - 4, -6); ctx.lineTo(o + 3, 0); ctx.lineTo(o - 4, 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBreakable(p) {
    let alpha = 1;
    if (p.broken) {
      const fadeIn = p.respawnT - (BREAK_RESPAWN - 0.5);
      if (fadeIn <= 0) return;
      alpha = fadeIn / 0.5;
    }
    const crack = p.cracking ? p.crackT / BREAK_DELAY : 0;
    const shake = crack ? Math.sin(game.clock * 70) * 1.5 * crack : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(shake, 0);
    roundRect(p.x + 3, p.y + 5, p.w, p.h, 5);
    ctx.fillStyle = 'rgba(40, 20, 10, 0.2)';
    ctx.fill();
    roundRect(p.x, p.y, p.w, p.h, 5);
    ctx.fillStyle = '#e8b85c';
    ctx.fill();
    roundRect(p.x, p.y, p.w, 7, 5);
    ctx.fillStyle = '#f6d58e';
    ctx.fill();
    // cracker holes
    ctx.fillStyle = 'rgba(150, 95, 30, 0.55)';
    for (let x = p.x + 9; x < p.x + p.w - 4; x += 13) {
      ctx.beginPath(); ctx.arc(x, p.y + 10, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // cracks grow while it's about to break
    if (crack > 0) {
      ctx.strokeStyle = 'rgba(90, 50, 15, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const mx = p.x + p.w / 2;
      ctx.moveTo(mx, p.y);
      ctx.lineTo(mx - 4, p.y + 6 * Math.min(1, crack * 2));
      ctx.lineTo(mx + 3, p.y + p.h * Math.min(1, crack * 1.5));
      if (crack > 0.5) {
        ctx.moveTo(mx - 4, p.y + 6);
        ctx.lineTo(mx - 4 - p.w * 0.25 * (crack - 0.5) * 2, p.y + 10);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCan(c) {
    const { x, y, w, h } = c;
    const open = game.goalAnim;
    // glow to attract attention
    if (!game.wonAt) {
      const pulse = 0.35 + 0.25 * Math.sin(game.clock * 3);
      ctx.strokeStyle = `rgba(255, 210, 120, ${pulse})`;
      ctx.lineWidth = 3;
      roundRect(x - 8, y - 12, w + 16, h + 16, 14);
      ctx.stroke();
    }
    // body
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#8d96a1');
    g.addColorStop(0.35, '#eef2f5');
    g.addColorStop(1, '#7f8893');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + 5, w, h - 8);
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 3, w / 2, 5, 0, 0, Math.PI); ctx.fill();
    // label with a fish
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(x, y + 15, w, h - 30);
    ctx.fillStyle = '#fff3e0';
    const fy = y + 15 + (h - 30) / 2;
    ctx.beginPath(); ctx.ellipse(x + w / 2 - 4, fy, 12, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w / 2 + 6, fy); ctx.lineTo(x + w / 2 + 16, fy - 7); ctx.lineTo(x + w / 2 + 16, fy + 7); ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.arc(x + w / 2 - 11, fy - 1, 1.6, 0, Math.PI * 2); ctx.fill();
    // food inside, visible once the lid opens
    ctx.fillStyle = open > 0.05 ? '#9a5b3a' : '#cfd6dc';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 5, w / 2, 6, 0, 0, Math.PI * 2); ctx.fill();
    // lid, hinged on the left
    ctx.save();
    ctx.translate(x, y + 5);
    ctx.rotate(-open * 2.6);
    ctx.fillStyle = '#e3e8ec';
    ctx.strokeStyle = '#9aa3ad';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(w / 2, 0, w / 2, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w * 0.7, -1, 6, 3, 0, 0, Math.PI * 2); ctx.stroke(); // pull tab
    ctx.restore();
  }

  function drawHandle(h) {
    const t = game.goalAnim;
    // rosette
    ctx.fillStyle = 'rgba(40, 20, 10, 0.3)';
    ctx.beginPath(); ctx.arc(h.pivotX + 3, h.pivotY + 5, 22, 0, Math.PI * 2); ctx.fill();
    const rg = ctx.createRadialGradient(h.pivotX - 6, h.pivotY - 6, 2, h.pivotX, h.pivotY, 22);
    rg.addColorStop(0, '#fff2b0');
    rg.addColorStop(1, '#c9951e');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(h.pivotX, h.pivotY, 22, 0, Math.PI * 2); ctx.fill();

    // bar (rotates down on win)
    ctx.save();
    ctx.translate(h.pivotX, h.pivotY);
    ctx.rotate(-t);
    roundRect(-h.w, -h.h / 2, h.w + 10, h.h, 7);
    const bg = ctx.createLinearGradient(0, -h.h / 2, 0, h.h / 2);
    bg.addColorStop(0, '#ffe58a');
    bg.addColorStop(1, '#c48a12');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();

    // keyhole plate below
    roundRect(h.pivotX - 9, h.pivotY + 40, 18, 44, 8);
    ctx.fillStyle = '#d9a82a';
    ctx.fill();
    ctx.fillStyle = '#4a2d10';
    ctx.beginPath(); ctx.arc(h.pivotX, h.pivotY + 56, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(h.pivotX - 2, h.pivotY + 56, 4, 12);

    // glow to attract attention
    if (!game.wonAt) {
      const pulse = 0.35 + 0.25 * Math.sin(game.clock * 3);
      ctx.strokeStyle = `rgba(255, 230, 140, ${pulse})`;
      ctx.lineWidth = 3;
      roundRect(h.x - 6, h.y - 8, h.w + 12, h.h + 14, 12);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const set = sprites[game.catKey];
    if (!set) return;
    const p = player;
    const pose = POSE_FOR_STATE[p.state] || 'idle';
    const img = set[pose];
    const k = set.scale;

    let x = p.x, y = p.y;
    // ride the handle down during the win animation
    if (game.wonAt && level.goal.kind === 'handle') {
      const h = level.goal;
      const dxp = p.x - h.pivotX;
      x = h.pivotX + dxp * Math.cos(game.goalAnim);
      y = h.y - dxp * Math.sin(game.goalAnim);
    }

    // soft shadow when grounded
    if (p.grounded) {
      ctx.fillStyle = 'rgba(30, 15, 5, 0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 20, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!img) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - HW, y - PH, HW * 2, PH);
      return;
    }

    const w = img.width * k;
    const h = img.height * k;
    const air = pose === 'jump' || pose === 'falling';
    const sx = p.squash;
    const sy = 1 / p.squash;

    if (game.jet) drawJetpackShape(x - p.facing * 14, y - PH / 2, true);

    ctx.save();
    if (game.blink > 0 && Math.floor(game.blink * 10) % 2 === 0) ctx.globalAlpha = 0.25;
    if (air) {
      ctx.translate(x, y - PH / 2);
      ctx.scale(sx, sy);
      if (p.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.translate(x, y + 2);
      ctx.scale(sx, sy);
      if (p.facing < 0 && pose !== 'sitting') ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -h, w, h);
    }
    ctx.restore();
  }

  function drawAimArrow() {
    if (!aim.active) return;
    const p = player;
    const ok = aim.power >= MIN_POWER;
    const len = 28 + aim.power * 120;
    const ox = p.x;
    const oy = p.y - PH / 2;
    const dx = Math.cos(aim.angle);
    const dy = -Math.sin(aim.angle);
    const ex = ox + dx * len;
    const ey = oy + dy * len;

    const hue = 120 - 120 * aim.power; // green -> red
    const color = ok ? `hsl(${hue}, 90%, 60%)` : 'rgba(255,255,255,0.45)';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // outline for contrast
    ctx.strokeStyle = 'rgba(20, 10, 30, 0.55)';
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(ox + dx * 16, oy + dy * 16); ctx.lineTo(ex - dx * 8, ey - dy * 8); ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(ox + dx * 16, oy + dy * 16); ctx.lineTo(ex - dx * 8, ey - dy * 8); ctx.stroke();

    // head
    const hx = ex + dx * 8, hy = ey + dy * 8;
    const nx = -dy, ny = dx;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(ex - dx * 8 + nx * 11, ey - dy * 8 + ny * 11);
    ctx.lineTo(ex - dx * 8 - nx * 11, ey - dy * 8 - ny * 11);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 10, 30, 0.55)';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();

    // power readout
    ctx.font = '700 13px Fredoka, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tx = ex + dx * 26, ty = ey + dy * 26;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 10, 30, 0.6)';
    const label = ok ? Math.round(aim.power * 100) + '%' : 'cancel';
    ctx.strokeText(label, tx, ty);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, tx, ty);
    ctx.restore();
  }

  function drawDragGuide() {
    if (!aim.active) return;
    // screen-space: where the finger started and where it is now
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(aim.sx, aim.sy); ctx.lineTo(aim.cx, aim.cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(aim.sx, aim.sy, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath(); ctx.arc(aim.cx, aim.cy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const q of particles) {
      const a = 1 - q.t / q.life;
      if (q.confetti) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.fillRect(-q.r, -q.r / 2, q.r * 2, q.r);
        ctx.restore();
      } else {
        ctx.fillStyle = q.color + (a * 0.7).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawWinGlow() {
    if (!game.wonAt) return;
    const t = clamp((game.clock - game.wonAt) / 1.6, 0, 1);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = `rgba(255, 230, 170, ${t * 0.35})`;
    ctx.fillRect(0, 0, view.cssW, view.cssH);
  }

  function render() {
    drawBackground();
    worldTransform();
    if (level.theme === 'kitchen') drawKitchen(); else drawDoor();
    drawFloor();

    const top = cam.y - 40;
    const bottom = cam.y + view.viewH + 40;
    const left = cam.x - 60;
    const right = cam.x + view.viewW + 60;
    for (const p of level.plats) {
      if (p.y + p.h < top || p.y - 40 > bottom || p.x > right || p.x + p.w < left) continue;
      drawPlatform(p);
    }
    if (game.running) {
      drawJetpackItem();
      drawPlayer();
      drawParticles();
      drawAimArrow();
      drawDragGuide();
    }
    drawWinGlow();
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  const hudCache = {};
  function setText(id, text) {
    if (hudCache[id] !== text) { hudCache[id] = text; $(id).textContent = text; }
  }

  const HEART_SVG = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';

  function updateHud(force) {
    if (force) for (const k in hudCache) delete hudCache[k];
    const livesKey = gfMode ? 'inf' : game.lives;
    if (hudCache.lives !== livesKey) {
      hudCache.lives = livesKey;
      let html = '';
      if (gfMode) html = '<span class="heart">' + HEART_SVG + '</span><span class="infinite">&infin;</span>';
      else for (let i = 0; i < MAX_LIVES; i++) html += '<span class="heart' + (i < game.lives ? '' : ' lost') + '">' + HEART_SVG + '</span>';
      $('hud-hearts').innerHTML = html;
    }
    setText('hud-time', formatTime(game.time));
    const pct = Math.round(progress() * 100);
    setText('hud-progress-text', pct + '%');
    const w = pct + '%';
    if (hudCache.bar !== w) { hudCache.bar = w; $('hud-progress').style.width = w; }
    setText('hud-jumps', game.jumps + (game.jumps === 1 ? ' jump' : ' jumps') +
      (game.falls ? ' · ' + game.falls + (game.falls === 1 ? ' big fall' : ' big falls') : ''));
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (game.running && !game.paused && !wrongOrientation) {
      accumulator += dt;
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
      if (!game.wonAt) game.time += dt;
      else game.goalAnim = lerp(game.goalAnim, 0.5, Math.min(1, dt * 4));
      updatePlayerAnim(dt);
      updateParticles(dt);
      updateCamera(dt);
      updateHud(false);
    } else if (!game.running) {
      // menu backdrop: slowly pan through the level
      game.clock += dt;
      updatePlatforms(dt);
      const f = ((game.clock * 40) % (-level.topY)) / -level.topY;
      cam.y = 90 - view.viewH + f * level.topY;
      cam.x = f * (level.width - view.viewW);
      clampCamera();
    }

    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Screens & UI wiring
  // ---------------------------------------------------------------------------
  const screens = ['menu', 'levels', 'pause', 'win', 'over'];
  function showScreen(name) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  }

  function pause() {
    if (!game.running || game.paused || game.wonAt || game.over) return;
    game.paused = true;
    aim.active = false;
    if (player.grounded && player.state === 'aim') setState('waiting');
    saveProgress();
    showScreen('pause');
  }

  function resume() {
    game.paused = false;
    last = performance.now();
    showScreen(null);
  }

  function stopRun() {
    saveProgress();
    game.running = false;
    game.paused = false;
    $('hud').classList.add('hidden');
    checkOrientation();
    lockOrientation('portrait');
  }

  function toMenu() {
    stopRun();
    refreshMenu();
    showScreen('menu');
  }

  function toLevels() {
    stopRun();
    refreshLevels();
    showScreen('levels');
  }

  function refreshLevels() {
    $('levels-cat').textContent = 'Playing as ' + CATS[game.catKey].name;
    for (const id of Object.keys(LEVELS)) {
      const b = store.get(bestKey(Number(id)), null);
      $('best-' + id).textContent = b ? 'Best: ' + formatTime(b.time) : 'Not cleared yet';
    }
  }

  function refreshMenu() {
    document.querySelectorAll('.cat-card').forEach((el) => {
      el.classList.toggle('selected', el.dataset.cat === game.catKey);
    });
    const play = $('btn-play');
    play.disabled = !game.catKey;
    play.textContent = game.catKey ? 'Play as ' + CATS[game.catKey].name : 'Choose a cat';
    $('btn-continue').disabled = false;

    const save = store.get('save', null);
    const cont = $('btn-continue');
    if (save && CATS[save.cat]) {
      cont.classList.remove('hidden');
      cont.textContent = 'Continue · Level ' + (save.level || 1) + ' · ' + Math.round((save.progress || 0) * 100) + '%';
    } else {
      cont.classList.add('hidden');
    }
  }

  function setDirectAim(v) {
    directAim = v;
    store.set('directAim', v);
    $('opt-invert').checked = v;
    $('opt-invert-2').checked = v;
  }

  document.querySelectorAll('.cat-card').forEach((el) => {
    el.addEventListener('click', () => {
      game.catKey = el.dataset.cat;
      store.set('cat', game.catKey);
      refreshMenu();
    });
  });

  $('btn-play').addEventListener('click', () => {
    if (!game.catKey) return;
    refreshLevels();
    showScreen('levels');
  });
  $('btn-continue').addEventListener('click', () => {
    const save = store.get('save', null);
    if (save && CATS[save.cat]) startGame(save.cat, LEVELS[save.level] ? save.level : 1, save);
  });
  document.querySelectorAll('.level-card').forEach((el) => {
    el.addEventListener('click', () => startGame(game.catKey, Number(el.dataset.level), null));
  });
  $('btn-levels-back').addEventListener('click', () => { refreshMenu(); showScreen('menu'); });
  const restart = () => startGame(game.catKey, game.levelId, null);
  $('btn-pause').addEventListener('click', pause);
  $('btn-resume').addEventListener('click', resume);
  $('btn-restart').addEventListener('click', restart);
  $('btn-menu').addEventListener('click', toLevels);
  $('btn-again').addEventListener('click', restart);
  $('btn-win-menu').addEventListener('click', toLevels);
  $('btn-over-again').addEventListener('click', restart);
  $('btn-over-menu').addEventListener('click', toLevels);
  $('opt-invert').addEventListener('change', (e) => setDirectAim(e.target.checked));
  $('opt-invert-2').addEventListener('change', (e) => setDirectAim(e.target.checked));
  $('opt-gf').addEventListener('change', (e) => { gfMode = e.target.checked; store.set('gfMode', gfMode); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); audio.music.pause(); } else playMusic();
  });
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
  $('btn-sound').addEventListener('click', () => setMuted(!audio.muted));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p') {
      if (game.paused) resume(); else pause();
    }
  });
  // stop iOS from scrolling/zooming the page
  document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  resize();
  setDirectAim(directAim);
  $('opt-gf').checked = gfMode;
  initAudio();
  setMuted(audio.muted);
  loadSprites().then(() => {
    $('loading').classList.add('hidden');
    refreshMenu();
    showScreen('menu');
  });
  requestAnimationFrame(frame);

  // debug hook for testing in the console
  window.__game = { game, player, get level() { return level; }, LEVELS, jump, startGame, simulateFlight };
})();
