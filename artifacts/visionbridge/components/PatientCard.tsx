import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Patient } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";

interface PatientCardProps {
  patient: Patient;
  onPress: () => void;
  lastScreeningStatus?: string;
  lastScreeningRisk?: string;
  onScreen?: () => void;
}

function getRiskVariant(risk?: string) {
  if (!risk) return "muted";
  if (risk === "Urgent" || risk === "Severe") return "urgent";
  if (risk === "Moderate") return "warning";
  if (risk === "Mild") return "referral";
  return "success";
}

function getAge(dob: string) {
  const birth = new Date(dob);
  const now = new Date();
  return now.getFullYear() - birth.getFullYear();
}

export function PatientCard({ patient, onPress, lastScreeningStatus, lastScreeningRisk, onScreen }: PatientCardProps) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={styles.mainArea}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {patient.firstName[0]}{patient.lastName[0]}
          </Text>
        </View>
        <View style={styles.content}>
          <View style={styles.row}>
            <Text style={[styles.name, { color: colors.foreground }]}>
              {patient.firstName} {patient.lastName}
            </Text>
            {lastScreeningRisk ? (
              <Badge label={lastScreeningRisk} variant={getRiskVariant(lastScreeningRisk)} size="sm" />
            ) : null}
          </View>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {patient.patientId} · {patient.sex} · {getAge(patient.dateOfBirth)} yrs
          </Text>
          <View style={styles.bottomRow}>
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={11} color={colors.mutedForeground} />
              <Text style={[styles.location, { color: colors.mutedForeground }]}>{patient.village}</Text>
            </View>
            {lastScreeningStatus ? (
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{lastScreeningStatus}</Text>
            ) : null}
          </View>
        </View>
        {!onScreen && (
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        )}
      </TouchableOpacity>

      {onScreen && (
        <TouchableOpacity
          onPress={onScreen}
          style={[styles.screenBtn, { backgroundColor: colors.success }]}
          activeOpacity={0.8}
          accessibilityLabel={`Screen ${patient.firstName} ${patient.lastName}`}
        >
          <Feather name="camera" size={15} color="#fff" />
          <Text style={styles.screenBtnText}>Screen</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  mainArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    gap: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  meta: {
    fontSize: 12,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  location: {
    fontSize: 11,
  },
  statusText: {
    fontSize: 11,
  },
  screenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  screenBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
