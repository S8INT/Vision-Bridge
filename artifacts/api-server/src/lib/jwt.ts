/**
 * JWT utilities for VisionBridge auth service.
 * Access tokens: 15-minute lifetime.
 * Refresh tokens: 7-day lifetime.
 */

import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";

export type UserRole = "Admin" | "Doctor" | "Technician" | "CHW" | "Viewer";

export interface TokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  sessionId: string;
  deviceId: string;
  email: string;
  fullName: string;
}

const JWT_SECRET = process.env["JWT_SECRET"] ?? "visionbridge-dev-secret-change-in-production";
const JWT_ISSUER = "visionbridge-ug";
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_BYTES = 48;

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER });
  return decoded as TokenPayload;
}

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

export function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}
