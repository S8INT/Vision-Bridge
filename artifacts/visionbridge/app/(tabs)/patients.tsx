import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { Patient } from "@/context/AppContext";
import { SearchBar } from "@/components/ui/SearchBar";
import { PatientCard } from "@/components/PatientCard";

export default function PatientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { patients, screenings } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "recent" | "urgent">("all");

  const filtered = useMemo(() => {
    let list = [...patients];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          p.patientId.toLowerCase().includes(q) ||
          p.village.toLowerCase().includes(q)
      );
    }
    if (filter === "recent") {
      list = list
        .filter((p) => p.lastVisit)
        .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
    }
    if (filter === "urgent") {
      const urgentPatientIds = new Set(
        screenings
          .filter(
            (s) => s.aiRiskLevel === "Urgent" || s.aiRiskLevel === "Severe"
          )
          .map((s) => s.patientId)
      );
      list = list.filter((p) => urgentPatientIds.has(p.id));
    }
    return list;
  }, [patients, screenings, query, filter]);

  const topPad = Platform.OS === "web" ? insets.top + 67 : 0;
  const botPad = Platform.OS === "web" ? 34 : 0;

  function getLastScreening(patientId: string) {
    const sorted = screenings
      .filter((s) => s.patientId === patientId)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    return sorted[0];
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Patients
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/patient/register")}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, ID, village..."
        />
        <View style={styles.filterRow}>
          {(["all", "recent", "urgent"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterBtn,
                {
                  backgroundColor:
                    filter === f ? colors.primary : colors.muted,
                  borderColor:
                    filter === f ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color:
                      filter === f
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  },
                ]}
              >
                {f === "all" ? "All" : f === "recent" ? "Recent" : "Urgent"}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {filtered.length} patients
          </Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const last = getLastScreening(item.id);
          return (
            <PatientCard
              patient={item}
              lastScreeningStatus={last?.status}
              lastScreeningRisk={last?.aiRiskLevel}
              onPress={() => router.push(`/patient/${item.id}`)}
            />
          );
        }}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: botPad + 100 },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No patients found
            </Text>
          </View>
        }
        scrollEnabled
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "700" },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  filterText: { fontSize: 13, fontWeight: "600" },
  count: { fontSize: 12, marginLeft: "auto" },
  list: { padding: 16 },
  empty: { alignItems: "center", gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 16 },
});
