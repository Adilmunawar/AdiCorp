import { useMutation, useQuery, useQueryClient, keepPreviousData, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { companyToday, errorMessage } from "./lib";
import type {
  ActionReply,
  EmployeeOption,
  LeaveBalanceRow,
  LeaveRequestRow,
  LeaveSettings,
  LeaveStatus,
  LeaveType,
  OvertimeHoursRow,
  OvertimeStatus,
  OvertimeType,
} from "./types";

/* ------------------------------------------------------------------ keys */

export const leaveKeys = {
  all: (companyId: string | null) => ["leave", companyId] as const,
  types: (companyId: string | null) => ["leave", companyId, "types"] as const,
  settings: (companyId: string | null) => ["leave", companyId, "settings"] as const,
  requests: (companyId: string | null, filter: LeaveRequestFilter) => ["leave", companyId, "requests", filter] as const,
  balances: (companyId: string | null, year: number) => ["leave", companyId, "balances", year] as const,
  badges: (companyId: string | null) => ["leave", companyId, "badges"] as const,
  employees: (companyId: string | null) => ["leave", companyId, "employees"] as const,
  overtime: (companyId: string | null, filter: OvertimeFilter) => ["leave", companyId, "overtime", filter] as const,
  countDays: (companyId: string | null, employeeId: string, start: string, end: string) =>
    ["leave", companyId, "count-days", employeeId, start, end] as const,
  workingDates: (companyId: string | null, from: string, to: string) => ["leave", companyId, "working-dates", from, to] as const,
};

export interface LeaveRequestFilter {
  year?: number | null;
  status?: LeaveStatus | null;
  employeeId?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface OvertimeFilter {
  from: string;
  to: string;
  employeeId?: string | null;
  status?: OvertimeStatus | null;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

const num = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/* ----------------------------------------------------------------- reads */

/** The company's IANA timezone (null when unknown). */
export function useCompanyTimeZone(): string | null {
  const { company } = useAuth();
  return company?.timezone || null;
}

/** Today (yyyy-MM-dd) in the company's timezone, the same day the leave and overtime RPCs use. */
export function useCompanyToday(): string {
  return companyToday(useCompanyTimeZone());
}

/** The company's working days in a range (weekends and holidays left out), as yyyy-MM-dd strings. */
export function useWorkingDates(from: string, to: string) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: leaveKeys.workingDates(companyId, from, to),
    enabled: !!companyId && !!from && !!to && to >= from,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const dates = await rpc<string[] | null>("working_dates", { p_company: companyId, p_from: from, p_to: to });
      return new Set(dates ?? []);
    },
  });
}

export function useLeaveTypes() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: leaveKeys.types(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<LeaveType[]> => {
      const { data, error } = await db
        .from("leave_types")
        .select("id, name, type, days_per_year, is_paid, is_active, created_at")
        .eq("company_id", companyId)
        .order("is_active", { ascending: false })
        .order("days_per_year", { ascending: false })
        .order("name");
      if (error) throw new Error(errorMessage(error));
      return (data ?? []).map((t) => ({ ...t, days_per_year: num(t.days_per_year) })) as LeaveType[];
    },
  });
}

export function useLeaveSettings() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: leaveKeys.settings(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<LeaveSettings> => {
      const { data, error } = await db.from("leave_settings").select("requires_approval").eq("company_id", companyId).maybeSingle();
      if (error) throw new Error(errorMessage(error));
      return { requires_approval: data?.requires_approval ?? true };
    },
  });
}

export function useLeaveRequests(filter: LeaveRequestFilter, enabled = true) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: leaveKeys.requests(companyId, filter),
    enabled: !!companyId && enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<LeaveRequestRow[]> => {
      const rows = await rpc<LeaveRequestRow[]>("leave_requests_list", {
        p_year: filter.year ?? null,
        p_status: filter.status ?? null,
        p_employee: filter.employeeId ?? null,
        p_from: filter.from ?? null,
        p_to: filter.to ?? null,
      });
      return (rows ?? []).map((r) => ({ ...r, days_count: num(r.days_count) }));
    },
  });
}

export function useLeaveBalances(year: number) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: leaveKeys.balances(companyId, year),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<LeaveBalanceRow[]> => {
      const rows = await rpc<LeaveBalanceRow[]>("leave_balances", { p_year: year, p_employee: null });
      return (rows ?? []).map((b) => ({
        ...b,
        default_days: num(b.default_days),
        allowed: num(b.allowed),
        used: num(b.used),
        pending: num(b.pending),
        remaining: numOrNull(b.remaining),
      }));
    },
  });
}

/** Active employees for pickers (no pay or private fields). */
export function useActiveEmployees() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: leaveKeys.employees(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EmployeeOption[]> => {
      const { data, error } = await db
        .from("employees")
        .select("id, name, employee_code, avatar_url")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("name");
      if (error) throw new Error(errorMessage(error));
      return (data ?? []) as EmployeeOption[];
    },
  });
}

export function useLeaveCountDays(employeeId: string | null, start: string, end: string) {
  const { companyId } = useAuth();
  const valid = !!employeeId && !!start && !!end && end >= start;
  return useQuery({
    queryKey: leaveKeys.countDays(companyId, employeeId ?? "", start, end),
    enabled: !!companyId && valid,
    staleTime: 60_000,
    queryFn: () => rpc<number>("leave_count_days", { p_employee: employeeId, p_start: start, p_end: end }),
  });
}

/** Pending leave and overtime for the sidebar badges (zero for non-HR roles). */
export function useLeaveBadgeCounts() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: leaveKeys.badges(companyId),
    enabled: !!companyId && isHR,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: () => rpc<{ leave: number; overtime: number }>("leave_badge_counts"),
  });
}

export function useLeavePendingBadge(): number | undefined {
  return useLeaveBadgeCounts().data?.leave || undefined;
}

export function useOvertimePendingBadge(): number | undefined {
  return useLeaveBadgeCounts().data?.overtime || undefined;
}

export function useOvertimeHours(filter: OvertimeFilter) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: leaveKeys.overtime(companyId, filter),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OvertimeHoursRow[]> => {
      const rows = await rpc<OvertimeHoursRow[]>("overtime_hours_list", {
        p_from: filter.from,
        p_to: filter.to,
        p_employee: filter.employeeId ?? null,
        p_status: filter.status ?? null,
      });
      return (rows ?? []).map((r) => ({ ...r, hours: num(r.hours), claimed_hours: numOrNull(r.claimed_hours) }));
    },
  });
}

/* ---------------------------------------------------------------- writes */

interface MutationOptions<V> {
  /** Toast on success; a function receives the variables and the reply. */
  success?: string | ((vars: V, reply: unknown) => string | undefined);
  /** Optimistic patch applied to cached list rows (by id) until the server answers. */
  optimistic?: (vars: V) => { ids: string[]; patch: Record<string, unknown> } | null;
  /** True when the reply means "done, but not what was asked" (shown as a warning, not a success). */
  partial?: (vars: V, reply: unknown) => boolean;
}

/**
 * One mutation shape for every RPC in this module: optional optimistic row patch on cached lists,
 * friendly error toasts, and a refresh of everything leave/overtime (plus attendance) afterwards.
 */
export function useModuleMutation<V>(fn: string, toArgs: (vars: V) => Record<string, unknown>, opts: MutationOptions<V> = {}) {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => rpc<unknown>(fn, toArgs(vars)),
    onMutate: async (vars: V) => {
      const plan = opts.optimistic?.(vars);
      if (!plan) return { snapshot: [] as Array<[QueryKey, unknown]> };
      const prefix = leaveKeys.all(companyId);
      await qc.cancelQueries({ queryKey: prefix });
      const snapshot = qc.getQueriesData({ queryKey: prefix });
      const ids = new Set(plan.ids);
      qc.setQueriesData({ queryKey: prefix }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((row) => (row && typeof row === "object" && ids.has((row as { id?: string }).id ?? "") ? { ...row, ...plan.patch } : row));
      });
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData<unknown>(key, data));
      toast.error(errorMessage(error));
    },
    onSuccess: (reply, vars) => {
      const message = typeof opts.success === "function" ? opts.success(vars, reply) : opts.success;
      const serverMessage = reply && typeof reply === "object" && "message" in reply ? String((reply as ActionReply).message ?? "") : "";
      const text = serverMessage || message;
      if (!text) return;
      if (opts.partial?.(vars, reply)) toast.warning(text);
      else toast.success(text);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all(companyId) });
      qc.invalidateQueries({ queryKey: ["time", companyId] });
      // Dashboard tiles (pending leave, who is away) read the same rows.
      qc.invalidateQueries({ queryKey: ["platform", companyId] });
    },
  });
}

export interface CreateLeaveVars {
  employeeId: string;
  leaveTypeId: string;
  start: string;
  end: string;
  reason: string;
  approveNow: boolean;
}

export function useCreateLeaveRequest() {
  return useModuleMutation<CreateLeaveVars>(
    "leave_request_create",
    (v) => ({
      p_employee: v.employeeId,
      p_leave_type: v.leaveTypeId,
      p_start: v.start,
      p_end: v.end,
      p_reason: v.reason || null,
      p_approve_now: v.approveNow,
    }),
    // "Approve now" can leave the request pending (closed or locked month): the reply says why.
    { partial: (v, reply) => v.approveNow && (reply as ActionReply | null)?.status !== "approved" },
  );
}

export function useReviewLeave() {
  return useModuleMutation<{ id: string; decision: "approved" | "rejected"; note?: string; silent?: boolean }>(
    "leave_request_review",
    (v) => ({ p_id: v.id, p_decision: v.decision, p_note: v.note || null }),
    {
      optimistic: (v) => ({ ids: [v.id], patch: { status: v.decision, review_notes: v.note || null } }),
      success: (v) => (v.silent ? undefined : v.decision === "approved" ? "Leave approved and marked in attendance." : "Leave request rejected."),
    },
  );
}

export function useUndoLeave() {
  return useModuleMutation<{ id: string }>("leave_request_undo", (v) => ({ p_id: v.id }), {
    optimistic: (v) => ({ ids: [v.id], patch: { status: "pending", review_notes: null, reviewer_name: null } }),
    success: "Moved back to pending. Attendance written by the approval was removed.",
  });
}

export function useCancelLeave() {
  return useModuleMutation<{ id: string }>("leave_request_cancel", (v) => ({ p_id: v.id }), {
    optimistic: (v) => ({ ids: [v.id], patch: { status: "cancelled" } }),
    success: "Request cancelled.",
  });
}

export interface SaveLeaveTypeVars {
  id?: string | null;
  name: string;
  kind: string;
  daysPerYear: number;
  isPaid: boolean;
}

export function useSaveLeaveType() {
  return useModuleMutation<SaveLeaveTypeVars>(
    "leave_type_save",
    (v) => ({ p_id: v.id ?? null, p_name: v.name, p_kind: v.kind, p_days_per_year: v.daysPerYear, p_is_paid: v.isPaid }),
    { success: (v) => (v.id ? `Leave type ${v.name} saved.` : `Leave type ${v.name} added.`) },
  );
}

export function useToggleLeaveType() {
  return useModuleMutation<{ id: string; active: boolean; name: string }>(
    "leave_type_set_active",
    (v) => ({ p_id: v.id, p_active: v.active }),
    {
      optimistic: (v) => ({ ids: [v.id], patch: { is_active: v.active } }),
      success: (v) => `${v.name} switched ${v.active ? "on" : "off"}.`,
    },
  );
}

export function useSeedLeaveTypes() {
  return useModuleMutation<void>("leave_types_seed_defaults", () => ({}), { success: "Standard leave types added." });
}

export function useSetAllocation() {
  return useModuleMutation<{ employeeId: string; leaveTypeId: string; year: number; days: number | null }>(
    "leave_set_allocation",
    (v) => ({ p_employee: v.employeeId, p_leave_type: v.leaveTypeId, p_year: v.year, p_days: v.days }),
    { success: (v) => (v.days === null ? "Allowance reset to the default." : "Allowance saved.") },
  );
}

export function useSaveLeaveSettings() {
  return useModuleMutation<{ requiresApproval: boolean }>(
    "leave_settings_save",
    (v) => ({ p_requires_approval: v.requiresApproval }),
    {
      success: (v) =>
        v.requiresApproval ? "Leave requests now wait for HR approval." : "Employee leave requests are now approved automatically.",
    },
  );
}

export interface AddOvertimeVars {
  employeeId: string;
  date: string;
  hours: number;
  type: OvertimeType;
  reason: string;
  approveNow: boolean;
}

export function useAddOvertime() {
  return useModuleMutation<AddOvertimeVars>("overtime_add", (v) => ({
    p_employee: v.employeeId,
    p_date: v.date,
    p_hours: v.hours,
    p_type: v.type,
    p_reason: v.reason || null,
    p_approve_now: v.approveNow,
  }));
}

export function useReviewOvertime() {
  return useModuleMutation<{ id: string; status: OvertimeStatus; note?: string; silent?: boolean }>(
    "overtime_review",
    (v) => ({ p_id: v.id, p_status: v.status, p_note: v.note || null }),
    {
      optimistic: (v) => ({ ids: [v.id], patch: { status: v.status, pay_stage: v.status === "approved" ? "with_finance" : null } }),
      success: (v) =>
        v.silent
          ? undefined
          : v.status === "approved"
            ? "Overtime approved. Finance sets the pay."
            : v.status === "rejected"
              ? "Overtime rejected."
              : "Moved back to pending.",
    },
  );
}

export function useSetOvertimeHours() {
  return useModuleMutation<{ id: string; hours: number }>("overtime_set_hours", (v) => ({ p_id: v.id, p_hours: v.hours }), {
    success: "Hours corrected. The original claim is kept for the record.",
  });
}

export function useRemoveOvertime() {
  return useModuleMutation<{ id: string }>("overtime_remove", (v) => ({ p_id: v.id }), { success: "Overtime entry removed." });
}
