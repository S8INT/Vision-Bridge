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
import { useApp, CareCoordinationStatus, UserRole } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { fmtDate, fmtDateTime } from "@/utils/date";
import { InfoRow } from "@/components/ui/InfoRow";
import { getCareStatusColor, getPriorityVariant } from "@/utils/status";
import { Avatar } from "@/components/ui/Avatar";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

function ActionButton({ icon, label, color, onPress, disabled }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={`consultation-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
      style={[
        styles.actionBtn,
        {
          backgroundColor: disabled ? colors.muted : color + "18",
          borderColor: disabled ? colors.border : color + "40",
        },
      ]}
    >
      <Feather name={icon} size={18} color={disabled ? colors.mutedForeground : color} />
      <Text style={[styles.actionBtnText, { color: disabled ? colors.mutedForeground : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RoleWorkspaceBanner({ role, status, colors }: { role: UserRole; status: string; colors: ReturnType<typeof useColors> }) {
  let title = "";
  let message = "";
  let icon: keyof typeof Feather.glyphMap = "info";
  let bg = colors.primary + "14";
  let border = colors.primary + "30";
  let iconColor = colors.primary;
  let titleColor = colors.primaryDark;

  switch (role) {
    case "Patient":
      title = "Your Consultation";
      message = "Review your clinical summary and upcoming appointments.";
      icon = "user";
      bg = colors.successLight;
      border = colors.normalBorder;
      iconColor = colors.success;
      titleColor = colors.normalText;
      break;
    case "Admin":
      title = "Admin Workspace";
      message = "Manage assignments, referrals, and care coordination.";
      icon = "shield";
      bg = colors.secondary;
      border = colors.border;
      iconColor = colors.secondaryForeground;
      titleColor = colors.secondaryForeground;
      break;
    case "Doctor":
      title = "Specialist Workspace";
      message = status === "Reviewed" || status === "Completed"
        ? "You have submitted a response for this case."
        : "Review case details and submit a clinical response.";
      icon = "briefcase"; // Use a standard icon since stethoscope is not in standard feather
      break;
    case "Technician":
      title = "Technician Workspace";
      message = "Coordinate patient care, referrals, and appointments.";
      icon = "tool";
      bg = colors.warningLight;
      border = colors.warning + "55";
      iconColor = colors.warning;
      titleColor = colors.foreground;
      break;
    case "CHW":
      title = "Community Health Workspace";
      message = "Assist patient with referrals and care follow-up.";
      icon = "users";
      bg = colors.warningLight;
      border = colors.warning + "55";
      iconColor = colors.warning;
      titleColor = colors.foreground;
      break;
    case "Viewer":
      title = "Read-only Workspace";
      message = "Review the consultation record. Clinical and coordination actions are restricted.";
      icon = "eye";
      bg = colors.muted;
      border = colors.border;
      iconColor = colors.mutedForeground;
      titleColor = colors.foreground;
      break;
  }

  return (
    <View style={[styles.roleBanner, { backgroundColor: bg, borderColor: border }]}>
      <Feather name={icon} size={20} color={iconColor} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.roleBannerTitle, { color: titleColor }]}>{title}</Text>
        <Text style={[styles.roleBannerDesc, { color: colors.mutedForeground }]}>{message}</Text>
      </View>
    </View>
  );
}

export default function ConsultationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const {
    consultations, getPatient, screenings,
    updateConsultation, currentUser, doctors,
    assignRoundRobin, assignConsultation,
    referrals, appointments, addNotification,
    getReferral, getAppointment,
  } = useApp();
  const { user, can } = useAuth();

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

  const { topPad, botPad } = useScreenPadding();

  if (!consultation) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Consultation not found</Text>
      </View>
    );
  }

  const role = user?.role ?? currentUser.role;
  const isPatient = role === "Patient";
  const patientOwnsConsultation =
    !isPatient ||
    (!!user && !!patient && patient.userId === user.id);

  if (!can("consultation", "read") || !patientOwnsConsultation) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="shield" size={36} color={colors.mutedForeground} />
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>This consultation is not available for your account.</Text>
      </View>
    );
  }

  const activeConsultation = consultation;
  const isClosed = consultation.status === "Completed" || consultation.status === "Cancelled";
  const statusColor = getCareStatusColor(consultation.status, colors);

  // ── Role Policy ──
  const canAssign = role === "Admin" || (role === "Doctor" && !consultation.assignedDoctorId);
  const canCall = ["Admin", "Doctor", "Technician", "Patient"].includes(role);
  const canRespond = role === "Doctor";
  const canRefer = ["Admin", "Doctor", "Technician", "CHW"].includes(role);
  const canAppoint = ["Admin", "Doctor", "Technician", "CHW", "Patient"].includes(role);
  const canCareCoord = ["Admin", "Doctor", "Technician", "CHW"].includes(role);
  const canComplete = ["Admin", "Doctor"].includes(role);

  const availableActions = [
    ...(canAssign ? [{ id: 'assign', icon: "user-check", label: "Assign Doctor", color: colors.primary, onPress: () => setShowAssignForm(!showAssignForm), disabled: !!consultation.assignedDoctorId || isClosed }] : []),
    ...(canCall ? [{ id: 'call', icon: "video", label: "Start Call", color: colors.tint, onPress: () => router.push(`/consultation/call?id=${consultation.id}&patientName=${encodeURIComponent(patient ? `${patient.firstName} ${patient.lastName}` : "Patient")}`), disabled: isClosed }] : []),
    ...(canRespond ? [{ id: 'respond', icon: "edit-3", label: "Add Response", color: colors.accent, onPress: () => setShowResponseForm(!showResponseForm), disabled: isClosed }] : []),
    ...(canRefer ? [{ id: 'refer', icon: "send", label: "Create Referral", color: colors.warning, onPress: () => router.push(`/referral/new?consultationId=${consultation.id}&patientId=${consultation.patientId}`), disabled: !!referral || isClosed }] : []),
    ...(canAppoint ? [{ id: 'appoint', icon: "calendar", label: "Book Appt", color: colors.success, onPress: () => router.push(`/appointment/book?consultationId=${consultation.id}&patientId=${consultation.patientId}`), disabled: !!appointment || isClosed }] : []),
    ...(canCareCoord ? [{ id: 'coord', icon: "clipboard", label: "Care Plan", color: colors.primary, onPress: () => setShowCareCoordForm(!showCareCoordForm), disabled: isClosed }] : []),
    ...(canComplete ? [{ id: 'complete', icon: "check-circle", label: "Mark Complete", color: colors.success, onPress: handleMarkCompleted, disabled: consultation.status !== "Reviewed" || isClosed }] : []),
  ];

  async function handleRoundRobinAssign() {
    try {
      const doc = await assignRoundRobin(activeConsultation.id);
      if (!doc) {
        Alert.alert("No Available Doctors", "All specialists are currently unavailable. Please assign manually.");
        return;
      }
      addNotification({ type: "ConsultationUpdate", title: "Case Auto-Assigned", body: `${patient?.firstName} ${patient?.lastName}'s case assigned to ${doc.name} (round-robin)`, patientId: activeConsultation.patientId, consultationId: activeConsultation.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Assigned", `Case assigned to ${doc.name} via round-robin.`);
      setShowAssignForm(false);
    } catch {
      Alert.alert("Assignment failed", "The consultation could not be assigned. Please try again.");
    }
  }

  async function handleManualAssign() {
    if (!selectedDoctorId) { Alert.alert("Select a Doctor", "Please select a specialist to assign."); return; }
    try {
      await assignConsultation(activeConsultation.id, selectedDoctorId, "Manual");
      const doc = doctors.find((d) => d.id === selectedDoctorId);
      addNotification({ type: "ConsultationUpdate", title: "Case Manually Assigned", body: `${patient?.firstName} ${patient?.lastName}'s case assigned to ${doc?.name}`, patientId: activeConsultation.patientId, consultationId: activeConsultation.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAssignForm(false);
    } catch {
      Alert.alert("Assignment failed", "The consultation could not be assigned. Please try again.");
    }
  }

  async function handleSubmitResponse() {
    if (!response.trim()) { Alert.alert("Response Required", "Enter your clinical response."); return; }
    try {
      await updateConsultation(activeConsultation.id, {
        status: "Reviewed",
        specialistResponse: response.trim(),
        diagnosisOverride: diagnosisOverride.trim() || undefined,
        treatmentPlan: treatmentPlan.trim() || undefined,
        diagnosis: diagnosisOverride.trim() || undefined,
        treatment: treatmentPlan.trim() || undefined,
        respondedAt: new Date().toISOString(),
        assignedTo: currentUser.name,
      });
      addNotification({ type: "ConsultationUpdate", title: "Specialist Response Submitted", body: `${patient?.firstName} ${patient?.lastName}'s case has been reviewed`, patientId: activeConsultation.patientId, consultationId: activeConsultation.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowResponseForm(false);
      Alert.alert("Response Saved", "The referring clinician has been notified.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The response could not be saved.";
      Alert.alert("Save failed", message);
    }
  }

  async function handleSaveCareCoord() {
    try {
      await updateConsultation(activeConsultation.id, {
        careCoordinatorNotes: careNotes.trim() || undefined,
        followUpDate: followUpDate ? `${followUpDate}T09:00:00Z` : undefined,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowCareCoordForm(false);
      Alert.alert("Care Plan Updated", "Coordination notes and follow-up date saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The care plan could not be saved.";
      Alert.alert("Save failed", message);
    }
  }

  function handleMarkCompleted() {
    Alert.alert("Mark as Completed", "Mark this consultation as fully completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete",
        onPress: async () => {
          try {
            await updateConsultation(activeConsultation.id, { status: "Completed" });
            addNotification({ type: "ConsultationUpdate", title: "Consultation Completed", body: `${patient?.firstName} ${patient?.lastName}'s care episode marked complete`, patientId: activeConsultation.patientId, consultationId: activeConsultation.id });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            const message = error instanceof Error ? error.message : "The consultation could not be completed.";
            Alert.alert("Update failed", message);
          }
        },
      },
    ]);
  }

  const availableDoctors = doctors.filter((d) => d.isAvailable);
  const showCarePlanSection = consultation.followUpDate || (!isPatient && consultation.careCoordinatorNotes);

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
          {!isPatient && consultation.assignmentMethod ? (
            <View style={styles.metaItem}>
              <Feather name="shuffle" size={13} color={colors.mutedForeground} />
               <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                 {consultation.assignmentMethod === "Intelligent" ? "Smart routing" : consultation.assignmentMethod}
               </Text>
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

      <RoleWorkspaceBanner role={role} status={consultation.status} colors={colors} />

      {/* ── Quick Actions ── */}
      {availableActions.length > 0 ? (
        <View style={styles.actionsGrid}>
          {availableActions.map((action) => (
            <ActionButton
              key={action.id}
              icon={action.icon as keyof typeof Feather.glyphMap}
              label={action.label}
              color={action.color}
              onPress={action.onPress}
              disabled={action.disabled}
            />
          ))}
        </View>
      ) : null}

      {/* ── Doctor Assignment Form ── */}
      {showAssignForm && canAssign ? (
        <Section title="ASSIGN SPECIALIST">
          <View style={styles.assignMethodRow}>
            <TouchableOpacity
              style={[styles.methodBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={handleRoundRobinAssign}
              activeOpacity={0.85}
            >
              <Feather name="shuffle" size={16} color={colors.primaryForeground} />
              <Text style={[styles.methodBtnText, { color: colors.primaryForeground }]}>Auto Assign (Round-Robin)</Text>
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
            <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>Confirm Manual Assignment</Text>
          </TouchableOpacity>
        </Section>
      ) : null}

      {/* ── Patient ── */}
      {patient ? (
        <TouchableOpacity onPress={() => router.push(`/patient/${patient.id}`)} activeOpacity={0.8}
          style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.patientRow}>
            <Avatar firstName={patient.firstName} lastName={patient.lastName} size={44} fontSize={16} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.patientName, { color: colors.foreground }]}>
                {isPatient ? "Your Profile" : `${patient.firstName} ${patient.lastName}`}
              </Text>
              {!isPatient && (
                <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>
                  {patient.patientId} · {patient.village}
                </Text>
              )}
              {patient.medicalHistory.length > 0 ? (
                <Text style={[styles.history, { color: colors.mutedForeground }]} numberOfLines={1}>{patient.medicalHistory.join(", ")}</Text>
              ) : null}
            </View>
            {!isPatient && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
          </View>
        </TouchableOpacity>
      ) : null}

      {/* ── Assigned Specialist ── */}
      {consultation.assignedTo ? (
        <Section title="ASSIGNED SPECIALIST">
          <View style={styles.patientRow}>
            <View style={[styles.docAv, { backgroundColor: colors.accent + "18" }]}>
              <Feather name="user-check" size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.foreground }]}>{consultation.assignedTo}</Text>
              {!isPatient && consultation.assignedAt ? (
                <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
                  Assigned {fmtDateTime(consultation.assignedAt)} · {consultation.assignmentMethod}
                </Text>
              ) : null}
            </View>
            {!isPatient && (
              <Badge label={consultation.assignmentMethod ?? "Manual"} variant="referral" size="sm" />
            )}
          </View>
        </Section>
      ) : !isPatient ? (
        <View style={[styles.section, { backgroundColor: colors.warningLight, borderColor: colors.warning + "55" }]}>
          <View style={styles.patientRow}>
            <Feather name="alert-circle" size={18} color={colors.warning} />
               <Text style={[styles.warningText, { color: colors.foreground }]}>
                 {consultation.routingStatus === "SPECIALTY_QUEUE"
                   ? `Waiting in the ${consultation.specialty ?? "specialty"} queue. A coordinator can assign this case when an appropriate specialist is available.`
                   : "No specialist assigned yet. Use Assign Doctor above."}
               </Text>
          </View>
        </View>
      ) : null}

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

      {/* ── Routing Summary ── */}
      {!isPatient && consultation.routingReason ? (
        <Section title="ROUTING SUMMARY">
          <View style={styles.patientRow}>
            <Feather name="git-branch" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.foreground }]}>
                {consultation.specialty ?? "General Ophthalmology"} pathway
              </Text>
              <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
                {consultation.routingReason}
              </Text>
            </View>
          </View>
          <Text style={[styles.routingDisclaimer, { color: colors.mutedForeground }]}>
            Routing is a clinical decision-support recommendation. The assigned ophthalmologist remains responsible for the clinical assessment.
          </Text>
        </Section>
      ) : null}

      {/* ── Specialist Response Form ── */}
      {showResponseForm && canRespond ? (
        <Section title="SPECIALIST RESPONSE">
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Diagnosis Override</Text>
          <TextInput value={diagnosisOverride} onChangeText={setDiagnosisOverride} placeholder="Confirmed or revised diagnosis..." placeholderTextColor={colors.mutedForeground} style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Treatment Plan</Text>
          <TextInput value={treatmentPlan} onChangeText={setTreatmentPlan} placeholder="Recommended treatment and medications..." placeholderTextColor={colors.mutedForeground} style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Clinical Response *</Text>
          <TextInput value={response} onChangeText={setResponse} placeholder="Detailed clinical observations and recommendations..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={4} style={[styles.textArea, { color: colors.foreground, borderColor: colors.border }]} />
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleSubmitResponse} activeOpacity={0.85}>
            <Feather name="send" size={16} color={colors.primaryForeground} />
            <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>Submit Response</Text>
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
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>DIAGNOSIS</Text>
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
          {canRespond && !isClosed ? (
            <TouchableOpacity onPress={() => setShowResponseForm(true)} style={{ marginTop: 12 }}>
              <Text style={[styles.editLink, { color: colors.primary }]}>Edit response</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ── Care Coordination Form ── */}
      {showCareCoordForm && canCareCoord ? (
        <Section title="CARE PLAN">
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Coordinator Notes</Text>
          <TextInput value={careNotes} onChangeText={setCareNotes} placeholder="Transport arranged, family notified, insurance status..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} style={[styles.textArea, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Follow-up Date (YYYY-MM-DD)</Text>
          <TextInput value={followUpDate} onChangeText={setFollowUpDate} placeholder="2025-05-01" placeholderTextColor={colors.mutedForeground} style={[styles.inputField, { color: colors.foreground, borderColor: colors.border }]} keyboardType="numeric" />
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCareCoord} activeOpacity={0.85}>
            <Feather name="save" size={16} color={colors.primaryForeground} />
            <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>Save Care Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowCareCoordForm(false)}><Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></TouchableOpacity>
        </Section>
      ) : null}

      {/* ── Care Coordination (saved) ── */}
      {showCarePlanSection && !showCareCoordForm ? (
        <Section title="CARE PLAN">
          {!isPatient && consultation.careCoordinatorNotes ? (
            <InfoRow labelFlex={0.45} label="Coordinator Notes" value={consultation.careCoordinatorNotes} />
          ) : null}
          {consultation.followUpDate ? (
            <InfoRow labelFlex={0.45} label="Follow-up Date" value={fmtDate(consultation.followUpDate)} valueColor={colors.primary} />
          ) : null}
          {canCareCoord && !isClosed ? (
            <TouchableOpacity onPress={() => setShowCareCoordForm(true)} style={{ marginTop: 8 }}>
              <Text style={[styles.editLink, { color: colors.primary }]}>Edit care plan</Text>
            </TouchableOpacity>
          ) : null}
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
      ) : canRefer ? (
        <TouchableOpacity
          onPress={() => router.push(`/referral/new?consultationId=${consultation.id}&patientId=${consultation.patientId}`)}
          activeOpacity={0.8}
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          disabled={isClosed}
        >
          <Feather name="plus-circle" size={16} color={isClosed ? colors.mutedForeground : colors.primary} />
          <Text style={[styles.ghostBtnText, { color: isClosed ? colors.mutedForeground : colors.primary }]}>Create Referral</Text>
        </TouchableOpacity>
      ) : null}

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
      ) : canAppoint ? (
        <TouchableOpacity
          onPress={() => router.push(`/appointment/book?consultationId=${consultation.id}&patientId=${consultation.patientId}`)}
          activeOpacity={0.8}
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          disabled={isClosed}
        >
          <Feather name="plus-circle" size={16} color={isClosed ? colors.mutedForeground : colors.success} />
          <Text style={[styles.ghostBtnText, { color: isClosed ? colors.mutedForeground : colors.success }]}>Book Appointment</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Status Timeline ── */}
      {!isPatient && (
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
                    {isDone ? <Feather name="check" size={10} color={colors.successForeground} /> : null}
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
      )}
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

  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontWeight: "500" },

  roleBanner: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  roleBannerTitle: { fontSize: 15, fontWeight: "600", marginBottom: 3 },
  roleBannerDesc: { fontSize: 13, lineHeight: 18 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn: { width: "48%", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { flex: 1, fontSize: 13, fontWeight: "600" },

  section: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  patientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  patientName: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  patientMeta: { fontSize: 13 },
  history: { fontSize: 12, marginTop: 2 },

  docAv: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  docMeta: { fontSize: 13 },
  docLoad: { fontSize: 12, marginTop: 2 },

  eyeWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  warningText: { fontSize: 13, flex: 1, lineHeight: 18, fontWeight: "500" },
  routingDisclaimer: { fontSize: 12, lineHeight: 17, fontStyle: "italic", marginTop: 4 },

  bodyText: { fontSize: 14, lineHeight: 20 },

  fieldLabel: { fontSize: 12, fontWeight: "600", marginTop: 4, marginBottom: 4 },
  inputField: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, height: 44 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" },

  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 10, marginTop: 6 },
  confirmBtnText: { fontSize: 14, fontWeight: "600" },
  cancelText: { textAlign: "center", fontSize: 14, padding: 8 },

  editLink: { fontSize: 13, fontWeight: "600", alignSelf: "flex-start" },

  responseHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  responseTitle: { fontSize: 14, fontWeight: "700" },
  responseDate: { fontSize: 12, marginLeft: "auto" },

  ghostBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderStyle: "dashed" },
  ghostBtnText: { fontSize: 14, fontWeight: "600" },

  timelineRow: { flexDirection: "row", alignItems: "center", height: 28 },
  timelineLeft: { width: 20, alignItems: "center", justifyContent: "center" },
  timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  timelineLine: { position: "absolute", top: 14, bottom: -14, width: 2 },
  timelineLabel: { fontSize: 14, marginLeft: 12 },

  assignMethodRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  methodBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  methodBtnText: { fontSize: 14, fontWeight: "600" },
  orDivider: { textAlign: "center", fontSize: 13, marginVertical: 8 },
  doctorOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  unavailNote: { fontSize: 13, textAlign: "center", fontStyle: "italic", marginTop: 4, marginBottom: 12 },
});
