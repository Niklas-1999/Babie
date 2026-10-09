// Player accounts: a name-based profile, cached on the device and synced to Firebase Firestore.
// Guests only use the local cache. Leaderboards read straight from the players collection.
(() => {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDm9hEugFF3erKZtY6ClfVmq3lUqf2-KlI',
    authDomain: 'mimaro-db.firebaseapp.com',
    projectId: 'mimaro-db',
    storageBucket: 'mimaro-db.firebasestorage.app',
    messagingSenderId: '1037691029443',
    appId: '1:1037691029443:web:c67e00199322e127d1df76',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/12.4.0/';
  const COLLECTION = 'players';
  const GUEST_KEY = '__guest';
  const SYNC_DELAY = 1500;
  const TIMEOUT = 8000;

  const local = {
    get(key, fallback) {
      try { const v = localStorage.getItem('otd.' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('otd.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    del(key) {
      try { localStorage.removeItem('otd.' + key); } catch (e) { /* ignore */ }
    },
  };

  // ---------------------------------------------------------------------------
  // Firestore (loaded on demand from Google's CDN)
  // ---------------------------------------------------------------------------
  let fbPromise = null;
  function firebase() {
    if (!fbPromise) {
      fbPromise = Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')])
        .then(([app, fs]) => ({ fs, db: fs.getFirestore(app.initializeApp(FIREBASE_CONFIG)) }))
        .catch((e) => { fbPromise = null; throw e; });
    }
    return fbPromise;
  }

  function withTimeout(p, ms = TIMEOUT) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------
  const NAME_RE = /^[\p{L}\p{N} _-]{2,16}$/u;
  const cleanName = (name) => String(name || '').trim().replace(/\s+/g, ' ');
  const keyOf = (name) => cleanName(name).toLowerCase();

  function blank(name, key) {
    return {
      name, key, coins: 0, svCoins: 0, svMeta: {}, story: { mallow: 0, mischko: 0 },
      created: Date.now(), updated: Date.now(),
    };
  }

  // Scores from before accounts existed go to the first profile used on this device.
  function migrateLegacy(data) {
    if (local.get('migrated', false)) return;
    local.set('migrated', true);
    const map = { best: 'best1', best2: 'best2', best3: 'best3', best4: 'best4', 'sv.best': 'svBest' };
    for (const [from, to] of Object.entries(map)) {
      const v = local.get(from, null);
      if (v && !data[to]) data[to] = v;
    }
    if (data.best4 && data.best4.score == null) data.best4.score = scoreVet(data.best4);
    data.svCoins = (data.svCoins || 0) + (local.get('sv.coins', 0) || 0);
    const meta = local.get('sv.meta', null);
    if (meta && !Object.keys(data.svMeta || {}).length) data.svMeta = meta;
  }

  function scoreVet(b) { return (b.hits || 0) * 100000 + Math.round((b.time || 0) * 10); }

  let current = null;            // { key, name, guest, offline, data }
  let syncTimer = 0;
  const listeners = [];

  function cacheKey(key) { return 'profile.' + key; }

  function saveLocal(dirty) {
    if (!current) return;
    local.set(cacheKey(current.key), { data: current.data, dirty: dirty || local.get(cacheKey(current.key), {}).dirty || false });
  }

  function changed() {
    current.data.updated = Date.now();
    saveLocal(!current.guest);
    for (const fn of listeners) fn(current);
    if (!current.guest) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(push, SYNC_DELAY);
    }
  }

  async function push() {
    clearTimeout(syncTimer);
    if (!current || current.guest) return false;
    const snapshot = JSON.parse(JSON.stringify(current.data));
    const key = current.key;
    try {
      const { fs, db } = await withTimeout(firebase());
      await withTimeout(fs.setDoc(fs.doc(db, COLLECTION, key), snapshot));
      if (current && current.key === key && current.data.updated === snapshot.updated) {
        local.set(cacheKey(key), { data: current.data, dirty: false });
      }
      if (current && current.key === key) current.offline = false;
      return true;
    } catch (e) {
      console.warn('Cloud save failed, will retry', e && e.message);
      if (current && current.key === key) current.offline = true;
      return false;
    }
  }

  async function login(rawName) {
    const name = cleanName(rawName);
    if (!NAME_RE.test(name)) return { ok: false, error: 'invalid' };
    const key = keyOf(name);
    const cached = local.get(cacheKey(key), null);
    let data = null;
    let isNew = false;
    let offline = false;
    try {
      const { fs, db } = await withTimeout(firebase());
      const snap = await withTimeout(fs.getDoc(fs.doc(db, COLLECTION, key)));
      if (snap.exists()) {
        data = snap.data();
        // unsynced progress on this device that is newer than the cloud wins
        if (cached && cached.dirty && cached.data && (cached.data.updated || 0) > (data.updated || 0)) data = cached.data;
      } else {
        isNew = true;
        data = cached && cached.data ? cached.data : blank(name, key);
        migrateLegacy(data);
      }
    } catch (e) {
      console.warn('Cloud login failed', e && e.message);
      if (!cached) return { ok: false, error: 'offline' };
      data = cached.data;
      offline = true;
    }
    data = Object.assign(blank(name, key), data);
    data.key = key;
    current = { key, name: data.name || name, guest: false, offline, data };
    local.set('lastName', current.name);
    saveLocal(offline || isNew);
    if (isNew || (cached && cached.dirty)) push();
    for (const fn of listeners) fn(current);
    return { ok: true, isNew, offline, name: current.name };
  }

  function playAsGuest() {
    const cached = local.get(cacheKey(GUEST_KEY), null);
    const data = Object.assign(blank('Guest', GUEST_KEY), cached && cached.data);
    migrateLegacy(data);
    current = { key: GUEST_KEY, name: 'Guest', guest: true, offline: false, data };
    saveLocal(false);
    for (const fn of listeners) fn(current);
    return current;
  }

  function logout() {
    if (current && !current.guest) push();
    current = null;
    for (const fn of listeners) fn(null);
  }

  // ---------------------------------------------------------------------------
  // Leaderboards
  // ---------------------------------------------------------------------------
  // field: e.g. 'best1.time', 'best4.score', 'svBest.time', 'coins'
  async function leaderboard(field, dir = 'asc', n = 10) {
    const { fs, db } = await withTimeout(firebase());
    const q = fs.query(fs.collection(db, COLLECTION), fs.orderBy(field, dir), fs.limit(n));
    const snap = await withTimeout(fs.getDocs(q));
    return snap.docs.map((d) => d.data());
  }

  // Flush pending saves when the page is hidden or closed.
  document.addEventListener('visibilitychange', () => { if (document.hidden && syncTimer) push(); });

  window.Profile = {
    login, playAsGuest, logout, push, leaderboard, scoreVet,
    validName: (n) => NAME_RE.test(cleanName(n)),
    lastName: () => local.get('lastName', ''),
    get current() { return current; },
    get name() { return current ? current.name : ''; },
    get guest() { return !current || current.guest; },
    get(key, fallback) {
      if (!current) return fallback;
      const v = current.data[key];
      return v == null ? fallback : v;
    },
    set(key, value) {
      if (!current) return;
      current.data[key] = value;
      changed();
    },
    addCoins(n) {
      if (!current) return;
      current.data.coins = (current.data.coins || 0) + n;
      changed();
    },
    // device-only values for this profile (e.g. the mid-level save)
    localGet(key, fallback) { return current ? local.get(key + '.' + current.key, fallback) : fallback; },
    localSet(key, value) { if (current) local.set(key + '.' + current.key, value); },
    localDel(key) { if (current) local.del(key + '.' + current.key); },
    onChange(fn) { listeners.push(fn); },
  };
})();
