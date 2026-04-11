import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type PatientSex = "M" | "F" | "Other";
export type RiskLevel = "Normal" | "Mild" | "Moderate" | "Severe" | "Urgent";
export type ScreeningStatus = "Pending" | "Screened" | "Reviewed" | "Referred";
export type ConsultationStatus = "Open" | "InReview" | "Responded" | "Closed";
export type UserRole = "CHW" | "Technician" | "Ophthalmologist" | "Admin";

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
}

export interface Consultation {
  id: string;
  screeningId: string;
  patientId: string;
  requestedBy: string;
  requestedAt: string;
  assignedTo?: string;
  status: ConsultationStatus;
  priority: "Routine" | "Urgent" | "Emergency";
  clinicalNotes?: string;
  specialistResponse?: string;
  respondedAt?: string;
  diagnosis?: string;
  treatment?: string;
}

export interface Notification {
  id: string;
  type: "ConsultationUpdate" | "ScreeningReviewed" | "PatientReferred" | "SystemAlert";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  patientId?: string;
  screeningId?: string;
  consultationId?: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  clinic: string;
  district: string;
}

interface AppContextType {
  currentUser: CurrentUser;
  patients: Patient[];
  screenings: Screening[];
  consultations: Consultation[];
  notifications: Notification[];
  addPatient: (p: Omit<Patient, "id" | "registeredAt">) => void;
  updatePatient: (id: string, updates: Partial<Patient>) => void;
  addScreening: (s: Omit<Screening, "id" | "capturedAt">) => void;
  updateScreening: (id: string, updates: Partial<Screening>) => void;
  addConsultation: (c: Omit<Consultation, "id" | "requestedAt">) => void;
  updateConsultation: (id: string, updates: Partial<Consultation>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  getPatient: (id: string) => Patient | undefined;
  getScreeningsForPatient: (patientId: string) => Screening[];
  getConsultationForScreening: (screeningId: string) => Consultation | undefined;
  unreadCount: number;
}

const AppContext = createContext<AppContextType | null>(null);

const DEMO_USER: CurrentUser = {
  id: "user-001",
  name: "Sarah Nakato",
  role: "Technician",
  clinic: "Mbarara RRH Eye Unit",
  district: "Mbarara",
};

const INITIAL_PATIENTS: Patient[] = [
  {
    id: "p-001",
    patientId: "MBR-2025-0841",
    firstName: "Grace",
    lastName: "Atuhaire",
    dateOfBirth: "1968-03-15",
    sex: "F",
    phone: "+256701234567",
    village: "Katete",
    district: "Mbarara",
    medicalHistory: ["Diabetes Type 2", "Hypertension"],
    registeredAt: "2025-01-10T08:30:00Z",
    lastVisit: "2025-04-08T10:00:00Z",
  },
  {
    id: "p-002",
    patientId: "MBR-2025-0842",
    firstName: "James",
    lastName: "Mugisha",
    dateOfBirth: "1955-07-22",
    sex: "M",
    phone: "+256702345678",
    village: "Rwizi",
    district: "Mbarara",
    medicalHistory: ["Glaucoma (family history)"],
    registeredAt: "2025-01-12T09:15:00Z",
    lastVisit: "2025-04-07T14:30:00Z",
  },
  {
    id: "p-003",
    patientId: "MBR-2025-0843",
    firstName: "Esther",
    lastName: "Tumukunde",
    dateOfBirth: "1972-11-05",
    sex: "F",
    phone: "+256703456789",
    village: "Bubaare",
    district: "Mbarara",
    medicalHistory: ["Diabetes Type 1"],
    registeredAt: "2025-02-03T11:00:00Z",
    lastVisit: "2025-04-09T09:00:00Z",
  },
  {
    id: "p-004",
    patientId: "MBR-2025-0844",
    firstName: "Robert",
    lastName: "Kasaija",
    dateOfBirth: "1948-09-18",
    sex: "M",
    phone: "+256704567890",
    village: "Nyamitanga",
    district: "Mbarara",
    medicalHistory: ["Hypertension", "Cataracts"],
    registeredAt: "2025-02-14T13:45:00Z",
    lastVisit: "2025-04-06T11:00:00Z",
  },
  {
    id: "p-005",
    patientId: "MBR-2025-0845",
    firstName: "Florence",
    lastName: "Namazzi",
    dateOfBirth: "1983-06-30",
    sex: "F",
    phone: "+256705678901",
    village: "Kakiika",
    district: "Mbarara",
    medicalHistory: ["Diabetes Type 2"],
    registeredAt: "2025-03-01T08:00:00Z",
    lastVisit: "2025-04-10T16:00:00Z",
  },
];

const INITIAL_SCREENINGS: Screening[] = [
  {
    id: "s-001",
    patientId: "p-001",
    capturedAt: "2025-04-08T10:05:00Z",
    capturedBy: "user-001",
    imageQualityScore: 92,
    aiRiskLevel: "Moderate",
    aiConfidence: 87,
    aiFindings: ["Microaneurysms", "Hard exudates", "Mild NPDR signs"],
    status: "Reviewed",
    notes: "Patient reports blurred vision in right eye for 3 weeks",
    reviewedBy: "Dr. Okello",
    reviewedAt: "2025-04-08T15:00:00Z",
  },
  {
    id: "s-002",
    patientId: "p-002",
    capturedAt: "2025-04-07T14:35:00Z",
    capturedBy: "user-001",
    imageQualityScore: 88,
    aiRiskLevel: "Urgent",
    aiConfidence: 94,
    aiFindings: ["Optic disc cupping", "Cup-to-disc ratio elevated", "Possible glaucoma"],
    status: "Referred",
    notes: "IOP measured at 26mmHg",
    reviewedBy: "Dr. Okello",
    reviewedAt: "2025-04-07T18:00:00Z",
  },
  {
    id: "s-003",
    patientId: "p-003",
    capturedAt: "2025-04-09T09:10:00Z",
    capturedBy: "user-001",
    imageQualityScore: 95,
    aiRiskLevel: "Severe",
    aiConfidence: 91,
    aiFindings: ["Neovascularization", "Vitreous haemorrhage risk", "PDR suspected"],
    status: "Pending",
    notes: "Urgent referral needed",
  },
  {
    id: "s-004",
    patientId: "p-004",
    capturedAt: "2025-04-06T11:05:00Z",
    capturedBy: "user-001",
    imageQualityScore: 78,
    aiRiskLevel: "Normal",
    aiConfidence: 82,
    aiFindings: ["No significant pathology detected"],
    status: "Screened",
    notes: "Lens opacity noted, likely cataract — non-urgent",
  },
  {
    id: "s-005",
    patientId: "p-005",
    capturedAt: "2025-04-10T16:05:00Z",
    capturedBy: "user-001",
    imageQualityScore: 91,
    aiRiskLevel: "Mild",
    aiConfidence: 85,
    aiFindings: ["Mild dot hemorrhages", "Early NPDR"],
    status: "Pending",
  },
];

const INITIAL_CONSULTATIONS: Consultation[] = [
  {
    id: "c-001",
    screeningId: "s-002",
    patientId: "p-002",
    requestedBy: "user-001",
    requestedAt: "2025-04-07T14:50:00Z",
    assignedTo: "Dr. Nkurunziza",
    status: "Responded",
    priority: "Urgent",
    clinicalNotes: "Patient has family history of glaucoma. IOP 26mmHg bilaterally. Optic disc suspicious.",
    specialistResponse:
      "Recommend immediate referral to Kampala ophthalmology. Start brimonidine drops. Return in 2 weeks.",
    respondedAt: "2025-04-07T20:00:00Z",
    diagnosis: "Suspected Primary Open Angle Glaucoma",
    treatment: "Brimonidine tartrate 0.2% BID, urgent referral",
  },
  {
    id: "c-002",
    screeningId: "s-003",
    patientId: "p-003",
    requestedBy: "user-001",
    requestedAt: "2025-04-09T09:20:00Z",
    status: "Open",
    priority: "Emergency",
    clinicalNotes: "Proliferative diabetic retinopathy suspected. HbA1c 11.2%. Urgent laser treatment may be needed.",
  },
  {
    id: "c-003",
    screeningId: "s-001",
    patientId: "p-001",
    requestedBy: "user-001",
    requestedAt: "2025-04-08T10:30:00Z",
    assignedTo: "Dr. Nkurunziza",
    status: "InReview",
    priority: "Routine",
    clinicalNotes: "Non-proliferative diabetic retinopathy. Stable HbA1c at 8.1%. Monitor and control.",
  },
];

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: "n-001",
    type: "ConsultationUpdate",
    title: "Consultation Response Received",
    body: "Dr. Nkurunziza responded to James Mugisha's glaucoma case",
    read: false,
    createdAt: "2025-04-07T20:05:00Z",
    patientId: "p-002",
    consultationId: "c-001",
  },
  {
    id: "n-002",
    type: "ScreeningReviewed",
    title: "Screening Reviewed",
    body: "Grace Atuhaire's retinal screening has been reviewed",
    read: false,
    createdAt: "2025-04-08T15:05:00Z",
    patientId: "p-001",
    screeningId: "s-001",
  },
  {
    id: "n-003",
    type: "PatientReferred",
    title: "Patient Referred",
    body: "Esther Tumukunde requires emergency consultation — PDR suspected",
    read: false,
    createdAt: "2025-04-09T09:25:00Z",
    patientId: "p-003",
    screeningId: "s-003",
  },
  {
    id: "n-004",
    type: "SystemAlert",
    title: "Sync Complete",
    body: "5 pending screenings synced to regional server",
    read: true,
    createdAt: "2025-04-09T08:00:00Z",
  },
];

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [screenings, setScreenings] = useState<Screening[]>(INITIAL_SCREENINGS);
  const [consultations, setConsultations] = useState<Consultation[]>(INITIAL_CONSULTATIONS);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);

  useEffect(() => {
    AsyncStorage.getItem("visionbridge_data").then((raw) => {
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (data.patients?.length) setPatients(data.patients);
        if (data.screenings?.length) setScreenings(data.screenings);
        if (data.consultations?.length) setConsultations(data.consultations);
        if (data.notifications?.length) setNotifications(data.notifications);
      } catch {}
    });
  }, []);

  const persist = useCallback(
    (p: Patient[], s: Screening[], c: Consultation[], n: Notification[]) => {
      AsyncStorage.setItem("visionbridge_data", JSON.stringify({ patients: p, screenings: s, consultations: c, notifications: n }));
    },
    []
  );

  const addPatient = useCallback(
    (pat: Omit<Patient, "id" | "registeredAt">) => {
      const newP: Patient = { ...pat, id: generateId(), registeredAt: new Date().toISOString() };
      setPatients((prev) => {
        const updated = [newP, ...prev];
        persist(updated, screenings, consultations, notifications);
        return updated;
      });
    },
    [screenings, consultations, notifications, persist]
  );

  const updatePatient = useCallback(
    (id: string, updates: Partial<Patient>) => {
      setPatients((prev) => {
        const updated = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
        persist(updated, screenings, consultations, notifications);
        return updated;
      });
    },
    [screenings, consultations, notifications, persist]
  );

  const addScreening = useCallback(
    (scr: Omit<Screening, "id" | "capturedAt">) => {
      const newS: Screening = { ...scr, id: generateId(), capturedAt: new Date().toISOString() };
      setScreenings((prev) => {
        const updated = [newS, ...prev];
        persist(patients, updated, consultations, notifications);
        return updated;
      });
    },
    [patients, consultations, notifications, persist]
  );

  const updateScreening = useCallback(
    (id: string, updates: Partial<Screening>) => {
      setScreenings((prev) => {
        const updated = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
        persist(patients, updated, consultations, notifications);
        return updated;
      });
    },
    [patients, consultations, notifications, persist]
  );

  const addConsultation = useCallback(
    (con: Omit<Consultation, "id" | "requestedAt">) => {
      const newC: Consultation = { ...con, id: generateId(), requestedAt: new Date().toISOString() };
      setConsultations((prev) => {
        const updated = [newC, ...prev];
        persist(patients, screenings, updated, notifications);
        return updated;
      });
    },
    [patients, screenings, notifications, persist]
  );

  const updateConsultation = useCallback(
    (id: string, updates: Partial<Consultation>) => {
      setConsultations((prev) => {
        const updated = prev.map((c) => (c.id === id ? { ...c, ...updates } : c));
        persist(patients, screenings, updated, notifications);
        return updated;
      });
    },
    [patients, screenings, notifications, persist]
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        persist(patients, screenings, consultations, updated);
        return updated;
      });
    },
    [patients, screenings, consultations, persist]
  );

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      persist(patients, screenings, consultations, updated);
      return updated;
    });
  }, [patients, screenings, consultations, persist]);

  const getPatient = useCallback((id: string) => patients.find((p) => p.id === id), [patients]);
  const getScreeningsForPatient = useCallback(
    (patientId: string) => screenings.filter((s) => s.patientId === patientId).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
    [screenings]
  );
  const getConsultationForScreening = useCallback(
    (screeningId: string) => consultations.find((c) => c.screeningId === screeningId),
    [consultations]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AppContext.Provider
      value={{
        currentUser: DEMO_USER,
        patients,
        screenings,
        consultations,
        notifications,
        addPatient,
        updatePatient,
        addScreening,
        updateScreening,
        addConsultation,
        updateConsultation,
        markNotificationRead,
        markAllNotificationsRead,
        getPatient,
        getScreeningsForPatient,
        getConsultationForScreening,
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
