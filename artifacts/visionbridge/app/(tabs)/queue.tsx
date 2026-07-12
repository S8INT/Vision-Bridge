/**
 * Offline Upload Queue Manager
 *
 * Shows all images queued for upload while offline.
 * Per-item status badges: queued (amber), uploading (blue), failed (red), uploaded (green).
 * Actions: retry single, discard single, retry all failed, clear uploaded.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { offlineQueue, retryQueueItem } from "@/services/imagingService";
import type { QueueItem } from "@/services/imagingService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${time}`;
}

function eyeLabel(eye?: string) {
  if (eye === "OD") return "Right eye (OD)";
  if (eye === "OS") return "Left eye (OS)";
  return "Eye unspecified";
}

// ── Status badge ──────────────────────────────────────────────────────────────

interface BadgeProps {
  status: QueueItem["status"];
  retries: number;
  maxRetries: number;
}

function StatusBadge({ status, retries, maxRetries }: BadgeProps) {
  const permFailed = status === "failed" && retries >= maxRetries;
  let bg: string, fg: string, label: string;

  if (status === "queued")         { bg = "#fef3c7"; fg = "#92400e"; label = "Queued"; }
  else if (status === "uploading") { bg = "#e0f2fe"; fg = "#0369a1"; label = "Uploading…"; }
  else if (status === "uploaded")  { bg = "#d1fae5"; fg = "#065f46"; label = "Uploaded"; }
  else if (permFailed)             { bg = "#fee2e2"; fg = "#991b1b"; label = "Perm. failed"; }
  else                             { bg = "#fee2e2"; fg = "#991b1b"; label = `Failed (${retries}/${maxRetries})`; }

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {status === "uploading" && (
        <ActivityIndicator size="small" color={fg} style={{ marginRight: 4 }} />
      )}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ── Queue item card ───────────────────────────────────────────────────────────

interface ItemCardProps {
  item: QueueItem;
  colors: ReturnType<typeof useColors>;
  isRetrying: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}

function ItemCard({ item, colors, isRetrying, onRetry, onDiscard }: ItemCardProps) {
  const effectiveStatus: QueueItem["status"] = isRetrying ? "uploading" : item.status;
  const permFailed = item.status === "failed" && item.retries >= offlineQueue.MAX_RETRIES;
  const canRetry = (item.status === "queued" || (item.status === "failed" && !permFailed)) && !isRetrying;
  const canDiscard = item.status !== "uploading" && !isRetrying;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Row 1: eye chip · date · badge */}
      <View style={styles.cardTopRow}>
        <View style={[styles.eyeChip, { backgroundColor: colors.secondary }]}>
          <Feather name="eye" size={12} color={colors.secondaryForeground} />
          <Text style={[styles.eyeChipText, { color: colors.secondaryForeground }]}>
            {item.metadata.eye ?? "?"}
          </Text>
        </View>

        <Text style={[styles.dateText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {formatDate(item.enqueuedAt)}
        </Text>

        <StatusBadge
          status={effectiveStatus}
          retries={item.retries}
          maxRetries={offlineQueue.MAX_RETRIES}
        />
      </View>

      {/* Row 2: patient info */}
      <Text style={[styles.patientRow, { color: colors.text }]} numberOfLines={1}>
        Patient{" "}
        <Text style={{ fontWeight: "700" }}>{item.metadata.patientId}</Text>
      </Text>
      <Text style={[styles.eyeFull, { color: colors.mutedForeground }]}>
        {eyeLabel(item.metadata.eye)}
        {item.retries > 0 ? `  ·  ${item.retries} attempt${item.retries !== 1 ? "s" : ""}` : ""}
      </Text>

      {/* Error banner */}
      {item.status === "failed" && item.errorMsg ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={12} color="#dc2626" style={{ marginTop: 1 }} />
          <Text style={styles.errorText} numberOfLines={3}>{item.errorMsg}</Text>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actionsRow}>
        {effectiveStatus === "uploading" ? (
          <View style={[styles.actionBtn, { backgroundColor: colors.muted }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>Uploading…</Text>
          </View>
        ) : item.status === "uploaded" ? (
          <View style={[styles.actionBtn, { backgroundColor: "#d1fae5" }]}>
            <Feather name="check-circle" size={14} color="#065f46" />
            <Text style={[styles.actionBtnText, { color: "#065f46" }]}>Done</Text>
          </View>
        ) : canRetry ? (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={onRetry}
            activeOpacity={0.8}
          >
            <Feather name="upload-cloud" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>Retry</Text>
          </TouchableOpacity>
        ) : permFailed ? (
          <View style={[styles.actionBtn, { backgroundColor: "#fee2e2" }]}>
            <Feather name="x-circle" size={14} color="#dc2626" />
            <Text style={[styles.actionBtnText, { color: "#dc2626" }]}>Max retries reached</Text>
          </View>
        ) : null}

        {canDiscard && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#fee2e2", marginLeft: 8 }]}
            onPress={onDiscard}
            activeOpacity={0.8}
          >
            <Feather name="trash-2" size={14} color="#dc2626" />
            <Text style={[styles.actionBtnText, { color: "#dc2626" }]}>Discard</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.statPill, { borderColor: color }]}>
      <Text style={[styles.statPillText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function QueueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [retryingAll, setRetryingAll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadItems = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const all = await offlineQueue.getAll();
    setItems([...all].reverse()); // newest first
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems(true);
    setRefreshing(false);
  }, [loadItems]);

  // ── Polling while items are active ──────────────────────────────────────────

  useEffect(() => {
    const hasActive =
      items.some((i) => i.status === "uploading") ||
      retryingIds.size > 0 ||
      retryingAll;

    if (hasActive) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => loadItems(true), 1500);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [items, retryingIds, retryingAll, loadItems]);

  // ── Single retry ────────────────────────────────────────────────────────────

  const handleRetry = useCallback(async (queueId: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRetryingIds((prev) => new Set(prev).add(queueId));
    try {
      await retryQueueItem(queueId);
      await loadItems(true);
    } catch (err: any) {
      Alert.alert("Retry failed", err?.message ?? "Upload failed. Please try again.");
      await loadItems(true);
    } finally {
      setRetryingIds((prev) => { const n = new Set(prev); n.delete(queueId); return n; });
    }
  }, [loadItems]);

  // ── Discard ─────────────────────────────────────────────────────────────────

  const handleDiscard = useCallback((queueId: string) => {
    Alert.alert(
      "Discard image?",
      "This image will be permanently removed from the upload queue and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await offlineQueue.remove(queueId);
            await loadItems(true);
          },
        },
      ]
    );
  }, [loadItems]);

  // ── Retry all failed ────────────────────────────────────────────────────────

  const handleRetryAll = useCallback(async () => {
    const retryable = items.filter(
      (i) => i.status === "failed" && i.retries < offlineQueue.MAX_RETRIES
    );
    if (retryable.length === 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRetryingAll(true);
    let ok = 0, fail = 0;
    for (const item of retryable) {
      try { await retryQueueItem(item.queueId); ok++; }
      catch { fail++; }
    }
    await loadItems(true);
    setRetryingAll(false);
    Alert.alert(
      "Retry complete",
      ok > 0
        ? `${ok} image${ok !== 1 ? "s" : ""} uploaded${fail > 0 ? `, ${fail} still failed` : " successfully"}.`
        : `All ${fail} upload${fail !== 1 ? "s" : ""} failed. Check your connection and try again.`
    );
  }, [items, loadItems]);

  // ── Clear uploaded ──────────────────────────────────────────────────────────

  const handleClearUploaded = useCallback(async () => {
    await offlineQueue.clearUploaded();
    await loadItems(true);
  }, [loadItems]);

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = {
    queued:    items.filter((i) => i.status === "queued").length,
    uploading: items.filter((i) => i.status === "uploading").length,
    failed:    items.filter((i) => i.status === "failed" && i.retries < offlineQueue.MAX_RETRIES).length,
    permFailed:items.filter((i) => i.status === "failed" && i.retries >= offlineQueue.MAX_RETRIES).length,
    uploaded:  items.filter((i) => i.status === "uploaded").length,
  };
  const retryableCount = stats.failed;
  const isEmpty = items.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTitleRow}>
          <Feather name="upload-cloud" size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Upload Queue</Text>
        </View>

        {/* Stat pills */}
        {!isEmpty && (
          <View style={styles.statsRow}>
            {stats.queued > 0 && (
              <StatPill label={`${stats.queued} queued`} color="#d97706" />
            )}
            {stats.uploading > 0 && (
              <StatPill label={`${stats.uploading} uploading`} color={colors.primary} />
            )}
            {stats.failed > 0 && (
              <StatPill label={`${stats.failed} failed`} color={colors.destructive} />
            )}
            {stats.permFailed > 0 && (
              <StatPill label={`${stats.permFailed} perm. failed`} color="#7f1d1d" />
            )}
            {stats.uploaded > 0 && (
              <StatPill label={`${stats.uploaded} uploaded`} color={colors.success} />
            )}
          </View>
        )}

        {/* Bulk action buttons */}
        {(retryableCount > 0 || stats.uploaded > 0) && (
          <View style={styles.bulkRow}>
            {retryableCount > 0 && (
              <TouchableOpacity
                style={[styles.bulkBtn, { backgroundColor: colors.primary }]}
                onPress={handleRetryAll}
                disabled={retryingAll}
                activeOpacity={0.8}
              >
                {retryingAll
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="refresh-cw" size={14} color="#fff" />
                }
                <Text style={styles.bulkBtnText}>
                  {retryingAll ? "Retrying…" : `Retry all failed (${retryableCount})`}
                </Text>
              </TouchableOpacity>
            )}
            {stats.uploaded > 0 && (
              <TouchableOpacity
                style={[
                  styles.bulkBtn,
                  { backgroundColor: colors.muted, marginTop: retryableCount > 0 ? 8 : 0 },
                ]}
                onPress={handleClearUploaded}
                activeOpacity={0.8}
              >
                <Feather name="check-circle" size={14} color={colors.mutedForeground} />
                <Text style={[styles.bulkBtnText, { color: colors.mutedForeground }]}>
                  {`Clear ${stats.uploaded} uploaded`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isEmpty ? (
        <View style={styles.centered}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.muted }]}>
            <Feather name="check-circle" size={36} color={colors.success} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>All clear</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            No images are waiting to upload.{"\n"}
            Images queued while offline appear here automatically.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.queueId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              colors={colors}
              isRetrying={retryingIds.has(item.queueId)}
              onRetry={() => handleRetry(item.queueId)}
              onDiscard={() => handleDiscard(item.queueId)}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  statPill: {
    borderWidth: 1.5,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  bulkRow: {
    gap: 0,
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bulkBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },

  // List
  list: {
    padding: 16,
  },

  // Card
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  eyeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  eyeChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 12,
    flex: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  patientRow: {
    fontSize: 14,
    marginBottom: 2,
  },
  eyeFull: {
    fontSize: 12,
    marginBottom: 8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    flex: 1,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },

  // Empty / loading
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
