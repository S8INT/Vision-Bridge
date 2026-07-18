/**
 * More hub — secondary features that don't fit in the bottom tab bar.
 *
 * Sectioned list of the current role's remaining screens with icons,
 * short descriptions, count badges (unread alerts, pending uploads),
 * and chevrons. Every permitted screen not shown as a tab lives here.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useQueueAttention } from "@/hooks/useQueueAttention";
import { getRoleNav, SCREEN_META, screenTitle } from "@/lib/navConfig";

interface Row {
  key: string;
  title: string;
  description: string;
  icon: string;
  badge: number;
}

interface Section {
  title: string;
  rows: Row[];
}

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { unreadCount } = useApp();
  const role: UserRole = user?.role ?? "Viewer";
  const nav = getRoleNav(role);
  const queueCount = useQueueAttention(nav.more.includes("queue"));

  const sections: Section[] = [];
  for (const key of nav.more) {
    const meta = SCREEN_META[key];
    let badge = 0;
    if (key === "notifications") badge = unreadCount;
    if (key === "queue") badge = queueCount;
    const row: Row = {
      key,
      title: screenTitle(key, role),
      description: meta?.description ?? "",
      icon: meta?.feather ?? "circle",
      badge,
    };
    const sectionTitle = meta?.section ?? "Other";
    const existing = sections.find((s) => s.title === sectionTitle);
    if (existing) existing.rows.push(row);
    else sections.push({ title: sectionTitle, rows: [row] });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTitleRow}>
          <Feather name="grid" size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>More</Text>
        </View>
        <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
          Additional tools and features
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
      >
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
              {section.title.toUpperCase()}
            </Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.rows.map((row, i) => (
                <TouchableOpacity
                  key={row.key}
                  style={[
                    styles.row,
                    i < section.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/(tabs)/${row.key}` as any)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
                    <Feather name={row.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
                    <Text style={[styles.rowDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {row.description}
                    </Text>
                  </View>
                  {row.badge > 0 && (
                    <View style={[styles.countBadge, { backgroundColor: colors.destructive }]}>
                      <Text style={styles.countBadgeText}>{row.badge > 99 ? "99+" : row.badge}</Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
  },
  list: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1 },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 12.5,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
