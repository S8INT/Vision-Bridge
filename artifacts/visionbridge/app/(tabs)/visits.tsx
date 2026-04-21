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
import { useApp, type Appointment } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";

function statusVariant(s: Appointment["status"]) {
  switch (s) {
    case "Confirmed": return "success";
    case "Requested": return "warning";
    case "Completed": return "muted";
    case "Cancelled": return "muted";
    case "NoShow":    return "urgent";
    default: return "muted";
  }
}

function fmtFullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function VisitsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { patients, appointments } = useApp();
  const { user } = useAuth();

  const myPatient = useMemo(
    () => patients.find((p) => `${p.firstName} ${p.lastName}` === user?.fullName),
    [patients, user],
  );

  const { upcoming, past } = useMemo(() => {
    if (!myPatient) return { upcoming: [], past: [] };
    const mine = appointments.filter((a) => a.patientId === myPatient.id);
    const now = new Date();
    const upcoming = mine
      .filter((a) => new Date(`${a.scheduledDate}T${a.scheduledTime}`) >= now && a.status !== "Cancelled")
      .sort((a, b) =>
        new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime() -
        new Date(`${b.scheduledDate}T${b.scheduledTime}`).getTime());
    const past = mine
      .filter((a) => new Date(`${a.scheduledDate}T${a.scheduledTime}`) < now || a.status === "Cancelled")
      .sort((a, b) =>
        new Date(`${b.scheduledDate}T${b.scheduledTime}`).getTime() -
        new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime());
    return { upcoming, past };
  }, [appointments, myPatient]);

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 16, gap: 16 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    bookBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
      backgroundColor: colors.primary,
    },
    bookBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
    sectionLabel: {
      fontSize: 12, fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground, letterSpacing: 0.6, textTransform: "uppercase",
      marginBottom: 10, marginTop: 8,
    },
    card: {
      borderRadius: 14, padding: 16, borderWidth: 1, gap: 12,
      backgroundColor: colors.card, borderColor: colors.border,
    },
    cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
    dateChip: {
      width: 64, alignItems: "center", paddingVertical: 8, borderRadius: 10,
      backgroundColor: colors.muted,
    },
    dateMonth: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase" },
    dateDay: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 1 },
    cardBody: { flex: 1, gap: 4 },
    type: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    facility: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    notes: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 19 },
    emptyState: {
      padding: 24, borderRadius: 12, borderWidth: 1, borderStyle: "dashed",
      borderColor: colors.border, alignItems: "center", gap: 8,
    },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
  });

  if (!myPatient) {
    return (
      <View style={[styles.container, { padding: 16, paddingTop: topPad + 16, gap: 16 }]}>
        <Text style={styles.title}>My Visits</Text>
        <Text style={styles.subtitle}>No patient profile linked to your account. Contact your clinic to link your medical record.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 8, paddingBottom: botPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Visits</Text>
          <Text style={styles.subtitle}>{upcoming.length} upcoming · {past.length} past</Text>
        </View>
        <TouchableOpacity style={styles.bookBtn} onPress={() => router.push(`/appointment/book?patientId=${myPatient.id}` as never)}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.bookBtnText}>Book</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Upcoming</Text>
      {upcoming.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={28} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>No upcoming visits.{"\n"}Tap "Book" to schedule one.</Text>
        </View>
      ) : (
        upcoming.map((a) => {
          const dt = new Date(`${a.scheduledDate}T${a.scheduledTime}`);
          return (
            <TouchableOpacity
              key={a.id}
              style={styles.card}
              onPress={() => router.push(`/appointment/${a.id}` as never)}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeader}>
                <View style={styles.dateChip}>
                  <Text style={styles.dateMonth}>{dt.toLocaleDateString("en-UG", { month: "short" })}</Text>
                  <Text style={styles.dateDay}>{dt.getDate()}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.type}>{a.type === "FollowUp" ? "Follow-up" : a.type}</Text>
                  <Text style={styles.facility}>{a.facility}</Text>
                  {a.doctor && <Text style={styles.meta}>{a.doctor}</Text>}
                  <Text style={styles.meta}>{fmtFullDate(a.scheduledDate)} · {a.scheduledTime}</Text>
                </View>
                <Badge label={a.status} variant={statusVariant(a.status) as never} />
              </View>
              {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : null}
              {a.costUGX != null && (
                <Text style={styles.meta}>
                  Cost: UGX {a.costUGX.toLocaleString()}{a.coveredByInsurance ? " · Covered by insurance" : ""}
                </Text>
              )}
            </TouchableOpacity>
          );
        })
      )}

      {past.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Past</Text>
          {past.map((a) => {
            const dt = new Date(`${a.scheduledDate}T${a.scheduledTime}`);
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.card, { opacity: 0.75 }]}
                onPress={() => router.push(`/appointment/${a.id}` as never)}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.dateChip}>
                    <Text style={styles.dateMonth}>{dt.toLocaleDateString("en-UG", { month: "short" })}</Text>
                    <Text style={styles.dateDay}>{dt.getDate()}</Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.type}>{a.type === "FollowUp" ? "Follow-up" : a.type}</Text>
                    <Text style={styles.facility}>{a.facility}</Text>
                    {a.doctor && <Text style={styles.meta}>{a.doctor}</Text>}
                    <Text style={styles.meta}>{fmtFullDate(a.scheduledDate)} · {a.scheduledTime}</Text>
                  </View>
                  <Badge label={a.status} variant={statusVariant(a.status) as never} />
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
