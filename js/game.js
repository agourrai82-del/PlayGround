(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const TILE = 44;
  const MAP_W = 40;
  const MAP_H = 28;
  const STYLE = { wood: 0, carpet: 1, tile: 2, concrete: 3 };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const rand = (a, b) => a + Math.random() * (b - a);

  function rr(c, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + rad, y);
    c.lineTo(x + w - rad, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rad);
    c.lineTo(x + w, y + h - rad);
    c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    c.lineTo(x + rad, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rad);
    c.lineTo(x, y + rad);
    c.quadraticCurveTo(x, y, x + rad, y);
    c.closePath();
  }

  function poly(c, points, fill) {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) c.lineTo(points[i][0], points[i][1]);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  const el = (id) => document.getElementById(id);
  const ui = {
    title: el('titleScreen'),
    startBtn: el('startBtn'),
    cutscene: el('cutsceneUI'),
    subtitles: el('subtitles'),
    enterBtn: el('enterBtn'),
    skipBtn: el('skipBtn'),
    timecode: el('timecode'),
    hud: el('hud'),
    tapeSlots: Array.from(document.querySelectorAll('.tape-slot')),
    fearFill: el('fearFill'),
    staminaFill: el('staminaFill'),
    objective: el('objective'),
    hint: el('hint'),
    toast: el('toast'),
    actionBtn: el('actionBtn'),
    pauseBtn: el('pauseBtn'),
    pauseScreen: el('pauseScreen'),
    resumeBtn: el('resumeBtn'),
    restartBtn: el('restartBtn'),
    soundBtn: el('soundBtn'),
    overScreen: el('overScreen'),
    overText: el('overText'),
    retryBtn: el('retryBtn'),
    homeBtn: el('homeBtn'),
    winScreen: el('winScreen'),
    winStats: el('winStats'),
    againBtn: el('againBtn'),
    homeBtn2: el('homeBtn2'),
    danger: el('dangerVignette'),
    joystick: el('joystick'),
    joyStick: el('joyStick'),
    sprintBtn: el('sprintBtn'),
    keyHint: el('keyHint')
  };

  const canvas = el('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const lightCanvas = document.createElement('canvas');
  const lctx = lightCanvas.getContext('2d');
  const view = { w: 1, h: 1, dpr: 1 };
  const audio = new window.HorrorAudio();

  const input = { jx: 0, jy: 0, sprint: false };
  const keys = new Set();

  const state = {
    scene: 'title',
    paused: false,
    token: 0,
    time: 0,
    titleTime: 0,
    cutsceneTime: 0,
    cutsceneStartedAt: 0,
    entering: false,
    enterT: 0,
    enterStartedAt: 0,
    subtitleIndex: -1,
    timecode: -1,
    zoom: 1,
    camera: { x: 0, y: 0 },
    shake: 0,
    face: 0,
    flash: 0,
    fear: 0,
    maxFear: 0,
    stamina: 100,
    tapes: 0,
    collected: [false, false, false],
    doorOpen: false,
    elapsed: 0,
    nearDoor: false,
    hintText: '',
    scareCooldown: 0,
    eyeGlow: 0,
    dust: [],
    motes: [],
    player: {
      x: 18.5 * TILE,
      y: 23.5 * TILE,
      angle: -Math.PI / 2,
      moving: false,
      walk: 0,
      step: 0,
      speed: 0
    },
    entity: {
      x: 32.5 * TILE,
      y: 5.5 * TILE,
      angle: Math.PI / 2,
      mode: 'dormant',
      path: [],
      repath: 0,
      wander: null,
      huntTimer: 0,
      lostTimer: 0,
      sway: 0
    },
    world: null
  };

  const subtitleScript = [
    { at: 0.7, text: 'لقيتو في صندوق قديم… شريط بلا اسم.' },
    { at: 4.1, text: 'الدار خاوية. غير الضو كيرعش.' },
    { at: 7.5, text: 'سمعت شي حاجة كتجرّ رجليها فالصالون.' },
    { at: 10.7, text: 'الباب اللي فآخر الممر… تحرّك بوحدو.' },
    { at: 13.5, text: 'من داك النهار، أنا كنعيش الداخل.' }
  ];

  function buildWorld() {
    const tiles = new Uint8Array(MAP_W * MAP_H).fill(1);
    const floors = new Uint8Array(MAP_W * MAP_H);
    const idx = (x, y) => y * MAP_W + x;

    const floor = (x, y, style) => {
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) return;
      tiles[idx(x, y)] = 0;
      floors[idx(x, y)] = style;
    };
    const room = (x1, y1, x2, y2, style) => {
      for (let y = y1; y <= y2; y += 1) {
        for (let x = x1; x <= x2; x += 1) floor(x, y, style);
      }
    };
    const hallH = (y, x1, x2, style) => {
      for (let x = x1; x <= x2; x += 1) floor(x, y, style);
    };
    const hallV = (x, y1, y2, style) => {
      for (let y = y1; y <= y2; y += 1) floor(x, y, style);
    };
    const block = (x, y) => {
      tiles[idx(x, y)] = 1;
    };
    const blockRect = (x, y, w, h) => {
      for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) block(x + i, y + j);
      }
    };

    room(14, 19, 26, 26, STYLE.carpet);
    hallV(19, 12, 18, STYLE.wood);
    hallV(20, 12, 18, STYLE.wood);
    hallV(21, 12, 18, STYLE.wood);
    room(15, 4, 24, 12, STYLE.wood);
    room(3, 17, 11, 25, STYLE.tile);
    room(29, 17, 37, 25, STYLE.carpet);
    room(3, 2, 12, 10, STYLE.wood);
    room(28, 2, 36, 8, STYLE.tile);
    hallH(21, 11, 14, STYLE.tile);
    hallH(21, 26, 29, STYLE.carpet);
    hallH(6, 12, 15, STYLE.wood);
    hallH(5, 24, 28, STYLE.tile);

    blockRect(19, 20, 3, 1);
    blockRect(15, 22, 3, 1);
    blockRect(22, 22, 2, 1);
    block(25, 25);

    blockRect(16, 4, 2, 1);

    blockRect(3, 18, 2, 2);
    block(10, 18);
    blockRect(7, 21, 2, 1);
    block(4, 24);

    blockRect(33, 18, 2, 3);
    blockRect(29, 18, 1, 2);
    block(35, 21);

    blockRect(4, 3, 1, 4);
    blockRect(9, 3, 2, 1);
    block(10, 5);

    blockRect(29, 3, 2, 2);
    block(35, 3);
    block(35, 6);

    const rugs = [
      { x: 18.2, y: 23.2, w: 4.6, h: 2.6, color: '#3a1f1c' },
      { x: 18.6, y: 7.4, w: 3.6, h: 3.2, color: '#2c2320' },
      { x: 31.4, y: 21.4, w: 3.2, h: 2.4, color: '#2f2422' }
    ];

    const decor = [
      { type: 'tv', x: 19, y: 20, w: 3, h: 1 },
      { type: 'sofa', x: 15, y: 22, w: 3, h: 1 },
      { type: 'table', x: 22, y: 22, w: 2, h: 1 },
      { type: 'plant', x: 25, y: 25, w: 1, h: 1 },
      { type: 'cabinet', x: 16, y: 4, w: 2, h: 1 },
      { type: 'counter', x: 3, y: 18, w: 2, h: 2 },
      { type: 'fridge', x: 10, y: 18, w: 1, h: 1 },
      { type: 'table', x: 7, y: 21, w: 2, h: 1 },
      { type: 'sink', x: 4, y: 24, w: 1, h: 1 },
      { type: 'bed', x: 33, y: 18, w: 2, h: 3 },
      { type: 'wardrobe', x: 29, y: 18, w: 1, h: 2 },
      { type: 'nightstand', x: 35, y: 21, w: 1, h: 1 },
      { type: 'shelf', x: 4, y: 3, w: 1, h: 4 },
      { type: 'desk', x: 9, y: 3, w: 2, h: 1 },
      { type: 'chair', x: 10, y: 5, w: 1, h: 1 },
      { type: 'tub', x: 29, y: 3, w: 2, h: 2 },
      { type: 'sink', x: 35, y: 3, w: 1, h: 1 },
      { type: 'toilet', x: 35, y: 6, w: 1, h: 1 }
    ];

    const lights = [
      { x: 20.5, y: 22.5, r: 5.2, color: [255, 188, 126], flicker: 0.16, phase: 0.6, power: 1 },
      { x: 20, y: 16, r: 3.6, color: [255, 196, 140], flicker: 0.55, phase: 2.2, power: 0.85 },
      { x: 19.5, y: 8, r: 4.4, color: [214, 206, 176], flicker: 0.22, phase: 4.1, power: 0.8 },
      { x: 7, y: 20, r: 4.2, color: [255, 194, 138], flicker: 0.18, phase: 1.7, power: 0.9 },
      { x: 33, y: 22, r: 4, color: [255, 184, 130], flicker: 0.3, phase: 3.3, power: 0.8 },
      { x: 7, y: 6, r: 3.8, color: [196, 214, 178], flicker: 0.36, phase: 5.2, power: 0.85 },
      { x: 32, y: 5, r: 3.4, color: [180, 206, 216], flicker: 0.62, phase: 0.9, power: 0.8 }
    ];

    const tapes = [
      { x: (6 + 0.5) * TILE, y: (24 + 0.5) * TILE, room: 'المطبخ' },
      { x: (10 + 0.5) * TILE, y: (7 + 0.5) * TILE, room: 'المكتبة' },
      { x: (30 + 0.5) * TILE, y: (23 + 0.5) * TILE, room: 'غرفة النوم' }
    ];

    return {
      tiles,
      floors,
      rugs,
      decor,
      lights,
      tapes,
      spawn: { x: 18, y: 23 },
      entitySpawn: { x: 32, y: 5 },
      door: { x: 20, y: 27 },
      doorPoint: { x: (20 + 0.5) * TILE, y: (26.55) * TILE }
    };
  }

  state.world = buildWorld();

  const styleColors = [
    ['#2e241c', '#342920', '#291f19'],
    ['#2e1e1b', '#281916', '#352421'],
    ['#272b2c', '#222527', '#2c3032'],
    ['#262626', '#202021', '#2b2b2b']
  ];

  function isWall(wx, wy) {
    if (wx < 0 || wy < 0) return true;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return state.world.tiles[ty * MAP_W + tx] === 1;
  }

  function lineOfSight(x1, y1, x2, y2) {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.ceil(d / 10);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (isWall(lerp(x1, x2, t), lerp(y1, y2, t))) return false;
    }
    return true;
  }

  function circleHitsWall(x, y, r) {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      if (isWall(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
    }
    return isWall(x, y);
  }

  function findPath(sx, sy, gx, gy) {
    const total = MAP_W * MAP_H;
    const tiles = state.world.tiles;
    if (sx < 0 || sy < 0 || gx < 0 || gy < 0 || sx >= MAP_W || sy >= MAP_H || gx >= MAP_W || gy >= MAP_H) return [];
    const start = sy * MAP_W + sx;
    const goal = gy * MAP_W + gx;
    if (tiles[goal] === 1) return [];
    const prev = new Int32Array(total).fill(-1);
    const seen = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    seen[start] = 1;
    queue[tail] = start;
    tail += 1;
    while (head < tail) {
      const cur = queue[head];
      head += 1;
      if (cur === goal) break;
      const x = cur % MAP_W;
      const y = (cur / MAP_W) | 0;
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const ni = ny * MAP_W + nx;
        if (seen[ni] || tiles[ni] === 1) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        queue[tail] = ni;
        tail += 1;
      }
    }
    if (!seen[goal]) return [];
    const path = [];
    let cur = goal;
    let guard = 0;
    while (cur !== start && cur !== -1 && guard < total) {
      path.push({ x: cur % MAP_W, y: (cur / MAP_W) | 0 });
      cur = prev[cur];
      guard += 1;
    }
    path.reverse();
    return path;
  }

  function torchFlicker(light, t) {
    if (light.flicker <= 0) return 1;
    const a = Math.sin(t * 9.3 + light.phase);
    const b = Math.sin(t * 23.7 + light.phase * 2.1);
    const c = Math.sin(t * 3.1 + light.phase * 0.7);
    const wobble = 1 - light.flicker * (0.5 + 0.5 * a * b) * (0.75 + 0.25 * c);
    return clamp(wobble, 0.25, 1) * light.power;
  }

  function setObjective(text, alert) {
    if (ui.objective.textContent !== text) ui.objective.textContent = text;
    ui.objective.classList.toggle('alert', Boolean(alert));
  }

  let toastTimer = 0;
  function toast(text, eerie, ms) {
    ui.toast.textContent = text;
    ui.toast.classList.toggle('eerie', Boolean(eerie));
    ui.toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), ms || 3600);
  }

  function setHint(text) {
    if (state.hintText === text) return;
    state.hintText = text;
    if (text) {
      ui.hint.textContent = text;
      ui.hint.classList.add('show');
    } else {
      ui.hint.classList.remove('show');
    }
  }

  function resize() {
    view.w = Math.max(320, window.innerWidth);
    view.h = Math.max(320, window.innerHeight);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    lightCanvas.width = Math.round(view.w);
    lightCanvas.height = Math.round(view.h);
    state.zoom = clamp(view.w / 900, 0.9, 1.3);
    state.dust = [];
    state.motes = [];
    for (let i = 0; i < 80; i += 1) {
      state.dust.push({ x: Math.random() * view.w, y: Math.random() * view.h, s: rand(0.5, 1.9), vx: rand(-4, 4), vy: rand(-6, 3), a: rand(0.03, 0.11) });
    }
    for (let i = 0; i < 55; i += 1) {
      state.motes.push({ x: Math.random() * view.w, y: Math.random() * view.h, s: rand(0.6, 2.4), vx: rand(-3, 3), vy: rand(-5, 1), a: rand(0.04, 0.16) });
    }
  }

  function clampCamera() {
    const halfW = view.w / (2 * state.zoom);
    const halfH = view.h / (2 * state.zoom);
    const mapW = MAP_W * TILE;
    const mapH = MAP_H * TILE;
    state.camera.x = mapW <= halfW * 2 ? mapW / 2 : clamp(state.camera.x, halfW, mapW - halfW);
    state.camera.y = mapH <= halfH * 2 ? mapH / 2 : clamp(state.camera.y, halfH, mapH - halfH);
  }

  function resetGame() {
    const world = state.world;
    state.collected = [false, false, false];
    state.tapes = 0;
    state.fear = 0;
    state.maxFear = 0;
    state.stamina = 100;
    state.doorOpen = false;
    state.elapsed = 0;
    state.shake = 0;
    state.face = 0;
    state.flash = 0;
    state.scareCooldown = 0;
    state.eyeGlow = 0;
    state.nearDoor = false;
    state.hintText = '';
    state.entering = false;
    state.enterT = 0;
    state.player.x = (world.spawn.x + 0.5) * TILE;
    state.player.y = (world.spawn.y + 0.5) * TILE;
    state.player.angle = -Math.PI / 2;
    state.player.moving = false;
    state.player.walk = 0;
    state.player.step = 0;
    state.player.speed = 0;
    state.entity.x = (world.entitySpawn.x + 0.5) * TILE;
    state.entity.y = (world.entitySpawn.y + 0.5) * TILE;
    state.entity.angle = Math.PI / 2;
    state.entity.mode = 'dormant';
    state.entity.path = [];
    state.entity.repath = 0;
    state.entity.wander = null;
    state.entity.huntTimer = 0;
    state.entity.lostTimer = 0;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    clampCamera();
    input.jx = 0;
    input.jy = 0;
    ui.joyStick.style.transform = 'translate(-50%, -50%)';
    ui.tapeSlots.forEach((slot) => slot.classList.remove('found'));
    setObjective('ابحث عن أجزاء الشريط الثلاثة', false);
    setHint('');
    ui.actionBtn.classList.add('hidden');
    ui.hint.classList.remove('show');
    ui.toast.classList.remove('show');
    document.body.classList.remove('fear-high');
    ui.danger.style.opacity = '0';
  }

  function showOnly(screen) {
    [ui.title, ui.cutscene, ui.hud, ui.overScreen, ui.winScreen, ui.pauseScreen].forEach((node) => {
      if (!node) return;
      node.classList.toggle('hidden', node !== screen);
    });
  }

  function startCutscene() {
    audio.resume();
    audio.startAmbient();
    audio.setScene('cutscene');
    state.scene = 'cutscene';
    state.cutsceneTime = 0;
    state.cutsceneStartedAt = performance.now();
    state.entering = false;
    state.enterT = 0;
    state.enterStartedAt = state.cutsceneStartedAt;
    state.subtitleIndex = -1;
    state.timecode = -1;
    ui.subtitles.classList.remove('show');
    ui.enterBtn.classList.add('hidden');
    ui.skipBtn.classList.remove('hidden');
    ui.pauseScreen.classList.add('hidden');
    ui.overScreen.classList.add('hidden');
    ui.winScreen.classList.add('hidden');
    ui.hud.classList.add('hidden');
    ui.title.classList.add('hidden');
    ui.cutscene.classList.remove('hidden');
  }

  function startGame() {
    state.token += 1;
    state.scene = 'game';
    state.paused = false;
    resetGame();
    showOnly(ui.hud);
    ui.enterBtn.classList.add('hidden');
    ui.skipBtn.classList.remove('hidden');
    audio.setScene('game');
    audio.setDanger(0);
    state.flash = 0.5;
    toast('الممر قدامك… جمع ٣ أجزاء من الشريط', false, 4400);
  }

  function showTitle() {
    state.token += 1;
    state.scene = 'title';
    state.paused = false;
    state.titleTime = 0;
    state.flash = 0;
    state.face = 0;
    state.entering = false;
    state.enterT = 0;
    showOnly(ui.title);
    ui.pauseScreen.classList.add('hidden');
    ui.danger.style.opacity = '0';
    document.body.classList.remove('fear-high');
    audio.setScene('title');
    audio.setDanger(0);
    setHint('');
    ui.actionBtn.classList.add('hidden');
  }

  function caught() {
    if (state.scene !== 'game') return;
    state.scene = 'over';
    state.face = 1.4;
    state.shake = 24;
    state.token += 1;
    const token = state.token;
    audio.lose();
    audio.setDanger(0);
    ui.hud.classList.add('hidden');
    document.body.classList.remove('fear-high');
    ui.danger.style.opacity = '0';
    setHint('');
    const texts = [
      'شي حاجة في الدار كانت واقفة وراك من الأول.',
      'ما كانش عندك وقت. الشريط بدا من جديد.',
      'الباب كان قريب… ولكن يدها سبقاتك.'
    ];
    ui.overText.textContent = texts[Math.floor(Math.random() * texts.length)];
    window.setTimeout(() => {
      if (state.token !== token) return;
      ui.overScreen.classList.remove('hidden');
    }, 700);
  }

  function winGame() {
    if (state.scene !== 'game') return;
    state.scene = 'win';
    state.token += 1;
    audio.win();
    audio.setDanger(0);
    audio.setScene('title');
    ui.hud.classList.add('hidden');
    setHint('');
    document.body.classList.remove('fear-high');
    ui.danger.style.opacity = '0';
    const minutes = Math.floor(state.elapsed / 60);
    const seconds = Math.floor(state.elapsed % 60);
    ui.winStats.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} · ٣/٣ أجزاء · أقصى رعب ${Math.round(state.maxFear)}%`;
    ui.winScreen.classList.remove('hidden');
  }

  function togglePause(force) {
    if (state.scene !== 'game') return;
    const next = typeof force === 'boolean' ? force : !state.paused;
    if (next === state.paused) return;
    state.paused = next;
    ui.pauseScreen.classList.toggle('hidden', !state.paused);
    if (state.paused) {
      input.jx = 0;
      input.jy = 0;
      input.sprint = false;
      ui.joyStick.style.transform = 'translate(-50%, -50%)';
      ui.sprintBtn.classList.remove('held');
      audio.setDanger(0.15);
    }
  }

  function toggleSound() {
    const on = audio.toggle();
    ui.soundBtn.textContent = on ? 'الصوت: عالي' : 'الصوت: مكتوم';
  }

  function readMove() {
    let x = 0;
    let y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (x === 0 && y === 0) {
      x = input.jx;
      y = input.jy;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, len: Math.min(1, len) };
  }

  function updatePlayer(dt) {
    const p = state.player;
    const move = readMove();
    const sprintKey = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.sprint;
    const wantsSprint = sprintKey && move.len > 0.3 && state.stamina > 1;
    const speed = wantsSprint ? 236 : 152;
    if (wantsSprint) {
      state.stamina = clamp(state.stamina - dt * 27, 0, 100);
    } else {
      state.stamina = clamp(state.stamina + dt * 17, 0, 100);
    }
    p.moving = move.len > 0.08;
    p.speed = p.moving ? speed : 0;
    if (p.moving) {
      const target = Math.atan2(move.y, move.x);
      let diff = target - p.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      p.angle += diff * Math.min(1, dt * 12);
      const stepX = move.x * speed * dt;
      const stepY = move.y * speed * dt;
      if (!circleHitsWall(p.x + stepX, p.y, 11)) p.x += stepX;
      if (!circleHitsWall(p.x, p.y + stepY, 11)) p.y += stepY;
      p.walk += dt * (wantsSprint ? 15 : 10.5);
      p.step -= dt;
      if (p.step <= 0) {
        p.step = wantsSprint ? 0.27 : 0.43;
        audio.step(wantsSprint);
      }
    } else {
      p.step = Math.min(p.step, 0.1);
    }
    state.camera.x += (p.x - state.camera.x) * Math.min(1, dt * 6.5);
    state.camera.y += (p.y - state.camera.y) * Math.min(1, dt * 6.5);
    clampCamera();
  }

  function randomFloorTile() {
    const tiles = state.world.tiles;
    for (let i = 0; i < 90; i += 1) {
      const x = 2 + Math.floor(Math.random() * (MAP_W - 4));
      const y = 2 + Math.floor(Math.random() * (MAP_H - 4));
      if (tiles[y * MAP_W + x] === 0) return { x, y };
    }
    return { x: 20, y: 16 };
  }

  function updateEntity(dt) {
    const e = state.entity;
    const p = state.player;
    e.sway += dt;
    if (e.mode === 'dormant') return;
    const d = dist(e.x, e.y, p.x, p.y) / TILE;

    if (e.mode === 'wander') {
      if (d < 8.5 && (lineOfSight(e.x, e.y, p.x, p.y) || d < 4.2)) {
        e.mode = 'hunt';
        e.huntTimer = 0;
        e.path = [];
        e.repath = 0;
        audio.creak();
      }
    } else {
      e.huntTimer += dt;
      if (d > 15) {
        e.lostTimer += dt;
        if (e.lostTimer > 3.2) {
          e.mode = 'wander';
          e.path = [];
          e.wander = null;
          e.repath = 0;
        }
      } else {
        e.lostTimer = 0;
      }
    }

    e.repath -= dt;
    if (e.repath <= 0) {
      e.repath = e.mode === 'hunt' ? 0.4 : 1.5;
      const ex = Math.floor(e.x / TILE);
      const ey = Math.floor(e.y / TILE);
      let goal;
      if (e.mode === 'hunt') {
        goal = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
      } else {
        if (!e.wander) e.wander = randomFloorTile();
        goal = e.wander;
      }
      e.path = findPath(ex, ey, goal.x, goal.y);
    }

    const baseSpeed = e.mode === 'hunt' ? 2.38 + (state.fear > 80 ? 0.55 : 0) : 1.08;
    let budget = baseSpeed * TILE * dt;
    let guard = 0;
    while (budget > 0.01 && e.path.length && guard < 8) {
      guard += 1;
      const node = e.path[0];
      const nx = (node.x + 0.5) * TILE;
      const ny = (node.y + 0.5) * TILE;
      const dx = nx - e.x;
      const dy = ny - e.y;
      const dd = Math.hypot(dx, dy);
      if (dd < 1.5) {
        e.path.shift();
        continue;
      }
      const step = Math.min(budget, dd);
      e.x += (dx / dd) * step;
      e.y += (dy / dd) * step;
      budget -= step;
      e.angle = Math.atan2(dy, dx);
      if (step >= dd - 0.5) e.path.shift();
    }
    if (!e.path.length && e.mode === 'wander') {
      e.wander = null;
      e.repath = 0;
    }

    const finalD = dist(e.x, e.y, p.x, p.y);
    if (finalD < TILE * 0.74) {
      caught();
      return;
    }
    if (finalD < TILE * 3.2 && lineOfSight(e.x, e.y, p.x, p.y)) {
      triggerScare(finalD);
    }
  }

  function triggerScare(d) {
    if (state.scareCooldown > 0) return;
    state.scareCooldown = 13;
    state.shake = Math.max(state.shake, 13);
    state.face = 0.34;
    state.fear = clamp(state.fear + 16, 0, 100);
    audio.scare();
  }

  function updateTapes() {
    const p = state.player;
    state.world.tapes.forEach((tape, i) => {
      if (state.collected[i]) return;
      if (dist(p.x, p.y, tape.x, tape.y) < TILE * 0.82) collectTape(i);
    });
  }

  function collectTape(i) {
    state.collected[i] = true;
    state.tapes += 1;
    ui.tapeSlots[i].classList.add('found');
    audio.pickup();
    state.fear = clamp(state.fear + 7, 0, 100);
    state.shake = Math.max(state.shake, 4);
    if (state.tapes === 1) {
      state.entity.mode = 'wander';
      state.entity.path = [];
      state.entity.repath = 0;
      toast('جزء من الشريط… وشي حاجة تحرّكت فالداخل.', true, 4200);
    } else if (state.tapes === 2) {
      toast('جزئين من ثلاثة… الصوت كيقرب.', true, 3800);
    } else {
      state.doorOpen = true;
      state.shake = Math.max(state.shake, 9);
      audio.door();
      toast('الشريط كامل… الباب الأمامي تحرّك. اجرِ!', false, 4800);
    }
    if (!state.doorOpen) {
      setObjective(`ابحث عن أجزاء الشريط — ${state.tapes}/3`, false);
    } else {
      setObjective('الباب الأمامي مفتوح… ارجع للصالون واهرب', true);
    }
  }

  function updateFear(dt) {
    const e = state.entity;
    const p = state.player;
    const d = dist(e.x, e.y, p.x, p.y) / TILE;
    const active = e.mode !== 'dormant';
    let rate = -6.5;
    if (active && d < 10) {
      rate = (1 - d / 10) * 30 + (e.mode === 'hunt' ? 7 : 0);
      if (d < 6 && lineOfSight(e.x, e.y, p.x, p.y)) {
        const toE = Math.atan2(e.y - p.y, e.x - p.x);
        let diff = toE - p.angle;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        if (Math.abs(diff) < 0.6) rate += 4;
      }
    }
    state.fear = clamp(state.fear + rate * dt, 0, 100);
    state.maxFear = Math.max(state.maxFear, state.fear);
    state.scareCooldown = Math.max(0, state.scareCooldown - dt);
    const proximity = active ? clamp(1 - d / 12, 0, 1) : 0;
    audio.setDanger(clamp(Math.max(state.fear / 100, proximity), 0, 1));
    const high = state.fear > 68;
    document.body.classList.toggle('fear-high', high);
    ui.danger.style.opacity = ((state.fear / 100) * 0.34 + proximity * 0.12).toFixed(2);
    if (state.fear > 88 && Math.random() < dt * 0.7) {
      state.shake = Math.max(state.shake, 2.5);
    }
  }

  function updateInteraction() {
    const p = state.player;
    const door = state.world.doorPoint;
    const d = dist(p.x, p.y, door.x, door.y) / TILE;
    state.nearDoor = d < 2.3;
    if (state.nearDoor) {
      if (state.doorOpen) {
        setHint('');
        ui.actionBtn.classList.remove('hidden');
      } else {
        setHint(`الباب مقفول… باقي ${3 - state.tapes} من أجزاء الشريط`);
        ui.actionBtn.classList.add('hidden');
      }
    } else {
      setHint('');
      ui.actionBtn.classList.add('hidden');
    }
  }

  function updateHud() {
    ui.fearFill.style.width = state.fear.toFixed(1) + '%';
    ui.staminaFill.style.width = state.stamina.toFixed(1) + '%';
  }

  function tryInteract() {
    if (state.scene !== 'game' || state.paused) return;
    if (!state.nearDoor) return;
    if (state.doorOpen) {
      winGame();
    } else {
      toast(`الباب مقفول… باقي ${3 - state.tapes} من أجزاء الشريط`, true, 2600);
    }
  }

  function updateDust(dt) {
    for (const m of state.dust) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -10) { m.y = view.h + 10; m.x = Math.random() * view.w; }
      if (m.y > view.h + 10) { m.y = -10; m.x = Math.random() * view.w; }
      if (m.x < -10) m.x = view.w + 10;
      if (m.x > view.w + 10) m.x = -10;
    }
  }

  function update(dt) {
    state.time += dt;
    if (state.scene === 'title') {
      state.titleTime += dt;
      for (const m of state.motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -10) { m.y = view.h + 10; m.x = Math.random() * view.w; }
        if (m.x < -10) m.x = view.w + 10;
        if (m.x > view.w + 10) m.x = -10;
      }
      return;
    }
    if (state.scene === 'cutscene') {
      updateCutscene(dt);
      return;
    }
    if (state.scene === 'game') {
      if (state.paused) return;
      state.elapsed += dt;
      updatePlayer(dt);
      updateEntity(dt);
      if (state.scene !== 'game') return;
      updateTapes();
      if (state.scene !== 'game') return;
      updateFear(dt);
      updateInteraction();
      updateHud();
      updateDust(dt);
      state.shake = Math.max(0, state.shake - dt * 26);
      state.face = Math.max(0, state.face - dt);
      state.flash = Math.max(0, state.flash - dt * 3.1);
      audio.update(dt, state.fear, true);
      return;
    }
    state.shake = Math.max(0, state.shake - dt * 18);
    state.face = Math.max(0, state.face - dt * 1.4);
    state.flash = Math.max(0, state.flash - dt * 2.2);
  }

  function updateCutscene(dt) {
    if (state.entering) {
      state.enterT = (performance.now() - state.enterStartedAt) / 1000;
      if (state.enterT > 0.92) startGame();
      return;
    }
    state.cutsceneTime = (performance.now() - state.cutsceneStartedAt) / 1000;
    const t = state.cutsceneTime;
    let index = -1;
    for (let i = 0; i < subtitleScript.length; i += 1) {
      if (t >= subtitleScript[i].at) index = i;
    }
    if (index !== state.subtitleIndex) {
      state.subtitleIndex = index;
      if (index >= 0) {
        ui.subtitles.textContent = subtitleScript[index].text;
        ui.subtitles.classList.add('show');
      } else {
        ui.subtitles.classList.remove('show');
      }
    }
    if (t > 15 && ui.enterBtn.classList.contains('hidden')) {
      ui.enterBtn.classList.remove('hidden');
      ui.skipBtn.classList.add('hidden');
    }
    if (t > 4.6) ui.cutscene.classList.add('tip-gone');
    const total = Math.floor(2 * 3600 + 13 * 60 + 44 + t);
    if (total !== state.timecode) {
      state.timecode = total;
      const hh = String(Math.floor(total / 3600)).padStart(2, '0');
      const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      const ss = String(total % 60).padStart(2, '0');
      ui.timecode.textContent = `${hh}:${mm}:${ss}`;
    }
  }

  function renderTitle() {
    const w = view.w;
    const h = view.h;
    const t = state.titleTime;
    const drift = Math.sin(t * 0.16) * 7;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#070809';
    ctx.fillRect(0, 0, w, h);
    const horizon = h * 0.64;

    let g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#090a0b');
    g.addColorStop(0.6, '#11100e');
    g.addColorStop(1, '#18140f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);

    g = ctx.createLinearGradient(0, horizon, 0, h);
    g.addColorStop(0, '#15110e');
    g.addColorStop(0.5, '#0b0a09');
    g.addColorStop(1, '#050505');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = 1;
    for (let i = -7; i <= 7; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + drift * 0.4, horizon);
      ctx.lineTo(w / 2 + i * (w * 0.11) + drift, h + 20);
      ctx.stroke();
    }
    for (let i = 1; i < 5; i += 1) {
      const y = horizon + (h - horizon) * (i / 5) ** 1.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const dw = clamp(w * 0.26, 118, 260);
    const dh = clamp(h * 0.46, 210, 460);
    const dx = w * 0.5 - dw / 2 + drift * 0.6;
    const dy = horizon - dh;

    const doorGlow = ctx.createRadialGradient(dx + dw / 2, dy + dh * 0.62, 0, dx + dw / 2, dy + dh * 0.62, dw * 2.4);
    doorGlow.addColorStop(0, 'rgba(152,44,28,0.17)');
    doorGlow.addColorStop(0.55, 'rgba(84,22,14,0.07)');
    doorGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = doorGlow;
    ctx.fillRect(0, dy - dh, w, dh + h - dy);

    ctx.fillStyle = '#050505';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = '#1c1915';
    ctx.lineWidth = 9;
    ctx.strokeRect(dx - 4.5, dy - 4.5, dw + 9, dh + 9);
    ctx.strokeStyle = 'rgba(90,70,50,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx + 9, dy + 10, dw - 18, dh - 20);

    const flick = Math.sin(t * 7.3) * Math.sin(t * 2.1);
    if (flick > 0.72) {
      const fg = ctx.createRadialGradient(dx + dw / 2, dy + dh * 0.35, 0, dx + dw / 2, dy + dh * 0.35, dw * 0.5);
      fg.addColorStop(0, 'rgba(190,170,140,0.13)');
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(dx, dy, dw, dh);
    }

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#0a0908';
    ctx.beginPath();
    ctx.ellipse(dx + dw / 2 + Math.sin(t * 0.5) * 2, dy + dh * 0.66, dw * 0.16, dh * 0.23, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(dx + dw / 2, dy + dh * 0.43, dw * 0.085, dh * 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (Math.sin(t * 0.9) > 0.968) {
      ctx.fillStyle = 'rgba(210,60,40,0.55)';
      ctx.beginPath();
      ctx.arc(dx + dw / 2 - dw * 0.035, dy + dh * 0.43, 1.7, 0, TAU);
      ctx.arc(dx + dw / 2 + dw * 0.035, dy + dh * 0.43, 1.7, 0, TAU);
      ctx.fill();
    }

    const tw = clamp(w * 0.29, 150, 300);
    const th = tw * 0.69;
    const tx = w * 0.055 + drift * 0.3;
    const ty = horizon - th + 8;
    const tvGlow = ctx.createRadialGradient(tx + tw / 2, ty + th / 2, 0, tx + tw / 2, ty + th / 2, tw * 1.35);
    tvGlow.addColorStop(0, `rgba(120,150,158,${0.09 + Math.abs(flick) * 0.05})`);
    tvGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tvGlow;
    ctx.fillRect(tx - tw, ty - th, tw * 3, th * 3);

    ctx.fillStyle = '#17130f';
    rr(ctx, tx - 9, ty - 9, tw + 18, th + 20, 8);
    ctx.fill();
    ctx.fillStyle = '#0b0d0e';
    rr(ctx, tx, ty, tw, th, 5);
    ctx.fill();

    ctx.save();
    rr(ctx, tx + 3, ty + 3, tw - 6, th - 6, 4);
    ctx.clip();
    ctx.fillStyle = '#0e1213';
    ctx.fillRect(tx, ty, tw, th);
    for (let i = 0; i < 34; i += 1) {
      const yy = ty + Math.random() * th;
      const alpha = Math.random() * 0.16;
      ctx.fillStyle = `rgba(190,205,205,${alpha})`;
      ctx.fillRect(tx + Math.random() * tw * 0.2, yy, tw * rand(0.3, 0.9), rand(1, 2.6));
    }
    if (Math.sin(t * 0.7) > 0.9) {
      ctx.fillStyle = 'rgba(215,210,195,0.18)';
      ctx.beginPath();
      ctx.ellipse(tx + tw * 0.5, ty + th * 0.48, tw * 0.12, th * 0.2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.restore();

    ctx.strokeStyle = 'rgba(220,230,225,0.05)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 3, ty + 3, tw - 6, th - 6);

    ctx.fillStyle = '#15100c';
    ctx.fillRect(tx + tw * 0.15, ty + th + 11, tw * 0.7, h - (ty + th) - 11);
    ctx.fillStyle = '#0c0907';
    ctx.fillRect(tx + tw * 0.08, ty + th + 20, tw * 0.84, h - (ty + th + 20));

    const lx = w * 0.82 + drift * 0.2;
    const ly = horizon - h * 0.24;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx + Math.sin(t * 0.8) * 6, ly);
    ctx.stroke();
    const bulb = ctx.createRadialGradient(lx + Math.sin(t * 0.8) * 6, ly, 0, lx + Math.sin(t * 0.8) * 6, ly, 120);
    bulb.addColorStop(0, 'rgba(255,196,130,0.28)');
    bulb.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = bulb;
    ctx.fillRect(lx - 120, ly - 120, 240, 240);
    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.arc(lx + Math.sin(t * 0.8) * 6, ly, 3.2, 0, TAU);
    ctx.fill();

    for (const m of state.motes) {
      ctx.fillStyle = `rgba(235,220,190,${m.a * 0.5})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.s * 0.7, 0, TAU);
      ctx.fill();
    }
  }

  function renderCutscene() {
    const w = view.w;
    const h = view.h;
    const t = state.cutsceneTime;
    const enterZoom = state.entering ? 1 + smooth(state.enterT / 0.9) * 4.2 : 1;
    const ambientZoom = t > 12.6 ? 1 + smooth((t - 12.6) / 3.6) * 0.6 : 1;
    const zoom = enterZoom * ambientZoom;
    const shake = 2.4 + Math.sin(t * 17.3) * 0.9 + Math.sin(t * 5.1) * 1.4;
    const ox = Math.sin(t * 1.27) * 3.5 + Math.sin(t * 8.3) * 1.2 + (state.entering ? Math.sin(t * 40) * 4 : 0);
    const oy = Math.cos(t * 1.05) * 2.6 + Math.cos(t * 7.1) * 1.1;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);

    const vpx = w * 0.5 + ox;
    const vpy = h * 0.475 + oy;
    const doorW = w * 0.17;
    const doorH = h * 0.37;
    const doorL = vpx - doorW / 2;
    const doorR = vpx + doorW / 2;
    const doorT = vpy - doorH * 0.56;
    const doorB = vpy + doorH * 0.44;
    const open = state.entering ? 1 : clamp((t - 10.2) / 2.2, 0, 1);

    ctx.save();
    ctx.translate(vpx, vpy);
    ctx.scale(zoom, zoom);
    ctx.translate(-vpx, -vpy);

    let g = ctx.createLinearGradient(0, 0, 0, doorT);
    g.addColorStop(0, '#15120f');
    g.addColorStop(1, '#0a0908');
    poly(ctx, [[0, 0], [w, 0], [doorR, doorT], [doorL, doorT]], g);
    for (let i = 1; i < 5; i += 1) {
      const f = i / 5;
      const y = lerp(0, doorT, f);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lerp(0, doorL, f), y);
      ctx.lineTo(lerp(w, doorR, f), y);
      ctx.stroke();
    }

    g = ctx.createLinearGradient(0, doorB, 0, h);
    g.addColorStop(0, '#0b0a09');
    g.addColorStop(0.55, '#181410');
    g.addColorStop(1, '#221b14');
    poly(ctx, [[0, h], [w, h], [doorR, doorB], [doorL, doorB]], g);
    ctx.save();
    for (let i = -8; i <= 8; i += 1) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * w * 0.085, h);
      ctx.lineTo(vpx + i * doorW * 0.17, doorB);
      ctx.stroke();
    }
    for (let i = 1; i < 5; i += 1) {
      const f = (i / 5) ** 1.5;
      const y = lerp(h, doorB, f);
      const l = lerp(0, doorL, f);
      const r = lerp(w, doorR, f);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.moveTo(l, y);
      ctx.lineTo(r, y);
      ctx.stroke();
    }
    ctx.restore();

    g = ctx.createLinearGradient(0, 0, doorL, 0);
    g.addColorStop(0, '#171310');
    g.addColorStop(0.7, '#100e0c');
    g.addColorStop(1, '#0a0908');
    poly(ctx, [[0, 0], [doorL, doorT], [doorL, doorB], [0, h]], g);
    g = ctx.createLinearGradient(w, 0, doorR, 0);
    g.addColorStop(0, '#12100e');
    g.addColorStop(0.7, '#0d0c0a');
    g.addColorStop(1, '#090808');
    poly(ctx, [[w, 0], [doorR, doorT], [doorR, doorB], [w, h]], g);

    for (let i = 1; i < 5; i += 1) {
      const f = i / 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lerp(0, h, f));
      ctx.lineTo(doorL, lerp(doorT, doorB, f));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w, lerp(0, h, f));
      ctx.lineTo(doorR, lerp(doorT, doorB, f));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,100,72,0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.93);
    ctx.lineTo(doorL, doorB);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w, h * 0.93);
    ctx.lineTo(doorR, doorB);
    ctx.stroke();

    ctx.fillStyle = '#0b0a09';
    ctx.fillRect(doorL - 10, doorT - 8, doorW + 20, doorB - doorT + 8);
    ctx.strokeStyle = '#221d17';
    ctx.lineWidth = 8;
    ctx.strokeRect(doorL - 4, doorT - 4, doorW + 8, doorH);

    const lightAmt = open;
    if (lightAmt > 0.01) {
      const slit = doorW * (0.06 + open * 0.9);
      const lg = ctx.createLinearGradient(doorL, 0, doorL + slit, 0);
      lg.addColorStop(0, `rgba(255,222,168,${0.75 * lightAmt})`);
      lg.addColorStop(1, `rgba(255,196,120,${0.4 * lightAmt})`);
      ctx.fillStyle = lg;
      ctx.fillRect(doorL, doorT, slit, doorH);
      ctx.fillStyle = `rgba(255,210,150,${0.32 * lightAmt})`;
      poly(ctx, [[doorL, doorB], [doorL + slit, doorB], [vpx + slit * 1.7, h], [vpx - doorW * 0.2, h]], `rgba(255,206,142,${0.18 * lightAmt})`);
      if (open < 0.92) {
        ctx.fillStyle = '#0c0b0a';
        ctx.beginPath();
        ctx.moveTo(doorL + slit, doorT);
        ctx.lineTo(doorR, doorT);
        ctx.lineTo(doorR, doorB);
        ctx.lineTo(doorL + slit, doorB);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,50,38,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(150,130,96,0.4)';
        ctx.beginPath();
        ctx.arc(doorL + slit + doorW * 0.12, doorB - doorH * 0.42, 2.4, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#0a0908';
      ctx.fillRect(doorL, doorT, doorW, doorH);
      ctx.strokeStyle = 'rgba(56,48,38,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(doorL + doorW * 0.16, doorT + doorH * 0.12, doorW * 0.68, doorH * 0.3);
      ctx.strokeRect(doorL + doorW * 0.16, doorT + doorH * 0.5, doorW * 0.68, doorH * 0.32);
      ctx.fillStyle = 'rgba(150,130,96,0.42)';
      ctx.beginPath();
      ctx.arc(doorL + doorW * 0.82, doorT + doorH * 0.5, 2.6, 0, TAU);
      ctx.fill();
    }

    const lampF = torchFlicker({ flicker: 0.4, phase: 1.2, power: 1 }, t);
    const lampX = lerp(w / 2, vpx, 0.5) + Math.sin(t * 1.3) * 12;
    const lampY = lerp(0, doorT, 0.5) + 26;
    ctx.strokeStyle = 'rgba(20,16,12,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lampX + Math.sin(t * 1.3) * 6, 0);
    ctx.lineTo(lampX, lampY - 8);
    ctx.stroke();
    const lampGlow = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, 150);
    lampGlow.addColorStop(0, `rgba(255,206,142,${0.32 * lampF})`);
    lampGlow.addColorStop(0.4, `rgba(255,190,120,${0.1 * lampF})`);
    lampGlow.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = lampGlow;
    ctx.fillRect(lampX - 150, lampY - 150, 300, 300);
    ctx.fillStyle = `rgba(255,222,170,${0.85 * lampF})`;
    ctx.beginPath();
    ctx.ellipse(lampX, lampY, 5, 8, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lampX - 10, lampY);
    ctx.lineTo(lampX + 10, lampY);
    ctx.lineTo(lampX + 165, h);
    ctx.lineTo(lampX - 165, h);
    ctx.closePath();
    ctx.clip();
    const cone = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, h);
    cone.addColorStop(0, `rgba(255,214,150,${0.14 * lampF})`);
    cone.addColorStop(0.6, `rgba(255,206,140,${0.04 * lampF})`);
    cone.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = cone;
    ctx.fillRect(lampX - 180, lampY, 360, h - lampY);
    ctx.restore();

    const cf = 0.46;
    const cx = lerp(w * 0.82, doorR, cf);
    const cy = lerp(h * 0.82, doorB, cf);
    const cs = lerp(1, 0.42, cf);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(cs, cs);
    ctx.fillStyle = 'rgba(8,7,6,0.9)';
    ctx.fillRect(-22, -70, 44, 60);
    ctx.fillRect(-24, -16, 48, 9);
    ctx.fillRect(-20, -6, 6, 26);
    ctx.fillRect(14, -6, 6, 26);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(lerp(0, doorL, 0.35) - 26, lerp(0, doorT, 0.62), 52, 66);
    ctx.strokeStyle = 'rgba(120,100,74,0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(lerp(0, doorL, 0.35) - 26, lerp(0, doorT, 0.62), 52, 66);

    if (t > 7.2 && t < 11.9 && open < 0.65) {
      const figureFade = t > 11 ? clamp((11.9 - t) / 0.9, 0, 1) : 1;
      const fh = doorH * 0.86;
      const fx = vpx + Math.sin(t * 1.1) * 3;
      const fy = doorB;
      const back = ctx.createRadialGradient(fx, fy - fh * 0.55, 0, fx, fy - fh * 0.55, fh * 0.55);
      back.addColorStop(0, `rgba(208,188,158,${0.16 * figureFade})`);
      back.addColorStop(0.6, `rgba(150,128,102,${0.06 * figureFade})`);
      back.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = back;
      ctx.fillRect(fx - fh * 0.5, fy - fh, fh, fh);
      ctx.save();
      ctx.globalAlpha = figureFade;
      ctx.fillStyle = 'rgba(2,2,2,0.97)';
      ctx.beginPath();
      ctx.ellipse(fx, fy - fh * 0.88, fh * 0.052, fh * 0.062, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx - fh * 0.07, fy - fh * 0.83);
      ctx.quadraticCurveTo(fx - fh * 0.13, fy - fh * 0.5, fx - fh * 0.11, fy);
      ctx.lineTo(fx + fh * 0.1, fy);
      ctx.quadraticCurveTo(fx + fh * 0.13, fy - fh * 0.5, fx + fh * 0.06, fy - fh * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = fh * 0.018;
      ctx.strokeStyle = 'rgba(2,2,2,0.97)';
      ctx.beginPath();
      ctx.moveTo(fx - fh * 0.08, fy - fh * 0.75);
      ctx.lineTo(fx - fh * 0.2, fy - fh * 0.28);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx + fh * 0.07, fy - fh * 0.74);
      ctx.lineTo(fx + fh * 0.19, fy - fh * 0.3);
      ctx.stroke();
      if (t > 8.6) {
        const blink = Math.sin(t * 9) > -0.8 ? 1 : 0.2;
        ctx.fillStyle = `rgba(226,214,190,${0.8 * blink})`;
        ctx.beginPath();
        ctx.arc(fx - fh * 0.022, fy - fh * 0.9, fh * 0.013, 0, TAU);
        ctx.arc(fx + fh * 0.022, fy - fh * 0.9, fh * 0.013, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i += 1) {
      ctx.fillStyle = `rgba(220,220,210,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, rand(8, 70), rand(1, 2));
    }
    const bandY = ((t * 120) % (h + 240)) - 120;
    const band = ctx.createLinearGradient(0, bandY - 40, 0, bandY + 40);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY - 40, w, 80);
    if (Math.sin(t * 3.9) > 0.93) {
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '200,220,220' : '0,0,0'},${rand(0.05, 0.14)})`;
        ctx.fillRect(0, Math.random() * h, w, rand(1, 7));
      }
    }
    const bright = state.entering ? smooth(state.enterT / 0.55) : (t > 12.6 ? smooth((t - 12.6) / 3.4) * 0.12 : 0);
    if (bright > 0.01) {
      ctx.fillStyle = `rgba(244,232,208,${bright * 0.9})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (state.entering) {
      const white = smooth((state.enterT - 0.35) / 0.55);
      ctx.fillStyle = `rgba(255,248,238,${white})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawFloor(tx, ty, px, py, style) {
    const hsh = hash(tx, ty);
    const colors = styleColors[style];
    ctx.fillStyle = colors[Math.floor(hsh * 3)];
    ctx.fillRect(px, py, TILE, TILE);

    if (style === STYLE.wood) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py + TILE * (hsh < 0.5 ? 0.5 : 0.25));
      ctx.lineTo(px + TILE, py + TILE * (hsh < 0.5 ? 0.5 : 0.25));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,170,0.025)';
      ctx.beginPath();
      ctx.moveTo(px + TILE * (0.2 + hsh * 0.5), py);
      ctx.lineTo(px + TILE * (0.2 + hsh * 0.5), py + TILE);
      ctx.stroke();
    } else if (style === STYLE.tile) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
    } else if (style === STYLE.carpet) {
      for (let i = 0; i < 3; i += 1) {
        const a = hash(tx * 7 + i, ty * 3 + i);
        ctx.fillStyle = a > 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,200,180,0.025)';
        ctx.fillRect(px + a * TILE, py + ((a * 13) % 1) * TILE, 2, 2);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.moveTo(px, py + TILE / 2);
      ctx.lineTo(px + TILE, py + TILE / 2);
      ctx.stroke();
    } else {
      if (hsh > 0.7) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.arc(px + hsh * TILE, py + ((hsh * 31) % 1) * TILE, 5 + hsh * 8, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawWall(tx, ty, px, py) {
    const hsh = hash(tx, ty);
    ctx.fillStyle = hsh < 0.33 ? '#141519' : hsh < 0.66 ? '#17181c' : '#121317';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px, py + TILE - 5, TILE, 5);
    if (!isWall(px + TILE / 2, py + TILE + 2)) {
      ctx.fillStyle = '#232429';
      ctx.fillRect(px, py + TILE - 4, TILE, 4);
      ctx.fillStyle = 'rgba(255,210,160,0.05)';
      ctx.fillRect(px, py + TILE - 5, TILE, 1);
    }
    if (!isWall(px - 2, py + TILE / 2)) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(px, py, 2, TILE);
    }
    if (hsh > 0.82) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 6, py + 5);
      ctx.lineTo(px + 13, py + 16);
      ctx.lineTo(px + 9, py + 26);
      ctx.stroke();
    }
    if (hsh < 0.18) {
      ctx.fillStyle = 'rgba(120,100,70,0.06)';
      ctx.fillRect(px + TILE * 0.2, py + TILE * 0.35, TILE * 0.55, TILE * 0.3);
    }
  }

  function drawRug(rug) {
    const x = rug.x * TILE;
    const y = rug.y * TILE;
    const w = rug.w * TILE;
    const h = rug.h * TILE;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    rr(ctx, x + 5, y + 6, w, h, 8);
    ctx.fill();
    ctx.fillStyle = rug.color;
    rr(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,120,90,0.13)';
    ctx.lineWidth = 2;
    rr(ctx, x + 7, y + 7, w - 14, h - 14, 5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + (w * i) / 4, y + 10);
      ctx.lineTo(x + (w * i) / 4, y + h - 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDecor(d) {
    const x = d.x * TILE;
    const y = d.y * TILE;
    const w = d.w * TILE;
    const h = d.h * TILE;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2 + 4, y + h - 4, w * 0.48, h * 0.2, 0, 0, TAU);
    ctx.fill();

    if (d.type === 'tv') {
      ctx.fillStyle = '#2a2118';
      rr(ctx, x + 4, y + h - 18, w - 8, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#191512';
      rr(ctx, x + 8, y + 6, w - 16, h - 26, 4);
      ctx.fill();
      ctx.fillStyle = '#0a0d0e';
      rr(ctx, x + 12, y + 10, w - 24, h - 34, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,210,205,0.08)';
      for (let i = 0; i < 5; i += 1) {
        ctx.fillRect(x + 14, y + 12 + i * 4, w - 28, 1);
      }
    } else if (d.type === 'sofa') {
      ctx.fillStyle = '#3a2d27';
      rr(ctx, x + 3, y + 5, w - 6, h - 10, 9);
      ctx.fill();
      ctx.fillStyle = '#453630';
      rr(ctx, x + 8, y + 9, w - 16, h - 20, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 9);
      ctx.lineTo(x + w / 2, y + h - 11);
      ctx.stroke();
    } else if (d.type === 'table') {
      ctx.fillStyle = '#4a3728';
      rr(ctx, x + 4, y + 6, w - 8, h - 16, 4);
      ctx.fill();
      ctx.fillStyle = '#2b1f17';
      ctx.fillRect(x + 8, y + h - 12, 5, 9);
      ctx.fillRect(x + w - 13, y + h - 12, 5, 9);
      ctx.fillStyle = 'rgba(220,200,160,0.18)';
      rr(ctx, x + w * 0.2, y + 11, w * 0.22, h * 0.26, 1);
      ctx.fill();
    } else if (d.type === 'plant') {
      ctx.fillStyle = '#4b2c1d';
      rr(ctx, x + 10, y + h - 16, w - 20, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#2c3924';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.ellipse(x + w / 2 + Math.cos(a) * 9, y + h / 2 - 2 + Math.sin(a) * 8, 9, 4, a, 0, TAU);
        ctx.fill();
      }
    } else if (d.type === 'cabinet') {
      ctx.fillStyle = '#332820';
      rr(ctx, x + 4, y + 6, w - 8, h - 10, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeRect(x + w / 2 - 0.5, y + 8, 1, h - 14);
      ctx.fillStyle = 'rgba(200,180,140,0.3)';
      ctx.fillRect(x + w / 2 - 6, y + h / 2, 3, 3);
      ctx.fillRect(x + w / 2 + 4, y + h / 2, 3, 3);
    } else if (d.type === 'counter') {
      ctx.fillStyle = '#3d3a36';
      rr(ctx, x + 2, y + 4, w - 4, h - 8, 3);
      ctx.fill();
      ctx.fillStyle = '#4d4a45';
      rr(ctx, x + 6, y + 8, w - 12, h - 16, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeRect(x + 10, y + 12, w - 20, h * 0.3);
    } else if (d.type === 'fridge') {
      ctx.fillStyle = '#545451';
      rr(ctx, x + 8, y + 4, w - 16, h - 8, 3);
      ctx.fill();
      ctx.fillStyle = '#3c3c3a';
      ctx.fillRect(x + 8, y + h * 0.38, w - 16, 2);
      ctx.fillStyle = 'rgba(230,230,220,0.5)';
      ctx.fillRect(x + w - 18, y + 14, 2, h * 0.2);
    } else if (d.type === 'sink') {
      ctx.fillStyle = '#3a3c3e';
      rr(ctx, x + 5, y + 5, w - 10, h - 10, 4);
      ctx.fill();
      ctx.fillStyle = '#1b2022';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.24, h * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5b5e60';
      ctx.fillRect(x + w / 2 - 2, y + 7, 4, 8);
    } else if (d.type === 'bed') {
      ctx.fillStyle = '#3b2a22';
      rr(ctx, x + 2, y + 3, w - 4, h - 6, 5);
      ctx.fill();
      ctx.fillStyle = '#4a3e39';
      rr(ctx, x + 6, y + 6, w - 12, h * 0.34, 4);
      ctx.fill();
      ctx.fillStyle = '#3c3430';
      rr(ctx, x + 6, y + h * 0.38, w - 12, h * 0.56, 3);
      ctx.fill();
      ctx.fillStyle = '#6a5a51';
      rr(ctx, x + 9, y + 8, w * 0.34, h * 0.16, 4);
      ctx.fill();
      rr(ctx, x + w * 0.55, y + 8, w * 0.34, h * 0.16, 4);
      ctx.fill();
    } else if (d.type === 'wardrobe') {
      ctx.fillStyle = '#33261e';
      rr(ctx, x + 3, y + 3, w - 6, h - 6, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 5);
      ctx.lineTo(x + w / 2, y + h - 5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,180,150,0.35)';
      ctx.fillRect(x + w / 2 - 6, y + h / 2, 3, 3);
      ctx.fillRect(x + w / 2 + 3, y + h / 2, 3, 3);
    } else if (d.type === 'nightstand') {
      ctx.fillStyle = '#3a2c22';
      rr(ctx, x + 6, y + 8, w - 12, h - 16, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(240,210,150,0.3)';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + 13, 3, 0, TAU);
      ctx.fill();
    } else if (d.type === 'shelf') {
      ctx.fillStyle = '#2f241c';
      rr(ctx, x + 4, y + 2, w - 8, h - 4, 2);
      ctx.fill();
      ctx.fillStyle = '#1b1612';
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(x + 8, y + 8 + (i * (h - 16)) / 4, w - 16, 3);
      }
      const bookColors = ['#5a352c', '#3d4a3a', '#4a4456', '#6a5636'];
      for (let i = 0; i < 8; i += 1) {
        ctx.fillStyle = bookColors[i % 4];
        ctx.fillRect(x + 9 + (i % 2) * 8, y + 10 + Math.floor(i / 2) * 12, 5, 9);
      }
    } else if (d.type === 'desk') {
      ctx.fillStyle = '#4a3728';
      rr(ctx, x + 4, y + 8, w - 8, h * 0.36, 3);
      ctx.fill();
      ctx.fillStyle = '#2a211a';
      ctx.fillRect(x + 10, y + h * 0.44, 5, h * 0.42);
      ctx.fillRect(x + w - 15, y + h * 0.44, 5, h * 0.42);
      ctx.fillStyle = 'rgba(220,210,180,0.3)';
      ctx.fillRect(x + 14, y + 13, w * 0.3, h * 0.18);
    } else if (d.type === 'chair') {
      ctx.fillStyle = '#3a2c22';
      rr(ctx, x + 10, y + 12, w - 20, h - 24, 3);
      ctx.fill();
      ctx.fillRect(x + 12, y + 8, w - 24, 6);
      ctx.fillStyle = '#241b15';
      ctx.fillRect(x + 12, y + h - 12, 3, 8);
      ctx.fillRect(x + w - 15, y + h - 12, 3, 8);
    } else if (d.type === 'tub') {
      ctx.fillStyle = '#585a58';
      rr(ctx, x + 3, y + 3, w - 6, h - 6, 10);
      ctx.fill();
      ctx.fillStyle = '#2c3436';
      rr(ctx, x + 9, y + 9, w - 18, h - 18, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(180,200,200,0.12)';
      rr(ctx, x + 12, y + 12, w - 24, h * 0.3, 6);
      ctx.fill();
    } else if (d.type === 'toilet') {
      ctx.fillStyle = '#55524c';
      rr(ctx, x + 12, y + 5, w - 24, h * 0.3, 2);
      ctx.fill();
      ctx.fillStyle = '#4b4844';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.64, w * 0.25, h * 0.26, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2b2b29';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.64, w * 0.16, h * 0.17, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDoor() {
    const door = state.world.door;
    const x = door.x * TILE;
    const y = door.y * TILE;
    const open = state.doorOpen;
    ctx.save();
    ctx.fillStyle = '#17120e';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = open ? '#2b1c12' : '#211810';
    ctx.fillRect(x + 6, y + 4, TILE - 12, TILE - 6);
    ctx.strokeStyle = open ? 'rgba(255,170,90,0.5)' : 'rgba(120,90,60,0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 6, y + 4, TILE - 12, TILE - 6);
    ctx.fillStyle = 'rgba(220,190,140,0.5)';
    ctx.beginPath();
    ctx.arc(x + TILE - 12, y + TILE / 2, 2.2, 0, TAU);
    ctx.fill();
    if (open) {
      const glow = ctx.createLinearGradient(0, y - TILE, 0, y + TILE);
      glow.addColorStop(0, 'rgba(255,190,110,0)');
      glow.addColorStop(0.7, 'rgba(255,180,100,0.22)');
      glow.addColorStop(1, 'rgba(255,160,80,0.05)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - TILE * 0.6, y - TILE, TILE * 2.2, TILE * 1.9);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 8, y + 8, TILE - 16, 5);
    }
    ctx.restore();
  }

  function drawTapGlow(tape, i, t) {
    const bob = Math.sin(t * 2 + i * 2.1) * 3;
    ctx.save();
    ctx.translate(tape.x, tape.y + bob);
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.6 + i);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 46);
    glow.addColorStop(0, `rgba(255,130,80,${0.22 * pulse})`);
    glow.addColorStop(0.5, `rgba(220,70,40,${0.09 * pulse})`);
    glow.addColorStop(1, 'rgba(200,50,30,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-50, -50, 100, 100);
    ctx.fillStyle = '#211914';
    rr(ctx, -14, -9, 28, 18, 3);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,150,100,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 1.2;
    rr(ctx, -14, -9, 28, 18, 3);
    ctx.stroke();
    ctx.fillStyle = '#0d0a08';
    ctx.beginPath();
    ctx.arc(-6, 0, 4, 0, TAU);
    ctx.arc(6, 0, 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,180,140,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-6, 0, 1.8, 0, TAU);
    ctx.arc(6, 0, 1.8, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,230,215,0.5)';
    ctx.fillRect(-9, -6, 18, 1.5);
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const sprint = p.speed > 180;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 7, 16, 8, 0, 0, TAU);
    ctx.fill();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    const bob = p.moving ? Math.sin(p.walk) * 1.4 : 0;
    const swing = p.moving ? Math.sin(p.walk) * (sprint ? 2.6 : 1.7) : 0;
    ctx.fillStyle = '#22201b';
    ctx.beginPath();
    ctx.ellipse(-5, -5 + swing, 5, 7, 0.15, 0, TAU);
    ctx.ellipse(-5, 5 - swing, 5, 7, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3c372d';
    rr(ctx, -9, -9, 21, 18, 7);
    ctx.fill();
    ctx.fillStyle = '#2e2a23';
    rr(ctx, -6, -7, 11, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#342f27';
    ctx.beginPath();
    ctx.ellipse(6, -10 + bob, 4, 5, 0.4, 0, TAU);
    ctx.ellipse(10, 9 - bob, 4, 5, -0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7c2b22';
    rr(ctx, -1, -6, 5, 12, 2);
    ctx.fill();
    ctx.fillStyle = '#b99a7d';
    ctx.beginPath();
    ctx.arc(3, 0, 6.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#241d18';
    ctx.beginPath();
    ctx.arc(1.5, 0, 6.2, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    ctx.fillStyle = '#191a1c';
    rr(ctx, 9, -3, 10, 6, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,225,170,0.95)';
    ctx.beginPath();
    ctx.arc(19.5, 0, 2.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEntity() {
    const e = state.entity;
    const hunt = e.mode === 'hunt';
    const sway = Math.sin(e.sway * (hunt ? 4.2 : 1.7)) * (hunt ? 2.2 : 3.6);
    ctx.save();
    const dark = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 46);
    dark.addColorStop(0, 'rgba(0,0,0,0.55)');
    dark.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dark;
    ctx.fillRect(e.x - 48, e.y - 48, 96, 96);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 12, 22, 11, 0, 0, TAU);
    ctx.fill();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    const stretch = hunt ? 1.12 : 1;
    ctx.fillStyle = '#0a0a0d';
    ctx.strokeStyle = 'rgba(96,92,86,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-7, 0, 19 * stretch, 13.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(7, 0, 10, 14, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#08080a';
    ctx.beginPath();
    ctx.ellipse(11, -10 + sway, 2.6, 16, -0.26, 0, TAU);
    ctx.ellipse(11, 10 - sway, 2.6, 16, 0.26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0b0b0d';
    ctx.beginPath();
    ctx.ellipse(2, 0, 15, 9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a89a84';
    ctx.beginPath();
    ctx.ellipse(20, 0, 6.8, 4.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#151313';
    ctx.beginPath();
    ctx.ellipse(21.8, -1.9, 1.9, 2.2, 0.1, 0, TAU);
    ctx.ellipse(21.8, 1.9, 1.9, 2.2, -0.1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2a2420';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(23.6, -1.8);
    ctx.quadraticCurveTo(24.2, 0, 23.6, 1.8);
    ctx.stroke();
    ctx.fillStyle = '#171111';
    ctx.beginPath();
    ctx.ellipse(23.9, 0, 1.6, 1.3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function toScreen(x, y, ox, oy, zoom, cam) {
    return { x: (x - cam.x) * zoom + ox, y: (y - cam.y) * zoom + oy };
  }

  function drawLighting(ox, oy, zoom) {
    const p = state.player;
    const cam = state.camera;
    const t = state.time;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, view.w, view.h);
    lctx.fillStyle = 'rgba(3,4,6,0.935)';
    lctx.fillRect(0, 0, view.w, view.h);
    lctx.globalCompositeOperation = 'destination-out';

    const pScreen = toScreen(p.x, p.y, ox, oy, zoom, cam);
    const ambient = lctx.createRadialGradient(pScreen.x, pScreen.y, 0, pScreen.x, pScreen.y, 92 * zoom);
    ambient.addColorStop(0, 'rgba(0,0,0,0.72)');
    ambient.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    ambient.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = ambient;
    lctx.beginPath();
    lctx.arc(pScreen.x, pScreen.y, 92 * zoom, 0, TAU);
    lctx.fill();

    lctx.save();
    lctx.beginPath();
    lctx.moveTo(pScreen.x, pScreen.y);
    lctx.arc(pScreen.x, pScreen.y, 360 * zoom, p.angle - 0.46, p.angle + 0.46);
    lctx.closePath();
    lctx.clip();
    const cone = lctx.createRadialGradient(pScreen.x, pScreen.y, 18 * zoom, pScreen.x, pScreen.y, 360 * zoom);
    cone.addColorStop(0, 'rgba(0,0,0,0.98)');
    cone.addColorStop(0.35, 'rgba(0,0,0,0.92)');
    cone.addColorStop(0.75, 'rgba(0,0,0,0.6)');
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = cone;
    lctx.fillRect(pScreen.x - 400 * zoom, pScreen.y - 400 * zoom, 800 * zoom, 800 * zoom);
    lctx.restore();

    for (const light of state.world.lights) {
      const s = toScreen(light.x * TILE, light.y * TILE, ox, oy, zoom, cam);
      if (s.x < -300 || s.y < -300 || s.x > view.w + 300 || s.y > view.h + 300) continue;
      const power = torchFlicker(light, t);
      const r = light.r * TILE * zoom;
      const lg = lctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      lg.addColorStop(0, `rgba(0,0,0,${0.9 * power})`);
      lg.addColorStop(0.45, `rgba(0,0,0,${0.45 * power})`);
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = lg;
      lctx.beginPath();
      lctx.arc(s.x, s.y, r, 0, TAU);
      lctx.fill();
    }

    state.world.tapes.forEach((tape, i) => {
      if (state.collected[i]) return;
      const s = toScreen(tape.x, tape.y, ox, oy, zoom, cam);
      if (s.x < -120 || s.y < -120 || s.x > view.w + 120 || s.y > view.h + 120) return;
      const r = 42 * zoom;
      const tg = lctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      tg.addColorStop(0, 'rgba(0,0,0,0.5)');
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = tg;
      lctx.beginPath();
      lctx.arc(s.x, s.y, r, 0, TAU);
      lctx.fill();
    });

    if (state.doorOpen) {
      const door = state.world.doorPoint;
      const s = toScreen(door.x, door.y + TILE * 0.4, ox, oy, zoom, cam);
      const r = 150 * zoom;
      const dg = lctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      dg.addColorStop(0, 'rgba(0,0,0,0.75)');
      dg.addColorStop(0.5, 'rgba(0,0,0,0.35)');
      dg.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = dg;
      lctx.beginPath();
      lctx.arc(s.x, s.y, r, 0, TAU);
      lctx.fill();
    }

    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0, view.w, view.h);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.moveTo(pScreen.x, pScreen.y);
    ctx.arc(pScreen.x, pScreen.y, 375 * zoom, p.angle - 0.44, p.angle + 0.44);
    ctx.closePath();
    ctx.clip();
    const warm = ctx.createRadialGradient(pScreen.x, pScreen.y, 8, pScreen.x, pScreen.y, 375 * zoom);
    warm.addColorStop(0, 'rgba(255,214,160,0.17)');
    warm.addColorStop(0.32, 'rgba(255,200,140,0.075)');
    warm.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();

    for (const light of state.world.lights) {
      const s = toScreen(light.x * TILE, light.y * TILE, ox, oy, zoom, cam);
      if (s.x < -100 || s.y < -100 || s.x > view.w + 100 || s.y > view.h + 100) continue;
      const power = torchFlicker(light, t);
      const [r, g, b] = light.color;
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 58 * zoom);
      glow.addColorStop(0, `rgba(${r},${g},${b},${0.24 * power})`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = glow;
      ctx.fillRect(s.x - 70 * zoom, s.y - 70 * zoom, 140 * zoom, 140 * zoom);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.5 * power})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.4 * zoom, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawAfterLight(ox, oy, zoom) {
    const cam = state.camera;
    const p = state.player;
    const t = state.time;
    state.world.tapes.forEach((tape, i) => {
      if (state.collected[i]) return;
      const s = toScreen(tape.x, tape.y, ox, oy, zoom, cam);
      if (s.x < -60 || s.y < -60 || s.x > view.w + 60 || s.y > view.h + 60) return;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(zoom, zoom);
      drawTapGlow({ x: 0, y: 0 }, i, t);
      ctx.restore();
    });

    if (state.doorOpen) {
      const s = toScreen(state.world.doorPoint.x, state.world.doorPoint.y, ox, oy, zoom, cam);
      if (s.x > -120 && s.y > -120 && s.x < view.w + 120 && s.y < view.h + 120) {
        const glow = ctx.createLinearGradient(s.x, s.y - 60 * zoom, s.x, s.y + 20 * zoom);
        glow.addColorStop(0, 'rgba(255,180,100,0)');
        glow.addColorStop(0.75, 'rgba(255,170,90,0.24)');
        glow.addColorStop(1, 'rgba(255,140,60,0.1)');
        ctx.fillStyle = glow;
        ctx.fillRect(s.x - 34 * zoom, s.y - 60 * zoom, 68 * zoom, 80 * zoom);
      }
    }

    const e = state.entity;
    if (e.mode !== 'dormant') {
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < TILE * 12 && lineOfSight(e.x, e.y, p.x, p.y)) {
        const hx = e.x + Math.cos(e.angle) * 14;
        const hy = e.y + Math.sin(e.angle) * 14;
        const s = toScreen(hx, hy, ox, oy, zoom, cam);
        const perp = e.angle + Math.PI / 2;
        const spread = 4.2 * zoom;
        const fade = clamp(1 - d / (TILE * 12), 0.1, 1);
        const pulse = 0.7 + Math.sin(t * 3.1) * 0.3;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const side of [-1, 1]) {
          const ex = s.x + Math.cos(perp) * spread * side;
          const ey = s.y + Math.sin(perp) * spread * side;
          const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 7 * zoom);
          glow.addColorStop(0, `rgba(245,236,214,${0.9 * fade * pulse})`);
          glow.addColorStop(0.4, `rgba(220,120,80,${0.35 * fade})`);
          glow.addColorStop(1, 'rgba(200,60,30,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(ex, ey, 7 * zoom, 0, TAU);
          ctx.fill();
          ctx.fillStyle = `rgba(250,245,230,${fade})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 1.4 * zoom, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    for (const m of state.dust) {
      ctx.fillStyle = `rgba(240,225,195,${m.a})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.s, 0, TAU);
      ctx.fill();
    }

    if (state.face > 0) {
      const k = clamp(state.face / 1.4, 0, 1);
      const jolt = Math.sin(t * 61) * 9;
      ctx.save();
      ctx.fillStyle = `rgba(40,0,0,${0.55 * Math.min(1, k * 2)})`;
      ctx.fillRect(0, 0, view.w, view.h);
      for (let i = 0; i < 24; i += 1) {
        ctx.fillStyle = `rgba(0,0,0,${rand(0.1, 0.4)})`;
        ctx.fillRect(Math.random() * view.w, Math.random() * view.h, rand(4, 90), rand(1, 3));
      }
      const cx = view.w / 2 + jolt;
      const cy = view.h * 0.5 + Math.sin(t * 47) * 6;
      const fw = Math.min(view.w * 0.17, view.h * 0.16);
      const fh = fw * 2.3;
      ctx.translate(cx, cy);
      ctx.scale(1 + (1 - k) * 0.18, 1 + (1 - k) * 0.18);
      ctx.globalAlpha = clamp(k * 1.6, 0, 1);
      const skin = ctx.createRadialGradient(-fw * 0.15, -fh * 0.2, fw * 0.05, 0, 0, fh * 0.62);
      skin.addColorStop(0, '#d3c7ae');
      skin.addColorStop(0.55, '#a4957d');
      skin.addColorStop(0.85, '#4b4239');
      skin.addColorStop(1, '#100d0c');
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.moveTo(0, -fh * 0.5);
      ctx.quadraticCurveTo(fw * 0.62, -fh * 0.46, fw * 0.5, -fh * 0.1);
      ctx.quadraticCurveTo(fw * 0.46, fh * 0.22, fw * 0.18, fh * 0.48);
      ctx.quadraticCurveTo(0, fh * 0.55, -fw * 0.18, fh * 0.48);
      ctx.quadraticCurveTo(-fw * 0.46, fh * 0.22, -fw * 0.5, -fh * 0.1);
      ctx.quadraticCurveTo(-fw * 0.62, -fh * 0.46, 0, -fh * 0.5);
      ctx.fill();
      ctx.fillStyle = '#050404';
      ctx.beginPath();
      ctx.ellipse(-fw * 0.23, -fh * 0.11, fw * 0.16, fh * 0.1, 0.16, 0, TAU);
      ctx.ellipse(fw * 0.23, -fh * 0.11, fw * 0.16, fh * 0.1, -0.16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,40,24,0.55)';
      ctx.beginPath();
      ctx.ellipse(-fw * 0.23, -fh * 0.11, fw * 0.05, fh * 0.03, 0, 0, TAU);
      ctx.ellipse(fw * 0.23, -fh * 0.11, fw * 0.05, fh * 0.03, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#030303';
      ctx.beginPath();
      ctx.ellipse(0, fh * 0.19, fw * 0.15, fh * 0.15, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,210,190,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(rand(-fw * 0.3, fw * 0.3), rand(-fh * 0.3, fh * 0.3));
        ctx.lineTo(rand(-fw * 0.35, fw * 0.35), rand(-fh * 0.3, fh * 0.4));
        ctx.stroke();
      }
      ctx.restore();
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,248,238,${clamp(state.flash, 0, 1) * 0.42})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function renderGame() {
    const w = view.w;
    const h = view.h;
    const cam = state.camera;
    const zoom = state.zoom;
    const t = state.time;
    const ambientShake = state.fear > 82 ? ((state.fear - 82) / 18) * 2.1 : 0;
    const shakeMag = state.shake + ambientShake;
    const shakeX = (Math.random() * 2 - 1) * shakeMag;
    const shakeY = (Math.random() * 2 - 1) * shakeMag;
    const ox = w / 2 + shakeX;
    const oy = h / 2 + shakeY;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#040506';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    const halfW = w / (2 * zoom) + TILE * 2;
    const halfH = h / (2 * zoom) + TILE * 2;
    const minX = clamp(Math.floor((cam.x - halfW) / TILE), 0, MAP_W - 1);
    const maxX = clamp(Math.ceil((cam.x + halfW) / TILE), 0, MAP_W - 1);
    const minY = clamp(Math.floor((cam.y - halfH) / TILE), 0, MAP_H - 1);
    const maxY = clamp(Math.ceil((cam.y + halfH) / TILE), 0, MAP_H - 1);
    const tiles = state.world.tiles;
    const floors = state.world.floors;

    for (let ty = minY; ty <= maxY; ty += 1) {
      for (let tx = minX; tx <= maxX; tx += 1) {
        const i = ty * MAP_W + tx;
        const px = tx * TILE;
        const py = ty * TILE;
        if (tiles[i] === 1) drawWall(tx, ty, px, py);
        else drawFloor(tx, ty, px, py, floors[i]);
      }
    }

    for (const rug of state.world.rugs) {
      if ((rug.x + rug.w) * TILE < cam.x - halfW || rug.x * TILE > cam.x + halfW) continue;
      if ((rug.y + rug.h) * TILE < cam.y - halfH || rug.y * TILE > cam.y + halfH) continue;
      drawRug(rug);
    }
    for (const d of state.world.decor) {
      if ((d.x + d.w) * TILE < cam.x - halfW || d.x * TILE > cam.x + halfW) continue;
      if ((d.y + d.h) * TILE < cam.y - halfH || d.y * TILE > cam.y + halfH) continue;
      drawDecor(d);
    }
    drawDoor();
    drawEntity();
    drawPlayer();
    ctx.restore();

    drawLighting(ox, oy, zoom);
    drawAfterLight(ox, oy, zoom);
  }

  function render() {
    if (state.scene === 'title') renderTitle();
    else if (state.scene === 'cutscene') renderCutscene();
    else renderGame();
  }

  let last = performance.now();
  let titlePaintAt = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (state.scene === 'title') {
      if (now - titlePaintAt > 100) {
        titlePaintAt = now;
        render();
      }
    } else {
      render();
    }
    requestAnimationFrame(frame);
  }

  function setJoystick(e) {
    const rect = ui.joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.34;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    input.jx = dx / max;
    input.jy = dy / max;
    const px = dx * 0.55;
    const py = dy * 0.55;
    ui.joyStick.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
  }

  let joyId = null;
  ui.joystick.addEventListener('pointerdown', (e) => {
    if (state.scene !== 'game' || state.paused) return;
    joyId = e.pointerId;
    ui.joystick.setPointerCapture(e.pointerId);
    audio.resume();
    setJoystick(e);
    e.preventDefault();
  });
  ui.joystick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    setJoystick(e);
    e.preventDefault();
  });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    input.jx = 0;
    input.jy = 0;
    ui.joyStick.style.transform = 'translate(-50%, -50%)';
  };
  ui.joystick.addEventListener('pointerup', endJoy);
  ui.joystick.addEventListener('pointercancel', endJoy);

  ui.sprintBtn.addEventListener('pointerdown', (e) => {
    if (state.scene !== 'game' || state.paused) return;
    input.sprint = true;
    ui.sprintBtn.classList.add('held');
    ui.sprintBtn.setPointerCapture(e.pointerId);
    audio.resume();
    e.preventDefault();
  });
  const endSprint = () => {
    input.sprint = false;
    ui.sprintBtn.classList.remove('held');
  };
  ui.sprintBtn.addEventListener('pointerup', endSprint);
  ui.sprintBtn.addEventListener('pointercancel', endSprint);
  ui.sprintBtn.addEventListener('pointerleave', endSprint);

  ui.actionBtn.addEventListener('click', () => {
    audio.resume();
    tryInteract();
  });
  ui.pauseBtn.addEventListener('click', () => togglePause());
  ui.resumeBtn.addEventListener('click', () => togglePause(false));
  ui.restartBtn.addEventListener('click', () => {
    ui.pauseScreen.classList.add('hidden');
    startGame();
  });
  ui.soundBtn.addEventListener('click', toggleSound);
  ui.retryBtn.addEventListener('click', () => {
    ui.overScreen.classList.add('hidden');
    startGame();
  });
  ui.againBtn.addEventListener('click', () => {
    ui.winScreen.classList.add('hidden');
    startGame();
  });
  ui.homeBtn.addEventListener('click', showTitle);
  ui.homeBtn2.addEventListener('click', showTitle);

  ui.startBtn.addEventListener('click', () => {
    audio.resume();
    audio.startAmbient();
    startCutscene();
  });

  ui.skipBtn.addEventListener('click', () => {
    if (state.entering) return;
    state.cutsceneTime = Math.max(state.cutsceneTime, 14.7);
    state.cutsceneStartedAt = performance.now() - state.cutsceneTime * 1000;
    ui.enterBtn.classList.remove('hidden');
    ui.skipBtn.classList.add('hidden');
    state.subtitleIndex = -1;
  });

  ui.enterBtn.addEventListener('click', () => {
    if (state.entering) return;
    state.entering = true;
    state.enterT = 0;
    state.enterStartedAt = performance.now();
    ui.enterBtn.classList.add('hidden');
    ui.subtitles.classList.remove('show');
    audio.enterVideo();
  });

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyE') tryInteract();
    if (e.code === 'KeyP' && state.scene === 'game') togglePause();
    if (e.code === 'Enter' && state.scene === 'cutscene' && !ui.enterBtn.classList.contains('hidden')) ui.enterBtn.click();
    audio.resume();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    endSprint();
    if (state.scene === 'game' && !state.paused) togglePause(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.scene === 'game' && !state.paused) togglePause(true);
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  const params = new URLSearchParams(window.location.search);
  resize();
  if (params.get('debug') === '1') {
    window.__dar = {
      state,
      startGame,
      showTitle,
      collectTape,
      caught,
      winGame,
      teleportTile(tx, ty) {
        state.player.x = (tx + 0.5) * TILE;
        state.player.y = (ty + 0.5) * TILE;
        state.camera.x = state.player.x;
        state.camera.y = state.player.y;
        clampCamera();
      }
    };
  }
  if (params.get('scene') === 'game') {
    audio.init();
    startGame();
  } else if (params.get('scene') === 'cutscene') {
    audio.init();
    startCutscene();
  } else {
    showOnly(ui.title);
  }
  requestAnimationFrame(frame);
})();
