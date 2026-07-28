/**
 * JWT utilities for VisionBridge auth service.
 * Access tokens: 15-minute lifetime.
 * Refresh tokens: 7-day lifetime.
 */

import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";

export type UserRole = "Admin" | "Doctor" | "Technician" | "CHW" | "Viewer" | "Patient";

export interface TokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  sessionId: string;
  deviceId: string;
  email: string;
  fullName: string;
}

const DEFAULT_DEV_SECRET = "visionbridge-dev-secret-change-in-production";

/**
 * Resolve the signing secret. In production a strong, non-default JWT_SECRET
 * MUST be provided — otherwise anyone could forge valid access tokens. We fail
 * closed (throw on startup) rather than silently falling back to a public
 * default. In non-production the dev default is allowed for convenience.
 */
function resolveJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  const isProduction = process.env["NODE_ENV"] === "production";

  if (!secret || secret === DEFAULT_DEV_SECRET) {
    if (isProduction) {
      throw new Error(
        "JWT_SECRET must be set to a strong, non-default value in production. " +
          "Refusing to start with a missing or default signing secret.",
      );
    }
    return DEFAULT_DEV_SECRET;
  }
  return secret;
}

const JWT_SECRET = resolveJwtSecret();
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
