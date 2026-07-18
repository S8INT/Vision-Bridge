import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Badge, Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useQueueAttention } from "@/hooks/useQueueAttention";
import { getRoleNav, SCREEN_META, screenTitle } from "@/lib/navConfig";

// All routes in this group, in tab-bar display order. Placement per role
// (tab vs More hub) is decided by getRoleNav in lib/navConfig.
const ALL_SCREENS = [
  "index",
  "patients",
  "visits",
  "consultations",
  "my-consultations",
  "reports",
  "education",
  "campaigns",
  "analytics",
  "queue",
  "notifications",
] as const;

function useNavState() {
  const { user } = useAuth();
  const { unreadCount } = useApp();
  const role: UserRole = user?.role ?? "Viewer";
  const nav = getRoleNav(role);
  const queueInMore = nav.more.includes("queue");
  const queueCount = useQueueAttention(queueInMore);
  // Aggregate badge on the More tab: unread alerts (if Alerts lives in
  // More) + uploads needing attention (if Queue lives in More).
  const moreBadge =
    (nav.more.includes("notifications") ? unreadCount : 0) +
    (queueInMore ? queueCount : 0);
  return { role, nav, unreadCount, moreBadge };
}

// ── Native (iOS Liquid Glass) Layout ─────────────────────────────────────────
function NativeTabLayout() {
  const { role, nav, unreadCount, moreBadge } = useNavState();
  const tabSet = new Set(nav.tabs);

  return (
    <NativeTabs>
      {ALL_SCREENS.map((name) => {
        const meta = SCREEN_META[name];
        const visible = tabSet.has(name);
        return (
          <NativeTabs.Trigger key={name} name={name} hidden={!visible}>
            <Icon sf={{ default: meta.sf as any, selected: meta.sfSelected as any }} />
            <Label>{screenTitle(name, role)}</Label>
            {name === "notifications" && visible && unreadCount > 0 && (
              <Badge>{String(unreadCount)}</Badge>
            )}
          </NativeTabs.Trigger>
        );
      })}
      <NativeTabs.Trigger name="more" hidden={!nav.hasMore}>
        <Icon sf={{ default: "ellipsis.circle", selected: "ellipsis.circle.fill" }} />
        <Label>More</Label>
        {nav.hasMore && moreBadge > 0 && <Badge>{String(moreBadge)}</Badge>}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ── Classic (cross-platform) Layout ──────────────────────────────────────────
function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { role, nav, unreadCount, moreBadge } = useNavState();
  const tabSet = new Set(nav.tabs);

  const hide = { tabBarButton: () => null } as const;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "#94a3b8",
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#ffffff",
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          height: isWeb ? 84 : 68,
          paddingBottom: isWeb ? 16 : 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#ffffff", borderTopLeftRadius: 16, borderTopRightRadius: 16 }]} />
          ),
      }}
    >
      {ALL_SCREENS.map((name) => {
        const meta = SCREEN_META[name];
        const visible = tabSet.has(name);
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: screenTitle(name, role),
              ...(visible ? {} : hide),
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name={meta.sf as any} tintColor={color} size={24} />
                ) : (
                  <Feather name={meta.feather as any} size={24} color={color} />
                ),
              ...(name === "notifications"
                ? { tabBarBadge: visible && unreadCount > 0 ? unreadCount : undefined }
                : {}),
            }}
          />
        );
      })}

      {/* More hub — last tab, only for roles with overflow features */}
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          ...(nav.hasMore ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="ellipsis.circle" tintColor={color} size={24} />
            ) : (
              <Feather name="grid" size={24} color={color} />
            ),
          tabBarBadge: nav.hasMore && moreBadge > 0 ? moreBadge : undefined,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
