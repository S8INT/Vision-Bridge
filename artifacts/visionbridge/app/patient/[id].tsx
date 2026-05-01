import React from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScreeningCard } from "@/components/ScreeningCard";

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
  const insets = useSafeAreaInsets();
  const { getPatient, getScreeningsForPatient } = useApp();

  const patient = getPatient(id);
  const screenings = getScreeningsForPatient(id);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

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
          value={new Date(patient.registeredAt).toLocaleDateString("en-UG", { year: "numeric", month: "long", day: "numeric" })}
        />
        {patient.registeredByName ? (
          <InfoRow label="Registered By" value={patient.registeredByName} />
        ) : null}
        {patient.lastVisit ? (
          <InfoRow
            label="Last Visit"
            value={new Date(patient.lastVisit).toLocaleDateString("en-UG", { year: "numeric", month: "long", day: "numeric" })}
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

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push(`/screening/new?patientId=${patient.id}`)}
        activeOpacity={0.85}
      >
        <Feather name="camera" size={18} color="#fff" />
        <Text style={styles.primaryBtnText}>New Screening</Text>
      </TouchableOpacity>

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
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" },
  conditionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  condition: { fontSize: 14 },
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
