// Haunted House: eat all the candy in the dark mansion, avoid the ghosts.
// Catnip makes the ghosts flee for a few seconds, and then the cat can catch them.
(() => {
  'use strict';
  const HW = (window.HW = window.HW || { games: {} });

  // '#' wall, '.' candy, 'o' catnip, 'C' candy corn, 'P' cat start, 'G' ghost house, '-' ghost door
  const FLOORS = [
    [
      '###############',
      '#......#......#',
      '#o##.#.#.#.##o#',
      '#....#...#....#',
      '##.#.##.##.#.##',
      '#..#.......#..#',
      '#.##.##-##.##.#',
      '#....#GGG#....#',
      '#.##.#####.##.#',
      '#...C...P..C..#',
      '#.###.#.#.###.#',
      '#.....#.#.....#',
      '###.#.#.#.#.###',
      '#...#.....#...#',
      '#o###.###.###o#',
      '#.............#',
      '###############',
    ],
    [
      '###############',
      '#.............#',
      '#.###.#.#.###.#',
      '#o...........o#',
      '#.#.###.###.#.#',
      '#.#.........#.#',
      '#.###.#-#.###.#',
      '#.....#G#.....#',
      '###.#.#G#.#.###',
      '#...#.###.#...#',
      '#.#.#.C.C.#.#.#',
      '#.#....P....#.#',
      '#.###.#.#.###.#',
      '#.....#.#.....#',
      '#o###.....###o#',
      '#.....###.....#',
      '###############',
    ],
    [
      '###############',
      '#o...........o#',
      '#.###.#.#.###.#',
      '#.#.........#.#',
      '#.#.##.#.##.#.#',
      '#......#......#',
      '###.##-#-##.###',
      '#...#GG#GG#...#',
      '#.#.#######.#.#',
      '#.#....P....#.#',
      '#.###.#.#.###.#',
      '#C....#.#....C#',
      '#.###.#.#.###.#',
      '#...#.....#...#',
      '#.#.#.###.#.#.#',
      '#o...........o#',
      '###############',
    ],
  ];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const GHOST_COLORS = ['#f4f0ff', '#c9ffd2', '#ffd3ea', '#cfe6ff'];
  const CANDY_COLORS = ['#ff6b6b', '#ffd23f', '#7ee0a8', '#8ec5ff', '#d59bff', '#ff9a3c'];

  HW.games.haunted = function (env) {
    const { ctx, TAU, rand } = env;

    let floorNo = 0;            // counts up forever; the layout cycles through FLOORS
    let map = null;             // array of arrays of chars
    let W = 0, H = 0;
    let tile = 20, ox = 0, oy = 0;
    let transposed = false;
    let phase = 'ready';        // ready | play | dying | clear
    let phaseT = 0;
    let t = 0;
    let lives = 3;
    let fright = 0;
    let chain = 0;
    let left = 0;
    const cat = { x: 0, y: 0, dx: 0, dy: 0, wx: 0, wy: 0, prog: 0, facing: 1, walkT: 0, spin: 0 };
    let ghosts = [];
    let start = null;
    let exits = [];
    let swipe = null;

    const open = (x, y, ghost) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const c = map[y][x];
      if (c === '#') return false;
      if (!ghost && (c === 'G' || c === '-')) return false;
      return true;
    };

    function loadFloor() {
      const src = FLOORS[floorNo % FLOORS.length];
      transposed = env.w > env.h;
      let rows = src.map((r) => r.split(''));
      if (transposed) rows = rows[0].map((_, x) => rows.map((r) => r[x]));
      map = rows;
      H = map.length;
      W = map[0].length;
      left = 0;
      const homes = [];
      exits = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = map[y][x];
          if (c === '.' || c === 'o') left++;
          if (c === 'P') { start = [x, y]; map[y][x] = ' '; }
          if (c === 'G') homes.push([x, y]);
          if (c === '-') {
            for (const [ddx, ddy] of Object.values(DIRS)) {
              const nx = x + ddx, ny = y + ddy;
              if (map[ny] && '.oC P'.includes(map[ny][nx])) exits.push([nx, ny]);
            }
          }
        }
      }
      const count = Math.min(4, 3 + (floorNo >= 2 ? 1 : 0));
      ghosts = [];
      for (let i = 0; i < count; i++) {
        const home = homes[i % homes.length];
        ghosts.push({ home, color: GHOST_COLORS[i], ai: i, release: [1.2, 3.5, 7, 11][i] });
      }
      layout();
      resetActors();
    }

    function layout() {
      const landscape = env.w > env.h;
      const top = landscape ? 54 : 74, bottom = landscape ? 8 : 20, side = 8;
      tile = Math.floor(Math.min((env.w - side * 2) / W, (env.h - top - bottom) / H));
      ox = Math.round((env.w - tile * W) / 2);
      oy = Math.round(top + (env.h - top - bottom - tile * H) / 2);
    }

    function resetActors() {
      Object.assign(cat, { x: start[0], y: start[1], dx: 0, dy: 0, wx: 0, wy: 0, prog: 0, facing: 1, spin: 0 });
      for (const g of ghosts) {
        Object.assign(g, { x: g.home[0], y: g.home[1], dx: 0, dy: 0, prog: 0, state: 'house', wait: g.release, bob: rand(0, TAU) });
      }
      fright = 0;
      chain = 0;
      phase = 'ready';
      phaseT = 0;
    }

    function speeds() {
      const lvl = Math.min(floorNo, 6);
      return { cat: 5.4, ghost: 3.9 + lvl * 0.3, scared: 2.6, eyes: 9 };
    }

    // ------------------------------------------------------------------------
    // Movement on the grid
    // ------------------------------------------------------------------------
    function stepCat(dt) {
      const sp = speeds().cat;
      // instant reverse
      if (cat.dx && cat.wx === -cat.dx && cat.wy === 0) { cat.x += cat.dx; cat.prog = 1 - cat.prog; cat.dx = -cat.dx; }
      if (cat.dy && cat.wy === -cat.dy && cat.wx === 0) { cat.y += cat.dy; cat.prog = 1 - cat.prog; cat.dy = -cat.dy; }
      if (!cat.dx && !cat.dy) {
        if ((cat.wx || cat.wy) && open(cat.x + cat.wx, cat.y + cat.wy)) { cat.dx = cat.wx; cat.dy = cat.wy; cat.prog = 0; }
        else return;
      }
      cat.prog += sp * dt;
      cat.walkT += dt * 9;
      if (cat.dx) cat.facing = cat.dx;
      while (cat.prog >= 1) {
        cat.prog -= 1;
        cat.x += cat.dx;
        cat.y += cat.dy;
        eat(cat.x, cat.y);
        if ((cat.wx || cat.wy) && open(cat.x + cat.wx, cat.y + cat.wy)) { cat.dx = cat.wx; cat.dy = cat.wy; }
        else if (!open(cat.x + cat.dx, cat.y + cat.dy)) { cat.dx = 0; cat.dy = 0; cat.prog = 0; break; }
      }
    }

    function eat(x, y) {
      const c = map[y][x];
      const px = ox + (x + 0.5) * tile, py = oy + (y + 0.5) * tile;
      if (c === '.') {
        map[y][x] = ' ';
        left--;
        env.addScore(10);
        env.sfx.waka();
      } else if (c === 'o') {
        map[y][x] = ' ';
        left--;
        env.addScore(50, px, py - tile * 0.6, '#9be879');
        env.sfx.powerUp();
        fright = Math.max(3.5, 7 - floorNo * 0.7);
        chain = 0;
        for (const g of ghosts) {
          if (g.state === 'chase') { g.state = 'scared'; if (g.dx || g.dy) { g.x += g.dx; g.y += g.dy; g.dx = -g.dx; g.dy = -g.dy; g.prog = 1 - g.prog; } }
        }
      } else if (c === 'C') {
        map[y][x] = ' ';
        env.addScore(100);
        env.addCorn(1, px, py - tile * 0.6);
        env.burst(px, py, 10, '#ffcf6a', 140, { star: true });
      }
      if (left <= 0 && phase === 'play') {
        phase = 'clear';
        phaseT = 0;
        env.addScore(500, ox + W * tile / 2, oy + H * tile / 2, '#9be879');
        env.addCorn(3, ox + W * tile / 2, oy + H * tile / 2 + 28);
        env.sfx.levelUp();
      }
    }

    function ghostTarget(g) {
      if (g.state === 'eyes') return g.exit;
      if (g.state === 'scared') return [Math.floor(rand(0, W)), Math.floor(rand(0, H))];
      switch (g.ai) {
        case 0: return [cat.x, cat.y];
        case 1: return [cat.x + (cat.dx || cat.wx) * 4, cat.y + (cat.dy || cat.wy) * 4];
        case 2: return Math.hypot(g.x - cat.x, g.y - cat.y) > 6 ? [cat.x, cat.y] : [1, H - 2];
        default: return Math.random() < 0.5 ? [cat.x, cat.y] : [W - 2, 1];
      }
    }

    function chooseDir(g) {
      const target = ghostTarget(g);
      let best = null, bestD = Infinity;
      const options = [];
      for (const [ddx, ddy] of Object.values(DIRS)) {
        if (ddx === -g.dx && ddy === -g.dy && (g.dx || g.dy)) continue;
        const nx = g.x + ddx, ny = g.y + ddy;
        if (!open(nx, ny, false)) continue;
        options.push([ddx, ddy]);
        const d = (nx - target[0]) ** 2 + (ny - target[1]) ** 2;
        if (d < bestD) { bestD = d; best = [ddx, ddy]; }
      }
      if (!options.length) return [-g.dx, -g.dy];
      // a little randomness keeps them from moving in perfect lock-step
      if (g.state === 'chase' && Math.random() < 0.15) return options[Math.floor(Math.random() * options.length)];
      return best;
    }

    function stepGhost(g, dt) {
      const sp = speeds();
      if (g.state === 'house') {
        g.wait -= dt;
        g.bob += dt * 4;
        if (g.wait <= 0 && phase === 'play') {
          const ex = nearestExit(g.home);
          g.x = ex[0]; g.y = ex[1]; g.prog = 0; g.dx = 0; g.dy = 0;
          g.state = fright > 0 ? 'scared' : 'chase';
          env.burst(ox + (g.x + 0.5) * tile, oy + (g.y + 0.5) * tile, 8, 'rgba(230,220,255,0.9)', 80);
          env.sfx.boo();
        }
        return;
      }
      const speed = g.state === 'eyes' ? sp.eyes : g.state === 'scared' ? sp.scared : sp.ghost;
      if (!g.dx && !g.dy) { const d = chooseDir(g); g.dx = d[0]; g.dy = d[1]; }
      g.prog += speed * dt;
      while (g.prog >= 1) {
        g.prog -= 1;
        g.x += g.dx;
        g.y += g.dy;
        if (g.state === 'eyes' && g.x === g.exit[0] && g.y === g.exit[1]) {
          g.state = 'house';
          g.x = g.home[0]; g.y = g.home[1];
          g.wait = 2;
          g.prog = 0;
          return;
        }
        const d = chooseDir(g);
        g.dx = d[0]; g.dy = d[1];
      }
    }

    function nearestExit(home) {
      let best = exits[0], bd = Infinity;
      for (const e of exits) {
        const d = (e[0] - home[0]) ** 2 + (e[1] - home[1]) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    const pos = (a) => [ox + (a.x + a.dx * a.prog + 0.5) * tile, oy + (a.y + a.dy * a.prog + 0.5) * tile];

    function collide() {
      if (phase !== 'play') return;
      const [cx, cy] = pos(cat);
      for (const g of ghosts) {
        if (g.state === 'house' || g.state === 'eyes') continue;
        const [gx, gy] = pos(g);
        if (Math.hypot(cx - gx, cy - gy) > tile * 0.62) continue;
        if (g.state === 'scared') {
          chain++;
          const pts = 200 * Math.pow(2, Math.min(chain - 1, 3));
          env.addScore(pts, gx, gy - tile * 0.5, '#8ec5ff');
          env.sfx.ghostEat();
          env.burst(gx, gy, 12, '#8ec5ff', 160, { star: true });
          g.state = 'eyes';
          g.exit = nearestExit(g.home);
        } else {
          phase = 'dying';
          phaseT = 0;
          lives--;
          env.sfx.boo();
          env.sfx.death();
          env.shake(7);
          if (navigator.vibrate) { try { navigator.vibrate([60, 40, 90]); } catch (e) { /* ignore */ } }
          return;
        }
      }
    }

    function update(dt) {
      t += dt;
      phaseT += dt;
      layout();
      if (phase === 'ready') {
        for (const g of ghosts) g.bob += dt * 4;
        if (phaseT > 1.6) { phase = 'play'; phaseT = 0; env.sfx.go(); }
        return;
      }
      if (phase === 'dying') {
        cat.spin += dt * 10;
        if (phaseT > 1.6) {
          if (lives <= 0) { if (!env.ended) env.end({ title: 'hw.haunted.over', floor: floorNo + 1 }); }
          else resetActors();
        }
        return;
      }
      if (phase === 'clear') {
        if (phaseT > 1.8) { floorNo++; loadFloor(); }
        return;
      }
      if (fright > 0) {
        fright -= dt;
        if (fright <= 0) for (const g of ghosts) if (g.state === 'scared') g.state = 'chase';
      }
      stepCat(dt);
      collide();
      if (phase !== 'play') return;
      for (const g of ghosts) stepGhost(g, dt);
      collide();
    }

    // ------------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------------
    function drawMaze() {
      const bg = ctx.createRadialGradient(env.w / 2, env.h / 2, 50, env.w / 2, env.h / 2, Math.max(env.w, env.h));
      bg.addColorStop(0, '#1d0f2e');
      bg.addColorStop(1, '#08040f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, env.w, env.h);
      // floor boards
      ctx.fillStyle = '#26152f';
      ctx.fillRect(ox, oy, W * tile, H * tile);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      for (let y = 0; y < H; y++) ctx.fillRect(ox, oy + y * tile + tile - 1, W * tile, 1);
      // walls with a glowing outline along the corridors
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (map[y][x] !== '#') continue;
          ctx.fillStyle = '#140a22';
          ctx.fillRect(ox + x * tile, oy + y * tile, tile, tile);
        }
      }
      ctx.strokeStyle = '#8a5cc4';
      ctx.lineWidth = Math.max(1.5, tile * 0.09);
      ctx.shadowColor = '#b07cff';
      ctx.shadowBlur = tile * 0.5;
      ctx.beginPath();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (map[y][x] !== '#') continue;
          const X = ox + x * tile, Y = oy + y * tile, i = tile * 0.12;
          if (y > 0 && map[y - 1][x] !== '#') { ctx.moveTo(X, Y + i); ctx.lineTo(X + tile, Y + i); }
          if (y < H - 1 && map[y + 1][x] !== '#') { ctx.moveTo(X, Y + tile - i); ctx.lineTo(X + tile, Y + tile - i); }
          if (x > 0 && map[y][x - 1] !== '#') { ctx.moveTo(X + i, Y); ctx.lineTo(X + i, Y + tile); }
          if (x < W - 1 && map[y][x + 1] !== '#') { ctx.moveTo(X + tile - i, Y); ctx.lineTo(X + tile - i, Y + tile); }
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      // candies, catnip, candy corn, doors
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = map[y][x];
          const cx = ox + (x + 0.5) * tile, cy = oy + (y + 0.5) * tile;
          if (c === '.') {
            const r = tile * 0.11;
            ctx.fillStyle = CANDY_COLORS[(x * 7 + y * 3) % CANDY_COLORS.length];
            ctx.beginPath(); ctx.moveTo(cx - r * 2.2, cy - r); ctx.lineTo(cx - r * 2.2, cy + r); ctx.lineTo(cx, cy); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx + r * 2.2, cy - r); ctx.lineTo(cx + r * 2.2, cy + r); ctx.lineTo(cx, cy); ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, r * 1.1, 0, TAU); ctx.fill();
          } else if (c === 'o') {
            const pulse = 1 + Math.sin(t * 6 + x) * 0.15;
            const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, tile * 0.6);
            g.addColorStop(0, 'rgba(140, 240, 110, 0.6)');
            g.addColorStop(1, 'rgba(140, 240, 110, 0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(cx, cy, tile * 0.6, 0, TAU); ctx.fill();
            ctx.fillStyle = '#6fd65a';
            for (let k = 0; k < 4; k++) {
              const a = k / 4 * TAU + t;
              ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * tile * 0.12 * pulse, cy + Math.sin(a) * tile * 0.12 * pulse, tile * 0.16, tile * 0.08, a, 0, TAU); ctx.fill();
            }
          } else if (c === 'C') {
            HW.drawCorn(ctx, cx, cy + Math.sin(t * 3 + x) * tile * 0.06, tile * 0.42, Math.sin(t * 2) * 0.2);
          } else if (c === '-') {
            ctx.fillStyle = '#c79bff';
            ctx.fillRect(ox + x * tile + tile * 0.1, cy - tile * 0.08, tile * 0.8, tile * 0.16);
          }
        }
      }
    }

    function drawActors() {
      for (const g of ghosts) {
        let [gx, gy] = pos(g);
        if (g.state === 'house') gy += Math.sin(g.bob) * tile * 0.12;
        let mood = g.state === 'scared' ? 'scared' : g.state === 'eyes' ? 'eyes' : 'normal';
        if (mood === 'scared' && fright < 1.6 && Math.floor(fright * 6) % 2 === 0) mood = 'normal';
        HW.drawGhost(ctx, gx, gy, tile * 0.42, t, mood, g.color);
      }
      const [cx, cy] = pos(cat);
      if (phase === 'dying') {
        env.drawCat('hit', cx, cy, tile * 1.1, { center: true, rot: cat.spin, alpha: Math.max(0, 1 - phaseT / 1.6) });
      } else {
        const moving = phase === 'play' && (cat.dx || cat.dy);
        env.drawCat(moving ? 'walk' : 'idle', cx, cy + tile * 0.48, tile * 1.15, { frame: cat.walkT, flip: cat.facing < 0 });
      }
    }

    function drawDarkness() {
      const [cx, cy] = pos(cat);
      const r0 = tile * 3.2, r1 = tile * 7.5;
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      const a = fright > 0 ? 0.35 : 0.62;
      g.addColorStop(0, 'rgba(6, 2, 14, 0)');
      g.addColorStop(1, `rgba(6, 2, 14, ${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, env.w, env.h);
    }

    function banner(text, color) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(Math.min(env.w, env.h) * 0.09)}px Creepster, Fredoka, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(15, 4, 25, 0.9)';
      ctx.strokeText(text, env.w / 2, oy + H * tile / 2);
      ctx.fillStyle = color;
      ctx.fillText(text, env.w / 2, oy + H * tile / 2);
      ctx.restore();
    }

    function render() {
      const [sx, sy] = env.shakeOffset();
      ctx.setTransform(env.dpr, 0, 0, env.dpr, sx * env.dpr, sy * env.dpr);
      drawMaze();
      drawActors();
      drawDarkness();
      env.drawFx();
      if (phase === 'ready') banner(env.tr('hw.floor', { n: floorNo + 1 }), '#ffb347');
      if (phase === 'clear') banner(env.tr('hw.cleared'), '#9be879');
    }

    // ------------------------------------------------------------------------
    // Input: swipe anywhere (repeat swipes without lifting), or arrow keys / WASD
    // ------------------------------------------------------------------------
    function setWant(x, y) { cat.wx = x; cat.wy = y; }

    loadFloor();

    return {
      update,
      render,
      down(x, y) { swipe = { x, y }; },
      move(x, y) {
        if (!swipe) return;
        const dx = x - swipe.x, dy = y - swipe.y;
        if (Math.hypot(dx, dy) < 18) return;
        if (Math.abs(dx) > Math.abs(dy)) setWant(Math.sign(dx), 0); else setWant(0, Math.sign(dy));
        swipe = { x, y };
      },
      up() { swipe = null; },
      blur() { swipe = null; },
      key(code) {
        const k = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[code];
        if (!k) return false;
        setWant(DIRS[k][0], DIRS[k][1]);
        return true;
      },
      hud: () => '♥'.repeat(Math.max(0, lives)) + '  ' + env.tr('hw.floor', { n: floorNo + 1 }),
    };
  };
})();
