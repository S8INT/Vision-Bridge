/**
 * Field Patient Registration — Campaign Context
 *
 * Optimised for outreach use:
 *  - Campaign banner pre-sets district & campaignId
 *  - District chip-picker (Uganda districts, scrollable)
 *  - Approximate age wheel when exact DOB is unknown
 *  - Large touch targets throughout
 *  - "Register & Screen Now" routes straight into screening
 */

import React, { useMemo, useRef, useState } from "react";
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
import { useApp, PatientSex } from "@/context/AppContext";
import { DateInput } from "@/components/ui/DateInput";

// ── Uganda districts ─────────────────────────────────────────────────────────
const UGANDA_DISTRICTS = [
  "Abim","Adjumani","Agago","Alebtong","Amolatar","Amudat","Amuria","Amuru",
  "Apac","Arua","Budaka","Bududa","Bugiri","Buhweju","Buikwe","Bukedea",
  "Bukomansimbi","Bukwo","Bulambuli","Buliisa","Bundibugyo","Bunyangabu",
  "Bushenyi","Busia","Butaleja","Butebo","Buvuma","Buyende","Dokolo","Gomba",
  "Gulu","Hoima","Ibanda","Iganga","Isingiro","Jinja","Kaabong","Kabale",
  "Kabarole","Kaberamaido","Kagadi","Kakumiro","Kalaki","Kalangala","Kaliro",
  "Kalungu","Kampala","Kamuli","Kamwenge","Kanungu","Kapchorwa","Kapelebyong",
  "Karenga","Kasanda","Kasese","Katakwi","Kayunga","Kazo","Kibaale","Kiboga",
  "Kibuku","Kikuube","Kiruhura","Kiryandongo","Kisoro","Kitgum","Koboko",
  "Kole","Kotido","Kumi","Kwania","Kween","Kyankwanzi","Kyegegwa","Kyenjojo",
  "Kyotera","Lamwo","Lira","Luuka","Luwero","Lwengo","Lyantonde","Madi-Okollo",
  "Manafwa","Maracha","Masaka","Masindi","Mayuge","Mbale","Mbarara","Mitooma",
  "Mityana","Moroto","Moyo","Mpigi","Mubende","Mukono","Nabilatuk","Nakapiripirit",
  "Nakaseke","Nakasongola","Namayingo","Namisindwa","Namutumba","Napak","Nebbi",
  "Ngora","Ntoroko","Ntungamo","Nwoya","Obongi","Omoro","Otuke","Oyam","Pader",
  "Pakwach","Pallisa","Rakai","Rubanda","Rubirizi","Rukiga","Rukungiri","Rwampara",
  "Sembabule","Serere","Sheema","Sironko","Soroti","Terego","Tororo","Wakiso",
  "Yumbe","Zombo",
].sort();

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function approxDob(age: number): string {
  const y = new Date().getFullYear() - age;
  return `${y}-07-01`;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text style={[fieldStyles.sectionLabel, { color: colors.mutedForeground }]}>
      {children}
    </Text>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[fieldStyles.fieldLabel, { color: colors.foreground }]}>
      {label}
      {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
    </Text>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CampaignRegisterPatientScreen() {
  const { id: campaignId } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addPatient, patients, campaigns } = useApp();

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId),
    [campaigns, campaignId],
  );

  // ── Form state ──────────────────────────────────────────────────────────────
  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [useApproxAge, setUseApproxAge] = useState(false);
  const [approxAge, setApproxAge]     = useState(40);
  const [dob, setDob]                 = useState("");
  const [sex, setSex]                 = useState<PatientSex>("F");
  const [phone, setPhone]             = useState("+256 ");
  const [village, setVillage]         = useState(campaign?.location ?? "");
  const [district, setDistrict]       = useState(campaign?.district ?? "Mbarara");
  const [conditions, setConditions]   = useState<string[]>([]);
  const [saving, setSaving]           = useState(false);
  const [districtSearch, setDistrictSearch] = useState("");

  const topPad = insets.top + (Platform.OS === "android" ? 12 : 8);
  const botPad = insets.bottom;

  const filteredDistricts = useMemo(() => {
    const q = districtSearch.toLowerCase();
    return q ? UGANDA_DISTRICTS.filter((d) => d.toLowerCase().includes(q)) : UGANDA_DISTRICTS;
  }, [districtSearch]);

  function toggleCondition(c: string) {
    setConditions((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function generatePatientId() {
    const year = new Date().getFullYear();
    const seq  = (patients.length + 1).toString().padStart(4, "0");
    const prefix = campaign?.district.slice(0, 3).toUpperCase() ?? "MBR";
    return `${prefix}-${year}-${seq}`;
  }

  async function save(andScreen: boolean) {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Required Fields", "Please enter first name and last name.");
      return;
    }

    const effectiveDob = useApproxAge ? approxDob(approxAge) : dob.trim();
    if (!effectiveDob) {
      Alert.alert("Required Fields", "Please enter a date of birth or enable approximate age.");
      return;
    }
    if (!useApproxAge) {
      const [y, m, d] = effectiveDob.split("-").map(Number);
      const cur = new Date().getFullYear();
      if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > cur) {
        Alert.alert("Invalid Date", "Please enter a valid date of birth.");
        return;
      }
    }

    setSaving(true);
    try {
      const result = await addPatient({
        patientId:    generatePatientId(),
        firstName:    firstName.trim(),
        lastName:     lastName.trim(),
        dateOfBirth:  effectiveDob,
        sex,
        phone:        phone.trim() || "",
        village:      village.trim() || "Unknown",
        district:     district,
        medicalHistory: conditions,
        lastVisit:    new Date().toISOString(),
        campaignId:   campaignId || undefined,
      });

      if (!result) {
        Alert.alert("Registration Failed", "Could not save the record. Check your connection and try again.");
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (andScreen) {
        router.replace(
          `/screening/new?patientId=${result.id}&campaignId=${campaignId}&batch=1` as never,
        );
      } else {
        Alert.alert(
          "Registered",
          `${result.firstName} ${result.lastName} — MRN: ${result.patientId}`,
          [{ text: "Next Patient", onPress: () => resetForm() },
           { text: "Back to Queue", onPress: () => router.back(), style: "cancel" }],
        );
      }
    } catch (e) {
      Alert.alert("Error", "Failed to register patient. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFirstName(""); setLastName(""); setDob(""); setSex("F");
    setPhone("+256 "); setVillage(campaign?.location ?? "");
    setConditions([]); setUseApproxAge(false); setApproxAge(40);
  }

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      {/* ── Fixed header ── */}
      <View style={[
        fieldStyles.header,
        { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border },
      ]}>
        <View style={fieldStyles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[fieldStyles.headerTitle, { color: colors.foreground }]}>Register Patient</Text>
            <Text style={[fieldStyles.headerSub, { color: colors.mutedForeground }]}>
              {campaign ? `${campaign.name} · Field entry` : "Field entry"}
            </Text>
          </View>
        </View>

        {campaign && (
          <View style={[fieldStyles.campaignBadge, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "35" }]}>
            <Feather name="map-pin" size={13} color={colors.primary} />
            <Text style={[fieldStyles.campaignBadgeText, { color: colors.primary }]}>
              {campaign.name} · {campaign.district}
            </Text>
            <View style={[fieldStyles.campaignDot, { backgroundColor: colors.success }]} />
            <Text style={[fieldStyles.campaignBadgeText, { color: colors.success }]}>Active</Text>
          </View>
        )}
      </View>

      {/* ── Scrollable form ── */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[fieldStyles.body, { paddingBottom: botPad + 120 }]}
      >
        {/* ── Personal info ── */}
        <View style={[fieldStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionLabel>PERSONAL INFORMATION</SectionLabel>

          <View style={fieldStyles.nameRow}>
            <View style={{ flex: 1 }}>
              <FieldLabel label="First Name" required />
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Grace"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                style={[fieldStyles.input, { color: colors.foreground, borderColor: colors.border }]}
                returnKeyType="next"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Last Name" required />
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Atuhaire"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                style={[fieldStyles.input, { color: colors.foreground, borderColor: colors.border }]}
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Sex */}
          <FieldLabel label="Sex" required />
          <View style={fieldStyles.sexRow}>
            {(["F", "M", "Other"] as PatientSex[]).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => { setSex(s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[
                  fieldStyles.sexChip,
                  {
                    backgroundColor: sex === s ? colors.primary : "transparent",
                    borderColor: sex === s ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[fieldStyles.sexChipText, { color: sex === s ? "#fff" : colors.mutedForeground }]}>
                  {s === "F" ? "Female" : s === "M" ? "Male" : "Other"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* DOB / Approx age toggle */}
          <View style={fieldStyles.dobToggleRow}>
            <FieldLabel label="Date of Birth" required />
            <TouchableOpacity
              onPress={() => { setUseApproxAge((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[fieldStyles.approxToggle, { borderColor: colors.border, backgroundColor: useApproxAge ? colors.primary + "14" : "transparent" }]}
            >
              <Feather name={useApproxAge ? "check-square" : "square"} size={14} color={useApproxAge ? colors.primary : colors.mutedForeground} />
              <Text style={[fieldStyles.approxToggleText, { color: useApproxAge ? colors.primary : colors.mutedForeground }]}>
                Approx. age
              </Text>
            </TouchableOpacity>
          </View>

          {useApproxAge ? (
            <View style={[fieldStyles.approxCard, { backgroundColor: colors.primary + "0a", borderColor: colors.primary + "30" }]}>
              <Text style={[fieldStyles.approxDisplay, { color: colors.primary }]}>
                ~{approxAge} years old
              </Text>
              <Text style={[fieldStyles.approxDobHint, { color: colors.mutedForeground }]}>
                DOB estimated as {approxDob(approxAge).split("-")[0]}-07-01
              </Text>
              <View style={fieldStyles.approxBtnRow}>
                {[-10, -5, -1, +1, +5, +10].map((delta) => (
                  <TouchableOpacity
                    key={delta}
                    onPress={() => {
                      setApproxAge((a) => Math.max(0, Math.min(110, a + delta)));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={[fieldStyles.approxBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  >
                    <Text style={[fieldStyles.approxBtnText, { color: colors.foreground }]}>
                      {delta > 0 ? `+${delta}` : delta}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <DateInput label="" value={dob} onChange={setDob} />
          )}
        </View>

        {/* ── Contact & Location ── */}
        <View style={[fieldStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionLabel>CONTACT & LOCATION</SectionLabel>

          <FieldLabel label="Phone Number" />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+256 700 000 000"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            autoCapitalize="none"
            style={[fieldStyles.input, { color: colors.foreground, borderColor: colors.border }]}
          />

          <FieldLabel label="Village / Sub-county" />
          <TextInput
            value={village}
            onChangeText={setVillage}
            placeholder="Katete"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            style={[fieldStyles.input, { color: colors.foreground, borderColor: colors.border }]}
          />

          {/* District picker */}
          <FieldLabel label="District" required />
          <View style={[fieldStyles.districtSearch, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              value={districtSearch}
              onChangeText={setDistrictSearch}
              placeholder="Search districts…"
              placeholderTextColor={colors.mutedForeground}
              style={[fieldStyles.districtSearchInput, { color: colors.foreground }]}
              autoCapitalize="none"
            />
            {districtSearch.length > 0 && (
              <TouchableOpacity onPress={() => setDistrictSearch("")}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={fieldStyles.districtScroll}
            contentContainerStyle={{ gap: 8, paddingRight: 16 }}
          >
            {filteredDistricts.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => { setDistrict(d); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[
                  fieldStyles.districtChip,
                  {
                    backgroundColor: district === d ? colors.primary : colors.muted,
                    borderColor: district === d ? colors.primary : colors.border,
                  },
                ]}
              >
                {district === d && <Feather name="check" size={12} color="#fff" />}
                <Text style={[fieldStyles.districtChipText, { color: district === d ? "#fff" : colors.mutedForeground }]}>
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[fieldStyles.selectedDistrict, { color: colors.foreground }]}>
            Selected: <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{district}</Text>
          </Text>
        </View>

        {/* ── Medical history ── */}
        <View style={[fieldStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionLabel>MEDICAL HISTORY</SectionLabel>
          <Text style={[fieldStyles.hint, { color: colors.mutedForeground }]}>Tap all that apply</Text>
          <View style={fieldStyles.conditionsGrid}>
            {MEDICAL_CONDITIONS.map((c) => {
              const sel = conditions.includes(c);
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => toggleCondition(c)}
                  style={[
                    fieldStyles.conditionChip,
                    {
                      backgroundColor: sel ? colors.primary + "14" : colors.muted,
                      borderColor: sel ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={[
                    fieldStyles.conditionCheck,
                    { backgroundColor: sel ? colors.primary : "transparent", borderColor: sel ? colors.primary : colors.border },
                  ]}>
                    {sel && <Feather name="check" size={11} color="#fff" />}
                  </View>
                  <Text style={[fieldStyles.conditionText, { color: sel ? colors.primary : colors.foreground }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* ── Fixed bottom action bar ── */}
      <View style={[
        fieldStyles.actionBar,
        { paddingBottom: botPad + 8, backgroundColor: colors.card, borderTopColor: colors.border },
      ]}>
        <TouchableOpacity
          style={[fieldStyles.btnSecondary, { borderColor: colors.border }]}
          onPress={() => save(false)}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Feather name="user-plus" size={18} color={colors.foreground} />
          <Text style={[fieldStyles.btnSecondaryText, { color: colors.foreground }]}>
            {saving ? "Saving…" : "Register Only"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[fieldStyles.btnPrimary, { backgroundColor: saving ? colors.muted : colors.success }]}
          onPress={() => save(true)}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Feather name="camera" size={18} color="#fff" />
          <Text style={fieldStyles.btnPrimaryText}>Register & Screen Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const fieldStyles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  campaignBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  campaignBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  campaignDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  nameRow: { flexDirection: "row", gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  sexRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  sexChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  sexChipText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  dobToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  approxToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  approxToggleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  approxCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  approxDisplay: { fontSize: 28, fontFamily: "Inter_700Bold" },
  approxDobHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  approxBtnRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 },
  approxBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 52,
    alignItems: "center",
  },
  approxBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  districtSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  districtSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  districtScroll: { marginTop: 8 },
  districtChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  districtChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  selectedDistrict: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -4 },
  conditionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  conditionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  conditionCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  conditionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
  },
  btnSecondaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  btnPrimary: {
    flex: 1.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
  },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});
