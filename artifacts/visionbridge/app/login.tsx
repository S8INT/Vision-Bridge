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

  async function doLogin(emailVal: string, passwordVal: string) {
    setLoading(true);
    setError(null);

    const result = await login(emailVal.trim(), passwordVal, {
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

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    await doLogin(email, password);
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 },
    logo: { alignItems: "center", marginBottom: 40 },
    logoIcon: {
      width: 68, height: 68, borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center", marginBottom: 16,
    },
    logoIconText: { fontSize: 30, color: "#fff" },
    appName: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.text, letterSpacing: -0.5 },
    tagline: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    card: {
      backgroundColor: colors.card, borderRadius: colors.radius, padding: 24,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    },
    title: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 4 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 24 },
    label: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.text, marginBottom: 6 },
    input: {
      height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_400Regular",
      color: colors.text, backgroundColor: colors.muted, marginBottom: 16,
    },
    passwordWrapper: {
      flexDirection: "row", alignItems: "center", borderWidth: 1,
      borderColor: colors.border, borderRadius: 10,
      backgroundColor: colors.muted, marginBottom: 20,
    },
    passwordInput: {
      flex: 1, height: 46, paddingHorizontal: 14,
      fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text,
    },
    eyeBtn: { paddingHorizontal: 14 },
    eyeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary },
    errorBox: {
      backgroundColor: colors.urgentBg, borderWidth: 1, borderColor: colors.urgentBorder,
      borderRadius: 8, padding: 12, marginBottom: 16,
    },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.urgentText },
    loginBtn: {
      height: 48, backgroundColor: colors.primary, borderRadius: 10,
      alignItems: "center", justifyContent: "center",
    },
    loginBtnDisabled: { opacity: 0.6 },
    loginBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
    dppaNotice: { marginTop: 20, padding: 12, backgroundColor: colors.muted, borderRadius: 8 },
    dppaText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 16 },
    signupLink: { alignItems: "center", marginTop: 18, paddingVertical: 6 },
    signupLinkText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    signupLinkAction: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
  });

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <View style={s.logoIcon}>
            <Text style={s.logoIconText}>👁</Text>
          </View>
          <Text style={s.appName}>VisionBridge</Text>
          <Text style={s.tagline}>TeleOphthalmology Platform · Uganda</Text>
        </View>

        <View style={s.card}>
          <Text style={s.title}>Sign in</Text>
          <Text style={s.subtitle}>Access the clinical screening platform</Text>

          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
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

          <Text style={s.label}>Password</Text>
          <View style={s.passwordWrapper}>
            <TextInput
              style={s.passwordInput}
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
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
              <Text style={s.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.loginBtn, loading && s.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.loginBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <View style={s.dppaNotice}>
            <Text style={s.dppaText}>
              By signing in you consent to processing of health data under the Uganda Data Protection and Privacy Act 2019 (DPPA). Data is processed only for clinical screening and referral purposes.
            </Text>
          </View>

          <TouchableOpacity
            style={s.signupLink}
            onPress={() => router.push("/signup")}
            disabled={loading}
          >
            <Text style={s.signupLinkText}>
              New to VisionBridge?{" "}
              <Text style={s.signupLinkAction}>Create an account</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
