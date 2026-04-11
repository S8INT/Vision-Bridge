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
import { useApp, AppointmentType } from "@/context/AppContext";

const APPOINTMENT_TYPES: { type: AppointmentType; label: string; desc: string; icon: keyof typeof Feather.glyphMap }[] = [
  { type: "Optical", label: "Optical Consultation", desc: "Glasses, refraction, low vision", icon: "eye" },
  { type: "Surgery", label: "Surgery", desc: "Cataract, glaucoma, vitreoretinal", icon: "activity" },
  { type: "Laser", label: "Laser Treatment", desc: "Retinal laser, photocoagulation", icon: "zap" },
  { type: "InjectionTherapy", label: "Injection Therapy", desc: "Anti-VEGF, intravitreal injections", icon: "crosshair" },
  { type: "FollowUp", label: "Follow-Up Visit", desc: "Post-treatment monitoring", icon: "repeat" },
];

const MARKETPLACE_SLOTS = [
  { facility: "Kampala International Eye Institute", district: "Kampala", doctor: "Dr. Tumwebaze Eric", specialty: "Glaucoma Specialist", dates: ["2025-04-17", "2025-04-18", "2025-04-22"], times: ["09:00", "11:00", "14:00"], costUGX: 50000 },
  { facility: "Mbarara RRH Eye Unit", district: "Mbarara", doctor: "Dr. Okello James", specialty: "Ophthalmologist", dates: ["2025-04-16", "2025-04-17", "2025-04-21"], times: ["08:00", "10:00", "13:00"], costUGX: 25000 },
  { facility: "Mulago National Referral Hospital", district: "Kampala", doctor: "Dr. Nakigudde Susan", specialty: "Retinal Specialist", dates: ["2025-04-23", "2025-04-24"], times: ["09:00", "11:30"], costUGX: 30000 },
  { facility: "Kabale Regional Referral", district: "Kabale", doctor: "Dr. Auma Grace", specialty: "Ophthalmologist", dates: ["2025-04-22", "2025-04-23"], times: ["10:00", "14:00"], costUGX: 20000 },
];

export default function BookAppointmentScreen() {
  const { consultationId, patientId } = useLocalSearchParams<{ consultationId: string; patientId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addAppointment, updateConsultation, addNotification, getPatient, currentUser } = useApp();

  const patient = getPatient(patientId);

  const [apptType, setApptType] = useState<AppointmentType | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<typeof MARKETPLACE_SLOTS[0] | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [insurance, setInsurance] = useState(false);
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  function handleBooking() {
    if (!apptType) { Alert.alert("Select Type", "Please choose an appointment type."); return; }
    if (!selectedSlot) { Alert.alert("Select Provider", "Please choose a provider from the marketplace."); return; }
    if (!selectedDate) { Alert.alert("Select Date", "Please choose an available date."); return; }
    if (!selectedTime) { Alert.alert("Select Time", "Please choose a time slot."); return; }

    setSaving(true);
    try {
      const appt = addAppointment({
        patientId,
        consultationId: consultationId || undefined,
        type: apptType,
        status: "Requested",
        facility: selectedSlot.facility,
        doctor: selectedSlot.doctor,
        scheduledDate: selectedDate,
        scheduledTime: selectedTime,
        notes: notes.trim() || undefined,
        costUGX: selectedSlot.costUGX,
        coveredByInsurance: insurance,
      });
      if (consultationId) {
        updateConsultation(consultationId, { appointmentId: appt.id });
      }
      addNotification({
        type: "AppointmentConfirmed",
        title: "Appointment Requested",
        body: `${patient?.firstName} ${patient?.lastName} — ${apptType} at ${selectedSlot.facility} on ${selectedDate}`,
        patientId,
        appointmentId: appt.id,
        consultationId: consultationId || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/appointment/${appt.id}`);
    } catch {
      Alert.alert("Error", "Failed to book appointment. Please try again.");
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

      {/* ── Step 1: Type ── */}
      <View style={styles.stepHeader}>
        <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}><Text style={styles.stepNum}>1</Text></View>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>Appointment Type</Text>
      </View>
      <View style={styles.typeGrid}>
        {APPOINTMENT_TYPES.map((t) => (
          <TouchableOpacity key={t.type} onPress={() => { setApptType(t.type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.typeCard, { borderColor: apptType === t.type ? colors.primary : colors.border, backgroundColor: apptType === t.type ? colors.primary + "10" : colors.card }]}
          >
            <View style={[styles.typeIcon, { backgroundColor: apptType === t.type ? colors.primary + "20" : colors.muted }]}>
              <Feather name={t.icon} size={18} color={apptType === t.type ? colors.primary : colors.mutedForeground} />
            </View>
            <Text style={[styles.typeLabel, { color: colors.foreground }]}>{t.label}</Text>
            <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>{t.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Step 2: Marketplace ── */}
      <View style={styles.stepHeader}>
        <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}><Text style={styles.stepNum}>2</Text></View>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>Choose Provider</Text>
      </View>
      {MARKETPLACE_SLOTS.map((slot) => (
        <TouchableOpacity key={slot.facility} onPress={() => { setSelectedSlot(slot); setSelectedDate(""); setSelectedTime(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={[styles.slotCard, { borderColor: selectedSlot?.facility === slot.facility ? colors.primary : colors.border, backgroundColor: selectedSlot?.facility === slot.facility ? colors.primary + "08" : colors.card }]}
        >
          <View style={styles.slotTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.slotFacility, { color: colors.foreground }]}>{slot.facility}</Text>
              <Text style={[styles.slotMeta, { color: colors.mutedForeground }]}>{slot.specialty} · {slot.district}</Text>
              <Text style={[styles.slotDoctor, { color: colors.mutedForeground }]}>{slot.doctor}</Text>
            </View>
            <View style={styles.slotCostWrap}>
              <Text style={[styles.slotCost, { color: colors.success }]}>UGX {slot.costUGX.toLocaleString()}</Text>
              {selectedSlot?.facility === slot.facility ? <Feather name="check-circle" size={18} color={colors.primary} /> : null}
            </View>
          </View>
          {selectedSlot?.facility === slot.facility ? (
            <View style={styles.slotsExpanded}>
              <Text style={[styles.slotPickLabel, { color: colors.mutedForeground }]}>Select Date</Text>
              <View style={styles.dateRow}>
                {slot.dates.map((d) => (
                  <TouchableOpacity key={d} onPress={() => { setSelectedDate(d); setSelectedTime(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={[styles.dateChip, { borderColor: selectedDate === d ? colors.primary : colors.border, backgroundColor: selectedDate === d ? colors.primary : "transparent" }]}
                  >
                    <Text style={[styles.dateChipText, { color: selectedDate === d ? "#fff" : colors.foreground }]}>{d.slice(5)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedDate ? (
                <>
                  <Text style={[styles.slotPickLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Select Time</Text>
                  <View style={styles.dateRow}>
                    {slot.times.map((t) => (
                      <TouchableOpacity key={t} onPress={() => { setSelectedTime(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        style={[styles.dateChip, { borderColor: selectedTime === t ? colors.primary : colors.border, backgroundColor: selectedTime === t ? colors.primary : "transparent" }]}
                      >
                        <Text style={[styles.dateChipText, { color: selectedTime === t ? "#fff" : colors.foreground }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>
      ))}

      {/* ── Step 3: Notes ── */}
      <View style={styles.stepHeader}>
        <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}><Text style={styles.stepNum}>3</Text></View>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>Additional Details</Text>
      </View>

      <TouchableOpacity onPress={() => { setInsurance(!insurance); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        style={[styles.insuranceToggle, { borderColor: insurance ? colors.success : colors.border, backgroundColor: insurance ? colors.success + "10" : colors.card }]}
      >
        <Feather name={insurance ? "check-square" : "square"} size={20} color={insurance ? colors.success : colors.mutedForeground} />
        <Text style={[styles.insuranceLabel, { color: insurance ? colors.success : colors.foreground }]}>Patient has insurance coverage</Text>
      </TouchableOpacity>

      <TextInput value={notes} onChangeText={setNotes} placeholder="Special requirements, mobility needs, interpreter needed..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />

      <View style={[styles.disclaimer, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
        <Feather name="info" size={14} color="#92400e" />
        <Text style={[styles.disclaimerText, { color: "#92400e" }]}>
          Appointment confirmation subject to facility availability. Patient will be notified via SMS.
        </Text>
      </View>

      <TouchableOpacity style={[styles.bookBtn, { backgroundColor: saving ? colors.muted : colors.success }]} onPress={handleBooking} disabled={saving} activeOpacity={0.85}>
        <Feather name="calendar" size={20} color="#fff" />
        <Text style={styles.bookBtnText}>{saving ? "Booking..." : "Confirm Booking"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  patientBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  av: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 16, fontWeight: "700" },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNum: { color: "#fff", fontSize: 14, fontWeight: "700" },
  stepTitle: { fontSize: 16, fontWeight: "700" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeCard: { width: "48%", borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 6 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: 13, fontWeight: "700" },
  typeDesc: { fontSize: 11, lineHeight: 16 },
  slotCard: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10 },
  slotTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  slotFacility: { fontSize: 14, fontWeight: "700" },
  slotMeta: { fontSize: 12 },
  slotDoctor: { fontSize: 12, fontStyle: "italic" },
  slotCostWrap: { alignItems: "flex-end", gap: 6 },
  slotCost: { fontSize: 13, fontWeight: "700" },
  slotsExpanded: { gap: 6 },
  slotPickLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dateChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  dateChipText: { fontSize: 13, fontWeight: "600" },
  insuranceToggle: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderWidth: 1, borderRadius: 12 },
  insuranceLabel: { fontSize: 14, fontWeight: "600" },
  textArea: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: "top" },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  disclaimerText: { fontSize: 12, lineHeight: 18, flex: 1 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  bookBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
