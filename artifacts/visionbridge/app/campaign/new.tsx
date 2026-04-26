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
import { useApp, CampaignType } from "@/context/AppContext";

const CAMPAIGN_TYPES: { type: CampaignType; label: string; desc: string; icon: keyof typeof Feather.glyphMap }[] = [
  { type: "School", label: "School Screening", desc: "Vision screening for students aged 5-18", icon: "users" },
  { type: "DiabetesClinic", label: "Diabetes Clinic", desc: "Diabetic retinopathy screening for registered patients", icon: "activity" },
  { type: "Community", label: "Community Outreach", desc: "General community screening at village/health centre", icon: "map-pin" },
  { type: "MobileUnit", label: "Mobile Eye Unit", desc: "Truck-mounted unit serving remote areas", icon: "truck" },
];

export default function NewCampaignScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addCampaign, addNotification, currentUser } = useApp();

  const [type, setType] = useState<CampaignType | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [district, setDistrict] = useState("Mbarara");
  const [targetPopulation, setTargetPopulation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetCount, setTargetCount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  async function handleSave() {
    if (!type) { Alert.alert("Select Type", "Please choose a campaign type."); return; }
    if (!name.trim()) { Alert.alert("Name Required", "Please enter a campaign name."); return; }
    if (!location.trim()) { Alert.alert("Location Required", "Please enter the screening location."); return; }
    if (!startDate.trim()) { Alert.alert("Date Required", "Please enter the start date."); return; }
    const count = parseInt(targetCount);
    if (!count || count < 1) { Alert.alert("Target Required", "Please enter a valid target patient count."); return; }

    setSaving(true);
    try {
      const campaign = await addCampaign({
        name: name.trim(),
        type,
        status: "Planned",
        location: location.trim(),
        district: district.trim(),
        targetPopulation: targetPopulation.trim() || `General population, ${location.trim()}`,
        startDate: startDate.trim(),
        endDate: endDate.trim() || undefined,
        createdBy: currentUser.id,
        targetCount: count,
        notes: notes.trim() || undefined,
      });
      addNotification({
        type: "CampaignAlert",
        title: "Campaign Created",
        body: `${name.trim()} planned for ${startDate}`,
        campaignId: campaign.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/campaign/${campaign.id}`);
    } catch {
      Alert.alert("Error", "Failed to create campaign. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CAMPAIGN TYPE *</Text>
      </View>
      <View style={styles.typeGrid}>
        {CAMPAIGN_TYPES.map((t) => (
          <TouchableOpacity
            key={t.type}
            onPress={() => { setType(t.type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.typeCard, { borderColor: type === t.type ? colors.primary : colors.border, backgroundColor: type === t.type ? colors.primary + "10" : colors.card }]}
          >
            <View style={[styles.typeIcon, { backgroundColor: type === t.type ? colors.primary + "20" : colors.muted }]}>
              <Feather name={t.icon} size={22} color={type === t.type ? colors.primary : colors.mutedForeground} />
            </View>
            <Text style={[styles.typeLabel, { color: colors.foreground }]}>{t.label}</Text>
            <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>{t.desc}</Text>
            {type === t.type ? (
              <View style={[styles.checkMark, { backgroundColor: colors.primary }]}>
                <Feather name="check" size={10} color="#fff" />
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CAMPAIGN DETAILS</Text>
      </View>
      <View style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Campaign Name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bwizibwera Diabetes Eye Screening 2025"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Screening Location *</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Bwizibwera Health Centre IV"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>District</Text>
        <TextInput
          value={district}
          onChangeText={setDistrict}
          placeholder="Mbarara"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Target Population</Text>
        <TextInput
          value={targetPopulation}
          onChangeText={setTargetPopulation}
          placeholder="e.g. Registered diabetes patients at HC IV"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        />
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SCHEDULE & TARGETS</Text>
      </View>
      <View style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Start Date * (YYYY-MM-DD)</Text>
        <TextInput
          value={startDate}
          onChangeText={setStartDate}
          placeholder="2025-04-22"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          keyboardType="numeric"
        />
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>End Date (optional)</Text>
        <TextInput
          value={endDate}
          onChangeText={setEndDate}
          placeholder="2025-04-24"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          keyboardType="numeric"
        />
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Target Patient Count *</Text>
        <TextInput
          value={targetCount}
          onChangeText={setTargetCount}
          placeholder="50"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NOTES</Text>
      </View>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Logistics, partnerships, equipment needs, consent arrangements..."
        placeholderTextColor={colors.mutedForeground}
        multiline
        numberOfLines={4}
        style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
      />

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        <Feather name="check" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>{saving ? "Creating..." : "Create Campaign"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  sectionHead: {},
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeCard: { width: "48%", borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 6, position: "relative" },
  typeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: 13, fontWeight: "700" },
  typeDesc: { fontSize: 11, lineHeight: 16 },
  checkMark: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  fieldCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: "top" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
