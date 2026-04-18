/**
 * VisionBridge MFA Verification Screen
 *
 * Presents a 6-digit TOTP entry for clinicians (Doctor / Admin)
 * with MFA enabled. Auto-verifies when all 6 digits are entered.
 */

import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function MfaScreen() {
  const colors = useColors();
  const { completeMfa, logout } = useAuth();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  async function handleVerify(value: string) {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
    setError(null);

    if (cleaned.length !== 6) return;

    setLoading(true);
    try {
      await completeMfa(cleaned);
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed. Try again.");
      setCode("");
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function handleCancel() {
    await logout();
    router.replace("/login");
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    header: {
      alignItems: "center",
      marginBottom: 40,
    },
    shield: {
      width: 72,
      height: 72,
      borderRadius: 18,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    shieldIcon: {
      fontSize: 32,
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 28,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    codeLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 16,
    },
    codeInputWrapper: {
      position: "relative",
      alignItems: "center",
      marginBottom: 24,
    },
    hiddenInput: {
      position: "absolute",
      opacity: 0,
      width: "100%",
      height: "100%",
    },
    digitRow: {
      flexDirection: "row",
      gap: 10,
    },
    digitBox: {
      width: 44,
      height: 54,
      borderWidth: 2,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    digitFilled: {
      borderColor: colors.primary,
      backgroundColor: colors.secondary,
    },
    digitEmpty: {
      borderColor: colors.border,
      backgroundColor: colors.muted,
    },
    digitText: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    errorBox: {
      backgroundColor: colors.urgentBg,
      borderWidth: 1,
      borderColor: colors.urgentBorder,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.urgentText,
      textAlign: "center",
    },
    hint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 18,
    },
    cancelBtn: {
      marginTop: 24,
      alignItems: "center",
      paddingVertical: 12,
    },
    cancelText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    loadingOverlay: {
      position: "absolute",
      inset: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.7)",
      borderRadius: colors.radius,
    },
  });

  const digits = code.padEnd(6, "").split("");

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.shield}>
          <Text style={styles.shieldIcon}>🔐</Text>
        </View>
        <Text style={styles.title}>Two-Factor Authentication</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code from your authenticator app to continue.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.codeLabel}>AUTHENTICATION CODE</Text>

        <TouchableOpacity
          style={styles.codeInputWrapper}
          activeOpacity={1}
          onPress={() => inputRef.current?.focus()}
        >
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={code}
            onChangeText={handleVerify}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            editable={!loading}
          />
          <View style={styles.digitRow}>
            {digits.map((d, i) => (
              <View
                key={i}
                style={[styles.digitBox, d ? styles.digitFilled : styles.digitEmpty]}
              >
                <Text style={styles.digitText}>{d || ""}</Text>
              </View>
            ))}
          </View>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.hint}>
          Open Google Authenticator, Authy, or another TOTP app.{"\n"}
          The code refreshes every 30 seconds.
        </Text>
      </View>

      <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
        <Text style={styles.cancelText}>Cancel — sign in as a different user</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}
