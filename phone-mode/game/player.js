/**
 * Player Entity
 * Manages the samurai character's state, animation, and rendering.
 */

export class Player {
  constructor(groundY) {
    this.groundY = groundY;
    this.x = 0;       // Set in game based on canvas
    this.y = groundY;
    this.width = 50;
    this.height = 80;

    // Physics
    this.vy = 0;
    this.gravity = 0.8;
    this.jumpForce = -16;
    this.isOnGround = true;

    // States
    this.state = 'run'; // 'run', 'jump', 'squat'
    this.squatHeight = 40;
    this.normalHeight = 80;

    // Animation
    this.animFrame = 0;
    this.animTimer = 0;
    this.runFrames = 4;

    // Trail effect
    this.trail = [];
    this.maxTrail = 8;

    // Sprint particle timer
    this.sprintParticles = [];
  }

  jump() {
    if (this.isOnGround && this.state !== 'squat') {
      this.vy = this.jumpForce;
      this.isOnGround = false;
      this.state = 'jump';
    }
  }

  squat(active) {
    if (active && this.isOnGround) {
      this.state = 'squat';
      this.height = this.squatHeight;
    } else if (!active && this.state === 'squat') {
      this.state = 'run';
      this.height = this.normalHeight;
    }
  }

  update(dt) {
    // Apply gravity
    if (!this.isOnGround) {
      this.vy += this.gravity;
      this.y += this.vy;

      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.isOnGround = true;
        if (this.state === 'jump') {
          this.state = 'run';
          this.height = this.normalHeight;
        }
      }
    }

    // Animation timer
    this.animTimer += dt;
    if (this.animTimer >= 100) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % this.runFrames;
    }

    // Trail
    this.trail.push({ x: this.x, y: this.y - this.height / 2, opacity: 1 });
    if (this.trail.length > this.maxTrail) this.trail.shift();
    for (const t of this.trail) {
      t.opacity -= 0.12;
    }
  }

  getBoundingBox() {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height,
      width: this.width,
      height: this.height,
    };
  }

  draw(ctx, speedMultiplier) {
    // Draw trail
    for (const t of this.trail) {
      if (t.opacity > 0) {
        ctx.globalAlpha = t.opacity * 0.15;
        ctx.fillStyle = '#f4a7bb';
        ctx.fillRect(t.x - this.width / 3, t.y - this.height / 3, this.width * 0.6, this.height * 0.6);
      }
    }
    ctx.globalAlpha = 1;

    const bx = this.x - this.width / 2;
    const by = this.y - this.height;

    // Draw samurai character
    this._drawSamurai(ctx, bx, by);

    // Speed lines when sprinting
    if (speedMultiplier > 1.2) {
      ctx.globalAlpha = Math.min(0.6, (speedMultiplier - 1.2) * 2);
      ctx.strokeStyle = '#f0d48a';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const ly = by + 10 + i * (this.height / 3);
        const lx = bx - 10 - Math.random() * 20;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - 20 - Math.random() * 15, ly);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  _drawSamurai(ctx, bx, by) {
    const isSquatting = this.state === 'squat';
    const w = this.width;
    const h = this.height;

    // Body
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#c33c3c';
    ctx.lineWidth = 2;

    if (isSquatting) {
      // Squatting pose - wider, shorter
      ctx.beginPath();
      ctx.roundRect(bx - 5, by + 5, w + 10, h - 5, 6);
      ctx.fill();
      ctx.stroke();

      // Head
      ctx.fillStyle = '#f0ebe3';
      ctx.beginPath();
      ctx.arc(bx + w / 2, by + 8, 10, 0, Math.PI * 2);
      ctx.fill();

      // Headband
      ctx.fillStyle = '#c33c3c';
      ctx.fillRect(bx + w / 2 - 12, by + 4, 24, 4);
      // Headband tails
      ctx.strokeStyle = '#c33c3c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + w / 2 + 12, by + 6);
      ctx.lineTo(bx + w / 2 + 22, by + 2);
      ctx.stroke();
    } else {
      // Standing/running/jumping pose
      // Legs - animated when running
      const legSpread = this.state === 'run' ? Math.sin(this.animFrame * Math.PI / 2) * 8 : 0;

      // Left leg
      ctx.fillStyle = '#2a1d3d';
      ctx.beginPath();
      ctx.moveTo(bx + w / 2 - 8, by + h - 25);
      ctx.lineTo(bx + w / 2 - 8 - legSpread, by + h);
      ctx.lineTo(bx + w / 2 - 2 - legSpread, by + h);
      ctx.lineTo(bx + w / 2 - 2, by + h - 25);
      ctx.fill();

      // Right leg
      ctx.beginPath();
      ctx.moveTo(bx + w / 2 + 2, by + h - 25);
      ctx.lineTo(bx + w / 2 + 2 + legSpread, by + h);
      ctx.lineTo(bx + w / 2 + 8 + legSpread, by + h);
      ctx.lineTo(bx + w / 2 + 8, by + h - 25);
      ctx.fill();

      // Torso (kimono)
      ctx.fillStyle = '#1a1a2e';
      ctx.strokeStyle = '#c33c3c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx + 5, by + 18, w - 10, h - 42, 4);
      ctx.fill();
      ctx.stroke();

      // Kimono sash (obi)
      ctx.fillStyle = '#d4a854';
      ctx.fillRect(bx + 5, by + h - 32, w - 10, 6);

      // Head
      ctx.fillStyle = '#f0ebe3';
      ctx.beginPath();
      ctx.arc(bx + w / 2, by + 12, 12, 0, Math.PI * 2);
      ctx.fill();

      // Hair (top knot)
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.ellipse(bx + w / 2, by + 2, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Headband
      ctx.fillStyle = '#c33c3c';
      ctx.fillRect(bx + w / 2 - 14, by + 8, 28, 4);
      // Headband tails flowing behind
      ctx.strokeStyle = '#c33c3c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx + w / 2 - 14, by + 10);
      const tailWave = Math.sin(Date.now() / 200) * 3;
      ctx.quadraticCurveTo(bx - 5, by + 8 + tailWave, bx - 12, by + 14 + tailWave);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + w / 2 - 14, by + 12);
      ctx.quadraticCurveTo(bx - 3, by + 14 + tailWave, bx - 8, by + 20 + tailWave);
      ctx.stroke();

      // Katana on back (diagonal line)
      ctx.strokeStyle = '#a8a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + w - 5, by + 20);
      ctx.lineTo(bx + w + 8, by - 5);
      ctx.stroke();
      // Katana handle
      ctx.strokeStyle = '#8b1a1a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx + w - 5, by + 20);
      ctx.lineTo(bx + w, by + 28);
      ctx.stroke();
    }

    // Eyes (small dots)
    ctx.fillStyle = '#1a1a2e';
    const eyeY = isSquatting ? by + 8 : by + 11;
    const eyeBaseX = bx + w / 2;
    ctx.beginPath();
    ctx.arc(eyeBaseX - 4, eyeY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeBaseX + 4, eyeY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
