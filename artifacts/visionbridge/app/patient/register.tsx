import React, { useState } from "react";
import {
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
import { useApp, PatientSex } from "@/context/AppContext";
import { DateInput } from "@/components/ui/DateInput";

const MEDICAL_CONDITIONS = [
  "Diabetes Type 1",
  "Diabetes Type 2",
  "Hypertension",
  "Glaucoma (family history)",
  "Cataracts",
  "Macular Degeneration",
  "Sickle Cell Disease",
  "HIV/AIDS",
];

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[styles.label, { color: colors.foreground }]}>
      {label}
      {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
    </Text>
  );
}

function InputField({
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "words",
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "numeric";
  autoCapitalize?: "none" | "words" | "sentences";
}) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      style={[
        styles.input,
        {
          color: colors.foreground,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    />
  );
}

export default function RegisterPatientScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addPatient, patients } = useApp();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<PatientSex>("F");
  const [phone, setPhone] = useState("");
  const [village, setVillage] = useState("");
  const [district, setDistrict] = useState("Mbarara");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  function toggleCondition(c: string) {
    setSelectedConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function generatePatientId() {
    const year = new Date().getFullYear();
    const seq = (patients.length + 1).toString().padStart(4, "0");
    return `MBR-${year}-${seq}`;
  }

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !dob.trim()) {
      Alert.alert("Required Fields", "Please fill in first name, last name, and date of birth.");
      return;
    }

    // Validate date of birth (must be YYYY-MM-DD with valid ranges)
    const dobParts = dob.split("-");
    const yyyy = parseInt(dobParts[0], 10);
    const mm = parseInt(dobParts[1], 10);
    const dd = parseInt(dobParts[2], 10);
    const currentYear = new Date().getFullYear();
    if (
      isNaN(yyyy) || isNaN(mm) || isNaN(dd) ||
      mm < 1 || mm > 12 ||
      dd < 1 || dd > 31 ||
      yyyy < 1900 || yyyy > currentYear
    ) {
      Alert.alert("Invalid Date", "Please enter a valid date of birth using the Day / Month / Year fields.");
      return;
    }

    setSaving(true);
    try {
      const result = await addPatient({
        patientId: generatePatientId(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dob.trim(),
        sex,
        phone: phone.trim() || "",
        village: village.trim() || "Unknown",
        district: district.trim() || "Mbarara",
        medicalHistory: selectedConditions,
        lastVisit: new Date().toISOString(),
      });

      if (!result) {
        Alert.alert(
          "Registration Failed",
          "Could not save the patient record. Please check your connection and try again."
        );
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Patient Registered",
        `${firstName.trim()} ${lastName.trim()} has been successfully registered with MRN: ${result.patientId}.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert("Error", "Failed to register patient. Please try again.");
      console.error("[RegisterPatient]", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 16, paddingBottom: botPad + 100 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          PERSONAL INFORMATION
        </Text>
        <FieldLabel label="First Name" required />
        <InputField value={firstName} onChangeText={setFirstName} placeholder="Grace" />
        <FieldLabel label="Last Name" required />
        <InputField value={lastName} onChangeText={setLastName} placeholder="Atuhaire" />
        <DateInput
          label="Date of Birth"
          required
          value={dob}
          onChange={setDob}
        />
        <FieldLabel label="Sex" required />
        <View style={styles.segmentRow}>
          {(["F", "M", "Other"] as PatientSex[]).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => { setSex(s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[
                styles.segment,
                {
                  backgroundColor: sex === s ? colors.primary : colors.muted,
                  borderColor: sex === s ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: sex === s ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {s === "F" ? "Female" : s === "M" ? "Male" : "Other"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          CONTACT & LOCATION
        </Text>
        <FieldLabel label="Phone Number" />
        <InputField value={phone} onChangeText={setPhone} placeholder="+256 700 000 000" keyboardType="phone-pad" autoCapitalize="none" />
        <FieldLabel label="Village / Sub-county" />
        <InputField value={village} onChangeText={setVillage} placeholder="Katete" />
        <FieldLabel label="District" />
        <InputField value={district} onChangeText={setDistrict} placeholder="Mbarara" />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          MEDICAL HISTORY
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Select all that apply
        </Text>
        <View style={styles.conditionsGrid}>
          {MEDICAL_CONDITIONS.map((c) => {
            const selected = selectedConditions.includes(c);
            return (
              <TouchableOpacity
                key={c}
                onPress={() => toggleCondition(c)}
                style={[
                  styles.conditionChip,
                  {
                    backgroundColor: selected ? colors.primary + "18" : colors.muted,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                {selected ? (
                  <Feather name="check" size={12} color={colors.primary} />
                ) : null}
                <Text
                  style={[
                    styles.conditionText,
                    { color: selected ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={[
          styles.saveBtn,
          { backgroundColor: saving ? colors.muted : colors.primary },
        ]}
        activeOpacity={0.85}
      >
        <Feather name="user-plus" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>
          {saving ? "Registering..." : "Register Patient"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 8 },
  section: { gap: 10, marginBottom: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 8,
  },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 4,
  },
  segmentRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  segmentText: { fontSize: 14, fontWeight: "600" },
  hint: { fontSize: 12, marginTop: -4 },
  conditionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  conditionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  conditionText: { fontSize: 13, fontWeight: "500" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 16,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
