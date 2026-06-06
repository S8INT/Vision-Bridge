import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp, RiskLevel, Screening } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { buildSessionReportHtml, buildSessionReportText } from "@/services/reportGenerator";

const RISK_ORDER: RiskLevel[] = ["Normal", "Mild", "Moderate", "Severe", "Urgent"];

function getRiskVariant(r: RiskLevel) {
  if (r === "Urgent" || r === "Severe") return "urgent";
  if (r === "Moderate") return "warning";
  if (r === "Mild") return "mild";
  return "success";
}

function getRiskColor(r: RiskLevel, colors: ReturnType<typeof useColors>) {
  if (r === "Urgent" || r === "Severe") return colors.destructive;
  if (r === "Moderate") return colors.warning;
  if (r === "Mild") return colors.accent;
  return colors.success;
}

function progressPercent(screened: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((screened / target) * 100)) : 0;
}

export default function SessionSummaryScreen() {
  const { id: campaignId } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { campaigns, patients, screenings, addNotification, addConsultation, consultations } = useApp();
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [exporting, setExporting] = useState(false);

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId),
    [campaigns, campaignId],
  );

  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const sessionScreenings = useMemo(
    () => screenings.filter((s) => s.campaignId === campaignId && new Date(s.capturedAt) >= todayStart),
    [screenings, campaignId, todayStart],
  );

  const stats = useMemo(() => {
    const total = sessionScreenings.length;
    const riskCounts: Record<RiskLevel, number> = { Normal: 0, Mild: 0, Moderate: 0, Severe: 0, Urgent: 0 };
    let qualitySum = 0;
    for (const s of sessionScreenings) {
      riskCounts[s.aiRiskLevel] = (riskCounts[s.aiRiskLevel] ?? 0) + 1;
      qualitySum += s.imageQualityScore;
    }
    const avgQuality = total > 0 ? Math.round(qualitySum / total) : 0;
    const highRisk = riskCounts.Severe + riskCounts.Urgent;
    const referred = campaign?.referredCount ?? 0;
    return { total, riskCounts, avgQuality, highRisk, referred };
  }, [sessionScreenings, campaign]);

  const highRiskScreenings = useMemo(
    () => sessionScreenings.filter((s) => s.aiRiskLevel === "Severe" || s.aiRiskLevel === "Urgent"),
    [sessionScreenings],
  );

  const alreadyEscalatedIds = useMemo(
    () => new Set(consultations.filter((c) => c.campaignId === campaignId).map((c) => c.patientId)),
    [consultations, campaignId],
  );

  const unescalatedHighRisk = useMemo(
    () => highRiskScreenings.filter((s) => !alreadyEscalatedIds.has(s.patientId)),
    [highRiskScreenings, alreadyEscalatedIds],
  );

  const today = new Date().toLocaleDateString("en-UG", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  async function handleExportPdf() {
    if (!campaign || !user) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const technicianName = user.name ?? user.email ?? "Technician";
      const params = { campaign, sessionScreenings, highRiskScreenings, patients, technicianName, today };

      if (Platform.OS === "web") {
        const html = buildSessionReportHtml(params);
        const win = window.open("", "_blank");
        if (win) { win.document.write(html); win.document.close(); win.print(); }
        return;
      }

      const text = buildSessionReportText(params);
      await Share.share(
        { message: text, title: `${campaign.name} — Session Report` },
        { dialogTitle: `Share session report via…` },
      );
    } catch (e: any) {
      if (e?.message !== "User did not share") {
        Alert.alert("Share failed", "Could not share the report. Please try again.");
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleSendReport() {
    if (!campaign || !user) return;
    setSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const riskLine = RISK_ORDER
        .filter((r) => stats.riskCounts[r] > 0)
        .map((r) => `${stats.riskCounts[r]} ${r}`)
        .join(", ");

      await addNotification({
        type: "CampaignAlert",
        title: `Session Report: ${campaign.name}`,
        body: `${today} — ${stats.total} screened, avg quality ${stats.avgQuality}%. Risk breakdown: ${riskLine}. ${stats.highRisk} high-risk patient${stats.highRisk !== 1 ? "s" : ""} flagged.`,
        campaignId: campaignId,
      });

      for (const s of unescalatedHighRisk) {
        await addConsultation({
          screeningId: s.id,
          patientId: s.patientId,
          requestedBy: user.id,
          status: "Pending",
          priority: s.aiRiskLevel === "Urgent" ? "Emergency" : "Urgent",
          clinicalNotes: `Campaign session escalation. AI detected: ${s.aiFindings.join(", ")}.`,
          campaignId: campaignId,
        });
      }
      setSent(true);
    } catch (e) {
      Alert.alert("Send failed", "Could not send the report. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const topPad = insets.top + (Platform.OS === "android" ? 12 : 8);
  const botPad = insets.bottom;
  const pct = campaign ? progressPercent(campaign.screenedCount, campaign.targetCount) : 0;

  if (!campaign) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Campaign not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: botPad + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              Session Summary
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {campaign.name} · {today}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {/* ── Completion Hero ── */}
        <View style={[styles.hero, { backgroundColor: colors.success + "12", borderColor: colors.success + "35" }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.success }]}>
            <Feather name="check-circle" size={28} color="#fff" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Session Complete</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            {stats.total} patient{stats.total !== 1 ? "s" : ""} screened today
          </Text>
        </View>

        {/* ── Stats Grid ── */}
        <View style={styles.statsGrid}>
          {[
            { label: "Screened", value: `${stats.total}`, icon: "camera" as const, color: colors.primary },
            { label: "Avg Quality", value: `${stats.avgQuality}%`, icon: "star" as const, color: colors.success },
            { label: "High Risk", value: `${stats.highRisk}`, icon: "alert-triangle" as const, color: colors.destructive },
            { label: "Referred", value: `${stats.referred}`, icon: "send" as const, color: colors.warning },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statIconWrap, { backgroundColor: s.color + "18" }]}>
                <Feather name={s.icon} size={16} color={s.color} />
              </View>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Risk Breakdown ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Risk Breakdown</Text>
          {RISK_ORDER.map((level) => {
            const count = stats.riskCounts[level];
            const barPct = stats.total > 0 ? (count / stats.total) * 100 : 0;
            const c = getRiskColor(level, colors);
            return (
              <View key={level} style={styles.riskRow}>
                <Text style={[styles.riskLabel, { color: colors.mutedForeground }]}>{level}</Text>
                <View style={[styles.riskTrack, { backgroundColor: colors.muted }]}>
                  <View style={[styles.riskFill, { width: `${barPct}%` as any, backgroundColor: c }]} />
                </View>
                <Text style={[styles.riskCount, { color: count > 0 ? colors.foreground : colors.mutedForeground }]}>
                  {count}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── Campaign Progress ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Campaign Progress</Text>
            <Text style={[styles.sectionValue, { color: colors.primary }]}>{pct}%</Text>
          </View>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            {campaign.screenedCount} of {campaign.targetCount} total target screened
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.muted, marginTop: 10 }]}>
            <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: pct >= 100 ? colors.success : colors.primary }]} />
          </View>
        </View>

        {/* ── High-Risk Patients ── */}
        {highRiskScreenings.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.destructive + "40" }]}>
            <View style={styles.sectionRow}>
              <Feather name="alert-triangle" size={15} color={colors.destructive} />
              <Text style={[styles.sectionTitle, { color: colors.destructive, marginLeft: 6 }]}>
                High-Risk Patients
              </Text>
            </View>
            <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
              These patients require specialist review
            </Text>
            {highRiskScreenings.map((s) => {
              const pat = patients.find((p) => p.id === s.patientId);
              const escalated = alreadyEscalatedIds.has(s.patientId);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.riskPatientRow, { borderColor: colors.border }]}
                  onPress={() => router.push(`/patient/${s.patientId}`)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.riskAvatar, { backgroundColor: colors.destructive + "18" }]}>
                    <Text style={[styles.riskAvatarText, { color: colors.destructive }]}>
                      {pat ? `${pat.firstName[0]}${pat.lastName[0]}` : "?"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.riskPatientName, { color: colors.foreground }]}>
                      {pat ? `${pat.firstName} ${pat.lastName}` : s.patientId}
                    </Text>
                    <Text style={[styles.riskFinding, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {s.aiFindings[0]}
                    </Text>
                  </View>
                  <View style={styles.riskPatientRight}>
                    <Badge label={s.aiRiskLevel} variant={getRiskVariant(s.aiRiskLevel)} size="sm" />
                    {escalated && (
                      <Text style={[styles.escalatedTag, { color: colors.mutedForeground }]}>escalated</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Share PDF ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionRow}>
            <Feather name="file-text" size={15} color={colors.foreground} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginLeft: 6 }]}>Export as PDF</Text>
          </View>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            Generate a full session report — share via WhatsApp, email, or save to device.
            Includes campaign details, risk breakdown, and high-risk patient list.
          </Text>
          <TouchableOpacity
            style={[
              styles.exportBtn,
              { backgroundColor: exporting ? colors.muted : colors.card, borderColor: colors.border },
            ]}
            onPress={handleExportPdf}
            disabled={exporting}
            activeOpacity={0.85}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Feather name="download" size={16} color={colors.foreground} />
            )}
            <Text style={[styles.exportBtnText, { color: exporting ? colors.mutedForeground : colors.foreground }]}>
              {exporting ? "Generating PDF…" : "Export & Share PDF"}
            </Text>
            {!exporting && (
              <View style={styles.whatsappHint}>
                <Feather name="share-2" size={12} color={colors.mutedForeground} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Send Report ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notify Supervising Doctor</Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            Send a summary notification with today's stats
            {unescalatedHighRisk.length > 0
              ? ` and escalate ${unescalatedHighRisk.length} unreviewed high-risk case${unescalatedHighRisk.length !== 1 ? "s" : ""}`
              : ""}
            .
          </Text>

          {sent ? (
            <View style={[styles.sentBadge, { backgroundColor: colors.success + "14", borderColor: colors.success + "35" }]}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={[styles.sentText, { color: colors.success }]}>
                Report sent{unescalatedHighRisk.length > 0 ? " and cases escalated" : ""}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: sending ? colors.muted : colors.primary, borderColor: colors.primary },
              ]}
              onPress={handleSendReport}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="send" size={16} color="#fff" />
              )}
              <Text style={styles.sendBtnText}>
                {sending ? "Sending…" : "Send Report"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Actions ── */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionSecondary, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => router.replace(`/campaign/${campaignId}/session` as never)}
            activeOpacity={0.85}
          >
            <Feather name="list" size={16} color={colors.foreground} />
            <Text style={[styles.actionSecondaryText, { color: colors.foreground }]}>Back to Queue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionPrimary, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)" as never)}
            activeOpacity={0.85}
          >
            <Feather name="home" size={16} color="#fff" />
            <Text style={styles.actionPrimaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  body: { padding: 16, gap: 14 },
  hero: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: "44%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    alignItems: "flex-start",
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  sectionRow: { flexDirection: "row", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  sectionValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  riskLabel: { fontSize: 13, fontFamily: "Inter_400Regular", width: 72 },
  riskTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  riskFill: { height: 8, borderRadius: 4 },
  riskCount: { fontSize: 13, fontFamily: "Inter_600SemiBold", width: 24, textAlign: "right" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  riskPatientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  riskAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  riskAvatarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  riskPatientName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  riskFinding: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  riskPatientRight: { alignItems: "flex-end", gap: 4 },
  escalatedTag: { fontSize: 10, fontFamily: "Inter_400Regular" },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  exportBtnText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  whatsappHint: { opacity: 0.5 },
  sentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  sentText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 4,
  },
  sendBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  actionSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionSecondaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actionPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionPrimaryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});
