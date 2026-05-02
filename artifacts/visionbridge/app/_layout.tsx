import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function PushNotificationRegistrar() {
  usePushNotifications();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mfaChallenge } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "login" || segments[0] === "mfa" || segments[0] === "signup";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    } else if (mfaChallenge && segments[0] !== "mfa") {
      router.replace("/mfa");
    }
  }, [isAuthenticated, isLoading, mfaChallenge, segments]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back", headerTintColor: "#0ea5e9" }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="mfa" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="patient/register"
        options={{ title: "Register Patient", presentation: "modal" }}
      />
      <Stack.Screen
        name="patient/[id]"
        options={{ title: "Patient" }}
      />
      <Stack.Screen
        name="patient/profile"
        options={{ title: "My Profile & Medical History", presentation: "modal" }}
      />
      <Stack.Screen
        name="patient/consult-request"
        options={{ title: "Request Consultation", presentation: "modal" }}
      />
      <Stack.Screen
        name="screening/new"
        options={{ title: "New Screening", presentation: "modal" }}
      />
      <Stack.Screen
        name="screening/[id]"
        options={{ title: "Screening" }}
      />
      <Stack.Screen
        name="consultation/[id]"
        options={{ title: "Consultation" }}
      />
      <Stack.Screen
        name="consultation/call"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="referral/new"
        options={{ title: "Create Referral", presentation: "modal" }}
      />
      <Stack.Screen
        name="referral/[id]"
        options={{ title: "Referral" }}
      />
      <Stack.Screen
        name="appointment/book"
        options={{ title: "Book Appointment", presentation: "modal" }}
      />
      <Stack.Screen
        name="appointment/[id]"
        options={{ title: "Appointment" }}
      />
      <Stack.Screen
        name="campaign/new"
        options={{ title: "New Campaign", presentation: "modal" }}
      />
      <Stack.Screen
        name="campaign/[id]"
        options={{ title: "Campaign" }}
      />
      <Stack.Screen
        name="profile"
        options={{ title: "Profile & Settings", presentation: "modal" }}
      />
      <Stack.Screen
        name="doctor/schedule"
        options={{ title: "My Schedule", presentation: "modal" }}
      />
      <Stack.Screen
        name="admin/users"
        options={{ title: "Manage Staff", presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <PushNotificationRegistrar />
                <AuthGuard>
                  <AppProvider>
                    <RootLayoutNav />
                  </AppProvider>
                </AuthGuard>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
