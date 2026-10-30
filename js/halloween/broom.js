// Broom Ride: tap to fly up, dodge chimneys and dead trees, grab the candy corn.
(() => {
  'use strict';
  const HW = (window.HW = window.HW || { games: {} });

  HW.games.broom = function (env) {
    const { ctx, TAU, clamp, rand } = env;
    const VH = 640;                 // world height; the width follows the screen
    const GROUND = VH - 70;
    const G = 1650;
    const FLAP = -455;
    const MAX_FALL = 680;
    const R = 15;                   // cat hit radius
    const OB_W = 70;
    const CAT_H = 44;

    let VW = 400, scale = 1;
    let phase = 'ready';            // ready | fly | dead
    let t = 0;
    let scroll = 0;
    let speed = 175;
    let passed = 0;
    let obs = [];
    let corns = [];
    let nextX = 0;
    let lastGap = VH * 0.45;
    const p = { x: 120, y: VH * 0.45, vy: 0, rot: 0, spin: 0 };

    const stars = [];
    for (let i = 0; i < 80; i++) stars.push({ x: Math.random(), y: Math.random() * 0.62, r: rand(0.5, 1.6), tw: rand(0, TAU) });

    function hash(i) {
      let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }

    function layout() {
      scale = env.h / VH;
      VW = env.w / scale;
      p.x = Math.min(VW * 0.3, 170);
    }
    layout();
    nextX = VW + 140;

    function spawnObstacle() {
      const gap = Math.max(146, 205 - passed * 1.4);
      const minY = 60 + gap / 2;
      const maxY = GROUND - 40 - gap / 2;
      const gy = clamp(lastGap + rand(-190, 190), minY, maxY);
      lastGap = gy;
      const ob = { x: nextX, gy, gap, passed: false, style: Math.random() < 0.5 ? 'chimney' : 'tower', seed: Math.floor(Math.random() * 1e6), ghost: null };
      if (passed >= 8 && Math.random() < Math.min(0.5, 0.15 + passed * 0.012)) {
        ob.ghost = { amp: gap * 0.27, ph: rand(0, TAU), sp: rand(1.5, 2.5), y: gy };
      }
      obs.push(ob);
      if (!ob.ghost && Math.random() < 0.7) corns.push({ x: ob.x + OB_W / 2, y: gy + rand(-gap * 0.2, gap * 0.2), taken: false, ph: rand(0, TAU) });
      const spacing = rand(240, 290);
      if (Math.random() < 0.3) {
        for (let k = 1; k <= 3; k++) corns.push({ x: ob.x + OB_W + spacing * k / 4, y: gy + Math.sin(k * 1.3) * 34, taken: false, ph: k });
      }
      nextX += spacing;
    }

    function flap() {
      if (phase === 'dead') return;
      if (phase === 'ready') phase = 'fly';
      p.vy = FLAP;
      env.sfx.whoosh();
      env.burst(p.x - 30, p.y + 14, 5, '#ffd27a', 90, { dir: Math.PI * 0.75, spread: 0.5, star: true, life: 0.7 });
    }

    function die() {
      phase = 'dead';
      p.vy = -360;
      env.sfx.hurt();
      env.sfx.boo();
      env.shake(8);
      env.burst(p.x, p.y, 20, '#c79bff', 240, { star: true });
      if (navigator.vibrate) { try { navigator.vibrate([50, 30, 80]); } catch (e) { /* ignore */ } }
    }

    function circleRect(cx, cy, r, x, y, w, h) {
      const nx = clamp(cx, x, x + w);
      const ny = clamp(cy, y, y + h);
      return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    }

    function update(dt) {
      t += dt;
      layout();
      if (phase === 'ready') {
        p.y = VH * 0.45 + Math.sin(t * 3) * 10;
        p.rot = Math.sin(t * 3) * 0.06;
        scroll += 60 * dt;
        return;
      }
      if (phase === 'dead') {
        p.vy = Math.min(p.vy + G * dt, 900);
        p.y += p.vy * dt;
        p.spin += dt * 9;
        if (p.y > GROUND - 14) { p.y = GROUND - 14; if (!env.ended) env.end({ title: 'hw.broom.over', passed }); }
        return;
      }
      speed = 175 + Math.min(passed, 45) * 1.7;
      const dx = speed * dt;
      scroll += dx;
      nextX -= dx;
      while (nextX < VW + 120) spawnObstacle();
      for (const ob of obs) {
        ob.x -= dx;
        if (ob.ghost) ob.ghost.y = ob.gy + Math.sin(t * ob.ghost.sp + ob.ghost.ph) * ob.ghost.amp;
      }
      for (const c of corns) c.x -= dx;

      p.vy = Math.min(p.vy + G * dt, MAX_FALL);
      p.y += p.vy * dt;
      if (p.y < R + 4) { p.y = R + 4; p.vy = Math.max(p.vy, 0); }
      p.rot = clamp(p.vy / 950, -0.42, 0.6);
      if (Math.random() < 0.6) env.burst(p.x - 40, p.y + 12, 1, Math.random() < 0.5 ? '#ffb347' : '#c79bff', 40, { dir: Math.PI, spread: 0.5, life: 0.8, size: 0.8, star: Math.random() < 0.4 });

      for (const ob of obs) {
        if (!ob.passed && ob.x + OB_W < p.x - R) {
          ob.passed = true;
          passed++;
          env.addScore(1);
          env.sfx.tick();
        }
        const top = ob.gy - ob.gap / 2;
        const bottom = ob.gy + ob.gap / 2;
        if (circleRect(p.x, p.y, R, ob.x + 6, -50, OB_W - 12, top + 50) || circleRect(p.x, p.y, R, ob.x, bottom, OB_W, GROUND - bottom + 50)) { die(); return; }
        if (ob.ghost && Math.hypot(p.x - (ob.x + OB_W / 2), p.y - ob.ghost.y) < R + 13) { die(); return; }
      }
      if (p.y + R > GROUND) { die(); return; }

      for (const c of corns) {
        if (!c.taken && Math.hypot(c.x - p.x, c.y - p.y) < 26) {
          c.taken = true;
          env.addCorn(1, c.x, c.y - 16);
          env.burst(c.x, c.y, 8, '#ffcf6a', 120, { star: true });
        }
      }
      if (obs.length && obs[0].x + OB_W < -80) obs.shift();
      if (corns.length && corns.some((c) => c.taken || c.x < -40)) corns = corns.filter((c) => !c.taken && c.x >= -40);
    }

    // ------------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------------
    function drawBackground() {
      const sky = ctx.createLinearGradient(0, 0, 0, VH);
      sky.addColorStop(0, '#0a0520');
      sky.addColorStop(0.55, '#23103c');
      sky.addColorStop(1, '#4a2152');
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, VW + 20, VH + 20);

      for (const s of stars) {
        const x = ((s.x * VW - scroll * 0.02) % VW + VW) % VW;
        ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 2 + s.tw);
        ctx.fillStyle = '#fff6dd';
        ctx.fillRect(x, s.y * VH, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      // moon
      const mx = VW * 0.78, my = 105;
      const glow = ctx.createRadialGradient(mx, my, 20, mx, my, 120);
      glow.addColorStop(0, 'rgba(255, 236, 180, 0.35)');
      glow.addColorStop(1, 'rgba(255, 236, 180, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(mx, my, 120, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff1c4';
      ctx.beginPath(); ctx.arc(mx, my, 42, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(200, 170, 110, 0.35)';
      for (const [cx, cy, cr] of [[-12, -8, 9], [10, 10, 7], [14, -14, 5], [-6, 16, 4]]) { ctx.beginPath(); ctx.arc(mx + cx, my + cy, cr, 0, TAU); ctx.fill(); }

      // far hills with lit houses
      const off1 = scroll * 0.15;
      ctx.fillStyle = '#1e1035';
      ctx.beginPath();
      ctx.moveTo(-10, VH);
      for (let x = -10; x <= VW + 20; x += 16) {
        const wx = x + off1;
        ctx.lineTo(x, GROUND - 120 - 40 * Math.sin(wx / 140) - 22 * Math.sin(wx / 53));
      }
      ctx.lineTo(VW + 20, VH);
      ctx.fill();
      const H1 = 210;
      for (let i = Math.floor(off1 / H1) - 1; i < (off1 + VW) / H1 + 1; i++) {
        if (hash(i) < 0.45) continue;
        const wx = i * H1 + hash(i + 7) * 120;
        const x = wx - off1;
        const base = GROUND - 120 - 40 * Math.sin(wx / 140) - 22 * Math.sin(wx / 53) + 6;
        const hw = 26 + hash(i + 3) * 18, hh = 22 + hash(i + 5) * 22;
        ctx.fillStyle = '#170b29';
        ctx.fillRect(x - hw / 2, base - hh, hw, hh);
        ctx.beginPath(); ctx.moveTo(x - hw / 2 - 4, base - hh); ctx.lineTo(x, base - hh - 16); ctx.lineTo(x + hw / 2 + 4, base - hh); ctx.fill();
        ctx.fillStyle = 'rgba(255, 190, 80, 0.85)';
        ctx.fillRect(x - hw / 4 - 3, base - hh + 7, 5, 6);
        if (hash(i + 9) > 0.4) ctx.fillRect(x + hw / 4 - 2, base - hh + 7, 5, 6);
      }

      // graveyard: dead trees, crosses, tombstones
      const off2 = scroll * 0.45;
      const H2 = 150;
      ctx.fillStyle = '#120921';
      for (let i = Math.floor(off2 / H2) - 1; i < (off2 + VW) / H2 + 1; i++) {
        const k = hash(i * 3 + 1);
        const x = i * H2 + hash(i * 3 + 2) * 90 - off2;
        const base = GROUND + 2;
        if (k < 0.3) {
          // dead tree
          ctx.strokeStyle = '#120921';
          ctx.lineCap = 'round';
          ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + 4, base - 90); ctx.stroke();
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(x + 3, base - 60); ctx.lineTo(x - 22, base - 88); ctx.lineTo(x - 30, base - 84);
          ctx.moveTo(x + 4, base - 80); ctx.lineTo(x + 26, base - 104); ctx.lineTo(x + 34, base - 100);
          ctx.moveTo(x + 4, base - 88); ctx.lineTo(x + 2, base - 112);
          ctx.stroke();
        } else if (k < 0.6) {
          ctx.beginPath();
          ctx.moveTo(x - 12, base); ctx.lineTo(x - 12, base - 26); ctx.arc(x, base - 26, 12, Math.PI, 0); ctx.lineTo(x + 12, base);
          ctx.fill();
        } else if (k < 0.8) {
          ctx.fillRect(x - 2.5, base - 34, 5, 34);
          ctx.fillRect(x - 11, base - 26, 22, 5);
        }
      }

      // drifting fog
      ctx.fillStyle = 'rgba(190, 170, 240, 0.08)';
      for (let k = 0; k < 3; k++) {
        const fx = ((k * 330 - scroll * (0.3 + k * 0.1)) % (VW + 400) + VW + 400) % (VW + 400) - 200;
        ctx.beginPath(); ctx.ellipse(fx, GROUND - 24 - k * 10, 220, 30, 0, 0, TAU); ctx.fill();
      }
    }

    function drawGround() {
      ctx.fillStyle = '#100818';
      ctx.fillRect(-10, GROUND, VW + 20, VH - GROUND + 10);
      ctx.fillStyle = '#21123a';
      ctx.fillRect(-10, GROUND, VW + 20, 4);
      // little glowing pumpkins along the ground
      const H3 = 130;
      for (let i = Math.floor(scroll / H3) - 1; i < (scroll + VW) / H3 + 1; i++) {
        if (hash(i * 5 + 11) < 0.55) continue;
        const x = i * H3 + hash(i * 5 + 12) * 80 - scroll;
        const y = GROUND + 18 + hash(i) * 22;
        const gl = ctx.createRadialGradient(x, y, 2, x, y, 26);
        gl.addColorStop(0, 'rgba(255, 150, 40, 0.45)');
        gl.addColorStop(1, 'rgba(255, 150, 40, 0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e8650c';
        ctx.beginPath(); ctx.ellipse(x, y, 11, 8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd84a';
        ctx.fillRect(x - 5, y - 3, 3, 3); ctx.fillRect(x + 2, y - 3, 3, 3); ctx.fillRect(x - 4, y + 2, 8, 2);
      }
    }

    function drawObstacle(ob) {
      const x = ob.x;
      const top = ob.gy - ob.gap / 2;
      const bottom = ob.gy + ob.gap / 2;
      // hanging dead tree trunk
      const bark = ctx.createLinearGradient(x, 0, x + OB_W, 0);
      bark.addColorStop(0, '#2a1626');
      bark.addColorStop(0.5, '#43263a');
      bark.addColorStop(1, '#22111e');
      ctx.fillStyle = bark;
      ctx.beginPath();
      ctx.moveTo(x + 4, -20);
      ctx.lineTo(x + 6, top - 18);
      ctx.lineTo(x + 14, top - 4);
      ctx.lineTo(x + 24, top - 14);
      ctx.lineTo(x + 34, top);
      ctx.lineTo(x + 46, top - 12);
      ctx.lineTo(x + 56, top - 2);
      ctx.lineTo(x + OB_W - 6, top - 18);
      ctx.lineTo(x + OB_W - 4, -20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 4, 10, 0.5)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const lx = x + 16 + k * 18;
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.bezierCurveTo(lx + 5, top * 0.3, lx - 5, top * 0.6, lx + 2, top - 24); ctx.stroke();
      }
      // a branch stub with a little spider web
      if (top > 90) {
        const by = top - 50 - (ob.seed % 30);
        ctx.strokeStyle = '#2a1626';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + 8, by); ctx.lineTo(x - 18, by - 16); ctx.stroke();
        ctx.strokeStyle = 'rgba(230, 220, 255, 0.35)';
        ctx.lineWidth = 0.8;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + 4, by); ctx.lineTo(x - 18 + k * 6, by + 18); ctx.stroke(); }
      }

      // chimney or stone tower from the ground
      if (ob.style === 'chimney') {
        ctx.fillStyle = '#5b2a2c';
        ctx.fillRect(x, bottom, OB_W, GROUND - bottom + 4);
        ctx.fillStyle = 'rgba(30, 8, 12, 0.55)';
        for (let yy = bottom + 16, row = 0; yy < GROUND; yy += 14, row++) {
          ctx.fillRect(x, yy, OB_W, 2);
          for (let xx = x + (row % 2 ? 12 : 26); xx < x + OB_W; xx += 28) ctx.fillRect(xx, yy - 12, 2, 12);
        }
        ctx.fillStyle = '#3b1a1f';
        ctx.fillRect(x - 6, bottom, OB_W + 12, 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x - 6, bottom, OB_W + 12, 3);
      } else {
        const st = ctx.createLinearGradient(x, 0, x + OB_W, 0);
        st.addColorStop(0, '#3d3552');
        st.addColorStop(0.5, '#5a4f78');
        st.addColorStop(1, '#2f2842');
        ctx.fillStyle = st;
        ctx.fillRect(x, bottom + 10, OB_W, GROUND - bottom);
        ctx.fillStyle = '#2b2440';
        ctx.beginPath();
        ctx.moveTo(x - 6, bottom + 14); ctx.lineTo(x + OB_W / 2, bottom - 18); ctx.lineTo(x + OB_W + 6, bottom + 14);
        ctx.closePath(); ctx.fill();
        const wy = bottom + 34;
        if (wy + 20 < GROUND) {
          const flick = 0.75 + 0.25 * Math.sin(t * 9 + ob.seed);
          ctx.fillStyle = `rgba(255, 200, 80, ${flick})`;
          ctx.beginPath(); ctx.moveTo(x + OB_W / 2 - 8, wy + 20); ctx.lineTo(x + OB_W / 2 - 8, wy + 6); ctx.arc(x + OB_W / 2, wy + 6, 8, Math.PI, 0); ctx.lineTo(x + OB_W / 2 + 8, wy + 20); ctx.fill();
        }
      }
      if (ob.ghost) HW.drawGhost(ctx, x + OB_W / 2, ob.ghost.y, 15, t, 'normal');
    }

    function drawPlayer() {
      if (phase === 'dead') {
        env.drawCat('hit', p.x, p.y, CAT_H, { center: true, rot: p.spin });
        return;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // broom: stick, bristles and a band
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#3a1f0c';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-34, 13); ctx.lineTo(34, 7); ctx.stroke();
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-34, 13); ctx.lineTo(34, 7); ctx.stroke();
      ctx.fillStyle = '#e3ad4f';
      ctx.strokeStyle = '#7a4f1c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-30, 9); ctx.lineTo(-60, 2); ctx.lineTo(-64, 14); ctx.lineTo(-60, 26); ctx.lineTo(-30, 17);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 5; k++) { ctx.moveTo(-32, 11 + k * 1.5); ctx.lineTo(-61, 4 + k * 5); }
      ctx.stroke();
      ctx.fillStyle = '#7b3fa0';
      ctx.fillRect(-33, 8, 5, 10);
      env.drawCat('landing', 0, 10, CAT_H);
      ctx.restore();
    }

    function render() {
      const [sx, sy] = env.shakeOffset();
      const s = scale * env.dpr;
      ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
      drawBackground();
      for (const ob of obs) if (ob.x < VW + 20 && ob.x + OB_W > -40) drawObstacle(ob);
      for (const c of corns) {
        if (c.taken || c.x < -20 || c.x > VW + 20) continue;
        const y = c.y + Math.sin(t * 3 + c.ph) * 4;
        const g = ctx.createRadialGradient(c.x, y, 1, c.x, y, 20);
        g.addColorStop(0, 'rgba(255, 200, 80, 0.5)');
        g.addColorStop(1, 'rgba(255, 200, 80, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c.x, y, 20, 0, TAU); ctx.fill();
        HW.drawCorn(ctx, c.x, y, 12, Math.sin(t * 2 + c.ph) * 0.25);
      }
      drawGround();
      drawPlayer();
      env.drawFx();
      if (phase === 'ready') {
        const pulse = 1 + Math.sin(t * 4) * 0.06;
        ctx.save();
        ctx.translate(VW / 2, VH * 0.3);
        ctx.scale(pulse, pulse);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '40px Creepster, Fredoka, sans-serif';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(20, 5, 30, 0.85)';
        ctx.strokeText(env.tr('hw.tapToFly'), 0, 0);
        ctx.fillStyle = '#ffb347';
        ctx.fillText(env.tr('hw.tapToFly'), 0, 0);
        ctx.restore();
      }
    }

    return {
      update,
      render,
      down: flap,
      key(code) {
        if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') { flap(); return true; }
        return false;
      },
      hud: () => '',
      debug: () => ({ p, obs, phase }),
    };
  };
})();
