import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Switch,
  Modal,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useStaffDirectory, type StaffUser } from "@/hooks/useProfile";
import { useAuth } from "@/context/AuthContext";

const ROLES: StaffUser["role"][] = ["Admin", "Doctor", "Technician", "CHW", "Viewer"];
const ROLE_COLORS: Record<StaffUser["role"], string> = {
  Admin: "#7c3aed",
  Doctor: "#0ea5e9",
  Technician: "#10b981",
  CHW: "#f59e0b",
  Viewer: "#64748b",
};

export default function AdminUsersScreen() {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { staff, addStaff, updateStaff, deleteStaff } = useStaffDirectory();

  const [filter, setFilter] = useState<"All" | StaffUser["role"]>("All");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [creating, setCreating] = useState(false);

  if (user?.role !== "Admin") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
        <Feather name="lock" size={r.iconSize(28)} color={colors.mutedForeground} />
        <Text style={{ color: colors.foreground, fontSize: r.font(16), fontWeight: "700", marginTop: 12 }}>
          Admins only
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: r.font(12), marginTop: 6, textAlign: "center" }}>
          You do not have permission to manage staff accounts.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontSize: r.font(13), fontWeight: "700" }}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (filter !== "All" && s.role !== filter) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.facility.toLowerCase().includes(q)
      );
    });
  }, [staff, filter, search]);

  const totals = useMemo(() => {
    return ROLES.reduce<Record<string, number>>((acc, role) => {
      acc[role] = staff.filter((s) => s.role === role && s.isActive).length;
      return acc;
    }, {});
  }, [staff]);

  const onDelete = (s: StaffUser) => {
    if (s.email === user?.email) {
      Alert.alert("Cannot delete", "You can't delete your own account from here.");
      return;
    }
    Alert.alert(
      "Delete user?",
      `${s.fullName} will lose access immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteStaff(s.id);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  };

  const styles = makeStyles(colors, r);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {/* Top stats strip */}
        <View style={styles.totalsRow}>
          {ROLES.map((role) => (
            <View key={role} style={styles.totalCard}>
              <View style={[styles.totalDot, { backgroundColor: ROLE_COLORS[role] }]} />
              <Text style={styles.totalValue}>{totals[role] || 0}</Text>
              <Text style={styles.totalLabel}>{role}</Text>
            </View>
          ))}
        </View>

        {/* Search + filter */}
        <View style={styles.searchRow}>
          <Feather name="search" size={r.iconSize(16)} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, email or facility…"
            placeholderTextColor={colors.mutedForeground}
            style={styles.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(["All", ...ROLES] as const).map((opt) => {
            const active = filter === opt;
            return (
              <TouchableOpacity
                key={opt}
                onPress={() => setFilter(opt)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && { color: "#fff" }]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* List */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={r.iconSize(28)} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No matching users.</Text>
          </View>
        ) : (
          filtered.map((s) => (
            <View key={s.id} style={styles.userCard}>
              <View style={[styles.avatar, { backgroundColor: ROLE_COLORS[s.role] }]}>
                <Text style={styles.avatarText}>{initials(s.fullName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.userName}>{s.fullName}</Text>
                  {!s.isActive && <View style={styles.inactivePill}><Text style={styles.inactiveText}>Inactive</Text></View>}
                  {s.mfaEnabled && <Feather name="shield" size={r.iconSize(12)} color={colors.success} />}
                </View>
                <Text style={styles.userMeta}>{s.role} · {s.facility}</Text>
                <Text style={styles.userMeta}>{s.email}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditing(s)} style={styles.iconBtn}>
                <Feather name="edit-2" size={r.iconSize(16)} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(s)} style={styles.iconBtn}>
                <Feather name="trash-2" size={r.iconSize(16)} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Floating add */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
        onPress={() => setCreating(true)}
        activeOpacity={0.85}
      >
        <Feather name="user-plus" size={r.iconSize(20)} color="#fff" />
      </TouchableOpacity>

      {/* Edit / create modal */}
      <Modal
        visible={creating || !!editing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setEditing(null); setCreating(false); }}
      >
        <UserForm
          mode={creating ? "create" : "edit"}
          initial={editing ?? undefined}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSubmit={async (data) => {
            if (editing) {
              await updateStaff(editing.id, data);
            } else {
              await addStaff({ ...data, isActive: true });
            }
            setEditing(null);
            setCreating(false);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
        />
      </Modal>
    </View>
  );
}

// ── Edit / Create form ──────────────────────────────────────────────────────
function UserForm({
  mode, initial, onCancel, onSubmit,
}: {
  mode: "create" | "edit";
  initial?: StaffUser;
  onCancel: () => void;
  onSubmit: (data: Omit<StaffUser, "id" | "createdAt">) => Promise<void>;
}) {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<StaffUser["role"]>(initial?.role ?? "Doctor");
  const [facility, setFacility] = useState(initial?.facility ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "Mbarara");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [mfaEnabled, setMfaEnabled] = useState(initial?.mfaEnabled ?? false);

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || !facility.trim()) {
      Alert.alert("Required", "Name, email and facility are all required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    await onSubmit({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
      facility: facility.trim(),
      district: district.trim(),
      phone: phone.trim(),
      isActive,
      mfaEnabled,
    });
  };

  const styles = makeStyles(colors, r);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.modalHead, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={{ color: colors.mutedForeground, fontSize: r.font(14) }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.foreground, fontSize: r.font(15), fontWeight: "700" }}>
          {mode === "create" ? "New staff" : "Edit staff"}
        </Text>
        <TouchableOpacity onPress={submit}>
          <Text style={{ color: colors.primary, fontSize: r.font(14), fontWeight: "700" }}>Save</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Dr. Aisha Namuli" />
        <Field label="Email"     value={email}    onChangeText={setEmail}    placeholder="user@visionbridge.ug" keyboardType="email-address" />
        <Field label="Phone"     value={phone}    onChangeText={setPhone}    placeholder="+256…" keyboardType="phone-pad" />
        <Field label="Facility"  value={facility} onChangeText={setFacility} placeholder="Hospital / Clinic" />
        <Field label="District"  value={district} onChangeText={setDistrict} placeholder="Mbarara" />

        <Text style={{ color: colors.mutedForeground, fontSize: r.font(11), fontWeight: "600", marginTop: 6 }}>Role</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ROLES.map((rl) => {
            const active = role === rl;
            return (
              <TouchableOpacity
                key={rl}
                onPress={() => setRole(rl)}
                style={[styles.roleChip, active && { backgroundColor: ROLE_COLORS[rl], borderColor: ROLE_COLORS[rl] }]}
              >
                <Text style={[styles.roleChipText, active && { color: "#fff" }]}>{rl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.toggleRow, { marginTop: 12 }]}>
          <Text style={{ color: colors.foreground, fontSize: r.font(13), flex: 1 }}>Account active</Text>
          <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={{ color: colors.foreground, fontSize: r.font(13), flex: 1 }}>Two-factor required</Text>
          <Switch value={mfaEnabled} onValueChange={setMfaEnabled} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, keyboardType,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
}) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: r.font(11), color: colors.mutedForeground, fontWeight: "600" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        style={{
          color: colors.foreground, fontSize: r.font(14),
          paddingVertical: 10, paddingHorizontal: 12,
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          backgroundColor: colors.background,
        }}
      />
    </View>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const makeStyles = (colors: ReturnType<typeof useColors>, r: ReturnType<typeof useResponsive>) =>
  StyleSheet.create({
    content: { padding: 16, gap: 14 },
    totalsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    totalCard: {
      flexBasis: r.isPhone ? "30%" : "18%", flexGrow: 1,
      backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
      borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", gap: 4,
    },
    totalDot: { width: 8, height: 8, borderRadius: 4 },
    totalValue: { color: colors.foreground, fontSize: r.font(18), fontWeight: "700" },
    totalLabel: { color: colors.mutedForeground, fontSize: r.font(10), fontWeight: "600" },
    searchRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card,
    },
    searchInput: { flex: 1, color: colors.foreground, fontSize: r.font(14), paddingVertical: 10 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: r.font(12), color: colors.foreground, fontWeight: "600" },
    userCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
      borderRadius: 12, padding: 12,
    },
    avatar: { width: r.iconSize(44), height: r.iconSize(44), borderRadius: r.iconSize(22), alignItems: "center", justifyContent: "center" },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: r.font(14) },
    userName: { color: colors.foreground, fontSize: r.font(14), fontWeight: "700" },
    userMeta: { color: colors.mutedForeground, fontSize: r.font(11), marginTop: 2 },
    inactivePill: { backgroundColor: colors.muted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    inactiveText: { color: colors.mutedForeground, fontSize: r.font(9), fontWeight: "700", letterSpacing: 0.5 },
    iconBtn: { padding: 8 },
    empty: { padding: 32, alignItems: "center", gap: 8 },
    emptyText: { color: colors.mutedForeground, fontSize: r.font(13), textAlign: "center" },
    fab: {
      position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
      alignItems: "center", justifyContent: "center", shadowColor: "#000",
      shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    modalHead: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border,
      backgroundColor: colors.background,
    },
    roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    roleChipText: { fontSize: r.font(12), color: colors.foreground, fontWeight: "600" },
    toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  });
