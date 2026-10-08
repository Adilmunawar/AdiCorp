import { lazy } from "react";
import { Bell, House, ShieldCheck, User } from "lucide-react";
import { usePortalNotifications } from "@/components/portal-shell/PortalNotificationBell";
import type { ModuleManifest } from "../types";

/*
 * portal module: the employee self-service home, profile, notifications and account.
 * Other modules contribute their own portal pages (attendance, leave, payslips,
 * letters, policies, engagement…) through their manifests; the shell merges them.
 * Home has the lowest order, so /portal lands there.
 */
const PortalHomePage = lazy(() => import("./pages/PortalHomePage"));
const PortalProfilePage = lazy(() => import("./pages/PortalProfilePage"));
const PortalNotificationsPage = lazy(() => import("./pages/PortalNotificationsPage"));
const PortalAccountPage = lazy(() => import("./pages/PortalAccountPage"));

function useUnreadBadge() {
  return usePortalNotifications().unread || undefined;
}

const manifest: ModuleManifest = {
  id: "portal",
  routes: [],
  nav: [],
  portalRoutes: [
    { path: "home", element: <PortalHomePage /> },
    { path: "profile", element: <PortalProfilePage /> },
    { path: "notifications", element: <PortalNotificationsPage /> },
    { path: "account", element: <PortalAccountPage /> },
    // Old links (bookmarks, earlier notifications) land on the new pages.
    { path: "settings", element: <PortalAccountPage /> },
  ],
  portalNav: [
    { key: "portal.home", label: "Home", href: "/portal/home", icon: House, order: 0 },
    { key: "portal.notifications", label: "Notifications", href: "/portal/notifications", icon: Bell, order: 85, useBadge: useUnreadBadge },
    { key: "portal.profile", label: "My profile", href: "/portal/profile", icon: User, order: 88 },
    { key: "portal.account", label: "Account", href: "/portal/account", icon: ShieldCheck, order: 95 },
  ],
};

export default manifest;
