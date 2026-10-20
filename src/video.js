const TAU = Math.PI * 2;

function rand(a, b) { return a + Math.random() * (b - a); }

export class DarkVideo {
  constructor(THREE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.mode = 'off';
    this.t = 0;
    this.acc = 0;
    this.staticFrames = [];
    this.staticIndex = 0;
    this.flicker = 0.12;
    this.buildStaticFrames();
    this.draw();
  }

  buildStaticFrames() {
    for (let n = 0; n < 6; n++) {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 240;
      const g = c.getContext('2d');
      const img = g.createImageData(320, 240);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (let y = 0; y < 240; y += 4) g.fillRect(0, y, 320, 2);
      this.staticFrames.push(c);
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.t = 0;
    this.acc = 0;
    if (mode === 'off') this.flicker = 0.05;
    if (mode === 'static') this.flicker = 0.35;
  }

  update(dt) {
    this.t += dt;
    this.acc += dt;
    const step = this.mode === 'static' ? 1 / 18 : 1 / 24;
    if (this.acc >= step) {
      this.acc = 0;
      this.draw();
      this.texture.needsUpdate = true;
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.mode === 'off') this.drawOff(ctx);
    else if (this.mode === 'static') this.drawStatic(ctx);
    else this.drawPlaying(ctx, this.t);
    ctx.restore();
  }

  drawOff(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, '#0a0b0d');
    g.addColorStop(0.55, '#050607');
    g.addColorStop(1, '#0b0d10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 240);
    const r = ctx.createRadialGradient(130, 90, 8, 160, 120, 190);
    r.addColorStop(0, 'rgba(120, 150, 160, 0.07)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fillRect(0, 200, 320, 1);
    this.flicker = 0.05;
  }

  drawStatic(ctx) {
    this.staticIndex = (this.staticIndex + 1) % this.staticFrames.length;
    ctx.drawImage(this.staticFrames[this.staticIndex], 0, 0);
    const roll = (this.t * 190) % 320;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, roll, 320, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = (this.t * 37) % 4; y < 240; y += 4) ctx.fillRect(0, y, 320, 1);
    this.flicker = 0.3 + Math.random() * 0.22;
  }

  drawPlaying(ctx, t) {
    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, 320, 240);

    if (t < 2.2) {
      this.drawTerminal(ctx, t);
      this.flicker = 0.14 + Math.random() * 0.08;
    } else {
      const local = t - 2.2;
      this.drawRoom(ctx, local, t);
      if (local > 2.8) this.drawFace(ctx, local - 2.8);
      this.drawVhsHud(ctx, t);
      this.flicker = 0.32 + Math.random() * 0.2 + (local > 2.8 ? 0.15 : 0);
    }

    if (t > 7.6 && t < 9.2) {
      this.drawGlitch(ctx, t, 0.7);
    }
    this.drawScanlines(ctx);
  }

  drawTerminal(ctx, t) {
    ctx.fillStyle = '#020403';
    ctx.fillRect(0, 0, 320, 240);
    ctx.font = '11px monospace';
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    const lines = [
      '> ESTABLISHING TUNNEL...',
      '> ROUTING VIA 7 NODES',
      '> NODE 0x7F ........ OK',
      '> STREAM FOUND: tape_1998.mov',
      '> WARNING: DO NOT WATCH ALONE',
      '> DECRYPTING...',
    ];
    const shown = Math.min(lines.length, Math.floor(t * 4));
    for (let i = 0; i < shown; i++) {
      const age = t * 4 - i;
      const alpha = Math.min(1, age);
      ctx.fillStyle = `rgba(130, 255, 190, ${0.5 * alpha})`;
      ctx.fillText(lines[i], 20, 50 + i * 21);
    }
    if (Math.floor(t * 6) % 2 === 0) {
      ctx.fillStyle = 'rgba(130, 255, 190, 0.85)';
      ctx.fillRect(20, 176 + 0, 7, 12);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < 240; y += 4) ctx.fillRect(0, y, 320, 1);
    if (t > 1.5) this.drawSignalBars(ctx, t);
  }

  drawSignalBars(ctx, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 320, 240);
    const src = this.staticFrames[Math.floor(t * 14) % this.staticFrames.length];
    ctx.globalAlpha = 0.35;
    ctx.drawImage(src, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(130, 255, 190, 0.75)';
    ctx.font = '9px monospace';
    ctx.fillText('CONNECTING  ██████████░░  87%', 84, 118);
  }

  drawRoom(ctx, local, t) {
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, '#252b2c');
    g.addColorStop(0.55, '#141718');
    g.addColorStop(1, '#080909');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 240);

    const flick = 0.55 + Math.sin(t * 11.3) * 0.16 + (Math.random() < 0.08 ? -0.35 : 0);

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#2b3132';
    ctx.beginPath();
    ctx.moveTo(0, 240);
    ctx.lineTo(0, 78);
    ctx.lineTo(320, 78);
    ctx.lineTo(320, 240);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#121617';
    ctx.fillRect(58, 58, 74, 130);

    const doorG = ctx.createLinearGradient(58, 58, 132, 188);
    doorG.addColorStop(0, `rgba(90, 105, 100, ${0.12 * flick})`);
    doorG.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = doorG;
    ctx.fillRect(62, 62, 66, 122);

    const bulbX = 218;
    const bulbY = 46 + Math.sin(t * 7) * 2;
    ctx.strokeStyle = 'rgba(160, 165, 150, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bulbX, 0);
    ctx.lineTo(bulbX, bulbY);
    ctx.stroke();
    const glow = ctx.createRadialGradient(bulbX, bulbY, 1, bulbX, bulbY, 62);
    glow.addColorStop(0, `rgba(255, 226, 160, ${0.85 * flick})`);
    glow.addColorStop(0.25, `rgba(255, 200, 120, ${0.2 * flick})`);
    glow.addColorStop(1, 'rgba(255, 190, 100, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(bulbX - 70, bulbY - 70, 140, 140);
    ctx.fillStyle = `rgba(255, 238, 200, ${flick})`;
    ctx.beginPath();
    ctx.arc(bulbX, bulbY, 3.1, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 198, 320, 42);

    ctx.fillStyle = '#070909';
    ctx.fillRect(150, 150, 52, 68);
    ctx.fillRect(142, 216, 68, 6);
    ctx.fillRect(158, 140, 36, 12);
    ctx.fillStyle = 'rgba(60, 70, 68, 0.5)';
    ctx.fillRect(152, 152, 48, 2);

    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 198);
    ctx.lineTo(320, 198);
    ctx.stroke();

    for (let i = 0; i < 26; i++) {
      const x = (i * 71 + t * 9) % 320;
      const y = (i * 43 + Math.sin(t + i) * 20) % 240;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, 1, 1);
    }

    if (local > 1.4) {
      const eyeGlow = Math.min(1, (local - 1.4) / 1.4);
      ctx.save();
      ctx.globalAlpha = 0.75 * eyeGlow;
      ctx.fillStyle = '#dff7ee';
      ctx.beginPath();
      ctx.arc(88, 120, 2.1, 0, TAU);
      ctx.arc(104, 120, 2.1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (local > 3.2) {
      this.drawMessage(ctx, local);
    }

    if (local > 5.2) {
      const vig = ctx.createRadialGradient(160, 110, 30, 160, 120, 170);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, 320, 240);
    }
  }

  drawMessage(ctx, local) {
    const alpha = Math.min(0.85, (local - 3.2) * 0.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px "Noto Sans Arabic", Tahoma, sans-serif';
    ctx.fillStyle = 'rgba(255, 60, 80, 0.9)';
    ctx.fillText('هناك من يراقب', 160, 216);
    ctx.restore();
  }

  drawFace(ctx, local) {
    const grow = Math.min(1, local / 3.0);
    const scale = 0.9 + grow * 2.1;
    const cx = 118 + Math.sin(local * 1.3) * 3;
    const cy = 108 - grow * 8;
    const w = 24 * scale;
    const h = 31 * scale;
    const alpha = Math.min(0.97, 0.3 + grow * 1.1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(local * 0.7) * 0.035);

    ctx.fillStyle = '#040404';
    ctx.beginPath();
    ctx.moveTo(-w * 1.8, h * 3.1);
    ctx.quadraticCurveTo(-w * 1.1, h * 1.05, 0, h * 1.03);
    ctx.quadraticCurveTo(w * 1.1, h * 1.05, w * 1.8, h * 3.1);
    ctx.closePath();
    ctx.fill();

    const halo = ctx.createRadialGradient(0, 0, w * 0.3, 0, 0, w * 3.1);
    halo.addColorStop(0, 'rgba(130, 150, 135, 0.18)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-w * 3, -h * 3, w * 6, h * 6);

    const skin = ctx.createRadialGradient(-w * 0.25, -h * 0.35, w * 0.1, 0, 0, w * 1.25);
    skin.addColorStop(0, '#b9b3a2');
    skin.addColorStop(0.45, '#8a8579');
    skin.addColorStop(0.8, '#4b4942');
    skin.addColorStop(1, '#141412');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-w * 0.8, -h * 0.62);
    ctx.bezierCurveTo(-w * 0.9, -h * 1.05, w * 0.9, -h * 1.08, w * 0.8, -h * 0.62);
    ctx.bezierCurveTo(w * 0.75, h * 0.1, w * 0.5, h * 0.58, 0, h * 0.78);
    ctx.bezierCurveTo(-w * 0.5, h * 0.58, -w * 0.75, h * 0.1, -w * 0.8, -h * 0.62);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 130; i++) {
      const v = rand(0, 60);
      ctx.fillStyle = `rgba(${v + 10},${v + 8},${v},${rand(0.04, 0.16)})`;
      ctx.beginPath();
      ctx.ellipse(rand(-w, w), rand(-h, h), rand(0.5, w * 0.08), rand(0.5, h * 0.05), rand(0, 3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const cheekL = ctx.createRadialGradient(-w * 0.5, h * 0.1, 1, -w * 0.5, h * 0.1, w * 0.45);
    cheekL.addColorStop(0, 'rgba(16, 15, 12, 0.5)');
    cheekL.addColorStop(1, 'rgba(16, 15, 12, 0)');
    ctx.fillStyle = cheekL;
    ctx.fillRect(-w, -h * 0.3, w * 0.9, h * 0.9);
    const cheekR = ctx.createRadialGradient(w * 0.5, h * 0.1, 1, w * 0.5, h * 0.1, w * 0.45);
    cheekR.addColorStop(0, 'rgba(16, 15, 12, 0.5)');
    cheekR.addColorStop(1, 'rgba(16, 15, 12, 0)');
    ctx.fillStyle = cheekR;
    ctx.fillRect(w * 0.1, -h * 0.3, w * 0.9, h * 0.9);

    ctx.strokeStyle = 'rgba(28, 25, 21, 0.5)';
    ctx.lineWidth = Math.max(0.6, w * 0.035);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.4 + i * w * 0.26, -h * 0.86);
      ctx.bezierCurveTo(-w * 0.32 + i * w * 0.24, -h * 0.76, -w * 0.34 + i * w * 0.24, -h * 0.7, -w * 0.4 + i * w * 0.26, -h * 0.64);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(3, 3, 3, 0.96)';
    ctx.beginPath();
    ctx.moveTo(-w * 0.7, -h * 0.24);
    ctx.bezierCurveTo(-w * 0.68, -h * 0.62, -w * 0.16, -h * 0.65, -w * 0.11, -h * 0.28);
    ctx.bezierCurveTo(-w * 0.14, h * 0.02, -w * 0.55, h * 0.02, -w * 0.7, -h * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.7, -h * 0.24);
    ctx.bezierCurveTo(w * 0.68, -h * 0.62, w * 0.16, -h * 0.65, w * 0.11, -h * 0.28);
    ctx.bezierCurveTo(w * 0.14, h * 0.02, w * 0.55, h * 0.02, w * 0.7, -h * 0.24);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(232, 255, 218, 0.9)';
    ctx.shadowBlur = 11;
    ctx.fillStyle = '#f2ffe4';
    ctx.beginPath();
    ctx.arc(-w * 0.4, -h * 0.28, Math.max(1.2, w * 0.045), 0, TAU);
    ctx.arc(w * 0.42, -h * 0.31, Math.max(1.1, w * 0.04), 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(24, 21, 18, 0.6)';
    ctx.lineWidth = Math.max(0.8, w * 0.045);
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, -h * 0.14);
    ctx.bezierCurveTo(-w * 0.1, h * 0.1, -w * 0.11, h * 0.24, -w * 0.18, h * 0.34);
    ctx.bezierCurveTo(-w * 0.06, h * 0.38, w * 0.08, h * 0.36, w * 0.14, h * 0.31);
    ctx.stroke();

    const mouthTop = h * 0.46;
    const mouthH = h * (0.25 + grow * 0.12);
    ctx.fillStyle = 'rgba(2, 1, 1, 0.98)';
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, mouthTop);
    ctx.bezierCurveTo(-w * 0.44, mouthTop - h * 0.1, w * 0.44, mouthTop - h * 0.1, w * 0.4, mouthTop);
    ctx.bezierCurveTo(w * 0.38, mouthTop + mouthH, -w * 0.38, mouthTop + mouthH, -w * 0.4, mouthTop);
    ctx.closePath();
    ctx.fill();

    const teeth = [
      [-0.28, 0.5, 0.11, 0.11, -0.12],
      [-0.12, 0.49, 0.09, 0.14, 0.06],
      [0.04, 0.49, 0.12, 0.12, -0.04],
      [0.22, 0.5, 0.08, 0.1, 0.1],
      [-0.02, 0.68, 0.09, 0.08, 0.03],
    ];
    for (let i = 0; i < teeth.length; i++) {
      const [x, y, tw, th, tilt] = teeth[i];
      ctx.save();
      ctx.translate(w * x, h * y);
      ctx.rotate(tilt);
      ctx.fillStyle = i % 2 ? 'rgba(116, 108, 90, 0.9)' : 'rgba(156, 147, 124, 0.9)';
      ctx.fillRect(-w * tw / 2, 0, w * tw, h * th * 0.4);
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(5, 4, 4, 0.55)';
    for (let i = 0; i < 7; i++) {
      ctx.lineWidth = rand(0.5, 1.6);
      ctx.beginPath();
      let x = rand(-w * 0.6, w * 0.6);
      let y = rand(-h * 0.4, h * 0.6);
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += rand(-w * 0.08, w * 0.08);
        y += rand(-h * 0.06, h * 0.06);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(4, 4, 4, 0.9)';
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const sx = side * rand(w * 0.7, w * 1.2);
      const sy = -h * rand(0.7, 1.0);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + rand(-w * 0.2, w * 0.2), sy + h * 0.7, sx + rand(-w * 0.3, w * 0.3), sy + h * rand(1.2, 1.8));
      ctx.lineWidth = rand(1, w * 0.1);
      ctx.strokeStyle = 'rgba(3, 3, 3, 0.9)';
      ctx.stroke();
    }

    ctx.restore();
  }

  drawVhsHud(ctx, t) {
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(235, 240, 230, 0.72)';
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    ctx.fillText(`00:${mm}:${ss}`, 10, 16);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 50, 65, 0.9)';
    ctx.beginPath();
    ctx.arc(270, 12, 2.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(235, 240, 230, 0.72)';
    ctx.fillText('LIVE', 278, 16);
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(180, 220, 200, 0.45)';
    ctx.fillText('the_tape_1998  //  viewers: 1', 310, 230);
    ctx.restore();
  }

  drawGlitch(ctx, t, strength) {
    if (Math.random() > 0.86) return;
    const slices = 10;
    for (let i = 0; i < slices; i++) {
      const y = Math.random() * 240;
      const h = rand(2, 14);
      const off = rand(-18, 18) * strength;
      ctx.drawImage(this.canvas, 0, y, 320, h, off, y, 320, h);
    }
    ctx.fillStyle = `rgba(255, 0, 40, ${0.05 + Math.random() * 0.08})`;
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
    ctx.fillRect(0, 0, 320, 240);
  }

  drawScanlines(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < 240; y += 3) ctx.fillRect(0, y, 320, 1);
    const vig = ctx.createRadialGradient(160, 120, 80, 160, 120, 210);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, 320, 240);
  }
}
