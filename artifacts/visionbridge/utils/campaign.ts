import type { CampaignStatus } from "@/context/AppContext";
import type { BadgeVariant } from "@/utils/status";

/** Screened-vs-target completion, clamped to 0–100. */
export function progressPercent(screened: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((screened / target) * 100)) : 0;
}

export function getCampaignVariant(status: CampaignStatus): BadgeVariant {
  if (status === "Active") return "success";
  if (status === "Completed") return "referral";
  if (status === "Cancelled") return "urgent";
  return "muted";
}
