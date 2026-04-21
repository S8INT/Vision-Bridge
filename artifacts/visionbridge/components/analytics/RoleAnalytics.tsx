import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useApp, type RiskLevel } from "@/context/AppContext";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { BarChart, DonutChart, Sparkline, Legend, type ChartDatum } from "./charts";

const RISK_COLORS: Record<RiskLevel, string> = {
  Normal: "#10b981",
  Mild: "#84cc16",
  Moderate: "#f59e0b",
  Severe: "#ef4444",
  Urgent: "#dc2626",
};

const STATUS_COLORS: Record<string, string> = {
  Pending: "#f59e0b",
  Assigned: "#0ea5e9",
  InReview: "#06b6d4",
  Reviewed: "#8b5cf6",
  Referred: "#a855f7",
  Completed: "#10b981",
  Cancelled: "#94a3b8",
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function lastNDays(n: number) {
  const out: { key: string; label: string; date: Date }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-UG", { weekday: "short" }).slice(0, 1),
      date: d,
    });
  }
  return out;
}

function bucketByDay<T extends { capturedAt?: string; registeredAt?: string; createdAt?: string }>(
  items: T[],
  days: ReturnType<typeof lastNDays>,
  field: "capturedAt" | "registeredAt" | "createdAt",
): number[] {
  const buckets = new Map(days.map((d) => [d.key, 0]));
  items.forEach((it) => {
    const v = it[field];
    if (!v) return;
    const k = new Date(v).toISOString().slice(0, 10);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
  });
  return days.map((d) => buckets.get(d.key) || 0);
}

// ── Card wrapper ────────────────────────────────────────────────────────────
function ChartCard({
  title,
  subtitle,
  children,
  full,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          flexBasis: full ? "100%" : r.isPhone ? "100%" : "48%",
          flexGrow: 1,
        },
      ]}
    >
      <Text style={{ color: colors.foreground, fontSize: r.font(14), fontWeight: "700" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.mutedForeground, fontSize: r.font(11), marginBottom: 8 }}>
          {subtitle}
        </Text>
      ) : (
        <View style={{ height: 8 }} />
      )}
      {children}
    </View>
  );
}

// ── Main: role-aware analytics block ────────────────────────────────────────
export function RoleAnalytics() {
  const { user } = useAuth();
  const role: UserRole = user?.role ?? "Viewer";
  const { patients, screenings, consultations } = useApp();

  const days = useMemo(() => lastNDays(7), []);
  const screeningsByDay = useMemo(
    () => bucketByDay(screenings, days, "capturedAt"),
    [screenings, days],
  );
  const patientsByDay = useMemo(
    () => bucketByDay(patients, days, "registeredAt"),
    [patients, days],
  );
  const consultsByDay = useMemo(
    () => bucketByDay(consultations as never, days, "createdAt"),
    [consultations, days],
  );

  const riskBreakdown: ChartDatum[] = useMemo(() => {
    const counts: Record<RiskLevel, number> = {
      Normal: 0,
      Mild: 0,
      Moderate: 0,
      Severe: 0,
      Urgent: 0,
    };
    screenings.forEach((s) => counts[s.aiRiskLevel]++);
    return (Object.keys(counts) as RiskLevel[]).map((k) => ({
      label: k,
      value: counts[k],
      color: RISK_COLORS[k],
    }));
  }, [screenings]);

  // ── PATIENT: own journey ──────────────────────────────────────────────────
  if (role === "Patient") {
    const myPatient = patients.find(
      (p) => `${p.firstName} ${p.lastName}` === user?.fullName,
    );
    const mine = myPatient
      ? screenings
          .filter((s) => s.patientId === myPatient.id)
          .slice()
          .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
      : [];
    const riskMap: Record<RiskLevel, number> = {
      Normal: 1,
      Mild: 2,
      Moderate: 3,
      Severe: 4,
      Urgent: 5,
    };
    const trend = mine.map((s) => riskMap[s.aiRiskLevel]);
    const myRisk: ChartDatum[] = (Object.keys(riskMap) as RiskLevel[]).map((k) => ({
      label: k,
      value: mine.filter((s) => s.aiRiskLevel === k).length,
      color: RISK_COLORS[k],
    }));
    const totalScreenings = mine.length;
    return (
      <Wrapper title="My Eye Health Insights">
        <ChartCard
          title="Risk Trend"
          subtitle={
            mine.length === 0
              ? "No screenings yet"
              : `${mine.length} screening${mine.length === 1 ? "" : "s"} on record`
          }
          full
        >
          <Sparkline data={trend} color="#ec4899" />
        </ChartCard>
        <ChartCard title="Risk Distribution" subtitle="All-time screenings">
          <View style={{ alignItems: "center" }}>
            <DonutChart
              data={myRisk}
              centerLabel="screenings"
              centerValue={totalScreenings}
            />
            <Legend data={myRisk.filter((d) => d.value > 0)} />
          </View>
        </ChartCard>
        <ChartCard title="Activity (last 7 days)" subtitle="Your visits & screenings">
          <BarChart
            data={days.map((d, i) => ({
              label: d.label,
              value: mine.filter(
                (s) => new Date(s.capturedAt).toISOString().slice(0, 10) === d.key,
              ).length,
              color: "#ec4899",
            }))}
          />
        </ChartCard>
      </Wrapper>
    );
  }

  // ── DOCTOR ────────────────────────────────────────────────────────────────
  if (role === "Doctor") {
    const myConsults = consultations; // demo: all consultations
    const statusCounts: Record<string, number> = {};
    myConsults.forEach((c) => (statusCounts[c.status] = (statusCounts[c.status] || 0) + 1));
    const statusData: ChartDatum[] = Object.entries(statusCounts).map(([k, v]) => ({
      label: k,
      value: v,
      color: STATUS_COLORS[k] || "#64748b",
    }));
    return (
      <Wrapper title="Clinical Analytics">
        <ChartCard title="Consultations" subtitle="Pipeline status">
          <View style={{ alignItems: "center" }}>
            <DonutChart data={statusData} centerLabel="total" />
            <Legend data={statusData} />
          </View>
        </ChartCard>
        <ChartCard title="AI Risk Mix" subtitle="All screenings">
          <View style={{ alignItems: "center" }}>
            <DonutChart
              data={riskBreakdown}
              centerLabel="screened"
              centerValue={screenings.length}
            />
            <Legend data={riskBreakdown.filter((d) => d.value > 0)} />
          </View>
        </ChartCard>
        <ChartCard title="Inflow (last 7 days)" subtitle="Screenings captured" full>
          <BarChart
            data={days.map((d, i) => ({
              label: d.label,
              value: screeningsByDay[i],
              color: "#0ea5e9",
            }))}
          />
        </ChartCard>
      </Wrapper>
    );
  }

  // ── TECHNICIAN ────────────────────────────────────────────────────────────
  if (role === "Technician") {
    const avgQuality =
      screenings.length > 0
        ? Math.round(
            screenings.reduce((s, x) => s + (x.imageQualityScore || 0), 0) / screenings.length,
          )
        : 0;
    const passRate =
      screenings.length > 0
        ? Math.round((screenings.filter((s) => (s.imageQualityScore || 0) >= 70).length / screenings.length) * 100)
        : 0;
    return (
      <Wrapper title="Imaging Analytics">
        <ChartCard title="Captures (last 7 days)" subtitle="Daily volume" full>
          <BarChart
            data={days.map((d, i) => ({
              label: d.label,
              value: screeningsByDay[i],
              color: "#10b981",
            }))}
          />
        </ChartCard>
        <ChartCard title="AI Risk Mix" subtitle="From your captures">
          <View style={{ alignItems: "center" }}>
            <DonutChart
              data={riskBreakdown}
              centerLabel="screened"
              centerValue={screenings.length}
            />
            <Legend data={riskBreakdown.filter((d) => d.value > 0)} />
          </View>
        </ChartCard>
        <ChartCard title="Image Quality" subtitle="Avg score / Pass rate ≥ 70">
          <View style={{ alignItems: "center" }}>
            <DonutChart
              data={[
                { label: "Pass", value: passRate, color: "#10b981" },
                { label: "Below", value: 100 - passRate, color: "#f59e0b" },
              ]}
              centerLabel="avg score"
              centerValue={`${avgQuality}`}
            />
            <Legend
              data={[
                { label: "Pass ≥70", value: passRate, color: "#10b981" },
                { label: "Below", value: 100 - passRate, color: "#f59e0b" },
              ]}
            />
          </View>
        </ChartCard>
      </Wrapper>
    );
  }

  // ── CHW ───────────────────────────────────────────────────────────────────
  if (role === "CHW") {
    const villageCounts: Record<string, number> = {};
    patients.forEach((p) => (villageCounts[p.village] = (villageCounts[p.village] || 0) + 1));
    const topVillages = Object.entries(villageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => ({ label: k.slice(0, 6), value: v, color: "#f59e0b" }));
    return (
      <Wrapper title="Field Analytics">
        <ChartCard title="Registrations (last 7 days)" subtitle="New patients" full>
          <BarChart
            data={days.map((d, i) => ({
              label: d.label,
              value: patientsByDay[i],
              color: "#f59e0b",
            }))}
          />
        </ChartCard>
        <ChartCard title="Risk Mix" subtitle="Field captures">
          <View style={{ alignItems: "center" }}>
            <DonutChart
              data={riskBreakdown}
              centerLabel="screened"
              centerValue={screenings.length}
            />
            <Legend data={riskBreakdown.filter((d) => d.value > 0)} />
          </View>
        </ChartCard>
        <ChartCard title="Top Villages" subtitle="By registration volume">
          <BarChart data={topVillages} />
        </ChartCard>
      </Wrapper>
    );
  }

  // ── ADMIN / VIEWER (system-wide) ──────────────────────────────────────────
  const roleCounts: Record<string, number> = { Admin: 0, Doctor: 0, Technician: 0, CHW: 0, Viewer: 0 };
  // Demo placeholder: in absence of a users list, we show a fixed distribution
  // mirroring our seeded users so the donut is meaningful.
  roleCounts.Admin = 1;
  roleCounts.Doctor = 4;
  roleCounts.Technician = 1;
  roleCounts.CHW = 1;
  roleCounts.Viewer = 1;
  const roleColors: Record<string, string> = {
    Admin: "#7c3aed",
    Doctor: "#0ea5e9",
    Technician: "#10b981",
    CHW: "#f59e0b",
    Viewer: "#64748b",
  };
  const roleData: ChartDatum[] = Object.entries(roleCounts).map(([k, v]) => ({
    label: k,
    value: v,
    color: roleColors[k],
  }));

  return (
    <Wrapper title={role === "Admin" ? "System Analytics" : "District Analytics"}>
      <ChartCard title="Screening Volume" subtitle="Last 7 days" full>
        <BarChart
          data={days.map((d, i) => ({ label: d.label, value: screeningsByDay[i], color: "#0ea5e9" }))}
        />
      </ChartCard>
      <ChartCard title="AI Risk Mix" subtitle="All screenings">
        <View style={{ alignItems: "center" }}>
          <DonutChart
            data={riskBreakdown}
            centerLabel="screened"
            centerValue={screenings.length}
          />
          <Legend data={riskBreakdown.filter((d) => d.value > 0)} />
        </View>
      </ChartCard>
      {role === "Admin" ? (
        <ChartCard title="User Roles" subtitle="Active staff distribution">
          <View style={{ alignItems: "center" }}>
            <DonutChart
              data={roleData}
              centerLabel="users"
              centerValue={roleData.reduce((s, d) => s + d.value, 0)}
            />
            <Legend data={roleData} />
          </View>
        </ChartCard>
      ) : (
        <ChartCard title="Consultations (last 7 days)" subtitle="New cases">
          <BarChart
            data={days.map((d, i) => ({ label: d.label, value: consultsByDay[i], color: "#06b6d4" }))}
          />
        </ChartCard>
      )}
    </Wrapper>
  );
}

function Wrapper({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.foreground, fontSize: r.font(16), fontWeight: "700" }}>
          {title}
        </Text>
      </View>
      <View style={styles.grid}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minWidth: 220,
  },
});
