import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Screening } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";

interface ScreeningCardProps {
  screening: Screening;
  patientName?: string;
  onPress: () => void;
}

function getRiskVariant(risk: string) {
  if (risk === "Urgent" || risk === "Severe") return "urgent";
  if (risk === "Moderate") return "warning";
  if (risk === "Mild") return "referral";
  return "success";
}

function getStatusVariant(status: string) {
  if (status === "Referred") return "urgent";
  if (status === "Reviewed") return "success";
  if (status === "Screened") return "referral";
  return "muted";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScreeningCard({ screening, patientName, onPress }: ScreeningCardProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + "14" }]}>
        <Feather name="eye" size={18} color={colors.primary} />
      </View>
      <View style={styles.content}>
        {patientName ? (
          <Text style={[styles.patient, { color: colors.foreground }]}>{patientName}</Text>
        ) : null}
        <View style={styles.badgeRow}>
          <Badge label={screening.aiRiskLevel} variant={getRiskVariant(screening.aiRiskLevel)} size="sm" />
          <Badge label={screening.status} variant={getStatusVariant(screening.status)} size="sm" />
          <Text style={[styles.confidence, { color: colors.mutedForeground }]}>
            {screening.aiConfidence}% conf.
          </Text>
        </View>
        <Text style={[styles.findings, { color: colors.mutedForeground }]} numberOfLines={1}>
          {screening.aiFindings.join(" · ")}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{formatDate(screening.capturedAt)}</Text>
          <View style={styles.qualityRow}>
            <Feather name="aperture" size={11} color={colors.mutedForeground} />
            <Text style={[styles.quality, { color: colors.mutedForeground }]}>{screening.imageQualityScore}%</Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 5,
  },
  patient: {
    fontSize: 14,
    fontWeight: "600",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  confidence: {
    fontSize: 11,
  },
  findings: {
    fontSize: 12,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  date: {
    fontSize: 11,
  },
  qualityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  quality: {
    fontSize: 11,
  },
});
