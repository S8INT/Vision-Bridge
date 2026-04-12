/**
 * VisionBridge Analytics Service — Client Layer
 *
 * All 7 responsibilities implemented client-side from AppContext data:
 *  1. Real-time screening volume & disease prevalence
 *  2. DHIS2 data push (via API server proxy)
 *  3. National eye health registry aggregation
 *  4. AI model performance monitoring + drift alerts
 *  5. Population risk stratification maps
 *  6. Campaign effectiveness reporting
 *  7. Export: CSV (client-side), FHIR R4, Excel (via API)
 */

import { Platform, Share } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Patient, Screening, Consultation, Referral, Campaign,
  RiskLevel,
} from "@/context/AppContext";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api-server/api`);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PrevalenceData {
  riskLevel: RiskLevel;
  count: number;
  pct: number;
  color: string;
}

export interface VolumePoint {
  label: string;
  date: string;
  count: number;
  highRisk: number;
}

export interface DistrictRiskRow {
  district: string;
  total: number;
  normal: number;
  mild: number;
  moderate: number;
  severe: number;
  urgent: number;
  highRiskRate: number;
  avgQuality: number;
}

export interface CampaignEffectiveness {
  id: string;
  name: string;
  type: string;
  targetCount: number;
  screenedCount: number;
  referredCount: number;
  coverage: number;
  referralRate: number;
  normalPct: number;
  highRiskPct: number;
  status: string;
}

export interface AiPerformanceReport {
  modelVersion: string;
  sampleCount: number;
  avgConfidence: number;
  highRiskRate: number;
  qualityPassRate: number;
  riskDistribution: Record<RiskLevel, number>;
  driftAlerts: string[];
  status: "healthy" | "warning" | "alert";
  breakdown: {
    riskLevel: RiskLevel;
    count: number;
    avgConfidence: number;
  }[];
}

export interface RegistryReport {
  registryId: string;
  reportingPeriod: string;
  facility: string;
  totalPatients: number;
  totalScreenings: number;
  totalReferrals: number;
  byDistrict: DistrictRiskRow[];
  prevalence: PrevalenceData[];
  generatedAt: string;
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  Normal: "#22c55e",
  Mild: "#06b6d4",
  Moderate: "#f59e0b",
  Severe: "#ef4444",
  Urgent: "#dc2626",
};

// ── Responsibility 1: Screening volume & disease prevalence ───────────────────

export function computePrevalence(screenings: Screening[]): PrevalenceData[] {
  const counts: Record<RiskLevel, number> = { Normal: 0, Mild: 0, Moderate: 0, Severe: 0, Urgent: 0 };
  for (const s of screenings) counts[s.aiRiskLevel]++;
  const total = screenings.length || 1;
  return (Object.entries(counts) as [RiskLevel, number][]).map(([riskLevel, count]) => ({
    riskLevel,
    count,
    pct: Math.round((count / total) * 100),
    color: RISK_COLORS[riskLevel],
  }));
}

export function computeScreeningVolume(screenings: Screening[], days: number = 14): VolumePoint[] {
  const points: VolumePoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayScreenings = screenings.filter((s) => s.capturedAt.startsWith(dateStr));
    points.push({
      label: d.toLocaleDateString("en-UG", { month: "short", day: "numeric" }),
      date: dateStr,
      count: dayScreenings.length,
      highRisk: dayScreenings.filter((s) => s.aiRiskLevel === "Severe" || s.aiRiskLevel === "Urgent").length,
    });
  }
  return points;
}

export function computeKPIs(
  patients: Patient[],
  screenings: Screening[],
  consultations: Consultation[],
  referrals: Referral[]
) {
  const today = new Date().toISOString().slice(0, 10);
  const todayScreenings = screenings.filter((s) => s.capturedAt.startsWith(today));
  const highRisk = screenings.filter((s) => s.aiRiskLevel === "Severe" || s.aiRiskLevel === "Urgent");
  const pendingReview = screenings.filter((s) => s.status === "Pending" || s.status === "Screened");
  const avgQuality = screenings.length
    ? Math.round(screenings.reduce((a, s) => a + s.imageQualityScore, 0) / screenings.length)
    : 0;
  const completedConsults = consultations.filter((c) => c.status === "Completed" || c.status === "Reviewed");
  const acceptedReferrals = referrals.filter((r) => r.status === "Accepted" || r.status === "Completed");
  const screeningTrend7 = screenings.filter((s) => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return new Date(s.capturedAt) >= d;
  }).length;

  return {
    totalPatients: patients.length,
    totalScreenings: screenings.length,
    todayScreenings: todayScreenings.length,
    highRiskCount: highRisk.length,
    highRiskRate: screenings.length > 0 ? (highRisk.length / screenings.length) * 100 : 0,
    pendingReview: pendingReview.length,
    avgImageQuality: avgQuality,
    consultationCompletionRate: consultations.length > 0 ? (completedConsults.length / consultations.length) * 100 : 0,
    referralAcceptanceRate: referrals.length > 0 ? (acceptedReferrals.length / referrals.length) * 100 : 0,
    screeningTrend7d: screeningTrend7,
  };
}

// ── Responsibility 5: Population risk stratification ──────────────────────────

export function computeRiskStratification(patients: Patient[], screenings: Screening[]): DistrictRiskRow[] {
  const districts: Record<string, { screenings: Screening[]; qualitySum: number }> = {};

  for (const s of screenings) {
    const p = patients.find((pt) => pt.id === s.patientId);
    const district = p?.district ?? "Unknown";
    if (!districts[district]) districts[district] = { screenings: [], qualitySum: 0 };
    districts[district].screenings.push(s);
    districts[district].qualitySum += s.imageQualityScore;
  }

  return Object.entries(districts)
    .map(([district, { screenings: ds, qualitySum }]) => {
      const counts = { Normal: 0, Mild: 0, Moderate: 0, Severe: 0, Urgent: 0 };
      for (const s of ds) counts[s.aiRiskLevel]++;
      const highRisk = counts.Severe + counts.Urgent;
      return {
        district,
        total: ds.length,
        normal: counts.Normal,
        mild: counts.Mild,
        moderate: counts.Moderate,
        severe: counts.Severe,
        urgent: counts.Urgent,
        highRiskRate: ds.length > 0 ? (highRisk / ds.length) * 100 : 0,
        avgQuality: ds.length > 0 ? Math.round(qualitySum / ds.length) : 0,
      };
    })
    .sort((a, b) => b.highRiskRate - a.highRiskRate);
}

// ── Responsibility 6: Campaign effectiveness ──────────────────────────────────

export function computeCampaignEffectiveness(
  campaigns: Campaign[],
  screenings: Screening[]
): CampaignEffectiveness[] {
  return campaigns.map((c) => {
    const campScreenings = screenings.filter((s) => s.campaignId === c.id);
    const highRisk = campScreenings.filter((s) => s.aiRiskLevel === "Severe" || s.aiRiskLevel === "Urgent");
    const normal = campScreenings.filter((s) => s.aiRiskLevel === "Normal");
    const coverage = c.targetCount > 0 ? (c.screenedCount / c.targetCount) * 100 : 0;
    const referralRate = c.screenedCount > 0 ? (c.referredCount / c.screenedCount) * 100 : 0;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      targetCount: c.targetCount,
      screenedCount: c.screenedCount,
      referredCount: c.referredCount,
      coverage,
      referralRate,
      normalPct: campScreenings.length > 0 ? (normal.length / campScreenings.length) * 100 : 0,
      highRiskPct: campScreenings.length > 0 ? (highRisk.length / campScreenings.length) * 100 : 0,
      status: c.status,
    };
  });
}

// ── Responsibility 4: AI model performance ────────────────────────────────────

export function computeAiPerformance(screenings: Screening[]): AiPerformanceReport {
  const riskDist: Record<RiskLevel, number> = { Normal: 0, Mild: 0, Moderate: 0, Severe: 0, Urgent: 0 };
  let confSum = 0, qualityPassCount = 0;

  for (const s of screenings) {
    riskDist[s.aiRiskLevel]++;
    confSum += s.aiConfidence;
    if (s.imageQualityScore >= 60) qualityPassCount++;
  }

  const total = screenings.length || 1;
  const avgConf = confSum / total;
  const highRiskRate = (riskDist.Severe + riskDist.Urgent) / total;
  const qualityPassRate = qualityPassCount / total;

  const driftAlerts: string[] = [];
  if (avgConf < 75) driftAlerts.push("Average confidence below threshold (75%)");
  if (highRiskRate > 0.5) driftAlerts.push("High-risk rate unusually elevated (>50%)");
  if (qualityPassRate < 0.6) driftAlerts.push("Image quality pass rate below 60% — check equipment");

  const breakdown = (Object.entries(riskDist) as [RiskLevel, number][]).map(([riskLevel, count]) => {
    const rs = screenings.filter((s) => s.aiRiskLevel === riskLevel);
    const avgC = rs.length > 0 ? rs.reduce((a, s) => a + s.aiConfidence, 0) / rs.length : 0;
    return { riskLevel, count, avgConfidence: Math.round(avgC) };
  });

  return {
    modelVersion: "EfficientNet-B4-DR-v2.1",
    sampleCount: total,
    avgConfidence: Math.round(avgConf),
    highRiskRate,
    qualityPassRate,
    riskDistribution: riskDist,
    driftAlerts,
    status: driftAlerts.length >= 2 ? "alert" : driftAlerts.length === 1 ? "warning" : "healthy",
    breakdown,
  };
}

// ── Responsibility 3: National registry aggregation ───────────────────────────

export function buildRegistryReport(
  patients: Patient[],
  screenings: Screening[],
  referrals: Referral[],
  facility: string,
  district: string
): RegistryReport {
  return {
    registryId: `UG-EYE-${district.toUpperCase().replace(/\s+/g, "-")}-${new Date().getFullYear()}`,
    reportingPeriod: new Date().toISOString().slice(0, 7),
    facility,
    totalPatients: patients.length,
    totalScreenings: screenings.length,
    totalReferrals: referrals.length,
    byDistrict: computeRiskStratification(patients, screenings),
    prevalence: computePrevalence(screenings),
    generatedAt: new Date().toISOString(),
  };
}

// ── Responsibility 7: Export ──────────────────────────────────────────────────

export function exportToCsv(patients: Patient[], screenings: Screening[]): string {
  const rows = [
    ["Patient ID", "First Name", "Last Name", "DOB", "Sex", "District", "Village",
     "Screening Date", "Risk Level", "AI Confidence", "Quality Score", "Status", "Findings"].join(","),
  ];
  for (const s of screenings) {
    const p = patients.find((pt) => pt.id === s.patientId);
    const row = [
      p?.patientId ?? s.patientId,
      p?.firstName ?? "",
      p?.lastName ?? "",
      p?.dateOfBirth ?? "",
      p?.sex ?? "",
      p?.district ?? "",
      p?.village ?? "",
      s.capturedAt.slice(0, 10),
      s.aiRiskLevel,
      `${s.aiConfidence}%`,
      s.imageQualityScore,
      s.status,
      `"${(s.aiFindings ?? []).join("; ")}"`,
    ].join(",");
    rows.push(row);
  }
  return "\uFEFF" + rows.join("\n");
}

export function buildFhirBundle(
  patients: Patient[],
  screenings: Screening[],
  consultations: Consultation[],
  referrals: Referral[]
): object {
  const entries: any[] = [];
  for (const p of patients) {
    entries.push({
      fullUrl: `urn:uuid:patient-${p.id}`,
      resource: {
        resourceType: "Patient",
        id: p.id,
        identifier: [{ system: "urn:visionbridge:patient-id", value: p.patientId }],
        name: [{ family: p.lastName, given: [p.firstName] }],
        gender: p.sex === "M" ? "male" : p.sex === "F" ? "female" : "other",
        birthDate: p.dateOfBirth,
        address: [{ district: p.district, text: `${p.village}, ${p.district}, Uganda` }],
        telecom: p.phone ? [{ system: "phone", value: p.phone }] : undefined,
        extension: p.medicalHistory?.map((h) => ({
          url: "urn:visionbridge:medical-history",
          valueString: h,
        })),
      },
    });
  }
  for (const s of screenings) {
    entries.push({
      fullUrl: `urn:uuid:observation-${s.id}`,
      resource: {
        resourceType: "Observation",
        id: s.id,
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "71490-8", display: "Ophthalmological examination" }] },
        subject: { reference: `urn:uuid:patient-${s.patientId}` },
        effectiveDateTime: s.capturedAt,
        component: [
          { code: { coding: [{ system: "urn:visionbridge", code: "ai-risk-level" }] }, valueCodeableConcept: { text: s.aiRiskLevel } },
          { code: { coding: [{ system: "urn:visionbridge", code: "ai-confidence" }] }, valueQuantity: { value: s.aiConfidence, unit: "%" } },
          { code: { coding: [{ system: "urn:visionbridge", code: "image-quality" }] }, valueQuantity: { value: s.imageQualityScore, unit: "score" } },
        ],
        note: (s.aiFindings ?? []).map((f) => ({ text: f })),
      },
    });
  }
  for (const r of referrals) {
    entries.push({
      fullUrl: `urn:uuid:servicerequest-${r.id}`,
      resource: {
        resourceType: "ServiceRequest",
        id: r.id,
        status: r.status === "Completed" ? "completed" : r.status === "Declined" ? "revoked" : "active",
        intent: "referral",
        priority: r.urgency === "Emergency" ? "stat" : r.urgency === "Urgent" ? "urgent" : "routine",
        subject: { reference: `urn:uuid:patient-${r.patientId}` },
        occurrenceDateTime: r.createdAt,
        note: [{ text: r.reason }, { text: r.clinicalSummary }],
      },
    });
  }
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    meta: { tag: [{ system: "urn:visionbridge", code: "analytics-export" }] },
    total: entries.length,
    entry: entries,
  };
}

export async function shareExport(filename: string, content: string, mimeType: string) {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: content, title: filename });
}

// ── Responsibility 2: DHIS2 push ──────────────────────────────────────────────

export async function pushToDHIS2(
  screenings: Screening[],
  period: string,
  orgUnit: string,
  tenantId: string
): Promise<{ ok: boolean; dryRun: boolean; message?: string; error?: string }> {
  const byRisk: Record<string, number> = { Normal: 0, Mild: 0, Moderate: 0, Severe: 0, Urgent: 0 };
  for (const s of screenings) byRisk[s.aiRiskLevel]++;

  try {
    const resp = await fetch(`${API_BASE}/analytics/dhis2/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        period,
        orgUnit,
        screenings: { total: screenings.length, byRisk },
      }),
    });
    return resp.json();
  } catch (err: any) {
    return { ok: false, dryRun: false, error: err.message };
  }
}

// ── Push aggregate to API server ──────────────────────────────────────────────

export async function pushAggregate(
  tenantId: string,
  district: string,
  patients: Patient[],
  screenings: Screening[],
  consultations: Consultation[],
  referrals: Referral[],
  campaigns: Campaign[]
): Promise<boolean> {
  const byRisk: Record<string, number> = { Normal: 0, Mild: 0, Moderate: 0, Severe: 0, Urgent: 0 };
  for (const s of screenings) byRisk[s.aiRiskLevel]++;
  const avgQ = screenings.length ? screenings.reduce((a, s) => a + s.imageQualityScore, 0) / screenings.length : 0;
  const completed = consultations.filter((c) => c.status === "Completed");
  const accepted = referrals.filter((r) => r.status === "Accepted");
  const highRisk = screenings.filter((s) => s.aiRiskLevel === "Severe" || s.aiRiskLevel === "Urgent");

  const payload = {
    tenantId,
    period: new Date().toISOString().slice(0, 7),
    district,
    screenings: { total: screenings.length, byRisk, avgQuality: Math.round(avgQ) },
    consultations: { total: consultations.length, completed: completed.length },
    referrals: { total: referrals.length, accepted: accepted.length },
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, targetCount: c.targetCount, screenedCount: c.screenedCount, referredCount: c.referredCount })),
    aiMetrics: {
      sampleCount: screenings.length,
      avgConfidence: screenings.length ? Math.round(screenings.reduce((a, s) => a + s.aiConfidence, 0) / screenings.length) : 0,
      highRiskRate: screenings.length ? highRisk.length / screenings.length : 0,
      qualityPassRate: screenings.length ? screenings.filter((s) => s.imageQualityScore >= 60).length / screenings.length : 0,
    },
  };

  try {
    await fetch(`${API_BASE}/analytics/aggregate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

// Cache last analytics computation for performance
const ANALYTICS_CACHE_KEY = "visionbridge_analytics_cache_v1";
export async function getCachedAnalytics(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < 5 * 60 * 1000) return data; // 5 min TTL
    return null;
  } catch { return null; }
}
export async function setCachedAnalytics(data: any): Promise<void> {
  await AsyncStorage.setItem(ANALYTICS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
}
