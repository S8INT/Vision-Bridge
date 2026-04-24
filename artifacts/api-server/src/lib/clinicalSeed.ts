/**
 * Idempotent seed of clinical demo data for the demo tenant.
 * Runs once on API startup. Skips entirely if any patient/doctor exists.
 *
 * Mirrors the legacy mock data so Sarah Nakato (Technician, Mbarara RRH)
 * sees realistic records on first login.
 */

import { sql } from "drizzle-orm";
import {
  db, doctorsTable, patientsTable, screeningsTable, consultationsTable,
  referralsTable, appointmentsTable, campaignsTable, notificationsTable,
} from "@workspace/db";

export async function seedClinicalDemoData(tenantId: string): Promise<void> {
  if (!db) return;

  // Idempotency check: skip if any doctor already exists for this tenant
  const existing = await db.execute(
    sql`select count(*)::int as n from doctors where tenant_id = ${tenantId}`,
  );
  // @ts-expect-error drizzle node-pg returns rows on .rows
  const n = Number(existing.rows?.[0]?.n ?? 0);
  if (n > 0) {
    console.log("[clinicalSeed] demo tenant already has clinical data — skip");
    return;
  }

  // ── Doctors ────────────────────────────────────────────────────────────
  const [docOkello, docPatricia, docEric, docGrace] = await db.insert(doctorsTable).values([
    { tenantId, name: "Dr. Okello James",       specialty: "Ophthalmologist",   clinic: "Mbarara RRH Eye Unit",         district: "Mbarara", phone: "+256701000001", isAvailable: true,  totalAssigned: 4 },
    { tenantId, name: "Dr. Nkurunziza Patricia", specialty: "Retinal Specialist", clinic: "Mbarara RRH Eye Unit",         district: "Mbarara", phone: "+256701000002", isAvailable: true,  totalAssigned: 3 },
    { tenantId, name: "Dr. Tumwebaze Eric",     specialty: "Glaucoma Specialist", clinic: "Kampala International Eye Institute", district: "Kampala", phone: "+256701000003", isAvailable: false, totalAssigned: 7 },
    { tenantId, name: "Dr. Auma Grace",         specialty: "Ophthalmologist",   clinic: "Kabale Regional Referral",     district: "Kabale",  phone: "+256701000004", isAvailable: true,  totalAssigned: 2 },
  ]).returning();

  // ── Campaigns ──────────────────────────────────────────────────────────
  const [campDiabetes, campSchool] = await db.insert(campaignsTable).values([
    {
      tenantId, name: "Bwizibwera Diabetes Eye Screening", type: "DiabetesClinic", status: "Active",
      location: "Bwizibwera Health Centre IV", district: "Mbarara",
      targetPopulation: "Registered diabetes patients at Bwizibwera HC IV",
      startDate: "2026-04-10", endDate: "2026-04-12",
      createdBy: "Sarah Nakato",
      targetCount: 50, screenedCount: 3, referredCount: 1,
      notes: "Partnered with Uganda Diabetes Association. Equipment transport arranged.",
    },
    {
      tenantId, name: "St. Kizito Primary School Vision Screening", type: "School", status: "Planned",
      location: "St. Kizito Primary School, Nyamitanga", district: "Mbarara",
      targetPopulation: "P4-P7 students (ages 9-14)",
      startDate: "2026-04-22",
      createdBy: "Sarah Nakato",
      targetCount: 200, screenedCount: 0, referredCount: 0,
      notes: "Headteacher confirmed. Consent forms distributed to parents.",
    },
  ]).returning();

  // ── Patients ───────────────────────────────────────────────────────────
  const patientsToInsert = [
    { firstName: "Grace",    lastName: "Atuhaire",    dateOfBirth: "1968-03-15", sex: "F" as const, phone: "+256701234567", village: "Katete",     district: "Mbarara", medicalHistory: ["Diabetes Type 2", "Hypertension"], lastVisit: new Date("2026-04-08T10:00:00Z") },
    { firstName: "James",    lastName: "Mugisha",     dateOfBirth: "1955-07-22", sex: "M" as const, phone: "+256702345678", village: "Rwizi",      district: "Mbarara", medicalHistory: ["Glaucoma (family history)"],     lastVisit: new Date("2026-04-07T14:30:00Z") },
    { firstName: "Esther",   lastName: "Tumukunde",   dateOfBirth: "1972-11-05", sex: "F" as const, phone: "+256703456789", village: "Bubaare",    district: "Mbarara", medicalHistory: ["Diabetes Type 1"],                lastVisit: new Date("2026-04-09T09:00:00Z") },
    { firstName: "Robert",   lastName: "Kasaija",     dateOfBirth: "1948-09-18", sex: "M" as const, phone: "+256704567890", village: "Nyamitanga", district: "Mbarara", medicalHistory: ["Hypertension", "Cataracts"],      lastVisit: new Date("2026-04-06T11:00:00Z") },
    { firstName: "Florence", lastName: "Namazzi",     dateOfBirth: "1983-06-30", sex: "F" as const, phone: "+256705678901", village: "Kakiika",    district: "Mbarara", medicalHistory: ["Diabetes Type 2"],                lastVisit: new Date("2026-04-10T16:00:00Z") },
    { firstName: "Patrick",  lastName: "Byarugaba",   dateOfBirth: "1960-04-12", sex: "M" as const, phone: "+256706789012", village: "Bwizibwera", district: "Mbarara", medicalHistory: ["Diabetes Type 2"],                lastVisit: new Date("2026-04-10T09:30:00Z") },
    { firstName: "Agnes",    lastName: "Nanteza",     dateOfBirth: "1975-08-20", sex: "F" as const, phone: "+256707890123", village: "Bwizibwera", district: "Mbarara", medicalHistory: ["Diabetes Type 2", "Hypertension"], lastVisit: new Date("2026-04-10T09:45:00Z") },
  ];
  const insertedPatients = await db.insert(patientsTable).values(
    patientsToInsert.map((p, i) => ({
      tenantId,
      patientId: `MBR-2026-${String(841 + i).padStart(4, "0")}`,
      ...p,
    })),
  ).returning();
  const [pGrace, pJames, pEsther, pRobert, pFlorence, pPatrick, pAgnes] = insertedPatients;

  // ── Screenings ─────────────────────────────────────────────────────────
  const insertedScreenings = await db.insert(screeningsTable).values([
    { tenantId, patientId: pGrace.id,    capturedAt: new Date("2026-04-08T10:05:00Z"), capturedBy: "Sarah Nakato", imageQualityScore: 92, aiRiskLevel: "Moderate", aiConfidence: 87, aiFindings: ["Microaneurysms", "Hard exudates", "Mild NPDR signs"], status: "Reviewed", notes: "Patient reports blurred vision in right eye for 3 weeks", reviewedBy: "Dr. Okello James", reviewedAt: new Date("2026-04-08T15:00:00Z") },
    { tenantId, patientId: pJames.id,    capturedAt: new Date("2026-04-07T14:35:00Z"), capturedBy: "Sarah Nakato", imageQualityScore: 88, aiRiskLevel: "Urgent",   aiConfidence: 94, aiFindings: ["Optic disc cupping", "Cup-to-disc ratio elevated", "Possible glaucoma"], status: "Referred", notes: "IOP measured at 26mmHg", reviewedBy: "Dr. Okello James", reviewedAt: new Date("2026-04-07T18:00:00Z") },
    { tenantId, patientId: pEsther.id,   capturedAt: new Date("2026-04-09T09:10:00Z"), capturedBy: "Sarah Nakato", imageQualityScore: 95, aiRiskLevel: "Severe",   aiConfidence: 91, aiFindings: ["Neovascularization", "Vitreous haemorrhage risk", "PDR suspected"], status: "Referred", notes: "Urgent referral needed" },
    { tenantId, patientId: pRobert.id,   capturedAt: new Date("2026-04-06T11:05:00Z"), capturedBy: "Sarah Nakato", imageQualityScore: 78, aiRiskLevel: "Normal",   aiConfidence: 82, aiFindings: ["No significant pathology detected"], status: "Screened", notes: "Lens opacity noted, likely cataract — non-urgent" },
    { tenantId, patientId: pFlorence.id, campaignId: campDiabetes.id, capturedAt: new Date("2026-04-10T16:05:00Z"), capturedBy: "Sarah Nakato", imageQualityScore: 91, aiRiskLevel: "Mild",     aiConfidence: 85, aiFindings: ["Mild dot hemorrhages", "Early NPDR"], status: "Pending" },
    { tenantId, patientId: pPatrick.id,  campaignId: campDiabetes.id, capturedAt: new Date("2026-04-10T09:35:00Z"), capturedBy: "Sarah Nakato", imageQualityScore: 84, aiRiskLevel: "Moderate", aiConfidence: 88, aiFindings: ["Microaneurysms", "Dot-blot haemorrhages", "Moderate NPDR"], status: "Pending" },
    { tenantId, patientId: pAgnes.id,    campaignId: campDiabetes.id, capturedAt: new Date("2026-04-10T09:50:00Z"), capturedBy: "Sarah Nakato", imageQualityScore: 89, aiRiskLevel: "Normal",   aiConfidence: 90, aiFindings: ["No significant pathology detected"], status: "Reviewed" },
  ]).returning();
  const [sGrace, sJames, sEsther] = insertedScreenings;

  // ── Consultations ──────────────────────────────────────────────────────
  const [cGrace, cJames, cEsther] = await db.insert(consultationsTable).values([
    {
      tenantId, screeningId: sGrace.id, patientId: pGrace.id,
      requestedBy: "Sarah Nakato", requestedAt: new Date("2026-04-08T10:30:00Z"),
      assignedTo: docOkello.name, assignedDoctorId: docOkello.id, assignedAt: new Date("2026-04-08T11:00:00Z"),
      assignmentMethod: "RoundRobin", status: "Completed", priority: "Routine",
      clinicalNotes: "Moderate non-proliferative diabetic retinopathy detected. Microaneurysms and hard exudates in superior arcade of right eye.",
      diagnosis: "Moderate Non-Proliferative Diabetic Retinopathy (NPDR), right eye",
      treatment: "Tight glycaemic control. Schedule follow-up in 3 months.",
      treatmentPlan: "1. Continue metformin 1g BID. 2. Monitor blood sugar 2x daily. 3. Reduce dietary sugar. 4. Return in 3 months for repeat fundus exam.",
      specialistResponse: "Reassuring findings — no immediate sight-threatening disease. Continue diabetes medications and return in 3 months.",
      respondedAt: new Date("2026-04-08T15:00:00Z"),
      followUpDate: new Date("2026-07-08T09:30:00Z"),
    },
    {
      tenantId, screeningId: sJames.id, patientId: pJames.id,
      requestedBy: "Sarah Nakato", requestedAt: new Date("2026-04-07T14:50:00Z"),
      assignedTo: docPatricia.name, assignedDoctorId: docPatricia.id, assignedAt: new Date("2026-04-07T15:00:00Z"),
      assignmentMethod: "RoundRobin", status: "Completed", priority: "Urgent",
      clinicalNotes: "Patient has family history of glaucoma. IOP 26mmHg bilaterally. Optic disc suspicious.",
      diagnosisOverride: "Primary Open Angle Glaucoma (suspected)",
      treatmentPlan: "Brimonidine tartrate 0.2% BID. Follow up in 2 weeks. Urgent referral Kampala.",
      specialistResponse: "Recommend immediate referral to Kampala ophthalmology. Start brimonidine drops.",
      respondedAt: new Date("2026-04-07T20:00:00Z"),
      diagnosis: "Suspected Primary Open Angle Glaucoma",
      treatment: "Brimonidine tartrate 0.2% BID, urgent referral",
      followUpDate: new Date("2026-04-21T09:00:00Z"),
      careCoordinatorNotes: "Transport arranged via clinic vehicle. Family informed.",
    },
    {
      tenantId, screeningId: sEsther.id, patientId: pEsther.id,
      requestedBy: "Sarah Nakato", requestedAt: new Date("2026-04-09T09:20:00Z"),
      assignedTo: docOkello.name, assignedDoctorId: docOkello.id, assignedAt: new Date("2026-04-09T09:25:00Z"),
      assignmentMethod: "RoundRobin", status: "InReview", priority: "Emergency",
      clinicalNotes: "Proliferative diabetic retinopathy suspected. HbA1c 11.2%. Urgent laser treatment may be needed.",
    },
  ]).returning();

  // ── Referrals ──────────────────────────────────────────────────────────
  const [refJames] = await db.insert(referralsTable).values([
    {
      tenantId, consultationId: cJames.id, patientId: pJames.id,
      type: "Internal", status: "Accepted",
      createdAt: new Date("2026-04-07T20:30:00Z"), createdBy: "Sarah Nakato",
      targetFacility: "Kampala International Eye Institute", targetDistrict: "Kampala",
      targetDoctor: docEric.name,
      urgency: "Urgent",
      reason: "Suspected Primary Open Angle Glaucoma requiring specialist assessment and tonometry workup",
      clinicalSummary: "70M, family history glaucoma, IOP 26mmHg bilateral, elevated C/D ratio.",
      transportArranged: true, escortRequired: false,
      referralNotes: "Patient to bring previous IOP records. Clinic vehicle departs 6am Friday.",
      acceptedAt: new Date("2026-04-08T09:00:00Z"),
    },
  ]).returning();

  // ── Appointments ───────────────────────────────────────────────────────
  const [apptJames, apptGrace] = await db.insert(appointmentsTable).values([
    {
      tenantId, patientId: pJames.id, consultationId: cJames.id, referralId: refJames.id,
      type: "FollowUp", status: "Confirmed",
      facility: "Kampala International Eye Institute", doctor: docEric.name,
      scheduledDate: "2026-04-28", scheduledTime: "10:00",
      createdAt: new Date("2026-04-08T09:30:00Z"),
      notes: "Bring previous IOP readings and referral letter",
      costUgx: 50000, coveredByInsurance: false,
      confirmedAt: new Date("2026-04-08T10:00:00Z"),
    },
    {
      tenantId, patientId: pGrace.id,
      type: "FollowUp", status: "Confirmed",
      facility: "Mbarara RRH Eye Unit", doctor: docOkello.name,
      scheduledDate: "2026-07-08", scheduledTime: "09:30",
      createdAt: new Date("2026-04-12T08:00:00Z"),
      notes: "Follow-up for diabetic retinopathy. Bring blood sugar log.",
      costUgx: 25000, coveredByInsurance: true,
      confirmedAt: new Date("2026-04-12T09:00:00Z"),
    },
    {
      tenantId, patientId: pGrace.id,
      type: "Optical", status: "Requested",
      facility: "Mbarara RRH Eye Unit", doctor: docPatricia.name,
      scheduledDate: "2026-05-10", scheduledTime: "14:00",
      createdAt: new Date("2026-04-18T10:00:00Z"),
      notes: "Refraction and reading-glasses fitting.",
      costUgx: 25000, coveredByInsurance: true,
    },
  ]).returning();

  // Backfill consultation linkage to referral/appointment ids
  await db.execute(sql`
    update consultations set referral_id = ${refJames.id}, appointment_id = ${apptJames.id}
    where id = ${cJames.id}
  `);
  await db.execute(sql`
    update consultations set appointment_id = ${apptGrace.id}
    where id = ${cGrace.id}
  `);

  // ── Notifications (broadcast within tenant) ────────────────────────────
  await db.insert(notificationsTable).values([
    { tenantId, type: "ConsultationUpdate",  title: "Consultation Response Received", body: "Dr. Nkurunziza responded to James Mugisha's glaucoma case",       read: false, createdAt: new Date("2026-04-07T20:05:00Z"), patientId: pJames.id,  consultationId: cJames.id },
    { tenantId, type: "ScreeningReviewed",   title: "Screening Reviewed",             body: "Grace Atuhaire's retinal screening has been reviewed",            read: false, createdAt: new Date("2026-04-08T15:05:00Z"), patientId: pGrace.id,  screeningId: sGrace.id },
    { tenantId, type: "PatientReferred",     title: "Emergency Consultation Open",    body: "Esther Tumukunde requires emergency specialist review — PDR suspected", read: false, createdAt: new Date("2026-04-09T09:25:00Z"), patientId: pEsther.id, screeningId: sEsther.id },
    { tenantId, type: "AppointmentConfirmed",title: "Appointment Confirmed",          body: "James Mugisha's appointment at KIEI confirmed for 28 Apr 10:00",  read: false, createdAt: new Date("2026-04-08T10:05:00Z"), patientId: pJames.id,  appointmentId: apptJames.id },
    { tenantId, type: "ReferralUpdate",      title: "Referral Accepted",              body: "Kampala International Eye Institute accepted James Mugisha's referral", read: true,  createdAt: new Date("2026-04-08T09:05:00Z"), patientId: pJames.id,  referralId: refJames.id },
    { tenantId, type: "CampaignAlert",       title: "Campaign Progress",              body: "Bwizibwera Diabetes Campaign: 3/50 patients screened today",      read: true,  createdAt: new Date("2026-04-10T17:00:00Z"), campaignId: campDiabetes.id },
    { tenantId, type: "SystemAlert",         title: "Sync Complete",                  body: "7 records synced to regional server",                            read: true,  createdAt: new Date("2026-04-09T08:00:00Z") },
  ]);

  console.log(`[clinicalSeed] seeded ${insertedPatients.length} patients, ${insertedScreenings.length} screenings, 3 consultations, 1 referral, 3 appointments, 2 campaigns, 7 notifications for demo tenant`);
}
