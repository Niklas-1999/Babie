// Pumpkin Patch: monsters pop out of jack-o'-lanterns. Tap one and the cat pounces on it
// from its spot at the bottom. Don't catch the black cat! 60 seconds per round.
(() => {
  'use strict';
  const HW = (window.HW = window.HW || { games: {} });

  const ROUND = 60;
  const KINDS = {
    ghost:    { pts: 10, life: 1.5 },
    skull:    { pts: 15, life: 1.9 },
    bat:      { pts: 25, life: 1.0 },
    gold:     { pts: 50, life: 1.0, corn: 2 },
    blackcat: { pts: -30, life: 1.7, bad: true },
  };

  HW.games.pumpkin = function (env) {
    const { ctx, TAU, clamp, rand } = env;
    const lerp = (a, b, u) => a + (b - a) * u;

    let phase = 'count';         // count | play | done
    let phaseT = 0;
    let t = 0;
    let timeLeft = ROUND;
    let spawnT = 0.6;
    let chain = 0;
    let chainT = 0;
    let mult = 1;
    let pumpkins = [];
    let monsters = [];
    let rings = [];
    let lastCount = 4;
    let cols = 3, rows = 3, r = 40;
    let lastW = 0, lastH = 0;
    const base = { x: 0, y: 0 };
    const cat = { x: 0, y: 0, state: 'idle', t: 0, x0: 0, y0: 0, x1: 0, y1: 0, dur: 0.2, arc: 40, flip: false, queue: null };

    const stars = [];
    for (let i = 0; i < 60; i++) stars.push({ x: Math.random(), y: Math.random() * 0.2, r: rand(0.6, 1.6), tw: rand(0, TAU) });

    function layout() {
      if (env.w === lastW && env.h === lastH) return;
      lastW = env.w; lastH = env.h;
      const landscape = env.w > env.h;
      cols = landscape ? 5 : 3;
      rows = landscape ? 2 : 3;
      const top = env.h * (landscape ? 0.3 : 0.25);
      const bottom = env.h * (landscape ? 0.74 : 0.7);
      const cw = env.w / cols, ch = (bottom - top) / rows;
      r = Math.min(cw * 0.3, ch * 0.33, 64);
      const old = pumpkins;
      pumpkins = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          pumpkins.push({
            x: cw * (x + 0.5) + (y % 2 ? cw * 0.08 : -cw * 0.08),
            y: top + ch * (y + 0.6),
            seed: (old[pumpkins.length] && old[pumpkins.length].seed) || rand(0, 10),
          });
        }
      }
      if (monsters.some((m) => m.pi >= pumpkins.length)) monsters = monsters.filter((m) => m.pi < pumpkins.length);
      base.x = env.w / 2;
      base.y = env.h - (landscape ? 18 : 34);
      if (cat.state === 'idle') { cat.x = base.x; cat.y = base.y; }
    }
    layout();
    cat.x = base.x; cat.y = base.y;

    function pickKind() {
      const el = ROUND - timeLeft;
      const w = { ghost: 45, skull: 25, bat: el > 8 ? 18 : 0, gold: 5, blackcat: el > 5 ? 11 : 0 };
      let total = 0;
      for (const k in w) total += w[k];
      let x = Math.random() * total;
      for (const k in w) { x -= w[k]; if (x <= 0) return k; }
      return 'ghost';
    }

    function spawn() {
      const busy = new Set(monsters.map((m) => m.pi));
      const free = pumpkins.map((_, i) => i).filter((i) => !busy.has(i));
      if (!free.length) return;
      const el = ROUND - timeLeft;
      const maxUp = el < 15 ? 2 : el < 35 ? 3 : 4;
      if (monsters.filter((m) => m.state !== 'caught').length >= maxUp) return;
      const kind = pickKind();
      const speedUp = 1 - Math.min(0.35, el / 140);
      monsters.push({ kind, pi: free[Math.floor(Math.random() * free.length)], t: 0, life: KINDS[kind].life * speedUp, state: 'up', h: 0, ct: 0 });
      env.sfx.popup();
    }

    function monsterPos(m) {
      const p = pumpkins[m.pi];
      const flutter = m.kind === 'bat' ? Math.sin(m.t * 14) * r * 0.12 : 0;
      return [p.x + flutter, p.y - r * 0.25 - m.h * r * 1.05];
    }

    function jumpTo(x, y) {
      cat.x0 = cat.x; cat.y0 = cat.y;
      cat.x1 = x; cat.y1 = y;
      const d = Math.hypot(x - cat.x, y - cat.y);
      cat.dur = clamp(d / 1500, 0.11, 0.22);
      cat.arc = 30 + d * 0.12;
      cat.flip = x < cat.x;
      cat.state = 'jump';
      cat.t = 0;
      env.sfx.whoosh();
    }

    function pounce() {
      cat.state = 'pounce';
      cat.t = 0;
      const tx = cat.x1, ty = cat.y1;
      let best = null, bd = Infinity;
      for (const m of monsters) {
        if (m.state !== 'up' || m.h < 0.35) continue;
        const [mx, my] = monsterPos(m);
        const d = Math.hypot(tx - mx, ty - my);
        if (d < r * 0.95 && d < bd) { bd = d; best = m; }
      }
      if (!best) {
        chain = 0;
        mult = 1;
        env.burst(tx, ty, 6, 'rgba(200, 180, 140, 0.8)', 70);
        return;
      }
      const k = KINDS[best.kind];
      const [mx, my] = monsterPos(best);
      best.state = 'caught';
      best.ct = 0;
      if (k.bad) {
        chain = 0;
        mult = 1;
        env.addScore(k.pts, mx, my - r * 0.6, '#ff6b81');
        env.text(mx, my - r * 1.1, env.tr('hw.oops'), '#ff6b81', 1.1);
        env.sfx.hurt();
        env.sfx.boo();
        env.shake(6);
        if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
        return;
      }
      chain++;
      chainT = 1.6;
      const m2 = Math.min(5, 1 + Math.floor(chain / 3));
      if (m2 > mult) env.text(env.w / 2, env.h * 0.18, env.tr('hw.combo', { n: m2 }), '#c79bff', 1.5);
      mult = m2;
      env.addScore(k.pts * mult, mx, my - r * 0.6, best.kind === 'gold' ? '#ffd84a' : '#ffe28a');
      if (k.corn) env.addCorn(k.corn, mx, my - r * 1.1);
      env.burst(mx, my, best.kind === 'gold' ? 18 : 10, best.kind === 'gold' ? '#ffd84a' : best.kind === 'bat' ? '#b07cff' : '#f4f0ff', 180, { star: true });
      env.sfx.pick();
    }

    function update(dt) {
      t += dt;
      phaseT += dt;
      layout();
      for (const g of rings) g.t += dt;
      rings = rings.filter((g) => g.t < 0.4);

      // the cat
      cat.t += dt;
      if (cat.state === 'jump' || cat.state === 'return') {
        const u = Math.min(1, cat.t / cat.dur);
        cat.x = lerp(cat.x0, cat.x1, u);
        cat.y = lerp(cat.y0, cat.y1, u) - Math.sin(u * Math.PI) * cat.arc;
        if (u >= 1) {
          if (cat.state === 'jump') pounce();
          else cat.state = 'idle';
        }
      } else if (cat.state === 'pounce' && cat.t > 0.12) {
        if (cat.queue) { const q = cat.queue; cat.queue = null; jumpTo(q[0], q[1]); }
        else {
          cat.x0 = cat.x; cat.y0 = cat.y; cat.x1 = base.x; cat.y1 = base.y;
          cat.dur = 0.22; cat.arc = 26; cat.flip = base.x < cat.x; cat.state = 'return'; cat.t = 0;
        }
      }

      if (phase === 'count') {
        const n = Math.ceil(3 - phaseT);
        if (n !== lastCount && n > 0) { lastCount = n; env.sfx.tick(); }
        if (phaseT >= 3) { phase = 'play'; phaseT = 0; env.sfx.go(); }
        return;
      }
      if (phase === 'play') {
        timeLeft -= dt;
        chainT -= dt;
        if (chainT <= 0 && chain) { chain = 0; mult = 1; }
        spawnT -= dt;
        if (spawnT <= 0) {
          spawn();
          const el = ROUND - timeLeft;
          spawnT = lerp(0.85, 0.38, Math.min(1, el / ROUND)) * rand(0.75, 1.25);
        }
        if (timeLeft <= 0) {
          timeLeft = 0;
          phase = 'done';
          const bonus = Math.floor(env.score / 80);
          if (bonus > 0) env.addCorn(bonus, env.w / 2, env.h * 0.42);
          env.sfx.levelUp();
          env.end({ title: 'hw.pumpkin.over' });
        }
      }
      for (const m of monsters) {
        m.t += dt;
        if (m.state === 'caught') { m.ct += dt; continue; }
        const rise = 0.14, sink = 0.18;
        if (m.t < rise) m.h = m.t / rise;
        else if (m.t < m.life) m.h = 1;
        else m.h = Math.max(0, 1 - (m.t - m.life) / sink);
      }
      monsters = monsters.filter((m) => (m.state === 'caught' ? m.ct < 0.35 : m.t < m.life + 0.18));
    }

    // ------------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------------
    function drawBackground() {
      const W = env.w, H = env.h;
      const horizon = H * 0.2;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#0a0520');
      sky.addColorStop(1, '#2f1544');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon + 2);
      for (const s of stars) {
        ctx.globalAlpha = 0.4 + 0.5 * Math.sin(t * 2 + s.tw);
        ctx.fillStyle = '#fff6dd';
        ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      const mx = W * 0.18, my = horizon * 0.5, mr = Math.min(28, horizon * 0.32);
      const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
      glow.addColorStop(0, 'rgba(255, 236, 180, 0.3)');
      glow.addColorStop(1, 'rgba(255, 236, 180, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(mx, my, mr * 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff1c4';
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
      // tree line
      ctx.fillStyle = '#140a22';
      ctx.beginPath();
      ctx.moveTo(0, horizon + 4);
      for (let x = 0; x <= W + 10; x += 12) ctx.lineTo(x, horizon - 6 - Math.abs(Math.sin(x * 0.07)) * 14 - Math.abs(Math.sin(x * 0.023)) * 10);
      ctx.lineTo(W, horizon + 4);
      ctx.fill();
      // the field
      const field = ctx.createLinearGradient(0, horizon, 0, H);
      field.addColorStop(0, '#24260f');
      field.addColorStop(0.5, '#1c160b');
      field.addColorStop(1, '#120c07');
      ctx.fillStyle = field;
      ctx.fillRect(0, horizon, W, H - horizon);
      // vines between the pumpkins
      ctx.strokeStyle = '#2f5a1f';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let y = 0; y < rows; y++) {
        ctx.beginPath();
        for (let x = 0; x < cols; x++) {
          const p = pumpkins[y * cols + x];
          if (x === 0) ctx.moveTo(p.x - r * 1.6, p.y + r * 0.5);
          ctx.quadraticCurveTo(p.x - r * 0.9, p.y + r * 1.0, p.x, p.y + r * 0.6);
        }
        ctx.stroke();
      }
    }

    function drawPumpkin(p, lit) {
      const glow = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r * 1.8);
      glow.addColorStop(0, `rgba(255, 140, 30, ${0.22 + lit * 0.18})`);
      glow.addColorStop(1, 'rgba(255, 140, 30, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.8, 0, TAU); ctx.fill();
      // stem
      ctx.fillStyle = '#3f6b1f';
      ctx.beginPath();
      ctx.moveTo(p.x - r * 0.1, p.y - r * 0.7);
      ctx.quadraticCurveTo(p.x - r * 0.05, p.y - r * 1.05, p.x + r * 0.18, p.y - r * 1.08);
      ctx.lineTo(p.x + r * 0.14, p.y - r * 0.68);
      ctx.fill();
      // lobes
      const lobes = [[-0.55, 0.62], [0.55, 0.62], [-0.25, 0.78], [0.25, 0.78], [0, 0.8]];
      for (const [lx, lw] of lobes) {
        ctx.fillStyle = lx === 0 ? '#ff9a2e' : Math.abs(lx) < 0.4 ? '#f6801a' : '#e3690c';
        ctx.beginPath(); ctx.ellipse(p.x + lx * r, p.y, r * lw * 0.62, r * 0.82, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(120, 45, 0, 0.55)';
      ctx.lineWidth = 2;
      for (const lx of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.ellipse(p.x + lx * r, p.y, r * 0.22, r * 0.8, 0, 0, TAU); ctx.stroke(); }
      // carved face
      const flick = 0.75 + 0.25 * Math.sin(t * 11 + p.seed * 3) * Math.sin(t * 7 + p.seed);
      ctx.fillStyle = `rgba(255, 216, 74, ${0.55 + flick * 0.45 * (0.6 + lit * 0.4)})`;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(p.x + s * r * 0.42, p.y - r * 0.1);
        ctx.lineTo(p.x + s * r * 0.14, p.y - r * 0.1);
        ctx.lineTo(p.x + s * r * 0.28, p.y - r * 0.38);
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(p.x - r * 0.5, p.y + r * 0.18);
      for (let i = 0; i <= 6; i++) ctx.lineTo(p.x - r * 0.5 + i * r * 0.166, p.y + r * (i % 2 ? 0.3 : 0.18));
      ctx.lineTo(p.x + r * 0.42, p.y + r * 0.42);
      for (let i = 6; i >= 0; i--) ctx.lineTo(p.x - r * 0.42 + i * r * 0.14, p.y + r * (i % 2 ? 0.5 : 0.6));
      ctx.closePath(); ctx.fill();
    }

    function drawMonster(m) {
      const [x, y] = monsterPos(m);
      const s = m.state === 'caught' ? 1 + m.ct * 2 : 1;
      const alpha = m.state === 'caught' ? Math.max(0, 1 - m.ct / 0.35) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(s, s);
      const R = r * 0.55;
      switch (m.kind) {
        case 'ghost': HW.drawGhost(ctx, 0, 0, R, t + m.pi, 'normal'); break;
        case 'gold': {
          const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.8);
          g.addColorStop(0, 'rgba(255, 220, 90, 0.6)');
          g.addColorStop(1, 'rgba(255, 220, 90, 0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, R * 1.8, 0, TAU); ctx.fill();
          HW.drawGhost(ctx, 0, 0, R, t + m.pi, 'normal', '#ffd84a');
          break;
        }
        case 'skull': {
          ctx.fillStyle = '#f1ece0';
          ctx.strokeStyle = '#2a1a3a';
          ctx.lineWidth = R * 0.08;
          ctx.beginPath(); ctx.arc(0, -R * 0.15, R * 0.8, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.rect(-R * 0.45, R * 0.4, R * 0.9, R * 0.45); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#1a0d22';
          for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * R * 0.32, -R * 0.15, R * 0.22, R * 0.26, 0, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#ff4d5e';
          for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * 0.32, -R * 0.12, R * 0.07, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#1a0d22';
          ctx.beginPath(); ctx.moveTo(0, R * 0.1); ctx.lineTo(-R * 0.1, R * 0.28); ctx.lineTo(R * 0.1, R * 0.28); ctx.fill();
          for (let i = -1; i <= 1; i++) ctx.fillRect(i * R * 0.2 - R * 0.02, R * 0.45, R * 0.04, R * 0.35);
          break;
        }
        case 'bat': {
          const flap = Math.sin(m.t * 22);
          ctx.fillStyle = '#2b1842';
          for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(sx * R * 0.3, 0);
            ctx.lineTo(sx * R * 1.5, -R * 0.5 * flap - R * 0.3);
            ctx.lineTo(sx * R * 1.25, R * 0.15);
            ctx.lineTo(sx * R * 0.95, -R * 0.05);
            ctx.lineTo(sx * R * 0.7, R * 0.3);
            ctx.closePath(); ctx.fill();
          }
          ctx.beginPath(); ctx.ellipse(0, 0, R * 0.42, R * 0.5, 0, 0, TAU); ctx.fill();
          for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * R * 0.15, -R * 0.35); ctx.lineTo(sx * R * 0.35, -R * 0.75); ctx.lineTo(sx * R * 0.38, -R * 0.3); ctx.fill(); }
          ctx.fillStyle = '#ffd23f';
          for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * 0.16, -R * 0.08, R * 0.09, 0, TAU); ctx.fill(); }
          break;
        }
        case 'blackcat': {
          ctx.fillStyle = '#151019';
          ctx.strokeStyle = 'rgba(200, 160, 255, 0.5)';
          ctx.lineWidth = R * 0.06;
          ctx.beginPath(); ctx.ellipse(0, 0, R * 0.78, R * 0.66, 0, 0, TAU); ctx.fill(); ctx.stroke();
          for (const sx of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(sx * R * 0.25, -R * 0.5); ctx.lineTo(sx * R * 0.62, -R * 1.0); ctx.lineTo(sx * R * 0.72, -R * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
          }
          ctx.fillStyle = '#b6f04a';
          for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * R * 0.3, -R * 0.06, R * 0.16, R * 0.12, 0, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#0a0a0a';
          for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * R * 0.3, -R * 0.06, R * 0.04, R * 0.11, 0, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#ff9ab0';
          ctx.beginPath(); ctx.moveTo(-R * 0.07, R * 0.16); ctx.lineTo(R * 0.07, R * 0.16); ctx.lineTo(0, R * 0.25); ctx.fill();
          break;
        }
        default: break;
      }
      ctx.restore();
    }

    function drawCat() {
      const h = Math.min(env.h * 0.11, 84);
      if (cat.state === 'idle') {
        env.drawCat('sitting', cat.x, cat.y, h * 1.05);
      } else if (cat.state === 'pounce') {
        env.drawCat('landing', cat.x, cat.y + h * 0.35, h, { flip: cat.flip, squash: 0.08 });
      } else {
        env.drawCat('jump', cat.x, cat.y + h * 0.4, h, { flip: cat.flip, rot: (cat.flip ? -1 : 1) * 0.15 });
      }
    }

    function render() {
      const [sx, sy] = env.shakeOffset();
      ctx.setTransform(env.dpr, 0, 0, env.dpr, sx * env.dpr, sy * env.dpr);
      drawBackground();
      // shadow spot under the cat's home
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath(); ctx.ellipse(base.x, base.y + 2, 40, 9, 0, 0, TAU); ctx.fill();
      pumpkins.forEach((p, i) => {
        const m = monsters.find((q) => q.pi === i);
        if (m) drawMonster(m);
        drawPumpkin(p, m ? m.h : 0);
      });
      for (const g of rings) {
        ctx.strokeStyle = `rgba(255, 190, 90, ${1 - g.t / 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(g.x, g.y, 10 + g.t * 70, 0, TAU); ctx.stroke();
      }
      drawCat();
      env.drawFx();
      if (phase === 'count') {
        const n = Math.ceil(3 - phaseT);
        const u = phaseT % 1;
        ctx.save();
        ctx.translate(env.w / 2, env.h * 0.45);
        ctx.scale(1.4 - u * 0.4, 1.4 - u * 0.4);
        ctx.globalAlpha = 1 - u * 0.6;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(Math.min(env.w, env.h) * 0.22)}px Creepster, Fredoka, sans-serif`;
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(15, 4, 25, 0.9)';
        ctx.strokeText(String(n), 0, 0);
        ctx.fillStyle = '#ffb347';
        ctx.fillText(String(n), 0, 0);
        ctx.restore();
      }
      if (phase === 'play' && timeLeft < 10) {
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 10);
        const g = ctx.createRadialGradient(env.w / 2, env.h / 2, Math.min(env.w, env.h) * 0.3, env.w / 2, env.h / 2, Math.max(env.w, env.h) * 0.75);
        g.addColorStop(0, 'rgba(255, 60, 40, 0)');
        g.addColorStop(1, 'rgba(255, 60, 40, 0.8)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, env.w, env.h);
        ctx.restore();
      }
    }

    function tap(x, y) {
      if (phase !== 'play') return;
      rings.push({ x, y, t: 0 });
      if (cat.state === 'jump') cat.queue = [x, y];
      else jumpTo(x, y);
    }

    return {
      update,
      render,
      down: tap,
      hud: () => '⏱ ' + Math.ceil(timeLeft) + (mult > 1 ? '   x' + mult : ''),
    };
  };
})();
