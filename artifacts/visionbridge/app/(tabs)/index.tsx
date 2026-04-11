import React, { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScreeningCard } from "@/components/ScreeningCard";
import { ConsultationCard } from "@/components/ConsultationCard";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, patients, screenings, consultations, unreadCount } = useApp();

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayScreenings = screenings.filter(
      (s) => new Date(s.capturedAt) >= today
    );
    const pending = screenings.filter((s) => s.status === "Pending");
    const urgent = screenings.filter(
      (s) => s.aiRiskLevel === "Urgent" || s.aiRiskLevel === "Severe"
    );
    const openConsultations = consultations.filter(
      (c) => c.status === "Open" || c.status === "InReview"
    );
    return { todayScreenings, pending, urgent, openConsultations };
  }, [screenings, consultations]);

  const recentScreenings = screenings.slice(0, 3);
  const activeConsultations = consultations
    .filter((c) => c.status !== "Closed")
    .slice(0, 3);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 16, paddingBottom: botPad + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            Good morning
          </Text>
          <Text style={[styles.userName, { color: colors.foreground }]}>
            {currentUser.name}
          </Text>
          <Text style={[styles.clinic, { color: colors.mutedForeground }]}>
            {currentUser.clinic}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/notifications")}
          style={[styles.notifBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="bell" size={20} color={colors.foreground} />
          {unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={[styles.syncBanner, { backgroundColor: colors.successLight, borderColor: colors.normalBorder }]}>
        <Feather name="wifi" size={14} color={colors.success} />
        <Text style={[styles.syncText, { color: colors.normalText }]}>
          Online · Last synced 2 min ago
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          label="Today's Screenings"
          value={stats.todayScreenings.length}
          icon="camera"
          color={colors.primary}
        />
        <StatCard
          label="Pending Review"
          value={stats.pending.length}
          icon="clock"
          color={colors.warning}
        />
      </View>
      <View style={styles.statsGrid}>
        <StatCard
          label="Urgent Cases"
          value={stats.urgent.length}
          icon="alert-triangle"
          color={colors.destructive}
          subtitle={stats.urgent.length > 0 ? "Needs attention" : undefined}
        />
        <StatCard
          label="Open Consultations"
          value={stats.openConsultations.length}
          icon="message-circle"
          color={colors.accent}
        />
      </View>

      <View style={styles.quickActions}>
        <SectionHeader title="Quick Actions" />
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/patient/register")}
            activeOpacity={0.85}
          >
            <Feather name="user-plus" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Register Patient</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/screening/new")}
            activeOpacity={0.85}
          >
            <Feather name="camera" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>New Screening</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View>
        <SectionHeader
          title="Recent Screenings"
          actionLabel="See all"
          onAction={() => router.push("/(tabs)/patients")}
        />
        {recentScreenings.map((s) => {
          const pat = patients.find((p) => p.id === s.patientId);
          return (
            <ScreeningCard
              key={s.id}
              screening={s}
              patientName={pat ? `${pat.firstName} ${pat.lastName}` : undefined}
              onPress={() => router.push(`/screening/${s.id}`)}
            />
          );
        })}
      </View>

      <View style={{ marginTop: 8 }}>
        <SectionHeader
          title="Active Consultations"
          actionLabel="See all"
          onAction={() => router.push("/(tabs)/consultations")}
        />
        {activeConsultations.map((c) => {
          const pat = patients.find((p) => p.id === c.patientId);
          return (
            <ConsultationCard
              key={c.id}
              consultation={c}
              patient={pat}
              onPress={() => router.push(`/consultation/${c.id}`)}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 20 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  greeting: { fontSize: 13, fontWeight: "500", marginBottom: 2 },
  userName: { fontSize: 22, fontWeight: "700" },
  clinic: { fontSize: 12, marginTop: 2 },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  syncText: { fontSize: 12, fontWeight: "500" },
  statsGrid: { flexDirection: "row", gap: 12 },
  quickActions: {},
  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
