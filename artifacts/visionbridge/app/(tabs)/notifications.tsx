import React from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, Notification } from "@/context/AppContext";
import * as Haptics from "expo-haptics";

function getNotificationIcon(type: Notification["type"]) {
  switch (type) {
    case "ConsultationUpdate":
      return "message-circle";
    case "ScreeningReviewed":
      return "eye";
    case "PatientReferred":
      return "alert-circle";
    case "SystemAlert":
      return "info";
    default:
      return "bell";
  }
}

function getIconColor(type: Notification["type"], colors: ReturnType<typeof useColors>) {
  switch (type) {
    case "ConsultationUpdate":
      return colors.accent;
    case "ScreeningReviewed":
      return colors.success;
    case "PatientReferred":
      return colors.destructive;
    case "SystemAlert":
      return colors.primary;
    default:
      return colors.primary;
  }
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "Just now";
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp();

  const sorted = [...notifications].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );
  const unread = notifications.filter((n) => !n.read).length;

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  function handleNotificationPress(n: Notification) {
    markNotificationRead(n.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (n.consultationId) {
      router.push(`/consultation/${n.consultationId}`);
    } else if (n.screeningId) {
      router.push(`/screening/${n.screeningId}`);
    } else if (n.patientId) {
      router.push(`/patient/${n.patientId}`);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Notifications
        </Text>
        {unread > 0 ? (
          <TouchableOpacity
            onPress={() => {
              markAllNotificationsRead();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.markAll, { color: colors.primary }]}>
              Mark all read
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => {
          const iconColor = getIconColor(item.type, colors);
          return (
            <TouchableOpacity
              onPress={() => handleNotificationPress(item)}
              activeOpacity={0.8}
              style={[
                styles.row,
                {
                  backgroundColor: item.read ? colors.background : colors.secondary + "80",
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: iconColor + "18" },
                ]}
              >
                <Feather
                  name={getNotificationIcon(item.type) as keyof typeof Feather.glyphMap}
                  size={18}
                  color={iconColor}
                />
              </View>
              <View style={styles.notifContent}>
                <View style={styles.titleRow}>
                  <Text
                    style={[
                      styles.notifTitle,
                      {
                        color: colors.foreground,
                        fontWeight: item.read ? "500" : "700",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {!item.read ? (
                    <View
                      style={[
                        styles.unreadDot,
                        { backgroundColor: colors.primary },
                      ]}
                    />
                  ) : null}
                </View>
                <Text
                  style={[styles.notifBody, { color: colors.mutedForeground }]}
                  numberOfLines={2}
                >
                  {item.body}
                </Text>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {formatRelativeTime(item.createdAt)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: botPad + 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="bell-off" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No notifications
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        scrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "700" },
  markAll: { fontSize: 14, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  notifContent: { flex: 1, gap: 3 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notifTitle: { flex: 1, fontSize: 14 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  notifBody: { fontSize: 13, lineHeight: 19 },
  time: { fontSize: 11, marginTop: 2 },
  empty: { alignItems: "center", gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 16 },
});
