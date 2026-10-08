import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { portalRpc } from "@/lib/portal";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { errorMessage } from "./lib";
import type { ActionReply, OvertimeType, PortalLeaveOverview, PortalOvertimeOverview } from "./types";

/** Portal keys: module id, the employee's company, then the employee (never shared with staff caches). */
export const portalLeaveKeys = {
  all: (companyId: string | undefined, employeeId: string | undefined) => ["leave", companyId ?? null, "portal", employeeId ?? null] as const,
  leave: (companyId: string | undefined, employeeId: string | undefined, year: number) =>
    ["leave", companyId ?? null, "portal", employeeId ?? null, "overview", year] as const,
  countDays: (companyId: string | undefined, employeeId: string | undefined, start: string, end: string) =>
    ["leave", companyId ?? null, "portal", employeeId ?? null, "count-days", start, end] as const,
  overtime: (companyId: string | undefined, employeeId: string | undefined, month: string) =>
    ["leave", companyId ?? null, "portal", employeeId ?? null, "overtime", month] as const,
};

const num = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

function usePortalIds() {
  const { employee } = useEmployeeAuth();
  return { companyId: employee?.company_id, employeeId: employee?.id, ready: !!employee };
}

export function usePortalLeave(year: number) {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalLeaveKeys.leave(companyId, employeeId, year),
    enabled: ready,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PortalLeaveOverview> => {
      const data = await portalRpc<PortalLeaveOverview>("portal_leave_overview", { p_year: year });
      return {
        ...data,
        types: (data.types ?? []).map((t) => ({ ...t, days_per_year: num(t.days_per_year) })),
        balances: (data.balances ?? []).map((b) => ({
          ...b,
          allowed: num(b.allowed),
          used: num(b.used),
          pending: num(b.pending),
          remaining: numOrNull(b.remaining),
        })),
        requests: (data.requests ?? []).map((r) => ({ ...r, days_count: num(r.days_count) })),
      };
    },
  });
}

export function usePortalLeaveCountDays(start: string, end: string) {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalLeaveKeys.countDays(companyId, employeeId, start, end),
    enabled: ready && !!start && !!end && end >= start,
    staleTime: 60_000,
    queryFn: () => portalRpc<number>("portal_leave_count_days", { p_start: start, p_end: end }),
  });
}

export function usePortalOvertime(month: string) {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalLeaveKeys.overtime(companyId, employeeId, month),
    enabled: ready,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PortalOvertimeOverview> => {
      const data = await portalRpc<PortalOvertimeOverview>("portal_overtime_overview", { p_month: month });
      return {
        ...data,
        summary: {
          approved_hours: num(data.summary?.approved_hours),
          approved_count: num(data.summary?.approved_count),
          pending_hours: num(data.summary?.pending_hours),
          pending_count: num(data.summary?.pending_count),
          rejected_count: num(data.summary?.rejected_count),
          paid_count: num(data.summary?.paid_count),
          total: num(data.summary?.total),
        },
        records: (data.records ?? []).map((r) => ({ ...r, hours: num(r.hours), claimed_hours: numOrNull(r.claimed_hours) })),
      };
    },
  });
}

function usePortalMutation<V>(fn: string, toArgs: (vars: V) => Record<string, unknown>, success?: string) {
  const { companyId, employeeId } = usePortalIds();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => portalRpc<ActionReply>(fn, toArgs(vars)),
    onError: (error) => toast.error(errorMessage(error)),
    onSuccess: (reply) => {
      const message = reply?.message || success;
      if (message) toast.success(message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: portalLeaveKeys.all(companyId, employeeId) });
      // The portal home (balances, pending items) and My attendance (auto-approved leave) show the same rows.
      qc.invalidateQueries({ queryKey: ["portal", companyId ?? "none", "home"] });
      qc.invalidateQueries({ queryKey: ["time", "portal", employeeId] });
    },
  });
}

export function usePortalRequestLeave() {
  return usePortalMutation<{ leaveTypeId: string; start: string; end: string; reason: string }>("portal_leave_request", (v) => ({
    p_leave_type: v.leaveTypeId,
    p_start: v.start,
    p_end: v.end,
    p_reason: v.reason || null,
  }));
}

export function usePortalCancelLeave() {
  return usePortalMutation<{ id: string }>("portal_leave_cancel", (v) => ({ p_id: v.id }), "Request cancelled.");
}

export function usePortalClaimOvertime() {
  return usePortalMutation<{ date: string; hours: number; type: OvertimeType; reason: string }>("portal_overtime_claim", (v) => ({
    p_date: v.date,
    p_hours: v.hours,
    p_type: v.type,
    p_reason: v.reason || null,
  }));
}

export function usePortalWithdrawOvertime() {
  return usePortalMutation<{ id: string }>("portal_overtime_withdraw", (v) => ({ p_id: v.id }), "Claim withdrawn.");
}
