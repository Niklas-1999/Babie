// Backyard Survivors: procedural art. Everything is drawn once into small canvases
// (critters in 4 animation frames plus a white "hit flash" copy) and reused every frame.
(() => {
  'use strict';
  const SV = (window.SV = window.SV || {});

  const RES = 3;            // sprite pixels per world unit
  const INK = '#2a1a14';    // outline color, matches the cat sprites
  const TAU = Math.PI * 2;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // Draw into a square canvas centered on (0, 0), `size` world units each way.
  function bake(size, draw) {
    const c = makeCanvas(size * 2 * RES, size * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(size, size);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw(g);
    return c;
  }

  function flashOf(src) {
    const c = makeCanvas(src.width, src.height);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255, 255, 255, 0.92)';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function shade(g, x, y, rx, ry, light, dark) {
    const gr = g.createRadialGradient(x - rx * 0.35, y - ry * 0.45, 0, x, y, Math.max(rx, ry) * 1.1);
    gr.addColorStop(0, light);
    gr.addColorStop(1, dark);
    return gr;
  }

  function blob(g, x, y, rx, ry, fill, lw = 1, rot = 0) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, TAU);
    g.fillStyle = fill;
    g.fill();
    if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); }
  }

  function shine(g, x, y, rx, ry, a = 0.35, rot = 0) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, TAU);
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.fill();
  }

  // ---------------------------------------------------------------------------
  // Critters (all drawn top-down, facing +x)
  // ---------------------------------------------------------------------------
  function insectLegs(g, ph, pairs, reach, color, lw, spread = 1.6) {
    g.strokeStyle = color;
    g.lineWidth = lw;
    for (const s of [-1, 1]) {
      for (let i = 0; i < pairs; i++) {
        const sw = Math.sin(ph + i * 2.1 + (s > 0 ? Math.PI : 0)) * reach * 0.28;
        const bx = (1 - i) * spread;
        g.beginPath();
        g.moveTo(bx, 0);
        g.lineTo(bx + sw * 0.5 + (1 - i) * reach * 0.2, s * reach * 0.55);
        g.lineTo(bx + sw + (1 - i) * reach * 0.42, s * reach);
        g.stroke();
      }
    }
  }

  function drawAnt(g, f) {
    const ph = f / 4 * TAU;
    insectLegs(g, ph, 3, 7.5, '#2a140c', 1.1);
    g.strokeStyle = '#2a140c';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(6, -1); g.quadraticCurveTo(9, -4, 11.5, -3.2 + Math.sin(ph) * 0.7);
    g.moveTo(6, 1); g.quadraticCurveTo(9, 4, 11.5, 3.2 - Math.sin(ph) * 0.7);
    g.stroke();
    blob(g, -5, 0, 4.8, 3.7, shade(g, -5, 0, 4.8, 3.7, '#b0603a', '#5a2614'), 0.9);
    blob(g, 0.8, 0, 2.6, 1.9, shade(g, 0.8, 0, 2.6, 1.9, '#a5573a', '#5a2614'), 0.9);
    blob(g, 5, 0, 2.8, 2.6, shade(g, 5, 0, 2.8, 2.6, '#a5573a', '#4a1f10'), 0.9);
    shine(g, -6, -1.4, 2, 0.9);
    shine(g, 4.6, -1, 1, 0.6, 0.4);
  }

  function drawRodent(g, f, o) {
    const s = o.scale;
    const ph = f / 4 * TAU;
    // tail
    g.strokeStyle = o.tail;
    g.lineWidth = 1.8 * s;
    g.beginPath();
    g.moveTo(-9 * s, 0);
    g.bezierCurveTo(-15 * s, Math.sin(ph) * 4 * s, -19 * s, -Math.sin(ph) * 4 * s, -(14 + o.tailLen) * s, Math.sin(ph + 1) * 3 * s);
    g.stroke();
    // feet
    for (const [fx, fy] of [[5, 6.3], [-5, 6.6]]) {
      for (const side of [-1, 1]) {
        const off = Math.sin(ph + (fx > 0 ? 0 : Math.PI) + (side > 0 ? Math.PI : 0)) * 1.6;
        blob(g, (fx + off) * s, side * fy * s, 1.9 * s, 1.4 * s, o.foot, 0.7);
      }
    }
    if (o.cape) {
      blob(g, -3 * s, 0, 11 * s, 9.6 * s, '#7b3fa0', 1.2);
      g.strokeStyle = '#ffd34d'; g.lineWidth = 1.2 * s;
      g.beginPath(); g.ellipse(-3 * s, 0, 10 * s, 8.6 * s, 0, 0.6, TAU - 0.6); g.stroke();
    }
    blob(g, -1 * s, 0, 10.5 * s, 7.2 * s, shade(g, -1 * s, 0, 10.5 * s, 7.2 * s, o.light, o.dark), 1.1);
    blob(g, 8 * s, 0, 6.2 * s, 5 * s, shade(g, 8 * s, 0, 6.2 * s, 5 * s, o.light, o.dark), 1.1);
    for (const side of [-1, 1]) {
      blob(g, 5.4 * s, side * 5.6 * s, 3.8 * s, 3.8 * s, o.light, 1);
      blob(g, 5.6 * s, side * 5.8 * s, 2.3 * s, 2.3 * s, '#f2a7b4', 0);
      blob(g, 10.4 * s, side * 2.4 * s, 1.15 * s, 1.15 * s, o.eye || '#1a1012', 0);
      shine(g, 10.7 * s, side * 2.4 * s - 0.4 * s, 0.4 * s, 0.4 * s, 0.9);
    }
    blob(g, 14.2 * s, 0, 1.4 * s, 1.3 * s, '#ff8fa3', 0.6);
    g.strokeStyle = 'rgba(40,30,30,0.55)';
    g.lineWidth = 0.45;
    g.beginPath();
    for (const side of [-1, 1]) {
      g.moveTo(13 * s, side * 1.6 * s); g.lineTo(17.5 * s, side * 5 * s);
      g.moveTo(13 * s, side * 1.6 * s); g.lineTo(18 * s, side * 2.6 * s);
    }
    g.stroke();
    shine(g, -2 * s, -3 * s, 5 * s, 1.6 * s, 0.25);
    if (o.crown) {
      const cx = 7.5 * s, r = 4.3 * s;
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = i / 10 * TAU;
        const rr = i % 2 === 0 ? r * 1.35 : r * 0.8;
        g.lineTo(cx + Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = '#ffd34d'; g.fill();
      g.strokeStyle = '#8a5a00'; g.lineWidth = 1; g.stroke();
      blob(g, cx, 0, r * 0.55, r * 0.55, '#e0464f', 0.8);
    }
  }

  function drawRoach(g, f) {
    const ph = f / 4 * TAU;
    insectLegs(g, ph, 3, 10, '#3a1d0c', 1.2, 2.4);
    g.strokeStyle = '#3a1d0c';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(10, -1.5); g.quadraticCurveTo(18, -8 + Math.sin(ph) * 1.5, 23, -5);
    g.moveTo(10, 1.5); g.quadraticCurveTo(18, 8 - Math.sin(ph) * 1.5, 23, 5);
    g.stroke();
    blob(g, -1, 0, 10.5, 6.3, shade(g, -1, 0, 10.5, 6.3, '#a8652f', '#4f2810'), 1);
    g.strokeStyle = 'rgba(40,18,6,0.8)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(6, 0); g.lineTo(-11, 0); g.stroke();
    blob(g, 7, 0, 3.6, 5, shade(g, 7, 0, 3.6, 5, '#6a3818', '#2e1406'), 1);
    blob(g, 10.6, 0, 2.2, 2.2, '#2e1406', 0.8);
    shine(g, -2, -2.8, 6, 1.3, 0.35);
    shine(g, -3, 2.6, 4, 0.8, 0.15);
  }

  function drawBee(g, f, o = {}) {
    const s = o.scale || 1;
    const flap = [1, 0.6, 0.25, 0.6][f];
    const light = o.light || '#ffe36a';
    const dark = o.dark || '#e6a800';
    // stinger
    g.beginPath();
    g.moveTo(-8.5 * s, -1.3 * s); g.lineTo(-12.5 * s, 0); g.lineTo(-8.5 * s, 1.3 * s); g.closePath();
    g.fillStyle = '#2a1f1a'; g.fill();
    if (o.waist) {
      blob(g, -5 * s, 0, 8 * s, 5.4 * s, shade(g, -5 * s, 0, 8 * s, 5.4 * s, light, dark), 1.1);
      g.save(); g.beginPath(); g.ellipse(-5 * s, 0, 8 * s, 5.4 * s, 0, 0, TAU); g.clip();
      g.fillStyle = '#2a1f1a';
      for (const sx of [-9, -5.5, -2]) g.fillRect(sx * s, -6 * s, 1.8 * s, 12 * s);
      g.restore();
      blob(g, 4 * s, 0, 4.2 * s, 3.8 * s, shade(g, 4 * s, 0, 4.2 * s, 3.8 * s, '#5a4430', '#2a1f1a'), 1);
      blob(g, 9.5 * s, 0, 3.4 * s, 3.4 * s, '#2a1f1a', 1);
    } else {
      blob(g, -1 * s, 0, 8 * s, 5.6 * s, shade(g, -1 * s, 0, 8 * s, 5.6 * s, light, dark), 1.1);
      g.save(); g.beginPath(); g.ellipse(-1 * s, 0, 8 * s, 5.6 * s, 0, 0, TAU); g.clip();
      g.fillStyle = '#2a1f1a';
      for (const sx of [-5.8, -1.8, 2.2]) g.fillRect(sx * s, -6 * s, 1.9 * s, 12 * s);
      g.restore();
      blob(g, 7.5 * s, 0, 3.6 * s, 3.6 * s, '#2a1f1a', 1);
    }
    const hx = (o.waist ? 9.5 : 7.5) * s;
    for (const side of [-1, 1]) blob(g, hx + 1.2 * s, side * 1.6 * s, 0.8 * s, 0.8 * s, '#fff', 0);
    // wings
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(0, side * 5 * s, 6.5 * s, 3.6 * s * flap + 0.6, side * 0.35, 0, TAU);
      g.fillStyle = 'rgba(225,242,255,0.72)';
      g.fill();
      g.strokeStyle = 'rgba(70,90,110,0.7)'; g.lineWidth = 0.7; g.stroke();
    }
    if (o.crown) {
      const cx = hx, r = 2.4 * s;
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = i / 10 * TAU;
        const rr = i % 2 === 0 ? r * 1.5 : r * 0.85;
        g.lineTo(cx + Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = '#ffd34d'; g.fill();
      g.strokeStyle = '#8a5a00'; g.lineWidth = 1; g.stroke();
      blob(g, cx, 0, r * 0.5, r * 0.5, '#4dd2ff', 0.6);
    }
    shine(g, -2 * s, -2.6 * s, 4 * s, 1.1 * s, 0.35);
  }

  function drawSpider(g, f) {
    const ph = f / 4 * TAU;
    g.strokeStyle = '#1b1420';
    g.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const a = (0.55 + i * 0.5) * s;
        const sw = Math.sin(ph + i * 1.7 + (s > 0 ? Math.PI : 0)) * 0.18;
        const kx = 1 + Math.cos(a + sw) * 8, ky = Math.sin(a + sw) * 8;
        const fx = 1 + Math.cos(a * 1.08 + sw * 1.5) * 14.5, fy = Math.sin(a * 1.08 + sw * 1.5) * 13;
        g.beginPath(); g.moveTo(1, 0); g.lineTo(kx, ky * 1.25); g.lineTo(fx, fy); g.stroke();
      }
    }
    blob(g, -4.5, 0, 7.2, 6.6, shade(g, -4.5, 0, 7.2, 6.6, '#5d4d6e', '#1d1624'), 1.1);
    blob(g, -5, 0, 1.6, 2.6, '#e0464f', 0);
    blob(g, -2.6, 0, 1, 1.6, '#e0464f', 0);
    blob(g, 4, 0, 4.4, 4.2, shade(g, 4, 0, 4.4, 4.2, '#4d3f5c', '#1d1624'), 1);
    for (const side of [-1, 1]) {
      blob(g, 7.2, side * 1.2, 0.85, 0.85, '#ff4d5e', 0);
      blob(g, 6.4, side * 2.6, 0.7, 0.7, '#ff4d5e', 0);
    }
    shine(g, -6, -2.6, 3, 1.2, 0.3);
  }

  function drawBeetle(g, f) {
    const ph = f / 4 * TAU;
    insectLegs(g, ph, 3, 13, '#123d29', 1.6, 3.5);
    g.strokeStyle = '#123d29'; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(15, -2); g.quadraticCurveTo(20, -5, 21.5, -0.8);
    g.moveTo(15, 2); g.quadraticCurveTo(20, 5, 21.5, 0.8);
    g.stroke();
    blob(g, 14.5, 0, 3.4, 3.4, '#1c3d2c', 1);
    blob(g, 9.5, 0, 4.6, 6.6, shade(g, 9.5, 0, 4.6, 6.6, '#3a8a63', '#123d29'), 1.1);
    blob(g, -2, 0, 12, 9.6, shade(g, -2, 0, 12, 9.6, '#6be0a6', '#17573a'), 1.2);
    g.strokeStyle = '#0f3322'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(7.5, 0); g.lineTo(-14, 0); g.stroke();
    shine(g, -2, -5, 6, 1.8, 0.35, -0.1);
    shine(g, -4, 4.5, 4, 1, 0.15);
    shine(g, 9, -3, 1.6, 1, 0.3);
  }

  function drawMoth(g, f) {
    const flap = [1, 0.78, 0.55, 0.78][f];
    for (const s of [-1, 1]) {
      g.save();
      g.scale(1, flap);
      g.beginPath();
      g.moveTo(2, 0);
      g.quadraticCurveTo(4, s * 10, -1, s * 15);
      g.quadraticCurveTo(-8, s * 15, -9, s * 9);
      g.quadraticCurveTo(-7, s * 3, -2, 0);
      g.closePath();
      g.fillStyle = shade(g, -3, s * 8, 8, 8, '#f3e3c0', '#b39770');
      g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      blob(g, -3.6, s * 9, 2.4, 2.4, '#7a5a3a', 0.6);
      blob(g, -3.6, s * 9, 1.1, 1.1, '#f5e6c8', 0);
      g.beginPath();
      g.moveTo(-6, 0);
      g.quadraticCurveTo(-11, s * 6, -13, s * 4);
      g.quadraticCurveTo(-12, s * 1, -6, 0);
      g.fillStyle = '#c9ad85'; g.fill(); g.stroke();
      g.restore();
    }
    blob(g, -2, 0, 7.5, 2.8, shade(g, -2, 0, 7.5, 2.8, '#b08a62', '#6a4a2a'), 1);
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(5, -1); g.quadraticCurveTo(8, -3, 10, -5);
    g.moveTo(5, 1); g.quadraticCurveTo(8, 3, 10, 5);
    g.stroke();
  }

  function drawFrog(g, f) {
    const ext = [0, 0.5, 1, 0.4][f];
    const leg = '#4aa83a';
    for (const s of [-1, 1]) {
      g.strokeStyle = INK; g.lineWidth = 4.2;
      g.beginPath(); g.moveTo(-5, s * 5); g.lineTo(-8 - ext * 6, s * (10 + ext * 1.5)); g.lineTo(-4 - ext * 9, s * (12 - ext * 2)); g.stroke();
      g.strokeStyle = leg; g.lineWidth = 2.6; g.stroke();
      blob(g, -4 - ext * 9, s * (12 - ext * 2), 2.2, 1.6, leg, 0.8);
      g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.moveTo(5, s * 5); g.lineTo(8 + ext * 2, s * 9); g.stroke();
      g.strokeStyle = leg; g.lineWidth = 1.6; g.stroke();
    }
    blob(g, 0, 0, 9.8, 8.2, shade(g, 0, 0, 9.8, 8.2, '#9be879', '#3f9a2b'), 1.2);
    blob(g, -3, -3, 1.8, 1.4, 'rgba(40,110,30,0.7)', 0);
    blob(g, -5, 2.5, 1.4, 1.2, 'rgba(40,110,30,0.7)', 0);
    blob(g, 0.5, 2, 1.1, 1, 'rgba(40,110,30,0.7)', 0);
    for (const s of [-1, 1]) {
      blob(g, 6.5, s * 4.5, 3.2, 3.2, '#8fe06a', 1);
      blob(g, 7.2, s * 4.5, 1.7, 1.9, '#1a1a12', 0);
      shine(g, 7.6, s * 4.5 - 0.7, 0.6, 0.6, 0.95);
    }
    shine(g, -2, -4, 4, 1.4, 0.3);
  }

  function drawVacuum(g, f) {
    const ph = f / 4 * TAU;
    // side brushes
    for (const s of [-1, 1]) {
      const bx = 24, by = s * 22;
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const a = ph * s + i * TAU / 3;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * 10, by + Math.sin(a) * 10); g.stroke();
      }
      blob(g, bx, by, 2.5, 2.5, '#555', 0.8);
    }
    blob(g, 0, 0, 34, 34, shade(g, 0, 0, 34, 34, '#6d7685', '#2c313a'), 1.6);
    g.strokeStyle = '#16191e'; g.lineWidth = 5;
    g.beginPath(); g.arc(0, 0, 32, -1.15, 1.15); g.stroke();
    blob(g, -2, 0, 22, 22, shade(g, -2, 0, 22, 22, '#5a6271', '#363c47'), 1.2);
    blob(g, -2, 0, 7, 7, '#1b1f25', 1);
    g.strokeStyle = '#4dd2ff'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(-2, 0, 5, 0, TAU); g.stroke();
    // angry eyes
    for (const s of [-1, 1]) {
      g.save();
      g.translate(24, s * 8);
      g.rotate(s * 0.5);
      g.fillStyle = '#ff3b4a';
      g.fillRect(-1.5, -4, 3, 8);
      g.restore();
    }
    shine(g, -10, -14, 12, 4, 0.18, -0.5);
  }

  function drawPot(g) {
    blob(g, 1.5, 2, 13, 13, 'rgba(0,0,0,0.18)', 0);
    blob(g, 0, 0, 13, 13, shade(g, 0, 0, 13, 13, '#e48a55', '#a8542a'), 1.2);
    blob(g, 0, 0, 10.2, 10.2, '#4a3020', 1);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3;
      blob(g, Math.cos(a) * 5.5, Math.sin(a) * 5.5, 5, 2.4, shade(g, Math.cos(a) * 5.5, Math.sin(a) * 5.5, 5, 2.4, '#7fd67f', '#2e7d32'), 0.8, a);
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      blob(g, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 2.4, 2.4, '#ff8fb1', 0.6);
    }
    blob(g, 0, 0, 1.8, 1.8, '#ffd34d', 0.6);
  }

  const DRAW = {
    ant: (g, f) => drawAnt(g, f),
    mouse: (g, f) => drawRodent(g, f, { scale: 1, light: '#cbc5ca', dark: '#8e888d', tail: '#d48a95', foot: '#f2a7b4', tailLen: 8 }),
    rat: (g, f) => drawRodent(g, f, { scale: 1.45, light: '#a08f84', dark: '#5e5048', tail: '#c98a8a', foot: '#e8a0a8', tailLen: 14 }),
    roach: (g, f) => drawRoach(g, f),
    bee: (g, f) => drawBee(g, f),
    spider: (g, f) => drawSpider(g, f),
    beetle: (g, f) => drawBeetle(g, f),
    moth: (g, f) => drawMoth(g, f),
    frog: (g, f) => drawFrog(g, f),
    ratking: (g, f) => drawRodent(g, f, { scale: 2.6, light: '#a08f84', dark: '#4e4038', tail: '#c98a8a', foot: '#e8a0a8', tailLen: 16, crown: true, cape: true, eye: '#c0182a' }),
    vacuum: (g, f) => drawVacuum(g, f),
    queen: (g, f) => drawBee(g, f, { scale: 2.5, light: '#ffc94d', dark: '#e07b00', waist: true, crown: true }),
    pot: (g) => drawPot(g),
  };

  // ---------------------------------------------------------------------------
  // Pickups / projectiles
  // ---------------------------------------------------------------------------
  function drawFishTreat(g, s, light, dark) {
    g.beginPath();
    g.moveTo(-4 * s, 0);
    g.lineTo(-7.5 * s, -3.2 * s);
    g.lineTo(-7.5 * s, 3.2 * s);
    g.closePath();
    g.fillStyle = dark; g.fill();
    g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    blob(g, 0.5 * s, 0, 5.2 * s, 3.3 * s, shade(g, 0.5 * s, 0, 5.2 * s, 3.3 * s, light, dark), 0.9);
    blob(g, 3 * s, -0.8 * s, 0.8 * s, 0.8 * s, INK, 0);
    shine(g, 0, -1.5 * s, 3 * s, 0.8 * s, 0.55);
  }

  function drawKibble(g) {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const rr = i % 2 ? 2.4 : 4;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = shade(g, 0, 0, 4, 4, '#e0a46a', '#8a5226');
    g.fill();
    g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    shine(g, -1, -1.2, 1.4, 0.7, 0.6);
  }

  function drawCoin(g) {
    blob(g, 0, 0, 5.4, 5.4, shade(g, 0, 0, 5.4, 5.4, '#fff1a0', '#d99a00'), 1);
    g.strokeStyle = 'rgba(140,90,0,0.8)'; g.lineWidth = 0.8;
    g.beginPath(); g.arc(0, 0, 3.9, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(140,90,0,0.85)';
    g.beginPath(); g.ellipse(0.4, 0, 1.9, 1.2, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-1.2, 0); g.lineTo(-2.8, -1.3); g.lineTo(-2.8, 1.3); g.closePath(); g.fill();
  }

  function drawSardine(g) {
    g.rotate(-0.5);
    g.beginPath();
    g.moveTo(-6, 0); g.lineTo(-11, -4); g.lineTo(-11, 4); g.closePath();
    g.fillStyle = '#7f9bb0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    blob(g, 1, 0, 9, 4, shade(g, 1, 0, 9, 4, '#f4fbff', '#7f9bb0'), 1);
    g.strokeStyle = 'rgba(60,90,120,0.5)'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(-5, 0.5); g.lineTo(7, 0.5); g.stroke();
    blob(g, 6, -1.2, 1, 1, INK, 0);
  }

  function drawCan(g) {
    g.rotate(-0.25);
    g.fillStyle = shade(g, 0, 0, 8, 10, '#ff7a7a', '#b8323c');
    g.beginPath(); g.rect(-7, -6, 14, 12); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    blob(g, 0, -6, 7, 2.6, shade(g, 0, -6, 7, 2.6, '#ffffff', '#a6b2bd'), 1);
    blob(g, 0, 6, 7, 2.6, '#8a96a1', 1);
    g.fillStyle = '#ffe9b0';
    g.fillRect(-7, -1.5, 14, 3.5);
    drawFishTreat(g, 0.55, '#7fd3ff', '#2d86c9');
  }

  function drawCatnip(g) {
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      blob(g, Math.cos(a) * 4.5, Math.sin(a) * 4.5, 5.5, 3, shade(g, Math.cos(a) * 4.5, Math.sin(a) * 4.5, 5.5, 3, '#a6f08a', '#2e9d4a'), 1, a);
      g.strokeStyle = 'rgba(20,80,30,0.6)'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(Math.cos(a) * 1.5, Math.sin(a) * 1.5); g.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); g.stroke();
    }
    blob(g, 0, 0, 2, 2, '#e8b6ff', 0.7);
  }

  function drawHissBomb(g) {
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      const rr = i % 2 ? 7 : 11;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = shade(g, 0, 0, 11, 11, '#ffdd55', '#ff6a3d');
    g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.fillStyle = INK;
    g.font = '900 7px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HISS', 0, 0.5);
  }

  function drawBox(g) {
    // cardboard box, slightly from above, flaps open
    blob(g, 1, 10, 14, 4, 'rgba(0,0,0,0.2)', 0);
    g.fillStyle = shade(g, 0, 2, 12, 8, '#e0b07a', '#a8743f');
    g.beginPath(); g.rect(-12, -3, 24, 13); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = '#8a5a2c';
    g.beginPath(); g.moveTo(-12, -3); g.lineTo(12, -3); g.lineTo(9, -7); g.lineTo(-9, -7); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#d6a46c';
    g.beginPath(); g.moveTo(-12, -3); g.lineTo(-9, -7); g.lineTo(-15, -12); g.lineTo(-17, -6); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(12, -3); g.lineTo(9, -7); g.lineTo(15, -12); g.lineTo(17, -6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,240,200,0.75)';
    g.fillRect(-2.5, -3, 5, 13);
    g.fillStyle = '#c0392b';
    g.font = '700 6px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('♥', -7, 4);
  }

  function drawHairball(g) {
    blob(g, 0, 0, 6.5, 6.5, shade(g, 0, 0, 6.5, 6.5, '#b9a888', '#5f5240'), 0);
    g.lineWidth = 0.9;
    for (let i = 0; i < 40; i++) {
      const a = (i * 2.399) % TAU;
      const r0 = 2 + (i * 7 % 5) * 0.8;
      g.strokeStyle = i % 3 ? 'rgba(70,58,40,0.8)' : 'rgba(220,205,170,0.8)';
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a + 0.3) * (r0 + 4.5), Math.sin(a + 0.3) * (r0 + 4.5));
      g.stroke();
    }
    shine(g, -2, -2.5, 2, 1, 0.3);
  }

  function drawToyMouse(g) {
    g.strokeStyle = '#d14f6a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-10, 4, -14, 1); g.stroke();
    blob(g, -0.5, 0, 7, 4.8, shade(g, -0.5, 0, 7, 4.8, '#c9c3d6', '#7e7891'), 1);
    blob(g, 5, 0, 3.2, 3, '#a9a3bb', 1);
    for (const s of [-1, 1]) blob(g, 3, s * 3.6, 2.2, 2.2, '#ff9fbf', 0.8);
    blob(g, 8, 0, 1, 1, '#ff6a8a', 0);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(-5, -1); g.lineTo(-1, 2); g.moveTo(-3, -3); g.lineTo(0, 0); g.stroke();
  }

  function drawFishbone(g, gold) {
    const c = gold ? '#ffe28a' : '#f6f2ea';
    g.strokeStyle = INK; g.lineWidth = 3;
    const path = () => {
      g.beginPath();
      g.moveTo(-8, 0); g.lineTo(5, 0);
      for (let i = 0; i < 4; i++) { const x = -5 + i * 2.8; g.moveTo(x, -3); g.lineTo(x + 1, 0); g.lineTo(x, 3); }
      g.moveTo(-8, 0); g.lineTo(-11, -3.5); g.moveTo(-8, 0); g.lineTo(-11, 3.5);
    };
    path(); g.stroke();
    g.strokeStyle = c; g.lineWidth = 1.4; path(); g.stroke();
    blob(g, 7, 0, 3.4, 2.8, c, 1);
    blob(g, 7.8, -0.6, 0.8, 0.8, INK, 0);
  }

  function drawSushi(g) {
    blob(g, 0, 0, 7.5, 7.5, '#1f2b22', 1);
    blob(g, 0, 0, 5.8, 5.8, '#fbfbf5', 0);
    blob(g, 0, 0, 2.8, 2.8, '#ff8a5c', 0);
    blob(g, 1, -0.5, 1, 1, '#7ccf6a', 0);
  }

  function drawBottle(g) {
    g.fillStyle = 'rgba(240,248,255,0.95)';
    g.strokeStyle = INK; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-6, -4); g.lineTo(3, -4); g.lineTo(5, -2); g.lineTo(9, -2); g.lineTo(9, 2); g.lineTo(5, 2); g.lineTo(3, 4); g.lineTo(-6, 4); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#4da3ff'; g.fillRect(-4, -4, 5, 8);
    g.fillStyle = '#ff5d73'; g.fillRect(8, -2, 2.2, 4);
  }

  // Garden decorations
  function drawFlowers(g, seed) {
    const cols = [['#ffffff', '#ffd34d'], ['#ffd34d', '#e07b00'], ['#ff9fbf', '#fff3a0'], ['#b39dff', '#fff3a0'], ['#ff7a7a', '#ffe9b0']];
    const [petal, mid] = cols[seed % cols.length];
    const n = 3 + seed % 3;
    for (let k = 0; k < n; k++) {
      const x = Math.cos(k * 2.3 + seed) * (6 + k * 2.2);
      const y = Math.sin(k * 2.3 + seed) * (5 + k * 1.8);
      blob(g, x + 2, y + 3, 3, 1.4, 'rgba(40,90,30,0.35)', 0);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + k;
        blob(g, x + Math.cos(a) * 2.1, y + Math.sin(a) * 2.1, 1.7, 1.7, petal, 0.5);
      }
      blob(g, x, y, 1.2, 1.2, mid, 0);
    }
  }

  function drawClover(g) {
    for (let k = 0; k < 4; k++) {
      const x = (k % 2) * 9 - 4, y = Math.floor(k / 2) * 7 - 3;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU - 0.5;
        blob(g, x + Math.cos(a) * 2, y + Math.sin(a) * 2, 2, 2, '#4f9e3a', 0);
      }
    }
  }

  function drawPebbles(g, seed) {
    for (let k = 0; k < 3 + seed % 3; k++) {
      const x = Math.cos(k * 1.9 + seed) * 7, y = Math.sin(k * 2.7 + seed) * 5;
      const r = 1.8 + (k * 13 + seed) % 3;
      blob(g, x + 0.8, y + 1, r, r * 0.8, 'rgba(0,0,0,0.15)', 0);
      blob(g, x, y, r, r * 0.8, shade(g, x, y, r, r, '#e8e3da', '#9d978c'), 0.6);
    }
  }

  function drawMushroom(g) {
    blob(g, 1.5, 2, 6, 5, 'rgba(0,0,0,0.18)', 0);
    blob(g, 0, 0, 6, 6, shade(g, 0, 0, 6, 6, '#ff7a6a', '#c0302a'), 0.9);
    for (const [x, y, r] of [[-2, -2, 1.3], [2, -1, 1], [0, 2.4, 1.1], [-3, 1.5, 0.8], [3, 2, 0.7]]) blob(g, x, y, r, r, '#fff', 0);
  }

  function drawLeaf(g, seed) {
    g.rotate(seed);
    const c = ['#e0a040', '#d0603a', '#c9b040'][seed % 3];
    g.beginPath();
    g.moveTo(-7, 0); g.quadraticCurveTo(0, -5, 7, 0); g.quadraticCurveTo(0, 5, -7, 0);
    g.fillStyle = c; g.fill();
    g.strokeStyle = 'rgba(90,40,10,0.6)'; g.lineWidth = 0.6;
    g.stroke();
    g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
  }

  function drawTuft(g) {
    g.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) {
      const x = (i - 4) * 1.6;
      g.strokeStyle = i % 2 ? '#4f8f36' : '#5ea843';
      g.beginPath(); g.moveTo(x, 4); g.quadraticCurveTo(x + (i - 4) * 0.4, -1, x + (i - 4) * 0.9, -5 - (i % 3) * 1.5); g.stroke();
    }
  }

  function drawStone(g) {
    blob(g, 1.5, 2, 14, 10, 'rgba(0,0,0,0.15)', 0);
    blob(g, 0, 0, 14, 10, shade(g, 0, 0, 14, 10, '#e2ddd2', '#a39d92'), 0.8);
    shine(g, -4, -3, 5, 2, 0.25);
    g.strokeStyle = 'rgba(80,70,60,0.3)'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(-6, 3); g.lineTo(2, 1); g.lineTo(8, 4); g.stroke();
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------
  SV.createArt = function (mainCtx) {
    const enemy = {};
    for (const [type, def] of Object.entries(SV.ENEMIES)) {
      const frames = [];
      const flashes = [];
      const n = def.prop ? 1 : 4;
      for (let f = 0; f < n; f++) {
        const c = bake(def.size, (g) => DRAW[type](g, f));
        frames.push(c);
        flashes.push(flashOf(c));
      }
      enemy[type] = { frames, flashes, size: def.size };
    }

    const item = {
      xp1: { c: bake(5, drawKibble), size: 5 },
      xp2: { c: bake(9, (g) => drawFishTreat(g, 1, '#9fe0ff', '#2d86c9')), size: 9 },
      xp3: { c: bake(10, (g) => drawFishTreat(g, 1.15, '#fff1a0', '#e0a000')), size: 10 },
      xp4: { c: bake(14, (g) => drawFishTreat(g, 1.6, '#ffb3d9', '#c03a8a')), size: 14 },
      coin: { c: bake(6, drawCoin), size: 6 },
      sardine: { c: bake(13, drawSardine), size: 13 },
      can: { c: bake(12, drawCan), size: 12 },
      catnip: { c: bake(10, drawCatnip), size: 10 },
      hiss: { c: bake(12, drawHissBomb), size: 12 },
      box: { c: bake(18, drawBox), size: 18 },
      hairball: { c: bake(11, drawHairball), size: 11 },
      toymouse: { c: bake(15, drawToyMouse), size: 15 },
      fishbone: { c: bake(12, (g) => drawFishbone(g, false)), size: 12 },
      sushi: { c: bake(9, drawSushi), size: 9 },
      bottle: { c: bake(11, drawBottle), size: 11 },
    };

    const decor = [];
    for (let s = 0; s < 5; s++) decor.push({ c: bake(18, (g) => drawFlowers(g, s)), size: 18 });
    decor.push({ c: bake(12, drawClover), size: 12 });
    for (let s = 0; s < 3; s++) decor.push({ c: bake(12, (g) => drawPebbles(g, s)), size: 12 });
    decor.push({ c: bake(8, drawMushroom), size: 8 });
    for (let s = 0; s < 3; s++) decor.push({ c: bake(9, (g) => drawLeaf(g, s)), size: 9 });
    for (let s = 0; s < 3; s++) decor.push({ c: bake(9, drawTuft), size: 9 });
    decor.push({ c: bake(16, drawStone), size: 16 });

    // Seamless lawn tile
    const TILE = 256, GRES = 2;
    const tile = makeCanvas(TILE * GRES, TILE * GRES);
    const tg = tile.getContext('2d');
    tg.scale(GRES, GRES);
    tg.fillStyle = '#79b957';
    tg.fillRect(0, 0, TILE, TILE);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const wrap = (fn, x, y, r) => {
      for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) {
        if (x + ox + r < 0 || x + ox - r > TILE || y + oy + r < 0 || y + oy - r > TILE) continue;
        fn(x + ox, y + oy);
      }
    };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * TILE, y = rnd() * TILE, r = 20 + rnd() * 40;
      const col = rnd() < 0.5 ? 'rgba(140,200,100,0.22)' : 'rgba(90,160,70,0.22)';
      wrap((px, py) => { tg.fillStyle = col; tg.beginPath(); tg.arc(px, py, r, 0, TAU); tg.fill(); }, x, y, r);
    }
    const blades = ['#5f9e41', '#8ccf66', '#6db34c', '#94d46f', '#679f45'];
    tg.lineCap = 'round';
    for (let i = 0; i < 1100; i++) {
      const x = rnd() * TILE, y = rnd() * TILE;
      const len = 2.5 + rnd() * 3.5, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const col = blades[Math.floor(rnd() * blades.length)];
      wrap((px, py) => {
        tg.strokeStyle = col; tg.lineWidth = 0.9;
        tg.beginPath(); tg.moveTo(px, py); tg.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); tg.stroke();
      }, x, y, 8);
    }
    let ground = mainCtx.createPattern(tile, 'repeat');
    let groundScale = GRES;
    if (!ground.setTransform || typeof DOMMatrix === 'undefined') {
      // older browsers: fall back to a 1:1 tile
      const t1 = makeCanvas(TILE, TILE);
      t1.getContext('2d').drawImage(tile, 0, 0, TILE, TILE);
      ground = mainCtx.createPattern(t1, 'repeat');
      groundScale = 1;
    } else {
      ground.setTransform(new DOMMatrix([1 / GRES, 0, 0, 1 / GRES, 0, 0]));
    }

    return { RES, enemy, item, decor, ground, groundScale, TILE };
  };
})();
