/**
 * Main Entry Point — Samurai Sprint
 * Wires together camera, pose detection, game engine, and UI.
 */

import './style.css';
import { PoseDetector } from './poseDetection.js';
import { Game } from './game.js';

// DOM Elements
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const btnStart = document.getElementById('btn-start');
const btnRestart = document.getElementById('btn-restart');
const webcamVideo = document.getElementById('webcam');
const cameraPreviewContainer = document.getElementById('camera-preview-container');
const cameraPreviewCanvas = document.getElementById('camera-preview-canvas');
const cameraStatus = document.getElementById('camera-status');
const gameCanvas = document.getElementById('game-canvas');
const pipCanvas = document.getElementById('pip-canvas');
const scoreValue = document.getElementById('score-value');
const speedBarFill = document.getElementById('speed-bar-fill');
const actionIndicator = document.getElementById('action-indicator');
const finalScore = document.getElementById('final-score');
const statJumps = document.getElementById('stat-jumps');
const statSquats = document.getElementById('stat-squats');
const statTime = document.getElementById('stat-time');

// State
let poseDetector = null;
let game = null;
let poseLoopId = null;
let hudLoopId = null;

// Screen management
function showScreen(screen) {
  startScreen.classList.remove('active');
  gameScreen.classList.remove('active');
  gameoverScreen.classList.remove('active');
  screen.classList.add('active');
}

// Initialize camera
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });

    webcamVideo.srcObject = stream;
    await webcamVideo.play();

    // Show preview
    cameraPreviewContainer.style.display = 'block';
    cameraStatus.textContent = 'Camera active. Loading AI model...';

    return true;
  } catch (err) {
    cameraStatus.textContent = '❌ Camera access denied. Please allow camera.';
    console.error('Camera error:', err);
    return false;
  }
}

// Initialize pose detector
async function initPoseDetection() {
  poseDetector = new PoseDetector();

  try {
    await poseDetector.initialize(webcamVideo);
    cameraStatus.textContent = '✅ AI model loaded! Stand in view and hold still...';
    return true;
  } catch (err) {
    cameraStatus.textContent = '❌ Failed to load pose model.';
    console.error('Pose detection error:', err);
    return false;
  }
}

// Draw camera preview with skeleton
function drawPreview(canvas, ctx) {
  if (!webcamVideo.videoWidth) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw mirrored video
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(webcamVideo, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  // Draw skeleton (mirrored)
  if (poseDetector && poseDetector.keypoints) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    poseDetector.drawSkeleton(ctx, canvas.width, canvas.height);
    ctx.restore();
  }
}

// Pose detection loop (separate from game loop for consistent detection)
async function poseLoop() {
  if (!poseDetector) return;

  await poseDetector.detectPose();

  // Feed gestures into game
  if (game && game.state === 'playing') {
    const gestures = poseDetector.getGestureState();
    game.applyGestures(gestures);
  }

  // Draw PiP
  if (gameScreen.classList.contains('active')) {
    const pipCtx = pipCanvas.getContext('2d');
    drawPreview(pipCanvas, pipCtx);
  }

  // Draw start screen preview
  if (startScreen.classList.contains('active')) {
    const previewCtx = cameraPreviewCanvas.getContext('2d');
    drawPreview(cameraPreviewCanvas, previewCtx);

    // Update calibration status
    const gestures = poseDetector.getGestureState();
    if (gestures.calibrated) {
      cameraStatus.textContent = '✅ Ready! Click "Begin" to start.';
      btnStart.querySelector('.btn-icon').textContent = '⛩️';
      btnStart.childNodes[2].textContent = ' Begin!';
    }
  }

  poseLoopId = requestAnimationFrame(poseLoop);
}

// HUD update loop
function updateHUD() {
  if (!game || game.state !== 'playing') return;

  scoreValue.textContent = game.getScore();
  speedBarFill.style.width = `${30 + game.getSpeedPercent() * 70}%`;

  const gestures = poseDetector ? poseDetector.getGestureState() : null;
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
function startGame() {
  game = new Game(gameCanvas);

  game.onGameOver = (result) => {
    // Show game over screen
    finalScore.textContent = result.score;
    const gestures = poseDetector ? poseDetector.getGestureState() : null;
    statJumps.textContent = gestures ? gestures.jumpCount : 0;
    statSquats.textContent = gestures ? gestures.squatCount : 0;
    statTime.textContent = `${Math.floor(result.time / 1000)}s`;

    setTimeout(() => {
      showScreen(gameoverScreen);
    }, 500); // Brief delay for the red flash to show
  };

  showScreen(gameScreen);
  game.start();
  updateHUD();
}

// Event Listeners
btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  btnStart.childNodes[2].textContent = ' Loading...';

  const cameraOk = await startCamera();
  if (!cameraOk) {
    btnStart.disabled = false;
    btnStart.childNodes[2].textContent = ' Enable Camera & Play';
    return;
  }

  const poseOk = await initPoseDetection();
  if (!poseOk) {
    btnStart.disabled = false;
    btnStart.childNodes[2].textContent = ' Enable Camera & Play';
    return;
  }

  // Start pose detection loop
  poseLoop();

  // Wait for calibration before enabling play
  const waitForCalibration = () => {
    const gestures = poseDetector.getGestureState();
    if (gestures.calibrated) {
      btnStart.disabled = false;
      // Now clicking start begins the game
      btnStart.onclick = () => {
        startGame();
      };
    } else {
      setTimeout(waitForCalibration, 100);
    }
  };
  waitForCalibration();
});

btnRestart.addEventListener('click', () => {
  if (poseDetector) {
    poseDetector.recalibrate();
    poseDetector.resetStats();
  }
  if (game) {
    game.destroy();
  }
  startGame();
});

// Keyboard fallback (for testing without camera)
document.addEventListener('keydown', (e) => {
  if (!game || game.state !== 'playing') return;
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    game.player.jump();
  }
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    game.player.squat(true);
  }
});

document.addEventListener('keyup', (e) => {
  if (!game || game.state !== 'playing') return;
  if (e.code === 'ArrowDown') {
    game.player.squat(false);
  }
});
