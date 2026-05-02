/**
 * ImageQualityChecker — animated retinal image quality analysis UI
 *
 * Shows a scan animation while analysis runs, then renders per-metric
 * cards with scores, colour-coded status, and actionable guidance.
 *
 * States:
 *  scanning  — animated scan line overlay on the preview image
 *  result    — per-metric breakdown, verdict banner, action buttons
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ClientQualityResult, QualityMetric } from "@/services/imagingService";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  imageUri: string;
  result: ClientQualityResult | null;
  isScanning: boolean;
  onRecapture: () => void;
  onProceed: () => void;
}

// ── Metric icons ──────────────────────────────────────────────────────────────

const METRIC_ICONS: Record<string, string> = {
  sharpness:   "crosshair",
  brightness:  "sun",
  fieldOfView: "aperture",
  contrast:    "sliders",
  illumination:"zap",
  redChannel:  "droplet",
  glare:       "eye-off",
};

function getQualityGrade(overall: number): { grade: string; label: string; color: string } {
  if (overall >= 85) return { grade: "A", label: "Excellent", color: "#22c55e" };
  if (overall >= 70) return { grade: "B", label: "Good",      color: "#84cc16" };
  if (overall >= 55) return { grade: "C", label: "Fair",      color: "#f59e0b" };
  if (overall >= 40) return { grade: "D", label: "Poor",      color: "#f97316" };
  return                     { grade: "F", label: "Unacceptable", color: "#ef4444" };
}

// ── Score ring component ──────────────────────────────────────────────────────

function ScoreRing({
  score, size, colors, r,
}: {
  score: number;
  size: number;
  colors: ReturnType<typeof useColors>;
  r: ReturnType<typeof useResponsive>;
}) {
  const color =
    score >= 70 ? colors.success :
    score >= 45 ? colors.warning :
    colors.destructive;

  const strokeWidth = 5;
  const radius = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;

  if (Platform.OS === "web") {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute" as any }}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={colors.muted} strokeWidth={strokeWidth} fill="none"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={color} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <Text style={{ fontSize: r.font(13), fontWeight: "800", color }}>{score}</Text>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth, borderColor: colors.muted,
        alignItems: "center", justifyContent: "center", position: "absolute",
      }} />
      <View style={{
        width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4,
        backgroundColor: "transparent",
      }} />
      <Text style={{ fontSize: r.font(13), fontWeight: "800", color }}>{score}</Text>
    </View>
  );
}

// ── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  metricKey, metric, colors, r,
}: {
  metricKey: string;
  metric: QualityMetric;
  colors: ReturnType<typeof useColors>;
  r: ReturnType<typeof useResponsive>;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: metric.score,
      duration: 600,
      delay: 100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [metric.score]);

  const color =
    metric.score >= 70 ? colors.success :
    metric.score >= 45 ? colors.warning :
    colors.destructive;

  const statusIcon =
    metric.score >= 70 ? "check-circle" :
    metric.score >= 45 ? "alert-circle" :
    "x-circle";

  return (
    <View style={[s.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.metricTop}>
        <View style={[s.metricIconWrap, { backgroundColor: color + "18" }]}>
          <Feather name={METRIC_ICONS[metricKey] as any} size={r.iconSize(15)} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.metricLabel, { color: colors.foreground }]}>{metric.label}</Text>
          <Text style={[s.metricHint, { color: colors.mutedForeground }]} numberOfLines={2}>
            {metric.hint}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <Text style={{ fontSize: r.font(18), fontWeight: "800", color }}>{metric.score}</Text>
          <Feather name={statusIcon as any} size={r.iconSize(13)} color={color} />
        </View>
      </View>
      <View style={[s.barTrack, { backgroundColor: colors.muted }]}>
        <Animated.View style={[
          s.barFill,
          {
            backgroundColor: color,
            width: barAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
          },
        ]} />
      </View>
    </View>
  );
}

// ── Scan overlay animation ────────────────────────────────────────────────────

function ScanOverlay({ colors }: { colors: ReturnType<typeof useColors> }) {
  const lineAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(lineAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(lineAnim, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[s.scanGrid, { borderColor: colors.primary + "40" }]} />
      <Animated.View style={[
        s.scanLine,
        { backgroundColor: colors.primary + "cc" },
        { transform: [{ translateY: lineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 180] }) }] },
      ]} />
      <Animated.View style={[
        s.scanCornerTL, s.scanCorner,
        { borderColor: colors.primary, opacity: pulseAnim },
      ]} />
      <Animated.View style={[
        s.scanCornerTR, s.scanCorner,
        { borderColor: colors.primary, opacity: pulseAnim },
      ]} />
      <Animated.View style={[
        s.scanCornerBL, s.scanCorner,
        { borderColor: colors.primary, opacity: pulseAnim },
      ]} />
      <Animated.View style={[
        s.scanCornerBR, s.scanCorner,
        { borderColor: colors.primary, opacity: pulseAnim },
      ]} />
      <View style={s.scanLabel}>
        <Feather name="cpu" size={11} color={colors.primary} />
        <Text style={[s.scanLabelText, { color: colors.primary }]}>Analysing image…</Text>
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ImageQualityChecker({
  imageUri, result, isScanning, onRecapture, onProceed,
}: Props) {
  const colors = useColors();
  const r = useResponsive();

  const containerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (result && !isScanning) {
      Animated.timing(containerAnim, {
        toValue: 1, duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      containerAnim.setValue(0);
    }
  }, [result, isScanning]);

  const verdictColor =
    result?.critical ? colors.destructive :
    result?.pass      ? colors.success    :
    colors.warning;

  const verdictIcon =
    result?.critical ? "x-circle"      :
    result?.pass      ? "check-circle"  :
    "alert-triangle";

  const verdictTitle =
    result?.critical ? "Image cannot be used" :
    result?.pass      ? "Image quality acceptable" :
    "Quality warning";

  const verdictSub =
    result?.critical
      ? (result.reason ?? "Please recapture before proceeding.")
      : result?.pass
        ? "Pre-device check passed. Server will perform full validation on upload."
        : (result?.reason ?? "Image may be below minimum quality — recapture recommended.");

  const metricEntries = result
    ? (Object.entries(result.metrics) as [keyof typeof result.metrics, QualityMetric][])
    : [];

  return (
    <View style={{ gap: 14 }}>
      {/* ── Image preview with optional scan overlay ── */}
      <View style={[s.previewWrap, { borderColor: isScanning ? colors.primary : (result?.critical ? colors.destructive : result?.pass ? colors.success : colors.warning) }]}>
        <Image source={{ uri: imageUri }} style={s.previewImage} resizeMode="cover" />
        {isScanning && <ScanOverlay colors={colors} />}
        {result && !isScanning && (
          <View style={[s.scoreTag, { backgroundColor: verdictColor }]}>
            <Text style={s.scoreTagText}>{result.overall}</Text>
            <Text style={s.scoreTagLabel}>/100</Text>
          </View>
        )}
      </View>

      {/* ── Verdict banner ── */}
      {result && !isScanning && (
        <Animated.View style={{
          opacity: containerAnim,
          transform: [{ translateY: containerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}>
          <View style={[s.verdictBanner, { backgroundColor: verdictColor + "12", borderColor: verdictColor + "40" }]}>
            <Feather name={verdictIcon as any} size={r.iconSize(22)} color={verdictColor} />
            <View style={{ flex: 1 }}>
              <Text style={[s.verdictTitle, { color: verdictColor }]}>{verdictTitle}</Text>
              <Text style={[s.verdictSub, { color: colors.mutedForeground }]}>{verdictSub}</Text>
            </View>
          </View>

          {/* ── Overall ring + grade + sub-label ── */}
          {(() => {
            const grade = getQualityGrade(result.overall);
            return (
              <View style={[s.overallRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ScoreRing score={result.overall} size={64} colors={colors} r={r} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: r.font(12), fontWeight: "700", color: colors.foreground }}>
                      Overall quality score
                    </Text>
                    <View style={[s.gradeBadge, { backgroundColor: grade.color + "20", borderColor: grade.color + "55" }]}>
                      <Text style={[s.gradeText, { color: grade.color }]}>{grade.grade} · {grade.label}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: r.font(11), color: colors.mutedForeground }}>
                    Sharpness 30% · FOV 22% · brightness 18% · contrast 15% · red channel 10% · glare 5%
                  </Text>
                </View>
              </View>
            );
          })()}

          {/* ── Per-metric cards ── */}
          <View style={{ gap: 8, marginTop: 4 }}>
            {metricEntries.map(([key, metric]) => (
              <MetricCard key={key} metricKey={key} metric={metric} colors={colors} r={r} />
            ))}
          </View>

          {/* ── Platform note ── */}
          <View style={[s.platformNote, { backgroundColor: colors.muted }]}>
            <Feather name="info" size={r.iconSize(11)} color={colors.mutedForeground} />
            <Text style={[s.platformNoteText, { color: colors.mutedForeground }]}>
              {Platform.OS === "web"
                ? "Full pixel analysis completed on device (Laplacian sharpness · luminance · FOV mask)"
                : "Native pre-check (file-size heuristics) · full pixel analysis runs on server"}
            </Text>
          </View>

          {/* ── Action buttons ── */}
          <View style={s.actions}>
            <TouchableOpacity
              onPress={onRecapture}
              style={[s.recaptureBtn, { borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Feather name="refresh-cw" size={r.iconSize(15)} color={colors.mutedForeground} />
              <Text style={[s.recaptureBtnText, { color: colors.mutedForeground }]}>Recapture</Text>
            </TouchableOpacity>

            {result.critical ? (
              <View style={[s.blockedBtn, { backgroundColor: colors.muted, flex: 1 }]}>
                <Feather name="slash" size={r.iconSize(15)} color={colors.mutedForeground} />
                <Text style={[s.blockedBtnText, { color: colors.mutedForeground }]}>Cannot upload</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={onProceed}
                style={[s.proceedBtn, {
                  backgroundColor: result.pass ? colors.primary : colors.warning,
                  flex: 1,
                }]}
                activeOpacity={0.85}
              >
                <Feather name="upload-cloud" size={r.iconSize(15)} color="#fff" />
                <Text style={s.proceedBtnText}>
                  {result.pass ? "Upload & Analyse" : "Proceed Anyway"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Soft-warning override hint */}
          {!result.pass && !result.critical && (
            <Text style={[s.overrideHint, { color: colors.mutedForeground }]}>
              Proceeding with a low-quality image may reduce AI accuracy. Recapture is strongly recommended.
            </Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  previewWrap: {
    borderWidth: 2, borderRadius: 14, overflow: "hidden",
    height: 210, position: "relative",
  },
  previewImage: { width: "100%", height: "100%" },
  scoreTag: {
    position: "absolute", top: 10, right: 10,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    flexDirection: "row", alignItems: "baseline", gap: 1,
  },
  scoreTagText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  scoreTagLabel: { color: "#ffffffcc", fontSize: 11, fontWeight: "600" },

  scanGrid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 12,
    margin: 12,
  },
  scanLine: {
    position: "absolute", left: 0, right: 0, height: 2, opacity: 0.9,
    shadowColor: "#0ea5e9", shadowOpacity: 0.6, shadowRadius: 6,
    elevation: 4,
  },
  scanCorner: {
    position: "absolute", width: 18, height: 18, borderWidth: 2.5,
  },
  scanCornerTL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  scanCornerTR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  scanCornerBL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  scanCornerBR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanLabel: {
    position: "absolute", bottom: 8, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
  },
  scanLabelText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },

  verdictBanner: {
    borderWidth: 1.5, borderRadius: 12, padding: 14,
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    marginBottom: 10,
  },
  verdictTitle: { fontSize: 14, fontWeight: "800", marginBottom: 3 },
  verdictSub:  { fontSize: 12, lineHeight: 18 },

  overallRow: {
    borderWidth: 1, borderRadius: 12, padding: 12,
    flexDirection: "row", alignItems: "center", gap: 14,
    marginBottom: 10,
  },
  gradeBadge: {
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  gradeText: { fontSize: 11, fontWeight: "700" },

  metricCard: {
    borderWidth: 1, borderRadius: 11, padding: 11, gap: 8,
  },
  metricTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  metricIconWrap: {
    width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  metricLabel: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  metricHint:  { fontSize: 11, lineHeight: 16 },
  barTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  barFill:  { height: 5, borderRadius: 3 },

  platformNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    borderRadius: 8, padding: 10, marginTop: 10,
  },
  platformNoteText: { flex: 1, fontSize: 11, lineHeight: 16 },

  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  recaptureBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1,
  },
  recaptureBtnText: { fontSize: 14, fontWeight: "600" },
  proceedBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 13, borderRadius: 12,
  },
  proceedBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  blockedBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 13, borderRadius: 12,
  },
  blockedBtnText: { fontSize: 14, fontWeight: "600" },

  overrideHint: { fontSize: 11, textAlign: "center", lineHeight: 17, marginTop: 8 },
});
