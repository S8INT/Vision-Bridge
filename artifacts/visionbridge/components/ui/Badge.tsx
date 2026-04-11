import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "referral" | "urgent" | "muted";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

export function Badge({ label, variant = "default", size = "md" }: BadgeProps) {
  const colors = useColors();

  const getStyles = () => {
    switch (variant) {
      case "success":
        return { bg: colors.successLight, text: colors.normalText };
      case "warning":
        return { bg: colors.warningLight, text: "#92400e" };
      case "destructive":
      case "urgent":
        return { bg: colors.urgentBg, text: colors.urgentText };
      case "referral":
        return { bg: colors.referralBg, text: colors.referralText };
      case "muted":
        return { bg: colors.muted, text: colors.mutedForeground };
      default:
        return { bg: colors.secondary, text: colors.secondaryForeground };
    }
  };

  const { bg, text } = getStyles();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          paddingHorizontal: size === "sm" ? 6 : 10,
          paddingVertical: size === "sm" ? 2 : 4,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: text,
            fontSize: size === "sm" ? 10 : 12,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 100,
    alignSelf: "flex-start",
  },
  text: {
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
