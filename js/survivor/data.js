// Backyard Survivors: definitions (weapons, passives, enemies, waves, meta upgrades).
(() => {
  'use strict';
  const SV = (window.SV = window.SV || {});

  // ---------------------------------------------------------------------------
  // Weapons. `base` is level 1, each entry in `ups` is the next level's change.
  // Stat keys: dmg, cd (seconds), amount, area (x radius), dur (seconds),
  // pierce, spd (fraction of base speed). Evolved weapons have no ups.
  // ---------------------------------------------------------------------------
  SV.WEAPONS = {
    claw: {
      name: 'Claw Swipe', icon: '🐾', unit: 'side',
      desc: 'Swipes in front of you, hitting everything in reach.',
      base: { dmg: 16, cd: 1.2, amount: 1, area: 1 },
      ups: [{ amount: 1 }, { dmg: 5 }, { area: 0.15, dmg: 3 }, { dmg: 5 }, { cd: -0.15 }, { area: 0.15, dmg: 5 }, { dmg: 8 }],
      evo: 'shredder', evoWith: 'sharp',
    },
    fish: {
      name: 'Fishbone Toss', icon: '🐟', unit: 'fishbone',
      desc: 'Throws fish bones at the nearest critter.',
      base: { dmg: 10, cd: 1.1, amount: 1, pierce: 1, spd: 1 },
      ups: [{ amount: 1 }, { dmg: 5 }, { amount: 1 }, { pierce: 1 }, { amount: 1 }, { dmg: 6 }, { pierce: 1, cd: -0.2 }],
      evo: 'sushi', evoWith: 'reflexes',
    },
    yarn: {
      name: 'Yarn Orbit', icon: '🧶', unit: 'yarn ball',
      desc: 'Balls of yarn circle around you.',
      base: { dmg: 9, cd: 3.2, amount: 2, area: 1, dur: 3, spd: 1 },
      ups: [{ amount: 1 }, { spd: 0.3, area: 0.1 }, { dmg: 5 }, { dur: 0.6 }, { amount: 1 }, { area: 0.2 }, { dmg: 6, dur: 0.6 }],
      evo: 'galaxy', evoWith: 'longtail',
    },
    hiss: {
      name: 'Grumpy Aura', icon: '😾', unit: '',
      desc: 'Pure grumpiness hurts every critter that comes close.',
      base: { dmg: 5, cd: 0.55, area: 1 },
      ups: [{ area: 0.2, dmg: 2 }, { cd: -0.08 }, { area: 0.15, dmg: 2 }, { dmg: 3 }, { area: 0.15 }, { cd: -0.07 }, { dmg: 4, area: 0.2 }],
      evo: 'storm', evoWith: 'fluffy',
    },
    milk: {
      name: 'Spilled Milk', icon: '🥛', unit: 'bottle',
      desc: 'Knocks over milk. The puddles hurt and slow critters.',
      base: { dmg: 6, cd: 3.8, amount: 1, area: 1, dur: 2.4 },
      ups: [{ amount: 1 }, { dmg: 4, area: 0.15 }, { dur: 0.6 }, { amount: 1 }, { dmg: 4 }, { area: 0.2 }, { dur: 0.8, amount: 1 }],
      evo: 'flood', evoWith: 'bigpaws',
    },
    laser: {
      name: 'Laser Pointer', icon: '🔴', unit: 'dot',
      desc: 'A red dot zips around and bounces off the screen edges.',
      base: { dmg: 9, cd: 3.4, amount: 1, dur: 2.2, spd: 1, area: 1 },
      ups: [{ amount: 1 }, { dmg: 5 }, { dur: 0.8 }, { spd: 0.25 }, { amount: 1 }, { dmg: 6 }, { dur: 1 }],
      evo: 'disco', evoWith: 'lucky',
    },
    mouse: {
      name: 'Toy Mouse', icon: '🐭', unit: 'toy',
      desc: 'Flings a toy mouse on a string that comes back.',
      base: { dmg: 16, cd: 1.8, amount: 1, area: 1, spd: 1 },
      ups: [{ dmg: 6 }, { amount: 1 }, { area: 0.25 }, { spd: 0.2, dmg: 6 }, { amount: 1 }, { dmg: 8 }, { area: 0.25, cd: -0.2 }],
      evo: 'stampede', evoWith: 'zoomies',
    },
    zap: {
      name: 'Static Fur', icon: '⚡', unit: 'bolt',
      desc: 'Rubbing against things builds up static. Zaps random critters.',
      base: { dmg: 20, cd: 2.4, amount: 2, area: 1 },
      ups: [{ amount: 1 }, { dmg: 10 }, { area: 0.3 }, { amount: 1 }, { cd: -0.3 }, { dmg: 12 }, { amount: 2 }],
      evo: 'thunder', evoWith: 'thickfur',
    },
    hairball: {
      name: 'Hairball', icon: '🤢', unit: 'hairball',
      desc: 'Hacks up a hairball that splats on a critter.',
      base: { dmg: 24, cd: 2.9, amount: 1, area: 1 },
      ups: [{ dmg: 8 }, { area: 0.2 }, { amount: 1 }, { dmg: 10 }, { cd: -0.4 }, { area: 0.25 }, { amount: 1, dmg: 12 }],
      evo: 'apocalypse', evoWith: 'copycat',
    },
    kitten: {
      name: 'Kitten Pal', icon: '🐈', unit: 'kitten',
      desc: 'A little friend who pounces on critters for you.',
      base: { dmg: 14, cd: 0.9, amount: 1, spd: 1 },
      ups: [{ dmg: 6 }, { amount: 1 }, { cd: -0.15 }, { dmg: 8, spd: 0.2 }, { amount: 1 }, { dmg: 10 }, { amount: 1 }],
      evo: 'army', evoWith: 'curious',
    },

    // --- evolutions ---
    shredder: {
      name: 'Shredder Storm', icon: '🌪️', evolved: true, from: 'claw',
      desc: 'Shreds in every direction. Crits heal you a little.',
      base: { dmg: 38, cd: 0.9, amount: 4, area: 1.45 },
    },
    sushi: {
      name: 'Sushi Barrage', icon: '🍣', evolved: true, from: 'fish',
      desc: 'An endless stream of piercing sushi rolls.',
      base: { dmg: 22, cd: 0.32, amount: 1, pierce: 4, spd: 1.25 },
    },
    galaxy: {
      name: 'Yarn Galaxy', icon: '🌌', evolved: true, from: 'yarn',
      desc: 'Six glowing yarn balls that never stop spinning.',
      base: { dmg: 20, cd: 0, amount: 6, area: 1.5, dur: 1, spd: 1.4 },
    },
    storm: {
      name: 'Grumpy Storm', icon: '👿', evolved: true, from: 'hiss',
      desc: 'A huge aura that slows critters and heals you when it hurts them.',
      base: { dmg: 14, cd: 0.4, area: 2 },
    },
    flood: {
      name: 'Milk Flood', icon: '🌊', evolved: true, from: 'milk',
      desc: 'Huge puddles of milk that keep growing.',
      base: { dmg: 14, cd: 2.6, amount: 3, area: 1.7, dur: 4.5 },
    },
    disco: {
      name: 'Disco Laser', icon: '🌈', evolved: true, from: 'laser',
      desc: 'Party time! Four rainbow dots, longer and faster.',
      base: { dmg: 20, cd: 2.4, amount: 4, dur: 4, spd: 1.25, area: 1.3 },
    },
    stampede: {
      name: 'Mouse Stampede', icon: '🐁', evolved: true, from: 'mouse',
      desc: 'A whole fan of toy mice, flung at once.',
      base: { dmg: 34, cd: 1.2, amount: 4, area: 1.6, spd: 1.2 },
    },
    thunder: {
      name: 'Thunder Floof', icon: '🌩️', evolved: true, from: 'zap',
      desc: 'Bolts that chain between critters.',
      base: { dmg: 48, cd: 1.6, amount: 5, area: 1.6 },
    },
    apocalypse: {
      name: 'Hairball Apocalypse', icon: '☄️', evolved: true, from: 'hairball',
      desc: 'A rain of giant hairballs.',
      base: { dmg: 60, cd: 1.8, amount: 4, area: 1.7 },
    },
    army: {
      name: 'Kitten Army', icon: '😸', evolved: true, from: 'kitten',
      desc: 'Five fearless kittens who never rest.',
      base: { dmg: 34, cd: 0.45, amount: 5, spd: 1.35 },
    },
  };

  // ---------------------------------------------------------------------------
  // Passives (max 5 levels unless noted). `per` is added to the stat each level.
  // ---------------------------------------------------------------------------
  SV.PASSIVES = {
    sharp:    { name: 'Sharp Claws',    icon: '🗡️', stat: 'might',    per: 0.1,  text: '+10% damage' },
    fluffy:   { name: 'Fluffy Coat',    icon: '☁️', stat: 'maxHp',    per: 20,   text: '+20 max health' },
    thickfur: { name: 'Thick Fur',      icon: '🛡️', stat: 'armor',    per: 1,    text: '+1 armor (less damage taken)' },
    catnap:   { name: 'Cat Nap',        icon: '💤', stat: 'regen',    per: 0.3,  text: '+0.3 health per second' },
    zoomies:  { name: 'Zoomies',        icon: '💨', stat: 'speed',    per: 0.08, text: '+8% move speed' },
    whiskers: { name: 'Long Whiskers',  icon: '🧲', stat: 'magnet',   per: 0.3,  text: '+30% pickup range' },
    bigpaws:  { name: 'Big Paws',       icon: '🔍', stat: 'area',     per: 0.08, text: '+8% attack area' },
    reflexes: { name: 'Cat Reflexes',   icon: '⏱️', stat: 'cooldown', per: -0.06, text: '-6% cooldowns' },
    longtail: { name: 'Long Tail',      icon: '⏳', stat: 'duration', per: 0.12, text: '+12% effect duration' },
    lucky:    { name: 'Lucky Paw',      icon: '🍀', stat: 'luck',     per: 0.1,  text: '+10% luck (crits, drops, extra choices)' },
    copycat:  { name: 'Copycat',        icon: '👯', stat: 'amount',   per: 1,    text: '+1 projectile for every weapon', max: 2 },
    curious:  { name: 'Curiosity',      icon: '📖', stat: 'growth',   per: 0.1,  text: '+10% experience' },
    ninelives:{ name: 'Nine Lives',     icon: '💖', stat: 'revives',  per: 1,    text: 'Get back up once after being caught', max: 1 },
  };

  SV.MAX_WEAPONS = 6;
  SV.MAX_PASSIVES = 6;
  SV.WEAPON_MAX_LEVEL = 8;

  // ---------------------------------------------------------------------------
  // Playable cats
  // ---------------------------------------------------------------------------
  SV.CHARACTERS = {
    mallow: {
      weapon: 'claw', maxHp: 120, armor: 1, speed: 0.95,
      perks: ['Starts with Claw Swipe', '120 health, +1 armor', 'A bit slow (very fluffy)'],
    },
    mischko: {
      weapon: 'fish', maxHp: 95, armor: 0, speed: 1.1, cooldown: -0.05,
      perks: ['Starts with Fishbone Toss', '+10% speed, -5% cooldowns', '95 health'],
    },
  };

  // ---------------------------------------------------------------------------
  // Critters. r = hit radius, size = half the sprite canvas (world units).
  // ---------------------------------------------------------------------------
  SV.ENEMIES = {
    ant:    { name: 'Ant',       hp: 5,   speed: 64, dmg: 4,  r: 7,  size: 14, xp: 1, color: '#7a3b22', move: 'chase' },
    mouse:  { name: 'Mouse',     hp: 11,  speed: 56, dmg: 6,  r: 11, size: 26, xp: 1, color: '#a9a3a8', move: 'chase', squeak: true },
    roach:  { name: 'Cockroach', hp: 15,  speed: 92, dmg: 7,  r: 10, size: 24, xp: 2, color: '#6b3a1e', move: 'zigzag' },
    bee:    { name: 'Bee',       hp: 12,  speed: 84, dmg: 6,  r: 9,  size: 18, xp: 2, color: '#ffd23f', move: 'wobble', fly: true },
    spider: { name: 'Spider',    hp: 30,  speed: 48, dmg: 9,  r: 13, size: 26, xp: 3, color: '#2b2233', move: 'leap' },
    beetle: { name: 'Beetle',    hp: 70,  speed: 36, dmg: 11, r: 15, size: 26, xp: 5, color: '#2e8b57', move: 'chase', kbRes: 0.6 },
    moth:   { name: 'Moth',      hp: 24,  speed: 74, dmg: 8,  r: 12, size: 24, xp: 3, color: '#d8c3a0', move: 'flutter', fly: true },
    frog:   { name: 'Frog',      hp: 48,  speed: 60, dmg: 10, r: 13, size: 24, xp: 4, color: '#6cc24a', move: 'hop' },
    rat:    { name: 'Rat',       hp: 95,  speed: 60, dmg: 14, r: 17, size: 38, xp: 8, color: '#7b6a62', move: 'chase', kbRes: 0.4, squeak: true },

    ratking: { name: 'The Rat King',     hp: 900,  speed: 54, dmg: 20, r: 32, size: 66, xp: 60, color: '#7b6a62', move: 'ratking',  boss: true, kbRes: 0.95, squeak: true },
    vacuum:  { name: 'Robo-Vacuum',      hp: 1500, speed: 46, dmg: 26, r: 36, size: 46, xp: 90, color: '#3a3f4a', move: 'vacuum',   boss: true, kbRes: 1 },
    queen:   { name: 'The Queen Wasp',   hp: 2000, speed: 70, dmg: 22, r: 28, size: 50, xp: 120, color: '#ffb000', move: 'queen',  boss: true, kbRes: 0.95, fly: true },

    pot:    { name: 'Flower pot', hp: 1, speed: 0, dmg: 0, r: 14, size: 20, xp: 0, color: '#c86b3c', prop: true },
  };

  // Which critters show up when (minute -> weights). The last row keeps applying.
  SV.WAVES = [
    { at: 0,  w: { ant: 6, mouse: 4 } },
    { at: 1,  w: { ant: 4, mouse: 5, roach: 3 } },
    { at: 2,  w: { ant: 3, mouse: 4, roach: 4, bee: 3 } },
    { at: 3,  w: { mouse: 3, roach: 4, bee: 3, spider: 3 } },
    { at: 4,  w: { ant: 2, roach: 4, bee: 3, spider: 3, beetle: 2 } },
    { at: 5,  w: { roach: 3, bee: 3, spider: 3, beetle: 3, moth: 3 } },
    { at: 6,  w: { mouse: 2, spider: 3, beetle: 3, moth: 3, frog: 3 } },
    { at: 7,  w: { roach: 3, beetle: 3, moth: 3, frog: 3, rat: 2 } },
    { at: 9,  w: { ant: 2, spider: 3, beetle: 3, moth: 3, frog: 3, rat: 3 } },
    { at: 12, w: { roach: 2, beetle: 4, moth: 3, frog: 3, rat: 4 } },
  ];

  SV.BOSSES = ['ratking', 'vacuum', 'queen'];   // one every 3 minutes, in this order, then repeating
  SV.BOSS_EVERY = 180;

  // Swarm events (seconds). After the list runs out they repeat randomly.
  SV.EVENTS = [
    { at: 75,  kind: 'ring',     type: 'ant',   count: 30, text: 'Ant ambush!' },
    { at: 150, kind: 'stampede', type: 'roach', count: 26, text: 'Cockroach stampede!' },
    { at: 255, kind: 'swarm',    type: 'bee',   count: 22, text: 'Bee swarm!' },
    { at: 330, kind: 'swarm',    type: 'spider', count: 18, text: 'Spiders everywhere!' },
    { at: 420, kind: 'stampede', type: 'rat',   count: 18, text: 'Rat stampede!' },
    { at: 500, kind: 'swarm',    type: 'moth',  count: 36, text: 'Moths at dusk!' },
  ];

  // ---------------------------------------------------------------------------
  // Cat Tree: permanent upgrades bought with fish coins between runs.
  // ---------------------------------------------------------------------------
  SV.META = {
    power:   { name: 'Scratching Post', icon: '🗡️', text: '+5% damage',        max: 5, cost: 40,  stat: 'might',    per: 0.05 },
    vital:   { name: 'Comfy Bed',       icon: '🛏️', text: '+10 max health',    max: 5, cost: 40,  stat: 'maxHp',    per: 10 },
    armor:   { name: 'Thick Sweater',   icon: '🧥', text: '+1 armor',          max: 3, cost: 90,  stat: 'armor',    per: 1 },
    swift:   { name: 'Running Wheel',   icon: '🎡', text: '+4% move speed',    max: 4, cost: 45,  stat: 'speed',    per: 0.04 },
    magnet:  { name: 'Treat Sense',     icon: '👃', text: '+12% pickup range', max: 4, cost: 30,  stat: 'magnet',   per: 0.12 },
    wisdom:  { name: 'Cat Books',       icon: '📚', text: '+5% experience',    max: 5, cost: 50,  stat: 'growth',   per: 0.05 },
    haste:   { name: 'Catnip Tea',      icon: '🍵', text: '-3% cooldowns',     max: 4, cost: 60,  stat: 'cooldown', per: -0.03 },
    greed:   { name: 'Piggy Bank',      icon: '🐷', text: '+10% fish coins',   max: 5, cost: 35,  stat: 'greed',    per: 0.1 },
    reroll:  { name: 'Second Thoughts', icon: '🎲', text: '+1 reroll per run', max: 3, cost: 70,  stat: 'rerolls',  per: 1 },
    revive:  { name: 'Tenth Life',      icon: '😇', text: 'Revive once per run', max: 1, cost: 400, stat: 'revives', per: 1 },
  };
})();
