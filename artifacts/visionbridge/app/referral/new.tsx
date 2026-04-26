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
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp, ReferralType } from "@/context/AppContext";

const FACILITIES_INTERNAL = [
  { name: "Kampala International Eye Institute", district: "Kampala" },
  { name: "Mulago National Referral Hospital", district: "Kampala" },
  { name: "Mbarara RRH Eye Unit", district: "Mbarara" },
  { name: "Kabale Regional Referral", district: "Kabale" },
  { name: "Fort Portal RRH Eye Centre", district: "Fort Portal" },
];

const FACILITIES_EXTERNAL = [
  { name: "Aravind Eye Hospital (India)", district: "Tamil Nadu, India" },
  { name: "Sightsavers Partner Network", district: "International" },
  { name: "ORBIS Flying Eye Hospital", district: "International" },
];

export default function NewReferralScreen() {
  const { consultationId, patientId } = useLocalSearchParams<{ consultationId: string; patientId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addReferral, updateConsultation, updateScreening, addNotification, getPatient, consultations, screenings, currentUser } = useApp();

  const patient = getPatient(patientId);
  const consultation = consultations.find((c) => c.id === consultationId);

  const [referralType, setReferralType] = useState<ReferralType>("Internal");
  const [selectedFacility, setSelectedFacility] = useState<{ name: string; district: string } | null>(null);
  const [targetDoctor, setTargetDoctor] = useState("");
  const [urgency, setUrgency] = useState<"Routine" | "Urgent" | "Emergency">("Urgent");
  const [reason, setReason] = useState("");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [referralNotes, setReferralNotes] = useState("");
  const [transportArranged, setTransportArranged] = useState(false);
  const [escortRequired, setEscortRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const facilities = referralType === "Internal" ? FACILITIES_INTERNAL : FACILITIES_EXTERNAL;

  async function handleSave() {
    if (!selectedFacility) { Alert.alert("Select Facility", "Please choose a target facility."); return; }
    if (!reason.trim()) { Alert.alert("Reason Required", "Please enter the reason for referral."); return; }
    if (!clinicalSummary.trim()) { Alert.alert("Summary Required", "Please enter a clinical summary."); return; }

    setSaving(true);
    try {
      const ref = await addReferral({
        consultationId,
        patientId,
        type: referralType,
        status: "Pending",
        createdBy: currentUser.id,
        targetFacility: selectedFacility.name,
        targetDistrict: selectedFacility.district,
        targetDoctor: targetDoctor.trim() || undefined,
        urgency,
        reason: reason.trim(),
        clinicalSummary: clinicalSummary.trim(),
        transportArranged,
        escortRequired,
        referralNotes: referralNotes.trim() || undefined,
      });
      updateConsultation(consultationId, { referralId: ref.id, status: "Referred" });
      const scr = screenings.find((s) => s.id === consultation?.screeningId);
      if (scr) updateScreening(scr.id, { status: "Referred" });
      addNotification({
        type: "PatientReferred",
        title: "Referral Created",
        body: `${patient?.firstName} ${patient?.lastName} referred to ${selectedFacility.name}`,
        patientId,
        referralId: ref.id,
        consultationId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/referral/${ref.id}`);
    } catch {
      Alert.alert("Error", "Failed to create referral. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
      <TouchableOpacity onPress={() => { onChange(!value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        style={[styles.toggle, { backgroundColor: value ? colors.success + "14" : colors.muted, borderColor: value ? colors.success : colors.border }]}
      >
        <View style={[styles.toggleDot, { backgroundColor: value ? colors.success : colors.mutedForeground, transform: [{ translateX: value ? 20 : 0 }] }]} />
        <Text style={[styles.toggleLabel, { color: value ? colors.success : colors.mutedForeground }]}>{label}: {value ? "Yes" : "No"}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {patient ? (
        <View style={[styles.patientBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.av, { backgroundColor: colors.primary + "18" }]}>
            <Text style={[styles.avText, { color: colors.primary }]}>{patient.firstName[0]}{patient.lastName[0]}</Text>
          </View>
          <View>
            <Text style={[styles.patientName, { color: colors.foreground }]}>{patient.firstName} {patient.lastName}</Text>
            <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>{patient.patientId} · {patient.village}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>REFERRAL TYPE</Text>
        <View style={styles.segRow}>
          {(["Internal", "External"] as ReferralType[]).map((t) => (
            <TouchableOpacity key={t} onPress={() => { setReferralType(t); setSelectedFacility(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.seg, { backgroundColor: referralType === t ? colors.primary : colors.muted, borderColor: referralType === t ? colors.primary : colors.border }]}
            >
              <Text style={[styles.segText, { color: referralType === t ? "#fff" : colors.mutedForeground }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>TARGET FACILITY *</Text>
        {facilities.map((f) => (
          <TouchableOpacity key={f.name} onPress={() => { setSelectedFacility(f); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.facilityOption, { borderColor: selectedFacility?.name === f.name ? colors.primary : colors.border, backgroundColor: selectedFacility?.name === f.name ? colors.primary + "10" : "transparent" }]}
          >
            <Feather name="map-pin" size={14} color={selectedFacility?.name === f.name ? colors.primary : colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.facilityName, { color: colors.foreground }]}>{f.name}</Text>
              <Text style={[styles.facilityDistrict, { color: colors.mutedForeground }]}>{f.district}</Text>
            </View>
            {selectedFacility?.name === f.name ? <Feather name="check-circle" size={16} color={colors.primary} /> : null}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>TARGET SPECIALIST (OPTIONAL)</Text>
        <TextInput value={targetDoctor} onChangeText={setTargetDoctor} placeholder="Dr. Name (if known)" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>URGENCY *</Text>
        <View style={styles.segRow}>
          {(["Routine", "Urgent", "Emergency"] as const).map((u) => {
            const col = u === "Emergency" ? colors.destructive : u === "Urgent" ? colors.warning : colors.success;
            return (
              <TouchableOpacity key={u} onPress={() => { setUrgency(u); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.seg, { backgroundColor: urgency === u ? col : colors.muted, borderColor: urgency === u ? col : colors.border }]}
              >
                <Text style={[styles.segText, { color: urgency === u ? "#fff" : colors.mutedForeground }]}>{u}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>REASON FOR REFERRAL *</Text>
        <TextInput value={reason} onChangeText={setReason} placeholder="Primary clinical reason..." placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>CLINICAL SUMMARY *</Text>
        <TextInput value={clinicalSummary} onChangeText={setClinicalSummary} placeholder="Patient history, findings, investigations, management so far..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={4} style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>LOGISTICS</Text>
        <Toggle label="Transport Arranged" value={transportArranged} onChange={setTransportArranged} />
        <Toggle label="Escort Required" value={escortRequired} onChange={setEscortRequired} />
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>ADDITIONAL NOTES</Text>
        <TextInput value={referralNotes} onChangeText={setReferralNotes} placeholder="Special instructions, timing, patient preferences..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
      </View>

      <View style={[styles.disclaimer, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
        <Feather name="shield" size={14} color="#92400e" />
        <Text style={[styles.disclaimerText, { color: "#92400e" }]}>
          Referral letter will be generated with patient data, clinical summary, and consent information.
        </Text>
      </View>

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
        <Feather name="send" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>{saving ? "Creating..." : "Create Referral"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  patientBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  av: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 16, fontWeight: "700" },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  section: { gap: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  segRow: { flexDirection: "row", gap: 8 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  segText: { fontSize: 13, fontWeight: "600" },
  facilityOption: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, gap: 10 },
  facilityName: { fontSize: 14, fontWeight: "600" },
  facilityDistrict: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  textArea: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  toggleDot: { width: 16, height: 16, borderRadius: 8 },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  disclaimerText: { fontSize: 12, lineHeight: 18, flex: 1 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
