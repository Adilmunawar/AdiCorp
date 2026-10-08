import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { CalendarDays, Plane, Timer } from "lucide-react";
import type { ModuleManifest } from "../types";
import { useLeavePendingBadge, useOvertimePendingBadge } from "./api";

/*
 * Leave & overtime (hours) module.
 * Staff: /leave (requests, calendar, balances, types) and /overtime-hours (HR approves hours; Finance
 * prices them in Payroll). Portal: /portal/leave and /portal/overtime.
 */
const LeavePage = lazy(() => import("./pages/LeavePage"));
const OvertimePage = lazy(() => import("./pages/OvertimePage"));
const MyLeavePage = lazy(() => import("./pages/portal/MyLeavePage"));
const MyOvertimePage = lazy(() => import("./pages/portal/MyOvertimePage"));

const manifest: ModuleManifest = {
  id: "leave",
  routes: [
    { path: "/leave", element: <LeavePage />, roles: ["owner", "hr"] },
    { path: "/overtime-hours", element: <OvertimePage />, roles: ["owner", "hr"] },
    // Old links (notifications, bookmarks) keep working.
    { path: "/leave-management", element: <Navigate to="/leave" replace />, roles: ["owner", "hr"] },
  ],
  nav: [
    { key: "leave.requests", label: "Leave", href: "/leave", icon: Plane, group: "Time", roles: ["owner", "hr"], order: 20, useBadge: useLeavePendingBadge },
    { key: "leave.overtime", label: "Overtime", href: "/overtime-hours", icon: Timer, group: "Time", roles: ["owner", "hr"], order: 25, useBadge: useOvertimePendingBadge },
  ],
  portalRoutes: [
    { path: "leave", element: <MyLeavePage /> },
    { path: "overtime", element: <MyOvertimePage /> },
  ],
  portalNav: [
    { key: "leave.portal.leave", label: "Leave", href: "/portal/leave", icon: Plane, order: 30 },
    { key: "leave.portal.overtime", label: "Overtime", href: "/portal/overtime", icon: Timer, order: 40 },
  ],
  commands: [
    { id: "leave.file", label: "File a leave request", href: "/leave?tab=requests", icon: Plane, roles: ["owner", "hr"], keywords: ["time off", "vacation", "holiday"] },
    { id: "leave.pending", label: "Pending leave requests", href: "/leave?tab=requests&status=pending", icon: Plane, roles: ["owner", "hr"], keywords: ["approve", "review"] },
    { id: "leave.calendar", label: "Leave calendar", href: "/leave?tab=calendar", icon: CalendarDays, roles: ["owner", "hr"], keywords: ["who is away", "absent"] },
    { id: "leave.overtime", label: "Overtime hours", href: "/overtime-hours", icon: Timer, roles: ["owner", "hr"], keywords: ["extra hours", "ot"] },
  ],
};

export default manifest;
