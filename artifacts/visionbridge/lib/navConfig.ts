/**
 * Shared navigation catalog and resolver.
 *
 * The catalog is the single source of truth for labels, icons, ordering and
 * placement. Access is resolved here from the authenticated user's effective
 * permissions, so the navigation component stays role-agnostic.
 */
import type { Permission, UserRole } from "@/context/AuthContext";

type Capability = { resource: string; action: string };
export type NavigationPlacement = "primary" | "secondary" | "contextual";

export interface NavigationItem {
  id: string;
  route: string;
  label: string;
  description: string;
  sf: string;
  sfSelected: string;
  feather: string;
  section: string;
  placement: NavigationPlacement;
  capabilities?: Capability[];
  roles?: UserRole[];
}

/**
 * All global destinations. Patient/consultation workspaces keep their
 * image, AI, timeline and care-plan actions contextual to those screens.
 */
export const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: "home", route: "index", label: "Home", description: "Overview and quick actions", sf: "house", sfSelected: "house.fill", feather: "home", section: "Workspace", placement: "primary" },
  { id: "patients", route: "patients", label: "Patients", description: "Register and manage patients", sf: "person.2", sfSelected: "person.2.fill", feather: "users", section: "Workspace", placement: "primary", capabilities: [{ resource: "patient", action: "list" }] },
  { id: "consultations", route: "consultations", label: "Consults", description: "Teleconsultation requests and reviews", sf: "message.circle", sfSelected: "message.circle.fill", feather: "message-circle", section: "Workspace", placement: "primary", capabilities: [{ resource: "consultation", action: "list" }] },
  { id: "visits", route: "visits", label: "Visits", description: "Your appointments and visits", sf: "calendar", sfSelected: "calendar", feather: "calendar", section: "My care", placement: "primary", capabilities: [{ resource: "consultation", action: "list" }], roles: ["Patient"] },
  { id: "my-consultations", route: "my-consultations", label: "Consults", description: "Your consultation history", sf: "message.circle", sfSelected: "message.circle.fill", feather: "message-circle", section: "My care", placement: "primary", capabilities: [{ resource: "consultation", action: "list" }], roles: ["Patient"] },
  { id: "analytics", route: "analytics", label: "Insights", description: "Program metrics and trends", sf: "chart.bar", sfSelected: "chart.bar.fill", feather: "bar-chart-2", section: "Insights", placement: "secondary", capabilities: [{ resource: "analytics", action: "view" }] },
  { id: "campaigns", route: "campaigns", label: "Campaigns", description: "Outreach and screening campaigns", sf: "map", sfSelected: "map.fill", feather: "map-pin", section: "Outreach", placement: "primary", roles: ["Admin", "Technician", "CHW"] },
  { id: "notifications", route: "notifications", label: "Alerts", description: "Notifications and updates", sf: "bell", sfSelected: "bell.fill", feather: "bell", section: "Updates", placement: "primary", roles: ["Admin", "Doctor", "Technician", "Patient"] },
  { id: "queue", route: "queue", label: "Upload Queue", description: "Images waiting to upload", sf: "icloud.and.arrow.up", sfSelected: "icloud.and.arrow.up.fill", feather: "upload-cloud", section: "Data & sync", placement: "secondary", roles: ["Admin", "Doctor", "Technician", "CHW"] },
  { id: "reports", route: "reports", label: "Reports", description: "Your screening results and reports", sf: "doc.text", sfSelected: "doc.text.fill", feather: "file-text", section: "My care", placement: "secondary", roles: ["Patient"] },
  { id: "education", route: "education", label: "Learn", description: "Eye health education materials", sf: "book", sfSelected: "book.fill", feather: "book-open", section: "Resources", placement: "secondary", roles: ["Patient"] },
];

export type ScreenMeta = NavigationItem;
export const SCREEN_META: Record<string, ScreenMeta> = Object.fromEntries(
  NAVIGATION_ITEMS.map((item) => [item.route, item]),
) as Record<string, ScreenMeta>;

function isAllowed(item: NavigationItem, role: UserRole, permissions: Permission | null): boolean {
  if (item.roles && !item.roles.includes(role)) return false;
  if (!item.capabilities?.length) return true;
  return item.capabilities.some(({ resource, action }) => permissions?.[resource]?.[action] === true);
}

export interface ResolvedNavigation {
  primary: NavigationItem[];
  secondary: NavigationItem[];
  contextual: NavigationItem[];
}

/** Resolve visibility and preserve intentional workflow ordering. */
export function resolveNavigation(role: UserRole, permissions: Permission | null): ResolvedNavigation {
  const visible = NAVIGATION_ITEMS.filter((item) => isAllowed(item, role, permissions));
  const visiblePrimary = visible.filter((item) => item.placement === "primary");
  const overflowPrimary = visiblePrimary.slice(4);
  return {
    // Four direct destinations leave the fifth slot for More when needed.
    primary: visiblePrimary.slice(0, 4),
    // Never strand a permitted destination when a role has more than four
    // high-frequency items; overflow becomes a normal More row.
    secondary: [...overflowPrimary, ...visible.filter((item) => item.placement === "secondary")],
    contextual: visible.filter((item) => item.placement === "contextual"),
  };
}

export interface RoleNav {
  tabs: string[];
  more: string[];
  hasMore: boolean;
}

/** Compatibility helper for existing consumers that only have a role. */
export function getRoleNav(role: UserRole): RoleNav {
  const resolved = resolveNavigation(role, null);
  const tabs = resolved.primary.map((item) => item.route);
  const more = [...resolved.secondary, ...resolved.contextual].map((item) => item.route);
  return { tabs, more, hasMore: more.length > 0 };
}

export function screenTitle(key: string, _role: UserRole): string {
  return SCREEN_META[key]?.label ?? key;
}