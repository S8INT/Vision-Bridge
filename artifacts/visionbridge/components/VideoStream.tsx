import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";
import { Feather } from "@expo/vector-icons";

interface Props {
  stream:    MediaStream | null;
  muted?:    boolean;
  style?:    object;
  label?:    string;
  isMirror?: boolean;
  noVideo?:  boolean;
  noStream?: boolean;
}

/**
 * Renders a MediaStream into a <video> element on web.
 * Shows a placeholder avatar when stream is absent.
 */
export function VideoStream({ stream, muted = false, style, label, isMirror, noVideo, noStream }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = videoRef.current;
    if (!el) return;
    if (stream && !noVideo) {
      el.srcObject = stream;
      el.play().catch(() => {/* autoplay blocked */});
    } else {
      el.srcObject = null;
    }
  }, [stream, noVideo]);

  if (Platform.OS !== "web") {
    return (
      <View style={[ss.container, style]}>
        <Feather name="video-off" size={32} color="#9ca3af" />
        <Text style={ss.unsupported}>Video calls require the web app</Text>
      </View>
    );
  }

  if (!stream || noStream) {
    return (
      <View style={[ss.container, ss.placeholder, style]}>
        <View style={ss.avatarCircle}>
          <Feather name="user" size={28} color="#9ca3af" />
        </View>
        {label ? <Text style={ss.label}>{label}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[ss.container, style]}>
      {/* @ts-ignore — react-native-web passes through unknown elements */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: "100%", height: "100%", objectFit: "cover",
          transform: isMirror ? "scaleX(-1)" : undefined,
          borderRadius: "inherit",
          backgroundColor: "#111",
        } as React.CSSProperties}
      />
      {label ? <Text style={ss.overlayLabel}>{label}</Text> : null}
    </View>
  );
}

const ss = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { gap: 10 },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#374151",
    alignItems: "center", justifyContent: "center",
  },
  label: { color: "#9ca3af", fontSize: 12, marginTop: 6 },
  overlayLabel: {
    position: "absolute", bottom: 8, left: 8,
    color: "#fff", fontSize: 11, backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  unsupported: { color: "#9ca3af", fontSize: 12, marginTop: 8, textAlign: "center" },
});
