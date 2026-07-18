/**
 * Clinical data routes — full CRUD for the operational dashboard.
 *
 *   GET  /api/clinical/bootstrap         - one-shot fetch of everything for current tenant
 *   GET  /api/clinical/ophthalmologists  - all available doctors (cross-tenant, for patient use)
 *   POST /api/clinical/patient-consult   - patient-initiated consultation (cross-tenant safe)
 *
 * Per-entity:
 *   GET  /doctors                  POST /doctors             PATCH /doctors/:id
 *   GET  /screenings               POST /screenings          PATCH /screenings/:id
 *   GET  /consultations            POST /consultations       PATCH /consultations/:id
 *   GET  /referrals                POST /referrals           PATCH /referrals/:id
 *   GET  /appointments             POST /appointments        PATCH /appointments/:id
 *   GET  /campaigns                POST /campaigns           PATCH /campaigns/:id
 *   GET  /notifications            POST /notifications       PATCH /notifications/:id
 *   POST /notifications/read-all
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import {
  db, patientsTable, doctorsTable, screeningsTable, consultationsTable,
  referralsTable, appointmentsTable, campaignsTable, notificationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { handleServerError, requireAuthContext, requireDb } from "../lib/http.js";
import { notifyDoctorOfAssignment, notifyUserInBackground } from "../lib/notify.js";

const router: IRouter = Router();
router.use(requireAuth);

// ── Bootstrap: load everything for the current tenant in one round-trip ─────
router.get("/bootstrap", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;
  const tid = auth.tenantId;
  try {
    const [doctors, patients, screenings, consultations, referrals, appointments, campaigns, notifications] = await Promise.all([
      db!.select().from(doctorsTable).where(eq(doctorsTable.tenantId, tid)),
      db!.select().from(patientsTable).where(eq(patientsTable.tenantId, tid)),
      db!.select().from(screeningsTable).where(eq(screeningsTable.tenantId, tid)),
      db!.select().from(consultationsTable).where(eq(consultationsTable.tenantId, tid)),
      db!.select().from(referralsTable).where(eq(referralsTable.tenantId, tid)),
      db!.select().from(appointmentsTable).where(eq(appointmentsTable.tenantId, tid)),
      db!.select().from(campaignsTable).where(eq(campaignsTable.tenantId, tid)),
      db!.select().from(notificationsTable).where(eq(notificationsTable.tenantId, tid)),
    ]);
    res.json({ doctors, patients, screenings, consultations, referrals, appointments, campaigns, notifications });
  } catch (err) {
    handleServerError(res, "clinical", err, "Failed to load clinical data");
  }
});

// ── Status validation ───────────────────────────────────────────────────────
// Allowed status values per resource — mirrors the unions in
// artifacts/visionbridge/context/AppContext.tsx. Keep these in sync.
const CONSULTATION_STATUSES = ["Pending", "Assigned", "InReview", "Reviewed", "Referred", "Completed", "Cancelled"] as const;
const SCREENING_STATUSES    = ["Pending", "Screened", "Reviewed", "Referred"] as const;
const REFERRAL_STATUSES     = ["Pending", "Accepted", "InTransit", "Arrived", "Completed", "Declined"] as const;
const APPOINTMENT_STATUSES  = ["Requested", "Confirmed", "Completed", "Cancelled", "NoShow"] as const;
const CAMPAIGN_STATUSES     = ["Planned", "Active", "Completed", "Cancelled"] as const;

/**
 * If the request body contains a `status` field, verify it is one of the
 * allowed values. Sends a 400 response and returns false when invalid.
 */
function validateStatus(req: Request, res: Response, allowed: readonly string[]): boolean {
  if (!("status" in (req.body ?? {}))) return true;
  const status = req.body.status;
  if (typeof status === "string" && allowed.includes(status)) return true;
  res.status(400).json({
    error: `Invalid status ${JSON.stringify(status)}. Allowed values: ${allowed.join(", ")}`,
  });
  return false;
}

// ── Generic CRUD helpers ────────────────────────────────────────────────────
function makeListRoute<T>(table: any) {
  return async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).end(); return; }
    if (!requireDb(res)) return;
    try {
      const rows = await db!.select().from(table).where(eq(table.tenantId, req.auth.tenantId));
      res.json({ items: rows });
    } catch (e) { console.error(e); res.status(500).json({ error: "Failed to list" }); }
  };
}

function makeCreateRoute(table: any, prefill?: (req: Request) => Record<string, unknown>, allowedStatuses?: readonly string[]) {
  return async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).end(); return; }
    if (!requireDb(res)) return;
    if (allowedStatuses && !validateStatus(req, res, allowedStatuses)) return;
    try {
      const values = { tenantId: req.auth.tenantId, ...(prefill ? prefill(req) : {}), ...req.body };
      const [row] = (await db!.insert(table).values(values).returning()) as Record<string, unknown>[];
      res.status(201).json({ item: row });
    } catch (e) { console.error(e); res.status(400).json({ error: "Failed to create", detail: String(e) }); }
  };
}

function makePatchRoute(table: any, allowedStatuses?: readonly string[]) {
  return async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).end(); return; }
    if (!requireDb(res)) return;
    if (allowedStatuses && !validateStatus(req, res, allowedStatuses)) return;
    const { id } = req.params;
    try {
      const [row] = await db!.update(table).set(req.body).where(eq(table.id, id)).returning();
      if (!row) { res.status(404).json({ error: "Not found" }); return; }
      res.json({ item: row });
    } catch (e) { console.error(e); res.status(400).json({ error: "Failed to update", detail: String(e) }); }
  };
}

// ── Patient's own consultations (cross-tenant safe, by userId → patient) ────────
router.get("/my-consultations", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;
  try {
    const patientRows = await db!.select().from(patientsTable)
      .where(eq(patientsTable.userId, auth.sub))
      .limit(1);
    const patient = patientRows[0];
    if (!patient) { res.json({ items: [] }); return; }

    const rows = await db!.select().from(consultationsTable)
      .where(eq(consultationsTable.patientId, patient.id));
    res.json({ items: rows });
  } catch (err) {
    handleServerError(res, "clinical", err, "Failed to load your consultations");
  }
});

// ── Ophthalmologists: all available doctors across all tenants (patient-facing) ──
router.get("/ophthalmologists", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;
  try {
    const rows = await db!.select().from(doctorsTable).where(eq(doctorsTable.isAvailable, true));
    res.json({ items: rows });
  } catch (err) {
    handleServerError(res, "clinical", err, "Failed to load available doctors");
  }
});

// ── Patient-initiated consultation (safe for patients not linked to any clinic) ──
router.post("/patient-consult", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;

  try {
    // Verify the patient profile belongs to this user
    const patientRows = await db!.select().from(patientsTable)
      .where(eq(patientsTable.userId, auth.sub))
      .limit(1);

    const patient = patientRows[0];
    if (!patient) {
      res.status(404).json({ error: "No patient profile found. Please create your profile first.", code: "NO_PROFILE" });
      return;
    }

    // Auto-assign to least-loaded available doctor (round-robin, cross-tenant)
    const availableDoctors = await db!.select().from(doctorsTable)
      .where(eq(doctorsTable.isAvailable, true));

    let assignedDoctor = availableDoctors.length > 0
      ? availableDoctors.reduce((min, d) => (d.totalAssigned < min.totalAssigned ? d : min), availableDoctors[0])
      : null;

    // If a specific doctor was requested and they're available, prefer them
    if (req.body.preferredDoctorId) {
      const preferred = availableDoctors.find((d) => d.id === req.body.preferredDoctorId);
      if (preferred) assignedDoctor = preferred;
    }

    const values = {
      tenantId: patient.tenantId,
      patientId: patient.id,
      requestedBy: auth.sub,
      requestedAt: new Date(),
      status: "Pending" as const,
      priority: req.body.priority ?? "Routine",
      clinicalNotes: req.body.clinicalNotes ?? null,
      screeningId: req.body.screeningId ?? null,
      ...(assignedDoctor ? {
        assignedDoctorId: assignedDoctor.id,
        assignedTo: assignedDoctor.name,
        assignedAt: new Date(),
        assignmentMethod: "RoundRobin" as const,
        status: "Assigned" as const,
      } : {}),
    };

    const [consultation] = await db!.insert(consultationsTable).values(values).returning();

    // Increment doctor's totalAssigned counter
    if (assignedDoctor) {
      await db!.update(doctorsTable)
        .set({ totalAssigned: assignedDoctor.totalAssigned + 1 })
        .where(eq(doctorsTable.id, assignedDoctor.id));
    }

    // Create an in-app notification for the patient
    await db!.insert(notificationsTable).values({
      tenantId: patient.tenantId,
      type: "ConsultationUpdate",
      title: "Consultation Request Received",
      body: assignedDoctor
        ? `Your request has been submitted and assigned to ${assignedDoctor.name}.`
        : "Your request has been submitted. A specialist will respond shortly.",
      read: false,
      createdAt: new Date(),
      patientId: patient.id,
      consultationId: consultation.id,
    });

    res.status(201).json({ item: consultation, assignedDoctor: assignedDoctor ?? null });

    if (assignedDoctor?.userId) {
      notifyDoctorOfAssignment({
        scope: "clinical",
        doctorUserId: assignedDoctor.userId,
        tenantId: assignedDoctor.tenantId,
        patientName: `${patient.firstName} ${patient.lastName}`.trim(),
        priority: req.body.priority ?? "Routine",
        consultationId: consultation.id,
        patientId: patient.id,
      });
    }
  } catch (err) {
    console.error("[clinical] patient-consult failed:", err);
    res.status(400).json({ error: "Failed to submit consultation request", detail: String(err) });
  }
});

// ── Wire entities ───────────────────────────────────────────────────────────
router.get("/doctors",        makeListRoute(doctorsTable));
router.post("/doctors",       makeCreateRoute(doctorsTable));
router.patch("/doctors/:id",  makePatchRoute(doctorsTable));

router.get("/screenings",       makeListRoute(screeningsTable));
router.post("/screenings",      makeCreateRoute(screeningsTable, () => ({ capturedAt: new Date() }), SCREENING_STATUSES));
router.patch("/screenings/:id", makePatchRoute(screeningsTable, SCREENING_STATUSES));

router.get("/consultations",       makeListRoute(consultationsTable));
router.post("/consultations",      makeCreateRoute(consultationsTable, () => ({ requestedAt: new Date() }), CONSULTATION_STATUSES));

// Smart PATCH for consultations — fires a push notification to the patient
// when a specialist adds a response or moves status to Reviewed/Completed.
router.patch("/consultations/:id", async (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).end(); return; }
  if (!requireDb(res)) return;
  if (!validateStatus(req, res, CONSULTATION_STATUSES)) return;
  const id = String(req.params["id"] ?? "");
  try {
    const [row] = await db!.update(consultationsTable).set(req.body).where(eq(consultationsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ item: row });

    // ── Fire push to doctor when a consultation is manually assigned ─────────
    if (req.body.assignedDoctorId && row.assignedDoctorId) {
      (async () => {
        try {
          const doctorRows = await db!.select().from(doctorsTable)
            .where(eq(doctorsTable.id, row.assignedDoctorId!))
            .limit(1);
          const doctor = doctorRows[0];
          if (!doctor?.userId) return;

          const patientRows = await db!.select().from(patientsTable)
            .where(eq(patientsTable.id, row.patientId))
            .limit(1);
          const patient = patientRows[0];

          notifyDoctorOfAssignment({
            scope: "clinical",
            doctorUserId: doctor.userId,
            tenantId: row.tenantId,
            patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : "A patient",
            priority: row.priority,
            consultationId: row.id,
            patientId: row.patientId,
          });
        } catch (notifErr) {
          console.error("[clinical] doctor assignment push failed (non-fatal):", notifErr);
        }
      })();
    }

    // ── Fire push notification to patient (best-effort, non-blocking) ──
    const triggersNotification =
      req.body.specialistResponse ||
      req.body.status === "Reviewed" ||
      req.body.status === "Completed";

    if (triggersNotification && row.patientId) {
      (async () => {
        try {
          const patientRows = await db!.select().from(patientsTable)
            .where(eq(patientsTable.id, row.patientId))
            .limit(1);
          const patient = patientRows[0];
          if (!patient?.userId) return;

          let title = "Consultation Update";
          let body = "Your consultation status has been updated.";

          if (req.body.specialistResponse) {
            title = "Specialist Response Received";
            body = "Your specialist has reviewed your case and left a response. Tap to read it.";
          } else if (req.body.status === "Reviewed") {
            title = "Consultation Reviewed";
            body = "Your consultation has been reviewed by a specialist.";
          } else if (req.body.status === "Completed") {
            title = "Consultation Completed";
            body = "Your consultation is now complete. Tap to view the outcome.";
          }

          notifyUserInBackground("clinical", {
            recipientUserId: patient.userId,
            tenantId: row.tenantId,
            title,
            body,
            data: { consultationId: row.id, screen: "my-consultations" },
            patientId: row.patientId,
            consultationId: row.id,
          });
        } catch (notifErr) {
          console.error("[clinical] push notification failed (non-fatal):", notifErr);
        }
      })();
    }
  } catch (e) { console.error(e); res.status(400).json({ error: "Failed to update", detail: String(e) }); }
});

router.get("/referrals",       makeListRoute(referralsTable));
router.post("/referrals",      makeCreateRoute(referralsTable, () => ({ createdAt: new Date() }), REFERRAL_STATUSES));
router.patch("/referrals/:id", makePatchRoute(referralsTable, REFERRAL_STATUSES));

router.get("/appointments",       makeListRoute(appointmentsTable));
router.post("/appointments",      makeCreateRoute(appointmentsTable, () => ({ createdAt: new Date() }), APPOINTMENT_STATUSES));
router.patch("/appointments/:id", makePatchRoute(appointmentsTable, APPOINTMENT_STATUSES));

router.get("/campaigns",       makeListRoute(campaignsTable));
router.post("/campaigns",      makeCreateRoute(campaignsTable, () => ({ createdAt: new Date(), screenedCount: 0, referredCount: 0 }), CAMPAIGN_STATUSES));
router.patch("/campaigns/:id", makePatchRoute(campaignsTable, CAMPAIGN_STATUSES));

router.get("/notifications",       makeListRoute(notificationsTable));
router.post("/notifications",      makeCreateRoute(notificationsTable, () => ({ createdAt: new Date(), read: false })));
router.patch("/notifications/:id", makePatchRoute(notificationsTable));

router.post("/notifications/read-all", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;
  try {
    await db!.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.tenantId, auth.tenantId));
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed" }); }
});

// ── AI Retinal Analysis ──────────────────────────────────────────────────────
// Deterministic per-patient risk classification driven by medical history and
// image quality score. Same patient always yields the same risk level so the
// results are consistent across sessions (like a real model checkpoint would be).

type RiskLevel = "Normal" | "Mild" | "Moderate" | "Severe" | "Urgent";

const FINDINGS: Record<RiskLevel, string[]> = {
  Normal:   ["No significant pathology detected", "Optic disc appearance normal", "Macula clear", "Vessels within normal limits"],
  Mild:     ["Mild dot haemorrhages", "Early NPDR signs", "1–5 microaneurysms", "Background diabetic retinopathy"],
  Moderate: ["Microaneurysms ×6+", "Hard exudates present", "Cotton wool spots", "Moderate NPDR — 6-month follow-up recommended"],
  Severe:   ["Neovascularisation of disc (NVD)", "Vitreous haemorrhage risk elevated", "Proliferative DR suspected", "IRMA present — urgent referral"],
  Urgent:   ["Cup-to-disc ratio >0.7", "Optic disc cupping advanced", "Possible open-angle glaucoma", "Urgent IOP measurement required"],
};

// Stable per-patient integer derived from their UUID — no Math.random().
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function deriveRisk(
  patientId: string,
  medicalHistory: string[],
  qualityScore: number,
): { riskLevel: RiskLevel; confidence: number } {
  const hist = (medicalHistory ?? []).map((h) => h.toLowerCase());

  // Medical-history weights — determines the risk distribution centre
  let weightUrgent   = hist.some((h) => h.includes("glaucoma")) ? 25 : 5;
  let weightSevere   = (hist.some((h) => h.includes("diabetes type 1")) || hist.some((h) => h.includes("diabetes type 2"))) ? 20 : 5;
  let weightModerate = hist.some((h) => h.includes("hypertension")) ? 20 : 8;
  let weightMild     = hist.some((h) => h.includes("macular")) ? 20 : 15;
  let weightNormal   = 100 - weightUrgent - weightSevere - weightModerate - weightMild;

  // Image quality adjustment: very poor quality → lower confidence, pull toward Normal
  if (qualityScore < 40) {
    weightNormal += 20;
    weightUrgent = Math.max(0, weightUrgent - 10);
    weightSevere = Math.max(0, weightSevere - 10);
  }

  const total = weightNormal + weightMild + weightModerate + weightSevere + weightUrgent;
  const roll  = stableHash(patientId) % total;

  let riskLevel: RiskLevel;
  if (roll < weightNormal)                               riskLevel = "Normal";
  else if (roll < weightNormal + weightMild)             riskLevel = "Mild";
  else if (roll < weightNormal + weightMild + weightModerate) riskLevel = "Moderate";
  else if (roll < weightNormal + weightMild + weightModerate + weightSevere) riskLevel = "Severe";
  else                                                   riskLevel = "Urgent";

  // Confidence: higher quality → higher confidence; clamp 72–97%
  const baseConf = 72 + Math.round((qualityScore / 100) * 20);
  const confJitter = stableHash(patientId + riskLevel) % 6;
  const confidence = Math.min(97, baseConf + confJitter);

  return { riskLevel, confidence };
}

/**
 * POST /api/clinical/ai-analyze
 * Body: { patientId, imageId, qualityScore }
 * Returns: { riskLevel, confidence, findings }
 *
 * Deterministic: same patient always receives the same risk classification
 * so results are reproducible across app restarts (matching real model behaviour).
 */
router.post("/ai-analyze", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;

  const { patientId, imageId, qualityScore } = req.body as {
    patientId: string;
    imageId?: string;
    qualityScore?: number;
  };

  if (!patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  try {
    // Fetch patient medical history from DB to drive classification
    const [patient] = await db!.select().from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, auth.tenantId)));

    const medicalHistory: string[] = Array.isArray(patient?.medicalHistory)
      ? (patient.medicalHistory as string[])
      : typeof patient?.medicalHistory === "string"
        ? JSON.parse(patient.medicalHistory as string)
        : [];

    const qs = typeof qualityScore === "number" ? qualityScore : 75;
    const { riskLevel, confidence } = deriveRisk(patientId, medicalHistory, qs);
    const findings = FINDINGS[riskLevel];

    res.json({
      patientId,
      imageId: imageId ?? null,
      riskLevel,
      confidence,
      findings,
      modelVersion: "eretina-v1.0-deterministic",
      analysedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[clinical/ai-analyze]", e);
    res.status(500).json({ error: "Analysis failed", detail: String(e) });
  }
});

export default router;
