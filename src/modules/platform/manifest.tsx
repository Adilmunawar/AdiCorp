import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { BarChart3, History, LayoutDashboard, Settings, UsersRound } from "lucide-react";
import type { ModuleManifest } from "../types";
import { platformCommands, platformSearch } from "./search";

/*
 * Platform module: role home dashboards, reports, timeline, users & access, settings,
 * and my account. The notifications inbox (/notifications) belongs to the engagement module.
 * Pages are lazy-loaded.
 */
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const TimelinePage = lazy(() => import("./pages/TimelinePage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));

const manifest: ModuleManifest = {
  id: "platform",
  routes: [
    { path: "/dashboard", element: <DashboardPage />, roles: ["owner", "hr", "finance"] },
    { path: "/reports", element: <ReportsPage />, roles: ["owner", "hr", "finance"] },
    { path: "/timeline", element: <TimelinePage />, roles: ["owner", "hr", "finance"] },
    { path: "/timeline-logs", element: <Navigate to="/timeline" replace />, roles: ["owner", "hr", "finance"] },
    { path: "/users", element: <UsersPage />, roles: ["owner"] },
    { path: "/settings", element: <SettingsPage />, roles: ["owner", "hr"] },
    { path: "/account", element: <AccountPage />, roles: ["owner", "hr", "finance"] },
  ],
  nav: [
    { key: "platform.dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Overview", roles: ["owner", "hr", "finance"], order: 0 },
    { key: "platform.reports", label: "Reports", href: "/reports", icon: BarChart3, group: "System", roles: ["owner", "hr", "finance"], order: 10 },
    { key: "platform.timeline", label: "Timeline", href: "/timeline", icon: History, group: "System", roles: ["owner", "hr", "finance"], order: 20 },
    { key: "platform.users", label: "Users & access", href: "/users", icon: UsersRound, group: "System", roles: ["owner"], order: 30 },
    { key: "platform.settings", label: "Settings", href: "/settings", icon: Settings, group: "System", roles: ["owner", "hr"], order: 40 },
  ],
  portalRoutes: [],
  portalNav: [],
  search: platformSearch,
  commands: platformCommands,
};

export default manifest;
