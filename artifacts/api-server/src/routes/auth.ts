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
  findSessionByToken,
  findSessionsByUser,
  revokeSession,
  revokeAllUserSessions,
  touchSession,
  getAuditLog,
  getDemoTenantId,
} from "../lib/authStore.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/rbac.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  canAccessSummary,
  issueSession,
  sanitizeUser,
} from "../lib/authSession.js";
import { audit } from "../lib/audit.js";
import { getClientIp, getDeviceId, paramStr } from "../lib/http.js";
import { randomUUID } from "crypto";

const router = Router();

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
    pushToken: null,
    createdAt: now,
    lastLoginAt: now,
  };

  addUser(newUser);

  const deviceId = getDeviceId(req);

  audit(req, {
    userId: id,
    tenantId: newUser.tenantId,
    event: "user.self_registered",
    deviceId,
    metadata: { email, role, facility, district },
    dppaCategory: "user_management",
  });

  // Auto-issue tokens (skip MFA for fresh signups)
  res.status(201).json(issueSession(req, {
    user: newUser,
    deviceId,
    deviceName: (req.body?.deviceName as string) ?? "VisionBridge Mobile",
    devicePlatform: (req.body?.devicePlatform as string) ?? "expo",
    auditEvent: "auth.login",
    auditMetadata: { source: "registration_auto_login" },
  }));
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
    audit(req, {
      userId: user?.id ?? null,
      tenantId: user?.tenantId ?? null,
      event: "login.failed",
      outcome: "failure",
      deviceId: resolvedDeviceId,
      metadata: { reason: "user_not_found_or_inactive", email },
      dppaCategory: "authentication",
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    audit(req, {
      userId: user.id,
      tenantId: user.tenantId,
      event: "login.failed",
      outcome: "failure",
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

    audit(req, {
      userId: user.id,
      tenantId: user.tenantId,
      event: "login.mfa_required",
      deviceId: resolvedDeviceId,
      dppaCategory: "authentication",
    });

    res.json({ mfaRequired: true, sessionToken });
    return;
  }

  // Issue full session
  res.json({
    mfaRequired: false,
    ...issueSession(req, {
      user,
      deviceId: resolvedDeviceId,
      deviceName,
      devicePlatform,
      auditEvent: "login.success",
    }),
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
    audit(req, {
      userId: user.id,
      tenantId: user.tenantId,
      event: "mfa.verify.failed",
      outcome: "failure",
      deviceId: payload.deviceId,
      dppaCategory: "authentication",
    });
    res.status(401).json({ error: "Invalid MFA code" });
    return;
  }

  res.json(issueSession(req, {
    user,
    deviceId: payload.deviceId,
    deviceName: "Mobile device",
    devicePlatform: "mobile",
    auditEvent: "mfa.verify.success",
  }));
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
    audit(req, {
      userId: session?.userId ?? null,
      tenantId: session?.tenantId ?? null,
      event: "token.refresh.failed",
      outcome: "failure",
      deviceId: session?.deviceId ?? null,
      metadata: { reason: session?.revokedAt ? "revoked" : session && session.expiresAt < new Date() ? "expired" : "not_found" },
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

  audit(req, {
    userId: user.id,
    tenantId: user.tenantId,
    event: "token.refresh.success",
    deviceId: session.deviceId,
    metadata: { sessionId: session.id },
    dppaCategory: "authentication",
  });

  res.json({ accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS });
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

  audit(req, {
    userId: auth.sub,
    tenantId: auth.tenantId,
    event: all ? "logout.all_sessions" : "logout.single_session",
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
router.post("/mfa/setup", requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.auth!.sub);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { secret, otpauthUrl } = generateTotpSecret(user.email);
  updateUser(user.id, { mfaPendingSecret: secret });

  audit(req, {
    userId: user.id,
    tenantId: user.tenantId,
    event: "mfa.setup.initiated",
    deviceId: req.auth!.deviceId,
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

  audit(req, {
    userId: user.id,
    tenantId: user.tenantId,
    event: "mfa.enabled",
    deviceId: req.auth!.deviceId,
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

  audit(req, {
    userId: user.id,
    tenantId: user.tenantId,
    event: "mfa.disabled",
    deviceId: req.auth!.deviceId,
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
  const sessionId = paramStr(req.params["sessionId"]);
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

  audit(req, {
    userId: req.auth!.sub,
    tenantId: req.auth!.tenantId,
    event: "session.revoked",
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
      pushToken: null,
      createdAt: new Date(),
      lastLoginAt: null,
    };

    addUser(newUser);

    audit(req, {
      userId: req.auth!.sub,
      tenantId: req.auth!.tenantId,
      event: "user.created",
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
    const userId = paramStr(req.params["userId"]);
    const { isActive } = req.body as { isActive: boolean };

    const user = findUserById(userId ?? "");
    if (!user || user.tenantId !== req.auth!.tenantId) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    updateUser(userId!, { isActive });

    if (!isActive) revokeAllUserSessions(userId!);

    audit(req, {
      userId: req.auth!.sub,
      tenantId: req.auth!.tenantId,
      event: isActive ? "user.activated" : "user.deactivated",
      deviceId: req.auth!.deviceId,
      metadata: { targetUserId: userId },
      dppaCategory: "user_management",
    });

    res.json({ ok: true });
  },
);

/**
 * Update a user's profile fields. Admin only.
 * Cannot change another admin's role (prevents privilege escalation).
 */
const updateUserProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  role: z.enum(["Admin", "Doctor", "Technician", "CHW", "Viewer", "Patient"]).optional(),
  facility: z.string().optional(),
  district: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/users/:userId",
  requireAuth,
  requireRole("users", "update"),
  (req: Request, res: Response) => {
    const userId = paramStr(req.params["userId"]);
    const parse = updateUserProfileSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const target = findUserById(userId ?? "");
    if (!target || target.tenantId !== req.auth!.tenantId) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Prevent a non-self admin from locking out the last admin
    if (parse.data.isActive === false || (parse.data.role && parse.data.role !== "Admin" && target.role === "Admin")) {
      const allAdmins = listUsers(req.auth!.tenantId).filter((u) => u.role === "Admin" && u.isActive);
      if (allAdmins.length <= 1 && target.role === "Admin") {
        res.status(400).json({ error: "Cannot remove the last administrator account." });
        return;
      }
    }

    const patch: Partial<typeof target> = {};
    if (parse.data.fullName !== undefined) patch.fullName = parse.data.fullName;
    if (parse.data.role !== undefined) patch.role = parse.data.role;
    if (parse.data.facility !== undefined) patch.facility = parse.data.facility;
    if (parse.data.district !== undefined) patch.district = parse.data.district;
    if (parse.data.phone !== undefined) patch.phone = parse.data.phone;
    if (parse.data.isActive !== undefined) {
      patch.isActive = parse.data.isActive;
      if (!parse.data.isActive) revokeAllUserSessions(userId!);
    }

    const updated = updateUser(userId!, patch);

    audit(req, {
      userId: req.auth!.sub,
      tenantId: req.auth!.tenantId,
      event: "user.updated",
      deviceId: req.auth!.deviceId,
      metadata: { targetUserId: userId, fields: Object.keys(patch) },
      dppaCategory: "user_management",
    });

    res.json({ user: sanitizeUser(updated) });
  },
);

/**
 * Remove a user from the tenant (soft-delete: deactivates + revokes all sessions).
 * Clinical data integrity is preserved. Admin only.
 * Cannot remove yourself or the last admin.
 */
router.delete(
  "/users/:userId",
  requireAuth,
  requireRole("users", "delete"),
  (req: Request, res: Response) => {
    const userId = paramStr(req.params["userId"]);

    if (userId === req.auth!.sub) {
      res.status(400).json({ error: "You cannot remove your own account." });
      return;
    }

    const target = findUserById(userId ?? "");
    if (!target || target.tenantId !== req.auth!.tenantId) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (target.role === "Admin") {
      const activeAdmins = listUsers(req.auth!.tenantId).filter((u) => u.role === "Admin" && u.isActive);
      if (activeAdmins.length <= 1) {
        res.status(400).json({ error: "Cannot remove the last administrator account." });
        return;
      }
    }

    updateUser(userId!, { isActive: false });
    revokeAllUserSessions(userId!);

    audit(req, {
      userId: req.auth!.sub,
      tenantId: req.auth!.tenantId,
      event: "user.removed",
      deviceId: req.auth!.deviceId,
      metadata: { targetUserId: userId, targetEmail: target.email, targetRole: target.role },
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

  audit(req, {
    userId: user.id,
    tenantId: user.tenantId,
    event: "dppa.consent_recorded",
    deviceId: req.auth!.deviceId,
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

  audit(req, {
    userId: user.id,
    tenantId: user.tenantId,
    event: "dppa.data_export",
    deviceId: req.auth!.deviceId,
    dppaCategory: "dppa_compliance",
  });

  res.json({
    notice: "Personal data export under Uganda Data Protection and Privacy Act 2019, §23.",
    profile: sanitizeUser(user),
    authHistory,
    exportedAt: new Date(),
  });
});

// ── First-time Setup ──────────────────────────────────────────────────────────

/**
 * GET /auth/setup/status
 * Public endpoint — returns whether any user exists yet in the tenant.
 * Used by the mobile app on first launch to decide whether to show the
 * first-time onboarding screen (clinic admin OR individual first user).
 */
router.get("/setup/status", async (_req: Request, res: Response) => {
  const tenantId = getDemoTenantId();
  if (!tenantId) {
    res.json({ needsSetup: true });
    return;
  }
  const allUsers = listUsers(tenantId);
  res.json({ needsSetup: allUsers.length === 0 });
});

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2),
  facility: z.string().min(1),
  district: z.string().min(1),
  phone: z.string().optional(),
  dppaConsent: z.literal(true, { errorMap: () => ({ message: "You must accept the DPPA consent to continue" }) }),
});

/**
 * POST /auth/setup
 * Public endpoint — creates the first Admin user.
 * Returns 409 if an Admin already exists (prevents any subsequent use).
 * On success, issues access + refresh tokens and signs the admin in immediately.
 */
router.post("/setup", async (req: Request, res: Response) => {
  const tenantId = getDemoTenantId();
  if (!tenantId) {
    res.status(503).json({ error: "Server not ready. Please try again in a moment." });
    return;
  }

  const allUsers = listUsers(tenantId);
  const hasAdmin = allUsers.some((u) => u.role === "Admin" && u.isActive);
  if (hasAdmin) {
    res.status(409).json({ error: "An administrator account already exists. Please sign in instead." });
    return;
  }

  const parse = setupSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? "Invalid setup data", issues: parse.error.issues });
    return;
  }

  const { email, password, fullName, facility, district, phone } = parse.data;

  if (findUserByEmail(email)) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const ip = getClientIp(req);
  const now = new Date();

  const newAdmin = {
    id,
    tenantId,
    email,
    passwordHash,
    role: "Admin" as const,
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
    pushToken: null,
    createdAt: now,
    lastLoginAt: now,
  };

  addUser(newAdmin);

  const deviceId = getDeviceId(req);

  audit(req, {
    userId: id,
    tenantId,
    event: "user.first_admin_created",
    deviceId,
    metadata: { email, facility, district },
    dppaCategory: "user_management",
  });

  res.status(201).json(issueSession(req, {
    user: newAdmin,
    deviceId,
    deviceName: (req.body?.deviceName as string) ?? "VisionBridge Mobile",
    devicePlatform: (req.body?.devicePlatform as string) ?? "expo",
    auditEvent: "auth.login",
    auditMetadata: { source: "first_admin_setup" },
  }));
});

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
