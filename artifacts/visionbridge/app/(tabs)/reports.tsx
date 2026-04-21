import React, { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", { month: "short", day: "numeric", year: "numeric" });
}

const RISK_COLOR: Record<string, string> = {
  Normal: "#10b981", Mild: "#84cc16", Moderate: "#f59e0b", Severe: "#ef4444", Urgent: "#dc2626",
};

export default function ReportsScreen() {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { patients, screenings, consultations } = useApp();
  const { user } = useAuth();

  const myPatient = useMemo(
    () => patients.find((p) => `${p.firstName} ${p.lastName}` === user?.fullName),
    [patients, user],
  );

  const myConsultations = useMemo(() => {
    if (!myPatient) return [];
    return consultations
      .filter((c) => c.patientId === myPatient.id)
      .sort((a, b) =>
        new Date(b.respondedAt ?? b.requestedAt).getTime() -
        new Date(a.respondedAt ?? a.requestedAt).getTime());
  }, [consultations, myPatient]);

  const myScreenings = useMemo(() => {
    if (!myPatient) return [];
    return screenings
      .filter((s) => s.patientId === myPatient.id)
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  }, [screenings, myPatient]);

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 16, gap: 14 },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    sectionLabel: {
      fontSize: 12, fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground, letterSpacing: 0.6, textTransform: "uppercase",
      marginBottom: 8, marginTop: 8,
    },
    card: {
      borderRadius: 14, padding: 16, borderWidth: 1, gap: 10,
      backgroundColor: colors.card, borderColor: colors.border,
    },
    rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
    diagnosis: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    sectionInner: { gap: 4 },
    sectionInnerTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    sectionInnerBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 19 },
    rxBox: {
      padding: 12, borderRadius: 10, gap: 4,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    followBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
      backgroundColor: colors.successLight, borderWidth: 1, borderColor: colors.normalBorder,
    },
    followText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.normalText, flex: 1 },
    screeningCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      padding: 14, borderRadius: 12, borderWidth: 1,
      backgroundColor: colors.card, borderColor: colors.border,
    },
    riskDot: { width: 10, height: 10, borderRadius: 5 },
    emptyState: {
      padding: 24, borderRadius: 12, borderWidth: 1, borderStyle: "dashed",
      borderColor: colors.border, alignItems: "center", gap: 8,
    },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
  });

  if (!myPatient) {
    return (
      <View style={[styles.container, { padding: 16, paddingTop: topPad + 16, gap: 16 }]}>
        <Text style={styles.title}>My Reports</Text>
        <Text style={styles.subtitle}>No patient profile linked to your account.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 8, paddingBottom: botPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={styles.title}>My Reports</Text>
        <Text style={styles.subtitle}>{myConsultations.length} consultation{myConsultations.length === 1 ? "" : "s"} · {myScreenings.length} screening{myScreenings.length === 1 ? "" : "s"}</Text>
      </View>

      <Text style={styles.sectionLabel}>Consultations</Text>
      {myConsultations.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="file-text" size={r.iconSize(28)} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>No consultations yet.{"\n"}Start a new consultation from the Home tab.</Text>
        </View>
      ) : (
        myConsultations.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={styles.card}
            onPress={() => router.push(`/consultation/${c.id}` as never)}
            activeOpacity={0.85}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.diagnosis}>{c.diagnosis ?? c.diagnosisOverride ?? "Eye Consultation"}</Text>
              <Badge
                label={c.status === "Completed" ? "Completed" : c.status}
                variant={c.status === "Completed" ? "success" : c.status === "InReview" ? "warning" : "default"}
              />
            </View>
            <Text style={styles.meta}>
              {c.assignedTo ?? "Unassigned"} · {fmtDate(c.respondedAt ?? c.requestedAt)}
            </Text>

            {c.specialistResponse && (
              <View style={styles.sectionInner}>
                <Text style={styles.sectionInnerTitle}>Doctor's Notes</Text>
                <Text style={styles.sectionInnerBody}>{c.specialistResponse}</Text>
              </View>
            )}

            {c.treatmentPlan && (
              <View style={styles.rxBox}>
                <Text style={styles.sectionInnerTitle}>Prescription / Plan</Text>
                <Text style={styles.sectionInnerBody}>{c.treatmentPlan}</Text>
              </View>
            )}

            {c.followUpDate && (
              <View style={styles.followBox}>
                <Feather name="calendar" size={r.iconSize(14)} color={colors.success} />
                <Text style={styles.followText}>
                  Follow-up: {fmtDate(c.followUpDate)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}

      {myScreenings.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Eye Screenings</Text>
          {myScreenings.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.screeningCard}
              onPress={() => router.push(`/screening/${s.id}` as never)}
              activeOpacity={0.85}
            >
              <View style={[styles.riskDot, { backgroundColor: RISK_COLOR[s.aiRiskLevel] ?? colors.mutedForeground }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.diagnosis, { fontSize: 14 }]}>
                  {s.aiRiskLevel} Risk · {s.aiConfidence}% confidence
                </Text>
                <Text style={styles.meta}>{fmtDate(s.capturedAt)} · {s.status}</Text>
              </View>
              <Feather name="chevron-right" size={r.iconSize(18)} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}
