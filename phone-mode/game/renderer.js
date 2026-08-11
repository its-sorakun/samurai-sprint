/**
 * Renderer Module
 * Handles the canvas background, parallax scrolling, and particle effects.
 * Japanese landscape: mountains, bamboo forest, ground, cherry blossoms.
 */

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();

    // Parallax layers offset
    this.bgOffset = 0;
    this.midOffset = 0;
    this.fgOffset = 0;
    this.groundOffset = 0;

    // Cherry blossom particles
    this.petals = [];
    for (let i = 0; i < 25; i++) {
      this.petals.push(this._createPetal());
    }

    // Stars
    this.stars = [];
    for (let i = 0; i < 40; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.4,
        size: Math.random() * 1.5 + 0.5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }

    // Ground pattern seeds
    this.groundDetails = [];
    for (let i = 0; i < 30; i++) {
      this.groundDetails.push({
        xOffset: Math.random() * 2000,
        type: Math.random() > 0.7 ? 'grass' : 'stone',
        size: Math.random() * 6 + 3,
      });
    }
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.groundY = this.height * 0.78;
  }

  getGroundY() {
    return this.groundY;
  }

  _createPetal() {
    return {
      x: Math.random() * (this.width + 200) - 100,
      y: Math.random() * this.height * 0.7 - 50,
      size: Math.random() * 5 + 2,
      speedX: Math.random() * 0.8 + 0.3,
      speedY: Math.random() * 0.4 + 0.1,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
      opacity: Math.random() * 0.4 + 0.2,
    };
  }

  update(dt, gameSpeed) {
    const scrollSpeed = gameSpeed * (dt / 16);

    // Parallax scrolling at different speeds
    this.bgOffset += scrollSpeed * 0.1;
    this.midOffset += scrollSpeed * 0.4;
    this.fgOffset += scrollSpeed * 0.7;
    this.groundOffset += scrollSpeed;

    // Update petals
    for (const petal of this.petals) {
      petal.x -= petal.speedX * scrollSpeed * 0.5 + petal.speedX;
      petal.y += petal.speedY;
      petal.rotation += petal.rotationSpeed;

      // Reset petals that go offscreen
      if (petal.x < -20 || petal.y > this.height) {
        petal.x = this.width + Math.random() * 100;
        petal.y = -10 + Math.random() * this.height * 0.3;
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    skyGrad.addColorStop(0, '#0d0825');
    skyGrad.addColorStop(0.4, '#1a1040');
    skyGrad.addColorStop(0.7, '#2a1848');
    skyGrad.addColorStop(1, '#3d1f4e');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.8);

    // Stars
    for (const star of this.stars) {
      const twinkle = Math.sin(Date.now() / 1000 + star.twinkle) * 0.4 + 0.6;
      ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.6})`;
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Moon
    this._drawMoon(ctx, w * 0.82, h * 0.12, 40);

    // Far mountains (slowest parallax)
    this._drawMountains(ctx, w, h, this.bgOffset, h * 0.55, '#1e1535', 0.7);

    // Near mountains
    this._drawMountains(ctx, w, h, this.midOffset, h * 0.62, '#2a1d3d', 0.85);

    // Bamboo forest silhouettes (mid-ground)
    this._drawBambooForest(ctx, w, h, this.fgOffset);

    // Ground
    this._drawGround(ctx, w, h);

    // Cherry blossom petals (in front of everything except player/obstacles)
    this._drawPetals(ctx);
  }

  _drawMoon(ctx, x, y, r) {
    // Glow
    const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3);
    glow.addColorStop(0, 'rgba(240, 212, 138, 0.15)');
    glow.addColorStop(0.5, 'rgba(240, 212, 138, 0.05)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);

    // Moon body
    ctx.fillStyle = '#f0e8d0';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Crescent shadow
    ctx.fillStyle = '#0d0825';
    ctx.beginPath();
    ctx.arc(x + 12, y - 5, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMountains(ctx, w, h, offset, baseY, color, heightMult) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);

    const segments = 8;
    const segWidth = (w + 400) / segments;

    for (let i = 0; i <= segments; i++) {
      const x = i * segWidth - (offset * 0.5) % segWidth;
      const peakH = (Math.sin(i * 1.5 + offset * 0.001) * 0.3 + 0.7) * (baseY - h * 0.2) * heightMult;
      const peakY = baseY - Math.abs(peakH) * 0.4;

      if (i === 0) {
        ctx.moveTo(x - segWidth, baseY);
        ctx.lineTo(x, peakY);
      } else {
        const cpx = x - segWidth / 2;
        ctx.quadraticCurveTo(cpx, peakY - 20, x, peakY);
      }
    }

    ctx.lineTo(w + 100, baseY);
    ctx.lineTo(w + 100, h);
    ctx.lineTo(0, h);
    ctx.fill();
  }

  _drawBambooForest(ctx, w, h, offset) {
    const baseY = h * 0.68;
    ctx.fillStyle = '#1a2e1a';

    const spacing = 60;
    const count = Math.ceil(w / spacing) + 4;
    const startX = -(offset % spacing) - spacing;

    for (let i = 0; i < count; i++) {
      const x = startX + i * spacing;
      const treeH = 80 + Math.sin(i * 2.3) * 30;

      // Trunk
      ctx.fillStyle = 'rgba(40, 70, 40, 0.5)';
      ctx.fillRect(x, baseY - treeH, 4, treeH);

      // Leaves cluster
      ctx.fillStyle = 'rgba(50, 80, 50, 0.4)';
      ctx.beginPath();
      ctx.ellipse(x + 2, baseY - treeH + 10, 15, 25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawGround(ctx, w, h) {
    const gy = this.groundY;

    // Main ground
    const groundGrad = ctx.createLinearGradient(0, gy, 0, h);
    groundGrad.addColorStop(0, '#2a1d3d');
    groundGrad.addColorStop(0.3, '#1e1535');
    groundGrad.addColorStop(1, '#12101f');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, gy, w, h - gy);

    // Ground line
    ctx.strokeStyle = 'rgba(212, 168, 84, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();

    // Path markings / stones
    ctx.fillStyle = 'rgba(212, 168, 84, 0.08)';
    const stoneSpacing = 100;
    const numStones = Math.ceil(w / stoneSpacing) + 2;
    const stoneStart = -(this.groundOffset % stoneSpacing);

    for (let i = 0; i < numStones; i++) {
      const sx = stoneStart + i * stoneSpacing;
      ctx.beginPath();
      ctx.ellipse(sx, gy + 15, 20, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPetals(ctx) {
    for (const petal of this.petals) {
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.rotation);
      ctx.globalAlpha = petal.opacity;

      // Petal shape
      ctx.fillStyle = '#f4a7bb';
      ctx.beginPath();
      ctx.ellipse(0, 0, petal.size, petal.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = '#fcd5df';
      ctx.beginPath();
      ctx.ellipse(-petal.size * 0.2, -petal.size * 0.1, petal.size * 0.4, petal.size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}
