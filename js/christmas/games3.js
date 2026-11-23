// Advent calendar minigames 13-18
(() => {
  'use strict';
  const XM = (window.XM = window.XM || { games: {} });
  const TAU = Math.PI * 2;

  function hslHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
    return '#' + f(0) + f(8) + f(4);
  }

  // 13 · Ice Skating: glide over the frozen pond and collect 8 stars
  XM.games[13] = {
    icon: '⛸️', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 8;
      const pond = () => ({ x: env.w / 2, y: env.h * 0.6, rx: env.w * 0.42, ry: Math.min(env.h * 0.27, env.w * 0.42) });
      const p0 = pond();
      const cat = { x: p0.x, y: p0.y, vx: 0, vy: 0, facing: 1, walkT: 0 };
      let target = null, got = 0;
      const stars = [];
      for (let i = 0; i < GOAL; i++) {
        const a = rand(0, TAU), d = Math.sqrt(rand(0.15, 0.85));
        stars.push({ fx: Math.cos(a) * d, fy: Math.sin(a) * d, got: false, p: rand(0, TAU) });
      }
      return {
        update(dt) {
          const p = pond();
          if (target) {
            const dx = target[0] - cat.x, dy = target[1] - cat.y, d = Math.hypot(dx, dy) || 1;
            cat.vx += dx / d * 520 * dt; cat.vy += dy / d * 520 * dt;
          }
          cat.vx *= Math.exp(-0.9 * dt); cat.vy *= Math.exp(-0.9 * dt);
          const sp = Math.hypot(cat.vx, cat.vy);
          if (sp > 330) { cat.vx *= 330 / sp; cat.vy *= 330 / sp; }
          cat.x += cat.vx * dt; cat.y += cat.vy * dt;
          // stay on the ice: bounce off the edge of the ellipse
          const ex = (cat.x - p.x) / (p.rx * 0.9), ey = (cat.y - p.y) / (p.ry * 0.9);
          const e = Math.hypot(ex, ey);
          if (e > 1) {
            cat.x = p.x + ex / e * p.rx * 0.9; cat.y = p.y + ey / e * p.ry * 0.9;
            const nx = ex / e, ny = ey / e, dot = cat.vx * nx + cat.vy * ny;
            if (dot > 0) { cat.vx -= 1.6 * dot * nx; cat.vy -= 1.6 * dot * ny; }
          }
          if (Math.abs(cat.vx) > 10) cat.facing = Math.sign(cat.vx);
          cat.walkT += dt * Math.min(6, sp / 50);
          for (const s of stars) {
            if (s.got) continue;
            const sx = p.x + s.fx * p.rx * 0.85, sy = p.y + s.fy * p.ry * 0.85;
            if (Math.hypot(sx - cat.x, sy - (cat.y - env.u * 6)) < env.u * 9) {
              s.got = true; got++;
              env.sfx.pickup(); env.sparkle(sx, sy, '#bfe9ff');
              if (got >= GOAL) env.win();
            }
          }
          if (Math.random() < sp / 900) env.burst(cat.x, cat.y, 1, 'rgba(255,255,255,0.8)', 30, { life: 0.6 });
          env.progress(got, GOAL);
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.38);
          const p = pond();
          const g = ctx.createRadialGradient(p.x - p.rx * 0.3, p.y - p.ry * 0.3, 10, p.x, p.y, p.rx);
          g.addColorStop(0, '#e8f7ff'); g.addColorStop(1, '#8fc6ea');
          ctx.fillStyle = '#d9e8f7'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, p.rx + 12, p.ry + 12, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
          for (const [a, b] of [[0.2, 0.9], [2.4, 3.1], [4.2, 4.9]]) { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx * 0.6, p.ry * 0.5, 0, a, b); ctx.stroke(); }
          for (const s of stars) {
            if (s.got) continue;
            const sx = p.x + s.fx * p.rx * 0.85, sy = p.y + s.fy * p.ry * 0.85;
            art.star(ctx, sx, sy + Math.sin(env.t * 3 + s.p) * 3, env.u * 3.4, '#ffe066', env.t);
          }
          env.drawCat('walk', cat.x, cat.y, env.u * 17, { frame: cat.walkT, flip: cat.facing < 0 });
        },
        down(x, y) { target = [x, y]; },
        move(x, y) { target = [x, y]; },
        up() { target = null; },
      };
    },
  };

  // 14 · Chimney Delivery: drop gifts from the sleigh into 5 chimneys
  XM.games[14] = {
    icon: '🏠', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 5, SPEED = 120;
      let houses = [], gifts = [], delivered = 0, nextX = 0;
      const ground = () => env.h * 0.86;
      function addHouse() {
        const w = env.u * rand(24, 30), h = env.u * rand(16, 24);
        houses.push({ x: nextX, w, h, color: ['#b5553c', '#5b7fb5', '#7aa35b', '#c48a3c'][houses.length % 4], done: false });
        nextX += w + env.u * rand(18, 30);
      }
      nextX = env.w * 0.75;
      while (nextX < env.w * 2) addHouse();
      const chimney = (hs) => ({ x: hs.x + hs.w / 2 + hs.w * 0.22, y: ground() - hs.h - hs.h * 0.75, w: hs.w * 0.18 });
      const sleigh = () => ({ x: env.w * 0.3, y: env.top + env.u * 14 + Math.sin(env.t * 2) * 6 });
      return {
        update(dt) {
          const dx = SPEED * dt;
          for (const hs of houses) hs.x -= dx;
          nextX -= dx;
          while (nextX < env.w * 1.6) addHouse();
          houses = houses.filter((hs) => hs.x + hs.w > -80);
          for (const g of gifts) {
            g.vy += 900 * dt; g.y += g.vy * dt; g.x -= dx;
            if (g.done) continue;
            for (const hs of houses) {
              const c = chimney(hs);
              if (Math.abs(g.x - c.x) < c.w * 0.9 && g.y > c.y && g.y - g.vy * dt <= c.y) {
                g.done = true; g.gone = true; hs.done = true; delivered++;
                env.sfx.chest(); env.burst(c.x, c.y, 14, '#ffd23f', 160, { star: true, dir: -Math.PI / 2, spread: 0.8 });
                env.text(c.x, c.y - 20, '🎁', '#fff', 1.4);
                if (delivered >= GOAL) env.win();
              }
            }
            if (!g.done && g.y > ground() - env.u * 4) { g.done = true; g.gone = true; env.burst(g.x, ground(), 8, '#ffffff', 90); }
          }
          gifts = gifts.filter((g) => !g.gone);
          env.progress(delivered, GOAL);
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.86);
          for (const hs of houses) {
            const c = art.house(ctx, hs.x + hs.w / 2, ground(), hs.w, hs.h, hs.color);
            void c;
            if (hs.done) { ctx.fillStyle = 'rgba(255,220,120,0.5)'; ctx.beginPath(); ctx.arc(chimney(hs).x, chimney(hs).y - 6, env.u * 3, 0, TAU); ctx.fill(); }
          }
          for (const g of gifts) art.gift(ctx, g.x, g.y, env.u * 6, env.u * 5, '#d62839', '#ffd23f');
          const s = sleigh();
          // reindeer silhouette + sleigh
          ctx.fillStyle = '#7a4a28';
          ctx.beginPath(); ctx.ellipse(s.x + env.u * 22, s.y, env.u * 7, env.u * 3.5, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(s.x + env.u * 29, s.y - env.u * 3, env.u * 2.6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(s.x + env.u * 31.5, s.y - env.u * 2.6, env.u * 1, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#7a4a28'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(s.x + env.u * 28, s.y - env.u * 5); ctx.lineTo(s.x + env.u * 26, s.y - env.u * 9); ctx.moveTo(s.x + env.u * 30, s.y - env.u * 5); ctx.lineTo(s.x + env.u * 32, s.y - env.u * 9); ctx.stroke();
          ctx.strokeStyle = '#d9b36a'; ctx.beginPath(); ctx.moveTo(s.x + env.u * 8, s.y); ctx.lineTo(s.x + env.u * 16, s.y); ctx.stroke();
          env.drawCat('idle', s.x - env.u * 1, s.y - env.u * 1, env.u * 15);
          ctx.fillStyle = '#c0302a'; art.rr(ctx, s.x - env.u * 10, s.y - env.u * 4, env.u * 19, env.u * 7, env.u * 3); ctx.fill();
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(s.x - env.u * 11, s.y + env.u * 4); ctx.lineTo(s.x + env.u * 9, s.y + env.u * 4); ctx.quadraticCurveTo(s.x + env.u * 13, s.y + env.u * 4, s.x + env.u * 12, s.y); ctx.stroke();
        },
        down() {
          if (gifts.length >= 3) return;
          const s = sleigh();
          gifts.push({ x: s.x, y: s.y + env.u * 4, vy: 60 });
          env.sfx.whoosh();
        },
      };
    },
  };

  // 15 · Memory: find the 4 pairs
  XM.games[15] = {
    icon: '🃏',
    make(env) {
      const { ctx, art } = env;
      const KINDS = ['gift', 'bauble', 'star', 'bell'];
      const deck = [...KINDS, ...KINDS].sort(() => Math.random() - 0.5).map((k) => ({ k, open: false, done: false, flip: 0 }));
      let first = null, second = null, wait = 0, pairs = 0;
      const layout = () => {
        const cols = 4, rows = 2;
        const cw = Math.min((env.w - 50) / cols, ((env.h - env.top - 120) / rows) * 0.72);
        const ch = cw / 0.72;
        const x0 = env.w / 2 - (cols * cw + (cols - 1) * 12) / 2, y0 = env.h * 0.55 - (rows * ch + 12) / 2;
        return { cw, ch, pos: (i) => [x0 + (i % cols) * (cw + 12) + cw / 2, y0 + Math.floor(i / cols) * (ch + 12) + ch / 2] };
      };
      function drawFace(k, x, y, s) {
        if (k === 'gift') art.gift(ctx, x, y + s * 0.08, s * 0.7, s * 0.55, '#d62839', '#ffd23f');
        else if (k === 'bauble') art.bauble(ctx, x, y + s * 0.08, s * 0.3, '#3d6fd8');
        else if (k === 'star') art.star(ctx, x, y, s * 0.38, '#ffd23f');
        else art.bell(ctx, x, y, s * 0.6, 0, '#ffc93c');
      }
      return {
        update(dt) {
          for (const c of deck) c.flip += ((c.open || c.done ? 1 : 0) - c.flip) * Math.min(1, dt * 12);
          if (wait > 0) {
            wait -= dt;
            if (wait <= 0) { first.open = false; second.open = false; first = second = null; }
          }
          env.progress(pairs, KINDS.length);
        },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.9);
          const L = layout();
          deck.forEach((c, i) => {
            const [x, y] = L.pos(i);
            const sx = Math.abs(Math.cos(c.flip * Math.PI));
            const face = c.flip > 0.5;
            ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.04, sx), 1);
            art.rr(ctx, -L.cw / 2, -L.ch / 2, L.cw, L.ch, 10);
            ctx.fillStyle = face ? '#fff8ec' : '#2f6b45'; ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = c.done ? '#ffd23f' : '#e8d8b8'; ctx.stroke();
            if (face) drawFace(c.k, 0, 0, L.cw);
            else { art.snowflake(ctx, 0, 0, L.cw * 0.25, 0, 'rgba(255,255,255,0.7)'); }
            ctx.restore();
          });
          env.drawCat('sitting', env.w * 0.88, env.h * 0.96, env.u * 13);
        },
        down(x, y) {
          if (wait > 0) return;
          const L = layout();
          for (let i = 0; i < deck.length; i++) {
            const c = deck[i];
            const [cx, cy] = L.pos(i);
            if (c.open || c.done || Math.abs(x - cx) > L.cw / 2 || Math.abs(y - cy) > L.ch / 2) continue;
            c.open = true; env.sfx.pick();
            if (!first) { first = c; return; }
            second = c;
            if (first.k === second.k) {
              first.done = second.done = true; first = second = null; pairs++;
              env.sfx.note(660 + pairs * 110); env.sparkle(cx, cy, '#ffe066');
              if (pairs >= KINDS.length) env.win();
            } else wait = 0.75;
            return;
          }
        },
      };
    },
  };

  // 16 · Odd Ornament: tap the bauble that looks different (5 rounds)
  XM.games[16] = {
    icon: '🔴',
    make(env) {
      const { ctx, art, rand } = env;
      const DIFF = [70, 55, 45, 36, 30];
      let round = 0, odd = 0, base = 0, wobble = -1, wobbleT = 0, hue = 0;
      function setup() { odd = Math.floor(Math.random() * 9); base = rand(0, 360); hue = (base + DIFF[round] * (Math.random() < 0.5 ? 1 : -1) + 360) % 360; }
      setup();
      const pos = (i) => {
        const s = Math.min(env.w * 0.26, (env.h - env.top - 140) / 3);
        return [env.w / 2 + ((i % 3) - 1) * s, env.h * 0.52 + (Math.floor(i / 3) - 1) * s, s];
      };
      return {
        update(dt) { wobbleT = Math.max(0, wobbleT - dt); env.progress(round, DIFF.length); },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.9);
          for (let i = 0; i < 9; i++) {
            const [x, y, s] = pos(i);
            const dx = i === wobble && wobbleT > 0 ? Math.sin(wobbleT * 40) * 6 : 0;
            ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + dx, y - s * 0.55); ctx.lineTo(x + dx, y - s * 0.3); ctx.stroke();
            art.bauble(ctx, x + dx, y, s * 0.24, hslHex(i === odd ? hue : base, 72, 52));
          }
          env.drawCat('sitting', env.w * 0.12, env.h * 0.96, env.u * 13);
        },
        down(x, y) {
          for (let i = 0; i < 9; i++) {
            const [bx, by, s] = pos(i);
            if (Math.hypot(x - bx, y - by) > s * 0.4) continue;
            if (i === odd) {
              env.sfx.note(523 + round * 90); env.sparkle(bx, by, '#ffe066');
              round++;
              if (round >= DIFF.length) env.win(); else setup();
            } else { wobble = i; wobbleT = 0.4; env.sfx.rattle(); }
            return;
          }
        },
      };
    },
  };

  // 17 · Count the Presents: watch the gifts fall into the sack and pick the number (3 rounds)
  XM.games[17] = {
    icon: '🔢',
    make(env) {
      const { ctx, art } = env;
      const RANGES = [[3, 5], [4, 6], [5, 8]];
      let round = 0, n = 0, dropped = 0, dropT = 0, falling = [], choices = [], phase = 'drop', bad = -1, badT = 0;
      const COLORS = ['#d62839', '#2f9e4f', '#3d6fd8', '#9b5cf0', '#ff8a1f'];
      function setup(same) {
        if (!same) { const [a, b] = RANGES[round]; n = a + Math.floor(Math.random() * (b - a + 1)); }
        dropped = 0; dropT = 0.6; falling = []; phase = 'drop';
        const opts = new Set([n]);
        while (opts.size < 3) opts.add(Math.max(1, n + Math.floor(Math.random() * 5) - 2));
        choices = [...opts].sort((a, b) => a - b);
      }
      setup();
      const sack = () => [env.w / 2, env.h * 0.62, Math.min(env.u * 34, env.w * 0.4)];
      const btn = (i) => [env.w / 2 + (i - 1) * Math.min(env.u * 26, env.w * 0.28), env.h * 0.86, Math.min(env.u * 10, env.w * 0.11)];
      return {
        update(dt) {
          badT = Math.max(0, badT - dt);
          if (phase === 'drop') {
            dropT -= dt;
            if (dropT <= 0 && dropped < n) { dropT = 0.6; dropped++; falling.push({ x: env.w / 2 + (Math.random() - 0.5) * 40, y: env.top, vy: 0, c: COLORS[dropped % COLORS.length] }); }
            for (const g of falling) { g.vy += 1200 * dt; g.y += g.vy * dt; }
            const [, sy] = sack();
            falling = falling.filter((g) => { if (g.y > sy - env.u * 4) { env.sfx.pick(); return false; } return true; });
            if (dropped >= n && !falling.length && dropT <= 0) phase = 'ask';
          }
          env.info(phase === 'ask' ? env.tr('xm.howMany') + ' · ' + (round + 1) + ' / 3' : (round + 1) + ' / 3');
        },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.8);
          const [sx, sy, ss] = sack();
          for (const g of falling) art.gift(ctx, g.x, g.y, env.u * 9, env.u * 8, g.c, '#ffd23f');
          art.sack(ctx, sx, sy, ss);
          if (phase === 'ask') {
            choices.forEach((c, i) => {
              const [bx, by, r] = btn(i);
              const dx = i === bad && badT > 0 ? Math.sin(badT * 40) * 6 : 0;
              ctx.fillStyle = '#fff8ec'; ctx.beginPath(); ctx.arc(bx + dx, by, r, 0, TAU); ctx.fill();
              ctx.lineWidth = 4; ctx.strokeStyle = '#d62839'; ctx.stroke();
              ctx.fillStyle = '#7a1f2b'; ctx.font = `700 ${Math.round(r * 1.1)}px Fredoka, sans-serif`;
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c), bx + dx, by + 2);
            });
          }
          env.drawCat('sitting', env.w * 0.14, env.h * 0.8 + 4, env.u * 14);
        },
        down(x, y) {
          if (phase !== 'ask') return;
          choices.forEach((c, i) => {
            const [bx, by, r] = btn(i);
            if (Math.hypot(x - bx, y - by) > r * 1.2) return;
            if (c === n) {
              env.sfx.note(659 + round * 100); env.sparkle(bx, by, '#ffe066');
              round++;
              if (round >= RANGES.length) { env.win(); phase = 'end'; } else { env.say(env.tr('xm.great'), '#9be879'); setup(); }
            } else { bad = i; badT = 0.4; env.sfx.hurt(); env.say(env.tr('xm.watchAgain'), '#ffb3c7'); setTimeout(() => setup(true), 700); phase = 'wait'; }
          });
        },
      };
    },
  };

  // 18 · Snow Shovel: scrape the snow away to find the surprise
  XM.games[18] = {
    icon: '❄️',
    make(env) {
      const { ctx, art, rand } = env;
      const GX = 10, GY = 14;
      let cells = new Array(GX * GY).fill(false), cleared = 0;
      let snow = null, sw = 0, sh = 0, last = null;
      function makeSnow() {
        sw = env.w; sh = env.h;
        snow = document.createElement('canvas');
        snow.width = Math.ceil(sw); snow.height = Math.ceil(sh);
        const g = snow.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 0, sh);
        gr.addColorStop(0, '#f7fbff'); gr.addColorStop(1, '#d8e6f6');
        g.fillStyle = gr; g.fillRect(0, 0, sw, sh);
        for (let i = 0; i < 260; i++) {
          g.fillStyle = `rgba(${Math.random() < 0.5 ? '190,210,235' : '255,255,255'},${rand(0.3, 0.8)})`;
          g.beginPath(); g.arc(rand(0, sw), rand(0, sh), rand(3, 14), 0, TAU); g.fill();
        }
        cells.fill(false); cleared = 0;
      }
      makeSnow();
      function scrape(x, y) {
        const g = snow.getContext('2d');
        const r = Math.max(env.u * 9, 30);
        g.globalCompositeOperation = 'destination-out';
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        if (last) { g.lineWidth = r * 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(x, y); g.stroke(); }
        g.globalCompositeOperation = 'source-over';
        const top = env.top;
        for (let j = 0; j < GY; j++) {
          for (let i = 0; i < GX; i++) {
            const k = j * GX + i;
            if (cells[k]) continue;
            const cx = (i + 0.5) * sw / GX, cy = top + (j + 0.5) * (sh - top) / GY;
            if (Math.hypot(cx - x, cy - y) < r * 1.1 || (last && segDist(cx, cy, last[0], last[1], x, y) < r)) { cells[k] = true; cleared++; }
          }
        }
        if (Math.random() < 0.5) env.burst(x, y, 2, '#ffffff', 120, { grav: 400 });
        last = [x, y];
        if (cleared / cells.length >= 0.85) { snow = null; env.sfx.chest(); env.win(); }
      }
      function segDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        return Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
      }
      return {
        update() {
          if (snow && (Math.abs(env.w - sw) > 2 || Math.abs(env.h - sh) > 2)) makeSnow();
          env.info(Math.min(100, Math.round(cleared / cells.length / 0.85 * 100)) + '%');
        },
        render() {
          // the surprise: a cozy corner with the tree, presents and the cat
          const fy = art.room(ctx, env.w, env.h, env.t, 0.78);
          const H = Math.min(env.h * 0.55, env.w * 0.9);
          art.tree(ctx, env.w * 0.32, fy, H);
          art.star(ctx, env.w * 0.32, fy - H * 0.95 - env.u * 2, env.u * 5, '#ffe066');
          art.gift(ctx, env.w * 0.18, fy - env.u * 5, env.u * 12, env.u * 10, '#d62839', '#ffd23f');
          art.gift(ctx, env.w * 0.44, fy - env.u * 4, env.u * 10, env.u * 8, '#3d6fd8', '#ffffff');
          env.drawCat('sitting', env.w * 0.72, fy + 4, env.u * 26);
          if (snow) ctx.drawImage(snow, 0, 0, sw, sh);
        },
        down(x, y) { last = null; if (snow) scrape(x, y); },
        move(x, y) { if (snow) scrape(x, y); },
        up() { last = null; },
      };
    },
  };
})();
