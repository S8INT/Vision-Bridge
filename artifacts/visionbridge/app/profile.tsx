import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Switch,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/AuthContext";
import { useProfileOverride } from "@/hooks/useProfile";

const LANGUAGES = [
  { code: "en",  label: "English" },
  { code: "lg",  label: "Luganda" },
  { code: "rny", label: "Runyankole" },
] as const;

export default function ProfileScreen() {
  const colors = useColors();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { override, save } = useProfileOverride(user?.id);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [facility, setFacility] = useState("");
  const [district, setDistrict] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState<"en" | "lg" | "rny">("en");
  const [dailyDigest, setDailyDigest] = useState(false);
  const [urgentAlerts, setUrgentAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);

  // Hydrate from overrides + auth user.
  useEffect(() => {
    setFullName(override.fullName ?? user?.fullName ?? "");
    setPhone(override.phone ?? user?.phone ?? "");
    setFacility(override.facility ?? user?.facility ?? "");
    setDistrict(override.district ?? user?.district ?? "");
    setBio(override.bio ?? "");
    setLanguage(override.language ?? "en");
    setDailyDigest(override.preferences?.dailyDigest ?? false);
    setUrgentAlerts(override.preferences?.urgentAlerts ?? true);
    setSmsAlerts(override.preferences?.smsAlerts ?? false);
  }, [override, user]);

  const onSave = async () => {
    if (!fullName.trim()) {
      Alert.alert("Required", "Full name cannot be empty.");
      return;
    }
    await save({
      fullName: fullName.trim(),
      phone: phone.trim(),
      facility: facility.trim(),
      district: district.trim(),
      bio: bio.trim(),
      language,
      preferences: { dailyDigest, urgentAlerts, smsAlerts },
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Your profile has been updated.");
  };

  const onSignOutEverywhere = () => {
    Alert.alert(
      "Sign out of all devices?",
      "You will be logged out of every device where you are currently signed in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out everywhere",
          style: "destructive",
          onPress: async () => {
            await logout(true);
            router.replace("/login");
          },
        },
      ],
    );
  };

  const role = user?.role ?? "Viewer";
  const initials = (fullName || user?.fullName || "U")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const styles = makeStyles(colors, r);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Avatar / identity */}
      <View style={styles.identity}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{fullName || "Unnamed"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={[styles.roleChip, { backgroundColor: colors.primary }]}>
            <Feather name="shield" size={r.iconSize(11)} color="#fff" />
            <Text style={styles.roleChipText}>{role}</Text>
          </View>
        </View>
      </View>

      {/* Account fields */}
      <Section title="Account" subtitle="Update your contact and facility details.">
        <Field label="Full name"   value={fullName} onChangeText={setFullName}   placeholder="Your name" />
        <Field label="Phone"       value={phone}    onChangeText={setPhone}      placeholder="+256…" keyboardType="phone-pad" />
        <Field label="Facility"    value={facility} onChangeText={setFacility}   placeholder="Clinic / Hospital" />
        <Field label="District"    value={district} onChangeText={setDistrict}   placeholder="District" />
        <Field label="Short bio"   value={bio}      onChangeText={setBio}        placeholder="Tell your team a little about yourself" multiline />
      </Section>

      {/* Preferences */}
      <Section title="Preferences">
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Language</Text>
          <View style={styles.langRow}>
            {LANGUAGES.map((l) => {
              const active = language === l.code;
              return (
                <TouchableOpacity
                  key={l.code}
                  onPress={() => setLanguage(l.code)}
                  style={[styles.langChip, active && styles.langChipActive]}
                >
                  <Text style={[styles.langChipText, active && { color: "#fff" }]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <ToggleRow label="Daily digest email" value={dailyDigest}  onValueChange={setDailyDigest} />
        <ToggleRow label="Urgent case alerts"  value={urgentAlerts} onValueChange={setUrgentAlerts} />
        <ToggleRow label="SMS notifications"   value={smsAlerts}    onValueChange={setSmsAlerts} />
      </Section>

      {/* Role-specific shortcuts */}
      <Section title="Role shortcuts">
        {role === "Doctor" && (
          <ActionRow
            icon="calendar"
            label="My weekly schedule"
            sub="Set hours, days off, consult length"
            color="#0ea5e9"
            onPress={() => router.push("/doctor/schedule" as never)}
          />
        )}
        {role === "Admin" && (
          <ActionRow
            icon="users"
            label="Manage staff & users"
            sub="Invite, edit and deactivate accounts"
            color="#7c3aed"
            onPress={() => router.push("/admin/users" as never)}
          />
        )}
        {role === "Patient" && (
          <ActionRow
            icon="heart"
            label="Medical history"
            sub="Conditions, allergies, medications"
            color="#ec4899"
            onPress={() => router.push("/patient/profile" as never)}
          />
        )}
        {(role === "CHW" || role === "Technician") && (
          <ActionRow
            icon="map-pin"
            label="My campaigns"
            sub="Field activities you are working on"
            color="#f59e0b"
            onPress={() => router.push("/(tabs)/campaigns" as never)}
          />
        )}
        <ActionRow
          icon="bell"
          label="Notifications"
          sub="Inbox & alerts"
          color="#06b6d4"
          onPress={() => router.push("/(tabs)/notifications" as never)}
        />
      </Section>

      {/* Security */}
      <Section title="Security">
        <View style={styles.securityRow}>
          <Feather name={user?.mfaEnabled ? "shield" : "alert-triangle"} size={r.iconSize(18)} color={user?.mfaEnabled ? colors.success : "#f59e0b"} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Two-factor authentication</Text>
            <Text style={styles.rowSub}>{user?.mfaEnabled ? "Enabled — verified at every sign-in." : "Recommended for clinical roles."}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.signOutAll} onPress={onSignOutEverywhere}>
          <Feather name="log-out" size={r.iconSize(16)} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out of all devices</Text>
        </TouchableOpacity>
      </Section>

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={onSave} activeOpacity={0.85}>
        <Feather name="save" size={r.iconSize(16)} color="#fff" />
        <Text style={styles.saveText}>Save profile</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={{ color: colors.foreground, fontSize: r.font(14), fontWeight: "700" }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: colors.mutedForeground, fontSize: r.font(12), marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 }}>
        {children}
      </View>
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "phone-pad" | "email-address";
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
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          color: colors.foreground,
          fontSize: r.font(14),
          paddingVertical: multiline ? 10 : 10,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          backgroundColor: colors.background,
          minHeight: multiline ? 64 : undefined,
        }}
      />
    </View>
  );
}

function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ flex: 1, color: colors.foreground, fontSize: r.font(13) }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.primary }} />
    </View>
  );
}

function ActionRow({
  icon, label, sub, color, onPress,
}: { icon: keyof typeof Feather.glyphMap; label: string; sub: string; color: string; onPress: () => void }) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
      <View style={{ width: r.iconSize(40), height: r.iconSize(40), borderRadius: 10, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon} size={r.iconSize(20)} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: r.font(14), fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: r.font(11) }}>{sub}</Text>
      </View>
      <Feather name="chevron-right" size={r.iconSize(18)} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ReturnType<typeof useColors>, r: ReturnType<typeof useResponsive>) =>
  StyleSheet.create({
    content: { padding: 16, gap: 18 },
    identity: { flexDirection: "row", alignItems: "center", gap: 14 },
    avatar: {
      width: r.iconSize(64), height: r.iconSize(64), borderRadius: r.iconSize(32),
      backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    },
    avatarText: { fontSize: r.font(22), color: "#fff", fontWeight: "700" },
    name: { color: colors.foreground, fontSize: r.font(18), fontWeight: "700" },
    email: { color: colors.mutedForeground, fontSize: r.font(12), marginTop: 2 },
    roleChip: { alignSelf: "flex-start", marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    roleChipText: { color: "#fff", fontSize: r.font(10), fontWeight: "700", letterSpacing: 0.4 },
    row: { gap: 8 },
    rowLabel: { color: colors.foreground, fontSize: r.font(13), fontWeight: "600" },
    rowSub: { color: colors.mutedForeground, fontSize: r.font(11), marginTop: 2 },
    langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    langChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
    langChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    langChipText: { fontSize: r.font(12), color: colors.foreground, fontWeight: "600" },
    securityRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    signOutAll: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
    signOutText: { fontSize: r.font(13), fontWeight: "600" },
    saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
    saveText: { color: "#fff", fontSize: r.font(14), fontWeight: "700" },
    cancelBtn: { paddingVertical: 12, alignItems: "center" },
    cancelText: { fontSize: r.font(13) },
  });
