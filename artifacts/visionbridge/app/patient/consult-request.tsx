import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useApp, type Patient } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

const SPECIALTIES = [
  { id: "general",  label: "General Eye Care",       icon: "eye" },
  { id: "diabetes", label: "Diabetic Retinopathy",   icon: "droplet" },
  { id: "glaucoma", label: "Glaucoma",                icon: "shield" },
  { id: "cataract", label: "Cataract",                icon: "circle" },
  { id: "child",    label: "Children's Vision",      icon: "smile" },
] as const;

const PRIORITIES = [
  { id: "Routine",   label: "Routine",   description: "Within a week", color: "#10b981" },
  { id: "Urgent",    label: "Urgent",    description: "Within 24 hrs", color: "#f59e0b" },
  { id: "Emergency", label: "Emergency", description: "Same day",      color: "#ef4444" },
] as const;

const COMMON_SYMPTOMS = [
  "Blurred vision", "Eye pain", "Red eyes", "Watery eyes",
  "Itching", "Sensitivity to light", "Floaters / spots",
  "Vision loss", "Headaches with vision", "Difficulty reading",
];

export default function ConsultRequestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const specialtyMinWidth = `${Math.floor(100 / Math.min(r.cols, 3)) - 2}%` as const;

  const { user, accessToken } = useAuth();
  const { patients, doctors, screenings, addConsultation, addNotification } = useApp();

  // ── Find patient record ────────────────────────────────────────────────────
  // First try local state (by userId, then by name), then fetch from API
  const localPatient = useMemo(
    () =>
      patients.find((p) => p.userId === user?.id) ??
      patients.find((p) => `${p.firstName} ${p.lastName}` === user?.fullName),
    [patients, user],
  );

  const [myPatient, setMyPatient] = useState<Patient | null>(localPatient ?? null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (localPatient) {
      setMyPatient(localPatient);
      return;
    }
    // Not in local list → fetch from /api/patients/me (works for self-registered patients)
    if (!accessToken) return;
    setLoadingProfile(true);
    const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;
    fetch(`${API_BASE}/patients/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // Normalise nulls → undefined to match Patient interface
          const row: Patient = data.patient;
          Object.keys(row).forEach((k) => {
            if ((row as any)[k] === null) (row as any)[k] = undefined;
          });
          setMyPatient(row);
        } else if (res.status === 404) {
          setProfileError("no_profile");
        } else {
          setProfileError("fetch_failed");
        }
      })
      .catch(() => setProfileError("fetch_failed"))
      .finally(() => setLoadingProfile(false));
  }, [localPatient, accessToken]);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [specialty, setSpecialty] = useState<typeof SPECIALTIES[number]["id"]>("general");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]["id"]>("Routine");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [otherSymptoms, setOtherSymptoms] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleSymptom = (s: string) =>
    setSelectedSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Please allow access to your photos to attach an image.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const submit = async () => {
    if (!myPatient) {
      Alert.alert(
        "No patient profile",
        "Please complete your patient profile first before requesting a consultation.",
      );
      return;
    }
    if (selectedSymptoms.length === 0 && !otherSymptoms.trim()) {
      Alert.alert("Describe your symptoms", "Please select at least one symptom or describe what you are experiencing.");
      return;
    }

    setSubmitting(true);
    const allSymptoms = [...selectedSymptoms];
    if (otherSymptoms.trim()) allSymptoms.push(otherSymptoms.trim());

    const specialtyLabel = SPECIALTIES.find((s) => s.id === specialty)?.label ?? "General Eye Care";

    // Use existing screening if available — otherwise proceed without one (nullable)
    const myScreening = screenings.find((s) => s.patientId === myPatient.id);

    let consultation;
    try {
      consultation = await addConsultation({
        screeningId: myScreening?.id ?? null,
        patientId: myPatient.id,
        requestedBy: user?.id ?? "patient",
        status: "Pending",
        priority,
        clinicalNotes: `Patient-requested ${specialtyLabel} consultation.\n\nSymptoms: ${allSymptoms.join(", ")}.${imageUri ? "\n\nPatient attached an eye image." : ""}`,
      } as any);
    } catch {
      setSubmitting(false);
      Alert.alert("Submit Failed", "Could not send your request. Please try again.");
      return;
    }

    if (!consultation) {
      setSubmitting(false);
      Alert.alert("Submit Failed", "Could not send your request. Please check your connection and try again.");
      return;
    }

    // Notify patient — round-robin assign to available doctor if any
    const assigned = doctors.find((d) => d.isAvailable);
    await addNotification({
      type: "ConsultationUpdate",
      title: "Consultation Request Received",
      body: `Your ${specialtyLabel.toLowerCase()} request has been submitted. ${
        assigned ? `${assigned.name} will respond shortly.` : "A specialist will respond shortly."
      }`,
      patientId: myPatient.id,
      consultationId: consultation.id,
    });

    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Alert.alert(
      "Request Submitted ✓",
      `Your consultation request has been received.\n\n` +
      `Patient ID: ${myPatient.patientId}\n` +
      (assigned ? `${assigned.name} (${assigned.specialty}) will review your case.\n\n` : "") +
      `You will be notified when a specialist responds.`,
      [{ text: "OK", onPress: () => router.replace("/(tabs)") }],
    );
    setSubmitting(false);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 22, paddingBottom: insets.bottom + 32 },
    sectionLabel: { fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 10 },
    helper: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
    intro: {
      flexDirection: "row", gap: 10, padding: 14, borderRadius: 12,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    introText: { flex: 1, fontSize: 13, color: colors.foreground, lineHeight: 19 },
    // Patient ID badge
    idBadge: {
      flexDirection: "row", alignItems: "center", gap: 10, padding: 14,
      borderRadius: 12, backgroundColor: "#f0f9ff",
      borderWidth: 1, borderColor: "#bae6fd",
    },
    idLabel: { fontSize: 12, fontWeight: "600", color: "#0369a1" },
    idValue: { fontSize: 16, fontWeight: "700", color: "#0284c7" },
    idSub: { fontSize: 11, color: "#64748b", marginTop: 1 },
    // Loading / error states
    center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
    loadingText: { fontSize: 14, color: colors.mutedForeground },
    errorCard: {
      padding: 20, borderRadius: 12, backgroundColor: "#fef2f2",
      borderWidth: 1, borderColor: "#fecaca", alignItems: "center", gap: 10,
    },
    errorTitle: { fontSize: 16, fontWeight: "700", color: "#991b1b" },
    errorBody: { fontSize: 13, color: "#7f1d1d", textAlign: "center", lineHeight: 19 },
    errorBtn: {
      marginTop: 4, paddingHorizontal: 20, paddingVertical: 10,
      borderRadius: 10, backgroundColor: "#0ea5e9",
    },
    errorBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    // Form options
    optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    optionCard: {
      flexBasis: specialtyMinWidth, flexGrow: 1,
      flexDirection: "row", alignItems: "center", gap: r.iconSize(10),
      paddingHorizontal: r.iconSize(12), paddingVertical: r.iconSize(14),
      borderRadius: 12, borderWidth: 1.5,
      backgroundColor: colors.card, borderColor: colors.border,
    },
    optionCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
    optionLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.foreground },
    priorityCard: {
      flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5,
      backgroundColor: colors.card, borderColor: colors.border,
      alignItems: "center", gap: 4,
    },
    priorityCardActive: { borderWidth: 2 },
    priorityLabel: { fontSize: 13, fontWeight: "700" },
    priorityDesc: { fontSize: 10, color: colors.mutedForeground, textAlign: "center" },
    symptomChip: {
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    },
    symptomChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    symptomText: { fontSize: 12, fontWeight: "500", color: colors.foreground },
    symptomTextActive: { color: "#fff" },
    textarea: {
      minHeight: 80, padding: 12, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
      fontSize: 14, color: colors.foreground, textAlignVertical: "top",
    },
    imageBox: {
      borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border,
      borderRadius: 12, padding: 16, alignItems: "center", gap: 8,
      backgroundColor: colors.card,
    },
    imagePreview: { width: "100%", height: 180, borderRadius: 10 },
    submitBtn: {
      backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 12,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    cancelBtn: { paddingVertical: 12, alignItems: "center" },
    cancelText: { fontSize: 14, fontWeight: "500", color: colors.mutedForeground },
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadingProfile) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.loadingText}>Loading your patient profile…</Text>
      </View>
    );
  }

  // ── No profile at all ──────────────────────────────────────────────────────
  if (!loadingProfile && !myPatient && profileError === "no_profile") {
    return (
      <ScrollView style={s.container} contentContainerStyle={[s.content, s.center]}>
        <View style={s.errorCard}>
          <Feather name="user-x" size={32} color="#ef4444" />
          <Text style={s.errorTitle}>No Patient Profile Found</Text>
          <Text style={s.errorBody}>
            You need to create a patient profile before requesting a consultation.
            Please register your details first.
          </Text>
          <TouchableOpacity style={s.errorBtn} onPress={() => router.push("/patient/register")}>
            <Text style={s.errorBtnText}>Create Patient Profile</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Fetch error ────────────────────────────────────────────────────────────
  if (!loadingProfile && !myPatient && profileError === "fetch_failed") {
    return (
      <ScrollView style={s.container} contentContainerStyle={[s.content, s.center]}>
        <View style={s.errorCard}>
          <Feather name="wifi-off" size={32} color="#f59e0b" />
          <Text style={s.errorTitle}>Connection Error</Text>
          <Text style={s.errorBody}>
            Could not load your patient profile. Please check your internet connection and try again.
          </Text>
          <TouchableOpacity style={s.errorBtn} onPress={() => router.back()}>
            <Text style={s.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Patient ID badge — always visible so patient knows their ID */}
      {myPatient && (
        <View style={s.idBadge}>
          <Feather name="credit-card" size={22} color="#0284c7" />
          <View style={{ flex: 1 }}>
            <Text style={s.idLabel}>YOUR PATIENT ID</Text>
            <Text style={s.idValue}>{myPatient.patientId}</Text>
            <Text style={s.idSub}>{myPatient.firstName} {myPatient.lastName}</Text>
          </View>
        </View>
      )}

      <View style={s.intro}>
        <Feather name="info" size={18} color={colors.primary} />
        <Text style={s.introText}>
          Tell us what you're experiencing and a specialist will respond. For emergencies (sudden vision loss, severe pain, eye injury), go to your nearest hospital immediately.
        </Text>
      </View>

      {/* Specialty */}
      <View>
        <Text style={s.sectionLabel}>What kind of help do you need?</Text>
        <View style={s.optionsRow}>
          {SPECIALTIES.map((sp) => {
            const active = specialty === sp.id;
            return (
              <TouchableOpacity
                key={sp.id}
                style={[s.optionCard, active && s.optionCardActive]}
                onPress={() => setSpecialty(sp.id)}
                activeOpacity={0.85}
              >
                <Feather name={sp.icon as never} size={r.iconSize(18)} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={s.optionLabel}>{sp.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Priority */}
      <View>
        <Text style={s.sectionLabel}>How urgent is it?</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {PRIORITIES.map((p) => {
            const active = priority === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.priorityCard, active && s.priorityCardActive, active && { borderColor: p.color, backgroundColor: `${p.color}15` }]}
                onPress={() => setPriority(p.id)}
                activeOpacity={0.85}
              >
                <Text style={[s.priorityLabel, { color: p.color }]}>{p.label}</Text>
                <Text style={s.priorityDesc}>{p.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Symptoms */}
      <View>
        <Text style={s.sectionLabel}>What symptoms are you having?</Text>
        <View style={[s.optionsRow, { marginBottom: 10 }]}>
          {COMMON_SYMPTOMS.map((sym) => {
            const active = selectedSymptoms.includes(sym);
            return (
              <TouchableOpacity
                key={sym}
                style={[s.symptomChip, active && s.symptomChipActive]}
                onPress={() => toggleSymptom(sym)}
                activeOpacity={0.85}
              >
                <Text style={[s.symptomText, active && s.symptomTextActive]}>{sym}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          style={s.textarea}
          value={otherSymptoms}
          onChangeText={setOtherSymptoms}
          placeholder="Describe anything else (when it started, which eye, what makes it better or worse)…"
          placeholderTextColor={colors.mutedForeground}
          multiline
        />
      </View>

      {/* Image */}
      <View>
        <Text style={s.sectionLabel}>Attach an eye photo (optional)</Text>
        <Text style={[s.helper, { marginTop: 0, marginBottom: 10 }]}>
          A clear photo helps the doctor assess your eyes. Take a well-lit photo of the affected eye.
        </Text>
        <TouchableOpacity style={s.imageBox} onPress={pickImage} activeOpacity={0.85}>
          {imageUri ? (
            <>
              <Image source={{ uri: imageUri }} style={s.imagePreview} resizeMode="cover" />
              <Text style={[s.helper, { marginTop: 0 }]}>Tap to change image</Text>
            </>
          ) : (
            <>
              <Feather name="camera" size={28} color={colors.mutedForeground} />
              <Text style={[s.helper, { marginTop: 0 }]}>Tap to add a photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[s.submitBtn, (submitting || !myPatient) && { opacity: 0.6 }]}
        onPress={submit}
        disabled={submitting || !myPatient}
        activeOpacity={0.85}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Feather name="send" size={16} color="#fff" />}
        <Text style={s.submitBtnText}>
          {submitting ? "Submitting…" : "Submit Consultation Request"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()}>
        <Text style={s.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
