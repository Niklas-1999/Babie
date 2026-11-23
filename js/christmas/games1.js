// Advent calendar minigames 1-6
(() => {
  'use strict';
  const XM = (window.XM = window.XM || { games: {} });
  const TAU = Math.PI * 2;

  // 1 · Snowflake Catch: move the cat and catch 12 snowflakes
  XM.games[1] = {
    icon: '❄️', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 12;
      let got = 0, spawnT = 0.3, flakes = [];
      const cat = env.walker(0);
      return {
        update(dt) {
          cat.y = env.h * 0.92;
          cat.update(dt);
          spawnT -= dt;
          if (spawnT <= 0) { spawnT = 0.6; flakes.push({ x: rand(30, env.w - 30), y: env.top, vy: rand(85, 130), p: rand(0, TAU), rot: 0 }); }
          const ch = env.u * 20, cx = cat.x, cy = cat.y - ch * 0.5;
          for (const f of flakes) {
            f.y += f.vy * dt; f.x += Math.sin(env.t * 2 + f.p) * 30 * dt; f.rot += dt;
            if (!f.got && Math.hypot(f.x - cx, f.y - cy) < ch * 0.6) {
              f.got = true; got++;
              env.sfx.pickup(); env.sparkle(f.x, f.y, '#cfeaff');
              if (got >= GOAL) env.win();
            }
          }
          flakes = flakes.filter((f) => !f.got && f.y < env.h + 20);
          env.progress(got, GOAL);
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.92);
          for (const f of flakes) {
            const r = env.u * 4.5;
            const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, r * 1.8);
            g.addColorStop(0, 'rgba(200,230,255,0.6)'); g.addColorStop(1, 'rgba(200,230,255,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.8, 0, TAU); ctx.fill();
            art.snowflake(ctx, f.x, f.y, r, f.rot);
          }
          cat.draw(env.u * 20);
        },
        down(x) { cat.target = x; },
        move(x) { cat.target = x; },
        up() { cat.target = null; },
      };
    },
  };

  // 2 · Tree Lights: tap the 8 bulbs to light up the tree
  XM.games[2] = {
    icon: '💡',
    make(env) {
      const { ctx, art } = env;
      const SPOTS = [[0, 0.2], [-0.45, 0.36], [0.42, 0.4], [-0.1, 0.52], [-0.62, 0.64], [0.58, 0.66], [-0.28, 0.84], [0.32, 0.88]];
      const COLORS = ['#ff5d5d', '#ffd23f', '#5dd39e', '#5db4ff', '#c58bff', '#ff9a3c', '#ff7eb6', '#7de2ff'];
      const lit = SPOTS.map(() => false);
      let count = 0;
      const geo = () => {
        const fy = env.h * 0.86;
        const H = Math.min(env.h * 0.62, env.w * 1.05);
        const top = fy - H * 0.95, base = fy - H * 0.12;
        return { fy, H, top, base, half: H * 0.42, x: env.w / 2 };
      };
      const spot = (g, i) => {
        const [dx, yf] = SPOTS[i];
        return [g.x + dx * g.half * yf * 0.9, g.top + yf * (g.base - g.top)];
      };
      return {
        update() { env.progress(count, SPOTS.length); },
        render() {
          const fy = art.room(ctx, env.w, env.h, env.t, 0.86);
          const g = geo();
          art.tree(ctx, g.x, fy, g.H);
          for (let i = 0; i < SPOTS.length; i++) {
            const [x, y] = spot(g, i);
            const r = env.u * 3.2;
            if (lit[i]) {
              const gl = ctx.createRadialGradient(x, y, 1, x, y, r * 4);
              gl.addColorStop(0, COLORS[i] + 'cc'); gl.addColorStop(1, COLORS[i] + '00');
              ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, TAU); ctx.fill();
              art.bauble(ctx, x, y, r, COLORS[i], true);
            } else {
              art.bauble(ctx, x, y, r, '#6b6b78', true);
              ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(env.t * 5 + i)})`;
              ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, TAU); ctx.stroke();
            }
          }
          const sy = g.top - env.u * 2;
          if (count >= SPOTS.length) {
            const gl = ctx.createRadialGradient(g.x, sy, 2, g.x, sy, env.u * 16);
            gl.addColorStop(0, 'rgba(255,230,120,0.8)'); gl.addColorStop(1, 'rgba(255,230,120,0)');
            ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(g.x, sy, env.u * 16, 0, TAU); ctx.fill();
          }
          art.star(ctx, g.x, sy, env.u * 6, count >= SPOTS.length ? '#ffe066' : '#8a7a4a', Math.sin(env.t) * 0.1);
          env.drawCat('sitting', env.w * 0.17, g.fy + 2, env.u * 18);
        },
        down(x, y) {
          const g = geo();
          for (let i = 0; i < SPOTS.length; i++) {
            if (lit[i]) continue;
            const [bx, by] = spot(g, i);
            if (Math.hypot(x - bx, y - by) < Math.max(env.u * 8, 26)) {
              lit[i] = true; count++;
              env.sfx.note(440 * Math.pow(2, count / 6));
              env.sparkle(bx, by, COLORS[i]);
              if (count >= SPOTS.length) env.win();
              return;
            }
          }
        },
      };
    },
  };

  // 3 · Gift Tower: drop the sliding gifts to stack 5 of them
  XM.games[3] = {
    icon: '🎁',
    make(env) {
      const { ctx, art } = env;
      const GOAL = 5;
      const COLORS = [['#d62839', '#ffd23f'], ['#2f9e4f', '#ffffff'], ['#3d6fd8', '#ffd23f'], ['#9b5cf0', '#ffffff'], ['#ff8a1f', '#d62839'], ['#e85d9a', '#ffffff']];
      let stack = [];
      let cur = null;
      let falling = [];
      let n = 0;
      const giftH = () => Math.min(env.u * 11, (env.h * 0.84 - env.top - 90) / 6.2);
      const giftW = () => giftH() * 1.55;
      function next() {
        const c = COLORS[n % COLORS.length];
        cur = { w: giftW(), h: giftH(), color: c[0], ribbon: c[1], phase: Math.random() * TAU, speed: 1.6 + stack.length * 0.25 };
        n++;
      }
      next();
      const floorY = () => env.h * 0.84;
      const topY = () => floorY() - stack.reduce((a, g) => a + g.h, 0);
      return {
        update(dt) {
          if (cur) cur.x = env.w / 2 + Math.sin(env.t * cur.speed + cur.phase) * env.w * 0.3;
          for (const f of falling) {
            f.vy += 1800 * dt; f.y += f.vy * dt;
            if (!f.miss) {
              const ty = topY() - f.h / 2;
              if (f.y >= ty) {
                const below = stack.length ? stack[stack.length - 1] : { x: env.w / 2, w: env.w * 0.3 };
                const overlap = Math.min(f.x + f.w / 2, below.x + below.w / 2) - Math.max(f.x - f.w / 2, below.x - below.w / 2);
                if (overlap >= f.w * 0.35) {
                  f.y = ty; f.done = true;
                  stack.push({ x: f.x, w: f.w, h: f.h, color: f.color, ribbon: f.ribbon });
                  env.sfx.pick(); env.sparkle(f.x, f.y);
                  if (stack.length >= GOAL) env.win(); else next();
                } else {
                  f.miss = true; f.vx = Math.sign(f.x - below.x) * 220; env.sfx.hurt(); env.say(env.tr('xm.oops'), '#ffb3c7');
                  next();
                }
              }
            } else {
              f.x += f.vx * dt; f.rot = (f.rot || 0) + dt * 4 * Math.sign(f.vx);
              if (f.y > env.h + 80) f.done = true;
            }
          }
          falling = falling.filter((f) => !f.done);
          env.progress(stack.length, GOAL);
        },
        render() {
          const fy = art.room(ctx, env.w, env.h, env.t, 0.84);
          ctx.fillStyle = '#4a2b17'; art.rr(ctx, env.w * 0.35, fy - 6, env.w * 0.3, 12, 5); ctx.fill();
          let y = fy;
          for (const g of stack) { art.gift(ctx, g.x, y - g.h / 2, g.w, g.h, g.color, g.ribbon); y -= g.h; }
          for (const f of falling) {
            ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot || 0);
            art.gift(ctx, 0, 0, f.w, f.h, f.color, f.ribbon); ctx.restore();
          }
          if (cur) {
            const cy = env.top + 30 + cur.h / 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cur.x, cy + cur.h / 2); ctx.lineTo(cur.x, topY()); ctx.stroke(); ctx.setLineDash([]);
            art.gift(ctx, cur.x, cy, cur.w, cur.h, cur.color, cur.ribbon);
          }
          env.drawCat('sitting', env.w * 0.15, fy + 2, env.u * 17);
        },
        down() {
          if (!cur || falling.some((f) => !f.miss)) return;
          falling.push(Object.assign({}, cur, { y: env.top + 30 + cur.h / 2, vy: 0 }));
          cur = null;
          env.sfx.whoosh();
        },
      };
    },
  };

  // 4 · Cookie Oven: tap each cookie when it's golden brown
  XM.games[4] = {
    icon: '🍪',
    make(env) {
      const { ctx, art, rand } = env;
      const cookies = [];
      for (let i = 0; i < 6; i++) cookies.push({ bake: rand(-0.3, 0.1), rate: rand(0.2, 0.3), done: false, smoke: 0 });
      let got = 0;
      const pos = (i) => {
        const tw = Math.min(env.w * 0.86, env.u * 92), th = tw * 0.62;
        const x0 = env.w / 2 - tw / 2, y0 = env.h * 0.52 - th / 2;
        return [x0 + tw * (0.2 + (i % 3) * 0.3), y0 + th * (0.32 + Math.floor(i / 3) * 0.42), tw, th, x0, y0];
      };
      return {
        update(dt) {
          for (const c of cookies) {
            if (c.done) continue;
            c.bake += c.rate * dt;
            if (c.bake > 1.5) { c.bake = -0.2; c.smoke = 1; env.sfx.rattle(); }
            c.smoke = Math.max(0, c.smoke - dt);
          }
          env.progress(got, cookies.length);
        },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.88);
          const [, , tw, th, x0, y0] = pos(0);
          // oven glow and tray
          const g = ctx.createRadialGradient(env.w / 2, y0 + th / 2, 10, env.w / 2, y0 + th / 2, tw * 0.8);
          g.addColorStop(0, 'rgba(255,150,60,0.35)'); g.addColorStop(1, 'rgba(255,150,60,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, env.w, env.h);
          ctx.fillStyle = '#5b5f6a'; art.rr(ctx, x0, y0, tw, th, 14); ctx.fill();
          ctx.fillStyle = '#767b88'; art.rr(ctx, x0 + 8, y0 + 8, tw - 16, th - 16, 10); ctx.fill();
          cookies.forEach((c, i) => {
            if (c.done) return;
            const [x, y] = pos(i);
            const r = th * 0.2;
            if (c.bake > 0.8 && c.bake < 1.3) {
              const gl = ctx.createRadialGradient(x, y, 2, x, y, r * 1.8);
              gl.addColorStop(0, 'rgba(255,220,120,0.7)'); gl.addColorStop(1, 'rgba(255,220,120,0)');
              ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
            }
            art.cookie(ctx, x, y + r * 0.2, r, Math.max(0, c.bake));
            if (c.smoke > 0) {
              ctx.fillStyle = `rgba(80,80,80,${c.smoke * 0.6})`;
              for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + (k - 1) * r * 0.5, y - r * (1 - c.smoke) * 2 - r, r * 0.5, 0, TAU); ctx.fill(); }
            }
          });
          env.drawCat('sitting', env.w * 0.84, env.h * 0.9, env.u * 16);
        },
        down(x, y) {
          for (let i = 0; i < cookies.length; i++) {
            const c = cookies[i];
            if (c.done) continue;
            const [cx, cy] = pos(i);
            if (Math.hypot(x - cx, y - cy) > env.u * 13) continue;
            if (c.bake >= 0.8 && c.bake <= 1.3) {
              c.done = true; got++;
              env.sfx.pick(); env.sparkle(cx, cy, '#ffd27a'); env.text(cx, cy - 20, '😋');
              if (got >= cookies.length) env.win();
            } else if (c.bake < 0.8) {
              env.text(cx, cy - 20, env.tr('xm.notYet'), '#ffe0b0', 0.9);
            }
            return;
          }
        },
      };
    },
  };

  // 5 · Snowball Fight: tap the snowmen peeking out from their forts
  XM.games[5] = {
    icon: '⛄', snow: true,
    make(env) {
      const { ctx, art, rand } = env;
      const GOAL = 10;
      let hits = 0, spawnT = 0.6;
      const forts = [0, 1, 2, 3, 4, 5].map(() => ({ up: 0, t: 0, life: 0, hit: 0 }));
      const balls = [];
      const fortPos = (i) => {
        const cols = 3, row = Math.floor(i / cols), col = i % cols;
        return [env.w * (0.2 + col * 0.3), env.h * (0.42 + row * 0.22)];
      };
      return {
        update(dt) {
          spawnT -= dt;
          const active = forts.filter((f) => f.life > 0).length;
          if (spawnT <= 0 && active < 2) {
            spawnT = rand(0.5, 0.9);
            const free = forts.filter((f) => f.life <= 0 && f.hit <= 0);
            if (free.length) { const f = free[Math.floor(Math.random() * free.length)]; f.life = 1.6; f.t = 0; env.sfx.popup(); }
          }
          for (const f of forts) {
            if (f.life > 0) { f.t += dt; f.life -= dt; f.up = Math.min(1, f.t / 0.15) * Math.min(1, f.life / 0.15); }
            else f.up = 0;
            f.hit = Math.max(0, f.hit - dt);
          }
          for (const b of balls) b.t += dt / 0.2;
          for (let i = balls.length - 1; i >= 0; i--) if (balls[i].t >= 1) balls.splice(i, 1);
          env.progress(hits, GOAL);
        },
        render() {
          art.night(ctx, env.w, env.h, env.t, 0.86);
          forts.forEach((f, i) => {
            const [x, y] = fortPos(i);
            const s = env.u * 16;
            if (f.up > 0) art.snowman(ctx, x, y - s * 0.1 + (1 - f.up) * s, s * 0.9, { eyes: true, nose: true, hat: true, buttons: false });
            if (f.hit > 0) { ctx.fillStyle = `rgba(255,255,255,${f.hit})`; ctx.beginPath(); ctx.arc(x, y - s * 0.6, s * 0.5 * (1.5 - f.hit), 0, TAU); ctx.fill(); }
            // snow wall
            ctx.fillStyle = '#eef4fc';
            art.rr(ctx, x - s * 0.75, y - s * 0.2, s * 1.5, s * 0.5, s * 0.2); ctx.fill();
            ctx.strokeStyle = 'rgba(120,150,190,0.5)'; ctx.lineWidth = 2; ctx.stroke();
          });
          const cx = env.w / 2, cy = env.h * 0.97;
          for (const b of balls) {
            const x = cx + (b.x - cx) * b.t, y = cy - env.u * 12 + (b.y - cy + env.u * 12) * b.t - Math.sin(b.t * Math.PI) * 60;
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, env.u * 2.2, 0, TAU); ctx.fill();
          }
          env.drawCat(balls.length ? 'jump' : 'idle', cx, cy, env.u * 18);
        },
        down(x, y) {
          for (let i = 0; i < forts.length; i++) {
            const f = forts[i];
            if (f.up < 0.5) continue;
            const [fx, fy] = fortPos(i);
            const s = env.u * 16;
            if (Math.hypot(x - fx, y - (fy - s * 0.75)) < s * 0.75) {
              f.life = 0; f.up = 0; f.hit = 1; hits++;
              balls.push({ x: fx, y: fy - s * 0.7, t: 0 });
              env.sfx.throw(); env.burst(fx, fy - s * 0.6, 14, '#ffffff', 180);
              if (hits >= GOAL) env.win();
              return;
            }
          }
        },
      };
    },
  };

  // 6 · Jingle Bells: repeat the melody of the three bells (two rounds)
  XM.games[6] = {
    icon: '🔔',
    make(env) {
      const { ctx, art } = env;
      const NOTES = [523, 659, 784];
      const COLORS = ['#e63946', '#ffc93c', '#2fb35a'];
      const LENGTHS = [3, 4];
      let round = 0;
      let seq = [];
      let phase = 'wait';      // wait | show | input
      let phaseT = 0.6;
      let showI = 0, inputI = 0;
      const swing = [0, 0, 0];
      const newSeq = () => { seq = []; for (let i = 0; i < LENGTHS[round]; i++) seq.push(Math.floor(Math.random() * 3)); };
      newSeq();
      const bellPos = (i) => [env.w * (0.25 + i * 0.25), env.h * 0.45];
      function ring(i) { swing[i] = 1; env.sfx.note(NOTES[i]); }
      return {
        update(dt) {
          for (let i = 0; i < 3; i++) swing[i] = Math.max(0, swing[i] - dt * 1.6);
          phaseT -= dt;
          if (phase === 'wait' && phaseT <= 0) { phase = 'show'; showI = 0; phaseT = 0.2; }
          if (phase === 'show' && phaseT <= 0) {
            if (showI < seq.length) { ring(seq[showI]); showI++; phaseT = 0.65; }
            else { phase = 'input'; inputI = 0; }
          }
          env.info(phase === 'input' ? env.tr('xm.yourTurn') + ' · ' + (round + 1) + ' / ' + LENGTHS.length : env.tr('xm.listen'));
        },
        render() {
          art.room(ctx, env.w, env.h, env.t, 0.86);
          // ribbon the bells hang from
          ctx.strokeStyle = '#d62839'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(env.w * 0.1, env.h * 0.28); ctx.quadraticCurveTo(env.w * 0.5, env.h * 0.34, env.w * 0.9, env.h * 0.28); ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const [x, y] = bellPos(i);
            const s = Math.min(env.u * 20, env.w * 0.2);
            const rot = Math.sin(env.t * 18) * 0.35 * swing[i];
            ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x, env.h * 0.3); ctx.lineTo(x, y - s * 0.5); ctx.stroke();
            if (swing[i] > 0) {
              const g = ctx.createRadialGradient(x, y, 4, x, y, s * 1.3);
              g.addColorStop(0, COLORS[i] + 'aa'); g.addColorStop(1, COLORS[i] + '00');
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 1.3, 0, TAU); ctx.fill();
            }
            art.bell(ctx, x, y, s, rot, COLORS[i]);
          }
          env.drawCat('sitting', env.w / 2, env.h * 0.93, env.u * 17);
        },
        down(x, y) {
          if (phase !== 'input') return;
          for (let i = 0; i < 3; i++) {
            const [bx, by] = bellPos(i);
            if (Math.hypot(x - bx, y - by) > Math.min(env.u * 16, env.w * 0.14)) continue;
            ring(i);
            if (i !== seq[inputI]) {
              env.say(env.tr('xm.listenAgain'), '#ffb3c7'); env.shake(4);
              phase = 'wait'; phaseT = 1.1;
              return;
            }
            inputI++;
            if (inputI >= seq.length) {
              env.sparkle(env.w / 2, env.h * 0.4, '#ffe066');
              round++;
              if (round >= LENGTHS.length) env.win();
              else { newSeq(); phase = 'wait'; phaseT = 1.1; env.say(env.tr('xm.great'), '#9be879'); }
            }
            return;
          }
        },
      };
    },
  };
})();
