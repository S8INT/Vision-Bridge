import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/AuthContext";

const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;

const COMMON_CONDITIONS = [
  "Diabetes Type 1",
  "Diabetes Type 2",
  "Hypertension",
  "Glaucoma (family history)",
  "Cataracts",
  "Macular Degeneration",
  "Sickle Cell Disease",
  "HIV/AIDS",
  "Heart disease",
  "Previous eye surgery",
  "Eye injury",
  "Allergies",
];

const SEX_OPTIONS: { value: "M" | "F" | "Other"; label: string }[] = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "Other", label: "Other" },
];

const UGANDA_DISTRICTS = [
  "Mbarara", "Kampala", "Kabale", "Jinja", "Mbale", "Gulu",
  "Lira", "Arua", "Fort Portal", "Soroti", "Mukono", "Wakiso", "Other",
];

interface PatientRecord {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: "M" | "F" | "Other" | null;
  phone: string | null;
  village: string | null;
  district: string | null;
  medicalHistory: string[];
  registeredAt: string;
}

export default function PatientProfileScreen() {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { user, accessToken } = useAuth();

  const initialNames = useMemo(() => {
    const parts = (user?.fullName ?? "").trim().split(/\s+/);
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
  }, [user]);

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [profile, setProfile]   = useState<PatientRecord | null>(null);
  const [isNew, setIsNew]       = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [dob, setDob]             = useState("");
  const [sex, setSex]             = useState<"M" | "F" | "Other" | "">("");
  const [phone, setPhone]         = useState("");
  const [village, setVillage]     = useState("");
  const [district, setDistrict]   = useState("");
  const [history, setHistory]     = useState<string[]>([]);
  const [otherCondition, setOther] = useState("");

  // ── Load profile ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken) { setLoading(false); return; }
      try {
        const res = await fetch(`${API_BASE}/patients/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (cancelled) return;

        if (res.status === 404) {
          // No profile yet → start in create mode
          setIsNew(true);
          setFirstName(initialNames.first);
          setLastName(initialNames.last);
          setPhone(user?.phone ?? "");
          setDistrict(user?.district ?? "");
        } else if (res.ok) {
          const data = await res.json() as { patient: PatientRecord };
          setProfile(data.patient);
          setFirstName(data.patient.firstName);
          setLastName(data.patient.lastName);
          setDob(data.patient.dateOfBirth ?? "");
          setSex(data.patient.sex ?? "");
          setPhone(data.patient.phone ?? "");
          setVillage(data.patient.village ?? "");
          setDistrict(data.patient.district ?? "");
          setHistory(data.patient.medicalHistory ?? []);
        } else {
          const err = await res.json().catch(() => ({}));
          Alert.alert("Could not load profile", err.error ?? `Status ${res.status}`);
        }
      } catch (e) {
        console.warn("[profile] load failed", e);
        Alert.alert("Network error", "Could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, initialNames, user]);

  const toggle = (c: string) => {
    setHistory((h) => h.includes(c) ? h.filter((x) => x !== c) : [...h, c]);
  };

  const save = async () => {
    if (!accessToken) { Alert.alert("Not signed in"); return; }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Name required", "Please enter your first and last name.");
      return;
    }
    setSaving(true);

    const finalHistory = otherCondition.trim()
      ? Array.from(new Set([...history, otherCondition.trim()]))
      : history;

    const payload = {
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      dateOfBirth: dob || null,
      sex: sex || null,
      phone: phone.trim() || null,
      village: village.trim() || null,
      district: district.trim() || null,
      medicalHistory: finalHistory,
    };

    try {
      const res = await fetch(`${API_BASE}/patients/me`, {
        method: isNew ? "POST" : "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Save failed", err.error ?? `Status ${res.status}`);
        setSaving(false);
        return;
      }

      const data = await res.json() as { patient: PatientRecord };
      setProfile(data.patient);
      setIsNew(false);
      setOther("");
      setHistory(data.patient.medicalHistory ?? []);

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        isNew ? "Profile created" : "Profile saved",
        isNew
          ? `Welcome! Your patient ID is ${data.patient.patientId}.`
          : "Your information has been updated.",
        [{ text: "OK", onPress: () => { if (!isNew) router.back(); } }],
      );
    } catch (e) {
      console.warn("[profile] save failed", e);
      Alert.alert("Network error", "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content:   { padding: 16, gap: 22, paddingBottom: insets.bottom + 32 },
    centered:  { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    headerCard: {
      flexDirection: "row", gap: 12, padding: 14, borderRadius: 12,
      backgroundColor: isNew ? "#fef3c7" : colors.muted,
      borderWidth: 1, borderColor: isNew ? "#fbbf24" : colors.border,
    },
    headerTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: isNew ? "#92400e" : colors.foreground, marginBottom: 4 },
    headerText:  { fontSize: 12, fontFamily: "Inter_400Regular", color: isNew ? "#92400e" : colors.mutedForeground, lineHeight: 18 },
    sectionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 10 },
    fieldGroup: { gap: 12 },
    field: { gap: 6 },
    row:   { flexDirection: "row", gap: 10 },
    rowField: { flex: 1, gap: 6 },
    label: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    input: {
      paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
      fontFamily: "Inter_400Regular", fontSize: 14, color: colors.foreground,
    },
    readonly: {
      paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    readonlyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground },
    chipTextActive: { color: "#fff" },
    submitBtn: {
      backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 12,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
      opacity: saving ? 0.6 : 1,
    },
    submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
    cancelBtn: { paddingVertical: 12, alignItems: "center" },
    cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    privacyNote: {
      flexDirection: "row", gap: 10, padding: 12, borderRadius: 10,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    privacyText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 },
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.mutedForeground, fontSize: 13 }}>
          Loading your profile…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Status header ── */}
      <View style={styles.headerCard}>
        <Feather
          name={isNew ? "user-plus" : "lock"}
          size={r.iconSize(20)}
          color={isNew ? "#92400e" : colors.primary}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {isNew ? "Set up your patient profile" : "My patient profile"}
          </Text>
          <Text style={styles.headerText}>
            {isNew
              ? "Tell us a little about yourself so our care team can serve you. You can update this any time."
              : "Your information is private and protected under the Uganda Data Protection and Privacy Act 2019."}
          </Text>
        </View>
      </View>

      {/* ── Patient ID (only if existing) ── */}
      {profile && (
        <View style={styles.field}>
          <Text style={styles.label}>Patient ID</Text>
          <View style={styles.readonly}>
            <Text style={styles.readonlyText}>{profile.patientId}</Text>
          </View>
        </View>
      )}

      {/* ── Personal info ── */}
      <View>
        <Text style={styles.sectionLabel}>Personal Information</Text>
        <View style={styles.fieldGroup}>
          <View style={styles.row}>
            <View style={styles.rowField}>
              <Text style={styles.label}>First Name *</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.rowField}>
              <Text style={styles.label}>Last Name *</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={setDob}
              placeholder="1985-04-12"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.chips}>
              {SEX_OPTIONS.map((opt) => {
                const active = sex === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setSex(active ? "" : opt.value)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+256 ..."
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Village</Text>
            <TextInput
              style={styles.input}
              value={village}
              onChangeText={setVillage}
              placeholder="Village"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>District</Text>
            <View style={styles.chips}>
              {UGANDA_DISTRICTS.map((d) => {
                const active = district === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDistrict(active ? "" : d)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      {/* ── Medical history ── */}
      <View>
        <Text style={styles.sectionLabel}>Medical History</Text>
        <View style={styles.chips}>
          {COMMON_CONDITIONS.map((c) => {
            const active = history.includes(c);
            return (
              <TouchableOpacity
                key={c}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggle(c)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Other condition (optional)</Text>
        <TextInput
          style={styles.input}
          value={otherCondition}
          onChangeText={setOther}
          placeholder="e.g. Asthma, Thyroid disease…"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      <View style={styles.privacyNote}>
        <Feather name="shield" size={r.iconSize(16)} color={colors.mutedForeground} />
        <Text style={styles.privacyText}>
          Only you and your assigned care team at {user?.facility ?? "your facility"} can view this information.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.submitBtn}
        onPress={save}
        activeOpacity={0.85}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Feather name={isNew ? "user-plus" : "save"} size={r.iconSize(16)} color="#fff" />}
        <Text style={styles.submitBtnText}>
          {saving ? "Saving…" : isNew ? "Create Profile" : "Save Changes"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>{isNew ? "Do this later" : "Cancel"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
