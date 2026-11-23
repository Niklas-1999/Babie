// Advent calendar minigames 7-12
(() => {
  'use strict';
  const XM = (window.XM = window.XM || { games: {} });
  const TAU = Math.PI * 2;

  // 7 · Sled Ride: tap to jump over 6 obstacles
  XM.games[7] = {
    icon: '🛷', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 6, G = 1900;
      let passed = 0, scroll = 0, spawnT = 1.2;
      const obs = [];
      const cat = { y: 0, vy: 0, air: false, hurt: 0 };
      const ground = () => env.h * 0.8;
      return {
        update(dt) {
          const speed = 250;
          scroll += speed * dt;
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = rand(1.3, 1.9);
            const kind = ['rock', 'snowman', 'log'][Math.floor(Math.random() * 3)];
            obs.push({ x: env.w + 40, kind, w: env.u * (kind === 'log' ? 14 : 10), h: env.u * (kind === 'snowman' ? 13 : 8), done: false, hit: false });
          }
          if (cat.air) {
            cat.vy += G * dt; cat.y += cat.vy * dt;
            if (cat.y >= 0) { cat.y = 0; cat.vy = 0; cat.air = false; env.burst(env.w * 0.25, ground(), 6, '#ffffff', 90, { dir: -Math.PI / 2, spread: 1.2 }); }
          }
          cat.hurt = Math.max(0, cat.hurt - dt);
          const cx = env.w * 0.25, cw = env.u * 9;
          for (const o of obs) {
            o.x -= speed * dt;
            const bottom = ground() + cat.y;
            if (!o.hit && !o.done && o.x - o.w / 2 < cx + cw / 2 && o.x + o.w / 2 > cx - cw / 2 && bottom > ground() - o.h + 4) {
              o.hit = true; cat.hurt = 0.7; env.sfx.hurt(); env.shake(5); env.burst(cx, ground() - env.u * 6, 12, '#ffffff', 160);
            }
            if (!o.done && o.x + o.w / 2 < cx - cw / 2) {
              o.done = true;
              if (!o.hit) { passed++; env.sfx.tick(); env.text(cx, ground() - env.u * 26, '+1', '#9be879'); if (passed >= GOAL) env.win(); }
            }
          }
          while (obs.length && obs[0].x < -60) obs.shift();
          env.progress(passed, GOAL);
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.8);
          const gy = ground();
          // pine trees scrolling slowly behind
          for (let i = Math.floor(scroll * 0.4 / 120) - 1; i < (scroll * 0.4 + env.w) / 120 + 1; i++) {
            const x = i * 120 - scroll * 0.4;
            const th = env.u * (14 + ((i * 37) % 9));
            ctx.fillStyle = '#244d3a';
            ctx.beginPath(); ctx.moveTo(x - th * 0.35, gy - 20); ctx.lineTo(x, gy - 20 - th); ctx.lineTo(x + th * 0.35, gy - 20); ctx.fill();
          }
          for (const o of obs) {
            const x = o.x;
            if (o.kind === 'rock') { ctx.fillStyle = '#7d8696'; ctx.beginPath(); ctx.ellipse(x, gy - o.h * 0.45, o.w / 2, o.h * 0.55, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, gy - o.h * 0.85, o.w * 0.35, o.h * 0.18, 0, 0, TAU); ctx.fill(); }
            else if (o.kind === 'log') { ctx.fillStyle = '#7a4a28'; art.rr(ctx, x - o.w / 2, gy - o.h, o.w, o.h, o.h / 2); ctx.fill(); ctx.fillStyle = '#c9925a'; ctx.beginPath(); ctx.ellipse(x + o.w / 2 - o.h / 2, gy - o.h / 2, o.h * 0.3, o.h * 0.45, 0, 0, TAU); ctx.fill(); }
            else art.snowman(ctx, x, gy, o.h * 0.9, { eyes: true, nose: true, buttons: false });
          }
          const cx = env.w * 0.25, y = gy + cat.y;
          // sled
          ctx.fillStyle = '#b5302a'; art.rr(ctx, cx - env.u * 9, y - env.u * 4, env.u * 18, env.u * 3, 4); ctx.fill();
          ctx.strokeStyle = '#d9d9e3'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx - env.u * 9, y); ctx.lineTo(cx + env.u * 8, y); ctx.quadraticCurveTo(cx + env.u * 12, y, cx + env.u * 11, y - env.u * 4); ctx.stroke();
          if (cat.hurt > 0) env.drawCat('hit', cx, y - env.u * 3, env.u * 15, { rot: Math.sin(env.t * 20) * 0.2 });
          else env.drawCat(cat.air ? 'jump' : 'landing', cx, y - env.u * 3, env.u * 17);
        },
        down() {
          if (cat.air) return;
          cat.air = true; cat.vy = -Math.sqrt(2 * G * env.u * 30);
          env.sfx.whoosh();
        },
        key(code) { if (code === 'Space' || code === 'ArrowUp') { this.down(); return true; } return false; },
      };
    },
  };

  // 8 · Deck the Tree: drag 5 baubles onto the tree
  XM.games[8] = {
    icon: '🎄',
    make(env) {
      const { ctx, art } = env;
      const COLORS = ['#ff5d5d', '#ffd23f', '#5db4ff', '#c58bff', '#ff9fbf'];
      const balls = COLORS.map((c, i) => ({ c, i, placed: false, x: 0, y: 0 }));
      let drag = null, placed = 0;
      const treeGeo = () => {
        const fy = env.h * 0.74;
        const H = Math.min(env.h * 0.58, env.w * 1.05);
        return { fy, H, x: env.w / 2, top: fy - H * 0.95, base: fy - H * 0.12, half: H * 0.42 };
      };
      const home = (i) => [env.w * (0.18 + i * 0.16), env.h * 0.88];
      return {
        update() { env.progress(placed, balls.length); },
        render() {
          const fy = art.room(ctx, env.w, env.h, env.t, 0.8);
          const g = treeGeo();
          art.tree(ctx, g.x, g.fy, g.H);
          art.star(ctx, g.x, g.top - env.u * 2, env.u * 5, placed >= balls.length ? '#ffe066' : '#c9b46a');
          // basket
          ctx.fillStyle = '#8a5a2b'; art.rr(ctx, env.w * 0.08, env.h * 0.86, env.w * 0.84, env.u * 9, 12); ctx.fill();
          ctx.strokeStyle = '#6b4220'; ctx.lineWidth = 2;
          for (let x = env.w * 0.1; x < env.w * 0.92; x += 14) { ctx.beginPath(); ctx.moveTo(x, env.h * 0.86); ctx.lineTo(x + 6, env.h * 0.86 + env.u * 9); ctx.stroke(); }
          void fy;
          for (const b of balls) {
            if (b === drag) continue;
            const [x, y] = b.placed ? [b.x, b.y] : home(b.i);
            art.bauble(ctx, x, y, env.u * 3.6, b.c);
          }
          if (drag) art.bauble(ctx, drag.x, drag.y, env.u * 4.2, drag.c);
          env.drawCat('sitting', env.w * 0.86, g.fy + 4, env.u * 15);
        },
        down(x, y) {
          for (const b of balls) {
            if (b.placed) continue;
            const [hx, hy] = home(b.i);
            if (Math.hypot(x - hx, y - hy) < env.u * 9) { drag = b; b.x = x; b.y = y; env.sfx.pick(); return; }
          }
        },
        move(x, y) { if (drag) { drag.x = x; drag.y = y - env.u * 4; } },
        up() {
          if (!drag) return;
          const g = treeGeo();
          if (art.insideTree(g, drag.x, drag.y)) {
            drag.placed = true; placed++;
            env.sfx.note(523 * Math.pow(2, placed / 5)); env.sparkle(drag.x, drag.y, drag.c);
            if (placed >= balls.length) env.win();
          }
          drag = null;
        },
      };
    },
  };

  // 9 · Build a Snowman: drag hat, scarf, carrot and eyes onto the snowman
  XM.games[9] = {
    icon: '⛄', snow: true,
    make(env) {
      const { ctx, art } = env;
      const ITEMS = ['hat', 'scarf', 'nose', 'eyes'];
      const done = {};
      let drag = null, count = 0, dragX = 0, dragY = 0;
      const S = () => Math.min(env.w * 0.48, (base() - env.top - 20) / 2.6);
      const sx = () => env.w / 2;
      const base = () => env.h * 0.72;
      // target point for each part, from the same maths as art.snowman
      const target = (k) => {
        const s = S(), r1 = s * 0.5, r2 = s * 0.38, r3 = s * 0.28;
        const c1 = base() - r1, c2 = c1 - r1 - r2 * 0.7, c3 = c2 - r2 - r3 * 0.7;
        return { hat: [sx(), c3 - r3 * 1.1], scarf: [sx(), c2 - r2 * 0.75], nose: [sx() + r3 * 0.3, c3 + r3 * 0.08], eyes: [sx(), c3 - r3 * 0.2] }[k];
      };
      const home = (i) => [env.w * (0.17 + i * 0.22), env.h * 0.81 + env.u * 6.5];
      function drawItem(k, x, y, s) {
        if (k === 'hat') art.hat(ctx, x, y + s * 0.25, s);
        else if (k === 'scarf') art.scarf(ctx, x, y, s * 1.1);
        else if (k === 'nose') art.carrot(ctx, x, y, s);
        else art.coal(ctx, x, y, s);
      }
      return {
        update() { env.progress(count, ITEMS.length); },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.8);
          art.snowman(ctx, sx(), base(), S(), { hat: done.hat, scarf: done.scarf, nose: done.nose, eyes: done.eyes });
          // hints where things go
          for (const k of ITEMS) {
            if (done[k]) continue;
            const [x, y] = target(k);
            ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(env.t * 4)})`; ctx.setLineDash([4, 5]); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, env.u * 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          }
          ctx.fillStyle = 'rgba(20,30,60,0.35)'; art.rr(ctx, env.w * 0.05, env.h * 0.81, env.w * 0.9, env.u * 13, 14); ctx.fill();
          ITEMS.forEach((k, i) => {
            if (done[k] || drag === k) return;
            const [x, y] = home(i);
            drawItem(k, x, y, env.u * 9);
          });
          if (drag) drawItem(drag, dragX, dragY, env.u * 10);
          env.drawCat('idle', env.w * 0.84, base() + 4, env.u * 16, { flip: true });
        },
        down(x, y) {
          ITEMS.forEach((k, i) => {
            if (done[k] || drag) return;
            const [hx, hy] = home(i);
            if (Math.hypot(x - hx, y - hy) < env.u * 10) { drag = k; dragX = x; dragY = y; env.sfx.pick(); }
          });
        },
        move(x, y) { if (drag) { dragX = x; dragY = y - env.u * 5; } },
        up() {
          if (!drag) return;
          const [tx, ty] = target(drag);
          if (Math.hypot(dragX - tx, dragY - ty) < env.u * 14) {
            done[drag] = true; count++;
            env.sfx.note(587 + count * 80); env.sparkle(tx, ty);
            if (count >= ITEMS.length) env.win();
          }
          drag = null;
        },
      };
    },
  };

  // 10 · Shooting Stars: tap 8 shooting stars before they're gone
  XM.games[10] = {
    icon: '🌠',
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 8;
      let got = 0, spawnT = 0.4;
      let stars = [];
      return {
        update(dt) {
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = rand(0.7, 1.1);
            const left = Math.random() < 0.5;
            const sp = rand(200, 270);
            stars.push({ x: left ? -20 : env.w + 20, y: rand(env.top + 20, env.h * 0.45), vx: (left ? 1 : -1) * sp, vy: sp * rand(0.25, 0.45), trail: [] });
          }
          for (const s of stars) {
            s.x += s.vx * dt; s.y += s.vy * dt;
            s.trail.push(s.x, s.y); if (s.trail.length > 30) s.trail.splice(0, 2);
          }
          stars = stars.filter((s) => !s.got && s.x > -60 && s.x < env.w + 60 && s.y < env.h + 40);
          env.progress(got, GOAL);
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.88);
          for (const s of stars) {
            for (let i = 2; i < s.trail.length; i += 2) {
              const a = i / s.trail.length;
              ctx.strokeStyle = `rgba(255,240,180,${a * 0.6})`; ctx.lineWidth = 4 * a; ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(s.trail[i - 2], s.trail[i - 1]); ctx.lineTo(s.trail[i], s.trail[i + 1]); ctx.stroke();
            }
            const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, env.u * 8);
            g.addColorStop(0, 'rgba(255,240,170,0.8)'); g.addColorStop(1, 'rgba(255,240,170,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, env.u * 8, 0, TAU); ctx.fill();
            art.star(ctx, s.x, s.y, env.u * 3.5, '#fff3b0', env.t * 4);
          }
          env.drawCat('sitting', env.w / 2, env.h * 0.93, env.u * 18);
        },
        down(x, y) {
          for (const s of stars) {
            if (Math.hypot(x - s.x, y - s.y) < Math.max(env.u * 11, 34)) {
              s.got = true; got++;
              env.sfx.pickup(); env.burst(s.x, s.y, 18, '#fff3b0', 200, { star: true });
              if (got >= GOAL) env.win();
              return;
            }
          }
        },
      };
    },
  };

  // 11 · Hide & Seek: follow the stocking with the toy mouse (two rounds)
  XM.games[11] = {
    icon: '🧦',
    make(env) {
      const { ctx, art } = env;
      const COLORS = ['#d62839', '#2f9e4f', '#3d6fd8'];
      const ROUNDS = [{ swaps: 4, time: 0.5 }, { swaps: 6, time: 0.38 }];
      let round = 0;
      let socks, mouse, phase, phaseT, swaps, swap, reveal;
      function setup() {
        socks = [0, 1, 2].map((i) => ({ slot: i, from: i, to: i }));
        mouse = Math.floor(Math.random() * 3);
        phase = 'show'; phaseT = 1.3; swaps = ROUNDS[round].swaps; swap = null; reveal = -1;
      }
      setup();
      const slotX = (s) => env.w * (0.22 + s * 0.28);
      const sockY = () => env.h * 0.58;
      function sockPos(k) {
        const s = socks[k];
        if (swap && (swap.a === k || swap.b === k)) {
          const u = Math.min(1, swap.t / ROUNDS[round].time);
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          const x = slotX(s.from) + (slotX(s.to) - slotX(s.from)) * e;
          return [x, sockY() + Math.sin(u * Math.PI) * env.u * 10 * (swap.a === k ? 1 : -1)];
        }
        return [slotX(s.slot), sockY()];
      }
      return {
        update(dt) {
          phaseT -= dt;
          if (phase === 'show' && phaseT <= 0) { phase = 'swap'; phaseT = 0.3; }
          if (phase === 'swap') {
            if (swap) {
              swap.t += dt;
              if (swap.t >= ROUNDS[round].time) {
                for (const k of [swap.a, swap.b]) socks[k].slot = socks[k].to;
                swap = null; swaps--;
                if (swaps <= 0) { phase = 'pick'; }
              }
            } else if (phaseT <= 0) {
              const a = Math.floor(Math.random() * 3);
              let b = Math.floor(Math.random() * 2); if (b >= a) b++;
              socks[a].from = socks[a].slot; socks[a].to = socks[b].slot;
              socks[b].from = socks[b].slot; socks[b].to = socks[a].slot;
              swap = { a, b, t: 0 };
              env.sfx.whoosh();
            }
          }
          if (phase === 'reveal' && phaseT <= 0) {
            if (reveal === mouse) { round++; if (round >= ROUNDS.length) { env.win(); phase = 'end'; } else setup(); }
            else setup();
          }
          env.info(phase === 'pick' ? env.tr('xm.whereMouse') : (round + 1) + ' / ' + ROUNDS.length);
        },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.86);
          // fireplace and mantel
          const mx = env.w * 0.06, mw = env.w * 0.88, my = env.h * 0.44;
          ctx.fillStyle = '#8c4a3a'; ctx.fillRect(mx, my + 8, mw, env.h * 0.42);
          ctx.fillStyle = '#2a1410'; art.rr(ctx, env.w * 0.3, env.h * 0.62, env.w * 0.4, env.h * 0.24, 20); ctx.fill();
          const fl = 0.6 + 0.4 * Math.sin(env.t * 12) * Math.sin(env.t * 7);
          const g = ctx.createRadialGradient(env.w / 2, env.h * 0.84, 4, env.w / 2, env.h * 0.84, env.w * 0.25);
          g.addColorStop(0, `rgba(255,170,60,${0.8 * fl})`); g.addColorStop(1, 'rgba(255,120,30,0)');
          ctx.fillStyle = g; ctx.fillRect(env.w * 0.3, env.h * 0.62, env.w * 0.4, env.h * 0.24);
          ctx.fillStyle = '#5a2f1f'; ctx.fillRect(mx - 10, my, mw + 20, 14);
          const s = Math.min(env.u * 22, env.w * 0.24);
          for (let k = 0; k < 3; k++) {
            const [x, y] = sockPos(k);
            if ((phase === 'show' || (phase === 'reveal' && (reveal === k || k === mouse))) && k === mouse) {
              art.toyMouse(ctx, x, y - s * 0.55 - Math.abs(Math.sin(env.t * 5)) * 6, s * 0.4);
            }
            art.stocking(ctx, x, y, s, COLORS[k]);
          }
          env.drawCat('sitting', env.w * 0.12, env.h * 0.95, env.u * 15);
        },
        down(x, y) {
          if (phase !== 'pick') return;
          const s = Math.min(env.u * 22, env.w * 0.24);
          for (let k = 0; k < 3; k++) {
            const [sx, sy] = sockPos(k);
            if (Math.abs(x - sx) < s * 0.55 && Math.abs(y - sy) < s * 0.7) {
              reveal = k; phase = 'reveal'; phaseT = 1.4;
              if (k === mouse) { env.sfx.levelUp(); env.sparkle(sx, sy - s * 0.5, '#ffe066'); if (round < ROUNDS.length - 1) env.say(env.tr('xm.great'), '#9be879'); }
              else { env.sfx.hurt(); env.say(env.tr('xm.oops'), '#ffb3c7'); }
              return;
            }
          }
        },
      };
    },
  };

  // 12 · Candy Cane Ninja: swipe to slice 10 flying candy canes
  XM.games[12] = {
    icon: '🍬', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 10, G = 900;
      let got = 0, spawnT = 0.3, canes = [], halves = [], trail = [], last = null;
      return {
        update(dt) {
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = rand(0.65, 0.95);
            const x = rand(env.w * 0.15, env.w * 0.85);
            const peak = rand(env.h * 0.25, env.h * 0.45);
            canes.push({ x, y: env.h + 30, vx: (env.w / 2 - x) * rand(0.2, 0.5), vy: -Math.sqrt(2 * G * (env.h + 30 - peak)), rot: rand(0, TAU), vr: rand(-4, 4) });
          }
          for (const c of [...canes, ...halves]) { c.vy += G * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; }
          canes = canes.filter((c) => !c.cut && c.y < env.h + 60);
          halves = halves.filter((c) => c.y < env.h + 60);
          for (const p of trail) p.t += dt;
          trail = trail.filter((p) => p.t < 0.2);
          env.progress(got, GOAL);
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.9);
          const L = env.u * 14;
          for (const c of canes) art.candyCane(ctx, c.x, c.y, L, c.rot);
          for (const h of halves) {
            ctx.save(); ctx.beginPath(); ctx.rect(h.x - L, h.y - L, L * 2, L * 2); ctx.clip();
            ctx.globalAlpha = 0.85; art.candyCane(ctx, h.x, h.y, L * 0.6, h.rot); ctx.restore();
          }
          if (trail.length > 1) {
            ctx.strokeStyle = 'rgba(220,240,255,0.85)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.lineWidth = 6; ctx.beginPath();
            trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
          }
          env.drawCat('jump', env.w / 2, env.h * 0.97, env.u * 16);
        },
        down(x, y) { last = { x, y }; trail.push({ x, y, t: 0 }); },
        move(x, y) {
          if (!last) return;
          trail.push({ x, y, t: 0 });
          for (const c of canes) {
            if (c.cut) continue;
            // distance from the cane to the swipe segment
            const dx = x - last.x, dy = y - last.y, l2 = dx * dx + dy * dy || 1;
            const k = Math.max(0, Math.min(1, ((c.x - last.x) * dx + (c.y - last.y) * dy) / l2));
            if (Math.hypot(c.x - (last.x + dx * k), c.y - (last.y + dy * k)) < env.u * 9) {
              c.cut = true; got++;
              env.sfx.swipe(); env.burst(c.x, c.y, 12, '#ff6b6b', 180, { star: true });
              for (const s of [-1, 1]) halves.push({ x: c.x, y: c.y, vx: c.vx + s * 120, vy: c.vy * 0.4, rot: c.rot, vr: s * 6 });
              if (got >= GOAL) env.win();
            }
          }
          last = { x, y };
        },
        up() { last = null; },
      };
    },
  };
})();
