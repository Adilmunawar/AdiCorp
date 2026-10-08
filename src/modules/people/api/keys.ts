/** React Query keys. Every staff key starts with ["people", companyId]. */
export const peopleKeys = {
  all: (companyId: string | null) => ["people", companyId] as const,
  employees: (companyId: string | null) => ["people", companyId, "employees"] as const,
  employee: (companyId: string | null, id: string | undefined) => ["people", companyId, "employee", id] as const,
  departments: (companyId: string | null) => ["people", companyId, "departments"] as const,
  staffNames: (companyId: string | null) => ["people", companyId, "staff-names"] as const,
  documentStubs: (companyId: string | null) => ["people", companyId, "document-stubs"] as const,
  documents: (companyId: string | null, employeeId: string | undefined) => ["people", companyId, "documents", employeeId] as const,
  updates: (companyId: string | null) => ["people", companyId, "updates"] as const,
  badges: (companyId: string | null) => ["people", companyId, "badges"] as const,
  activity: (companyId: string | null, employeeId: string | undefined) => ["people", companyId, "activity", employeeId] as const,
  portalAccess: (companyId: string | null, employeeId: string | undefined) => ["people", companyId, "portal-access", employeeId] as const,
  templates: (companyId: string | null) => ["people", companyId, "templates"] as const,
  checklists: (companyId: string | null) => ["people", companyId, "checklists"] as const,
  checklist: (companyId: string | null, id: string | undefined) => ["people", companyId, "checklist", id] as const,
  employeeChecklists: (companyId: string | null, employeeId: string | undefined) => ["people", companyId, "employee-checklists", employeeId] as const,
  salarySet: (companyId: string | null, ids: string) => ["people", companyId, "salary-set", ids] as const,
  assets: (companyId: string | null) => ["people", companyId, "assets"] as const,
  asset: (companyId: string | null, id: string | undefined) => ["people", companyId, "asset", id] as const,
  employeeAssets: (companyId: string | null, employeeId: string | undefined) => ["people", companyId, "employee-assets", employeeId] as const,
};

/** Portal keys, scoped to the signed-in employee. */
export const peoplePortalKeys = {
  documents: (employeeId: string | undefined) => ["people", "portal", employeeId, "documents"] as const,
  assets: (employeeId: string | undefined) => ["people", "portal", employeeId, "assets"] as const,
};
