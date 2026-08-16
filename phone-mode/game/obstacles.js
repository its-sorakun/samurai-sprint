/**
 * Obstacles Module
 * Spawns and manages obstacles for the runner game.
 * Types: low (jump over), high (duck under)
 */

export class ObstacleManager {
  constructor(canvasWidth, groundY) {
    this.canvasWidth = canvasWidth;
    this.groundY = groundY;
    this.obstacles = [];
    this.spawnTimer = 0;
    this.minSpawnInterval = 1200; // ms
    this.maxSpawnInterval = 2800; // ms
    this.nextSpawnAt = this._randomInterval();
    this.difficultyMultiplier = 1;
  }

  _randomInterval() {
    const range = this.maxSpawnInterval - this.minSpawnInterval;
    return this.minSpawnInterval + Math.random() * range;
  }

  update(dt, speed, gameMode = 'endless', workoutState = null, workoutAction = null) {
    this.spawnTimer += dt;

    // Determine allowed types
    let allowedTypes = ['torii', 'lantern', 'bamboo', 'torii', 'lantern'];
    if (gameMode === 'workout') {
      if (workoutState === 'rest' || workoutAction === 'JOG') {
        allowedTypes = []; // Nothing spawns during rest or sprint/jog
      } else if (workoutAction === 'JUMP') {
        allowedTypes = ['lantern', 'bamboo'];
      } else if (workoutAction === 'SQUAT') {
        allowedTypes = ['torii'];
      }
    }

    // Spawn new obstacle
    if (this.spawnTimer >= this.nextSpawnAt / this.difficultyMultiplier) {
      this.spawnTimer = 0;
      this.nextSpawnAt = this._randomInterval();
      if (allowedTypes.length > 0) {
        this._spawnObstacle(allowedTypes);
      }
    }

    // Move obstacles
    for (const obs of this.obstacles) {
      obs.x -= speed * (dt / 16);

      // Animate
      if (obs.type === 'lantern') {
        obs.flicker = Math.sin(Date.now() / 200 + obs.seed) * 0.3 + 0.7;
      }
    }

    // Remove off-screen obstacles
    this.obstacles = this.obstacles.filter(obs => obs.x + obs.width > -50);
  }

  _spawnObstacle(types) {
    const type = types[Math.floor(Math.random() * types.length)];

    let obs;
    switch (type) {
      case 'torii':
        // High obstacle — must duck under
        obs = {
          type: 'torii',
          x: this.canvasWidth + 50,
          width: 80,
          height: 50,
          yOffset: 0, // from top (hangs from above)
          isHigh: true,
          seed: Math.random() * 1000,
        };
        // Position: top of player area
        obs.y = this.groundY - 85; // just above standing height
        break;

      case 'lantern':
        // Low obstacle — must jump over
        obs = {
          type: 'lantern',
          x: this.canvasWidth + 50,
          width: 35,
          height: 40,
          isHigh: false,
          seed: Math.random() * 1000,
          flicker: 1,
        };
        obs.y = this.groundY - obs.height;
        break;

      case 'bamboo':
        // Low obstacle — must jump over
        obs = {
          type: 'bamboo',
          x: this.canvasWidth + 50,
          width: 25,
          height: 55,
          isHigh: false,
          seed: Math.random() * 1000,
        };
        obs.y = this.groundY - obs.height;
        break;
    }

    if (obs) {
      this.obstacles.push(obs);
    }
  }

  draw(ctx) {
    for (const obs of this.obstacles) {
      switch (obs.type) {
        case 'torii':
          this._drawTorii(ctx, obs);
          break;
        case 'lantern':
          this._drawLantern(ctx, obs);
          break;
        case 'bamboo':
          this._drawBamboo(ctx, obs);
          break;
      }
    }
  }

  _drawTorii(ctx, obs) {
    const x = obs.x;
    const y = obs.y;

    // Main horizontal beam
    ctx.fillStyle = '#c33c3c';
    ctx.fillRect(x - 10, y, obs.width + 20, 8);

    // Second beam
    ctx.fillStyle = '#8b1a1a';
    ctx.fillRect(x, y + 12, obs.width, 6);

    // Left pillar
    ctx.fillStyle = '#c33c3c';
    ctx.fillRect(x + 5, y, 8, obs.height);

    // Right pillar
    ctx.fillRect(x + obs.width - 13, y, 8, obs.height);

    // Top ornamental piece
    ctx.fillStyle = '#8b1a1a';
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + obs.width / 2, y - 8);
    ctx.lineTo(x + obs.width + 15, y);
    ctx.fill();

    // Warning indicator (subtle glow)
    ctx.shadowColor = 'rgba(195, 60, 60, 0.4)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = 'rgba(195, 60, 60, 0.1)';
    ctx.fillRect(x - 5, y - 5, obs.width + 10, obs.height + 10);
    ctx.shadowBlur = 0;
  }

  _drawLantern(ctx, obs) {
    const x = obs.x + obs.width / 2;
    const y = obs.y;

    // Stone base
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(x - 14, y + obs.height - 8, 28, 8);

    // Body
    ctx.fillStyle = '#5a5a6a';
    ctx.beginPath();
    ctx.roundRect(x - 10, y + 8, 20, obs.height - 20, 3);
    ctx.fill();

    // Roof
    ctx.fillStyle = '#3a3a4a';
    ctx.beginPath();
    ctx.moveTo(x - 16, y + 8);
    ctx.lineTo(x, y - 4);
    ctx.lineTo(x + 16, y + 8);
    ctx.fill();

    // Glowing window
    const glow = obs.flicker || 1;
    ctx.fillStyle = `rgba(240, 212, 138, ${0.6 * glow})`;
    ctx.fillRect(x - 6, y + 14, 12, 14);

    // Light glow effect
    ctx.shadowColor = `rgba(240, 212, 138, ${0.5 * glow})`;
    ctx.shadowBlur = 20;
    ctx.fillStyle = `rgba(240, 212, 138, ${0.3 * glow})`;
    ctx.beginPath();
    ctx.arc(x, y + 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  _drawBamboo(ctx, obs) {
    const x = obs.x + obs.width / 2;
    const y = obs.y;

    // Main stalk
    ctx.fillStyle = '#5a8a5e';
    ctx.fillRect(x - 5, y, 10, obs.height);

    // Nodes
    ctx.fillStyle = '#4a7a4e';
    for (let i = 0; i < 3; i++) {
      const ny = y + 10 + i * 16;
      ctx.fillRect(x - 7, ny, 14, 3);
    }

    // Small leaves
    ctx.fillStyle = '#6a9a6e';
    ctx.beginPath();
    ctx.ellipse(x + 12, y + 8, 12, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - 10, y + 22, 10, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Second thinner stalk
    ctx.fillStyle = '#4a7a4e';
    ctx.fillRect(x + 6, y + 10, 6, obs.height - 10);
  }

  getBoundingBoxes() {
    return this.obstacles.map(obs => {
      if (obs.isHigh) {
        // Torii gate collision zone (the beams, not pillars all the way down)
        return {
          x: obs.x,
          y: obs.y,
          width: obs.width,
          height: 20,  // Just the beam area
          type: obs.type,
        };
      }
      return {
        x: obs.x,
        y: obs.y,
        width: obs.width,
        height: obs.height,
        type: obs.type,
      };
    });
  }

  reset() {
    this.obstacles = [];
    this.spawnTimer = 0;
    this.difficultyMultiplier = 1;
  }

  increaseDifficulty(mult) {
    this.difficultyMultiplier = mult;
  }

  resize(canvasWidth, groundY) {
    this.canvasWidth = canvasWidth;
    this.groundY = groundY;
  }
}
