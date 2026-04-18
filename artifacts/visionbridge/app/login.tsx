/**
 * VisionBridge Login Screen
 *
 * Handles email + password authentication.
 * Redirects to MFA screen if MFA is required.
 * Includes DPPA consent notice (Uganda Data Protection and Privacy Act 2019).
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const DEMO_ACCOUNTS = [
    { label: "Admin", email: "admin@visionbridge.ug", password: "Admin1234!" },
    { label: "Doctor", email: "dr.okello@visionbridge.ug", password: "Doctor1234!" },
    { label: "Technician", email: "sarah.nakato@visionbridge.ug", password: "Tech1234!" },
    { label: "CHW", email: "chw.mbarara@visionbridge.ug", password: "CHW1234!" },
  ];

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await login(email.trim(), password, {
      deviceName: "VisionBridge Mobile",
      devicePlatform: Platform.OS,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.mfaRequired) {
      router.push("/mfa");
      return;
    }

    router.replace("/(tabs)");
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 48,
    },
    logo: {
      alignItems: "center",
      marginBottom: 40,
    },
    logoIcon: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    logoIconText: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    appName: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    tagline: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    title: {
      fontSize: 20,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 24,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.text,
      marginBottom: 6,
    },
    input: {
      height: 46,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
      backgroundColor: colors.muted,
      marginBottom: 16,
    },
    passwordWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.muted,
      marginBottom: 20,
    },
    passwordInput: {
      flex: 1,
      height: 46,
      paddingHorizontal: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    passwordToggle: {
      paddingHorizontal: 14,
    },
    passwordToggleText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
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
    },
    loginBtn: {
      height: 48,
      backgroundColor: colors.primary,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    loginBtnDisabled: {
      opacity: 0.6,
    },
    loginBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    dppaNotice: {
      marginTop: 20,
      padding: 12,
      backgroundColor: colors.muted,
      borderRadius: 8,
    },
    dppaText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 16,
    },
    demoSection: {
      marginTop: 24,
    },
    demoTitle: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 12,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    demoRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
    },
    demoBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: colors.secondary,
      borderRadius: 8,
    },
    demoBtnText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.secondaryForeground,
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>👁</Text>
          </View>
          <Text style={styles.appName}>VisionBridge</Text>
          <Text style={styles.tagline}>TeleOphthalmology Platform · Uganda</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Access the clinical screening platform</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@visionbridge.ug"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dppaNotice}>
            <Text style={styles.dppaText}>
              By signing in you consent to the processing of health data under the Uganda Data Protection and Privacy Act 2019 (DPPA). Data is processed only for clinical screening and referral purposes.
            </Text>
          </View>
        </View>

        <View style={styles.demoSection}>
          <Text style={styles.demoTitle}>Demo accounts</Text>
          <View style={styles.demoRow}>
            {DEMO_ACCOUNTS.map((account) => (
              <TouchableOpacity
                key={account.label}
                style={styles.demoBtn}
                onPress={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
              >
                <Text style={styles.demoBtnText}>{account.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
