import React, { useState, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useAuth, type AdminSetupInput, type UserRole } from "@/context/AuthContext";

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

type IndivRole = Exclude<UserRole, "Admin">;

interface IndivRoleOption {
  value: IndivRole;
  label: string;
  subtitle: string;
  color: string;
  icon: string;
}

const INDIV_ROLES: IndivRoleOption[] = [
  { value: "Patient",     label: "Patient",                    subtitle: "Book appointments & view my eye-screening results", color: "#ec4899", icon: "heart" },
  { value: "Doctor",      label: "Ophthalmologist / Doctor",   subtitle: "Specialist consultations, diagnosis, treatment plans",  color: "#0ea5e9", icon: "user-check" },
  { value: "Technician",  label: "Imaging Technician",         subtitle: "Retinal photography and image quality assurance",       color: "#10b981", icon: "camera" },
  { value: "CHW",         label: "Nurse / Community Health Worker", subtitle: "Field outreach, patient registration, basic screening", color: "#f59e0b", icon: "users" },
  { value: "Viewer",      label: "District Health Officer",    subtitle: "Read-only analytics and reporting access",               color: "#64748b", icon: "eye" },
];

type FacilityMode =
  | { kind: "hidden"; auto: string }
  | { kind: "shown"; label: string; placeholder: string; hint?: string };

interface RoleFieldConfig {
  facility: FacilityMode;
  showPhone: boolean;
  phoneRequired: boolean;
  showDistrict: boolean;
}

const ROLE_FIELDS: Record<IndivRole, RoleFieldConfig> = {
  Patient:    { facility: { kind: "hidden", auto: "Self / Patient account" }, showPhone: true, phoneRequired: true, showDistrict: true },
  CHW:        { facility: { kind: "shown", label: "CHW area / parish", placeholder: "e.g. Nyakayojo Parish", hint: "The community area you cover for outreach." }, showPhone: true, phoneRequired: true, showDistrict: true },
  Technician: { facility: { kind: "shown", label: "Imaging facility / clinic", placeholder: "e.g. Mbarara RRH Eye Unit", hint: "The clinic where you capture retinal images." }, showPhone: true, phoneRequired: false, showDistrict: true },
  Doctor:     { facility: { kind: "shown", label: "Hospital / clinic", placeholder: "e.g. Mbarara RRH Eye Unit", hint: "Your primary place of practice." }, showPhone: true, phoneRequired: false, showDistrict: true },
  Viewer:     { facility: { kind: "hidden", auto: "District Health Office" }, showPhone: false, phoneRequired: false, showDistrict: true },
};

type Mode = null | "clinic" | "individual";

export default function SetupScreen() {
  const { adminSetup, register } = useAuth();

  // ── Flow state ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Clinic fields
  const [clinicName, setClinicName]     = useState("");
  const [facilityType, setFacilityType] = useState("");

  // Shared
  const [district, setDistrict] = useState("Mbarara");

  // Individual fields
  const [indivRole, setIndivRole]   = useState<IndivRole | null>(null);
  const [facility, setFacility]     = useState("");

  // Account fields (clinic admin OR individual)
  const [fullName, setFullName]           = useState("");
  const [email, setEmail]                 = useState("");
  const [phone, setPhone]                 = useState("");

  // Security
  const [password, setPw]                 = useState("");
  const [confirmPassword, setConfirmPw]   = useState("");
  const [showPassword, setShowPw]         = useState(false);
  const [dppaConsent, setDppaConsent]     = useState(false);

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fieldConfig = useMemo<RoleFieldConfig | null>(
    () => (indivRole ? ROLE_FIELDS[indivRole] : null),
    [indivRole],
  );

  const selectedRole = useMemo(
    () => (indivRole ? INDIV_ROLES.find((r) => r.value === indivRole) : null),
    [indivRole],
  );

  // ── Validation helpers ──────────────────────────────────────────────────────
  function validateClinicStep1(): boolean {
    if (clinicName.trim().length < 2) { setError("Enter your clinic or hospital name."); return false; }
    if (!district) { setError("Select your district."); return false; }
    setError(null); return true;
  }

  function validateClinicStep2(): boolean {
    if (fullName.trim().length < 2) { setError("Enter your full name."); return false; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return false; }
    setError(null); return true;
  }

  function validateIndivStep1(): boolean {
    if (!indivRole) { setError("Select your role to continue."); return false; }
    setError(null); return true;
  }

  function validateIndivStep2(): boolean {
    if (!indivRole || !fieldConfig) { setError("Select your role first."); return false; }
    if (fullName.trim().length < 2) { setError("Enter your full name."); return false; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return false; }
    if (fieldConfig.showPhone && fieldConfig.phoneRequired && phone.trim().length < 7) {
      setError("Enter a valid phone number."); return false;
    }
    if (fieldConfig.facility.kind === "shown" && facility.trim().length < 1) {
      setError(`Enter your ${(fieldConfig.facility as Extract<FacilityMode, { kind: "shown" }>).label.toLowerCase()}.`); return false;
    }
    setError(null); return true;
  }

  function validateSecurity(): boolean {
    if (password.length < 8) { setError("Password must be at least 8 characters."); return false; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return false; }
    if (!dppaConsent) { setError("You must accept the DPPA consent to continue."); return false; }
    setError(null); return true;
  }

  // ── Submit handlers ─────────────────────────────────────────────────────────
  async function handleClinicSetup() {
    if (!validateSecurity()) return;
    setLoading(true);
    setError(null);

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

    const result = await adminSetup(input, { deviceName: "VisionBridge Mobile", devicePlatform: Platform.OS });
    setLoading(false);
    if (!result.success) { setError(result.error); return; }
    router.replace("/(tabs)");
  }

  async function handleIndivSetup() {
    if (!validateSecurity() || !indivRole || !fieldConfig) return;
    setLoading(true);
    setError(null);

    const facilityValue =
      fieldConfig.facility.kind === "hidden"
        ? fieldConfig.facility.auto
        : facility.trim();

    const result = await register({
      email: email.trim().toLowerCase(),
      password,
      role: indivRole,
      fullName: fullName.trim(),
      facility: facilityValue,
      district,
      phone: fieldConfig.showPhone && phone.trim() ? phone.trim() : undefined,
      dppaConsent: true,
    }, { deviceName: "VisionBridge Mobile", devicePlatform: Platform.OS });

    setLoading(false);
    if (!result.success) { setError(result.error); return; }
    router.replace("/(tabs)");
  }

  // ── Nav helpers ──────────────────────────────────────────────────────────────
  function pickMode(m: "clinic" | "individual") {
    setMode(m);
    setStep(1);
    setError(null);
  }

  function goBack() {
    setError(null);
    if (step > 1) { setStep((s) => (s - 1) as 1 | 2 | 3); }
    else { setMode(null); }
  }

  function nextStep() {
    setStep((s) => (s + 1) as 2 | 3);
  }

  // ── Dynamic hero copy ────────────────────────────────────────────────────────
  const heroSub =
    mode === null          ? "Get your eye-care team connected, or join as an individual." :
    mode === "clinic"
      ? step === 1 ? "Tell us about your clinic."
      : step === 2 ? "Now set up your admin account."
      : "Almost done — secure your account."
    :
    mode === "individual"
      ? step === 1 ? "What is your role?"
      : step === 2 ? "A few details about you."
      : "Almost done — secure your account."
    : "";

  const showProgress = mode !== null;
  const totalSteps = 3;

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />

      {/* ── Hero ── */}
      <View style={s.hero}>
        <View style={s.logoCircle}>
          <Feather name="eye" size={30} color="#fff" />
        </View>
        <Text style={s.appName}>VisionBridge</Text>
        <Text style={s.heroSub}>{heroSub}</Text>
      </View>

      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>

          {/* Progress bar (hidden on landing) */}
          {showProgress ? (
            <>
              <View style={s.progressRow}>
                {([1, 2, 3] as const).map((n) => (
                  <View key={n} style={[s.progressDot, step >= n && s.progressDotActive]} />
                ))}
              </View>
              <Text style={s.stepLabel}>Step {step} of {totalSteps}</Text>
            </>
          ) : null}

          {/* Error */}
          {error ? (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={14} color="#991b1b" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════════
              LANDING — choose mode
          ══════════════════════════════════════════════════════════════════════ */}
          {mode === null ? (
            <>
              <Text style={s.cardTitle}>Welcome to VisionBridge</Text>
              <Text style={s.cardSubtitle}>How would you like to get started?</Text>

              <TouchableOpacity style={[s.modeCard, s.modeCardClinic]} onPress={() => pickMode("clinic")} activeOpacity={0.85}>
                <View style={[s.modeIconWrap, { backgroundColor: "rgba(14,165,233,0.12)" }]}>
                  <Feather name="home" size={26} color={PRIMARY} />
                </View>
                <View style={s.modeTextWrap}>
                  <Text style={s.modeTitle}>My clinic / hospital</Text>
                  <Text style={s.modeSub}>Register your facility and create an admin account to manage staff, screenings, and referrals.</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>

              <TouchableOpacity style={[s.modeCard, s.modeCardIndiv]} onPress={() => pickMode("individual")} activeOpacity={0.85}>
                <View style={[s.modeIconWrap, { backgroundColor: "rgba(236,72,153,0.10)" }]}>
                  <Feather name="user" size={26} color="#ec4899" />
                </View>
                <View style={s.modeTextWrap}>
                  <Text style={s.modeTitle}>I'm an individual</Text>
                  <Text style={s.modeSub}>Doctor, nurse, technician, community health worker, or patient — join on your own.</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>

              <TouchableOpacity style={s.loginLink} onPress={() => router.replace("/login")}>
                <Text style={s.loginLinkText}>Already have an account? <Text style={s.loginLinkAction}>Sign in</Text></Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════════
              CLINIC — Step 1: Clinic details
          ══════════════════════════════════════════════════════════════════════ */}
          {mode === "clinic" && step === 1 ? (
            <>
              <Text style={s.cardTitle}>Your clinic</Text>
              <Text style={s.cardSubtitle}>We'll register your facility as a new organisation on VisionBridge.</Text>

              <Text style={s.label}>Clinic / hospital name</Text>
              <TextInput style={s.input} value={clinicName} onChangeText={setClinicName}
                placeholder="e.g. Mbarara RRH Eye Unit" placeholderTextColor="#94a3b8"
                autoCapitalize="words" editable={!loading} />

              <Text style={s.label}>Facility type <Text style={s.optional}>(optional)</Text></Text>
              <View style={s.chipRow}>
                {FACILITY_TYPES.map((t) => (
                  <TouchableOpacity key={t.label}
                    style={[s.chip, facilityType === t.label && s.chipActive]}
                    onPress={() => setFacilityType(facilityType === t.label ? "" : t.label)}
                    activeOpacity={0.75}>
                    <Feather name={t.icon as any} size={12} color={facilityType === t.label ? PRIMARY : "#64748b"} />
                    <Text style={[s.chipText, facilityType === t.label && s.chipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>District</Text>
              <View style={s.chipRow}>
                {UGANDA_DISTRICTS.map((d) => (
                  <TouchableOpacity key={d} style={[s.chip, district === d && s.chipActive]}
                    onPress={() => setDistrict(d)} activeOpacity={0.75}>
                    <Text style={[s.chipText, district === d && s.chipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.btn} onPress={() => { if (validateClinicStep1()) nextStep(); }} activeOpacity={0.85}>
                <Text style={s.btnText}>Continue</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={s.backLink} onPress={goBack}>
                <Text style={s.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════════
              CLINIC — Step 2: Admin account details
          ══════════════════════════════════════════════════════════════════════ */}
          {mode === "clinic" && step === 2 ? (
            <>
              <View style={s.summaryStrip}>
                <Feather name="home" size={13} color={PRIMARY} />
                <Text style={s.summaryText} numberOfLines={1}>
                  {clinicName}{facilityType ? ` · ${facilityType}` : ""} · {district}
                </Text>
              </View>

              <Text style={s.cardTitle}>Your admin account</Text>
              <Text style={s.cardSubtitle}>You'll manage staff, settings, and data for this clinic.</Text>

              <Text style={s.label}>Full name</Text>
              <TextInput style={s.input} value={fullName} onChangeText={setFullName}
                placeholder="e.g. Dr. Sarah Nakato" placeholderTextColor="#94a3b8"
                autoCapitalize="words" editable={!loading} />

              <Text style={s.label}>Email address</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail}
                placeholder="admin@hospital.ug" placeholderTextColor="#94a3b8"
                autoCapitalize="none" keyboardType="email-address" editable={!loading} />

              <Text style={s.label}>Phone <Text style={s.optional}>(optional)</Text></Text>
              <TextInput style={s.input} value={phone} onChangeText={setPhone}
                placeholder="+256 7XX XXX XXX" placeholderTextColor="#94a3b8"
                keyboardType="phone-pad" editable={!loading} />

              <View style={s.infoBox}>
                <Feather name="info" size={13} color="#0369a1" />
                <Text style={s.infoText}>Once set up, you can invite doctors, technicians, and community health workers from within the app.</Text>
              </View>

              <TouchableOpacity style={s.btn} onPress={() => { if (validateClinicStep2()) nextStep(); }} activeOpacity={0.85}>
                <Text style={s.btnText}>Continue</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={s.backLink} onPress={goBack}>
                <Text style={s.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════════
              INDIVIDUAL — Step 1: Role picker
          ══════════════════════════════════════════════════════════════════════ */}
          {mode === "individual" && step === 1 ? (
            <>
              <Text style={s.cardTitle}>What is your role?</Text>
              <Text style={s.cardSubtitle}>This determines which features and patient data you can access.</Text>

              {INDIV_ROLES.map((r) => (
                <TouchableOpacity key={r.value}
                  style={[s.roleCard, indivRole === r.value && s.roleCardActive]}
                  onPress={() => setIndivRole(r.value)} activeOpacity={0.85}>
                  <View style={[s.roleIconWrap, { backgroundColor: r.color + "18" }]}>
                    <Feather name={r.icon as any} size={18} color={r.color} />
                  </View>
                  <View style={s.roleTextWrap}>
                    <Text style={s.roleLabel}>{r.label}</Text>
                    <Text style={s.roleSub}>{r.subtitle}</Text>
                  </View>
                  <View style={[s.roleRadio, indivRole === r.value && s.roleRadioActive]}>
                    {indivRole === r.value ? <Feather name="check" size={11} color="#fff" /> : null}
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={s.btn} onPress={() => { if (validateIndivStep1()) nextStep(); }} activeOpacity={0.85}>
                <Text style={s.btnText}>Continue</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={s.backLink} onPress={goBack}>
                <Text style={s.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════════
              INDIVIDUAL — Step 2: Role-specific details
          ══════════════════════════════════════════════════════════════════════ */}
          {mode === "individual" && step === 2 && selectedRole && fieldConfig ? (
            <>
              {/* Role badge */}
              <View style={s.roleBanner}>
                <View style={[s.roleBannerIcon, { backgroundColor: selectedRole.color + "18" }]}>
                  <Feather name={selectedRole.icon as any} size={14} color={selectedRole.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.roleBannerLabel}>Joining as</Text>
                  <Text style={s.roleBannerName}>{selectedRole.label}</Text>
                </View>
                <TouchableOpacity onPress={goBack}>
                  <Text style={s.roleBannerChange}>Change</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.cardTitle}>Your details</Text>

              <Text style={s.label}>Full name</Text>
              <TextInput style={s.input} value={fullName} onChangeText={setFullName}
                placeholder={indivRole === "Doctor" ? "Dr. Jane Doe" : "Your full name"}
                placeholderTextColor="#94a3b8" autoCapitalize="words" editable={!loading} />

              <Text style={s.label}>Email address</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail}
                placeholder={indivRole === "Patient" ? "you@example.com" : "you@hospital.ug"}
                placeholderTextColor="#94a3b8" autoCapitalize="none"
                keyboardType="email-address" editable={!loading} />

              {fieldConfig.showPhone ? (
                <>
                  <Text style={s.label}>
                    Phone{" "}
                    {!fieldConfig.phoneRequired ? <Text style={s.optional}>(optional)</Text> : null}
                  </Text>
                  <TextInput style={s.input} value={phone} onChangeText={setPhone}
                    placeholder="+256 7XX XXX XXX" placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad" editable={!loading} />
                </>
              ) : null}

              {fieldConfig.facility.kind === "shown" ? (
                <>
                  <Text style={s.label}>{fieldConfig.facility.label}</Text>
                  <TextInput style={s.input} value={facility} onChangeText={setFacility}
                    placeholder={fieldConfig.facility.placeholder}
                    placeholderTextColor="#94a3b8" editable={!loading} />
                  {fieldConfig.facility.hint ? (
                    <Text style={s.helper}>{fieldConfig.facility.hint}</Text>
                  ) : null}
                </>
              ) : null}

              {fieldConfig.showDistrict ? (
                <>
                  <Text style={s.label}>District</Text>
                  <View style={s.chipRow}>
                    {UGANDA_DISTRICTS.map((d) => (
                      <TouchableOpacity key={d} style={[s.chip, district === d && s.chipActive]}
                        onPress={() => setDistrict(d)} activeOpacity={0.75}>
                        <Text style={[s.chipText, district === d && s.chipTextActive]}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              <TouchableOpacity style={s.btn} onPress={() => { if (validateIndivStep2()) nextStep(); }} activeOpacity={0.85}>
                <Text style={s.btnText}>Continue</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={s.backLink} onPress={goBack}>
                <Text style={s.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════════
              SECURITY STEP — shared by clinic (step 3) and individual (step 3)
          ══════════════════════════════════════════════════════════════════════ */}
          {((mode === "clinic" && step === 3) || (mode === "individual" && step === 3)) ? (
            <>
              {/* Context summary strip */}
              {mode === "clinic" ? (
                <View style={s.summaryStrip}>
                  <Feather name="home" size={13} color={PRIMARY} />
                  <Text style={s.summaryText} numberOfLines={1}>
                    {clinicName} · {fullName} · {email}
                  </Text>
                </View>
              ) : selectedRole ? (
                <View style={s.summaryStrip}>
                  <Feather name={selectedRole.icon as any} size={13} color={selectedRole.color} />
                  <Text style={s.summaryText} numberOfLines={1}>
                    {selectedRole.label} · {fullName}
                  </Text>
                </View>
              ) : null}

              <Text style={s.cardTitle}>Secure your account</Text>
              <Text style={s.cardSubtitle}>
                {mode === "clinic"
                  ? "Choose a strong password. Patient health data depends on it."
                  : indivRole === "Patient"
                  ? "Choose a strong password. Your health information depends on it."
                  : "Choose a strong password. Patient health data depends on it."}
              </Text>

              <Text style={s.label}>Password</Text>
              <View style={s.pwWrap}>
                <TextInput style={s.pwInput} value={password} onChangeText={setPw}
                  placeholder="Min. 8 characters" placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword} autoComplete="new-password" editable={!loading} />
                <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw((v) => !v)}>
                  <Text style={s.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Confirm password</Text>
              <View style={s.pwWrap}>
                <TextInput style={s.pwInput} value={confirmPassword} onChangeText={setConfirmPw}
                  placeholder="Re-enter password" placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword} autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={mode === "clinic" ? handleClinicSetup : handleIndivSetup}
                  editable={!loading} />
              </View>

              <TouchableOpacity style={s.consent}
                onPress={() => setDppaConsent((v) => !v)}
                activeOpacity={0.8} disabled={loading}>
                <View style={[s.checkbox, dppaConsent && s.checkboxActive]}>
                  {dppaConsent ? <Feather name="check" size={13} color="#fff" /> : null}
                </View>
                <Text style={s.consentText}>
                  <Text style={s.consentBold}>Uganda DPPA 2019 Consent. </Text>
                  {mode === "clinic"
                    ? "I consent to the processing of personal information and patient health data administered through this clinic, in line with the Uganda Data Protection and Privacy Act 2019."
                    : indivRole === "Patient"
                    ? "I consent to the processing of my personal and health information in line with the Uganda Data Protection and Privacy Act 2019, for eye-screening, referral and follow-up care."
                    : "I consent to the processing of my personal information and the patient health data I capture, in line with the Uganda Data Protection and Privacy Act 2019."}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={mode === "clinic" ? handleClinicSetup : handleIndivSetup}
                disabled={loading} activeOpacity={0.85}>
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name={mode === "clinic" ? "home" : "check-circle"} size={18} color="#fff" />
                    <Text style={s.btnText}>
                      {mode === "clinic" ? "Register clinic" : "Create account"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={s.backLink} onPress={goBack} disabled={loading}>
                <Text style={s.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

        </View>

        {/* Sign-in link shown only on landing */}
        {mode === null ? null : (
          <TouchableOpacity style={s.bottomLink} onPress={() => router.replace("/login")}>
            <Text style={s.bottomLinkText}>Already have an account? <Text style={s.bottomLinkAction}>Sign in</Text></Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: PRIMARY },

  hero: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingBottom: 22,
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.35)",
  },
  appName: { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: -0.5, marginBottom: 6 },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 20 },

  scrollArea: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24, padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 10,
  },

  progressRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0" },
  progressDotActive: { backgroundColor: PRIMARY },
  stepLabel: { fontSize: 11, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 },

  cardTitle: { fontSize: 21, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: "#64748b", marginBottom: 18, lineHeight: 19 },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
    borderRadius: 10, padding: 12, marginBottom: 14, gap: 8,
  },
  errorText: { flex: 1, fontSize: 13, color: "#991b1b", lineHeight: 18 },

  // ── Mode cards ────────────────────────────────────────────────────────────
  modeCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 12,
  },
  modeCardClinic: { borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  modeCardIndiv:  { borderColor: "#fce7f3", backgroundColor: "#fdf2f8" },
  modeIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modeTextWrap: { flex: 1 },
  modeTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  modeSub: { fontSize: 12, color: "#64748b", lineHeight: 17 },

  // ── Role cards ────────────────────────────────────────────────────────────
  roleCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    padding: 13, marginBottom: 9, backgroundColor: "#fafafa",
  },
  roleCardActive: { borderColor: PRIMARY, backgroundColor: "#f0f9ff" },
  roleIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  roleTextWrap: { flex: 1 },
  roleLabel: { fontSize: 13, fontWeight: "600", color: "#0f172a", marginBottom: 2 },
  roleSub: { fontSize: 11, color: "#64748b", lineHeight: 16 },
  roleRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center",
  },
  roleRadioActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },

  // ── Role banner (step 2 individual) ──────────────────────────────────────
  roleBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#f8fafc", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 16,
  },
  roleBannerIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  roleBannerLabel: { fontSize: 10, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 },
  roleBannerName: { fontSize: 13, fontWeight: "600", color: "#0f172a", marginTop: 1 },
  roleBannerChange: { fontSize: 12, fontWeight: "600", color: PRIMARY },

  // ── Summary strip ─────────────────────────────────────────────────────────
  summaryStrip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f0f9ff", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#bae6fd", marginBottom: 16,
  },
  summaryText: { flex: 1, fontSize: 12, fontWeight: "500", color: "#0369a1" },

  // ── Form ──────────────────────────────────────────────────────────────────
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 14 },
  optional: { fontSize: 11, fontWeight: "400", color: "#94a3b8" },
  input: {
    height: 46, borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: "#0f172a", backgroundColor: "#f8fafc",
  },
  helper: { fontSize: 11, color: "#64748b", marginTop: 5, lineHeight: 15 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  chipActive: { borderColor: PRIMARY, backgroundColor: "#f0f9ff" },
  chipText: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  chipTextActive: { color: PRIMARY, fontWeight: "600" },

  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#f0f9ff", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#bae6fd", marginTop: 16,
  },
  infoText: { flex: 1, fontSize: 12, color: "#0369a1", lineHeight: 17 },

  pwWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    backgroundColor: "#f8fafc", marginBottom: 4,
  },
  pwInput: { flex: 1, height: 46, paddingHorizontal: 14, fontSize: 15, color: "#0f172a" },
  eyeBtn: { paddingHorizontal: 14, height: 46, justifyContent: "center" },
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
    height: 50, backgroundColor: PRIMARY, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8, marginTop: 22,
    shadowColor: PRIMARY_DARK, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  btnDisabled: { opacity: 0.65 },
  btnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  backLink: { alignItems: "center", marginTop: 14, paddingVertical: 8 },
  backLinkText: { fontSize: 13, color: "#64748b" },

  loginLink: { alignItems: "center", marginTop: 20 },
  loginLinkText: { fontSize: 13, color: "#475569" },
  loginLinkAction: { color: PRIMARY, fontWeight: "700" },

  bottomLink: { alignItems: "center", marginTop: 18 },
  bottomLinkText: { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  bottomLinkAction: { color: "#fff", fontWeight: "700" },
});
