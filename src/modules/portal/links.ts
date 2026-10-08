import { portalRoutes } from "@/modules/registry";

/**
 * Portal pages are contributed by several modules. Home cards link to another
 * module's page only when that page is actually registered, so a card never
 * leads to a 404 while a module is still being rolled out.
 */
export const PORTAL_PAGES = {
  attendance: ["attendance", "time"],
  leave: ["leave"],
  payslips: ["payslips", "pay"],
  holidays: ["calendar", "holidays"],
  announcements: ["announcements", "engagement"],
  celebrations: ["celebrations"],
  notifications: ["notifications"],
  profile: ["profile"],
  account: ["account"],
} as const;

export type PortalPage = keyof typeof PORTAL_PAGES;

export function portalHref(page: PortalPage): string | undefined {
  const match = PORTAL_PAGES[page].find((path) => portalRoutes.some((r) => r.path === path));
  return match ? `/portal/${match}` : undefined;
}

/** A notification link is followed only when it points inside the portal. */
export function safePortalLink(href: string | null | undefined): string | undefined {
  if (!href || !href.startsWith("/portal")) return undefined;
  return href;
}
