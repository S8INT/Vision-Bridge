/**
 * Shared HTTP helpers for route handlers.
 *
 * Centralises the guard / validation / error-response patterns that every
 * route otherwise repeats: authentication check, database availability,
 * role restriction, zod body parsing and 500 handling.
 */

import type { Request, Response } from "express";
import type { ZodError, ZodSchema } from "zod";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import type { TokenPayload } from "./jwt.js";

/** Returns the decoded token, or null after sending a 401. */
export function requireAuthContext(req: Request, res: Response): TokenPayload | null {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthenticated" });
    return null;
  }
  return req.auth;
}

/** Returns false after sending a 503 when no database is configured. */
export function requireDb(res: Response): boolean {
  if (!db) {
    res.status(503).json({ error: "Database unavailable" });
    return false;
  }
  return true;
}

/** Returns false after sending a 403 when the caller has a disallowed role. */
export function forbidRoles(auth: TokenPayload, res: Response, roles: readonly string[], message = "Forbidden"): boolean {
  if (roles.includes(auth.role)) {
    res.status(403).json({ error: message });
    return false;
  }
  return true;
}

/** Returns false after sending a 403 unless the caller has one of `roles`. */
export function allowRoles(auth: TokenPayload, res: Response, roles: readonly string[], message = "Forbidden"): boolean {
  if (!roles.includes(auth.role)) {
    res.status(403).json({ error: message });
    return false;
  }
  return true;
}

/** Parses `req.body`, returning null after sending a 400 with zod issues. */
export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response, message = "Invalid request body"): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: message, details: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

/**
 * Same as `parseBody` but surfaces the first zod message as `error`, which is
 * what the auth screens render directly to the user.
 */
export function parseBodyWithMessage<T>(schema: ZodSchema<T>, req: Request, res: Response, fallback: string): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: firstIssueMessage(parsed.error, fallback), issues: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

export function firstIssueMessage(error: ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** Logs and answers with a 500 for unexpected handler failures. */
export function handleServerError(res: Response, scope: string, err: unknown, message: string): void {
  console.error(`[${scope}] ${message}:`, err);
  res.status(500).json({ error: message });
}

export function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

export function getUserAgent(req: Request): string {
  return String(req.headers["user-agent"] ?? "unknown");
}

export function getDeviceId(req: Request): string {
  return (req.headers["x-device-id"] as string) ?? randomUUID();
}

export function paramStr(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
