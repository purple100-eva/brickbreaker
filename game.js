(() => {
  'use strict';

  // ---- Customize me! ------------------------------------------------------
  const GAME_TITLE = 'Egg-cellent!';
  const GIFT_MESSAGE = 'Made with love for Mom 💕';
  const WIN_DEDICATION = 'Happy birthday, Mom! 💕';

  // Shown at random after each level. {babies} = eggs hatched that level.
  const LEVEL_JOKES = [
    '100% fertilization rate. Your Pearl Index is off the charts.',
    "Should've packed a condom. Congratulations on your {babies} babies.",
    'The pull-out method strikes again.',
    'Looks like someone forgot the pill. Next level: Plan B.',
  ];

  // Shown at random when a sperm is missed. {seconds} = how long it survived.
  const MISS_CARDS = [
    { text: 'Remember: every sperm is sacred.', button: 'Understood' },
    { text: 'Sperm can live up to 5 days. That one lasted {seconds} seconds.', button: 'Tragic' },
    { text: 'Spermicide: 1. You: 0.', button: 'Rematch' },
    { text: "Don't worry, there are 200 million more where that came from.", button: 'Next!' },
  ];
  // Shown at random on the game-over screen.
  const GAME_OVER_JOKES = [
    'Even IUI couldn\'t save this one.',
    'Good news: your insurance covers one more round.',
    'Have you considered a turkey baster?',
    'Have you tried just relaxing?',
  ];
  // -------------------------------------------------------------------------

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const safeProbe = document.getElementById('safe');

  const FONT = '"Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  const BOW_COLORS = ['#ff6fa5', '#b388ff', '#64b5f6', '#4dd0b5', '#ffb74d', '#f06292', '#9575cd'];
  const SKIN = '#f3c1a3', SKIN_LINE = '#c98a6b', GLANS = '#ec9a9e', GLANS_LINE = '#c8707a';
  const INK = '#3a2a2a', HUD_INK = '#a0346b', ACCENT = '#e0508f';
  const COPPER = '#cf7a3d';

  const HEART8 = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
  const HEART6 = ['##..##', '######', '######', '.####.', '..##..'];
  const heartMap = cols => (cols === 8 ? HEART8 : HEART6);

  // Cell codes: '.' empty, 'e' egg, 'c' egg in a condom (2 hits), 'd' double-bagged (3 hits)
  const LEVELS = [
    { rows: () => 3, cell: () => 'e', iuds: [], powerups: false },
    {
      rows: cols => heartMap(cols).length,
      cell: (r, c, cols) => heartMap(cols)[r][c] !== '#' ? '.' : ((r * cols + c) % 5 === 2 ? 'c' : 'e'),
      iuds: [], powerups: true,
    },
    {
      rows: () => 4,
      cell: (r, c) => ((r + c) % 3 === 0 ? 'c' : 'e'),
      iuds: [{ fx: 0.27, fy: 0.5, kind: 'copper' }, { fx: 0.73, fy: 0.5, kind: 'hormonal' }],
      powerups: true,
    },
    {
      rows: () => 5,
      cell: (r, c) => (r === 0 ? 'd' : ((r + c) % 2 === 0 ? 'c' : 'e')),
      iuds: [
        { fx: 0.2, fy: 0, kind: 'copper', drift: 1 },
        { fx: 0.5, fy: 0.85, kind: 'hormonal', drift: -1 },
        { fx: 0.8, fy: 0, kind: 'copper', drift: 1 },
      ],
      powerups: true,
    },
  ];

  let W = 0, H = 0, DPR = 1;
  let FX = 0, FW = 0, U = 1, TOP = 0, PADDLE_Y = 0, SAFE_TOP = 0, SAFE_BOTTOM = 0;
  let BR = 6, SPEED = 400; // ball radius & speed
  let bricks = [], iuds = [], balls = [], tokens = [], babies = [], particles = [];
  let state = 'title', stateTime = 0;
  let level = 1, lives = 3, score = 0, levelBabies = 0, best = 0;
  let aim = 0; // radians from vertical
  let time = 0, ballPhase = 0;
  let lastLostAge = 0, currentCard = null, currentJoke = '';
  let buttonRects = [];
  let pausedFrom = null;
  let musicOn = true;
  let ignoreNextUp = false, pointerIsDown = false;
  const keys = {};
  const paddle = { x: 0, target: 0, w: 80, h: 14 };
  const grid = { cols: 0, rows: 0, pad: 0, pitchX: 0, pitchY: 0, eggW: 0, eggH: 0, top: 0 };

  try { best = +localStorage.getItem('eggcellent-best') || 0; } catch (e) { /* ignore */ }
  try { musicOn = localStorage.getItem('eggcellent-music') !== 'off'; } catch (e) { /* ignore */ }

  // ---- Helpers ------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  function mix(hex, toHex, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = p(toHex);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const lighten = (h, t) => mix(h, '#ffffff', t);
  const darken = (h, t) => mix(h, '#000000', t);

  // Random order without repeats until every item has been shown.
  function shuffleBag(items) {
    let pool = [], last = null;
    return () => {
      if (!pool.length) {
        pool = items.slice();
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        if (pool.length > 1 && pool[pool.length - 1] === last) [pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]];
      }
      last = pool.pop();
      return last;
    };
  }
  const nextJoke = shuffleBag(LEVEL_JOKES);
  const nextCard = shuffleBag(MISS_CARDS);
  const nextGameOverJoke = shuffleBag(GAME_OVER_JOKES);

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem('eggcellent-best', String(best)); } catch (e) { /* ignore */ }
    }
  }

  // ---- Sound --------------------------------------------------------------
  let actx = null;
  function unlockAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function beep(freq, dur, type = 'sine', vol = 0.08, slideTo = 0, delay = 0) {
    if (!actx) return;
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function choir(freqs, dur, vol) {
    if (!actx) return;
    const t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  const sfx = {
    hatch: () => { beep(rand(620, 760), 0.12, 'triangle', 0.1, 1300); beep(1500, 0.08, 'sine', 0.04, 1900, 0.06); },
    latex: () => { beep(160, 0.16, 'square', 0.05, 70); beep(900, 0.05, 'triangle', 0.05, 400); },
    iud: () => beep(1250, 0.07, 'square', 0.025, 1100),
    paddle: () => beep(320, 0.09, 'sine', 0.09, 480),
    wall: () => beep(520, 0.04, 'sine', 0.03),
    launch: () => beep(260, 0.18, 'triangle', 0.07, 700),
    powerup: () => [660, 880, 1320].forEach((f, i) => beep(f, 0.12, 'triangle', 0.07, 0, i * 0.06)),
    lose: () => choir([261.6, 329.6, 392, 523.3], 1.6, 0.035),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.08, 0, i * 0.12)),
  };

  // ---- Music: a quiet little chiptune loop -------------------------------
  const STEP = 60 / 112 / 2; // eighth notes at 112 bpm
  const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);
  const _ = 0;
  const LEAD = [
    72, _, 76, 79, _, 76, 72, _,   69, _, 72, 76, _, 72, 69, _,
    65, _, 69, 72, _, 74, 72, _,   67, _, 71, 74, _, 71, 67, 71,
    79, 77, 76, _, 72, _, 74, 76,  76, _, 72, _, 69, 71, 72, _,
    77, _, 76, 74, 72, _, 69, _,   71, 72, 74, _, 79, _, 74, _,
  ];
  const BASS = [48, 45, 41, 43, 48, 45, 41, 43];
  let musicStep = 0, musicNext = 0;
  function blip(freq, t, dur, type, vol) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function musicTick() {
    if (!actx || actx.state !== 'running' || !musicOn || state === 'paused' || document.hidden) return;
    const now = actx.currentTime;
    if (musicNext < now) musicNext = now + 0.05;
    while (musicNext < now + 0.25) {
      const i = musicStep % LEAD.length, s = i % 8;
      if (LEAD[i]) blip(midiHz(LEAD[i]), musicNext, STEP * 0.7, 'square', 0.016);
      if (s % 2 === 0) blip(midiHz(BASS[Math.floor(i / 8)] + (s % 4 === 2 ? 12 : 0)), musicNext, STEP * 1.6, 'triangle', 0.05);
      musicNext += STEP;
      musicStep++;
    }
  }
  setInterval(musicTick, 50);

  function setMusic(on) {
    musicOn = on;
    try { localStorage.setItem('eggcellent-music', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  }

  // ---- Pause --------------------------------------------------------------
  const canPause = () => state === 'aim' || state === 'play';
  function pause() {
    if (!canPause()) return;
    pausedFrom = state;
    state = 'paused';
  }
  function resume() {
    if (state !== 'paused') return;
    state = pausedFrom;
    pausedFrom = null;
  }
  function pauseButtonRect() {
    const s = Math.max(30, Math.min(38, U * 8));
    return { x: FX + U * 3, y: SAFE_TOP + (TOP - SAFE_TOP) / 2 - s / 2, w: s, h: s };
  }

  // ---- Layout -------------------------------------------------------------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const cs = getComputedStyle(safeProbe);
    SAFE_TOP = parseFloat(cs.paddingTop) || 0;
    SAFE_BOTTOM = parseFloat(cs.paddingBottom) || 0;
    layout();
  }

  function layout() {
    FW = Math.min(W, 640);
    FX = (W - FW) / 2;
    U = FW / 100;
    TOP = SAFE_TOP + Math.max(46, U * 10);
    paddle.w = Math.max(76, U * 22);
    paddle.h = Math.max(12, U * 3);
    PADDLE_Y = H - SAFE_BOTTOM - Math.max(72, H * 0.13);
    BR = Math.max(6, U * 1.7);
    paddle.x = clamp(paddle.x || W / 2, FX + paddle.w / 2, FX + FW - paddle.w / 2);
    paddle.target = clamp(paddle.target || paddle.x, FX + paddle.w / 2, FX + FW - paddle.w / 2);
    if (grid.cols) layoutGrid();
  }

  function layoutGrid() {
    grid.pad = U * 3;
    grid.pitchX = (FW - grid.pad * 2) / grid.cols;
    grid.eggW = grid.pitchX * 0.8;
    grid.eggH = grid.eggW * 1.22;
    grid.pitchY = grid.eggH * 1.16;
    const avail = (PADDLE_Y - TOP) * (iuds.length ? 0.42 : 0.5);
    if (grid.rows * grid.pitchY > avail) {
      const k = avail / (grid.rows * grid.pitchY);
      grid.eggW *= k; grid.eggH *= k; grid.pitchY *= k;
    }
    grid.top = TOP + U * 5;
  }

  function brickPos(b) {
    return {
      x: FX + grid.pad + grid.pitchX * (b.col + 0.5),
      y: grid.top + grid.pitchY * (b.row + 0.5),
    };
  }

  function pointerGeom() {
    const L = Math.max(62, U * 15);
    const bx = paddle.x, by = PADDLE_Y + paddle.h * 0.2;
    const dx = Math.sin(aim), dy = -Math.cos(aim);
    const reach = L + BR * 1.4 + BR * 6;
    return { bx, by, L, dx, dy, reach, ballX: bx + dx * reach, ballY: by + dy * reach };
  }

  function iudGeom(d) {
    const aw = Math.max(54, U * 16), t = Math.max(6, U * 2), sw = t * 1.5, sh = Math.max(44, U * 13);
    const x = FX + d.fx * FW + (d.drift ? Math.sin(time * 0.9) * d.drift * FW * 0.12 : 0);
    const gridBottom = grid.top + grid.rows * grid.pitchY;
    const zoneTop = gridBottom + U * 5;
    const zoneBottom = PADDLE_Y - pointerGeom().reach - BR * 8 - U * 6 - sh;
    const y = zoneTop + Math.max(0, zoneBottom - zoneTop) * d.fy;
    return {
      x, y, aw, t, sw, sh,
      rects: [[x - aw / 2, y, x + aw / 2, y + t], [x - sw / 2, y + t, x + sw / 2, y + sh]],
    };
  }

  // ---- Game flow ----------------------------------------------------------
  function setState(s) { state = s; stateTime = 0; }

  function buildLevel() {
    const def = LEVELS[level - 1];
    grid.cols = FW < 480 ? 6 : 8;
    grid.rows = def.rows(grid.cols);
    bricks = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const code = def.cell(r, c, grid.cols);
        if (code === '.') continue;
        bricks.push({
          row: r, col: c, alive: true,
          shield: code === 'd' ? 2 : code === 'c' ? 1 : 0, wobble: 0,
          color: BOW_COLORS[(r * 3 + c) % BOW_COLORS.length], off: Math.random() * 10,
        });
      }
    }
    iuds = def.iuds.map(d => ({ ...d }));
    layoutGrid();
    balls = []; tokens = [];
    levelBabies = 0;
    aim = 0;
  }

  function newGame() {
    level = 1; lives = 3; score = 0;
    babies = []; particles = [];
    buildLevel();
    setState('aim');
  }

  function launch() {
    const base = Math.min(Math.max(H * 0.62, 380), 650);
    SPEED = Math.min(base * (1 + 0.08 * (level - 1)), 950);
    const g = pointerGeom();
    balls = [{ x: g.ballX, y: g.ballY, vx: Math.sin(aim) * SPEED, vy: -Math.cos(aim) * SPEED, born: time }];
    sfx.launch();
    setState('play');
  }

  function loseLife() {
    lives--;
    tokens = [];
    currentCard = nextCard();
    sfx.lose();
    setState('missed');
  }

  function dismissMiss() {
    if (lives <= 0) {
      saveBest();
      currentJoke = nextGameOverJoke();
      setState('gameover');
    } else {
      aim = 0;
      setState('aim');
    }
  }

  function addText(x, y, text, color) {
    particles.push({ type: 'text', x, y, vx: 0, vy: -60, rot: 0, vr: 0, size: Math.max(16, U * 4.5), life: 0, max: 1.3, text, color });
  }

  function popCondom(b) {
    b.shield--;
    b.wobble = 1;
    const p = brickPos(b);
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2), s = rand(80, 240);
      particles.push({ type: 'shell', x: p.x + Math.cos(a) * grid.eggW * 0.4, y: p.y + Math.sin(a) * grid.eggH * 0.4,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, rot: rand(0, 6), vr: rand(-10, 10),
        size: grid.eggW * rand(0.08, 0.14), life: 0, max: rand(0.4, 0.7), fill: 'rgba(255,232,180,0.8)', stroke: '#c8a060' });
    }
    sfx.latex();
  }

  function hatch(b) {
    b.alive = false;
    score++;
    levelBabies++;
    const p = brickPos(b);
    babies.push({
      x: p.x, y: p.y, w: grid.eggW, h: grid.eggH, color: b.color,
      vx: rand(-0.4, 0.4) * U * 12, vy: -H * 0.35, rot: 0, vr: rand(-2.5, 2.5), t: 0,
    });
    for (let i = 0; i < 9; i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 220);
      particles.push({ type: 'shell', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80,
        rot: rand(0, 6), vr: rand(-8, 8), size: grid.eggW * rand(0.1, 0.18), life: 0, max: rand(0.5, 0.9) });
    }
    for (let i = 0; i < 2; i++) {
      particles.push({ type: 'heart', x: p.x + rand(-10, 10), y: p.y, vx: rand(-30, 30), vy: rand(-110, -70),
        rot: 0, vr: 0, size: U * rand(2.2, 3.2), life: 0, max: 1.1, color: b.color });
    }
    sfx.hatch();

    if (LEVELS[level - 1].powerups && tokens.length < 2 && Math.random() < 0.14) {
      tokens.push({ x: p.x, y: p.y, kind: Math.random() < 0.22 ? 'triplets' : 'twins' });
    }

    if (!bricks.some(x => x.alive)) {
      tokens = [];
      saveBest();
      sfx.win();
      if (level >= LEVELS.length) {
        for (let i = 0; i < 40; i++) {
          particles.push({ type: 'heart', x: rand(FX, FX + FW), y: H + 20, vx: rand(-40, 40), vy: rand(-H * 0.9, -H * 0.4),
            rot: 0, vr: 0, size: U * rand(2.5, 4.5), life: 0, max: rand(1.5, 2.6), color: BOW_COLORS[i % BOW_COLORS.length] });
        }
        setState('win');
      } else {
        currentJoke = nextJoke().replace('{babies}', levelBabies);
        setState('levelclear');
      }
    }
  }

  function collectToken(k) {
    const n = k.kind === 'twins' ? 1 : 2;
    const src = balls[0];
    if (src) {
      const a0 = Math.atan2(src.vx, -src.vy);
      const offsets = [0.45, -0.45];
      for (let i = 0; i < n && balls.length < 8; i++) {
        const a = clamp(a0 + offsets[i], -1.1, 1.1);
        balls.push({ x: src.x, y: src.y, vx: Math.sin(a) * SPEED, vy: -Math.abs(Math.cos(a)) * SPEED, born: time });
      }
    }
    addText(k.x, PADDLE_Y - U * 6, k.kind === 'twins' ? 'Twins! 👶👶' : 'Triplets! 👶👶👶', k.kind === 'twins' ? '#3d8fd6' : '#e08a1e');
    sfx.powerup();
  }

  // ---- Update -------------------------------------------------------------
  function update(dt) {
    if (state === 'paused') return;
    time += dt;
    stateTime += dt;
    ballPhase += dt * 14;

    const kbSpeed = FW * 1.4;
    if (state === 'play') {
      if (keys.ArrowLeft || keys.a) paddle.target -= kbSpeed * dt;
      if (keys.ArrowRight || keys.d) paddle.target += kbSpeed * dt;
    } else if (state === 'aim') {
      if (keys.ArrowLeft || keys.a) aim -= 1.8 * dt;
      if (keys.ArrowRight || keys.d) aim += 1.8 * dt;
      aim = clamp(aim, -1.2, 1.2);
    }
    paddle.target = clamp(paddle.target, FX + paddle.w / 2, FX + FW - paddle.w / 2);
    paddle.x += (paddle.target - paddle.x) * Math.min(1, dt * 22);

    for (const b of bricks) if (b.wobble > 0) b.wobble = Math.max(0, b.wobble - dt * 2.5);

    if (state === 'play') {
      const n = Math.max(1, Math.ceil(SPEED * dt / (BR * 0.6)));
      for (let i = 0; i < n && state === 'play'; i++) {
        for (const b of balls) {
          stepBall(b, dt / n);
          if (state !== 'play') break;
        }
        if (state !== 'play') break;
        const before = balls.length;
        balls = balls.filter(b => {
          if (b.y - BR > H) { lastLostAge = time - b.born; return false; }
          return true;
        });
        if (before && !balls.length) loseLife();
      }

      const tw = Math.max(84, U * 22), th = Math.max(28, U * 7.5);
      for (const k of tokens) {
        k.y += H * 0.28 * dt;
        if (k.y + th / 2 >= PADDLE_Y && k.y - th / 2 <= PADDLE_Y + paddle.h &&
            Math.abs(k.x - paddle.x) <= paddle.w / 2 + tw / 2) {
          k.caught = true;
          collectToken(k);
        }
      }
      tokens = tokens.filter(k => !k.caught && k.y - th < H);
    }

    const grav = H * 1.25;
    for (const b of babies) {
      b.t += dt;
      b.vy += grav * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.t > 0.3) b.rot += b.vr * dt;
    }
    babies = babies.filter(b => b.y - b.h < H + 40);

    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === 'shell') p.vy += grav * 0.8 * dt;
      else if (p.type === 'heart' && p.max > 1.4) p.vy += grav * 0.35 * dt;
      else p.vy *= 0.98;
    }
    particles = particles.filter(p => p.life < p.max);
  }

  // Circle vs axis-aligned box. Reflects and pushes the ball out on contact.
  function bounceOffRect(b, x0, y0, x1, y1) {
    const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1);
    const nx = b.x - cx, ny = b.y - cy;
    const d2 = nx * nx + ny * ny;
    if (d2 > BR * BR) return false;
    if (d2 === 0) {
      const m = Math.min(b.x - x0, x1 - b.x, b.y - y0, y1 - b.y);
      if (m === b.x - x0) { b.x = x0 - BR; b.vx = -Math.abs(b.vx); }
      else if (m === x1 - b.x) { b.x = x1 + BR; b.vx = Math.abs(b.vx); }
      else if (m === b.y - y0) { b.y = y0 - BR; b.vy = -Math.abs(b.vy); }
      else { b.y = y1 + BR; b.vy = Math.abs(b.vy); }
    } else if (Math.abs(nx) > Math.abs(ny)) {
      b.vx = Math.sign(nx) * Math.abs(b.vx);
      b.x = cx + Math.sign(nx) * BR;
    } else {
      b.vy = Math.sign(ny) * Math.abs(b.vy);
      b.y = cy + Math.sign(ny) * BR;
    }
    return true;
  }

  function stepBall(b, dt) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x - BR < FX) { b.x = FX + BR; b.vx = Math.abs(b.vx); sfx.wall(); }
    if (b.x + BR > FX + FW) { b.x = FX + FW - BR; b.vx = -Math.abs(b.vx); sfx.wall(); }
    if (b.y - BR < TOP) { b.y = TOP + BR; b.vy = Math.abs(b.vy); sfx.wall(); }

    // paddle
    const hw = paddle.w / 2;
    if (b.vy > 0 && b.y + BR >= PADDLE_Y && b.y - BR <= PADDLE_Y + paddle.h &&
        b.x >= paddle.x - hw - BR && b.x <= paddle.x + hw + BR) {
      const t = clamp((b.x - paddle.x) / hw, -1, 1);
      const a = t * 1.05;
      b.vx = Math.sin(a) * SPEED;
      b.vy = -Math.cos(a) * SPEED;
      b.y = PADDLE_Y - BR;
      sfx.paddle();
    }

    // IUDs (indestructible)
    if (time - b.born > 0.2) {
      for (const d of iuds) {
        const g = iudGeom(d);
        if (g.rects.some(r => bounceOffRect(b, r[0], r[1], r[2], r[3]))) { sfx.iud(); break; }
      }
    }

    // eggs
    const hx = grid.eggW * 0.45, hy = grid.eggH * 0.46;
    for (const brick of bricks) {
      if (!brick.alive) continue;
      const p = brickPos(brick);
      const pad = brick.shield ? 1.08 : 1;
      if (!bounceOffRect(b, p.x - hx * pad, p.y - hy * pad, p.x + hx * pad, p.y + hy * pad)) continue;
      if (brick.shield > 0) popCondom(brick);
      else hatch(brick);
      break;
    }
  }

  // ---- Drawing: characters ------------------------------------------------
  function eggPath(cx, cy, w, h) {
    const rx = w / 2, ry = h / 2;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const x = cx + rx * s * (1 - 0.14 * c);
      const y = cy - ry * c;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawBow(x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.fillStyle = color;
    ctx.strokeStyle = darken(color, 0.25);
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-s * 0.45, s * 0.9); ctx.lineTo(-s * 0.15, s * 0.75); ctx.closePath();
    ctx.moveTo(0, 0); ctx.lineTo(s * 0.45, s * 0.9); ctx.lineTo(s * 0.15, s * 0.75); ctx.closePath();
    ctx.fill(); ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(side * s * 1.1, -s * 0.8, side * s * 1.1, s * 0.8, 0, 0);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(-s * 0.55, -s * 0.18, s * 0.18, s * 0.09, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawEgg(cx, cy, w, h, color, blinkOff) {
    ctx.fillStyle = 'rgba(160,52,107,0.10)';
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.5, w * 0.36, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();

    eggPath(cx, cy, w, h);
    const g = ctx.createRadialGradient(cx - w * 0.15, cy - h * 0.18, w * 0.05, cx, cy, h * 0.65);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.65, '#fbf7f2');
    g.addColorStop(1, '#eadfd2');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#dccbb8';
    ctx.lineWidth = Math.max(1, w * 0.025);
    ctx.stroke();

    const ey = cy + h * 0.06, ex = w * 0.17, er = w * 0.065;
    const blinking = ((time + blinkOff) % 4.2) < 0.13;
    ctx.fillStyle = INK; ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    if (blinking) {
      ctx.lineWidth = Math.max(1, w * 0.035);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx + s * ex - er, ey); ctx.lineTo(cx + s * ex + er, ey); ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(cx + s * ex, ey, er, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx + s * ex - er * 0.35, ey - er * 0.35, er * 0.38, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + s * w * 0.29, cy + h * 0.16, w * 0.09, w * 0.055, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.beginPath(); ctx.arc(cx, cy + h * 0.12, w * 0.075, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

    drawBow(cx + w * 0.14, cy - h * 0.34, w * 0.22, color);
  }

  // A translucent latex sleeve over the egg: reservoir tip on top, rolled rim at the bottom.
  function drawCondom(cx, cy, w, h, layers) {
    for (let i = layers; i >= 1; i--) {
      const cw = w * (1.08 + 0.14 * (i - 1)), ch = h * (1.04 + 0.1 * (i - 1));
      const top = cy - ch / 2;
      ctx.lineWidth = Math.max(1, w * 0.03);
      ctx.strokeStyle = 'rgba(190,150,80,0.9)';
      ctx.fillStyle = 'rgba(255,234,185,0.55)';
      ctx.beginPath(); ctx.ellipse(cx, top - h * 0.045, w * 0.075, h * 0.07, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      eggPath(cx, cy, cw, ch);
      ctx.fillStyle = i > 1 ? 'rgba(255,214,140,0.38)' : 'rgba(255,234,185,0.32)';
      ctx.fill(); ctx.stroke();
      ctx.lineWidth = Math.max(2, w * 0.075);
      ctx.strokeStyle = 'rgba(214,176,105,0.95)';
      ctx.beginPath(); ctx.ellipse(cx, cy + ch * 0.44, cw * 0.36, h * 0.05, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, cw * 0.36, Math.PI * 1.08, Math.PI * 1.32); ctx.stroke();
    }
  }

  function drawBrick(b) {
    const p = brickPos(b);
    const y = p.y + Math.sin(time * 2 + b.off) * U * 0.35;
    ctx.save();
    if (b.wobble > 0) {
      const s = Math.sin(time * 45) * 0.14 * b.wobble;
      ctx.translate(p.x, y);
      ctx.scale(1 + s, 1 - s);
      ctx.translate(-p.x, -y);
    }
    drawEgg(p.x, y, grid.eggW, grid.eggH, b.color, b.off);
    if (b.shield) drawCondom(p.x, y, grid.eggW, grid.eggH, b.shield);
    ctx.restore();
  }

  function drawIUD(d) {
    const g = iudGeom(d);
    const { x, y, aw, t, sw, sh } = g;
    const line = '#97a0b4';
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // strings
    ctx.strokeStyle = d.kind === 'copper' ? '#5d6070' : '#3f5a86';
    ctx.lineWidth = Math.max(1, U * 0.3);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * t * 0.15, y + sh);
      ctx.quadraticCurveTo(x + s * t * 1.2 + Math.sin(time * 2 + s) * U, y + sh + U * 4, x + s * t * 0.5, y + sh + U * 8);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.5, U * 0.35);
    // stem
    roundRect(x - t / 2, y + t * 0.5, t, sh - t * 0.5, t / 2);
    ctx.fill(); ctx.stroke();
    // arms
    roundRect(x - aw / 2, y, aw, t, t / 2);
    ctx.fill(); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(x + s * (aw / 2 - t * 0.3), y + t * 0.5, t * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    if (d.kind === 'copper') {
      // copper sleeves on the arms + coiled wire on the stem
      ctx.fillStyle = COPPER;
      ctx.strokeStyle = darken(COPPER, 0.25);
      for (const s of [-1, 1]) {
        roundRect(x + s * aw * 0.3 - aw * 0.08, y - t * 0.08, aw * 0.16, t * 1.16, t * 0.3);
        ctx.fill(); ctx.stroke();
      }
      ctx.strokeStyle = COPPER;
      ctx.lineWidth = Math.max(1.5, t * 0.3);
      for (let yy = y + t * 1.5; yy < y + sh - t * 0.8; yy += t * 0.45) {
        ctx.beginPath(); ctx.moveTo(x - sw / 2, yy + t * 0.15); ctx.lineTo(x + sw / 2, yy - t * 0.15); ctx.stroke();
      }
    } else {
      // hormone reservoir around the stem
      const ry = y + t * 1.3, rh = sh * 0.62, rw = sw * 1.15;
      const gr = ctx.createLinearGradient(x - rw / 2, 0, x + rw / 2, 0);
      gr.addColorStop(0, '#e9eef7');
      gr.addColorStop(0.4, '#ffffff');
      gr.addColorStop(1, '#d5dceb');
      ctx.fillStyle = gr;
      ctx.strokeStyle = line;
      roundRect(x - rw / 2, ry, rw, rh, rw / 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.5, U * 0.35);
    ctx.beginPath(); ctx.arc(x, y + sh, t * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawToken(k) {
    const w = Math.max(84, U * 22), h = Math.max(28, U * 7.5);
    const pulse = 1 + 0.06 * Math.sin(time * 8);
    const twins = k.kind === 'twins';
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = twins ? '#64b5f6' : '#ffb74d';
    ctx.shadowBlur = 14;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, twins ? '#8ccaff' : '#ffd27a');
    g.addColorStop(1, twins ? '#3d8fd6' : '#f0971f');
    ctx.fillStyle = g;
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${h * 0.48}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(twins ? 'Twins ×2' : 'Triplets ×3', 0, h * 0.03);
    ctx.restore();
  }

  function drawBaby(b) {
    const { w, h, color } = b;
    const pop = b.t < 0.25 ? 0.5 + 0.7 * Math.sin((b.t / 0.25) * Math.PI * 0.5) : 1.2 - Math.min(0.2, (b.t - 0.25) * 1.2);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(pop, pop);

    const blanket = lighten(color, 0.35), blanketLine = darken(color, 0.15);
    ctx.fillStyle = blanket;
    ctx.strokeStyle = blanketLine;
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.beginPath(); ctx.ellipse(0, h * 0.06, w * 0.43, h * 0.44, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lighten(color, 0.55);
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, h * 0.02);
    ctx.quadraticCurveTo(w * 0.05, h * 0.12, w * 0.4, h * 0.3);
    ctx.quadraticCurveTo(w * 0.1, h * 0.5, -w * 0.25, h * 0.38);
    ctx.quadraticCurveTo(-w * 0.45, h * 0.2, -w * 0.42, h * 0.02);
    ctx.fill(); ctx.stroke();

    const fy = -h * 0.16, fr = w * 0.29;
    ctx.fillStyle = '#ffdcc6';
    ctx.strokeStyle = '#e7b394';
    ctx.beginPath(); ctx.arc(0, fy, fr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = blanketLine;
    ctx.lineWidth = Math.max(1.5, w * 0.06);
    ctx.beginPath(); ctx.arc(0, fy, fr * 1.12, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = '#8d5a3b';
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(w * 0.02, fy - fr * 0.78, fr * 0.2, Math.PI * 0.9, Math.PI * 2.4); ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, w * 0.03);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * fr * 0.38, fy - fr * 0.02, fr * 0.16, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,110,140,0.45)';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * fr * 0.6, fy + fr * 0.3, fr * 0.15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#d9707e';
    ctx.beginPath(); ctx.ellipse(0, fy + fr * 0.45, fr * 0.11, fr * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSperm(x, y, angle, r, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';

    const N = 16, len = r * 6, amp = r * 0.9;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      pts.push([-r * 1.15 - k * len, Math.sin(phase - i * 0.55) * amp * (0.2 + 0.8 * k)]);
    }
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? '#ffffff' : '#8aa1c9';
      for (let i = 1; i <= N; i++) {
        const k = i / N;
        ctx.lineWidth = r * (0.55 - 0.42 * k) + (pass ? 0 : Math.max(1.5, r * 0.25));
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    }

    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9e5ff');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#8aa1c9';
    ctx.lineWidth = Math.max(1.2, r * 0.2);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    for (const s of [-1, 1]) {
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(r * 0.5, s * r * 0.38, r * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(r * 0.56, s * r * 0.38 - r * 0.07, r * 0.07, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPointer(g) {
    ctx.save();
    ctx.translate(g.bx, g.by);
    ctx.rotate(aim);
    const L = g.L;
    const sw = Math.max(15, U * 4.4);
    const tr = sw * 0.62;
    const lw = Math.max(1.5, U * 0.4);
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';

    ctx.fillStyle = SKIN; ctx.strokeStyle = SKIN_LINE;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * tr * 0.82, -tr * 0.15, tr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    const glansH = sw * 1.05;
    const corona = -L + glansH;
    ctx.beginPath();
    ctx.moveTo(-sw / 2, -tr * 0.4);
    ctx.lineTo(-sw / 2, corona + sw * 0.1);
    ctx.lineTo(sw / 2, corona + sw * 0.1);
    ctx.lineTo(sw / 2, -tr * 0.4);
    ctx.quadraticCurveTo(0, -tr * 0.1, -sw / 2, -tr * 0.4);
    ctx.fillStyle = SKIN; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-sw / 2, -tr * 0.4); ctx.lineTo(-sw / 2, corona + sw * 0.1);
    ctx.moveTo(sw / 2, -tr * 0.4); ctx.lineTo(sw / 2, corona + sw * 0.1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(-sw * 0.32, corona + sw * 0.3, sw * 0.14, -corona - sw * 0.3 - tr * 0.9, sw * 0.07);
    ctx.fill();

    // glans (circumcised: fully exposed head with a defined corona rim)
    const gw = sw * 1.18;
    ctx.beginPath();
    ctx.ellipse(0, corona, gw / 2, glansH, 0, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(0, corona + sw * 0.42, -gw / 2, corona);
    ctx.closePath();
    ctx.fillStyle = GLANS; ctx.strokeStyle = GLANS_LINE;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-gw * 0.2, corona - glansH * 0.5, gw * 0.1, glansH * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -L + sw * 0.08); ctx.lineTo(0, -L + sw * 0.3);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(160,52,107,0.35)';
    for (let i = 1; i <= 7; i++) {
      const d = BR * 3 + i * U * 4.5;
      ctx.globalAlpha = 1 - i / 8;
      ctx.beginPath(); ctx.arc(g.ballX + g.dx * d, g.ballY + g.dy * d, Math.max(2, U * 0.7), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHeart(x, y, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      if (p.type === 'shell') {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.fill || '#fbf7f2';
        ctx.strokeStyle = p.stroke || '#dccbb8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.7); ctx.lineTo(p.size * 0.8, p.size * 0.3); ctx.lineTo(0, p.size * 0.5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (p.type === 'text') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.font = `900 ${p.size}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fff';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      } else {
        drawHeart(p.x, p.y, p.size, p.color, a);
      }
    }
  }

  // ---- Drawing: scene -----------------------------------------------------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffe9f1');
    g.addColorStop(1, '#ffd3e2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (FX > 0) {
      ctx.fillStyle = 'rgba(160,52,107,0.06)';
      ctx.fillRect(0, 0, FX, H);
      ctx.fillRect(FX + FW, 0, W - FX - FW, H);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 10; i++) {
      const x = FX + ((i * 137.5) % 100) / 100 * FW;
      const y = ((i * 71 + time * (8 + i)) % (H + 80)) - 40;
      ctx.beginPath(); ctx.arc(x, H - y, U * (1.5 + (i % 4)), 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPaddle() {
    const x = paddle.x - paddle.w / 2, y = PADDLE_Y;
    const g = ctx.createLinearGradient(0, y, 0, y + paddle.h);
    g.addColorStop(0, '#ff8fbf');
    g.addColorStop(1, ACCENT);
    ctx.fillStyle = g;
    roundRect(x, y, paddle.w, paddle.h, paddle.h / 2);
    ctx.fill();
    ctx.strokeStyle = '#b8336f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    roundRect(x + paddle.h * 0.6, y + paddle.h * 0.18, paddle.w - paddle.h * 1.2, paddle.h * 0.28, paddle.h * 0.14);
    ctx.fill();
  }

  function drawHUD() {
    const y = SAFE_TOP + (TOP - SAFE_TOP) / 2;
    const fs = Math.max(15, Math.min(22, U * 4.2));
    ctx.textBaseline = 'middle';
    ctx.fillStyle = HUD_INK;
    ctx.font = `800 ${fs}px ${FONT}`;
    const pb = pauseButtonRect();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.strokeStyle = 'rgba(160,52,107,0.35)';
    ctx.lineWidth = 1.5;
    roundRect(pb.x, pb.y, pb.w, pb.h, pb.w * 0.3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = HUD_INK;
    if (state === 'paused') {
      ctx.beginPath();
      ctx.moveTo(pb.x + pb.w * 0.38, pb.y + pb.h * 0.28);
      ctx.lineTo(pb.x + pb.w * 0.72, pb.y + pb.h * 0.5);
      ctx.lineTo(pb.x + pb.w * 0.38, pb.y + pb.h * 0.72);
      ctx.closePath(); ctx.fill();
    } else {
      for (const fx of [0.32, 0.56]) roundRect(pb.x + pb.w * fx, pb.y + pb.h * 0.28, pb.w * 0.13, pb.h * 0.44, 2), ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${level}/${LEVELS.length}`, pb.x + pb.w + U * 2.5, y);
    ctx.textAlign = 'center';
    ctx.fillText(`👶 ${score}`, FX + FW / 2, y);
    ctx.textAlign = 'right';
    ctx.fillText(`× ${lives}`, FX + FW - U * 3, y);
    const tw = ctx.measureText(`× ${lives}`).width;
    drawSperm(FX + FW - U * 3 - tw - fs * 0.7, y, 0, fs * 0.28, time * 10);
    ctx.strokeStyle = 'rgba(160,52,107,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(FX, TOP); ctx.lineTo(FX + FW, TOP); ctx.stroke();
  }

  function wrapText(text, maxW) {
    const words = text.split(' ');
    const out = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = w; }
      else line = test;
    }
    out.push(line);
    return out;
  }

  // Centered card. lines: [{text, size, weight, color, pulse}]; opts: {y, iconH, button}
  function drawPanel(lines, opts = {}) {
    const pw = Math.min(FW * 0.88, 440);
    const padX = 22, padY = 22;
    const rows = [];
    for (const l of lines) {
      ctx.font = `${l.weight || 800} ${l.size}px ${FONT}`;
      for (const t of wrapText(l.text, pw - padX * 2)) rows.push({ ...l, text: t, h: l.size * 1.35 });
    }
    const iconH = opts.iconH || 0;
    const buttons = opts.buttons || (opts.button ? [{ label: opts.button, id: 'main' }] : []);
    const btnH = Math.max(46, U * 11), btnGap = 12;
    const btnsH = buttons.length ? 18 + buttons.length * btnH + (buttons.length - 1) * btnGap : 0;
    const textH = rows.reduce((a, r) => a + r.h, 0);
    const ph = padY * 2 + iconH + textH + btnsH;
    const px = W / 2 - pw / 2, py = opts.y != null ? opts.y : H / 2 - ph / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(224,80,143,0.35)';
    ctx.lineWidth = 2;
    roundRect(px, py, pw, ph, 22);
    ctx.fill(); ctx.stroke();

    let y = py + padY + iconH;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of rows) {
      ctx.font = `${r.weight || 800} ${r.size}px ${FONT}`;
      ctx.fillStyle = r.color || HUD_INK;
      if (r.pulse) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 4);
      ctx.fillText(r.text, W / 2, y + r.h / 2);
      ctx.globalAlpha = 1;
      y += r.h;
    }

    buttonRects = [];
    const bw = Math.min(pw - padX * 2, 230);
    const bx = W / 2 - bw / 2;
    let by = y + 18;
    const ready = opts.instant || stateTime > 0.5;
    for (const btn of buttons) {
      ctx.globalAlpha = ready ? 1 : 0.45;
      if (btn.secondary) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        roundRect(bx, by, bw, btnH, btnH / 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = ACCENT;
      } else {
        const g = ctx.createLinearGradient(0, by, 0, by + btnH);
        g.addColorStop(0, '#ff8fbf');
        g.addColorStop(1, ACCENT);
        ctx.fillStyle = g;
        roundRect(bx, by, bw, btnH, btnH / 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
      }
      ctx.font = `900 ${btnH * 0.4}px ${FONT}`;
      ctx.fillText(btn.label, W / 2, by + btnH / 2 + 1);
      ctx.globalAlpha = 1;
      buttonRects.push({ x: bx, y: by, w: bw, h: btnH, id: btn.id });
      by += btnH + btnGap;
    }
    return { px, py, pw, ph };
  }

  function drawTitle() {
    const big = Math.min(FW * 0.13, 64);
    const cx = W / 2, cy = H * 0.3;
    const ew = Math.min(FW * 0.3, 150), eh = ew * 1.22;
    drawEgg(cx, cy, ew, eh, '#ff6fa5', 0);
    const R = ew * 1.0, a = time * 1.6;
    drawSperm(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.9, a + Math.PI / 2, Math.max(7, U * 2.2), time * 14);
    const isTouch = matchMedia('(pointer: coarse)').matches;
    const small = Math.max(14, big * 0.27);
    drawPanel([
      { text: GAME_TITLE, size: big, weight: 900, color: ACCENT },
      { text: GIFT_MESSAGE, size: Math.max(15, big * 0.32), weight: 700 },
      { text: ' ', size: 6 },
      { text: isTouch ? 'Drag to aim, let go to launch' : 'Move mouse to aim, click to launch', size: small, weight: 600 },
      { text: isTouch ? 'Then drag to move the paddle' : 'Then move the mouse (or ← →) for the paddle', size: small, weight: 600 },
      { text: ' ', size: 6 },
      { text: isTouch ? 'Tap to start' : 'Click to start', size: Math.max(18, big * 0.42), weight: 900, pulse: true, color: ACCENT },
      ...(best ? [{ text: `Best: ${best} babies`, size: Math.max(13, big * 0.24), weight: 600 }] : []),
    ], { y: cy + eh * 0.75 });
  }

  function drawMissCard(fs) {
    const iconH = Math.max(56, U * 15);
    const card = currentCard;
    const panel = drawPanel([
      { text: card.text.replace('{seconds}', lastLostAge.toFixed(1)), size: fs * 1.05, weight: 800 },
    ], { iconH, button: card.button });
    // a little sperm floating up to heaven, halo and all
    const r = Math.max(9, U * 2.6);
    const sx = W / 2 + r * 2.5, sy = panel.py + 22 + iconH * 0.55 - Math.min(stateTime, 2) * U * 1.5;
    drawSperm(sx, sy, 0, r, time * 4);
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = Math.max(2, r * 0.3);
    ctx.beginPath(); ctx.ellipse(sx, sy - r * 1.6, r * 1.05, r * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
  }

  function draw() {
    drawBackground();

    if (state === 'title') { drawTitle(); return; }

    for (const b of bricks) if (b.alive) drawBrick(b);
    for (const d of iuds) drawIUD(d);
    drawPaddle();
    const view = state === 'paused' ? pausedFrom : state;
    if (view === 'aim') {
      const g = pointerGeom();
      drawPointer(g);
      drawSperm(g.ballX, g.ballY, aim - Math.PI / 2, BR, ballPhase);
    }
    if (view === 'play') {
      for (const b of balls) drawSperm(b.x, b.y, Math.atan2(b.vy, b.vx), BR, ballPhase);
      for (const k of tokens) drawToken(k);
    }
    for (const b of babies) drawBaby(b);
    drawParticles();
    drawHUD();

    const fs = Math.max(16, Math.min(26, U * 5));
    if (state === 'aim' && stateTime < 2.5 && score === 0 && lives === 3) {
      ctx.globalAlpha = Math.min(1, (2.5 - stateTime) * 2);
      ctx.fillStyle = HUD_INK;
      ctx.font = `800 ${fs * 0.75}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Aim… and release!', W / 2, PADDLE_Y + paddle.h + fs * 1.4);
      ctx.globalAlpha = 1;
    }
    if (state === 'missed') drawMissCard(fs);
    if (state === 'paused') {
      drawPanel([
        { text: 'Paused', size: fs * 1.3, weight: 900, color: ACCENT },
      ], { instant: true, buttons: [
        { label: 'Resume', id: 'main' },
        { label: musicOn ? 'Music: On 🎵' : 'Music: Off', id: 'music', secondary: true },
      ] });
    }
    if (state === 'levelclear' && stateTime > 0.7) {
      drawPanel([
        { text: `Level ${level} complete! 🎉`, size: fs * 1.15, weight: 900, color: ACCENT },
        { text: ' ', size: 6 },
        { text: currentJoke, size: fs * 0.85, weight: 700 },
        { text: ' ', size: 6 },
        { text: `Tap for level ${level + 1}`, size: fs * 0.8, pulse: true, color: ACCENT },
      ]);
    }
    if (state === 'win' && stateTime > 0.9) {
      drawPanel([
        { text: 'You win! 🏆', size: fs * 1.5, weight: 900, color: ACCENT },
        { text: `You delivered ${score} babies 👶`, size: fs * 0.9 },
        { text: ' ', size: 6 },
        { text: WIN_DEDICATION, size: fs * 0.8, weight: 700 },
        { text: ' ', size: 6 },
        { text: 'Tap to play again', size: fs * 0.8, pulse: true, color: ACCENT },
      ]);
    }
    if (state === 'gameover') {
      drawPanel([
        { text: 'Out of swimmers!', size: fs * 1.3, weight: 900, color: ACCENT },
        { text: `You delivered ${score} ${score === 1 ? 'baby' : 'babies'} 👶`, size: fs * 0.85 },
        { text: `Best: ${best}`, size: fs * 0.75, weight: 600 },
        { text: ' ', size: 6 },
        { text: currentJoke, size: fs * 0.85, weight: 700 },
      ], { button: 'Try again' });
    }
  }

  // ---- Input --------------------------------------------------------------
  function setAimFrom(x, y) {
    const g = pointerGeom();
    const dx = x - g.bx;
    const dy = Math.min(y - g.by, -U * 6);
    aim = clamp(Math.atan2(dx, -dy), -1.2, 1.2);
  }

  function hitButton(x, y) {
    const slop = 8;
    const r = buttonRects.find(r => x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop);
    return r ? r.id : null;
  }

  // Handles taps on the menu-style screens. Returns true if the tap was used up.
  function advance(x, y) {
    if (state === 'title' || (state === 'win' && stateTime > 0.9)) { newGame(); return true; }
    if (state === 'levelclear' && stateTime > 0.7) {
      level++;
      babies = [];
      buildLevel();
      setState('aim');
      return true;
    }
    if (state === 'paused') {
      const id = x == null ? 'main' : hitButton(x, y);
      if (id === 'main') resume();
      else if (id === 'music') setMusic(!musicOn);
      return true;
    }
    if (state === 'missed' || state === 'gameover') {
      if (stateTime > 0.5 && (x == null || hitButton(x, y) === 'main')) {
        if (state === 'missed') dismissMiss(); else newGame();
      }
      return true;
    }
    return state === 'levelclear' || state === 'win';
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    unlockAudio();
    pointerIsDown = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const pb = pauseButtonRect(), slop = 8;
    if ((canPause() || state === 'paused') && e.clientX >= pb.x - slop && e.clientX <= pb.x + pb.w + slop &&
        e.clientY >= pb.y - slop && e.clientY <= pb.y + pb.h + slop) {
      if (state === 'paused') resume(); else pause();
      ignoreNextUp = true;
      return;
    }
    if (advance(e.clientX, e.clientY)) { ignoreNextUp = true; return; }
    if (state === 'aim') setAimFrom(e.clientX, e.clientY);
    else if (state === 'play') paddle.target = e.clientX;
  });
  canvas.addEventListener('pointermove', e => {
    e.preventDefault();
    if (state === 'aim' && (pointerIsDown || e.pointerType === 'mouse') && !ignoreNextUp) setAimFrom(e.clientX, e.clientY);
    else if (state === 'play' && (pointerIsDown || e.pointerType === 'mouse')) paddle.target = e.clientX;
  });
  const up = e => {
    pointerIsDown = false;
    unlockAudio();
    if (ignoreNextUp) { ignoreNextUp = false; return; }
    if (e.type === 'pointerup' && state === 'aim') launch();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (state === 'paused') resume(); else pause();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      unlockAudio();
      if (!advance() && state === 'aim') launch();
    }
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---- Main loop ----------------------------------------------------------
  // URL options for testing: ?slow=0.2 (slow motion), ?level=3 (start on a level)
  const params = new URLSearchParams(location.search);
  const SLOW = clamp(parseFloat(params.get('slow')) || 1, 0.05, 1);
  const START_LEVEL = clamp(parseInt(params.get('level'), 10) || 1, 1, LEVELS.length);
  if (START_LEVEL > 1) {
    const orig = newGame;
    newGame = () => { orig(); level = START_LEVEL; buildLevel(); };
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000) * SLOW;
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden) pause();
  });

  resize();
  requestAnimationFrame(loop);
})();
