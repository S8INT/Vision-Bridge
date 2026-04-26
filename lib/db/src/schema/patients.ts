import { pgTable, text, timestamp, uuid, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenantsTable, usersTable } from "./auth";

export type PatientSex = "M" | "F" | "Other";

export const patientsTable = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  userId: uuid("user_id").references(() => usersTable.id),
  patientId: text("patient_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth"),
  sex: text("sex").$type<PatientSex>(),
  phone: text("phone"),
  village: text("village"),
  district: text("district"),
  medicalHistory: jsonb("medical_history").$type<string[]>().notNull().default([]),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastVisit: timestamp("last_visit"),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  id: true,
  registeredAt: true,
  updatedAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
