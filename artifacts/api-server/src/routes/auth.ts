/**
 * VisionBridge Auth Service — API Routes
 *
 * Responsibilities:
 *  1. JWT/OAuth2 token issuance and refresh
 *  2. Multi-tenant RBAC (roles scoped per tenant)
 *  3. MFA (TOTP) setup and verification for clinicians
 *  4. Audit log of all auth events (Uganda DPPA 2019 compliance)
 *  5. Session invalidation and device management
 *  6. User self-service and admin user management
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  signAccessToken,
  generateRefreshToken,
  refreshTokenExpiresAt,
  verifyAccessToken,
} from "../lib/jwt.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { generateTotpSecret, verifyTotpCode } from "../lib/totp.js";
import {
  findUserByEmail,
  findUserById,
  updateUser,
  listUsers,
  addUser,
  createSession,
  findSessionByToken,
  findSessionsByUser,
  revokeSession,
  revokeAllUserSessions,
  touchSession,
  recordAuditEvent,
  getAuditLog,
  getDemoTenantId,
} from "../lib/authStore.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/rbac.js";
import { canAccess } from "../lib/rbac.js";
import { randomUUID } from "crypto";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

function getDeviceId(req: Request): string {
  return (req.headers["x-device-id"] as string) ?? randomUUID();
}

function sanitizeUser(user: ReturnType<typeof findUserById>) {
  if (!user) return null;
  const { passwordHash, mfaSecret, mfaPendingSecret, ...safe } = user;
  void passwordHash; void mfaSecret; void mfaPendingSecret;
  return safe;
}

// ── Validation Schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  devicePlatform: z.string().optional(),
  dppaConsent: z.boolean().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const mfaVerifySchema = z.object({
  code: z.string().length(6),
  sessionToken: z.string().min(1),
});

const mfaSetupVerifySchema = z.object({
  code: z.string().length(6),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["Admin", "Doctor", "Technician", "CHW", "Viewer", "Patient"]),
  fullName: z.string().min(2),
  facility: z.string().optional(),
  district: z.string().optional(),
  phone: z.string().optional(),
});

// Self-service signup: Admin role NOT allowed; default tenant assigned
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["Doctor", "Technician", "CHW", "Viewer", "Patient"]),
  fullName: z.string().min(2),
  facility: z.string().min(1),
  district: z.string().min(1),
  phone: z.string().optional(),
  dppaConsent: z.literal(true, { errorMap: () => ({ message: "You must accept the DPPA consent to register" }) }),
});

const revokeSessionSchema = z.object({ sessionId: z.string().uuid() });

// ── POST /auth/register — public self-service signup ─────────────────────────
/**
 * Self-service registration for clinical staff.
 * Admin role is restricted (must be created by an existing admin).
 * On success, immediately issues access + refresh tokens and signs the user in.
 */
router.post("/register", async (req: Request, res: Response) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? "Invalid registration data", issues: parse.error.issues });
    return;
  }

  const { email, password, role, fullName, facility, district, phone } = parse.data;

  if (findUserByEmail(email)) {
    res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const ip = getClientIp(req);
  const now = new Date();

  const newUser = {
    id,
    tenantId: getDemoTenantId(), // default tenant; multi-tenant onboarding TBD
    email,
    passwordHash,
    role,
    fullName,
    facility,
    district,
    phone,
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    mfaPendingSecret: null,
    dppaConsentAt: now,
    dppaConsentIp: ip,
    createdAt: now,
    lastLoginAt: now,
  };

  addUser(newUser);

  recordAuditEvent({
    userId: id,
    tenantId: newUser.tenantId,
    event: "user.self_registered",
    outcome: "success",
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? "unknown",
    deviceId: getDeviceId(req),
    metadata: { email, role, facility, district },
    dppaCategory: "user_management",
  });

  // Auto-issue tokens (skip MFA for fresh signups)
  const deviceId = getDeviceId(req);
  const refreshTokenStr = generateRefreshToken();
  const expiresAt = refreshTokenExpiresAt();

  const session = createSession({
    userId: id,
    tenantId: newUser.tenantId,
    refreshToken: refreshTokenStr,
    deviceId,
    deviceName: (req.body?.deviceName as string) ?? "VisionBridge Mobile",
    devicePlatform: (req.body?.devicePlatform as string) ?? "expo",
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? "unknown",
    expiresAt,
    revokedAt: null,
  });

  const accessToken = signAccessToken({
    sub: id,
    tenantId: newUser.tenantId,
    role,
    sessionId: session.id,
    deviceId,
    email: newUser.email,
    fullName: newUser.fullName,
  });

  recordAuditEvent({
    userId: id,
    tenantId: newUser.tenantId,
    event: "auth.login",
    outcome: "success",
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? "unknown",
    deviceId,
    metadata: { source: "registration_auto_login" },
    dppaCategory: "authentication",
  });

  res.status(201).json({
    accessToken,
    refreshToken: refreshTokenStr,
    expiresIn: 900,
    user: sanitizeUser(newUser),
    permissions: canAccessSummary(role),
  });
});

// ── POST /auth/login ─────────────────────────────────────────────────────────
/**
 * Authenticate with email + password.
 * Returns: access token, refresh token, and MFA challenge flag.
 * Uganda DPPA: records IP, device, timestamp in audit log.
 */
router.post("/login", async (req: Request, res: Response) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
    return;
  }

  const { email, password, deviceId, deviceName, devicePlatform, dppaConsent } = parse.data;
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? "unknown";
  const resolvedDeviceId = deviceId ?? getDeviceId(req);

  const user = findUserByEmail(email);

  if (!user || !user.isActive) {
    recordAuditEvent({
      userId: user?.id ?? null,
      tenantId: user?.tenantId ?? null,
      event: "login.failed",
      outcome: "failure",
      ipAddress: ip,
      userAgent: ua,
      deviceId: resolvedDeviceId,
      metadata: { reason: "user_not_found_or_inactive", email },
      dppaCategory: "authentication",
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    recordAuditEvent({
      userId: user.id,
      tenantId: user.tenantId,
      event: "login.failed",
      outcome: "failure",
      ipAddress: ip,
      userAgent: ua,
      deviceId: resolvedDeviceId,
      metadata: { reason: "wrong_password" },
      dppaCategory: "authentication",
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Record DPPA consent if provided
  if (dppaConsent && !user.dppaConsentAt) {
    updateUser(user.id, { dppaConsentAt: new Date(), dppaConsentIp: ip });
  }

  updateUser(user.id, { lastLoginAt: new Date() });

  // MFA required for Doctor / Admin roles when enabled
  if (user.mfaEnabled && user.mfaSecret) {
    const sessionToken = signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      sessionId: "pending-mfa",
      deviceId: resolvedDeviceId,
      email: user.email,
      fullName: user.fullName,
    });

    recordAuditEvent({
      userId: user.id,
      tenantId: user.tenantId,
      event: "login.mfa_required",
      outcome: "success",
      ipAddress: ip,
      userAgent: ua,
      deviceId: resolvedDeviceId,
      metadata: null,
      dppaCategory: "authentication",
    });

    res.json({ mfaRequired: true, sessionToken });
    return;
  }

  // Issue full session
  const refreshToken = generateRefreshToken();
  const session = createSession({
    userId: user.id,
    tenantId: user.tenantId,
    refreshToken,
    deviceId: resolvedDeviceId,
    deviceName: deviceName ?? "Unknown device",
    devicePlatform: devicePlatform ?? "unknown",
    ipAddress: ip,
    userAgent: ua,
    expiresAt: refreshTokenExpiresAt(),
    revokedAt: null,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: session.id,
    deviceId: resolvedDeviceId,
    email: user.email,
    fullName: user.fullName,
  });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "login.success",
    outcome: "success",
    ipAddress: ip,
    userAgent: ua,
    deviceId: resolvedDeviceId,
    metadata: { sessionId: session.id },
    dppaCategory: "authentication",
  });

  res.json({
    mfaRequired: false,
    accessToken,
    refreshToken,
    expiresIn: 900,
    user: sanitizeUser(user),
    permissions: canAccessSummary(user.role),
  });
});

// ── POST /auth/mfa/verify ────────────────────────────────────────────────────
/**
 * Complete MFA challenge. Uses sessionToken from /login.
 * Validates TOTP code and issues full access + refresh tokens.
 */
router.post("/mfa/verify", async (req: Request, res: Response) => {
  const parse = mfaVerifySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
    return;
  }

  const { code, sessionToken } = parse.data;
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? "unknown";

  let payload;
  try {
    payload = verifyAccessToken(sessionToken);
  } catch {
    res.status(401).json({ error: "Invalid or expired session token" });
    return;
  }

  if (payload.sessionId !== "pending-mfa") {
    res.status(400).json({ error: "Token is not a pending MFA session" });
    return;
  }

  const user = findUserById(payload.sub);
  if (!user || !user.mfaSecret) {
    res.status(401).json({ error: "User not found or MFA not configured" });
    return;
  }

  const valid = verifyTotpCode(user.mfaSecret, code);

  if (!valid) {
    recordAuditEvent({
      userId: user.id,
      tenantId: user.tenantId,
      event: "mfa.verify.failed",
      outcome: "failure",
      ipAddress: ip,
      userAgent: ua,
      deviceId: payload.deviceId,
      metadata: null,
      dppaCategory: "authentication",
    });
    res.status(401).json({ error: "Invalid MFA code" });
    return;
  }

  const refreshToken = generateRefreshToken();
  const session = createSession({
    userId: user.id,
    tenantId: user.tenantId,
    refreshToken,
    deviceId: payload.deviceId,
    deviceName: "Mobile device",
    devicePlatform: "mobile",
    ipAddress: ip,
    userAgent: ua,
    expiresAt: refreshTokenExpiresAt(),
    revokedAt: null,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: session.id,
    deviceId: payload.deviceId,
    email: user.email,
    fullName: user.fullName,
  });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "mfa.verify.success",
    outcome: "success",
    ipAddress: ip,
    userAgent: ua,
    deviceId: payload.deviceId,
    metadata: { sessionId: session.id },
    dppaCategory: "authentication",
  });

  res.json({
    accessToken,
    refreshToken,
    expiresIn: 900,
    user: sanitizeUser(user),
    permissions: canAccessSummary(user.role),
  });
});

// ── POST /auth/refresh ───────────────────────────────────────────────────────
/**
 * Exchange refresh token for a new access token.
 * Validates that the session has not been revoked or expired.
 */
router.post("/refresh", async (req: Request, res: Response) => {
  const parse = refreshSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { refreshToken } = parse.data;
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? "unknown";

  const session = findSessionByToken(refreshToken);

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    recordAuditEvent({
      userId: session?.userId ?? null,
      tenantId: session?.tenantId ?? null,
      event: "token.refresh.failed",
      outcome: "failure",
      ipAddress: ip,
      userAgent: ua,
      deviceId: session?.deviceId ?? null,
      metadata: { reason: session?.revokedAt ? "revoked" : session?.expiresAt < new Date() ? "expired" : "not_found" },
      dppaCategory: "authentication",
    });
    res.status(401).json({ error: "Refresh token is invalid, revoked, or expired" });
    return;
  }

  const user = findUserById(session.userId);
  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  touchSession(refreshToken);

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: session.id,
    deviceId: session.deviceId,
    email: user.email,
    fullName: user.fullName,
  });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "token.refresh.success",
    outcome: "success",
    ipAddress: ip,
    userAgent: ua,
    deviceId: session.deviceId,
    metadata: { sessionId: session.id },
    dppaCategory: "authentication",
  });

  res.json({ accessToken, expiresIn: 900 });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
/**
 * Revoke the current session's refresh token.
 * Optionally revoke all sessions with ?all=true.
 */
router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? "unknown";
  const auth = req.auth!;
  const all = req.query["all"] === "true";

  if (all) {
    revokeAllUserSessions(auth.sub);
  } else {
    revokeSession(auth.sessionId);
  }

  recordAuditEvent({
    userId: auth.sub,
    tenantId: auth.tenantId,
    event: all ? "logout.all_sessions" : "logout.single_session",
    outcome: "success",
    ipAddress: ip,
    userAgent: ua,
    deviceId: auth.deviceId,
    metadata: { sessionId: auth.sessionId },
    dppaCategory: "authentication",
  });

  res.json({ ok: true });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
/**
 * Return the currently authenticated user's profile and permissions.
 */
router.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.auth!.sub);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    user: sanitizeUser(user),
    permissions: canAccessSummary(user.role),
    dppaCompliant: !!user.dppaConsentAt,
  });
});

// ── MFA Setup ─────────────────────────────────────────────────────────────────

/**
 * Initiate TOTP MFA setup — returns a TOTP secret and otpauth URL.
 * The client must confirm with a valid code before MFA is activated.
 */
router.post("/mfa/setup", requireAuth, (_req: Request, res: Response) => {
  const user = findUserById(_req.auth!.sub);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { secret, otpauthUrl } = generateTotpSecret(user.email);
  updateUser(user.id, { mfaPendingSecret: secret });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "mfa.setup.initiated",
    outcome: "success",
    ipAddress: getClientIp(_req),
    userAgent: _req.headers["user-agent"] ?? "unknown",
    deviceId: _req.auth!.deviceId,
    metadata: null,
    dppaCategory: "settings",
  });

  res.json({
    secret,
    otpauthUrl,
    instructions: "Scan the QR code or enter the secret in your authenticator app (Google Authenticator, Authy, etc.). Then confirm with a code.",
  });
});

/**
 * Confirm MFA setup with a valid TOTP code.
 * Activates MFA for the account.
 */
router.post("/mfa/confirm", requireAuth, (req: Request, res: Response) => {
  const parse = mfaSetupVerifySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const user = findUserById(req.auth!.sub);
  if (!user || !user.mfaPendingSecret) {
    res.status(400).json({ error: "No pending MFA setup found. Call /mfa/setup first." });
    return;
  }

  const valid = verifyTotpCode(user.mfaPendingSecret, parse.data.code);
  if (!valid) {
    res.status(400).json({ error: "Invalid TOTP code. Please check your authenticator and try again." });
    return;
  }

  updateUser(user.id, {
    mfaEnabled: true,
    mfaSecret: user.mfaPendingSecret,
    mfaPendingSecret: null,
  });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "mfa.enabled",
    outcome: "success",
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? "unknown",
    deviceId: req.auth!.deviceId,
    metadata: null,
    dppaCategory: "settings",
  });

  res.json({ ok: true, message: "MFA has been enabled for your account." });
});

/**
 * Disable MFA — requires a valid TOTP code to confirm.
 */
router.post("/mfa/disable", requireAuth, (req: Request, res: Response) => {
  const parse = mfaSetupVerifySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const user = findUserById(req.auth!.sub);
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ error: "MFA is not enabled for this account" });
    return;
  }

  const valid = verifyTotpCode(user.mfaSecret, parse.data.code);
  if (!valid) {
    res.status(400).json({ error: "Invalid TOTP code" });
    return;
  }

  updateUser(user.id, { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "mfa.disabled",
    outcome: "success",
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? "unknown",
    deviceId: req.auth!.deviceId,
    metadata: null,
    dppaCategory: "settings",
  });

  res.json({ ok: true, message: "MFA has been disabled." });
});

// ── Session / Device Management ───────────────────────────────────────────────

/**
 * List all active sessions for the current user.
 * Supports device management UI — "where I'm logged in".
 */
router.get("/sessions", requireAuth, (req: Request, res: Response) => {
  const sessions = findSessionsByUser(req.auth!.sub)
    .filter((s) => !s.revokedAt && s.expiresAt > new Date())
    .map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      devicePlatform: s.devicePlatform,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      isCurrent: s.id === req.auth!.sessionId,
    }));

  res.json({ sessions });
});

/**
 * Revoke a specific session (sign out from a device).
 */
router.delete("/sessions/:sessionId", requireAuth, (req: Request, res: Response) => {
  const sessionId = req.params["sessionId"];
  if (!sessionId) {
    res.status(400).json({ error: "Session ID required" });
    return;
  }

  const userSessions = findSessionsByUser(req.auth!.sub);
  const session = userSessions.find((s) => s.id === sessionId);

  if (!session) {
    res.status(404).json({ error: "Session not found or not owned by current user" });
    return;
  }

  revokeSession(sessionId);

  recordAuditEvent({
    userId: req.auth!.sub,
    tenantId: req.auth!.tenantId,
    event: "session.revoked",
    outcome: "success",
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? "unknown",
    deviceId: req.auth!.deviceId,
    metadata: { revokedSessionId: sessionId },
    dppaCategory: "session_management",
  });

  res.json({ ok: true });
});

// ── Audit Log ─────────────────────────────────────────────────────────────────

/**
 * Retrieve the auth audit log.
 * Admin: full tenant log. Others: own events only.
 * Uganda DPPA 2019 §23 — right to audit trail for health data access.
 */
router.get("/audit-log", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth!;
  const limit = Math.min(parseInt(req.query["limit"] as string) || 50, 500);
  const offset = parseInt(req.query["offset"] as string) || 0;

  let entries;
  if (auth.role === "Admin") {
    entries = getAuditLog({ tenantId: auth.tenantId, limit, offset });
  } else {
    entries = getAuditLog({ userId: auth.sub, limit, offset });
  }

  res.json({
    entries,
    dppaNotice: "Audit log maintained under Uganda Data Protection and Privacy Act 2019, Part IV §23.",
  });
});

// ── User Management (Admin only) ──────────────────────────────────────────────

/**
 * List all users in the tenant.
 */
router.get(
  "/users",
  requireAuth,
  requireRole("users", "list"),
  (req: Request, res: Response) => {
    const users = listUsers(req.auth!.tenantId).map(sanitizeUser);
    res.json({ users });
  },
);

/**
 * Create a new user in the tenant.
 */
router.post(
  "/users",
  requireAuth,
  requireRole("users", "create"),
  async (req: Request, res: Response) => {
    const parse = createUserSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }

    const existing = findUserByEmail(parse.data.email);
    if (existing) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    const passwordHash = await hashPassword(parse.data.password);
    const id = randomUUID();

    const { password: _p, ...rest } = parse.data;
    void _p;

    const newUser = {
      id,
      tenantId: req.auth!.tenantId,
      passwordHash,
      ...rest,
      facility: rest.facility ?? "",
      district: rest.district ?? "",
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      dppaConsentAt: null,
      dppaConsentIp: null,
      createdAt: new Date(),
      lastLoginAt: null,
    };

    addUser(newUser);

    recordAuditEvent({
      userId: req.auth!.sub,
      tenantId: req.auth!.tenantId,
      event: "user.created",
      outcome: "success",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? "unknown",
      deviceId: req.auth!.deviceId,
      metadata: { newUserId: id, email: parse.data.email, role: parse.data.role },
      dppaCategory: "user_management",
    });

    res.status(201).json({ user: sanitizeUser(newUser) });
  },
);

/**
 * Update user status (activate/deactivate). Admin only.
 */
router.patch(
  "/users/:userId/status",
  requireAuth,
  requireRole("users", "update"),
  (req: Request, res: Response) => {
    const { userId } = req.params;
    const { isActive } = req.body as { isActive: boolean };

    const user = findUserById(userId ?? "");
    if (!user || user.tenantId !== req.auth!.tenantId) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    updateUser(userId!, { isActive });

    if (!isActive) revokeAllUserSessions(userId!);

    recordAuditEvent({
      userId: req.auth!.sub,
      tenantId: req.auth!.tenantId,
      event: isActive ? "user.activated" : "user.deactivated",
      outcome: "success",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? "unknown",
      deviceId: req.auth!.deviceId,
      metadata: { targetUserId: userId },
      dppaCategory: "user_management",
    });

    res.json({ ok: true });
  },
);

// ── DPPA Compliance ───────────────────────────────────────────────────────────

/**
 * Record DPPA consent for the current user.
 * Uganda Data Protection and Privacy Act 2019 — Article 9 (Consent).
 */
router.post("/dppa/consent", requireAuth, (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const user = findUserById(req.auth!.sub);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  updateUser(user.id, { dppaConsentAt: new Date(), dppaConsentIp: ip });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "dppa.consent_recorded",
    outcome: "success",
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? "unknown",
    deviceId: req.auth!.deviceId,
    metadata: null,
    dppaCategory: "dppa_compliance",
  });

  res.json({
    ok: true,
    consentAt: new Date(),
    notice: "Consent recorded under Uganda Data Protection and Privacy Act 2019.",
  });
});

/**
 * Export personal data for the current user (DPPA right of access).
 */
router.get("/dppa/my-data", requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.auth!.sub);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const authHistory = getAuditLog({ userId: user.id, limit: 1000 });

  recordAuditEvent({
    userId: user.id,
    tenantId: user.tenantId,
    event: "dppa.data_export",
    outcome: "success",
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? "unknown",
    deviceId: req.auth!.deviceId,
    metadata: null,
    dppaCategory: "dppa_compliance",
  });

  res.json({
    notice: "Personal data export under Uganda Data Protection and Privacy Act 2019, §23.",
    profile: sanitizeUser(user),
    authHistory,
    exportedAt: new Date(),
  });
});

// ── Permissions helper ────────────────────────────────────────────────────────

type PermissionSummary = Record<string, Record<string, boolean>>;

function canAccessSummary(role: import("../lib/rbac.js").Role): PermissionSummary {
  const resources = [
    "patient", "image", "aiResults", "consultation", "referral",
    "billing", "analytics", "models", "tenantConfig", "session",
    "auditLog", "users",
  ] as const;
  const actions = ["create", "read", "update", "delete", "upload", "view", "manage", "list"] as const;

  const result: PermissionSummary = {};
  for (const resource of resources) {
    result[resource] = {};
    for (const action of actions) {
      result[resource]![action] = canAccess(role, resource as import("../lib/rbac.js").Resource, action as import("../lib/rbac.js").Action);
    }
  }
  return result;
}

// ── Push notification token registration ──────────────────────────────────────
router.put("/push-token", requireAuth, (req: Request, res: Response) => {
  if (!req.auth) { res.status(401).end(); return; }
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }
  updateUser(req.auth.sub, { pushToken: token });
  res.json({ ok: true });
});

export default router;
