import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import {
  useStaffDirectory,
  type StaffRole,
  type StaffUser,
  type CreateStaffInput,
  type UpdateStaffInput,
} from "@/hooks/useStaffDirectory";
import { useAuth } from "@/context/AuthContext";

// ── Constants ────────────────────────────────────────────────────────────────

const ROLES: StaffRole[] = ["Admin", "Doctor", "Technician", "CHW", "Viewer"];

const ROLE_COLORS: Record<StaffRole, string> = {
  Admin: "#7c3aed",
  Doctor: "#0ea5e9",
  Technician: "#10b981",
  CHW: "#f59e0b",
  Viewer: "#64748b",
};

const ROLE_ICONS: Record<StaffRole, string> = {
  Admin: "shield",
  Doctor: "user-check",
  Technician: "camera",
  CHW: "users",
  Viewer: "eye",
};

const UGANDA_DISTRICTS = [
  "Mbarara", "Kampala", "Kabale", "Jinja", "Mbale",
  "Gulu", "Lira", "Arua", "Fort Portal", "Soroti",
  "Mukono", "Wakiso", "Other",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Skeleton loading card ─────────────────────────────────────────────────────

function SkeletonCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
      borderRadius: 12, padding: 12,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.muted }} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ width: "60%", height: 14, borderRadius: 6, backgroundColor: colors.muted }} />
        <View style={{ width: "40%", height: 11, borderRadius: 5, backgroundColor: colors.muted }} />
      </View>
    </View>
  );
}

// ── Error banner ─────────────────────────────────────────────────────────────

function ErrorBanner({
  message, onRetry, colors, r,
}: {
  message: string;
  onRetry: () => void;
  colors: ReturnType<typeof useColors>;
  r: ReturnType<typeof useResponsive>;
}) {
  return (
    <View style={{
      backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
      borderRadius: 12, padding: 16, gap: 10,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name="alert-circle" size={r.iconSize(16)} color="#dc2626" />
        <Text style={{ flex: 1, fontSize: r.font(13), color: "#991b1b", lineHeight: 19 }}>
          {message}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          alignSelf: "flex-start", backgroundColor: "#dc2626",
          borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
        }}
      >
        <Text style={{ color: "#fff", fontSize: r.font(12), fontWeight: "700" }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AdminUsersScreen() {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();

  const {
    staff,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    createUser,
    isCreating,
    updateUser,
    isUpdating,
    removeUser,
    isRemoving,
  } = useStaffDirectory();

  const [filter, setFilter] = useState<"All" | StaffRole>("All");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  if (currentUser?.role !== "Admin") {
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
          <Text style={{ color: colors.primary, fontSize: r.font(13), fontWeight: "700" }}>Go back</Text>
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
        (s.facility ?? "").toLowerCase().includes(q)
      );
    });
  }, [staff, filter, search]);

  const totals = useMemo(
    () => ROLES.reduce<Record<string, number>>((acc, role) => {
      acc[role] = staff.filter((s) => s.role === role && s.isActive).length;
      return acc;
    }, {}),
    [staff],
  );

  const closeModal = () => {
    setEditing(null);
    setCreating(false);
    setMutationError(null);
  };

  const handleCreate = async (input: CreateStaffInput) => {
    setMutationError(null);
    try {
      await createUser(input);
      closeModal();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setMutationError((err as Error).message ?? "Failed to create user");
    }
  };

  const handleUpdate = async (id: string, patch: UpdateStaffInput) => {
    setMutationError(null);
    try {
      await updateUser({ id, patch });
      closeModal();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setMutationError((err as Error).message ?? "Failed to update user");
    }
  };

  const handleRemove = (s: StaffUser) => {
    if (s.id === currentUser?.id) {
      Alert.alert("Cannot remove", "You cannot remove your own account.");
      return;
    }
    Alert.alert(
      "Remove access?",
      `${s.fullName} will be deactivated and signed out immediately. Their clinical records are preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeUser(s.id);
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch (err) {
              Alert.alert("Error", (err as Error).message ?? "Failed to remove user");
            }
          },
        },
      ],
    );
  };

  const styles = makeStyles(colors, r);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Error banner ── */}
        {isError && (
          <ErrorBanner
            message={error?.message ?? "Could not load staff. Check your connection."}
            onRetry={() => refetch()}
            colors={colors}
            r={r}
          />
        )}

        {/* ── Role summary strip ── */}
        {isLoading ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {ROLES.map((role) => (
              <View key={role} style={[styles.totalCard, { backgroundColor: colors.muted }]} />
            ))}
          </View>
        ) : (
          <View style={styles.totalsRow}>
            {ROLES.map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.totalCard, filter === role && { borderColor: ROLE_COLORS[role] }]}
                onPress={() => setFilter((f) => (f === role ? "All" : role))}
                activeOpacity={0.75}
              >
                <View style={[styles.totalDot, { backgroundColor: ROLE_COLORS[role] }]} />
                <Text style={styles.totalValue}>{totals[role] ?? 0}</Text>
                <Text style={styles.totalLabel}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Search ── */}
        <View style={styles.searchRow}>
          <Feather name="search" size={r.iconSize(16)} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, email or facility…"
            placeholderTextColor={colors.mutedForeground}
            style={styles.searchInput}
          />
          {isFetching && !isLoading && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>

        {/* ── Role filter chips ── */}
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

        {/* ── Loading skeletons ── */}
        {isLoading && [0, 1, 2].map((i) => <SkeletonCard key={i} colors={colors} />)}

        {/* ── Empty state ── */}
        {!isLoading && !isError && filtered.length === 0 && (
          <View style={styles.empty}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: colors.muted, alignItems: "center", justifyContent: "center",
              marginBottom: 12,
            }}>
              <Feather name="users" size={r.iconSize(28)} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyText, { fontWeight: "700", color: colors.foreground }]}>
              {search || filter !== "All" ? "No matching staff" : "No staff yet"}
            </Text>
            <Text style={[styles.emptyText, { marginTop: 4 }]}>
              {search || filter !== "All"
                ? "Try a different search or filter."
                : "Tap the + button below to invite your first staff member."}
            </Text>
          </View>
        )}

        {/* ── Staff list ── */}
        {!isLoading && filtered.map((s) => (
          <View key={s.id} style={[styles.userCard, !s.isActive && styles.userCardInactive]}>
            <View style={[styles.avatar, { backgroundColor: ROLE_COLORS[s.role as StaffRole] ?? "#94a3b8" }]}>
              <Text style={styles.avatarText}>{initials(s.fullName)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={styles.userName} numberOfLines={1}>{s.fullName}</Text>
                {!s.isActive && (
                  <View style={styles.inactivePill}>
                    <Text style={styles.inactivePillText}>Inactive</Text>
                  </View>
                )}
                {s.mfaEnabled && (
                  <Feather name="shield" size={r.iconSize(11)} color={colors.success} />
                )}
              </View>
              <Text style={styles.userMeta}>
                <Text style={{ color: ROLE_COLORS[s.role as StaffRole] ?? colors.mutedForeground, fontWeight: "600" }}>
                  {s.role}
                </Text>
                {"  ·  "}{s.facility || "—"}
              </Text>
              <Text style={styles.userMeta}>{s.email}</Text>
              <Text style={[styles.userMeta, { fontSize: r.font(10) }]}>
                Last login: {relativeTime(s.lastLoginAt)}
              </Text>
            </View>
            <View style={{ gap: 4 }}>
              <TouchableOpacity
                onPress={() => { setMutationError(null); setEditing(s); }}
                style={styles.iconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={isRemoving}
              >
                <Feather name="edit-2" size={r.iconSize(16)} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemove(s)}
                style={styles.iconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <Feather name="user-x" size={r.iconSize(16)} color={colors.destructive} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── Floating add button ── */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
        onPress={() => { setMutationError(null); setCreating(true); }}
        activeOpacity={0.85}
        disabled={isLoading}
      >
        <Feather name="user-plus" size={r.iconSize(20)} color="#fff" />
      </TouchableOpacity>

      {/* ── Create / Edit modal ── */}
      <Modal
        visible={creating || !!editing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <UserForm
          mode={creating ? "create" : "edit"}
          initial={editing ?? undefined}
          submitting={creating ? isCreating : isUpdating}
          mutationError={mutationError}
          onCancel={closeModal}
          onSubmit={async (data) => {
            if (editing) {
              const { password: _pw, ...patch } = data as CreateStaffInput;
              void _pw;
              await handleUpdate(editing.id, patch);
            } else {
              await handleCreate(data as CreateStaffInput);
            }
          }}
        />
      </Modal>
    </View>
  );
}

// ── User form ────────────────────────────────────────────────────────────────

interface UserFormProps {
  mode: "create" | "edit";
  initial?: StaffUser;
  submitting: boolean;
  mutationError: string | null;
  onCancel: () => void;
  onSubmit: (data: CreateStaffInput | UpdateStaffInput) => Promise<void>;
}

function UserForm({ mode, initial, submitting, mutationError, onCancel, onSubmit }: UserFormProps) {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<StaffRole>(initial?.role ?? "Doctor");
  const [facility, setFacility] = useState(initial?.facility ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "Mbarara");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): boolean => {
    if (fullName.trim().length < 2) { setLocalError("Full name is required."); return false; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError("Enter a valid email address."); return false;
    }
    if (facility.trim().length < 1) { setLocalError("Facility name is required."); return false; }
    if (mode === "create") {
      if (password.length < 8) { setLocalError("Password must be at least 8 characters."); return false; }
      if (password !== confirmPassword) { setLocalError("Passwords don't match."); return false; }
    }
    setLocalError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (mode === "create") {
      await onSubmit({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        facility: facility.trim(),
        district,
        phone: phone.trim() || undefined,
        password,
      } satisfies CreateStaffInput);
    } else {
      await onSubmit({
        fullName: fullName.trim(),
        role,
        facility: facility.trim(),
        district,
        phone: phone.trim() || undefined,
        isActive,
      } satisfies UpdateStaffInput);
    }
  };

  const displayError = localError ?? mutationError;
  const styles = makeStyles(colors, r);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.modalHead, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onCancel} disabled={submitting}>
          <Text style={{ color: submitting ? colors.muted : colors.mutedForeground, fontSize: r.font(14) }}>
            Cancel
          </Text>
        </TouchableOpacity>
        <Text style={{ color: colors.foreground, fontSize: r.font(15), fontWeight: "700" }}>
          {mode === "create" ? "Invite staff member" : "Edit staff member"}
        </Text>
        <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={{ color: colors.primary, fontSize: r.font(14), fontWeight: "700" }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error */}
        {displayError ? (
          <View style={{
            backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
            borderRadius: 10, padding: 12, flexDirection: "row", gap: 8, alignItems: "flex-start",
          }}>
            <Feather name="alert-circle" size={r.iconSize(14)} color="#dc2626" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: r.font(13), color: "#991b1b", lineHeight: 19 }}>
              {displayError}
            </Text>
          </View>
        ) : null}

        {/* Role selector */}
        <View style={{ gap: 8 }}>
          <Text style={styles.fieldLabel}>Role</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ROLES.map((rl) => {
              const active = role === rl;
              return (
                <TouchableOpacity
                  key={rl}
                  onPress={() => setRole(rl)}
                  style={[
                    styles.roleChip,
                    active && { backgroundColor: ROLE_COLORS[rl], borderColor: ROLE_COLORS[rl] },
                  ]}
                  disabled={submitting}
                >
                  <Feather
                    name={ROLE_ICONS[rl] as any}
                    size={r.iconSize(13)}
                    color={active ? "#fff" : colors.mutedForeground}
                  />
                  <Text style={[styles.roleChipText, active && { color: "#fff" }]}>{rl}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Basic fields */}
        <FormField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder={role === "Doctor" ? "Dr. Jane Doe" : "Your full name"}
          autoCapitalize="words"
          colors={colors}
          r={r}
          editable={!submitting}
        />
        <FormField
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="user@hospital.ug"
          keyboardType="email-address"
          autoCapitalize="none"
          colors={colors}
          r={r}
          editable={!submitting && mode === "create"}
          hint={mode === "edit" ? "Email cannot be changed after account creation." : undefined}
        />
        <FormField
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          placeholder="+256 7XX XXX XXX"
          keyboardType="phone-pad"
          colors={colors}
          r={r}
          editable={!submitting}
        />
        <FormField
          label="Facility / Clinic"
          value={facility}
          onChangeText={setFacility}
          placeholder="e.g. Mbarara RRH Eye Unit"
          colors={colors}
          r={r}
          editable={!submitting}
        />

        {/* District */}
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>District</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {UGANDA_DISTRICTS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDistrict(d)}
                style={[
                  styles.districtChip,
                  district === d && styles.districtChipActive,
                ]}
                disabled={submitting}
              >
                <Text style={[
                  styles.districtChipText,
                  district === d && styles.districtChipTextActive,
                ]}>
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Password — create mode only */}
        {mode === "create" && (
          <>
            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Temporary password</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  editable={!submitting}
                  style={styles.pwInput}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Text style={{ fontSize: r.font(12), fontWeight: "600", color: colors.primary }}>
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldHint}>
                The staff member will use this to sign in. Advise them to change it after first login.
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  editable={!submitting}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  style={styles.pwInput}
                />
              </View>
            </View>
          </>
        )}

        {/* Active toggle — edit mode only */}
        {mode === "edit" && (
          <View style={[styles.toggleRow, { marginTop: 4 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: r.font(13), fontWeight: "600" }}>
                Account active
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: r.font(11), marginTop: 2 }}>
                Inactive users are signed out immediately and cannot log in.
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: colors.border, true: colors.primary }}
              disabled={submitting}
            />
          </View>
        )}

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.65 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather
                name={mode === "create" ? "user-plus" : "save"}
                size={r.iconSize(16)}
                color="#fff"
              />
              <Text style={{ fontSize: r.font(15), fontWeight: "700", color: "#fff" }}>
                {mode === "create" ? "Create account" : "Save changes"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Form field component ──────────────────────────────────────────────────────

function FormField({
  label, value, onChangeText, placeholder,
  keyboardType, autoCapitalize, editable = true, hint,
  colors, r,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "words" | "sentences";
  editable?: boolean;
  hint?: string;
  colors: ReturnType<typeof useColors>;
  r: ReturnType<typeof useResponsive>;
}) {
  const styles = makeStyles(colors, r);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        editable={editable}
        style={[styles.fieldInput, !editable && { opacity: 0.55 }]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (colors: ReturnType<typeof useColors>, r: ReturnType<typeof useResponsive>) =>
  StyleSheet.create({
    content: { padding: 16, gap: 14 },

    totalsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    totalCard: {
      flexBasis: r.isPhone ? "30%" : "18%", flexGrow: 1,
      backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5,
      borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8,
      alignItems: "center", gap: 4,
    },
    totalDot: { width: 8, height: 8, borderRadius: 4 },
    totalValue: { color: colors.foreground, fontSize: r.font(18), fontWeight: "700" },
    totalLabel: { color: colors.mutedForeground, fontSize: r.font(10), fontWeight: "600" },

    searchRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
    },
    searchInput: {
      flex: 1, color: colors.foreground,
      fontSize: r.font(14), paddingVertical: 10,
    },

    filterChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: r.font(12), color: colors.foreground, fontWeight: "600" },

    userCard: {
      flexDirection: "row", alignItems: "flex-start", gap: 12,
      backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
      borderRadius: 12, padding: 12,
    },
    userCardInactive: { opacity: 0.6 },
    avatar: {
      width: r.iconSize(44), height: r.iconSize(44),
      borderRadius: r.iconSize(22), alignItems: "center", justifyContent: "center",
    },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: r.font(14) },
    userName: { color: colors.foreground, fontSize: r.font(14), fontWeight: "700", flex: 1 },
    userMeta: { color: colors.mutedForeground, fontSize: r.font(11), marginTop: 1 },
    inactivePill: {
      backgroundColor: colors.muted, paddingHorizontal: 6,
      paddingVertical: 2, borderRadius: 4,
    },
    inactivePillText: {
      color: colors.mutedForeground, fontSize: r.font(9),
      fontWeight: "700", letterSpacing: 0.5,
    },
    iconBtn: { padding: 6 },

    empty: { padding: 40, alignItems: "center", gap: 4 },
    emptyText: { color: colors.mutedForeground, fontSize: r.font(13), textAlign: "center" },

    fab: {
      position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
      alignItems: "center", justifyContent: "center",
      shadowColor: "#000", shadowOpacity: 0.2,
      shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },

    modalHead: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingBottom: 12,
      borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    },

    roleChip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
    },
    roleChipText: { fontSize: r.font(12), color: colors.foreground, fontWeight: "600" },

    fieldLabel: {
      fontSize: r.font(12), fontWeight: "600",
      color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4,
    },
    fieldInput: {
      color: colors.foreground, fontSize: r.font(14),
      paddingVertical: 10, paddingHorizontal: 12,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: 8, backgroundColor: colors.background,
    },
    fieldHint: { fontSize: r.font(11), color: colors.mutedForeground, lineHeight: 16 },

    pwWrap: {
      flexDirection: "row", alignItems: "center",
      borderWidth: 1, borderColor: colors.border,
      borderRadius: 8, backgroundColor: colors.background,
    },
    pwInput: {
      flex: 1, color: colors.foreground,
      fontSize: r.font(14), paddingVertical: 10, paddingHorizontal: 12,
    },
    eyeBtn: { paddingHorizontal: 12 },

    districtChip: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    },
    districtChipActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
    districtChipText: { fontSize: r.font(11), fontWeight: "500", color: colors.mutedForeground },
    districtChipTextActive: { color: colors.primary, fontWeight: "700" },

    toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 12 },

    submitBtn: {
      height: 50, backgroundColor: colors.primary, borderRadius: 12,
      alignItems: "center", justifyContent: "center",
      flexDirection: "row", gap: 8, marginTop: 8,
    },
  });
