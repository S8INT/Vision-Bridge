import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp, Patient, RiskLevel } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";

function getRiskVariant(r: RiskLevel) {
  if (r === "Urgent" || r === "Severe") return "urgent";
  if (r === "Moderate") return "warning";
  if (r === "Mild") return "mild";
  return "success";
}

function progressPercent(screened: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((screened / target) * 100)) : 0;
}

export default function CampaignSessionScreen() {
  const { id: campaignId } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { campaigns, patients, screenings } = useApp();
  const [search, setSearch] = useState("");

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId),
    [campaigns, campaignId],
  );

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todaySessionScreenings = useMemo(
    () =>
      screenings.filter(
        (s) => s.campaignId === campaignId && new Date(s.capturedAt) >= todayStart,
      ),
    [screenings, campaignId, todayStart],
  );

  const screenedPatientIds = useMemo(
    () => new Set(todaySessionScreenings.map((s) => s.patientId)),
    [todaySessionScreenings],
  );

  const filteredPatients = useMemo(() => {
    const q = search.toLowerCase();
    return patients.filter(
      (p) =>
        q === "" ||
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.patientId.toLowerCase().includes(q) ||
        p.village.toLowerCase().includes(q),
    );
  }, [patients, search]);

  const readyPatients = useMemo(
    () => filteredPatients.filter((p) => !screenedPatientIds.has(p.id)),
    [filteredPatients, screenedPatientIds],
  );

  const donePatients = useMemo(
    () => filteredPatients.filter((p) => screenedPatientIds.has(p.id)),
    [filteredPatients, screenedPatientIds],
  );

  const pct = campaign ? progressPercent(campaign.screenedCount, campaign.targetCount) : 0;

  const topPad = insets.top + (Platform.OS === "android" ? 12 : 8);
  const botPad = insets.bottom;

  if (!campaign) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Campaign not found.</Text>
      </View>
    );
  }

  function screenPatient(patient: Patient) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(
      `/screening/new?patientId=${patient.id}&campaignId=${campaignId}&batch=1` as never,
    );
  }

  type ListItem =
    | { kind: "header-ready" }
    | { kind: "header-done" }
    | { kind: "empty-ready" }
    | { kind: "patient-ready"; patient: Patient }
    | { kind: "patient-done"; patient: Patient };

  const listData: ListItem[] = [
    { kind: "header-ready" },
    ...(readyPatients.length === 0
      ? [{ kind: "empty-ready" } as ListItem]
      : readyPatients.map((p) => ({ kind: "patient-ready", patient: p } as ListItem))),
    ...(donePatients.length > 0
      ? [
          { kind: "header-done" } as ListItem,
          ...donePatients.map((p) => ({ kind: "patient-done", patient: p } as ListItem)),
        ]
      : []),
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {campaign.name}
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {campaign.district} · Batch Session
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" }]}
            onPress={() => router.push(`/screening/new?campaignId=${campaignId}&batch=1` as never)}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={15} color={colors.primary} />
            <Text style={[styles.addBtnText, { color: colors.primary }]}>New</Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={styles.progressWrap}>
          <View style={styles.progressLabelRow}>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
              Overall progress
            </Text>
            <Text style={[styles.progressValue, { color: colors.foreground }]}>
              {campaign.screenedCount}/{campaign.targetCount}
              <Text style={{ color: colors.primary }}> ({pct}%)</Text>
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${pct}%` as any,
                  backgroundColor: pct >= 100 ? colors.success : colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Feather name="check-circle" size={11} color={colors.success} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                {todaySessionScreenings.length} today
              </Text>
            </View>
            <View style={styles.statChip}>
              <Feather name="alert-triangle" size={11} color={colors.destructive} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                {campaign.referredCount} referred
              </Text>
            </View>
            <View style={styles.statChip}>
              <Feather name="users" size={11} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                {campaign.targetCount - campaign.screenedCount} remaining
              </Text>
            </View>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search patients by name, ID, or village…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Patient List ── */}
      <FlatList
        data={listData}
        keyExtractor={(item, idx) => {
          if (item.kind === "patient-ready" || item.kind === "patient-done") return item.patient.id;
          return `${item.kind}-${idx}`;
        }}
        contentContainerStyle={{ paddingBottom: botPad + 24, paddingTop: 8 }}
        renderItem={({ item }) => {
          if (item.kind === "header-ready") {
            return (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Ready to Screen
                </Text>
                <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                  {readyPatients.length}
                </Text>
              </View>
            );
          }
          if (item.kind === "header-done") {
            return (
              <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                <View style={[styles.sectionDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Screened Today
                </Text>
                <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                  {donePatients.length}
                </Text>
              </View>
            );
          }
          if (item.kind === "empty-ready") {
            return (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="check-circle" size={28} color={colors.success} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {search ? "No patients match your search" : "All done for today!"}
                </Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  {search
                    ? "Try a different name or ID."
                    : "Every registered patient has been screened in today's session."}
                </Text>
              </View>
            );
          }

          const patient = (item as { kind: "patient-ready" | "patient-done"; patient: Patient }).patient;
          const isDone = item.kind === "patient-done";
          const lastScreening = isDone
            ? todaySessionScreenings.find((s) => s.patientId === patient.id)
            : undefined;

          return (
            <TouchableOpacity
              style={[
                styles.patientRow,
                {
                  backgroundColor: isDone ? colors.card + "cc" : colors.card,
                  borderColor: isDone ? colors.border : colors.border,
                  opacity: isDone ? 0.82 : 1,
                },
              ]}
              onPress={() => router.push(`/patient/${patient.id}`)}
              activeOpacity={0.85}
            >
              {/* Avatar */}
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: isDone
                      ? colors.success + "20"
                      : colors.primary + "18",
                  },
                ]}
              >
                {isDone ? (
                  <Feather name="check" size={18} color={colors.success} />
                ) : (
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {patient.firstName[0]}{patient.lastName[0]}
                  </Text>
                )}
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.patientName, { color: colors.foreground }]}>
                  {patient.firstName} {patient.lastName}
                </Text>
                <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>
                  {patient.patientId} · {patient.village}
                </Text>
                {isDone && lastScreening && (
                  <View style={styles.resultRow}>
                    <Badge
                      label={lastScreening.aiRiskLevel}
                      variant={getRiskVariant(lastScreening.aiRiskLevel)}
                      size="sm"
                    />
                    <Text style={[styles.resultScore, { color: colors.mutedForeground }]}>
                      Q{lastScreening.imageQualityScore}%
                    </Text>
                  </View>
                )}
              </View>

              {/* Action */}
              {isDone ? (
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              ) : (
                <TouchableOpacity
                  style={[styles.screenBtn, { backgroundColor: colors.success }]}
                  onPress={() => screenPatient(patient)}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Feather name="camera" size={14} color="#fff" />
                  <Text style={styles.screenBtnText}>Screen</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 14,
    paddingTop: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  progressWrap: { marginBottom: 12 },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progressValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    backgroundColor: "transparent",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  patientRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  patientName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  patientMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  resultScore: { fontSize: 11, fontFamily: "Inter_400Regular" },
  screenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  screenBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  emptyCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
});
