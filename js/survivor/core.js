// Backyard Survivors: an endless, auto-attacking horde survival mode.
// Move with a floating joystick (drag anywhere) or WASD; weapons fire on their own.
(() => {
  'use strict';
  const SV = window.SV;

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------
  const VIEW_W = 380;          // the short side of the screen shows at least this many world units
  const VIEW_H = 560;
  const CAT_H = 44;            // on-screen height of the standing cat
  const KITTEN_H = 26;
  const PLAYER_R = 13;         // player hit radius
  const BASE_SPEED = 120;      // world units per second
  const BASE_MAGNET = 46;      // pickup range
  const IFRAME = 0.6;          // invulnerability after getting hurt
  const WAIT_TO_SIT = 4;       // seconds standing still before the cat sits down
  const CELL = 64;             // spatial grid cell size
  const MAX_TEXTS = 70;
  const MAX_PARTS = 520;
  const MUSIC = ['Jaunty Guitar Motif.mp3', 'Jaunty Guitar Motif2.mp3'];
  const DAY_CYCLE = 720;       // seconds for a full day -> sunset -> night -> dawn cycle

  function xpNeed(level) {
    return Math.round(2 + level * 2 + 0.35 * Math.pow(level, 1.85));
  }

  SV.create = function (api) {
    const { canvas, ctx, view, sprites, audio, store } = api;
    const $ = (id) => document.getElementById(id);
    const W = SV.WEAPONS, PS = SV.PASSIVES, EN = SV.ENEMIES;
    const art = SV.createArt(ctx);
    const sfx = SV.createSfx(audio);

    let mode = 'off';           // 'off' | 'lobby' | 'run'
    let S = null;               // run state
    const P = {
      x: 0, y: 0, hp: 100, aimX: 1, aimY: 0, facing: 1, walkT: 0, stillT: 0,
      moving: false, iframe: 0, deadT: 0,
    };
    const cam = { x: 0, y: 0, scale: 1, w: VIEW_W, h: VIEW_H, shake: 0 };
    let enemies = [], projs = [], pickups = [], effects = [], parts = [], texts = [], puddles = [], kittens = [], eshots = [];
    let joy = null;
    const keys = {};
    const grid = new Map();
    let lobbyT = 0;

    // -------------------------------------------------------------------------
    // Persistent data
    // -------------------------------------------------------------------------
    const getMeta = () => store.get('sv.meta', {});
    const getBank = () => store.get('sv.coins', 0);
    const getBest = () => store.get('sv.best', null);

    // -------------------------------------------------------------------------
    // Stats
    // -------------------------------------------------------------------------
    function computeStats() {
      const c = SV.CHARACTERS[S.cat];
      const st = {
        might: 1, maxHp: c.maxHp, armor: c.armor || 0, regen: 0, speed: c.speed || 1, magnet: 1,
        area: 1, cooldown: 1 + (c.cooldown || 0), duration: 1, luck: 0, amount: 0, growth: 1, greed: 1,
      };
      const meta = getMeta();
      for (const [id, m] of Object.entries(SV.META)) {
        if (m.stat in st) st[m.stat] += m.per * (meta[id] || 0);
      }
      for (const p of S.passives) {
        const d = PS[p.id];
        if (d.stat in st) st[d.stat] += d.per * p.level;
      }
      if (S.frenzy > 0) { st.speed *= 1.3; st.cooldown *= 0.65; }
      st.cooldown = Math.max(0.35, st.cooldown);
      const prevMax = S.st ? S.st.maxHp : st.maxHp;
      S.st = st;
      if (st.maxHp > prevMax) P.hp += st.maxHp - prevMax;
      P.hp = Math.min(P.hp, st.maxHp);
      for (const w of S.weapons) w.s = wstat(w);
    }

    function wstat(w) {
      const def = W[w.id];
      const s = Object.assign({ dmg: 0, cd: 1, amount: 1, area: 1, dur: 1, pierce: 1, spd: 1 }, def.base);
      if (def.ups) {
        for (let i = 0; i < w.level - 1; i++) {
          for (const k in def.ups[i]) s[k] += def.ups[i][k];
        }
      }
      const st = S.st;
      s.dmg *= st.might;
      s.cd = Math.max(0.08, s.cd * st.cooldown);
      s.area *= st.area;
      s.dur *= st.duration;
      s.amount += st.amount;
      return s;
    }

    // -------------------------------------------------------------------------
    // Spatial grid
    // -------------------------------------------------------------------------
    const gridKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

    function buildGrid() {
      grid.clear();
      for (const e of enemies) {
        if (e.dead) continue;
        const k = gridKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
        let b = grid.get(k);
        if (!b) grid.set(k, (b = []));
        b.push(e);
      }
    }

    // Calls fn(e, dx, dy) for every live enemy whose circle overlaps (x, y, r).
    function query(x, y, r, fn) {
      const m = r + 40;
      const x0 = Math.floor((x - m) / CELL), x1 = Math.floor((x + m) / CELL);
      const y0 = Math.floor((y - m) / CELL), y1 = Math.floor((y + m) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const b = grid.get(gridKey(cx, cy));
          if (!b) continue;
          for (let i = 0; i < b.length; i++) {
            const e = b[i];
            if (e.dead) continue;
            const dx = e.x - x, dy = e.y - y, rr = r + e.r;
            if (dx * dx + dy * dy <= rr * rr) fn(e, dx, dy);
          }
        }
      }
    }

    function nearestEnemies(x, y, n, maxR) {
      const list = [];
      const m2 = maxR * maxR;
      for (const e of enemies) {
        if (e.dead || e.def.prop) continue;
        const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d2 <= m2) list.push([d2, e]);
      }
      list.sort((a, b) => a[0] - b[0]);
      return list.slice(0, n).map((v) => v[1]);
    }

    function onScreen(x, y, pad = 0) {
      return x > cam.x - pad && x < cam.x + cam.w + pad && y > cam.y - pad && y < cam.y + cam.h + pad;
    }

    function visibleEnemies() {
      return enemies.filter((e) => !e.dead && !e.def.prop && onScreen(e.x, e.y, -8));
    }

    function canHit(e, key, cd) {
      const last = e.hit[key];
      if (last != null && S.time - last < cd) return false;
      e.hit[key] = S.time;
      return true;
    }

    // -------------------------------------------------------------------------
    // Effects helpers
    // -------------------------------------------------------------------------
    function addText(x, y, v, kind) {
      if (texts.length >= MAX_TEXTS && kind !== 'crit' && kind !== 'hurt') return;
      texts.push({ x: x + rand(-5, 5), y, v, kind, t: 0, life: kind === 'crit' ? 0.75 : 0.6 });
    }

    function burst(x, y, n, color, speed, opts = {}) {
      for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
        const a = opts.dir != null ? opts.dir + rand(-opts.spread, opts.spread) : rand(0, TAU);
        const s = speed * rand(0.4, 1);
        parts.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
          life: rand(0.3, 0.6) * (opts.life || 1), r: rand(1.5, 3.2) * (opts.size || 1),
          c: color, g: opts.grav || 0, kind: opts.kind || 'dot', drag: opts.drag == null ? 3 : opts.drag,
        });
      }
    }

    function puff(x, y, n, size = 1, color = 'rgba(255,255,255,') {
      for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
        const a = rand(0, TAU);
        parts.push({
          x: x + Math.cos(a) * rand(0, 6) * size, y: y + Math.sin(a) * rand(0, 6) * size,
          vx: Math.cos(a) * rand(10, 40) * size, vy: Math.sin(a) * rand(10, 40) * size - 10,
          t: 0, life: rand(0.35, 0.55), r: rand(3, 6) * size, c: color, g: 0, kind: 'puff', drag: 4,
        });
      }
    }

    function ring(x, y, r, color, life = 0.35, width = 3) {
      effects.push({ kind: 'ring', x, y, r, color, t: 0, life, width });
    }

    function shake(a) { cam.shake = Math.min(12, cam.shake + a); }

    function banner(text, kind) {
      const el = $('sv-banner');
      el.textContent = text;
      el.className = 'sv-banner';
      void el.offsetWidth;
      el.className = 'sv-banner show' + (kind ? ' ' + kind : '');
    }

    function vibrate(p) {
      if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } }
    }

    // -------------------------------------------------------------------------
    // Enemies
    // -------------------------------------------------------------------------
    function hpMul() {
      const m = S.time / 60;
      return 1 + 0.22 * m + 0.028 * m * m;
    }

    function spawnEnemy(type, x, y, opts = {}) {
      const d = EN[type];
      const m = S.time / 60;
      const elite = !!opts.elite;
      const mul = d.prop ? 1 : hpMul() * (elite ? 9 : 1) * (d.boss ? 1 + 0.25 * S.bossCount : 1);
      const e = {
        type, def: d, x, y, elite, boss: !!d.boss,
        hp: d.hp * mul, maxHp: d.hp * mul,
        speed: d.speed * (1 + 0.012 * Math.min(m, 25)) * (elite ? 1.1 : 1) * rand(0.92, 1.08),
        r: d.r * (elite ? 1.35 : 1), scale: elite ? 1.35 : 1,
        dmg: d.dmg * (1 + 0.06 * m) * (elite ? 1.5 : 1),
        ang: Math.atan2(P.y - y, P.x - x), anim: rand(0, 4), flash: 0, kx: 0, ky: 0,
        seed: rand(0, 100), st: rand(0, 3), slowT: 0, hit: {}, ai: { t: rand(3, 5), state: 'walk', summon: 5, shoot: 2.5 },
        straight: opts.straight || null, life: opts.life || 0,
      };
      enemies.push(e);
      return e;
    }

    function spawnRing(extra = 40) {
      // usually spawn where the cat is heading so it runs into the critters
      let a = rand(0, TAU);
      if (P.moving && Math.random() < 0.55) a = Math.atan2(P.aimY, P.aimX) + rand(-1, 1);
      const R = Math.hypot(cam.w, cam.h) / 2 + extra;
      return [P.x + Math.cos(a) * R, P.y + Math.sin(a) * R];
    }

    function waveWeights() {
      const m = S.time / 60;
      let row = SV.WAVES[0];
      for (const w of SV.WAVES) if (w.at <= m) row = w;
      return row.w;
    }

    function pickType(weights) {
      let total = 0;
      for (const k in weights) total += weights[k];
      let r = Math.random() * total;
      for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
      return Object.keys(weights)[0];
    }

    function aliveCount() {
      let n = 0;
      for (const e of enemies) if (!e.dead && !e.def.prop) n++;
      return n;
    }

    function director(dt) {
      const m = S.time / 60;
      const target = Math.min(300, 14 + 10 * m + 1.4 * m * m) * (S.boss ? 0.7 : 1);
      const rate = 2.5 + 2.2 * m;
      S.spawnAcc += rate * dt;
      if (S.spawnAcc >= 1) {
        let alive = aliveCount();
        while (S.spawnAcc >= 1) {
          S.spawnAcc -= 1;
          if (alive >= target) continue;
          const [x, y] = spawnRing(rand(20, 80));
          spawnEnemy(pickType(waveWeights()), x, y);
          alive++;
        }
      }

      if (S.time >= S.nextElite) {
        S.nextElite += rand(62, 80);
        const [x, y] = spawnRing(60);
        spawnEnemy(pickType(waveWeights()), x, y, { elite: true });
        banner('A big one appeared! It carries a box 📦', 'elite');
      }

      if (S.time >= S.nextBoss - 4 && !S.bossWarned) {
        S.bossWarned = true;
        const type = SV.BOSSES[S.bossIdx % SV.BOSSES.length];
        banner('⚠ ' + EN[type].name + ' approaches!', 'boss');
        sfx.warning();
      }
      if (S.time >= S.nextBoss) {
        const type = SV.BOSSES[S.bossIdx % SV.BOSSES.length];
        S.bossIdx++;
        S.nextBoss += SV.BOSS_EVERY;
        S.bossWarned = false;
        const [x, y] = spawnRing(70);
        S.boss = spawnEnemy(type, x, y);
        S.bossCount++;
        shake(6);
      }

      if (S.time >= S.nextEvent) runEvent();
    }

    function runEvent() {
      let ev = SV.EVENTS[S.eventIdx];
      if (ev) {
        S.eventIdx++;
      } else {
        const pool = Object.keys(waveWeights());
        ev = { kind: pick(['ring', 'stampede', 'swarm']), type: pick(pool), count: Math.round(rand(26, 40)) };
        ev.text = { ring: 'Surrounded!', stampede: 'Stampede!', swarm: 'Here comes a swarm!' }[ev.kind];
      }
      const next = SV.EVENTS[S.eventIdx];
      S.nextEvent = next ? next.at : S.time + rand(90, 130);
      const count = Math.round(ev.count * (1 + Math.min(S.time / 900, 1)));
      banner(ev.text, 'event');
      if (ev.kind === 'ring') {
        // a closing circle with one gap to escape through
        const R = Math.max(cam.w, cam.h) * 0.58;
        const gap = rand(0, TAU);
        for (let i = 0; i < count; i++) {
          const a = gap + 0.55 + i / count * (TAU - 1.1);
          spawnEnemy(ev.type, P.x + Math.cos(a) * R, P.y + Math.sin(a) * R);
        }
      } else if (ev.kind === 'stampede') {
        const a = rand(0, TAU);
        const dx = Math.cos(a), dy = Math.sin(a);
        const R = Math.hypot(cam.w, cam.h) / 2 + 40;
        for (let i = 0; i < count; i++) {
          const off = rand(-1, 1) * Math.max(cam.w, cam.h) * 0.55;
          const back = rand(0, 260);
          const x = P.x - dx * (R + back) - dy * off;
          const y = P.y - dy * (R + back) + dx * off;
          const e = spawnEnemy(ev.type, x, y, { straight: { x: dx, y: dy }, life: 12 });
          e.speed *= 1.7;
        }
      } else {
        const [cx, cy] = spawnRing(60);
        for (let i = 0; i < count; i++) {
          spawnEnemy(ev.type, cx + rand(-60, 60), cy + rand(-60, 60));
        }
      }
    }

    function rotate(dx, dy, a) {
      const c = Math.cos(a), s = Math.sin(a);
      return [dx * c - dy * s, dx * s + dy * c];
    }

    function bossAI(e, dt, dx, dy, dist) {
      const ai = e.ai;
      ai.t -= dt;
      let sp = e.speed;
      if (e.type === 'queen') {
        // keeps her distance, circles and shoots stingers
        let mx = dx, my = dy;
        if (dist < 150) { mx = -dx; my = -dy; } else if (dist < 210) [mx, my] = rotate(dx, dy, Math.PI / 2 * (e.seed > 50 ? 1 : -1));
        ai.shoot -= dt;
        if (ai.shoot <= 0) {
          ai.shoot = 2.1;
          const base = Math.atan2(dy, dx);
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.22;
            eshots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 4, dmg: e.dmg * 0.6 });
          }
          sfx.throw();
        }
        ai.summon -= dt;
        if (ai.summon <= 0) {
          ai.summon = 8;
          for (let i = 0; i < 6; i++) spawnEnemy('bee', e.x + rand(-40, 40), e.y + rand(-40, 40));
        }
        return [mx, my, sp];
      }
      // Rat King and Robo-Vacuum: walk, wind up, charge
      const tele = e.type === 'vacuum' ? 0.9 : 0.7;
      const dash = e.type === 'vacuum' ? 1.1 : 0.8;
      const fast = e.type === 'vacuum' ? 6.5 : 4;
      if (ai.state === 'walk') {
        if (e.type === 'ratking') {
          ai.summon -= dt;
          if (ai.summon <= 0) {
            ai.summon = 7;
            for (let i = 0; i < 7; i++) {
              const a = i / 7 * TAU;
              spawnEnemy('mouse', e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46);
            }
            sfx.kill(true);
          }
        }
        if (ai.t <= 0) { ai.state = 'tele'; ai.t = tele; ai.dx = dx; ai.dy = dy; }
        return [dx, dy, sp];
      }
      if (ai.state === 'tele') {
        if (ai.t <= 0) { ai.state = 'dash'; ai.t = dash; shake(3); }
        return [ai.dx, ai.dy, 0];
      }
      // dash
      if (Math.random() < 0.5) puff(e.x - ai.dx * e.r, e.y - ai.dy * e.r, 1, 0.8, 'rgba(230,220,200,');
      if (ai.t <= 0) { ai.state = 'walk'; ai.t = rand(3.5, 5); }
      return [ai.dx, ai.dy, sp * fast];
    }

    function updateEnemies(dt) {
      for (const e of enemies) {
        if (e.dead) continue;
        const d = e.def;
        if (d.prop) { e.flash -= dt; continue; }
        e.flash -= dt;
        e.slowT -= dt;
        e.st += dt;
        const tx = P.x - e.x, ty = P.y - e.y;
        const dist = Math.hypot(tx, ty) || 1;
        let dx = tx / dist, dy = ty / dist;
        let sp = e.speed;
        let frame = -1;

        if (e.straight) {
          dx = e.straight.x; dy = e.straight.y;
          e.life -= dt;
          if (e.life <= 0) { e.dead = true; e.gone = true; continue; }
        } else if (e.boss) {
          [dx, dy, sp] = bossAI(e, dt, dx, dy, dist);
        } else {
          switch (d.move) {
            case 'zigzag': [dx, dy] = rotate(dx, dy, Math.sin(e.st * 7 + e.seed) * 0.8); break;
            case 'wobble': [dx, dy] = rotate(dx, dy, Math.sin(e.st * 4 + e.seed) * 0.6); break;
            case 'flutter': [dx, dy] = rotate(dx, dy, Math.sin(e.st * 2.6 + e.seed) * 1.2); break;
            case 'leap': {
              const c = (e.st + e.seed) % 2.6;
              if (c < 1.9) sp *= 0.6; else if (c < 2.25) sp = 0; else sp *= 4.2;
              break;
            }
            case 'hop': {
              const c = (e.st + e.seed) % 0.95;
              if (c < 0.4) { sp *= 2.5; frame = 1 + Math.floor(c / 0.4 * 3) % 3; } else { sp = 0; frame = 0; }
              break;
            }
            default: break;
          }
        }
        if (e.slowT > 0) sp *= e.type === 'vacuum' ? 0.8 : 0.5;

        e.kx *= Math.exp(-10 * dt);
        e.ky *= Math.exp(-10 * dt);
        const vx = dx * sp, vy = dy * sp;
        e.x += (vx + e.kx) * dt;
        e.y += (vy + e.ky) * dt;

        if (sp > 1) {
          const want = Math.atan2(vy, vx);
          e.ang += angDiff(want, e.ang) * Math.min(1, dt * 10);
        }
        if (frame >= 0) e.frame = frame;
        else {
          e.anim += dt * (d.fly ? 16 : 2 + sp * 0.09);
          e.frame = Math.floor(e.anim) % 4;
        }

        // relocate critters that fell far behind
        if (!e.boss && !e.straight && dist > Math.hypot(cam.w, cam.h) * 0.75 + 220) {
          const [x, y] = spawnRing(30);
          e.x = x; e.y = y;
        }

        // touching the cat
        if (!S.over && P.iframe <= 0) {
          const rr = e.r + PLAYER_R - 4;
          if (tx * tx + ty * ty < rr * rr) hurtPlayer(e.dmg);
        }
      }
    }

    // Soft push so critters don't stack into one blob.
    function separate() {
      for (const e of enemies) {
        if (e.dead || e.def.prop || e.boss) continue;
        let n = 0;
        query(e.x, e.y, e.r, (o, dx, dy) => {
          if (o === e || n > 5 || o.def.prop) return;
          n++;
          const d2 = dx * dx + dy * dy;
          const rr = (e.r + o.r) * 0.85;
          if (d2 >= rr * rr) return;
          const dd = Math.sqrt(d2) || 0.01;
          const push = (rr - dd) * 0.5;
          const ux = dd > 0.02 ? dx / dd : rand(-1, 1), uy = dd > 0.02 ? dy / dd : rand(-1, 1);
          e.x -= ux * push;
          e.y -= uy * push;
          if (!o.boss) { o.x += ux * push * 0.5; o.y += uy * push * 0.5; }
        });
      }
    }

    function hurtEnemy(e, dmg, src, kx, ky, kb) {
      if (e.dead) return;
      const crit = Math.random() < 0.05 + S.st.luck * 0.3 + (src === 'shredder' ? 0.15 : 0);
      let d = Math.max(1, Math.round(dmg * (crit ? 2 : 1) * rand(0.9, 1.1)));
      const dealt = Math.min(d, Math.ceil(e.hp));
      e.hp -= d;
      e.flash = 0.1;
      S.dmgBy[src] = (S.dmgBy[src] || 0) + dealt;
      if (kb && !e.def.prop) {
        const res = 1 - (e.def.kbRes || 0) - (e.elite ? 0.5 : 0);
        if (res > 0) { e.kx += kx * kb * res; e.ky += ky * kb * res; }
      }
      if (!e.def.prop) addText(e.x, e.y - e.r, d, crit ? 'crit' : null);
      if (crit && src === 'shredder') heal(1);
      if (e.hp <= 0) killEnemy(e);
      else sfx.hit();
    }

    function killEnemy(e) {
      e.dead = true;
      const d = e.def;
      if (d.prop) { breakPot(e); return; }
      S.kills++;
      sfx.kill(d.squeak);
      effects.push({ kind: 'die', type: e.type, x: e.x, y: e.y, ang: e.ang, scale: e.scale, frame: e.frame || 0, t: 0, life: 0.2 });
      puff(e.x, e.y, e.boss ? 14 : 3, e.boss ? 2 : e.r / 10);
      burst(e.x, e.y, e.boss ? 30 : 4, d.color, 90, { size: e.boss ? 1.6 : 0.8 });
      dropXp(e.x, e.y, d.xp * (e.elite ? 12 : 1));
      if (Math.random() < 0.035 + S.st.luck * 0.02) dropPickup('coin', e.x, e.y, 1);
      if (Math.random() < 0.003) dropPickup('sardine', e.x, e.y);
      if (e.elite) {
        dropPickup('box', e.x, e.y, 0, { boss: false });
        burst(e.x, e.y, 26, '#ffd34d', 160, { size: 1.2 });
      }
      if (e.boss) {
        if (S.boss === e) S.boss = null;
        dropPickup('box', e.x, e.y, 0, { boss: true });
        for (let i = 0; i < 10; i++) dropPickup('coin', e.x, e.y, 2);
        sfx.bossDie();
        shake(10);
        S.slowmo = 0.7;
        ring(e.x, e.y, 120, 'rgba(255,220,120,', 0.6, 6);
        banner(d.name + ' defeated!', 'good');
      }
    }

    // -------------------------------------------------------------------------
    // Flower pots (breakable, drop goodies)
    // -------------------------------------------------------------------------
    function managePots(dt) {
      S.potT -= dt;
      if (S.potT > 0) return;
      S.potT = 3;
      let near = 0;
      for (const e of enemies) {
        if (!e.dead && e.def.prop) {
          const d = Math.hypot(e.x - P.x, e.y - P.y);
          if (d > 1100) e.dead = true;
          else near++;
        }
      }
      if (near < 4) {
        const a = rand(0, TAU);
        const R = rand(Math.hypot(cam.w, cam.h) / 2 + 20, 650);
        spawnEnemy('pot', P.x + Math.cos(a) * R, P.y + Math.sin(a) * R);
      }
    }

    function breakPot(e) {
      sfx.rattle();
      burst(e.x, e.y, 10, '#c86b3c', 120, { size: 1.1, grav: 0 });
      burst(e.x, e.y, 6, '#4caf50', 90, { size: 1 });
      const lowHp = P.hp < S.st.maxHp * 0.6;
      const table = [['sardine', lowHp ? 40 : 16], ['coin', 26], ['xp', 16], ['catnip', 10], ['can', 8], ['hiss', 8]];
      let total = 0;
      for (const t of table) total += t[1];
      let r = Math.random() * total;
      for (const [kind, w] of table) {
        r -= w;
        if (r > 0) continue;
        if (kind === 'coin') dropPickup('coin', e.x, e.y, 5);
        else if (kind === 'xp') dropXp(e.x, e.y, Math.round(10 + S.time / 20));
        else dropPickup(kind, e.x, e.y);
        break;
      }
    }

    // -------------------------------------------------------------------------
    // Pickups
    // -------------------------------------------------------------------------
    function dropXp(x, y, v) {
      if (v <= 0) return;
      dropPickup('xp', x, y, v);
    }

    function dropPickup(kind, x, y, v = 0, extra = {}) {
      const a = rand(0, TAU);
      const s = kind === 'xp' ? rand(10, 40) : rand(30, 70);
      pickups.push(Object.assign({
        kind, v, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: kind === 'xp' ? rand(40, 80) : rand(80, 130),
        t: 0, vac: false, spd: 0,
      }, extra));
    }

    function xpSprite(v) {
      if (v < 3) return art.item.xp1;
      if (v < 10) return art.item.xp2;
      if (v < 40) return art.item.xp3;
      return art.item.xp4;
    }

    function updatePickups(dt) {
      const magnet = BASE_MAGNET * S.st.magnet;
      for (const p of pickups) {
        if (p.done) continue;
        p.t += dt;
        if (p.vz || p.z > 0) {
          p.z += p.vz * dt;
          p.vz -= 420 * dt;
          if (p.z <= 0) { p.z = 0; p.vz = 0; }
        }
        p.vx *= Math.exp(-5 * dt);
        p.vy *= Math.exp(-5 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const dx = P.x - p.x, dy = P.y - p.y;
        const d = Math.hypot(dx, dy);
        if (p.kind === 'box') {
          if (d < 26 && !S.over) { p.done = true; openChest(p.boss); return; }
          continue;
        }
        if (!p.vac && d < magnet && p.t > 0.25) p.vac = true;
        if (p.vac && !S.over) {
          p.spd = Math.max(p.spd, 60) + 1100 * dt;
          const step = Math.min(d, p.spd * dt);
          p.x += dx / (d || 1) * step;
          p.y += dy / (d || 1) * step;
          if (d < 12) { p.done = true; collect(p); }
        }
        if (d > 2000 && p.kind !== 'xp') p.done = true;
      }
      if (pickups.some((p) => p.done)) pickups = pickups.filter((p) => !p.done);

      // Too many treats on the floor: merge the far-away ones into one big treat.
      S.mergeT -= dt;
      if (S.mergeT <= 0) {
        S.mergeT = 2;
        const xs = pickups.filter((p) => p.kind === 'xp');
        if (xs.length > 240) {
          const far = xs.filter((p) => Math.hypot(p.x - P.x, p.y - P.y) > 320);
          if (far.length > 1) {
            let sum = 0;
            for (const p of far) { sum += p.v; p.done = true; }
            pickups = pickups.filter((p) => !p.done);
            const f = far[0];
            pickups.push({ kind: 'xp', v: sum, x: f.x, y: f.y, vx: 0, vy: 0, z: 0, vz: 0, t: 1, vac: false, spd: 0 });
          }
        }
      }
    }

    function collect(p) {
      switch (p.kind) {
        case 'xp':
          sfx.pickup();
          gainXp(p.v);
          break;
        case 'coin':
          S.coins += p.v;
          sfx.coin();
          addText(P.x, P.y - 30, '+' + p.v + ' 💰', 'coin');
          break;
        case 'sardine':
          heal(30);
          sfx.heal();
          puff(P.x, P.y - 10, 6, 1, 'rgba(140,255,160,');
          break;
        case 'can':
          for (const q of pickups) if (q.kind === 'xp' || q.kind === 'coin') q.vac = true;
          sfx.powerUp();
          banner('Can opener! All treats come running 🥫', 'good');
          break;
        case 'catnip':
          S.frenzy = 10;
          computeStats();
          sfx.powerUp();
          banner('Catnip frenzy! 🌿', 'good');
          break;
        case 'hiss':
          bigHiss();
          break;
        default: break;
      }
    }

    function heal(n) {
      if (P.hp >= S.st.maxHp) return;
      const before = P.hp;
      P.hp = Math.min(S.st.maxHp, P.hp + n);
      if (P.hp - before >= 5) addText(P.x, P.y - 32, '+' + Math.round(P.hp - before), 'heal');
    }

    function bigHiss() {
      sfx.bigHiss();
      shake(8);
      S.flash = 0.5;
      ring(P.x, P.y, Math.max(cam.w, cam.h) * 0.7, 'rgba(255,200,90,', 0.5, 10);
      for (const e of enemies) {
        if (e.dead || e.def.prop || !onScreen(e.x, e.y, 30)) continue;
        const a = Math.atan2(e.y - P.y, e.x - P.x);
        const dmg = e.boss ? e.maxHp * 0.08 : e.elite ? e.maxHp * 0.35 : e.hp + 1;
        hurtEnemy(e, dmg, 'hiss!', Math.cos(a), Math.sin(a), 300);
      }
    }

    function gainXp(v) {
      S.xp += v * S.st.growth;
      while (S.xp >= S.xpNext) {
        S.xp -= S.xpNext;
        S.level++;
        S.xpNext = xpNeed(S.level);
        S.pendingLevels++;
        if (!S.luDelay) S.luDelay = 0.18;
        sfx.levelUp();
        ring(P.x, P.y, 70, 'rgba(255,215,110,', 0.5, 5);
        burst(P.x, P.y - 10, 18, '#ffd34d', 160, { size: 1 });
      }
    }

    // -------------------------------------------------------------------------
    // Player
    // -------------------------------------------------------------------------
    function inputVector() {
      let x = 0, y = 0;
      if (keys.ArrowLeft || keys.KeyA) x -= 1;
      if (keys.ArrowRight || keys.KeyD) x += 1;
      if (keys.ArrowUp || keys.KeyW) y -= 1;
      if (keys.ArrowDown || keys.KeyS) y += 1;
      if (x || y) { const l = Math.hypot(x, y); return [x / l, y / l]; }
      if (joy) {
        const max = joyMax();
        const dx = joy.cx - joy.sx, dy = joy.cy - joy.sy;
        const l = Math.hypot(dx, dy);
        if (l < max * 0.15) return [0, 0];
        const k = Math.min(1, l / max) / l;
        return [dx * k, dy * k];
      }
      return [0, 0];
    }

    function updatePlayer(dt) {
      const [ix, iy] = inputVector();
      const len = Math.hypot(ix, iy);
      const sp = BASE_SPEED * S.st.speed;
      P.x += ix * sp * dt;
      P.y += iy * sp * dt;
      P.moving = len > 0.05;
      if (P.moving) {
        P.aimX = ix / len;
        P.aimY = iy / len;
        if (Math.abs(ix) > 0.12) P.facing = ix > 0 ? 1 : -1;
        P.walkT += dt * 9 * Math.max(0.55, len) * Math.min(1.4, S.st.speed);
        P.stillT = 0;
      } else {
        P.stillT += dt;
      }
      P.iframe -= dt;
      if (S.st.regen > 0) heal(S.st.regen * dt);
      if (S.frenzy > 0) {
        S.frenzy -= dt;
        if (Math.random() < 0.3) burst(P.x + rand(-10, 10), P.y + rand(-14, 6), 1, '#7ee07e', 30, { size: 0.8 });
        if (S.frenzy <= 0) computeStats();
      }
    }

    function hurtPlayer(dmg) {
      const d = Math.max(1, Math.round(dmg - S.st.armor));
      P.hp -= d;
      P.iframe = IFRAME;
      S.hurtFlash = 0.35;
      shake(5);
      sfx.hurt();
      vibrate(30);
      addText(P.x, P.y - 30, d, 'hurt');
      if (P.hp <= 0) playerDown();
    }

    function playerDown() {
      if (S.revives > 0) {
        S.revives--;
        P.hp = S.st.maxHp * 0.6;
        P.iframe = 2.5;
        bigHiss();
        banner('Nine lives! Back on your paws 💖', 'good');
        return;
      }
      P.hp = 0;
      S.over = true;
      S.overT = 0;
      joy = null;
      sfx.death();
      vibrate([80, 40, 120]);
      $('sv-hud').classList.add('hidden');
    }

    // -------------------------------------------------------------------------
    // Weapons
    // -------------------------------------------------------------------------
    function addWeapon(id) {
      const w = { id, level: 1, t: 0.35, rot: 0, active: false, left: 0, grow: 0, pulse: 0 };
      S.weapons.push(w);
      w.s = wstat(w);
      return w;
    }

    function evolve(w) {
      const evo = W[w.id].evo;
      w.id = evo;
      w.level = 1;
      w.t = 0.2;
      w.s = wstat(w);
      if (evo === 'galaxy') w.active = true;
    }

    const FIRE = {
      claw(w, s) {
        const base = Math.atan2(P.aimY, P.aimX);
        const n = s.amount;
        for (let i = 0; i < n; i++) {
          const ang = n === 2 ? base + i * Math.PI : base + i * TAU / n;
          effects.push({
            kind: 'slash', ang, r: 74 * s.area, delay: i * 0.07, t: 0, life: 0.24,
            dmg: s.dmg, src: w.id, done: false, evo: w.id === 'shredder',
          });
        }
        return true;
      },
      fish(w, s) {
        const targets = nearestEnemies(P.x, P.y, s.amount, 460);
        for (let i = 0; i < s.amount; i++) {
          projs.push({
            kind: w.id === 'sushi' ? 'sushi' : 'fish', delay: i * 0.07, launched: false,
            tgt: targets.length ? targets[i % targets.length] : null,
            speed: 430 * s.spd, dmg: s.dmg, pierce: s.pierce, life: 1.5, r: 7, src: w.id, hits: [], spin: 0,
          });
        }
        return true;
      },
      milk(w, s) {
        const near = nearestEnemies(P.x, P.y, 12, 250);
        for (let i = 0; i < s.amount; i++) {
          let tx, ty;
          if (near.length) { const e = pick(near); tx = e.x; ty = e.y; } else { const a = rand(0, TAU); tx = P.x + Math.cos(a) * rand(50, 130); ty = P.y + Math.sin(a) * rand(50, 130); }
          projs.push({
            kind: 'bottle', delay: i * 0.12, launched: false, tx, ty, t: 0, dur: 0.5,
            dmg: s.dmg, rad: 30 * s.area, life: s.dur, src: w.id, flood: w.id === 'flood',
          });
        }
        return true;
      },
      laser(w, s) {
        for (let i = 0; i < s.amount; i++) {
          projs.push({
            kind: 'laser', delay: i * 0.12, launched: false, ang: rand(0, TAU), speed: 500 * s.spd * rand(0.9, 1.1),
            life: s.dur, dmg: s.dmg, r: 6 * s.area, src: w.id, trail: [], hue: rand(0, 360), disco: w.id === 'disco',
          });
        }
        return true;
      },
      mouse(w, s) {
        const tg = nearestEnemies(P.x, P.y, 1, 420)[0];
        const base = tg ? Math.atan2(tg.y - P.y, tg.x - P.x) : Math.atan2(P.aimY, P.aimX);
        const n = s.amount;
        const stampede = w.id === 'stampede';
        const spread = stampede ? 0.34 : 0.2;
        for (let i = 0; i < n; i++) {
          projs.push({
            kind: 'boomer', delay: stampede ? 0 : i * 0.1, launched: false,
            ang: base + (i - (n - 1) / 2) * spread, v0: 400 * s.spd, t: 0, life: 2.6,
            r: 10 * s.area, scale: Math.sqrt(s.area), dmg: s.dmg, src: w.id, hitT: new Map(), spin: 0,
          });
        }
        return true;
      },
      zap(w, s) {
        const vis = visibleEnemies();
        if (!vis.length) return false;
        for (let i = 0; i < s.amount; i++) {
          effects.push({
            kind: 'zapq', delay: i * 0.07, tgt: vis[Math.floor(Math.random() * vis.length)],
            dmg: s.dmg, rad: 26 * s.area, src: w.id, chain: w.id === 'thunder' ? 2 : 0, t: 0, life: 1,
          });
        }
        return true;
      },
      hairball(w, s) {
        const near = nearestEnemies(P.x, P.y, 20, 300);
        for (let i = 0; i < s.amount; i++) {
          let tx, ty;
          if (near.length) { const e = pick(near); tx = e.x + rand(-8, 8); ty = e.y + rand(-8, 8); } else { const a = rand(0, TAU); tx = P.x + Math.cos(a) * rand(60, 160); ty = P.y + Math.sin(a) * rand(60, 160); }
          projs.push({
            kind: 'lob', delay: i * 0.14, launched: false, tx, ty, t: 0, dur: 0.6,
            dmg: s.dmg, rad: 44 * s.area, src: w.id, big: w.id === 'apocalypse', spin: rand(0, TAU),
          });
        }
        return true;
      },
    };
    FIRE.shredder = FIRE.claw;
    FIRE.sushi = FIRE.fish;
    FIRE.flood = FIRE.milk;
    FIRE.disco = FIRE.laser;
    FIRE.stampede = FIRE.mouse;
    FIRE.thunder = FIRE.zap;
    FIRE.apocalypse = FIRE.hairball;

    // Weapons that are always "on" instead of firing on a cooldown.
    const CONTINUOUS = {
      yarn(w, s, dt) {
        w.rot += 3.2 * s.spd * dt;
        if (w.active) {
          w.grow = Math.min(1, w.grow + dt * 5);
          w.left -= dt;
          if (w.left <= 0 && s.cd > 0) { w.active = false; w.t = s.cd; }
        } else {
          w.grow = Math.max(0, w.grow - dt * 5);
          w.t -= dt;
          if (w.t <= 0) { w.active = true; w.left = s.dur; }
        }
        if (w.grow <= 0) return;
        const R = 58 * s.area * (0.4 + 0.6 * w.grow);
        const br = 8 * Math.sqrt(s.area);
        for (let i = 0; i < s.amount; i++) {
          const a = w.rot + i * TAU / s.amount;
          const bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R;
          query(bx, by, br, (e) => {
            if (canHit(e, w.id, 0.45)) hurtEnemy(e, s.dmg, w.id, Math.cos(a), Math.sin(a), 170);
          });
        }
      },
      hiss(w, s, dt) {
        w.pulse = Math.max(0, w.pulse - dt * 3);
        w.t -= dt;
        if (w.t > 0) return;
        w.t += s.cd;
        w.pulse = 1;
        const storm = w.id === 'storm';
        const R = 46 * s.area;
        let hits = 0;
        query(P.x, P.y, R, (e, dx, dy) => {
          const d = Math.hypot(dx, dy) || 1;
          hurtEnemy(e, s.dmg, w.id, dx / d, dy / d, 45);
          if (storm) e.slowT = 0.6;
          hits++;
        });
        if (storm && hits) heal(0.6);
      },
      kitten(w, s, dt) {
        while (kittens.length < s.amount) {
          kittens.push({ x: P.x + rand(-20, 20), y: P.y + rand(-20, 20), state: 'follow', cd: rand(0, 0.6), tgt: null, walkT: 0, facing: 1, jt: 0, runT: 0, moving: false, idx: kittens.length });
        }
        for (const k of kittens) updateKitten(k, s, w.id, dt);
      },
    };
    CONTINUOUS.galaxy = CONTINUOUS.yarn;
    CONTINUOUS.storm = CONTINUOUS.hiss;
    CONTINUOUS.army = CONTINUOUS.kitten;

    function updateKitten(k, s, src, dt) {
      k.cd -= dt;
      const speed = 230 * s.spd;
      let mx = 0, my = 0;
      if (Math.hypot(k.x - P.x, k.y - P.y) > 420) { k.x = P.x + rand(-20, 20); k.y = P.y + rand(-20, 20); k.state = 'follow'; }
      if (k.state === 'follow') {
        const a = k.idx * 2.1 + 2.4 + Math.sin(S.time * 0.7 + k.idx) * 0.3;
        const fx = P.x + Math.cos(a) * 32 - P.aimX * 10, fy = P.y + Math.sin(a) * 22;
        const dx = fx - k.x, dy = fy - k.y, d = Math.hypot(dx, dy);
        if (d > 6) { const sp = Math.min(speed, d * 6); mx = dx / d * sp; my = dy / d * sp; }
        if (k.cd <= 0) {
          const t = nearestEnemies(k.x, k.y, 1, 230)[0];
          if (t && Math.hypot(t.x - P.x, t.y - P.y) < 260) { k.tgt = t; k.state = 'run'; k.runT = 0; }
        }
      } else if (k.state === 'run') {
        k.runT += dt;
        const t = k.tgt;
        if (!t || t.dead || k.runT > 2.5) { k.state = 'follow'; k.cd = 0.2; }
        else {
          const dx = t.x - k.x, dy = t.y - k.y, d = Math.hypot(dx, dy) || 1;
          mx = dx / d * speed; my = dy / d * speed;
          if (d < 46) {
            k.state = 'jump'; k.jt = 0; k.jx0 = k.x; k.jy0 = k.y; k.jx1 = t.x; k.jy1 = t.y;
            k.facing = dx >= 0 ? 1 : -1;
            sfx.pounce();
          }
        }
      }
      if (k.state === 'jump') {
        k.jt += dt / 0.26;
        const u = Math.min(1, k.jt);
        k.x = lerp(k.jx0, k.jx1, u);
        k.y = lerp(k.jy0, k.jy1, u);
        k.z = Math.sin(u * Math.PI) * 18;
        if (u >= 1) {
          k.z = 0;
          query(k.x, k.y, 24, (e, dx, dy) => {
            const d = Math.hypot(dx, dy) || 1;
            hurtEnemy(e, s.dmg, src, dx / d, dy / d, 120);
          });
          puff(k.x, k.y + 6, 3, 0.7, 'rgba(240,230,210,');
          k.cd = s.cd;
          k.state = 'follow';
        }
        k.moving = false;
        return;
      }
      k.x += mx * dt;
      k.y += my * dt;
      k.moving = Math.hypot(mx, my) > 20;
      if (k.moving) {
        k.walkT += dt * 11;
        if (Math.abs(mx) > 5) k.facing = mx > 0 ? 1 : -1;
      }
    }

    function updateWeapons(dt) {
      for (const w of S.weapons) {
        const s = w.s;
        const cont = CONTINUOUS[w.id];
        if (cont) { cont(w, s, dt); continue; }
        w.t -= dt;
        if (w.t <= 0) {
          const ok = FIRE[w.id](w, s);
          w.t = ok ? s.cd : 0.25;
        }
      }
    }

    // -------------------------------------------------------------------------
    // Projectiles & area effects
    // -------------------------------------------------------------------------
    function updateProjs(dt) {
      for (const p of projs) {
        if (p.dead) continue;
        if (p.delay > 0) { p.delay -= dt; continue; }
        if (!p.launched) launch(p);
        switch (p.kind) {
          case 'fish':
          case 'sushi': {
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.spin += dt * (p.kind === 'sushi' ? 14 : 0);
            p.life -= dt;
            if (p.life <= 0) { p.dead = true; break; }
            query(p.x, p.y, p.r, (e) => {
              if (p.dead || p.hits.includes(e)) return;
              p.hits.push(e);
              hurtEnemy(e, p.dmg, p.src, p.vx / p.speed, p.vy / p.speed, 80);
              if (--p.pierce <= 0) p.dead = true;
            });
            break;
          }
          case 'bottle':
          case 'lob': {
            p.t += dt;
            const u = Math.min(1, p.t / p.dur);
            p.x = lerp(p.x0, p.tx, u);
            p.y = lerp(p.y0, p.ty, u);
            p.z = Math.sin(u * Math.PI) * (p.kind === 'lob' ? 70 : 46);
            p.spin += dt * 9;
            if (u >= 1) { p.dead = true; land(p); }
            break;
          }
          case 'laser': {
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.x < cam.x + 4) { p.x = cam.x + 4; p.vx = Math.abs(p.vx); }
            if (p.x > cam.x + cam.w - 4) { p.x = cam.x + cam.w - 4; p.vx = -Math.abs(p.vx); }
            if (p.y < cam.y + 4) { p.y = cam.y + 4; p.vy = Math.abs(p.vy); }
            if (p.y > cam.y + cam.h - 4) { p.y = cam.y + cam.h - 4; p.vy = -Math.abs(p.vy); }
            p.trail.push(p.x, p.y);
            if (p.trail.length > 24) p.trail.splice(0, 2);
            p.hue = (p.hue + dt * 400) % 360;
            p.life -= dt;
            if (p.life <= 0) { p.dead = true; break; }
            query(p.x, p.y, p.r, (e) => {
              if (canHit(e, p.src, 0.3)) hurtEnemy(e, p.dmg, p.src, p.vx / p.speed, p.vy / p.speed, 40);
            });
            break;
          }
          case 'boomer': {
            p.t += dt;
            p.spin += dt * 14;
            const out = 0.55;
            if (p.t < out) {
              const sp = p.v0 * (1 - p.t / out);
              p.x += Math.cos(p.ang) * sp * dt;
              p.y += Math.sin(p.ang) * sp * dt;
            } else {
              const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy) || 1;
              const sp = Math.min(p.v0 * 1.35, (p.t - out) * p.v0 * 3);
              p.x += dx / d * sp * dt;
              p.y += dy / d * sp * dt;
              if (d < 16) p.dead = true;
            }
            if (p.t > p.life) p.dead = true;
            query(p.x, p.y, p.r, (e, dx, dy) => {
              const last = p.hitT.get(e);
              if (last != null && p.t - last < 0.3) return;
              p.hitT.set(e, p.t);
              const d = Math.hypot(dx, dy) || 1;
              hurtEnemy(e, p.dmg, p.src, dx / d, dy / d, 110);
            });
            break;
          }
          default: break;
        }
      }
      if (projs.some((p) => p.dead)) projs = projs.filter((p) => !p.dead);
    }

    function launch(p) {
      p.launched = true;
      p.x = P.x; p.y = P.y - 6;
      p.x0 = p.x; p.y0 = p.y;
      if (p.kind === 'fish' || p.kind === 'sushi') {
        let a = Math.atan2(P.aimY, P.aimX);
        const t = p.tgt && !p.tgt.dead ? p.tgt : nearestEnemies(P.x, P.y, 1, 460)[0];
        if (t) a = Math.atan2(t.y - p.y, t.x - p.x);
        p.vx = Math.cos(a) * p.speed; p.vy = Math.sin(a) * p.speed;
        sfx.throw();
      } else if (p.kind === 'laser') {
        p.vx = Math.cos(p.ang) * p.speed; p.vy = Math.sin(p.ang) * p.speed;
        sfx.laser();
      } else if (p.kind === 'boomer') {
        sfx.throw();
      } else {
        sfx.throw();
      }
    }

    function land(p) {
      if (p.kind === 'bottle') {
        sfx.splash();
        puddles.push({ kind: 'milk', x: p.tx, y: p.ty, r: p.rad, life: p.life, t: 0, tick: 0, dmg: p.dmg, src: p.src, grow: p.flood ? 7 : 0, seed: rand(0, 10) });
        burst(p.tx, p.ty, 10, 'rgba(255,255,255,', 120, { size: 1, drag: 5 });
        return;
      }
      // hairball
      sfx.boom();
      shake(p.big ? 3 : 1.5);
      ring(p.tx, p.ty, p.rad, 'rgba(150,130,90,', 0.3, 4);
      puff(p.tx, p.ty, p.big ? 8 : 5, p.big ? 1.6 : 1.1, 'rgba(170,200,110,');
      burst(p.tx, p.ty, 12, '#8a7a5c', 200, { size: 1.2 });
      query(p.tx, p.ty, p.rad, (e, dx, dy) => {
        const d = Math.hypot(dx, dy) || 1;
        hurtEnemy(e, p.dmg, p.src, dx / d, dy / d, 220);
      });
      if (p.big) puddles.push({ kind: 'goo', x: p.tx, y: p.ty, r: p.rad * 0.7, life: 2.2, t: 0, tick: 0, dmg: p.dmg * 0.15, src: p.src, grow: 0, seed: rand(0, 10) });
    }

    function updatePuddles(dt) {
      for (const q of puddles) {
        q.t += dt;
        q.r += q.grow * dt;
        q.tick -= dt;
        if (q.tick <= 0) {
          q.tick = 0.33;
          query(q.x, q.y, q.r, (e) => {
            hurtEnemy(e, q.dmg, q.src, 0, 0, 0);
            if (q.kind === 'milk') e.slowT = 0.6;
          });
        }
      }
      if (puddles.some((q) => q.t >= q.life)) puddles = puddles.filter((q) => q.t < q.life);
    }

    function strike(x, y, dmg, rad, src) {
      query(x, y, rad, (e, dx, dy) => {
        const d = Math.hypot(dx, dy) || 1;
        hurtEnemy(e, dmg, src, dx / d, dy / d, 60);
      });
      ring(x, y, rad, 'rgba(160,230,255,', 0.25, 3);
      burst(x, y, 6, '#bfefff', 140, { size: 0.8, kind: 'spark' });
    }

    function boltPath(x1, y1, x2, y2) {
      const pts = [x1, y1];
      const n = 7;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let i = 1; i < n; i++) {
        const u = i / n;
        const off = rand(-1, 1) * Math.min(14, len * 0.12);
        pts.push(x1 + dx * u + nx * off, y1 + dy * u + ny * off);
      }
      pts.push(x2, y2);
      return pts;
    }

    function updateEffects(dt) {
      for (const f of effects) {
        if (f.delay > 0) { f.delay -= dt; continue; }
        if (f.kind === 'slash' && !f.done) {
          f.done = true;
          sfx.swipe();
          query(P.x, P.y, f.r, (e, dx, dy) => {
            const d = Math.hypot(dx, dy) || 1;
            const a = Math.atan2(dy, dx);
            if (d < 20 || Math.abs(angDiff(a, f.ang)) < 1.05) hurtEnemy(e, f.dmg, f.src, dx / d, dy / d, 150);
          });
        } else if (f.kind === 'zapq') {
          f.dead = true;
          let t = f.tgt;
          if (!t || t.dead) { const vis = visibleEnemies(); if (!vis.length) continue; t = pick(vis); }
          sfx.zap();
          effects.push({ kind: 'bolt', pts: boltPath(t.x + rand(-20, 20), t.y - 260, t.x, t.y), t: 0, life: 0.22 });
          const tx = t.x, ty = t.y;
          strike(tx, ty, f.dmg, f.rad, f.src);
          if (f.chain) {
            const others = nearestEnemies(tx, ty, f.chain + 1, 130).filter((o) => o !== t && !o.dead);
            let fx = tx, fy = ty;
            for (const o of others.slice(0, f.chain)) {
              effects.push({ kind: 'bolt', pts: boltPath(fx, fy, o.x, o.y), t: 0, life: 0.2 });
              strike(o.x, o.y, f.dmg * 0.6, f.rad * 0.7, f.src);
              fx = o.x; fy = o.y;
            }
          }
          continue;
        }
        f.t += dt;
        if (f.t >= f.life) f.dead = true;
      }
      if (effects.some((f) => f.dead)) effects = effects.filter((f) => !f.dead);

      for (const q of parts) {
        q.t += dt;
        q.vx *= Math.exp(-q.drag * dt);
        q.vy *= Math.exp(-q.drag * dt);
        q.vy += q.g * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      if (parts.length && parts.some((q) => q.t >= q.life)) parts = parts.filter((q) => q.t < q.life);

      for (const t of texts) { t.t += dt; t.y -= dt * 26; }
      if (texts.length && texts[0].t >= texts[0].life) texts = texts.filter((t) => t.t < t.life);
    }

    function updateEnemyShots(dt) {
      for (const b of eshots) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        if (!S.over && P.iframe <= 0 && Math.hypot(b.x - P.x, b.y - P.y) < PLAYER_R) { hurtPlayer(b.dmg); b.life = 0; }
      }
      if (eshots.some((b) => b.life <= 0)) eshots = eshots.filter((b) => b.life > 0);
    }

    // -------------------------------------------------------------------------
    // Level up
    // -------------------------------------------------------------------------
    const owns = (id) => S.weapons.find((w) => w.id === id);
    const ownsEvoOf = (id) => S.weapons.some((w) => W[w.id].from === id);
    const passive = (id) => S.passives.find((p) => p.id === id);
    const passiveMax = (id) => PS[id].max || 5;

    function rollOptions() {
      const pool = [];
      for (const w of S.weapons) {
        if (!W[w.id].evolved && w.level < SV.WEAPON_MAX_LEVEL) pool.push({ kind: 'weapon', id: w.id, w: 1.3 });
      }
      if (S.weapons.length < SV.MAX_WEAPONS) {
        for (const id of Object.keys(W)) {
          if (!W[id].evolved && !owns(id) && !ownsEvoOf(id)) pool.push({ kind: 'weapon', id, w: 1 });
        }
      }
      for (const p of S.passives) if (p.level < passiveMax(p.id)) pool.push({ kind: 'passive', id: p.id, w: 1.1 });
      if (S.passives.length < SV.MAX_PASSIVES) {
        for (const id of Object.keys(PS)) if (!passive(id)) pool.push({ kind: 'passive', id, w: 0.85 });
      }
      const n = 3 + (Math.random() < S.st.luck * 0.6 ? 1 : 0);
      const out = [];
      while (out.length < n && pool.length) {
        let total = 0;
        for (const o of pool) total += o.w;
        let r = Math.random() * total;
        let i = 0;
        for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
        out.push(pool.splice(i, 1)[0]);
      }
      if (!out.length) out.push({ kind: 'heal' }, { kind: 'coins' });
      return out;
    }

    function describeUp(def, up) {
      const parts = [];
      if (up.amount) {
        if (def === W.claw) parts.push('Also swipes behind you');
        else parts.push('+' + up.amount + ' ' + def.unit + (up.amount > 1 ? 's' : ''));
      }
      if (up.dmg) parts.push('+' + up.dmg + ' damage');
      if (up.area) parts.push('+' + Math.round(up.area * 100) + '% area');
      if (up.cd) parts.push((def === W.hiss ? 'Faster pulses' : up.cd + 's cooldown'));
      if (up.dur) parts.push('+' + up.dur + 's duration');
      if (up.pierce) parts.push('+' + up.pierce + ' pierce');
      if (up.spd) parts.push('+' + Math.round(up.spd * 100) + '% speed');
      return parts.join(', ');
    }

    function optionInfo(o) {
      if (o.kind === 'heal') return { icon: '🐟', name: 'Sardine snack', tag: '', desc: 'Restore 30 health.', cls: 'misc' };
      if (o.kind === 'coins') return { icon: '💰', name: 'Pocket change', tag: '', desc: '+15 fish coins.', cls: 'misc' };
      if (o.kind === 'weapon') {
        const d = W[o.id];
        const w = owns(o.id);
        let hint = '';
        if (d.evoWith) {
          const pw = PS[d.evoWith];
          hint = 'Evolves at Lv 8 with ' + pw.icon + ' ' + pw.name + (passive(d.evoWith) ? ' ✓' : '');
        }
        return w
          ? { icon: d.icon, name: d.name, tag: 'Lv ' + (w.level + 1), desc: describeUp(d, d.ups[w.level - 1]), hint, cls: 'weapon' }
          : { icon: d.icon, name: d.name, tag: 'New!', desc: d.desc, hint, cls: 'weapon new' };
      }
      const d = PS[o.id];
      const p = passive(o.id);
      const pair = Object.keys(W).find((id) => W[id].evoWith === o.id && owns(id));
      const hint = pair ? 'Evolves ' + W[pair].icon + ' ' + W[pair].name : '';
      return p
        ? { icon: d.icon, name: d.name, tag: 'Lv ' + (p.level + 1), desc: d.text, hint, cls: 'passive' }
        : { icon: d.icon, name: d.name, tag: 'New!', desc: d.text, hint, cls: 'passive new' };
    }

    function applyOption(o) {
      if (o.kind === 'heal') heal(30);
      else if (o.kind === 'coins') S.coins += 15;
      else if (o.kind === 'weapon') {
        const w = owns(o.id);
        if (w) w.level++;
        else addWeapon(o.id);
      } else {
        const p = passive(o.id);
        if (p) p.level++;
        else S.passives.push({ id: o.id, level: 1 });
        if (o.id === 'ninelives') S.revives++;
      }
      computeStats();
      refreshSlots();
    }

    function openLevelUp() {
      S.modal = 'levelup';
      joy = null;
      S.options = rollOptions();
      renderCards();
      showSv('sv-levelup');
    }

    function renderCards() {
      $('sv-lu-level').textContent = 'Level ' + (S.level - S.pendingLevels + 1);
      const box = $('sv-cards');
      box.innerHTML = '';
      S.options.forEach((o, i) => {
        const info = optionInfo(o);
        const b = document.createElement('button');
        b.className = 'sv-card ' + info.cls;
        b.style.animationDelay = (i * 0.06) + 's';
        b.innerHTML =
          '<span class="sv-card-icon">' + info.icon + '</span>' +
          '<span class="sv-card-body"><span class="sv-card-top"><span class="sv-card-name"></span>' +
          (info.tag ? '<span class="sv-card-tag"></span>' : '') + '</span>' +
          '<span class="sv-card-desc"></span>' + (info.hint ? '<span class="sv-card-hint"></span>' : '') + '</span>';
        b.querySelector('.sv-card-name').textContent = info.name;
        if (info.tag) b.querySelector('.sv-card-tag').textContent = info.tag;
        b.querySelector('.sv-card-desc').textContent = info.desc;
        if (info.hint) b.querySelector('.sv-card-hint').textContent = info.hint;
        b.disabled = true;
        b.addEventListener('click', () => chooseOption(i));
        box.appendChild(b);
      });
      // ignore taps for a moment so a finger that was steering doesn't pick by accident
      setTimeout(() => box.querySelectorAll('.sv-card').forEach((b) => { b.disabled = false; }), 420);
      const rr = $('sv-reroll');
      rr.textContent = 'Reroll (' + S.rerolls + ')';
      rr.disabled = S.rerolls <= 0;
    }

    function chooseOption(i) {
      if (S.modal !== 'levelup') return;
      const o = S.options[i];
      if (!o) return;
      sfx.pick();
      applyOption(o);
      S.pendingLevels--;
      if (S.pendingLevels > 0) { S.options = rollOptions(); renderCards(); } else closeModal();
    }

    function closeModal() {
      S.modal = null;
      showSv(null);
      P.iframe = Math.max(P.iframe, 0.6);
    }

    // -------------------------------------------------------------------------
    // Cardboard boxes (chests)
    // -------------------------------------------------------------------------
    function openChest(boss) {
      S.modal = 'chest';
      joy = null;
      const luck = S.st.luck;
      let n = 1;
      if (boss) n = Math.random() < 0.1 + luck * 0.3 ? 5 : 3;
      else if (Math.random() < 0.12 + luck * 0.3) n = 3;
      const loot = [];
      for (let i = 0; i < n; i++) {
        const evo = S.weapons.find((w) => W[w.id].evo && w.level >= SV.WEAPON_MAX_LEVEL && passive(W[w.id].evoWith));
        if (evo) {
          const from = W[evo.id];
          evolve(evo);
          loot.push({ icon: W[evo.id].icon, name: W[evo.id].name, desc: 'Evolved from ' + from.name + '!', cls: 'evo' });
          continue;
        }
        const ups = [];
        for (const w of S.weapons) if (!W[w.id].evolved && w.level < SV.WEAPON_MAX_LEVEL) ups.push({ kind: 'weapon', id: w.id });
        for (const p of S.passives) if (p.level < passiveMax(p.id)) ups.push({ kind: 'passive', id: p.id });
        if (ups.length) {
          const o = pick(ups);
          const info = optionInfo(o);
          applyOption(o);
          loot.push({ icon: info.icon, name: info.name + ' ' + info.tag, desc: info.desc, cls: o.kind });
        } else {
          S.coins += 25;
          loot.push({ icon: '💰', name: '+25 fish coins', desc: 'Everything is maxed out!', cls: 'misc' });
        }
      }
      computeStats();
      refreshSlots();

      $('sv-chest-title').textContent = boss ? 'A big box!' : 'A cardboard box!';
      const box = $('sv-chest-box');
      box.className = 'sv-box shaking';
      const list = $('sv-loot');
      list.innerHTML = '';
      loot.forEach((l, i) => {
        const el = document.createElement('div');
        el.className = 'sv-loot-item ' + l.cls;
        el.style.animationDelay = (0.85 + i * 0.25) + 's';
        el.innerHTML = '<span class="sv-card-icon"></span><span class="sv-card-body"><span class="sv-card-name"></span><span class="sv-card-desc"></span></span>';
        el.querySelector('.sv-card-icon').textContent = l.icon;
        el.querySelector('.sv-card-name').textContent = l.name;
        el.querySelector('.sv-card-desc').textContent = l.desc;
        list.appendChild(el);
      });
      const ok = $('sv-chest-ok');
      ok.disabled = true;
      setTimeout(() => {
        box.className = 'sv-box open';
        sfx.chest();
      }, 800);
      setTimeout(() => { ok.disabled = false; }, 900 + loot.length * 250);
      showSv('sv-chest');
    }

    // -------------------------------------------------------------------------
    // Main update
    // -------------------------------------------------------------------------
    function update(dt) {
      if (S.over) {
        S.overT += dt;
        P.deadT += dt;
        updateEffects(dt);
        if (S.overT > 1.9 && !S.resultsShown) showResults();
        return;
      }
      S.time += dt;
      updatePlayer(dt);
      director(dt);
      managePots(dt);
      buildGrid();
      updateEnemies(dt);
      separate();
      updateWeapons(dt);
      updateProjs(dt);
      updatePuddles(dt);
      updateEnemyShots(dt);
      updatePickups(dt);
      updateEffects(dt);
      if (enemies.some((e) => e.dead)) enemies = enemies.filter((e) => !e.dead);
      if (S.boss && S.boss.dead) S.boss = null;
      S.hurtFlash = Math.max(0, (S.hurtFlash || 0) - dt);
      S.flash = Math.max(0, S.flash - dt);
      if (S.luDelay > 0) {
        S.luDelay -= dt;
        if (S.luDelay <= 0) { S.luDelay = 0; if (S.pendingLevels > 0 && !S.modal) openLevelUp(); }
      }
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------
    function resizeView() {
      cam.scale = Math.min(view.cssW / VIEW_W, view.cssH / VIEW_H);
      cam.w = view.cssW / cam.scale;
      cam.h = view.cssH / cam.scale;
    }

    function worldTransform() {
      const s = cam.scale * view.dpr;
      ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
    }

    function screenTransform() {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    }

    function hash(x, y) {
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return (h ^ (h >>> 16)) >>> 0;
    }

    function drawGround() {
      ctx.fillStyle = art.ground;
      ctx.fillRect(cam.x - 2, cam.y - 2, cam.w + 4, cam.h + 4);
      const D = 110;
      const x0 = Math.floor(cam.x / D) - 1, x1 = Math.floor((cam.x + cam.w) / D) + 1;
      const y0 = Math.floor(cam.y / D) - 1, y1 = Math.floor((cam.y + cam.h) / D) + 1;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const h = hash(cx, cy);
          if (h % 100 > 42) continue;
          const d = art.decor[(h >>> 8) % art.decor.length];
          const x = cx * D + ((h >>> 12) % 80) + 15;
          const y = cy * D + ((h >>> 20) % 80) + 15;
          ctx.drawImage(d.c, x - d.size, y - d.size, d.size * 2, d.size * 2);
        }
      }
    }

    function drawSprite(c, size, x, y, ang, scale) {
      ctx.save();
      ctx.translate(x, y);
      if (ang) ctx.rotate(ang);
      const s = size * (scale || 1);
      ctx.drawImage(c, -s, -s, s * 2, s * 2);
      ctx.restore();
    }

    function catPose(key, moving, walkT, stillT) {
      const set = sprites[key];
      if (moving && set && set.walking_1) return 'walking_' + (1 + Math.floor(walkT) % 4);
      return stillT >= WAIT_TO_SIT ? 'sitting' : 'idle';
    }

    // Cat sprite with its feet at (x, y). Walking frames are normalized to the idle width.
    function drawCat(key, x, y, h, pose, facing, opts = {}) {
      const set = sprites[key];
      if (!set) return;
      const img = set[pose] || set.idle;
      const ref = set.idle;
      if (!img || !ref) return;
      let k = h / ref.height;
      if (pose.startsWith('walking') && set.walking_1) k *= ref.width / set.walking_1.width;
      if (pose === 'hit' && set.hit) k = ref.width * (h / ref.height) * 1.5 / set.hit.width;
      const w = img.width * k, hh = img.height * k;
      ctx.save();
      if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
      ctx.translate(x, y);
      if (opts.rot) ctx.rotate(opts.rot);
      if (opts.squash) ctx.scale(1 + opts.squash, 1 - opts.squash);
      if (facing < 0 && pose !== 'sitting') ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -hh, w, hh);
      ctx.restore();
    }

    function shadow(x, y, rx, ry, a = 0.22) {
      ctx.fillStyle = `rgba(20,40,10,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
    }

    function drawPuddles() {
      for (const q of puddles) {
        const fadeIn = Math.min(1, q.t / 0.15);
        const fadeOut = Math.min(1, (q.life - q.t) / 0.4);
        const a = fadeIn * fadeOut;
        const r = q.r * (0.6 + 0.4 * fadeIn);
        ctx.save();
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = q.kind === 'milk' ? '#fbfdff' : 'rgba(150,190,80,0.85)';
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const ang = i / 14 * TAU;
          const rr = r * (0.86 + 0.14 * Math.sin(ang * 3 + q.seed + q.t * 1.5));
          if (i === 0) ctx.moveTo(q.x + Math.cos(ang) * rr, q.y + Math.sin(ang) * rr * 0.8);
          else ctx.lineTo(q.x + Math.cos(ang) * rr, q.y + Math.sin(ang) * rr * 0.8);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = q.kind === 'milk' ? 'rgba(160,200,230,0.8)' : 'rgba(90,120,40,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = q.kind === 'milk' ? 'rgba(170,210,240,0.9)' : 'rgba(220,240,160,0.8)';
        const rip = (q.t * 0.9) % 1;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, r * rip, r * rip * 0.8, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.ellipse(q.x - r * 0.3, q.y - r * 0.25, r * 0.2, r * 0.08, -0.3, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawAuras() {
      for (const w of S.weapons) {
        if (w.id !== 'hiss' && w.id !== 'storm') continue;
        const storm = w.id === 'storm';
        const R = 46 * w.s.area * (1 + w.pulse * 0.06);
        const g = ctx.createRadialGradient(P.x, P.y, R * 0.2, P.x, P.y, R);
        const c = storm ? '170,90,255' : '255,110,80';
        g.addColorStop(0, `rgba(${c},0)`);
        g.addColorStop(0.75, `rgba(${c},${0.08 + w.pulse * 0.1})`);
        g.addColorStop(1, `rgba(${c},${0.22 + w.pulse * 0.15})`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(P.x, P.y, R, 0, TAU); ctx.fill();
        ctx.save();
        ctx.strokeStyle = `rgba(${c},0.55)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -S.time * 30;
        ctx.beginPath(); ctx.arc(P.x, P.y, R - 1, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    function drawPickups() {
      for (const p of pickups) {
        let it;
        let bob = 0;
        let scale = 1;
        if (p.kind === 'xp') it = xpSprite(p.v);
        else if (p.kind === 'coin') { it = art.item.coin; scale = p.v >= 5 ? 1.35 : 1; bob = Math.sin(S.time * 5 + p.x) * 1.5; }
        else if (p.kind === 'box') { it = art.item.box; bob = Math.abs(Math.sin(S.time * 3)) * -3; }
        else { it = art.item[p.kind]; bob = Math.sin(S.time * 4 + p.x) * 2; }
        if (!it) continue;
        if (!onScreen(p.x, p.y, 30)) continue;
        if (p.kind !== 'xp') shadow(p.x, p.y + it.size * 0.6, it.size * 0.6 * scale, it.size * 0.2, 0.18);
        if (p.kind === 'box' || p.kind === 'hiss' || p.kind === 'catnip' || p.kind === 'can') {
          const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, it.size * 1.8);
          g.addColorStop(0, 'rgba(255,240,170,0.45)');
          g.addColorStop(1, 'rgba(255,240,170,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y + bob - p.z, it.size * 1.8, 0, TAU); ctx.fill();
        }
        const pop = Math.min(1, p.t / 0.15);
        drawSprite(it.c, it.size, p.x, p.y + bob - p.z, 0, scale * (0.4 + 0.6 * pop));
        if (p.kind === 'xp' && (Math.floor(S.time * 3 + p.x) % 7 === 0)) {
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(p.x - 0.75, p.y - p.z - it.size * 0.6, 1.5, 1.5);
        }
      }
    }

    function drawTelegraphs() {
      for (const e of enemies) {
        if (!e.boss || e.ai.state !== 'tele') continue;
        const len = e.type === 'vacuum' ? 520 : 300;
        const a = Math.atan2(e.ai.dy, e.ai.dx);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(a);
        const blink = 0.18 + 0.12 * Math.sin(S.time * 30);
        ctx.fillStyle = `rgba(255,60,60,${blink})`;
        ctx.fillRect(0, -e.r, len, e.r * 2);
        ctx.strokeStyle = 'rgba(255,60,60,0.6)';
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(0, -e.r, len, e.r * 2);
        ctx.restore();
      }
      for (const p of projs) {
        if (p.kind !== 'lob' || !p.launched) continue;
        const u = p.t / p.dur;
        ctx.strokeStyle = `rgba(120,90,40,${0.25 + u * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(p.tx, p.ty, p.rad * (1.2 - u * 0.2), p.rad * 0.8 * (1.2 - u * 0.2), 0, 0, TAU); ctx.stroke();
      }
    }

    function drawEnemy(e) {
      const sp = art.enemy[e.type];
      const f = e.def.prop ? 0 : (e.frame || 0) % sp.frames.length;
      const img = e.flash > 0 ? sp.flashes[f] : sp.frames[f];
      if (e.boss || e.elite) shadow(e.x, e.y + e.r * 0.7, e.r * 0.95, e.r * 0.35, 0.25);
      if (e.elite) {
        const g = ctx.createRadialGradient(e.x, e.y, e.r * 0.3, e.x, e.y, e.r * 1.9);
        g.addColorStop(0, 'rgba(255,215,90,0.5)');
        g.addColorStop(1, 'rgba(255,215,90,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.9, 0, TAU); ctx.fill();
      }
      const fly = e.def.fly ? Math.sin(S.time * 6 + e.seed) * 2 : 0;
      if (e.def.fly) shadow(e.x, e.y + 8, e.r * 0.6, e.r * 0.25, 0.15);
      // turn the vacuum toward its heading, but keep bugs' rotation smooth
      drawSprite(img, sp.size, e.x, e.y + fly, e.def.prop ? 0 : e.ang, e.scale);
      if ((e.elite || e.boss) && e.hp < e.maxHp && !e.boss) {
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 4);
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * clamp(e.hp / e.maxHp, 0, 1), 4);
      }
    }

    function drawPlayer() {
      const key = S ? S.cat : api.getCat();
      if (S && S.over) {
        const t = P.deadT;
        drawCat(key, P.x, P.y + 14, CAT_H, 'hit', P.facing, { rot: Math.min(t * 6, Math.PI * 0.15) * P.facing, alpha: Math.max(0.3, 1 - t * 0.3) });
        return;
      }
      shadow(P.x, P.y + 13, 19, 5);
      const pose = catPose(key, P.moving, P.walkT, P.stillT);
      let alpha = 1;
      if (P.iframe > 0 && Math.floor(P.iframe * 14) % 2 === 0) alpha = 0.45;
      const squash = P.moving ? Math.sin(P.walkT * Math.PI) * 0.025 : Math.sin(S.time * 2.2) * 0.012;
      drawCat(key, P.x, P.y + 14, CAT_H, pose, P.facing, { alpha, squash });
      if (S.frenzy > 0) {
        ctx.strokeStyle = `rgba(126,224,126,${0.4 + 0.3 * Math.sin(S.time * 12)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(P.x, P.y + 13, 22, 7, 0, 0, TAU); ctx.stroke();
      }
    }

    function drawKittens() {
      const key = S.cat === 'mallow' ? 'mischko' : 'mallow';
      for (const k of kittens) {
        shadow(k.x, k.y + 8, 11, 3, 0.2);
        let pose;
        if (k.state === 'jump') pose = 'jump';
        else pose = k.moving ? 'walking_' + (1 + Math.floor(k.walkT) % 4) : 'idle';
        if (!sprites[key] || !sprites[key][pose]) pose = 'idle';
        drawCat(key, k.x, k.y + 9 - (k.z || 0), KITTEN_H, pose, k.facing);
      }
    }

    function drawProjs() {
      for (const p of projs) {
        if (!p.launched) continue;
        switch (p.kind) {
          case 'fish': {
            const it = art.item.fishbone;
            drawSprite(it.c, it.size, p.x, p.y, Math.atan2(p.vy, p.vx), 0.9);
            break;
          }
          case 'sushi': {
            const it = art.item.sushi;
            drawSprite(it.c, it.size, p.x, p.y, p.spin, 1);
            break;
          }
          case 'bottle': {
            const it = art.item.bottle;
            shadow(p.x, p.y + 6, 6, 2, 0.15);
            drawSprite(it.c, it.size, p.x, p.y - p.z, p.spin, 0.9);
            break;
          }
          case 'lob': {
            const it = art.item.hairball;
            shadow(p.x, p.y + 4, 7 * (p.big ? 1.5 : 1), 2.5, 0.2);
            drawSprite(it.c, it.size, p.x, p.y - p.z, p.spin, p.big ? 1.5 : 1);
            break;
          }
          case 'boomer': {
            const it = art.item.toymouse;
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(P.x, P.y - 6); ctx.lineTo(p.x, p.y); ctx.stroke();
            drawSprite(it.c, it.size, p.x, p.y, p.spin, p.scale * (p.src === 'stampede' ? 1.15 : 1));
            break;
          }
          case 'laser': {
            const col = p.disco ? `hsla(${p.hue},100%,60%,` : 'rgba(255,40,60,';
            ctx.lineCap = 'round';
            for (let i = 2; i < p.trail.length; i += 2) {
              const a = i / p.trail.length;
              ctx.strokeStyle = col + (a * 0.6) + ')';
              ctx.lineWidth = p.r * 1.3 * a;
              ctx.beginPath();
              ctx.moveTo(p.trail[i - 2], p.trail[i - 1]);
              ctx.lineTo(p.trail[i], p.trail[i + 1]);
              ctx.stroke();
            }
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.6);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.3, col + '0.95)');
            g.addColorStop(1, col + '0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.6, 0, TAU); ctx.fill();
            break;
          }
          default: break;
        }
      }
    }

    function drawYarn() {
      const colors = ['#ff7aa8', '#7ac6ff', '#ffd34d', '#9be879', '#c39bff', '#ff9f5a'];
      for (const w of S.weapons) {
        if (w.id !== 'yarn' && w.id !== 'galaxy') continue;
        if (w.grow <= 0) continue;
        const s = w.s;
        const R = 58 * s.area * (0.4 + 0.6 * w.grow);
        const br = 8 * Math.sqrt(s.area) * w.grow;
        for (let i = 0; i < s.amount; i++) {
          const a = w.rot + i * TAU / s.amount;
          const x = P.x + Math.cos(a) * R, y = P.y + Math.sin(a) * R;
          const col = colors[i % colors.length];
          if (w.id === 'galaxy') {
            const g = ctx.createRadialGradient(x, y, 0, x, y, br * 2.4);
            g.addColorStop(0, col + 'aa');
            g.addColorStop(1, col + '00');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, br * 2.4, 0, TAU); ctx.fill();
          }
          // trailing thread
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(P.x, P.y, R, a - 0.5, a - 0.05);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = col;
          ctx.strokeStyle = '#2a1a14';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, br, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 0.9;
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(x, y, br * 0.75, a * 2 + k * 2.1, a * 2 + k * 2.1 + 1.6);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath(); ctx.arc(x, y, br * 0.4, -a, -a + 2); ctx.stroke();
        }
      }
    }

    function drawEffects() {
      for (const f of effects) {
        if (f.delay > 0) continue;
        const u = f.t / f.life;
        if (f.kind === 'slash') {
          const sweep = Math.min(1, u * 2.2);
          const alpha = 1 - u * u;
          const a0 = f.ang - 1.05;
          const a1 = a0 + 2.1 * (1 - Math.pow(1 - sweep, 3));
          const outer = f.evo ? 'rgba(120,200,255,' : 'rgba(255,120,150,';
          for (let k = 0; k < 3; k++) {
            const r = f.r * (0.62 + k * 0.17);
            ctx.lineCap = 'round';
            ctx.strokeStyle = outer + (alpha * 0.35) + ')';
            ctx.lineWidth = 7;
            ctx.beginPath(); ctx.arc(P.x, P.y, r, a0 + k * 0.06, a1 + k * 0.06); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.arc(P.x, P.y, r, a0 + k * 0.06, a1 + k * 0.06); ctx.stroke();
          }
        } else if (f.kind === 'ring') {
          ctx.strokeStyle = f.color + (1 - u) * 0.8 + ')';
          ctx.lineWidth = f.width * (1 - u) + 0.5;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * Math.sqrt(u)), 0, TAU); ctx.stroke();
        } else if (f.kind === 'bolt') {
          const a = 1 - u;
          for (const [lw, col] of [[6, `rgba(120,200,255,${a * 0.5})`], [2, `rgba(255,255,255,${a})`]]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = lw;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(f.pts[0], f.pts[1]);
            for (let i = 2; i < f.pts.length; i += 2) ctx.lineTo(f.pts[i], f.pts[i + 1]);
            ctx.stroke();
          }
        } else if (f.kind === 'die') {
          const sp = art.enemy[f.type];
          const fi = f.frame % sp.frames.length;
          ctx.save();
          ctx.globalAlpha = 1 - u;
          ctx.translate(f.x, f.y);
          ctx.rotate(f.ang);
          const s = sp.size * f.scale * (1 + u * 0.35);
          ctx.scale(1, 1 - u * 0.7);
          ctx.drawImage(u < 0.4 ? sp.flashes[fi] : sp.frames[fi], -s, -s, s * 2, s * 2);
          ctx.restore();
        }
      }
    }

    function drawParticles() {
      for (const q of parts) {
        const a = 1 - q.t / q.life;
        if (q.kind === 'puff') {
          ctx.fillStyle = q.c + (a * 0.6) + ')';
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 + (1 - a) * 0.8), 0, TAU); ctx.fill();
        } else if (q.kind === 'spark') {
          ctx.strokeStyle = q.c;
          ctx.globalAlpha = a;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = q.c.startsWith('rgba') ? q.c + '1)' : q.c;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.5 + a * 0.5), 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawEnemyShots() {
      for (const b of eshots) {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,200,0,0.35)';
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a1f1a';
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -2.5); ctx.lineTo(-5, 2.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    function drawTexts() {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const t of texts) {
        const u = t.t / t.life;
        const pop = t.t < 0.08 ? 0.6 + t.t / 0.08 * 0.6 : 1.2 - Math.min(0.2, (t.t - 0.08) * 2);
        const size = (t.kind === 'crit' ? 14 : t.kind === 'hurt' ? 13 : t.kind === 'coin' || t.kind === 'heal' ? 11 : 10) * pop;
        ctx.font = `700 ${size.toFixed(1)}px Fredoka, system-ui, sans-serif`;
        ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(30,15,20,0.8)';
        const label = t.kind === 'crit' ? t.v + '!' : String(t.v);
        ctx.strokeText(label, t.x, t.y);
        ctx.fillStyle = t.kind === 'crit' ? '#ffd34d' : t.kind === 'hurt' ? '#ff5d73' : t.kind === 'heal' ? '#7ee0a8' : t.kind === 'coin' ? '#ffe28a' : '#fff';
        ctx.fillText(label, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }

    function drawHpBar() {
      if (S.over) return;
      const w = 34, x = P.x - w / 2, y = P.y + 19;
      const f = clamp(P.hp / S.st.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(20,10,20,0.55)';
      ctx.fillRect(x - 1, y - 1, w + 2, 6);
      ctx.fillStyle = f < 0.3 ? '#ff5d73' : '#7ee07e';
      ctx.fillRect(x, y, w * f, 4);
    }

    function lightLevel() {
      // 0 = bright day, 1 = deepest night
      const t = (S ? S.time : lobbyT) % DAY_CYCLE / DAY_CYCLE;
      if (t < 0.3) return { night: 0, dusk: 0 };
      if (t < 0.45) { const u = (t - 0.3) / 0.15; return { night: u * 0.4, dusk: Math.sin(u * Math.PI) }; }
      if (t < 0.8) return { night: 0.4 + Math.min(1, (t - 0.45) / 0.1) * 0.25, dusk: 0 };
      const u = (t - 0.8) / 0.2;
      return { night: 0.65 * (1 - u), dusk: Math.sin(u * Math.PI) * 0.6 };
    }

    function drawLighting() {
      const L = lightLevel();
      const px = (P.x - cam.x) * cam.scale, py = (P.y - cam.y) * cam.scale;
      if (L.dusk > 0.01) {
        ctx.fillStyle = `rgba(255,120,50,${L.dusk * 0.13})`;
        ctx.fillRect(0, 0, view.cssW, view.cssH);
      }
      if (L.night > 0.01) {
        const R = Math.max(view.cssW, view.cssH);
        const g = ctx.createRadialGradient(px, py, 50 * cam.scale, px, py, R * 0.75);
        g.addColorStop(0, `rgba(10,14,48,${L.night * 0.15})`);
        g.addColorStop(0.4, `rgba(10,14,48,${L.night * 0.7})`);
        g.addColorStop(1, `rgba(8,10,36,${L.night})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, view.cssW, view.cssH);
        // fireflies
        const n = Math.round(L.night * 26);
        for (let i = 0; i < n; i++) {
          const fx = ((hash(i, 7) % 1000) / 1000 * view.cssW + Math.sin((S ? S.time : lobbyT) * 0.4 + i) * 30 - (cam.x * cam.scale * 0.3) % view.cssW + view.cssW) % view.cssW;
          const fy = ((hash(i, 3) % 1000) / 1000 * view.cssH + Math.cos((S ? S.time : lobbyT) * 0.5 + i * 2) * 24 - (cam.y * cam.scale * 0.3) % view.cssH + view.cssH) % view.cssH;
          const tw = 0.5 + 0.5 * Math.sin((S ? S.time : lobbyT) * 3 + i * 1.7);
          ctx.fillStyle = `rgba(230,255,140,${0.25 + tw * 0.6 * L.night})`;
          ctx.beginPath(); ctx.arc(fx, fy, 1.5 + tw, 0, TAU); ctx.fill();
        }
      }
    }

    function drawOverlays() {
      screenTransform();
      drawLighting();
      if (!S) return;
      const low = !S.over && P.hp < S.st.maxHp * 0.3;
      const hurt = S.hurtFlash || 0;
      if (low || hurt > 0) {
        const a = Math.max(low ? 0.28 + 0.12 * Math.sin(S.time * 6) : 0, hurt * 1.2);
        const R = Math.max(view.cssW, view.cssH);
        const g = ctx.createRadialGradient(view.cssW / 2, view.cssH / 2, R * 0.3, view.cssW / 2, view.cssH / 2, R * 0.75);
        g.addColorStop(0, 'rgba(255,40,60,0)');
        g.addColorStop(1, `rgba(255,40,60,${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, view.cssW, view.cssH);
      }
      if (S.flash > 0) {
        ctx.fillStyle = `rgba(255,245,210,${S.flash * 0.7})`;
        ctx.fillRect(0, 0, view.cssW, view.cssH);
      }
      // arrows pointing to bosses and boxes that are off screen
      const targets = [];
      for (const e of enemies) if ((e.boss || e.elite) && !e.dead) targets.push([e.x, e.y, e.boss ? '#ff5d73' : '#ffd34d']);
      for (const p of pickups) if (p.kind === 'box') targets.push([p.x, p.y, '#ffb454']);
      for (const [x, y, col] of targets) {
        if (onScreen(x, y, -10)) continue;
        const sx = (x - cam.x) * cam.scale, sy = (y - cam.y) * cam.scale;
        const cx = view.cssW / 2, cy = view.cssH / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const m = 26;
        const top = 96;
        const ex = clamp(sx, m, view.cssW - m), ey = clamp(sy, top, view.cssH - m);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(30,15,20,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.closePath();
        ctx.stroke(); ctx.fill();
        ctx.restore();
      }
      // floating joystick
      if (joy && !S.over) {
        const max = joyMax();
        const dx = joy.cx - joy.sx, dy = joy.cy - joy.sy;
        const l = Math.hypot(dx, dy);
        const k = l > max ? max / l : 1;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(joy.sx, joy.sy, max, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(joy.sx + dx * k, joy.sy + dy * k, max * 0.42, 0, TAU); ctx.fill();
      }
    }

    function render() {
      screenTransform();
      ctx.fillStyle = '#79b957';
      ctx.fillRect(0, 0, view.cssW, view.cssH);
      worldTransform();
      drawGround();
      if (mode === 'lobby') {
        shadow(P.x, P.y + 13, 19, 5);
        drawCat(api.getCat(), P.x, P.y + 14, CAT_H, 'walking_' + (1 + Math.floor(P.walkT) % 4), 1);
        drawOverlays();
        return;
      }
      drawPuddles();
      drawAuras();
      drawPickups();
      drawTelegraphs();
      enemies.sort((a, b) => a.y - b.y);
      let playerDrawn = false;
      for (const e of enemies) {
        if (e.def.fly) continue;
        if (!playerDrawn && e.y > P.y) { drawKittens(); drawPlayer(); playerDrawn = true; }
        if (onScreen(e.x, e.y, e.def.size * 2)) drawEnemy(e);
      }
      if (!playerDrawn) { drawKittens(); drawPlayer(); }
      for (const e of enemies) if (e.def.fly && onScreen(e.x, e.y, e.def.size * 2)) drawEnemy(e);
      drawHpBar();
      drawYarn();
      drawProjs();
      drawEffects();
      drawParticles();
      drawEnemyShots();
      drawTexts();
      drawOverlays();
    }

    function updateCamera(dt) {
      cam.shake = Math.max(0, cam.shake - dt * 30);
      const sx = cam.shake ? rand(-1, 1) * cam.shake * 0.6 : 0;
      const sy = cam.shake ? rand(-1, 1) * cam.shake * 0.6 : 0;
      cam.x = P.x - cam.w / 2 + sx;
      cam.y = P.y - cam.h / 2 + sy;
    }

    // -------------------------------------------------------------------------
    // HUD
    // -------------------------------------------------------------------------
    const hud = {};
    function setHud(id, text) {
      if (hud[id] !== text) { hud[id] = text; $(id).textContent = text; }
    }

    function updateHud() {
      const pct = (S.xp / S.xpNext * 100).toFixed(1) + '%';
      if (hud.xp !== pct) { hud.xp = pct; $('sv-xp-fill').style.width = pct; }
      setHud('sv-lv', 'Lv ' + S.level);
      setHud('sv-time', api.formatTime(S.time, false));
      setHud('sv-kills', String(S.kills));
      setHud('sv-coins', String(S.coins));
      const b = S.boss && !S.boss.dead ? S.boss : null;
      const bossKey = b ? b.type : '';
      if (hud.boss !== bossKey) {
        hud.boss = bossKey;
        $('sv-boss').classList.toggle('hidden', !b);
        if (b) $('sv-boss-name').textContent = b.def.name;
      }
      if (b) {
        const f = (clamp(b.hp / b.maxHp, 0, 1) * 100).toFixed(1) + '%';
        if (hud.bossHp !== f) { hud.bossHp = f; $('sv-boss-fill').style.width = f; }
      }
    }

    function refreshSlots() {
      const box = $('sv-slots');
      let html = '<div class="sv-slot-row">';
      for (const w of S.weapons) {
        const d = W[w.id];
        const lv = d.evolved ? '★' : w.level;
        html += '<span class="sv-slot' + (d.evolved ? ' evo' : '') + '">' + d.icon + '<b>' + lv + '</b></span>';
      }
      html += '</div><div class="sv-slot-row small">';
      for (const p of S.passives) html += '<span class="sv-slot">' + PS[p.id].icon + '<b>' + p.level + '</b></span>';
      html += '</div>';
      box.innerHTML = html;
    }

    // -------------------------------------------------------------------------
    // Screens
    // -------------------------------------------------------------------------
    const SV_SCREENS = ['sv-lobby', 'sv-levelup', 'sv-chest', 'sv-pause', 'sv-over'];
    function showSv(id) {
      for (const s of SV_SCREENS) $(s).classList.toggle('hidden', s !== id);
    }

    function catName() {
      const c = api.CATS[api.getCat()];
      return c ? c.name : 'Cat';
    }

    function openLobby() {
      mode = 'lobby';
      S = null;
      joy = null;
      P.x = 0; P.y = 0; P.walkT = 0;
      api.showScreen(null);
      $('sv-hud').classList.add('hidden');
      renderLobby();
      showSv('sv-lobby');
      api.setPlaylist(MUSIC);
    }

    function renderLobby() {
      const key = api.getCat();
      const ch = SV.CHARACTERS[key];
      const cat = api.CATS[key];
      $('sv-lobby-img').src = cat.dir + cat.prefix + 'idle.png';
      $('sv-lobby-img').alt = cat.name;
      $('sv-lobby-name').textContent = cat.name;
      $('sv-lobby-perks').innerHTML = '';
      for (const p of ch.perks) {
        const li = document.createElement('li');
        li.textContent = p;
        $('sv-lobby-perks').appendChild(li);
      }
      const best = getBest();
      $('sv-records').innerHTML = best
        ? '<div><span class="stat-val">' + api.formatTime(best.time, false) + '</span><span class="stat-label">Best time</span></div>' +
          '<div><span class="stat-val">' + best.kills + '</span><span class="stat-label">Critters</span></div>' +
          '<div><span class="stat-val">' + best.level + '</span><span class="stat-label">Level</span></div>'
        : '<div class="sv-norecord">No hunts yet. How long can you last?</div>';
      const bank = getBank();
      $('sv-bank').textContent = '💰 ' + bank;
      const meta = getMeta();
      const tree = $('sv-tree');
      tree.innerHTML = '';
      for (const [id, m] of Object.entries(SV.META)) {
        const lvl = meta[id] || 0;
        const maxed = lvl >= m.max;
        const cost = m.cost * (lvl + 1);
        const b = document.createElement('button');
        b.className = 'sv-tree-item' + (maxed ? ' maxed' : '');
        b.disabled = maxed || bank < cost;
        let pips = '';
        for (let i = 0; i < m.max; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
        b.innerHTML = '<span class="sv-tree-icon">' + m.icon + '</span>' +
          '<span class="sv-tree-body"><span class="sv-tree-name"></span><span class="sv-tree-text"></span><span class="sv-pips">' + pips + '</span></span>' +
          '<span class="sv-tree-cost">' + (maxed ? 'MAX' : '💰 ' + cost) + '</span>';
        b.querySelector('.sv-tree-name').textContent = m.name;
        b.querySelector('.sv-tree-text').textContent = m.text;
        b.addEventListener('click', () => {
          const bk = getBank();
          const mt = getMeta();
          const l = mt[id] || 0;
          const c = m.cost * (l + 1);
          if (l >= m.max || bk < c) return;
          mt[id] = l + 1;
          store.set('sv.meta', mt);
          store.set('sv.coins', bk - c);
          sfx.coin();
          renderLobby();
        });
        tree.appendChild(b);
      }
    }

    function start() {
      const cat = api.getCat();
      S = {
        cat, time: 0, kills: 0, level: 1, xp: 0, xpNext: xpNeed(1), pendingLevels: 0, luDelay: 0,
        coins: 0, weapons: [], passives: [], st: null, options: [],
        paused: false, modal: null, over: false, overT: 0, resultsShown: false,
        spawnAcc: 0, nextElite: 50, nextBoss: SV.BOSS_EVERY, bossIdx: 0, bossCount: 0, bossWarned: false,
        eventIdx: 0, nextEvent: SV.EVENTS[0].at, boss: null,
        potT: 0.5, mergeT: 2, frenzy: 0, dmgBy: {}, flash: 0, hurtFlash: 0, slowmo: 0,
        rerolls: 0, revives: 0,
      };
      const meta = getMeta();
      S.rerolls = 2 + (meta.reroll || 0);
      S.revives = meta.revive || 0;
      enemies = []; projs = []; pickups = []; effects = []; parts = []; texts = []; puddles = []; kittens = []; eshots = [];
      Object.assign(P, { x: 0, y: 0, aimX: 1, aimY: 0, facing: 1, walkT: 0, stillT: 0, moving: false, iframe: 0, deadT: 0 });
      computeStats();
      P.hp = S.st.maxHp;
      addWeapon(SV.CHARACTERS[cat].weapon);
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.6;
        spawnEnemy('pot', Math.cos(a) * rand(140, 220), Math.sin(a) * rand(160, 260));
      }
      mode = 'run';
      joy = null;
      for (const k in hud) delete hud[k];
      refreshSlots();
      showSv(null);
      api.showScreen(null);
      $('sv-hud').classList.remove('hidden');
      $('sv-hint').classList.remove('fade');
      setTimeout(() => $('sv-hint').classList.add('fade'), 3500);
      syncSoundBtn();
      api.setPlaylist(MUSIC);
      updateCamera(0);
      banner('Survive the critters!', 'event');
    }

    function pause() {
      if (mode !== 'run' || !S || S.over || S.modal || S.paused) return;
      S.paused = true;
      joy = null;
      const build = $('sv-build');
      build.innerHTML = '';
      for (const w of S.weapons) {
        const d = W[w.id];
        const el = document.createElement('div');
        el.className = 'sv-build-item' + (d.evolved ? ' evo' : '');
        el.innerHTML = '<span class="sv-card-icon"></span><span class="sv-card-body"><span class="sv-card-name"></span><span class="sv-card-desc"></span></span>';
        el.querySelector('.sv-card-icon').textContent = d.icon;
        el.querySelector('.sv-card-name').textContent = d.name + (d.evolved ? ' ★' : ' Lv ' + w.level);
        el.querySelector('.sv-card-desc').textContent = d.evoWith && !d.evolved ? 'Evolves at Lv 8 with ' + PS[d.evoWith].icon + ' ' + PS[d.evoWith].name : d.desc;
        build.appendChild(el);
      }
      for (const p of S.passives) {
        const d = PS[p.id];
        const el = document.createElement('div');
        el.className = 'sv-build-item passive';
        el.innerHTML = '<span class="sv-card-icon"></span><span class="sv-card-body"><span class="sv-card-name"></span><span class="sv-card-desc"></span></span>';
        el.querySelector('.sv-card-icon').textContent = d.icon;
        el.querySelector('.sv-card-name').textContent = d.name + ' Lv ' + p.level;
        el.querySelector('.sv-card-desc').textContent = d.text;
        build.appendChild(el);
      }
      const st = S.st;
      const pct = (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
      const rows = [
        ['Health', Math.ceil(P.hp) + ' / ' + Math.round(st.maxHp)], ['Damage', pct(st.might - 1)], ['Armor', st.armor],
        ['Speed', pct(st.speed - 1)], ['Cooldown', pct(st.cooldown - 1)], ['Area', pct(st.area - 1)],
        ['Pickup range', pct(st.magnet - 1)], ['Luck', pct(st.luck)], ['Regen', st.regen.toFixed(1) + '/s'],
        ['Rerolls', S.rerolls], ['Revives', S.revives],
      ];
      $('sv-stats').innerHTML = rows.map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('');
      showSv('sv-pause');
    }

    function resume() {
      if (!S) return;
      S.paused = false;
      showSv(null);
    }

    function showResults() {
      S.resultsShown = true;
      const earned = Math.round((S.coins + Math.floor(S.time / 20)) * S.st.greed);
      store.set('sv.coins', getBank() + earned);
      const best = getBest();
      const isBest = !best || S.time > best.time;
      if (isBest) store.set('sv.best', { time: S.time, kills: S.kills, level: S.level, cat: S.cat });
      const cat = api.CATS[S.cat];
      $('sv-over-img').src = cat.dir + cat.prefix + 'sitting.png';
      $('sv-over-title').textContent = S.time >= 900 ? 'Legendary hunt!' : S.time >= 600 ? 'What a hunt!' : S.time >= 300 ? 'Good hunt!' : 'Caught by critters';
      $('sv-o-time').textContent = api.formatTime(S.time, false);
      $('sv-o-level').textContent = S.level;
      $('sv-o-kills').textContent = S.kills;
      $('sv-o-coins').textContent = '+' + earned + ' 💰 fish coins' + (S.st.greed > 1 ? ' (incl. Piggy Bank bonus)' : '');
      $('sv-o-best').textContent = isBest ? 'New best time!' : 'Best: ' + api.formatTime(best.time, false);
      const entries = Object.entries(S.dmgBy).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      const top = entries.length ? entries[0][1] : 1;
      $('sv-o-dmg').innerHTML = entries.map(([id, v]) => {
        const d = W[id];
        const icon = d ? d.icon : '🙀';
        const name = d ? d.name : 'Big Hiss';
        return '<div class="sv-dmg-row"><span class="sv-dmg-icon">' + icon + '</span><span class="sv-dmg-name">' + name +
          '</span><span class="sv-dmg-bar"><i style="width:' + (v / top * 100).toFixed(1) + '%"></i></span><b>' + Math.round(v).toLocaleString() + '</b></div>';
      }).join('');
      showSv('sv-over');
    }

    function exit() {
      mode = 'off';
      S = null;
      joy = null;
      showSv(null);
      $('sv-hud').classList.add('hidden');
      api.toLevels();
    }

    function refreshCard() {
      const best = getBest();
      const el = $('best-sv');
      if (el) el.textContent = best ? 'Best: ' + api.formatTime(best.time, false) : 'Not played yet';
    }

    function syncSoundBtn() {
      const b = $('sv-btn-sound');
      b.classList.toggle('muted', audio.muted);
    }

    // -------------------------------------------------------------------------
    // Input
    // -------------------------------------------------------------------------
    function joyMax() {
      return clamp(Math.min(view.cssW, view.cssH) * 0.12, 38, 60);
    }

    function inRun() {
      return mode === 'run' && S && !S.paused && !S.modal && !S.over;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!inRun() || joy) return;
      e.preventDefault();
      joy = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!joy || e.pointerId !== joy.id) return;
      joy.cx = e.clientX;
      joy.cy = e.clientY;
      // drag the base along when the finger goes past the edge
      const max = joyMax();
      const dx = joy.cx - joy.sx, dy = joy.cy - joy.sy, l = Math.hypot(dx, dy);
      if (l > max * 1.4) {
        joy.sx = joy.cx - dx / l * max * 1.4;
        joy.sy = joy.cy - dy / l * max * 1.4;
      }
    });
    const endJoy = (e) => { if (joy && e.pointerId === joy.id) joy = null; };
    canvas.addEventListener('pointerup', endJoy);
    canvas.addEventListener('pointercancel', endJoy);

    window.addEventListener('keydown', (e) => {
      if (mode !== 'run') return;
      keys[e.code] = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
      if (e.key === 'Escape' || e.key === 'p') { if (S && S.paused) resume(); else pause(); }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    $('sv-btn-pause').addEventListener('click', pause);
    $('sv-btn-sound').addEventListener('click', () => { api.setMuted(!audio.muted); syncSoundBtn(); });
    $('sv-resume').addEventListener('click', resume);
    $('sv-giveup').addEventListener('click', () => {
      if (!S) return;
      S.paused = false;
      showSv(null);
      P.hp = 0;
      S.revives = 0;
      playerDown();
    });
    $('sv-start').addEventListener('click', start);
    $('sv-lobby-back').addEventListener('click', exit);
    $('sv-reroll').addEventListener('click', () => {
      if (!S || S.modal !== 'levelup' || S.rerolls <= 0) return;
      S.rerolls--;
      sfx.pick();
      S.options = rollOptions();
      renderCards();
    });
    $('sv-skip').addEventListener('click', () => {
      if (!S || S.modal !== 'levelup') return;
      S.pendingLevels--;
      heal(10);
      if (S.pendingLevels > 0) { S.options = rollOptions(); renderCards(); } else closeModal();
    });
    $('sv-chest-ok').addEventListener('click', () => {
      if (!S || S.modal !== 'chest') return;
      closeModal();
      if (S.pendingLevels > 0) S.luDelay = 0.15;
    });
    $('sv-again').addEventListener('click', start);
    $('sv-over-lobby').addEventListener('click', openLobby);
    $('sv-over-levels').addEventListener('click', exit);

    // -------------------------------------------------------------------------
    // Frame (called by the main loop while this mode is active)
    // -------------------------------------------------------------------------
    const prof = { update: 0, render: 0, frames: 0 };
    function frame(dt) {
      const t0 = performance.now();
      frameInner(dt);
      prof.frames++;
      prof.render += performance.now() - t0;
    }

    function frameInner(dt) {
      resizeView();
      if (mode === 'lobby') {
        lobbyT += dt;
        P.walkT += dt * 8;
        P.x += dt * 40;
        cam.x = P.x - cam.w / 2;
        cam.y = P.y - cam.h * 0.62;
      } else if (mode === 'run' && S) {
        if (!S.paused && !S.modal) {
          let scale = 1;
          if (S.slowmo > 0) { S.slowmo -= dt; scale = 0.35; }
          let t = dt * scale;
          const u0 = performance.now();
          while (t > 1e-6) {
            const h = Math.min(t, 1 / 60);
            update(h);
            t -= h;
          }
          prof.update += performance.now() - u0;
          updateCamera(dt);
        }
        if (!S.over) updateHud();
      }
      render();
    }

    return {
      get active() { return mode !== 'off'; },
      frame,
      openLobby,
      refreshCard,
      debug: {
        prof, keys, rollOptions, chooseOption, closeChest: () => $('sv-chest-ok').click(),
        tick(dt) { update(dt); updateCamera(dt); },
        get S() { return S; }, P, get pickups() { return pickups; }, get enemies() { return enemies; }, spawnEnemy, gainXp, openChest: (b) => openChest(b) },
    };
  };
})();
