/**
 * Notification fan-out helpers.
 *
 * Every clinical event that reaches a user does the same three things: resolve
 * the recipient's Expo push token, send the push, and persist an in-app
 * notification row. These helpers keep that sequence in one place and make it
 * best-effort (failures are logged, never propagated to the request).
 */

import { db, notificationsTable, type Notification } from "@workspace/db";
import { findUserById } from "./authStore.js";
import { sendExpoPush } from "./push.js";

export interface NotifyOptions {
  /** Auth user id of the recipient; a missing user or push token is a no-op push. */
  recipientUserId: string | null | undefined;
  tenantId: string;
  title: string;
  body: string;
  /** Push text when it should differ from the stored in-app body. */
  pushBody?: string;
  /** Payload forwarded to the mobile app for deep-linking. */
  data?: Record<string, unknown>;
  patientId?: string | null;
  consultationId?: string | null;
  type?: Notification["type"];
}

/** Sends a push (if the recipient has a token) and records an in-app notification. */
export async function notifyUser(options: NotifyOptions): Promise<void> {
  const { recipientUserId, tenantId, title, body, pushBody, data, patientId, consultationId, type = "ConsultationUpdate" } = options;

  const user = recipientUserId ? findUserById(recipientUserId) : null;
  if (user?.pushToken) {
    await sendExpoPush({ token: user.pushToken, title, body: pushBody ?? body, data: data ?? {} });
  }

  if (db) {
    await db.insert(notificationsTable).values({
      tenantId,
      type,
      title,
      body,
      read: false,
      createdAt: new Date(),
      patientId: patientId ?? null,
      consultationId: consultationId ?? null,
    });
  }
}

/** Fire-and-forget variant used on request paths that already responded. */
export function notifyUserInBackground(scope: string, options: NotifyOptions): void {
  void notifyUser(options).catch((err) => {
    console.error(`[${scope}] notification failed (non-fatal):`, err);
  });
}

/** Standard "a consultation was assigned to you" doctor notification. */
export function notifyDoctorOfAssignment(params: {
  scope: string;
  doctorUserId: string | null | undefined;
  tenantId: string;
  patientName: string;
  priority: string;
  consultationId: string;
  patientId: string;
}): void {
  notifyUserInBackground(params.scope, {
    recipientUserId: params.doctorUserId,
    tenantId: params.tenantId,
    title: "New Consultation Assigned",
    body: `${params.patientName} · ${params.priority} priority consultation has been assigned to you.`,
    pushBody: `${params.patientName} · ${params.priority} priority. Tap to review their case.`,
    data: { consultationId: params.consultationId, screen: "consultations" },
    patientId: params.patientId,
    consultationId: params.consultationId,
  });
}
