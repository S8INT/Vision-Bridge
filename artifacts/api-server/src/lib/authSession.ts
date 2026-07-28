/**
 * Session issuance shared by every sign-in path (login, MFA verify,
 * self-registration and first-admin setup): create the refresh session, sign an
 * access token, write the login audit event and shape the response body.
 */

import type { Request } from "express";
import {
  createSession,
  recordAuditEvent,
  type StoredUser,
} from "./authStore.js";
import {
  generateRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
} from "./jwt.js";
import { canAccess, type Action, type Resource, type Role } from "./rbac.js";
import { getClientIp, getUserAgent } from "./http.js";

export const ACCESS_TOKEN_TTL_SECONDS = 900;

export type SanitizedUser = Omit<StoredUser, "passwordHash" | "mfaSecret" | "mfaPendingSecret">;

export type PermissionSummary = Record<string, Record<string, boolean>>;

export interface AuthSuccessPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SanitizedUser | null;
  permissions: PermissionSummary;
}

/** Strips credential material before a user object leaves the server. */
export function sanitizeUser(user: StoredUser | null | undefined): SanitizedUser | null {
  if (!user) return null;
  const { passwordHash, mfaSecret, mfaPendingSecret, ...safe } = user;
  void passwordHash; void mfaSecret; void mfaPendingSecret;
  return safe;
}

const RESOURCES = [
  "patient", "image", "aiResults", "consultation", "referral",
  "billing", "analytics", "models", "tenantConfig", "session",
  "auditLog", "users",
] as const;

const ACTIONS = ["create", "read", "update", "delete", "upload", "view", "manage", "list"] as const;

/** Flattened RBAC matrix the mobile app uses to gate its UI. */
export function canAccessSummary(role: Role): PermissionSummary {
  const result: PermissionSummary = {};
  for (const resource of RESOURCES) {
    result[resource] = {};
    for (const action of ACTIONS) {
      result[resource]![action] = canAccess(role, resource as Resource, action as Action);
    }
  }
  return result;
}

export interface IssueSessionOptions {
  user: StoredUser;
  deviceId: string;
  deviceName?: string;
  devicePlatform?: string;
  /** Audit event name, e.g. "login.success" or "auth.login". */
  auditEvent: string;
  auditMetadata?: Record<string, unknown>;
}

export function issueSession(req: Request, options: IssueSessionOptions): AuthSuccessPayload {
  const { user, deviceId, deviceName, devicePlatform, auditEvent, auditMetadata } = options;
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  const refreshToken = generateRefreshToken();
  const session = createSession({
    userId: user.id,
    tenantId: user.tenantId,
    refreshToken,
    deviceId,
    deviceName: deviceName ?? "Unknown device",
    devicePlatform: devicePlatform ?? "unknown",
    ipAddress: ip,
    userAgent,
    expiresAt: refreshTokenExpiresAt(),
    revokedAt: null,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: session.id,
    deviceId,
    email: user.email,
    fullName: user.fullName,
  });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: auditEvent,
    outcome: "success",
    ipAddress: ip,
    userAgent,
    deviceId,
    metadata: { sessionId: session.id, ...(auditMetadata ?? {}) },
    dppaCategory: "authentication",
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: sanitizeUser(user),
    permissions: canAccessSummary(user.role),
  };
}
