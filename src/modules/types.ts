import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Staff roles. Employees are not a role: they use the portal (CNIC + password). */
export type Role = "owner" | "hr" | "finance";

export const ALL_ROLES: Role[] = ["owner", "hr", "finance"];

/** Sidebar groups, rendered in this order. */
export type NavGroup = "Overview" | "People" | "Time" | "Pay" | "Engagement" | "Hiring" | "System";

export const NAV_GROUP_ORDER: NavGroup[] = ["Overview", "People", "Time", "Pay", "Engagement", "Hiring", "System"];

/** An admin route rendered inside the admin shell and guarded by role. `path` is absolute (e.g. "/employees/:id"). */
export interface ModuleRoute {
  path: string;
  element: ReactNode;
  roles: Role[];
}

export interface ModuleNavItem {
  /** Unique across all modules, e.g. "people.directory". */
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: NavGroup;
  roles: Role[];
  /** Sort order inside its group (lower first). Defaults to 100. */
  order?: number;
  /** React hook returning a badge count (0/undefined hides it). Called once per rendered nav row. */
  useBadge?: () => number | undefined;
}

/** A portal route; `path` is relative to /portal (e.g. "leave" or "leave/:id"). */
export interface PortalRoute {
  path: string;
  element: ReactNode;
}

export interface PortalNavItem {
  key: string;
  label: string;
  /** Absolute href, e.g. "/portal/leave". */
  href: string;
  icon: LucideIcon;
  order?: number;
  useBadge?: () => number | undefined;
}

/** One result row in the global search palette (Ctrl+K). */
export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: LucideIcon;
  /** Extra words to match against (not shown). */
  keywords?: string[];
}

export interface SearchContext {
  query: string;
  companyId: string;
  role: Role;
}

/** Async search source contributed by a module (e.g. employees by name). Called with a debounced query of 2+ chars. */
export interface SearchSource {
  id: string;
  /** Group heading shown in the palette, e.g. "Employees". */
  label: string;
  roles: Role[];
  search: (ctx: SearchContext) => Promise<SearchResult[]>;
}

/** Static quick action in the palette (e.g. "Add employee"). */
export interface SearchCommand {
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  roles: Role[];
  keywords?: string[];
  /** Group heading. Defaults to "Quick actions". */
  group?: string;
}

export interface ModuleManifest {
  id: string;
  routes: ModuleRoute[];
  nav: ModuleNavItem[];
  portalRoutes: PortalRoute[];
  portalNav: PortalNavItem[];
  /** Routes rendered without any auth (e.g. public careers page). Absolute paths. `roles` is ignored. */
  publicRoutes?: ModuleRoute[];
  /** Global search sources for the staff palette. */
  search?: SearchSource[];
  /** Static quick actions for the staff palette. */
  commands?: SearchCommand[];
}
