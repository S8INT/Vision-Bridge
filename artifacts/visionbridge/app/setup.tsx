import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useAuth, type AdminSetupInput } from "@/context/AuthContext";

const PRIMARY = "#0ea5e9";
const PRIMARY_DARK = "#0284c7";

const UGANDA_DISTRICTS = [
  "Mbarara", "Kampala", "Kabale", "Jinja", "Mbale", "Gulu",
  "Lira", "Arua", "Fort Portal", "Soroti", "Mukono", "Wakiso", "Other",
];

const FACILITY_TYPES = [
  { label: "Regional Referral Hospital", icon: "activity" },
  { label: "General Hospital",           icon: "plus-square" },
  { label: "Health Centre",              icon: "home" },
  { label: "Eye Clinic",                 icon: "eye" },
  { label: "Private Clinic",             icon: "briefcase" },
];

export default function SetupScreen() {
  const { adminSetup } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — clinic
  const [clinicName, setClinicName] = useState("");
  const [facilityType, setFacilityType] = useState("");
  const [district, setDistrict] = useState("Mbarara");

  // Step 2 — admin account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Step 3 — security
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [dppaConsent, setDppaConsent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateClinic(): boolean {
    if (clinicName.trim().length < 2) { setError("Enter your clinic or hospital name."); return false; }
    if (!district) { setError("Select your district."); return false; }
    setError(null); return true;
  }

  function validateAccount(): boolean {
    if (fullName.trim().length < 2) { setError("Enter your full name."); return false; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return false; }
    setError(null); return true;
  }

  function validatePassword(): boolean {
    if (password.length < 8) { setError("Password must be at least 8 characters."); return false; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return false; }
    if (!dppaConsent) { setError("You must accept the DPPA consent to continue."); return false; }
    setError(null); return true;
  }

  async function handleSetup() {
    if (!validatePassword()) return;
    setLoading(true);
    setError(null);

    // Combine clinic name + type into the facility field the backend expects
    const facilityValue = facilityType
      ? `${clinicName.trim()} (${facilityType})`
      : clinicName.trim();

    const input: AdminSetupInput = {
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      facility: facilityValue,
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

  function goBack() {
    setError(null);
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />

      {/* ── Hero ── */}
      <View style={s.hero}>
        <View style={s.logoCircle}>
          <Feather name="eye" size={32} color="#fff" />
        </View>
        <Text style={s.appName}>VisionBridge</Text>
        <Text style={s.tagline}>Clinic Registration</Text>
        <Text style={s.heroSub}>
          {step === 1 ? "Tell us about your clinic to get started." :
           step === 2 ? "Now create your administrator account." :
                        "Almost done — secure your account."}
        </Text>
      </View>

      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>

          {/* Progress */}
          <View style={s.progressRow}>
            {([1, 2, 3] as const).map((n) => (
              <View key={n} style={[s.progressDot, step >= n && s.progressDotActive]} />
            ))}
          </View>
          <Text style={s.stepLabel}>Step {step} of 3</Text>

          {/* Error */}
          {error ? (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={14} color="#991b1b" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ── Step 1: Clinic details ── */}
          {step === 1 ? (
            <>
              <Text style={s.cardTitle}>Your clinic</Text>
              <Text style={s.cardSubtitle}>We'll register your facility as a new organisation on VisionBridge.</Text>

              <Text style={s.label}>Clinic / hospital name</Text>
              <TextInput
                style={s.input}
                value={clinicName}
                onChangeText={setClinicName}
                placeholder="e.g. Mbarara RRH Eye Unit"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                editable={!loading}
              />

              <Text style={s.label}>Facility type <Text style={s.optional}>(optional)</Text></Text>
              <View style={s.typeGrid}>
                {FACILITY_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.label}
                    style={[s.typeChip, facilityType === t.label && s.typeChipActive]}
                    onPress={() => setFacilityType(facilityType === t.label ? "" : t.label)}
                    activeOpacity={0.75}
                  >
                    <Feather
                      name={t.icon as any}
                      size={13}
                      color={facilityType === t.label ? PRIMARY : "#64748b"}
                    />
                    <Text style={[s.typeChipText, facilityType === t.label && s.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>District</Text>
              <View style={s.districtRow}>
                {UGANDA_DISTRICTS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[s.districtChip, district === d && s.districtChipActive]}
                    onPress={() => setDistrict(d)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.districtChipText, district === d && s.districtChipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={s.btn}
                onPress={() => { if (validateClinic()) setStep(2); }}
                activeOpacity={0.85}
              >
                <Text style={s.btnText}>Continue</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>
            </>
          ) : null}

          {/* ── Step 2: Admin account ── */}
          {step === 2 ? (
            <>
              <View style={s.clinicSummary}>
                <Feather name="home" size={14} color={PRIMARY} />
                <Text style={s.clinicSummaryText} numberOfLines={1}>
                  {clinicName}{facilityType ? ` · ${facilityType}` : ""} · {district}
                </Text>
              </View>

              <Text style={s.cardTitle}>Your admin account</Text>
              <Text style={s.cardSubtitle}>You'll manage staff, settings, and data for this clinic.</Text>

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

              <View style={s.infoBox}>
                <Feather name="info" size={14} color="#0369a1" />
                <Text style={s.infoText}>
                  Once set up, you can add doctors, technicians, and community health workers from within the app.
                </Text>
              </View>

              <TouchableOpacity
                style={s.btn}
                onPress={() => { if (validateAccount()) setStep(3); }}
                activeOpacity={0.85}
              >
                <Text style={s.btnText}>Continue</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={s.backLink} onPress={goBack}>
                <Text style={s.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* ── Step 3: Security ── */}
          {step === 3 ? (
            <>
              <View style={s.clinicSummary}>
                <Feather name="user" size={14} color={PRIMARY} />
                <Text style={s.clinicSummaryText} numberOfLines={1}>{fullName} · {email}</Text>
              </View>

              <Text style={s.cardTitle}>Secure your clinic</Text>
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
                  I consent to the processing of personal information and patient health data administered through this clinic, in line with the Uganda Data Protection and Privacy Act 2019.
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
                    <Feather name="check-circle" size={18} color="#fff" />
                    <Text style={s.btnText}>Register clinic</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={s.backLink} onPress={goBack} disabled={loading}>
                <Text style={s.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

        </View>

        {step === 1 ? (
          <TouchableOpacity style={s.loginLink} onPress={() => router.replace("/login")}>
            <Text style={s.loginLinkText}>
              Already have a clinic account?{" "}
              <Text style={s.loginLinkAction}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: PRIMARY },

  hero: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 60 : 44,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.35)",
  },
  appName: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.5, marginBottom: 2 },
  tagline: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 20 },

  scrollArea: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingBottom: 40 },

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

  progressRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0" },
  progressDotActive: { backgroundColor: PRIMARY },
  stepLabel: { fontSize: 11, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 18 },

  cardTitle: { fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 20 },

  clinicSummary: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f0f9ff", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#bae6fd", marginBottom: 18,
  },
  clinicSummaryText: { flex: 1, fontSize: 13, fontWeight: "500", color: "#0369a1" },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
    borderRadius: 10, padding: 12, marginBottom: 16, gap: 8,
  },
  errorText: { flex: 1, fontSize: 13, color: "#991b1b", lineHeight: 19 },

  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 14 },
  optional: { fontSize: 11, fontWeight: "400", color: "#94a3b8" },
  input: {
    height: 48, borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: "#0f172a", backgroundColor: "#f8fafc",
  },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  typeChipActive: { borderColor: PRIMARY, backgroundColor: "#f0f9ff" },
  typeChipText: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  typeChipTextActive: { color: PRIMARY, fontWeight: "600" },

  districtRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  districtChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  districtChipActive: { borderColor: PRIMARY, backgroundColor: "#f0f9ff" },
  districtChipText: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  districtChipTextActive: { color: PRIMARY, fontWeight: "700" },

  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#f0f9ff", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#bae6fd", marginTop: 18,
  },
  infoText: { flex: 1, fontSize: 12, color: "#0369a1", lineHeight: 17 },

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
    height: 52, backgroundColor: PRIMARY, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8, marginTop: 24,
    shadowColor: PRIMARY_DARK, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  btnDisabled: { opacity: 0.65 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  backLink: { alignItems: "center", marginTop: 16, paddingVertical: 8 },
  backLinkText: { fontSize: 13, color: "#64748b" },

  loginLink: { alignItems: "center", marginTop: 20 },
  loginLinkText: { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  loginLinkAction: { color: "#fff", fontWeight: "700" },
});
