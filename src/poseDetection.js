/**
 * Pose Detection Module
 * Uses TensorFlow.js MoveNet (loaded via CDN) to detect body poses from webcam.
 * Extracts jump, squat, and jog-in-place gestures.
 * 
 * Globals expected: window.poseDetection (from CDN)
 */

// MoveNet keypoint indices
const KEYPOINTS = {
  NOSE: 0,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_KNEE: 13,
  RIGHT_KNEE: 14,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16,
};

const MIN_CONFIDENCE = 0.3;

export class PoseDetector {
  constructor() {
    this.detector = null;
    this.videoElement = null;
    this.isRunning = false;
    this.keypoints = null;

    // Gesture state
    this.baselineHipY = null;
    this.calibrationFrames = [];
    this.calibrated = false;

    // Jump detection
    this.isJumping = false;
    this.jumpCooldown = 0;

    // Squat detection
    this.isSquatting = false;
    this.squatCooldown = 0;

    // Jog detection
    this.leftKneeHistory = [];
    this.rightKneeHistory = [];
    this.jogDetected = false;
    this.jogIntensity = 0;

    // Stats
    this.jumpCount = 0;
    this.squatCount = 0;

    // Smoothing
    this.smoothedHipY = null;
    this.smoothingFactor = 0.15; // heavy smoothing to filter MoveNet jitter
  }

  async initialize(videoElement) {
    this.videoElement = videoElement;

    // Create MoveNet detector (SinglePose Lightning is fastest)
    this.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      }
    );

    this.isRunning = true;
    return true;
  }

  async detectPose() {
    if (!this.detector || !this.videoElement || !this.isRunning) return null;
    if (this.videoElement.readyState < 2) return null;

    try {
      const poses = await this.detector.estimatePoses(this.videoElement);
      if (poses.length > 0 && poses[0].keypoints) {
        this.keypoints = poses[0].keypoints;
        this._processGestures();
        return this.keypoints;
      }
    } catch (e) {
      // Silently handle detection errors, they're usually transient
    }
    return null;
  }

  _getKeypointY(index) {
    if (!this.keypoints) return null;
    const kp = this.keypoints[index];
    if (kp && kp.score >= MIN_CONFIDENCE) {
      return kp.y;
    }
    return null;
  }

  _getAverageHipY() {
    const leftHip = this._getKeypointY(KEYPOINTS.LEFT_HIP);
    const rightHip = this._getKeypointY(KEYPOINTS.RIGHT_HIP);
    if (leftHip !== null && rightHip !== null) return (leftHip + rightHip) / 2;
    if (leftHip !== null) return leftHip;
    if (rightHip !== null) return rightHip;
    return null;
  }

  _getAverageShoulderY() {
    const leftShoulder = this._getKeypointY(KEYPOINTS.LEFT_SHOULDER);
    const rightShoulder = this._getKeypointY(KEYPOINTS.RIGHT_SHOULDER);
    if (leftShoulder !== null && rightShoulder !== null) return (leftShoulder + rightShoulder) / 2;
    if (leftShoulder !== null) return leftShoulder;
    if (rightShoulder !== null) return rightShoulder;
    return null;
  }

  _processGestures() {
    const hipY = this._getAverageHipY();
    if (hipY === null) return;

    // Smooth the hip Y value
    if (this.smoothedHipY === null) {
      this.smoothedHipY = hipY;
    } else {
      this.smoothedHipY = this.smoothedHipY * (1 - this.smoothingFactor) + hipY * this.smoothingFactor;
    }

    // Calibration: collect first 45 frames to establish baseline
    if (!this.calibrated) {
      this.calibrationFrames.push(this.smoothedHipY);
      if (this.calibrationFrames.length >= 45) {
        // Use median for robustness
        const sorted = [...this.calibrationFrames].sort((a, b) => a - b);
        this.baselineHipY = sorted[Math.floor(sorted.length / 2)];
        this.calibrated = true;
      }
      return;
    }

    // Decrease cooldowns
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (this.squatCooldown > 0) this.squatCooldown--;

    const hipDelta = this.smoothedHipY - this.baselineHipY;
    // In video coordinates, Y increases downward
    // Jump: hips go UP in real world = Y decreases in video
    // Squat: hips go DOWN in real world = Y increases in video

    const videoHeight = this.videoElement.videoHeight || 480;
    const jumpThreshold = -videoHeight * 0.10;    // 10% of frame height upward
    const squatThreshold = videoHeight * 0.05;     // 5% of frame height downward (easier to trigger)

    // Adaptive baseline: slowly drift toward current position when idle
    // This prevents the baseline from going stale and causing false triggers
    const isIdle = Math.abs(hipDelta) < Math.abs(jumpThreshold * 0.3);
    if (isIdle && this.jumpCooldown === 0 && this.squatCooldown === 0) {
      this.baselineHipY = this.baselineHipY * 0.995 + this.smoothedHipY * 0.005;
    }

    // Jump detection — require 5 consecutive frames above threshold
    if (hipDelta < jumpThreshold && this.jumpCooldown === 0 && !this.isJumping) {
      this.jumpConfirmFrames = (this.jumpConfirmFrames || 0) + 1;
      if (this.jumpConfirmFrames >= 5) {
        this.isJumping = true;
        this.jumpCooldown = 40;
        this.jumpCount++;
        this.jumpConfirmFrames = 0;
      }
    } else if (hipDelta >= -Math.abs(jumpThreshold * 0.2)) {
      // Must return close to baseline before another jump
      this.isJumping = false;
      this.jumpConfirmFrames = 0;
    } else {
      this.jumpConfirmFrames = 0;
    }

    // Squat detection — also require confirmation frames
    if (hipDelta > squatThreshold && this.squatCooldown === 0 && !this.isSquatting) {
      this.squatConfirmFrames = (this.squatConfirmFrames || 0) + 1;
      if (this.squatConfirmFrames >= 4) {
        this.isSquatting = true;
        this.squatCooldown = 30;
        this.squatCount++;
        this.squatConfirmFrames = 0;
      }
    } else if (hipDelta <= squatThreshold * 0.3) {
      this.isSquatting = false;
      this.squatConfirmFrames = 0;
    } else {
      this.squatConfirmFrames = 0;
    }

    // Jog detection — track knee Y oscillation
    this._detectJog();
  }

  _detectJog() {
    const leftKneeY = this._getKeypointY(KEYPOINTS.LEFT_KNEE);
    const rightKneeY = this._getKeypointY(KEYPOINTS.RIGHT_KNEE);

    // Only use knees (ankles are often occluded/noisy when standing still)
    if (leftKneeY !== null) {
      this.leftKneeHistory.push(leftKneeY);
      if (this.leftKneeHistory.length > 20) this.leftKneeHistory.shift();
    }
    if (rightKneeY !== null) {
      this.rightKneeHistory.push(rightKneeY);
      if (this.rightKneeHistory.length > 20) this.rightKneeHistory.shift();
    }

    if (this.leftKneeHistory.length < 12 || this.rightKneeHistory.length < 12) return;

    // Suppress jog detection during jumps/squats to prevent false sprints
    // Note: We don't use isIdle here because jogging naturally bounces the hips a bit!
    if (this.isJumping || this.isSquatting) {
      this.jogDetected = false;
      this.jogIntensity = 0;
      return;
    }

    // Calculate variance in knee positions (higher variance = more movement)
    const leftVariance = this._variance(this.leftKneeHistory.slice(-12));
    const rightVariance = this._variance(this.rightKneeHistory.slice(-12));
    const avgVariance = (leftVariance + rightVariance) / 2;

    const videoHeight = this.videoElement.videoHeight || 480;
    // Threshold: At 480p, this is (480 * 0.015)^2 = ~51 — requires ~7px of knee oscillation
    const jogThreshold = (videoHeight * 0.015) ** 2;

    this.jogDetected = avgVariance > jogThreshold;
    this.jogIntensity = Math.min(1, avgVariance / (jogThreshold * 3));
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

  resetStats() {
    this.jumpCount = 0;
    this.squatCount = 0;
  }

  recalibrate() {
    this.calibrated = false;
    this.calibrationFrames = [];
    this.baselineHipY = null;
    this.smoothedHipY = null;
    this.isJumping = false;
    this.isSquatting = false;
    this.jumpCooldown = 0;
    this.squatCooldown = 0;
    this.leftKneeHistory = [];
    this.rightKneeHistory = [];
    this.jogDetected = false;
    this.jogIntensity = 0;
  }

  drawSkeleton(ctx, width, height) {
    if (!this.keypoints) return;

    const scaleX = width / (this.videoElement.videoWidth || 640);
    const scaleY = height / (this.videoElement.videoHeight || 480);

    // Draw connections
    const connections = [
      [KEYPOINTS.LEFT_SHOULDER, KEYPOINTS.RIGHT_SHOULDER],
      [KEYPOINTS.LEFT_SHOULDER, KEYPOINTS.LEFT_HIP],
      [KEYPOINTS.RIGHT_SHOULDER, KEYPOINTS.RIGHT_HIP],
      [KEYPOINTS.LEFT_HIP, KEYPOINTS.RIGHT_HIP],
      [KEYPOINTS.LEFT_HIP, KEYPOINTS.LEFT_KNEE],
      [KEYPOINTS.RIGHT_HIP, KEYPOINTS.RIGHT_KNEE],
      [KEYPOINTS.LEFT_KNEE, KEYPOINTS.LEFT_ANKLE],
      [KEYPOINTS.RIGHT_KNEE, KEYPOINTS.RIGHT_ANKLE],
    ];

    ctx.strokeStyle = 'rgba(244, 167, 187, 0.7)';
    ctx.lineWidth = 2;

    for (const [i, j] of connections) {
      const kpA = this.keypoints[i];
      const kpB = this.keypoints[j];
      if (kpA && kpB && kpA.score >= MIN_CONFIDENCE && kpB.score >= MIN_CONFIDENCE) {
        ctx.beginPath();
        ctx.moveTo(kpA.x * scaleX, kpA.y * scaleY);
        ctx.lineTo(kpB.x * scaleX, kpB.y * scaleY);
        ctx.stroke();
      }
    }

    // Draw keypoints
    for (const kp of this.keypoints) {
      if (kp.score >= MIN_CONFIDENCE) {
        ctx.fillStyle = 'rgba(212, 168, 84, 0.9)';
        ctx.beginPath();
        ctx.arc(kp.x * scaleX, kp.y * scaleY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  stop() {
    this.isRunning = false;
  }
}
