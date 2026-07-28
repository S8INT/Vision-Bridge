import http from "http";
import app from "./app";
import { handleUpgrade } from "./routes/signal";
import { logger } from "./lib/logger";
import { initAuthStore, getDemoTenantId, isDbAvailable } from "./lib/authStore";
import { seedClinicalDemoData } from "./lib/clinicalSeed";

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

// A server 'error' event (e.g. EADDRINUSE, EACCES) with no listener is thrown
// as an uncaught exception with an unhelpful stack — surface it explicitly.
server.on("error", (err: NodeJS.ErrnoException) => {
  logger.fatal({ err, port }, "HTTP server error — shutting down");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

// Seed idempotent clinical demo data once auth store init resolves (DB mode only)
initAuthStore()
  .then(async () => {
    if (!isDbAvailable()) return;
    await seedClinicalDemoData(getDemoTenantId());
  })
  .catch((err) => {
    if (process.env["NODE_ENV"] === "production") {
      logger.fatal({ err }, "auth store initialization failed in production — shutting down");
      server.close(() => process.exit(1));
      // Force exit if close hangs
      setTimeout(() => process.exit(1), 5000).unref();
      return;
    }
    logger.error({ err }, "auth store init / clinical demo seed failed");
  });
