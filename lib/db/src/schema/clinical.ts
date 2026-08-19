import {
  pgTable, text, timestamp, uuid, jsonb, boolean, integer, date,
} from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./auth";
import { patientsTable } from "./patients";

// ── Doctors directory (separate from auth users) ────────────────────────────
export const doctorsTable = pgTable("doctors", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  userId: uuid("user_id").references(() => usersTable.id),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  clinic: text("clinic").notNull(),
  district: text("district").notNull(),
  phone: text("phone"),
  isAvailable: boolean("is_available").notNull().default(true),
  totalAssigned: integer("total_assigned").notNull().default(0),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  maxConcurrentCases: integer("max_concurrent_cases").notNull().default(20),
  blockedUntil: timestamp("blocked_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Doctor = typeof doctorsTable.$inferSelect;

// ── Campaigns (declared before screenings to allow self-FK) ─────────────────
export const campaignsTable = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  type: text("type").$type<"School" | "DiabetesClinic" | "Community" | "MobileUnit">().notNull(),
  status: text("status").$type<"Planned" | "Active" | "Completed" | "Cancelled">().notNull().default("Planned"),
  location: text("location").notNull(),
  district: text("district").notNull(),
  targetPopulation: text("target_population").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  targetCount: integer("target_count").notNull().default(0),
  screenedCount: integer("screened_count").notNull().default(0),
  referredCount: integer("referred_count").notNull().default(0),
  notes: text("notes"),
});

export type Campaign = typeof campaignsTable.$inferSelect;

// ── Screenings ──────────────────────────────────────────────────────────────
export const screeningsTable = pgTable("screenings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  patientId: uuid("patient_id").notNull().references(() => patientsTable.id),
  campaignId: uuid("campaign_id").references(() => campaignsTable.id),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  capturedBy: text("captured_by").notNull(),
  imageUri: text("image_uri"),
  imageId: text("image_id"),
  imageQualityScore: integer("image_quality_score").notNull().default(0),
  aiRiskLevel: text("ai_risk_level").$type<"Normal" | "Mild" | "Moderate" | "Severe" | "Urgent">().notNull(),
  aiConfidence: integer("ai_confidence").notNull().default(0),
  aiModelVersion: text("ai_model_version"),
  aiFindings: jsonb("ai_findings").$type<string[]>().notNull().default([]),
  status: text("status").$type<"Pending" | "Screened" | "Reviewed" | "Referred">().notNull().default("Pending"),
  notes: text("notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
});

export type Screening = typeof screeningsTable.$inferSelect;

// ── Consultations ───────────────────────────────────────────────────────────
export const consultationsTable = pgTable("consultations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  screeningId: uuid("screening_id").references(() => screeningsTable.id),
  patientId: uuid("patient_id").notNull().references(() => patientsTable.id),
  campaignId: uuid("campaign_id").references(() => campaignsTable.id),
  requestedBy: text("requested_by").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  assignedTo: text("assigned_to"),
  assignedDoctorId: uuid("assigned_doctor_id").references(() => doctorsTable.id),
  assignedAt: timestamp("assigned_at"),
  assignmentMethod: text("assignment_method").$type<"Intelligent" | "RoundRobin" | "Manual">(),
  status: text("status").$type<"Pending" | "Assigned" | "InReview" | "Reviewed" | "Referred" | "Completed" | "Cancelled">().notNull().default("Pending"),
  priority: text("priority").$type<"Routine" | "High" | "Urgent" | "Emergency">().notNull().default("Routine"),
  consultationType: text("consultation_type").$type<"NEW_PATIENT" | "SPECIALIST_REFERRAL" | "FOLLOW_UP" | "SECOND_OPINION" | "REMOTE_IMAGE_REVIEW" | "EMERGENCY">().notNull().default("NEW_PATIENT"),
  specialty: text("specialty"),
  preferredDoctorId: uuid("preferred_doctor_id").references(() => doctorsTable.id),
  routingStatus: text("routing_status").$type<"ROUTING" | "ASSIGNED" | "SPECIALTY_QUEUE" | "ESCALATED">().notNull().default("ROUTING"),
  routingReason: text("routing_reason"),
  routingScore: integer("routing_score"),
  acknowledgementDueAt: timestamp("acknowledgement_due_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  clinicalNotes: text("clinical_notes"),
  diagnosisOverride: text("diagnosis_override"),
  treatmentPlan: text("treatment_plan"),
  specialistResponse: text("specialist_response"),
  respondedAt: timestamp("responded_at"),
  diagnosis: text("diagnosis"),
  treatment: text("treatment"),
  referralId: uuid("referral_id"),
  appointmentId: uuid("appointment_id"),
  followUpDate: timestamp("follow_up_date"),
  careCoordinatorNotes: text("care_coordinator_notes"),
});

export type Consultation = typeof consultationsTable.$inferSelect;

// Explainable, persistent output from the routing engine. Candidate details are
// retained for governance and manual review without exposing internal scores in
// the patient experience.
export const routingDecisionsTable = pgTable("routing_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  consultationId: uuid("consultation_id").notNull().references(() => consultationsTable.id),
  recommendedSpecialty: text("recommended_specialty").notNull(),
  eligibleCandidates: jsonb("eligible_candidates").$type<Array<{
    doctorId: string;
    name: string;
    score: number;
    reasons: string[];
  }>>().notNull().default([]),
  selectedClinicianId: uuid("selected_clinician_id").references(() => doctorsTable.id),
  routingScore: integer("routing_score"),
  rulesVersion: text("rules_version").notNull().default("routing-v1"),
  routingReason: text("routing_reason").notNull(),
  fallbackQueue: text("fallback_queue"),
  override: boolean("override").notNull().default(false),
  overrideReason: text("override_reason"),
  overriddenBy: uuid("overridden_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RoutingDecision = typeof routingDecisionsTable.$inferSelect;

// ── Referrals ───────────────────────────────────────────────────────────────
export const referralsTable = pgTable("referrals", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  consultationId: uuid("consultation_id").references(() => consultationsTable.id),
  patientId: uuid("patient_id").notNull().references(() => patientsTable.id),
  type: text("type").$type<"Internal" | "External">().notNull(),
  status: text("status").$type<"Pending" | "Accepted" | "InTransit" | "Arrived" | "Completed" | "Declined">().notNull().default("Pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  targetFacility: text("target_facility").notNull(),
  targetDistrict: text("target_district").notNull(),
  targetDoctor: text("target_doctor"),
  urgency: text("urgency").$type<"Routine" | "Urgent" | "Emergency">().notNull().default("Routine"),
  reason: text("reason").notNull(),
  clinicalSummary: text("clinical_summary").notNull(),
  transportArranged: boolean("transport_arranged").notNull().default(false),
  escortRequired: boolean("escort_required").notNull().default(false),
  referralNotes: text("referral_notes"),
  acceptedAt: timestamp("accepted_at"),
  arrivedAt: timestamp("arrived_at"),
  completedAt: timestamp("completed_at"),
  declineReason: text("decline_reason"),
});

export type Referral = typeof referralsTable.$inferSelect;

// ── Appointments ────────────────────────────────────────────────────────────
export const appointmentsTable = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  patientId: uuid("patient_id").notNull().references(() => patientsTable.id),
  consultationId: uuid("consultation_id").references(() => consultationsTable.id),
  referralId: uuid("referral_id").references(() => referralsTable.id),
  type: text("type").$type<"Optical" | "Surgery" | "Laser" | "FollowUp" | "InjectionTherapy">().notNull(),
  status: text("status").$type<"Requested" | "Confirmed" | "Completed" | "Cancelled" | "NoShow">().notNull().default("Requested"),
  facility: text("facility").notNull(),
  doctor: text("doctor"),
  scheduledDate: date("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  notes: text("notes"),
  costUgx: integer("cost_ugx"),
  coveredByInsurance: boolean("covered_by_insurance").notNull().default(false),
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
});

export type Appointment = typeof appointmentsTable.$inferSelect;

// ── Notifications ───────────────────────────────────────────────────────────
export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  userId: uuid("user_id").references(() => usersTable.id),
  type: text("type").$type<
    | "ConsultationUpdate" | "ScreeningReviewed" | "PatientReferred"
    | "AppointmentConfirmed" | "ReferralUpdate" | "CampaignAlert" | "SystemAlert"
  >().notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  patientId: uuid("patient_id").references(() => patientsTable.id),
  screeningId: uuid("screening_id").references(() => screeningsTable.id),
  consultationId: uuid("consultation_id").references(() => consultationsTable.id),
  referralId: uuid("referral_id").references(() => referralsTable.id),
  appointmentId: uuid("appointment_id").references(() => appointmentsTable.id),
  campaignId: uuid("campaign_id").references(() => campaignsTable.id),
});

export type Notification = typeof notificationsTable.$inferSelect;
