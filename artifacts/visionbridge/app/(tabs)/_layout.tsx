import { Tabs } from "expo-router";
import React from "react";
import { AppNavigation } from "@/components/AppNavigation";

// All routes stay registered here so existing deep links and More rows keep
// working. AppNavigation decides which of them are visible primary items.
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

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppNavigation {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {ALL_SCREENS.map((name) => {
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{ title: name }}
          />
        );
      })}
    </Tabs>
  );
}
