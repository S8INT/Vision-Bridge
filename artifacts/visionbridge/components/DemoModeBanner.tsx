import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;

let cachedIsMock: boolean | null = null;

export default function DemoModeBanner() {
  const [isMock, setIsMock] = useState<boolean>(cachedIsMock === true);

  useEffect(() => {
    if (cachedIsMock !== null) {
      setIsMock(cachedIsMock);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/healthz`, { timeoutMs: 8_000 });
        if (!res.ok) return;
        const data: { database?: string } = await res.json();
        const mock = data.database === "mock";
        cachedIsMock = mock;
        if (!cancelled) setIsMock(mock);
      } catch {
        // Health check failed — don't show the banner; other screens
        // already surface connectivity problems.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isMock) return null;

  return (
    <View style={s.banner} accessibilityRole="alert">
      <Text style={s.icon}>⚠️</Text>
      <Text style={s.text}>
        Demo mode — accounts and data will not be saved and may disappear when
        the server restarts.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  icon: {
    fontSize: 14,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: "#92400e",
    lineHeight: 18,
  },
});
