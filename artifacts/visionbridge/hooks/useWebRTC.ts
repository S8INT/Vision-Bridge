import { useRef, useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";

// ── Quality presets — tuned for Uganda 2G/3G conditions ──────────────────────
export type QualityPreset = "economy" | "standard";
export type CallMode      = "video" | "audio" | "async";
export type PeerState     = "idle" | "connecting" | "connected" | "reconnecting" | "failed" | "ended";
export type QualityLevel  = "excellent" | "good" | "fair" | "poor" | "unknown";

export const QUALITY_PRESETS: Record<QualityPreset, MediaTrackConstraints> = {
  // Economy: QVGA 10fps ~100 kbps — works on 2G/EDGE
  economy: {
    width: { ideal: 160, max: 160 }, height: { ideal: 120, max: 120 },
    frameRate: { ideal: 10, max: 15 }, facingMode: "user",
  },
  // Standard: HVGA 15fps ~300 kbps — comfortable on 3G
  standard: {
    width: { ideal: 320, max: 320 }, height: { ideal: 240, max: 240 },
    frameRate: { ideal: 15, max: 20 }, facingMode: "user",
  },
};

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function wsUrl(): string {
  const base = (process.env["EXPO_PUBLIC_API_URL"] ?? "")
    .replace(/^https/, "wss")
    .replace(/^http:/, "ws:");
  return `${base}/ws/signal`;
}

export interface UseWebRTCOptions {
  roomId:  string;
  peerId:  string;
  userId:  string;
  role:    string;
  mode:    CallMode;
  preset?: QualityPreset;
}

export interface UseWebRTCReturn {
  localStream:   MediaStream | null;
  remoteStream:  MediaStream | null;
  peerState:     PeerState;
  qualityLevel:  QualityLevel;
  isMuted:       boolean;
  isCameraOff:   boolean;
  isSupported:   boolean;
  toggleMute:    () => void;
  toggleCamera:  () => void;
  hangUp:        () => void;
  switchMode:    (m: CallMode) => void;
}

export function useWebRTC(opts: UseWebRTCOptions): UseWebRTCReturn {
  const { roomId, peerId, userId, role, preset = "economy" } = opts;

  const [mode, setMode]             = useState<CallMode>(opts.mode);
  const [localStream, setLocal]     = useState<MediaStream | null>(null);
  const [remoteStream, setRemote]   = useState<MediaStream | null>(null);
  const [peerState, setPeerState]   = useState<PeerState>("idle");
  const [qualityLevel, setQuality]  = useState<QualityLevel>("unknown");
  const [isMuted, setMuted]         = useState(false);
  const [isCameraOff, setCameraOff] = useState(false);

  const wsRef             = useRef<WebSocket | null>(null);
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const statsTimer        = useRef<ReturnType<typeof setInterval> | null>(null);
  const remotePeerIdRef   = useRef<string | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);

  const isSupported = Platform.OS === "web"
    && typeof RTCPeerConnection !== "undefined"
    && typeof navigator !== "undefined";

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (statsTimer.current) { clearInterval(statsTimer.current); statsTimer.current = null; }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "leave", roomId, peerId }));
        }
      } catch {/* ignore */}
      wsRef.current.onmessage = null;
      wsRef.current.onclose   = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocal(null);
    setRemote(null);
  }, [roomId, peerId]);

  // ── Quality monitoring ───────────────────────────────────────────────────────
  const startQualityMonitor = useCallback(() => {
    if (statsTimer.current) clearInterval(statsTimer.current);
    statsTimer.current = setInterval(async () => {
      const conn = pcRef.current;
      if (!conn || conn.connectionState !== "connected") return;
      try {
        const stats = await conn.getStats();
        let rttMs = 0; let lost = 0; let sent = 1;
        stats.forEach((r: RTCStats & Record<string, unknown>) => {
          if (r.type === "candidate-pair" && r["state"] === "succeeded") {
            rttMs = ((r["currentRoundTripTime"] as number) ?? 0) * 1000;
          }
          if (r.type === "outbound-rtp") {
            lost += (r["retransmittedPacketsSent"] as number) ?? 0;
            sent += (r["packetsSent"] as number) ?? 0;
          }
        });
        const loss = lost / sent;
        if      (rttMs < 100  && loss < 0.01) setQuality("excellent");
        else if (rttMs < 250  && loss < 0.03) setQuality("good");
        else if (rttMs < 500  && loss < 0.08) setQuality("fair");
        else                                  setQuality("poor");
      } catch {/* ignore */}
    }, 3000);
  }, []);

  // ── Create peer connection ───────────────────────────────────────────────────
  const createPC = useCallback((stream: MediaStream): RTCPeerConnection => {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = conn;

    stream.getTracks().forEach((t) => conn.addTrack(t, stream));

    const remoteMS = new MediaStream();
    conn.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => remoteMS.addTrack(t));
      setRemote(remoteMS);
    };

    conn.onicecandidate = (e) => {
      if (e.candidate && remotePeerIdRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "ice", roomId, to: remotePeerIdRef.current, from: peerId, candidate: e.candidate,
        }));
      }
    };

    conn.onconnectionstatechange = () => {
      switch (conn.connectionState) {
        case "connecting":    setPeerState("connecting");    break;
        case "connected":     setPeerState("connected");    startQualityMonitor(); break;
        case "disconnected":  setPeerState("reconnecting"); break;
        case "failed":        setPeerState("failed");       break;
        case "closed":        setPeerState("ended");        break;
      }
    };

    return conn;
  }, [roomId, peerId, startQualityMonitor]);

  // ── Main effect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupported || mode === "async") return;

    let cancelled = false;

    async function start() {
      try {
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        };

        const constraints: MediaStreamConstraints = mode === "audio"
          ? { audio: audioConstraints, video: false }
          : { audio: audioConstraints, video: QUALITY_PRESETS[preset] };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        localStreamRef.current = stream;
        setLocal(stream);
        setPeerState("connecting");

        const socket = new WebSocket(wsUrl());
        wsRef.current = socket;

        socket.onopen = () => {
          socket.send(JSON.stringify({ type: "join", roomId, peerId, userId, role }));
        };

        socket.onmessage = async (ev: MessageEvent) => {
          if (cancelled) return;
          const msg = JSON.parse(ev.data as string) as Record<string, unknown>;

          if (msg["type"] === "room-state") {
            const peers = msg["peers"] as Array<{ peerId: string }>;
            for (const other of peers) {
              remotePeerIdRef.current = other.peerId;
              const conn = createPC(stream);
              const offer = await conn.createOffer();
              await conn.setLocalDescription(offer);
              socket.send(JSON.stringify({ type: "offer", roomId, to: other.peerId, from: peerId, sdp: offer }));
            }
          }

          if (msg["type"] === "peer-joined") {
            remotePeerIdRef.current = msg["peerId"] as string;
          }

          if (msg["type"] === "offer") {
            remotePeerIdRef.current = msg["from"] as string;
            const conn = createPC(stream);
            await conn.setRemoteDescription(new RTCSessionDescription(msg["sdp"] as RTCSessionDescriptionInit));
            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            socket.send(JSON.stringify({ type: "answer", roomId, to: msg["from"], from: peerId, sdp: answer }));
          }

          if (msg["type"] === "answer" && pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg["sdp"] as RTCSessionDescriptionInit));
          }

          if (msg["type"] === "ice" && pcRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(msg["candidate"] as RTCIceCandidateInit)); } catch {/* ignore */}
          }

          if (msg["type"] === "peer-left") {
            setRemote(null);
            setPeerState("connecting");
          }
        };

        socket.onclose = () => {
          if (!cancelled && peerState !== "ended") setPeerState("failed");
        };
      } catch (err) {
        if (!cancelled) {
          setPeerState("failed");
          console.warn("[WebRTC] setup error", err);
        }
      }
    }

    start();
    return () => { cancelled = true; cleanup(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, mode, isSupported, preset]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMuted((v) => !v);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCameraOff((v) => !v);
  }, []);

  const hangUp = useCallback(() => {
    cleanup();
    setPeerState("ended");
  }, [cleanup]);

  const switchMode = useCallback((m: CallMode) => {
    cleanup();
    setPeerState("idle");
    setQuality("unknown");
    setMode(m);
  }, [cleanup]);

  return { localStream, remoteStream, peerState, qualityLevel, isMuted, isCameraOff, isSupported, toggleMute, toggleCamera, hangUp, switchMode };
}
