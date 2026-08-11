/**
 * Samurai Sprint — Phone Mode Server
 * 
 * Serves the game page (PC) and controller page (phone).
 * Relays WebSocket messages from the phone controller to the game client.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 5173;

// Serve game files at root
app.use('/', express.static(join(__dirname, 'game')));

// Serve controller files at /controller
app.use('/controller', express.static(join(__dirname, 'controller')));

// Track connected clients
let gameClient = null;
let controllerClient = null;

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role');

  if (role === 'game') {
    gameClient = ws;
    console.log('🎮 Game client connected');

    // Notify game if controller is already connected
    if (controllerClient && controllerClient.readyState === 1) {
      ws.send(JSON.stringify({ type: 'controller_status', connected: true }));
    }

    ws.on('close', () => {
      console.log('🎮 Game client disconnected');
      gameClient = null;
    });

  } else if (role === 'controller') {
    controllerClient = ws;
    console.log('📱 Controller connected');

    // Notify game that controller connected
    if (gameClient && gameClient.readyState === 1) {
      gameClient.send(JSON.stringify({ type: 'controller_status', connected: true }));
    }

    ws.on('message', (data) => {
      // Relay sensor data from phone to game
      if (gameClient && gameClient.readyState === 1) {
        gameClient.send(data.toString());
      }
    });

    ws.on('close', () => {
      console.log('📱 Controller disconnected');
      controllerClient = null;
      // Notify game
      if (gameClient && gameClient.readyState === 1) {
        gameClient.send(JSON.stringify({ type: 'controller_status', connected: false }));
      }
    });

  } else {
    ws.close(4000, 'Unknown role');
  }
});

// Get local IP for QR code / display
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('  ⛩️  Samurai Sprint — Phone Mode');
  console.log('  ─────────────────────────────────');
  console.log(`  🎮 Game (PC):        http://localhost:${PORT}`);
  console.log(`  📱 Controller (Phone): http://${localIP}:${PORT}/controller`);
  console.log('');
  console.log('  Both devices must be on the same WiFi network.');
  console.log('');
});
