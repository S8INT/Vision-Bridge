/**
 * Status → Badge variant / colour mappings shared by cards and detail screens.
 */

import type { AppointmentStatus, CareCoordinationStatus, ScreeningStatus } from "@/context/AppContext";
import type { useColors } from "@/hooks/useColors";

export type BadgeVariant = "default" | "success" | "warning" | "destructive" | "referral" | "urgent" | "muted" | "mild";

type Colors = ReturnType<typeof useColors>;

export function getCareStatusVariant(status: CareCoordinationStatus): BadgeVariant {
  switch (status) {
    case "Completed":
    case "Reviewed":
      return "success";
    case "InReview":
      return "warning";
    case "Assigned":
    case "Referred":
      return "referral";
    default:
      return "muted";
  }
}

export function getCareStatusColor(status: CareCoordinationStatus, colors: Colors): string {
  switch (status) {
    case "Completed":
    case "Reviewed":
      return colors.success;
    case "Referred":
      return colors.primary;
    case "InReview":
      return colors.warning;
    case "Assigned":
      return colors.accent;
    default:
      return colors.mutedForeground;
  }
}

export function getAppointmentStatusVariant(status: AppointmentStatus): BadgeVariant {
  switch (status) {
    case "Confirmed":
      return "success";
    case "Requested":
      return "warning";
    case "NoShow":
      return "urgent";
    default:
      return "muted";
  }
}

export function getScreeningStatusVariant(status: ScreeningStatus | string): BadgeVariant {
  switch (status) {
    case "Referred":
      return "urgent";
    case "Reviewed":
      return "success";
    case "Screened":
      return "referral";
    default:
      return "muted";
  }
}

export function getPriorityVariant(priority: string): BadgeVariant {
  if (priority === "Emergency") return "urgent";
  if (priority === "Urgent") return "warning";
  return "muted";
}

export function getPriorityBarColor(priority: string, colors: Colors): string {
  if (priority === "Emergency") return colors.destructive;
  if (priority === "Urgent") return colors.warning;
  return colors.border;
}
