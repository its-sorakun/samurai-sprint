/**
 * Main Entry Point — Samurai Sprint (Phone Controller Mode)
 * Wires WebSocket sensor input → game engine → UI.
 */

import { SensorInput } from './sensorInput.js';
import { Game } from './game.js';
import { AudioEngine } from './audio.js';

// DOM Elements
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const btnStartEndless = document.getElementById('btn-start-endless');
const btnStartWorkout = document.getElementById('btn-start-workout');
const btnWaiting = document.getElementById('btn-waiting');
const startButtons = document.getElementById('start-buttons');
const btnEndGame = document.getElementById('btn-end-game');
const btnRestart = document.getElementById('btn-restart');
const btnHome = document.getElementById('btn-home');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const connectionUrl = document.getElementById('connection-url');
const gameCanvas = document.getElementById('game-canvas');
const scoreValue = document.getElementById('score-value');
const speedBarFill = document.getElementById('speed-bar-fill');
const actionIndicator = document.getElementById('action-indicator');
const finalScore = document.getElementById('final-score');
const statJumps = document.getElementById('stat-jumps');
const statSquats = document.getElementById('stat-squats');
const statTime = document.getElementById('stat-time');
const gameConnDot = document.getElementById('game-conn-dot');
const gameConnText = document.getElementById('game-conn-text');

// State
let sensorInput = null;
let game = null;
let audioEngine = new AudioEngine();
let currentMode = 'endless';
let gestureLoopId = null;
let hudLoopId = null;

// Show the controller URL
const controllerUrl = `${location.protocol}//${location.hostname}:${location.port}/controller`;
connectionUrl.textContent = controllerUrl;

// Screen management
function showScreen(screen) {
  startScreen.classList.remove('active');
  gameScreen.classList.remove('active');
  gameoverScreen.classList.remove('active');
  screen.classList.add('active');
}

// Initialize sensor input
function initSensorInput() {
  sensorInput = new SensorInput();
  sensorInput.connect();

  // Poll for controller connection status
  setInterval(() => {
    if (sensorInput.isControllerConnected()) {
      connDot.className = 'conn-dot connected';
      connText.textContent = '📱 Phone controller connected!';
      btnWaiting.style.display = 'none';
      startButtons.style.display = 'flex';

      if (gameConnDot) {
        gameConnDot.className = 'conn-dot-small connected';
        gameConnText.textContent = '📱 Connected';
      }
    } else {
      connDot.className = 'conn-dot disconnected';
      connText.textContent = 'Waiting for phone controller...';
      btnWaiting.style.display = 'block';
      startButtons.style.display = 'none';

      if (gameConnDot) {
        gameConnDot.className = 'conn-dot-small disconnected';
        gameConnText.textContent = '📱 Disconnected';
      }
    }
  }, 500);

  // Wire up remote restart command
  sensorInput.onRestartCommand = () => {
    if (game) game.destroy();
    startGame(currentMode);
  };

  // Wire up remote end game command
  sensorInput.onEndGameCommand = () => {
    if (game && game.state === 'playing') {
      game.state = 'gameover';
      if (game.onGameOver) {
        game.onGameOver({
          score: Math.floor(game.getScore()),
          time: game.elapsedTime,
        });
      }
    }
  };
}

// Gesture processing loop
function gestureLoop() {
  if (!sensorInput || !game || game.state !== 'playing') {
    gestureLoopId = requestAnimationFrame(gestureLoop);
    return;
  }

  const gestures = sensorInput.getGestureState();
  game.applyGestures(gestures);

  gestureLoopId = requestAnimationFrame(gestureLoop);
}

// HUD update loop
function updateHUD() {
  if (!game || game.state !== 'playing') return;

  scoreValue.textContent = game.getScore();
  speedBarFill.style.width = `${30 + game.getSpeedPercent() * 70}%`;

  const gestures = sensorInput ? sensorInput.getGestureState() : null;
  if (gestures) {
    if (gestures.isJumping) {
      actionIndicator.textContent = '🦘 Jump!';
      actionIndicator.style.borderColor = 'rgba(90, 138, 94, 0.6)';
      actionIndicator.style.background = 'rgba(90, 138, 94, 0.15)';
    } else if (gestures.isSquatting) {
      actionIndicator.textContent = '🧎 Squat!';
      actionIndicator.style.borderColor = 'rgba(212, 168, 84, 0.6)';
      actionIndicator.style.background = 'rgba(212, 168, 84, 0.15)';
    } else if (gestures.jogDetected) {
      actionIndicator.textContent = '🏃 Sprinting!';
      actionIndicator.style.borderColor = 'rgba(195, 60, 60, 0.6)';
      actionIndicator.style.background = 'rgba(195, 60, 60, 0.15)';
    } else {
      actionIndicator.textContent = '🏃 Running';
      actionIndicator.style.borderColor = 'rgba(244, 167, 187, 0.2)';
      actionIndicator.style.background = 'rgba(244, 167, 187, 0.1)';
    }
  }

  hudLoopId = requestAnimationFrame(updateHUD);
}

// Start game
function startGame(mode = 'endless') {
  currentMode = mode;
  audioEngine.init(); // Requires user gesture to unlock AudioContext

  if (sensorInput) {
    sensorInput.recalibrate();
    sensorInput.resetStats();
  }

  game = new Game(gameCanvas);

    game.onGameOver = (result) => {
    audioEngine.playGameOver();
    finalScore.textContent = result.score;
    document.getElementById('final-score-label').textContent = mode === 'workout' ? 'Workout Score' : 'Final Distance';
    const gestures = sensorInput ? sensorInput.getGestureState() : null;
    statJumps.textContent = gestures ? gestures.jumpCount : 0;
    statSquats.textContent = gestures ? gestures.squatCount : 0;
    statTime.textContent = `${Math.floor(result.time / 1000)}s`;

    // Beam stats to phone
    if (sensorInput) {
      sensorInput.sendMessage({
        type: 'gameover',
        score: result.score,
        time: Math.floor(result.time / 1000),
        jumps: gestures ? gestures.jumpCount : 0,
        squats: gestures ? gestures.squatCount : 0
      });
    }

    setTimeout(() => {
      showScreen(gameoverScreen);
    }, 500);
  };

  showScreen(gameScreen);
  game.start(currentMode, audioEngine);
  updateHUD();
}

// ===== Event Listeners =====

btnStartEndless.addEventListener('click', () => {
  startGame('endless');
});

btnStartWorkout.addEventListener('click', () => {
  startGame('workout');
});

btnRestart.addEventListener('click', () => {
  if (game) game.destroy();
  startGame(currentMode);
});

btnEndGame.addEventListener('click', () => {
  if (game && game.state === 'playing') {
    game.state = 'gameover';
    if (game.onGameOver) {
      game.onGameOver({
        score: Math.floor(game.getScore()),
        time: game.elapsedTime,
      });
    }
  }
});

btnHome.addEventListener('click', () => {
  if (game) {
    game.destroy();
    game = null;
  }
  if (sensorInput) {
    sensorInput.sendMessage({ type: 'home' });
  }
  showScreen(startScreen);
});

// Keyboard fallback (for testing without phone)
document.addEventListener('keydown', (e) => {
  if (!game || game.state !== 'playing') return;
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (game.player.jump() && audioEngine) audioEngine.playJump();
  }
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (!game.player.isSquatting && audioEngine) audioEngine.playSquat();
    game.player.squat(true);
  }
});

document.addEventListener('keyup', (e) => {
  if (!game || game.state !== 'playing') return;
  if (e.code === 'ArrowDown') {
    game.player.squat(false);
  }
});

// ===== Initialize =====
initSensorInput();
gestureLoop();
