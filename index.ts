import WebSocket, { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error("Missing OPENAI_API_KEY");

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
    console.log(msg);
  }
  // console.log(msg);
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
          language: "hi"
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          // create_response: true,
        },
        input_audio_noise_reduction: {
          type: "near_field"
        },
        // include: [
        //   "item.input_audio_transcription.logprobs",
        // ]
      }
    }
    ));

  };
  check();
});

// 4️⃣ Expose your own WS on port 4000 and proxy audio
const wss = new WebSocketServer({ port: 4000 });
wss.on("connection", (client) => {
  console.log("Client connected");

  client.on("message", (audioChunk) => {
    if (!sessionId) return;  // guard

    // Base64‑encode raw PCM bytes
    const b64 = Buffer.from(audioChunk).toString("base64");

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

console.log("WebSocket proxy listening on ws://localhost:4000");
