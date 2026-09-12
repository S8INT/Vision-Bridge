import assert from "node:assert/strict";
import test from "node:test";

import {
  canViewConsultationQueue,
  scopePatientRows,
} from "../src/lib/clinicalAccess.ts";
import navigationModule from "../../visionbridge/lib/navConfig.ts";

const navigation = navigationModule as typeof import("../../visionbridge/lib/navConfig.ts");

type ConsultationRow = {
  id: string;
  patientId: string | null;
};

const patientA = { id: "patient-a", patientId: "patient-a" };
const patientB = { id: "patient-b", patientId: "patient-b" };

test("patient bootstrap consultation records stay scoped to the authenticated patient", () => {
  const bootstrapConsultations: ConsultationRow[] = [
    { id: "consult-a", patientId: patientA.id },
    { id: "consult-b", patientId: patientB.id },
    { id: "consult-without-patient", patientId: null },
  ];

  assert.deepEqual(scopePatientRows(bootstrapConsultations, patientA.id), [
    bootstrapConsultations[0],
  ]);
});

test("my-consultations response cannot include another patient's record", () => {
  const responseItems: ConsultationRow[] = [
    { id: "own-consultation", patientId: patientA.id },
    { id: "other-patient-consultation", patientId: patientB.id },
  ];

  const scopedItems = scopePatientRows(responseItems, patientA.id);

  assert.deepEqual(scopedItems.map((item) => item.id), ["own-consultation"]);
  assert.ok(scopedItems.every((item) => item.patientId === patientA.id));
});

test("only Admin and Doctor can access the consultation queue", () => {
  const allowedRoles = ["Admin", "Doctor"] as const;
  const deniedRoles = ["Technician", "CHW", "Viewer", "Patient"] as const;

  for (const role of allowedRoles) {
    assert.equal(canViewConsultationQueue(role), true, `${role} should access the queue`);
  }
  for (const role of deniedRoles) {
    assert.equal(canViewConsultationQueue(role), false, `${role} should be denied`);
  }
});

test("consultation navigation resolves direct links safely for every role", () => {
  assert.equal(navigation.resolveConsultationRoute("Admin", true), "/(tabs)/consultations");
  assert.equal(navigation.resolveConsultationRoute("Doctor", true), "/(tabs)/consultations");
  assert.equal(navigation.resolveConsultationRoute("Technician", true), "/(tabs)/index");
  assert.equal(navigation.resolveConsultationRoute("CHW", true), "/(tabs)/index");
  assert.equal(navigation.resolveConsultationRoute("Viewer", true), "/(tabs)/index");
  assert.equal(navigation.resolveConsultationRoute("Patient", true), "/(tabs)/my-consultations");

  // A staff role without the list capability must not reach the queue even
  // when a stale/deep-linked route supplies a truthy role.
  assert.equal(navigation.resolveConsultationRoute("Doctor", false), "/(tabs)/index");
});

test("navigation catalog keeps consultation destinations role-scoped", () => {
  const patientPermissions = { consultation: { list: true } };
  const staffPermissions = { consultation: { list: true } };

  const patientRoutes = navigation.resolveNavigation("Patient", patientPermissions).primary.map((item) => item.route);
  const staffRoutes = navigation.resolveNavigation("Doctor", staffPermissions).primary.map((item) => item.route);

  assert.ok(patientRoutes.includes("my-consultations"));
  assert.ok(!patientRoutes.includes("consultations"));
  assert.ok(staffRoutes.includes("consultations"));
  assert.ok(!staffRoutes.includes("my-consultations"));
});