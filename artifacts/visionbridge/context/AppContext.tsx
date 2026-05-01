/**
 * AppContext — clinical state for VisionBridge mobile app.
 *
 * All data is sourced from the API server (`/api/clinical/...`).
 * On auth the provider hits `/api/clinical/bootstrap` and hydrates state.
 * Mutations call the matching POST/PATCH endpoint and update local state
 * with the canonical row returned by the server.
 *
 * No mock seed data — placeholders are gone.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

// ── Public types (kept stable so existing screens compile unchanged) ───────
export type PatientSex = "M" | "F" | "Other";
export type RiskLevel = "Normal" | "Mild" | "Moderate" | "Severe" | "Urgent";
export type ScreeningStatus = "Pending" | "Screened" | "Reviewed" | "Referred";
export type CareCoordinationStatus =
  | "Pending" | "Assigned" | "InReview" | "Reviewed" | "Referred" | "Completed" | "Cancelled";
export type ReferralType = "Internal" | "External";
export type ReferralStatus = "Pending" | "Accepted" | "InTransit" | "Arrived" | "Completed" | "Declined";
export type AppointmentType = "Optical" | "Surgery" | "Laser" | "FollowUp" | "InjectionTherapy";
export type AppointmentStatus = "Requested" | "Confirmed" | "Completed" | "Cancelled" | "NoShow";
export type UserRole = "Admin" | "Doctor" | "Technician" | "CHW" | "Viewer" | "Patient";
export type CampaignType = "School" | "DiabetesClinic" | "Community" | "MobileUnit";
export type CampaignStatus = "Planned" | "Active" | "Completed" | "Cancelled";

export interface Patient {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: PatientSex;
  phone: string;
  village: string;
  district: string;
  medicalHistory: string[];
  registeredAt: string;
  lastVisit?: string;
  campaignId?: string;
  registeredBy?: string;
  registeredByName?: string;
}

export interface Screening {
  id: string;
  patientId: string;
  capturedAt: string;
  capturedBy: string;
  imageUri?: string;
  imageQualityScore: number;
  aiRiskLevel: RiskLevel;
  aiConfidence: number;
  aiFindings: string[];
  status: ScreeningStatus;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  campaignId?: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinic: string;
  district: string;
  phone?: string;
  isAvailable: boolean;
  totalAssigned: number;
}

export interface Referral {
  id: string;
  consultationId: string;
  patientId: string;
  type: ReferralType;
  status: ReferralStatus;
  createdAt: string;
  createdBy: string;
  targetFacility: string;
  targetDistrict: string;
  targetDoctor?: string;
  urgency: "Routine" | "Urgent" | "Emergency";
  reason: string;
  clinicalSummary: string;
  transportArranged: boolean;
  escortRequired: boolean;
  referralNotes?: string;
  acceptedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  declineReason?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  consultationId?: string;
  referralId?: string;
  type: AppointmentType;
  status: AppointmentStatus;
  facility: string;
  doctor?: string;
  scheduledDate: string;
  scheduledTime: string;
  createdAt: string;
  notes?: string;
  costUGX?: number;
  coveredByInsurance?: boolean;
  confirmedAt?: string;
  completedAt?: string;
}

export interface Consultation {
  id: string;
  screeningId: string;
  patientId: string;
  requestedBy: string;
  requestedAt: string;
  assignedTo?: string;
  assignedDoctorId?: string;
  assignedAt?: string;
  assignmentMethod?: "RoundRobin" | "Manual";
  status: CareCoordinationStatus;
  priority: "Routine" | "Urgent" | "Emergency";
  clinicalNotes?: string;
  diagnosisOverride?: string;
  treatmentPlan?: string;
  specialistResponse?: string;
  respondedAt?: string;
  diagnosis?: string;
  treatment?: string;
  referralId?: string;
  appointmentId?: string;
  followUpDate?: string;
  careCoordinatorNotes?: string;
  campaignId?: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  location: string;
  district: string;
  targetPopulation: string;
  startDate: string;
  endDate?: string;
  createdBy: string;
  createdAt: string;
  targetCount: number;
  screenedCount: number;
  referredCount: number;
  notes?: string;
}

export interface Notification {
  id: string;
  type:
    | "ConsultationUpdate" | "ScreeningReviewed" | "PatientReferred"
    | "AppointmentConfirmed" | "ReferralUpdate" | "CampaignAlert" | "SystemAlert";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  patientId?: string;
  screeningId?: string;
  consultationId?: string;
  referralId?: string;
  appointmentId?: string;
  campaignId?: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  clinic: string;
  district: string;
}

interface AppContextType {
  ready: boolean;
  currentUser: CurrentUser;
  patients: Patient[];
  screenings: Screening[];
  consultations: Consultation[];
  notifications: Notification[];
  doctors: Doctor[];
  referrals: Referral[];
  appointments: Appointment[];
  campaigns: Campaign[];

  // Sync state — drives the dashboard "Online · Last synced …" banner.
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;

  refresh: () => Promise<void>;

  addPatient: (p: Omit<Patient, "id" | "registeredAt">) => Promise<Patient | null>;
  updatePatient: (id: string, updates: Partial<Patient>) => Promise<void>;
  addScreening: (s: Omit<Screening, "id" | "capturedAt">) => Promise<Screening | null>;
  updateScreening: (id: string, updates: Partial<Screening>) => Promise<void>;
  addConsultation: (c: Omit<Consultation, "id" | "requestedAt">) => Promise<Consultation>;
  updateConsultation: (id: string, updates: Partial<Consultation>) => Promise<void>;
  assignConsultation: (id: string, doctorId: string, method: "RoundRobin" | "Manual") => Promise<void>;
  assignRoundRobin: (id: string) => Promise<Doctor | null>;
  addReferral: (r: Omit<Referral, "id" | "createdAt">) => Promise<Referral>;
  updateReferral: (id: string, updates: Partial<Referral>) => Promise<void>;
  addAppointment: (a: Omit<Appointment, "id" | "createdAt">) => Promise<Appointment>;
  updateAppointment: (id: string, updates: Partial<Appointment>) => Promise<void>;
  addCampaign: (c: Omit<Campaign, "id" | "createdAt" | "screenedCount" | "referredCount">) => Promise<Campaign>;
  updateCampaign: (id: string, updates: Partial<Campaign>) => Promise<void>;
  addNotification: (n: Omit<Notification, "id" | "createdAt" | "read">) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;

  getPatient: (id: string) => Patient | undefined;
  getScreeningsForPatient: (patientId: string) => Screening[];
  getConsultationForScreening: (screeningId: string) => Consultation | undefined;
  getConsultation: (id: string) => Consultation | undefined;
  getReferral: (id: string) => Referral | undefined;
  getAppointment: (id: string) => Appointment | undefined;
  getCampaign: (id: string) => Campaign | undefined;
  getCampaignScreenings: (campaignId: string) => Screening[];
  getCampaignPatients: (campaignId: string) => Patient[];
  getDoctor: (id: string) => Doctor | undefined;
  unreadCount: number;
}

const AppContext = createContext<AppContextType | null>(null);

const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;

const FALLBACK_USER: CurrentUser = {
  id: "anonymous",
  name: "Guest",
  role: "Viewer",
  clinic: "—",
  district: "—",
};

// ── Field-shape helpers (drizzle uses costUgx; AppContext keeps legacy costUGX) ──
function fromAppointment(row: any): Appointment {
  const { costUgx, ...rest } = row ?? {};
  return { ...rest, costUGX: costUgx ?? undefined } as Appointment;
}
function toAppointmentPayload<T extends Partial<Appointment>>(payload: T): Record<string, unknown> {
  const { costUGX, ...rest } = payload as any;
  const out: Record<string, unknown> = { ...rest };
  if (costUGX !== undefined) out["costUgx"] = costUGX;
  return out;
}

// Convert ISO-string fields used across the app — drizzle date columns may
// arrive as strings already; just normalise undefined/null.
function normaliseRow<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row };
  for (const k of Object.keys(out)) if (out[k] === null) out[k] = undefined;
  return out;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken, isAuthenticated } = useAuth();

  const [ready, setReady] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const currentUser: CurrentUser = useMemo(() => {
    if (!user) return FALLBACK_USER;
    return {
      id: user.id,
      name: user.fullName,
      role: user.role,
      clinic: user.facility,
      district: user.district,
    };
  }, [user]);

  // ── HTTP helper ─────────────────────────────────────────────────────────
  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    if (!accessToken) throw new Error("Not authenticated");
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }, [accessToken]);

  // ── Bootstrap on auth ───────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!isAuthenticated || !accessToken) {
      setReady(false);
      return;
    }
    setIsSyncing(true);
    try {
      const data = await authedFetch("/clinical/bootstrap");
      setDoctors((data.doctors ?? []).map(normaliseRow));
      setPatients((data.patients ?? []).map(normaliseRow));
      setScreenings((data.screenings ?? []).map(normaliseRow));
      setConsultations((data.consultations ?? []).map(normaliseRow));
      setReferrals((data.referrals ?? []).map(normaliseRow));
      setAppointments((data.appointments ?? []).map((r: any) => fromAppointment(normaliseRow(r))));
      setCampaigns((data.campaigns ?? []).map(normaliseRow));
      setNotifications((data.notifications ?? []).map(normaliseRow));
      setReady(true);
      setIsOnline(true);
      setLastSyncAt(new Date().toISOString());
      setLastSyncError(null);
    } catch (e) {
      const msg = (e as Error).message ?? "Unknown error";
      console.warn("[AppContext] bootstrap failed:", msg);
      // Network failures (no fetch response) typically surface as "Network request failed".
      const offline = /Network request failed|Failed to fetch|TypeError/i.test(msg);
      setIsOnline(!offline);
      setLastSyncError(msg);
      setReady(true); // unblock UI even on failure — shows empty state
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, accessToken, authedFetch]);

  useEffect(() => { refresh(); }, [refresh]);

  // Background re-sync every 60s while authenticated, so the dashboard
  // banner stays accurate without forcing the user to manually refresh.
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => { refresh(); }, 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated, refresh]);

  // ── Mutations ───────────────────────────────────────────────────────────
  const addPatient = useCallback(async (p: Omit<Patient, "id" | "registeredAt">) => {
    try {
      const { item } = await authedFetch("/patients", { method: "POST", body: JSON.stringify(p) });
      const row = normaliseRow(item) as Patient;
      setPatients((prev) => [row, ...prev]);
      return row;
    } catch (e) { console.warn("[addPatient]", (e as Error).message); return null; }
  }, [authedFetch]);

  const updatePatient = useCallback(async (id: string, updates: Partial<Patient>) => {
    try {
      const { item } = await authedFetch(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
      const row = normaliseRow(item) as Patient;
      setPatients((prev) => prev.map((p) => (p.id === id ? row : p)));
    } catch (e) { console.warn("[updatePatient]", (e as Error).message); }
  }, [authedFetch]);

  const addScreening = useCallback(async (s: Omit<Screening, "id" | "capturedAt">) => {
    try {
      const { item } = await authedFetch("/clinical/screenings", { method: "POST", body: JSON.stringify(s) });
      const row = normaliseRow(item) as Screening;
      setScreenings((prev) => [row, ...prev]);
      return row;
    } catch (e) { console.warn("[addScreening]", (e as Error).message); return null; }
  }, [authedFetch]);

  const updateScreening = useCallback(async (id: string, updates: Partial<Screening>) => {
    try {
      const { item } = await authedFetch(`/clinical/screenings/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
      const row = normaliseRow(item) as Screening;
      setScreenings((prev) => prev.map((x) => (x.id === id ? row : x)));
    } catch (e) { console.warn("[updateScreening]", (e as Error).message); }
  }, [authedFetch]);

  const addConsultation = useCallback(async (c: Omit<Consultation, "id" | "requestedAt">): Promise<Consultation> => {
    const { item } = await authedFetch("/clinical/consultations", { method: "POST", body: JSON.stringify(c) });
    const row = normaliseRow(item) as Consultation;
    setConsultations((prev) => [row, ...prev]);
    return row;
  }, [authedFetch]);

  const updateConsultation = useCallback(async (id: string, updates: Partial<Consultation>) => {
    try {
      const { item } = await authedFetch(`/clinical/consultations/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
      const row = normaliseRow(item) as Consultation;
      setConsultations((prev) => prev.map((x) => (x.id === id ? row : x)));
    } catch (e) { console.warn("[updateConsultation]", (e as Error).message); }
  }, [authedFetch]);

  const assignConsultation = useCallback(async (id: string, doctorId: string, method: "RoundRobin" | "Manual") => {
    const doc = doctors.find((d) => d.id === doctorId);
    if (!doc) return;
    await updateConsultation(id, {
      assignedTo: doc.name, assignedDoctorId: doctorId,
      assignedAt: new Date().toISOString(), assignmentMethod: method, status: "Assigned",
    });
    try {
      const { item } = await authedFetch(`/clinical/doctors/${doctorId}`, {
        method: "PATCH", body: JSON.stringify({ totalAssigned: doc.totalAssigned + 1 }),
      });
      setDoctors((prev) => prev.map((d) => (d.id === doctorId ? (normaliseRow(item) as Doctor) : d)));
    } catch (e) { console.warn("[assignConsultation:doctor]", (e as Error).message); }
  }, [doctors, updateConsultation, authedFetch]);

  const assignRoundRobin = useCallback(async (id: string): Promise<Doctor | null> => {
    const available = doctors.filter((d) => d.isAvailable);
    if (!available.length) return null;
    const pick = available.reduce((min, d) => (d.totalAssigned < min.totalAssigned ? d : min), available[0]);
    await assignConsultation(id, pick.id, "RoundRobin");
    return pick;
  }, [doctors, assignConsultation]);

  const addReferral = useCallback(async (r: Omit<Referral, "id" | "createdAt">): Promise<Referral> => {
    const { item } = await authedFetch("/clinical/referrals", { method: "POST", body: JSON.stringify(r) });
    const row = normaliseRow(item) as Referral;
    setReferrals((prev) => [row, ...prev]);
    return row;
  }, [authedFetch]);

  const updateReferral = useCallback(async (id: string, updates: Partial<Referral>) => {
    try {
      const { item } = await authedFetch(`/clinical/referrals/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
      const row = normaliseRow(item) as Referral;
      setReferrals((prev) => prev.map((x) => (x.id === id ? row : x)));
    } catch (e) { console.warn("[updateReferral]", (e as Error).message); }
  }, [authedFetch]);

  const addAppointment = useCallback(async (a: Omit<Appointment, "id" | "createdAt">): Promise<Appointment> => {
    const { item } = await authedFetch("/clinical/appointments", {
      method: "POST", body: JSON.stringify(toAppointmentPayload(a)),
    });
    const row = fromAppointment(normaliseRow(item));
    setAppointments((prev) => [row, ...prev]);
    return row;
  }, [authedFetch]);

  const updateAppointment = useCallback(async (id: string, updates: Partial<Appointment>) => {
    try {
      const { item } = await authedFetch(`/clinical/appointments/${id}`, {
        method: "PATCH", body: JSON.stringify(toAppointmentPayload(updates)),
      });
      const row = fromAppointment(normaliseRow(item));
      setAppointments((prev) => prev.map((x) => (x.id === id ? row : x)));
    } catch (e) { console.warn("[updateAppointment]", (e as Error).message); }
  }, [authedFetch]);

  const addCampaign = useCallback(async (c: Omit<Campaign, "id" | "createdAt" | "screenedCount" | "referredCount">): Promise<Campaign> => {
    const { item } = await authedFetch("/clinical/campaigns", { method: "POST", body: JSON.stringify(c) });
    const row = normaliseRow(item) as Campaign;
    setCampaigns((prev) => [row, ...prev]);
    return row;
  }, [authedFetch]);

  const updateCampaign = useCallback(async (id: string, updates: Partial<Campaign>) => {
    try {
      const { item } = await authedFetch(`/clinical/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
      const row = normaliseRow(item) as Campaign;
      setCampaigns((prev) => prev.map((x) => (x.id === id ? row : x)));
    } catch (e) { console.warn("[updateCampaign]", (e as Error).message); }
  }, [authedFetch]);

  const addNotification = useCallback(async (n: Omit<Notification, "id" | "createdAt" | "read">) => {
    try {
      const { item } = await authedFetch("/clinical/notifications", { method: "POST", body: JSON.stringify(n) });
      const row = normaliseRow(item) as Notification;
      setNotifications((prev) => [row, ...prev]);
    } catch (e) { console.warn("[addNotification]", (e as Error).message); }
  }, [authedFetch]);

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try { await authedFetch(`/clinical/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read: true }) }); }
    catch (e) { console.warn("[markNotificationRead]", (e as Error).message); }
  }, [authedFetch]);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await authedFetch("/clinical/notifications/read-all", { method: "POST" }); }
    catch (e) { console.warn("[markAllNotificationsRead]", (e as Error).message); }
  }, [authedFetch]);

  // ── Selectors ───────────────────────────────────────────────────────────
  const getPatient = useCallback((id: string) => patients.find((p) => p.id === id), [patients]);
  const getScreeningsForPatient = useCallback(
    (pid: string) => screenings.filter((s) => s.patientId === pid).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
    [screenings],
  );
  const getConsultationForScreening = useCallback((sid: string) => consultations.find((c) => c.screeningId === sid), [consultations]);
  const getConsultation = useCallback((id: string) => consultations.find((c) => c.id === id), [consultations]);
  const getReferral = useCallback((id: string) => referrals.find((r) => r.id === id), [referrals]);
  const getAppointment = useCallback((id: string) => appointments.find((a) => a.id === id), [appointments]);
  const getCampaign = useCallback((id: string) => campaigns.find((c) => c.id === id), [campaigns]);
  const getCampaignScreenings = useCallback((cid: string) => screenings.filter((s) => s.campaignId === cid), [screenings]);
  const getCampaignPatients = useCallback((cid: string) => patients.filter((p) => p.campaignId === cid), [patients]);
  const getDoctor = useCallback((id: string) => doctors.find((d) => d.id === id), [doctors]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AppContext.Provider
      value={{
        ready,
        currentUser,
        patients, screenings, consultations, notifications,
        doctors, referrals, appointments, campaigns,
        isOnline, isSyncing, lastSyncAt, lastSyncError,
        refresh,
        addPatient, updatePatient,
        addScreening, updateScreening,
        addConsultation, updateConsultation, assignConsultation, assignRoundRobin,
        addReferral, updateReferral,
        addAppointment, updateAppointment,
        addCampaign, updateCampaign,
        addNotification, markNotificationRead, markAllNotificationsRead,
        getPatient, getScreeningsForPatient, getConsultationForScreening,
        getConsultation, getReferral, getAppointment, getCampaign,
        getCampaignScreenings, getCampaignPatients, getDoctor,
        unreadCount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
