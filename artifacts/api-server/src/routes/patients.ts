/**
 * Patient profile routes.
 *
 * Self-service for Patient-role users:
 *   GET    /api/patients/me        - fetch own profile
 *   POST   /api/patients/me        - create own profile (first time)
 *   PUT    /api/patients/me        - update own profile
 *
 * Clinician access (Doctor/Technician/CHW/Admin):
 *   GET    /api/patients           - list patients in tenant (basic)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, patientsTable, type Patient } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAuditEvent } from "../lib/authStore.js";

const router: IRouter = Router();

// All patient routes require auth
router.use(requireAuth);

const profileSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dateOfBirth: z.string().optional().nullable(),
  sex: z.enum(["M", "F", "Other"]).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  village: z.string().max(120).optional().nullable(),
  district: z.string().max(120).optional().nullable(),
  medicalHistory: z.array(z.string().max(120)).max(40).optional(),
});

const updateSchema = profileSchema.partial();

function dbAvailable(): boolean {
  return Boolean(db);
}

function generateMrn(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VB-${stamp}-${rand}`;
}

async function findMyPatient(userId: string): Promise<Patient | null> {
  if (!db) return null;
  const rows = await db.select().from(patientsTable).where(eq(patientsTable.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// ── GET /me ─────────────────────────────────────────────────────────────────
router.get("/me", async (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).json({ error: "Unauthenticated" }); return; }
  if (!dbAvailable()) { res.status(503).json({ error: "Database unavailable" }); return; }

  try {
    const patient = await findMyPatient(req.auth.sub);
    if (!patient) { res.status(404).json({ error: "No patient profile yet", code: "NO_PROFILE" }); return; }
    res.json({ patient });
  } catch (err) {
    console.error("[patients] GET /me failed:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// ── POST /me  (create) ──────────────────────────────────────────────────────
router.post("/me", async (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).json({ error: "Unauthenticated" }); return; }
  if (req.auth.role !== "Patient") {
    res.status(403).json({ error: "Only Patient users can create their own profile" });
    return;
  }
  if (!dbAvailable()) { res.status(503).json({ error: "Database unavailable" }); return; }

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile data", details: parsed.error.issues });
    return;
  }

  try {
    const existing = await findMyPatient(req.auth.sub);
    if (existing) {
      res.status(409).json({ error: "Profile already exists", patient: existing });
      return;
    }

    const [created] = await db!
      .insert(patientsTable)
      .values({
        tenantId: req.auth.tenantId,
        userId: req.auth.sub,
        patientId: generateMrn(),
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        dateOfBirth: parsed.data.dateOfBirth ?? null,
        sex: parsed.data.sex ?? null,
        phone: parsed.data.phone ?? null,
        village: parsed.data.village ?? null,
        district: parsed.data.district ?? null,
        medicalHistory: parsed.data.medicalHistory ?? [],
      })
      .returning();

    recordAuditEvent({
      userId: req.auth.sub,
      tenantId: req.auth.tenantId,
      event: "patient.profile.created",
      outcome: "success",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      deviceId: null,
      metadata: { patientId: created.patientId },
      dppaCategory: "patient_self_registration",
    });

    res.status(201).json({ patient: created });
  } catch (err) {
    console.error("[patients] POST /me failed:", err);
    res.status(500).json({ error: "Failed to create profile" });
  }
});

// ── PUT /me  (update) ───────────────────────────────────────────────────────
router.put("/me", async (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).json({ error: "Unauthenticated" }); return; }
  if (!dbAvailable()) { res.status(503).json({ error: "Database unavailable" }); return; }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile data", details: parsed.error.issues });
    return;
  }

  try {
    const existing = await findMyPatient(req.auth.sub);
    if (!existing) { res.status(404).json({ error: "No patient profile to update", code: "NO_PROFILE" }); return; }

    const [updated] = await db!
      .update(patientsTable)
      .set({
        ...(parsed.data.firstName !== undefined ? { firstName: parsed.data.firstName } : {}),
        ...(parsed.data.lastName !== undefined ? { lastName: parsed.data.lastName } : {}),
        ...(parsed.data.dateOfBirth !== undefined ? { dateOfBirth: parsed.data.dateOfBirth } : {}),
        ...(parsed.data.sex !== undefined ? { sex: parsed.data.sex } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.village !== undefined ? { village: parsed.data.village } : {}),
        ...(parsed.data.district !== undefined ? { district: parsed.data.district } : {}),
        ...(parsed.data.medicalHistory !== undefined ? { medicalHistory: parsed.data.medicalHistory } : {}),
        updatedAt: new Date(),
      })
      .where(eq(patientsTable.id, existing.id))
      .returning();

    recordAuditEvent({
      userId: req.auth.sub,
      tenantId: req.auth.tenantId,
      event: "patient.profile.updated",
      outcome: "success",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      deviceId: null,
      metadata: { patientId: updated.patientId, fields: Object.keys(parsed.data) },
      dppaCategory: "patient_self_update",
    });

    res.json({ patient: updated });
  } catch (err) {
    console.error("[patients] PUT /me failed:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── GET / (clinician list) ──────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).json({ error: "Unauthenticated" }); return; }
  if (req.auth.role === "Patient") { res.status(403).json({ error: "Forbidden" }); return; }
  if (!dbAvailable()) { res.status(503).json({ error: "Database unavailable" }); return; }

  try {
    const rows = await db!.select().from(patientsTable).where(eq(patientsTable.tenantId, req.auth.tenantId));
    res.json({ patients: rows });
  } catch (err) {
    console.error("[patients] GET / failed:", err);
    res.status(500).json({ error: "Failed to list patients" });
  }
});

export default router;
