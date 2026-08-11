/**
 * Game Module
 * Main game loop, state management, collision detection, and scoring.
 */

import { Player } from './player.js';
import { ObstacleManager } from './obstacles.js';
import { Renderer } from './renderer.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Renderer
    this.renderer = new Renderer(canvas);

    // Game state
    this.state = 'idle'; // 'idle', 'playing', 'gameover'
    this.score = 0;
    this.startTime = 0;
    this.elapsedTime = 0;

    // Speed
    this.baseSpeed = 5;
    this.speed = this.baseSpeed;
    this.speedMultiplier = 1;
    this.maxSpeedMultiplier = 2.5;
    this.jogBoost = 0;

    // Difficulty ramp
    this.difficultyTimer = 0;
    this.difficultyLevel = 1;

    // Initialize entities
    const groundY = this.renderer.getGroundY();
    this.player = new Player(groundY);
    this.player.x = canvas.width * 0.18;
    this.obstacleManager = new ObstacleManager(canvas.width, groundY);

    // Flash effect on hit
    this.flashAlpha = 0;

    // Last frame time
    this.lastTime = 0;

    // Bound methods
    this._gameLoop = this._gameLoop.bind(this);

    // Resize handler
    this._handleResize = () => {
      this.renderer.resize();
      const gy = this.renderer.getGroundY();
      this.player.groundY = gy;
      this.player.x = this.canvas.width * 0.18;
      if (this.player.y > gy) this.player.y = gy;
      this.obstacleManager.resize(this.canvas.width, gy);
    };
    window.addEventListener('resize', this._handleResize);
  }

  start() {
    this.state = 'playing';
    this.score = 0;
    this.startTime = Date.now();
    this.elapsedTime = 0;
    this.speed = this.baseSpeed;
    this.speedMultiplier = 1;
    this.jogBoost = 0;
    this.difficultyTimer = 0;
    this.difficultyLevel = 1;
    this.flashAlpha = 0;
    this.lastTime = performance.now();
    this.accumulator = 0;

    // Reset entities
    const gy = this.renderer.getGroundY();
    this.player = new Player(gy);
    this.player.x = this.canvas.width * 0.18;
    this.obstacleManager.reset();
    this.obstacleManager.resize(this.canvas.width, gy);

    // Start loop
    requestAnimationFrame(this._gameLoop);
  }

  stop() {
    this.state = 'gameover';
  }

  applyGestures(gestureState) {
    if (this.state !== 'playing') return;
    if (!gestureState || !gestureState.calibrated) return;

    if (gestureState.isJumping && !this.wasJumping) {
      this.player.jump();
    }
    this.wasJumping = gestureState.isJumping;

    this.player.squat(gestureState.isSquatting);

    // Jog boost — ramp up fast, decay slowly for a responsive sprint feel
    if (gestureState.jogDetected) {
      this.jogBoost = Math.min(1, this.jogBoost + 0.15 * Math.max(0.3, gestureState.jogIntensity));
    } else {
      this.jogBoost = Math.max(0, this.jogBoost - 0.01);
    }
  }

  _gameLoop(timestamp) {
    if (this.state !== 'playing') return;

    if (!this.lastTime) this.lastTime = timestamp;
    let dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // Cap dt to prevent spiral of death on tab switch
    if (dt > 100) dt = 100;

    this.accumulator = (this.accumulator || 0) + dt;
    const timeStep = 1000 / 60; // Fixed 60 FPS physics

    while (this.accumulator >= timeStep) {
      this._update(timeStep);
      this.accumulator -= timeStep;
    }

    this._draw();

    requestAnimationFrame(this._gameLoop);
  }

  _update(dt) {
    // Update elapsed time
    this.elapsedTime = Date.now() - this.startTime;

    // Difficulty ramp: increase every 10 seconds
    this.difficultyTimer += dt;
    if (this.difficultyTimer > 10000) {
      this.difficultyTimer = 0;
      this.difficultyLevel = Math.min(3, this.difficultyLevel + 0.15);
      this.obstacleManager.increaseDifficulty(this.difficultyLevel);
    }

    // Calculate speed
    const baseRamp = this.baseSpeed + (this.elapsedTime / 1000) * 0.05; // slowly ramp base speed
    this.speedMultiplier = 1 + this.jogBoost * 1.5;
    this.speed = baseRamp * this.speedMultiplier;

    // Update score
    this.score += this.speed * (dt / 1000) * 10;

    // Update entities
    this.player.update(dt);
    this.obstacleManager.update(dt, this.speed);
    this.renderer.update(dt, this.speed);

    // Collision detection
    this._checkCollisions();

    // Flash fade
    if (this.flashAlpha > 0) {
      this.flashAlpha -= 0.05;
    }
  }

  _checkCollisions() {
    const playerBox = this.player.getBoundingBox();
    const obstacleBoxes = this.obstacleManager.getBoundingBoxes();

    // Shrink player hitbox for fairness
    const margin = 8;
    const pBox = {
      x: playerBox.x + margin,
      y: playerBox.y + margin,
      width: playerBox.width - margin * 2,
      height: playerBox.height - margin * 2,
    };

    for (const oBox of obstacleBoxes) {
      if (this._boxesOverlap(pBox, oBox)) {
        this.flashAlpha = 1;
        this.state = 'gameover';
        if (this.onGameOver) {
          this.onGameOver({
            score: Math.floor(this.score),
            time: this.elapsedTime,
          });
        }
        return;
      }
    }
  }

  _boxesOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  _draw() {
    const ctx = this.ctx;

    // Clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw background
    this.renderer.draw();

    // Draw obstacles
    this.obstacleManager.draw(ctx);

    // Draw player
    this.player.draw(ctx, this.speedMultiplier);

    // Flash effect on collision
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(195, 60, 60, ${this.flashAlpha * 0.4})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  getScore() {
    return Math.floor(this.score);
  }

  getSpeedPercent() {
    // 0..1 representing speed from base to max
    return Math.min(1, (this.speedMultiplier - 1) / (this.maxSpeedMultiplier - 1));
  }

  getElapsedSeconds() {
    return Math.floor(this.elapsedTime / 1000);
  }

  destroy() {
    this.state = 'idle';
    window.removeEventListener('resize', this._handleResize);
  }
}
