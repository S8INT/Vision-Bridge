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
import { useApp } from "@/context/AppContext";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScreeningCard } from "@/components/ScreeningCard";
import { ConsultationCard } from "@/components/ConsultationCard";

// ── Role metadata displayed at top of each dashboard ─────────────────────────

const ROLE_META: Record<UserRole, { label: string; color: string; icon: string; description: string }> = {
  Admin:      { label: "Administrator",       color: "#7c3aed", icon: "shield",        description: "Full system access" },
  Doctor:     { label: "Ophthalmologist",     color: "#0ea5e9", icon: "activity",      description: "Clinical review & diagnosis" },
  Technician: { label: "Technician",          color: "#10b981", icon: "camera",        description: "Screening & imaging" },
  CHW:        { label: "Community Health Worker", color: "#f59e0b", icon: "user-check", description: "Field screening & registration" },
  Viewer:     { label: "District Viewer",     color: "#64748b", icon: "eye",           description: "Read-only analytics access" },
  Patient:    { label: "Patient",             color: "#ec4899", icon: "user",          description: "My eye care" },
};

// ── Quick actions per role ────────────────────────────────────────────────────
type QuickAction = { label: string; icon: string; route: string; color: string };

const ROLE_ACTIONS: Record<UserRole, QuickAction[]> = {
  Admin: [
    { label: "Register Patient", icon: "user-plus",       route: "/patient/register",    color: "#0ea5e9" },
    { label: "New Screening",    icon: "camera",          route: "/screening/new",       color: "#06b6d4" },
    { label: "View Analytics",   icon: "bar-chart-2",     route: "/(tabs)/analytics",    color: "#7c3aed" },
    { label: "Manage Users",     icon: "users",           route: "/(tabs)/patients",     color: "#64748b" },
  ],
  Doctor: [
    { label: "New Screening",    icon: "camera",          route: "/screening/new",       color: "#0ea5e9" },
    { label: "Consultations",    icon: "message-circle",  route: "/(tabs)/consultations",color: "#06b6d4" },
    { label: "Issue Referral",   icon: "send",            route: "/referral/new",        color: "#10b981" },
    { label: "My Patients",      icon: "users",           route: "/(tabs)/patients",     color: "#64748b" },
  ],
  Technician: [
    { label: "Register Patient", icon: "user-plus",       route: "/patient/register",    color: "#0ea5e9" },
    { label: "New Screening",    icon: "camera",          route: "/screening/new",       color: "#10b981" },
    { label: "Patient List",     icon: "users",           route: "/(tabs)/patients",     color: "#06b6d4" },
    { label: "Campaigns",        icon: "map-pin",         route: "/(tabs)/campaigns",    color: "#f59e0b" },
  ],
  CHW: [
    { label: "Register Patient", icon: "user-plus",       route: "/patient/register",    color: "#f59e0b" },
    { label: "New Screening",    icon: "camera",          route: "/screening/new",       color: "#10b981" },
    { label: "Patient List",     icon: "users",           route: "/(tabs)/patients",     color: "#0ea5e9" },
    { label: "Campaigns",        icon: "map-pin",         route: "/(tabs)/campaigns",    color: "#64748b" },
  ],
  Viewer: [
    { label: "Analytics",        icon: "bar-chart-2",     route: "/(tabs)/analytics",    color: "#64748b" },
  ],
  Patient: [
    { label: "Start New Consultation", icon: "video",      route: "/patient/consult-request", color: "#ec4899" },
    { label: "Upcoming Visits",        icon: "calendar",   route: "/(tabs)/visits",           color: "#0ea5e9" },
    { label: "View Reports",           icon: "file-text",  route: "/(tabs)/reports",          color: "#10b981" },
    { label: "Educational Content",    icon: "book-open",  route: "/(tabs)/education",        color: "#f59e0b" },
  ],
};

// ── Stats per role ────────────────────────────────────────────────────────────
interface StatDef { label: string; icon: string; color: string; getValue: (d: ReturnType<typeof useStatsData>) => number | string; subtitle?: string }

const ROLE_STATS: Record<UserRole, StatDef[]> = {
  Admin: [
    { label: "Total Patients",    icon: "users",          color: "#0ea5e9", getValue: (d) => d.totalPatients },
    { label: "Today's Screenings",icon: "camera",         color: "#10b981", getValue: (d) => d.todayScreenings },
    { label: "Urgent Cases",      icon: "alert-triangle", color: "#ef4444", getValue: (d) => d.urgent },
    { label: "Open Consultations",icon: "message-circle", color: "#06b6d4", getValue: (d) => d.openConsultations },
  ],
  Doctor: [
    { label: "Urgent Cases",      icon: "alert-triangle", color: "#ef4444", getValue: (d) => d.urgent, subtitle: "Needs review" },
    { label: "Open Consultations",icon: "message-circle", color: "#0ea5e9", getValue: (d) => d.openConsultations },
    { label: "Pending Review",    icon: "clock",          color: "#f59e0b", getValue: (d) => d.pending },
    { label: "Total Patients",    icon: "users",          color: "#10b981", getValue: (d) => d.totalPatients },
  ],
  Technician: [
    { label: "Today's Screenings",icon: "camera",         color: "#10b981", getValue: (d) => d.todayScreenings },
    { label: "Pending Upload",    icon: "upload",         color: "#f59e0b", getValue: (d) => d.pending },
    { label: "Total Patients",    icon: "users",          color: "#0ea5e9", getValue: (d) => d.totalPatients },
    { label: "Urgent Flagged",    icon: "alert-triangle", color: "#ef4444", getValue: (d) => d.urgent },
  ],
  CHW: [
    { label: "Today's Screenings",icon: "camera",         color: "#f59e0b", getValue: (d) => d.todayScreenings },
    { label: "Urgent Cases",      icon: "alert-triangle", color: "#ef4444", getValue: (d) => d.urgent, subtitle: "Refer immediately" },
    { label: "Patients Registered",icon: "user-plus",     color: "#10b981", getValue: (d) => d.totalPatients },
  ],
  Viewer: [
    { label: "Total Screenings",  icon: "camera",         color: "#64748b", getValue: (d) => d.totalScreenings },
    { label: "Urgent Cases",      icon: "alert-triangle", color: "#ef4444", getValue: (d) => d.urgent },
    { label: "Total Patients",    icon: "users",          color: "#0ea5e9", getValue: (d) => d.totalPatients },
  ],
  Patient: [
    { label: "Upcoming Visits",   icon: "calendar",       color: "#0ea5e9", getValue: (d) => d.myUpcomingVisits, subtitle: "Confirmed & requested" },
    { label: "Reports Available", icon: "file-text",      color: "#10b981", getValue: (d) => d.myReports },
    { label: "Latest Risk",       icon: "activity",       color: "#ec4899", getValue: (d) => d.myLatestRisk, subtitle: "From last screening" },
  ],
};

// ── Stats hook ────────────────────────────────────────────────────────────────
function useStatsData() {
  const { patients, screenings, consultations, appointments } = useApp();
  const { user } = useAuth();
  return useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // For patient: find their patient record by full name (demo linkage)
    const myPatient = user?.role === "Patient"
      ? patients.find((p) => `${p.firstName} ${p.lastName}` === user.fullName)
      : undefined;

    const myScreenings = myPatient ? screenings.filter((s) => s.patientId === myPatient.id) : [];
    const latestScreening = myScreenings.slice().sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];

    return {
      totalPatients:     patients.length,
      totalScreenings:   screenings.length,
      todayScreenings:   screenings.filter((s) => new Date(s.capturedAt) >= today).length,
      pending:           screenings.filter((s) => s.status === "Pending").length,
      urgent:            screenings.filter((s) => s.aiRiskLevel === "Urgent" || s.aiRiskLevel === "Severe").length,
      openConsultations: consultations.filter((c) => c.status !== "Completed" && c.status !== "Cancelled").length,
      // Patient-specific
      myUpcomingVisits: myPatient
        ? appointments.filter((a) => a.patientId === myPatient.id && (a.status === "Confirmed" || a.status === "Requested")).length
        : 0,
      myReports: myPatient
        ? consultations.filter((c) => c.patientId === myPatient.id && c.status === "Completed").length
        : 0,
      myLatestRisk: latestScreening?.aiRiskLevel ?? "—",
    };
  }, [patients, screenings, consultations, appointments, user]);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { patients, screenings, consultations, appointments, unreadCount } = useApp();
  const { user, logout } = useAuth();
  const statsData = useStatsData();

  const role: UserRole = user?.role ?? "Viewer";
  const roleMeta = ROLE_META[role];
  const quickActions = ROLE_ACTIONS[role];
  const statDefs = ROLE_STATS[role];

  // Patient-specific data
  const myPatient = role === "Patient"
    ? patients.find((p) => `${p.firstName} ${p.lastName}` === user?.fullName)
    : undefined;

  const myNextVisit = useMemo(() => {
    if (!myPatient) return undefined;
    const now = new Date();
    return appointments
      .filter((a) => a.patientId === myPatient.id
        && (a.status === "Confirmed" || a.status === "Requested")
        && new Date(`${a.scheduledDate}T${a.scheduledTime}`) >= now)
      .sort((a, b) =>
        new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime() -
        new Date(`${b.scheduledDate}T${b.scheduledTime}`).getTime())[0];
  }, [appointments, myPatient]);

  const myLatestReport = useMemo(() => {
    if (!myPatient) return undefined;
    return consultations
      .filter((c) => c.patientId === myPatient.id && c.status === "Completed")
      .sort((a, b) => new Date(b.respondedAt ?? b.requestedAt).getTime() - new Date(a.respondedAt ?? a.requestedAt).getTime())[0];
  }, [consultations, myPatient]);

  const recentScreenings = useMemo(() =>
    screenings
      .slice()
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
      .slice(0, 3),
    [screenings],
  );

  const activeConsultations = useMemo(() =>
    consultations
      .filter((c) => c.status !== "Completed" && c.status !== "Cancelled")
      .slice(0, 3),
    [consultations],
  );

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, gap: 20 },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    headerLeft: { flex: 1 },
    greeting: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 2 },
    userName: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    facilityRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
    roleChip: {
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
      flexDirection: "row", alignItems: "center", gap: 4,
    },
    roleChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
    facilityText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
    iconBtn: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: "center", justifyContent: "center",
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      position: "relative",
    },
    badge: {
      position: "absolute", top: -2, right: -2,
      minWidth: 18, height: 18, borderRadius: 9,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
      backgroundColor: colors.destructive,
    },
    badgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
    syncBanner: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
      backgroundColor: colors.successLight, borderColor: colors.normalBorder,
    },
    syncText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.normalText },
    statsGrid: { flexDirection: "row", gap: 12 },
    actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    actionBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: 16, paddingVertical: 14,
      borderRadius: 12, flex: 1, minWidth: "45%",
    },
    actionBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
    viewerNotice: {
      padding: 16, borderRadius: 12, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.muted,
      flexDirection: "row", gap: 12, alignItems: "flex-start",
    },
    viewerNoticeText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, flex: 1, lineHeight: 20 },
    permsBanner: { padding: 14, borderRadius: 10, borderWidth: 1 },
    permsBannerTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
    permsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    permTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    permTagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
    // Patient-specific styles
    nextVisitCard: {
      borderRadius: 16, padding: 18, gap: 12,
      backgroundColor: "#0ea5e9",
    },
    nextVisitLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)", letterSpacing: 0.8, textTransform: "uppercase" },
    nextVisitDate: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
    nextVisitDetails: { gap: 4 },
    nextVisitText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.95)" },
    nextVisitFooter: { flexDirection: "row", gap: 12, alignItems: "center" },
    nextVisitBtn: {
      backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
      flexDirection: "row", alignItems: "center", gap: 6,
    },
    nextVisitBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
    profileCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      padding: 14, borderRadius: 12, borderWidth: 1,
      backgroundColor: colors.card, borderColor: colors.border,
    },
    profileText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    reportCard: {
      padding: 14, borderRadius: 12, borderWidth: 1,
      backgroundColor: colors.card, borderColor: colors.border, gap: 8,
    },
    reportTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    reportMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    reportPreview: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 19 },
  });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.userName}>{user?.fullName ?? "—"}</Text>
          <View style={styles.facilityRow}>
            <View style={[styles.roleChip, { backgroundColor: roleMeta.color }]}>
              <Feather name={roleMeta.icon as never} size={10} color="#fff" />
              <Text style={styles.roleChipText}>{roleMeta.label}</Text>
            </View>
            {user?.facility ? (
              <Text style={styles.facilityText}>{role === "Patient" ? `Care: ${user.facility}` : user.facility}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && role !== "Viewer" && role !== "CHW" && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/(tabs)/notifications")}>
              <Feather name="bell" size={18} color={colors.foreground} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={() => logout()}>
            <Feather name="log-out" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Sync Status ── */}
      <View style={styles.syncBanner}>
        <Feather name="wifi" size={14} color={colors.success} />
        <Text style={styles.syncText}>Online · Last synced 2 min ago</Text>
      </View>

      {/* ── Patient: Next visit hero ── */}
      {role === "Patient" && myNextVisit && (
        <View style={styles.nextVisitCard}>
          <Text style={styles.nextVisitLabel}>Next Visit</Text>
          <Text style={styles.nextVisitDate}>
            {new Date(`${myNextVisit.scheduledDate}T${myNextVisit.scheduledTime}`).toLocaleDateString("en-UG", {
              weekday: "long", month: "short", day: "numeric",
            })} · {myNextVisit.scheduledTime}
          </Text>
          <View style={styles.nextVisitDetails}>
            <Text style={styles.nextVisitText}>{myNextVisit.type} — {myNextVisit.facility}</Text>
            {myNextVisit.doctor && <Text style={styles.nextVisitText}>{myNextVisit.doctor}</Text>}
          </View>
          <View style={styles.nextVisitFooter}>
            <TouchableOpacity style={styles.nextVisitBtn} onPress={() => router.push(`/appointment/${myNextVisit.id}` as never)}>
              <Feather name="info" size={14} color="#fff" />
              <Text style={styles.nextVisitBtnText}>View Details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextVisitBtn} onPress={() => router.push("/(tabs)/visits")}>
              <Feather name="calendar" size={14} color="#fff" />
              <Text style={styles.nextVisitBtnText}>All Visits</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Patient: Profile completeness reminder ── */}
      {role === "Patient" && myPatient && myPatient.medicalHistory.length === 0 && (
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push("/patient/profile" as never)}>
          <Feather name="alert-circle" size={20} color={colors.warning} />
          <Text style={styles.profileText}>
            Complete your medical history so doctors can advise you better.
          </Text>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      {/* ── Role-scoped Stats ── */}
      <View>
        <SectionHeader title={role === "Patient" ? "My Eye Care" : "Overview"} />
        <View style={styles.statsGrid}>
          {statDefs.slice(0, 2).map((def) => (
            <StatCard
              key={def.label}
              label={def.label}
              value={def.getValue(statsData)}
              icon={def.icon as never}
              color={def.color}
              subtitle={def.subtitle}
            />
          ))}
        </View>
        {statDefs.length > 2 && (
          <View style={[styles.statsGrid, { marginTop: 12 }]}>
            {statDefs.slice(2, 4).map((def) => (
              <StatCard
                key={def.label}
                label={def.label}
                value={def.getValue(statsData)}
                icon={def.icon as never}
                color={def.color}
                subtitle={def.subtitle}
              />
            ))}
          </View>
        )}
      </View>

      {/* ── Quick Actions ── */}
      {role === "Viewer" ? (
        <View style={[styles.viewerNotice, { borderColor: colors.border }]}>
          <Feather name="eye" size={20} color={colors.mutedForeground} />
          <Text style={styles.viewerNoticeText}>
            You have read-only access to analytics and aggregate reports. Contact your administrator to request additional permissions.
          </Text>
        </View>
      ) : (
        <View>
          <SectionHeader title="Quick Actions" />
          <View style={styles.actionsGrid}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[styles.actionBtn, { backgroundColor: action.color }]}
                onPress={() => router.push(action.route as never)}
                activeOpacity={0.85}
              >
                <Feather name={action.icon as never} size={18} color="#fff" />
                <Text style={styles.actionBtnText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Patient: Latest report preview ── */}
      {role === "Patient" && myLatestReport && (
        <View>
          <SectionHeader
            title="Latest Report"
            actionLabel="See all"
            onAction={() => router.push("/(tabs)/reports")}
          />
          <TouchableOpacity
            style={styles.reportCard}
            onPress={() => router.push(`/consultation/${myLatestReport.id}` as never)}
            activeOpacity={0.85}
          >
            <Text style={styles.reportTitle}>{myLatestReport.diagnosis ?? "Eye Consultation"}</Text>
            <Text style={styles.reportMeta}>
              {myLatestReport.assignedTo ?? "Specialist"} · {myLatestReport.respondedAt ? new Date(myLatestReport.respondedAt).toLocaleDateString("en-UG", { month: "short", day: "numeric", year: "numeric" }) : ""}
            </Text>
            {myLatestReport.specialistResponse && (
              <Text style={styles.reportPreview} numberOfLines={3}>{myLatestReport.specialistResponse}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Permissions Summary Banner (clinical roles only) ── */}
      {role !== "Patient" && (() => {
        const permColors: Record<UserRole, { bg: string; border: string; text: string; tag: string; tagText: string }> = {
          Admin:      { bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6", tag: "#ede9fe", tagText: "#6d28d9" },
          Doctor:     { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1", tag: "#e0f2fe", tagText: "#0284c7" },
          Technician: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", tag: "#dcfce7", tagText: "#15803d" },
          CHW:        { bg: "#fffbeb", border: "#fde68a", text: "#92400e", tag: "#fef3c7", tagText: "#b45309" },
          Viewer:     { bg: "#f8fafc", border: "#e2e8f0", text: "#475569", tag: "#f1f5f9", tagText: "#64748b" },
          Patient:    { bg: "#fdf2f8", border: "#fbcfe8", text: "#9d174d", tag: "#fce7f3", tagText: "#be185d" },
        };
        const pc = permColors[role];
        const PERM_TAGS: Record<UserRole, string[]> = {
          Admin:      ["Patients: Full", "Images: All", "AI: View", "Consults: Diagnose", "Referrals: Issue", "Analytics: Full", "Users: Manage", "Tenant: Config"],
          Doctor:     ["Patients: Create/Edit", "Images: Upload", "AI: View", "Consults: Diagnose", "Referrals: Issue", "Analytics: Clinical"],
          Technician: ["Patients: Create/Edit", "Images: Upload", "AI: Summary", "Analytics: Own sessions"],
          CHW:        ["Patients: Basic", "Images: Upload", "AI: Urgency only"],
          Viewer:     ["AI: View", "Analytics: Aggregate"],
          Patient:    ["My profile", "Request consults", "View my reports"],
        };
        return (
          <View style={[styles.permsBanner, { backgroundColor: pc.bg, borderColor: pc.border }]}>
            <Text style={[styles.permsBannerTitle, { color: pc.text }]}>
              Your Access Permissions · {roleMeta.label}
            </Text>
            <View style={styles.permsRow}>
              {PERM_TAGS[role].map((tag) => (
                <View key={tag} style={[styles.permTag, { backgroundColor: pc.tag }]}>
                  <Text style={[styles.permTagText, { color: pc.tagText }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {/* ── Recent Screenings (Admin, Doctor, Technician, CHW) ── */}
      {role !== "Viewer" && role !== "Patient" && (
        <View>
          <SectionHeader
            title="Recent Screenings"
            actionLabel="See all"
            onAction={() => router.push("/(tabs)/patients")}
          />
          {recentScreenings.length === 0 ? (
            <View style={[styles.viewerNotice, { borderColor: colors.border }]}>
              <Feather name="camera" size={18} color={colors.mutedForeground} />
              <Text style={styles.viewerNoticeText}>No screenings yet. Start a new screening to see results here.</Text>
            </View>
          ) : (
            recentScreenings.map((s) => {
              const pat = patients.find((p) => p.id === s.patientId);
              return (
                <ScreeningCard
                  key={s.id}
                  screening={s}
                  patientName={pat ? `${pat.firstName} ${pat.lastName}` : undefined}
                  onPress={() => router.push(`/screening/${s.id}`)}
                />
              );
            })
          )}
        </View>
      )}

      {/* ── Active Consultations (Admin, Doctor only) ── */}
      {(role === "Admin" || role === "Doctor") && (
        <View style={{ marginTop: 8 }}>
          <SectionHeader
            title="Active Consultations"
            actionLabel="See all"
            onAction={() => router.push("/(tabs)/consultations")}
          />
          {activeConsultations.length === 0 ? (
            <View style={[styles.viewerNotice, { borderColor: colors.border }]}>
              <Feather name="message-circle" size={18} color={colors.mutedForeground} />
              <Text style={styles.viewerNoticeText}>No active consultations at the moment.</Text>
            </View>
          ) : (
            activeConsultations.map((c) => {
              const pat = patients.find((p) => p.id === c.patientId);
              return (
                <ConsultationCard
                  key={c.id}
                  consultation={c}
                  patient={pat}
                  onPress={() => router.push(`/consultation/${c.id}`)}
                />
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}
