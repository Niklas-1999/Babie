// Halloween minigames: shared runner (HUD, pause, results, saving, effects).
// Each game lives in its own file and registers itself in HW.games.
(() => {
  'use strict';
  const HW = (window.HW = window.HW || { games: {} });

  HW.SECRET_COST = 200;                   // candy corn needed for the secret picture
  HW.IDS = ['broom', 'haunted', 'pumpkin'];
  HW.FIELD = { broom: 'hwBroom', haunted: 'hwHaunted', pumpkin: 'hwPumpkin' };
  // Halloween1 is the menu music; each game has its own track
  HW.MUSIC = { broom: ['Halloween2.mp3'], haunted: ['Halloween3.mp3'], pumpkin: ['Halloween4.mp3'] };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  HW.util = { TAU, clamp, rand, lerp: (a, b, t) => a + (b - a) * t };

  // Candy corn, drawn with its tip pointing up, centered on (x, y)
  HW.drawCorn = function (ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(s / 10, s / 10);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(8, 4, 8.5, 8);
    ctx.quadraticCurveTo(0, 12, -8.5, 8);
    ctx.quadraticCurveTo(-8, 4, 0, -11);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#fff4d6'; ctx.fillRect(-10, -12, 20, 9);
    ctx.fillStyle = '#ff9a1f'; ctx.fillRect(-10, -3.5, 20, 7);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-10, 3.5, 20, 9);
    ctx.restore();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#3a1a08';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-2.5, -3, 1.4, 3.5, 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  };

  // Sheet ghost, centered on (x, y). mood: 'normal' | 'scared' | 'eyes'
  HW.drawGhost = function (ctx, x, y, r, t, mood, color) {
    ctx.save();
    ctx.translate(x, y);
    if (mood !== 'eyes') {
      const body = mood === 'scared' ? '#4b5bd6' : (color || '#f4f0ff');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -r * 0.15, r, Math.PI, 0);
      const waves = 4;
      for (let i = 0; i <= waves; i++) {
        const wx = r - (i / waves) * 2 * r;
        const wy = r * 0.85 + Math.sin(t * 9 + i * 1.7) * r * 0.12 + (i % 2 ? -r * 0.12 : 0);
        ctx.lineTo(wx, wy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.strokeStyle = mood === 'scared' ? '#1c2380' : '#2a1a3a';
      ctx.stroke();
      if (mood === 'scared') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = r * 0.1;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) ctx.lineTo(-r * 0.45 + i * r * 0.225, r * 0.3 + (i % 2 ? -r * 0.1 : r * 0.08));
        ctx.stroke();
      }
    }
    if (mood === 'scared') {
      ctx.fillStyle = '#fff';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.33, -r * 0.2, r * 0.13, 0, TAU); ctx.fill(); }
    } else {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(s * r * 0.35, -r * 0.22, r * 0.22, r * 0.28, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = r * 0.06; ctx.stroke();
        ctx.fillStyle = '#1a1030';
        ctx.beginPath(); ctx.arc(s * r * 0.35 + r * 0.06, -r * 0.18, r * 0.12, 0, TAU); ctx.fill();
      }
      if (mood !== 'eyes') {
        ctx.fillStyle = '#2a1a3a';
        ctx.beginPath(); ctx.ellipse(0, r * 0.22, r * 0.14, r * 0.2, 0, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  };

  HW.create = function (api) {
    const { canvas, ctx, view, audio, store } = api;
    const $ = (id) => document.getElementById(id);
    const tr = window.I18N.t;
    const sfx = api.sfx;

    let mode = 'off';          // 'off' | 'run'
    let gameId = null;
    let game = null;
    let cat = 'mallow';
    let paused = false;
    let ended = false;
    let endT = 0;
    let shown = false;
    let score = 0;
    let runCorn = 0;
    let shakeA = 0;
    let parts = [];
    let texts = [];
    let pointerId = null;

    // ------------------------------------------------------------------------
    // Things every game can use
    // ------------------------------------------------------------------------
    const env = {
      ctx, view, sfx, tr, TAU, clamp, rand,
      get cat() { return cat; },
      get score() { return score; },
      get corn() { return runCorn; },
      get ended() { return ended; },

      addScore(n, x, y, color) {
        score = Math.max(0, score + n);
        if (x != null) env.text(x, y, (n > 0 ? '+' : '') + n, color || '#ffe28a');
      },
      addCorn(n, x, y) {
        runCorn += n;
        sfx.pickup();
        if (x != null) env.text(x, y, '+' + n + ' 🍬', '#ffcf6a', 1.15);
      },
      end(extra) {
        if (ended) return;
        ended = true;
        endT = 0;
        env.result = extra || {};
      },
      shake(a) { shakeA = Math.min(14, shakeA + a); },
      shakeOffset() {
        return shakeA > 0 ? [rand(-1, 1) * shakeA, rand(-1, 1) * shakeA] : [0, 0];
      },
      burst(x, y, n, color, speed, o = {}) {
        for (let i = 0; i < n && parts.length < 400; i++) {
          const a = o.dir != null ? o.dir + rand(-(o.spread || 0.6), o.spread || 0.6) : rand(0, TAU);
          const s = speed * rand(0.35, 1);
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.35, 0.7) * (o.life || 1), r: rand(1.5, 3.5) * (o.size || 1), c: color, g: o.grav || 0, star: !!o.star });
        }
      },
      text(x, y, s, color, size) {
        if (texts.length > 40) texts.shift();
        texts.push({ x, y, s, color: color || '#fff', size: size || 1, t: 0 });
      },
      // particles and floating texts, drawn in the game's own coordinates
      drawFx() {
        for (const q of parts) {
          const a = 1 - q.t / q.life;
          ctx.globalAlpha = a;
          ctx.fillStyle = q.c;
          if (q.star) {
            ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.t * 6);
            ctx.fillRect(-q.r, -q.r * 0.3, q.r * 2, q.r * 0.6);
            ctx.fillRect(-q.r * 0.3, -q.r, q.r * 0.6, q.r * 2);
            ctx.restore();
          } else {
            ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.4 + a * 0.6), 0, TAU); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        for (const f of texts) {
          const u = f.t / 0.9;
          const pop = f.t < 0.1 ? 0.6 + f.t * 6 : 1.2 - Math.min(0.2, (f.t - 0.1));
          ctx.globalAlpha = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1;
          ctx.font = `700 ${(14 * f.size * pop).toFixed(1)}px Fredoka, system-ui, sans-serif`;
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(20, 6, 30, 0.85)';
          ctx.strokeText(f.s, f.x, f.y - f.t * 34);
          ctx.fillStyle = f.color;
          ctx.fillText(f.s, f.x, f.y - f.t * 34);
        }
        ctx.globalAlpha = 1;
      },
      // the costumed cat, feet at (x, y) unless o.center
      drawCat(pose, x, y, h, o = {}) {
        const set = api.hwSprites[cat];
        if (!set || !set.walk[0]) return;
        const ref = set.walk[0];
        const img = pose === 'walk' ? set.walk[Math.floor(o.frame || 0) % set.walk.length] : (set[pose] || ref);
        const k = h / ref.height;
        const w = img.width * k, hh = img.height * k;
        ctx.save();
        ctx.translate(x, y);
        if (o.rot) ctx.rotate(o.rot);
        if (o.alpha != null) ctx.globalAlpha = o.alpha;
        if (o.squash) ctx.scale(1 + o.squash, 1 - o.squash);
        if (o.flip && pose !== 'sitting') ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, o.center ? -hh / 2 : -hh, w, hh);
        ctx.restore();
      },
      walkFrames() {
        const set = api.hwSprites[cat];
        return set ? set.walk.length : 1;
      },
      // screen size in CSS pixels
      get w() { return view.cssW; },
      get h() { return view.cssH; },
      get dpr() { return view.dpr; },
    };

    // ------------------------------------------------------------------------
    // Run
    // ------------------------------------------------------------------------
    function start(id, catKey) {
      gameId = id;
      cat = catKey;
      game = HW.games[id](env);
      mode = 'run';
      paused = false;
      ended = false;
      shown = false;
      endT = 0;
      score = 0;
      runCorn = 0;
      shakeA = 0;
      parts = [];
      texts = [];
      env.result = null;
      pointerId = null;
      showHw(null);
      api.showScreen(null);
      $('hw-hud').classList.remove('hidden');
      $('hw-hud').dataset.game = id;
      $('hw-hint').textContent = tr('hw.' + id + '.hint');
      $('hw-hint-wrap').classList.remove('fade');
      setTimeout(() => $('hw-hint-wrap').classList.add('fade'), 3200);
      api.setPlaylist(HW.MUSIC[id]);
      if (api.onRunChange) api.onRunChange();
      updateHud(true);
    }

    function quit() {
      if (mode === 'off') return;
      // candy corn picked up so far is kept even when leaving early
      if (!ended) bankCorn();
      mode = 'off';
      game = null;
      showHw(null);
      $('hw-hud').classList.add('hidden');
      if (api.onRunChange) api.onRunChange();
    }

    function bankCorn() {
      if (runCorn > 0 && !api.gfMode()) store.set('hwCorn', (store.get('hwCorn', 0) || 0) + runCorn);
      runCorn = 0;
    }

    function pause() {
      if (mode !== 'run' || paused || ended) return;
      paused = true;
      pointerId = null;
      if (game.blur) game.blur();
      showHw('hw-pause');
    }

    function resume() {
      paused = false;
      showHw(null);
    }

    function finish() {
      shown = true;
      const counts = !api.gfMode();
      const field = HW.FIELD[gameId];
      const best = store.get(field, null);
      const isBest = counts && score > 0 && (!best || score > best.score);
      const earned = runCorn;
      if (isBest) store.set(field, Object.assign({ score, cat, corn: earned, at: Date.now() }, env.result || {}));
      bankCorn();
      const total = store.get('hwCorn', 0) || 0;
      $('hw-over-eyebrow').textContent = tr('hw.' + gameId);
      $('hw-over-title').textContent = tr(env.result && env.result.title ? env.result.title : 'hw.over');
      $('hw-o-score').textContent = score.toLocaleString();
      const b = store.get(field, null);
      $('hw-o-best').textContent = b ? b.score.toLocaleString() : '0';
      $('hw-o-corn').textContent = '+' + earned;
      $('hw-o-note').textContent = !counts ? tr('gf.notSaved') : isBest ? tr('win.newRecord') : '';
      const pct = Math.min(1, total / HW.SECRET_COST);
      $('hw-o-secret-fill').style.width = (pct * 100).toFixed(1) + '%';
      $('hw-o-secret-text').textContent = total >= HW.SECRET_COST
        ? tr('hw.secretReady')
        : tr('hw.secretProgress', { n: total, max: HW.SECRET_COST });
      $('hw-o-img').src = api.catImage(cat, 'sitting');
      $('hw-hud').classList.add('hidden');
      showHw('hw-over');
      if (api.onRunChange) api.onRunChange();
    }

    // ------------------------------------------------------------------------
    // HUD and screens
    // ------------------------------------------------------------------------
    const hudCache = {};
    function setHud(id, v) {
      if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; }
    }

    function updateHud(force) {
      if (force) for (const k in hudCache) delete hudCache[k];
      setHud('hw-score', score.toLocaleString());
      setHud('hw-corn', String(runCorn));
      const info = game && game.hud ? game.hud() : '';
      setHud('hw-info', info);
    }

    const SCREENS = ['hw-pause', 'hw-over'];
    function showHw(id) {
      for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    }

    // ------------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------------
    const playing = () => mode === 'run' && !paused && !ended && !(api.blocked && api.blocked());

    canvas.addEventListener('pointerdown', (e) => {
      if (!playing()) return;
      e.preventDefault();
      pointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (game.down) game.down(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!playing() || e.pointerId !== pointerId) return;
      if (game.move) game.move(e.clientX, e.clientY);
    });
    const up = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (mode === 'run' && game && game.up) game.up(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      if (mode !== 'run') return;
      if (e.key === 'Escape' || e.key === 'p') { if (paused) resume(); else pause(); return; }
      if (!playing()) return;
      if (game.key && game.key(e.code)) e.preventDefault();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    $('hw-btn-pause').addEventListener('click', pause);
    $('hw-btn-sound').addEventListener('click', () => { api.setMuted(!audio.muted); syncSound(); });
    $('hw-resume').addEventListener('click', resume);
    $('hw-restart').addEventListener('click', () => { const g = gameId; quit(); start(g, cat); });
    $('hw-quit').addEventListener('click', () => { quit(); api.toHub(); });
    $('hw-again').addEventListener('click', () => { const g = gameId; mode = 'off'; start(g, cat); });
    $('hw-over-hub').addEventListener('click', () => { mode = 'off'; game = null; showHw(null); api.toHub(); });

    function syncSound() {
      $('hw-btn-sound').classList.toggle('muted', audio.muted);
    }

    // ------------------------------------------------------------------------
    // Frame
    // ------------------------------------------------------------------------
    function frame(dt) {
      if (mode !== 'run' || !game) return;
      const frozen = paused || (api.blocked && api.blocked()) || shown;
      if (!frozen) {
        game.update(dt);
        shakeA = Math.max(0, shakeA - dt * 30);
        for (const q of parts) {
          q.t += dt;
          q.vx *= Math.exp(-2.5 * dt);
          q.vy = q.vy * Math.exp(-2.5 * dt) + q.g * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
        }
        if (parts.length && parts.some((q) => q.t >= q.life)) parts = parts.filter((q) => q.t < q.life);
        for (const f of texts) f.t += dt;
        if (texts.length && texts[0].t > 0.9) texts = texts.filter((f) => f.t <= 0.9);
        if (ended) {
          endT += dt;
          if (endT > 1.3 && !shown) finish();
        }
      }
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      game.render();
      if (!shown) updateHud(false);
    }

    return {
      get active() { return mode !== 'off'; },
      get running() { return mode === 'run' && !ended; },
      start,
      quit,
      pause,
      frame,
      syncSound,
      onLanguage() { if (game && game.onLanguage) game.onLanguage(); updateHud(true); },
      debug: { env, get game() { return game; } },
    };
  };
})();
