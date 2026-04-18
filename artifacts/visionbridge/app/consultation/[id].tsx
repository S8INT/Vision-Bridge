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
import { useApp, CareCoordinationStatus } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";

function getPriorityVariant(p: string) {
  if (p === "Emergency") return "urgent";
  if (p === "Urgent") return "warning";
  return "muted";
}

function getStatusColor(status: CareCoordinationStatus, colors: ReturnType<typeof useColors>) {
  switch (status) {
    case "Completed": return colors.success;
    case "Reviewed": return colors.success;
    case "InReview": return colors.warning;
    case "Assigned": return colors.accent;
    case "Referred": return colors.primary;
    case "Cancelled": return colors.mutedForeground;
    default: return colors.mutedForeground;
  }
}

function getStatusVariant(status: CareCoordinationStatus) {
  switch (status) {
    case "Completed":
    case "Reviewed":
      return "success";
    case "InReview":
      return "warning";
    case "Assigned":
      return "referral";
    case "Referred":
      return "default";
    case "Cancelled":
      return "muted";
    default:
      return "muted";
  }
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-UG", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", { month: "short", day: "numeric", year: "numeric" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? colors.foreground }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function ActionButton({ icon, label, color, onPress, disabled }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.actionBtn, { backgroundColor: disabled ? "#e5e7eb" : color + "18", borderColor: disabled ? "#e5e7eb" : color + "40" }]}
    >
      <Feather name={icon} size={18} color={disabled ? "#9ca3af" : color} />
      <Text style={[styles.actionBtnText, { color: disabled ? "#9ca3af" : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ConsultationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    consultations, getPatient, screenings,
    updateConsultation, currentUser, doctors,
    assignRoundRobin, assignConsultation,
    referrals, appointments, addNotification,
    getReferral, getAppointment,
  } = useApp();

  const consultation = consultations.find((c) => c.id === id);
  const patient = consultation ? getPatient(consultation.patientId) : undefined;
  const screening = consultation ? screenings.find((s) => s.id === consultation.screeningId) : undefined;
  const referral = consultation?.referralId ? getReferral(consultation.referralId) : undefined;
  const appointment = consultation?.appointmentId ? getAppointment(consultation.appointmentId) : undefined;

  const [showResponseForm, setShowResponseForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showCareCoordForm, setShowCareCoordForm] = useState(false);

  const [response, setResponse] = useState(consultation?.specialistResponse ?? "");
  const [diagnosisOverride, setDiagnosisOverride] = useState(consultation?.diagnosisOverride ?? "");
  const [treatmentPlan, setTreatmentPlan] = useState(consultation?.treatmentPlan ?? "");
  const [followUpDate, setFollowUpDate] = useState(consultation?.followUpDate?.split("T")[0] ?? "");
  const [careNotes, setCareNotes] = useState(consultation?.careCoordinatorNotes ?? "");
  const [selectedDoctorId, setSelectedDoctorId] = useState(consultation?.assignedDoctorId ?? "");

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  if (!consultation) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Consultation not found</Text>
      </View>
    );
  }

  const isClosed = consultation.status === "Completed" || consultation.status === "Cancelled";
  const statusColor = getStatusColor(consultation.status, colors);

  function handleRoundRobinAssign() {
    const doc = assignRoundRobin(consultation.id);
    if (!doc) {
      Alert.alert("No Available Doctors", "All specialists are currently unavailable. Please assign manually.");
      return;
    }
    addNotification({ type: "ConsultationUpdate", title: "Case Auto-Assigned", body: `${patient?.firstName} ${patient?.lastName}'s case assigned to ${doc.name} (round-robin)`, patientId: consultation.patientId, consultationId: consultation.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Assigned", `Case assigned to ${doc.name} via round-robin.`);
    setShowAssignForm(false);
  }

  function handleManualAssign() {
    if (!selectedDoctorId) { Alert.alert("Select a Doctor", "Please select a specialist to assign."); return; }
    assignConsultation(consultation.id, selectedDoctorId, "Manual");
    const doc = doctors.find((d) => d.id === selectedDoctorId);
    addNotification({ type: "ConsultationUpdate", title: "Case Manually Assigned", body: `${patient?.firstName} ${patient?.lastName}'s case assigned to ${doc?.name}`, patientId: consultation.patientId, consultationId: consultation.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAssignForm(false);
  }

  function handleSubmitResponse() {
    if (!response.trim()) { Alert.alert("Response Required", "Enter your clinical response."); return; }
    updateConsultation(consultation.id, {
      status: "Reviewed",
      specialistResponse: response.trim(),
      diagnosisOverride: diagnosisOverride.trim() || undefined,
      treatmentPlan: treatmentPlan.trim() || undefined,
      diagnosis: diagnosisOverride.trim() || undefined,
      treatment: treatmentPlan.trim() || undefined,
      respondedAt: new Date().toISOString(),
      assignedTo: currentUser.name,
    });
    addNotification({ type: "ConsultationUpdate", title: "Specialist Response Submitted", body: `${patient?.firstName} ${patient?.lastName}'s case has been reviewed`, patientId: consultation.patientId, consultationId: consultation.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowResponseForm(false);
    Alert.alert("Response Saved", "The referring clinician has been notified.");
  }

  function handleSaveCareCoord() {
    updateConsultation(consultation.id, {
      careCoordinatorNotes: careNotes.trim() || undefined,
      followUpDate: followUpDate ? `${followUpDate}T09:00:00Z` : undefined,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCareCoordForm(false);
    Alert.alert("Care Plan Updated", "Coordination notes and follow-up date saved.");
  }

  function handleMarkCompleted() {
    Alert.alert("Mark as Completed", "Mark this consultation as fully completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete",
        onPress: () => {
          updateConsultation(consultation.id, { status: "Completed" });
          addNotification({ type: "ConsultationUpdate", title: "Consultation Completed", body: `${patient?.firstName} ${patient?.lastName}'s care episode marked complete`, patientId: consultation.patientId, consultationId: consultation.id });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }

  const availableDoctors = doctors.filter((d) => d.isAvailable);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.consultId, { color: colors.mutedForeground }]}>CONSULTATION #{consultation.id.slice(-6).toUpperCase()}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{consultation.status}</Text>
            </View>
          </View>
          <Badge label={consultation.priority} variant={getPriorityVariant(consultation.priority)} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{fmtDate(consultation.requestedAt)}</Text>
          </View>
          {consultation.assignmentMethod ? (
            <View style={styles.metaItem}>
              <Feather name="shuffle" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{consultation.assignmentMethod}</Text>
            </View>
          ) : null}
          {consultation.followUpDate ? (
            <View style={styles.metaItem}>
              <Feather name="calendar" size={13} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.primary }]}>Follow-up {fmtDate(consultation.followUpDate)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.actionsGrid}>
        <ActionButton icon="user-check" label="Assign Doctor" color={colors.primary} onPress={() => setShowAssignForm(!showAssignForm)} disabled={!!consultation.assignedDoctorId || isClosed} />
        <ActionButton icon="video" label="Start Call" color="#0ea5e9" onPress={() => router.push(`/consultation/call?id=${consultation.id}&patientName=${encodeURIComponent(patient ? `${patient.firstName} ${patient.lastName}` : "Patient")}`)} disabled={isClosed} />
        <ActionButton icon="edit-3" label="Add Response" color={colors.accent} onPress={() => setShowResponseForm(!showResponseForm)} disabled={isClosed} />
        <ActionButton icon="send" label="Create Referral" color={colors.warning} onPress={() => router.push(`/referral/new?consultationId=${consultation.id}&patientId=${consultation.patientId}`)} disabled={!!referral || isClosed} />
        <ActionButton icon="calendar" label="Book Appointment" color={colors.success} onPress={() => router.push(`/appointment/book?consultationId=${consultation.id}&patientId=${consultation.patientId}`)} disabled={!!appointment || isClosed} />
        <ActionButton icon="clipboard" label="Care Coordination" color={colors.primary} onPress={() => setShowCareCoordForm(!showCareCoordForm)} disabled={isClosed} />
        {!isClosed ? (
          <ActionButton icon="check-circle" label="Mark Complete" color={colors.success} onPress={handleMarkCompleted} disabled={consultation.status !== "Reviewed"} />
        ) : null}
      </View>

      {/* ── Doctor Assignment Form ── */}
      {showAssignForm ? (
        <Section title="ASSIGN SPECIALIST">
          <View style={styles.assignMethodRow}>
            <TouchableOpacity
              style={[styles.methodBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={handleRoundRobinAssign}
              activeOpacity={0.85}
            >
              <Feather name="shuffle" size={16} color="#fff" />
              <Text style={styles.methodBtnText}>Auto Assign (Round-Robin)</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.orDivider, { color: colors.mutedForeground }]}>— or choose manually —</Text>
          {availableDoctors.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              onPress={() => { setSelectedDoctorId(doc.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.doctorOption, { borderColor: selectedDoctorId === doc.id ? colors.primary : colors.border, backgroundColor: selectedDoctorId === doc.id ? colors.primary + "10" : "transparent" }]}
            >
              <View style={[styles.docAv, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="user" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docName, { color: colors.foreground }]}>{doc.name}</Text>
                <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>{doc.specialty} · {doc.clinic}</Text>
                <Text style={[styles.docLoad, { color: colors.mutedForeground }]}>{doc.totalAssigned} cases assigned</Text>
              </View>
              {selectedDoctorId === doc.id ? <Feather name="check-circle" size={18} color={colors.primary} /> : null}
            </TouchableOpacity>
          ))}
          {unavailableDoctors(doctors).length > 0 ? (
            <Text style={[styles.unavailNote, { color: colors.mutedForeground }]}>
              {unavailableDoctors(doctors).length} specialist(s) currently unavailable
            </Text>
          ) : null}
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleManualAssign} activeOpacity={0.85}>
            <Text style={styles.confirmBtnText}>Confirm Manual Assignment</Text>
          </TouchableOpacity>
        </Section>
      ) : null}

      {/* ── Patient ── */}
      {patient ? (
        <TouchableOpacity onPress={() => router.push(`/patient/${patient.id}`)} activeOpacity={0.8}
          style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.patientRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>{patient.firstName[0]}{patient.lastName[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.patientName, { color: colors.foreground }]}>{patient.firstName} {patient.lastName}</Text>
              <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>{patient.patientId} · {patient.village}</Text>
              {patient.medicalHistory.length > 0 ? (
                <Text style={[styles.history, { color: colors.mutedForeground }]} numberOfLines={1}>{patient.medicalHistory.join(", ")}</Text>
              ) : null}
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      ) : null}

      {/* ── Assigned Doctor ── */}
      {consultation.assignedTo ? (
        <Section title="ASSIGNED SPECIALIST">
          <View style={styles.patientRow}>
            <View style={[styles.docAv, { backgroundColor: colors.accent + "18" }]}>
              <Feather name="user-check" size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.foreground }]}>{consultation.assignedTo}</Text>
              {consultation.assignedAt ? (
                <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
                  Assigned {fmtDateTime(consultation.assignedAt)} · {consultation.assignmentMethod}
                </Text>
              ) : null}
            </View>
            <Badge label={consultation.assignmentMethod ?? "Manual"} variant="referral" size="sm" />
          </View>
        </Section>
      ) : (
        <View style={[styles.section, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
          <View style={styles.patientRow}>
            <Feather name="alert-circle" size={18} color={colors.warning} />
            <Text style={[styles.warningText, { color: "#92400e" }]}>No specialist assigned yet. Use Assign Doctor above.</Text>
          </View>
        </View>
      )}

      {/* ── Linked Screening ── */}
      {screening ? (
        <TouchableOpacity onPress={() => router.push(`/screening/${screening.id}`)} activeOpacity={0.8}
          style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LINKED SCREENING</Text>
          <View style={styles.patientRow}>
            <View style={[styles.eyeWrap, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="eye" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.foreground }]}>{screening.aiRiskLevel} Risk · {screening.aiConfidence}% confidence</Text>
              <Text style={[styles.docMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{screening.aiFindings.join(" · ")}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      ) : null}

      {/* ── Clinical Notes ── */}
      {consultation.clinicalNotes ? (
        <Section title="CLINICAL NOTES">
          <Text style={[styles.bodyText, { color: colors.foreground }]}>{consultation.clinicalNotes}</Text>
        </Section>
      ) : null}

      {/* ── Specialist Response Form ── */}
      {showResponseForm ? (
        <Section title="SPECIALIST RESPONSE">
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Diagnosis Override</Text>
          <TextInput value={diagnosisOverride} onChangeText={setDiagnosisOverride} placeholder="Confirmed or revised diagnosis..." placeholderTextColor={colors.mutedForeground} style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Treatment Plan</Text>
          <TextInput value={treatmentPlan} onChangeText={setTreatmentPlan} placeholder="Recommended treatment and medications..." placeholderTextColor={colors.mutedForeground} style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Clinical Response *</Text>
          <TextInput value={response} onChangeText={setResponse} placeholder="Detailed clinical observations and recommendations..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={4} style={[styles.textArea, { color: colors.foreground, borderColor: colors.border }]} />
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleSubmitResponse} activeOpacity={0.85}>
            <Feather name="send" size={16} color="#fff" />
            <Text style={styles.confirmBtnText}>Submit Response</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowResponseForm(false)}><Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></TouchableOpacity>
        </Section>
      ) : null}

      {/* ── Specialist Response (saved) ── */}
      {consultation.specialistResponse && !showResponseForm ? (
        <View style={[styles.section, { backgroundColor: colors.successLight, borderColor: colors.normalBorder }]}>
          <View style={styles.responseHeader}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={[styles.responseTitle, { color: colors.success }]}>Specialist Response</Text>
            {consultation.respondedAt ? (
              <Text style={[styles.responseDate, { color: colors.mutedForeground }]}>{fmtDate(consultation.respondedAt)}</Text>
            ) : null}
          </View>
          {consultation.diagnosisOverride ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DIAGNOSIS</Text>
              <Text style={[styles.bodyText, { color: colors.foreground }]}>{consultation.diagnosisOverride}</Text>
            </>
          ) : null}
          {consultation.treatmentPlan ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>TREATMENT PLAN</Text>
              <Text style={[styles.bodyText, { color: colors.foreground }]}>{consultation.treatmentPlan}</Text>
            </>
          ) : null}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>NOTES</Text>
          <Text style={[styles.bodyText, { color: colors.foreground }]}>{consultation.specialistResponse}</Text>
          <TouchableOpacity onPress={() => setShowResponseForm(true)} style={{ marginTop: 8 }}>
            <Text style={[styles.editLink, { color: colors.primary }]}>Edit response</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Care Coordination ── */}
      {showCareCoordForm ? (
        <Section title="CARE COORDINATION">
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Coordinator Notes</Text>
          <TextInput value={careNotes} onChangeText={setCareNotes} placeholder="Transport arranged, family notified, insurance status..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} style={[styles.textArea, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Follow-up Date (YYYY-MM-DD)</Text>
          <TextInput value={followUpDate} onChangeText={setFollowUpDate} placeholder="2025-05-01" placeholderTextColor={colors.mutedForeground} style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]} keyboardType="numeric" />
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCareCoord} activeOpacity={0.85}>
            <Feather name="save" size={16} color="#fff" />
            <Text style={styles.confirmBtnText}>Save Care Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowCareCoordForm(false)}><Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></TouchableOpacity>
        </Section>
      ) : null}

      {/* ── Care Coordination (saved) ── */}
      {(consultation.careCoordinatorNotes || consultation.followUpDate) && !showCareCoordForm ? (
        <Section title="CARE COORDINATION">
          {consultation.careCoordinatorNotes ? (
            <InfoRow label="Coordinator Notes" value={consultation.careCoordinatorNotes} />
          ) : null}
          {consultation.followUpDate ? (
            <InfoRow label="Follow-up Date" value={fmtDate(consultation.followUpDate)} valueColor={colors.primary} />
          ) : null}
          <TouchableOpacity onPress={() => setShowCareCoordForm(true)}>
            <Text style={[styles.editLink, { color: colors.primary }]}>Edit care plan</Text>
          </TouchableOpacity>
        </Section>
      ) : null}

      {/* ── Referral ── */}
      {referral ? (
        <TouchableOpacity onPress={() => router.push(`/referral/${referral.id}`)} activeOpacity={0.8}
          style={[styles.section, { backgroundColor: colors.referralBg, borderColor: colors.referralBorder }]}
        >
          <Text style={[styles.sectionLabel, { color: colors.referralText }]}>REFERRAL TRACKING</Text>
          <View style={styles.patientRow}>
            <Feather name="navigation" size={18} color={colors.referralText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.referralText }]}>{referral.targetFacility}</Text>
              <Text style={[styles.docMeta, { color: colors.referralText + "bb" }]}>{referral.type} · {referral.status} · {referral.urgency}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.referralText} />
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => router.push(`/referral/new?consultationId=${consultation.id}&patientId=${consultation.patientId}`)}
          activeOpacity={0.8}
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          disabled={isClosed}
        >
          <Feather name="plus-circle" size={16} color={isClosed ? colors.mutedForeground : colors.primary} />
          <Text style={[styles.ghostBtnText, { color: isClosed ? colors.mutedForeground : colors.primary }]}>Create Referral</Text>
        </TouchableOpacity>
      )}

      {/* ── Appointment ── */}
      {appointment ? (
        <TouchableOpacity onPress={() => router.push(`/appointment/${appointment.id}`)} activeOpacity={0.8}
          style={[styles.section, { backgroundColor: colors.successLight, borderColor: colors.normalBorder }]}
        >
          <Text style={[styles.sectionLabel, { color: colors.normalText }]}>APPOINTMENT</Text>
          <View style={styles.patientRow}>
            <Feather name="calendar" size={18} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.normalText }]}>{appointment.type} · {appointment.facility}</Text>
              <Text style={[styles.docMeta, { color: colors.normalText + "bb" }]}>{appointment.scheduledDate} at {appointment.scheduledTime} · {appointment.status}</Text>
              {appointment.costUGX ? (
                <Text style={[styles.docMeta, { color: colors.normalText + "bb" }]}>UGX {appointment.costUGX.toLocaleString()}{appointment.coveredByInsurance ? " (insured)" : ""}</Text>
              ) : null}
            </View>
            <Feather name="chevron-right" size={16} color={colors.success} />
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => router.push(`/appointment/book?consultationId=${consultation.id}&patientId=${consultation.patientId}`)}
          activeOpacity={0.8}
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          disabled={isClosed}
        >
          <Feather name="plus-circle" size={16} color={isClosed ? colors.mutedForeground : colors.success} />
          <Text style={[styles.ghostBtnText, { color: isClosed ? colors.mutedForeground : colors.success }]}>Book Appointment</Text>
        </TouchableOpacity>
      )}

      {/* ── Status Timeline ── */}
      <Section title="CARE COORDINATION STATUS">
        {(["Pending","Assigned","InReview","Reviewed","Referred","Completed"] as CareCoordinationStatus[]).map((s, i, arr) => {
          const isDone = isStatusReached(s, consultation.status);
          const isCurrent = s === consultation.status;
          return (
            <View key={s} style={styles.timelineRow}>
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineDot, {
                  backgroundColor: isDone ? colors.success : isCurrent ? colors.primary : colors.muted,
                  borderColor: isDone ? colors.success : isCurrent ? colors.primary : colors.border,
                }]}>
                  {isDone ? <Feather name="check" size={10} color="#fff" /> : null}
                </View>
                {i < arr.length - 1 ? (
                  <View style={[styles.timelineLine, { backgroundColor: isDone ? colors.success : colors.border }]} />
                ) : null}
              </View>
              <Text style={[styles.timelineLabel, { color: isCurrent ? colors.primary : isDone ? colors.foreground : colors.mutedForeground, fontWeight: isCurrent ? "700" : "400" }]}>
                {s}
              </Text>
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}

function unavailableDoctors(docs: ReturnType<typeof useApp>["doctors"]) {
  return docs.filter((d) => !d.isAvailable);
}

const STATUS_ORDER: CareCoordinationStatus[] = ["Pending", "Assigned", "InReview", "Reviewed", "Referred", "Completed"];
function isStatusReached(s: CareCoordinationStatus, current: CareCoordinationStatus) {
  return STATUS_ORDER.indexOf(s) <= STATUS_ORDER.indexOf(current);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },

  headerCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  consultId: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 16, fontWeight: "700" },
  divider: { height: 1, marginVertical: 2 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    width: "48%",
  },
  actionBtnText: { fontSize: 12, fontWeight: "600", flex: 1 },

  section: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },

  assignMethodRow: {},
  methodBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  methodBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  orDivider: { textAlign: "center", fontSize: 12, marginVertical: 4 },
  doctorOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  docAv: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: 14, fontWeight: "600" },
  docMeta: { fontSize: 12 },
  docLoad: { fontSize: 11 },
  unavailNote: { fontSize: 12, textAlign: "center" },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  confirmBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  patientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700" },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  history: { fontSize: 11, marginTop: 2 },
  eyeWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  warningText: { fontSize: 13, flex: 1 },

  fieldLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  inputField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  cancelText: { textAlign: "center", fontSize: 14 },

  responseHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  responseTitle: { fontSize: 14, fontWeight: "700", flex: 1 },
  responseDate: { fontSize: 11 },
  editLink: { fontSize: 13, fontWeight: "600" },
  bodyText: { fontSize: 14, lineHeight: 22 },

  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  infoLabel: { fontSize: 13, flex: 0.45 },
  infoValue: { fontSize: 13, fontWeight: "500", flex: 0.55, textAlign: "right" },

  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  ghostBtnText: { fontSize: 14, fontWeight: "600" },

  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 32 },
  timelineLeft: { alignItems: "center", width: 20 },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLine: { width: 2, flex: 1, marginTop: 2 },
  timelineLabel: { fontSize: 13, paddingTop: 2 },
});
