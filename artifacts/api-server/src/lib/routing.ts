import type { Doctor, Patient, Screening, Consultation } from "@workspace/db";

export const ROUTING_WEIGHTS = {
  specialty: 0.30,
  availability: 0.25,
  continuity: 0.20,
  workload: 0.15,
  geography: 0.05,
  preference: 0.05,
} as const;

export type RoutingPriority = "Routine" | "High" | "Urgent" | "Emergency";
export type RoutingType = "NEW_PATIENT" | "SPECIALIST_REFERRAL" | "FOLLOW_UP" | "SECOND_OPINION" | "REMOTE_IMAGE_REVIEW" | "EMERGENCY";

export interface RoutingCandidate {
  doctor: Doctor;
  score: number;
  reasons: string[];
}

export interface RoutingResult {
  specialty: string;
  priority: RoutingPriority;
  candidates: RoutingCandidate[];
  selected: RoutingCandidate | null;
  fallbackQueue: string | null;
  reason: string;
}

function normalise(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

export function determineSpecialty(
  consultation: Pick<Consultation, "consultationType" | "clinicalNotes" | "priority">,
  patient: Patient,
  screening?: Screening,
): string {
  const text = [
    consultation.clinicalNotes,
    ...(patient.medicalHistory ?? []),
    ...(screening?.aiFindings ?? []),
    screening?.aiRiskLevel,
  ].map(normalise).join(" ");
  if (text.includes("glaucoma") || text.includes("optic disc") || text.includes("cupping")) return "Glaucoma";
  if (text.includes("diabetic") || text.includes("retin") || text.includes("microaneurysm") || text.includes("exudate")) return "Retina";
  if (text.includes("cataract") || text.includes("lens")) return "Cataract / Anterior Segment";
  if (text.includes("child") || text.includes("pediatric")) return "Pediatric Ophthalmology";
  if (text.includes("cornea") || text.includes("corneal")) return "Cornea";
  return "General Ophthalmology";
}

function specialtyScore(doctor: Doctor, specialty: string) {
  const haystack = [doctor.specialty, ...(doctor.capabilities ?? [])].map(normalise).join(" ");
  if (haystack.includes(normalise(specialty))) return 1;
  if (specialty === "General Ophthalmology" && haystack.includes("ophthalm")) return 0.9;
  if (specialty === "Retina" && haystack.includes("ophthalm")) return 0.55;
  return 0;
}

function workloadScore(doctor: Doctor, openCases: number) {
  const limit = Math.max(1, doctor.maxConcurrentCases ?? 20);
  return Math.max(0, Math.min(1, 1 - (openCases / limit)));
}

export function routeConsultation(args: {
  consultation: Pick<Consultation, "consultationType" | "clinicalNotes" | "priority" | "preferredDoctorId">;
  patient: Patient;
  screening?: Screening;
  doctors: Doctor[];
  openCasesByDoctor: Map<string, number>;
  continuityDoctorId?: string;
}): RoutingResult {
  const priority = (args.consultation.priority ?? "Routine") as RoutingPriority;
  const specialty = determineSpecialty(args.consultation, args.patient, args.screening);
  const now = Date.now();
  const preferredDoctor = args.consultation.preferredDoctorId
    ? args.doctors.find((doctor) => doctor.id === args.consultation.preferredDoctorId)
    : undefined;

  const canAcceptCase = (doctor: Doctor) => {
    const open = args.openCasesByDoctor.get(doctor.id) ?? 0;
    return doctor.isAvailable
      && (!doctor.blockedUntil || new Date(doctor.blockedUntil).getTime() <= now)
      && open < (doctor.maxConcurrentCases ?? 20);
  };

  const eligible = args.doctors.filter((doctor) => {
    return canAcceptCase(doctor)
      && specialtyScore(doctor, specialty) > 0;
  });

  const scoredCandidates = eligible.map((doctor) => {
    const match = specialtyScore(doctor, specialty);
    const available = priority === "Emergency" ? 1 : doctor.isAvailable ? 1 : 0;
    const continuity = args.continuityDoctorId === doctor.id ? 1 : 0;
    const workload = workloadScore(doctor, args.openCasesByDoctor.get(doctor.id) ?? 0);
    const geography = normalise(doctor.district) === normalise(args.patient.district) ? 1 : 0.5;
    const preference = args.consultation.preferredDoctorId === doctor.id ? 1 : 0;
    const score = Math.round(100 * (
      match * ROUTING_WEIGHTS.specialty
      + available * ROUTING_WEIGHTS.availability
      + continuity * ROUTING_WEIGHTS.continuity
      + workload * ROUTING_WEIGHTS.workload
      + geography * ROUTING_WEIGHTS.geography
      + preference * ROUTING_WEIGHTS.preference
    ));
    const reasons = [
      match >= 0.9 ? `${specialty} specialty match` : "General ophthalmology capability",
      ...(continuity ? ["Existing patient relationship"] : []),
      ...(available ? ["Currently available"] : []),
      ...(workload >= 0.7 ? ["Lower active workload"] : []),
      ...(preference ? ["Patient preference considered"] : []),
    ];
    return { doctor, score, reasons };
  });

  // A patient-selected specialist is not a scoring preference. If that
  // doctor is currently available and has capacity, assign directly even
  // when another doctor has a stronger specialty/workload score.
  const preferredCandidate = preferredDoctor && canAcceptCase(preferredDoctor)
    ? {
        doctor: preferredDoctor,
        score: 100,
        reasons: ["Patient-selected ophthalmologist", "Currently available"],
      }
    : null;

  const candidates = [
    ...(preferredCandidate ? [preferredCandidate] : []),
    ...scoredCandidates.filter((candidate) => candidate.doctor.id !== preferredDoctor?.id),
  ].sort((a, b) => b.score - a.score);

  // Preserve the old fairness behavior only for genuinely equivalent leaders.
  const topScore = candidates[0]?.score;
  const tied = topScore === undefined ? [] : candidates.filter((candidate) => candidate.score === topScore);
  const selected = preferredCandidate
    ?? (args.consultation.preferredDoctorId
      ? null
      : tied.length
    ? tied[Math.floor(Math.random() * tied.length)]
    : null);
  const reason = selected
    ? selected.reasons.join(" · ")
    : args.consultation.preferredDoctorId
      ? preferredDoctor
        ? `The selected ophthalmologist is not currently available; the request is waiting for that specialist`
        : "The selected ophthalmologist could not be found in this care network; the request is waiting for manual assignment"
      : `No eligible ${specialty} specialist is currently available`;
  return { specialty, priority, candidates, selected, fallbackQueue: selected ? null : specialty, reason };
}