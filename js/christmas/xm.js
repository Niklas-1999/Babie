// Christmas Advent calendar: 24 doors, each hides a tiny minigame and a word.
// This file has the calendar logic (dates, doors, saving), shared Christmas drawings
// and the runner that plays the minigames. The games live in games1..4.js.
(() => {
  'use strict';
  const XM = (window.XM = window.XM || { games: {} });

  XM.YEAR = 2026;                       // the calendar's December
  XM.TIME_ZONE = 'Europe/Berlin';
  XM.MASTER = 'niklas';                 // this account can open every door any time
  XM.EVENT_TAG = 'xmas2026';            // see game.js: everyone is moved to the Christmas theme once
  XM.MUSIC = ['music/christmas_1.mp3', 'music/christmas_2.mp3', 'music/christmas_3.mp3', 'music/christmas_4.mp3'];

  // The word behind each door (from Niklas's real calendar)
  XM.WORDS = [
    'babie', 'bärchen', 'popärchen', 'fröschchen', 'füchschen', 'sternchen', 'kerzchen', 'märchen',
    'bäumchen', 'träumchen', 'mäuschen', 'prinzesschen', 'schneckchen', 'fürzchen', 'liebchen', 'häschen',
    'schmerchen', 'schnäufchen', 'häuschen', 'kätzchen', 'cutisiewutsiechen', 'schönchen', 'mimöschen', 'schatz',
  ];

  // Doors are shuffled like on a real calendar (this is the order on screen)
  XM.LAYOUT = [14, 3, 22, 8, 1, 17, 10, 19, 5, 12, 23, 7, 20, 2, 16, 9, 6, 13, 4, 21, 11, 18, 15, 24];

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  // Today's date in Germany, as a UTC day number
  XM.today = function () {
    try {
      const s = new Intl.DateTimeFormat('en-CA', { timeZone: XM.TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const [y, m, d] = s.split('-').map(Number);
      if (y && m && d) return Date.UTC(y, m - 1, d);
    } catch (e) { /* old browser: fall back to the device date */ }
    const n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  };
  XM.daysLeft = (day) => Math.round((Date.UTC(XM.YEAR, 11, day) - XM.today()) / 86400000);

  // ---------------------------------------------------------------------------
  // Christmas drawings shared by the minigames (all centered on x, y unless noted)
  // ---------------------------------------------------------------------------
  const INK = '#2a1a14';
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const art = (XM.art = {
    rr,
    gift(ctx, x, y, w, h, color, ribbon) {
      const x0 = x - w / 2, y0 = y - h / 2;
      rr(ctx, x0, y0, w, h, Math.min(w, h) * 0.12);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(40,10,10,0.55)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0 + 3, y0 + 3, w - 6, h * 0.18);
      ctx.fillStyle = ribbon || '#ffd23f';
      ctx.fillRect(x - w * 0.08, y0, w * 0.16, h);
      ctx.fillRect(x0, y - h * 0.08, w, h * 0.16);
      // bow
      const b = Math.min(w, h) * 0.22;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(x + s * b * 0.8, y0 - b * 0.3, b * 0.75, b * 0.45, s * 0.5, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y0 - b * 0.15, b * 0.3, 0, TAU); ctx.fill();
    },
    bauble(ctx, x, y, r, color, plain) {
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(x - r * 0.28, y - r * 1.18, r * 0.56, r * 0.34);
      ctx.strokeStyle = '#c9a227'; ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.arc(x, y - r * 1.3, r * 0.16, 0, TAU); ctx.stroke();
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, color); g.addColorStop(1, shade(color, -0.45));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (!plain) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + r * 0.1); ctx.quadraticCurveTo(x, y + r * 0.45, x + r * 0.9, y + r * 0.1); ctx.stroke();
      }
    },
    star(ctx, x, y, r, fill, rot = 0, points = 5, inner = 0.45) {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = rot - Math.PI / 2 + i * Math.PI / points;
        const rr2 = i % 2 ? r * inner : r;
        ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
      }
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    },
    snowflake(ctx, x, y, r, rot, color = '#ffffff') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, r * 0.14); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6, c = Math.cos(a), s = Math.sin(a);
        ctx.moveTo(0, 0); ctx.lineTo(c * r, s * r);
        const bx = c * r * 0.55, by = s * r * 0.55;
        for (const d of [-0.6, 0.6]) { ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + d) * r * 0.3, by + Math.sin(a + d) * r * 0.3); }
      }
      ctx.stroke(); ctx.restore();
    },
    // tree with its base (trunk bottom) at (x, base); returns the triangle used for hit tests
    tree(ctx, x, base, h, t = 0) {
      ctx.fillStyle = '#6b3f1f';
      ctx.fillRect(x - h * 0.06, base - h * 0.12, h * 0.12, h * 0.12);
      const tiers = [[0.12, 0.42, 0.42], [0.36, 0.34, 0.34], [0.58, 0.26, 0.28]];
      for (const [b, hw, th] of tiers) {
        const yb = base - h * b, yt = yb - h * th * 1.25;
        ctx.fillStyle = '#1f7a3e';
        ctx.beginPath(); ctx.moveTo(x - h * hw, yb); ctx.lineTo(x, yt); ctx.lineTo(x + h * hw, yb); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const u = i / 8;
          ctx.lineTo(x - h * hw + u * h * hw * 2, yb + (i % 2 ? h * 0.025 : -h * 0.005));
        }
        ctx.lineTo(x + h * hw, yb - h * 0.03); ctx.lineTo(x - h * hw, yb - h * 0.03); ctx.closePath(); ctx.fill();
      }
      return { x, top: base - h * 0.95, base: base - h * 0.12, half: h * 0.42 };
    },
    insideTree(tr, px, py) {
      if (py < tr.top || py > tr.base) return false;
      const u = (py - tr.top) / (tr.base - tr.top);
      return Math.abs(px - tr.x) < tr.half * u + 6;
    },
    snowman(ctx, x, base, s, p = {}) {
      const ball = (cy, r) => {
        const g = ctx.createRadialGradient(x - r * 0.3, cy - r * 0.3, r * 0.1, x, cy, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9d8ee');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(80,100,140,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      };
      const r1 = s * 0.5, r2 = s * 0.38, r3 = s * 0.28;
      const c1 = base - r1, c2 = c1 - r1 - r2 * 0.7, c3 = c2 - r2 - r3 * 0.7;
      ball(c1, r1); ball(c2, r2); ball(c3, r3);
      const pts = { head: [x, c3], neck: [x, c2 - r2 * 0.75], face: [x, c3 + r3 * 0.1], top: [x, c3 - r3], body: [x, c2] };
      if (p.buttons !== false) { ctx.fillStyle = '#2a2a2a'; for (const k of [-0.35, 0, 0.35]) { ctx.beginPath(); ctx.arc(x, c2 + k * r2, r2 * 0.08, 0, TAU); ctx.fill(); } }
      if (p.eyes) { ctx.fillStyle = '#1a1a1a'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(x + k * r3 * 0.35, c3 - r3 * 0.2, r3 * 0.11, 0, TAU); ctx.fill(); } }
      if (p.nose) { ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(x, c3 - r3 * 0.05); ctx.lineTo(x + r3 * 0.75, c3 + r3 * 0.08); ctx.lineTo(x, c3 + r3 * 0.2); ctx.closePath(); ctx.fill(); }
      if (p.scarf) art.scarf(ctx, x, c2 - r2 * 0.75, r2 * 1.7);
      if (p.hat) art.hat(ctx, x, c3 - r3 * 0.8, r3 * 1.6);
      return pts;
    },
    hat(ctx, x, y, s) {
      ctx.fillStyle = '#1d1d24';
      ctx.fillRect(x - s * 0.55, y, s * 1.1, s * 0.14);
      ctx.fillRect(x - s * 0.36, y - s * 0.62, s * 0.72, s * 0.66);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(x - s * 0.36, y - s * 0.14, s * 0.72, s * 0.12);
    },
    scarf(ctx, x, y, s) {
      ctx.fillStyle = '#d62839';
      rr(ctx, x - s * 0.5, y - s * 0.09, s, s * 0.2, s * 0.08); ctx.fill();
      ctx.fillRect(x + s * 0.18, y, s * 0.17, s * 0.45);
      ctx.fillStyle = '#2f9e4f';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - s * 0.4 + i * s * 0.25, y - s * 0.09, s * 0.07, s * 0.2);
    },
    carrot(ctx, x, y, s) {
      ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(x - s * 0.5, y - s * 0.12); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x - s * 0.5, y + s * 0.12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3d9a3d'; ctx.fillRect(x - s * 0.62, y - s * 0.1, s * 0.14, s * 0.2);
    },
    coal(ctx, x, y, s) {
      ctx.fillStyle = '#1a1a1a';
      for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(x + k * s * 0.3, y, s * 0.15, 0, TAU); ctx.fill(); }
    },
    candyCane(ctx, x, y, len, rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); ctx.moveTo(0, len * 0.5); ctx.lineTo(0, -len * 0.25); ctx.arc(len * 0.18, -len * 0.25, len * 0.18, Math.PI, 0); };
      ctx.lineWidth = len * 0.16; ctx.strokeStyle = '#fff'; path(); ctx.stroke();
      ctx.setLineDash([len * 0.1, len * 0.1]); ctx.strokeStyle = '#e63946'; path(); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    },
    // bake: 0 raw dough, 1 golden, 1.5+ burnt
    cookie(ctx, x, y, r, bake) {
      const b = clamp(bake, 0, 1.6);
      const raw = [240, 216, 170], gold = [205, 135, 60], burnt = [70, 40, 25];
      const c = b < 1 ? raw.map((v, i) => lerp(v, gold[i], b)) : gold.map((v, i) => lerp(v, burnt[i], (b - 1) / 0.6));
      ctx.fillStyle = `rgb(${c.map(Math.round).join(',')})`;
      // gingerbread cat shape: head, ears, body
      ctx.beginPath(); ctx.arc(x, y - r * 0.45, r * 0.5, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * 0.45, y - r * 0.65); ctx.lineTo(x + s * r * 0.4, y - r * 1.15); ctx.lineTo(x + s * r * 0.1, y - r * 0.88); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 0.55, r * 0.6, 0, 0, TAU); ctx.fill();
      if (b > 0.6 && b < 1.3) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, r * 0.07); ctx.lineCap = 'round';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * 0.18, y - r * 0.5, r * 0.05, 0, TAU); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y - r * 0.4, r * 0.15, 0.2, Math.PI - 0.2); ctx.stroke();
        for (const k of [0.15, 0.45]) { ctx.beginPath(); ctx.arc(x, y + r * k, r * 0.05, 0, TAU); ctx.stroke(); }
      }
    },
    bell(ctx, x, y, s, rot, color = '#ffc93c') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.55); ctx.quadraticCurveTo(-s * 0.45, -s * 0.5, 0, -s * 0.55); ctx.quadraticCurveTo(s * 0.45, -s * 0.5, s * 0.5, s * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(color, -0.25); ctx.fillRect(-s * 0.58, s * 0.48, s * 1.16, s * 0.14);
      ctx.beginPath(); ctx.arc(0, s * 0.68, s * 0.13, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.1, s * 0.08, s * 0.3, 0.2, 0, TAU); ctx.fill();
      ctx.restore();
    },
    stocking(ctx, x, y, s, color = '#d62839') {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.4); ctx.lineTo(x + s * 0.2, y - s * 0.4); ctx.lineTo(x + s * 0.2, y + s * 0.15);
      ctx.quadraticCurveTo(x + s * 0.55, y + s * 0.2, x + s * 0.5, y + s * 0.45); ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.6, x - s * 0.3, y + s * 0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f6f1e9'; rr(ctx, x - s * 0.36, y - s * 0.58, s * 0.62, s * 0.22, s * 0.08); ctx.fill();
    },
    mug(ctx, x, y, s, fill) {
      ctx.lineWidth = s * 0.08; ctx.strokeStyle = '#f6f1e9';
      ctx.beginPath(); ctx.arc(x + s * 0.5, y, s * 0.2, -1.2, 1.2); ctx.stroke();
      ctx.fillStyle = '#c0392b'; rr(ctx, x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.95, s * 0.12); ctx.fill();
      ctx.fillStyle = '#4a2a1a';
      const top = y - s * 0.38, bottom = y + s * 0.42;
      const level = bottom - (bottom - top) * clamp(fill, 0, 1.1);
      ctx.fillRect(x - s * 0.38, level, s * 0.76, bottom - level);
      ctx.fillStyle = '#f6f1e9'; for (let i = 0; i < 5; i++) ctx.fillRect(x - s * 0.4 + i * s * 0.18, y + s * 0.12, s * 0.08, s * 0.08);
    },
    // house with its bottom at base; returns the chimney top center
    house(ctx, x, base, w, h, color = '#b5553c') {
      ctx.fillStyle = color; ctx.fillRect(x - w / 2, base - h, w, h);
      const cx = x + w * 0.22, ct = base - h - h * 0.75;
      ctx.fillStyle = '#7a3b2e'; ctx.fillRect(cx - w * 0.09, ct, w * 0.18, h * 0.6);
      ctx.fillStyle = '#f4f7fb'; ctx.fillRect(cx - w * 0.11, ct - 4, w * 0.22, 6);
      ctx.fillStyle = '#4a2b3a';
      ctx.beginPath(); ctx.moveTo(x - w * 0.6, base - h); ctx.lineTo(x, base - h - h * 0.6); ctx.lineTo(x + w * 0.6, base - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4f7fb';
      ctx.beginPath(); ctx.moveTo(x - w * 0.62, base - h + 2); ctx.lineTo(x, base - h - h * 0.62); ctx.lineTo(x + w * 0.62, base - h + 2); ctx.lineTo(x + w * 0.5, base - h + 6); ctx.lineTo(x, base - h - h * 0.48); ctx.lineTo(x - w * 0.5, base - h + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd66b';
      ctx.fillRect(x - w * 0.3, base - h * 0.7, w * 0.2, h * 0.25); ctx.fillRect(x + w * 0.1, base - h * 0.7, w * 0.2, h * 0.25);
      ctx.fillStyle = '#5a2f1f'; ctx.fillRect(x - w * 0.08, base - h * 0.38, w * 0.16, h * 0.38);
      return { x: cx, y: ct, w: w * 0.18 };
    },
    sack(ctx, x, y, s) {
      ctx.fillStyle = '#b5543c';
      ctx.beginPath(); ctx.moveTo(x - s * 0.35, y - s * 0.35); ctx.quadraticCurveTo(x - s * 0.6, y + s * 0.5, x, y + s * 0.5); ctx.quadraticCurveTo(x + s * 0.6, y + s * 0.5, x + s * 0.35, y - s * 0.35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a3a2a'; ctx.beginPath(); ctx.ellipse(x, y - s * 0.35, s * 0.36, s * 0.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - s * 0.38, y - s * 0.28, s * 0.76, s * 0.06);
    },
    icicle(ctx, x, y, len) {
      const g = ctx.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, '#e8f6ff'); g.addColorStop(1, '#9fd3f5');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - len * 0.18, y); ctx.lineTo(x + len * 0.18, y); ctx.lineTo(x, y + len); ctx.closePath(); ctx.fill();
    },
    toyMouse(ctx, x, y, s) {
      ctx.strokeStyle = '#d14f6a'; ctx.lineWidth = s * 0.08;
      ctx.beginPath(); ctx.moveTo(x - s * 0.4, y); ctx.quadraticCurveTo(x - s * 0.7, y + s * 0.3, x - s * 0.9, y + s * 0.05); ctx.stroke();
      ctx.fillStyle = '#b9b3c9'; ctx.beginPath(); ctx.ellipse(x, y, s * 0.45, s * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff9fbf'; ctx.beginPath(); ctx.arc(x + s * 0.2, y - s * 0.25, s * 0.13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.05, s * 0.05, 0, TAU); ctx.fill();
    },
  });

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round(lerp(r, f, p)); g = Math.round(lerp(g, f, p)); b = Math.round(lerp(b, f, p));
    return `rgb(${r},${g},${b})`;
  }
  art.shade = shade;

  // Backgrounds -----------------------------------------------------------------
  const skyStars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.6, r: rand(0.6, 1.8), p: rand(0, TAU) }));
  art.night = function (ctx, w, h, t, ground = 0.82) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1530'); g.addColorStop(0.6, '#1d3561'); g.addColorStop(1, '#3d5d92');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (const s of skyStars) {
      ctx.globalAlpha = 0.4 + 0.5 * Math.sin(t * 2 + s.p);
      ctx.fillStyle = '#fff8e0'; ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    const mx = w * 0.82, my = h * 0.16, mr = Math.min(w, h) * 0.07;
    const mg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
    mg.addColorStop(0, 'rgba(255,245,210,0.35)'); mg.addColorStop(1, 'rgba(255,245,210,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr * 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    // snowy hills
    const gy = h * ground;
    ctx.fillStyle = '#c9d9f0';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, gy - 30 - Math.sin(x * 0.012) * 18 - Math.sin(x * 0.031) * 8);
    ctx.lineTo(w, h); ctx.fill();
    ctx.fillStyle = '#eef4fc';
    ctx.fillRect(0, gy, w, h - gy);
    return gy;
  };
  art.room = function (ctx, w, h, t, floor = 0.8) {
    ctx.fillStyle = '#7a1f2b'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < w; x += 36) ctx.fillRect(x, 0, 14, h);
    const fy = h * floor;
    ctx.fillStyle = '#6b4226'; ctx.fillRect(0, fy, w, h - fy);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = (fy * 0.7) % 80; x < w; x += 80) ctx.fillRect(x, fy, 3, h - fy);
    ctx.fillStyle = '#4a2b17'; ctx.fillRect(0, fy, w, 6);
    // garland with lights along the ceiling
    ctx.strokeStyle = '#1f6b37'; ctx.lineWidth = 8;
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 10) ctx.lineTo(x, 74 + Math.sin(x / 60) * 10);
    ctx.stroke();
    const cols = ['#ff5d5d', '#ffd23f', '#5dd39e', '#5db4ff', '#c58bff'];
    for (let i = 0, x = 10; x < w; x += 34, i++) {
      const on = Math.sin(t * 3 + i * 1.3) > -0.3;
      ctx.fillStyle = on ? cols[i % cols.length] : 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(x, 82 + Math.sin(x / 60) * 10, 4, 6, 0, 0, TAU); ctx.fill();
    }
    return fy;
  };

  // ---------------------------------------------------------------------------
  // Runner + calendar UI
  // ---------------------------------------------------------------------------
  XM.create = function (api) {
    const { canvas, ctx, view, audio, store } = api;
    const $ = (id) => document.getElementById(id);
    const tr = window.I18N.t;
    const sfx = api.sfx;

    let mode = 'off';           // off | run
    let day = 0;
    let cat = 'mallow';
    let game = null;
    let state = 'play';         // play | won | failed
    let stateT = 0;
    let paused = false;
    let t = 0;
    let parts = [], texts = [], banners = [], flakes = [];
    let shakeA = 0;
    let pointerId = null;
    let reveal = 0;             // door to animate open when we're back on the calendar

    const opened = () => store.get('xmDoors', {}) || {};
    const isMaster = () => !!(store.current && !store.guest && store.current.key === XM.MASTER);

    // ------------------------------------------------------------------------
    // env: what every minigame can use
    // ------------------------------------------------------------------------
    const env = {
      ctx, sfx, tr, art, TAU, clamp, lerp, rand,
      get w() { return view.cssW; },
      get h() { return view.cssH; },
      get u() { return Math.min(view.cssW, view.cssH) / 100; },
      get t() { return t; },
      get cat() { return cat; },
      top: 72,                      // keep the HUD row free
      dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
      progress(n, total) { setInfo(Math.min(n, total) + ' / ' + total); },
      info(s) { setInfo(s); },
      win() {
        if (state !== 'play') return;
        state = 'won'; stateT = 0;
        sfx.levelUp();
        env.confetti(env.w / 2, env.h * 0.45);
        banners.push({ text: tr('xm.win'), color: '#ffd23f', t: 0, life: 9 });
      },
      fail() {
        if (state !== 'play') return;
        state = 'failed'; stateT = 0;
        sfx.hurt();
        banners.push({ text: tr('xm.again'), color: '#ff8fa3', t: 0, life: 9 });
      },
      say(text, color) { banners.push({ text, color: color || '#fff', t: 0, life: 1.2, small: true }); },
      shake(a) { shakeA = Math.min(12, shakeA + a); },
      burst(x, y, n, color, speed, o = {}) {
        for (let i = 0; i < n && parts.length < 400; i++) {
          const a = o.dir != null ? o.dir + rand(-(o.spread || 0.6), o.spread || 0.6) : rand(0, TAU);
          const s = speed * rand(0.35, 1);
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.35, 0.8) * (o.life || 1), r: rand(1.5, 3.5) * (o.size || 1), c: color, g: o.grav || 0, star: !!o.star, flake: !!o.flake });
        }
      },
      sparkle(x, y, color) { env.burst(x, y, 10, color || '#fff3b0', 150, { star: true }); },
      confetti(x, y) {
        const cols = ['#ff5d5d', '#ffd23f', '#5dd39e', '#5db4ff', '#ffffff', '#ff9fbf'];
        for (let i = 0; i < 70; i++) env.burst(x, y, 1, cols[i % cols.length], 420, { dir: -Math.PI / 2, spread: 1.3, grav: 600, life: 2, size: 1.4, star: i % 3 === 0 });
      },
      text(x, y, s, color, size) { texts.push({ x, y, s, color: color || '#fff', size: size || 1, t: 0 }); },
      drawCat(pose, x, y, h, o = {}) {
        const set = api.sprites[cat];
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
      // a cat that follows the finger left/right along the bottom (used by catch/dodge games)
      walker(y, speed = 700) {
        const c = { x: view.cssW / 2, y, target: null, facing: 1, walkT: 0, moving: false };
        c.update = (dt) => {
          let dir = 0;
          if (keys.left) dir -= 1;
          if (keys.right) dir += 1;
          let tx = c.target;
          if (dir) tx = c.x + dir * 400;
          c.moving = false;
          if (tx != null) {
            const d = clamp(tx, 30, view.cssW - 30) - c.x;
            if (Math.abs(d) > 3) {
              const step = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
              c.x += step; c.facing = Math.sign(d); c.moving = true; c.walkT += dt * 9;
            }
          }
        };
        c.draw = (h) => env.drawCat(c.moving ? 'walk' : 'idle', c.x, c.y, h, { frame: c.walkT, flip: c.facing < 0 });
        return c;
      },
    };
    const keys = { left: false, right: false };

    function setInfo(s) {
      if (hud.info !== s) { hud.info = s; $('xm-info').textContent = s; }
    }
    const hud = {};

    // ------------------------------------------------------------------------
    // Running a minigame
    // ------------------------------------------------------------------------
    function start(d, catKey) {
      day = d;
      cat = catKey;
      newGame();
      mode = 'run';
      paused = false;
      showXm(null);
      api.showScreen(null);
      $('xm-hud').classList.remove('hidden');
      $('xm-day').textContent = tr('xm.door', { n: day });
      $('xm-hint-text').textContent = tr('xm.g' + day + '.hint');
      $('xm-hint').classList.remove('fade');
      setTimeout(() => $('xm-hint').classList.add('fade'), 3200);
      if (api.onRunChange) api.onRunChange();
    }

    function newGame() {
      state = 'play';
      stateT = 0;
      t = 0;
      parts = []; texts = []; banners = [];
      shakeA = 0;
      pointerId = null;
      hud.info = null;
      setInfo('');
      flakes = [];
      const def = XM.games[day];
      game = def.make(env);
      if (def.snow) for (let i = 0; i < 40; i++) flakes.push(newFlake(true));
    }

    function newFlake(anywhere) {
      return { x: Math.random() * view.cssW, y: anywhere ? Math.random() * view.cssH : -10, r: rand(1, 3.2), s: rand(20, 55), p: rand(0, TAU) };
    }

    function quit() {
      if (mode === 'off') return;
      mode = 'off';
      game = null;
      showXm(null);
      $('xm-hud').classList.add('hidden');
      if (api.onRunChange) api.onRunChange();
    }

    function finishWin() {
      const doors = Object.assign({}, opened());
      const first = !doors[day];
      if (first) {
        doors[day] = Date.now();
        store.set('xmDoors', doors);
        reveal = day;
      }
      quit();
      api.toHub();
    }

    function pause() {
      if (mode !== 'run' || paused || state !== 'play') return;
      paused = true;
      pointerId = null;
      keys.left = keys.right = false;
      showXm('xm-pause');
    }
    function resume() { paused = false; showXm(null); }

    const SCREENS = ['xm-pause', 'xm-modal'];
    function showXm(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }

    function frame(dt) {
      if (mode !== 'run' || !game) return;
      const frozen = paused || (api.blocked && api.blocked());
      if (!frozen) {
        t += dt;
        stateT += dt;
        if (state === 'play' || state === 'won') game.update(dt);
        shakeA = Math.max(0, shakeA - dt * 30);
        for (const q of parts) { q.t += dt; q.vx *= Math.exp(-2 * dt); q.vy = q.vy * Math.exp(-2 * dt) + q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
        if (parts.length && parts.some((q) => q.t >= q.life)) parts = parts.filter((q) => q.t < q.life);
        for (const f of texts) f.t += dt;
        if (texts.length) texts = texts.filter((f) => f.t < 0.9);
        for (const b of banners) b.t += dt;
        banners = banners.filter((b) => b.t < b.life);
        for (const f of flakes) {
          f.y += f.s * dt; f.x += Math.sin(t + f.p) * 12 * dt;
          if (f.y > view.cssH + 5) Object.assign(f, newFlake(false));
        }
        if (state === 'won' && stateT > 1.9) { finishWin(); return; }
        if (state === 'failed' && stateT > 1.4) newGame();
      }
      const s = view.dpr;
      const sx = shakeA ? rand(-1, 1) * shakeA : 0, sy = shakeA ? rand(-1, 1) * shakeA : 0;
      ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
      game.render();
      // snowfall, effects and banners on top
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of flakes) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); }
      drawFx();
      drawBanners();
    }

    function drawFx() {
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
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      for (const f of texts) {
        const u = f.t / 0.9;
        ctx.globalAlpha = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
        ctx.font = `700 ${(15 * f.size).toFixed(1)}px Fredoka, system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20, 10, 30, 0.8)';
        ctx.strokeText(f.s, f.x, f.y - f.t * 34);
        ctx.fillStyle = f.color; ctx.fillText(f.s, f.x, f.y - f.t * 34);
      }
      ctx.globalAlpha = 1;
    }

    function drawBanners() {
      for (const b of banners) {
        const pop = b.t < 0.15 ? 0.5 + b.t / 0.15 * 0.6 : 1.1 - Math.min(0.1, (b.t - 0.15));
        const fade = b.life - b.t < 0.3 ? (b.life - b.t) / 0.3 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(view.cssW / 2, view.cssH * (b.small ? 0.3 : 0.42));
        ctx.scale(pop, pop);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const size = Math.round(Math.min(view.cssW, view.cssH) * (b.small ? 0.08 : 0.13));
        ctx.font = `700 ${size}px "Mountains of Christmas", Fredoka, sans-serif`;
        ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(30, 10, 20, 0.85)';
        ctx.strokeText(b.text, 0, 0);
        ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
        ctx.restore();
      }
    }

    // ------------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------------
    const playing = () => mode === 'run' && !paused && state === 'play' && !(api.blocked && api.blocked());
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
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
      if (playing() && game.key && game.key(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    $('xm-btn-pause').addEventListener('click', pause);
    $('xm-btn-sound').addEventListener('click', () => { api.setMuted(!audio.muted); syncSound(); });
    $('xm-resume').addEventListener('click', resume);
    $('xm-restart').addEventListener('click', () => { paused = false; showXm(null); newGame(); });
    $('xm-quit').addEventListener('click', () => { quit(); api.toHub(); });
    function syncSound() { $('xm-btn-sound').classList.toggle('muted', audio.muted); }

    // ------------------------------------------------------------------------
    // The calendar on the hub
    // ------------------------------------------------------------------------
    const DOOR_STYLES = ['red', 'green', 'cream', 'blue', 'gold', 'plaid'];
    const DECOR = ['❄️', '🎄', '⭐', '🎁', '🔔', '🍬', '🧦', '⛄'];
    let built = false;

    function build() {
      const box = $('xm-doors');
      box.innerHTML = '';
      XM.LAYOUT.forEach((d, i) => {
        const b = document.createElement('button');
        b.className = 'xm-door style-' + (d === 24 ? 'gold24' : DOOR_STYLES[(d * 7 + i) % DOOR_STYLES.length]);
        b.dataset.day = d;
        b.innerHTML =
          '<span class="xm-door-back"><span class="xm-word"></span></span>' +
          '<span class="xm-door-front"><span class="xm-snowcap"></span><span class="xm-num">' + d + '</span>' +
          '<span class="xm-deco">' + DECOR[(d * 5) % DECOR.length] + '</span><span class="xm-knob"></span></span>';
        const word = XM.WORDS[d - 1];
        const w = b.querySelector('.xm-word');
        w.textContent = word;
        w.style.setProperty('--len', String(word.length));
        b.addEventListener('click', () => onDoor(d, b));
        box.appendChild(b);
      });
      built = true;
    }

    function refresh() {
      if (!built) build();
      const doors = opened();
      const master = isMaster();
      let count = 0;
      document.querySelectorAll('.xm-door').forEach((b) => {
        const d = Number(b.dataset.day);
        const left = XM.daysLeft(d);
        const isOpen = !!doors[d];
        if (isOpen) count++;
        b.classList.toggle('open', isOpen && d !== reveal);
        b.classList.toggle('today', left === 0 && !isOpen);
        b.classList.toggle('ready', (left <= 0 || master) && !isOpen);
        b.classList.toggle('locked', left > 0 && !master && !isOpen);
      });
      $('player-xm').textContent = count + ' / 24';
      fitWords();
      if (reveal) {
        const d = reveal;
        reveal = 0;
        const b = document.querySelector('.xm-door[data-day="' + d + '"]');
        if (b) {
          b.classList.remove('open');
          setTimeout(() => {
            b.classList.add('open', 'opening');
            if (sfx) sfx.chest();
            b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            setTimeout(() => b.classList.remove('opening'), 1600);
          }, 450);
        }
      }
    }

    // shrink each word so it fits on one line inside its door
    function fitWords() {
      document.querySelectorAll('.xm-door').forEach((b) => {
        const w = b.querySelector('.xm-word');
        const avail = b.clientWidth - 10;
        if (avail <= 0) return;
        w.style.fontSize = '';
        const base = Math.min(26, b.clientHeight * 0.32);
        w.style.fontSize = base + 'px';
        const need = w.scrollWidth;
        if (need > avail) w.style.fontSize = Math.max(8, base * avail / need) + 'px';
      });
    }
    window.addEventListener('resize', () => { if (built) setTimeout(fitWords, 60); });

    function onDoor(d, el) {
      api.plop(el);
      const left = XM.daysLeft(d);
      const isOpen = !!opened()[d];
      if (left > 0 && !isMaster() && !isOpen) {
        el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
        api.floatText(el, left === 1 ? tr('xm.dayLeft') : tr('xm.daysLeft', { n: left }));
        return;
      }
      openModal(d, isOpen);
    }

    let modalDay = 0;
    function openModal(d, isOpen) {
      modalDay = d;
      $('xm-m-day').textContent = tr('xm.door', { n: d });
      $('xm-m-icon').textContent = XM.games[d].icon;
      $('xm-m-name').textContent = tr('xm.g' + d + '.name');
      $('xm-m-desc').textContent = tr('xm.g' + d + '.desc');
      const word = $('xm-m-word');
      word.classList.toggle('hidden', !isOpen);
      word.textContent = XM.WORDS[d - 1];
      $('xm-m-pick').textContent = tr(isOpen ? 'xm.playAgain' : 'xm.pickCat');
      document.querySelectorAll('.xm-cat').forEach((b) => { b.querySelector('img').src = api.catImage(b.dataset.xmcat, 'sitting'); });
      showXm('xm-modal');
    }
    document.querySelectorAll('.xm-cat').forEach((b) => b.addEventListener('click', () => {
      api.plop(b);
      const c = b.dataset.xmcat;
      const d = modalDay;
      setTimeout(() => start(d, c), 200);
    }));
    $('xm-m-close').addEventListener('click', () => { api.plop(); showXm(null); });
    $('xm-modal').addEventListener('click', (e) => { if (e.target === $('xm-modal')) showXm(null); });

    return {
      get active() { return mode !== 'off'; },
      get running() { return mode === 'run' && state === 'play'; },
      start,
      quit,
      pause,
      frame,
      refresh,
      syncSound,
      closeModal: () => showXm(null),
      onLanguage() { if (mode === 'run') { $('xm-day').textContent = tr('xm.door', { n: day }); } },
      debug: { env, get game() { return game; }, get state() { return state; }, win: () => env.win(), start },
    };
  };
})();
