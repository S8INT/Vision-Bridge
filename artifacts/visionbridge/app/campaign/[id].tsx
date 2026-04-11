import React from "react";
import {
  Alert,
  Platform,
  ScrollView,
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
import { useApp, CampaignStatus, Screening, Patient } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { getRiskVariant } from "@/utils/risk";

function getCampaignVariant(status: CampaignStatus) {
  if (status === "Active") return "success";
  if (status === "Completed") return "referral";
  if (status === "Cancelled") return "urgent";
  return "muted";
}

function progressPercent(screened: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((screened / target) * 100)) : 0;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { campaigns, getCampaignScreenings, getCampaignPatients, updateCampaign, addNotification, getConsultationForScreening } = useApp();

  const campaign = campaigns.find((c) => c.id === id);
  const screenings = campaign ? getCampaignScreenings(campaign.id) : [];
  const patients = campaign ? getCampaignPatients(campaign.id) : [];

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  if (!campaign) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Campaign not found</Text>
      </View>
    );
  }

  const pct = progressPercent(campaign.screenedCount, campaign.targetCount);
  const riskCounts = { Normal: 0, Mild: 0, Moderate: 0, Severe: 0, Urgent: 0 };
  screenings.forEach((s) => { riskCounts[s.aiRiskLevel]++; });

  function handleActivate() {
    updateCampaign(campaign!.id, { status: "Active" });
    addNotification({ type: "CampaignAlert", title: "Campaign Activated", body: `${campaign!.name} is now active`, campaignId: campaign!.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleComplete() {
    Alert.alert("Complete Campaign", "Mark this campaign as completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete",
        onPress: () => {
          updateCampaign(campaign!.id, { status: "Completed", endDate: new Date().toISOString().split("T")[0] });
          addNotification({ type: "CampaignAlert", title: "Campaign Completed", body: `${campaign!.name} completed — ${campaign!.screenedCount}/${campaign!.targetCount} screened`, campaignId: campaign!.id });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }

  function handleCancel() {
    Alert.alert("Cancel Campaign", "Are you sure you want to cancel this campaign?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Campaign",
        style: "destructive",
        onPress: () => {
          updateCampaign(campaign!.id, { status: "Cancelled" });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    ]);
  }

  function PatientRow({ patient, screening }: { patient: Patient; screening?: Screening }) {
    const consultation = screening ? getConsultationForScreening(screening.id) : undefined;
    return (
      <TouchableOpacity
        onPress={() => router.push(`/patient/${patient.id}`)}
        activeOpacity={0.8}
        style={[styles.patientRow, { borderBottomColor: colors.border }]}
      >
        <View style={[styles.av, { backgroundColor: colors.primary + "18" }]}>
          <Text style={[styles.avText, { color: colors.primary }]}>{patient.firstName[0]}{patient.lastName[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.patientName, { color: colors.foreground }]}>{patient.firstName} {patient.lastName}</Text>
          <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>{patient.patientId}</Text>
        </View>
        {screening ? (
          <View style={styles.screeningBadges}>
            <Badge label={screening.aiRiskLevel} variant={getRiskVariant(screening.aiRiskLevel)} size="sm" />
            {consultation ? <Badge label={consultation.status} variant="muted" size="sm" /> : null}
          </View>
        ) : (
          <Text style={[styles.noScreening, { color: colors.mutedForeground }]}>No screening</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={[styles.headerCard, { backgroundColor: campaign.status === "Active" ? colors.primary + "0a" : colors.card, borderColor: campaign.status === "Active" ? colors.primary + "40" : colors.border }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.campType, { color: colors.mutedForeground }]}>{campaign.type.toUpperCase()}</Text>
            <Text style={[styles.campName, { color: colors.foreground }]}>{campaign.name}</Text>
          </View>
          <Badge label={campaign.status} variant={getCampaignVariant(campaign.status)} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Feather name="map-pin" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{campaign.location}</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{campaign.startDate}{campaign.endDate ? ` → ${campaign.endDate}` : ""}</Text>
          </View>
        </View>
      </View>

      {/* ── Progress ── */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SCREENING PROGRESS</Text>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressBig, { color: colors.foreground }]}>{campaign.screenedCount}</Text>
          <Text style={[styles.progressOf, { color: colors.mutedForeground }]}>/ {campaign.targetCount} patients</Text>
          <Text style={[styles.progressPct, { color: colors.primary }]}>{pct}%</Text>
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: pct >= 100 ? colors.success : colors.primary }]} />
        </View>
        <View style={styles.riskBreakdown}>
          {(Object.entries(riskCounts) as [string, number][]).filter(([, v]) => v > 0).map(([risk, count]) => (
            <View key={risk} style={styles.riskStat}>
              <Badge label={risk} variant={getRiskVariant(risk as any)} size="sm" />
              <Text style={[styles.riskCount, { color: colors.mutedForeground }]}>{count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Details ── */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CAMPAIGN DETAILS</Text>
        <InfoRow label="Target Population" value={campaign.targetPopulation} />
        <InfoRow label="District" value={campaign.district} />
        <InfoRow label="Referred" value={`${campaign.referredCount} patients`} />
        {campaign.notes ? <InfoRow label="Notes" value={campaign.notes} /> : null}
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.actions}>
        {campaign.status === "Planned" ? (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={handleActivate} activeOpacity={0.85}>
            <Feather name="play" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Start Campaign</Text>
          </TouchableOpacity>
        ) : null}
        {campaign.status === "Active" ? (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push(`/screening/new?campaignId=${campaign.id}`)}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Screen Next Patient</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={handleComplete} activeOpacity={0.85}>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Mark Completed</Text>
            </TouchableOpacity>
          </>
        ) : null}
        {campaign.status !== "Cancelled" && campaign.status !== "Completed" ? (
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.destructive }]} onPress={handleCancel} activeOpacity={0.8}>
            <Feather name="x-circle" size={16} color={colors.destructive} />
            <Text style={[styles.cancelBtnText, { color: colors.destructive }]}>Cancel Campaign</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Patient List ── */}
      {patients.length > 0 ? (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PATIENTS ({patients.length})</Text>
          {patients.map((p) => {
            const s = screenings.find((s) => s.patientId === p.id);
            return <PatientRow key={p.id} patient={p} screening={s} />;
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },
  headerCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 10 },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  campType: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  campName: { fontSize: 18, fontWeight: "800", marginTop: 4 },
  divider: { height: 1 },
  metaGrid: { gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: 13, flex: 1 },
  section: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  progressHeader: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  progressBig: { fontSize: 36, fontWeight: "800" },
  progressOf: { fontSize: 16 },
  progressPct: { fontSize: 18, fontWeight: "700", marginLeft: "auto" },
  progressBar: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  riskBreakdown: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  riskStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  riskCount: { fontSize: 13, fontWeight: "600" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  infoLabel: { fontSize: 13, flex: 0.4 },
  infoValue: { fontSize: 13, fontWeight: "500", flex: 0.6, textAlign: "right" },
  actions: { gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5 },
  cancelBtnText: { fontSize: 14, fontWeight: "600" },
  patientRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  av: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 14, fontWeight: "700" },
  patientName: { fontSize: 14, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  screeningBadges: { flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" },
  noScreening: { fontSize: 11 },
});
