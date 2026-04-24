/**
 * VisionBridge Auth Store — Postgres-backed (with in-memory cache + mock fallback)
 *
 * Persistence model:
 *   - All reads served from in-memory cache (fast, sync API for routes)
 *   - All writes update cache immediately, then persist to Postgres asynchronously
 *   - On startup, the cache is hydrated from Postgres
 *   - If the database is unavailable, falls back to in-memory only and seeds demo users
 *     so workflows remain testable (clearly logged as "MOCK MODE")
 *
 * Uganda DPPA 2019: All access events are recorded in the audit log (Postgres + memory).
 *
 * Drop-in replacement for the previous in-memory store — keeps the same sync API
 * so existing routes need no changes.
 */

import { randomUUID } from "crypto";
import { hashPassword } from "./password.js";
import type { UserRole } from "./jwt.js";
import {
  db,
  pool,
  tenantsTable,
  usersTable,
  sessionsTable,
  authAuditLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── Types (kept identical to previous in-memory shape) ────────────────────────

export interface StoredUser {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  fullName: string;
  facility: string;
  district: string;
  phone?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaPendingSecret: string | null;
  dppaConsentAt: Date | null;
  dppaConsentIp: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface StoredSession {
  id: string;
  userId: string;
  tenantId: string;
  refreshToken: string;
  deviceId: string;
  deviceName: string;
  devicePlatform: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  tenantId: string | null;
  event: string;
  outcome: "success" | "failure";
  ipAddress: string;
  userAgent: string;
  deviceId: string | null;
  metadata: Record<string, unknown> | null;
  dppaCategory: string | null;
  timestamp: Date;
}

// ── In-Memory Cache (write-through to DB) ────────────────────────────────────

const tenantsByName = new Map<string, { id: string; name: string; district: string }>();
const tenantsById = new Map<string, { id: string; name: string; district: string }>();
const users = new Map<string, StoredUser>();
const sessionsByToken = new Map<string, StoredSession>();
const sessionsByUser = new Map<string, Set<string>>();
const auditLog: AuditEntry[] = [];

let dbAvailable = true;
let initPromise: Promise<void> | null = null;
const DEMO_TENANT_NAME = "Mbarara RRH Eye Unit";
let DEMO_TENANT_ID = ""; // resolved on init

// ── Row mappers ──────────────────────────────────────────────────────────────

function rowToUser(r: typeof usersTable.$inferSelect): StoredUser {
  return {
    id: r.id,
    tenantId: r.tenantId,
    email: r.email,
    passwordHash: r.passwordHash,
    role: r.role,
    fullName: r.fullName,
    facility: r.facility ?? "",
    district: r.district ?? "",
    phone: r.phone ?? undefined,
    isActive: r.isActive,
    mfaEnabled: r.mfaEnabled,
    mfaSecret: r.mfaSecret,
    mfaPendingSecret: r.mfaPendingSecret,
    dppaConsentAt: r.dppaConsentAt,
    dppaConsentIp: r.dppaConsentIp,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
  };
}

function rowToSession(r: typeof sessionsTable.$inferSelect): StoredSession {
  return {
    id: r.id,
    userId: r.userId,
    tenantId: r.tenantId,
    refreshToken: r.refreshToken,
    deviceId: r.deviceId,
    deviceName: r.deviceName ?? "",
    devicePlatform: r.devicePlatform ?? "",
    ipAddress: r.ipAddress ?? "",
    userAgent: r.userAgent ?? "",
    expiresAt: r.expiresAt,
    revokedAt: r.revokedAt,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
  };
}

function rowToAudit(r: typeof authAuditLogTable.$inferSelect): AuditEntry {
  return {
    id: r.id,
    userId: r.userId,
    tenantId: r.tenantId,
    event: r.event,
    outcome: (r.outcome as "success" | "failure") ?? "success",
    ipAddress: r.ipAddress ?? "unknown",
    userAgent: r.userAgent ?? "unknown",
    deviceId: r.deviceId,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    dppaCategory: r.dppaCategory,
    timestamp: r.timestamp,
  };
}

// ── Async helpers ────────────────────────────────────────────────────────────

function fireAndForget(label: string, p: Promise<unknown>) {
  p.catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[authStore] persistence failure (${label}):`, err?.message ?? err);
  });
}

async function ensureDemoTenant(): Promise<string> {
  // Try find by name first
  const existing = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.name, DEMO_TENANT_NAME))
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    return existing[0].id;
  }

  const inserted = await db
    .insert(tenantsTable)
    .values({ name: DEMO_TENANT_NAME, district: "Mbarara", country: "Uganda" })
    .returning();

  return inserted[0]!.id;
}

async function seedDemoUsers(tenantId: string) {
  const demoUsers = [
    { email: "admin@visionbridge.ug", password: "Admin1234!", role: "Admin" as UserRole, fullName: "System Administrator", facility: "Mbarara RRH Eye Unit", district: "Mbarara", phone: "+256701000001" },
    { email: "dr.okello@visionbridge.ug", password: "Doctor1234!", role: "Doctor" as UserRole, fullName: "Dr. James Okello", facility: "Mbarara RRH Eye Unit", district: "Mbarara", phone: "+256701000002" },
    { email: "sarah.nakato@visionbridge.ug", password: "Tech1234!", role: "Technician" as UserRole, fullName: "Sarah Nakato", facility: "Mbarara RRH Eye Unit", district: "Mbarara", phone: "+256701000003" },
    { email: "chw.mbarara@visionbridge.ug", password: "CHW1234!", role: "CHW" as UserRole, fullName: "Grace Akello", facility: "Mbarara HC III", district: "Mbarara", phone: "+256701000004" },
    { email: "viewer@visionbridge.ug", password: "Viewer1234!", role: "Viewer" as UserRole, fullName: "District Health Officer", facility: "Mbarara District Health Office", district: "Mbarara" },
  ];

  for (const u of demoUsers) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, u.email)).limit(1);
    if (existing.length > 0) continue;
    const hash = await hashPassword(u.password);
    await db.insert(usersTable).values({
      tenantId,
      email: u.email,
      passwordHash: hash,
      role: u.role,
      fullName: u.fullName,
      facility: u.facility,
      district: u.district,
      phone: u.phone,
      isActive: true,
      mfaEnabled: false,
      dppaConsentAt: new Date(),
      dppaConsentIp: "127.0.0.1",
    });
  }
}

async function hydrateCache(tenantId: string) {
  const userRows = await db.select().from(usersTable).where(eq(usersTable.tenantId, tenantId));
  for (const r of userRows) {
    const u = rowToUser(r);
    users.set(u.id, u);
    if (!sessionsByUser.has(u.id)) sessionsByUser.set(u.id, new Set());
  }

  const sessionRows = await db.select().from(sessionsTable);
  for (const r of sessionRows) {
    const s = rowToSession(r);
    sessionsByToken.set(s.refreshToken, s);
    if (!sessionsByUser.has(s.userId)) sessionsByUser.set(s.userId, new Set());
    sessionsByUser.get(s.userId)!.add(s.id);
  }
}

function seedMockMode() {
  // No DB available — seed an in-memory tenant + demo users so the app still works.
  const tenantId = "tenant-mbarara-mock";
  DEMO_TENANT_ID = tenantId;
  tenantsById.set(tenantId, { id: tenantId, name: DEMO_TENANT_NAME, district: "Mbarara" });
  tenantsByName.set(DEMO_TENANT_NAME, tenantsById.get(tenantId)!);

  const demoUsers = [
    { email: "admin@visionbridge.ug", password: "Admin1234!", role: "Admin" as UserRole, fullName: "System Administrator", facility: "Mbarara RRH Eye Unit", district: "Mbarara", phone: "+256701000001" },
    { email: "dr.okello@visionbridge.ug", password: "Doctor1234!", role: "Doctor" as UserRole, fullName: "Dr. James Okello", facility: "Mbarara RRH Eye Unit", district: "Mbarara", phone: "+256701000002" },
    { email: "sarah.nakato@visionbridge.ug", password: "Tech1234!", role: "Technician" as UserRole, fullName: "Sarah Nakato", facility: "Mbarara RRH Eye Unit", district: "Mbarara", phone: "+256701000003" },
    { email: "chw.mbarara@visionbridge.ug", password: "CHW1234!", role: "CHW" as UserRole, fullName: "Grace Akello", facility: "Mbarara HC III", district: "Mbarara", phone: "+256701000004" },
    { email: "viewer@visionbridge.ug", password: "Viewer1234!", role: "Viewer" as UserRole, fullName: "District Health Officer", facility: "Mbarara District Health Office", district: "Mbarara", phone: "" },
  ];

  // Seed synchronously enough for tests; real hashing is async but we just await all
  return Promise.all(demoUsers.map(async (u) => {
    const passwordHash = await hashPassword(u.password);
    const id = randomUUID();
    users.set(id, {
      id,
      tenantId,
      email: u.email,
      passwordHash,
      role: u.role,
      fullName: u.fullName,
      facility: u.facility,
      district: u.district,
      phone: u.phone || undefined,
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      dppaConsentAt: new Date(),
      dppaConsentIp: "127.0.0.1",
      createdAt: new Date(),
      lastLoginAt: null,
    });
    sessionsByUser.set(id, new Set());
  })).then(() => undefined);
}

export async function initAuthStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      // Test connection
      await pool.query("SELECT 1");
      DEMO_TENANT_ID = await ensureDemoTenant();
      tenantsById.set(DEMO_TENANT_ID, { id: DEMO_TENANT_ID, name: DEMO_TENANT_NAME, district: "Mbarara" });
      tenantsByName.set(DEMO_TENANT_NAME, tenantsById.get(DEMO_TENANT_ID)!);
      await seedDemoUsers(DEMO_TENANT_ID);
      await hydrateCache(DEMO_TENANT_ID);
      // Seed clinical demo data (idempotent)
      try {
        const { seedClinicalDemoData } = await import("./clinicalSeed.js");
        await seedClinicalDemoData(DEMO_TENANT_ID);
      } catch (e) {
        console.warn("[authStore] clinical seed failed:", (e as Error)?.message);
      }
      // Hydrate audit log (most recent 1000)
      const auditRows = await db.select().from(authAuditLogTable).limit(1000);
      for (const r of auditRows) auditLog.push(rowToAudit(r));
      // eslint-disable-next-line no-console
      console.log(`[authStore] DB-backed mode — ${users.size} users, ${sessionsByToken.size} sessions, tenant=${DEMO_TENANT_ID}`);
    } catch (err) {
      dbAvailable = false;
      // eslint-disable-next-line no-console
      console.warn("[authStore] DB unavailable, falling back to MOCK MODE:", (err as Error)?.message);
      await seedMockMode();
      // eslint-disable-next-line no-console
      console.log(`[authStore] MOCK MODE — ${users.size} demo users seeded in memory`);
    }
  })();
  return initPromise;
}

export function getDemoTenantId(): string {
  return DEMO_TENANT_ID;
}

// Kick off init on module load (non-blocking)
initAuthStore().catch((e) => console.error("[authStore] init error:", e));

// ── User Operations ───────────────────────────────────────────────────────────

export function findUserByEmail(email: string): StoredUser | undefined {
  for (const user of users.values()) {
    if (user.email.toLowerCase() === email.toLowerCase()) return user;
  }
  return undefined;
}

export function findUserById(id: string): StoredUser | undefined {
  return users.get(id);
}

export function updateUser(id: string, patch: Partial<StoredUser>): StoredUser | null {
  const user = users.get(id);
  if (!user) return null;
  const updated = { ...user, ...patch };
  users.set(id, updated);

  if (dbAvailable) {
    const dbPatch: Partial<typeof usersTable.$inferInsert> = {};
    if (patch.email !== undefined) dbPatch.email = patch.email;
    if (patch.passwordHash !== undefined) dbPatch.passwordHash = patch.passwordHash;
    if (patch.role !== undefined) dbPatch.role = patch.role;
    if (patch.fullName !== undefined) dbPatch.fullName = patch.fullName;
    if (patch.facility !== undefined) dbPatch.facility = patch.facility;
    if (patch.district !== undefined) dbPatch.district = patch.district;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    if (patch.isActive !== undefined) dbPatch.isActive = patch.isActive;
    if (patch.mfaEnabled !== undefined) dbPatch.mfaEnabled = patch.mfaEnabled;
    if (patch.mfaSecret !== undefined) dbPatch.mfaSecret = patch.mfaSecret;
    if (patch.mfaPendingSecret !== undefined) dbPatch.mfaPendingSecret = patch.mfaPendingSecret;
    if (patch.dppaConsentAt !== undefined) dbPatch.dppaConsentAt = patch.dppaConsentAt;
    if (patch.dppaConsentIp !== undefined) dbPatch.dppaConsentIp = patch.dppaConsentIp;
    if (patch.lastLoginAt !== undefined) dbPatch.lastLoginAt = patch.lastLoginAt;
    dbPatch.updatedAt = new Date();

    if (Object.keys(dbPatch).length > 0) {
      fireAndForget("updateUser", db.update(usersTable).set(dbPatch).where(eq(usersTable.id, id)));
    }
  }

  return updated;
}

export function listUsers(tenantId: string): StoredUser[] {
  return Array.from(users.values()).filter((u) => u.tenantId === tenantId);
}

export function addUser(user: StoredUser): void {
  users.set(user.id, user);
  if (!sessionsByUser.has(user.id)) sessionsByUser.set(user.id, new Set());

  if (dbAvailable) {
    fireAndForget("addUser", db.insert(usersTable).values({
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      fullName: user.fullName,
      facility: user.facility,
      district: user.district,
      phone: user.phone,
      isActive: user.isActive,
      mfaEnabled: user.mfaEnabled,
      mfaSecret: user.mfaSecret,
      mfaPendingSecret: user.mfaPendingSecret,
      dppaConsentAt: user.dppaConsentAt,
      dppaConsentIp: user.dppaConsentIp,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));
  }
}

// ── Session Operations ────────────────────────────────────────────────────────

export function createSession(session: Omit<StoredSession, "id" | "createdAt" | "lastUsedAt">): StoredSession {
  const stored: StoredSession = {
    ...session,
    id: randomUUID(),
    createdAt: new Date(),
    lastUsedAt: new Date(),
  };
  sessionsByToken.set(session.refreshToken, stored);
  if (!sessionsByUser.has(session.userId)) sessionsByUser.set(session.userId, new Set());
  sessionsByUser.get(session.userId)!.add(stored.id);

  if (dbAvailable) {
    fireAndForget("createSession", db.insert(sessionsTable).values({
      id: stored.id,
      userId: stored.userId,
      tenantId: stored.tenantId,
      refreshToken: stored.refreshToken,
      deviceId: stored.deviceId,
      deviceName: stored.deviceName,
      devicePlatform: stored.devicePlatform,
      ipAddress: stored.ipAddress,
      userAgent: stored.userAgent,
      expiresAt: stored.expiresAt,
      revokedAt: stored.revokedAt,
      createdAt: stored.createdAt,
      lastUsedAt: stored.lastUsedAt,
    }));
  }

  return stored;
}

export function findSessionByToken(refreshToken: string): StoredSession | undefined {
  return sessionsByToken.get(refreshToken);
}

export function findSessionsByUser(userId: string): StoredSession[] {
  const ids = sessionsByUser.get(userId) ?? new Set<string>();
  const result: StoredSession[] = [];
  for (const s of sessionsByToken.values()) {
    if (ids.has(s.id)) result.push(s);
  }
  return result;
}

export function revokeSession(sessionId: string): boolean {
  for (const [token, session] of sessionsByToken.entries()) {
    if (session.id === sessionId) {
      const revokedAt = new Date();
      session.revokedAt = revokedAt;
      sessionsByToken.set(token, session);
      if (dbAvailable) {
        fireAndForget("revokeSession", db.update(sessionsTable).set({ revokedAt }).where(eq(sessionsTable.id, sessionId)));
      }
      return true;
    }
  }
  return false;
}

export function revokeAllUserSessions(userId: string): void {
  const ids = sessionsByUser.get(userId) ?? new Set<string>();
  const revokedAt = new Date();
  for (const [token, session] of sessionsByToken.entries()) {
    if (ids.has(session.id)) {
      session.revokedAt = revokedAt;
      sessionsByToken.set(token, session);
    }
  }
  if (dbAvailable) {
    fireAndForget("revokeAllUserSessions", db.update(sessionsTable).set({ revokedAt }).where(eq(sessionsTable.userId, userId)));
  }
}

export function touchSession(refreshToken: string): void {
  const s = sessionsByToken.get(refreshToken);
  if (s) {
    const lastUsedAt = new Date();
    s.lastUsedAt = lastUsedAt;
    sessionsByToken.set(refreshToken, s);
    if (dbAvailable) {
      fireAndForget("touchSession", db.update(sessionsTable).set({ lastUsedAt }).where(eq(sessionsTable.refreshToken, refreshToken)));
    }
  }
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export function recordAuditEvent(entry: Omit<AuditEntry, "id" | "timestamp">): void {
  const full: AuditEntry = { ...entry, id: randomUUID(), timestamp: new Date() };
  auditLog.push(full);
  if (auditLog.length > 10_000) auditLog.shift();

  if (dbAvailable) {
    fireAndForget("recordAuditEvent", db.insert(authAuditLogTable).values({
      id: full.id,
      userId: full.userId,
      tenantId: full.tenantId,
      event: full.event,
      outcome: full.outcome,
      ipAddress: full.ipAddress,
      userAgent: full.userAgent,
      deviceId: full.deviceId,
      metadata: full.metadata,
      dppaCategory: full.dppaCategory,
      timestamp: full.timestamp,
    }));
  }
}

export function getAuditLog(opts: {
  tenantId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): AuditEntry[] {
  let entries = auditLog;
  if (opts.tenantId) entries = entries.filter((e) => e.tenantId === opts.tenantId);
  if (opts.userId) entries = entries.filter((e) => e.userId === opts.userId);
  const sorted = entries.slice().reverse();
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 100;
  return sorted.slice(offset, offset + limit);
}

// Compatibility export for any existing references
export const tenants = tenantsById;
