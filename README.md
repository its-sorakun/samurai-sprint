# ⛩️ Samurai Sprint: Fitness Runner

Welcome to **Samurai Sprint**—an endless runner game where **YOU** are the controller! 

Instead of sitting on the couch pressing buttons, this game requires you to physically move your body to control the samurai on screen. Jump over lanterns, duck under Torii gates, and jog in place to build up your sprint speed. It's the perfect way to get a quick cardio workout while having fun!

## ✨ Features

- **Full Body Controls:** Jump, squat, and jog in the real world to control your character. All physics run in a custom HTML5 Canvas game loop locked at a fixed 60 FPS for consistent gameplay regardless of monitor refresh rate.
- **Two Ways to Play:**
  - **📷 Webcam Mode (Easy Setup):** Uses TensorFlow.js and the MoveNet AI model to extract 17 skeletal keypoints in real-time through your computer's webcam. Just step back, make sure your full body is in the frame, and start moving!
  - **📱 Phone Controller Mode (Advanced Setup):** Turns your smartphone into a motion-sensing controller by reading raw 3-axis accelerometer data via the HTML5 `DeviceMotionEvent` API. A local Node.js WebSocket server acts as a low-latency bridge between the phone and PC.
- **Dynamic Difficulty:** The game slowly speeds up the longer you survive, keeping your heart rate up!
- **Remote Restart:** In Phone Mode, your game-over stats are beamed directly to your phone, and you can hit "Play Again" on your phone to instantly restart the game on your PC.

## 🎮 How to Play

The controls are simple, but the workout is real!

- **🏃 Jog / Sprint:** Jog in place to build up your speed multiplier. The game tracks ankle oscillations (webcam) or zero-crossings and variance thresholds (phone) to measure your jogging intensity.
- **🦘 Jump:** Physically jump up to hurdle over low obstacles. Our custom physics filter differentiates between the high-frequency shockwaves of heavy jogging and a deliberate, sustained vertical jump (e.g. 4G of force) to trigger the jump.
- **🧎 Squat:** Drop down into a squat to slide underneath high obstacles. The game calculates the vertical velocity of your hips and shoulders (webcam) or looks for a sustained drop in the Y-axis (phone) to trigger the duck.

## 🚀 Getting Started

### Option 1: Webcam Mode (Browser)
1. Simply open `index.html` in your web browser.
2. Allow camera permissions when prompted.
3. Step back so your entire body is visible to the camera, and start moving!

### Option 2: Phone Controller Mode
*Note: Because modern mobile browsers strictly require a secure `HTTPS` context to access the phone's accelerometer, this setup currently relies on `ngrok` to create a secure tunnel. I am actively working on an alternative solution to make this easier!*

1. Ensure you have [Node.js](https://nodejs.org/) and [ngrok](https://ngrok.com/) installed on your computer.
2. Open a terminal and navigate to the `phone-mode` folder.
3. Install the required packages by running:
   ```bash
   npm install
   ```
4. Start the local server:
   ```bash
   npm start
   ```
5. In a separate terminal window, start an ngrok tunnel on the same port (e.g., port 3000):
   ```bash
   ngrok http 3000
   ```
6. Open your PC browser to the local "Game (PC)" URL.
7. Open your phone's browser and navigate to the **ngrok HTTPS URL** (appended with `/controller`). 
8. Tap "Connect & Start Sensors" on your phone, and you are ready to play!

## 🛠️ Built With

- **HTML5 Canvas:** For rendering the game world and pixel-art aesthetics.
- **TensorFlow.js (MoveNet):** For lightning-fast AI pose detection in the webcam mode.
- **WebSockets:** For ultra-low latency, bidirectional communication between the phone and the PC.
- **DeviceMotion API:** To capture high-fidelity accelerometer data from the smartphone.

---
*Get ready to sweat!* 💦
