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
import { findUserById, waitForUserPersistence } from "../lib/authStore.js";
import { audit } from "../lib/audit.js";
import {
  allowRoles,
  forbidRoles,
  handleServerError,
  parseBody,
  requireAuthContext,
  requireDb,
} from "../lib/http.js";

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

function generateMrn(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VB-${stamp}-${rand}`;
}

/** Drops keys explicitly set to `undefined` so partial updates skip them. */
function definedFields<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>;
}

async function findMyPatient(userId: string): Promise<Patient | null> {
  if (!db) return null;
  const rows = await db.select().from(patientsTable).where(eq(patientsTable.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// ── GET /me ─────────────────────────────────────────────────────────────────
router.get("/me", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;

  try {
    const patient = await findMyPatient(auth.sub);
    if (!patient) {
      const user = findUserById(auth.sub);
      res.status(404).json({
        error: "No patient profile yet",
        code: "NO_PROFILE",
        defaults: user ? {
          firstName: user.fullName.trim().split(/\s+/)[0] ?? "",
          lastName: user.fullName.trim().split(/\s+/).slice(1).join(" "),
          phone: user.phone ?? null,
          district: user.district || null,
        } : null,
      });
      return;
    }
    res.json({ patient });
  } catch (err) {
    handleServerError(res, "patients", err, "Failed to load profile");
  }
});

// ── POST /me  (create) ──────────────────────────────────────────────────────
router.post("/me", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth) return;
  if (!allowRoles(auth, res, ["Patient"], "Only Patient users can create their own profile")) return;
  if (!requireDb(res)) return;

  const data = parseBody(profileSchema, req, res, "Invalid profile data");
  if (!data) return;

  try {
    // Registration issues tokens before the write-through user insert finishes.
    // Wait here so the patients.user_id foreign key is always valid.
    await waitForUserPersistence(auth.sub);

    const existing = await findMyPatient(auth.sub);
    if (existing) {
      // Treat a repeated create as an idempotent save. This makes a retry
      // after a timeout safe and avoids losing the user's form data.
      const [updated] = await db!
        .update(patientsTable)
        .set({ ...definedFields(data), updatedAt: new Date() })
        .where(eq(patientsTable.id, existing.id))
        .returning();
      res.json({ patient: updated });
      return;
    }

    const [created] = await db!
      .insert(patientsTable)
      .values({
        tenantId: auth.tenantId,
        userId: auth.sub,
        patientId: generateMrn(),
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth ?? null,
        sex: data.sex ?? null,
        phone: data.phone ?? null,
        village: data.village ?? null,
        district: data.district ?? null,
        medicalHistory: data.medicalHistory ?? [],
      })
      .returning();

    audit(req, {
      userId: auth.sub,
      tenantId: auth.tenantId,
      event: "patient.profile.created",
      metadata: { patientId: created.patientId },
      dppaCategory: "patient_self_registration",
    });

    res.status(201).json({ patient: created });
  } catch (err) {
    handleServerError(res, "patients", err, "Failed to create profile");
  }
});

// ── PUT /me  (update) ───────────────────────────────────────────────────────
router.put("/me", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !requireDb(res)) return;

  const data = parseBody(updateSchema, req, res, "Invalid profile data");
  if (!data) return;

  try {
    const existing = await findMyPatient(auth.sub);
    if (!existing) { res.status(404).json({ error: "No patient profile to update", code: "NO_PROFILE" }); return; }

    const [updated] = await db!
      .update(patientsTable)
      .set({ ...definedFields(data), updatedAt: new Date() })
      .where(eq(patientsTable.id, existing.id))
      .returning();

    audit(req, {
      userId: auth.sub,
      tenantId: auth.tenantId,
      event: "patient.profile.updated",
      metadata: { patientId: updated.patientId, fields: Object.keys(data) },
      dppaCategory: "patient_self_update",
    });

    res.json({ patient: updated });
  } catch (err) {
    handleServerError(res, "patients", err, "Failed to update profile");
  }
});

// ── GET / (clinician list) ──────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !forbidRoles(auth, res, ["Patient"]) || !requireDb(res)) return;

  try {
    const rows = await db!.select().from(patientsTable).where(eq(patientsTable.tenantId, auth.tenantId));
    res.json({ items: rows, patients: rows });
  } catch (err) {
    handleServerError(res, "patients", err, "Failed to list patients");
  }
});

// ── POST / (clinician creates a patient record) ────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !forbidRoles(auth, res, ["Patient"]) || !requireDb(res)) return;

  const data = parseBody(profileSchema, req, res, "Invalid patient data");
  if (!data) return;

  try {
    const body = req.body ?? {};
    const patientId: string = body.patientId
      || generateMrn();

    // Resolve registering clinician's name
    const registeredByUser = findUserById(auth.sub);
    const registeredByName = registeredByUser?.fullName ?? null;

    const [row] = await db!.insert(patientsTable).values({
      tenantId: auth.tenantId,
      patientId,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ?? null,
      sex: data.sex ?? null,
      phone: data.phone ?? null,
      village: data.village ?? null,
      district: data.district ?? null,
      medicalHistory: data.medicalHistory ?? [],
      lastVisit: body.lastVisit ? new Date(body.lastVisit) : null,
      registeredBy: auth.sub,
      registeredByName,
    }).returning();

    audit(req, {
      userId: auth.sub,
      tenantId: auth.tenantId,
      event: "patient.record.created",
      metadata: { patientId: row.patientId, registeredByName },
      dppaCategory: "clinician_patient_registration",
    });

    res.status(201).json({ item: row });
  } catch (err) {
    console.error("[patients] POST / failed:", err);
    res.status(400).json({ error: "Failed to create patient", detail: String(err) });
  }
});

// ── PATCH /:id (clinician updates a patient record) ────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const auth = requireAuthContext(req, res);
  if (!auth || !forbidRoles(auth, res, ["Patient"]) || !requireDb(res)) return;
  const id = String(req.params["id"] ?? "");
  try {
    const updates = { ...req.body };
    if (updates.lastVisit) updates.lastVisit = new Date(updates.lastVisit);
    const [row] = await db!.update(patientsTable).set(updates).where(eq(patientsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ item: row });
  } catch (err) {
    console.error("[patients] PATCH /:id failed:", err);
    res.status(400).json({ error: "Failed to update patient", detail: String(err) });
  }
});

export default router;
