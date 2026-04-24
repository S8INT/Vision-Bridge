/**
 * Clinical data routes — full CRUD for the operational dashboard.
 *
 *   GET  /api/clinical/bootstrap   - one-shot fetch of everything for current tenant
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
import { eq } from "drizzle-orm";
import {
  db, patientsTable, doctorsTable, screeningsTable, consultationsTable,
  referralsTable, appointmentsTable, campaignsTable, notificationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

function requireDb(res: Response): boolean {
  if (!db) { res.status(503).json({ error: "Database unavailable" }); return false; }
  return true;
}

// ── Bootstrap: load everything for the current tenant in one round-trip ─────
router.get("/bootstrap", async (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).json({ error: "Unauthenticated" }); return; }
  if (!requireDb(res)) return;
  const tid = req.auth.tenantId;
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
    console.error("[clinical] bootstrap failed:", err);
    res.status(500).json({ error: "Failed to load clinical data" });
  }
});

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

function makeCreateRoute(table: any, prefill?: (req: Request) => Record<string, unknown>) {
  return async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).end(); return; }
    if (!requireDb(res)) return;
    try {
      const values = { tenantId: req.auth.tenantId, ...(prefill ? prefill(req) : {}), ...req.body };
      const [row] = await db!.insert(table).values(values).returning();
      res.status(201).json({ item: row });
    } catch (e) { console.error(e); res.status(400).json({ error: "Failed to create", detail: String(e) }); }
  };
}

function makePatchRoute(table: any) {
  return async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).end(); return; }
    if (!requireDb(res)) return;
    const { id } = req.params;
    try {
      const [row] = await db!.update(table).set(req.body).where(eq(table.id, id)).returning();
      if (!row) { res.status(404).json({ error: "Not found" }); return; }
      res.json({ item: row });
    } catch (e) { console.error(e); res.status(400).json({ error: "Failed to update", detail: String(e) }); }
  };
}

// ── Wire entities ───────────────────────────────────────────────────────────
router.get("/doctors",        makeListRoute(doctorsTable));
router.post("/doctors",       makeCreateRoute(doctorsTable));
router.patch("/doctors/:id",  makePatchRoute(doctorsTable));

router.get("/screenings",       makeListRoute(screeningsTable));
router.post("/screenings",      makeCreateRoute(screeningsTable, () => ({ capturedAt: new Date() })));
router.patch("/screenings/:id", makePatchRoute(screeningsTable));

router.get("/consultations",       makeListRoute(consultationsTable));
router.post("/consultations",      makeCreateRoute(consultationsTable, () => ({ requestedAt: new Date() })));
router.patch("/consultations/:id", makePatchRoute(consultationsTable));

router.get("/referrals",       makeListRoute(referralsTable));
router.post("/referrals",      makeCreateRoute(referralsTable, () => ({ createdAt: new Date() })));
router.patch("/referrals/:id", makePatchRoute(referralsTable));

router.get("/appointments",       makeListRoute(appointmentsTable));
router.post("/appointments",      makeCreateRoute(appointmentsTable, () => ({ createdAt: new Date() })));
router.patch("/appointments/:id", makePatchRoute(appointmentsTable));

router.get("/campaigns",       makeListRoute(campaignsTable));
router.post("/campaigns",      makeCreateRoute(campaignsTable, () => ({ createdAt: new Date(), screenedCount: 0, referredCount: 0 })));
router.patch("/campaigns/:id", makePatchRoute(campaignsTable));

router.get("/notifications",       makeListRoute(notificationsTable));
router.post("/notifications",      makeCreateRoute(notificationsTable, () => ({ createdAt: new Date(), read: false })));
router.patch("/notifications/:id", makePatchRoute(notificationsTable));

router.post("/notifications/read-all", async (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).end(); return; }
  if (!requireDb(res)) return;
  try {
    await db!.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.tenantId, req.auth.tenantId));
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed" }); }
});

export default router;
