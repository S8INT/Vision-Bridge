import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useQueueAttention } from "@/hooks/useQueueAttention";
import { resolveNavigation, type NavigationItem } from "@/lib/navConfig";

/**
 * The one shared navigation presentation for every authenticated role.
 * Permissions and ordering come from resolveNavigation; this component only
 * renders the resolved items and forwards tab presses to Expo Router.
 */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

export function AppNavigation({ state, descriptors, navigation }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, permissions } = useAuth();
  const { unreadCount } = useApp();
  const role: UserRole = user?.role ?? "Viewer";
  const resolved = resolveNavigation(role, permissions);
  const queueCount = useQueueAttention(resolved.secondary.some((item) => item.route === "queue"));

  const primary = resolved.primary.map((item) => ({ item, isMore: false }));
  const items = resolved.secondary.length > 0 || resolved.contextual.length > 0
    ? [...primary, { item: null, isMore: true as const }]
    : primary;
  const currentRouteName = state.routes[state.index]?.name;
  const secondaryRoutes = new Set([
    ...resolved.secondary.map((item) => item.route),
    ...resolved.contextual.map((item) => item.route),
  ]);

  const moreBadge =
    (resolved.secondary.some((item) => item.route === "notifications") ? unreadCount : 0) +
    (resolved.secondary.some((item) => item.route === "queue") ? queueCount : 0);

  function press(item: NavigationItem | null) {
    const routeName = item?.route ?? "more";
    const route = state.routes.find((candidate) => candidate.name === routeName);
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && state.index !== state.routes.indexOf(route)) {
      navigation.navigate(route.name);
    }
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 64 + Math.max(insets.bottom, 8),
        },
      ]}
    >
      {items.map(({ item, isMore }) => {
        const routeName = item?.route ?? "more";
        const route = state.routes.find((candidate) => candidate.name === routeName);
        const focused = isMore
          ? currentRouteName === "more" || secondaryRoutes.has(currentRouteName ?? "")
          : currentRouteName === routeName;
        const meta = item;
        const badge = isMore
          ? moreBadge
          : item?.route === "notifications"
            ? unreadCount
            : 0;
        const label = item?.label ?? "More";
        const icon = item?.feather ?? "grid";
        const accessibilityLabel =
          descriptors[route?.key ?? ""]?.options.tabBarAccessibilityLabel ?? label;

        return (
          <Pressable
            key={item?.id ?? "more"}
            accessibilityRole="tab"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ selected: focused }}
            onPress={() => press(meta)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View
              style={[
                styles.iconWrap,
                focused && { backgroundColor: colors.secondary },
              ]}
            >
              <Feather
                name={icon as keyof typeof Feather.glyphMap}
                size={22}
                color={focused ? colors.primary : colors.mutedForeground}
              />
              {badge > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
                  <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
                </View>
              )}
            </View>
            <Text
              allowFontScaling
              style={[
                styles.label,
                { color: focused ? colors.primary : colors.mutedForeground },
                focused && styles.labelActive,
              ]}
            >
              {label}
            </Text>
            {focused && <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  item: {
    flex: 1,
    minWidth: 44,
    height: 52,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 1,
  },
  pressed: { opacity: 0.7 },
  iconWrap: {
    width: 34,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  label: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 1,
    textAlign: "center",
  },
  labelActive: { fontWeight: "700" },
  activeIndicator: {
    width: 18,
    height: 2,
    borderRadius: 1,
    marginTop: 2,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
});