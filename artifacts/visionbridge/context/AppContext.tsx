import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type PatientSex = "M" | "F" | "Other";
export type RiskLevel = "Normal" | "Mild" | "Moderate" | "Severe" | "Urgent";
export type ScreeningStatus = "Pending" | "Screened" | "Reviewed" | "Referred";
export type CareCoordinationStatus =
  | "Pending"
  | "Assigned"
  | "InReview"
  | "Reviewed"
  | "Referred"
  | "Completed"
  | "Cancelled";
export type ReferralType = "Internal" | "External";
export type ReferralStatus = "Pending" | "Accepted" | "InTransit" | "Arrived" | "Completed" | "Declined";
export type AppointmentType = "Optical" | "Surgery" | "Laser" | "FollowUp" | "InjectionTherapy";
export type AppointmentStatus = "Requested" | "Confirmed" | "Completed" | "Cancelled" | "NoShow";
export type UserRole = "CHW" | "Technician" | "Ophthalmologist" | "Admin";
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
    | "ConsultationUpdate"
    | "ScreeningReviewed"
    | "PatientReferred"
    | "AppointmentConfirmed"
    | "ReferralUpdate"
    | "CampaignAlert"
    | "SystemAlert";
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
  currentUser: CurrentUser;
  patients: Patient[];
  screenings: Screening[];
  consultations: Consultation[];
  notifications: Notification[];
  doctors: Doctor[];
  referrals: Referral[];
  appointments: Appointment[];
  campaigns: Campaign[];

  addPatient: (p: Omit<Patient, "id" | "registeredAt">) => void;
  updatePatient: (id: string, updates: Partial<Patient>) => void;
  addScreening: (s: Omit<Screening, "id" | "capturedAt">) => void;
  updateScreening: (id: string, updates: Partial<Screening>) => void;
  addConsultation: (c: Omit<Consultation, "id" | "requestedAt">) => Consultation;
  updateConsultation: (id: string, updates: Partial<Consultation>) => void;
  assignConsultation: (id: string, doctorId: string, method: "RoundRobin" | "Manual") => void;
  assignRoundRobin: (id: string) => Doctor | null;
  addReferral: (r: Omit<Referral, "id" | "createdAt">) => Referral;
  updateReferral: (id: string, updates: Partial<Referral>) => void;
  addAppointment: (a: Omit<Appointment, "id" | "createdAt">) => Appointment;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  addCampaign: (c: Omit<Campaign, "id" | "createdAt" | "screenedCount" | "referredCount">) => Campaign;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;
  addNotification: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

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

const DEMO_USER: CurrentUser = {
  id: "user-001",
  name: "Sarah Nakato",
  role: "Technician",
  clinic: "Mbarara RRH Eye Unit",
  district: "Mbarara",
};

const INITIAL_DOCTORS: Doctor[] = [
  {
    id: "doc-001",
    name: "Dr. Okello James",
    specialty: "Ophthalmologist",
    clinic: "Mbarara RRH Eye Unit",
    district: "Mbarara",
    phone: "+256701000001",
    isAvailable: true,
    totalAssigned: 4,
  },
  {
    id: "doc-002",
    name: "Dr. Nkurunziza Patricia",
    specialty: "Retinal Specialist",
    clinic: "Mbarara RRH Eye Unit",
    district: "Mbarara",
    phone: "+256701000002",
    isAvailable: true,
    totalAssigned: 3,
  },
  {
    id: "doc-003",
    name: "Dr. Tumwebaze Eric",
    specialty: "Glaucoma Specialist",
    clinic: "Kampala International Eye Institute",
    district: "Kampala",
    phone: "+256701000003",
    isAvailable: false,
    totalAssigned: 7,
  },
  {
    id: "doc-004",
    name: "Dr. Auma Grace",
    specialty: "Ophthalmologist",
    clinic: "Kabale Regional Referral",
    district: "Kabale",
    phone: "+256701000004",
    isAvailable: true,
    totalAssigned: 2,
  },
];

const INITIAL_PATIENTS = [
  {
    id: "p-001",
    patientId: "MBR-2025-0841",
    firstName: "Grace",
    lastName: "Atuhaire",
    dateOfBirth: "1968-03-15",
    sex: "F" as const,
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
    sex: "M" as const,
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
    sex: "F" as const,
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
    sex: "M" as const,
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
    sex: "F" as const,
    phone: "+256705678901",
    village: "Kakiika",
    district: "Mbarara",
    medicalHistory: ["Diabetes Type 2"],
    registeredAt: "2025-03-01T08:00:00Z",
    lastVisit: "2025-04-10T16:00:00Z",
    campaignId: "camp-001",
  },
  {
    id: "p-006",
    patientId: "MBR-2025-0846",
    firstName: "Patrick",
    lastName: "Byarugaba",
    dateOfBirth: "1960-04-12",
    sex: "M" as const,
    phone: "+256706789012",
    village: "Bwizibwera",
    district: "Mbarara",
    medicalHistory: ["Diabetes Type 2"],
    registeredAt: "2025-04-10T09:00:00Z",
    lastVisit: "2025-04-10T09:30:00Z",
    campaignId: "camp-001",
  },
  {
    id: "p-007",
    patientId: "MBR-2025-0847",
    firstName: "Agnes",
    lastName: "Nanteza",
    dateOfBirth: "1975-08-20",
    sex: "F" as const,
    phone: "+256707890123",
    village: "Bwizibwera",
    district: "Mbarara",
    medicalHistory: ["Diabetes Type 2", "Hypertension"],
    registeredAt: "2025-04-10T09:05:00Z",
    lastVisit: "2025-04-10T09:45:00Z",
    campaignId: "camp-001",
  },
];

const INITIAL_SCREENINGS = [
  {
    id: "s-001",
    patientId: "p-001",
    capturedAt: "2025-04-08T10:05:00Z",
    capturedBy: "user-001",
    imageQualityScore: 92,
    aiRiskLevel: "Moderate" as const,
    aiConfidence: 87,
    aiFindings: ["Microaneurysms", "Hard exudates", "Mild NPDR signs"],
    status: "Reviewed" as const,
    notes: "Patient reports blurred vision in right eye for 3 weeks",
    reviewedBy: "Dr. Okello James",
    reviewedAt: "2025-04-08T15:00:00Z",
  },
  {
    id: "s-002",
    patientId: "p-002",
    capturedAt: "2025-04-07T14:35:00Z",
    capturedBy: "user-001",
    imageQualityScore: 88,
    aiRiskLevel: "Urgent" as const,
    aiConfidence: 94,
    aiFindings: ["Optic disc cupping", "Cup-to-disc ratio elevated", "Possible glaucoma"],
    status: "Referred" as const,
    notes: "IOP measured at 26mmHg",
    reviewedBy: "Dr. Okello James",
    reviewedAt: "2025-04-07T18:00:00Z",
  },
  {
    id: "s-003",
    patientId: "p-003",
    capturedAt: "2025-04-09T09:10:00Z",
    capturedBy: "user-001",
    imageQualityScore: 95,
    aiRiskLevel: "Severe" as const,
    aiConfidence: 91,
    aiFindings: ["Neovascularization", "Vitreous haemorrhage risk", "PDR suspected"],
    status: "Referred" as const,
    notes: "Urgent referral needed",
  },
  {
    id: "s-004",
    patientId: "p-004",
    capturedAt: "2025-04-06T11:05:00Z",
    capturedBy: "user-001",
    imageQualityScore: 78,
    aiRiskLevel: "Normal" as const,
    aiConfidence: 82,
    aiFindings: ["No significant pathology detected"],
    status: "Screened" as const,
    notes: "Lens opacity noted, likely cataract — non-urgent",
  },
  {
    id: "s-005",
    patientId: "p-005",
    capturedAt: "2025-04-10T16:05:00Z",
    capturedBy: "user-001",
    imageQualityScore: 91,
    aiRiskLevel: "Mild" as const,
    aiConfidence: 85,
    aiFindings: ["Mild dot hemorrhages", "Early NPDR"],
    status: "Pending" as const,
    campaignId: "camp-001",
  },
  {
    id: "s-006",
    patientId: "p-006",
    capturedAt: "2025-04-10T09:35:00Z",
    capturedBy: "user-001",
    imageQualityScore: 84,
    aiRiskLevel: "Moderate" as const,
    aiConfidence: 88,
    aiFindings: ["Microaneurysms", "Dot-blot haemorrhages", "Moderate NPDR"],
    status: "Pending" as const,
    campaignId: "camp-001",
  },
  {
    id: "s-007",
    patientId: "p-007",
    capturedAt: "2025-04-10T09:50:00Z",
    capturedBy: "user-001",
    imageQualityScore: 89,
    aiRiskLevel: "Normal" as const,
    aiConfidence: 90,
    aiFindings: ["No significant pathology detected"],
    status: "Reviewed" as const,
    campaignId: "camp-001",
  },
];

const INITIAL_CONSULTATIONS: Consultation[] = [
  {
    id: "c-grace-1",
    screeningId: "s-001",
    patientId: "p-001",
    requestedBy: "user-001",
    requestedAt: "2025-04-08T10:30:00Z",
    assignedTo: "Dr. Okello James",
    assignedDoctorId: "doc-001",
    assignedAt: "2025-04-08T11:00:00Z",
    assignmentMethod: "RoundRobin",
    status: "Completed",
    priority: "Routine",
    clinicalNotes: "Moderate non-proliferative diabetic retinopathy detected. Microaneurysms and hard exudates in superior arcade of right eye. Patient reports blurred vision for 3 weeks.",
    diagnosis: "Moderate Non-Proliferative Diabetic Retinopathy (NPDR), right eye",
    treatment: "Tight glycaemic control (HbA1c target <7%). Brimonidine drops not required. Schedule follow-up in 3 months. Diabetic eye education provided.",
    treatmentPlan: "1. Continue metformin 1g BID. 2. Monitor blood sugar 2x daily. 3. Reduce dietary sugar. 4. Return in 3 months for repeat fundus exam. 5. Notify clinic immediately if vision worsens.",
    specialistResponse: "Reassuring findings — no immediate sight-threatening disease. Most important step is glycaemic control. Mrs. Atuhaire should continue diabetes medications as prescribed and return in 3 months. Reading glasses may help with near tasks.",
    respondedAt: "2025-04-08T15:00:00Z",
    followUpDate: "2026-04-28T09:30:00Z",
    appointmentId: "appt-002",
  },
  {
    id: "c-001",
    screeningId: "s-002",
    patientId: "p-002",
    requestedBy: "user-001",
    requestedAt: "2025-04-07T14:50:00Z",
    assignedTo: "Dr. Nkurunziza Patricia",
    assignedDoctorId: "doc-002",
    assignedAt: "2025-04-07T15:00:00Z",
    assignmentMethod: "RoundRobin",
    status: "Completed",
    priority: "Urgent",
    clinicalNotes: "Patient has family history of glaucoma. IOP 26mmHg bilaterally. Optic disc suspicious.",
    diagnosisOverride: "Primary Open Angle Glaucoma (suspected)",
    treatmentPlan: "Brimonidine tartrate 0.2% BID. Follow up in 2 weeks. Urgent referral Kampala.",
    specialistResponse: "Recommend immediate referral to Kampala ophthalmology. Start brimonidine drops. Return in 2 weeks.",
    respondedAt: "2025-04-07T20:00:00Z",
    diagnosis: "Suspected Primary Open Angle Glaucoma",
    treatment: "Brimonidine tartrate 0.2% BID, urgent referral",
    referralId: "ref-001",
    appointmentId: "appt-001",
    followUpDate: "2025-04-21T09:00:00Z",
    careCoordinatorNotes: "Transport arranged via clinic vehicle. Family informed.",
  },
  {
    id: "c-002",
    screeningId: "s-003",
    patientId: "p-003",
    requestedBy: "user-001",
    requestedAt: "2025-04-09T09:20:00Z",
    assignedTo: "Dr. Okello James",
    assignedDoctorId: "doc-001",
    assignedAt: "2025-04-09T09:25:00Z",
    assignmentMethod: "RoundRobin",
    status: "InReview",
    priority: "Emergency",
    clinicalNotes: "Proliferative diabetic retinopathy suspected. HbA1c 11.2%. Urgent laser treatment may be needed.",
    diagnosisOverride: undefined,
    treatmentPlan: undefined,
  },
  {
    id: "c-003",
    screeningId: "s-001",
    patientId: "p-001",
    requestedBy: "user-001",
    requestedAt: "2025-04-08T10:30:00Z",
    assignedTo: "Dr. Nkurunziza Patricia",
    assignedDoctorId: "doc-002",
    assignedAt: "2025-04-08T10:35:00Z",
    assignmentMethod: "Manual",
    status: "Reviewed",
    priority: "Routine",
    clinicalNotes: "Non-proliferative diabetic retinopathy. Stable HbA1c at 8.1%. Monitor and control.",
    diagnosisOverride: "Mild Non-Proliferative Diabetic Retinopathy (NPDR)",
    treatmentPlan: "Optimize glycaemic control. Review in 6 months. No immediate intervention needed.",
    specialistResponse: "Monitor closely, tighten glucose control, annual screening.",
    respondedAt: "2025-04-08T16:00:00Z",
    diagnosis: "Mild NPDR",
    treatment: "Lifestyle modification, glycaemic optimization",
    followUpDate: "2025-10-08T09:00:00Z",
    careCoordinatorNotes: "Patient counselled on diet and glucose monitoring.",
  },
];

const INITIAL_REFERRALS: Referral[] = [
  {
    id: "ref-001",
    consultationId: "c-001",
    patientId: "p-002",
    type: "Internal",
    status: "Accepted",
    createdAt: "2025-04-07T20:30:00Z",
    createdBy: "user-001",
    targetFacility: "Kampala International Eye Institute",
    targetDistrict: "Kampala",
    targetDoctor: "Dr. Tumwebaze Eric",
    urgency: "Urgent",
    reason: "Suspected Primary Open Angle Glaucoma requiring specialist assessment and tonometry workup",
    clinicalSummary: "55M, family history glaucoma, IOP 26mmHg bilateral, elevated C/D ratio on fundus imaging.",
    transportArranged: true,
    escortRequired: false,
    referralNotes: "Patient to bring previous IOP records. Clinic vehicle departs 6am Friday.",
    acceptedAt: "2025-04-08T09:00:00Z",
  },
];

const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: "appt-001",
    patientId: "p-002",
    consultationId: "c-001",
    referralId: "ref-001",
    type: "FollowUp",
    status: "Confirmed",
    facility: "Kampala International Eye Institute",
    doctor: "Dr. Tumwebaze Eric",
    scheduledDate: "2025-04-18",
    scheduledTime: "10:00",
    createdAt: "2025-04-08T09:30:00Z",
    notes: "Bring previous IOP readings and referral letter",
    costUGX: 50000,
    coveredByInsurance: false,
    confirmedAt: "2025-04-08T10:00:00Z",
  },
  {
    id: "appt-002",
    patientId: "p-001",
    type: "FollowUp",
    status: "Confirmed",
    facility: "Mbarara RRH Eye Unit",
    doctor: "Dr. Okello James",
    scheduledDate: "2026-04-28",
    scheduledTime: "09:30",
    createdAt: "2026-04-12T08:00:00Z",
    notes: "Follow-up for diabetic retinopathy. Bring blood sugar log.",
    costUGX: 25000,
    coveredByInsurance: true,
    confirmedAt: "2026-04-12T09:00:00Z",
  },
  {
    id: "appt-003",
    patientId: "p-001",
    type: "Optical",
    status: "Requested",
    facility: "Mbarara RRH Eye Unit",
    doctor: "Dr. Nkurunziza Patricia",
    scheduledDate: "2026-05-10",
    scheduledTime: "14:00",
    createdAt: "2026-04-18T10:00:00Z",
    notes: "Refraction and reading-glasses fitting.",
    costUGX: 25000,
    coveredByInsurance: true,
  },
];

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-001",
    name: "Bwizibwera Diabetes Eye Screening",
    type: "DiabetesClinic",
    status: "Active",
    location: "Bwizibwera Health Centre IV",
    district: "Mbarara",
    targetPopulation: "Registered diabetes patients at Bwizibwera HC IV",
    startDate: "2025-04-10",
    endDate: "2025-04-12",
    createdBy: "user-001",
    createdAt: "2025-04-08T08:00:00Z",
    targetCount: 50,
    screenedCount: 3,
    referredCount: 1,
    notes: "Partnered with Uganda Diabetes Association. Equipment transport arranged.",
  },
  {
    id: "camp-002",
    name: "St. Kizito Primary School Vision Screening",
    type: "School",
    status: "Planned",
    location: "St. Kizito Primary School, Nyamitanga",
    district: "Mbarara",
    targetPopulation: "P4-P7 students (ages 9-14)",
    startDate: "2025-04-22",
    createdBy: "user-001",
    createdAt: "2025-04-09T10:00:00Z",
    targetCount: 200,
    screenedCount: 0,
    referredCount: 0,
    notes: "Headteacher confirmed. Consent forms distributed to parents.",
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
    title: "Emergency Consultation Open",
    body: "Esther Tumukunde requires emergency specialist review — PDR suspected",
    read: false,
    createdAt: "2025-04-09T09:25:00Z",
    patientId: "p-003",
    screeningId: "s-003",
  },
  {
    id: "n-004",
    type: "AppointmentConfirmed",
    title: "Appointment Confirmed",
    body: "James Mugisha's appointment at KIEI confirmed for 18 Apr 10:00",
    read: false,
    createdAt: "2025-04-08T10:05:00Z",
    patientId: "p-002",
    appointmentId: "appt-001",
  },
  {
    id: "n-005",
    type: "ReferralUpdate",
    title: "Referral Accepted",
    body: "Kampala International Eye Institute accepted James Mugisha's referral",
    read: true,
    createdAt: "2025-04-08T09:05:00Z",
    patientId: "p-002",
    referralId: "ref-001",
  },
  {
    id: "n-006",
    type: "CampaignAlert",
    title: "Campaign Progress",
    body: "Bwizibwera Diabetes Campaign: 3/50 patients screened today",
    read: true,
    createdAt: "2025-04-10T17:00:00Z",
    campaignId: "camp-001",
  },
  {
    id: "n-007",
    type: "SystemAlert",
    title: "Sync Complete",
    body: "7 records synced to regional server",
    read: true,
    createdAt: "2025-04-09T08:00:00Z",
  },
];

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState(INITIAL_PATIENTS);
  const [screenings, setScreenings] = useState(INITIAL_SCREENINGS);
  const [consultations, setConsultations] = useState<Consultation[]>(INITIAL_CONSULTATIONS);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [doctors, setDoctors] = useState<Doctor[]>(INITIAL_DOCTORS);
  const [referrals, setReferrals] = useState<Referral[]>(INITIAL_REFERRALS);
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);

  useEffect(() => {
    AsyncStorage.getItem("visionbridge_v2").then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        if (d.patients?.length) setPatients(d.patients);
        if (d.screenings?.length) setScreenings(d.screenings);
        if (d.consultations?.length) setConsultations(d.consultations);
        if (d.notifications?.length) setNotifications(d.notifications);
        if (d.doctors?.length) setDoctors(d.doctors);
        if (d.referrals?.length) setReferrals(d.referrals);
        if (d.appointments?.length) setAppointments(d.appointments);
        if (d.campaigns?.length) setCampaigns(d.campaigns);
      } catch {}
    });
  }, []);

  const persist = useCallback(
    (p: typeof patients, s: typeof screenings, c: Consultation[], n: Notification[], doc: Doctor[], r: Referral[], a: Appointment[], camp: Campaign[]) => {
      AsyncStorage.setItem("visionbridge_v2", JSON.stringify({ patients: p, screenings: s, consultations: c, notifications: n, doctors: doc, referrals: r, appointments: a, campaigns: camp }));
    },
    []
  );

  const addPatient = useCallback(
    (pat: Omit<typeof patients[0], "id" | "registeredAt">) => {
      const newP = { ...pat, id: generateId(), registeredAt: new Date().toISOString() };
      setPatients((prev) => { const u = [newP, ...prev]; persist(u, screenings, consultations, notifications, doctors, referrals, appointments, campaigns); return u; });
    },
    [screenings, consultations, notifications, doctors, referrals, appointments, campaigns, persist]
  );

  const updatePatient = useCallback(
    (id: string, updates: Partial<typeof patients[0]>) => {
      setPatients((prev) => { const u = prev.map((p) => (p.id === id ? { ...p, ...updates } : p)); persist(u, screenings, consultations, notifications, doctors, referrals, appointments, campaigns); return u; });
    },
    [screenings, consultations, notifications, doctors, referrals, appointments, campaigns, persist]
  );

  const addScreening = useCallback(
    (scr: Omit<typeof screenings[0], "id" | "capturedAt">) => {
      const newS = { ...scr, id: generateId(), capturedAt: new Date().toISOString() };
      setScreenings((prev) => { const u = [newS, ...prev]; persist(patients, u, consultations, notifications, doctors, referrals, appointments, campaigns); return u; });
    },
    [patients, consultations, notifications, doctors, referrals, appointments, campaigns, persist]
  );

  const updateScreening = useCallback(
    (id: string, updates: Partial<typeof screenings[0]>) => {
      setScreenings((prev) => { const u = prev.map((s) => (s.id === id ? { ...s, ...updates } : s)); persist(patients, u, consultations, notifications, doctors, referrals, appointments, campaigns); return u; });
    },
    [patients, consultations, notifications, doctors, referrals, appointments, campaigns, persist]
  );

  const addConsultation = useCallback(
    (con: Omit<Consultation, "id" | "requestedAt">): Consultation => {
      const newC: Consultation = { ...con, id: generateId(), requestedAt: new Date().toISOString() };
      setConsultations((prev) => { const u = [newC, ...prev]; persist(patients, screenings, u, notifications, doctors, referrals, appointments, campaigns); return u; });
      return newC;
    },
    [patients, screenings, notifications, doctors, referrals, appointments, campaigns, persist]
  );

  const updateConsultation = useCallback(
    (id: string, updates: Partial<Consultation>) => {
      setConsultations((prev) => { const u = prev.map((c) => (c.id === id ? { ...c, ...updates } : c)); persist(patients, screenings, u, notifications, doctors, referrals, appointments, campaigns); return u; });
    },
    [patients, screenings, notifications, doctors, referrals, appointments, campaigns, persist]
  );

  const assignRoundRobin = useCallback(
    (id: string): Doctor | null => {
      const available = doctors.filter((d) => d.isAvailable);
      if (!available.length) return null;
      const pick = available.reduce((min, d) => (d.totalAssigned < min.totalAssigned ? d : min), available[0]);
      setDoctors((prev) => { const u = prev.map((d) => (d.id === pick.id ? { ...d, totalAssigned: d.totalAssigned + 1 } : d)); persist(patients, screenings, consultations, notifications, u, referrals, appointments, campaigns); return u; });
      updateConsultation(id, { assignedTo: pick.name, assignedDoctorId: pick.id, assignedAt: new Date().toISOString(), assignmentMethod: "RoundRobin", status: "Assigned" });
      return pick;
    },
    [doctors, patients, screenings, consultations, notifications, referrals, appointments, campaigns, persist, updateConsultation]
  );

  const assignConsultation = useCallback(
    (id: string, doctorId: string, method: "RoundRobin" | "Manual") => {
      const doc = doctors.find((d) => d.id === doctorId);
      if (!doc) return;
      setDoctors((prev) => { const u = prev.map((d) => (d.id === doctorId ? { ...d, totalAssigned: d.totalAssigned + 1 } : d)); persist(patients, screenings, consultations, notifications, u, referrals, appointments, campaigns); return u; });
      updateConsultation(id, { assignedTo: doc.name, assignedDoctorId: doctorId, assignedAt: new Date().toISOString(), assignmentMethod: method, status: "Assigned" });
    },
    [doctors, patients, screenings, consultations, notifications, referrals, appointments, campaigns, persist, updateConsultation]
  );

  const addReferral = useCallback(
    (r: Omit<Referral, "id" | "createdAt">): Referral => {
      const newR: Referral = { ...r, id: generateId(), createdAt: new Date().toISOString() };
      setReferrals((prev) => { const u = [newR, ...prev]; persist(patients, screenings, consultations, notifications, doctors, u, appointments, campaigns); return u; });
      return newR;
    },
    [patients, screenings, consultations, notifications, doctors, appointments, campaigns, persist]
  );

  const updateReferral = useCallback(
    (id: string, updates: Partial<Referral>) => {
      setReferrals((prev) => { const u = prev.map((r) => (r.id === id ? { ...r, ...updates } : r)); persist(patients, screenings, consultations, notifications, doctors, u, appointments, campaigns); return u; });
    },
    [patients, screenings, consultations, notifications, doctors, appointments, campaigns, persist]
  );

  const addAppointment = useCallback(
    (a: Omit<Appointment, "id" | "createdAt">): Appointment => {
      const newA: Appointment = { ...a, id: generateId(), createdAt: new Date().toISOString() };
      setAppointments((prev) => { const u = [newA, ...prev]; persist(patients, screenings, consultations, notifications, doctors, referrals, u, campaigns); return u; });
      return newA;
    },
    [patients, screenings, consultations, notifications, doctors, referrals, campaigns, persist]
  );

  const updateAppointment = useCallback(
    (id: string, updates: Partial<Appointment>) => {
      setAppointments((prev) => { const u = prev.map((a) => (a.id === id ? { ...a, ...updates } : a)); persist(patients, screenings, consultations, notifications, doctors, referrals, u, campaigns); return u; });
    },
    [patients, screenings, consultations, notifications, doctors, referrals, campaigns, persist]
  );

  const addCampaign = useCallback(
    (c: Omit<Campaign, "id" | "createdAt" | "screenedCount" | "referredCount">): Campaign => {
      const newC: Campaign = { ...c, id: generateId(), createdAt: new Date().toISOString(), screenedCount: 0, referredCount: 0 };
      setCampaigns((prev) => { const u = [newC, ...prev]; persist(patients, screenings, consultations, notifications, doctors, referrals, appointments, u); return u; });
      return newC;
    },
    [patients, screenings, consultations, notifications, doctors, referrals, appointments, persist]
  );

  const updateCampaign = useCallback(
    (id: string, updates: Partial<Campaign>) => {
      setCampaigns((prev) => { const u = prev.map((c) => (c.id === id ? { ...c, ...updates } : c)); persist(patients, screenings, consultations, notifications, doctors, referrals, appointments, u); return u; });
    },
    [patients, screenings, consultations, notifications, doctors, referrals, appointments, persist]
  );

  const addNotification = useCallback(
    (n: Omit<Notification, "id" | "createdAt" | "read">) => {
      const newN: Notification = { ...n, id: generateId(), createdAt: new Date().toISOString(), read: false };
      setNotifications((prev) => { const u = [newN, ...prev]; persist(patients, screenings, consultations, u, doctors, referrals, appointments, campaigns); return u; });
    },
    [patients, screenings, consultations, doctors, referrals, appointments, campaigns, persist]
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      setNotifications((prev) => { const u = prev.map((n) => (n.id === id ? { ...n, read: true } : n)); persist(patients, screenings, consultations, u, doctors, referrals, appointments, campaigns); return u; });
    },
    [patients, screenings, consultations, doctors, referrals, appointments, campaigns, persist]
  );

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => { const u = prev.map((n) => ({ ...n, read: true })); persist(patients, screenings, consultations, u, doctors, referrals, appointments, campaigns); return u; });
  }, [patients, screenings, consultations, doctors, referrals, appointments, campaigns, persist]);

  const getPatient = useCallback((id: string) => patients.find((p) => p.id === id), [patients]);
  const getScreeningsForPatient = useCallback((pid: string) => screenings.filter((s) => s.patientId === pid).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)), [screenings]);
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
        currentUser: DEMO_USER,
        patients,
        screenings,
        consultations,
        notifications,
        doctors,
        referrals,
        appointments,
        campaigns,
        addPatient,
        updatePatient,
        addScreening,
        updateScreening,
        addConsultation,
        updateConsultation,
        assignConsultation,
        assignRoundRobin,
        addReferral,
        updateReferral,
        addAppointment,
        updateAppointment,
        addCampaign,
        updateCampaign,
        addNotification,
        markNotificationRead,
        markAllNotificationsRead,
        getPatient,
        getScreeningsForPatient,
        getConsultationForScreening,
        getConsultation,
        getReferral,
        getAppointment,
        getCampaign,
        getCampaignScreenings,
        getCampaignPatients,
        getDoctor,
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
