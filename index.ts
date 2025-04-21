import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const PORT       = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const HOST       = process.env.HOST || '127.0.0.1';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('Missing OPENAI_API_KEY');

// 1️⃣  Express app with /health
const app = express();
app.get('/health', (_req, res) => res.status(200).send('ok'));
const server = http.createServer(app);


// 4️⃣ Expose your own WS on port 4000 and proxy audio
const wss = new WebSocketServer({
  server,
  path: '/ws',
});
let clientConnected: WebSocket;
// 1️⃣ Connect upstream to OpenAI Realtime STT
const upstream = new WebSocket(
  "wss://api.openai.com/v1/realtime?intent=transcription",
  {
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  },
);

let sessionId = null;

// 2️⃣ Grab session.id on creation
upstream.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "transcription_session.created") {
    sessionId = msg.session.id;
    console.log("Session created:", sessionId);
  }
  // pass through any transcription events to console
  if (msg.type.startsWith("conversation.item.input_audio_transcription")) {
    // console.log(msg);
    // write message to wss clients
    // wss.clients.forEach((client) => {
    //   if (client.readyState === WebSocket.OPEN) {
    //     client.send(JSON.stringify(msg));
    //   }
    // });
    if (clientConnected.readyState === WebSocket.OPEN) {
      clientConnected.send(JSON.stringify(msg));
    }
  }
  console.log(msg);
});

// 3️⃣ Update session to enable transcription (once ready)
upstream.on("open", () => {
  // Wait until sessionId is set before sending this
  const check = () => {
    if (!sessionId) return setTimeout(check, 50);
    // msg.session.id was captured from the initial created event
    upstream.send(JSON.stringify({
      type: "transcription_session.update",
      session: {
        input_audio_format: "pcm16",
        input_audio_transcription: {
          model: "gpt-4o-transcribe",
          prompt: "",
          language: "en"
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.7,
          prefix_padding_ms: 200,
          silence_duration_ms: 500,
          // create_response: true,
        },
        // turn_detection: null,
        // input_audio_noise_reduction: {
        //   type: "near_field"
        // },
        // include: [
        //   "item.input_audio_transcription.logprobs",
        // ]
      }
    }
    ));

  };
  check();
});
wss.on("connection", (client) => {
  console.log("Client connected");
  clientConnected = client;
  client.on("message", (audioChunk) => {
    if (!sessionId) return;  // guard
    // Base64‑encode raw PCM bytes
    const b64 = Buffer.from(audioChunk).toString("base64");
    // console.log(`Data`, b64)
    // Append into the session buffer with the session ID
    upstream.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        // id: sessionId,    // ← critical!
        audio: b64,
      })
    );
  });

  client.on("close", () => console.log("Client disconnected"));
});

// 4️⃣  Start HTTP & WS on the same port
server.listen(PORT, HOST, () => {
  console.log(`Server listening at http://${HOST}:${PORT}`);
  console.log(`  • Health check:      GET http://${HOST}:${PORT}/health`);
  console.log(`  • STT WebSocket      ws://${HOST}:${PORT}/ws`);
});

console.log("WebSocket proxy listening on ws://localhost:4000");
