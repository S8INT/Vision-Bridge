/**
 * VisionBridge RBAC — Permission Matrix
 * Sourced from "5.3 RBAC Permission Matrix" (VisionBridge UG v1.0)
 *
 * Roles: Admin | Doctor | Technician | CHW | Viewer
 * Resources: patient | image | aiResults | consultation | referral |
 *            billing | analytics | models | tenantConfig | session | auditLog
 */

export type Role = "Admin" | "Doctor" | "Technician" | "CHW" | "Viewer" | "Patient";

export type Resource =
  | "patient"
  | "image"
  | "aiResults"
  | "consultation"
  | "referral"
  | "billing"
  | "analytics"
  | "models"
  | "tenantConfig"
  | "session"
  | "auditLog"
  | "mfa"
  | "users";

export type Action =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "upload"
  | "view"
  | "manage"
  | "deploy"
  | "configure"
  | "diagnose"
  | "issue"
  | "list";

type PermMatrix = {
  [R in Role]: Partial<Record<Resource, Action[]>>;
};

const PERMISSIONS: PermMatrix = {
  Admin: {
    patient: ["create", "read", "update", "delete", "list"],
    image: ["upload", "view", "delete"],
    aiResults: ["view"],
    consultation: ["read", "diagnose", "manage", "list"],
    referral: ["issue", "read", "manage", "list"],
    billing: ["manage"],
    analytics: ["view"],
    models: ["deploy"],
    tenantConfig: ["configure"],
    session: ["list", "delete"],
    auditLog: ["read", "list"],
    mfa: ["manage"],
    users: ["create", "read", "update", "delete", "list"],
  },
  Doctor: {
    patient: ["create", "read", "update", "list"],
    image: ["upload", "view"],
    aiResults: ["view"],
    consultation: ["read", "diagnose", "list"],
    referral: ["issue", "read", "list"],
    billing: [],
    analytics: ["view"],
    models: [],
    tenantConfig: [],
    session: ["list", "delete"],
    auditLog: [],
    mfa: ["manage"],
    users: [],
  },
  Technician: {
    patient: ["create", "read", "update", "list"],
    image: ["upload", "view"],
    aiResults: ["view"],
    consultation: ["read"],
    referral: ["read"],
    billing: [],
    analytics: ["view"],
    models: [],
    tenantConfig: [],
    session: ["list", "delete"],
    auditLog: [],
    mfa: ["manage"],
    users: [],
  },
  CHW: {
    patient: ["create", "read", "list"],
    image: ["upload"],
    aiResults: ["view"],
    consultation: [],
    referral: [],
    billing: [],
    analytics: ["view"],
    models: [],
    tenantConfig: [],
    session: ["list", "delete"],
    auditLog: [],
    mfa: [],
    users: [],
  },
  Viewer: {
    patient: ["read", "list"],
    image: ["view"],
    aiResults: ["view"],
    consultation: [],
    referral: [],
    billing: [],
    analytics: ["view"],
    models: [],
    tenantConfig: [],
    session: [],
    auditLog: [],
    mfa: [],
    users: [],
  },
  Patient: {
    patient: ["read", "update"],
    image: ["upload", "view"],
    aiResults: ["view"],
    consultation: ["create", "read", "list"],
    referral: ["read"],
    billing: [],
    analytics: [],
    models: [],
    tenantConfig: [],
    session: ["list", "delete"],
    auditLog: [],
    mfa: ["manage"],
    users: [],
  },
};

export function canAccess(role: Role, resource: Resource, action: Action): boolean {
  const allowed = PERMISSIONS[role]?.[resource] ?? [];
  return allowed.includes(action);
}

export function requirePermission(role: Role, resource: Resource, action: Action): void {
  if (!canAccess(role, resource, action)) {
    const err = new Error(`Role '${role}' cannot perform '${action}' on '${resource}'`);
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
}

export function getRolePermissions(role: Role): PermMatrix[Role] {
  return PERMISSIONS[role] ?? {};
}
