import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenPadding } from "@/hooks/useScreenPadding";
import { useApp, type Consultation, type Screening } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { SyncBanner } from "@/components/SyncBanner";

type QueueFilter = "All" | "Emergency" | "Urgent" | "New" | "Follow-up";

type QueueItem = {
  kind: "consultation" | "screening";
  id: string;
  patientId: string;
  title: string;
  subtitle: string;
  detail: string;
  priority: "Emergency" | "Urgent" | "Routine";
  timestamp: string;
  status: string;
};

const priorityRank: Record<QueueItem["priority"], number> = {
  Emergency: 0,
  Urgent: 1,
  Routine: 2,
};

function patientName(patients: ReturnType<typeof useApp>["patients"], patientId: string) {
  const patient = patients.find((item) => item.id === patientId);
  return patient ? `${patient.firstName} ${patient.lastName}` : "Patient record";
}

function formatAge(isoDate: string) {
  const age = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (age < 1) return "Today";
  if (age === 1) return "Yesterday";
  if (age < 7) return `${age} days ago`;
  return new Date(isoDate).toLocaleDateString("en-UG", { day: "numeric", month: "short" });
}

function consultationQueueItem(
  consultation: Consultation,
  patients: ReturnType<typeof useApp>["patients"],
): QueueItem {
  const priority = consultation.priority;
  const name = patientName(patients, consultation.patientId);
  return {
    kind: "consultation",
    id: consultation.id,
    patientId: consultation.patientId,
    title: name,
    subtitle: consultation.clinicalNotes || "Teleconsultation request",
    detail: `${consultation.status} · ${formatAge(consultation.requestedAt)}`,
    priority,
    timestamp: consultation.requestedAt,
    status: consultation.status,
  };
}

function screeningQueueItem(
  screening: Screening,
  patients: ReturnType<typeof useApp>["patients"],
): QueueItem {
  const priority = screening.aiRiskLevel === "Urgent" || screening.aiRiskLevel === "Severe"
    ? "Urgent"
    : "Routine";
  return {
    kind: "screening",
    id: screening.id,
    patientId: screening.patientId,
    title: patientName(patients, screening.patientId),
    subtitle: screening.aiFindings?.[0] || "Screening awaiting clinical review",
    detail: `AI ${screening.aiRiskLevel} · ${formatAge(screening.capturedAt)}`,
    priority,
    timestamp: screening.capturedAt,
    status: screening.status,
  };
}

function isOpenConsultation(c: Consultation) {
  return c.status !== "Completed" && c.status !== "Cancelled";
}

function StatTile({
  label,
  value,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress?: () => void;
}) {
  const colors = useColors();
  const content = (
    <>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon} size={17} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </>
  );

  return onPress ? (
    <TouchableOpacity
      style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {content}
    </TouchableOpacity>
  ) : (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {content}
    </View>
  );
}

export function OphthalmologistDashboard() {
  const colors = useColors();
  const r = useResponsive();
  const { topPad, botPad } = useScreenPadding();
  const {
    patients,
    screenings,
    consultations,
    referrals,
    isOnline,
    isSyncing,
    lastSyncAt,
    lastSyncError,
    pendingCount,
    refresh,
  } = useApp();
  const { user } = useAuth();
  const [filter, setFilter] = useState<QueueFilter>("All");

  const openConsultations = useMemo(
    () => consultations.filter(isOpenConsultation),
    [consultations],
  );

  const queue = useMemo(() => {
    const consultationItems = openConsultations.map((item) => consultationQueueItem(item, patients));
    const pendingScreenings = screenings
      .filter((item) => item.status === "Pending" || item.status === "Screened")
      .map((item) => screeningQueueItem(item, patients));
    return [...consultationItems, ...pendingScreenings]
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [openConsultations, screenings, patients]);

  const filteredQueue = useMemo(() => {
    if (filter === "All") return queue;
    if (filter === "Emergency") return queue.filter((item) => item.priority === "Emergency");
    if (filter === "Urgent") return queue.filter((item) => item.priority === "Urgent" || item.priority === "Emergency");
    if (filter === "New") return queue.filter((item) => item.kind === "screening" || item.status === "Pending");
    return consultations
      .filter((item) => isOpenConsultation(item) && item.followUpDate)
      .map((item) => consultationQueueItem(item, patients))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [filter, queue, consultations, patients]);

  const stats = useMemo(() => {
    const urgentScreenings = screenings.filter(
      (item) => (item.aiRiskLevel === "Urgent" || item.aiRiskLevel === "Severe") && item.status !== "Reviewed",
    ).length;
    const emergencyConsults = openConsultations.filter((item) => item.priority === "Emergency").length;
    const followUps = consultations.filter(
      (item) => isOpenConsultation(item) && Boolean(item.followUpDate),
    ).length;
    return {
      needsReview: screenings.filter((item) => item.status === "Pending" || item.status === "Screened").length
        + openConsultations.filter((item) => item.status === "Assigned" || item.status === "InReview").length,
      urgent: urgentScreenings + emergencyConsults,
      followUps,
      referrals: referrals.filter((item) => item.status === "Pending" || item.status === "Accepted").length,
    };
  }, [screenings, openConsultations, consultations, referrals]);

  const queueLabel = filter === "Follow-up" ? "Follow-up plan" : `${filter === "All" ? "Priority" : filter.toLowerCase()} queue`;
  const dateLabel = new Date().toLocaleDateString("en-UG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function openQueueItem(item: QueueItem) {
    router.push(item.kind === "consultation"
      ? `/consultation/${item.id}`
      : `/screening/${item.id}`);
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 104 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CLINICAL WORKSPACE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            {user?.fullName?.split(" ")[0] || "Doctor"}
          </Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{dateLabel}</Text>
        </View>
        <TouchableOpacity
          style={[styles.profileButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/profile" as never)}
          accessibilityLabel="Open profile settings"
        >
          <Text style={styles.profileInitials}>
            {(user?.fullName || "DR").split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.scopeBanner, { backgroundColor: `${colors.primary}0d`, borderColor: `${colors.primary}28` }]}>
        <Feather name="lock" size={15} color={colors.primary} />
        <View style={styles.scopeCopy}>
          <Text style={[styles.scopeTitle, { color: colors.foreground }]}>Your assigned clinical workspace</Text>
          <Text style={[styles.scopeText, { color: colors.mutedForeground }]}>
            Showing cases assigned to you and patients linked to your care team.
          </Text>
        </View>
      </View>

      <SyncBanner
        isOnline={isOnline}
        isSyncing={isSyncing}
        lastSyncAt={lastSyncAt}
        lastSyncError={lastSyncError}
        pendingCount={pendingCount}
        onRetry={() => refresh()}
      />

      <View style={styles.statsGrid}>
        <StatTile label="Needs review" value={stats.needsReview} icon="inbox" color="#0ea5e9" onPress={() => setFilter("New")} />
        <StatTile label="Urgent" value={stats.urgent} icon="alert-triangle" color="#dc2626" onPress={() => setFilter("Urgent")} />
        <StatTile label="Follow-ups" value={stats.followUps} icon="calendar" color="#d97706" onPress={() => setFilter("Follow-up")} />
        <StatTile label="Referrals" value={stats.referrals} icon="corner-up-right" color="#059669" onPress={() => router.push("/(tabs)/consultations")} />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.primaryAction, { backgroundColor: colors.primary }]}
          onPress={() => setFilter("All")}
          activeOpacity={0.85}
        >
          <Feather name="inbox" size={17} color="#fff" />
          <Text style={styles.primaryActionText}>Open clinical queue</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryAction, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/(tabs)/patients")}
          activeOpacity={0.85}
        >
          <Feather name="search" size={17} color={colors.foreground} />
          <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Find patient</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Work queue</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            {filteredQueue.length} {queueLabel} {filteredQueue.length === 1 ? "case" : "cases"}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/(tabs)/consultations")}>
          <Text style={[styles.seeAll, { color: colors.primary }]}>View all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(["All", "Emergency", "Urgent", "New", "Follow-up"] as QueueFilter[]).map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === item ? colors.primary : colors.card,
                borderColor: filter === item ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterChipText, { color: filter === item ? "#fff" : colors.mutedForeground }]}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.queueList}>
        {filteredQueue.slice(0, 8).map((item) => {
          const isEmergency = item.priority === "Emergency";
          const isUrgent = item.priority === "Urgent";
          const accent = isEmergency ? "#b91c1c" : isUrgent ? "#dc2626" : colors.primary;
          return (
            <TouchableOpacity
              key={`${item.kind}-${item.id}`}
              style={[styles.queueCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openQueueItem(item)}
              activeOpacity={0.82}
            >
              <View style={[styles.priorityRail, { backgroundColor: accent }]} />
              <View style={[styles.queueIcon, { backgroundColor: `${accent}14` }]}>
                <Feather name={item.kind === "consultation" ? "message-circle" : "image"} size={17} color={accent} />
              </View>
              <View style={styles.queueCopy}>
                <View style={styles.queueTitleRow}>
                  <Text style={[styles.queueTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.queueTime, { color: colors.mutedForeground }]}>{formatAge(item.timestamp)}</Text>
                </View>
                <Text style={[styles.queueSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
                <View style={styles.queueMetaRow}>
                  <Text style={[styles.queueMeta, { color: accent }]}>{item.priority}</Text>
                  <Text style={[styles.queueMeta, { color: colors.mutedForeground }]}>{item.detail}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </TouchableOpacity>
          );
        })}
        {filteredQueue.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.success}18` }]}>
              <Feather name="check" size={20} color={colors.success} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Queue is clear</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No cases match this filter. New assigned work will appear here.
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.footerNote, { borderTopColor: colors.border }]}>
        <Feather name="info" size={14} color={colors.mutedForeground} />
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          AI findings are decision support only. Confirm image quality and clinical context before acting.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerCopy: { flex: 1, paddingRight: 12 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  title: { fontSize: 25, fontWeight: "800", letterSpacing: -0.4 },
  date: { fontSize: 13, marginTop: 5 },
  profileButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  profileInitials: { color: "#fff", fontSize: 14, fontWeight: "800" },
  scopeBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 13, borderWidth: 1, borderRadius: 13 },
  scopeCopy: { flex: 1, gap: 3 },
  scopeTitle: { fontSize: 13, fontWeight: "700" },
  scopeText: { fontSize: 12, lineHeight: 18 },
  statsGrid: { flexDirection: "row", gap: 9 },
  statTile: { flex: 1, minHeight: 112, padding: 11, borderWidth: 1, borderRadius: 13, gap: 3 },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontSize: 23, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 9 },
  primaryAction: { flex: 1.3, minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryActionText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  secondaryAction: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryActionText: { fontSize: 13, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 5 },
  sectionTitle: { fontSize: 19, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  seeAll: { fontSize: 13, fontWeight: "700", paddingBottom: 2 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontWeight: "700" },
  queueList: { gap: 9 },
  queueCard: { minHeight: 82, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, overflow: "hidden" },
  priorityRail: { width: 4, alignSelf: "stretch" },
  queueIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginLeft: 11, marginRight: 10 },
  queueCopy: { flex: 1, paddingVertical: 11 },
  queueTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  queueTitle: { flex: 1, fontSize: 14, fontWeight: "800" },
  queueTime: { fontSize: 10, fontWeight: "600" },
  queueSubtitle: { fontSize: 12, marginTop: 4 },
  queueMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  queueMeta: { fontSize: 10, fontWeight: "700" },
  emptyState: { alignItems: "center", padding: 24, borderWidth: 1, borderRadius: 13 },
  emptyIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyText: { textAlign: "center", fontSize: 12, lineHeight: 18, marginTop: 4, maxWidth: 280 },
  footerNote: { borderTopWidth: 1, paddingTop: 13, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  footerText: { flex: 1, fontSize: 11, lineHeight: 17 },
});