import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  ScrollView, Alert, Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useWebRTC, type CallMode, type QualityLevel } from "@/hooks/useWebRTC";
import { VideoStream } from "@/components/VideoStream";

// ── Quality badge ─────────────────────────────────────────────────────────────
const QUALITY_CONFIG: Record<QualityLevel, { color: string; dot: string; label: string }> = {
  excellent: { color: "#10b981", dot: "#10b981", label: "Excellent" },
  good:      { color: "#84cc16", dot: "#84cc16", label: "Good" },
  fair:      { color: "#f59e0b", dot: "#f59e0b", label: "Fair — consider audio only" },
  poor:      { color: "#ef4444", dot: "#ef4444", label: "Poor — switch to audio only" },
  unknown:   { color: "#6b7280", dot: "#6b7280", label: "Measuring…" },
};

function QualityBadge({ level }: { level: QualityLevel }) {
  const q = QUALITY_CONFIG[level];
  return (
    <View style={[qbs.pill, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
      <View style={[qbs.dot, { backgroundColor: q.dot }]} />
      <Text style={qbs.text}>{q.label}</Text>
    </View>
  );
}
const qbs = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dot:  { width: 7, height: 7, borderRadius: 4 },
  text: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
});

// ── Async video recorder (web only) ──────────────────────────────────────────
function useAsyncRecorder() {
  const [recording, setRecording]     = useState(false);
  const [elapsed, setElapsed]         = useState(0);
  const [blobUrl, setBlobUrl]         = useState<string | null>(null);
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const previewRef    = useRef<HTMLVideoElement>(null);

  const start = useCallback(async () => {
    if (Platform.OS !== "web") { Alert.alert("Not supported", "Async recording requires the web app."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, frameRate: 10 },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play();
      }

      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm",
      });
      recorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        setBlobUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start(1000);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      Alert.alert("Camera access denied", "Please allow camera & microphone access to record.");
    }
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const reset = useCallback(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setElapsed(0);
    setRecording(false);
  }, [blobUrl]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { recording, elapsed, blobUrl, previewRef, start, stop, reset };
}

function fmtSec(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sc = (s % 60).toString().padStart(2, "0");
  return `${m}:${sc}`;
}

// ── Playback component (web) ──────────────────────────────────────────────────
function AsyncPlayer({ blobUrl }: { blobUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.src = blobUrl;
  }, [blobUrl]);
  if (Platform.OS !== "web") return null;
  return (
    /* @ts-ignore */
    <video ref={videoRef} controls style={{ width: "100%", borderRadius: 12, backgroundColor: "#000", maxHeight: 200 } as React.CSSProperties} />
  );
}

// ── Live preview during recording ─────────────────────────────────────────────
function AsyncPreview({ previewRef }: { previewRef: React.RefObject<HTMLVideoElement> }) {
  if (Platform.OS !== "web") return null;
  return (
    /* @ts-ignore */
    <video ref={previewRef} autoPlay muted playsInline style={{ width: "100%", borderRadius: 12, backgroundColor: "#000", maxHeight: 200, transform: "scaleX(-1)" } as React.CSSProperties} />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CallScreen() {
  const { id: consultationId, patientName } = useLocalSearchParams<{ id: string; patientName?: string }>();
  const { user } = useAuth();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { width } = Dimensions.get("window");

  const [mode, setMode]     = useState<CallMode>("video");
  const [preset]            = useState<"economy" | "standard">("economy");

  const peerId = user?.id ?? "guest";
  const userId = user?.id ?? "guest";
  const role   = user?.role ?? "Doctor";

  const {
    localStream, remoteStream, peerState, qualityLevel,
    isMuted, isCameraOff, isSupported,
    toggleMute, toggleCamera, hangUp, switchMode,
  } = useWebRTC({ roomId: consultationId ?? "", peerId, userId, role, mode, preset });

  const asyncRec = useAsyncRecorder();

  function handleModeSwitch(m: CallMode) {
    if (m === mode) return;
    if (mode !== "async") switchMode(m);
    setMode(m);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleHangUp() {
    hangUp();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.back();
  }

  const stateLabel: Record<string, string> = {
    idle:         "Initialising…",
    connecting:   "Connecting…",
    connected:    "Connected",
    reconnecting: "Reconnecting…",
    failed:       "Connection failed",
    ended:        "Call ended",
  };

  const isConnected  = peerState === "connected";
  const isLive       = mode !== "async";
  const showAutoDowngrade = qualityLevel === "poor" && mode === "video";

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top + 16;
  const botPad = Platform.OS === "web" ? insets.bottom + 34 : insets.bottom + 16;

  return (
    <View style={[ss.root, { backgroundColor: "#0d0d14" }]}>
      <StatusBar style="light" />

      {/* ── Mode selector ── */}
      <View style={[ss.modeBar, { top: topPad }]}>
        {([["video", "video", "Live Video"], ["audio", "mic", "Audio Only"], ["async", "upload", "Async Note"]] as const).map(([m, icon, label]) => (
          <TouchableOpacity
            key={m}
            style={[ss.modeBtn, mode === m && ss.modeBtnActive]}
            onPress={() => handleModeSwitch(m)}
          >
            <Feather name={icon} size={14} color={mode === m ? "#fff" : "#9ca3af"} />
            <Text style={[ss.modeBtnText, mode === m && ss.modeBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Video area ── */}
      {isLive && (
        <View style={ss.videoArea}>
          {/* Remote (full screen) */}
          <VideoStream
            stream={remoteStream}
            style={ss.remoteVideo}
            label={isConnected ? patientName ?? "Remote" : undefined}
            noStream={!isConnected || !remoteStream}
          />

          {/* Local (PiP) — only for video mode */}
          {mode === "video" && (
            <VideoStream
              stream={localStream}
              muted
              isMirror
              noVideo={isCameraOff}
              style={[ss.localPip, { right: 16, bottom: 160 }]}
            />
          )}

          {/* Status overlay */}
          {!isConnected && (
            <View style={ss.statusOverlay}>
              <Feather name={peerState === "failed" ? "wifi-off" : "loader"} size={32} color="#fff" />
              <Text style={ss.statusText}>{stateLabel[peerState] ?? "…"}</Text>
              {mode === "audio" && !isConnected && (
                <Text style={ss.statusSub}>Audio-only mode — optimised for 2G networks</Text>
              )}
            </View>
          )}

          {/* Quality badge */}
          {isConnected && (
            <View style={[ss.qualityBadge]}>
              <QualityBadge level={qualityLevel} />
            </View>
          )}

          {/* Auto-downgrade banner */}
          {showAutoDowngrade && (
            <View style={ss.downgradeBanner}>
              <Feather name="alert-triangle" size={14} color="#fbbf24" />
              <Text style={ss.downgradeText}>Poor connection — switch to Audio Only?</Text>
              <TouchableOpacity onPress={() => handleModeSwitch("audio")} style={ss.downgradeBtn}>
                <Text style={ss.downgradeBtnText}>Switch</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── Async mode UI ── */}
      {mode === "async" && (
        <ScrollView style={ss.asyncScroll} contentContainerStyle={[ss.asyncContent, { paddingTop: topPad + 48, paddingBottom: botPad + 80 }]}>
          <View style={ss.asyncCard}>
            <Text style={ss.asyncTitle}>Record Async Video Note</Text>
            <Text style={ss.asyncBody}>
              No live connection needed. Record a short video message (up to 90 seconds) — the specialist will review it when next online.
              {"\n\n"}Ideal for: low-bandwidth areas, offline periods, or non-urgent cases.
            </Text>

            {/* Bandwidth tips */}
            <View style={ss.tipRow}>
              <Feather name="wifi" size={14} color="#10b981" />
              <Text style={ss.tipText}>Economy encoding: 160×120 · 10fps · ~50 kbps</Text>
            </View>

            {!asyncRec.blobUrl ? (
              <>
                <AsyncPreview previewRef={asyncRec.previewRef} />
                {asyncRec.recording ? (
                  <>
                    <View style={ss.recIndicator}>
                      <View style={ss.recDot} />
                      <Text style={ss.recTimer}>{fmtSec(asyncRec.elapsed)} / 1:30</Text>
                    </View>
                    <TouchableOpacity style={[ss.bigBtn, { backgroundColor: "#ef4444" }]} onPress={asyncRec.stop}>
                      <Feather name="square" size={18} color="#fff" />
                      <Text style={ss.bigBtnText}>Stop Recording</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={[ss.bigBtn, { backgroundColor: "#0ea5e9" }]} onPress={asyncRec.start}>
                    <Feather name="video" size={18} color="#fff" />
                    <Text style={ss.bigBtnText}>Start Recording</Text>
                  </TouchableOpacity>
                )}
                {asyncRec.elapsed >= 90 && asyncRec.recording ? asyncRec.stop() : null}
              </>
            ) : (
              <>
                <Text style={[ss.asyncBody, { color: "#10b981", marginBottom: 8 }]}>Recording complete ({fmtSec(asyncRec.elapsed)})</Text>
                <AsyncPlayer blobUrl={asyncRec.blobUrl} />
                <View style={ss.asyncActions}>
                  <TouchableOpacity style={[ss.bigBtn, { backgroundColor: "#10b981", flex: 1 }]} onPress={() => {
                    Alert.alert(
                      "Message Queued",
                      "Your video note has been queued. It will be delivered to the specialist when the connection is restored.",
                      [{ text: "OK", onPress: () => router.back() }],
                    );
                  }}>
                    <Feather name="send" size={16} color="#fff" />
                    <Text style={ss.bigBtnText}>Send to Specialist</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[ss.bigBtn, { backgroundColor: "#374151", flex: 0, paddingHorizontal: 16 }]} onPress={asyncRec.reset}>
                    <Feather name="trash-2" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={[ss.asyncCard, { marginTop: 16 }]}>
            <Text style={ss.asyncTitle}>Connectivity guide</Text>
            {[
              { icon: "check-circle" as const, color: "#10b981", label: "2G / EDGE (< 0.5 Mbps)", tip: "Use Async Note or Audio Only" },
              { icon: "check-circle" as const, color: "#84cc16", label: "3G (~1 Mbps)", tip: "Audio Only or Economy video" },
              { icon: "check-circle" as const, color: "#0ea5e9", label: "4G / Wi-Fi (> 2 Mbps)", tip: "Live Video works well" },
            ].map((row) => (
              <View key={row.label} style={ss.guideRow}>
                <Feather name={row.icon} size={14} color={row.color} />
                <View style={{ flex: 1 }}>
                  <Text style={ss.guideLabel}>{row.label}</Text>
                  <Text style={ss.guideTip}>{row.tip}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Controls bar (live modes) ── */}
      {isLive && (
        <View style={[ss.controls, { bottom: botPad }]}>
          <TouchableOpacity
            style={[ss.ctrlBtn, isMuted && ss.ctrlBtnActive]}
            onPress={() => { toggleMute(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? "#fbbf24" : "#fff"} />
            <Text style={[ss.ctrlLabel, isMuted && { color: "#fbbf24" }]}>{isMuted ? "Unmute" : "Mute"}</Text>
          </TouchableOpacity>

          {mode === "video" && (
            <TouchableOpacity
              style={[ss.ctrlBtn, isCameraOff && ss.ctrlBtnActive]}
              onPress={() => { toggleCamera(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name={isCameraOff ? "video-off" : "video"} size={22} color={isCameraOff ? "#fbbf24" : "#fff"} />
              <Text style={[ss.ctrlLabel, isCameraOff && { color: "#fbbf24" }]}>{isCameraOff ? "Cam On" : "Cam Off"}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={ss.endBtn} onPress={handleHangUp}>
            <Feather name="phone-off" size={24} color="#fff" />
            <Text style={ss.endBtnLabel}>End</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={ss.ctrlBtn}
            onPress={() => handleModeSwitch(mode === "video" ? "audio" : "video")}
          >
            <Feather name={mode === "video" ? "mic" : "video"} size={22} color="#fff" />
            <Text style={ss.ctrlLabel}>{mode === "video" ? "Audio only" : "Add video"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={ss.ctrlBtn}
            onPress={() => handleModeSwitch("async")}
          >
            <Feather name="upload" size={22} color="#fff" />
            <Text style={ss.ctrlLabel}>Async</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Back button */}
      <TouchableOpacity style={[ss.backBtn, { top: topPad - 4 }]} onPress={() => { hangUp(); router.back(); }}>
        <Feather name="chevron-left" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d0d14" },

  // Mode bar
  modeBar: {
    position: "absolute", left: 60, right: 16, zIndex: 20,
    flexDirection: "row", gap: 8,
  },
  modeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  modeBtnActive: { backgroundColor: "rgba(14,165,233,0.7)" },
  modeBtnText:   { color: "#9ca3af", fontSize: 12, fontFamily: "Inter_500Medium" },
  modeBtnTextActive: { color: "#fff" },

  // Video
  videoArea: { flex: 1 },
  remoteVideo: { flex: 1, borderRadius: 0 },
  localPip: {
    position: "absolute", width: 100, height: 140,
    borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
  },

  // Overlays
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center", gap: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  statusText:    { color: "#fff",     fontSize: 18, fontFamily: "Inter_600SemiBold" },
  statusSub:     { color: "#9ca3af", fontSize: 13, textAlign: "center", paddingHorizontal: 32 },
  qualityBadge:  { position: "absolute", top: 52, alignSelf: "center" },

  downgradeBanner: {
    position: "absolute", left: 16, right: 16, bottom: 130,
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "#f59e0b",
  },
  downgradeText: { flex: 1, color: "#fbbf24", fontSize: 12, fontFamily: "Inter_400Regular" },
  downgradeBtn:  { backgroundColor: "#f59e0b", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  downgradeBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Controls
  controls: {
    position: "absolute", left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 16, gap: 8,
  },
  ctrlBtn: {
    alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    width: 64, height: 64, borderRadius: 32, justifyContent: "center",
  },
  ctrlBtnActive: { backgroundColor: "rgba(251,191,36,0.18)" },
  ctrlLabel:     { color: "#d1d5db", fontSize: 9, fontFamily: "Inter_400Regular" },
  endBtn: {
    alignItems: "center", gap: 4,
    backgroundColor: "#ef4444",
    width: 72, height: 72, borderRadius: 36, justifyContent: "center",
  },
  endBtnLabel: { color: "#fff", fontSize: 9, fontFamily: "Inter_600SemiBold" },

  // Back
  backBtn: {
    position: "absolute", left: 12, zIndex: 30,
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  // Async
  asyncScroll: { flex: 1 },
  asyncContent: { paddingHorizontal: 16, gap: 0 },
  asyncCard: {
    backgroundColor: "#1a1a2e", borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: "#2d2d44",
  },
  asyncTitle:   { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  asyncBody:    { color: "#9ca3af", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  tipRow:       { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 14 },
  tipText:      { color: "#10b981", fontSize: 12, fontFamily: "Inter_400Regular" },
  recIndicator: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  recDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  recTimer:     { color: "#ef4444", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  bigBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 12,
  },
  bigBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  asyncActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  guideRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#2d2d44",
  },
  guideLabel: { color: "#e5e7eb", fontSize: 13, fontFamily: "Inter_500Medium" },
  guideTip:   { color: "#6b7280", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});
