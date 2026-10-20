import * as THREE from '../vendor/three.module.js';
import { AudioEngine } from './audio.js';
import { DarkVideo } from './video.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

const isTouch = window.matchMedia('(pointer: coarse)').matches;
const dom = {
  canvas: document.getElementById('scene'),
  title: document.getElementById('title-screen'),
  start: document.getElementById('start-btn'),
  end: document.getElementById('end-screen'),
  endInner: document.querySelector('.end-inner'),
  endKicker: document.getElementById('end-kicker'),
  endTitle: document.getElementById('end-title'),
  endText: document.getElementById('end-text'),
  retry: document.getElementById('retry-btn'),
  statTime: document.getElementById('stat-time'),
  statViews: document.getElementById('stat-views'),
  interact: document.getElementById('interact'),
  interactLabel: document.getElementById('interact-label'),
  interactSub: document.getElementById('interact-sub'),
  hint: document.getElementById('hint'),
  hintText: document.getElementById('hint-text'),
  subtitle: document.getElementById('subtitle'),
  subtitleText: document.getElementById('subtitle-text'),
  joystick: document.getElementById('joystick'),
  stick: document.getElementById('stick'),
  flash: document.getElementById('flash'),
  blackout: document.getElementById('blackout'),
  hudTime: document.getElementById('hud-time'),
  fatal: document.getElementById('fatal'),
  crosshair: document.getElementById('crosshair'),
};

if (isTouch) document.body.classList.add('touch');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  dom.fatal.classList.remove('hidden');
  dom.fatal.textContent = 'تعذّر تشغيل الرسوميات ثلاثية الأبعاد على هذا الجهاز. جرّب تحديث المتصفح أو تفعيل تسريع العتاد.';
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.8 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040507);
scene.fog = new THREE.Fog(0x040507, 3.5, 16);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 40);
camera.rotation.order = 'YXZ';
scene.add(camera);

const audio = new AudioEngine();
const video = new DarkVideo(THREE);

const player = {
  x: 0,
  z: 2.2,
  eye: 1.62,
  yaw: 0,
  pitch: 0,
  radius: 0.3,
  speed: 2.85,
  moving: false,
  bob: 0,
  step: 0,
};

const state = {
  name: 'title',
  elapsed: 0,
  videoTime: 0,
  scareTime: 0,
  chaseTime: 0,
  endTime: 0,
  attempts: 0,
  shake: 0,
  hintKey: '',
  subtitleKey: '',
  nearTV: false,
  nearDoor: false,
  lastWhisper: 0,
  seenEntity: false,
  doorOpen: 0,
};

const room = new THREE.Group();
scene.add(room);

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  return c;
}

function makeTexture(canvas, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function grimeCanvas() {
  return makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#232529';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(rnd(20, 66));
      ctx.fillStyle = `rgba(${v},${v + 1},${v + 3},${rnd(0.05, 0.35)})`;
      ctx.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3));
    }
    for (let i = 0; i < 30; i++) {
      const x = rnd(0, w);
      const wid = rnd(4, 26);
      const g = ctx.createLinearGradient(x, 0, x + wid, 0);
      g.addColorStop(0, 'rgba(8,9,11,0)');
      g.addColorStop(0.5, `rgba(8,9,11,${rnd(0.12, 0.4)})`);
      g.addColorStop(1, 'rgba(8,9,11,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, wid, h);
    }
    ctx.strokeStyle = 'rgba(5,6,7,0.5)';
    for (let i = 0; i < 6; i++) {
      ctx.lineWidth = rnd(0.5, 1.5);
      ctx.beginPath();
      let x = rnd(0, w);
      let y = rnd(0, h);
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += rnd(-18, 18);
        y += rnd(8, 26);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function floorCanvas() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#211b16';
    ctx.fillRect(0, 0, w, h);
    const plankH = 64;
    for (let row = 0; row < h / plankH; row++) {
      let x = row % 2 ? -70 : 0;
      while (x < w) {
        const pw = rnd(140, 230);
        const tone = Math.floor(rnd(30, 52));
        ctx.fillStyle = `rgb(${tone + 6},${tone - 2},${tone - 9})`;
        ctx.fillRect(x, row * plankH, pw - 3, plankH - 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeRect(x + 0.5, row * plankH + 0.5, pw - 3, plankH - 2);
        for (let i = 0; i < 18; i++) {
          ctx.strokeStyle = `rgba(${tone + 20},${tone + 10},${tone},${rnd(0.05, 0.16)})`;
          ctx.lineWidth = rnd(0.5, 1.4);
          const gy = row * plankH + rnd(4, plankH - 4);
          ctx.beginPath();
          ctx.moveTo(x + 4, gy);
          ctx.bezierCurveTo(x + pw * 0.3, gy + rnd(-3, 3), x + pw * 0.6, gy + rnd(-3, 3), x + pw - 6, gy + rnd(-2, 2));
          ctx.stroke();
        }
        if (Math.random() < 0.3) {
          ctx.fillStyle = 'rgba(5,4,3,0.4)';
          ctx.fillRect(x + rnd(8, pw - 30), row * plankH + rnd(6, plankH - 12), rnd(3, 12), rnd(2, 6));
        }
        x += pw;
      }
    }
  });
}

function woodCanvas() {
  return makeCanvas(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2c2119';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = `rgba(${rnd(30, 80)},${rnd(22, 55)},${rnd(16, 40)},${rnd(0.05, 0.2)})`;
      ctx.lineWidth = rnd(0.6, 2.2);
      const x = rnd(0, w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rnd(-8, 8), h * 0.3, x + rnd(-8, 8), h * 0.7, x + rnd(-6, 6), h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 22, w - 40, h * 0.4 - 30);
    ctx.strokeRect(20, h * 0.47, w - 40, h * 0.46);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 26, w - 48, h * 0.4 - 38);
  });
}

function posterCanvas() {
  return makeCanvas(256, 384, (ctx, w, h) => {
    ctx.fillStyle = '#0b0a0a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(190, 35, 50, 0.9)';
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = 'rgba(190, 35, 50, 0.85)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillText('DEEP WEB ARCHIVE // 07', w / 2, 42);
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ded6c6';
    ctx.font = 'bold 38px "Noto Sans Arabic", Tahoma, sans-serif';
    ctx.fillText('لا تنظر', w / 2, 132);
    ctx.fillText('خلفك', w / 2, 178);
    ctx.fillStyle = 'rgba(190,35,50,0.75)';
    ctx.font = 'bold 13px monospace';
    ctx.direction = 'ltr';
    ctx.fillText('DO NOT LOOK BACK', w / 2, 224);
    ctx.strokeStyle = 'rgba(220,210,190,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, 250);
    ctx.lineTo(w - 36, 250);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,210,190,0.45)';
    ctx.font = '9px monospace';
    ctx.direction = 'rtl';
    ctx.fillText('شريط مُستعاد — ١٩٩٨', w / 2, 276);
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(220,210,190,0.25)';
    ctx.fillText('THE TAPE WATCHES BACK', w / 2, 320);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, i * 24 + 8, w, 3);
    }
  });
}

function poster2Canvas() {
  return makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#101112';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(200,205,195,0.85)';
    ctx.font = 'bold 76px "Noto Sans Arabic", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('أطفئ', w / 2, h / 2 - 24);
    ctx.fillText('الشاشة', w / 2, h / 2 + 46);
    ctx.strokeStyle = 'rgba(190,35,50,0.8)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(46, 46);
    ctx.lineTo(w - 46, h - 46);
    ctx.moveTo(w - 46, 46);
    ctx.lineTo(46, h - 46);
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,35,50,0.55)';
    ctx.font = '10px monospace';
    ctx.fillText('SWITCH IT OFF', w / 2, h - 20);
  });
}

function exitCanvas() {
  return makeCanvas(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#080707';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(210, 40, 55, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#ff3348';
    ctx.font = 'bold 46px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', w / 2 - 32, h / 2 + 2);
    ctx.fillStyle = '#ffd7d7';
    ctx.font = 'bold 26px "Noto Sans Arabic", Tahoma, sans-serif';
    ctx.fillText('مخرج', w / 2 + 74, h / 2 + 2);
  });
}

function voidCanvas() {
  return makeCanvas(128, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, h * 0.7);
    g.addColorStop(0, '#2a0207');
    g.addColorStop(0.4, '#140104');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function blobCanvas() {
  return makeCanvas(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.72)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function entityFaceCanvas() {
  return makeCanvas(512, 640, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = 256;
    const cy = 330;

    const hair = (x0, dir) => {
      ctx.beginPath();
      ctx.moveTo(cx + x0, cy - 252);
      ctx.bezierCurveTo(cx + x0 + dir * 92, cy - 110, cx + x0 + dir * 74, cy + 130, cx + x0 + dir * 44, cy + 440);
      ctx.lineTo(cx + x0 + dir * 6, cy + 440);
      ctx.bezierCurveTo(cx + x0 + dir * 28, cy + 70, cx + x0 + dir * 18, cy - 120, cx + x0 - dir * 8, cy - 252);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#030303';
    hair(-168, -1);
    hair(162, 1);

    const facePath = () => {
      ctx.beginPath();
      ctx.moveTo(cx - 148, cy - 58);
      ctx.bezierCurveTo(cx - 166, cy - 244, cx + 174, cy - 252, cx + 150, cy - 66);
      ctx.bezierCurveTo(cx + 146, cy + 26, cx + 118, cy + 118, cx + 66, cy + 178);
      ctx.bezierCurveTo(cx + 34, cy + 218, cx - 26, cy + 230, cx - 62, cy + 202);
      ctx.bezierCurveTo(cx - 110, cy + 164, cx - 144, cy + 84, cx - 148, cy - 58);
      ctx.closePath();
    };

    const skin = ctx.createRadialGradient(cx - 74, cy - 122, 18, cx - 8, cy - 10, 330);
    skin.addColorStop(0, '#a49c8b');
    skin.addColorStop(0.38, '#7d7668');
    skin.addColorStop(0.7, '#544f45');
    skin.addColorStop(1, '#1a1815');
    ctx.fillStyle = skin;
    facePath();
    ctx.fill();

    ctx.save();
    facePath();
    ctx.clip();

    for (let i = 0; i < 1000; i++) {
      const v = rnd(0, 46);
      ctx.fillStyle = `rgba(${v + 12},${v + 10},${v + 6},${rnd(0.04, 0.14)})`;
      ctx.beginPath();
      ctx.ellipse(rnd(cx - 170, cx + 170), rnd(cy - 250, cy + 230), rnd(1, 10), rnd(1, 7), rnd(0, 3), 0, TAU);
      ctx.fill();
    }

    const sideShade = ctx.createLinearGradient(cx - 170, 0, cx + 170, 0);
    sideShade.addColorStop(0, 'rgba(4, 4, 4, 0.74)');
    sideShade.addColorStop(0.3, 'rgba(4, 4, 4, 0.1)');
    sideShade.addColorStop(0.74, 'rgba(4, 4, 4, 0.16)');
    sideShade.addColorStop(1, 'rgba(4, 4, 4, 0.64)');
    ctx.fillStyle = sideShade;
    ctx.fillRect(cx - 200, cy - 270, 400, 520);

    const cheek = ctx.createRadialGradient(cx - 108, cy + 54, 6, cx - 108, cy + 54, 90);
    cheek.addColorStop(0, 'rgba(10, 9, 7, 0.7)');
    cheek.addColorStop(1, 'rgba(10, 9, 7, 0)');
    ctx.fillStyle = cheek;
    ctx.fillRect(cx - 220, cy - 40, 220, 260);

    const socket = (x, y, rx, ry, rot) => {
      const g = ctx.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(2, 2, 2, 0.99)');
      g.addColorStop(0.62, 'rgba(5, 4, 4, 0.97)');
      g.addColorStop(1, 'rgba(30, 26, 21, 0.45)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(14, 12, 10, 0.45)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(x, y, rx + 4, ry + 4, rot, 0.24, Math.PI - 0.24);
      ctx.stroke();
    };
    socket(cx - 82, cy - 72, 43, 27, -0.14);
    socket(cx + 84, cy - 84, 38, 33, 0.17);

    const pupil = (x, y, r) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.4);
      g.addColorStop(0, 'rgba(226, 232, 210, 0.95)');
      g.addColorStop(0.3, 'rgba(188, 196, 170, 0.5)');
      g.addColorStop(1, 'rgba(150, 160, 135, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 4.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#dfe7cb';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 240, 0.9)';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.35, Math.max(0.6, r * 0.28), 0, TAU);
      ctx.fill();
    };
    pupil(cx - 89, cy - 69, 2.6);
    pupil(cx + 89, cy - 80, 2.1);

    ctx.fillStyle = 'rgba(9, 8, 7, 0.86)';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 6);
    ctx.bezierCurveTo(cx - 18, cy + 24, cx - 22, cy + 40, cx - 12, cy + 48);
    ctx.bezierCurveTo(cx - 2, cy + 54, cx + 10, cy + 50, cx + 16, cy + 42);
    ctx.bezierCurveTo(cx + 22, cy + 30, cx + 12, cy + 14, cx + 6, cy + 2);
    ctx.closePath();
    ctx.fill();

    const mouthPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx - 92, cy + 104);
      ctx.bezierCurveTo(cx - 52, cy + 84, cx + 48, cy + 80, cx + 88, cy + 96);
      ctx.bezierCurveTo(cx + 100, cy + 132, cx + 70, cy + 174, cx + 24, cy + 188);
      ctx.bezierCurveTo(cx - 26, cy + 202, cx - 84, cy + 180, cx - 96, cy + 142);
      ctx.closePath();
    };
    const mouthGrad = ctx.createLinearGradient(0, cy + 90, 0, cy + 200);
    mouthGrad.addColorStop(0, 'rgba(4, 2, 2, 0.98)');
    mouthGrad.addColorStop(0.5, 'rgba(15, 5, 7, 1)');
    mouthGrad.addColorStop(1, 'rgba(5, 2, 3, 1)');
    ctx.fillStyle = mouthGrad;
    mouthPath();
    ctx.fill();

    ctx.save();
    mouthPath();
    ctx.clip();

    const topTeeth = [
      [-72, 96, 21, 38, 0.09, 0],
      [-38, 99, 15, 26, -0.05, 1],
      [-4, 102, 23, 44, 0.04, 0],
      [34, 99, 14, 22, -0.09, 1],
      [62, 95, 18, 33, 0.07, 0],
    ];
    topTeeth.forEach(([x, y, tw, th, tilt, tone]) => {
      ctx.save();
      ctx.translate(cx + x, cy + y);
      ctx.rotate(tilt);
      ctx.fillStyle = tone ? 'rgba(112, 104, 86, 0.96)' : 'rgba(140, 132, 110, 0.96)';
      ctx.beginPath();
      ctx.moveTo(-tw / 2, 0);
      ctx.lineTo(tw / 2, 0);
      ctx.lineTo(tw / 2 - 2, th * 0.6);
      ctx.lineTo(tw * 0.08, th);
      ctx.lineTo(-tw / 2 + 2, th * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(26, 22, 18, 0.38)';
      ctx.fillRect(-tw / 2, 0, tw, 5);
      ctx.restore();
    });
    const bottomTeeth = [
      [-44, 188, 17, 22, -0.05, 1],
      [-8, 193, 20, 28, 0.06, 0],
      [30, 188, 14, 20, -0.04, 1],
    ];
    bottomTeeth.forEach(([x, y, tw, th, tilt, tone]) => {
      ctx.save();
      ctx.translate(cx + x, cy + y);
      ctx.rotate(tilt);
      ctx.fillStyle = tone ? 'rgba(104, 96, 79, 0.94)' : 'rgba(128, 120, 99, 0.94)';
      ctx.beginPath();
      ctx.moveTo(-tw / 2, 0);
      ctx.lineTo(tw / 2, 0);
      ctx.lineTo(tw * 0.18, -th);
      ctx.lineTo(-tw / 2 + 3, -th * 0.68);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    const gum = ctx.createLinearGradient(0, cy + 88, 0, cy + 150);
    gum.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    gum.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gum;
    ctx.fillRect(cx - 120, cy + 84, 240, 66);
    ctx.restore();

    ctx.strokeStyle = 'rgba(16, 14, 12, 0.62)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy - 216);
    ctx.lineTo(cx + 4, cy - 184);
    ctx.lineTo(cx + 18, cy - 158);
    ctx.lineTo(cx - 2, cy - 132);
    ctx.lineTo(cx + 6, cy - 108);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 118, cy + 30);
    ctx.lineTo(cx - 106, cy + 58);
    ctx.lineTo(cx - 116, cy + 82);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(8, 7, 6, 0.5)';
    for (let i = 0; i < 10; i++) {
      ctx.lineWidth = rnd(1, 2.6);
      ctx.beginPath();
      let x = rnd(cx - 130, cx + 130);
      let y = rnd(cy - 80, cy + 160);
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += rnd(-14, 14);
        y += rnd(-12, 12);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(12, 11, 9, 0.5)';
    ctx.lineWidth = 10;
    facePath();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(3, 3, 3, 0.9)';
    for (let i = 0; i < 9; i++) {
      const sx = cx + (i % 2 ? 1 : -1) * rnd(96, 170);
      const sy = cy - rnd(170, 246);
      ctx.lineWidth = rnd(2.5, 6);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + rnd(-32, 32), sy + rnd(70, 150), sx + rnd(-38, 38), sy + rnd(170, 280), sx + rnd(-20, 20), sy + rnd(280, 380));
      ctx.stroke();
    }
  });
}

const wallMat = new THREE.MeshStandardMaterial({ map: makeTexture(grimeCanvas(), 3, 1.5), roughness: 0.96, metalness: 0.04 });
const wallMatSide = new THREE.MeshStandardMaterial({ map: makeTexture(grimeCanvas(), 2.4, 1.5), roughness: 0.96, metalness: 0.04 });
const floorMat = new THREE.MeshStandardMaterial({ map: makeTexture(floorCanvas(), 3, 3), roughness: 0.82, metalness: 0.02 });
const ceilingMat = new THREE.MeshStandardMaterial({ map: makeTexture(grimeCanvas(), 3, 3), color: 0x6c6c70, roughness: 1 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2b20, roughness: 0.78, metalness: 0.03 });
const darkWoodMat = new THREE.MeshStandardMaterial({ map: makeTexture(woodCanvas()), color: 0x9a8a7a, roughness: 0.85 });
const plasticMat = new THREE.MeshLambertMaterial({ color: 0x151615 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4c4a, roughness: 0.45, metalness: 0.7 });
const blackMat = new THREE.MeshBasicMaterial({ color: 0x030303 });

const floor = new THREE.Mesh(new THREE.PlaneGeometry(11, 9), floorMat);
floor.rotation.x = -Math.PI / 2;
room.add(floor);

const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(11, 9), ceilingMat);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = 3.4;
room.add(ceiling);

function addWall(w, h, x, y, z, ry, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  room.add(m);
  return m;
}

addWall(11, 3.4, 0, 1.7, -4.5, 0, wallMat);
addWall(9, 3.4, -5.5, 1.7, 0, Math.PI / 2, wallMatSide);
addWall(9, 3.4, 5.5, 1.7, 0, -Math.PI / 2, wallMatSide);
addWall(4.79, 3.4, -3.105, 1.7, 4.5, Math.PI, wallMat);
addWall(4.79, 3.4, 3.105, 1.7, 4.5, Math.PI, wallMat);
addWall(1.42, 1.0, 0, 2.9, 4.5, Math.PI, wallMat);

const skirtMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9 });
function skirting(w, x, z, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.05), skirtMat);
  m.position.set(x, 0.05, z);
  m.rotation.y = ry;
  room.add(m);
}
skirting(11, 0, -4.47, 0);
skirting(4.79, -3.1, 4.47, 0);
skirting(4.79, 3.1, 4.47, 0);
skirting(9, -5.47, 0, Math.PI / 2);
skirting(9, 5.47, 0, Math.PI / 2);

const poster = new THREE.Mesh(
  new THREE.PlaneGeometry(1.05, 1.58),
  new THREE.MeshStandardMaterial({ map: makeTexture(posterCanvas()), roughness: 0.9, emissive: 0x140306, emissiveIntensity: 0.7 })
);
poster.position.set(-5.46, 1.9, -1.4);
poster.rotation.y = Math.PI / 2;
room.add(poster);

const poster2 = new THREE.Mesh(
  new THREE.PlaneGeometry(0.86, 0.86),
  new THREE.MeshStandardMaterial({ map: makeTexture(poster2Canvas()), roughness: 0.9, emissive: 0x0a0203, emissiveIntensity: 0.5 })
);
poster2.position.set(5.46, 1.85, -0.9);
poster2.rotation.y = -Math.PI / 2;
room.add(poster2);

const desk = new THREE.Group();
desk.position.set(0, 0, -4.0);
room.add(desk);

const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.94), woodMat);
deskTop.position.y = 0.78;
desk.add(deskTop);
for (const x of [-1.06, 1.06]) {
  for (const z of [-0.38, 0.38]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.76, 0.09), woodMat);
    leg.position.set(x, 0.38, z);
    desk.add(leg);
  }
}
const deskBack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.24, 0.06), woodMat);
deskBack.position.set(0, 0.64, -0.44);
desk.add(deskBack);

const tv = new THREE.Group();
tv.position.set(0, 0, 0);
desk.add(tv);

const tvBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.78, 0.68), plasticMat);
tvBody.position.set(0, 1.17, -0.04);
tv.add(tvBody);

for (const [w, h, x, y] of [[0.9, 0.06, 0, 0.36], [0.9, 0.06, 0, -0.33], [0.06, 0.66, -0.43, 0.015], [0.06, 0.66, 0.43, 0.015]]) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), new THREE.MeshLambertMaterial({ color: 0x080909 }));
  frame.position.set(x, 1.19 + y, 0.31);
  tv.add(frame);
}

const tvScreen = new THREE.Mesh(
  new THREE.PlaneGeometry(0.76, 0.56),
  new THREE.MeshBasicMaterial({ map: video.texture, toneMapped: false, color: 0xd8dfe0 })
);
tvScreen.position.set(0, 1.19, 0.335);
tv.add(tvScreen);

const tvKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 10), metalMat);
tvKnob.rotation.x = Math.PI / 2;
tvKnob.position.set(0.37, 0.92, 0.32);
tv.add(tvKnob);
const tvLed = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
tvLed.position.set(-0.39, 0.88, 0.345);
tv.add(tvLed);

const vhs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.11, 0.42), new THREE.MeshStandardMaterial({ color: 0x1b1c1a, roughness: 0.6 }));
vhs.position.set(0.93, 0.99, 0.02);
desk.add(vhs);
const tape = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.055, 0.11), new THREE.MeshStandardMaterial({ color: 0x5a1a20, roughness: 0.6 }));
tape.position.set(0.93, 1.08, 0.06);
tape.rotation.y = 0.4;
desk.add(tape);

const tvCablePoints = [];
for (let i = 0; i < 8; i++) {
  tvCablePoints.push(new THREE.Vector3(-0.4 + i * 0.12, 0.8 + Math.sin(i * 0.9) * 0.05, 0.3 - i * 0.03));
}
const tvCable = new THREE.Mesh(
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tvCablePoints), 18, 0.012, 5, false),
  new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 })
);
desk.add(tvCable);

const chair = new THREE.Group();
chair.position.set(1.2, 0, -2.85);
chair.rotation.y = -0.28;
room.add(chair);
const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.48), woodMat);
seat.position.y = 0.47;
chair.add(seat);
const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.07), woodMat);
chairBack.position.set(0, 0.8, 0.22);
chair.add(chairBack);
for (const [x, z] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.47, 0.05), woodMat);
  leg.position.set(x, 0.235, z);
  chair.add(leg);
}

const shelf = new THREE.Group();
shelf.position.set(5.35, 0, 1.3);
shelf.rotation.y = -Math.PI / 2;
room.add(shelf);
for (let i = 0; i < 3; i++) {
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.32), metalMat);
  board.position.set(0, 0.7 + i * 0.55, 0);
  shelf.add(board);
  for (const x of [-0.6, 0.6]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.28), metalMat);
    bracket.position.set(x, 0.42 + i * 0.55, 0);
    shelf.add(bracket);
  }
}
for (let i = 0; i < 6; i++) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.12), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0x4a1418 : 0x222320, roughness: 0.75 }));
  box.position.set(-0.45 + (i % 3) * 0.28, 0.755 + Math.floor(i / 3) * 0.55, 0.02);
  box.rotation.y = rnd(-0.2, 0.2);
  shelf.add(box);
}

const bulbGroup = new THREE.Group();
bulbGroup.position.set(2.2, 0, 0.4);
room.add(bulbGroup);
const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.68, 6), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 }));
cord.position.y = 3.06;
bulbGroup.add(cord);
const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe0a8, toneMapped: false });
const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), bulbMat);
bulbMesh.position.y = 2.7;
bulbGroup.add(bulbMesh);
const bulbCap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.9 }));
bulbCap.position.y = 2.765;
bulbGroup.add(bulbCap);

const bulbLight = new THREE.PointLight(0xffd8a0, 16, 12, 2);
bulbLight.position.set(2.2, 2.66, 0.4);
room.add(bulbLight);

const tvLight = new THREE.PointLight(0x9fd4ff, 3.2, 7, 2);
tvLight.position.set(0, 1.5, -2.55);
room.add(tvLight);

const ambient = new THREE.AmbientLight(0x4a5466, 0.68);
scene.add(ambient);

const flashlight = new THREE.SpotLight(0xfff0dc, 36, 18, 0.47, 0.62, 1.55);
flashlight.position.set(0.16, -0.06, 0);
camera.add(flashlight);
const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, 0, -6);
camera.add(flashlightTarget);
flashlight.target = flashlightTarget;

const camFill = new THREE.PointLight(0x8899bb, 0.7, 3, 2);
camFill.position.set(0, -0.2, 0.2);
camera.add(camFill);

const doorPivot = new THREE.Group();
doorPivot.position.set(-0.63, 0, 4.43);
room.add(doorPivot);
const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.24, 2.28, 0.07), darkWoodMat);
doorMesh.position.set(0.62, 1.14, 0);
doorPivot.add(doorMesh);
const handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), metalMat);
handle.position.set(1.11, 1.06, -0.07);
doorPivot.add(handle);

const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.85 });
for (const x of [-0.71, 0.71]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.44, 0.18), doorFrameMat);
  post.position.set(x, 1.22, 4.45);
  room.add(post);
}
const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.14, 0.18), doorFrameMat);
lintel.position.set(0, 2.42, 4.45);
room.add(lintel);

const voidPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, 2.5),
  new THREE.MeshBasicMaterial({ map: makeTexture(voidCanvas()), toneMapped: false })
);
voidPlane.position.set(0, 1.25, 4.62);
voidPlane.rotation.y = Math.PI;
room.add(voidPlane);

const exitMat = new THREE.MeshBasicMaterial({ map: makeTexture(exitCanvas()), toneMapped: false, transparent: true });
const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.24), exitMat);
exitSign.position.set(0, 2.62, 4.44);
exitSign.rotation.y = Math.PI;
room.add(exitSign);

const doorLight = new THREE.PointLight(0xff2233, 0, 4, 2);
doorLight.position.set(0, 1.4, 4.15);
room.add(doorLight);

const DUST_COUNT = 360;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_COUNT * 3);
const dustSize = new Float32Array(DUST_COUNT);
for (let i = 0; i < DUST_COUNT; i++) {
  dustPos[i * 3] = rnd(-5.3, 5.3);
  dustPos[i * 3 + 1] = rnd(0.2, 3.2);
  dustPos[i * 3 + 2] = rnd(-4.3, 4.3);
  dustSize[i] = rnd(0.008, 0.026);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSize, 1));
const dustMat = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xaeb8b0) },
    uOpacity: { value: 0.42 },
    uScale: { value: 600 },
    uMax: { value: 7 },
  },
  vertexShader: [
    'attribute float aSize;',
    'uniform float uScale;',
    'uniform float uMax;',
    'varying float vDepth;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  vDepth = -mv.z;',
    '  gl_PointSize = clamp(aSize * uScale / max(0.25, vDepth), 1.0, uMax);',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform vec3 uColor;',
    'uniform float uOpacity;',
    'varying float vDepth;',
    'void main() {',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float d = length(p);',
    '  if (d > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.06, d) * uOpacity;',
    '  a *= smoothstep(0.5, 1.7, vDepth);',
    '  gl_FragColor = vec4(uColor, a);',
    '}',
  ].join('\n'),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const dust = new THREE.Points(dustGeo, dustMat);
scene.add(dust);
const dustView = new THREE.Vector2();
function syncDustScale() {
  renderer.getDrawingBufferSize(dustView);
  dustMat.uniforms.uScale.value = dustView.y * 0.5 / Math.tan(camera.fov * Math.PI / 360);
}
syncDustScale();

function buildEntity() {
  const group = new THREE.Group();
  const clothMat = new THREE.MeshBasicMaterial({ color: 0x030304 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0x24231f });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.42, 2.0, 8), clothMat);
  body.position.y = 1.0;
  group.add(body);
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), clothMat);
  shoulder.scale.set(1.3, 0.62, 0.95);
  shoulder.position.y = 1.9;
  group.add(shoulder);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.035, 1.5, 6), clothMat);
    arm.position.set(side * 0.37, 1.33, 0.02);
    arm.rotation.z = side * 0.13;
    arm.rotation.x = 0.06;
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.05), clothMat);
    hand.position.set(side * 0.43, 0.58, 0.03);
    hand.rotation.z = side * 0.1;
    group.add(hand);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skinMat);
  head.scale.set(0.8, 1.32, 0.92);
  head.position.y = 2.2;
  group.add(head);

  const faceGeo = new THREE.PlaneGeometry(0.38, 0.54, 14, 14);
  const facePos = faceGeo.attributes.position;
  for (let i = 0; i < facePos.count; i++) {
    const x = facePos.getX(i);
    const y = facePos.getY(i);
    facePos.setZ(i, -0.14 * (x / 0.19) ** 2 - 0.03 * (y / 0.27) ** 2);
  }
  faceGeo.computeVertexNormals();
  const faceTex = new THREE.CanvasTexture(entityFaceCanvas());
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const face = new THREE.Mesh(
    faceGeo,
    new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, toneMapped: false, alphaTest: 0.02, color: 0xb9bdb6 })
  );
  face.position.set(0, 2.2, 0.234);
  group.add(face);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf6ffe6, toneMapped: false });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), eyeMat);
    eye.position.set(side * 0.083, 2.251, 0.247);
    group.add(eye);
  }
  const eyeLight = new THREE.PointLight(0xffedc0, 0.3, 1.1, 2);
  eyeLight.position.set(0, 2.2, 0.56);
  group.add(eyeLight);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 1.25),
    new THREE.MeshBasicMaterial({ map: makeTexture(blobCanvas()), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);
  group.visible = false;
  group.userData = { eyeMat, eyeLight, head };
  return group;
}

const entity = buildEntity();
scene.add(entity);

const colliders = [
  { minX: -1.5, maxX: 1.5, minZ: -4.5, maxZ: -3.3 },
  { minX: 0.86, maxX: 1.52, minZ: -3.2, maxZ: -2.5 },
  { minX: 4.85, maxX: 5.5, minZ: 0.55, maxZ: 2.05 },
];

const tempDir = new THREE.Vector3();
const tempFwd = new THREE.Vector3();

function blocked(x, z) {
  if (x < -5.15 || x > 5.15 || z < -4.15 || z > 4.15) return true;
  for (const c of colliders) {
    if (x > c.minX - player.radius && x < c.maxX + player.radius && z > c.minZ - player.radius && z < c.maxZ + player.radius) return true;
  }
  return false;
}

function movePlayer(dx, dz) {
  if (!blocked(player.x + dx, player.z)) player.x += dx;
  else if (!blocked(player.x + dx * 0.4, player.z)) player.x += dx * 0.4;
  if (!blocked(player.x, player.z + dz)) player.z += dz;
  else if (!blocked(player.x, player.z + dz * 0.4)) player.z += dz * 0.4;
}

function forwardVector(out) {
  return out.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
}

function entityDistance() {
  return Math.hypot(entity.position.x - player.x, entity.position.z - player.z);
}

function resetEntityVisual() {
  entity.visible = false;
  entity.position.set(0, 0, -3.2);
  entity.scale.setScalar(1);
  entity.userData.eyeMat.color.setHex(0xf6ffe6);
  entity.userData.eyeLight.intensity = 1.2;
}

function setHint(text, urgent = false) {
  if (state.hintKey === text) return;
  state.hintKey = text;
  if (!text) {
    dom.hint.classList.add('hidden');
    return;
  }
  dom.hintText.textContent = text;
  dom.hint.classList.toggle('urgent', urgent);
  dom.hint.classList.remove('hidden');
}

function setSubtitle(text) {
  if (state.subtitleKey === text) return;
  state.subtitleKey = text;
  if (!text) {
    dom.subtitle.classList.add('hidden');
    return;
  }
  dom.subtitleText.textContent = text;
  dom.subtitle.classList.remove('hidden');
}

function showInteract(label, sub) {
  dom.interactLabel.textContent = label;
  dom.interactSub.textContent = sub;
  dom.interact.classList.remove('hidden');
  dom.interact.classList.add('pulse');
}

function hideInteract() {
  dom.interact.classList.add('hidden');
  dom.interact.classList.remove('pulse');
}

function flashScreen(color = 'white', ms = 140) {
  dom.flash.classList.toggle('red', color === 'red');
  dom.flash.classList.add('on');
  setTimeout(() => dom.flash.classList.remove('on'), ms);
}

function showEnd(dead) {
  document.body.classList.remove('playing');
  document.body.classList.add('ended');
  dom.endInner.classList.toggle('dead', dead);
  dom.endKicker.textContent = dead ? 'SIGNAL LOST // 1998' : 'SIGNAL LOST // ESCAPED';
  dom.endTitle.textContent = dead ? 'لقد رآك.' : 'نجوت… هذه المرة.';
  dom.endText.textContent = dead
    ? 'لم تغادر الغرفة. الشريط يعرضك الآن على شبكة لا تنام.'
    : 'أغلقت الباب خلفك، لكن الشريط ما زال يعمل في مكان ما.';
  dom.statTime.textContent = formatTime(state.elapsed);
  dom.statViews.textContent = dead ? '2' : '1';
  dom.end.classList.remove('hidden');
  hideInteract();
  setHint('');
  setSubtitle('');
  dom.blackout.style.opacity = '0';
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startGame() {
  audio.init();
  audio.ui();
  if (state.attempts === 0) state.elapsed = 0;
  state.attempts += 1;
  state.name = 'explore';
  document.body.classList.add('playing');
  document.body.classList.remove('locked', 'ended');
  dom.title.classList.add('hidden');
  dom.end.classList.add('hidden');
  dom.blackout.style.opacity = '1';
  requestAnimationFrame(() => { dom.blackout.style.opacity = '0'; });
  setHint('اقترب من التلفاز. اضغط «تفاعل» لتشغيل الشريط.');
  video.setMode('static');
  audio.reset();
  audio.setStatic(0.22);
  audio.setAmbient(0.6);
  state.elapsed = 0;
  state.lastWhisper = 0;
}

function resetGame() {
  state.name = 'explore';
  state.videoTime = 0;
  state.scareTime = 0;
  state.chaseTime = 0;
  state.elapsed = 0;
  state.shake = 0;
  state.doorOpen = 0;
  state.seenEntity = false;
  state.hintKey = '';
  state.subtitleKey = '';
  player.x = 0;
  player.z = 2.2;
  player.yaw = 0;
  player.pitch = 0;
  player.eye = 1.62;
  player.bob = 0;
  player.step = 0;
  entity.visible = false;
  resetEntityVisual();
  doorPivot.rotation.y = 0;
  exitMat.color.setScalar(0.32);
  doorLight.intensity = 0;
  bulbLight.intensity = 16;
  bulbMat.color.setHex(0xffe0a8);
  video.setMode('static');
  audio.reset();
  audio.setStatic(0.22);
  audio.setAmbient(0.6);
  dom.end.classList.add('hidden');
  dom.endInner.classList.remove('dead');
  document.body.classList.add('playing');
  document.body.classList.remove('locked', 'ended');
  dom.blackout.style.opacity = '0';
  setSubtitle('');
  setHint('اقترب من التلفاز. اضغط «تفاعل» لتشغيل الشريط.');
  state.attempts += 1;
}

function startWatching() {
  state.name = 'watching';
  state.videoTime = 0;
  state.subtitleKey = '';
  document.body.classList.add('locked');
  hideInteract();
  setHint('');
  video.setMode('static');
  audio.setStatic(0.5);
  audio.setAmbient(0.42, 0.25);
  state.videoYaw = 0;
  state.videoPitch = -0.14;
}

function triggerScare() {
  state.name = 'scare';
  state.scareTime = 0;
  setSubtitle('');
  const backX = Math.sin(player.yaw);
  const backZ = Math.cos(player.yaw);
  entity.position.set(clamp(player.x + backX * 1.45, -4.6, 4.6), 0, clamp(player.z + backZ * 1.45, -3.9, 3.9));
  entity.visible = true;
  entity.lookAt(player.x, 0, player.z);
  const ex = entity.position.x - player.x;
  const ez = entity.position.z - player.z;
  player.yaw = Math.atan2(-ex, -ez);
  player.pitch = 0.34;
  state.shake = 1.25;
  audio.scare();
  audio.setStatic(0.15);
  video.setMode('static');
  flashScreen('red', 190);
  dom.interact.classList.add('hidden');
}

function prepareChase() {
  state.name = 'chase';
  state.chaseTime = 0;
  state.shake = 0;
  entity.visible = true;
  entity.position.set(3.3, 0, -3.35);
  entity.lookAt(player.x, 0, player.z);
  player.yaw = Math.PI;
  player.pitch = 0;
  player.eye = 1.62;
  state.doorOpen = 0;
  exitMat.color.setScalar(1);
  doorLight.intensity = 5;
  bulbLight.intensity = 0;
  bulbMat.color.setHex(0x0a0806);
  audio.startHeartbeat(0.95);
  audio.setTension(0.7);
  audio.setStatic(0.2);
  audio.whisper();
  document.body.classList.remove('locked');
  setHint('اهرب من الباب! لا تدع الشريط ينتهي.', true);
  dom.blackout.style.opacity = '0';
  video.setMode('static');
}

function triggerDeath() {
  if (state.name !== 'chase') return;
  state.name = 'death';
  state.endTime = 0;
  state.shake = 1.6;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  entity.position.set(clamp(player.x + fx * 1.25, -5, 5), 0, clamp(player.z + fz * 1.25, -4, 4));
  entity.lookAt(player.x, 0, player.z);
  const dx = entity.position.x - player.x;
  const dz = entity.position.z - player.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = 0.38;
  audio.stopHeartbeat();
  audio.scare();
  flashScreen('red', 260);
  document.body.classList.add('locked');
  hideInteract();
  setHint('');
  setSubtitle('');
}

function escapeDoor() {
  if (state.name !== 'chase') return;
  state.name = 'won';
  state.endTime = 0;
  audio.stopHeartbeat();
  audio.doorCreak();
  audio.setStatic(0);
  doorLight.intensity = 9;
  document.body.classList.add('locked');
  hideInteract();
  setHint('');
  setSubtitle('');
  flashScreen('red', 150);
}

function nearTV() {
  return Math.hypot(player.x - 0, player.z + 3.6) < 2.95;
}

function nearDoor() {
  return Math.hypot(player.x - 0, player.z - 4.2) < 1.95;
}

function interact() {
  if (state.name === 'explore' && nearTV()) startWatching();
  else if (state.name === 'chase' && nearDoor()) escapeDoor();
}

function updateInteraction() {
  state.nearTV = nearTV();
  state.nearDoor = nearDoor();
  if (state.name === 'explore') {
    if (state.nearTV) {
      showInteract('شغّل', 'الشريط');
      setHint('اضغط «تفاعل» لمشاهدة الشريط.', true);
    } else {
      hideInteract();
      setHint('اقترب من التلفاز في نهاية الغرفة.');
    }
  } else if (state.name === 'chase') {
    if (state.nearDoor) {
      showInteract('اهرب', 'المخرج');
      setHint('اضغط «تفاعل» واخرج من الغرفة!', true);
    } else {
      hideInteract();
      if (state.seenEntity) setHint('إنه يتجمد ما دمت تنظر إليه… لكن الباب خلفك.', true);
      else setHint(entityDistance() < 3 ? 'إنه قريب. لا تتوقف!' : 'اتجه نحو الباب في نهاية الغرفة.', true);
    }
  } else {
    hideInteract();
  }
}

function updatePlayer(dt) {
  let moveX = 0;
  let moveZ = 0;
  if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

  moveX += joy.x;
  moveZ += joy.y;

  const len = Math.hypot(moveX, moveZ);
  player.moving = len > 0.16;
  if (player.moving) {
    const norm = Math.min(1, len);
    moveX = (moveX / len) * norm;
    moveZ = (moveZ / len) * norm;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const rx = Math.cos(player.yaw);
    const rz = -Math.sin(player.yaw);
    const speed = player.speed * (state.name === 'chase' ? 1.08 : 1);
    const dx = (fx * -moveZ + rx * moveX) * speed * dt;
    const dz = (fz * -moveZ + rz * moveX) * speed * dt;
    movePlayer(dx, dz);
    player.bob += dt * 9 * Math.min(1, len);
    player.step -= dt;
    if (player.step <= 0) {
      audio.footstep();
      player.step = 0.46;
    }
  } else {
    player.bob += dt * 1.2;
  }
}

function updateWatching(dt) {
  state.videoTime += dt;
  const portrait = window.innerHeight > window.innerWidth;
  player.x = damp(player.x, 0, 3.2, dt);
  player.z = damp(player.z, portrait ? -2.5 : -2.05, 3.2, dt);
  player.eye = damp(player.eye, 1.42, 3.2, dt);
  player.yaw = damp(player.yaw, 0, 7, dt);
  player.pitch = damp(player.pitch, portrait ? -0.2 : -0.14, 7, dt);

  if (state.videoTime > 0.85 && video.mode === 'static') {
    video.setMode('playing');
    audio.setStatic(0.22);
    audio.whisper();
  }

  const lines = [
    { t: 1.2, text: 'جارٍ الاتصال بالشبكة المظلمة…' },
    { t: 3.4, text: 'بث مباشر من غرفة مجهولة.' },
    { t: 5.8, text: 'هناك من يراقب هذا البث.' },
    { t: 7.8, text: 'لا تنظر خلفك.' },
  ];
  let line = '';
  for (const l of lines) if (state.videoTime >= l.t) line = l.text;
  setSubtitle(line);

  if (state.videoTime > 4 && Math.random() < dt * 0.9) audio.glitch();

  if (state.videoTime > 10.2) triggerScare();
}

function updateScare(dt) {
  state.scareTime += dt;
  const dx = entity.position.x - player.x;
  const dz = entity.position.z - player.z;
  player.yaw = damp(player.yaw, Math.atan2(-dx, -dz), 12, dt);
  player.pitch = damp(player.pitch, 0.34, 9, dt);
  entity.userData.eyeMat.color.setRGB(1, 0.9 + Math.random() * 0.1, 0.8);
  if (state.scareTime > 1.15 && state.scareTime < 1.25) {
    dom.blackout.style.opacity = '1';
    entity.userData.eyeLight.intensity = 3;
    flashScreen('red', 120);
  }
  if (state.scareTime > 1.65) prepareChase();
}

function updateChase(dt) {
  state.chaseTime += dt;
  const dx = player.x - entity.position.x;
  const dz = player.z - entity.position.z;
  const dist = Math.hypot(dx, dz);

  forwardVector(tempFwd);
  tempDir.set(entity.position.x - player.x, 0, entity.position.z - player.z);
  const dot = tempDir.lengthSq() > 0.0001 ? tempDir.normalize().dot(tempFwd) : -1;
  const seen = dot > 0.42 && dist < 13 && Math.abs(entity.position.z) < 5;

  state.seenEntity = seen;
  entity.lookAt(player.x, 0, player.z);
  if (seen) {
    entity.userData.eyeMat.color.setHex(0xfffbe8);
    entity.userData.eyeLight.intensity = 2.2;
    if (Math.random() < dt * 1.6) audio.whisper();
  } else {
    entity.userData.eyeMat.color.setHex(0xd8ffd0);
    entity.userData.eyeLight.intensity = 1.1;
    const speed = 1.95 + Math.min(0.9, state.chaseTime * 0.045);
    entity.position.x += (dx / Math.max(dist, 0.001)) * speed * dt;
    entity.position.z += (dz / Math.max(dist, 0.001)) * speed * dt;
    entity.position.y = Math.abs(Math.sin(state.chaseTime * 5.4)) * 0.035;
  }

  const tension = clamp(1 - (dist - 1) / 6.5, 0, 1);
  audio.setTension(Math.max(0.7, tension));

  if (state.chaseTime - state.lastWhisper > rnd(5, 9)) {
    state.lastWhisper = state.chaseTime;
    audio.whisper();
  }

  if (dist < 1.02) {
    triggerDeath();
    return;
  }

  if (state.nearDoor && dist < 4.2 && Math.random() < dt * 0.14) audio.glitch();
}

function updateDeath(dt) {
  state.endTime += dt;
  const dx = entity.position.x - player.x;
  const dz = entity.position.z - player.z;
  player.yaw = damp(player.yaw, Math.atan2(-dx, -dz), 14, dt);
  player.pitch = damp(player.pitch, 0.38, 12, dt);
  if (state.endTime > 1.25 && state.endTime < 1.4) dom.blackout.style.opacity = '1';
  if (state.endTime > 1.9 && dom.end.classList.contains('hidden')) {
    showEnd(true);
  }
}

function updateWon(dt) {
  state.endTime += dt;
  player.x = damp(player.x, 0, 2.2, dt);
  player.z = damp(player.z, 4.0, 2.2, dt);
  player.yaw = damp(player.yaw, Math.PI, 3, dt);
  player.pitch = damp(player.pitch, 0, 3, dt);
  doorPivot.rotation.y = damp(doorPivot.rotation.y, 1.42, 4, dt);
  doorLight.intensity = 6 + Math.sin(state.endTime * 20) * 2;
  if (state.endTime > 1.5 && dom.end.classList.contains('hidden')) dom.blackout.style.opacity = '1';
  if (state.endTime > 2.1 && dom.end.classList.contains('hidden')) {
    showEnd(false);
  }
}

function updateEntityVisuals(dt) {
  if (!entity.visible) return;
  if (state.name === 'chase') {
    entity.position.y = Math.abs(Math.sin(state.chaseTime * 5.4)) * 0.035;
  }
  entity.scale.y = 1 + Math.sin(performance.now() * 0.003) * 0.012;
}

function updateDust(dt) {
  const pos = dust.geometry.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] += dt * 0.035;
    pos[i] += Math.sin((performance.now() * 0.0002) + i) * dt * 0.01;
    if (pos[i + 1] > 3.3) pos[i + 1] = 0.1;
  }
  dust.geometry.attributes.position.needsUpdate = true;
}

function updateLights(dt) {
  const t = performance.now() * 0.001;
  let flicker = 0.85 + Math.sin(t * 13.7) * 0.05 + Math.random() * 0.06;
  if (state.name === 'watching') {
    const dim = clamp(1 - state.videoTime / 9.5, 0.08, 1);
    bulbLight.intensity = 16 * dim * flicker;
    bulbMat.color.setHex(0xffe0a8).multiplyScalar(dim);
  } else if (state.name === 'chase' || state.name === 'death' || state.name === 'won') {
    bulbLight.intensity = 0;
  } else {
    bulbLight.intensity = 16 * flicker;
    bulbMat.color.setHex(0xffe0a8);
  }

  if (state.name === 'chase' || state.name === 'death') {
    tvLight.intensity = 3 + Math.random() * 7;
    flashlight.intensity = (30 + Math.random() * 22) * (state.name === 'chase' ? 1 : 1.4);
  } else {
    tvLight.intensity = 2.5 + video.flicker * 13;
    flashlight.intensity = 34 * (0.92 + Math.random() * 0.08);
  }

  exitMat.color.setScalar(state.name === 'chase' || state.name === 'won' ? 1 : 0.3);
  if (state.name === 'chase' || state.name === 'won') {
    doorLight.intensity = lerp(doorLight.intensity, 5 + Math.sin(t * 9) * 1.5, 0.1);
  }
}

function updateCamera(dt) {
  let bobY = 0;
  let roll = 0;
  let shakeX = 0;
  let shakeY = 0;
  let shakeRoll = 0;

  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 1.9);
    const s = state.shake * state.shake;
    shakeX = rnd(-1, 1) * s * 0.05;
    shakeY = rnd(-1, 1) * s * 0.04;
    shakeRoll = rnd(-1, 1) * s * 0.04;
  }

  if (player.moving && state.name !== 'watching') {
    bobY = Math.sin(player.bob) * 0.036;
    roll = Math.sin(player.bob * 0.5) * 0.006;
  } else {
    bobY = Math.sin(player.bob) * 0.008;
  }

  if (state.name === 'title') {
    player.yaw = Math.sin(performance.now() * 0.00016) * 0.055;
    player.pitch = -0.02;
  }

  camera.position.set(player.x + shakeX, player.eye + bobY + shakeY, player.z);
  camera.rotation.set(player.pitch + shakeX * 0.4, player.yaw + shakeY * 0.4, roll + shakeRoll);
  camera.rotation.order = 'YXZ';
}

const keys = {};
const joy = { x: 0, y: 0, active: false, id: null };

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyE') interact();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

dom.canvas.addEventListener('pointerdown', (e) => {
  if (state.name === 'title' || state.name === 'death' || state.name === 'won') return;
  if (look.id !== null) return;
  look.id = e.pointerId;
  look.x = e.clientX;
  look.y = e.clientY;
  dom.canvas.setPointerCapture(e.pointerId);
});
dom.canvas.addEventListener('pointermove', (e) => {
  if (look.id !== e.pointerId) return;
  const dx = e.clientX - look.x;
  const dy = e.clientY - look.y;
  look.x = e.clientX;
  look.y = e.clientY;
  const sens = isTouch ? 0.0042 : 0.0026;
  player.yaw -= dx * sens;
  player.pitch = clamp(player.pitch - dy * sens, -1.2, 1.2);
});
function endLook(e) {
  if (look.id === e.pointerId) look.id = null;
}
dom.canvas.addEventListener('pointerup', endLook);
dom.canvas.addEventListener('pointercancel', endLook);
const look = { id: null, x: 0, y: 0 };

function updateJoy(e) {
  const rect = dom.joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = rect.width * 0.34;
  const len = Math.hypot(dx, dy);
  if (len > max) {
    dx = (dx / len) * max;
    dy = (dy / len) * max;
  }
  dom.stick.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / max;
  joy.y = dy / max;
}

dom.joystick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  joy.active = true;
  joy.id = e.pointerId;
  dom.joystick.setPointerCapture(e.pointerId);
  updateJoy(e);
});
dom.joystick.addEventListener('pointermove', (e) => {
  if (!joy.active || joy.id !== e.pointerId) return;
  e.preventDefault();
  updateJoy(e);
});
function releaseJoy(e) {
  if (joy.id !== e.pointerId) return;
  joy.active = false;
  joy.id = null;
  joy.x = 0;
  joy.y = 0;
  dom.stick.style.transform = 'translate(0px, 0px)';
}
dom.joystick.addEventListener('pointerup', releaseJoy);
dom.joystick.addEventListener('pointercancel', releaseJoy);

dom.interact.addEventListener('click', (e) => {
  e.preventDefault();
  interact();
});
dom.interact.addEventListener('pointerdown', (e) => e.stopPropagation());

dom.start.addEventListener('click', startGame);
dom.retry.addEventListener('click', () => {
  audio.ui();
  resetGame();
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.8 : 2));
  renderer.setSize(w, h);
  syncDustScale();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
});

function tick(now) {
  window.__game = { state, player, entity, renderer, camera, video, audio, debug: { startWatching, triggerScare, prepareChase, triggerDeath, escapeDoor, showEnd, resetGame } };
requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0.0001, (now - lastTime) / 1000));
  lastTime = now;

  if (state.name !== 'title') state.elapsed += dt;

  if (state.name === 'explore' || state.name === 'chase') updatePlayer(dt);
  if (state.name === 'watching') updateWatching(dt);
  if (state.name === 'scare') updateScare(dt);
  if (state.name === 'chase') updateChase(dt);
  if (state.name === 'death') updateDeath(dt);
  if (state.name === 'won') updateWon(dt);
  if (state.name !== 'title') updateInteraction();

  updateEntityVisuals(dt);
  updateDust(dt);
  updateLights(dt);
  updateCamera(dt);
  video.update(dt);

  dom.hudTime.textContent = formatTime(state.elapsed);
  renderer.render(scene, camera);
}

let lastTime = performance.now();

resetEntityVisual();
video.setMode('static');
audio.setAmbient(0.55);
dom.hint.classList.add('hidden');
exitMat.color.setScalar(0.3);
window.__game = { state, player, entity, renderer, camera, video, audio, debug: { startWatching, triggerScare, prepareChase, triggerDeath, escapeDoor, showEnd, resetGame } };
requestAnimationFrame(tick);
