import React, { useMemo, useState } from "react";
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
import { useResponsive } from "@/hooks/useResponsive";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

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

export default function PatientProfileScreen() {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { patients, updatePatient } = useApp();

  const myPatient = useMemo(
    () => patients.find((p) => `${p.firstName} ${p.lastName}` === user?.fullName),
    [patients, user],
  );

  const [phone, setPhone]               = useState(myPatient?.phone ?? "");
  const [village, setVillage]           = useState(myPatient?.village ?? "");
  const [district, setDistrict]         = useState(myPatient?.district ?? "");
  const [history, setHistory]           = useState<string[]>(myPatient?.medicalHistory ?? []);
  const [otherCondition, setOtherCondition] = useState("");

  const toggle = (c: string) => {
    setHistory((h) => h.includes(c) ? h.filter((x) => x !== c) : [...h, c]);
  };

  const save = () => {
    if (!myPatient) {
      Alert.alert("No profile", "Your patient profile could not be found.");
      return;
    }
    const finalHistory = otherCondition.trim()
      ? Array.from(new Set([...history, otherCondition.trim()]))
      : history;

    updatePatient(myPatient.id, {
      phone,
      village,
      district,
      medicalHistory: finalHistory,
    });

    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Your profile has been updated.", [{ text: "OK", onPress: () => router.back() }]);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 22, paddingBottom: insets.bottom + 32 },
    intro: {
      flexDirection: "row", gap: 10, padding: 14, borderRadius: 12,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    introText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 19 },
    sectionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 10 },
    fieldGroup: { gap: 12 },
    field: { gap: 6 },
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
    },
    submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
    cancelBtn: { paddingVertical: 12, alignItems: "center" },
    cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  if (!myPatient) {
    return (
      <View style={[styles.container, { padding: 20 }]}>
        <Text style={{ color: colors.foreground, fontSize: 16 }}>No patient profile linked.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <Feather name="lock" size={r.iconSize(18)} color={colors.primary} />
        <Text style={styles.introText}>
          Your medical information is private and protected under the Uganda Data Protection and Privacy Act 2019. Only your care team can see it.
        </Text>
      </View>

      <View>
        <Text style={styles.sectionLabel}>Personal Information</Text>
        <View style={styles.fieldGroup}>
          <View style={styles.field}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.readonly}>
              <Text style={styles.readonlyText}>{myPatient.firstName} {myPatient.lastName}</Text>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Date of Birth</Text>
            <View style={styles.readonly}>
              <Text style={styles.readonlyText}>{new Date(myPatient.dateOfBirth).toLocaleDateString("en-UG", { year: "numeric", month: "long", day: "numeric" })}</Text>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Patient ID</Text>
            <View style={styles.readonly}>
              <Text style={styles.readonlyText}>{myPatient.patientId}</Text>
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
            <TextInput
              style={styles.input}
              value={district}
              onChangeText={setDistrict}
              placeholder="District"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>
      </View>

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
          onChangeText={setOtherCondition}
          placeholder="e.g. Asthma, Thyroid disease…"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={save} activeOpacity={0.85}>
        <Feather name="save" size={r.iconSize(16)} color="#fff" />
        <Text style={styles.submitBtnText}>Save Profile</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
