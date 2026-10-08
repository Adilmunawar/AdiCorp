import { lazy } from "react";
import { GraduationCap, Plus, Receipt } from "lucide-react";
import { db } from "@/integrations/supabase/client";
import type { ModuleManifest, SearchResult } from "../types";
import { useFinanceTodoBadge, useHrPendingBadge } from "./api";
import { CATEGORY_SHORT, STATUS_LABELS, type ExpenseCategory, type ExpenseStatus } from "./kinds";

/*
 * Courses & expenses. Employees ask from the portal; HR decides (People ›
 * Courses & requests); Finance pays, declines and records its own spending
 * (Pay › Expenses & courses). The rules live in the expense_* / portal_expense*
 * RPCs (supabase/migrations/2026100717*).
 */
const FinanceExpensesPage = lazy(() => import("./pages/FinanceExpensesPage"));
const HrRequestsPage = lazy(() => import("./pages/HrRequestsPage"));
const NewExpensePage = lazy(() => import("./pages/NewExpensePage"));
const ExpenseDetailPage = lazy(() => import("./pages/ExpenseDetailPage"));
const PortalExpensesPage = lazy(() => import("./portal/PortalExpensesPage"));
const PortalNewExpensePage = lazy(() => import("./portal/PortalNewExpensePage"));
const PortalExpenseDetailPage = lazy(() => import("./portal/PortalExpenseDetailPage"));

const manifest: ModuleManifest = {
  id: "expenses",
  routes: [
    { path: "/expenses", element: <FinanceExpensesPage />, roles: ["owner", "finance"] },
    { path: "/expenses/requests", element: <HrRequestsPage />, roles: ["owner", "hr"] },
    { path: "/expenses/new", element: <NewExpensePage />, roles: ["owner", "finance"] },
    { path: "/expenses/:id", element: <ExpenseDetailPage />, roles: ["owner", "hr", "finance"] },
  ],
  nav: [
    {
      key: "expenses.requests",
      label: "Courses & requests",
      href: "/expenses/requests",
      icon: GraduationCap,
      group: "People",
      roles: ["owner", "hr"],
      order: 60,
      useBadge: useHrPendingBadge,
    },
    {
      key: "expenses.finance",
      label: "Expenses & courses",
      href: "/expenses",
      icon: Receipt,
      group: "Pay",
      roles: ["owner", "finance"],
      order: 40,
      useBadge: useFinanceTodoBadge,
    },
  ],
  portalRoutes: [
    { path: "expenses", element: <PortalExpensesPage /> },
    { path: "expenses/new", element: <PortalNewExpensePage /> },
    { path: "expenses/:id", element: <PortalExpenseDetailPage /> },
  ],
  portalNav: [{ key: "expenses.portal", label: "Courses & expenses", href: "/portal/expenses", icon: GraduationCap, order: 60 }],
  commands: [
    { id: "expenses.add", label: "Add an expense", href: "/expenses/new", icon: Plus, roles: ["owner", "finance"], keywords: ["course", "subscription", "spending", "reimburse"] },
    { id: "expenses.review", label: "Review course & expense requests", href: "/expenses/requests", icon: GraduationCap, roles: ["owner", "hr"], keywords: ["approve", "training"] },
  ],
  search: [
    {
      id: "expenses",
      label: "Courses & expenses",
      roles: ["owner", "hr", "finance"],
      // RLS decides what comes back: HR only sees employee requests.
      search: async ({ query, companyId }) => {
        const needle = query.replace(/[%_,()]/g, " ").trim();
        if (!needle) return [];
        const { data, error } = await db
          .from("expenses")
          .select("id, title, category, status, employee:employees(name)")
          .eq("company_id", companyId)
          .ilike("title", `%${needle}%`)
          .order("created_at", { ascending: false })
          .limit(6);
        if (error || !data) return [];
        return (data as unknown as Array<{ id: string; title: string; category: ExpenseCategory; status: ExpenseStatus; employee: { name: string } | null }>).map(
          (x): SearchResult => ({
            id: x.id,
            title: x.title,
            subtitle: `${CATEGORY_SHORT[x.category]} · ${x.employee?.name ?? "Whole company"} · ${STATUS_LABELS[x.status]}`,
            href: `/expenses/${x.id}`,
            icon: x.category === "course" ? GraduationCap : Receipt,
          }),
        );
      },
    },
  ],
};

export default manifest;
