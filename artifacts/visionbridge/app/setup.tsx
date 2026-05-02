import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useAuth, type AdminSetupInput } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const UGANDA_DISTRICTS = [
  "Mbarara", "Kampala", "Kabale", "Jinja", "Mbale", "Gulu",
  "Lira", "Arua", "Fort Portal", "Soroti", "Mukono", "Wakiso", "Other",
];

const PRIMARY = "#0ea5e9";
const PRIMARY_DARK = "#0284c7";

export default function SetupScreen() {
  const colors = useColors();
  const { adminSetup } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [facility, setFacility] = useState("");
  const [district, setDistrict] = useState("Mbarara");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [dppaConsent, setDppaConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateDetails(): boolean {
    if (fullName.trim().length < 2) { setError("Enter your full name."); return false; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return false; }
    if (facility.trim().length < 1) { setError("Enter your facility or hospital name."); return false; }
    if (!district) { setError("Select your district."); return false; }
    setError(null);
    return true;
  }

  function validatePassword(): boolean {
    if (password.length < 8) { setError("Password must be at least 8 characters."); return false; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return false; }
    if (!dppaConsent) { setError("You must accept the DPPA consent to continue."); return false; }
    setError(null);
    return true;
  }

  async function handleSetup() {
    if (!validatePassword()) return;
    setLoading(true);
    setError(null);

    const input: AdminSetupInput = {
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      facility: facility.trim(),
      district,
      phone: phone.trim() || undefined,
      dppaConsent: true,
    };

    const result = await adminSetup(input, {
      deviceName: "VisionBridge Mobile",
      devicePlatform: Platform.OS,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />

      <View style={s.hero}>
        <View style={s.logoCircle}>
          <Text style={s.logoEmoji}>👁</Text>
        </View>
        <Text style={s.appName}>Eretina</Text>
        <Text style={s.tagline}>First-Time Setup</Text>
        <Text style={s.heroSub}>
          Create your administrator account to get started.
        </Text>
      </View>

      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>

          <View style={s.adminBadge}>
            <Feather name="shield" size={14} color="#7c3aed" />
            <Text style={s.adminBadgeText}>Administrator Account</Text>
          </View>

          <View style={s.progress}>
            <View style={[s.progressDot, s.progressDotActive]} />
            <View style={[s.progressDot, step >= 2 && s.progressDotActive]} />
          </View>

          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorIcon}>⚠️</Text>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              <Text style={s.cardTitle}>Your details</Text>
              <Text style={s.cardSubtitle}>Tell us about yourself and the facility you manage.</Text>

              <Text style={s.label}>Full name</Text>
              <TextInput
                style={s.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Dr. Sarah Nakato"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                editable={!loading}
              />

              <Text style={s.label}>Email address</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="admin@hospital.ug"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
              />

              <Text style={s.label}>Phone <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+256 7XX XXX XXX"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                editable={!loading}
              />

              <Text style={s.label}>Facility / Hospital</Text>
              <TextInput
                style={s.input}
                value={facility}
                onChangeText={setFacility}
                placeholder="e.g. Mbarara RRH Eye Unit"
                placeholderTextColor="#94a3b8"
                editable={!loading}
              />

              <Text style={s.label}>District</Text>
              <View style={s.districtRow}>
                {UGANDA_DISTRICTS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[s.districtChip, district === d && s.districtChipActive]}
                    onPress={() => setDistrict(d)}
                    activeOpacity={0.75}
                    disabled={loading}
                  >
                    <Text style={[s.districtChipText, district === d && s.districtChipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={() => { if (validateDetails()) setStep(2); }}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={s.btnText}>Continue</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.cardTitle}>Secure your account</Text>
              <Text style={s.cardSubtitle}>Choose a strong password. Patient health data depends on it.</Text>

              <Text style={s.label}>Password</Text>
              <View style={s.pwWrap}>
                <TextInput
                  style={s.pwInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  editable={!loading}
                />
                <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
                  <Text style={s.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Confirm password</Text>
              <View style={s.pwWrap}>
                <TextInput
                  style={s.pwInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleSetup}
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={s.consent}
                onPress={() => setDppaConsent((v) => !v)}
                activeOpacity={0.8}
                disabled={loading}
              >
                <View style={[s.checkbox, dppaConsent && s.checkboxActive]}>
                  {dppaConsent ? <Feather name="check" size={14} color="#fff" /> : null}
                </View>
                <Text style={s.consentText}>
                  <Text style={s.consentBold}>Uganda DPPA 2019 Consent. </Text>
                  I consent to processing of personal information and patient health data I administer, in line with the Uganda Data Protection and Privacy Act 2019, for clinical screening, referral and care-coordination purposes.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={handleSetup}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="shield" size={18} color="#fff" />
                    <Text style={s.btnText}>Create admin account</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.backLink}
                onPress={() => { setStep(1); setError(null); }}
                disabled={loading}
              >
                <Text style={s.backLinkText}>← Back to details</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={s.notice}>
            <Text style={s.noticeText}>
              🔒 This setup endpoint is permanently disabled once an admin account exists. Any subsequent admin accounts must be created by this administrator from within the app.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: PRIMARY },

  hero: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 64 : 48,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  logoEmoji: { fontSize: 32 },
  appName: { fontSize: 30, fontWeight: "800", color: "#fff", letterSpacing: -0.5, marginBottom: 2 },
  tagline: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 20 },

  scrollArea: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },

  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#f5f3ff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ddd6fe",
  },
  adminBadgeText: { fontSize: 12, fontWeight: "600", color: "#7c3aed" },

  progress: { flexDirection: "row", gap: 6, marginBottom: 20 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0" },
  progressDotActive: { backgroundColor: PRIMARY },

  cardTitle: { fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 20 },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorIcon: { fontSize: 14 },
  errorText: { flex: 1, fontSize: 13, color: "#991b1b", lineHeight: 19 },

  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 14 },
  optional: { fontSize: 11, fontWeight: "400", color: "#94a3b8" },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },

  districtRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  districtChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  districtChipActive: { borderColor: PRIMARY, backgroundColor: "#f0f9ff" },
  districtChipText: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  districtChipTextActive: { color: PRIMARY, fontWeight: "700" },

  pwWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    backgroundColor: "#f8fafc", marginBottom: 4,
  },
  pwInput: { flex: 1, height: 48, paddingHorizontal: 14, fontSize: 15, color: "#0f172a" },
  eyeBtn: { paddingHorizontal: 14, height: 48, justifyContent: "center" },
  eyeText: { fontSize: 13, fontWeight: "600", color: PRIMARY },

  consent: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 12, borderRadius: 10, backgroundColor: "#f8fafc",
    borderWidth: 1, borderColor: "#e2e8f0", marginTop: 16,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  checkboxActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  consentText: { flex: 1, fontSize: 12, color: "#64748b", lineHeight: 18 },
  consentBold: { fontWeight: "700", color: "#0f172a" },

  btn: {
    height: 52,
    backgroundColor: PRIMARY,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
    shadowColor: PRIMARY_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  btnDisabled: { opacity: 0.65 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  backLink: { alignItems: "center", marginTop: 16, paddingVertical: 8 },
  backLinkText: { fontSize: 13, color: "#64748b" },

  notice: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  noticeText: { fontSize: 11, color: "#0369a1", lineHeight: 16 },
});
