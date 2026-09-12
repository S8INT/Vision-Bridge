import type { UserRole } from "./jwt.js";

export const STAFF_CONSULTATION_QUEUE_ROLES = ["Admin", "Doctor"] as const;

export function canViewConsultationQueue(role: UserRole): boolean {
  return STAFF_CONSULTATION_QUEUE_ROLES.includes(role as (typeof STAFF_CONSULTATION_QUEUE_ROLES)[number]);
}

export function scopePatientRows<T extends { patientId: string | null }>(
  rows: readonly T[],
  patientId: string,
): T[] {
  return rows.filter((row) => row.patientId === patientId);
}