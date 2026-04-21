import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface RoleOption {
  value: Exclude<UserRole, "Admin">;
  label: string;
  description: string;
  color: string;
  icon: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: "CHW",
    label: "Community Health Worker",
    description: "Field outreach, patient registration, basic screening",
    color: "#f59e0b",
    icon: "users",
  },
  {
    value: "Technician",
    label: "Imaging Technician",
    description: "Retinal photography, image quality assurance, screening capture",
    color: "#10b981",
    icon: "camera",
  },
  {
    value: "Doctor",
    label: "Ophthalmologist",
    description: "Specialist consultations, diagnosis, treatment plans",
    color: "#0ea5e9",
    icon: "user-check",
  },
  {
    value: "Viewer",
    label: "District Health Officer",
    description: "Read-only analytics and reporting access",
    color: "#64748b",
    icon: "eye",
  },
];

const UGANDA_DISTRICTS = [
  "Mbarara", "Kampala", "Kabale", "Jinja", "Mbale", "Gulu",
  "Lira", "Arua", "Fort Portal", "Soroti", "Mukono", "Wakiso", "Other",
];

export default function SignupScreen() {
  const colors = useColors();
  const { register } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<RoleOption["value"] | null>(null);
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

  function validateStep1(): boolean {
    if (!role) { setError("Select your role to continue."); return false; }
    if (fullName.trim().length < 2) { setError("Enter your full name."); return false; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return false; }
    if (facility.trim().length < 1) { setError("Enter your facility name."); return false; }
    setError(null);
    return true;
  }

  function validateStep2(): boolean {
    if (password.length < 8) { setError("Password must be at least 8 characters."); return false; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return false; }
    if (!dppaConsent) { setError("You must accept the DPPA consent to continue."); return false; }
    setError(null);
    return true;
  }

  async function handleSignup() {
    if (!validateStep2()) return;
    setLoading(true);
    setError(null);

    const result = await register({
      email: email.trim().toLowerCase(),
      password,
      role: role!,
      fullName: fullName.trim(),
      facility: facility.trim(),
      district,
      phone: phone.trim() || undefined,
      dppaConsent: true,
    }, {
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

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 32 },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
    backBtn: { padding: 6, marginLeft: -6 },
    headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.text, flex: 1, textAlign: "center", marginRight: 24 },
    progress: { flexDirection: "row", gap: 6, marginBottom: 24 },
    progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
    progressDotActive: { backgroundColor: colors.primary },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 24 },

    sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },

    roleCard: {
      flexDirection: "row", alignItems: "flex-start", gap: 12,
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      padding: 14, marginBottom: 10, backgroundColor: colors.card,
    },
    roleCardActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
    roleIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    roleTextWrap: { flex: 1 },
    roleLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 2 },
    roleDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17 },
    roleCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    roleCheckActive: { backgroundColor: colors.primary, borderColor: colors.primary },

    label: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.text, marginBottom: 6, marginTop: 12 },
    input: {
      height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_400Regular",
      color: colors.text, backgroundColor: colors.muted,
    },
    pwWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.muted },
    pwInput: { flex: 1, height: 46, paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text },
    eyeBtn: { paddingHorizontal: 14 },
    eyeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary },

    districtRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
    districtChip: {
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    },
    districtChipActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
    districtChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    districtChipTextActive: { color: colors.primary, fontFamily: "Inter_600SemiBold" },

    consent: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, backgroundColor: colors.muted, marginTop: 16 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
    checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    consentText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 },
    consentBold: { fontFamily: "Inter_600SemiBold", color: colors.text },

    errorBox: { backgroundColor: colors.urgentBg, borderWidth: 1, borderColor: colors.urgentBorder, borderRadius: 8, padding: 12, marginTop: 16 },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.urgentText },

    actionBtn: {
      height: 48, backgroundColor: colors.primary, borderRadius: 10,
      alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
      marginTop: 24,
    },
    actionBtnDisabled: { opacity: 0.6 },
    actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

    footerLink: { alignItems: "center", marginTop: 20 },
    footerText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    footerLinkText: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <View style={s.header}>
          <TouchableOpacity onPress={() => step === 1 ? router.back() : setStep(1)} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Create account</Text>
        </View>

        <View style={s.progress}>
          <View style={[s.progressDot, s.progressDotActive]} />
          <View style={[s.progressDot, step === 2 && s.progressDotActive]} />
        </View>

        {step === 1 ? (
          <>
            <Text style={s.title}>Tell us about you</Text>
            <Text style={s.subtitle}>Your role determines access to clinical features and the data you can see.</Text>

            <Text style={s.sectionLabel}>I am a…</Text>
            {ROLE_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[s.roleCard, role === r.value && s.roleCardActive]}
                onPress={() => setRole(r.value)}
                activeOpacity={0.85}
              >
                <View style={[s.roleIconWrap, { backgroundColor: r.color + "20" }]}>
                  <Feather name={r.icon as any} size={18} color={r.color} />
                </View>
                <View style={s.roleTextWrap}>
                  <Text style={s.roleLabel}>{r.label}</Text>
                  <Text style={s.roleDesc}>{r.description}</Text>
                </View>
                <View style={[s.roleCheck, role === r.value && s.roleCheckActive]}>
                  {role === r.value ? <Feather name="check" size={12} color="#fff" /> : null}
                </View>
              </TouchableOpacity>
            ))}

            <Text style={s.sectionLabel}>Your details</Text>

            <Text style={s.label}>Full name</Text>
            <TextInput style={s.input} value={fullName} onChangeText={setFullName} placeholder="Dr. Jane Doe" placeholderTextColor={colors.mutedForeground} />

            <Text style={s.label}>Email</Text>
            <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="you@hospital.ug" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" keyboardType="email-address" />

            <Text style={s.label}>Phone (optional)</Text>
            <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="+256 7XX XXX XXX" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />

            <Text style={s.label}>Facility / Clinic</Text>
            <TextInput style={s.input} value={facility} onChangeText={setFacility} placeholder="e.g. Mbarara RRH Eye Unit" placeholderTextColor={colors.mutedForeground} />

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

            {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

            <TouchableOpacity style={s.actionBtn} onPress={() => { if (validateStep1()) setStep(2); }} activeOpacity={0.85}>
              <Text style={s.actionBtnText}>Continue</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={s.footerLink} onPress={() => router.replace("/login")}>
              <Text style={s.footerText}>Already have an account? <Text style={s.footerLinkText}>Sign in</Text></Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.title}>Secure your account</Text>
            <Text style={s.subtitle}>Choose a strong password. Patient health data depends on it.</Text>

            <Text style={s.label}>Password</Text>
            <View style={s.pwWrap}>
              <TextInput style={s.pwInput} value={password} onChangeText={setPassword} placeholder="Min. 8 characters" placeholderTextColor={colors.mutedForeground} secureTextEntry={!showPassword} autoComplete="new-password" />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
                <Text style={s.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Confirm password</Text>
            <View style={s.pwWrap}>
              <TextInput style={s.pwInput} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" placeholderTextColor={colors.mutedForeground} secureTextEntry={!showPassword} autoComplete="new-password" onSubmitEditing={handleSignup} returnKeyType="done" />
            </View>

            <TouchableOpacity style={s.consent} onPress={() => setDppaConsent((v) => !v)} activeOpacity={0.8}>
              <View style={[s.checkbox, dppaConsent && s.checkboxActive]}>
                {dppaConsent ? <Feather name="check" size={14} color="#fff" /> : null}
              </View>
              <Text style={s.consentText}>
                <Text style={s.consentBold}>Uganda DPPA 2019 Consent.</Text> I consent to the processing of my personal information and the patient health data I capture, in line with the Uganda Data Protection and Privacy Act 2019, for clinical screening, referral and care-coordination purposes.
              </Text>
            </TouchableOpacity>

            {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

            <TouchableOpacity style={[s.actionBtn, loading && s.actionBtnDisabled]} onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Feather name="user-plus" size={18} color="#fff" />
                  <Text style={s.actionBtnText}>Create account</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.footerLink} onPress={() => setStep(1)}>
              <Text style={s.footerText}>← Back to details</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
