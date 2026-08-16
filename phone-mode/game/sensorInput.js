/**
 * Sensor Input Module
 * Replaces poseDetection.js — processes accelerometer data from a phone
 * connected via WebSocket. Same interface: getGestureState()
 */

export class SensorInput {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.onRestartCommand = null;
    this.onEndGameCommand = null;

    // Raw sensor values
    this.accelX = 0;
    this.accelY = 0;
    this.accelZ = 0;

    // Smoothed values
    this.smoothY = 9.8; // gravity baseline
    this.smoothFactor = 0.3;

    // Calibration
    this.calibrated = false;
    this.calibrationSamples = [];
    this.baselineY = 9.8;
    this.baselineMagnitude = 9.8;

    // Jump detection
    this.isJumping = false;
    this.jumpCooldown = 0;
    this.jumpFrames = 0;
    this.jumpCount = 0;

    // Squat detection
    this.isSquatting = false;
    this.squatCooldown = 0;
    this.squatFrames = 0;
    this.squatCount = 0;

    // Jog detection — Peak detection pedometer + step cadence
    this.jogPeakThreshold = 3.0;      // Min raw deviation to count as a step peak (3.0g is an easy jog)
    this.jogAboveThreshold = false;   // Tracks rising-edge crossing
    this.jogLastStepTime = 0;         // Timestamp of last detected step
    this.jogRefractoryMs = 250;       // Minimum ms between steps (max 4 steps/sec)
    this.jogStepTimestamps = [];      // Rolling window of recent step timestamps
    this.jogCadenceWindowMs = 2500;   // How far back to look for steps (2.5 seconds)
    this.jogMinCadence = 3;           // Min steps in the window to consider it jogging
    this.jogDetected = false;
    this.jogIntensity = 0;
    this.jogCooldown = 0;             // Frames to suppress jog after jump/squat

    // Timing
    this.lastProcessTime = 0;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/?role=game`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected to server');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'controller_status') {
          this.connected = msg.connected;
          if (!msg.connected) {
            this.calibrated = false;
            this.calibrationSamples = [];
          }
        } else if (msg.type === 'restart') {
          if (this.onRestartCommand) this.onRestartCommand();
        } else if (msg.type === 'endgame') {
          if (this.onEndGameCommand) this.onEndGameCommand();
        } else if (msg.type === 'motion') {
          this.accelX = msg.x;
          this.accelY = msg.y;
          this.accelZ = msg.z;
          this._processMotion();
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('WebSocket disconnected');
      // Auto-reconnect after 2 seconds
      setTimeout(() => this.connect(), 2000);
    };
  }

  _processMotion() {
    const now = Date.now();

    // Smooth the Y acceleration
    this.smoothY = this.smoothY * (1 - this.smoothFactor) + this.accelY * this.smoothFactor;

    // Total acceleration magnitude (deviation from gravity = movement)
    const magnitude = Math.sqrt(this.accelX ** 2 + this.accelY ** 2 + this.accelZ ** 2);

    // Calibration: collect 30 samples to establish "still" baseline
    if (!this.calibrated) {
      this.calibrationSamples.push({ y: this.smoothY, mag: magnitude });
      if (this.calibrationSamples.length >= 30) {
        // Median Y value when standing still
        const sortedY = this.calibrationSamples.map(s => s.y).sort((a, b) => a - b);
        this.baselineY = sortedY[Math.floor(sortedY.length / 2)];

        const sortedMag = this.calibrationSamples.map(s => s.mag).sort((a, b) => a - b);
        this.baselineMagnitude = sortedMag[Math.floor(sortedMag.length / 2)];

        this.calibrated = true;
      }
      return;
    }

    // Cooldowns
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (this.squatCooldown > 0) this.squatCooldown--;
    if (this.jogCooldown > 0) this.jogCooldown--;

    const yDelta = this.smoothY - this.baselineY;
    const magDeviation = Math.abs(magnitude - this.baselineMagnitude);

    // Adaptive baseline (slow drift when idle)
    if (magDeviation < 1.5 && this.jumpCooldown === 0 && this.squatCooldown === 0) {
      this.baselineY = this.baselineY * 0.998 + this.smoothY * 0.002;
      this.baselineMagnitude = this.baselineMagnitude * 0.998 + magnitude * 0.002;
    }

    // ===== JUMP DETECTION =====
    // Jump requires a sustained spike in acceleration (filters out 1-frame foot stomp shockwaves from jogging)
    if (magDeviation > 18) {
      this.jumpFrames++;
    } else {
      this.jumpFrames = 0;
    }

    if (this.jumpFrames >= 3 && this.jumpCooldown === 0 && !this.isJumping) {
      this.isJumping = true;
      this.jumpCooldown = 25; // ~830ms at 30Hz
      this.jogCooldown = 15; // ~500ms — EMA filter handles most noise, just need a brief settle period
      this.jumpCount++;
    } else if (magDeviation < 10) {
      this.isJumping = false;
    }

    // ===== SQUAT DETECTION =====
    // Requires the Y-axis to drop significantly for a sustained period (filters out heavy downward jog steps)
    if (yDelta < -7) {
      this.squatFrames++;
    } else {
      this.squatFrames = 0;
    }

    if (this.squatFrames >= 3 && this.squatCooldown === 0 && !this.isSquatting && magDeviation < 20) {
      this.isSquatting = true;
      this.squatCooldown = 20;
      this.jogCooldown = 10; // ~330ms settle period
      this.squatCount++;
    } else if (yDelta >= -3 && this.isSquatting) {
      this.isSquatting = false;
      this.jogCooldown = 10; // ~330ms settle after standing up
    }

    // ===== JOG DETECTION (Raw Peak Detection Pedometer) =====
    // We do NOT use the EMA filter here because human acceleration oscillates
    // symmetrically around gravity. A strong low-pass filter was flattening the
    // signal toward 9.8, preventing peak detection entirely!
    // Instead, we use `magDeviation` (absolute deviation from gravity) directly.
    
    // Step 1: Peak detection with rising-edge trigger and refractory period.
    // A step is counted once when the deviation first crosses above the threshold.
    // It cannot count again until the signal drops back below AND the refractory period elapses.
    // The refractory period naturally prevents double-counting from noisy signals.
    if (!this.isJumping && !this.isSquatting && this.jogCooldown === 0) {
      if (magDeviation > this.jogPeakThreshold && !this.jogAboveThreshold) {
        // Rising edge — signal just crossed the threshold
        if (now - this.jogLastStepTime > this.jogRefractoryMs) {
          this.jogStepTimestamps.push(now);
          this.jogLastStepTime = now;
        }
        this.jogAboveThreshold = true;
      } else if (magDeviation < this.jogPeakThreshold * 0.5) {
        // Signal dropped back below half the threshold (hysteresis band to avoid flicker)
        this.jogAboveThreshold = false;
      }
    }

    // Step 4: Prune old timestamps outside the cadence window
    const windowStart = now - this.jogCadenceWindowMs;
    this.jogStepTimestamps = this.jogStepTimestamps.filter(t => t > windowStart);

    // Step 5: Determine jog state from step cadence
    const recentSteps = this.jogStepTimestamps.length;
    if (recentSteps >= this.jogMinCadence && !this.isJumping && !this.isSquatting && this.jogCooldown === 0) {
      this.jogDetected = true;
      // Intensity scales from 0 to 1 based on how many steps above the minimum
      // At minCadence steps it's 0.3, at 2x minCadence it's 1.0
      this.jogIntensity = Math.min(1, 0.3 + (recentSteps - this.jogMinCadence) / this.jogMinCadence * 0.7);
    } else {
      this.jogDetected = false;
      // Smooth decay so the character doesn't jerk to a stop
      this.jogIntensity = Math.max(0, this.jogIntensity - 0.03);
    }

    this.lastProcessTime = now;
  }

  getGestureState() {
    return {
      isJumping: this.isJumping,
      isSquatting: this.isSquatting,
      jogDetected: this.jogDetected,
      jogIntensity: this.jogIntensity,
      calibrated: this.calibrated,
      jumpCount: this.jumpCount,
      squatCount: this.squatCount,
    };
  }

  isControllerConnected() {
    return this.connected;
  }

  sendMessage(data) {
    if (this.ws && this.ws.readyState === 1 && this.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }

  resetStats() {
    this.jumpCount = 0;
    this.squatCount = 0;
  }

  recalibrate() {
    this.calibrated = false;
    this.calibrationSamples = [];
    this.isJumping = false;
    this.isSquatting = false;
    this.jumpCooldown = 0;
    this.squatCooldown = 0;
    this.jogAboveThreshold = false;
    this.jogLastStepTime = 0;
    this.jogStepTimestamps = [];
    this.jogDetected = false;
    this.jogIntensity = 0;
    this.jogCooldown = 0;
  }

  stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
