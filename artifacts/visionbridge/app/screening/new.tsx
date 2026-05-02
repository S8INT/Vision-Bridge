/**
 * New Screening Screen — VisionBridge Imaging Pipeline
 *
 * Implements:
 *  - Camera capture (expo-image-picker, native camera)
 *  - Gallery upload (JPEG/PNG)
 *  - Client-side image quality pre-score (blur, brightness, FOV)
 *  - Eye selection (OD / OS / Unknown)
 *  - Server upload with metadata injection (patient_id, device_id, capture_time)
 *  - Offline queue management (deferred upload when offline)
 *  - EXIF strip + thumbnail generation (server-side)
 *  - DICOM export wrapper view
 *  - AI analysis simulation + result display
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp, RiskLevel } from "@/context/AppContext";
import {
  checkImageQualityLocally,
  uploadRetinalImage,
  ClientQualityResult,
  QualityCheckError,
} from "@/services/imagingService";
import offlineQueue from "@/services/offlineQueue";
import { Badge } from "@/components/ui/Badge";
import ImageQualityChecker from "@/components/ImageQualityChecker";

type ScreeningStep = "select" | "capture" | "quality" | "uploading" | "analyzing" | "result";
type EyeSide = "OD" | "OS" | "Unknown";

const AI_FINDINGS_BY_RISK: Record<RiskLevel, string[]> = {
  Normal: ["No significant pathology detected", "Optic disc appearance normal", "Macula clear"],
  Mild: ["Mild dot hemorrhages", "Early NPDR signs", "1–5 microaneurysms"],
  Moderate: ["Microaneurysms ×6+", "Hard exudates", "Cotton wool spots", "Moderate NPDR"],
  Severe: ["Neovascularization of disc", "Vitreous haemorrhage risk", "PDR suspected", "IRMA present"],
  Urgent: ["Optic disc cupping elevated", "Cup-to-disc ratio >0.7", "Possible glaucoma", "Urgent IOP check needed"],
};

const DEVICE_ID = `VBDevice_${Platform.OS}_${Platform.Version ?? "web"}`;
const TENANT_ID = "mbarara-rrh-01";

function getRiskColor(risk: RiskLevel, colors: ReturnType<typeof useColors>) {
  if (risk === "Urgent" || risk === "Severe") return colors.destructive;
  if (risk === "Moderate") return colors.warning;
  if (risk === "Mild") return colors.accent;
  return colors.success;
}

function getRiskVariant(risk: RiskLevel) {
  if (risk === "Urgent" || risk === "Severe") return "urgent";
  if (risk === "Moderate") return "warning";
  if (risk === "Mild") return "mild";
  return "success";
}

function getQualityGrade(overall: number): { grade: string; label: string; color: string } {
  if (overall >= 85) return { grade: "A", label: "Excellent", color: "#22c55e" };
  if (overall >= 70) return { grade: "B", label: "Good", color: "#84cc16" };
  if (overall >= 55) return { grade: "C", label: "Fair", color: "#f59e0b" };
  if (overall >= 40) return { grade: "D", label: "Poor", color: "#f97316" };
  return { grade: "F", label: "Unacceptable", color: "#ef4444" };
}

function QualityBar({ label, score, hint, colors }: { label: string; score: number; hint?: string; colors: ReturnType<typeof useColors> }) {
  const color = score >= 70 ? colors.success : score >= 45 ? colors.warning : colors.destructive;
  return (
    <View style={qualStyles.barWrapper}>
      <View style={qualStyles.row}>
        <Text style={[qualStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
        <View style={[qualStyles.track, { backgroundColor: colors.muted }]}>
          <View style={[qualStyles.fill, { width: `${score}%` as any, backgroundColor: color }]} />
        </View>
        <Text style={[qualStyles.score, { color }]}>{score}</Text>
      </View>
      {hint && score < 70 ? (
        <Text style={[qualStyles.hint, { color: score < 45 ? colors.destructive : "#92400e" }]}>↳ {hint}</Text>
      ) : null}
    </View>
  );
}

const qualStyles = StyleSheet.create({
  barWrapper: { gap: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontSize: 12, width: 80 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  score: { fontSize: 12, fontWeight: "700", width: 28, textAlign: "right" },
  hint: { fontSize: 11, lineHeight: 16, paddingLeft: 88, fontStyle: "italic" },
});

export default function NewScreeningScreen() {
  const { patientId: paramPatientId, campaignId } = useLocalSearchParams<{ patientId?: string; campaignId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { patients, addScreening, addConsultation, addNotification, currentUser, updateCampaign, campaigns } = useApp();

  const [selectedPatientId, setSelectedPatientId] = useState(paramPatientId ?? "");
  const [step, setStep] = useState<ScreeningStep>("select");
  const [notes, setNotes] = useState("");
  const [eye, setEye] = useState<EyeSide>("Unknown");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<number | undefined>(undefined);
  const [qualityResult, setQualityResult] = useState<ClientQualityResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ imageId: string; storage: string; qualityScore: ClientQualityResult } | null>(null);
  const [isOfflineQueued, setIsOfflineQueued] = useState(false);
  const [queueStats, setQueueStats] = useState<{ queued: number; failed: number } | null>(null);
  const [savedScreeningId, setSavedScreeningId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ riskLevel: RiskLevel; confidence: number; findings: string[] } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  useEffect(() => {
    offlineQueue.getStats().then((s) => setQueueStats({ queued: s.queued, failed: s.failed }));
  }, []);

  useEffect(() => {
    if (step === "analyzing") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [step]);

  useEffect(() => {
    if (step === "uploading") {
      Animated.timing(progressAnim, { toValue: uploadProgress, duration: 300, useNativeDriver: false }).start();
    }
  }, [uploadProgress, step]);

  async function handlePickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission Needed", "Grant photo library access to select images."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageSize(asset.fileSize);
    await runQualityCheck(asset.uri, asset.fileSize);
  }

  async function handleCaptureCameraPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission Needed", "Grant camera access to capture retinal images."); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.95,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageSize(asset.fileSize);
    await runQualityCheck(asset.uri, asset.fileSize);
  }

  async function runQualityCheck(uri: string, size?: number) {
    setStep("quality");
    setIsScanning(true);
    setQualityResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const q = await checkImageQualityLocally(uri, size);
    setQualityResult(q);
    setIsScanning(false);
    Haptics.notificationAsync(
      q.critical
        ? Haptics.NotificationFeedbackType.Error
        : q.pass
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
    );
  }

  async function handleUploadAndAnalyze() {
    if (!selectedPatientId) { Alert.alert("Select Patient", "Please select a patient first."); return; }
    if (!imageUri) { Alert.alert("No Image", "Please capture or select an image first."); return; }
    if (qualityResult?.critical) {
      Alert.alert("Image Unusable", qualityResult.reason ?? "Please recapture the image.");
      return;
    }
    await doUpload();
  }

  async function doUpload() {
    setStep("uploading");
    setUploadProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await uploadRetinalImage(
        imageUri!,
        {
          patientId: selectedPatientId,
          deviceId: DEVICE_ID,
          tenantId: TENANT_ID,
          captureTime: new Date().toISOString(),
          eye,
          operatorId: currentUser.id,
          campaignId: campaignId || undefined,
        },
        (pct) => setUploadProgress(pct)
      );

      if (result.storage === "offline-queued") {
        setIsOfflineQueued(true);
        const stats = await offlineQueue.getStats();
        setQueueStats({ queued: stats.queued, failed: stats.failed });
      }

      setUploadResult({
        imageId: result.imageId,
        storage: result.storage,
        qualityScore: result.qualityScore as ClientQualityResult,
      });

      // ── AI Analysis simulation (in production: call actual model endpoint) ──
      setStep("analyzing");
      setTimeout(() => runAIAnalysis(result.imageId), 2000);
    } catch (err: any) {
      if (err instanceof QualityCheckError) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "Server Quality Check Failed",
          `Server rejected image: ${err.message}\n\nQuality score: ${err.qualityScore.overall}/100`,
          [
            { text: "Recapture", onPress: () => { setStep("capture"); setImageUri(null); } },
            { text: "Review", onPress: () => { setQualityResult({ ...err.qualityScore, illuminationUniform: 0, redChannel: 50, glare: 100, metrics: {} as any, critical: false, checkedLocally: true }); setStep("quality"); } },
          ]
        );
        setStep("quality");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Upload Error", err.message ?? "Failed to upload image.");
        setStep("quality");
      }
    }
  }

  function runAIAnalysis(imageId: string) {
    // In production: POST /api/ai/analyze with imageId
    const levels: RiskLevel[] = ["Normal", "Mild", "Moderate", "Severe", "Urgent"];
    const riskLevel = levels[Math.floor(Math.random() * levels.length)];
    const result = {
      riskLevel,
      confidence: Math.floor(Math.random() * 12) + 83,
      findings: AI_FINDINGS_BY_RISK[riskLevel],
    };
    setAiResult(result);
    setStep("result");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleSaveScreening() {
    if (!aiResult || !selectedPatientId || !uploadResult) return;

    const qualityScore = typeof uploadResult.qualityScore?.overall === "number"
      ? uploadResult.qualityScore.overall
      : qualityResult?.overall ?? 80;

    addScreening({
      patientId: selectedPatientId,
      capturedBy: currentUser.id,
      imageUri: imageUri ?? undefined,
      imageQualityScore: qualityScore,
      aiRiskLevel: aiResult.riskLevel,
      aiConfidence: aiResult.confidence,
      aiFindings: aiResult.findings,
      status: isOfflineQueued ? "Pending" : "Screened",
      notes: notes.trim() || undefined,
      campaignId: campaignId || undefined,
    });

    if (campaignId) {
      const camp = campaigns.find((c) => c.id === campaignId);
      if (camp) {
        updateCampaign(campaignId, {
          screenedCount: camp.screenedCount + 1,
          referredCount: (aiResult.riskLevel === "Urgent" || aiResult.riskLevel === "Severe")
            ? camp.referredCount + 1
            : camp.referredCount,
        });
      }
    }

    const highRisk = aiResult.riskLevel === "Urgent" || aiResult.riskLevel === "Severe";

    if (highRisk) {
      addNotification({
        type: "ScreeningReviewed",
        title: `${aiResult.riskLevel} Risk Detected`,
        body: `${selectedPatient?.firstName} ${selectedPatient?.lastName} — ${aiResult.findings[0]}`,
        patientId: selectedPatientId,
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Alert.alert(
      isOfflineQueued ? "Screening Saved (Offline)" : "Screening Saved",
      isOfflineQueued
        ? "Image upload queued — will sync when connected."
        : highRisk
          ? `${aiResult.riskLevel} risk finding. Request specialist consultation?`
          : "Screening saved successfully.",
      highRisk && !isOfflineQueued
        ? [
            { text: "Later", onPress: () => router.back(), style: "cancel" },
            {
              text: "Request Consultation",
              onPress: () => {
                addConsultation({
                  screeningId: Date.now().toString(),
                  patientId: selectedPatientId,
                  requestedBy: currentUser.id,
                  status: "Pending",
                  priority: aiResult.riskLevel === "Urgent" ? "Emergency" : "Urgent",
                  clinicalNotes: `AI detected: ${aiResult.findings.join(", ")}. Eye: ${eye}. Notes: ${notes || "—"}`,
                  campaignId: campaignId || undefined,
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
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 100 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Offline Queue Banner ── */}
      {queueStats && (queueStats.queued > 0 || queueStats.failed > 0) ? (
        <View style={[styles.offlineBanner, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
          <Feather name="upload-cloud" size={14} color="#92400e" />
          <Text style={[styles.offlineBannerText, { color: "#92400e" }]}>
            {queueStats.queued} image{queueStats.queued !== 1 ? "s" : ""} queued for upload
            {queueStats.failed > 0 ? ` · ${queueStats.failed} failed` : ""}
          </Text>
        </View>
      ) : null}

      {/* ── Campaign Badge ── */}
      {campaignId ? (
        <View style={[styles.campaignBadge, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "40" }]}>
          <Feather name="map-pin" size={13} color={colors.primary} />
          <Text style={[styles.campaignBadgeText, { color: colors.primary }]}>Campaign screening mode</Text>
        </View>
      ) : null}

      {/* ─────────── STEP: SELECT ─────────── */}
      {(step === "select" || step === "capture") ? (
        <>
          {/* Patient selection */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SELECT PATIENT *</Text>
            {patients.slice(0, 8).map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => { setSelectedPatientId(p.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.patientOption, {
                  backgroundColor: selectedPatientId === p.id ? colors.primary + "14" : "transparent",
                  borderColor: selectedPatientId === p.id ? colors.primary : colors.border,
                }]}
              >
                <View style={[styles.av, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.avText, { color: colors.primary }]}>{p.firstName[0]}{p.lastName[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.patientName, { color: colors.foreground }]}>{p.firstName} {p.lastName}</Text>
                  <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>{p.patientId} · {p.village}</Text>
                </View>
                {selectedPatientId === p.id ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>

          {/* Eye selection */}
          <View style={styles.eyeRow}>
            <Text style={[styles.eyeLabel, { color: colors.mutedForeground }]}>EYE</Text>
            {(["OD", "OS", "Unknown"] as EyeSide[]).map((e) => (
              <TouchableOpacity
                key={e}
                onPress={() => { setEye(e); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.eyeChip, {
                  backgroundColor: eye === e ? colors.primary : colors.muted,
                  borderColor: eye === e ? colors.primary : colors.border,
                }]}
              >
                <Text style={[styles.eyeChipText, { color: eye === e ? "#fff" : colors.mutedForeground }]}>
                  {e === "OD" ? "Right (OD)" : e === "OS" ? "Left (OS)" : "Both / Unknown"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Clinical notes */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CLINICAL NOTES</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="IOP readings, symptoms, medications, observations..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
            />
          </View>

          {/* Image capture area */}
          <View style={[styles.captureArea, { borderColor: imageUri ? colors.success : colors.border, backgroundColor: colors.muted }]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
            ) : (
              <>
                <View style={[styles.cameraIcon, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "30" }]}>
                  <Feather name="camera" size={36} color={colors.primary} />
                </View>
                <Text style={[styles.captureTitle, { color: colors.foreground }]}>Retinal Image Capture</Text>
                <Text style={[styles.captureHint, { color: colors.mutedForeground }]}>
                  Connect fundus camera or attach smartphone adapter.{"\n"}JPEG/PNG up to 20 MB accepted.
                </Text>
                <View style={styles.checkList}>
                  {["Pupil dilated ≥4mm", "Patient fixating on target", "Camera aligned on optic disc", "Focus confirmed"].map((h) => (
                    <View key={h} style={styles.checkItem}>
                      <Feather name="check" size={12} color={colors.success} />
                      <Text style={[styles.checkText, { color: colors.mutedForeground }]}>{h}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          <View style={styles.captureActions}>
            <TouchableOpacity
              onPress={handleCaptureCameraPhoto}
              style={[styles.captureBtn, { backgroundColor: colors.primary, flex: 1 }]}
              activeOpacity={0.85}
            >
              <Feather name="camera" size={18} color="#fff" />
              <Text style={styles.captureBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePickFromGallery}
              style={[styles.captureBtn, { backgroundColor: colors.accent, flex: 1 }]}
              activeOpacity={0.85}
            >
              <Feather name="image" size={18} color="#fff" />
              <Text style={styles.captureBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>

          {imageUri ? (
            <TouchableOpacity
              style={[styles.analyzeBtn, { backgroundColor: selectedPatientId ? colors.success : colors.muted }]}
              onPress={handleUploadAndAnalyze}
              disabled={!selectedPatientId}
              activeOpacity={0.85}
            >
              <Feather name="upload-cloud" size={20} color="#fff" />
              <Text style={styles.analyzeBtnText}>Upload & Analyze</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {/* ─────────── STEP: QUALITY CHECK ─────────── */}
      {step === "quality" && imageUri ? (
        <ImageQualityChecker
          imageUri={imageUri}
          result={qualityResult}
          isScanning={isScanning}
          onRecapture={() => { setStep("select"); setImageUri(null); setQualityResult(null); setIsScanning(false); }}
          onProceed={handleUploadAndAnalyze}
        />
      ) : null}

      {/* ─────────── STEP: UPLOADING ─────────── */}
      {step === "uploading" ? (
        <View style={[styles.uploadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.uploadIconWrap, { backgroundColor: colors.primary + "14" }]}>
            <Feather name="upload-cloud" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.uploadingTitle, { color: colors.foreground }]}>Uploading Retinal Image</Text>
          <Text style={[styles.uploadingMeta, { color: colors.mutedForeground }]}>
            EXIF stripping · Metadata injection · Compression
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
                },
              ]}
            />
          </View>
          <Text style={[styles.progressPct, { color: colors.primary }]}>{uploadProgress}%</Text>
          <View style={styles.uploadSteps}>
            {[
              { label: "Compress JPEG (85%)", done: uploadProgress >= 20 },
              { label: "Strip EXIF / GPS data", done: uploadProgress >= 40 },
              { label: "Inject clinical metadata", done: uploadProgress >= 60 },
              { label: "Upload to encrypted storage", done: uploadProgress >= 80 },
              { label: "Generate thumbnail", done: uploadProgress >= 100 },
            ].map(({ label, done }) => (
              <View key={label} style={styles.uploadStep}>
                <Feather name={done ? "check-circle" : "circle"} size={14} color={done ? colors.success : colors.mutedForeground} />
                <Text style={[styles.uploadStepText, { color: done ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ─────────── STEP: ANALYZING ─────────── */}
      {step === "analyzing" ? (
        <View style={[styles.analyzeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {isOfflineQueued ? (
            <>
              <View style={[styles.offlineIcon, { backgroundColor: colors.warning + "14" }]}>
                <Feather name="wifi-off" size={32} color={colors.warning} />
              </View>
              <Text style={[styles.analyzeTitle, { color: colors.foreground }]}>Saved for Offline Sync</Text>
              <Text style={[styles.analyzeText, { color: colors.mutedForeground }]}>
                Image queued — AI analysis will run when connectivity is restored.{"\n"}
                Local pre-screening data recorded.
              </Text>
            </>
          ) : (
            <>
              <Animated.View style={[styles.scanCircle, {
                borderColor: colors.primary,
                opacity: scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
              }]}>
                <Feather name="eye" size={36} color={colors.primary} />
              </Animated.View>
              <Text style={[styles.analyzeTitle, { color: colors.foreground }]}>Analyzing Retinal Image</Text>
              <Text style={[styles.analyzeText, { color: colors.mutedForeground }]}>
                EfficientNet-B4 model screening for DR, glaucoma, AMD and other pathologies...
              </Text>
              <ActivityIndicator color={colors.primary} size="small" />
              <View style={styles.analyzeSteps}>
                {["Quality verified", "Thumbnail cached", "Feature extraction", "Risk classification", "Report generation"].map((s) => (
                  <View key={s} style={styles.analyzeStep}>
                    <Feather name="check-circle" size={13} color={colors.success} />
                    <Text style={[styles.analyzeStepText, { color: colors.mutedForeground }]}>{s}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}

      {/* ─────────── STEP: RESULT ─────────── */}
      {step === "result" && aiResult ? (
        <>
          {/* Risk Banner */}
          <View style={[styles.riskBanner, {
            backgroundColor: getRiskColor(aiResult.riskLevel, colors) + "14",
            borderColor: getRiskColor(aiResult.riskLevel, colors) + "50",
          }]}>
            <Feather
              name={aiResult.riskLevel === "Normal" ? "check-circle" : "alert-triangle"}
              size={28}
              color={getRiskColor(aiResult.riskLevel, colors)}
            />
            <View style={{ flex: 1 }}>
              <Badge label={`${aiResult.riskLevel} Risk`} variant={getRiskVariant(aiResult.riskLevel)} />
              <Text style={[styles.riskConfidence, { color: colors.mutedForeground }]}>
                AI Confidence: {aiResult.confidence}%
                {uploadResult ? ` · Quality: ${typeof uploadResult.qualityScore?.overall === "number" ? uploadResult.qualityScore.overall : qualityResult?.overall ?? "—"}/100` : ""}
              </Text>
              <Text style={[styles.riskEye, { color: colors.mutedForeground }]}>Eye: {eye}</Text>
            </View>
          </View>

          {/* Findings */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AI FINDINGS</Text>
            {aiResult.findings.map((f) => (
              <View key={f} style={styles.findingRow}>
                <View style={[styles.findingDot, { backgroundColor: getRiskColor(aiResult.riskLevel, colors) }]} />
                <Text style={[styles.findingText, { color: colors.foreground }]}>{f}</Text>
              </View>
            ))}
          </View>

          {/* Image storage status */}
          {uploadResult ? (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>IMAGE STORAGE</Text>
              <View style={styles.storageRow}>
                <Feather name={isOfflineQueued ? "wifi-off" : "cloud"} size={16} color={isOfflineQueued ? colors.warning : colors.success} />
                <Text style={[styles.storageStatus, { color: isOfflineQueued ? colors.warning : colors.success }]}>
                  {isOfflineQueued ? "Queued for upload (offline)" : `Stored — ${uploadResult.storage}`}
                </Text>
              </View>
              <View style={styles.storageRow}>
                <Feather name="shield" size={14} color={colors.mutedForeground} />
                <Text style={[styles.storageMeta, { color: colors.mutedForeground }]}>EXIF stripped · Metadata injected · Thumbnail generated</Text>
              </View>
              <View style={styles.storageRow}>
                <Feather name="file-text" size={14} color={colors.mutedForeground} />
                <Text style={[styles.storageMeta, { color: colors.mutedForeground }]}>DICOM wrapper attached (OP modality, future compliance)</Text>
              </View>
            </View>
          ) : null}

          {/* Patient */}
          {selectedPatient ? (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PATIENT</Text>
              <Text style={[styles.patientName, { color: colors.foreground }]}>{selectedPatient.firstName} {selectedPatient.lastName}</Text>
              <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>{selectedPatient.patientId}</Text>
              {notes ? <Text style={[styles.notesText, { color: colors.mutedForeground }]}>Note: {notes}</Text> : null}
            </View>
          ) : null}

          {/* HIPAA Disclaimer */}
          <View style={[styles.disclaimer, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
            <Feather name="alert-circle" size={14} color="#92400e" />
            <Text style={[styles.disclaimerText, { color: "#92400e" }]}>
              AI results are clinical decision support only and not a diagnosis. Final determination must be made by a qualified ophthalmologist. All image data is encrypted and HIPAA-compliant.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSaveScreening}
            activeOpacity={0.85}
          >
            <Feather name="save" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Save Screening Record</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setStep("select"); setImageUri(null); setAiResult(null); setUploadResult(null); setIsOfflineQueued(false); }}
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
          >
            <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
            <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Recapture Image</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },

  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  offlineBannerText: { fontSize: 13, fontWeight: "600", flex: 1 },
  campaignBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, padding: 8 },
  campaignBadgeText: { fontSize: 12, fontWeight: "700" },

  section: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },

  patientOption: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, gap: 12 },
  av: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 14, fontWeight: "700" },
  patientName: { fontSize: 14, fontWeight: "600" },
  patientMeta: { fontSize: 12 },

  eyeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  eyeLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, width: 32 },
  eyeChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  eyeChipText: { fontSize: 12, fontWeight: "600" },

  notesInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: "top" },

  captureArea: { borderWidth: 2, borderStyle: "dashed", borderRadius: 16, overflow: "hidden", minHeight: 200, alignItems: "center", justifyContent: "center", padding: 24 },
  previewImage: { width: "100%", height: 220, borderRadius: 12 },
  cameraIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  captureTitle: { fontSize: 17, fontWeight: "600" },
  captureHint: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  checkList: { gap: 6, marginTop: 8 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  checkText: { fontSize: 12 },

  captureActions: { flexDirection: "row", gap: 10 },
  captureBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  captureBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  analyzeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  analyzeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Quality step
  qualityContainer: { gap: 14 },
  qualityCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  qualityHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  qualityTitle: { fontSize: 15, fontWeight: "700" },
  qualityOverall: { fontSize: 20, fontWeight: "800", marginTop: 2 },
  qualityReason: { fontSize: 13, lineHeight: 20 },
  qualityBars: { gap: 10 },
  qualityNote: { fontSize: 11, fontStyle: "italic" },
  qualityPreview: { width: "100%", height: 160, borderRadius: 12 },
  qualityActions: { flexDirection: "row", gap: 10 },
  recaptureBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  recaptureBtnText: { fontSize: 14, fontWeight: "600" },
  proceedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 12 },
  proceedBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Uploading step
  uploadingCard: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: "center", gap: 14 },
  uploadIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  uploadingTitle: { fontSize: 18, fontWeight: "700" },
  uploadingMeta: { fontSize: 12, textAlign: "center" },
  progressTrack: { width: "100%", height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  progressPct: { fontSize: 18, fontWeight: "800" },
  uploadSteps: { gap: 8, alignSelf: "stretch" },
  uploadStep: { flexDirection: "row", alignItems: "center", gap: 8 },
  uploadStepText: { fontSize: 13 },

  // Analyzing step
  analyzeCard: { borderWidth: 1, borderRadius: 16, padding: 28, alignItems: "center", gap: 16 },
  scanCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  offlineIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  analyzeTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  analyzeText: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  analyzeSteps: { gap: 8, alignSelf: "stretch" },
  analyzeStep: { flexDirection: "row", alignItems: "center", gap: 8 },
  analyzeStepText: { fontSize: 12 },

  // Result step
  riskBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 16 },
  riskConfidence: { fontSize: 12, marginTop: 4 },
  riskEye: { fontSize: 11 },
  findingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  findingDot: { width: 6, height: 6, borderRadius: 3 },
  findingText: { fontSize: 14, flex: 1 },
  storageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  storageStatus: { fontSize: 13, fontWeight: "600", flex: 1 },
  storageMeta: { fontSize: 12, flex: 1, lineHeight: 18 },
  notesText: { fontSize: 12, marginTop: 4 },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  disclaimerText: { fontSize: 12, lineHeight: 18, flex: 1 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 13 },
  secondaryBtnText: { fontSize: 15, fontWeight: "600" },
});
