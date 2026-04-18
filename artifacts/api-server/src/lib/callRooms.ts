import type WebSocket from "ws";

export interface Peer {
  peerId: string;
  userId: string;
  role: string;
  ws: WebSocket;
  joinedAt: string;
}

export interface CallRoom {
  roomId: string;   // = consultationId
  peers: Map<string, Peer>;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

const rooms = new Map<string, CallRoom>();

export function getOrCreateRoom(roomId: string): CallRoom {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      peers: new Map(),
      createdAt: new Date().toISOString(),
    });
  }
  return rooms.get(roomId)!;
}

export function getRoom(roomId: string): CallRoom | undefined {
  return rooms.get(roomId);
}

export function addPeer(roomId: string, peer: Peer): void {
  const room = getOrCreateRoom(roomId);
  if (!room.startedAt && room.peers.size === 0) {
    room.startedAt = new Date().toISOString();
  }
  room.peers.set(peer.peerId, peer);
}

export function removePeer(roomId: string, peerId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  if (room.peers.size === 0) {
    room.endedAt = new Date().toISOString();
    rooms.delete(roomId);
  }
}

export function getPeers(roomId: string): Peer[] {
  return Array.from(rooms.get(roomId)?.peers.values() ?? []);
}

export function broadcast(roomId: string, fromPeerId: string, message: object): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const peer of room.peers.values()) {
    if (peer.peerId !== fromPeerId && peer.ws.readyState === 1) {
      peer.ws.send(payload);
    }
  }
}

export function sendToPeer(roomId: string, targetPeerId: string, message: object): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.peers.get(targetPeerId);
  if (peer && peer.ws.readyState === 1) {
    peer.ws.send(JSON.stringify(message));
  }
}
