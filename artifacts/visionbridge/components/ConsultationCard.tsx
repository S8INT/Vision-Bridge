import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Consultation, Patient, CareCoordinationStatus } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";

interface ConsultationCardProps {
  consultation: Consultation;
  patient?: Patient;
  onPress: () => void;
}

function getPriorityVariant(priority: string) {
  if (priority === "Emergency") return "urgent";
  if (priority === "Urgent") return "warning";
  return "muted";
}

function getPriorityBarColor(priority: string, colors: ReturnType<typeof useColors>) {
  if (priority === "Emergency") return colors.destructive;
  if (priority === "Urgent") return colors.warning;
  return colors.border;
}

function getStatusColor(status: CareCoordinationStatus, colors: ReturnType<typeof useColors>) {
  switch (status) {
    case "Completed": return colors.success;
    case "Reviewed": return colors.success;
    case "Referred": return colors.primary;
    case "InReview": return colors.warning;
    case "Assigned": return colors.accent;
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
    case "Referred":
      return "referral";
    case "Cancelled":
      return "muted";
    default:
      return "muted";
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", { month: "short", day: "numeric" });
}

export function ConsultationCard({ consultation, patient, onPress }: ConsultationCardProps) {
  const colors = useColors();
  const statusColor = getStatusColor(consultation.status, colors);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: consultation.priority === "Emergency" ? colors.destructive + "40" : colors.border,
        },
      ]}
    >
      <View style={[styles.priorityBar, { backgroundColor: getPriorityBarColor(consultation.priority, colors) }]} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          {patient ? (
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {patient.firstName} {patient.lastName}
            </Text>
          ) : null}
          <Badge label={consultation.priority} variant={getPriorityVariant(consultation.priority)} size="sm" />
        </View>

        {consultation.clinicalNotes ? (
          <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={2}>
            {consultation.clinicalNotes}
          </Text>
        ) : null}

        {consultation.assignedTo ? (
          <View style={styles.assignedRow}>
            <Feather name="user-check" size={11} color={colors.accent} />
            <Text style={[styles.assigned, { color: colors.accent }]}>{consultation.assignedTo}</Text>
            {consultation.assignmentMethod ? (
              <Text style={[styles.assignMethod, { color: colors.mutedForeground }]}>({consultation.assignmentMethod})</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.assignedRow}>
            <Feather name="alert-circle" size={11} color={colors.warning} />
            <Text style={[styles.unassigned, { color: colors.warning }]}>Awaiting assignment</Text>
          </View>
        )}

        {(consultation.referralId || consultation.appointmentId) ? (
          <View style={styles.linksRow}>
            {consultation.referralId ? (
              <View style={[styles.linkChip, { backgroundColor: colors.referralBg, borderColor: colors.referralBorder }]}>
                <Feather name="navigation" size={10} color={colors.referralText} />
                <Text style={[styles.linkChipText, { color: colors.referralText }]}>Referral</Text>
              </View>
            ) : null}
            {consultation.appointmentId ? (
              <View style={[styles.linkChip, { backgroundColor: colors.successLight, borderColor: colors.normalBorder }]}>
                <Feather name="calendar" size={10} color={colors.normalText} />
                <Text style={[styles.linkChipText, { color: colors.normalText }]}>Appointment</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Badge label={consultation.status} variant={getStatusVariant(consultation.status)} size="sm" />
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {formatDate(consultation.requestedAt)}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  priorityBar: { width: 4 },
  content: { flex: 1, padding: 14, gap: 5 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 15, fontWeight: "600", flex: 1 },
  notes: { fontSize: 12, lineHeight: 18 },
  assignedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  assigned: { fontSize: 12, fontWeight: "500" },
  assignMethod: { fontSize: 11 },
  unassigned: { fontSize: 12, fontWeight: "500" },
  linksRow: { flexDirection: "row", gap: 6 },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  linkChipText: { fontSize: 10, fontWeight: "600" },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  date: { fontSize: 11, marginLeft: "auto" },
});
