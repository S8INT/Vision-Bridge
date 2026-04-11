import React, { useMemo, useState } from "react";
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
import { useApp, CareCoordinationStatus } from "@/context/AppContext";
import { ConsultationCard } from "@/components/ConsultationCard";

type FilterTab = "All" | "Pending" | "Assigned" | "InReview" | "Reviewed" | "Referred" | "Completed";

export default function ConsultationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { consultations, patients } = useApp();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  const filtered = useMemo(() => {
    if (activeTab === "All") return consultations;
    return consultations.filter((c) => c.status === activeTab);
  }, [consultations, activeTab]);

  const tabCounts = useMemo(
    () => ({
      All: consultations.length,
      Pending: consultations.filter((c) => c.status === "Pending").length,
      Assigned: consultations.filter((c) => c.status === "Assigned").length,
      InReview: consultations.filter((c) => c.status === "InReview").length,
      Reviewed: consultations.filter((c) => c.status === "Reviewed").length,
      Referred: consultations.filter((c) => c.status === "Referred").length,
      Completed: consultations.filter((c) => c.status === "Completed").length,
    }),
    [consultations]
  );

  const tabs: FilterTab[] = ["All", "Pending", "Assigned", "InReview", "Reviewed", "Referred", "Completed"];

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const urgentCount = consultations.filter((c) => c.priority === "Emergency" && c.status !== "Completed" && c.status !== "Cancelled").length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Consultations</Text>
          {urgentCount > 0 ? (
            <View style={[styles.urgentBadge, { backgroundColor: colors.destructive }]}>
              <Text style={styles.urgentBadgeText}>{urgentCount} EMERGENCY</Text>
            </View>
          ) : null}
        </View>
        <FlatList
          horizontal
          data={tabs}
          keyExtractor={(t) => t}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setActiveTab(item)}
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === item ? colors.primary : colors.muted,
                  borderColor: activeTab === item ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === item ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {item === "InReview" ? "In Review" : item}
                {tabCounts[item] > 0 ? ` (${tabCounts[item]})` : ""}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ gap: 8 }}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => {
          const pat = patients.find((p) => p.id === item.patientId);
          return (
            <ConsultationCard
              consultation={item}
              patient={pat}
              onPress={() => router.push(`/consultation/${item.id}`)}
            />
          );
        }}
        contentContainerStyle={[styles.list, { paddingBottom: botPad + 100 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No consultations in this queue
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
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 28, fontWeight: "700" },
  urgentBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  urgentBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: "600" },
  list: { padding: 16 },
  empty: { alignItems: "center", gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 16 },
});
