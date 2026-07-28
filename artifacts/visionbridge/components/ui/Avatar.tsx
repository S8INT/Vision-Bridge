import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";

interface AvatarProps {
  firstName: string;
  lastName: string;
  size?: number;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Circular initials avatar used wherever a patient is listed. */
export function Avatar({ firstName, lastName, size = 44, fontSize, style, children }: AvatarProps) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary + "18" },
        style,
      ]}
    >
      {children ?? (
        <Text style={[styles.text, { color: colors.primary, fontSize: fontSize ?? Math.round(size * 0.36) }]}>
          {firstName?.[0] ?? ""}{lastName?.[0] ?? ""}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  text: { fontWeight: "700" },
});
