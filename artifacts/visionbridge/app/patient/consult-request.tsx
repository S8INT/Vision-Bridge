import React, { useMemo, useState } from "react";
import {
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
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

const SPECIALTIES = [
  { id: "general",  label: "General Eye Care", icon: "eye" },
  { id: "diabetes", label: "Diabetic Retinopathy", icon: "droplet" },
  { id: "glaucoma", label: "Glaucoma", icon: "shield" },
  { id: "cataract", label: "Cataract", icon: "circle" },
  { id: "child",    label: "Children's Vision", icon: "smile" },
] as const;

const PRIORITIES = [
  { id: "Routine",   label: "Routine", description: "Within a week", color: "#10b981" },
  { id: "Urgent",    label: "Urgent", description: "Within 24 hrs", color: "#f59e0b" },
  { id: "Emergency", label: "Emergency", description: "Same day", color: "#ef4444" },
] as const;

const COMMON_SYMPTOMS = [
  "Blurred vision",
  "Eye pain",
  "Red eyes",
  "Watery eyes",
  "Itching",
  "Sensitivity to light",
  "Floaters / spots",
  "Vision loss",
  "Headaches with vision",
  "Difficulty reading",
];

export default function ConsultRequestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { patients, doctors, screenings, addConsultation, addNotification } = useApp();

  const myPatient = useMemo(
    () => patients.find((p) => `${p.firstName} ${p.lastName}` === user?.fullName),
    [patients, user],
  );

  const [specialty, setSpecialty] = useState<typeof SPECIALTIES[number]["id"]>("general");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]["id"]>("Routine");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [otherSymptoms, setOtherSymptoms] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

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

  const submit = () => {
    if (!myPatient) {
      Alert.alert("Profile not linked", "Your patient record could not be found.");
      return;
    }
    if (selectedSymptoms.length === 0 && !otherSymptoms.trim()) {
      Alert.alert("Describe your symptoms", "Please select at least one symptom or describe what you are experiencing.");
      return;
    }

    setSubmitting(true);
    const allSymptoms = [...selectedSymptoms];
    if (otherSymptoms.trim()) allSymptoms.push(otherSymptoms.trim());

    // Find a screening for this patient (or create a stub)
    const myScreening = screenings.find((s) => s.patientId === myPatient.id);
    const specialtyLabel = SPECIALTIES.find((s) => s.id === specialty)?.label ?? "General Eye Care";

    const consultation = addConsultation({
      screeningId: myScreening?.id ?? "self-reported",
      patientId: myPatient.id,
      requestedBy: user?.id ?? "patient",
      status: "Pending",
      priority,
      clinicalNotes: `Patient-requested ${specialtyLabel} consultation.\n\nSymptoms: ${allSymptoms.join(", ")}.${imageUri ? "\n\nPatient attached an eye image." : ""}`,
    });

    // Round-robin assign to an available doctor specialised (or default)
    const candidates = doctors.filter((d) => d.isAvailable);
    const assigned = candidates[0];

    addNotification({
      type: "ConsultationUpdate",
      title: "Consultation Request Received",
      body: `Your ${specialtyLabel.toLowerCase()} request has been submitted. ${assigned ? `${assigned.name} will respond shortly.` : "A specialist will respond shortly."}`,
      patientId: myPatient.id,
      consultationId: consultation.id,
    });

    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Alert.alert(
      "Request Submitted",
      `Your consultation request has been received.${assigned ? `\n\n${assigned.name} (${assigned.specialty}) will review your case.` : ""}\n\nYou will be notified when a specialist responds.`,
      [{ text: "OK", onPress: () => router.replace("/(tabs)") }],
    );
    setSubmitting(false);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 22, paddingBottom: insets.bottom + 32 },
    sectionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 10 },
    helper: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    intro: {
      flexDirection: "row", gap: 10, padding: 14, borderRadius: 12,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    introText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 19 },
    optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    optionCard: {
      flexBasis: "47%", flexGrow: 1,
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 12, paddingVertical: 14,
      borderRadius: 12, borderWidth: 1.5,
      backgroundColor: colors.card, borderColor: colors.border,
    },
    optionCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
    optionLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    priorityCard: {
      flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5,
      backgroundColor: colors.card, borderColor: colors.border,
      alignItems: "center", gap: 4,
    },
    priorityCardActive: { borderWidth: 2 },
    priorityLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
    priorityDesc: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
    symptomChip: {
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    },
    symptomChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    symptomText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground },
    symptomTextActive: { color: "#fff" },
    textarea: {
      minHeight: 80, padding: 12, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
      fontFamily: "Inter_400Regular", fontSize: 14, color: colors.foreground,
      textAlignVertical: "top",
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
    submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
    cancelBtn: { paddingVertical: 12, alignItems: "center" },
    cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <Feather name="info" size={18} color={colors.primary} />
        <Text style={styles.introText}>
          Tell us what you're experiencing and a specialist will respond. For emergencies (sudden vision loss, severe pain, eye injury), go to your nearest hospital immediately.
        </Text>
      </View>

      <View>
        <Text style={styles.sectionLabel}>What kind of help do you need?</Text>
        <View style={styles.optionsRow}>
          {SPECIALTIES.map((sp) => {
            const active = specialty === sp.id;
            return (
              <TouchableOpacity
                key={sp.id}
                style={[styles.optionCard, active && styles.optionCardActive]}
                onPress={() => setSpecialty(sp.id)}
                activeOpacity={0.85}
              >
                <Feather name={sp.icon as never} size={18} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={styles.optionLabel}>{sp.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={styles.sectionLabel}>How urgent is it?</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {PRIORITIES.map((p) => {
            const active = priority === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.priorityCard,
                  active && styles.priorityCardActive,
                  active && { borderColor: p.color, backgroundColor: `${p.color}15` },
                ]}
                onPress={() => setPriority(p.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.priorityLabel, { color: p.color }]}>{p.label}</Text>
                <Text style={styles.priorityDesc}>{p.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={styles.sectionLabel}>What symptoms are you having?</Text>
        <View style={[styles.optionsRow, { marginBottom: 10 }]}>
          {COMMON_SYMPTOMS.map((s) => {
            const active = selectedSymptoms.includes(s);
            return (
              <TouchableOpacity
                key={s}
                style={[styles.symptomChip, active && styles.symptomChipActive]}
                onPress={() => toggleSymptom(s)}
                activeOpacity={0.85}
              >
                <Text style={[styles.symptomText, active && styles.symptomTextActive]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          style={styles.textarea}
          value={otherSymptoms}
          onChangeText={setOtherSymptoms}
          placeholder="Describe anything else (when did it start, which eye, what makes it better/worse)…"
          placeholderTextColor={colors.mutedForeground}
          multiline
        />
      </View>

      <View>
        <Text style={styles.sectionLabel}>Attach an eye photo (optional)</Text>
        <Text style={[styles.helper, { marginTop: 0, marginBottom: 10 }]}>
          A clear photo helps the doctor assess your eyes. Take a well-lit photo of the affected eye.
        </Text>
        <TouchableOpacity style={styles.imageBox} onPress={pickImage} activeOpacity={0.85}>
          {imageUri ? (
            <>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
              <Text style={[styles.helper, { marginTop: 0 }]}>Tap to change image</Text>
            </>
          ) : (
            <>
              <Feather name="camera" size={28} color={colors.mutedForeground} />
              <Text style={[styles.helper, { marginTop: 0 }]}>Tap to add a photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
        onPress={submit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        <Feather name="send" size={16} color="#fff" />
        <Text style={styles.submitBtnText}>{submitting ? "Submitting…" : "Submit Consultation Request"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
