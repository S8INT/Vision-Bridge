import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { addPeer, removePeer, broadcast, sendToPeer, getPeers, getOrCreateRoom } from "../lib/callRooms";
import { logger } from "../lib/logger";

let wss: WebSocketServer | null = null;

export function getSignalingServer(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
    wss.on("connection", handleConnection);
    // Without an 'error' listener an emitted server error is rethrown and crashes
    // the process.
    wss.on("error", (err) => {
      logger.error({ err }, "WebSocket signaling server error");
    });
  }
  return wss;
}

// ── Message types ────────────────────────────────────────────────────────────
// Minimal WebRTC payload shapes (DOM lib types are unavailable in this Node build;
// the server only relays these blobs between peers and never inspects them).
type RTCSessionDescriptionInit = {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
};
type RTCIceCandidateInit = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

type SignalMessage =
  | { type: "join";      roomId: string; peerId: string; userId: string; role: string }
  | { type: "offer";     roomId: string; to: string;     from: string;  sdp: RTCSessionDescriptionInit }
  | { type: "answer";    roomId: string; to: string;     from: string;  sdp: RTCSessionDescriptionInit }
  | { type: "ice";       roomId: string; to: string;     from: string;  candidate: RTCIceCandidateInit }
  | { type: "leave";     roomId: string; peerId: string }
  | { type: "quality";   roomId: string; peerId: string; level: "video" | "audio" | "poor" };

// Map ws → (roomId, peerId) for cleanup
const connMeta = new WeakMap<WebSocket, { roomId: string; peerId: string }>();

function handleConnection(ws: WebSocket, _req: IncomingMessage) {
  ws.on("message", (raw) => {
    let msg: SignalMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    try {
      routeSignalMessage(ws, msg);
    } catch (err) {
      // A relay failure for one message must not tear down the connection or the
      // process — log it and inform the sender.
      logger.error({ err, type: msg.type }, "Failed to handle signaling message");
      try {
        ws.send(JSON.stringify({ type: "error", message: "Failed to process message" }));
      } catch {
        // socket already gone — nothing more to do
      }
    }
  });

  // A per-socket 'error' event with no listener crashes the process.
  ws.on("error", (err) => {
    const meta = connMeta.get(ws);
    logger.warn({ err, ...(meta ?? {}) }, "WebSocket connection error");
  });

  ws.on("close", () => {
    const meta = connMeta.get(ws);
    if (meta) {
      const { roomId, peerId } = meta;
      removePeer(roomId, peerId);
      broadcast(roomId, peerId, { type: "peer-left", peerId });
      connMeta.delete(ws);
      logger.info({ roomId, peerId }, "Peer disconnected from call room");
    }
  });
}

function routeSignalMessage(ws: WebSocket, msg: SignalMessage): void {
    switch (msg.type) {
      case "join": {
        const { roomId, peerId, userId, role } = msg;
        addPeer(roomId, { peerId, userId, role, ws, joinedAt: new Date().toISOString() });
        connMeta.set(ws, { roomId, peerId });

        // Tell the joiner who else is already in the room
        const others = getPeers(roomId).filter((p) => p.peerId !== peerId);
        ws.send(JSON.stringify({ type: "room-state", roomId, peers: others.map((p) => ({ peerId: p.peerId, userId: p.userId, role: p.role })) }));

        // Tell everyone else a new peer joined
        broadcast(roomId, peerId, { type: "peer-joined", peerId, userId, role });
        logger.info({ roomId, peerId, role }, "Peer joined call room");
        break;
      }

      case "offer":
      case "answer":
      case "ice":
        // Forward directly to target peer
        sendToPeer(msg.roomId, msg.to, msg);
        break;

      case "quality":
        // Broadcast quality hint to all peers in room (for UI feedback)
        broadcast(msg.roomId, msg.peerId, { type: "quality-hint", peerId: msg.peerId, level: msg.level });
        break;

      case "leave": {
        const { roomId, peerId } = msg;
        removePeer(roomId, peerId);
        broadcast(roomId, peerId, { type: "peer-left", peerId });
        connMeta.delete(ws);
        break;
      }
    }
}

// Handle the HTTP → WS upgrade
export function handleUpgrade(req: IncomingMessage, socket: import("net").Socket, head: Buffer) {
  const url = req.url ?? "";
  if (!url.startsWith("/ws/signal")) {
    socket.destroy();
    return;
  }
  const server = getSignalingServer();
  server.handleUpgrade(req, socket, head, (ws) => {
    server.emit("connection", ws, req);
  });
}
