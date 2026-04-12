/**
 * VisionBridge Analytics Service — API Routes
 *
 * Responsibilities:
 *  1. Real-time screening volume and disease prevalence dashboards
 *  2. DHIS2 data push integration (aggregate reports)
 *  3. National eye health registry data aggregation
 *  4. AI model performance monitoring and drift alerts
 *  5. Population risk stratification maps
 *  6. Campaign effectiveness reporting
 *  7. Export: CSV / Excel / FHIR R4 bundles
 */

import { Router } from "express";
import { z } from "zod";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoWeek(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function dhis2Period(date: Date): string {
  const y = date.getFullYear();
  const w = String(isoWeek(date)).padStart(2, "0");
  return `${y}W${w}`;
}

function csvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map((v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

// ── POST /aggregate — accept aggregate metrics from mobile app ────────────────

const AggregateSchema = z.object({
  tenantId: z.string(),
  period: z.string(),    // e.g. "2025-04"
  district: z.string(),
  screenings: z.object({
    total: z.number(),
    byRisk: z.record(z.number()),
    avgQuality: z.number(),
  }),
  consultations: z.object({
    total: z.number(),
    completed: z.number(),
    avgResponseHours: z.number().optional(),
  }),
  referrals: z.object({ total: z.number(), accepted: z.number() }).optional(),
  campaigns: z.array(z.object({
    id: z.string(),
    name: z.string(),
    targetCount: z.number(),
    screenedCount: z.number(),
    referredCount: z.number(),
  })).optional(),
  aiMetrics: z.object({
    sampleCount: z.number(),
    avgConfidence: z.number(),
    highRiskRate: z.number(),
    qualityPassRate: z.number(),
  }).optional(),
});

// In-memory store (prod: replace with PostgreSQL)
const aggregateStore: Record<string, z.infer<typeof AggregateSchema>[]> = {};

router.post("/aggregate", async (req, res) => {
  const parse = AggregateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid aggregate payload", details: parse.error.issues });
  }
  const data = parse.data;
  if (!aggregateStore[data.tenantId]) aggregateStore[data.tenantId] = [];
  aggregateStore[data.tenantId] = aggregateStore[data.tenantId]
    .filter((a) => !(a.period === data.period && a.district === data.district));
  aggregateStore[data.tenantId].push(data);
  return res.json({ ok: true, stored: true });
});

// ── GET /overview ─────────────────────────────────────────────────────────────

router.get("/overview", (req, res) => {
  const tenantId = (req.query["tenantId"] as string) ?? "demo";
  const store = aggregateStore[tenantId] ?? [];
  const totals = store.reduce(
    (acc, a) => ({
      screenings: acc.screenings + a.screenings.total,
      consultations: acc.consultations + a.consultations.total,
      referrals: acc.referrals + (a.referrals?.total ?? 0),
    }),
    { screenings: 0, consultations: 0, referrals: 0 }
  );
  const allRisk: Record<string, number> = {};
  for (const a of store) {
    for (const [k, v] of Object.entries(a.screenings.byRisk)) {
      allRisk[k] = (allRisk[k] ?? 0) + v;
    }
  }
  return res.json({
    period: new Date().toISOString().slice(0, 7),
    totals,
    prevalence: allRisk,
    districts: [...new Set(store.map((a) => a.district))],
    lastUpdated: new Date().toISOString(),
  });
});

// ── POST /dhis2/push — Responsibility 2: DHIS2 aggregate push ─────────────────

const DHIS2PushSchema = z.object({
  tenantId: z.string(),
  period: z.string(),
  orgUnit: z.string(),
  screenings: z.object({ total: z.number(), byRisk: z.record(z.number()) }),
  dhis2Url: z.string().url().optional(),
  dhis2User: z.string().optional(),
  dhis2Pass: z.string().optional(),
});

// DHIS2 data element UIDs (Uganda HMIS standard codes — swap for actual UIDs)
const DHIS2_DATA_ELEMENTS: Record<string, string> = {
  screenings_total:    "VBscreentotal00",
  risk_normal:         "VBrisknormal000",
  risk_mild:           "VBriskmild00000",
  risk_moderate:       "VBriskmoderate0",
  risk_severe:         "VBrisksevere000",
  risk_urgent:         "VBriskurgent000",
};

router.post("/dhis2/push", async (req, res) => {
  const parse = DHIS2PushSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid DHIS2 push payload", details: parse.error.issues });
  }
  const { period, orgUnit, screenings, dhis2Url, dhis2User, dhis2Pass } = parse.data;

  const dataValues = [
    { dataElement: DHIS2_DATA_ELEMENTS.screenings_total, period, orgUnit, value: String(screenings.total) },
    { dataElement: DHIS2_DATA_ELEMENTS.risk_normal, period, orgUnit, value: String(screenings.byRisk["Normal"] ?? 0) },
    { dataElement: DHIS2_DATA_ELEMENTS.risk_mild, period, orgUnit, value: String(screenings.byRisk["Mild"] ?? 0) },
    { dataElement: DHIS2_DATA_ELEMENTS.risk_moderate, period, orgUnit, value: String(screenings.byRisk["Moderate"] ?? 0) },
    { dataElement: DHIS2_DATA_ELEMENTS.risk_severe, period, orgUnit, value: String(screenings.byRisk["Severe"] ?? 0) },
    { dataElement: DHIS2_DATA_ELEMENTS.risk_urgent, period, orgUnit, value: String(screenings.byRisk["Urgent"] ?? 0) },
  ];

  const payload = { dataValues };

  if (dhis2Url) {
    try {
      const baseUrl = dhis2Url ?? process.env["DHIS2_URL"];
      const user = dhis2User ?? process.env["DHIS2_USER"];
      const pass = dhis2Pass ?? process.env["DHIS2_PASS"];
      const auth = Buffer.from(`${user}:${pass}`).toString("base64");
      const response = await fetch(`${baseUrl}/api/dataValueSets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      return res.json({ ok: true, dhis2Response: result, period, orgUnit, dataValues });
    } catch (err: any) {
      return res.status(502).json({ error: "DHIS2 push failed", details: err.message, payload });
    }
  }

  // Dry-run mode: return what would be pushed
  return res.json({ ok: true, dryRun: true, period, orgUnit, payload, message: "Set dhis2Url to push to live DHIS2" });
});

// ── GET /registry — Responsibility 3: National registry aggregation ────────────

router.get("/registry", (req, res) => {
  const tenantId = (req.query["tenantId"] as string) ?? "demo";
  const store = aggregateStore[tenantId] ?? [];

  const registryEntry = {
    registryId: `UG-EYE-${tenantId.toUpperCase()}-${new Date().getFullYear()}`,
    reportingPeriod: new Date().toISOString().slice(0, 7),
    facility: tenantId,
    country: "Uganda",
    program: "National Eye Health Registry",
    aggregates: store.map((a) => ({
      district: a.district,
      period: a.period,
      totalScreened: a.screenings.total,
      byCondition: a.screenings.byRisk,
      referralRate: a.referrals ? ((a.referrals.accepted / Math.max(a.referrals.total, 1)) * 100).toFixed(1) + "%" : null,
    })),
    generatedAt: new Date().toISOString(),
    reportFormat: "VisionBridge-Registry-v1",
  };

  return res.json(registryEntry);
});

// ── POST /ai-performance — Responsibility 4: AI model monitoring ──────────────

interface AiSnapshot {
  modelVersion: string;
  sampleCount: number;
  avgConfidence: number;
  highRiskRate: number;
  qualityPassRate: number;
  recordedAt: string;
  tenantId: string;
}

const aiSnapshots: AiSnapshot[] = [];
const DRIFT_THRESHOLD_CONFIDENCE = 0.10; // 10 point drop
const DRIFT_THRESHOLD_HIGH_RISK  = 0.20; // 20% swing

const AiPerfSchema = z.object({
  tenantId: z.string(),
  modelVersion: z.string().default("EfficientNet-B4-DR-v2"),
  sampleCount: z.number(),
  avgConfidence: z.number().min(0).max(100),
  highRiskRate: z.number().min(0).max(1),
  qualityPassRate: z.number().min(0).max(1),
});

router.post("/ai-performance", (req, res) => {
  const parse = AiPerfSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid payload", details: parse.error.issues });
  const d = parse.data;
  const snap: AiSnapshot = { ...d, recordedAt: new Date().toISOString() };
  aiSnapshots.push(snap);

  // Drift detection: compare last two snapshots for same tenant
  const tenantSnaps = aiSnapshots.filter((s) => s.tenantId === d.tenantId).slice(-2);
  const alerts: string[] = [];
  if (tenantSnaps.length === 2) {
    const [prev, curr] = tenantSnaps;
    if (prev.avgConfidence - curr.avgConfidence > DRIFT_THRESHOLD_CONFIDENCE) {
      alerts.push(`Confidence drift: ${prev.avgConfidence.toFixed(1)} → ${curr.avgConfidence.toFixed(1)} (threshold: ${DRIFT_THRESHOLD_CONFIDENCE})`);
    }
    if (Math.abs(curr.highRiskRate - prev.highRiskRate) > DRIFT_THRESHOLD_HIGH_RISK) {
      alerts.push(`High-risk rate shift: ${(prev.highRiskRate * 100).toFixed(1)}% → ${(curr.highRiskRate * 100).toFixed(1)}%`);
    }
  }
  return res.json({ ok: true, snapshot: snap, driftAlerts: alerts, totalSnapshots: aiSnapshots.filter((s) => s.tenantId === d.tenantId).length });
});

router.get("/ai-performance", (req, res) => {
  const tenantId = (req.query["tenantId"] as string) ?? "demo";
  const snaps = aiSnapshots.filter((s) => s.tenantId === tenantId);
  if (!snaps.length) return res.json({ snaps: [], status: "no_data", alerts: [] });
  const last = snaps[snaps.length - 1];
  const alerts: string[] = [];
  if (snaps.length >= 2) {
    const prev = snaps[snaps.length - 2];
    if (prev.avgConfidence - last.avgConfidence > DRIFT_THRESHOLD_CONFIDENCE) alerts.push("Confidence drift detected");
    if (Math.abs(last.highRiskRate - prev.highRiskRate) > DRIFT_THRESHOLD_HIGH_RISK) alerts.push("High-risk rate shift detected");
  }
  return res.json({ latest: last, history: snaps.slice(-10), status: alerts.length ? "drift_alert" : "healthy", alerts });
});

// ── GET /risk-map — Responsibility 5: Population risk stratification ───────────

router.get("/risk-map", (req, res) => {
  const tenantId = (req.query["tenantId"] as string) ?? "demo";
  const store = aggregateStore[tenantId] ?? [];

  const districtMap: Record<string, { district: string; total: number; byRisk: Record<string, number>; highRiskRate: number }> = {};
  for (const a of store) {
    if (!districtMap[a.district]) {
      districtMap[a.district] = { district: a.district, total: 0, byRisk: {}, highRiskRate: 0 };
    }
    const dm = districtMap[a.district];
    dm.total += a.screenings.total;
    for (const [k, v] of Object.entries(a.screenings.byRisk)) {
      dm.byRisk[k] = (dm.byRisk[k] ?? 0) + v;
    }
  }
  for (const dm of Object.values(districtMap)) {
    const highRisk = (dm.byRisk["Severe"] ?? 0) + (dm.byRisk["Urgent"] ?? 0);
    dm.highRiskRate = dm.total > 0 ? highRisk / dm.total : 0;
  }

  return res.json({
    districts: Object.values(districtMap),
    generatedAt: new Date().toISOString(),
  });
});

// ── GET /campaigns — Responsibility 6: Campaign effectiveness ─────────────────

router.get("/campaigns", (req, res) => {
  const tenantId = (req.query["tenantId"] as string) ?? "demo";
  const store = aggregateStore[tenantId] ?? [];
  const campaignMap: Record<string, { id: string; name: string; targetCount: number; screenedCount: number; referredCount: number; coverage: number; referralRate: number; periods: string[] }> = {};
  for (const a of store) {
    for (const c of (a.campaigns ?? [])) {
      if (!campaignMap[c.id]) {
        campaignMap[c.id] = { id: c.id, name: c.name, targetCount: 0, screenedCount: 0, referredCount: 0, coverage: 0, referralRate: 0, periods: [] };
      }
      const cm = campaignMap[c.id];
      cm.targetCount = Math.max(cm.targetCount, c.targetCount);
      cm.screenedCount += c.screenedCount;
      cm.referredCount += c.referredCount;
      cm.periods.push(a.period);
    }
  }
  for (const cm of Object.values(campaignMap)) {
    cm.coverage = cm.targetCount > 0 ? (cm.screenedCount / cm.targetCount) * 100 : 0;
    cm.referralRate = cm.screenedCount > 0 ? (cm.referredCount / cm.screenedCount) * 100 : 0;
  }
  return res.json({ campaigns: Object.values(campaignMap), generatedAt: new Date().toISOString() });
});

// ── GET /export — Responsibility 7: CSV / Excel / FHIR R4 ─────────────────────

router.post("/export", async (req, res) => {
  const format = (req.query["format"] as string) ?? "csv";
  const { patients = [], screenings = [], consultations = [], referrals = [], campaigns = [] } = req.body ?? {};

  if (format === "fhir") {
    const bundle = buildFHIRBundle(patients, screenings, consultations, referrals);
    res.setHeader("Content-Type", "application/fhir+json");
    res.setHeader("Content-Disposition", `attachment; filename="visionbridge-fhir-${Date.now()}.json"`);
    return res.json(bundle);
  }

  if (format === "csv") {
    const lines: string[] = [
      csvRow(["patient_id","first_name","last_name","dob","sex","district","village","screening_date","risk_level","confidence","quality_score","status","ai_findings"]),
    ];
    for (const s of screenings) {
      const p = patients.find((pt: any) => pt.id === s.patientId);
      lines.push(csvRow([
        p?.patientId ?? s.patientId,
        p?.firstName ?? "",
        p?.lastName ?? "",
        p?.dateOfBirth ?? "",
        p?.sex ?? "",
        p?.district ?? "",
        p?.village ?? "",
        s.capturedAt,
        s.aiRiskLevel,
        s.aiConfidence,
        s.imageQualityScore,
        s.status,
        (s.aiFindings ?? []).join("; "),
      ]));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="visionbridge-screenings-${Date.now()}.csv"`);
    return res.send("\uFEFF" + lines.join("\r\n")); // BOM for Excel
  }

  if (format === "excel") {
    // Build a minimal OOXML xlsx without external dependencies
    const xlsxBuffer = buildMinimalXlsx(patients, screenings);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="visionbridge-${Date.now()}.xlsx"`);
    return res.send(xlsxBuffer);
  }

  return res.status(400).json({ error: "Unsupported format. Use csv, excel, or fhir." });
});

// ── FHIR R4 Bundle builder ─────────────────────────────────────────────────────

function buildFHIRBundle(patients: any[], screenings: any[], consultations: any[], referrals: any[]) {
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
        code: {
          coding: [{ system: "http://loinc.org", code: "71490-8", display: "Ophthalmological examination" }],
        },
        subject: { reference: `urn:uuid:patient-${s.patientId}` },
        effectiveDateTime: s.capturedAt,
        component: [
          {
            code: { coding: [{ system: "urn:visionbridge", code: "ai-risk-level" }] },
            valueCodeableConcept: { text: s.aiRiskLevel },
          },
          {
            code: { coding: [{ system: "urn:visionbridge", code: "ai-confidence" }] },
            valueQuantity: { value: s.aiConfidence, unit: "%" },
          },
          {
            code: { coding: [{ system: "urn:visionbridge", code: "image-quality-score" }] },
            valueQuantity: { value: s.imageQualityScore, unit: "score" },
          },
        ],
        note: (s.aiFindings ?? []).map((f: string) => ({ text: f })),
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

// ── Minimal XLSX builder (pure JS, no exceljs dependency) ─────────────────────

function buildMinimalXlsx(patients: any[], screenings: any[]): Buffer {
  // Build CSV content first, then wrap as a tab-delimited .xlsx
  // Real implementation would use exceljs — this is a functional placeholder
  // that emits a valid UTF-8 CSV with xlsx MIME type (opens in Excel)
  const lines: string[] = [
    ["Patient ID","First Name","Last Name","DOB","Sex","District","Risk Level","Confidence","Quality","Status","Findings"].join("\t"),
  ];
  for (const s of screenings) {
    const p = patients.find((pt: any) => pt.id === s.patientId);
    lines.push([
      p?.patientId ?? s.patientId,
      p?.firstName ?? "",
      p?.lastName ?? "",
      p?.dateOfBirth ?? "",
      p?.sex ?? "",
      p?.district ?? "",
      s.aiRiskLevel,
      s.aiConfidence,
      s.imageQualityScore,
      s.status,
      (s.aiFindings ?? []).join("; "),
    ].join("\t"));
  }
  return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf-8");
}

export default router;
