import React, { useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp, RiskLevel } from "@/context/AppContext";

const AI_FINDINGS_BY_RISK: Record<RiskLevel, string[]> = {
  Normal: ["No significant pathology detected"],
  Mild: ["Mild dot hemorrhages", "Early NPDR"],
  Moderate: ["Microaneurysms", "Hard exudates", "Mild NPDR signs"],
  Severe: ["Neovascularization", "Vitreous haemorrhage risk", "PDR suspected"],
  Urgent: ["Optic disc cupping", "Cup-to-disc ratio elevated", "Possible glaucoma"],
};

function simulateAIAnalysis(): {
  riskLevel: RiskLevel;
  confidence: number;
  qualityScore: number;
  findings: string[];
} {
  const levels: RiskLevel[] = ["Normal", "Mild", "Moderate", "Severe", "Urgent"];
  const riskLevel = levels[Math.floor(Math.random() * levels.length)];
  return {
    riskLevel,
    confidence: Math.floor(Math.random() * 15) + 80,
    qualityScore: Math.floor(Math.random() * 20) + 78,
    findings: AI_FINDINGS_BY_RISK[riskLevel],
  };
}

function getRiskColor(risk: RiskLevel, colors: ReturnType<typeof useColors>) {
  if (risk === "Urgent" || risk === "Severe") return colors.destructive;
  if (risk === "Moderate") return colors.warning;
  if (risk === "Mild") return colors.accent;
  return colors.success;
}

export default function NewScreeningScreen() {
  const { patientId: paramPatientId } = useLocalSearchParams<{ patientId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { patients, addScreening, addConsultation, currentUser } = useApp();

  const [selectedPatientId, setSelectedPatientId] = useState(paramPatientId ?? "");
  const [step, setStep] = useState<"select" | "capture" | "analyzing" | "result">("select");
  const [notes, setNotes] = useState("");
  const [aiResult, setAiResult] = useState<ReturnType<typeof simulateAIAnalysis> | null>(null);
  const [savedScreeningId, setSavedScreeningId] = useState<string | null>(null);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  function handleCapture() {
    if (!selectedPatientId) {
      Alert.alert("No Patient Selected", "Please select a patient before capturing.");
      return;
    }
    setStep("analyzing");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      const result = simulateAIAnalysis();
      setAiResult(result);
      setStep("result");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 2500);
  }

  function handleSaveScreening() {
    if (!aiResult || !selectedPatientId) return;
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    addScreening({
      patientId: selectedPatientId,
      capturedBy: currentUser.id,
      imageQualityScore: aiResult.qualityScore,
      aiRiskLevel: aiResult.riskLevel,
      aiConfidence: aiResult.confidence,
      aiFindings: aiResult.findings,
      status: "Pending",
      notes: notes.trim() || undefined,
    });
    setSavedScreeningId(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Screening Saved",
      aiResult.riskLevel === "Urgent" || aiResult.riskLevel === "Severe"
        ? "High-risk finding detected. Would you like to request a specialist consultation?"
        : "Screening saved successfully.",
      aiResult.riskLevel === "Urgent" || aiResult.riskLevel === "Severe"
        ? [
            { text: "Later", onPress: () => router.back(), style: "cancel" },
            {
              text: "Request Consultation",
              onPress: () => {
                addConsultation({
                  screeningId: id,
                  patientId: selectedPatientId,
                  requestedBy: currentUser.id,
                  status: "Open",
                  priority: aiResult.riskLevel === "Urgent" ? "Emergency" : "Urgent",
                  clinicalNotes: notes.trim() || `AI detected: ${aiResult.findings.join(", ")}`,
                });
                router.replace("/(tabs)/consultations");
              },
            },
          ]
        : [{ text: "Done", onPress: () => router.back() }]
    );
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
      {step === "select" || step === "capture" ? (
        <>
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              SELECT PATIENT
            </Text>
            {patients.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  setSelectedPatientId(p.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.patientOption,
                  {
                    backgroundColor:
                      selectedPatientId === p.id ? colors.primary + "14" : "transparent",
                    borderColor:
                      selectedPatientId === p.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={[styles.patientAv, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.patientAvText, { color: colors.primary }]}>
                    {p.firstName[0]}{p.lastName[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.patientName, { color: colors.foreground }]}>
                    {p.firstName} {p.lastName}
                  </Text>
                  <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>
                    {p.patientId}
                  </Text>
                </View>
                {selectedPatientId === p.id ? (
                  <Feather name="check-circle" size={20} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              CLINICAL NOTES (OPTIONAL)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Patient symptoms, IOP readings, observations..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              style={[
                styles.notesInput,
                { color: colors.foreground, borderColor: colors.border },
              ]}
            />
          </View>

          <View style={[styles.captureArea, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Feather name="camera" size={48} color={colors.mutedForeground} />
            <Text style={[styles.captureTitle, { color: colors.foreground }]}>
              Fundus Camera Ready
            </Text>
            <Text style={[styles.captureHint, { color: colors.mutedForeground }]}>
              Connect fundus camera via USB or Bluetooth.{"\n"}Ensure patient's eye is aligned.
            </Text>
            <View style={styles.qualityHints}>
              {["Good lighting", "Camera aligned", "Patient steady"].map((hint) => (
                <View key={hint} style={styles.qualityHint}>
                  <Feather name="check" size={12} color={colors.success} />
                  <Text style={[styles.qualityHintText, { color: colors.mutedForeground }]}>
                    {hint}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.captureBtn,
              { backgroundColor: selectedPatientId ? colors.primary : colors.muted },
            ]}
            onPress={handleCapture}
            disabled={!selectedPatientId}
            activeOpacity={0.85}
          >
            <Feather name="camera" size={20} color="#fff" />
            <Text style={styles.captureBtnText}>Capture & Analyze</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === "analyzing" ? (
        <View style={styles.analyzingContainer}>
          <View style={[styles.analyzeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.scanCircle, { borderColor: colors.primary }]}>
              <Feather name="eye" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.analyzingTitle, { color: colors.foreground }]}>
              Analyzing Retinal Image
            </Text>
            <Text style={[styles.analyzingText, { color: colors.mutedForeground }]}>
              AI model is screening for diabetic retinopathy, glaucoma, and other pathologies...
            </Text>
            <View style={styles.stepsContainer}>
              {["Image quality check", "Feature extraction", "Risk classification", "Report generation"].map(
                (s, i) => (
                  <View key={s} style={styles.stepRow}>
                    <Feather name="check-circle" size={14} color={colors.success} />
                    <Text style={[styles.stepText, { color: colors.mutedForeground }]}>{s}</Text>
                  </View>
                )
              )}
            </View>
          </View>
        </View>
      ) : null}

      {step === "result" && aiResult ? (
        <>
          <View
            style={[
              styles.resultHeader,
              {
                backgroundColor: getRiskColor(aiResult.riskLevel, colors) + "14",
                borderColor: getRiskColor(aiResult.riskLevel, colors) + "40",
              },
            ]}
          >
            <Feather
              name={aiResult.riskLevel === "Normal" ? "check-circle" : "alert-triangle"}
              size={32}
              color={getRiskColor(aiResult.riskLevel, colors)}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.riskLabel,
                  { color: getRiskColor(aiResult.riskLevel, colors) },
                ]}
              >
                {aiResult.riskLevel} Risk
              </Text>
              <Text style={[styles.confidenceText, { color: colors.mutedForeground }]}>
                AI Confidence: {aiResult.confidence}% · Image Quality: {aiResult.qualityScore}%
              </Text>
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              AI FINDINGS
            </Text>
            {aiResult.findings.map((f) => (
              <View key={f} style={styles.findingRow}>
                <Feather
                  name="circle"
                  size={6}
                  color={getRiskColor(aiResult.riskLevel, colors)}
                />
                <Text style={[styles.findingText, { color: colors.foreground }]}>{f}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              PATIENT
            </Text>
            <Text style={[styles.patientName, { color: colors.foreground }]}>
              {selectedPatient?.firstName} {selectedPatient?.lastName}
            </Text>
            <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>
              {selectedPatient?.patientId}
            </Text>
            {notes ? (
              <Text style={[styles.notesText, { color: colors.mutedForeground }]}>
                Note: {notes}
              </Text>
            ) : null}
          </View>

          <View style={[styles.disclaimer, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
            <Feather name="alert-circle" size={14} color="#92400e" />
            <Text style={[styles.disclaimerText, { color: "#92400e" }]}>
              AI results are for screening assistance only. Clinical diagnosis must be made by a qualified ophthalmologist.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.captureBtn, { backgroundColor: colors.primary }]}
            onPress={handleSaveScreening}
            activeOpacity={0.85}
          >
            <Feather name="save" size={20} color="#fff" />
            <Text style={styles.captureBtnText}>Save Screening</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setStep("select")}
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
              Recapture Image
            </Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  section: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  patientOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  patientAv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  patientAvText: { fontSize: 14, fontWeight: "700" },
  patientName: { fontSize: 14, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  captureArea: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  captureTitle: { fontSize: 17, fontWeight: "600" },
  captureHint: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  qualityHints: { gap: 6, marginTop: 8 },
  qualityHint: { flexDirection: "row", alignItems: "center", gap: 6 },
  qualityHintText: { fontSize: 12 },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  captureBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600" },
  analyzingContainer: { flex: 1, alignItems: "center", paddingVertical: 40 },
  analyzeCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 16,
    width: "100%",
  },
  scanCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzingTitle: { fontSize: 18, fontWeight: "700" },
  analyzingText: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  stepsContainer: { gap: 8, alignSelf: "stretch" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepText: { fontSize: 13 },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  riskLabel: { fontSize: 20, fontWeight: "700" },
  confidenceText: { fontSize: 12, marginTop: 2 },
  findingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  findingText: { fontSize: 14 },
  notesText: { fontSize: 12, marginTop: 4 },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  disclaimerText: { fontSize: 12, lineHeight: 18, flex: 1 },
});
