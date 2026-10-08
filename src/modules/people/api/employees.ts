import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { peopleKeys } from "./keys";
import { EMPLOYEE_COLUMNS, type ActivityEntry, type Department, type Employee, type EmployeeInput, type PortalAccess } from "./types";
import { companyToday } from "../lib/utils";

async function unwrap<T>(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as T;
}

export function usePeopleContext() {
  const { companyId, isHR, isFinance, isOwner, role } = useAuth();
  return { companyId, isHR, isFinance, isOwner, role, canEdit: isHR };
}

/** Today in the company's time zone, for date defaults and "not in the future" checks. */
export function useCompanyToday(): string {
  const { company } = useAuth();
  return companyToday(company?.timezone);
}

/** Every employee of the company (explicit columns: no pay, no credentials). */
export function useEmployees() {
  const { companyId } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.employees(companyId),
    enabled: !!companyId,
    queryFn: () =>
      unwrap<Employee[]>(
        db.from("employees").select(EMPLOYEE_COLUMNS).eq("company_id", companyId).order("name", { ascending: true }).limit(5000),
      ),
  });
}

export function useEmployee(id: string | undefined) {
  const { companyId } = usePeopleContext();
  const qc = useQueryClient();
  return useQuery({
    queryKey: peopleKeys.employee(companyId, id),
    enabled: !!companyId && !!id,
    initialData: () => (qc.getQueryData<Employee[]>(peopleKeys.employees(companyId)) ?? []).find((e) => e.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(peopleKeys.employees(companyId))?.dataUpdatedAt,
    queryFn: () =>
      unwrap<Employee | null>(db.from("employees").select(EMPLOYEE_COLUMNS).eq("company_id", companyId).eq("id", id).maybeSingle()),
  });
}

export function useDepartments() {
  const { companyId } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.departments(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: () =>
      unwrap<Department[]>(db.from("departments").select("id,company_id,name,created_at").eq("company_id", companyId).order("name")),
  });
}

/** Map of department id -> name. */
export function useDepartmentNames() {
  const { data } = useDepartments();
  const map = new Map<string, string>();
  (data ?? []).forEach((d) => map.set(d.id, d.name));
  return map;
}

/** Map of staff profile id -> display name (for "by Ayesha Khan" in timelines and reviews). */
export function useStaffNames() {
  const { companyId } = usePeopleContext();
  const { data } = useQuery({
    queryKey: peopleKeys.staffNames(companyId),
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    queryFn: () =>
      unwrap<{ id: string; first_name: string | null; last_name: string | null }[]>(
        db.from("profiles").select("id,first_name,last_name").eq("company_id", companyId),
      ),
  });
  const map = new Map<string, string>();
  (data ?? []).forEach((p) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    if (name) map.set(p.id, name);
  });
  return map;
}

export function useEmployeeActivity(employeeId: string | undefined, limit = 50) {
  const { companyId } = usePeopleContext();
  return useQuery({
    queryKey: [...peopleKeys.activity(companyId, employeeId), limit],
    enabled: !!companyId && !!employeeId,
    // "Show older events" raises the limit; keep this person's list on screen meanwhile
    // (never another person's when the profile changes).
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[3] === employeeId ? keepPreviousData(previous) : undefined),
    queryFn: () =>
      unwrap<ActivityEntry[]>(
        db
          .from("activity_logs")
          .select("id,action_type,description,details,user_id,employee_id,created_at")
          .eq("company_id", companyId)
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(limit),
      ),
  });
}

export function usePortalAccess(employeeId: string | undefined) {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.portalAccess(companyId, employeeId),
    enabled: !!companyId && !!employeeId && isHR,
    queryFn: () => unwrap<PortalAccess>(db.rpc("people_portal_access", { p_employee: employeeId })),
  });
}

/** Invalidate everything the People module shows about employees. */
export function useInvalidatePeople() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return () => qc.invalidateQueries({ queryKey: peopleKeys.all(companyId) });
}

export interface SaveEmployeeResult {
  id: string;
  employee_code: string | null;
  checklist_id?: string | null;
  changed: number;
}

export function useSaveEmployee() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Partial<EmployeeInput> }) =>
      unwrap<SaveEmployeeResult>(db.rpc("people_save_employee", { p_employee: id, p_data: input })),
    onSuccess: () => invalidate(),
  });
}

export function useSeparateEmployee() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: (args: { id: string; lastDay: string; reason?: string }) =>
      unwrap<{ checklist_id: string | null; assets_out: number }>(
        db.rpc("people_separate_employee", { p_employee: args.id, p_last_day: args.lastDay, p_reason: args.reason || null }),
      ),
    onSuccess: () => invalidate(),
  });
}

export function useRejoinEmployee() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: (args: { id: string; date: string }) =>
      unwrap<{ status: string }>(db.rpc("people_rejoin_employee", { p_employee: args.id, p_date: args.date })),
    onSuccess: () => invalidate(),
  });
}

export function useBulkSetDepartment() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: (args: { ids: string[]; departmentId: string | null }) =>
      unwrap<number>(db.rpc("people_bulk_set_department", { p_employees: args.ids, p_department: args.departmentId })),
    onSuccess: () => invalidate(),
  });
}

export function useAssignMissingCodes() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: () => unwrap<number>(db.rpc("people_assign_missing_codes")),
    onSuccess: () => invalidate(),
  });
}

export function useRevokePortalSessions() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: (employeeId: string) => unwrap<number>(db.rpc("people_revoke_portal_sessions", { p_employee: employeeId })),
    onSuccess: () => invalidate(),
  });
}

export interface ImportResult {
  errors: { row: number; name: string | null; message: string }[];
  created: { id: string; name: string; employee_code: string }[];
  departments_created?: number;
}

export function useImportEmployees() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: (args: { rows: Record<string, string>[]; startOnboarding: boolean }) =>
      unwrap<ImportResult>(db.rpc("people_import_employees", { p_rows: args.rows, p_start_onboarding: args.startOnboarding })),
    onSuccess: (res) => {
      if (res.created.length) invalidate();
    },
  });
}

/** Activity logger for direct table writes (definer RPCs log themselves). */
export async function logPeopleActivity(action: string, description: string, details: Record<string, unknown> = {}, employeeId?: string | null) {
  const { error } = await db.rpc("log_activity", {
    p_action: action,
    p_description: description,
    p_details: details,
    p_employee: employeeId ?? null,
  });
  if (error && import.meta.env.DEV) console.warn("[people] activity log failed", error);
}
