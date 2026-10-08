import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { Activity, CalendarCheck2, CalendarDays, CalendarPlus, ClipboardCheck, Clock, Download, Hourglass, Timer } from "lucide-react";
import type { ModuleManifest, Role } from "../types";
import { usePendingCorrectionsBadge } from "./api";

/*
 * Time module: attendance register and daily summary, live time-clock attendance, hours tracking,
 * punch corrections, and the working calendar. Portal: My attendance, My hours.
 */
const AttendancePage = lazy(() => import("./pages/AttendancePage"));
const EmployeeMonthPage = lazy(() => import("./pages/EmployeeMonthPage"));
const LivePage = lazy(() => import("./pages/LivePage"));
const HoursPage = lazy(() => import("./pages/HoursPage"));
const CorrectionsPage = lazy(() => import("./pages/CorrectionsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const MyAttendancePage = lazy(() => import("./portal/MyAttendancePage"));
const MyHoursPage = lazy(() => import("./portal/MyHoursPage"));

const HR: Role[] = ["owner", "hr"];

const manifest: ModuleManifest = {
  id: "time",
  routes: [
    { path: "/attendance", element: <AttendancePage />, roles: HR },
    { path: "/attendance/live", element: <LivePage />, roles: HR },
    { path: "/attendance/hours", element: <HoursPage />, roles: HR },
    { path: "/attendance/corrections", element: <CorrectionsPage />, roles: HR },
    { path: "/attendance/:employeeId", element: <EmployeeMonthPage />, roles: HR },
    { path: "/calendar", element: <CalendarPage />, roles: HR },
    // Old links
    { path: "/events", element: <Navigate to="/calendar" replace />, roles: HR },
    { path: "/working-days", element: <Navigate to="/calendar?tab=week" replace />, roles: HR },
  ],
  nav: [
    { key: "time.attendance", label: "Attendance", href: "/attendance", icon: Clock, group: "Time", roles: HR, order: 10 },
    { key: "time.live", label: "Live attendance", href: "/attendance/live", icon: Activity, group: "Time", roles: HR, order: 12 },
    { key: "time.hours", label: "Hours", href: "/attendance/hours", icon: Hourglass, group: "Time", roles: HR, order: 14 },
    {
      key: "time.corrections",
      label: "Corrections",
      href: "/attendance/corrections",
      icon: ClipboardCheck,
      group: "Time",
      roles: HR,
      order: 16,
      useBadge: usePendingCorrectionsBadge,
    },
    { key: "time.calendar", label: "Calendar", href: "/calendar", icon: CalendarDays, group: "Time", roles: HR, order: 60 },
  ],
  portalRoutes: [
    { path: "attendance", element: <MyAttendancePage /> },
    { path: "hours", element: <MyHoursPage /> },
  ],
  portalNav: [
    { key: "time.my_attendance", label: "My attendance", href: "/portal/attendance", icon: CalendarCheck2, order: 20 },
    { key: "time.my_hours", label: "My hours", href: "/portal/hours", icon: Timer, order: 22 },
  ],
  commands: [
    { id: "time.mark", label: "Mark attendance", href: "/attendance?tab=register", icon: Clock, roles: HR, keywords: ["register", "present", "absent"] },
    { id: "time.today", label: "Who is in today", href: "/attendance?tab=today", icon: Activity, roles: HR, keywords: ["daily", "late", "absent"] },
    { id: "time.export", label: "Export attendance register", href: "/attendance?tab=export", icon: Download, roles: HR, keywords: ["excel", "pdf", "csv", "punches"] },
    { id: "time.corrections", label: "Review punch corrections", href: "/attendance/corrections", icon: ClipboardCheck, roles: HR, keywords: ["missed punch"] },
    { id: "time.holiday", label: "Add a holiday", href: "/calendar", icon: CalendarPlus, roles: HR, keywords: ["event", "calendar", "off day"] },
    { id: "time.devices", label: "Set up a time clock", href: "/attendance/live?tab=setup", icon: Activity, roles: HR, keywords: ["biometric", "terminal", "device", "zkteco"] },
  ],
};

export default manifest;
