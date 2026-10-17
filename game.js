(() => {
  'use strict';

  // ---- Customize me! ------------------------------------------------------
  const GAME_TITLE = 'Egg-cellent!';
  const GIFT_MESSAGE = 'Made with love for Mom 💕';
  // -------------------------------------------------------------------------

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const safeProbe = document.getElementById('safe');

  const FONT = '"Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  const BOW_COLORS = ['#ff6fa5', '#b388ff', '#64b5f6', '#4dd0b5', '#ffb74d', '#f06292', '#9575cd'];
  const SKIN = '#f3c1a3', SKIN_LINE = '#c98a6b', GLANS = '#ec9a9e', GLANS_LINE = '#c8707a';
  const INK = '#3a2a2a', HUD_INK = '#a0346b';

  const HEART8 = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
  const HEART6 = ['##..##', '######', '######', '.####.', '..##..'];

  let W = 0, H = 0, DPR = 1;
  let FX = 0, FW = 0, U = 1, TOP = 0, PADDLE_Y = 0, SAFE_TOP = 0, SAFE_BOTTOM = 0;
  let bricks = [], babies = [], particles = [];
  let state = 'title', stateTime = 0;
  let level = 1, lives = 3, score = 0, best = 0;
  let aim = 0; // radians from vertical
  let time = 0;
  let ignoreNextUp = false, pointerIsDown = false;
  const keys = {};
  const paddle = { x: 0, target: 0, w: 80, h: 14 };
  const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 6, speed: 400, phase: 0 };
  const grid = { cols: 0, rows: 0, pad: 0, pitchX: 0, pitchY: 0, eggW: 0, eggH: 0, top: 0 };

  try { best = +localStorage.getItem('eggcellent-best') || 0; } catch (e) { /* ignore */ }

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
  const sfx = {
    hatch: () => { beep(rand(620, 760), 0.12, 'triangle', 0.1, 1300); beep(1500, 0.08, 'sine', 0.04, 1900, 0.06); },
    paddle: () => beep(320, 0.09, 'sine', 0.09, 480),
    wall: () => beep(520, 0.04, 'sine', 0.03),
    launch: () => beep(260, 0.18, 'triangle', 0.07, 700),
    lose: () => beep(420, 0.45, 'sawtooth', 0.04, 90),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.08, 0, i * 0.12)),
  };

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
    ball.r = Math.max(6, U * 1.7);
    paddle.x = clamp(paddle.x || W / 2, FX + paddle.w / 2, FX + FW - paddle.w / 2);
    paddle.target = clamp(paddle.target || paddle.x, FX + paddle.w / 2, FX + FW - paddle.w / 2);
    if (grid.cols) layoutGrid();
  }

  function layoutGrid() {
    grid.pad = U * 3;
    grid.pitchX = (FW - grid.pad * 2) / grid.cols;
    grid.eggW = grid.pitchX * 0.84;
    grid.eggH = grid.eggW * 1.22;
    grid.pitchY = grid.eggH * 1.1;
    const avail = (PADDLE_Y - TOP) * 0.5;
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

  // ---- Game flow ----------------------------------------------------------
  function setState(s) { state = s; stateTime = 0; }

  function buildLevel() {
    const p = (level - 1) % 4;
    grid.cols = FW < 480 ? 6 : 8;
    let rows, include;
    if (p === 0) { rows = 3; include = () => true; }
    else if (p === 1) {
      const map = grid.cols === 8 ? HEART8 : HEART6;
      rows = map.length; include = (r, c) => map[r][c] === '#';
    } else if (p === 2) { rows = 5; include = (r, c) => (r + c) % 2 === 0 || r === 0; }
    else { rows = 6; include = () => true; }
    grid.rows = rows;
    bricks = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (include(r, c)) {
          bricks.push({ row: r, col: c, alive: true, color: BOW_COLORS[(r * 3 + c) % BOW_COLORS.length], off: Math.random() * 10 });
        }
      }
    }
    layoutGrid();
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
    ball.speed = Math.min(base * (1 + 0.08 * (level - 1)), 950);
    ball.vx = Math.sin(aim) * ball.speed;
    ball.vy = -Math.cos(aim) * ball.speed;
    sfx.launch();
    setState('play');
  }

  function loseLife() {
    lives--;
    sfx.lose();
    if (lives <= 0) {
      if (score > best) {
        best = score;
        try { localStorage.setItem('eggcellent-best', String(best)); } catch (e) { /* ignore */ }
      }
      setState('gameover');
    } else {
      aim = 0;
      setState('aim');
    }
  }

  function hatch(b) {
    b.alive = false;
    score++;
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
    if (!bricks.some(x => x.alive)) {
      if (score > best) {
        best = score;
        try { localStorage.setItem('eggcellent-best', String(best)); } catch (e) { /* ignore */ }
      }
      sfx.win();
      setState('levelclear');
    }
  }

  function pointerGeom() {
    const L = Math.max(62, U * 15);
    const bx = paddle.x, by = PADDLE_Y + paddle.h * 0.2;
    const dx = Math.sin(aim), dy = -Math.cos(aim);
    const tail = ball.r * 6;
    const reach = L + ball.r * 1.4 + tail;
    return { bx, by, L, dx, dy, ballX: bx + dx * reach, ballY: by + dy * reach };
  }

  // ---- Update -------------------------------------------------------------
  function update(dt) {
    time += dt;
    stateTime += dt;
    ball.phase += dt * 14;

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

    if (state === 'aim') {
      const g = pointerGeom();
      ball.x = g.ballX; ball.y = g.ballY;
    } else if (state === 'play') {
      const n = Math.max(1, Math.ceil(ball.speed * dt / (ball.r * 0.6)));
      for (let i = 0; i < n && state === 'play'; i++) step(dt / n);
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
      else p.vy *= 0.98;
    }
    particles = particles.filter(p => p.life < p.max);
  }

  function step(dt) {
    const r = ball.r;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - r < FX) { ball.x = FX + r; ball.vx = Math.abs(ball.vx); sfx.wall(); }
    if (ball.x + r > FX + FW) { ball.x = FX + FW - r; ball.vx = -Math.abs(ball.vx); sfx.wall(); }
    if (ball.y - r < TOP) { ball.y = TOP + r; ball.vy = Math.abs(ball.vy); sfx.wall(); }

    // paddle
    const hw = paddle.w / 2;
    if (ball.vy > 0 && ball.y + r >= PADDLE_Y && ball.y - r <= PADDLE_Y + paddle.h &&
        ball.x >= paddle.x - hw - r && ball.x <= paddle.x + hw + r) {
      const t = clamp((ball.x - paddle.x) / hw, -1, 1);
      const a = t * 1.05;
      ball.vx = Math.sin(a) * ball.speed;
      ball.vy = -Math.cos(a) * ball.speed;
      ball.y = PADDLE_Y - r;
      sfx.paddle();
    }

    // eggs
    const hx = grid.eggW * 0.45, hy = grid.eggH * 0.46;
    for (const b of bricks) {
      if (!b.alive) continue;
      const p = brickPos(b);
      const cx = clamp(ball.x, p.x - hx, p.x + hx);
      const cy = clamp(ball.y, p.y - hy, p.y + hy);
      const nx = ball.x - cx, ny = ball.y - cy;
      const d2 = nx * nx + ny * ny;
      if (d2 > r * r) continue;
      if (d2 === 0) {
        ball.vy = -ball.vy;
      } else if (Math.abs(nx) > Math.abs(ny)) {
        ball.vx = Math.sign(nx) * Math.abs(ball.vx);
        ball.x = cx + Math.sign(nx) * r;
      } else {
        ball.vy = Math.sign(ny) * Math.abs(ball.vy);
        ball.y = cy + Math.sign(ny) * r;
      }
      hatch(b);
      break;
    }

    if (ball.y - r > H) loseLife();
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
    // ribbon tails
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-s * 0.45, s * 0.9); ctx.lineTo(-s * 0.15, s * 0.75); ctx.closePath();
    ctx.moveTo(0, 0); ctx.lineTo(s * 0.45, s * 0.9); ctx.lineTo(s * 0.15, s * 0.75); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // loops
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(side * s * 1.1, -s * 0.8, side * s * 1.1, s * 0.8, 0, 0);
      ctx.fill(); ctx.stroke();
    }
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(-s * 0.55, -s * 0.18, s * 0.18, s * 0.09, -0.4, 0, Math.PI * 2); ctx.fill();
    // knot
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawEgg(cx, cy, w, h, color, blinkOff) {
    // shadow
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

    // face
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

  function drawBaby(b) {
    const { w, h, color } = b;
    const pop = b.t < 0.25 ? 0.5 + 0.7 * Math.sin((b.t / 0.25) * Math.PI * 0.5) : 1.2 - Math.min(0.2, (b.t - 0.25) * 1.2);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(pop, pop);

    const blanket = lighten(color, 0.35), blanketLine = darken(color, 0.15);
    // swaddle
    ctx.fillStyle = blanket;
    ctx.strokeStyle = blanketLine;
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.beginPath(); ctx.ellipse(0, h * 0.06, w * 0.43, h * 0.44, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // blanket fold
    ctx.fillStyle = lighten(color, 0.55);
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, h * 0.02);
    ctx.quadraticCurveTo(w * 0.05, h * 0.12, w * 0.4, h * 0.3);
    ctx.quadraticCurveTo(w * 0.1, h * 0.5, -w * 0.25, h * 0.38);
    ctx.quadraticCurveTo(-w * 0.45, h * 0.2, -w * 0.42, h * 0.02);
    ctx.fill(); ctx.stroke();

    // face
    const fy = -h * 0.16, fr = w * 0.29;
    ctx.fillStyle = '#ffdcc6';
    ctx.strokeStyle = '#e7b394';
    ctx.beginPath(); ctx.arc(0, fy, fr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // hood rim
    ctx.strokeStyle = blanketLine;
    ctx.lineWidth = Math.max(1.5, w * 0.06);
    ctx.beginPath(); ctx.arc(0, fy, fr * 1.12, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // hair curl
    ctx.strokeStyle = '#8d5a3b';
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(w * 0.02, fy - fr * 0.78, fr * 0.2, Math.PI * 0.9, Math.PI * 2.4); ctx.stroke();
    // sleepy eyes
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, w * 0.03);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * fr * 0.38, fy - fr * 0.02, fr * 0.16, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    }
    // cheeks
    ctx.fillStyle = 'rgba(255,110,140,0.45)';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * fr * 0.6, fy + fr * 0.3, fr * 0.15, 0, Math.PI * 2); ctx.fill();
    }
    // mouth
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

    // head
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9e5ff');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#8aa1c9';
    ctx.lineWidth = Math.max(1.2, r * 0.2);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // eyes
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

    // testicles
    ctx.fillStyle = SKIN; ctx.strokeStyle = SKIN_LINE;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * tr * 0.82, -tr * 0.15, tr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // shaft
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
    // shaft highlight
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
    // meatus
    ctx.beginPath();
    ctx.moveTo(0, -L + sw * 0.08); ctx.lineTo(0, -L + sw * 0.3);
    ctx.stroke();
    ctx.restore();

    // aim guide
    ctx.fillStyle = 'rgba(160,52,107,0.35)';
    for (let i = 1; i <= 7; i++) {
      const d = ball.r * 3 + i * U * 4.5;
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
        ctx.fillStyle = '#fbf7f2';
        ctx.strokeStyle = '#dccbb8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.7); ctx.lineTo(p.size * 0.8, p.size * 0.3); ctx.lineTo(0, p.size * 0.5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
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
    // soft floating bubbles
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
    g.addColorStop(1, '#e0508f');
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
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${level}`, FX + U * 3, y);
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

  function drawPanel(lines, opts = {}) {
    const pw = Math.min(FW * 0.88, 440);
    const lh = lines.map(l => l.size * 1.45);
    const ph = lh.reduce((a, b) => a + b, 0) + U * 10 + (opts.extra || 0);
    const px = W / 2 - pw / 2, py = opts.y != null ? opts.y : H / 2 - ph / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = 'rgba(224,80,143,0.35)';
    ctx.lineWidth = 2;
    roundRect(px, py, pw, ph, 22);
    ctx.fill(); ctx.stroke();
    let y = py + U * 5 + (opts.extra || 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      ctx.font = `${l.weight || 800} ${l.size}px ${FONT}`;
      ctx.fillStyle = l.color || HUD_INK;
      if (l.pulse) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 4);
      ctx.fillText(l.text, W / 2, y + lh[i] / 2);
      ctx.globalAlpha = 1;
      y += lh[i];
    });
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
    drawPanel([
      { text: GAME_TITLE, size: big, weight: 900, color: '#e0508f' },
      { text: GIFT_MESSAGE, size: Math.max(15, big * 0.32), weight: 700 },
      { text: ' ', size: 8 },
      { text: isTouch ? 'Drag to aim, let go to launch' : 'Move mouse to aim, click to launch', size: Math.max(14, big * 0.27), weight: 600 },
      { text: isTouch ? 'Then drag to move the paddle' : 'Then move the mouse (or ← →) for the paddle', size: Math.max(14, big * 0.27), weight: 600 },
      { text: ' ', size: 8 },
      { text: isTouch ? 'Tap to start' : 'Click to start', size: Math.max(18, big * 0.42), weight: 900, pulse: true, color: '#e0508f' },
      ...(best ? [{ text: `Best: ${best} babies`, size: Math.max(13, big * 0.24), weight: 600 }] : []),
    ], { y: cy + eh * 0.75 });
  }

  function draw() {
    drawBackground();

    if (state === 'title') { drawTitle(); return; }

    for (const b of bricks) {
      if (!b.alive) continue;
      const p = brickPos(b);
      drawEgg(p.x, p.y + Math.sin(time * 2 + b.off) * U * 0.35, grid.eggW, grid.eggH, b.color, b.off);
    }
    drawPaddle();
    if (state === 'aim') drawPointer(pointerGeom());

    if (state === 'aim' || state === 'play') {
      const ang = state === 'aim' ? aim - Math.PI / 2 : Math.atan2(ball.vy, ball.vx);
      drawSperm(ball.x, ball.y, ang, ball.r, ball.phase);
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
    if (state === 'levelclear' && stateTime > 0.7) {
      drawPanel([
        { text: 'Congratulations! 🎉', size: fs * 1.3, weight: 900, color: '#e0508f' },
        { text: `Level ${level} delivered`, size: fs * 0.85 },
        { text: `${score} babies so far`, size: fs * 0.75, weight: 600 },
        { text: 'Tap for the next level', size: fs * 0.8, pulse: true, color: '#e0508f' },
      ]);
    }
    if (state === 'gameover' && stateTime > 0.5) {
      drawPanel([
        { text: 'Out of swimmers!', size: fs * 1.3, weight: 900, color: '#e0508f' },
        { text: `You delivered ${score} ${score === 1 ? 'baby' : 'babies'} 👶`, size: fs * 0.85 },
        { text: `Best: ${best}`, size: fs * 0.75, weight: 600 },
        { text: 'Tap to play again', size: fs * 0.8, pulse: true, color: '#e0508f' },
      ]);
    }
  }

  // ---- Input --------------------------------------------------------------
  function setAimFrom(x, y) {
    const g = pointerGeom();
    const dx = x - g.bx;
    const dy = Math.min(y - g.by, -U * 6);
    aim = clamp(Math.atan2(dx, -dy), -1.2, 1.2);
  }

  function advance() {
    if (state === 'title' || (state === 'gameover' && stateTime > 0.5)) { newGame(); return true; }
    if (state === 'levelclear' && stateTime > 0.7) {
      level++;
      babies = [];
      buildLevel();
      setState('aim');
      return true;
    }
    return state === 'gameover' || state === 'levelclear';
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    unlockAudio();
    pointerIsDown = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (advance()) { ignoreNextUp = true; return; }
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
    if (ignoreNextUp) { ignoreNextUp = false; return; }
    if (e.type === 'pointerup' && state === 'aim') launch();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    keys[e.key] = true;
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
  // ?slow=0.2 runs the game in slow motion (handy for testing)
  const SLOW = clamp(parseFloat(new URLSearchParams(location.search).get('slow')) || 1, 0.05, 1);
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000) * SLOW;
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  resize();
  requestAnimationFrame(loop);
})();
