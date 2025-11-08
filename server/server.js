import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleVoiceStream } from "./voice.js"; 

const app = express();
const PORT = 8001;

// --- WEBSOCKET SETUP ---
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("✅ Client connected via WebSocket");
  handleVoiceStream(ws); 

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

server.listen(PORT, () =>
  console.log(`🎧 Voice server (with WebSockets) running on http://localhost:${PORT}`)
);