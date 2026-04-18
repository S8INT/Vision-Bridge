import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { addPeer, removePeer, broadcast, sendToPeer, getPeers, getOrCreateRoom } from "../lib/callRooms";
import { logger } from "../lib/logger";

let wss: WebSocketServer | null = null;

export function getSignalingServer(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
    wss.on("connection", handleConnection);
  }
  return wss;
}

// ── Message types ────────────────────────────────────────────────────────────
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
