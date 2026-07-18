/**
 * Per-role bottom navigation structure.
 *
 * TAB_VISIBILITY (RBAC — which screens a role may access) stays the single
 * source of truth for access. NAV decides *placement*: which permitted
 * screens appear as bottom tabs (max 5 incl. "More") and which move into
 * the More hub. Every permitted screen is either a tab or a More row.
 */
import type { UserRole } from "@/context/AuthContext";

// Based on 5.3 RBAC Permission Matrix (VisionBridge UG v1.0) + Patient flow
export const TAB_VISIBILITY: Record<UserRole, Record<string, boolean>> = {
  Admin:      { index: true, patients: true,  consultations: true,  analytics: true,  campaigns: true,  notifications: true,  visits: false, reports: false, education: false, "my-consultations": false, queue: true  },
  Doctor:     { index: true, patients: true,  consultations: true,  analytics: true,  campaigns: false, notifications: true,  visits: false, reports: false, education: false, "my-consultations": false, queue: true  },
  Technician: { index: true, patients: true,  consultations: false, analytics: false, campaigns: true,  notifications: true,  visits: false, reports: false, education: false, "my-consultations": false, queue: true  },
  CHW:        { index: true, patients: true,  consultations: false, analytics: false, campaigns: true,  notifications: false, visits: false, reports: false, education: false, "my-consultations": false, queue: true  },
  Viewer:     { index: true, patients: false, consultations: false, analytics: true,  campaigns: false, notifications: false, visits: false, reports: false, education: false, "my-consultations": false, queue: false },
  Patient:    { index: true, patients: false, consultations: false, analytics: false, campaigns: false, notifications: true,  visits: true,  reports: true,  education: true,  "my-consultations": true,  queue: false },
};

export interface ScreenMeta {
  title: string;
  description: string;
  sf: string;
  sfSelected: string;
  feather: string;
  /** Section header used when the screen appears in the More hub. */
  section: string;
}

export const SCREEN_META: Record<string, ScreenMeta> = {
  index:              { title: "Dashboard", description: "Overview and quick actions",              sf: "house",                 sfSelected: "house.fill",                 feather: "home",           section: "Workspace" },
  patients:           { title: "Patients",  description: "Register and manage patients",           sf: "person.2",              sfSelected: "person.2.fill",              feather: "users",          section: "Workspace" },
  visits:             { title: "Visits",    description: "Your appointments and visits",           sf: "calendar",              sfSelected: "calendar",                   feather: "calendar",       section: "My care" },
  consultations:      { title: "Consults",  description: "Teleconsultation requests and reviews",  sf: "message.circle",        sfSelected: "message.circle.fill",        feather: "message-circle", section: "Workspace" },
  "my-consultations": { title: "Consults",  description: "Your consultation history",              sf: "message.circle",        sfSelected: "message.circle.fill",        feather: "message-circle", section: "My care" },
  reports:            { title: "Reports",   description: "Your screening results and reports",     sf: "doc.text",              sfSelected: "doc.text.fill",              feather: "file-text",      section: "My care" },
  education:          { title: "Learn",     description: "Eye health education materials",         sf: "book",                  sfSelected: "book.fill",                  feather: "book-open",      section: "Resources" },
  campaigns:          { title: "Campaigns", description: "Outreach and screening campaigns",       sf: "map",                   sfSelected: "map.fill",                   feather: "map-pin",        section: "Outreach" },
  analytics:          { title: "Analytics", description: "Program metrics and trends",             sf: "chart.bar",             sfSelected: "chart.bar.fill",             feather: "bar-chart-2",    section: "Insights" },
  queue:              { title: "Upload Queue", description: "Images waiting to upload",            sf: "icloud.and.arrow.up",   sfSelected: "icloud.and.arrow.up.fill",   feather: "upload-cloud",   section: "Data & sync" },
  notifications:      { title: "Alerts",    description: "Notifications and updates",              sf: "bell",                  sfSelected: "bell.fill",                  feather: "bell",           section: "Updates" },
};

/**
 * Placement per role. `tabs` = bottom tab bar (Home first, ordered by daily
 * frequency); everything else the role can access goes into the More hub.
 * Roles whose permitted screens all fit within 5 tabs get no More tab.
 */
const NAV_PLACEMENT: Record<UserRole, { tabs: string[]; more: string[] }> = {
  Admin:      { tabs: ["index", "patients", "consultations", "analytics"],          more: ["campaigns", "queue", "notifications"] },
  Doctor:     { tabs: ["index", "patients", "consultations", "analytics"],          more: ["queue", "notifications"] },
  Technician: { tabs: ["index", "patients", "campaigns", "queue", "notifications"], more: [] },
  CHW:        { tabs: ["index", "patients", "campaigns", "queue"],                  more: [] },
  Viewer:     { tabs: ["index", "analytics"],                                       more: [] },
  Patient:    { tabs: ["index", "visits", "my-consultations", "notifications"],     more: ["reports", "education"] },
};

export interface RoleNav {
  tabs: string[];
  more: string[];
  hasMore: boolean;
}

/** Resolve placement for a role, safety-filtered against RBAC visibility. */
export function getRoleNav(role: UserRole): RoleNav {
  const vis = TAB_VISIBILITY[role] ?? {};
  const placement = NAV_PLACEMENT[role] ?? { tabs: ["index"], more: [] };
  const tabs = placement.tabs.filter((k) => vis[k]);
  const inTabs = new Set(tabs);
  // Any permitted screen not placed as a tab must be reachable via More.
  const more = Object.keys(vis).filter((k) => vis[k] && !inTabs.has(k));
  // Preserve intended ordering for More rows.
  const orderedMore = [
    ...placement.more.filter((k) => more.includes(k)),
    ...more.filter((k) => !placement.more.includes(k)),
  ];
  return { tabs, more: orderedMore, hasMore: orderedMore.length > 0 };
}

/** Screen title, honoring the Patient-facing "Home" label for index. */
export function screenTitle(key: string, role: UserRole): string {
  if (key === "index") return role === "Patient" ? "Home" : "Dashboard";
  return SCREEN_META[key]?.title ?? key;
}
