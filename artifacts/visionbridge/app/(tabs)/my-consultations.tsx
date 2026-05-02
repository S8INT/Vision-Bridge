import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
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
import { useApp, type Consultation, type Patient } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────────────
type FilterTab = "Active" | "Completed" | "All";

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_STEPS = ["Pending", "Assigned", "InReview", "Reviewed", "Completed"] as const;

const STATUS_META: Record<string, { label: string; color: string; icon: string; desc: string }> = {
  Pending:   { label: "Pending",     color: "#94a3b8", icon: "clock",        desc: "Waiting for a specialist" },
  Assigned:  { label: "Assigned",    color: "#0ea5e9", icon: "user-check",   desc: "A specialist has been assigned" },
  InReview:  { label: "In Review",   color: "#f59e0b", icon: "search",       desc: "Specialist is reviewing your case" },
  Reviewed:  { label: "Reviewed",    color: "#10b981", icon: "check-circle", desc: "Review complete" },
  Referred:  { label: "Referred",    color: "#8b5cf6", icon: "navigation",   desc: "You have been referred for further care" },
  Completed: { label: "Completed",   color: "#10b981", icon: "check-circle", desc: "Consultation completed" },
  Cancelled: { label: "Cancelled",   color: "#ef4444", icon: "x-circle",     desc: "Consultation was cancelled" },
};

const PRIORITY_META: Record<string, { color: string; bg: string; label: string }> = {
  Routine:   { color: "#059669", bg: "#d1fae5", label: "Routine" },
  Urgent:    { color: "#d97706", bg: "#fef3c7", label: "Urgent" },
  Emergency: { color: "#dc2626", bg: "#fee2e2", label: "Emergency" },
};

function formatRelDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-UG", { month: "short", day: "numeric" });
}

// ── Status Timeline ─────────────────────────────────────────────────────────────
function StatusTimeline({ status }: { status: string }) {
  const colors = useColors();
  if (status === "Cancelled") return null;
  const steps = STATUS_STEPS;
  const currentIdx = steps.indexOf(status as any) >= 0 ? steps.indexOf(status as any) : 0;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 4 }}>
      {steps.map((step, idx) => {
        const done  = idx < currentIdx;
        const active = idx === currentIdx;
        const stepColor = done || active
          ? STATUS_META[step]?.color ?? colors.primary
          : colors.border;
        return (
          <React.Fragment key={step}>
            <View style={{
              width: 20, height: 20, borderRadius: 10,
              backgroundColor: done ? stepColor : active ? stepColor : colors.muted,
              borderWidth: active ? 2 : 0,
              borderColor: active ? stepColor : "transparent",
              alignItems: "center", justifyContent: "center",
            }}>
              {done && <Feather name="check" size={11} color="#fff" />}
              {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
            </View>
            {idx < steps.length - 1 && (
              <View style={{
                flex: 1, height: 2,
                backgroundColor: idx < currentIdx ? colors.primary : colors.border,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Consultation Detail Card ────────────────────────────────────────────────────
function ConsultCard({ consultation, onPress }: { consultation: Consultation; onPress: () => void }) {
  const colors = useColors();
  const meta = STATUS_META[consultation.status] ?? STATUS_META["Pending"];
  const pri  = PRIORITY_META[consultation.priority] ?? PRIORITY_META["Routine"];
  const hasResponse = !!(consultation.specialistResponse || consultation.diagnosis || consultation.treatmentPlan);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Priority bar */}
      <View style={[st.priorityBar, { backgroundColor: pri.color }]} />

      <View style={st.cardContent}>
        {/* Top row */}
        <View style={st.cardTopRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.cardDate, { color: colors.mutedForeground }]}>
              {formatRelDate(consultation.requestedAt)} · {new Date(consultation.requestedAt).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <View style={[st.statusPill, { backgroundColor: meta.color + "18" }]}>
              <Feather name={meta.icon as never} size={11} color={meta.color} />
              <Text style={[st.statusPillText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          <View style={[st.priTag, { backgroundColor: pri.bg }]}>
            <Text style={[st.priTagText, { color: pri.color }]}>{pri.label}</Text>
          </View>
        </View>

        {/* Timeline */}
        <StatusTimeline status={consultation.status} />
        <Text style={[st.statusDesc, { color: colors.mutedForeground }]}>{meta.desc}</Text>

        {/* Assigned doctor */}
        {consultation.assignedTo && (
          <View style={[st.doctorRow, { borderColor: colors.border }]}>
            <View style={[st.doctorAvatar, { backgroundColor: "#0ea5e910" }]}>
              <Feather name="user" size={14} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.doctorName, { color: colors.foreground }]}>{consultation.assignedTo}</Text>
              <Text style={[st.doctorSub, { color: colors.mutedForeground }]}>Assigned specialist</Text>
            </View>
            <Feather name="check-circle" size={14} color="#0ea5e9" />
          </View>
        )}

        {/* Clinical notes excerpt */}
        {consultation.clinicalNotes && (
          <Text style={[st.notes, { color: colors.mutedForeground }]} numberOfLines={2}>
            {consultation.clinicalNotes}
          </Text>
        )}

        {/* Specialist response preview */}
        {hasResponse && (
          <View style={[st.responseBox, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
            <Feather name="message-square" size={13} color="#16a34a" />
            <Text style={[st.responseText, { color: "#15803d" }]} numberOfLines={3}>
              {consultation.specialistResponse
                ?? consultation.diagnosis
                ?? consultation.treatmentPlan
                ?? ""}
            </Text>
          </View>
        )}

        <View style={st.cardFooter}>
          <Text style={[st.tapHint, { color: colors.mutedForeground }]}>Tap to view full details</Text>
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function MyConsultationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, accessToken } = useAuth();
  const { consultations, patients, refresh: appRefresh } = useApp();

  const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;

  // ── Find patient record ──────────────────────────────────────────────────────
  const localPatient = useMemo(
    () =>
      patients.find((p) => p.userId === user?.id) ??
      patients.find((p) => `${p.firstName} ${p.lastName}` === user?.fullName),
    [patients, user],
  );

  const [myPatient, setMyPatient] = useState<Patient | null>(localPatient ?? null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // ── Fetch from API if not in local state ─────────────────────────────────────
  useEffect(() => {
    if (localPatient) { setMyPatient(localPatient); return; }
    if (!accessToken) return;
    setLoadingProfile(true);
    fetch(`${API_BASE}/patients/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    })
      .then(async (res) => {
        if (res.ok) {
          const d = await res.json();
          const row = d.patient as Patient;
          Object.keys(row).forEach((k) => { if ((row as any)[k] === null) (row as any)[k] = undefined; });
          setMyPatient(row);
        } else if (res.status === 404) {
          setProfileError("no_profile");
        } else {
          setProfileError("error");
        }
      })
      .catch(() => setProfileError("error"))
      .finally(() => setLoadingProfile(false));
  }, [localPatient, accessToken]);

  // ── My consultations ─────────────────────────────────────────────────────────
  const [myConsultations, setMyConsultations] = useState<Consultation[]>([]);
  const [loadingConsults, setLoadingConsults] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyConsultations = useCallback(async (showSpinner = false) => {
    if (!accessToken) return;
    if (showSpinner) setLoadingConsults(true);
    try {
      const res = await fetch(`${API_BASE}/clinical/my-consultations`, {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const rows = (data.items ?? []).map((c: any) => {
          Object.keys(c).forEach((k) => { if (c[k] === null) c[k] = undefined; });
          return c as Consultation;
        });
        setMyConsultations(rows.sort((a: Consultation, b: Consultation) =>
          new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
        ));
      }
    } catch { /* silent */ }
    finally { setLoadingConsults(false); }
  }, [accessToken]);

  useEffect(() => { fetchMyConsultations(true); }, [fetchMyConsultations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([appRefresh(), fetchMyConsultations(false)]);
    setRefreshing(false);
  }, [appRefresh, fetchMyConsultations]);

  // ── Merge: prefer dedicated endpoint, fallback to context ───────────────────
  const displayConsultations = useMemo(() => {
    if (myConsultations.length > 0) return myConsultations;
    if (!myPatient) return [];
    return consultations
      .filter((c) => c.patientId === myPatient.id)
      .slice()
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }, [myConsultations, consultations, myPatient]);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterTab>("Active");

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case "Active":    return displayConsultations.filter((c) => c.status !== "Completed" && c.status !== "Cancelled");
      case "Completed": return displayConsultations.filter((c) => c.status === "Completed" || c.status === "Cancelled");
      default:          return displayConsultations;
    }
  }, [displayConsultations, activeFilter]);

  const counts = useMemo(() => ({
    Active:    displayConsultations.filter((c) => c.status !== "Completed" && c.status !== "Cancelled").length,
    Completed: displayConsultations.filter((c) => c.status === "Completed" || c.status === "Cancelled").length,
    All:       displayConsultations.length,
  }), [displayConsultations]);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loadingProfile || loadingConsults) {
    return (
      <View style={[st.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[st.loadingText, { color: colors.mutedForeground }]}>Loading your consultations…</Text>
      </View>
    );
  }

  // ── No profile ───────────────────────────────────────────────────────────────
  if (!myPatient && profileError === "no_profile") {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[st.center, { paddingTop: topPad + 40 }]}>
        <View style={[st.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[st.emptyIconWrap, { backgroundColor: "#fef3c7" }]}>
            <Feather name="user-x" size={28} color="#d97706" />
          </View>
          <Text style={[st.emptyTitle, { color: colors.foreground }]}>No Patient Profile</Text>
          <Text style={[st.emptyBody, { color: colors.mutedForeground }]}>
            Create your patient profile to start requesting consultations and tracking your eye care history.
          </Text>
          <TouchableOpacity
            style={[st.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/patient/register")}
          >
            <Feather name="user-plus" size={16} color="#fff" />
            <Text style={st.emptyBtnText}>Create Patient Profile</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Empty consultations ───────────────────────────────────────────────────────
  const EmptyState = () => (
    <View style={[st.center, { paddingTop: 40 }]}>
      <View style={[st.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[st.emptyIconWrap, { backgroundColor: "#f0f9ff" }]}>
          <Feather name="message-circle" size={28} color={colors.primary} />
        </View>
        <Text style={[st.emptyTitle, { color: colors.foreground }]}>
          {activeFilter === "Active" ? "No active consultations" : "No completed consultations"}
        </Text>
        <Text style={[st.emptyBody, { color: colors.mutedForeground }]}>
          {activeFilter === "Active"
            ? "Request a consultation with any available ophthalmologist to get started."
            : "Your completed consultations and specialist reports will appear here."}
        </Text>
        {activeFilter === "Active" && (
          <TouchableOpacity
            style={[st.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/patient/consult-request")}
          >
            <Feather name="send" size={16} color="#fff" />
            <Text style={st.emptyBtnText}>Request Consultation</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={[st.screen, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={st.headerTop}>
          <View>
            <Text style={[st.title, { color: colors.foreground }]}>My Consultations</Text>
            {myPatient && (
              <Text style={[st.subtitle, { color: colors.mutedForeground }]}>
                {myPatient.firstName} {myPatient.lastName} · {myPatient.patientId}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[st.newBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/patient/consult-request")}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={st.newBtnText}>New</Text>
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={st.filterRow}>
          {(["Active", "Completed", "All"] as FilterTab[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[
                st.filterTab,
                {
                  backgroundColor: activeFilter === f ? colors.primary : colors.muted,
                  borderColor: activeFilter === f ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[st.filterTabText, { color: activeFilter === f ? "#fff" : colors.mutedForeground }]}>
                {f}{counts[f] > 0 ? ` (${counts[f]})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── List ── */}
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <ConsultCard
            consultation={item}
            onPress={() => router.push(`/consultation/${item.id}` as never)}
          />
        )}
        contentContainerStyle={[st.list, { paddingBottom: botPad + 100 }]}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  screen:        { flex: 1 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:   { fontSize: 14 },
  header: {
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, gap: 12,
  },
  headerTop: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
  },
  title:    { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  newBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 100, borderWidth: 1,
  },
  filterTabText: { fontSize: 13, fontWeight: "600" },
  list:     { padding: 16, gap: 12 },
  center:   { alignItems: "center", paddingHorizontal: 20 },
  // Card
  card: {
    borderRadius: 14, borderWidth: 1, overflow: "hidden",
    flexDirection: "row", marginBottom: 4,
  },
  priorityBar: { width: 4 },
  cardContent: { flex: 1, padding: 14, gap: 6 },
  cardTopRow:  { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardDate:    { fontSize: 11 },
  statusPill:  { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  priTag:      { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  priTagText:  { fontSize: 11, fontWeight: "700" },
  statusDesc:  { fontSize: 11, marginTop: 2 },
  doctorRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  doctorAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  doctorName:   { fontSize: 13, fontWeight: "600" },
  doctorSub:    { fontSize: 11, marginTop: 1 },
  notes:        { fontSize: 12, lineHeight: 18, marginTop: 2 },
  responseBox: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  responseText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  cardFooter:   { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  tapHint:      { fontSize: 11 },
  // Empty state
  emptyCard: {
    borderRadius: 16, borderWidth: 1, padding: 24,
    alignItems: "center", gap: 12, maxWidth: 340,
  },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  emptyTitle:    { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptyBody:     { fontSize: 13, lineHeight: 20, textAlign: "center" },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 4,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
