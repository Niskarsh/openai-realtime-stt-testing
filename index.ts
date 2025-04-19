import WebSocket from "ws";
import dotenv from "dotenv";
import { WebSocketServer } from 'ws';
dotenv.config();


// Create a WebSocket server on port 4000
const wss = new WebSocketServer({ port: 4000 });

wss.on('connection', (socket) => {
  console.log('Socket connected');

  // Log incoming audio chunks or messages
  socket.on('message', (data) => {
    console.log('Received chunk:', data);
  });

  socket.on('close', () => {
    console.log('Socket disconnected');
  });
});


// const url = "wss://api.openai.com/v1/realtime?intent=transcription";
// const ws = new WebSocket(url, {
//   headers: {
//     "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
//     "OpenAI-Beta": "realtime=v1",
//   },
// });

// ws.on("open", function open() {
//   console.log("Connected to server.");
// });

// ws.on("message", function incoming(message) {
//   console.log(JSON.parse(message.toString()));
// });
