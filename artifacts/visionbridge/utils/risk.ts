import { RiskLevel } from "@/context/AppContext";

export function getRiskVariant(risk: RiskLevel): "success" | "mild" | "warning" | "urgent" | "muted" {
  switch (risk) {
    case "Normal": return "success";
    case "Mild": return "mild";
    case "Moderate": return "warning";
    case "Severe": return "urgent";
    case "Urgent": return "urgent";
    default: return "muted";
  }
}

export function getRiskColor(risk: RiskLevel, colors: { success: string; accent: string; warning: string; destructive: string; mutedForeground: string }) {
  switch (risk) {
    case "Normal": return colors.success;
    case "Mild": return colors.accent;
    case "Moderate": return colors.warning;
    case "Severe": return colors.destructive;
    case "Urgent": return colors.destructive;
    default: return colors.mutedForeground;
  }
}
