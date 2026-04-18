/**
 * VisionBridge Auth Store — In-Memory Implementation
 *
 * Stores users, sessions, and audit log in memory.
 * Pre-seeded with demo users for development.
 *
 * For production: replace with PostgreSQL persistence via @workspace/db.
 * Sessions survive as long as the process is running.
 *
 * Uganda DPPA 2019: All access events are recorded in the audit log.
 */

import { randomUUID } from "crypto";
import { hashPassword } from "./password.js";
import type { UserRole } from "./jwt.js";

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── In-Memory Stores ─────────────────────────────────────────────────────────

const tenants = new Map<string, { id: string; name: string; district: string }>();
const users = new Map<string, StoredUser>();
const sessionsByToken = new Map<string, StoredSession>();
const sessionsByUser = new Map<string, Set<string>>();
const auditLog: AuditEntry[] = [];

// ── Seed Data ────────────────────────────────────────────────────────────────

const DEMO_TENANT_ID = "tenant-mbarara-001";

async function seed() {
  tenants.set(DEMO_TENANT_ID, {
    id: DEMO_TENANT_ID,
    name: "Mbarara RRH Eye Unit",
    district: "Mbarara",
  });

  const demoUsers: Array<Omit<StoredUser, "id" | "passwordHash" | "createdAt"> & { password: string }> = [
    {
      tenantId: DEMO_TENANT_ID,
      email: "admin@visionbridge.ug",
      password: "Admin1234!",
      role: "Admin",
      fullName: "System Administrator",
      facility: "Mbarara RRH Eye Unit",
      district: "Mbarara",
      phone: "+256701000001",
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      dppaConsentAt: new Date(),
      dppaConsentIp: "127.0.0.1",
      lastLoginAt: null,
    },
    {
      tenantId: DEMO_TENANT_ID,
      email: "dr.okello@visionbridge.ug",
      password: "Doctor1234!",
      role: "Doctor",
      fullName: "Dr. James Okello",
      facility: "Mbarara RRH Eye Unit",
      district: "Mbarara",
      phone: "+256701000002",
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      dppaConsentAt: new Date(),
      dppaConsentIp: "127.0.0.1",
      lastLoginAt: null,
    },
    {
      tenantId: DEMO_TENANT_ID,
      email: "sarah.nakato@visionbridge.ug",
      password: "Tech1234!",
      role: "Technician",
      fullName: "Sarah Nakato",
      facility: "Mbarara RRH Eye Unit",
      district: "Mbarara",
      phone: "+256701000003",
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      dppaConsentAt: new Date(),
      dppaConsentIp: "127.0.0.1",
      lastLoginAt: null,
    },
    {
      tenantId: DEMO_TENANT_ID,
      email: "chw.mbarara@visionbridge.ug",
      password: "CHW1234!",
      role: "CHW",
      fullName: "Grace Akello",
      facility: "Mbarara HC III",
      district: "Mbarara",
      phone: "+256701000004",
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      dppaConsentAt: new Date(),
      dppaConsentIp: "127.0.0.1",
      lastLoginAt: null,
    },
    {
      tenantId: DEMO_TENANT_ID,
      email: "viewer@visionbridge.ug",
      password: "Viewer1234!",
      role: "Viewer",
      fullName: "District Health Officer",
      facility: "Mbarara District Health Office",
      district: "Mbarara",
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      dppaConsentAt: new Date(),
      dppaConsentIp: "127.0.0.1",
      lastLoginAt: null,
    },
  ];

  for (const u of demoUsers) {
    const { password, ...rest } = u;
    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    users.set(id, { ...rest, id, passwordHash, createdAt: new Date() });
  }
}

// Seed on module load (async, non-blocking)
seed().catch(console.error);

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
  return updated;
}

export function listUsers(tenantId: string): StoredUser[] {
  return Array.from(users.values()).filter((u) => u.tenantId === tenantId);
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
  if (!sessionsByUser.has(session.userId)) {
    sessionsByUser.set(session.userId, new Set());
  }
  sessionsByUser.get(session.userId)!.add(stored.id);
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
      session.revokedAt = new Date();
      sessionsByToken.set(token, session);
      return true;
    }
  }
  return false;
}

export function revokeAllUserSessions(userId: string): void {
  const ids = sessionsByUser.get(userId) ?? new Set<string>();
  for (const [token, session] of sessionsByToken.entries()) {
    if (ids.has(session.id)) {
      session.revokedAt = new Date();
      sessionsByToken.set(token, session);
    }
  }
}

export function touchSession(refreshToken: string): void {
  const s = sessionsByToken.get(refreshToken);
  if (s) {
    s.lastUsedAt = new Date();
    sessionsByToken.set(refreshToken, s);
  }
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export function recordAuditEvent(entry: Omit<AuditEntry, "id" | "timestamp">): void {
  auditLog.push({ ...entry, id: randomUUID(), timestamp: new Date() });
  if (auditLog.length > 10_000) auditLog.shift();
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

export function addUser(user: StoredUser): void {
  users.set(user.id, user);
  sessionsByUser.set(user.id, new Set());
}

export { tenants };
