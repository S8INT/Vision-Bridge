import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useScreenPadding } from "@/hooks/useScreenPadding";
import { useApp, ReferralStatus } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/utils/date";
import { InfoRow } from "@/components/ui/InfoRow";
import { Avatar } from "@/components/ui/Avatar";

function getStatusBadgeVariant(status: ReferralStatus) {
  if (status === "Completed") return "success";
  if (status === "Accepted" || status === "Arrived") return "referral";
  if (status === "Declined") return "urgent";
  if (status === "InTransit") return "warning";
  return "muted";
}

const REFERRAL_TIMELINE: ReferralStatus[] = ["Pending", "Accepted", "InTransit", "Arrived", "Completed"];

export default function ReferralDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { referrals, getPatient, updateReferral, addNotification } = useApp();

  const referral = referrals.find((r) => r.id === id);
  const patient = referral ? getPatient(referral.patientId) : undefined;

  const { topPad, botPad } = useScreenPadding();

  if (!referral) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Referral not found</Text>
      </View>
    );
  }

  function advanceStatus() {
    const idx = REFERRAL_TIMELINE.indexOf(referral!.status);
    if (idx === -1 || idx >= REFERRAL_TIMELINE.length - 1) return;
    const next = REFERRAL_TIMELINE[idx + 1];
    const now = new Date().toISOString();
    const updates: Partial<typeof referral> = { status: next };
    if (next === "Accepted") updates.acceptedAt = now;
    if (next === "Arrived") updates.arrivedAt = now;
    if (next === "Completed") updates.completedAt = now;
    updateReferral(referral!.id, updates);
    addNotification({ type: "ReferralUpdate", title: "Referral Updated", body: `${patient?.firstName} ${patient?.lastName}'s referral status: ${next}`, patientId: referral!.patientId, referralId: referral!.id, consultationId: referral!.consultationId });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleDecline() {
    Alert.alert("Decline Referral", "Are you sure you want to decline this referral?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline", style: "destructive",
        onPress: () => {
          updateReferral(referral!.id, { status: "Declined", declineReason: "Declined by receiving facility" });
          addNotification({ type: "ReferralUpdate", title: "Referral Declined", body: `Referral for ${patient?.firstName} ${patient?.lastName} was declined`, patientId: referral!.patientId, referralId: referral!.id });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    ]);
  }

  const isComplete = referral.status === "Completed" || referral.status === "Declined";
  const nextStatusLabel = () => {
    const idx = REFERRAL_TIMELINE.indexOf(referral.status);
    if (idx < 0 || idx >= REFERRAL_TIMELINE.length - 1) return null;
    return REFERRAL_TIMELINE[idx + 1];
  };
  const next = nextStatusLabel();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.headerCard, { backgroundColor: referral.urgency === "Emergency" ? colors.urgentBg : referral.urgency === "Urgent" ? colors.warningLight : colors.card, borderColor: referral.urgency === "Emergency" ? colors.urgentBorder : referral.urgency === "Urgent" ? "#fcd34d" : colors.border }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.refId, { color: colors.mutedForeground }]}>REFERRAL #{referral.id.slice(-6).toUpperCase()}</Text>
            <View style={styles.typeRow}>
              <Feather name="navigation" size={16} color={referral.urgency === "Emergency" ? colors.destructive : colors.primary} />
              <Text style={[styles.typeText, { color: referral.urgency === "Emergency" ? colors.destructive : colors.foreground }]}>
                {referral.type} · {referral.urgency}
              </Text>
            </View>
          </View>
          <Badge label={referral.status} variant={getStatusBadgeVariant(referral.status)} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.destination, { color: colors.foreground }]}>{referral.targetFacility}</Text>
        <Text style={[styles.destDistrict, { color: colors.mutedForeground }]}>{referral.targetDistrict}</Text>
        {referral.targetDoctor ? <Text style={[styles.destDoctor, { color: colors.mutedForeground }]}>Attn: {referral.targetDoctor}</Text> : null}
      </View>

      {patient ? (
        <TouchableOpacity onPress={() => router.push(`/patient/${patient.id}`)} activeOpacity={0.8}
          style={[styles.patientCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Avatar firstName={patient.firstName} lastName={patient.lastName} size={44} fontSize={16} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.patientName, { color: colors.foreground }]}>{patient.firstName} {patient.lastName}</Text>
            <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>{patient.patientId} · {patient.village}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : null}

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>REFERRAL DETAILS</Text>
        <InfoRow labelFlex={0.35} label="Reason" value={referral.reason} />
        <InfoRow labelFlex={0.35} label="Clinical Summary" value={referral.clinicalSummary} />
        <InfoRow labelFlex={0.35} label="Created" value={fmtDateTime(referral.createdAt)} />
        {referral.transportArranged ? <InfoRow labelFlex={0.35} label="Transport" value="Arranged" /> : null}
        {referral.escortRequired ? <InfoRow labelFlex={0.35} label="Escort" value="Required" /> : null}
        {referral.referralNotes ? <InfoRow labelFlex={0.35} label="Notes" value={referral.referralNotes} /> : null}
      </View>

      {referral.acceptedAt || referral.arrivedAt || referral.completedAt ? (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TRACKING</Text>
          {referral.acceptedAt ? <InfoRow labelFlex={0.35} label="Accepted" value={fmtDateTime(referral.acceptedAt)} /> : null}
          {referral.arrivedAt ? <InfoRow labelFlex={0.35} label="Arrived" value={fmtDateTime(referral.arrivedAt)} /> : null}
          {referral.completedAt ? <InfoRow labelFlex={0.35} label="Completed" value={fmtDateTime(referral.completedAt)} /> : null}
        </View>
      ) : null}

      {referral.declineReason ? (
        <View style={[styles.section, { backgroundColor: colors.urgentBg, borderColor: colors.urgentBorder }]}>
          <Text style={[styles.sectionLabel, { color: colors.urgentText }]}>DECLINED</Text>
          <Text style={[styles.bodyText, { color: colors.urgentText }]}>{referral.declineReason}</Text>
        </View>
      ) : null}

      {/* ── Status Timeline ── */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>STATUS TIMELINE</Text>
        {REFERRAL_TIMELINE.map((s, i, arr) => {
          const done = REFERRAL_TIMELINE.indexOf(s) <= REFERRAL_TIMELINE.indexOf(referral.status) && referral.status !== "Declined";
          const current = s === referral.status;
          return (
            <View key={s} style={styles.timelineRow}>
              <View style={styles.timelineLeft}>
                <View style={[styles.dot, { backgroundColor: done ? colors.success : current ? colors.primary : colors.muted, borderColor: done ? colors.success : current ? colors.primary : colors.border }]}>
                  {done && !current ? <Feather name="check" size={10} color="#fff" /> : null}
                </View>
                {i < arr.length - 1 ? <View style={[styles.line, { backgroundColor: done ? colors.success : colors.border }]} /> : null}
              </View>
              <Text style={[styles.timelineLabel, { color: current ? colors.primary : done ? colors.foreground : colors.mutedForeground, fontWeight: current ? "700" : "400" }]}>
                {s}
              </Text>
            </View>
          );
        })}
      </View>

      {!isComplete && next ? (
        <TouchableOpacity style={[styles.advanceBtn, { backgroundColor: colors.primary }]} onPress={advanceStatus} activeOpacity={0.85}>
          <Feather name="arrow-right-circle" size={20} color="#fff" />
          <Text style={styles.advanceBtnText}>Mark as {next}</Text>
        </TouchableOpacity>
      ) : null}

      {!isComplete && referral.status === "Pending" ? (
        <TouchableOpacity style={[styles.declineBtn, { borderColor: colors.destructive }]} onPress={handleDecline} activeOpacity={0.8}>
          <Feather name="x-circle" size={16} color={colors.destructive} />
          <Text style={[styles.declineBtnText, { color: colors.destructive }]}>Decline Referral</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },
  headerCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  refId: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  typeText: { fontSize: 16, fontWeight: "700" },
  divider: { height: 1 },
  destination: { fontSize: 15, fontWeight: "700" },
  destDistrict: { fontSize: 13 },
  destDoctor: { fontSize: 13, fontStyle: "italic" },
  patientCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  section: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  bodyText: { fontSize: 14, lineHeight: 20 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 32 },
  timelineLeft: { alignItems: "center", width: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, marginTop: 2 },
  timelineLabel: { fontSize: 13, paddingTop: 2 },
  advanceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  advanceBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  declineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  declineBtnText: { fontSize: 15, fontWeight: "600" },
});
