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
import { useApp, AppointmentStatus } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/utils/date";
import { InfoRow } from "@/components/ui/InfoRow";
import { getAppointmentStatusVariant } from "@/utils/status";
import { Avatar } from "@/components/ui/Avatar";

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { appointments, getPatient, updateAppointment, addNotification } = useApp();

  const appointment = appointments.find((a) => a.id === id);
  const patient = appointment ? getPatient(appointment.patientId) : undefined;

  const { topPad, botPad } = useScreenPadding();

  if (!appointment) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Appointment not found</Text>
      </View>
    );
  }

  function handleConfirm() {
    updateAppointment(appointment!.id, { status: "Confirmed", confirmedAt: new Date().toISOString() });
    addNotification({
      type: "AppointmentConfirmed",
      title: "Appointment Confirmed",
      body: `${patient?.firstName} ${patient?.lastName}'s ${appointment!.type} appointment confirmed`,
      patientId: appointment!.patientId,
      appointmentId: appointment!.id,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Confirmed", "Patient will be notified via SMS.");
  }

  function handleComplete() {
    updateAppointment(appointment!.id, { status: "Completed", completedAt: new Date().toISOString() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Completed", "Appointment marked as attended.");
  }

  function handleCancel() {
    Alert.alert("Cancel Appointment", "Are you sure?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Appointment",
        style: "destructive",
        onPress: () => {
          updateAppointment(appointment!.id, { status: "Cancelled" });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.apptId, { color: colors.mutedForeground }]}>APPOINTMENT #{appointment.id.slice(-6).toUpperCase()}</Text>
            <Text style={[styles.apptType, { color: colors.foreground }]}>{appointment.type}</Text>
          </View>
          <Badge label={appointment.status} variant={getAppointmentStatusVariant(appointment.status)} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.dateRow}>
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={[styles.dateText, { color: colors.primary }]}>{appointment.scheduledDate} at {appointment.scheduledTime}</Text>
        </View>
      </View>

      {patient ? (
        <TouchableOpacity
          onPress={() => router.push(`/patient/${patient.id}`)}
          activeOpacity={0.8}
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
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROVIDER DETAILS</Text>
        <InfoRow label="Facility" value={appointment.facility} />
        {appointment.doctor ? <InfoRow label="Doctor" value={appointment.doctor} /> : null}
        {appointment.costUGX ? (
          <InfoRow label="Cost" value={`UGX ${appointment.costUGX.toLocaleString()}${appointment.coveredByInsurance ? " (insured)" : ""}`} />
        ) : null}
        <InfoRow label="Created" value={fmtDateTime(appointment.createdAt)} />
        {appointment.confirmedAt ? <InfoRow label="Confirmed" value={fmtDateTime(appointment.confirmedAt)} /> : null}
        {appointment.completedAt ? <InfoRow label="Completed" value={fmtDateTime(appointment.completedAt)} /> : null}
        {appointment.notes ? <InfoRow label="Notes" value={appointment.notes} /> : null}
      </View>

      {appointment.status === "Requested" ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={handleConfirm}
          activeOpacity={0.85}
        >
          <Feather name="check" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>Confirm Appointment</Text>
        </TouchableOpacity>
      ) : null}

      {appointment.status === "Confirmed" ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.success }]}
          onPress={handleComplete}
          activeOpacity={0.85}
        >
          <Feather name="check-circle" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>Mark as Attended</Text>
        </TouchableOpacity>
      ) : null}

      {(appointment.status === "Requested" || appointment.status === "Confirmed") ? (
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: colors.destructive }]}
          onPress={handleCancel}
          activeOpacity={0.8}
        >
          <Feather name="x" size={16} color={colors.destructive} />
          <Text style={[styles.cancelBtnText, { color: colors.destructive }]}>Cancel Appointment</Text>
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
  apptId: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  apptType: { fontSize: 18, fontWeight: "700", marginTop: 4 },
  divider: { height: 1 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateText: { fontSize: 16, fontWeight: "600" },
  patientCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  section: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  actionBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
});
