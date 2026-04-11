import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, Campaign, CampaignStatus, CampaignType } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";

function getCampaignIcon(type: CampaignType): keyof typeof Feather.glyphMap {
  if (type === "School") return "users";
  if (type === "DiabetesClinic") return "activity";
  if (type === "MobileUnit") return "truck";
  return "map-pin";
}

function getCampaignVariant(status: CampaignStatus) {
  if (status === "Active") return "success";
  if (status === "Completed") return "referral";
  if (status === "Cancelled") return "urgent";
  return "muted";
}

function progressPercent(screened: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((screened / target) * 100)) : 0;
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const colors = useColors();
  const pct = progressPercent(campaign.screenedCount, campaign.targetCount);
  const icon = getCampaignIcon(campaign.type);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/campaign/${campaign.id}`)}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.card, borderColor: campaign.status === "Active" ? colors.primary + "40" : colors.border }]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconWrap, { backgroundColor: campaign.status === "Active" ? colors.primary + "18" : colors.muted }]}>
          <Feather name={icon} size={20} color={campaign.status === "Active" ? colors.primary : colors.mutedForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.campName, { color: colors.foreground }]} numberOfLines={2}>{campaign.name}</Text>
          <Text style={[styles.campMeta, { color: colors.mutedForeground }]}>{campaign.type} · {campaign.district}</Text>
          <Text style={[styles.campDate, { color: colors.mutedForeground }]}>
            {campaign.startDate}{campaign.endDate ? ` → ${campaign.endDate}` : ""}
          </Text>
        </View>
        <Badge label={campaign.status} variant={getCampaignVariant(campaign.status)} />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.progressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Screened</Text>
          <Text style={[styles.progressValue, { color: colors.foreground }]}>
            {campaign.screenedCount} / {campaign.targetCount}
            <Text style={[styles.progressPct, { color: colors.primary }]}> ({pct}%)</Text>
          </Text>
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: pct >= 100 ? colors.success : colors.primary }]} />
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Feather name="eye" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{campaign.screenedCount} screened</Text>
        </View>
        <View style={styles.stat}>
          <Feather name="navigation" size={12} color={campaign.referredCount > 0 ? colors.warning : colors.mutedForeground} />
          <Text style={[styles.statText, { color: campaign.referredCount > 0 ? colors.warning : colors.mutedForeground }]}>{campaign.referredCount} referred</Text>
        </View>
        <View style={styles.stat}>
          <Feather name="map-pin" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]} numberOfLines={1}>{campaign.location.split(",")[0]}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function CampaignsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { campaigns } = useApp();
  const [filter, setFilter] = useState<CampaignStatus | "All">("All");

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;

  const filtered = filter === "All" ? campaigns : campaigns.filter((c) => c.status === filter);
  const active = campaigns.filter((c) => c.status === "Active").length;
  const planned = campaigns.filter((c) => c.status === "Planned").length;
  const totalScreened = campaigns.reduce((s, c) => s + c.screenedCount, 0);
  const totalReferred = campaigns.reduce((s, c) => s + c.referredCount, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Campaigns</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Bulk screening workflows</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/campaign/new")}
            style={[styles.newBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.newBtnText}>New</Text>
          </TouchableOpacity>
        </View>

        {/* ── Summary Stats ── */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{active}</Text>
            <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Active</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.warning }]}>{planned}</Text>
            <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Planned</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{totalScreened}</Text>
            <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Total Screened</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.destructive }]}>{totalReferred}</Text>
            <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Referred</Text>
          </View>
        </View>

        {/* ── Filter Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(["All", "Active", "Planned", "Completed", "Cancelled"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.muted, borderColor: filter === f ? colors.primary : colors.border }]}
            >
              <Text style={[styles.filterChipText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Campaign Cards ── */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="map-pin" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No campaigns</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Start a new screening campaign for schools, diabetes clinics, or communities.</Text>
            <TouchableOpacity
              onPress={() => router.push("/campaign/new")}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Create First Campaign</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((c) => <CampaignCard key={c.id} campaign={c} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  newBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  statsGrid: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  statNum: { fontSize: 20, fontWeight: "800" },
  statLbl: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  filterRow: { paddingBottom: 4, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontWeight: "600" },
  card: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  campName: { fontSize: 15, fontWeight: "700" },
  campMeta: { fontSize: 12 },
  campDate: { fontSize: 11, marginTop: 2 },
  divider: { height: 1 },
  progressSection: { gap: 6 },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { fontSize: 12 },
  progressValue: { fontSize: 13, fontWeight: "600" },
  progressPct: { fontSize: 12 },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  statsRow: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  stat: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 22, maxWidth: 280 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
