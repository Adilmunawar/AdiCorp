import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { Banknote, BarChart3, FileText, Percent, Timer, UserCog, Wallet } from "lucide-react";
import type { ModuleManifest, Role } from "../types";
import { usePayrollCounts, useUnseenPayslips } from "./lib/api";

/*
 * Payroll (Finance and the owner; HR never sees money). Sheet, payslip editor, salaries with history,
 * tax & structure, overtime pricing, HR updates inbox and pay reports; in the portal, the employee's
 * expected pay and their final payslips. All money moves through the payroll_* RPCs.
 */
const PayrollSheetPage = lazy(() => import("./pages/PayrollSheetPage"));
const PayslipEditorPage = lazy(() => import("./pages/PayslipEditorPage"));
const SalariesPage = lazy(() => import("./pages/SalariesPage"));
const TaxStructurePage = lazy(() => import("./pages/TaxStructurePage"));
const OvertimePayPage = lazy(() => import("./pages/OvertimePayPage"));
const HrUpdatesPage = lazy(() => import("./pages/HrUpdatesPage"));
const PayrollReportsPage = lazy(() => import("./pages/PayrollReportsPage"));
const MyPayPage = lazy(() => import("./portal/MyPayPage"));
const MyPayslipsPage = lazy(() => import("./portal/MyPayslipsPage"));
const PortalPayslipPage = lazy(() => import("./portal/PortalPayslipPage"));

const FINANCE: Role[] = ["owner", "finance"];

function useOpenEventsBadge() {
  return usePayrollCounts().data?.open_events;
}
function useUnpricedOvertimeBadge() {
  return usePayrollCounts().data?.overtime_waiting;
}
function useUnseenPayslipsBadge() {
  return useUnseenPayslips().data;
}

const manifest: ModuleManifest = {
  id: "payroll",
  routes: [
    { path: "/payroll", element: <PayrollSheetPage />, roles: FINANCE },
    { path: "/payroll/payslips/:id", element: <PayslipEditorPage />, roles: FINANCE },
    { path: "/payroll/salaries", element: <SalariesPage />, roles: FINANCE },
    { path: "/payroll/rules", element: <TaxStructurePage />, roles: FINANCE },
    { path: "/payroll/overtime", element: <OvertimePayPage />, roles: FINANCE },
    { path: "/payroll/updates", element: <HrUpdatesPage />, roles: FINANCE },
    { path: "/payroll/reports", element: <PayrollReportsPage />, roles: FINANCE },
    // Old link kept working.
    { path: "/salary", element: <Navigate to="/payroll" replace />, roles: FINANCE },
  ],
  nav: [
    { key: "payroll.sheet", label: "Payroll", href: "/payroll", icon: Wallet, group: "Pay", roles: FINANCE, order: 10 },
    { key: "payroll.updates", label: "HR updates", href: "/payroll/updates", icon: UserCog, group: "Pay", roles: FINANCE, order: 20, useBadge: useOpenEventsBadge },
    { key: "payroll.overtime", label: "Overtime pay", href: "/payroll/overtime", icon: Timer, group: "Pay", roles: FINANCE, order: 30, useBadge: useUnpricedOvertimeBadge },
    { key: "payroll.salaries", label: "Salaries", href: "/payroll/salaries", icon: Banknote, group: "Pay", roles: FINANCE, order: 40 },
    { key: "payroll.rules", label: "Tax & structure", href: "/payroll/rules", icon: Percent, group: "Pay", roles: FINANCE, order: 50 },
    { key: "payroll.reports", label: "Pay reports", href: "/payroll/reports", icon: BarChart3, group: "Pay", roles: FINANCE, order: 90 },
  ],
  portalRoutes: [
    { path: "pay", element: <MyPayPage /> },
    { path: "payslips", element: <MyPayslipsPage /> },
    { path: "payslips/:id", element: <PortalPayslipPage /> },
  ],
  portalNav: [
    { key: "payroll.my-pay", label: "My pay", href: "/portal/pay", icon: Wallet, order: 40 },
    { key: "payroll.my-payslips", label: "My payslips", href: "/portal/payslips", icon: FileText, order: 41, useBadge: useUnseenPayslipsBadge },
  ],
  commands: [
    { id: "payroll.run", label: "Run payroll for this month", href: "/payroll", icon: Wallet, roles: FINANCE, keywords: ["payslips", "salary", "sheet"], group: "Pay" },
    { id: "payroll.salaries", label: "Change a salary", href: "/payroll/salaries", icon: Banknote, roles: FINANCE, keywords: ["raise", "increment", "promotion"], group: "Pay" },
    { id: "payroll.overtime", label: "Price approved overtime", href: "/payroll/overtime", icon: Timer, roles: FINANCE, keywords: ["overtime", "rate"], group: "Pay" },
    { id: "payroll.updates", label: "HR updates for payroll", href: "/payroll/updates", icon: UserCog, roles: FINANCE, keywords: ["joiners", "leavers", "unpaid leave"], group: "Pay" },
    { id: "payroll.rules", label: "Tax table and salary structure", href: "/payroll/rules", icon: Percent, roles: FINANCE, keywords: ["tax", "slabs", "basic", "medical"], group: "Pay" },
  ],
};

export default manifest;
