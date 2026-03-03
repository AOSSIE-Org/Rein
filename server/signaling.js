// server/signaling.js
import { Server } from "socket.io";
import { createServer } from "http";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  // Pass messages between sender and receiver
  socket.on("offer", (data) => socket.broadcast.emit("offer", data));
  socket.on("answer", (data) => socket.broadcast.emit("answer", data));
  socket.on("ice-candidate", (data) => socket.broadcast.emit("ice-candidate", data));

  socket.on("disconnect", () => console.log("🔴 Client disconnected"));
});

httpServer.listen(3001, () => console.log("✅ Signaling server on port 3001"));
