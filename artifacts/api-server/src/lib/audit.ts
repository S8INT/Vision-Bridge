/**
 * Request-scoped audit logging.
 *
 * Wraps `recordAuditEvent` so callers never have to re-derive the client IP,
 * user agent and device id from the request, and so DPPA fields default
 * consistently across routes.
 */

import type { Request } from "express";
import { recordAuditEvent, type AuditEntry } from "./authStore.js";
import { getClientIp, getUserAgent } from "./http.js";

type AuditInput = Omit<AuditEntry, "id" | "timestamp" | "ipAddress" | "userAgent" | "outcome" | "metadata" | "deviceId"> & {
  outcome?: AuditEntry["outcome"];
  metadata?: AuditEntry["metadata"];
  deviceId?: AuditEntry["deviceId"];
};

export function audit(req: Request, entry: AuditInput): void {
  recordAuditEvent({
    userId: entry.userId,
    tenantId: entry.tenantId,
    event: entry.event,
    outcome: entry.outcome ?? "success",
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    deviceId: entry.deviceId ?? req.auth?.deviceId ?? null,
    metadata: entry.metadata ?? null,
    dppaCategory: entry.dppaCategory,
  });
}
