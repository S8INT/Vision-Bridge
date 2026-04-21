import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  subtitle?: string;
}

export function StatCard({ label, value, icon, color, subtitle }: StatCardProps) {
  const colors = useColors();
  const { iconSize, font } = useResponsive();
  const iconColor = color || colors.primary;

  // Scale the wrap container so the icon stays centred and proportional.
  const iconBox = iconSize(36);
  const innerIcon = iconSize(18);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: iconColor + "18",
            width: iconBox,
            height: iconBox,
            borderRadius: iconBox / 3.5,
          },
        ]}
      >
        <Feather name={icon} size={innerIcon} color={iconColor} />
      </View>
      <Text style={[styles.value, { color: colors.foreground, fontSize: font(24) }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground, fontSize: font(12) }]}>{label}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: iconColor, fontSize: font(11) }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  value: {
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  label: {
    fontWeight: "500",
  },
  subtitle: {
    fontWeight: "600",
    marginTop: 2,
  },
});
