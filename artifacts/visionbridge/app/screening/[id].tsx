import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useScreenPadding } from "@/hooks/useScreenPadding";
import { useApp, RiskLevel } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { getRiskColor } from "@/utils/risk";
import { getThumbnailUrl } from "@/services/imagingService";

const MODEL_VERSION = "eretina-v1.0-deterministic";
const MIN_REVIEW_QUALITY = 50;

function getRiskVariant(risk: RiskLevel) {
  if (risk === "Urgent" || risk === "Severe") return "urgent";
  if (risk === "Moderate") return "warning";
  if (risk === "Mild") return "referral";
  return "success";
}

export default function ScreeningDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { screenings, getPatient, getScreeningsForPatient, getConsultationForScreening, addConsultation, updateScreening, currentUser } = useApp();
  const { user } = useAuth();

  const screening = screenings.find((s) => s.id === id);
  const patient = screening ? getPatient(screening.patientId) : undefined;
  const consultation = screening ? getConsultationForScreening(screening.id) : undefined;
  const [referralNotes, setReferralNotes] = useState("");
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [clinicalImpression, setClinicalImpression] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [comparisonUrls, setComparisonUrls] = useState<Record<string, string>>({});

  const { topPad, botPad } = useScreenPadding();

  if (!screening) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Screening not found</Text>
      </View>
    );
  }

  const activeScreening = screening;
  const riskColor = getRiskColor(screening.aiRiskLevel, colors);
  const canReview = currentUser.role === "Doctor" || currentUser.role === "Admin";
  const qualityBlocked = screening.imageQualityScore < MIN_REVIEW_QUALITY;
  const priorScreenings = getScreeningsForPatient(screening.patientId)
    .filter((item) => item.id !== screening.id)
    .slice(0, 2);

  useEffect(() => {
    let cancelled = false;
    if (!screening.imageId || !user?.tenantId) return;
    setLoadingImage(true);
    getThumbnailUrl(screening.imageId, user.tenantId)
      .then((url) => { if (!cancelled) setThumbnailUrl(url); })
      .finally(() => { if (!cancelled) setLoadingImage(false); });
    return () => { cancelled = true; };
  }, [screening.imageId, user?.tenantId]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.tenantId || priorScreenings.length === 0) return;
    Promise.all(
      priorScreenings
        .filter((item) => item.imageId)
        .map(async (item) => [item.id, await getThumbnailUrl(item.imageId!, user.tenantId)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setComparisonUrls(Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))));
    });
    return () => { cancelled = true; };
  }, [user?.tenantId, screening.id, priorScreenings.map((item) => item.id).join(",")]);

  function handleRequestConsultation() {
    if (!referralNotes.trim()) {
      Alert.alert("Notes Required", "Please add clinical notes before requesting a consultation.");
      return;
    }
    addConsultation({
      screeningId: activeScreening.id,
      patientId: activeScreening.patientId,
      requestedBy: currentUser.id,
      status: "Pending",
      priority: activeScreening.aiRiskLevel === "Urgent" ? "Emergency" : activeScreening.aiRiskLevel === "Severe" ? "Urgent" : "Routine",
      clinicalNotes: referralNotes.trim(),
    });
    updateScreening(activeScreening.id, { status: "Referred" });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowReferralForm(false);
    Alert.alert("Consultation Requested", "Your request has been sent to the specialist queue.");
  }

  async function handleRequestRecapture() {
    const now = new Date().toISOString();
    const auditLine = `Recapture requested by ${currentUser.name} on ${new Date(now).toLocaleString("en-UG")} — image quality ${activeScreening.imageQualityScore}% is below the review threshold.`;
    setSavingReview(true);
    await updateScreening(activeScreening.id, {
      status: "Pending",
      notes: [activeScreening.notes, auditLine].filter(Boolean).join("\n\n"),
    });
    setSavingReview(false);
    Alert.alert("Recapture requested", "This case remains pending until a usable retinal image is captured.");
  }

  async function handleSaveReview() {
    if (qualityBlocked) {
      Alert.alert("Image quality too low", "Request a recapture before confirming a clinical impression.");
      return;
    }
    if (!clinicalImpression.trim()) {
      Alert.alert("Clinical impression required", "Record your confirmed clinical impression before completing the review.");
      return;
    }

    const now = new Date().toISOString();
    const auditLines = [
      activeScreening.notes,
      `Clinical impression — ${currentUser.name} — ${new Date(now).toLocaleString("en-UG")}: ${clinicalImpression.trim()}`,
      reviewNote.trim() ? `Review note — ${reviewNote.trim()}` : "",
    ].filter(Boolean);

    setSavingReview(true);
    await updateScreening(activeScreening.id, {
      status: "Reviewed",
      reviewedBy: currentUser.name,
      reviewedAt: now,
      notes: auditLines.join("\n\n"),
    });
    setSavingReview(false);
    setShowReviewForm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Review saved", "The screening is now marked as clinically reviewed.");
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 16, paddingBottom: botPad + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.riskBanner, { backgroundColor: riskColor + "12", borderColor: riskColor + "30" }]}>
        <Feather
          name={screening.aiRiskLevel === "Normal" ? "check-circle" : "alert-triangle"}
          size={28}
          color={riskColor}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.riskText, { color: riskColor }]}>
            {screening.aiRiskLevel} Risk
          </Text>
          <Text style={[styles.riskSub, { color: colors.mutedForeground }]}>
            AI Confidence: {screening.aiConfidence}%
          </Text>
        </View>
        <Badge label={screening.status} variant={screening.status === "Referred" ? "urgent" : screening.status === "Reviewed" ? "success" : "muted"} />
      </View>

      {patient ? (
        <TouchableOpacity
          onPress={() => router.push(`/patient/${patient.id}`)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <View style={styles.row}>
            <Avatar firstName={patient.firstName} lastName={patient.lastName} size={44} fontSize={16} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.patientName, { color: colors.foreground }]}>
                {patient.firstName} {patient.lastName}
              </Text>
              <Text style={[styles.patientMeta, { color: colors.mutedForeground }]}>
                {patient.patientId}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.imageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>RETINAL IMAGE</Text>
            <Text style={[styles.cardSubLabel, { color: colors.mutedForeground }]}>
              Stored image and capture metadata
            </Text>
          </View>
          <Badge label={screening.imageId ? "Stored" : "No image ID"} variant={screening.imageId ? "success" : "muted"} size="sm" />
        </View>
        <View style={[styles.imageFrame, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {loadingImage ? (
            <ActivityIndicator color={colors.primary} />
          ) : thumbnailUrl || screening.imageUri ? (
            <Image
              source={{ uri: thumbnailUrl || screening.imageUri }}
              style={styles.retinalImage}
              resizeMode="contain"
              accessibilityLabel="Retinal screening image"
            />
          ) : (
            <>
              <Feather name="image" size={28} color={colors.mutedForeground} />
              <Text style={[styles.imagePlaceholder, { color: colors.mutedForeground }]}>
                No stored image is linked to this screening
              </Text>
            </>
          )}
        </View>
        <View style={styles.imageMetaGrid}>
          <View style={styles.imageMetaItem}>
            <Text style={[styles.imageMetaLabel, { color: colors.mutedForeground }]}>Captured</Text>
            <Text style={[styles.imageMetaValue, { color: colors.foreground }]}>
              {new Date(screening.capturedAt).toLocaleString("en-UG")}
            </Text>
          </View>
          <View style={styles.imageMetaItem}>
            <Text style={[styles.imageMetaLabel, { color: colors.mutedForeground }]}>Operator</Text>
            <Text style={[styles.imageMetaValue, { color: colors.foreground }]} numberOfLines={1}>
              {screening.capturedBy}
            </Text>
          </View>
          <View style={styles.imageMetaItem}>
            <Text style={[styles.imageMetaLabel, { color: colors.mutedForeground }]}>Image ID</Text>
            <Text style={[styles.imageMetaValue, { color: colors.foreground }]} numberOfLines={1}>
              {screening.imageId ?? "Not available"}
            </Text>
          </View>
        </View>
        {priorScreenings.length > 0 ? (
          <View style={styles.comparisonSection}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>PRIOR IMAGE COMPARISON</Text>
            <View style={styles.comparisonRow}>
              {priorScreenings.map((prior) => {
                const priorPatient = getPatient(prior.patientId);
                return (
                  <View key={prior.id} style={[styles.comparisonCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    {comparisonUrls[prior.id] ? (
                      <Image source={{ uri: comparisonUrls[prior.id] }} style={styles.comparisonImage} resizeMode="contain" />
                    ) : (
                      <View style={styles.comparisonPlaceholder}>
                        <Feather name="image" size={18} color={colors.mutedForeground} />
                        <Text style={[styles.comparisonPlaceholderText, { color: colors.mutedForeground }]}>
                          {prior.imageId ? "Loading image" : "No stored image"}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.comparisonLabel, { color: colors.foreground }]} numberOfLines={1}>
                      {priorPatient ? `${priorPatient.firstName} · ` : ""}{new Date(prior.capturedAt).toLocaleDateString("en-UG")}
                    </Text>
                    <Text style={[styles.comparisonMeta, { color: colors.mutedForeground }]}>
                      {prior.aiRiskLevel} · {prior.imageQualityScore}%
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>AI FINDINGS</Text>
        {screening.aiFindings.map((f) => (
          <View key={f} style={styles.findingRow}>
            <View style={[styles.findingDot, { backgroundColor: riskColor }]} />
            <Text style={[styles.findingText, { color: colors.foreground }]}>{f}</Text>
          </View>
        ))}
        <View style={[styles.qualityRow, { borderTopColor: colors.border }]}>
          <View style={styles.qualityItem}>
            <Feather name="aperture" size={14} color={colors.mutedForeground} />
            <Text style={[styles.qualityLabel, { color: colors.mutedForeground }]}>Image Quality</Text>
            <Text style={[styles.qualityVal, { color: colors.foreground }]}>{screening.imageQualityScore}%</Text>
          </View>
          <View style={[styles.qualityDivider, { backgroundColor: colors.border }]} />
          <View style={styles.qualityItem}>
            <Feather name="cpu" size={14} color={colors.mutedForeground} />
            <Text style={[styles.qualityLabel, { color: colors.mutedForeground }]}>AI Model</Text>
            <Text style={[styles.qualityVal, { color: colors.foreground }]}>{screening.aiModelVersion ?? MODEL_VERSION}</Text>
          </View>
        </View>
        <View style={[styles.qualityMeter, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.qualityFill,
              {
                width: `${Math.max(0, Math.min(100, screening.imageQualityScore))}%` as any,
                backgroundColor: qualityBlocked ? colors.destructive : screening.imageQualityScore < 70 ? colors.warning : colors.success,
              },
            ]}
          />
        </View>
        <Text style={[styles.qualityHint, { color: qualityBlocked ? colors.destructive : colors.mutedForeground }]}>
          {qualityBlocked
            ? `Review blocked below ${MIN_REVIEW_QUALITY}%. Recapture required.`
            : screening.imageQualityScore < 70
              ? "Acceptable quality — confirm image clarity before relying on findings."
              : "Quality passed the automated review gate."}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>SCREENING INFO</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Captured</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]}>
            {new Date(screening.capturedAt).toLocaleString("en-UG")}
          </Text>
        </View>
        {screening.notes ? (
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Notes</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{screening.notes}</Text>
          </View>
        ) : null}
        {screening.reviewedBy ? (
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Reviewed by</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{screening.reviewedBy}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.disclaimer, { backgroundColor: colors.warningLight, borderColor: "#fcd34d" }]}>
        <Feather name="info" size={14} color="#92400e" />
        <Text style={[styles.disclaimerText, { color: "#92400e" }]}>
          AI analysis is a clinical decision support tool. All findings require ophthalmologist confirmation before treatment.
        </Text>
      </View>

      {canReview ? (
        <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: qualityBlocked ? colors.urgentBorder : colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.reviewHeading}>
              <Feather name="check-square" size={18} color={qualityBlocked ? colors.destructive : colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.reviewTitle, { color: colors.foreground }]}>Clinical review</Text>
                <Text style={[styles.reviewSubtitle, { color: colors.mutedForeground }]}>
                  {screening.status === "Reviewed" ? `Reviewed by ${screening.reviewedBy ?? "clinician"}` : "Confirm the case before treatment or referral"}
                </Text>
              </View>
            </View>
            {screening.status === "Reviewed" && <Badge label="Confirmed" variant="success" size="sm" />}
          </View>

          {qualityBlocked ? (
            <View style={[styles.blockedBox, { backgroundColor: colors.urgentBg, borderColor: colors.urgentBorder }]}>
              <Feather name="slash" size={18} color={colors.destructive} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.blockedTitle, { color: colors.urgentText }]}>Clinical review blocked</Text>
                <Text style={[styles.blockedText, { color: colors.urgentText }]}>
                  This image scored {screening.imageQualityScore}%. Ask the operator to recapture before confirming a finding.
                </Text>
              </View>
            </View>
          ) : null}

          {!showReviewForm && screening.status !== "Reviewed" ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: qualityBlocked ? colors.mutedForeground : colors.primary }]}
              onPress={() => setShowReviewForm(true)}
              disabled={qualityBlocked}
              activeOpacity={0.85}
            >
              <Feather name="edit-3" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Record clinical impression</Text>
            </TouchableOpacity>
          ) : null}

          {qualityBlocked ? (
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.urgentBorder }]}
              onPress={handleRequestRecapture}
              disabled={savingReview}
              activeOpacity={0.85}
            >
              {savingReview ? <ActivityIndicator color={colors.destructive} /> : <Feather name="refresh-cw" size={17} color={colors.destructive} />}
              <Text style={[styles.secondaryBtnText, { color: colors.destructive }]}>Request recapture</Text>
            </TouchableOpacity>
          ) : null}

          {showReviewForm ? (
            <View style={styles.reviewForm}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>CONFIRMED CLINICAL IMPRESSION</Text>
              <TextInput
                value={clinicalImpression}
                onChangeText={setClinicalImpression}
                placeholder="e.g. No signs of sight-threatening disease; continue routine monitoring"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
              />
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>AUDIT NOTE (OPTIONAL)</Text>
              <TextInput
                value={reviewNote}
                onChangeText={setReviewNote}
                placeholder="Additional reasoning, image limitations or follow-up instructions"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border, minHeight: 64 }]}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveReview}
                disabled={savingReview}
                activeOpacity={0.85}
              >
                {savingReview ? <ActivityIndicator color="#fff" /> : <Feather name="check" size={18} color="#fff" />}
                <Text style={styles.primaryBtnText}>{savingReview ? "Saving review..." : "Confirm and save review"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowReviewForm(false)} disabled={savingReview}>
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {consultation ? (
        <TouchableOpacity
          style={[styles.consultationCard, { backgroundColor: colors.referralBg, borderColor: colors.referralBorder }]}
          onPress={() => router.push(`/consultation/${consultation.id}`)}
          activeOpacity={0.8}
        >
          <View style={styles.row}>
            <Feather name="message-circle" size={20} color={colors.referralText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.consultTitle, { color: colors.referralText }]}>
                Consultation {consultation.status}
              </Text>
              {consultation.assignedTo ? (
                <Text style={[styles.consultSub, { color: colors.referralText }]}>
                  Assigned to {consultation.assignedTo}
                </Text>
              ) : (
                <Text style={[styles.consultSub, { color: colors.referralText }]}>Awaiting specialist</Text>
              )}
            </View>
            <Feather name="chevron-right" size={16} color={colors.referralText} />
          </View>
        </TouchableOpacity>
      ) : screening.status !== "Referred" ? (
        <>
          {!showReferralForm ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowReferralForm(true)}
              activeOpacity={0.85}
            >
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Request Specialist Consultation</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.referralForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>REFERRAL NOTES</Text>
              <TextInput
                value={referralNotes}
                onChangeText={setReferralNotes}
                placeholder="Clinical observations, history relevant to referral..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleRequestConsultation}
                activeOpacity={0.85}
              >
                <Feather name="send" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Submit Consultation Request</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowReferralForm(false)}>
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },
  riskBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  riskText: { fontSize: 20, fontWeight: "700" },
  riskSub: { fontSize: 12, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardSubLabel: { fontSize: 12, marginTop: 3 },
  imageCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  imageFrame: { height: 210, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  retinalImage: { width: "100%", height: "100%" },
  imagePlaceholder: { fontSize: 12, marginTop: 8, textAlign: "center", paddingHorizontal: 28 },
  imageMetaGrid: { flexDirection: "row", gap: 10 },
  imageMetaItem: { flex: 1, gap: 3 },
  imageMetaLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  imageMetaValue: { fontSize: 11, fontWeight: "600" },
  comparisonSection: { gap: 9, marginTop: 2 },
  comparisonRow: { flexDirection: "row", gap: 9 },
  comparisonCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 8, gap: 3 },
  comparisonImage: { width: "100%", height: 78, borderRadius: 7 },
  comparisonPlaceholder: { height: 78, alignItems: "center", justifyContent: "center", gap: 4 },
  comparisonPlaceholderText: { fontSize: 10, textAlign: "center" },
  comparisonLabel: { fontSize: 11, fontWeight: "700" },
  comparisonMeta: { fontSize: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  patientName: { fontSize: 15, fontWeight: "600" },
  patientMeta: { fontSize: 12 },
  findingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  findingDot: { width: 6, height: 6, borderRadius: 3 },
  findingText: { fontSize: 14 },
  qualityRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  qualityItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  qualityLabel: { fontSize: 11 },
  qualityVal: { fontSize: 13, fontWeight: "600" },
  qualityDivider: { width: 1, marginHorizontal: 8 },
  qualityMeter: { height: 7, borderRadius: 4, overflow: "hidden" },
  qualityFill: { height: 7, borderRadius: 4 },
  qualityHint: { fontSize: 11, lineHeight: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  disclaimerText: { fontSize: 12, lineHeight: 18, flex: 1 },
  reviewCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  reviewHeading: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  reviewTitle: { fontSize: 15, fontWeight: "800" },
  reviewSubtitle: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  blockedBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderWidth: 1, borderRadius: 10 },
  blockedTitle: { fontSize: 13, fontWeight: "800" },
  blockedText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secondaryBtnText: { fontSize: 14, fontWeight: "700" },
  reviewForm: { gap: 10 },
  formLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  consultationCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  consultTitle: { fontSize: 14, fontWeight: "600" },
  consultSub: { fontSize: 12, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  referralForm: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  cancelText: { textAlign: "center", fontSize: 14 },
});
