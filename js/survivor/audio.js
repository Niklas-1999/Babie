// Backyard Survivors: small synthesized sound effects (no extra files needed).
(() => {
  'use strict';
  const SV = (window.SV = window.SV || {});

  SV.createSfx = function (audio) {
    let out = null;
    let noise = null;
    const lastAt = {};
    let pickupStreak = 0;
    let pickupAt = 0;

    function ready() {
      if (audio.muted || !audio.ctx || audio.ctx.state !== 'running') return false;
      if (!out) {
        out = audio.ctx.createGain();
        out.gain.value = 0.55;
        out.connect(audio.gain);
        const len = audio.ctx.sampleRate * 0.5;
        noise = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      return true;
    }

    // Don't play the same sound more often than every `gap` seconds.
    function throttle(key, gap) {
      const now = audio.ctx.currentTime;
      if (lastAt[key] && now - lastAt[key] < gap) return false;
      lastAt[key] = now;
      return true;
    }

    function tone(freq, dur, opts = {}) {
      const ac = audio.ctx;
      const t0 = ac.currentTime + (opts.delay || 0);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
      const vol = opts.vol == null ? 0.3 : opts.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function hiss(dur, opts = {}) {
      const ac = audio.ctx;
      const t0 = ac.currentTime + (opts.delay || 0);
      const src = ac.createBufferSource();
      src.buffer = noise;
      const f = ac.createBiquadFilter();
      f.type = opts.filter || 'bandpass';
      f.frequency.setValueAtTime(opts.freq || 1800, t0);
      if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
      f.Q.value = opts.q || 1;
      const g = ac.createGain();
      const vol = opts.vol == null ? 0.3 : opts.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(t0, Math.random() * 0.3);
      src.stop(t0 + dur + 0.02);
    }

    const r = (a, b) => a + Math.random() * (b - a);

    return {
      hit() {
        if (!ready() || !throttle('hit', 0.045)) return;
        hiss(0.06, { freq: r(900, 1500), q: 1.5, vol: 0.18 });
        tone(r(180, 230), 0.06, { type: 'triangle', to: 90, vol: 0.12 });
      },
      kill(squeak) {
        if (!ready() || !throttle('kill', 0.05)) return;
        if (squeak) tone(r(1500, 1900), 0.09, { type: 'sine', to: r(2400, 2800), vol: 0.12 });
        else hiss(0.08, { freq: r(2500, 3500), q: 2, vol: 0.14, filter: 'highpass' });
        tone(r(380, 460), 0.07, { type: 'sine', to: 160, vol: 0.12 });
      },
      pickup() {
        if (!ready() || !throttle('xp', 0.03)) return;
        const now = audio.ctx.currentTime;
        pickupStreak = now - pickupAt < 0.35 ? Math.min(pickupStreak + 1, 14) : 0;
        pickupAt = now;
        const scale = [0, 2, 4, 7, 9];
        const step = scale[pickupStreak % 5] + 12 * Math.floor(pickupStreak / 5);
        tone(880 * Math.pow(2, step / 12), 0.07, { type: 'sine', vol: 0.12 });
      },
      coin() {
        if (!ready() || !throttle('coin', 0.06)) return;
        tone(1320, 0.06, { type: 'square', vol: 0.06 });
        tone(1760, 0.14, { type: 'square', vol: 0.06, delay: 0.06 });
      },
      heal() {
        if (!ready()) return;
        [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.16, delay: i * 0.06 }));
      },
      levelUp() {
        if (!ready()) return;
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.065 }));
        tone(1568, 0.4, { type: 'sine', vol: 0.12, delay: 0.33 });
      },
      pick() {
        if (!ready()) return;
        tone(660, 0.08, { type: 'triangle', vol: 0.18 });
        tone(990, 0.16, { type: 'triangle', vol: 0.18, delay: 0.07 });
      },
      hurt() {
        if (!ready() || !throttle('hurt', 0.12)) return;
        tone(220, 0.18, { type: 'square', to: 80, vol: 0.12 });
        hiss(0.12, { freq: 600, vol: 0.18 });
      },
      swipe() {
        if (!ready() || !throttle('swipe', 0.08)) return;
        hiss(0.14, { freq: 1200, to: 5000, q: 0.8, vol: 0.16 });
      },
      throw() {
        if (!ready() || !throttle('throw', 0.07)) return;
        tone(r(560, 640), 0.07, { type: 'sine', to: 300, vol: 0.08 });
      },
      laser() {
        if (!ready() || !throttle('laser', 0.1)) return;
        tone(1800, 0.12, { type: 'sawtooth', to: 900, vol: 0.05 });
      },
      zap() {
        if (!ready() || !throttle('zap', 0.06)) return;
        hiss(0.16, { freq: 4000, q: 0.5, vol: 0.2, filter: 'highpass' });
        tone(r(90, 130), 0.14, { type: 'sawtooth', to: 50, vol: 0.12 });
      },
      boom() {
        if (!ready() || !throttle('boom', 0.06)) return;
        hiss(0.25, { freq: 400, to: 120, q: 0.7, vol: 0.28, filter: 'lowpass' });
        tone(110, 0.22, { type: 'sine', to: 40, vol: 0.25 });
      },
      splash() {
        if (!ready() || !throttle('splash', 0.08)) return;
        hiss(0.22, { freq: 2200, to: 700, q: 1.2, vol: 0.16 });
      },
      pounce() {
        if (!ready() || !throttle('pounce', 0.1)) return;
        tone(500, 0.09, { type: 'triangle', to: 900, vol: 0.08 });
      },
      bigHiss() {
        if (!ready()) return;
        hiss(0.7, { freq: 3500, to: 1500, q: 0.6, vol: 0.4 });
        tone(140, 0.5, { type: 'sawtooth', to: 60, vol: 0.12 });
      },
      chest() {
        if (!ready()) return;
        [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.13, delay: i * 0.09 }));
      },
      rattle() {
        if (!ready() || !throttle('rattle', 0.09)) return;
        hiss(0.08, { freq: 500, q: 2, vol: 0.2 });
      },
      warning() {
        if (!ready()) return;
        for (let i = 0; i < 3; i++) {
          tone(440, 0.22, { type: 'square', vol: 0.07, delay: i * 0.5 });
          tone(330, 0.22, { type: 'square', vol: 0.07, delay: i * 0.5 + 0.25 });
        }
      },
      powerUp() {
        if (!ready()) return;
        tone(300, 0.4, { type: 'sawtooth', to: 1200, vol: 0.08 });
        tone(450, 0.4, { type: 'triangle', to: 1800, vol: 0.1, delay: 0.05 });
      },
      bossDie() {
        if (!ready()) return;
        hiss(0.8, { freq: 300, to: 60, q: 0.6, vol: 0.35, filter: 'lowpass' });
        [392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.16, delay: 0.3 + i * 0.1 }));
      },
      death() {
        if (!ready()) return;
        [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.18, delay: i * 0.16 }));
      },
    };
  };
})();
