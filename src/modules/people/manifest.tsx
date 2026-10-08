import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { Building2, ClipboardCheck, FileText, FolderOpen, Laptop, Upload, UserCog, UserPlus, Users } from "lucide-react";
import { db } from "@/integrations/supabase/client";
import type { ModuleManifest, Role, SearchResult } from "../types";
import { useMissingDocumentsBadge, useOverdueChecklistsBadge, usePendingUpdatesBadge } from "./api/updates";

/*
 * People module: employee directory and profiles, departments, documents, profile
 * change requests, onboarding/offboarding checklists and company assets, plus the
 * portal pages for an employee's own documents and equipment.
 * HR never sees pay here: employee reads use an explicit column list without wage
 * or credential columns, and every pay-relevant change is sent to Finance as a pay event.
 */
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const EmployeeEditorPage = lazy(() => import("./pages/EmployeeEditorPage"));
const EmployeeImportPage = lazy(() => import("./pages/EmployeeImportPage"));
const EmployeeProfilePage = lazy(() => import("./pages/EmployeeProfilePage"));
const DepartmentsPage = lazy(() => import("./pages/DepartmentsPage"));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage"));
const UpdateRequestsPage = lazy(() => import("./pages/UpdateRequestsPage"));
const ChecklistsPage = lazy(() => import("./pages/ChecklistsPage"));
const ChecklistDetailPage = lazy(() => import("./pages/ChecklistDetailPage"));
const ChecklistTemplatesPage = lazy(() => import("./pages/ChecklistTemplatesPage"));
const AssetsPage = lazy(() => import("./pages/AssetsPage"));
const AssetDetailPage = lazy(() => import("./pages/AssetDetailPage"));
const MyDocumentsPage = lazy(() => import("./pages/portal/MyDocumentsPage"));
const MyAssetsPage = lazy(() => import("./pages/portal/MyAssetsPage"));

const STAFF: Role[] = ["owner", "hr", "finance"];
const HR: Role[] = ["owner", "hr"];

/** Strip characters that would break a PostgREST `or()` filter. */
function safeTerm(q: string): string {
  return q.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

const manifest: ModuleManifest = {
  id: "people",
  routes: [
    { path: "/employees", element: <EmployeesPage />, roles: STAFF },
    { path: "/employees/new", element: <EmployeeEditorPage />, roles: HR },
    { path: "/employees/import", element: <EmployeeImportPage />, roles: HR },
    { path: "/employees/:id", element: <EmployeeProfilePage />, roles: STAFF },
    { path: "/employees/:id/edit", element: <EmployeeEditorPage />, roles: HR },
    { path: "/departments", element: <DepartmentsPage />, roles: HR },
    { path: "/documents", element: <DocumentsPage />, roles: HR },
    { path: "/document-tracking", element: <Navigate to="/documents" replace />, roles: HR },
    { path: "/employee-updates", element: <UpdateRequestsPage />, roles: HR },
    { path: "/checklists", element: <ChecklistsPage />, roles: HR },
    { path: "/checklists/templates", element: <ChecklistTemplatesPage />, roles: HR },
    { path: "/checklists/:id", element: <ChecklistDetailPage />, roles: HR },
    { path: "/assets", element: <AssetsPage />, roles: HR },
    { path: "/assets/:id", element: <AssetDetailPage />, roles: HR },
  ],
  nav: [
    { key: "people.employees", label: "Employees", href: "/employees", icon: Users, group: "People", roles: STAFF, order: 10 },
    { key: "people.departments", label: "Departments", href: "/departments", icon: Building2, group: "People", roles: HR, order: 20 },
    { key: "people.documents", label: "Documents", href: "/documents", icon: FileText, group: "People", roles: HR, order: 30, useBadge: useMissingDocumentsBadge },
    { key: "people.onboarding", label: "Onboarding", href: "/checklists", icon: ClipboardCheck, group: "People", roles: HR, order: 40, useBadge: useOverdueChecklistsBadge },
    { key: "people.assets", label: "Assets", href: "/assets", icon: Laptop, group: "People", roles: HR, order: 50 },
    { key: "people.updates", label: "Profile updates", href: "/employee-updates", icon: UserCog, group: "People", roles: HR, order: 60, useBadge: usePendingUpdatesBadge },
  ],
  portalRoutes: [
    { path: "documents", element: <MyDocumentsPage /> },
    { path: "assets", element: <MyAssetsPage /> },
  ],
  portalNav: [
    { key: "people.portal.documents", label: "My documents", href: "/portal/documents", icon: FolderOpen, order: 60 },
    { key: "people.portal.assets", label: "My equipment", href: "/portal/assets", icon: Laptop, order: 62 },
  ],
  search: [
    {
      id: "people.employees",
      label: "Employees",
      roles: STAFF,
      search: async ({ query, companyId }): Promise<SearchResult[]> => {
        const term = safeTerm(query);
        if (term.length < 2) return [];
        const digits = term.replace(/\D/g, "");
        const filters = [`name.ilike.%${term}%`, `employee_code.ilike.%${term}%`, `rank.ilike.%${term}%`];
        if (digits.length >= 4) filters.push(`cnic.ilike.%${digits.slice(0, 5)}%`);
        const { data, error } = await db
          .from("employees")
          .select("id,name,employee_code,rank,status")
          .eq("company_id", companyId)
          .or(filters.join(","))
          .order("name")
          .limit(8);
        if (error || !data) return [];
        return (data as { id: string; name: string; employee_code: string | null; rank: string; status: string }[]).map((e) => ({
          id: e.id,
          title: e.name,
          subtitle: [e.employee_code, e.rank, e.status === "active" ? null : "Separated"].filter(Boolean).join(" · "),
          href: `/employees/${e.id}`,
          icon: Users,
        }));
      },
    },
  ],
  commands: [
    { id: "people.add", label: "Add an employee", href: "/employees/new", icon: UserPlus, roles: HR, keywords: ["new", "hire", "joiner"] },
    { id: "people.import", label: "Import employees from Excel", href: "/employees/import", icon: Upload, roles: HR, keywords: ["bulk", "xlsx", "csv"] },
    { id: "people.departments", label: "Departments", href: "/departments", icon: Building2, roles: HR },
    { id: "people.documents", label: "Missing documents", href: "/documents", icon: FileText, roles: HR, keywords: ["cnic", "contract", "certificate"] },
    { id: "people.onboarding", label: "Onboarding checklists", href: "/checklists", icon: ClipboardCheck, roles: HR, keywords: ["offboarding", "checklist"] },
    { id: "people.assets", label: "Assets", href: "/assets", icon: Laptop, roles: HR, keywords: ["laptop", "equipment", "inventory"] },
    { id: "people.updates", label: "Profile change requests", href: "/employee-updates", icon: UserCog, roles: HR },
  ],
};

export default manifest;
