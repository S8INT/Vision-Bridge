import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/AuthContext";
import {
  useDoctorSchedule,
  type WeekDay,
  type WeeklySchedule,
  DEFAULT_SCHEDULE,
} from "@/hooks/useProfile";
import { useApp } from "@/context/AppContext";

const DAYS: { key: WeekDay; label: string }[] = [
  { key: "Mon", label: "Monday" },
  { key: "Tue", label: "Tuesday" },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday" },
  { key: "Fri", label: "Friday" },
  { key: "Sat", label: "Saturday" },
  { key: "Sun", label: "Sunday" },
];

const CONSULT_LENGTHS = [15, 20, 30, 45, 60];

export default function DoctorScheduleScreen() {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { appointments } = useApp();
  const { schedule, save, loaded } = useDoctorSchedule(user?.id);

  const [draft, setDraft] = useState<WeeklySchedule>(DEFAULT_SCHEDULE);
  const [newDayOff, setNewDayOff] = useState("");

  React.useEffect(() => { if (loaded) setDraft(schedule); }, [loaded, schedule]);

  // Estimated weekly capacity from open hours and consult length.
  const weeklySlots = useMemo(() => {
    const m = draft.consultMinutes || 30;
    let mins = 0;
    DAYS.forEach((d) => {
      const day = draft.hours[d.key];
      if (!day.open) return;
      const [sh, sm] = day.start.split(":").map(Number);
      const [eh, em] = day.end.split(":").map(Number);
      const span = (eh * 60 + em) - (sh * 60 + sm);
      if (span > 0) mins += span;
    });
    return Math.max(0, Math.floor(mins / m));
  }, [draft]);

  // Upcoming appointments assigned to this doctor (best-effort match by name).
  const myUpcoming = useMemo(() => {
    if (!user) return [];
    const now = new Date();
    return appointments
      .filter((a) => a.doctor && user.fullName.includes(a.doctor.replace(/^Dr\.\s+/i, "").split(" ")[0]))
      .filter((a) => new Date(`${a.scheduledDate}T${a.scheduledTime || "09:00"}`) >= now)
      .sort((a, b) => `${a.scheduledDate}${a.scheduledTime}`.localeCompare(`${b.scheduledDate}${b.scheduledTime}`))
      .slice(0, 5);
  }, [appointments, user]);

  const onToggleDay = (k: WeekDay, open: boolean) => {
    setDraft({ ...draft, hours: { ...draft.hours, [k]: { ...draft.hours[k], open } } });
  };
  const onChangeTime = (k: WeekDay, field: "start" | "end", v: string) => {
    setDraft({ ...draft, hours: { ...draft.hours, [k]: { ...draft.hours[k], [field]: v } } });
  };
  const onAddDayOff = () => {
    const d = newDayOff.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD format, e.g. 2026-05-12");
      return;
    }
    if (draft.daysOff.includes(d)) return;
    setDraft({ ...draft, daysOff: [...draft.daysOff, d].sort() });
    setNewDayOff("");
  };
  const onRemoveDayOff = (d: string) => {
    setDraft({ ...draft, daysOff: draft.daysOff.filter((x) => x !== d) });
  };
  const onSave = async () => {
    await save(draft);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Your schedule is now visible to the booking system.");
  };

  const styles = makeStyles(colors, r);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Summary band */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{weeklySlots}</Text>
          <Text style={styles.summaryLabel}>slots / week</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{draft.daysOff.length}</Text>
          <Text style={styles.summaryLabel}>days off</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: draft.acceptingNew ? colors.success : colors.destructive }]}>
            {draft.acceptingNew ? "ON" : "OFF"}
          </Text>
          <Text style={styles.summaryLabel}>accepting new</Text>
        </View>
      </View>

      {/* Availability switch */}
      <View style={styles.toggleCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Accepting new consultations</Text>
          <Text style={styles.toggleSub}>Turn off when on leave or fully booked.</Text>
        </View>
        <Switch
          value={draft.acceptingNew}
          onValueChange={(v) => setDraft({ ...draft, acceptingNew: v })}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>

      {/* Consult length */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consult length</Text>
        <View style={styles.chipRow}>
          {CONSULT_LENGTHS.map((m) => {
            const active = draft.consultMinutes === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setDraft({ ...draft, consultMinutes: m })}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && { color: "#fff" }]}>{m} min</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Weekly hours */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly hours</Text>
        {DAYS.map((d) => {
          const day = draft.hours[d.key];
          return (
            <View key={d.key} style={styles.dayRow}>
              <View style={styles.dayHead}>
                <Text style={styles.dayLabel}>{d.label}</Text>
                <Switch
                  value={day.open}
                  onValueChange={(v) => onToggleDay(d.key, v)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              {day.open ? (
                <View style={styles.timeRow}>
                  <TimeInput value={day.start} onChange={(v) => onChangeTime(d.key, "start", v)} />
                  <Text style={{ color: colors.mutedForeground }}>→</Text>
                  <TimeInput value={day.end} onChange={(v) => onChangeTime(d.key, "end", v)} />
                </View>
              ) : (
                <Text style={styles.closedText}>Closed</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Days off */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Days off</Text>
        <Text style={styles.sectionSub}>Mark vacation, conferences or personal time.</Text>
        <View style={styles.dayOffAddRow}>
          <TextInput
            value={newDayOff}
            onChangeText={setNewDayOff}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
          />
          <TouchableOpacity onPress={onAddDayOff} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Feather name="plus" size={r.iconSize(16)} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
        {draft.daysOff.length === 0 ? (
          <Text style={styles.empty}>No days off scheduled.</Text>
        ) : (
          <View style={styles.dayOffList}>
            {draft.daysOff.map((d) => (
              <View key={d} style={styles.dayOffPill}>
                <Feather name="calendar" size={r.iconSize(12)} color={colors.foreground} />
                <Text style={styles.dayOffText}>{d}</Text>
                <TouchableOpacity onPress={() => onRemoveDayOff(d)}>
                  <Feather name="x" size={r.iconSize(14)} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes for the team</Text>
        <TextInput
          value={draft.notes ?? ""}
          onChangeText={(v) => setDraft({ ...draft, notes: v })}
          placeholder="e.g. surgical clinic on Tuesdays, virtual only Fridays…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[styles.input, { minHeight: 80, paddingTop: 10 }]}
        />
      </View>

      {/* Upcoming */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next on your calendar</Text>
        {myUpcoming.length === 0 ? (
          <Text style={styles.empty}>No upcoming appointments assigned to you.</Text>
        ) : (
          myUpcoming.map((a) => (
            <View key={a.id} style={styles.apptRow}>
              <View style={styles.apptDate}>
                <Text style={styles.apptDay}>{new Date(a.scheduledDate).toLocaleDateString("en-UG", { day: "numeric" })}</Text>
                <Text style={styles.apptMonth}>{new Date(a.scheduledDate).toLocaleDateString("en-UG", { month: "short" })}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.apptTitle}>{a.type} · {a.scheduledTime}</Text>
                <Text style={styles.apptSub}>{a.facility}</Text>
              </View>
              <Feather name="chevron-right" size={r.iconSize(18)} color={colors.mutedForeground} />
            </View>
          ))
        )}
      </View>

      <TouchableOpacity onPress={onSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
        <Feather name="save" size={r.iconSize(16)} color="#fff" />
        <Text style={styles.saveText}>Save schedule</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
        <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM"
      placeholderTextColor={colors.mutedForeground}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      style={{
        flex: 1,
        textAlign: "center",
        color: colors.foreground,
        fontSize: r.font(14),
        fontWeight: "600",
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.background,
      }}
    />
  );
}

const makeStyles = (colors: ReturnType<typeof useColors>, r: ReturnType<typeof useResponsive>) =>
  StyleSheet.create({
    content: { padding: 16, gap: 16 },
    summary: {
      flexDirection: "row", backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
      borderRadius: 12, padding: 12, alignItems: "center",
    },
    summaryItem: { flex: 1, alignItems: "center" },
    summaryValue: { color: colors.foreground, fontSize: r.font(20), fontWeight: "700" },
    summaryLabel: { color: colors.mutedForeground, fontSize: r.font(10), marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
    summaryDivider: { width: 1, height: "60%", backgroundColor: colors.border },
    toggleCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
      borderRadius: 12, padding: 14,
    },
    toggleTitle: { color: colors.foreground, fontSize: r.font(14), fontWeight: "700" },
    toggleSub: { color: colors.mutedForeground, fontSize: r.font(11), marginTop: 2 },
    section: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
    sectionTitle: { color: colors.foreground, fontSize: r.font(14), fontWeight: "700" },
    sectionSub: { color: colors.mutedForeground, fontSize: r.font(11) },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: r.font(12), color: colors.foreground, fontWeight: "600" },
    dayRow: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, gap: 8 },
    dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    dayLabel: { color: colors.foreground, fontSize: r.font(13), fontWeight: "600" },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    closedText: { color: colors.mutedForeground, fontSize: r.font(12), fontStyle: "italic" },
    dayOffAddRow: { flexDirection: "row", gap: 8 },
    input: {
      flex: 1, color: colors.foreground, fontSize: r.font(14),
      paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1,
      borderColor: colors.border, borderRadius: 8, backgroundColor: colors.background,
    },
    addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 8 },
    addBtnText: { color: "#fff", fontSize: r.font(13), fontWeight: "700" },
    empty: { color: colors.mutedForeground, fontSize: r.font(12) },
    dayOffList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    dayOffPill: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.muted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
    },
    dayOffText: { color: colors.foreground, fontSize: r.font(12), fontWeight: "600" },
    apptRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border },
    apptDate: { width: r.iconSize(48), alignItems: "center" },
    apptDay: { color: colors.foreground, fontSize: r.font(18), fontWeight: "800" },
    apptMonth: { color: colors.mutedForeground, fontSize: r.font(10), textTransform: "uppercase" },
    apptTitle: { color: colors.foreground, fontSize: r.font(13), fontWeight: "600" },
    apptSub: { color: colors.mutedForeground, fontSize: r.font(11), marginTop: 2 },
    saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
    saveText: { color: "#fff", fontSize: r.font(14), fontWeight: "700" },
    cancelBtn: { paddingVertical: 12, alignItems: "center" },
    cancelText: { fontSize: r.font(13) },
  });
