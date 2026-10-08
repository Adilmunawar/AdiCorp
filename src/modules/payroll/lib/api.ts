import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, isValid, parse, startOfMonth } from "date-fns";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import type {
  ExpectedPay,
  OvertimePayList,
  PayEventRow,
  PayRules,
  PayrollCounts,
  PayrollReport,
  PayrollSheet,
  PayslipDetail,
  PayslipInput,
  PortalPayslipDetail,
  PortalPayslipSummary,
  PriceKind,
  RulesBundle,
  SalaryOverview,
  SalarySaveResult,
  SheetOp,
  SheetOpResult,
} from "./types";

/** A message the server meant for the person (validation), as opposed to a crash. */
export class PayrollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollError";
  }
}

function friendly(message: string | undefined): string {
  const m = message ?? "";
  if (/only finance/i.test(m) || /permission denied/i.test(m)) return "Only Finance and the owner can do this.";
  if (/failed to fetch|network/i.test(m)) return "Could not reach the server. Check the connection and try again.";
  // A hand-edited or truncated link (/payroll/payslips/abc) reaches the server as a malformed id.
  if (/invalid input syntax for type uuid/i.test(m)) return "That link is not valid. Open the payslip from the payroll sheet.";
  return m || "Something went wrong. Please try again.";
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new PayrollError(friendly(error.message));
  if (data && typeof data === "object" && !Array.isArray(data) && "error" in data && (data as { error?: unknown }).error) {
    throw new PayrollError(String((data as { error: unknown }).error));
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

/* ------------------------------------------------------------------ keys */

export const payrollKeys = {
  all: (companyId: string | null | undefined) => ["payroll", companyId ?? "none"] as const,
  sheet: (c: string | null | undefined, month: string) => ["payroll", c ?? "none", "sheet", month] as const,
  payslip: (c: string | null | undefined, id: string) => ["payroll", c ?? "none", "payslip", id] as const,
  salaries: (c: string | null | undefined) => ["payroll", c ?? "none", "salaries"] as const,
  rules: (c: string | null | undefined) => ["payroll", c ?? "none", "rules"] as const,
  overtime: (c: string | null | undefined, scope: string, month: string) => ["payroll", c ?? "none", "overtime", scope, month] as const,
  events: (c: string | null | undefined, open: boolean) => ["payroll", c ?? "none", "events", open] as const,
  counts: (c: string | null | undefined) => ["payroll", c ?? "none", "counts"] as const,
  report: (c: string | null | undefined, from: string, to: string) => ["payroll", c ?? "none", "report", from, to] as const,
  activity: (c: string | null | undefined) => ["payroll", c ?? "none", "activity"] as const,
  portal: (c: string | null | undefined, employeeId: string | null | undefined) => ["payroll", c ?? "none", "portal", employeeId ?? "none"] as const,
};

function useFinanceScope() {
  const { companyId, isFinance } = useAuth();
  return { companyId, enabled: !!companyId && isFinance };
}

/** Invalidates everything payroll shows for the company (cheap: a handful of small queries). */
export function useInvalidatePayroll() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return useCallback(() => qc.invalidateQueries({ queryKey: payrollKeys.all(companyId) }), [qc, companyId]);
}

/* ---------------------------------------------------------------- months */

/** First day of a month as yyyy-MM-dd. */
export function monthKey(d: Date): string {
  return format(startOfMonth(d), "yyyy-MM-dd");
}

export function thisMonthKey(): string {
  return monthKey(new Date());
}

export function monthDate(key: string): Date {
  const d = parse(key.slice(0, 10), "yyyy-MM-dd", new Date());
  return isValid(d) ? d : startOfMonth(new Date());
}

export function shiftMonthKey(key: string, by: number): string {
  return monthKey(addMonths(monthDate(key), by));
}

/** The sheet's month in the URL as ?month=yyyy-MM (shareable, survives reloads). */
export function useMonthParam(param = "month"): [string, (key: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const parsed = raw && /^\d{4}-\d{2}$/.test(raw) ? parse(`${raw}-01`, "yyyy-MM-dd", new Date()) : null;
  const key = parsed && isValid(parsed) ? monthKey(parsed) : thisMonthKey();
  const set = useCallback(
    (next: string) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set(param, next.slice(0, 7));
          return p;
        },
        { replace: true },
      ),
    [param, setParams],
  );
  return [key, set];
}

/* --------------------------------------------------------------- queries */

export function usePayrollSheet(month: string) {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.sheet(companyId, month),
    queryFn: () => rpc<PayrollSheet>("payroll_sheet", { p_month: month }),
    enabled,
  });
}

export function usePayslipDetail(id: string | undefined) {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.payslip(companyId, id ?? ""),
    queryFn: () => rpc<PayslipDetail>("payroll_payslip", { p_id: id }),
    enabled: enabled && !!id,
    retry: (count, err) => !(err instanceof PayrollError) && count < 1,
  });
}

export function useSalaryOverview() {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.salaries(companyId),
    queryFn: () => rpc<SalaryOverview>("payroll_salary_overview"),
    enabled,
  });
}

export function usePayRules() {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.rules(companyId),
    queryFn: () => rpc<RulesBundle>("payroll_rules"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useOvertimePay(scope: "waiting" | "month" | "ready", month: string) {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.overtime(companyId, scope, scope === "month" ? month : "-"),
    queryFn: () => rpc<OvertimePayList>("payroll_overtime", { p_scope: scope, p_month: month }),
    enabled,
  });
}

export function usePayEvents(open: boolean) {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.events(companyId, open),
    queryFn: () => rpc<PayEventRow[]>("payroll_pay_events", { p_open: open, p_limit: open ? 300 : 100 }),
    enabled,
  });
}

/** Badge and banner counts for Finance; refreshed every minute. */
export function usePayrollCounts() {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.counts(companyId),
    queryFn: () => rpc<PayrollCounts>("payroll_counts"),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function usePayrollReport(from: string, to: string) {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: payrollKeys.report(companyId, from, to),
    queryFn: () => rpc<PayrollReport>("payroll_report", { p_from: from, p_to: to }),
    enabled,
  });
}

export interface PayrollActivityItem {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
}

/** Recent Finance changes (activity rows starting payroll., hidden from HR by RLS). */
export function usePayrollActivity(limit = 8) {
  const { companyId, enabled } = useFinanceScope();
  return useQuery({
    queryKey: [...payrollKeys.activity(companyId), limit],
    queryFn: async () => {
      const { data, error } = await db
        .from("activity_logs")
        .select("id, action_type, description, created_at")
        .eq("company_id", companyId)
        .like("action_type", "payroll.%")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new PayrollError(friendly(error.message));
      return (data ?? []) as PayrollActivityItem[];
    },
    enabled,
  });
}

/* ------------------------------------------------------------- mutations */

export function useSheetOp() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (v: { month: string; op: SheetOp; ids?: string[] | null; paidOn?: string | null }) =>
      rpc<SheetOpResult>("payroll_apply", { p_month: v.month, p_op: v.op, p_employee_ids: v.ids ?? null, p_paid_on: v.paidOn ?? null }),
    onSettled: invalidate,
  });
}

export function usePayslipAction() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (v: { id: string; op: Exclude<SheetOp, "prepare" | "refill_stale">; paidOn?: string | null }) =>
      rpc<SheetOpResult>("payroll_payslip_action", { p_id: v.id, p_op: v.op, p_paid_on: v.paidOn ?? null }),
    onSettled: (data, _error, v) => {
      if (!(v.op === "delete" && data?.done.length)) return invalidate();
      // A deleted draft's page is about to close: refetching it now would only flash "Payslip not available".
      const gone = payrollKeys.payslip(companyId, v.id);
      void qc.invalidateQueries({ queryKey: gone, refetchType: "none" });
      return qc.invalidateQueries({ queryKey: payrollKeys.all(companyId), predicate: (q) => !gone.every((k, i) => q.queryKey[i] === k) });
    },
  });
}

export function useUpdatePayslip() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (v: { id: string; input: PayslipInput }) => rpc<{ ok: boolean }>("payroll_update_payslip", { p_id: v.id, p_input: v.input }),
    onSettled: invalidate,
  });
}

export function useSaveSalaries() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (v: { rows: Array<{ employee_id: string; monthly_salary: number; other_allowance: number; pay_method: string }>; effectiveMonth: string; reason: string }) =>
      rpc<SalarySaveResult>("payroll_save_salaries", { p_rows: v.rows, p_effective_month: v.effectiveMonth, p_reason: v.reason }),
    onSettled: invalidate,
  });
}

export function useTakeBackSalary() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (id: string) => rpc<{ ok: boolean }>("payroll_take_back_salary", { p_id: id }),
    onSettled: invalidate,
  });
}

export function useSaveRules() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (rules: PayRules) => rpc<{ ok: boolean; rules: PayRules }>("payroll_save_rules", { p_rules: rules }),
    onSettled: invalidate,
  });
}

export function usePriceOvertime() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (v: { id: string; kind: PriceKind; rate?: number; multiplier?: number; amount?: number }) =>
      rpc<{ ok: boolean; pay_status: string; amount: number; on_draft: boolean }>("payroll_price_overtime", {
        p_id: v.id,
        p_kind: v.kind,
        p_rate: v.rate ?? null,
        p_multiplier: v.multiplier ?? null,
        p_amount: v.amount ?? null,
      }),
    onSettled: invalidate,
  });
}

export function usePriceWaiting() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: () => rpc<{ ok: boolean; priced: number; skipped: number; amount: number }>("payroll_price_waiting"),
    onSettled: invalidate,
  });
}

/** Mark HR updates dealt with (or reopen them). Optimistic: the rows leave the open list at once. */
export function useSetEventsDone() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (v: { ids: string[] | null; done: boolean }) => rpc<number>("payroll_set_pay_events_done", { p_ids: v.ids, p_done: v.done }),
    onMutate: async (v) => {
      if (!v.done) return undefined;
      const key = payrollKeys.events(companyId, true);
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<PayEventRow[]>(key);
      if (before) qc.setQueryData<PayEventRow[]>(key, v.ids ? before.filter((r) => !v.ids!.includes(r.id)) : []);
      return { before, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(ctx.key, ctx.before);
    },
    onSettled: invalidate,
  });
}

/* ---------------------------------------------------------------- portal */

function usePortalScope() {
  const { employee } = useEmployeeAuth();
  return { companyId: employee?.company_id ?? null, employeeId: employee?.id ?? null, enabled: !!employee?.id };
}

export function usePortalPayslips() {
  const { companyId, employeeId, enabled } = usePortalScope();
  return useQuery({
    queryKey: [...payrollKeys.portal(companyId, employeeId), "payslips"],
    queryFn: () => portalRpc<PortalPayslipSummary[]>("portal_payslips"),
    enabled,
  });
}

export function usePortalPayslip(id: string | undefined) {
  const qc = useQueryClient();
  const { companyId, employeeId, enabled } = usePortalScope();
  return useQuery({
    queryKey: [...payrollKeys.portal(companyId, employeeId), "payslip", id ?? ""],
    queryFn: async () => {
      const data = await portalRpc<PortalPayslipDetail>("portal_payslip", { p_id: id });
      // Opening it marks it seen: refresh the list and the badge.
      void qc.invalidateQueries({ queryKey: [...payrollKeys.portal(companyId, employeeId), "payslips"] });
      void qc.invalidateQueries({ queryKey: [...payrollKeys.portal(companyId, employeeId), "unseen"] });
      return data;
    },
    enabled: enabled && !!id,
    retry: false,
  });
}

export function useExpectedPay(month: string) {
  const { companyId, employeeId, enabled } = usePortalScope();
  return useQuery({
    queryKey: [...payrollKeys.portal(companyId, employeeId), "expected", month],
    queryFn: () => portalRpc<ExpectedPay>("portal_expected_pay", { p_month: month }),
    enabled,
  });
}

/** New (unopened) payslips: the badge on My payslips. */
export function useUnseenPayslips() {
  const { companyId, employeeId, enabled } = usePortalScope();
  return useQuery({
    queryKey: [...payrollKeys.portal(companyId, employeeId), "unseen"],
    queryFn: () => portalRpc<number>("portal_unseen_payslips"),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
