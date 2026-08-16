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

    // Workout Mode State
    this.gameMode = 'endless'; // 'endless' or 'workout'
    this.audioEngine = null;
    this.workoutState = 'rest'; // 'rest' or 'action'
    this.workoutAction = null; // 'JUMP', 'SQUAT', 'JOG'
    this.workoutTimer = 0; // ms
    this.workoutScore = 0;
    
    // DOM Elements for workout
    this.workoutOverlay = document.getElementById('workout-overlay');
    this.workoutCommandEl = document.getElementById('workout-command');
    this.workoutTimerEl = document.getElementById('workout-timer');

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

  start(mode = 'endless', audioEngine = null) {
    this.state = 'playing';
    this.gameMode = mode;
    this.audioEngine = audioEngine;
    this.score = 0;
    this.workoutScore = 0;
    
    // Initialize workout state
    if (this.gameMode === 'workout') {
      this.workoutState = 'rest';
      this.workoutTimer = 10000; // Increased from 5s to 10s
      this.workoutOverlay.style.display = 'block';
      this.updateWorkoutUI();
    } else {
      this.workoutOverlay.style.display = 'none';
    }
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
      if (this.player.jump() && this.audioEngine) this.audioEngine.playJump();
    }
    this.wasJumping = gestureState.isJumping;

    if (gestureState.isSquatting && !this.player.isSquatting && this.audioEngine) {
      this.audioEngine.playSquat();
    }
    this.player.squat(gestureState.isSquatting);

    // Store state for the fixed timestep physics loop
    this.currentJogDetected = gestureState.jogDetected;
    this.currentJogIntensity = gestureState.jogIntensity;
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

    // Smooth jog boost (calculated at fixed 60fps)
    // Ramp up over ~0.5s, decay over ~1s. This prevents 1-frame false positives from spiking speed.
    if (this.currentJogDetected) {
      this.jogBoost = Math.min(1, this.jogBoost + 0.03 * Math.max(0.3, this.currentJogIntensity));
    } else {
      this.jogBoost = Math.max(0, this.jogBoost - 0.015);
    }

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

    if (this.gameMode === 'endless') {
      // Endless mode score
      this.score += this.speed * (dt / 1000) * 10;
    } else if (this.gameMode === 'workout') {
      // Workout Mode Logic
      this._updateWorkout(dt);
    }

    // Always update obstacles and check collisions in both modes now!
    this.obstacleManager.update(dt, this.speed, this.gameMode, this.workoutState, this.workoutAction);
    this._checkCollisions();

    this.player.update(dt);
    this.renderer.update(dt, this.speed);

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
            score: this.getScore(),
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

    // Draw obstacles in both modes
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
    return Math.floor(this.gameMode === 'workout' ? this.workoutScore : this.score);
  }

  getSpeedPercent() {
    return Math.min(1, (this.speedMultiplier - 1) / (this.maxSpeedMultiplier - 1));
  }

  getElapsedSeconds() {
    return Math.floor(this.elapsedTime / 1000);
  }

  _updateWorkout(dt) {
    this.workoutTimer -= dt;
    
    // Workout action logic
    if (this.workoutState === 'action') {
      if (this.workoutAction === 'JUMP' && this.player.state === 'jump' && !this._workoutJumpRewarded) {
        this.workoutScore += 100;
        this._workoutJumpRewarded = true;
        if (this.audioEngine) this.audioEngine.playCoin();
      }
      if (this.player.state !== 'jump') this._workoutJumpRewarded = false; // Reset for next jump

      if (this.workoutAction === 'SQUAT' && this.player.state === 'squat' && !this._workoutSquatRewarded) {
        this.workoutScore += 10; // points per frame essentially while squatted, or maybe just a flat reward? 
        // Better:
        if (!this._squatAccumulator) this._squatAccumulator = 0;
        this._squatAccumulator += dt;
        if (this._squatAccumulator > 500) { // Every 0.5s of squatting
          this.workoutScore += 50;
          this._squatAccumulator = 0;
          if (this.audioEngine) this.audioEngine.playCoin();
        }
      }

      if (this.workoutAction === 'JOG' && this.currentJogDetected) {
        this.workoutScore += (dt / 1000) * 100; // 100 points per second of jogging
      }
    }

    // State transitions
    if (this.workoutTimer <= 0) {
      if (this.workoutState === 'rest') {
        // Transition to Action
        this.workoutState = 'action';
        const actions = ['JUMP', 'SQUAT', 'JOG'].filter(a => a !== this._lastWorkoutAction);
        this.workoutAction = actions[Math.floor(Math.random() * actions.length)];
        this._lastWorkoutAction = this.workoutAction;
        this.workoutTimer = Math.floor(Math.random() * 10000) + 10000; // 10 to 20 seconds
        
        if (this.audioEngine) this.audioEngine.playBeep(true); // High beep to start
      } else {
        // Transition to Rest
        this.workoutState = 'rest';
        this.workoutAction = 'REST';
        this.workoutTimer = 10000; // Increased from 5s to 10s
        
        // Immediately clear any leftover obstacles from the screen
        this.obstacleManager.reset();
        
        if (this.audioEngine) this.audioEngine.playBeep(false); // Low beep to stop
      }
    }

    // Beep on countdown (last 3 seconds of rest)
    if (this.workoutState === 'rest' && this.workoutTimer <= 3000) {
      const sec = Math.ceil(this.workoutTimer / 1000);
      if (sec !== this._lastBeepSec) {
        this._lastBeepSec = sec;
        if (this.audioEngine) this.audioEngine.playBeep(false);
      }
    } else {
      this._lastBeepSec = null;
    }

    this.updateWorkoutUI();
  }

  updateWorkoutUI() {
    if (this.workoutState === 'rest') {
      this.workoutCommandEl.textContent = 'REST';
      this.workoutCommandEl.style.color = 'white';
    } else {
      this.workoutCommandEl.textContent = this.workoutAction + '!';
      if (this.workoutAction === 'JUMP') this.workoutCommandEl.style.color = '#5a8a5e'; // Green
      if (this.workoutAction === 'SQUAT') this.workoutCommandEl.style.color = '#d4a854'; // Gold
      if (this.workoutAction === 'JOG') this.workoutCommandEl.style.color = '#f4a7bb'; // Pink
    }
    this.workoutTimerEl.textContent = Math.ceil(this.workoutTimer / 1000) + 's';
  }

  destroy() {
    this.state = 'idle';
    if (this.workoutOverlay) this.workoutOverlay.style.display = 'none';
    window.removeEventListener('resize', this._handleResize);
  }
}
