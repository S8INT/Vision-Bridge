import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
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
import { useApp } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";

function getPriorityVariant(priority: string) {
  if (priority === "Emergency") return "urgent";
  if (priority === "Urgent") return "warning";
  return "muted";
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConsultationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { consultations, getPatient, screenings, updateConsultation, currentUser } = useApp();

  const consultation = consultations.find((c) => c.id === id);
  const patient = consultation ? getPatient(consultation.patientId) : undefined;
  const screening = consultation
    ? screenings.find((s) => s.id === consultation.screeningId)
    : undefined;
  const [response, setResponse] = useState(consultation?.specialistResponse ?? "");
  const [diagnosis, setDiagnosis] = useState(consultation?.diagnosis ?? "");
  const [treatment, setTreatment] = useState(consultation?.treatment ?? "");
  const [showResponseForm, setShowResponseForm] = useState(false);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  if (!consultation) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Consultation not found</Text>
      </View>
    );
  }

  function handleSubmitResponse() {
    if (!response.trim()) {
      Alert.alert("Response Required", "Please enter your clinical response.");
      return;
    }
    updateConsultation(consultation!.id, {
      status: "Responded",
      specialistResponse: response.trim(),
      diagnosis: diagnosis.trim() || undefined,
      treatment: treatment.trim() || undefined,
      respondedAt: new Date().toISOString(),
      assignedTo: currentUser.name,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowResponseForm(false);
    Alert.alert("Response Submitted", "The referring clinician will be notified.");
  }

  const statusColor =
    consultation.status === "Responded"
      ? colors.success
      : consultation.status === "InReview"
      ? colors.warning
      : consultation.status === "Open"
      ? colors.primary
      : colors.mutedForeground;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 16, paddingBottom: botPad + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.consultId, { color: colors.mutedForeground }]}>
              Consultation #{consultation.id.slice(-6).toUpperCase()}
            </Text>
            <View style={[styles.statusRow, { marginTop: 4 }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{consultation.status}</Text>
            </View>
          </View>
          <Badge label={consultation.priority} variant={getPriorityVariant(consultation.priority)} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
          Requested: {formatDateTime(consultation.requestedAt)}
        </Text>
        {consultation.assignedTo ? (
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            Assigned to: <Text style={{ color: colors.foreground, fontWeight: "600" }}>{consultation.assignedTo}</Text>
          </Text>
        ) : (
          <Text style={[styles.metaText, { color: colors.warning }]}>Awaiting specialist assignment</Text>
        )}
      </View>

      {patient ? (
        <TouchableOpacity
          onPress={() => router.push(`/patient/${patient.id}`)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {patient.firstName[0]}{patient.lastName[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.patientName, { color: colors.foreground }]}>
                {patient.firstName} {patient.lastName}
              </Text>
              <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>
                {patient.patientId} · {patient.village}
              </Text>
              {patient.medicalHistory.length > 0 ? (
                <Text style={[styles.history, { color: colors.mutedForeground }]}>
                  {patient.medicalHistory.join(", ")}
                </Text>
              ) : null}
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      ) : null}

      {screening ? (
        <TouchableOpacity
          onPress={() => router.push(`/screening/${screening.id}`)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>LINKED SCREENING</Text>
          <View style={styles.row}>
            <View style={[styles.eyeIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="eye" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.screeningRisk, { color: colors.foreground }]}>
                {screening.aiRiskLevel} Risk · {screening.aiConfidence}% confidence
              </Text>
              <Text style={[styles.screeningFindings, { color: colors.mutedForeground }]} numberOfLines={2}>
                {screening.aiFindings.join(" · ")}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      ) : null}

      {consultation.clinicalNotes ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>CLINICAL NOTES</Text>
          <Text style={[styles.notesText, { color: colors.foreground }]}>{consultation.clinicalNotes}</Text>
        </View>
      ) : null}

      {consultation.specialistResponse ? (
        <View style={[styles.responseCard, { backgroundColor: colors.successLight, borderColor: colors.normalBorder }]}>
          <View style={styles.responseHeader}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={[styles.responseTitle, { color: colors.success }]}>Specialist Response</Text>
          </View>
          {consultation.diagnosis ? (
            <View>
              <Text style={[styles.responseLabel, { color: colors.mutedForeground }]}>DIAGNOSIS</Text>
              <Text style={[styles.responseText, { color: colors.foreground }]}>{consultation.diagnosis}</Text>
            </View>
          ) : null}
          {consultation.treatment ? (
            <View>
              <Text style={[styles.responseLabel, { color: colors.mutedForeground }]}>TREATMENT PLAN</Text>
              <Text style={[styles.responseText, { color: colors.foreground }]}>{consultation.treatment}</Text>
            </View>
          ) : null}
          <View>
            <Text style={[styles.responseLabel, { color: colors.mutedForeground }]}>NOTES</Text>
            <Text style={[styles.responseText, { color: colors.foreground }]}>{consultation.specialistResponse}</Text>
          </View>
          {consultation.respondedAt ? (
            <Text style={[styles.responseMeta, { color: colors.mutedForeground }]}>
              Responded by {consultation.assignedTo} on {formatDateTime(consultation.respondedAt)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {consultation.status !== "Responded" && consultation.status !== "Closed" ? (
        !showResponseForm ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowResponseForm(true)}
            activeOpacity={0.85}
          >
            <Feather name="edit-3" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Add Specialist Response</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.responseForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>SPECIALIST RESPONSE</Text>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Diagnosis</Text>
            <TextInput
              value={diagnosis}
              onChangeText={setDiagnosis}
              placeholder="Primary diagnosis..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]}
            />
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Treatment Plan</Text>
            <TextInput
              value={treatment}
              onChangeText={setTreatment}
              placeholder="Recommended treatment..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]}
            />
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Clinical Notes *</Text>
            <TextInput
              value={response}
              onChangeText={setResponse}
              placeholder="Clinical observations and recommendations..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleSubmitResponse}
              activeOpacity={0.85}
            >
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Submit Response</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowResponseForm(false)}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },
  headerCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  consultId: { fontSize: 12, fontWeight: "600" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 14, fontWeight: "700" },
  divider: { height: 1 },
  metaText: { fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700" },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  history: { fontSize: 11, marginTop: 2 },
  eyeIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  screeningRisk: { fontSize: 14, fontWeight: "600" },
  screeningFindings: { fontSize: 12, marginTop: 2 },
  notesText: { fontSize: 14, lineHeight: 22 },
  responseCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  responseHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  responseTitle: { fontSize: 15, fontWeight: "700" },
  responseLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 3 },
  responseText: { fontSize: 14, lineHeight: 20 },
  responseMeta: { fontSize: 11, marginTop: 4 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  responseForm: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  inputField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
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
