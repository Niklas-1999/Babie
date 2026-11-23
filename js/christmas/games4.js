// Advent calendar minigames 19-24
(() => {
  'use strict';
  const XM = (window.XM = window.XM || { games: {} });
  const TAU = Math.PI * 2;

  // 19 · Bell Rhythm: tap when the swinging bell passes the glowing middle (6 times)
  XM.games[19] = {
    icon: '🎵',
    make(env) {
      const { ctx, art } = env;
      const GOAL = 6, AMP = 0.85;
      let hits = 0, phase = 0, lastPass = -1, flash = 0;
      const speed = () => 2.0 + hits * 0.12;
      const pivot = () => [env.w / 2, env.top + 30];
      const len = () => Math.min(env.h * 0.42, env.w * 0.75);
      return {
        update(dt) { phase += speed() * dt; flash = Math.max(0, flash - dt * 2); env.progress(hits, GOAL); },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.88);
          const [px, py] = pivot(), L = len();
          const a = Math.sin(phase) * AMP;
          // target zone at the bottom of the swing
          const zone = 0.2;
          ctx.strokeStyle = `rgba(255,230,120,${0.35 + flash * 0.5})`; ctx.lineWidth = env.u * 7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(px, py, L, Math.PI / 2 - zone, Math.PI / 2 + zone); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py, L, Math.PI / 2 - AMP, Math.PI / 2 + AMP); ctx.stroke();
          const bx = px + Math.sin(a) * L, by = py + Math.cos(a) * L;
          ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = 4; ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
          ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.fill();
          art.bell(ctx, bx, by + env.u * 6, env.u * 15, -a, '#ffc93c');
          env.drawCat('sitting', env.w * 0.16, env.h * 0.95, env.u * 15);
        },
        down() {
          const a = Math.sin(phase) * AMP;
          const pass = Math.round(phase / Math.PI);
          if (Math.abs(a) < 0.2 && pass !== lastPass) {
            lastPass = pass; hits++; flash = 1;
            env.sfx.note(784 + hits * 60);
            const [px, py] = pivot();
            env.sparkle(px, py + len() + env.u * 6, '#ffe066');
            if (hits >= GOAL) env.win();
          } else { env.sfx.rattle(); env.shake(2); }
        },
        key(code) { if (code === 'Space') { this.down(); return true; } return false; },
      };
    },
  };

  // 20 · Icicle Dodge: dodge the falling icicles for 15 seconds
  XM.games[20] = {
    icon: '🧊', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const TIME = 15;
      let left = TIME, lives = 3, inv = 0, spawnT = 0.8, ices = [];
      const cat = env.walker(0);
      const eave = () => env.top + 34;
      return {
        update(dt) {
          cat.y = env.h * 0.92;
          cat.update(dt);
          left -= dt; inv = Math.max(0, inv - dt);
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = rand(0.55, 0.9);
            const near = Math.random() < 0.4;
            ices.push({ x: near ? cat.x + rand(-40, 40) : rand(30, env.w - 30), y: eave(), vy: 0, warn: 0.75, len: env.u * rand(8, 12) });
          }
          const ch = env.u * 18;
          for (const ic of ices) {
            if (ic.warn > 0) { ic.warn -= dt; continue; }
            ic.vy += 1100 * dt; ic.y += ic.vy * dt;
            if (!ic.hit && inv <= 0 && Math.abs(ic.x - cat.x) < ch * 0.4 && ic.y + ic.len > cat.y - ch * 0.8 && ic.y < cat.y) {
              ic.hit = true; lives--; inv = 1.1; env.sfx.hurt(); env.shake(6);
              env.burst(ic.x, ic.y + ic.len, 10, '#bfe9ff', 160);
              if (lives <= 0) { env.fail(); return; }
            }
          }
          ices = ices.filter((ic) => !ic.hit && ic.y < env.h + 20);
          if (left <= 0) { left = 0; env.win(); }
          env.info('⏱ ' + Math.ceil(left) + '   ' + '♥'.repeat(Math.max(0, lives)));
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.92);
          // roof edge with snow
          const ey = eave();
          ctx.fillStyle = '#4a2b3a'; ctx.fillRect(0, ey - 26, env.w, 26);
          ctx.fillStyle = '#f4f7fb'; ctx.fillRect(0, ey - 30, env.w, 8);
          for (let x = 12; x < env.w; x += 28) art.icicle(ctx, x, ey, env.u * 3);
          for (const ic of ices) {
            const dx = ic.warn > 0 ? Math.sin(env.t * 50) * 2 : 0;
            art.icicle(ctx, ic.x + dx, ic.y, ic.len);
          }
          const blink = inv > 0 && Math.floor(inv * 12) % 2 === 0;
          if (!blink) cat.draw(env.u * 18);
        },
        down(x) { cat.target = x; },
        move(x) { cat.target = x; },
        up() { cat.target = null; },
      };
    },
  };

  // 21 · Cocoa Pour: hold to pour, let go when the cocoa is in the green band (3 mugs)
  XM.games[21] = {
    icon: '☕',
    make(env) {
      const { ctx, art } = env;
      const GOAL = 3, LOW = 0.7, HIGH = 0.88;
      let mugs = 0, fill = 0, pouring = false, spill = 0, done = 0;
      const mug = () => { const ms = Math.min(env.u * 34, env.w * 0.42); return [env.w / 2, env.h * 0.8 - ms * 0.52, ms]; };
      return {
        update(dt) {
          spill = Math.max(0, spill - dt);
          done = Math.max(0, done - dt);
          if (pouring && done <= 0) {
            fill += (0.3 + mugs * 0.05) * dt;
            if (fill > 1.02) { pouring = false; fill = 0; spill = 0.8; env.sfx.splash(); env.say(env.tr('xm.oops'), '#ffb3c7'); }
          }
          env.progress(mugs, GOAL);
        },
        render() {
          const fy = art.room(ctx, env.w, env.h, env.t, 0.8);
          ctx.fillStyle = '#8a5a2b'; ctx.fillRect(0, fy - 4, env.w, 10);
          const [mx, my, ms] = mug();
          // pot
          const tilt = pouring ? 0.6 : 0.1;
          ctx.save(); ctx.translate(mx - ms * 0.35, env.top + ms * 0.45); ctx.rotate(tilt);
          ctx.fillStyle = '#b8bcc6'; art.rr(ctx, -ms * 0.35, -ms * 0.25, ms * 0.6, ms * 0.5, 10); ctx.fill();
          ctx.fillStyle = '#8f949f'; ctx.beginPath(); ctx.moveTo(ms * 0.25, -ms * 0.15); ctx.lineTo(ms * 0.5, -ms * 0.25); ctx.lineTo(ms * 0.25, 0); ctx.fill();
          ctx.restore();
          if (pouring && done <= 0) {
            ctx.strokeStyle = '#5a321e'; ctx.lineWidth = env.u * 2.2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(mx - ms * 0.05, env.top + ms * 0.4); ctx.quadraticCurveTo(mx, my - ms * 0.6, mx, my - ms * 0.35); ctx.stroke();
          }
          art.mug(ctx, mx, my, ms, fill);
          // green band showing where to stop
          const top = my - ms * 0.38, bottom = my + ms * 0.42;
          const y1 = bottom - (bottom - top) * HIGH, y2 = bottom - (bottom - top) * LOW;
          ctx.fillStyle = 'rgba(120,230,140,0.85)'; ctx.fillRect(mx + ms * 0.62, y1, 10, y2 - y1);
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(mx + ms * 0.62, top, 10, bottom - top);
          ctx.fillStyle = 'rgba(120,230,140,0.95)'; ctx.fillRect(mx + ms * 0.62, y1, 10, y2 - y1);
          if (done > 0) for (let i = 0; i < 4; i++) { ctx.fillStyle = '#fff'; art.rr(ctx, mx - ms * 0.25 + i * ms * 0.14, top - 4 - (i % 2) * 6, ms * 0.12, ms * 0.1, 4); ctx.fill(); }
          if (spill > 0) { ctx.fillStyle = `rgba(90,50,30,${spill})`; ctx.beginPath(); ctx.ellipse(mx, fy + 4, ms * 0.8, 8, 0, 0, TAU); ctx.fill(); }
          env.drawCat('sitting', env.w * 0.83, fy + 4, env.u * 16);
        },
        down() { if (done <= 0) { pouring = true; env.sfx.splash(); } },
        up() {
          if (!pouring) return;
          pouring = false;
          if (fill >= LOW && fill <= HIGH) {
            mugs++; done = 1; env.sfx.note(659 + mugs * 110);
            const [mx, my, ms] = mug();
            env.sparkle(mx, my - ms * 0.4, '#ffe0b0');
            if (mugs >= GOAL) env.win(); else setTimeout(() => { fill = 0; }, 700);
          } else if (fill < LOW) env.text(env.w / 2, env.h * 0.4, env.tr('xm.more'), '#ffe0b0');
        },
      };
    },
  };

  // 22 · Star Connect: tap the dots 1 to 10 in order to draw a star
  XM.games[22] = {
    icon: '⭐',
    make(env) {
      const { ctx, art } = env;
      let next = 0, bad = -1, badT = 0, glow = 0;
      const pts = () => {
        const cx = env.w / 2, cy = env.h * 0.52, R = Math.min(env.w * 0.4, (env.h - env.top - 80) * 0.42);
        const out = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5;
          const r = i % 2 ? R * 0.42 : R;
          out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return out;
      };
      return {
        update(dt) { badT = Math.max(0, badT - dt); if (next >= 10) glow = Math.min(1, glow + dt * 2); env.progress(next, 10); },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.95);
          const P = pts();
          if (next >= 10) {
            ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
            ctx.fillStyle = `rgba(255,224,102,${glow})`; ctx.fill();
          }
          ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < next; i++) (i ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1]));
          if (next >= 10) ctx.closePath();
          ctx.stroke();
          P.forEach(([x, y], i) => {
            const isNext = i === next;
            const dx = i === bad && badT > 0 ? Math.sin(badT * 40) * 5 : 0;
            const r = env.u * (isNext ? 5.5 + Math.sin(env.t * 6) * 0.8 : 4.5);
            ctx.fillStyle = i < next ? '#ffe066' : isNext ? '#ffffff' : 'rgba(255,255,255,0.7)';
            ctx.beginPath(); ctx.arc(x + dx, y, r, 0, TAU); ctx.fill();
            ctx.fillStyle = '#1d3561'; ctx.font = `700 ${Math.round(r * 1.1)}px Fredoka, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x + dx, y + 1);
          });
          env.drawCat('sitting', env.w * 0.85, env.h * 0.97, env.u * 14);
        },
        down(x, y) {
          if (next >= 10) return;
          const P = pts();
          for (let i = 0; i < 10; i++) {
            if (Math.hypot(x - P[i][0], y - P[i][1]) > Math.max(env.u * 8, 26)) continue;
            if (i === next) {
              next++; env.sfx.note(440 * Math.pow(2, next / 8)); env.sparkle(P[i][0], P[i][1], '#ffe066');
              if (next >= 10) setTimeout(() => env.win(), 500);
            } else if (i > next) { bad = i; badT = 0.4; env.sfx.rattle(); }
            return;
          }
        },
      };
    },
  };

  // 23 · Gift Sorting: red gifts into the left sack, green gifts into the right one (10)
  XM.games[23] = {
    icon: '🎀',
    make(env) {
      const { ctx, art } = env;
      const GOAL = 10;
      let sorted = 0, gift = null, flying = [], wrongT = 0;
      function next() { gift = { red: Math.random() < 0.5, y: -40, t: 0 }; }
      next();
      const sackPos = (side) => [side < 0 ? env.w * 0.18 : env.w * 0.82, env.h * 0.72, Math.min(env.u * 26, env.w * 0.3)];
      const center = () => [env.w / 2, env.h * 0.5];
      function send(side) {
        if (!gift || gift.y < center()[1] - 5 || wrongT > 0) return;
        const ok = (side < 0) === gift.red;
        if (ok) {
          const [sx, sy] = sackPos(side);
          flying.push({ red: gift.red, x: center()[0], y: center()[1], tx: sx, ty: sy - env.u * 10, t: 0 });
          sorted++; env.sfx.pick(); gift = null;
          if (sorted >= GOAL) env.win(); else setTimeout(next, 150);
        } else { wrongT = 0.45; env.sfx.hurt(); env.shake(3); }
      }
      let swipe = null;
      return {
        update(dt) {
          wrongT = Math.max(0, wrongT - dt);
          if (gift) { const cy = center()[1]; gift.y = Math.min(cy, gift.y + 700 * dt); }
          for (const f of flying) f.t += dt / 0.3;
          flying = flying.filter((f) => { if (f.t >= 1) { env.sparkle(f.tx, f.ty, f.red ? '#ff6b6b' : '#7ee07e'); return false; } return true; });
          env.progress(sorted, GOAL);
        },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.86);
          for (const side of [-1, 1]) {
            const [x, y, s] = sackPos(side);
            art.sack(ctx, x, y, s);
            ctx.fillStyle = side < 0 ? '#d62839' : '#2f9e4f';
            ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.16, 0, TAU); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(s * 0.2)}px Fredoka, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(side < 0 ? '←' : '→', x, y + s * 0.11);
          }
          const gs = Math.min(env.u * 18, env.w * 0.24);
          if (gift) {
            const [cx] = center();
            const dx = wrongT > 0 ? Math.sin(wrongT * 40) * 8 : 0;
            art.gift(ctx, cx + dx, gift.y, gs, gs * 0.85, gift.red ? '#d62839' : '#2f9e4f', '#ffd23f');
          }
          for (const f of flying) {
            const x = f.x + (f.tx - f.x) * f.t, y = f.y + (f.ty - f.y) * f.t - Math.sin(f.t * Math.PI) * 50;
            art.gift(ctx, x, y, gs * (1 - f.t * 0.5), gs * 0.85 * (1 - f.t * 0.5), f.red ? '#d62839' : '#2f9e4f', '#ffd23f');
          }
          env.drawCat('sitting', env.w / 2, env.h * 0.97, env.u * 14);
        },
        down(x) { swipe = x; },
        up(x) {
          if (swipe == null) return;
          const dx = x - swipe;
          swipe = null;
          if (Math.abs(dx) > 30) send(Math.sign(dx));
          else send(x < env.w / 2 ? -1 : 1);
        },
        key(code) {
          if (code === 'ArrowLeft' || code === 'KeyA') { send(-1); return true; }
          if (code === 'ArrowRight' || code === 'KeyD') { send(1); return true; }
          return false;
        },
      };
    },
  };

  // 24 · Christmas Eve: catch the presents from Santa's sleigh; each one lights up the big tree
  XM.games[24] = {
    icon: '🎄', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 10;
      const COLORS = ['#ff5d5d', '#ffd23f', '#5dd39e', '#5db4ff', '#c58bff', '#ff9a3c', '#ff7eb6', '#7de2ff', '#ffffff', '#ffe066'];
      const SPOTS = [[0, 0.22], [-0.45, 0.36], [0.42, 0.4], [-0.1, 0.5], [-0.6, 0.62], [0.55, 0.64], [-0.3, 0.76], [0.25, 0.8], [-0.7, 0.92], [0.7, 0.92]];
      let got = 0, gifts = [], dropT = 1, sleighX = -100, finale = 0;
      const cat = env.walker(0);
      return {
        update(dt) {
          cat.y = env.h * 0.93;
          cat.update(dt);
          sleighX += 140 * dt;
          if (sleighX > env.w + 160) sleighX = -160;
          dropT -= dt;
          if (dropT <= 0 && got < GOAL && sleighX > 20 && sleighX < env.w - 20) {
            dropT = rand(0.55, 0.85);
            gifts.push({ x: sleighX, y: env.top + env.u * 10, vy: 40, c: COLORS[gifts.length % COLORS.length] });
          }
          const ch = env.u * 18;
          for (const g of gifts) {
            g.vy += 380 * dt; g.y += g.vy * dt;
            if (!g.got && Math.abs(g.x - cat.x) < ch * 0.6 && g.y > cat.y - ch * 0.9 && g.y < cat.y) {
              g.got = true; got++;
              env.sfx.note(523 * Math.pow(2, got / 10)); env.sparkle(g.x, g.y, g.c);
            }
          }
          gifts = gifts.filter((g) => !g.got && g.y < env.h + 30);
          if (got >= GOAL) {
            finale += dt;
            if (Math.random() < dt * 6) {
              const fx = rand(env.w * 0.1, env.w * 0.9), fy = rand(env.top + 20, env.h * 0.4);
              env.burst(fx, fy, 26, COLORS[Math.floor(Math.random() * COLORS.length)], 240, { star: true, grav: 80, life: 1.4 });
              env.sfx.boom();
            }
            if (finale > 2.2) env.win();
          }
          env.progress(got, GOAL);
        },
        render() {
          const gy = art.night(ctx, env.w, env.h, env.t, 0.93);
          const H = Math.min(env.h * 0.6, env.w * 1.1);
          art.tree(ctx, env.w / 2, gy, H);
          const top = gy - H * 0.95, base = gy - H * 0.12, half = H * 0.42;
          SPOTS.forEach(([dx, yf], i) => {
            const x = env.w / 2 + dx * half * yf * 0.9, y = top + yf * (base - top);
            const on = i < got;
            if (on) {
              const g = ctx.createRadialGradient(x, y, 1, x, y, env.u * 7);
              g.addColorStop(0, COLORS[i] + 'cc'); g.addColorStop(1, COLORS[i] + '00');
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, env.u * 7, 0, TAU); ctx.fill();
            }
            art.bauble(ctx, x, y, env.u * 2.4, on ? COLORS[i] : '#5a5f6e', true);
          });
          if (got >= GOAL) {
            const g = ctx.createRadialGradient(env.w / 2, top, 2, env.w / 2, top, env.u * 22);
            g.addColorStop(0, 'rgba(255,230,120,0.9)'); g.addColorStop(1, 'rgba(255,230,120,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(env.w / 2, top, env.u * 22, 0, TAU); ctx.fill();
          }
          art.star(ctx, env.w / 2, top - env.u * 2, env.u * 6, got >= GOAL ? '#ffe066' : '#8a7a4a', Math.sin(env.t) * 0.1);
          // Santa's sleigh crossing the sky
          const sy = env.top + env.u * 8 + Math.sin(env.t * 2) * 5;
          ctx.fillStyle = '#c0302a'; art.rr(ctx, sleighX - env.u * 9, sy - env.u * 3, env.u * 16, env.u * 6, env.u * 2.5); ctx.fill();
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sleighX - env.u * 10, sy + env.u * 4); ctx.lineTo(sleighX + env.u * 8, sy + env.u * 4); ctx.stroke();
          ctx.fillStyle = '#7a4a28';
          for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(sleighX + env.u * (16 + k * 12), sy, env.u * 5, env.u * 2.5, 0, 0, TAU); ctx.fill(); }
          art.gift(ctx, sleighX - env.u * 2, sy - env.u * 5, env.u * 7, env.u * 5, '#2f9e4f', '#ffd23f');
          for (const g of gifts) art.gift(ctx, g.x, g.y, env.u * 7, env.u * 6, g.c === '#ffffff' ? '#e6e6f0' : g.c, '#d62839');
          cat.draw(env.u * 18);
        },
        down(x) { cat.target = x; },
        move(x) { cat.target = x; },
        up() { cat.target = null; },
      };
    },
  };
})();
