(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------
  const W = 360;              // world width (the door), in world units
  const MIN_VIEW_H = 600;     // always show at least this much world height
  const G = 2400;             // gravity (units/s^2)
  const MAX_FALL = 1900;      // terminal velocity
  const VMAX = 1150;          // launch speed at full power
  const MIN_POWER = 0.12;     // below this a release cancels the jump
  const MIN_ANGLE = 12 * Math.PI / 180;   // flattest allowed launch angle
  const WALL_BOUNCE = 0.45;   // horizontal velocity kept after hitting the door frame
  const LAND_TIME = 0.22;     // seconds the landing pose is shown
  const WAIT_TO_IDLE = 4;     // seconds of waiting before the cat sits down
  const BIG_FALL = 320;       // landing this far below takeoff counts as a "big fall"
  const MAX_LIVES = 5;
  const CP_FALL_MARGIN = 90;  // how far below a checkpoint you must fall to lose a life
  const BLINK_TIME = 2.5;     // seconds the cat blinks after respawning
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
  // Level
  // ---------------------------------------------------------------------------
  const SECTIONS = 5;
  const PER_SECTION = 11;

  function buildLevel() {
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
        if (s >= 2 && rnd() < 0.12 + 0.08 * s) {
          p.kind = 'moving';
          p.amp = R(30, 60);
          p.speed = R(0.8, 1.4);
          p.phase = R(0, Math.PI * 2);
          p.baseX = clamp(p.x, p.amp + 4, W - w - p.amp - 4);
          p.x = p.baseX + Math.sin(p.phase) * p.amp;
          nx = p.baseX + w / 2;
        }
        plats.push(p);
        cx = nx;
      }

      if (s < SECTIONS - 1) {
        // Wide shelf attached to the door frame: a checkpoint-ish resting spot.
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
    plats.push(handle);

    return { plats, handle, topY: y - 320 };
  }

  const level = buildLevel();

  // ---------------------------------------------------------------------------
  // Canvas / view
  // ---------------------------------------------------------------------------
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const view = { cssW: 0, cssH: 0, dpr: 1, scale: 1, offX: 0, viewH: 0 };
  const cam = { y: 0 };

  function resize() {
    view.cssW = window.innerWidth;
    view.cssH = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.cssW * view.dpr);
    canvas.height = Math.round(view.cssH * view.dpr);
    view.scale = Math.min(view.cssW / W, view.cssH / MIN_VIEW_H);
    view.offX = (view.cssW - W * view.scale) / 2;
    view.viewH = view.cssH / view.scale;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

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
    handleAngle: 0,
    lives: MAX_LIVES,
    checkpoint: null,  // the shelf platform the cat respawns on
    blink: 0,
    over: false,
  };

  const player = {
    x: W / 2, y: 0, vx: 0, vy: 0,
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
    player.x = W / 2; player.y = 0; player.vx = 0; player.vy = 0;
    player.grounded = true; player.on = level.plats[0];
    player.facing = 1; player.squash = 1; player.takeoffY = 0;
    setState('waiting');
  }

  function startGame(catKey, fromSave) {
    game.catKey = catKey;
    store.set('cat', catKey);
    game.running = true;
    game.paused = false;
    game.wonAt = 0;
    game.handleAngle = 0;
    game.lives = MAX_LIVES;
    game.checkpoint = null;
    game.blink = 0;
    game.over = false;
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
      if (pl && pl.kind !== 'handle') {
        player.on = pl;
        player.x = clamp(pl.x + (fromSave.rel != null ? fromSave.rel : pl.w / 2), pl.x + 4, pl.x + pl.w - 4);
        player.y = pl.y;
        player.x = clamp(player.x, HW, W - HW);
      }
    } else {
      game.time = 0; game.jumps = 0; game.falls = 0;
      store.del('save');
    }

    cam.y = player.y - view.viewH * 0.62;
    clampCamera();
    showScreen(null);
    $('hud').classList.remove('hidden');
    $('hint').classList.toggle('hidden', game.jumps >= 2);
    $('hint').classList.remove('fade');
    updateHud(true);
  }

  function saveProgress() {
    if (!game.running || game.wonAt || !player.grounded || !player.on) return;
    const idx = level.plats.indexOf(player.on);
    store.set('save', {
      cat: game.catKey, plat: idx, rel: player.x - player.on.x,
      time: game.time, jumps: game.jumps, falls: game.falls,
      lives: game.lives, checkpoint: game.checkpoint ? level.plats.indexOf(game.checkpoint) : -1,
      progress: progress(),
    });
  }

  function progress() {
    return clamp(-player.y / -level.handle.y, 0, 1);
  }

  // ---------------------------------------------------------------------------
  // Input (slingshot)
  // ---------------------------------------------------------------------------
  function canAim() {
    return game.running && !game.paused && !game.wonAt && !game.over && player.grounded;
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
  function updatePlatforms() {
    for (const p of level.plats) {
      if (p.kind !== 'moving') continue;
      const nx = p.baseX + Math.sin(game.clock * p.speed + p.phase) * p.amp;
      p.dx = nx - p.x;
      p.x = nx;
    }
  }

  function step(dt) {
    game.clock += dt;
    updatePlatforms();

    const p = player;
    if (game.wonAt || game.over) return;

    if (p.grounded) {
      const pl = p.on;
      if (pl && pl.dx) p.x += pl.dx;
      p.x = clamp(p.x, HW, W - HW);
      if (!pl || p.x + FOOT < pl.x || p.x - FOOT > pl.x + pl.w) {
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

    // Door frame walls
    if (p.x - HW < 0) { p.x = HW; p.vx = Math.abs(p.vx) * WALL_BOUNCE; p.facing = 1; }
    if (p.x + HW > W) { p.x = W - HW; p.vx = -Math.abs(p.vx) * WALL_BOUNCE; p.facing = -1; }

    if (p.vy >= 0) {
      let hit = null;
      for (const pl of level.plats) {
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
    p.x = clamp(cp.x + cp.w / 2, HW, W - HW);
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
    if (pl.kind === 'handle') win();
    else saveProgress();
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
  function win() {
    game.wonAt = game.clock;
    setState('won');
    aim.active = false;
    store.del('save');
    $('hint').classList.add('fade');
    spawnConfetti(level.handle.pivotX - 40, level.handle.y);
    if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30]); } catch (e) { /* ignore */ } }

    const best = store.get('best', null);
    const isBest = !best || game.time < best.time;
    if (isBest) store.set('best', { time: game.time, cat: game.catKey, jumps: game.jumps });

    setTimeout(() => {
      $('win-img').src = CATS[game.catKey].dir + CATS[game.catKey].prefix + 'sitting.png';
      $('win-img').alt = CATS[game.catKey].name;
      $('win-time').textContent = formatTime(game.time, false);
      $('win-jumps').textContent = game.jumps;
      $('win-falls').textContent = game.falls;
      const b = store.get('best', null);
      $('win-best').textContent = isBest ? 'New best time!' : (b ? 'Best: ' + formatTime(b.time) : '');
      $('hud').classList.add('hidden');
      showScreen('win');
    }, 1800);
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------
  function clampCamera() {
    const maxY = 90 - view.viewH;          // don't show much below the floor
    const minY = level.topY;               // don't go past the top of the door
    cam.y = clamp(cam.y, minY, Math.max(minY, maxY));
  }

  function updateCamera(dt) {
    let target = player.y - view.viewH * 0.62;
    if (game.wonAt) target = level.handle.y - view.viewH * 0.5;
    cam.y += (target - cam.y) * Math.min(1, dt * 5);
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
    ctx.setTransform(s, 0, 0, s, view.offX * view.dpr, -cam.y * s);
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
    for (let h = 500; h < -level.handle.y; h += 500) {
      const yy = -h;
      if (yy < top || yy > bottom) continue;
      ctx.fillRect(8, yy, 10, 2);
    }
  }

  function drawFloor() {
    if (cam.y + view.viewH < 0) return;
    // Wide floor across the whole screen, even outside the door
    const left = -view.offX / view.scale - 10;
    const right = W + view.offX / view.scale + 10;
    ctx.fillStyle = '#4a3a5a';
    ctx.fillRect(left, 0, right - left, 800);
    ctx.fillStyle = '#5c4870';
    ctx.fillRect(left, 0, right - left, 6);
    // doormat
    roundRect(W / 2 - 90, -4, 180, 10, 5);
    ctx.fillStyle = '#c96a5a';
    ctx.fill();
  }

  function drawPlatform(p) {
    if (p.kind === 'floor') return;
    if (p.kind === 'handle') { drawHandle(p); return; }

    const colors = {
      normal: ['#fff3dd', '#e8cfa6'],
      moving: ['#bfe3ff', '#7fb5e6'],
      shelf: ['#e3a86e', '#b87a47'],
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

  function drawHandle(h) {
    const t = game.handleAngle;
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
    if (game.wonAt) {
      const h = level.handle;
      const dxp = p.x - h.pivotX;
      x = h.pivotX + dxp * Math.cos(game.handleAngle);
      y = h.y - dxp * Math.sin(game.handleAngle);
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
    drawDoor();
    drawFloor();

    const top = cam.y - 40;
    const bottom = cam.y + view.viewH + 40;
    for (const p of level.plats) {
      if (p.y + p.h < top || p.y > bottom) continue;
      drawPlatform(p);
    }
    if (game.running) {
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

    if (game.running && !game.paused) {
      accumulator += dt;
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
      if (!game.wonAt) game.time += dt;
      else game.handleAngle = lerp(game.handleAngle, 0.5, Math.min(1, dt * 4));
      updatePlayerAnim(dt);
      updateParticles(dt);
      updateCamera(dt);
      updateHud(false);
    } else if (!game.running) {
      // menu backdrop: slowly pan up the door
      game.clock += dt;
      updatePlatforms();
      cam.y = 90 - view.viewH - ((game.clock * 40) % (-level.topY));
      clampCamera();
    }

    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Screens & UI wiring
  // ---------------------------------------------------------------------------
  const screens = ['menu', 'pause', 'win', 'over'];
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

  function toMenu() {
    saveProgress();
    game.running = false;
    game.paused = false;
    $('hud').classList.add('hidden');
    refreshMenu();
    showScreen('menu');
  }

  function refreshMenu() {
    document.querySelectorAll('.cat-card').forEach((el) => {
      el.classList.toggle('selected', el.dataset.cat === game.catKey);
    });
    const play = $('btn-play');
    play.disabled = !game.catKey;
    play.textContent = game.catKey ? 'Play as ' + CATS[game.catKey].name : 'Choose a cat';

    const save = store.get('save', null);
    const cont = $('btn-continue');
    if (save && CATS[save.cat]) {
      cont.classList.remove('hidden');
      cont.textContent = 'Continue · ' + Math.round((save.progress || 0) * 100) + '%';
    } else {
      cont.classList.add('hidden');
    }

    const best = store.get('best', null);
    $('best-time').textContent = best ? 'Best: ' + formatTime(best.time) + ' with ' + CATS[best.cat].name : '';
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

  $('btn-play').addEventListener('click', () => { if (game.catKey) startGame(game.catKey, null); });
  $('btn-continue').addEventListener('click', () => {
    const save = store.get('save', null);
    if (save && CATS[save.cat]) startGame(save.cat, save);
  });
  $('btn-pause').addEventListener('click', pause);
  $('btn-resume').addEventListener('click', resume);
  $('btn-restart').addEventListener('click', () => startGame(game.catKey, null));
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-again').addEventListener('click', () => startGame(game.catKey, null));
  $('btn-win-menu').addEventListener('click', toMenu);
  $('btn-over-again').addEventListener('click', () => startGame(game.catKey, null));
  $('btn-over-menu').addEventListener('click', toMenu);
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
  window.__game = { game, player, level, jump, startGame };
})();
