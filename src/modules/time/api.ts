import { useEffect, useRef } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import { companyToday, errorMessage } from "./lib";
import type {
  AttendanceChange,
  CalendarEvent,
  CorrectionRow,
  CorrectionStatus,
  DailySummary,
  DayLogRow,
  DayPunch,
  Department,
  EmployeeMonth,
  EventType,
  HoursReport,
  MarkResult,
  MonthRegister,
  PortalAttendance,
  PortalCorrection,
  PortalHours,
  PunchRow,
  TerminalIds,
  TimeDevice,
  TimeSettings,
} from "./types";

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

export const timeKeys = {
  all: (companyId: string | null) => ["time", companyId] as const,
  settings: (companyId: string | null) => ["time", companyId, "settings"] as const,
  register: (companyId: string | null, month: string, department: string | null) => ["time", companyId, "register", month, department] as const,
  daily: (companyId: string | null, date: string) => ["time", companyId, "daily", date] as const,
  hours: (companyId: string | null, month: string, department: string | null) => ["time", companyId, "hours", month, department] as const,
  employeeMonth: (companyId: string | null, employeeId: string, month: string) => ["time", companyId, "employee-month", employeeId, month] as const,
  events: (companyId: string | null, from: string, to: string) => ["time", companyId, "events", from, to] as const,
  devices: (companyId: string | null) => ["time", companyId, "devices"] as const,
  terminalIds: (companyId: string | null) => ["time", companyId, "terminal-ids"] as const,
  punches: (companyId: string | null, date: string) => ["time", companyId, "punches", date] as const,
  corrections: (companyId: string | null, status: CorrectionStatus | "all") => ["time", companyId, "corrections", status] as const,
  correctionCounts: (companyId: string | null) => ["time", companyId, "correction-counts"] as const,
  dayPunches: (companyId: string | null, employeeId: string, date: string) => ["time", companyId, "day-punches", employeeId, date] as const,
  departments: (companyId: string | null) => ["time", companyId, "departments"] as const,
};

export const portalTimeKeys = {
  all: (employeeId: string | undefined) => ["time", "portal", employeeId] as const,
  attendance: (employeeId: string | undefined, month: string) => ["time", "portal", employeeId, "attendance", month] as const,
  hours: (employeeId: string | undefined, month: string) => ["time", "portal", employeeId, "hours", month] as const,
  corrections: (employeeId: string | undefined) => ["time", "portal", employeeId, "corrections"] as const,
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) throw new Error(error.message || "Request failed");
  return data as T;
}

function onError(prefix: string) {
  return (error: unknown) => toast.error(prefix, { description: errorMessage(error) });
}

function useCompanyId() {
  const { companyId } = useAuth();
  return companyId;
}

/** Invalidate everything the time module caches for the company (cheap: queries refetch lazily). */
function useInvalidateTime() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: timeKeys.all(companyId) });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function useTimeSettings() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.settings(companyId),
    queryFn: () => rpc<TimeSettings>("time_get_settings"),
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

/** The company's calendar day (its timezone), not the viewer's. */
export function useCompanyToday(): string {
  const { data } = useTimeSettings();
  return companyToday(data?.today, data?.timezone);
}

export function useSaveTimeSettings() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (patch: Partial<Omit<TimeSettings, "today" | "locked_through">>) => rpc<TimeSettings>("time_save_settings", { p_settings: patch }),
    onSuccess: (data) => {
      qc.setQueryData(timeKeys.settings(companyId), data);
      invalidate();
      toast.success("Settings saved");
    },
    onError: onError("Could not save settings"),
  });
}

export function useSetLock() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (month: string | null) => rpc<string | null>("time_set_lock", { p_month: month }),
    onSuccess: (lockedThrough) => {
      invalidate();
      toast.success(lockedThrough ? "Attendance locked" : "Attendance unlocked");
    },
    onError: onError("Could not change the lock"),
  });
}

/* ------------------------------------------------------------------ */
/* Departments (read-only, for filters)                                */
/* ------------------------------------------------------------------ */

export function useDepartments() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.departments(companyId),
    queryFn: async () => {
      const { data, error } = await db.from("departments").select("id, name").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

export function useMonthRegister(month: string, department: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.register(companyId, month, department),
    queryFn: () => rpc<MonthRegister>("time_month_register", { p_month: month, p_department: department }),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
  });
}

export function useMarkAttendance() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (changes: AttendanceChange[]) => rpc<MarkResult>("time_mark_attendance", { p_changes: changes }),
    onSuccess: (res) => {
      invalidate();
      const saved = res.marked + res.cleared;
      if (res.skipped.length > 0) {
        const reasons = Array.from(new Set(res.skipped.map((s) => s.reason))).join(", ");
        toast.warning(`Saved ${saved} change${saved === 1 ? "" : "s"}; ${res.skipped.length} skipped`, { description: reasons });
      } else {
        toast.success(`Saved ${saved} change${saved === 1 ? "" : "s"}`);
      }
    },
    onError: onError("Could not save attendance"),
  });
}

export function useMarkAllPresent() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ date, employeeIds }: { date: string; employeeIds?: string[] }) =>
      rpc<number>("time_mark_all_present", { p_date: date, p_employee_ids: employeeIds ?? null }),
    onSuccess: (count) => {
      invalidate();
      if (count > 0) toast.success(`Marked ${count} ${count === 1 ? "person" : "people"} present`);
      else toast.info("Nobody left to mark", { description: "Everyone markable already has a mark for that day." });
    },
    onError: onError("Could not mark attendance"),
  });
}

/* ------------------------------------------------------------------ */
/* Daily, hours, one person's month, day log                           */
/* ------------------------------------------------------------------ */

export function useDailySummary(date: string, opts: { live?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.daily(companyId, date),
    queryFn: () => rpc<DailySummary>("time_daily_summary", { p_date: date }),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
    refetchInterval: opts.live ? 60_000 : false,
  });
}

export function useHoursReport(month: string, department: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.hours(companyId, month, department),
    queryFn: () => rpc<HoursReport>("time_hours_report", { p_month: month, p_department: department }),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
  });
}

export function useEmployeeMonth(employeeId: string, month: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.employeeMonth(companyId, employeeId, month),
    queryFn: () => rpc<EmployeeMonth>("time_employee_month", { p_employee: employeeId, p_month: month }),
    enabled: !!companyId && !!employeeId,
    placeholderData: keepPreviousData,
  });
}

export function fetchDayLog(from: string, to: string, department: string | null, employeeId: string | null) {
  return rpc<DayLogRow[]>("time_day_log", { p_from: from, p_to: to, p_department: department, p_employee: employeeId });
}

export async function fetchPunchLog(companyId: string, from: string, to: string): Promise<PunchRow[]> {
  const rows: PunchRow[] = [];
  const page = 1000;
  for (let offset = 0; offset < 50_000; offset += page) {
    const { data, error } = await db
      .from("time_punches")
      .select("id, employee_id, device_id, device_user_id, punch_at, punch_date, direction, verify_type, source, employees(name, employee_code, avatar_url), time_devices(name)")
      .eq("company_id", companyId)
      .gte("punch_date", from)
      .lte("punch_date", to)
      .order("punch_at", { ascending: true })
      // A unique tie-breaker: punches at the same second must not shift between pages.
      .order("id", { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as PunchRow[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Calendar events                                                     */
/* ------------------------------------------------------------------ */

export function useEvents(from: string, to: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.events(companyId, from, to),
    queryFn: async () => {
      // An event overlaps [from, to] when it starts on/before `to` and ends on/after `from`.
      const { data, error } = await db
        .from("events")
        .select("id, company_id, title, type, date, end_date, description, affects_attendance, created_at")
        .eq("company_id", companyId)
        .lte("date", to)
        .gte("date", shiftDays(from, -60))
        .order("date", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as CalendarEvent[]).filter((e) => (e.end_date ?? e.date) >= from);
    },
    enabled: !!companyId,
    placeholderData: keepPreviousData,
  });
}

/** Company working days (yyyy-MM-dd) in [from, to], after weekends, holidays and extra working days. */
export function useWorkingDates(from: string, to: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: [...timeKeys.all(companyId), "working-dates", from, to],
    queryFn: () => rpc<string[] | null>("working_dates", { p_company: companyId, p_from: from, p_to: to }).then((d) => d ?? []),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface EventInput {
  id?: string | null;
  title: string;
  type: EventType;
  date: string;
  end_date?: string | null;
  description?: string | null;
  affects_attendance: boolean;
}

export function useSaveEvent() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (input: EventInput) =>
      rpc<string>("time_save_event", {
        p_id: input.id ?? null,
        p_title: input.title,
        p_type: input.type,
        p_date: input.date,
        p_end_date: input.end_date || null,
        p_description: input.description || null,
        p_affects: input.affects_attendance,
      }),
    onSuccess: (_id, input) => {
      invalidate();
      toast.success(input.id ? "Event updated" : "Event added");
    },
    onError: onError("Could not save the event"),
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (id: string) => rpc<void>("time_delete_event", { p_id: id }),
    onSuccess: () => {
      invalidate();
      toast.success("Event removed");
    },
    onError: onError("Could not remove the event"),
  });
}

export function useAddStandardHolidays() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ year, country }: { year: number; country: "PK" | "INTL" }) =>
      rpc<number>("time_add_standard_holidays", { p_year: year, p_country: country }),
    onSuccess: (count, { year }) => {
      invalidate();
      if (count > 0) toast.success(`Added ${count} holiday${count === 1 ? "" : "s"} for ${year}`);
      else toast.info(`The standard holidays for ${year} are already on the calendar`);
    },
    onError: onError("Could not add holidays"),
  });
}

/* ------------------------------------------------------------------ */
/* Time clock                                                          */
/* ------------------------------------------------------------------ */

export function useDevices(opts: { live?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.devices(companyId),
    queryFn: async () => {
      const { data, error } = await db
        .from("time_devices")
        .select("id, company_id, name, serial, location, direction, is_active, key_prefix, last_seen_at, last_punch_at, last_ip, firmware, last_error, created_at")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TimeDevice[];
    },
    enabled: !!companyId,
    refetchInterval: opts.live ? 30_000 : false,
  });
}

export interface DeviceInput {
  id?: string | null;
  name: string;
  serial?: string | null;
  location?: string | null;
  direction: "in" | "out" | "both";
  is_active: boolean;
}

export function useSaveDevice() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (input: DeviceInput) =>
      rpc<{ id: string; key: string | null }>("time_save_device", {
        p_id: input.id ?? null,
        p_name: input.name,
        p_serial: input.serial || null,
        p_location: input.location || null,
        p_direction: input.direction,
        p_active: input.is_active,
      }),
    onSuccess: (_res, input) => {
      invalidate();
      toast.success(input.id ? "Time clock updated" : "Time clock added");
    },
    onError: onError("Could not save the time clock"),
  });
}

export function useRotateDeviceKey() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (id: string) => rpc<string>("time_rotate_device_key", { p_id: id }),
    onSuccess: () => invalidate(),
    onError: onError("Could not issue a new key"),
  });
}

export function useDeleteDevice() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (id: string) => rpc<void>("time_delete_device", { p_id: id }),
    onSuccess: () => {
      invalidate();
      toast.success("Time clock removed", { description: "Its punches are kept." });
    },
    onError: onError("Could not remove the time clock"),
  });
}

export function useTerminalIds() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.terminalIds(companyId),
    queryFn: () => rpc<TerminalIds>("time_terminal_ids"),
    enabled: !!companyId,
  });
}

export function useLinkTerminal() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ pin, employeeId }: { pin: string; employeeId: string }) =>
      rpc<number>("time_link_terminal", { p_device_user_id: pin, p_employee: employeeId }),
    onSuccess: (moved, { pin }) => {
      invalidate();
      toast.success(`Terminal ID ${pin} linked`, { description: moved > 0 ? `${moved} stored punch${moved === 1 ? "" : "es"} now count.` : undefined });
    },
    onError: onError("Could not link the terminal ID"),
  });
}

export function useUnlinkTerminal() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (pin: string) => rpc<void>("time_unlink_terminal", { p_device_user_id: pin }),
    onSuccess: (_v, pin) => {
      invalidate();
      toast.success(`Terminal ID ${pin} unlinked`);
    },
    onError: onError("Could not unlink the terminal ID"),
  });
}

export function useFillFromPunches() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => rpc<number>("time_fill_from_punches", { p_from: from, p_to: to }),
    onSuccess: (count) => {
      invalidate();
      toast.success(count > 0 ? `Marked ${count} day${count === 1 ? "" : "s"} present from punches` : "The register already matches the punches");
    },
    onError: onError("Could not fill the register"),
  });
}

/**
 * Unique per hook instance: supabase-js reuses a channel by topic, and adding listeners to one that is
 * already subscribed throws (a quick remount, or a second consumer, would take the page down).
 */
function useChannelInstance() {
  return useRef(Math.random().toString(36).slice(2, 10)).current;
}

/** Punches of one company-local day, kept live with a realtime subscription. */
export function usePunchesForDay(date: string) {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  const instance = useChannelInstance();
  const query = useQuery({
    queryKey: timeKeys.punches(companyId, date),
    queryFn: async () => {
      const { data, error } = await db
        .from("time_punches")
        .select("id, employee_id, device_id, device_user_id, punch_at, punch_date, direction, verify_type, source, employees(name, employee_code, avatar_url), time_devices(name)")
        .eq("company_id", companyId)
        .eq("punch_date", date)
        .order("punch_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as PunchRow[];
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!companyId) return;
    const channel = db
      .channel(`time-punches-${companyId}-${instance}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_punches", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["time", companyId, "punches"] });
        qc.invalidateQueries({ queryKey: ["time", companyId, "daily"] });
        qc.invalidateQueries({ queryKey: timeKeys.devices(companyId) });
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [companyId, qc, instance]);

  return query;
}

/* ------------------------------------------------------------------ */
/* Corrections                                                         */
/* ------------------------------------------------------------------ */

export function useCorrections(status: CorrectionStatus | "all") {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.corrections(companyId, status),
    queryFn: async () => {
      let q = db
        .from("punch_corrections")
        .select("id, employee_id, date, kind, time_in, time_out, reason, status, review_note, reviewed_at, created_at, employees(name, employee_code, avatar_url, rank)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CorrectionRow[];
    },
    enabled: !!companyId,
    placeholderData: keepPreviousData,
  });
}

export function useCorrectionCounts() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.correctionCounts(companyId),
    queryFn: async () => {
      const { data, error } = await db.from("punch_corrections").select("status").eq("company_id", companyId).limit(5000);
      if (error) throw error;
      const counts: Record<CorrectionStatus | "all", number> = { pending: 0, approved: 0, rejected: 0, withdrawn: 0, all: 0 };
      for (const row of (data ?? []) as { status: CorrectionStatus }[]) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        counts.all += 1;
      }
      return counts;
    },
    enabled: !!companyId,
  });
}

/** Sidebar badge: pending punch corrections (HR/owner), live via realtime. */
export function usePendingCorrectionsBadge(): number | undefined {
  const { companyId, isHR } = useAuth();
  const qc = useQueryClient();
  const instance = useChannelInstance();
  const { data } = useQuery({
    queryKey: [...timeKeys.all(companyId), "pending-badge"],
    queryFn: async () => {
      const { count, error } = await db
        .from("punch_corrections")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!companyId && isHR,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    if (!companyId || !isHR) return;
    const channel = db
      .channel(`time-corrections-${companyId}-${instance}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "punch_corrections", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: [...timeKeys.all(companyId), "pending-badge"] });
        qc.invalidateQueries({ queryKey: ["time", companyId, "corrections"] });
        qc.invalidateQueries({ queryKey: timeKeys.correctionCounts(companyId) });
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [companyId, isHR, qc, instance]);

  return data || undefined;
}

export function useReviewCorrection() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (input: { id: string; decision: "approve" | "reject"; timeIn?: string | null; timeOut?: string | null; note?: string | null }) =>
      rpc<{ status: string; marked_present?: boolean }>("time_review_correction", {
        p_id: input.id,
        p_decision: input.decision,
        p_time_in: input.timeIn || null,
        p_time_out: input.timeOut || null,
        p_note: input.note || null,
      }),
    onSuccess: (res) => {
      invalidate();
      if (res.status === "approved") {
        toast.success("Correction approved", { description: res.marked_present ? "The day was marked present on the register." : "The punches were added." });
      } else {
        toast.success("Correction rejected", { description: "The employee has been told." });
      }
    },
    onError: onError("Could not review the request"),
  });
}

export function useDayPunches(employeeId: string | null, date: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: timeKeys.dayPunches(companyId, employeeId ?? "", date ?? ""),
    queryFn: () => rpc<DayPunch[]>("time_day_punches", { p_employee: employeeId, p_date: date }),
    enabled: !!companyId && !!employeeId && !!date,
  });
}

/* ------------------------------------------------------------------ */
/* Portal                                                              */
/* ------------------------------------------------------------------ */

export function useMyAttendance(month: string) {
  const { employee } = useEmployeeAuth();
  return useQuery({
    queryKey: portalTimeKeys.attendance(employee?.id, month),
    queryFn: () => portalRpc<PortalAttendance>("portal_my_attendance", { p_month: month }),
    enabled: !!employee?.id,
    placeholderData: keepPreviousData,
  });
}

export function useMyHours(month: string) {
  const { employee } = useEmployeeAuth();
  return useQuery({
    queryKey: portalTimeKeys.hours(employee?.id, month),
    queryFn: () => portalRpc<PortalHours>("portal_my_hours", { p_month: month }),
    enabled: !!employee?.id,
    placeholderData: keepPreviousData,
  });
}

export function useMyCorrections() {
  const { employee } = useEmployeeAuth();
  return useQuery({
    queryKey: portalTimeKeys.corrections(employee?.id),
    queryFn: () => portalRpc<PortalCorrection[]>("portal_my_corrections"),
    enabled: !!employee?.id,
  });
}

export interface CorrectionInput {
  date: string;
  kind: string;
  timeIn?: string | null;
  timeOut?: string | null;
  reason: string;
}

export function useRequestCorrection() {
  const qc = useQueryClient();
  const { employee } = useEmployeeAuth();
  return useMutation({
    mutationFn: (input: CorrectionInput) =>
      portalRpc<{ id: string }>("portal_request_correction", {
        p_date: input.date,
        p_kind: input.kind,
        p_time_in: input.timeIn || null,
        p_time_out: input.timeOut || null,
        p_reason: input.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portalTimeKeys.all(employee?.id) });
      toast.success("Request sent to HR", { description: "You will be notified when it is reviewed." });
    },
    onError: onError("Could not send the request"),
  });
}

export function useWithdrawCorrection() {
  const qc = useQueryClient();
  const { employee } = useEmployeeAuth();
  return useMutation({
    mutationFn: (id: string) => portalRpc<{ ok: boolean }>("portal_withdraw_correction", { p_id: id }),
    onMutate: async (id) => {
      const key = portalTimeKeys.corrections(employee?.id);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PortalCorrection[]>(key);
      qc.setQueryData<PortalCorrection[]>(key, (rows) => rows?.map((r) => (r.id === id ? { ...r, status: "withdrawn" } : r)));
      return { previous };
    },
    onError: (error, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(portalTimeKeys.corrections(employee?.id), ctx.previous);
      onError("Could not withdraw the request")(error);
    },
    onSuccess: () => toast.success("Request withdrawn"),
    onSettled: () => qc.invalidateQueries({ queryKey: portalTimeKeys.all(employee?.id) }),
  });
}
