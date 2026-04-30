import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Props {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  onRetry: () => void;
}

/**
 * Live status banner for the dashboard:
 *  - Online + last-synced relative time (auto-updates every 15s)
 *  - Spinner while a sync is in progress
 *  - Offline / error state (red) with a tap-to-retry affordance
 */
export function SyncBanner({ isOnline, isSyncing, lastSyncAt, lastSyncError, onRetry }: Props) {
  const colors = useColors();
  const [, force] = useState(0);

  // Re-render once a minute so "2 min ago" stays accurate.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const offline = !isOnline;
  const bg = offline ? "#fef2f2" : colors.successLight;
  const border = offline ? "#fecaca" : colors.normalBorder;
  const fg = offline ? colors.destructive : colors.normalText;

  const label = (() => {
    if (isSyncing && !lastSyncAt) return "Syncing…";
    if (offline) return lastSyncAt ? `Offline · last synced ${formatRelative(lastSyncAt)}` : "Offline · waiting for connection";
    if (isSyncing) return "Syncing…";
    if (!lastSyncAt) return "Online";
    return `Online · last synced ${formatRelative(lastSyncAt)}`;
  })();

  return (
    <TouchableOpacity
      onPress={onRetry}
      activeOpacity={isSyncing ? 1 : 0.7}
      disabled={isSyncing}
      style={[s.banner, { backgroundColor: bg, borderColor: border }]}
    >
      {isSyncing ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Feather name={offline ? "wifi-off" : "wifi"} size={14} color={fg} />
      )}
      <Text style={[s.text, { color: fg }]} numberOfLines={1}>
        {label}
        {!!lastSyncError && offline ? "  ·  tap to retry" : ""}
      </Text>
      {!isSyncing && (
        <Feather name="refresh-cw" size={12} color={fg} style={{ opacity: 0.6 }} />
      )}
    </TouchableOpacity>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const s = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  text: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
});
