import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface InfoRowProps {
  label: string;
  value: string;
  valueColor?: string;
  /** Share of the row width given to the label; the value takes the rest. */
  labelFlex?: number;
}

/** Label/value line used by every detail screen's info sections. */
export function InfoRow({ label, value, valueColor, labelFlex = 0.4 }: InfoRowProps) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.mutedForeground, flex: labelFlex }]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor ?? colors.foreground, flex: 1 - labelFlex }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: "500", textAlign: "right" },
});
