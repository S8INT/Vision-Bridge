import React, { useEffect, useMemo, useState } from "react";
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
import { useColors } from "@/hooks/useColors";
import { useScreenPadding } from "@/hooks/useScreenPadding";
import { useApp } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScreeningCard } from "@/components/ScreeningCard";
import { fmtLongDate } from "@/utils/date";

function getAge(dob: string) {
  const birth = new Date(dob);
  return new Date().getFullYear() - birth.getFullYear();
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function PatientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const {
    getPatient,
    getScreeningsForPatient,
    consultations,
    referrals,
    appointments,
    getDoctor,
    updateConsultation,
    currentUser,
  } = useApp();

  const patient = getPatient(id);
  const screenings = getScreeningsForPatient(id);
  const patientConsultations = useMemo(
    () => consultations.filter((c) => c.patientId === id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [consultations, id],
  );
  const patientReferrals = useMemo(
    () => referrals.filter((r) => r.patientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [referrals, id],
  );
  const patientAppointments = useMemo(
    () => appointments.filter((a) => a.patientId === id).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    [appointments, id],
  );
  const activeConsultation = patientConsultations[0];
  const [diagnosis, setDiagnosis] = useState(activeConsultation?.diagnosis ?? activeConsultation?.diagnosisOverride ?? "");
  const [treatment, setTreatment] = useState(activeConsultation?.treatment ?? activeConsultation?.treatmentPlan ?? "");
  const [followUpDate, setFollowUpDate] = useState(activeConsultation?.followUpDate?.slice(0, 10) ?? "");
  const [clinicalNote, setClinicalNote] = useState(activeConsultation?.clinicalNotes ?? "");
  const [savingPlan, setSavingPlan] = useState(false);
  const canEditPlan = currentUser.role === "Doctor" || currentUser.role === "Admin";

  const { topPad, botPad } = useScreenPadding();

  useEffect(() => {
    if (!activeConsultation) return;
    setDiagnosis(activeConsultation.diagnosis ?? activeConsultation.diagnosisOverride ?? "");
    setTreatment(activeConsultation.treatment ?? activeConsultation.treatmentPlan ?? "");
    setFollowUpDate(activeConsultation.followUpDate?.slice(0, 10) ?? "");
    setClinicalNote(activeConsultation.clinicalNotes ?? "");
  }, [activeConsultation?.id]);

  if (!patient) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Patient not found</Text>
      </View>
    );
  }

  const lastScreening = screenings[0];
  const urgentCount = screenings.filter(
    (s) => s.aiRiskLevel === "Urgent" || s.aiRiskLevel === "Severe"
  ).length;
  const futureAppointments = patientAppointments.filter((a) => a.status !== "Cancelled" && a.scheduledDate >= new Date().toISOString().slice(0, 10));
  const timeline = [
    ...screenings.map((s) => ({ date: s.capturedAt, kind: "Screening", title: `${s.aiRiskLevel} risk retinal screening`, detail: `${s.imageQualityScore}% image quality · ${s.status}`, icon: "eye" as const, onPress: () => router.push(`/screening/${s.id}`) })),
    ...patientConsultations.map((c) => ({ date: c.requestedAt, kind: "Consultation", title: `${c.status} specialist consultation`, detail: [c.diagnosis ?? c.diagnosisOverride, c.treatment ?? c.treatmentPlan].filter(Boolean).join(" · ") || c.clinicalNotes || "No clinical response recorded", icon: "message-circle" as const, onPress: () => router.push(`/consultation/${c.id}`) })),
    ...patientReferrals.map((r) => ({ date: r.createdAt, kind: "Referral", title: `${r.status} referral to ${r.targetFacility}`, detail: `${r.urgency} · ${r.reason}`, icon: "send" as const, onPress: undefined })),
    ...patientAppointments.map((a) => ({ date: a.scheduledDate, kind: "Appointment", title: `${a.status} ${a.type} appointment`, detail: `${a.facility} · ${a.scheduledTime}`, icon: "calendar" as const, onPress: undefined })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  async function saveCarePlan() {
    if (!activeConsultation) {
      Alert.alert("No assigned consultation", "A care plan can only be saved on a consultation assigned to this care team.");
      return;
    }
    if (!diagnosis.trim() && !treatment.trim() && !followUpDate.trim() && !clinicalNote.trim()) {
      Alert.alert("Care plan is empty", "Add at least one diagnosis, treatment, follow-up date or note.");
      return;
    }
    setSavingPlan(true);
    await updateConsultation(activeConsultation.id, {
      diagnosis: diagnosis.trim() || undefined,
      treatment: treatment.trim() || undefined,
      followUpDate: followUpDate.trim() ? new Date(`${followUpDate.trim()}T09:00:00`).toISOString() : undefined,
      clinicalNotes: clinicalNote.trim() || undefined,
      status: activeConsultation.status === "Assigned" || activeConsultation.status === "InReview" ? "Reviewed" : activeConsultation.status,
    });
    setSavingPlan(false);
    Alert.alert("Care plan saved", "The diagnosis, treatment plan, follow-up and note were saved to the assigned consultation.");
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
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {patient.firstName[0]}{patient.lastName[0]}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>
          {patient.firstName} {patient.lastName}
        </Text>
        <Text style={[styles.patientId, { color: colors.mutedForeground }]}>{patient.patientId}</Text>
        <View style={styles.tagsRow}>
          <Badge label={`${patient.sex === "F" ? "Female" : patient.sex === "M" ? "Male" : "Other"} · ${getAge(patient.dateOfBirth)} yrs`} variant="muted" />
          {urgentCount > 0 ? (
            <Badge label={`${urgentCount} Urgent Screening${urgentCount > 1 ? "s" : ""}`} variant="urgent" />
          ) : null}
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>PATIENT DETAILS</Text>
        <InfoRow label="Date of Birth" value={patient.dateOfBirth} />
        <InfoRow label="Phone" value={patient.phone || "Not provided"} />
        <InfoRow label="Village" value={patient.village} />
        <InfoRow label="District" value={patient.district} />
        <InfoRow
          label="Registered"
          value={fmtLongDate(patient.registeredAt)}
        />
        {patient.registeredByName ? (
          <InfoRow label="Registered By" value={patient.registeredByName} />
        ) : null}
        {patient.lastVisit ? (
          <InfoRow
            label="Last Visit"
            value={fmtLongDate(patient.lastVisit)}
          />
        ) : null}
      </View>

      {patient.medicalHistory.length > 0 ? (
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>MEDICAL HISTORY</Text>
          {patient.medicalHistory.map((c) => (
            <View key={c} style={styles.conditionRow}>
              <Feather name="alert-circle" size={14} color={colors.warning} />
              <Text style={[styles.condition, { color: colors.foreground }]}>{c}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>CARE TEAM & CONTEXT</Text>
          <Badge label="Privacy scoped" variant="success" size="sm" />
        </View>
        {activeConsultation?.assignedDoctorId ? (
          <InfoRow
            label="Assigned ophthalmologist"
            value={getDoctor(activeConsultation.assignedDoctorId)?.name ?? activeConsultation.assignedTo ?? "Assigned clinician"}
          />
        ) : (
          <InfoRow label="Assigned ophthalmologist" value={activeConsultation?.assignedTo ?? "Not assigned"} />
        )}
        <InfoRow label="Consultations" value={String(patientConsultations.length)} />
        <InfoRow label="Referrals" value={String(patientReferrals.length)} />
        <InfoRow label="Upcoming care" value={String(futureAppointments.length)} />
      </View>

      <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>ACTIVE CARE PLAN</Text>
            <Text style={[styles.planSubtitle, { color: colors.mutedForeground }]}>
              {activeConsultation ? `Linked to ${activeConsultation.status.toLowerCase()} consultation` : "No assigned consultation"}
            </Text>
          </View>
          {activeConsultation?.followUpDate ? (
            <Badge label={`Follow-up ${fmtLongDate(activeConsultation.followUpDate)}`} variant="warning" size="sm" />
          ) : null}
        </View>
        {canEditPlan ? (
          <>
            <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DIAGNOSIS</Text>
            <TextInput
              value={diagnosis}
              onChangeText={setDiagnosis}
              placeholder="Working or confirmed diagnosis"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
            <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TREATMENT PLAN</Text>
            <TextInput
              value={treatment}
              onChangeText={setTreatment}
              placeholder="Medication, procedure, education or monitoring plan"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.multilineInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>FOLLOW-UP DATE</Text>
            <TextInput
              value={followUpDate}
              onChangeText={setFollowUpDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
            <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>CLINICAL NOTE</Text>
            <TextInput
              value={clinicalNote}
              onChangeText={setClinicalNote}
              placeholder="Reasoning, patient instructions or handover note"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.multilineInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: savingPlan ? 0.6 : 1 }]}
              onPress={saveCarePlan}
              disabled={savingPlan}
              activeOpacity={0.85}
            >
              <Feather name="save" size={17} color="#fff" />
              <Text style={styles.primaryBtnText}>{savingPlan ? "Saving care plan..." : "Save care plan"}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.readOnlyPlan}>
            <InfoRow label="Diagnosis" value={activeConsultation?.diagnosis ?? activeConsultation?.diagnosisOverride ?? "Not recorded"} />
            <InfoRow label="Treatment" value={activeConsultation?.treatment ?? activeConsultation?.treatmentPlan ?? "Not recorded"} />
            <InfoRow label="Follow-up" value={activeConsultation?.followUpDate ? fmtLongDate(activeConsultation.followUpDate) : "Not planned"} />
            <InfoRow label="Clinical note" value={activeConsultation?.clinicalNotes ?? "Not recorded"} />
          </View>
        )}
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>UPCOMING FOLLOW-UP</Text>
          <Feather name="calendar" size={16} color={colors.primary} />
        </View>
        {futureAppointments.length > 0 || activeConsultation?.followUpDate ? (
          <>
            {activeConsultation?.followUpDate ? (
              <View style={styles.followUpRow}>
                <View style={[styles.followUpIcon, { backgroundColor: colors.warningLight }]}>
                  <Feather name="clock" size={16} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.followUpTitle, { color: colors.foreground }]}>Clinical follow-up</Text>
                  <Text style={[styles.followUpMeta, { color: colors.mutedForeground }]}>{fmtLongDate(activeConsultation.followUpDate)}</Text>
                </View>
              </View>
            ) : null}
            {futureAppointments.map((appointment) => (
              <View key={appointment.id} style={styles.followUpRow}>
                <View style={[styles.followUpIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name="calendar" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.followUpTitle, { color: colors.foreground }]}>{appointment.type} appointment</Text>
                  <Text style={[styles.followUpMeta, { color: colors.mutedForeground }]}>{fmtLongDate(appointment.scheduledDate)} · {appointment.facility}</Text>
                </View>
              </View>
            ))}
          </>
        ) : (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No follow-up is currently planned.</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push(`/screening/new?patientId=${patient.id}`)}
        activeOpacity={0.85}
      >
        <Feather name="camera" size={18} color="#fff" />
        <Text style={styles.primaryBtnText}>New Screening</Text>
      </TouchableOpacity>

      <View>
        <SectionHeader title={`Clinical timeline (${timeline.length})`} />
        {timeline.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No clinical events yet</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {timeline.map((event, index) => (
              <TouchableOpacity
                key={`${event.kind}-${event.date}-${index}`}
                style={styles.timelineRow}
                onPress={event.onPress}
                disabled={!event.onPress}
                activeOpacity={0.8}
              >
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: colors.primary }]}>
                    <Feather name={event.icon} size={12} color="#fff" />
                  </View>
                  {index < timeline.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}
                </View>
                <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.timelineTop}>
                    <Text style={[styles.timelineKind, { color: colors.primary }]}>{event.kind}</Text>
                    <Text style={[styles.timelineDate, { color: colors.mutedForeground }]}>{fmtLongDate(event.date)}</Text>
                  </View>
                  <Text style={[styles.timelineTitle, { color: colors.foreground }]}>{event.title}</Text>
                  <Text style={[styles.timelineDetail, { color: colors.mutedForeground }]} numberOfLines={2}>{event.detail}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View>
        <SectionHeader title={`Screenings (${screenings.length})`} />
        {screenings.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No screenings yet</Text>
          </View>
        ) : (
          screenings.map((s) => (
            <ScreeningCard
              key={s.id}
              screening={s}
              onPress={() => router.push(`/screening/${s.id}`)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },
  profileCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: { fontSize: 28, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700" },
  patientId: { fontSize: 13 },
  tagsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  infoCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" },
  conditionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  condition: { fontSize: 14 },
  planCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  planSubtitle: { fontSize: 12, marginTop: 4 },
  formLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  multilineInput: { minHeight: 76, textAlignVertical: "top" },
  readOnlyPlan: { gap: 12 },
  followUpRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  followUpIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  followUpTitle: { fontSize: 14, fontWeight: "700" },
  followUpMeta: { fontSize: 12, marginTop: 3 },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: "row", alignItems: "stretch", gap: 10, minHeight: 86 },
  timelineRail: { width: 28, alignItems: "center" },
  timelineDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", zIndex: 1 },
  timelineLine: { width: 2, flex: 1, marginTop: -1 },
  timelineCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 4 },
  timelineTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  timelineKind: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  timelineDate: { fontSize: 10 },
  timelineTitle: { fontSize: 14, fontWeight: "700" },
  timelineDetail: { fontSize: 12, lineHeight: 17 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  emptyText: { fontSize: 14 },
});
