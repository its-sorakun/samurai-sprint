/**
 * Sensor Input Module
 * Replaces poseDetection.js — processes accelerometer data from a phone
 * connected via WebSocket. Same interface: getGestureState()
 */

export class SensorInput {
  constructor() {
    this.ws = null;
    this.connected = false;

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
    this.jumpCount = 0;

    // Squat detection
    this.isSquatting = false;
    this.squatCooldown = 0;
    this.squatCount = 0;

    // Jog detection
    this.magnitudeHistory = [];
    this.jogDetected = false;
    this.jogIntensity = 0;

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
        const data = JSON.parse(event.data);

        if (data.type === 'controller_status') {
          this.connected = data.connected;
          if (!data.connected) {
            this.calibrated = false;
            this.calibrationSamples = [];
          }
          return;
        }

        if (data.type === 'motion') {
          this.accelX = data.x;
          this.accelY = data.y;
          this.accelZ = data.z;
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

    const yDelta = this.smoothY - this.baselineY;
    const magDeviation = Math.abs(magnitude - this.baselineMagnitude);

    // Adaptive baseline (slow drift when idle)
    if (magDeviation < 1.5 && this.jumpCooldown === 0 && this.squatCooldown === 0) {
      this.baselineY = this.baselineY * 0.998 + this.smoothY * 0.002;
      this.baselineMagnitude = this.baselineMagnitude * 0.998 + magnitude * 0.002;
    }

    // ===== JUMP DETECTION =====
    // Jump requires a MASSIVE spike in acceleration (e.g. 25+ m/s^2 deviation from gravity)
    // This requires a very hard flick of the hand or a real jump.
    if (magDeviation > 25 && this.jumpCooldown === 0 && !this.isJumping) {
      this.isJumping = true;
      this.jumpCooldown = 25; // ~830ms at 30Hz
      this.jumpCount++;
    } else if (magDeviation < 10) {
      this.isJumping = false;
    }

    // ===== SQUAT DETECTION =====
    // Requires the Y-axis to drop by at least 8 (meaning phone is almost horizontal or in freefall)
    if (yDelta < -8 && this.squatCooldown === 0 && !this.isSquatting && magDeviation < 20) {
      this.isSquatting = true;
      this.squatCooldown = 20;
      this.squatCount++;
    } else if (yDelta >= -3) {
      this.isSquatting = false;
    }

    // ===== JOG DETECTION =====
    // Jogging in place creates rhythmic oscillation in acceleration magnitude
    this.magnitudeHistory.push(magnitude);
    if (this.magnitudeHistory.length > 20) this.magnitudeHistory.shift();

    if (this.magnitudeHistory.length >= 10 && !this.isJumping && !this.isSquatting) {
      const recentMags = this.magnitudeHistory.slice(-10);
      const variance = this._variance(recentMags);

      // Variance threshold: running with phone creates massive variance
      // Increased heavily so normal hand movement doesn't trigger jogging
      const jogThreshold = 50.0;
      this.jogDetected = variance > jogThreshold;
      this.jogIntensity = Math.min(1, variance / (jogThreshold * 2));
    } else {
      this.jogDetected = false;
      this.jogIntensity = Math.max(0, this.jogIntensity - 0.05);
    }

    this.lastProcessTime = now;
  }

  _variance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
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
    this.magnitudeHistory = [];
    this.jogDetected = false;
    this.jogIntensity = 0;
  }

  stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
