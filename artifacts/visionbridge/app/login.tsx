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
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />

      {/* Hero header */}
      <View style={s.hero}>
        <View style={s.logoCircle}>
          <Text style={s.logoEmoji}>👁</Text>
        </View>
        <Text style={s.appName}>Eretina</Text>
        <Text style={s.tagline}>TeleOphthalmology Platform · Uganda</Text>
        <Text style={s.heroSub}>
          Connecting patients to specialist eye care — anywhere.
        </Text>
      </View>

      {/* Form card */}
      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>
          <Text style={s.cardTitle}>Welcome back</Text>
          <Text style={s.cardSubtitle}>Sign in to your clinical account</Text>

          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorIcon}>⚠️</Text>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Email */}
          <Text style={s.label}>Email address</Text>
          <TextInput
            style={[s.input, emailFocused && s.inputFocused]}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder="you@visionbridge.ug"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            editable={!loading}
          />

          {/* Password */}
          <Text style={s.label}>Password</Text>
          <View style={[s.passwordWrapper, passwordFocused && s.inputFocused]}>
            <TextInput
              style={s.passwordInput}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="Enter your password"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
            <TouchableOpacity
              style={s.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text style={s.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>

          {/* Login button */}
          <TouchableOpacity
            style={[s.loginBtn, loading && s.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.loginBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Signup link */}
          <TouchableOpacity
            style={s.signupLink}
            onPress={() => router.push("/signup")}
            disabled={loading}
          >
            <Text style={s.signupLinkText}>
              New to Eretina?{" "}
              <Text style={s.signupLinkAction}>Create an account</Text>
            </Text>
          </TouchableOpacity>

          {/* DPPA notice */}
          <View style={s.dppaNotice}>
            <Text style={s.dppaText}>
              🔒 By signing in you agree to processing of health data under the
              Uganda Data Protection & Privacy Act 2019 (DPPA).
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const PRIMARY = "#0ea5e9";
const PRIMARY_DARK = "#0284c7";

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },

  /* ── Hero ── */
  hero: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 72 : 56,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  logoEmoji: {
    fontSize: 38,
  },
  appName: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  heroSub: {
    fontSize: 15,
    fontWeight: "400",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 22,
  },

  /* ── Scroll / Card ── */
  scrollArea: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 15,
    fontWeight: "400",
    color: "#64748b",
    marginBottom: 24,
  },

  /* ── Error ── */
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
    gap: 8,
  },
  errorIcon: {
    fontSize: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#991b1b",
    lineHeight: 20,
  },

  /* ── Form fields ── */
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 18,
  },
  inputFocused: {
    borderColor: PRIMARY,
    backgroundColor: "#f0f9ff",
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    marginBottom: 24,
  },
  passwordInput: {
    flex: 1,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#0f172a",
  },
  eyeBtn: {
    paddingHorizontal: 16,
    height: 52,
    justifyContent: "center",
  },
  eyeText: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY,
  },

  /* ── Button ── */
  loginBtn: {
    height: 54,
    backgroundColor: PRIMARY,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PRIMARY_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnDisabled: {
    opacity: 0.65,
  },
  loginBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.3,
  },

  /* ── Signup link ── */
  signupLink: {
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 8,
  },
  signupLinkText: {
    fontSize: 14,
    color: "#64748b",
  },
  signupLinkAction: {
    color: PRIMARY,
    fontWeight: "700",
  },

  /* ── DPPA ── */
  dppaNotice: {
    marginTop: 20,
    padding: 14,
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  dppaText: {
    fontSize: 12,
    color: "#0369a1",
    lineHeight: 18,
  },
});
