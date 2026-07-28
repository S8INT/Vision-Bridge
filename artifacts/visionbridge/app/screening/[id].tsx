import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useScreenPadding } from "@/hooks/useScreenPadding";
import { useApp, RiskLevel } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { getRiskColor } from "@/utils/risk";

function getRiskVariant(risk: RiskLevel) {
  if (risk === "Urgent" || risk === "Severe") return "urgent";
  if (risk === "Moderate") return "warning";
  if (risk === "Mild") return "referral";
  return "success";
}

export default function ScreeningDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { screenings, getPatient, getConsultationForScreening, addConsultation, updateScreening, currentUser } = useApp();

  const screening = screenings.find((s) => s.id === id);
  const patient = screening ? getPatient(screening.patientId) : undefined;
  const consultation = screening ? getConsultationForScreening(screening.id) : undefined;
  const [referralNotes, setReferralNotes] = useState("");
  const [showReferralForm, setShowReferralForm] = useState(false);

  const { topPad, botPad } = useScreenPadding();

  if (!screening) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Screening not found</Text>
      </View>
    );
  }

  const activeScreening = screening;
  const riskColor = getRiskColor(screening.aiRiskLevel, colors);

  function handleRequestConsultation() {
    if (!referralNotes.trim()) {
      Alert.alert("Notes Required", "Please add clinical notes before requesting a consultation.");
      return;
    }
    addConsultation({
      screeningId: activeScreening.id,
      patientId: activeScreening.patientId,
      requestedBy: currentUser.id,
      status: "Pending",
      priority: activeScreening.aiRiskLevel === "Urgent" ? "Emergency" : activeScreening.aiRiskLevel === "Severe" ? "Urgent" : "Routine",
      clinicalNotes: referralNotes.trim(),
    });
    updateScreening(activeScreening.id, { status: "Referred" });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowReferralForm(false);
    Alert.alert("Consultation Requested", "Your request has been sent to the specialist queue.");
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 16, paddingBottom: botPad + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.riskBanner, { backgroundColor: riskColor + "12", borderColor: riskColor + "30" }]}>
        <Feather
          name={screening.aiRiskLevel === "Normal" ? "check-circle" : "alert-triangle"}
          size={28}
          color={riskColor}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.riskText, { color: riskColor }]}>
            {screening.aiRiskLevel} Risk
          </Text>
          <Text style={[styles.riskSub, { color: colors.mutedForeground }]}>
            AI Confidence: {screening.aiConfidence}%
          </Text>
        </View>
        <Badge label={screening.status} variant={screening.status === "Referred" ? "urgent" : screening.status === "Reviewed" ? "success" : "muted"} />
      </View>

      {patient ? (
        <TouchableOpacity
          onPress={() => router.push(`/patient/${patient.id}`)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <View style={styles.row}>
            <Avatar firstName={patient.firstName} lastName={patient.lastName} size={44} fontSize={16} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.patientName, { color: colors.foreground }]}>
                {patient.firstName} {patient.lastName}
              </Text>
              <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>
                {patient.patientId}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>AI FINDINGS</Text>
        {screening.aiFindings.map((f) => (
          <View key={f} style={styles.findingRow}>
            <View style={[styles.findingDot, { backgroundColor: riskColor }]} />
            <Text style={[styles.findingText, { color: colors.foreground }]}>{f}</Text>
          </View>
        ))}
        <View style={[styles.qualityRow, { borderTopColor: colors.border }]}>
          <View style={styles.qualityItem}>
            <Feather name="aperture" size={14} color={colors.mutedForeground} />
            <Text style={[styles.qualityLabel, { color: colors.mutedForeground }]}>Image Quality</Text>
            <Text style={[styles.qualityVal, { color: colors.foreground }]}>{screening.imageQualityScore}%</Text>
          </View>
          <View style={[styles.qualityDivider, { backgroundColor: colors.border }]} />
          <View style={styles.qualityItem}>
            <Feather name="cpu" size={14} color={colors.mutedForeground} />
            <Text style={[styles.qualityLabel, { color: colors.mutedForeground }]}>AI Model</Text>
            <Text style={[styles.qualityVal, { color: colors.foreground }]}>EfficientNet-B4</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>SCREENING INFO</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Captured</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]}>
            {new Date(screening.capturedAt).toLocaleString("en-UG")}
          </Text>
        </View>
        {screening.notes ? (
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Notes</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{screening.notes}</Text>
          </View>
        ) : null}
        {screening.reviewedBy ? (
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Reviewed by</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{screening.reviewedBy}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.disclaimer, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
        <Feather name="info" size={14} color="#92400e" />
        <Text style={[styles.disclaimerText, { color: "#92400e" }]}>
          AI analysis is a clinical decision support tool. All findings require ophthalmologist confirmation before treatment.
        </Text>
      </View>

      {consultation ? (
        <TouchableOpacity
          style={[styles.consultationCard, { backgroundColor: colors.referralBg, borderColor: colors.referralBorder }]}
          onPress={() => router.push(`/consultation/${consultation.id}`)}
          activeOpacity={0.8}
        >
          <View style={styles.row}>
            <Feather name="message-circle" size={20} color={colors.referralText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.consultTitle, { color: colors.referralText }]}>
                Consultation {consultation.status}
              </Text>
              {consultation.assignedTo ? (
                <Text style={[styles.consultSub, { color: colors.referralText }]}>
                  Assigned to {consultation.assignedTo}
                </Text>
              ) : (
                <Text style={[styles.consultSub, { color: colors.referralText }]}>Awaiting specialist</Text>
              )}
            </View>
            <Feather name="chevron-right" size={16} color={colors.referralText} />
          </View>
        </TouchableOpacity>
      ) : screening.status !== "Referred" ? (
        <>
          {!showReferralForm ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowReferralForm(true)}
              activeOpacity={0.85}
            >
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Request Specialist Consultation</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.referralForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>REFERRAL NOTES</Text>
              <TextInput
                value={referralNotes}
                onChangeText={setReferralNotes}
                placeholder="Clinical observations, history relevant to referral..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleRequestConsultation}
                activeOpacity={0.85}
              >
                <Feather name="send" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Submit Consultation Request</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowReferralForm(false)}>
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },
  riskBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  riskText: { fontSize: 20, fontWeight: "700" },
  riskSub: { fontSize: 12, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  findingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  findingDot: { width: 6, height: 6, borderRadius: 3 },
  findingText: { fontSize: 14 },
  qualityRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  qualityItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  qualityLabel: { fontSize: 11 },
  qualityVal: { fontSize: 13, fontWeight: "600" },
  qualityDivider: { width: 1, marginHorizontal: 8 },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  disclaimerText: { fontSize: 12, lineHeight: 18, flex: 1 },
  consultationCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  consultTitle: { fontSize: 14, fontWeight: "600" },
  consultSub: { fontSize: 12, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  referralForm: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  cancelText: { textAlign: "center", fontSize: 14 },
});
