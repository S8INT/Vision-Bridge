import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Local profile + role-specific settings storage.
 *
 * The server is the source of truth for the AuthUser, but for the in-app
 * demo we let users freely CRUD their profile on the device. Overrides are
 * keyed by user id so each demo account keeps its own edits across reloads.
 *
 * Stored under the single key `vb_profile_overrides`:
 *   { [userId]: ProfileOverride }
 * and `vb_doctor_schedules`:
 *   { [userId | doctorId]: WeeklySchedule }
 * and `vb_staff_users`:
 *   StaffUser[]   (admin-managed team list, demo only)
 */

const PROFILE_KEY = "vb_profile_overrides";
const SCHEDULE_KEY = "vb_doctor_schedules";
const STAFF_KEY = "vb_staff_users";

export interface ProfileOverride {
  fullName?: string;
  phone?: string;
  facility?: string;
  district?: string;
  bio?: string;
  avatarUri?: string;
  language?: "en" | "lg" | "rny";
  preferences?: {
    dailyDigest?: boolean;
    urgentAlerts?: boolean;
    smsAlerts?: boolean;
  };
}

export type WeekDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface DaySchedule {
  open: boolean;
  start: string; // HH:MM 24h
  end: string;   // HH:MM 24h
}

export interface WeeklySchedule {
  hours: Record<WeekDay, DaySchedule>;
  daysOff: string[]; // ISO YYYY-MM-DD
  consultMinutes: number;
  acceptingNew: boolean;
  notes?: string;
}

export const DEFAULT_SCHEDULE: WeeklySchedule = {
  hours: {
    Mon: { open: true,  start: "09:00", end: "17:00" },
    Tue: { open: true,  start: "09:00", end: "17:00" },
    Wed: { open: true,  start: "09:00", end: "17:00" },
    Thu: { open: true,  start: "09:00", end: "17:00" },
    Fri: { open: true,  start: "09:00", end: "13:00" },
    Sat: { open: false, start: "09:00", end: "13:00" },
    Sun: { open: false, start: "09:00", end: "13:00" },
  },
  daysOff: [],
  consultMinutes: 30,
  acceptingNew: true,
  notes: "",
};

export interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  role: "Admin" | "Doctor" | "Technician" | "CHW" | "Viewer";
  facility: string;
  district: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  mfaEnabled?: boolean;
}

// ── Profile overrides ───────────────────────────────────────────────────────
export function useProfileOverride(userId: string | undefined) {
  const [override, setOverride] = useState<ProfileOverride>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, ProfileOverride>) : {};
      setOverride(all[userId] || {});
      setLoaded(true);
    })();
  }, [userId]);

  const save = useCallback(
    async (patch: ProfileOverride) => {
      if (!userId) return;
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, ProfileOverride>) : {};
      const next = { ...(all[userId] || {}), ...patch };
      all[userId] = next;
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(all));
      setOverride(next);
    },
    [userId],
  );

  return { override, save, loaded };
}

// ── Doctor schedule ─────────────────────────────────────────────────────────
export function useDoctorSchedule(ownerId: string | undefined) {
  const [schedule, setSchedule] = useState<WeeklySchedule>(DEFAULT_SCHEDULE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, WeeklySchedule>) : {};
      setSchedule(all[ownerId] || DEFAULT_SCHEDULE);
      setLoaded(true);
    })();
  }, [ownerId]);

  const save = useCallback(
    async (next: WeeklySchedule) => {
      if (!ownerId) return;
      const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, WeeklySchedule>) : {};
      all[ownerId] = next;
      await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(all));
      setSchedule(next);
    },
    [ownerId],
  );

  return { schedule, save, loaded };
}

// ── Staff directory (admin) ─────────────────────────────────────────────────
const SEED_STAFF: StaffUser[] = [
  { id: "u-admin", fullName: "Sandra Mukasa",     email: "admin@visionbridge.ug",                role: "Admin",      facility: "VisionBridge HQ",   district: "Kampala",      phone: "+256 700 100 001", isActive: true, mfaEnabled: true,  createdAt: "2025-01-12T08:00:00Z" },
  { id: "u-okello", fullName: "Dr. Joseph Okello", email: "dr.okello@visionbridge.ug",            role: "Doctor",     facility: "Mbarara Eye Hospital", district: "Mbarara", phone: "+256 700 100 002", isActive: true, mfaEnabled: true,  createdAt: "2025-01-15T10:00:00Z" },
  { id: "u-namuli", fullName: "Dr. Aisha Namuli",  email: "dr.namuli@visionbridge.ug",            role: "Doctor",     facility: "Ruharo Mission Hospital", district: "Mbarara", phone: "+256 700 100 003", isActive: true, mfaEnabled: false, createdAt: "2025-02-04T09:30:00Z" },
  { id: "u-tech1",  fullName: "Sarah Nakato",      email: "sarah.nakato@visionbridge.ug",         role: "Technician", facility: "Mbarara Eye Hospital", district: "Mbarara", phone: "+256 700 100 004", isActive: true, mfaEnabled: false, createdAt: "2025-02-20T11:15:00Z" },
  { id: "u-chw1",   fullName: "Robert Tumwesigye", email: "chw.mbarara@visionbridge.ug",          role: "CHW",        facility: "Bukiro Sub-County",  district: "Mbarara",  phone: "+256 700 100 005", isActive: true, mfaEnabled: false, createdAt: "2025-03-01T07:45:00Z" },
  { id: "u-viewer", fullName: "Grace Mukite",      email: "viewer@visionbridge.ug",               role: "Viewer",     facility: "DHO Office",         district: "Mbarara",  phone: "+256 700 100 006", isActive: true, mfaEnabled: false, createdAt: "2025-03-05T14:00:00Z" },
];

export function useStaffDirectory() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STAFF_KEY);
      if (raw) {
        setStaff(JSON.parse(raw) as StaffUser[]);
      } else {
        setStaff(SEED_STAFF);
        await AsyncStorage.setItem(STAFF_KEY, JSON.stringify(SEED_STAFF));
      }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next: StaffUser[]) => {
    setStaff(next);
    await AsyncStorage.setItem(STAFF_KEY, JSON.stringify(next));
  }, []);

  const addStaff = useCallback(
    async (s: Omit<StaffUser, "id" | "createdAt">) => {
      const item: StaffUser = {
        ...s,
        id: `u-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      };
      await persist([item, ...staff]);
      return item;
    },
    [staff, persist],
  );

  const updateStaff = useCallback(
    async (id: string, patch: Partial<StaffUser>) => {
      await persist(staff.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    },
    [staff, persist],
  );

  const deleteStaff = useCallback(
    async (id: string) => {
      await persist(staff.filter((u) => u.id !== id));
    },
    [staff, persist],
  );

  return { staff, addStaff, updateStaff, deleteStaff, loaded };
}
