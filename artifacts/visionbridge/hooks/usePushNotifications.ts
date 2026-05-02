import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "VisionBridge",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0ea5e9",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

async function savePushToken(token: string, accessToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/push-token`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.warn("[push] Failed to save push token:", err);
  }
}

function navigateFromNotification(data: Record<string, unknown>): void {
  const screen = data?.screen as string | undefined;
  const consultationId = data?.consultationId as string | undefined;

  if (screen === "consultations" && consultationId) {
    // Doctor tap — go straight to the consultation detail view
    router.push(`/consultation/${consultationId}` as never);
  } else if (screen === "my-consultations" || (consultationId && screen !== "consultations")) {
    // Patient tap — go to My Consultations with the item highlighted
    const path = consultationId
      ? `/(tabs)/my-consultations?highlightId=${encodeURIComponent(consultationId)}`
      : "/(tabs)/my-consultations";
    router.push(path as never);
  }
}

export function usePushNotifications() {
  const { isAuthenticated, accessToken } = useAuth();
  const registered = useRef(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    if (!registered.current) {
      registered.current = true;

      registerForPushNotifications()
        .then((token) => {
          if (token) savePushToken(token, accessToken);
        })
        .catch(console.error);

      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification) => {
          console.log("[push] Received:", notification.request.content.title);
        },
      );

      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as Record<string, unknown>;
          navigateFromNotification(data);
        },
      );

      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as Record<string, unknown>;
        navigateFromNotification(data);
      });
    }

    return () => {
      registered.current = false;
      notificationListener.current?.remove();
      responseListener.current?.remove();
      notificationListener.current = null;
      responseListener.current = null;
    };
  }, [isAuthenticated, accessToken]);
}
