import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth, type UserRole } from "@/context/AuthContext";

// ── Per-role tab visibility ───────────────────────────────────────────────────
// Based on 5.3 RBAC Permission Matrix (VisionBridge UG v1.0) + Patient flow
const TAB_VISIBILITY: Record<UserRole, Record<string, boolean>> = {
  Admin:      { index: true, patients: true,  consultations: true,  analytics: true,  campaigns: true,  notifications: true,  visits: false, reports: false, education: false, "my-consultations": false },
  Doctor:     { index: true, patients: true,  consultations: true,  analytics: true,  campaigns: false, notifications: true,  visits: false, reports: false, education: false, "my-consultations": false },
  Technician: { index: true, patients: true,  consultations: false, analytics: false, campaigns: true,  notifications: true,  visits: false, reports: false, education: false, "my-consultations": false },
  CHW:        { index: true, patients: true,  consultations: false, analytics: false, campaigns: true,  notifications: false, visits: false, reports: false, education: false, "my-consultations": false },
  Viewer:     { index: true, patients: false, consultations: false, analytics: true,  campaigns: false, notifications: false, visits: false, reports: false, education: false, "my-consultations": false },
  Patient:    { index: true, patients: false, consultations: false, analytics: false, campaigns: false, notifications: true,  visits: true,  reports: true,  education: true,  "my-consultations": true  },
};

function useTabVisible(tabName: string): boolean {
  const { user } = useAuth();
  const role: UserRole = user?.role ?? "Viewer";
  return TAB_VISIBILITY[role]?.[tabName] ?? false;
}

// ── Native (iOS Liquid Glass) Layout ─────────────────────────────────────────
function NativeTabLayout() {
  const { user } = useAuth();
  const role: UserRole = user?.role ?? "Viewer";
  const vis = TAB_VISIBILITY[role] ?? {};

  return (
    <NativeTabs>
      {/* 1. Home — always first */}
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{role === "Patient" ? "Home" : "Dashboard"}</Label>
      </NativeTabs.Trigger>

      {/* 2. Daily work */}
      {vis.patients && (
        <NativeTabs.Trigger name="patients">
          <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
          <Label>Patients</Label>
        </NativeTabs.Trigger>
      )}
      {vis.visits && (
        <NativeTabs.Trigger name="visits">
          <Icon sf={{ default: "calendar", selected: "calendar" }} />
          <Label>Visits</Label>
        </NativeTabs.Trigger>
      )}

      {/* 3. Engage */}
      {vis.consultations && (
        <NativeTabs.Trigger name="consultations">
          <Icon sf={{ default: "message.circle", selected: "message.circle.fill" }} />
          <Label>Consults</Label>
        </NativeTabs.Trigger>
      )}
      {vis["my-consultations"] && (
        <NativeTabs.Trigger name="my-consultations">
          <Icon sf={{ default: "message.circle", selected: "message.circle.fill" }} />
          <Label>Consults</Label>
        </NativeTabs.Trigger>
      )}
      {vis.reports && (
        <NativeTabs.Trigger name="reports">
          <Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
          <Label>Reports</Label>
        </NativeTabs.Trigger>
      )}
      {vis.education && (
        <NativeTabs.Trigger name="education">
          <Icon sf={{ default: "book", selected: "book.fill" }} />
          <Label>Learn</Label>
        </NativeTabs.Trigger>
      )}

      {/* 4. Outreach & insight */}
      {vis.campaigns && (
        <NativeTabs.Trigger name="campaigns">
          <Icon sf={{ default: "map", selected: "map.fill" }} />
          <Label>Campaigns</Label>
        </NativeTabs.Trigger>
      )}
      {vis.analytics && (
        <NativeTabs.Trigger name="analytics">
          <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
          <Label>Analytics</Label>
        </NativeTabs.Trigger>
      )}

      {/* 5. Alerts — always last */}
      {vis.notifications && (
        <NativeTabs.Trigger name="notifications">
          <Icon sf={{ default: "bell", selected: "bell.fill" }} />
          <Label>Alerts</Label>
        </NativeTabs.Trigger>
      )}
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
  const { unreadCount } = useApp();
  const { user } = useAuth();
  const role: UserRole = user?.role ?? "Viewer";

  const showVisits           = useTabVisible("visits");
  const showReports          = useTabVisible("reports");
  const showEducation        = useTabVisible("education");
  const showPatients         = useTabVisible("patients");
  const showConsultations    = useTabVisible("consultations");
  const showAnalytics        = useTabVisible("analytics");
  const showCampaigns        = useTabVisible("campaigns");
  const showNotifications    = useTabVisible("notifications");
  const showMyConsultations  = useTabVisible("my-consultations");

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
      {/* 1. Home — always first */}
      <Tabs.Screen
        name="index"
        options={{
          title: role === "Patient" ? "Home" : "Dashboard",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="house" tintColor={color} size={24} /> : <Feather name="home" size={24} color={color} />,
        }}
      />

      {/* 2. Daily work */}
      <Tabs.Screen
        name="patients"
        options={{
          title: "Patients",
          ...(showPatients ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person.2" tintColor={color} size={24} /> : <Feather name="users" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{
          title: "Visits",
          ...(showVisits ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="calendar" tintColor={color} size={24} /> : <Feather name="calendar" size={24} color={color} />,
        }}
      />

      {/* 3. Engage */}
      <Tabs.Screen
        name="consultations"
        options={{
          title: "Consults",
          ...(showConsultations ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="message.circle" tintColor={color} size={24} /> : <Feather name="message-circle" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-consultations"
        options={{
          title: "Consults",
          ...(showMyConsultations ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="message.circle" tintColor={color} size={24} /> : <Feather name="message-circle" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          ...(showReports ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="doc.text" tintColor={color} size={24} /> : <Feather name="file-text" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="education"
        options={{
          title: "Learn",
          ...(showEducation ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="book" tintColor={color} size={24} /> : <Feather name="book-open" size={24} color={color} />,
        }}
      />

      {/* 4. Outreach & insight */}
      <Tabs.Screen
        name="campaigns"
        options={{
          title: "Campaigns",
          ...(showCampaigns ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="map" tintColor={color} size={24} /> : <Feather name="map-pin" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          ...(showAnalytics ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="chart.bar" tintColor={color} size={24} /> : <Feather name="bar-chart-2" size={24} color={color} />,
        }}
      />

      {/* 5. Alerts — always last */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          ...(showNotifications ? {} : hide),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="bell" tintColor={color} size={24} /> : <Feather name="bell" size={24} color={color} />,
          tabBarBadge: showNotifications && unreadCount > 0 ? unreadCount : undefined,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
