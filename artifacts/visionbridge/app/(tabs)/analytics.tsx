/**
 * Analytics Tab — VisionBridge
 *
 * Full analytics dashboard implementing all 7 service responsibilities:
 *  1. Real-time screening volume & disease prevalence
 *  2. DHIS2 data push
 *  3. National eye health registry aggregation
 *  4. AI model performance monitoring + drift alerts
 *  5. Population risk stratification map
 *  6. Campaign effectiveness reporting
 *  7. Export: CSV / FHIR R4 / DHIS2 push
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  computePrevalence,
  computeScreeningVolume,
  computeKPIs,
  computeRiskStratification,
  computeCampaignEffectiveness,
  computeAiPerformance,
  buildRegistryReport,
  exportToCsv,
  buildFhirBundle,
  shareExport,
  pushToDHIS2,
  pushAggregate,
  RISK_COLORS,
  type PrevalenceData,
  type VolumePoint,
  type DistrictRiskRow,
  type CampaignEffectiveness,
  type AiPerformanceReport,
} from "@/services/analyticsService";

type TabKey = "overview" | "stratification" | "campaigns" | "ai" | "export";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, icon, colors }: { title: string; subtitle?: string; icon: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={secStyles.wrap}>
      <View style={[secStyles.iconWrap, { backgroundColor: colors.primary + "14" }]}>
        <Feather name={icon as any} size={18} color={colors.primary} />
      </View>
      <View>
        <Text style={[secStyles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[secStyles.sub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
const secStyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 1 },
});

// ── Donut Chart (SVG-less, CSS/View approach for cross-platform) ──────────────

function DonutChart({ data, total, colors }: { data: PrevalenceData[]; total: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={donutStyles.container}>
      <View style={donutStyles.ring}>
        {data.map((d, i) => {
          const deg = (d.pct / 100) * 360;
          if (deg === 0) return null;
          return (
            <View key={d.riskLevel} style={[donutStyles.segment, { width: "100%", marginBottom: 6 }]}>
              <View style={[donutStyles.segBar, { backgroundColor: d.color, width: `${d.pct}%` as any }]} />
              <View style={donutStyles.segLabel}>
                <View style={[donutStyles.dot, { backgroundColor: d.color }]} />
                <Text style={[donutStyles.segText, { color: colors.foreground }]}>{d.riskLevel}</Text>
                <Text style={[donutStyles.segCount, { color: colors.mutedForeground }]}>{d.count} ({d.pct}%)</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={[donutStyles.center, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[donutStyles.centerNum, { color: colors.foreground }]}>{total}</Text>
        <Text style={[donutStyles.centerLabel, { color: colors.mutedForeground }]}>screened</Text>
      </View>
    </View>
  );
}
const donutStyles = StyleSheet.create({
  container: { gap: 0, paddingVertical: 4 },
  ring: { gap: 0 },
  segment: {},
  segBar: { height: 20, borderRadius: 4, minWidth: 4 },
  segLabel: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segText: { fontSize: 13, fontWeight: "600", flex: 1 },
  segCount: { fontSize: 12 },
  center: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 },
  centerNum: { fontSize: 22, fontWeight: "800" },
  centerLabel: { fontSize: 11 },
});

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data, colors }: { data: VolumePoint[]; colors: ReturnType<typeof useColors> }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const displayed = data.slice(-10);
  return (
    <View style={barStyles.container}>
      <View style={barStyles.bars}>
        {displayed.map((d) => (
          <View key={d.date} style={barStyles.col}>
            <View style={barStyles.barWrap}>
              <View style={[barStyles.bar, { height: `${(d.count / maxCount) * 100}%` as any, backgroundColor: colors.primary }]} />
              {d.highRisk > 0 ? (
                <View style={[barStyles.barHighRisk, { height: `${(d.highRisk / maxCount) * 100}%` as any, backgroundColor: colors.destructive }]} />
              ) : null}
            </View>
            <Text style={[barStyles.label, { color: colors.mutedForeground }]}>{d.label.split(" ")[1] ?? d.label}</Text>
          </View>
        ))}
      </View>
      <View style={barStyles.legend}>
        <View style={barStyles.legendItem}>
          <View style={[barStyles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[barStyles.legendText, { color: colors.mutedForeground }]}>All screenings</Text>
        </View>
        <View style={barStyles.legendItem}>
          <View style={[barStyles.legendDot, { backgroundColor: colors.destructive }]} />
          <Text style={[barStyles.legendText, { color: colors.mutedForeground }]}>High-risk</Text>
        </View>
      </View>
    </View>
  );
}
const barStyles = StyleSheet.create({
  container: { gap: 8 },
  bars: { flexDirection: "row", alignItems: "flex-end", height: 80, gap: 4 },
  col: { flex: 1, alignItems: "center", height: "100%" },
  barWrap: { flex: 1, width: "100%", justifyContent: "flex-end", position: "relative" },
  bar: { width: "100%", borderRadius: 3, minHeight: 2 },
  barHighRisk: { position: "absolute", bottom: 0, width: "100%", borderRadius: 3, minHeight: 2 },
  label: { fontSize: 9, marginTop: 4 },
  legend: { flexDirection: "row", gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
});

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, color, sub, colors }: {
  label: string; value: string | number; icon: string;
  color: string; sub?: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[kpiStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[kpiStyles.icon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[kpiStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[kpiStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      {sub ? <Text style={[kpiStyles.sub, { color }]}>{sub}</Text> : null}
    </View>
  );
}
const kpiStyles = StyleSheet.create({
  card: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  value: { fontSize: 22, fontWeight: "800" },
  label: { fontSize: 12 },
  sub: { fontSize: 11, fontWeight: "600" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { patients, screenings, consultations, referrals, campaigns, currentUser } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dhis2Pushing, setDhis2Pushing] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  // ── Memoised computations ──────────────────────────────────────────────────

  const kpis = useMemo(() => computeKPIs(patients, screenings, consultations, referrals), [patients, screenings, consultations, referrals]);
  const prevalence = useMemo(() => computePrevalence(screenings), [screenings]);
  const volume = useMemo(() => computeScreeningVolume(screenings, 14), [screenings]);
  const stratification = useMemo(() => computeRiskStratification(patients, screenings), [patients, screenings]);
  const campaignEffectiveness = useMemo(() => computeCampaignEffectiveness(campaigns, screenings), [campaigns, screenings]);
  const aiPerf = useMemo(() => computeAiPerformance(screenings), [screenings]);

  // ── Refresh / sync ─────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setSyncing(true);
    const ok = await pushAggregate(
      "mbarara-rrh-01",
      currentUser.district,
      patients,
      screenings,
      consultations,
      referrals,
      campaigns
    );
    setLastSync(ok ? new Date().toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" }) : null);
    setSyncing(false);
    setRefreshing(false);
  }, [patients, screenings, consultations, referrals, campaigns, currentUser]);

  useEffect(() => { handleRefresh(); }, []);

  // ── DHIS2 push ─────────────────────────────────────────────────────────────

  async function handleDHIS2Push() {
    setDhis2Pushing(true);
    const period = new Date().toISOString().slice(0, 7).replace("-", "");
    const result = await pushToDHIS2(screenings, period, "UG-MBR-001", "mbarara-rrh-01");
    setDhis2Pushing(false);
    Alert.alert(
      result.ok ? "DHIS2 Push Successful" : "DHIS2 Push Failed",
      result.dryRun
        ? `Dry-run mode — ${screenings.length} records prepared for ${period}.\n\nSet DHIS2_URL, DHIS2_USER, DHIS2_PASS env vars for live push.`
        : result.error ?? "Data pushed successfully",
    );
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────

  async function handleCsvExport() {
    setExporting("csv");
    const csv = exportToCsv(patients, screenings);
    const filename = `visionbridge-screenings-${new Date().toISOString().slice(0, 10)}.csv`;
    await shareExport(filename, csv, "text/csv");
    setExporting(null);
  }

  // ── FHIR Export ────────────────────────────────────────────────────────────

  async function handleFhirExport() {
    setExporting("fhir");
    const bundle = buildFhirBundle(patients, screenings, consultations, referrals);
    const json = JSON.stringify(bundle, null, 2);
    const filename = `visionbridge-fhir-${new Date().toISOString().slice(0, 10)}.json`;
    await shareExport(filename, json, "application/fhir+json");
    setExporting(null);
  }

  // ── Registry Report ────────────────────────────────────────────────────────

  async function handleRegistryExport() {
    setExporting("registry");
    const report = buildRegistryReport(patients, screenings, referrals, currentUser.clinic, currentUser.district);
    const json = JSON.stringify(report, null, 2);
    await shareExport(`visionbridge-registry-${report.reportingPeriod}.json`, json, "application/json");
    setExporting(null);
  }

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "activity" },
    { key: "stratification", label: "Risk Map", icon: "map-pin" },
    { key: "campaigns", label: "Campaigns", icon: "flag" },
    { key: "ai", label: "AI Model", icon: "cpu" },
    { key: "export", label: "Export", icon: "download" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Analytics</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {syncing ? "Syncing…" : lastSync ? `Last synced ${lastSync}` : "Real-time health intelligence"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleRefresh}
          style={[styles.syncBtn, { borderColor: colors.border }]}
          disabled={syncing}
        >
          {syncing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Feather name="refresh-cw" size={16} color={colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* ── Sub-tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { borderBottomColor: colors.border }]} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(({ key, label, icon }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setActiveTab(key)}
            style={[styles.tab, activeTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Feather name={icon as any} size={14} color={activeTab === key ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: activeTab === key ? colors.primary : colors.mutedForeground, fontWeight: activeTab === key ? "700" : "500" }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >

        {/* ═══════════════ OVERVIEW ═══════════════ */}
        {activeTab === "overview" ? (
          <>
            {/* KPIs */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="Key Performance Indicators" subtitle={`${new Date().toLocaleDateString("en-UG", { month: "long", year: "numeric" })}`} icon="bar-chart-2" colors={colors} />
              <View style={styles.kpiGrid}>
                <KpiCard label="Total Patients" value={kpis.totalPatients} icon="users" color={colors.primary} colors={colors} />
                <KpiCard label="Total Screened" value={kpis.totalScreenings} icon="camera" color={colors.success} colors={colors} />
              </View>
              <View style={styles.kpiGrid}>
                <KpiCard label="High-Risk Cases" value={kpis.highRiskCount} icon="alert-triangle" color={colors.destructive} sub={`${kpis.highRiskRate.toFixed(1)}% of all`} colors={colors} />
                <KpiCard label="Pending Review" value={kpis.pendingReview} icon="clock" color={colors.warning} colors={colors} />
              </View>
              <View style={styles.kpiGrid}>
                <KpiCard label="Avg Image Quality" value={`${kpis.avgImageQuality}/100`} icon="image" color={colors.accent} colors={colors} />
                <KpiCard label="Consult Completion" value={`${kpis.consultationCompletionRate.toFixed(0)}%`} icon="check-circle" color={colors.success} colors={colors} />
              </View>
              <View style={styles.kpiGrid}>
                <KpiCard label="Referral Acceptance" value={`${kpis.referralAcceptanceRate.toFixed(0)}%`} icon="send" color={colors.primary} colors={colors} />
                <KpiCard label="Screenings (7d)" value={kpis.screeningTrend7d} icon="trending-up" color={colors.accent} colors={colors} />
              </View>
            </View>

            {/* Prevalence */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="Disease Prevalence" subtitle="AI-assessed risk level distribution" icon="pie-chart" colors={colors} />
              <DonutChart data={prevalence} total={screenings.length} colors={colors} />
            </View>

            {/* Volume */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="Screening Volume" subtitle="Last 14 days" icon="bar-chart" colors={colors} />
              <BarChart data={volume} colors={colors} />
              <View style={styles.volumeStats}>
                {[
                  { label: "Avg/day", value: (screenings.length / 14).toFixed(1) },
                  { label: "Peak day", value: Math.max(...volume.map((v) => v.count)) },
                  { label: "High-risk days", value: volume.filter((v) => v.highRisk > 0).length },
                ].map(({ label, value }) => (
                  <View key={label} style={[styles.volumeStat, { borderColor: colors.border }]}>
                    <Text style={[styles.volumeStatVal, { color: colors.foreground }]}>{value}</Text>
                    <Text style={[styles.volumeStatLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {/* ═══════════════ RISK STRATIFICATION ═══════════════ */}
        {activeTab === "stratification" ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SectionHeader title="Population Risk Stratification" subtitle="High-risk detection rate by district / village" icon="map-pin" colors={colors} />
            {stratification.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="map" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No stratification data yet</Text>
              </View>
            ) : stratification.map((row, i) => (
              <View key={row.district} style={[styles.stratRow, { borderTopColor: colors.border, borderTopWidth: i > 0 ? 1 : 0 }]}>
                <View style={styles.stratHeader}>
                  <View style={styles.stratTitleWrap}>
                    <View style={[styles.stratRankBadge, {
                      backgroundColor: row.highRiskRate >= 40 ? colors.destructive + "18" : row.highRiskRate >= 20 ? colors.warning + "18" : colors.success + "18",
                    }]}>
                      <Text style={[styles.stratRank, {
                        color: row.highRiskRate >= 40 ? colors.destructive : row.highRiskRate >= 20 ? colors.warning : colors.success,
                      }]}>#{i + 1}</Text>
                    </View>
                    <Text style={[styles.stratDistrict, { color: colors.foreground }]}>{row.district}</Text>
                  </View>
                  <View style={styles.stratMeta}>
                    <Text style={[styles.stratTotal, { color: colors.primary }]}>{row.total} screened</Text>
                    <Text style={[styles.stratHighRisk, { color: row.highRiskRate >= 30 ? colors.destructive : colors.mutedForeground }]}>
                      {row.highRiskRate.toFixed(1)}% high-risk
                    </Text>
                  </View>
                </View>

                <View style={styles.stratBars}>
                  {([
                    { key: "normal", label: "Normal", color: RISK_COLORS.Normal },
                    { key: "mild", label: "Mild", color: RISK_COLORS.Mild },
                    { key: "moderate", label: "Moderate", color: RISK_COLORS.Moderate },
                    { key: "severe", label: "Severe", color: RISK_COLORS.Severe },
                    { key: "urgent", label: "Urgent", color: RISK_COLORS.Urgent },
                  ] as const).map(({ key, label, color }) => {
                    const count = row[key] as number;
                    const pct = row.total > 0 ? (count / row.total) * 100 : 0;
                    if (count === 0) return null;
                    return (
                      <View key={key} style={styles.stratBarRow}>
                        <Text style={[styles.stratBarLabel, { color: colors.mutedForeground }]}>{label}</Text>
                        <View style={[styles.stratBarTrack, { backgroundColor: colors.muted }]}>
                          <View style={[styles.stratBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.stratBarCount, { color: colors.foreground }]}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={[styles.stratQuality, { color: colors.mutedForeground }]}>
                  Avg image quality: {row.avgQuality}/100
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ═══════════════ CAMPAIGNS ═══════════════ */}
        {activeTab === "campaigns" ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SectionHeader title="Campaign Effectiveness" subtitle="Coverage, referral rates, risk outcomes" icon="flag" colors={colors} />
            {campaignEffectiveness.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="flag" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No campaigns yet</Text>
              </View>
            ) : campaignEffectiveness.map((c, i) => (
              <View key={c.id} style={[styles.campCard, { borderColor: colors.border, borderTopWidth: i > 0 ? 1 : 0 }]}>
                <View style={styles.campHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.campName, { color: colors.foreground }]}>{c.name}</Text>
                    <Text style={[styles.campType, { color: colors.mutedForeground }]}>{c.type} · {c.status}</Text>
                  </View>
                  <View style={[styles.campStatusBadge, {
                    backgroundColor: c.status === "Active" ? colors.success + "18" : c.status === "Completed" ? colors.primary + "18" : colors.muted,
                  }]}>
                    <Text style={[styles.campStatusText, {
                      color: c.status === "Active" ? colors.success : c.status === "Completed" ? colors.primary : colors.mutedForeground,
                    }]}>{c.status}</Text>
                  </View>
                </View>

                {/* Coverage bar */}
                <View style={styles.campMeter}>
                  <View style={styles.campMeterHeader}>
                    <Text style={[styles.campMeterLabel, { color: colors.mutedForeground }]}>Coverage</Text>
                    <Text style={[styles.campMeterValue, { color: colors.foreground }]}>
                      {c.screenedCount}/{c.targetCount} ({c.coverage.toFixed(0)}%)
                    </Text>
                  </View>
                  <View style={[styles.campMeterTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.campMeterFill, { width: `${Math.min(c.coverage, 100)}%` as any, backgroundColor: colors.primary }]} />
                  </View>
                </View>

                <View style={styles.campStats}>
                  {[
                    { label: "Referred", value: c.referredCount, icon: "send", color: colors.warning },
                    { label: "Referral Rate", value: `${c.referralRate.toFixed(1)}%`, icon: "percent", color: c.referralRate > 30 ? colors.destructive : colors.success },
                    { label: "Normal", value: `${c.normalPct.toFixed(0)}%`, icon: "check-circle", color: colors.success },
                    { label: "High-risk", value: `${c.highRiskPct.toFixed(0)}%`, icon: "alert-triangle", color: c.highRiskPct > 20 ? colors.destructive : colors.warning },
                  ].map(({ label, value, icon, color }) => (
                    <View key={label} style={[styles.campStat, { borderColor: colors.border }]}>
                      <Feather name={icon as any} size={13} color={color} />
                      <Text style={[styles.campStatVal, { color: colors.foreground }]}>{value}</Text>
                      <Text style={[styles.campStatLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ═══════════════ AI PERFORMANCE ═══════════════ */}
        {activeTab === "ai" ? (
          <>
            {/* Status card */}
            <View style={[styles.card, {
              backgroundColor: aiPerf.status === "healthy" ? colors.successLight : aiPerf.status === "warning" ? colors.warningLight : colors.destructive + "10",
              borderColor: aiPerf.status === "healthy" ? colors.normalBorder : aiPerf.status === "warning" ? "#fcd34d" : colors.destructive + "40",
            }]}>
              <View style={styles.aiStatusRow}>
                <Feather
                  name={aiPerf.status === "healthy" ? "check-circle" : aiPerf.status === "warning" ? "alert-triangle" : "alert-octagon"}
                  size={22}
                  color={aiPerf.status === "healthy" ? colors.success : aiPerf.status === "warning" ? colors.warning : colors.destructive}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.aiStatusTitle, { color: colors.foreground }]}>
                    {aiPerf.status === "healthy" ? "Model Healthy" : aiPerf.status === "warning" ? "Performance Warning" : "Drift Alert"}
                  </Text>
                  <Text style={[styles.aiStatusModel, { color: colors.mutedForeground }]}>{aiPerf.modelVersion}</Text>
                </View>
              </View>
              {aiPerf.driftAlerts.map((a) => (
                <View key={a} style={styles.driftAlert}>
                  <Feather name="alert-circle" size={13} color={colors.warning} />
                  <Text style={[styles.driftAlertText, { color: "#92400e" }]}>{a}</Text>
                </View>
              ))}
            </View>

            {/* Metrics */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="Model Metrics" subtitle="Computed from all completed screenings" icon="cpu" colors={colors} />

              {[
                { label: "Sample Count", value: aiPerf.sampleCount, suffix: "", max: aiPerf.sampleCount, color: colors.primary },
                { label: "Avg Confidence", value: aiPerf.avgConfidence, suffix: "%", max: 100, color: aiPerf.avgConfidence >= 80 ? colors.success : colors.warning },
                { label: "High-risk Rate", value: (aiPerf.highRiskRate * 100).toFixed(1), suffix: "%", max: 100, color: aiPerf.highRiskRate > 0.3 ? colors.destructive : colors.success },
                { label: "Quality Pass Rate", value: (aiPerf.qualityPassRate * 100).toFixed(1), suffix: "%", max: 100, color: aiPerf.qualityPassRate >= 0.8 ? colors.success : colors.warning },
              ].map(({ label, value, suffix, max, color }) => (
                <View key={label} style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <View style={styles.metricRight}>
                    <Text style={[styles.metricValue, { color }]}>{value}{suffix}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Per-risk breakdown */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="Per-Risk Confidence" subtitle="Average AI confidence by risk level" icon="target" colors={colors} />
              {aiPerf.breakdown.map(({ riskLevel, count, avgConfidence }) => (
                <View key={riskLevel} style={styles.metricRow}>
                  <View style={styles.riskBadge}>
                    <View style={[styles.riskDot, { backgroundColor: RISK_COLORS[riskLevel] }]} />
                    <Text style={[styles.riskLabel, { color: colors.foreground }]}>{riskLevel}</Text>
                    <Text style={[styles.riskCount, { color: colors.mutedForeground }]}>({count})</Text>
                  </View>
                  <View style={styles.confBar}>
                    <View style={[styles.confBarFill, { width: `${avgConfidence}%` as any, backgroundColor: RISK_COLORS[riskLevel] }]} />
                  </View>
                  <Text style={[styles.confPct, { color: colors.foreground }]}>{avgConfidence}%</Text>
                </View>
              ))}
            </View>

            {/* Drift thresholds */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="Drift Thresholds" subtitle="Alert criteria for model monitoring" icon="sliders" colors={colors} />
              {[
                { label: "Confidence drop alert", value: "10 percentage points" },
                { label: "High-risk rate swing", value: "20% absolute shift" },
                { label: "Quality pass floor", value: "60% minimum" },
                { label: "Monitoring interval", value: "Per batch upload" },
              ].map(({ label, value }) => (
                <View key={label} style={[styles.thresholdRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.thresholdLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <Text style={[styles.thresholdValue, { color: colors.foreground }]}>{value}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* ═══════════════ EXPORT ═══════════════ */}
        {activeTab === "export" ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="Data Export" subtitle="Clinical records and analytics bundles" icon="download" colors={colors} />

              {[
                {
                  id: "csv",
                  icon: "file-text",
                  title: "CSV Export",
                  subtitle: `${screenings.length} screening records · UTF-8 with BOM · Excel-compatible`,
                  onPress: handleCsvExport,
                  color: colors.success,
                },
                {
                  id: "fhir",
                  icon: "package",
                  title: "FHIR R4 Bundle",
                  subtitle: `${patients.length} Patients · ${screenings.length} Observations · ${referrals.length} ServiceRequests`,
                  onPress: handleFhirExport,
                  color: colors.primary,
                },
                {
                  id: "registry",
                  icon: "database",
                  title: "National Registry Report",
                  subtitle: "Aggregate report for Uganda National Eye Health Registry",
                  onPress: handleRegistryExport,
                  color: colors.accent,
                },
              ].map(({ id, icon, title, subtitle, onPress, color }) => (
                <TouchableOpacity
                  key={id}
                  onPress={onPress}
                  disabled={exporting !== null}
                  style={[styles.exportBtn, { borderColor: color + "40", backgroundColor: color + "08" }]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.exportIcon, { backgroundColor: color + "18" }]}>
                    {exporting === id
                      ? <ActivityIndicator size="small" color={color} />
                      : <Feather name={icon as any} size={20} color={color} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exportTitle, { color: colors.foreground }]}>{title}</Text>
                    <Text style={[styles.exportSub, { color: colors.mutedForeground }]}>{subtitle}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>

            {/* DHIS2 Integration */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SectionHeader title="DHIS2 Integration" subtitle="Push aggregate data to Uganda HMIS" icon="upload-cloud" colors={colors} />

              <View style={[styles.dhis2Info, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="info" size={14} color={colors.mutedForeground} />
                <Text style={[styles.dhis2InfoText, { color: colors.mutedForeground }]}>
                  Pushes weekly aggregate screening data to DHIS2 data value sets endpoint.
                  Configure DHIS2_URL, DHIS2_USER, DHIS2_PASS on the API server for live integration.
                </Text>
              </View>

              <View style={styles.dhis2Preview}>
                {[
                  { label: "Org Unit", value: "UG-MBR-001 (Mbarara)" },
                  { label: "Period", value: new Date().toISOString().slice(0, 7).replace("-", "") + " (weekly)" },
                  { label: "Data elements", value: "6 (total + 5 risk levels)" },
                  { label: "Total screenings", value: String(screenings.length) },
                ].map(({ label, value }) => (
                  <View key={label} style={[styles.dhis2Row, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.dhis2Label, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.dhis2Value, { color: colors.foreground }]}>{value}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={handleDHIS2Push}
                disabled={dhis2Pushing}
                style={[styles.dhis2PushBtn, { backgroundColor: dhis2Pushing ? colors.muted : colors.primary }]}
                activeOpacity={0.85}
              >
                {dhis2Pushing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="upload-cloud" size={18} color="#fff" />}
                <Text style={styles.dhis2PushText}>{dhis2Pushing ? "Pushing…" : "Push to DHIS2"}</Text>
              </TouchableOpacity>
            </View>

            {/* HIPAA Note */}
            <View style={[styles.disclaimer, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
              <Feather name="shield" size={14} color="#92400e" />
              <Text style={[styles.disclaimerText, { color: "#92400e" }]}>
                All exports are de-identified where possible. FHIR bundles contain clinical identifiers per FHIR R4 spec — handle in compliance with Uganda MoH data governance policies and applicable HIPAA/GDPR equivalents.
              </Text>
            </View>
          </>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  headerSub: { fontSize: 12, marginTop: 2 },
  syncBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  tabBar: { borderBottomWidth: 1, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13 },

  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },

  kpiGrid: { flexDirection: "row", gap: 10 },

  volumeStats: { flexDirection: "row", gap: 10, marginTop: 4 },
  volumeStat: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center" },
  volumeStatVal: { fontSize: 18, fontWeight: "800" },
  volumeStatLabel: { fontSize: 11 },

  emptyState: { alignItems: "center", gap: 8, paddingVertical: 24 },
  emptyText: { fontSize: 14 },

  stratRow: { paddingVertical: 14, gap: 10 },
  stratHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  stratTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  stratRankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  stratRank: { fontSize: 12, fontWeight: "700" },
  stratDistrict: { fontSize: 15, fontWeight: "700" },
  stratMeta: { alignItems: "flex-end" },
  stratTotal: { fontSize: 13, fontWeight: "700" },
  stratHighRisk: { fontSize: 12 },
  stratBars: { gap: 6 },
  stratBarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stratBarLabel: { fontSize: 11, width: 64 },
  stratBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  stratBarFill: { height: 8, borderRadius: 4, minWidth: 4 },
  stratBarCount: { fontSize: 12, fontWeight: "700", width: 24, textAlign: "right" },
  stratQuality: { fontSize: 11 },

  campCard: { paddingVertical: 14, gap: 12 },
  campHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  campName: { fontSize: 14, fontWeight: "700" },
  campType: { fontSize: 12, marginTop: 2 },
  campStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  campStatusText: { fontSize: 11, fontWeight: "700" },
  campMeter: { gap: 6 },
  campMeterHeader: { flexDirection: "row", justifyContent: "space-between" },
  campMeterLabel: { fontSize: 12 },
  campMeterValue: { fontSize: 12, fontWeight: "600" },
  campMeterTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  campMeterFill: { height: 8, borderRadius: 4 },
  campStats: { flexDirection: "row", gap: 8 },
  campStat: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 8, alignItems: "center", gap: 3 },
  campStatVal: { fontSize: 14, fontWeight: "700" },
  campStatLabel: { fontSize: 10 },

  aiStatusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  aiStatusTitle: { fontSize: 15, fontWeight: "700" },
  aiStatusModel: { fontSize: 12 },
  driftAlert: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  driftAlertText: { fontSize: 12, flex: 1 },

  metricRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  metricLabel: { fontSize: 13, flex: 1 },
  metricRight: { minWidth: 60, alignItems: "flex-end" },
  metricValue: { fontSize: 16, fontWeight: "700" },

  riskBadge: { flexDirection: "row", alignItems: "center", gap: 6, width: 100 },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  riskLabel: { fontSize: 13, fontWeight: "600" },
  riskCount: { fontSize: 11 },
  confBar: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#e5e7eb" },
  confBarFill: { height: 8, borderRadius: 4 },
  confPct: { fontSize: 12, fontWeight: "700", width: 36, textAlign: "right" },

  thresholdRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1 },
  thresholdLabel: { fontSize: 13, flex: 1 },
  thresholdValue: { fontSize: 13, fontWeight: "600" },

  exportBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  exportIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  exportTitle: { fontSize: 14, fontWeight: "700" },
  exportSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },

  dhis2Info: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  dhis2InfoText: { fontSize: 12, flex: 1, lineHeight: 18 },
  dhis2Preview: { gap: 0 },
  dhis2Row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1 },
  dhis2Label: { fontSize: 12, flex: 1 },
  dhis2Value: { fontSize: 12, fontWeight: "600" },
  dhis2PushBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  dhis2PushText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  disclaimerText: { fontSize: 12, flex: 1, lineHeight: 18 },
});
