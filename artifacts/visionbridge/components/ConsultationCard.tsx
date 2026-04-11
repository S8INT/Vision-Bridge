import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Consultation, Patient } from "@/context/AppContext";
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

function getStatusColor(status: string, colors: ReturnType<typeof useColors>) {
  if (status === "Responded") return colors.success;
  if (status === "InReview") return colors.warning;
  if (status === "Open") return colors.primary;
  return colors.mutedForeground;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", {
    month: "short",
    day: "numeric",
  });
}

export function ConsultationCard({ consultation, patient, onPress }: ConsultationCardProps) {
  const colors = useColors();
  const statusColor = getStatusColor(consultation.status, colors);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.priorityBar, { backgroundColor: getPriorityBarColor(consultation.priority, colors) }]} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          {patient ? (
            <Text style={[styles.name, { color: colors.foreground }]}>
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
            <Feather name="user" size={11} color={colors.mutedForeground} />
            <Text style={[styles.assigned, { color: colors.mutedForeground }]}>{consultation.assignedTo}</Text>
          </View>
        ) : (
          <Text style={[styles.unassigned, { color: colors.warning }]}>Awaiting assignment</Text>
        )}
        <View style={styles.bottomRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.status, { color: statusColor }]}>{consultation.status}</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {formatDate(consultation.requestedAt)}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function getPriorityBarColor(priority: string, colors: ReturnType<typeof useColors>) {
  if (priority === "Emergency") return colors.destructive;
  if (priority === "Urgent") return colors.warning;
  return colors.border;
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
  priorityBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 14,
    gap: 5,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  notes: {
    fontSize: 12,
    lineHeight: 18,
  },
  assignedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  assigned: {
    fontSize: 12,
  },
  unassigned: {
    fontSize: 12,
    fontWeight: "500",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  status: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  date: {
    fontSize: 11,
  },
});
