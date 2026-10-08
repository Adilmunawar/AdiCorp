import type {
  ModuleManifest,
  ModuleNavItem,
  ModuleRoute,
  NavGroup,
  PortalNavItem,
  PortalRoute,
  Role,
  SearchCommand,
  SearchSource,
} from "./types";
import { NAV_GROUP_ORDER } from "./types";
import people from "./people/manifest";
import policies from "./policies/manifest";
import time from "./time/manifest";
import leave from "./leave/manifest";
import payroll from "./payroll/manifest";
import portal from "./portal/manifest";
import expenses from "./expenses/manifest";
import engagement from "./engagement/manifest";
import careers from "./careers/manifest";
import platform from "./platform/manifest";

/** Every module, in a stable order. The first route to claim a path wins. */
export const modules: ModuleManifest[] = [
  platform,
  people,
  time,
  leave,
  payroll,
  expenses,
  policies,
  engagement,
  careers,
  portal,
];

const byOrder = <T extends { order?: number }>(a: T, b: T) => (a.order ?? 100) - (b.order ?? 100);

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) {
      if (import.meta.env.DEV) console.warn(`[registry] duplicate "${k}" ignored`);
      return false;
    }
    seen.add(k);
    return true;
  });
}

export const adminRoutes: ModuleRoute[] = uniqueBy(modules.flatMap((m) => m.routes), (r) => r.path);
export const publicRoutes: ModuleRoute[] = uniqueBy(modules.flatMap((m) => m.publicRoutes ?? []), (r) => r.path);
export const portalRoutes: PortalRoute[] = uniqueBy(modules.flatMap((m) => m.portalRoutes), (r) => r.path);

export const adminNav: ModuleNavItem[] = uniqueBy(modules.flatMap((m) => m.nav), (n) => n.key);
export const portalNav: PortalNavItem[] = uniqueBy(modules.flatMap((m) => m.portalNav), (n) => n.key).sort(byOrder);

export const searchSources: SearchSource[] = modules.flatMap((m) => m.search ?? []);
export const searchCommands: SearchCommand[] = modules.flatMap((m) => m.commands ?? []);

export interface NavSection {
  group: NavGroup;
  items: ModuleNavItem[];
}

/** Sidebar sections visible to a role, grouped and sorted. */
export function navForRole(role: Role | null): NavSection[] {
  if (!role) return [];
  return NAV_GROUP_ORDER.map((group) => ({
    group,
    items: adminNav.filter((n) => n.group === group && n.roles.includes(role)).sort(byOrder),
  })).filter((s) => s.items.length > 0);
}

/** First nav href a role can open (used as the home page). */
export function homeForRole(role: Role | null): string {
  const first = navForRole(role)[0]?.items[0];
  return first?.href ?? "/dashboard";
}

/** Nav item whose href is the longest segment-prefix of the pathname. */
export function matchNav<T extends { href: string }>(items: T[], pathname: string): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    const href = item.href.split("?")[0];
    const hit = pathname === href || pathname.startsWith(href.endsWith("/") ? href : `${href}/`);
    if (hit && (!best || href.length > best.href.split("?")[0].length)) best = item;
  }
  return best;
}
