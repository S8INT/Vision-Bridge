import http from "http";
import app from "./app";
import { handleUpgrade } from "./routes/signal";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Wrap Express in a raw HTTP server so we can intercept the WS upgrade
const server = http.createServer(app);

// WebRTC signaling — WebSocket upgrade at /ws/signal
server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket as import("net").Socket, head);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
