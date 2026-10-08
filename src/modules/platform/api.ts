import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/modules/types";

/* ------------------------------------------------------------------ */
/* RPC plumbing                                                        */
/* ------------------------------------------------------------------ */

/** Raised when the database refuses a call until the user completes two-step verification. */
export class MfaRequiredError extends Error {
  constructor(message = "Two-step verification is required") {
    super(message);
    this.name = "MfaRequiredError";
  }
}

interface PgError {
  message?: string;
  hint?: string | null;
  details?: string | null;
  code?: string;
}

/** Turn a Postgres/PostgREST error into a readable Error (the database messages are written for people). */
export function toError(error: unknown, fallback = "Something went wrong. Please try again."): Error {
  if (error instanceof Error && !(error as unknown as PgError).code) return error;
  const e = (error ?? {}) as PgError;
  if (e.hint === "mfa_required") return new MfaRequiredError(e.message);
  if (e.code === "PGRST202") return new Error("This feature is not available yet. The database update has not been applied.");
  return new Error(e.message || fallback);
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) throw toError(error);
  return data as T;
}

/** Query keys: everything starts with ["platform", companyId]. */
export const platformKeys = {
  all: (companyId: string | null) => ["platform", companyId] as const,
  dashboard: (companyId: string | null, role: Role | null) => ["platform", companyId, "dashboard", role] as const,
  settings: (companyId: string | null) => ["platform", companyId, "settings"] as const,
  report: (companyId: string | null, kind: string, period: string) => ["platform", companyId, "report", kind, period] as const,
  activity: (companyId: string | null, filters: ActivityFilters) => ["platform", companyId, "activity", filters] as const,
  facets: (companyId: string | null) => ["platform", companyId, "activity-facets"] as const,
  staff: (companyId: string | null) => ["platform", companyId, "staff"] as const,
  access: (companyId: string | null) => ["platform", companyId, "access"] as const,
  dataOverview: (companyId: string | null) => ["platform", companyId, "data-overview"] as const,
  notifications: (companyId: string | null, userId: string | undefined, filter: string) =>
    ["platform", companyId, "notifications", userId, filter] as const,
  people: (companyId: string | null) => ["platform", companyId, "people-options"] as const,
};

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface NamedCount {
  name: string;
  count: number;
}

export interface DashboardActivity {
  id: string;
  action: string;
  description: string;
  created_at: string;
  actor: string | null;
  employee: string | null;
}

export interface LeaveItem {
  id: string;
  employee_id: string;
  name: string;
  type_name: string | null;
  start_date: string;
  end_date: string;
  days_count: number;
}

export interface Celebration {
  employee_id: string;
  name: string;
  avatar_url: string | null;
  kind: "birthday" | "anniversary" | "joining";
  date: string;
  years: number | null;
}

export interface EventItem {
  id: string;
  title: string;
  date: string;
  /** Last day of a multi-day event (null for a single day). */
  end_date?: string | null;
  type: string;
  description: string | null;
}

export interface AttendanceDay {
  expected: number;
  present: number;
  short_leave: number;
  leave: number;
  absent: number;
  unmarked?: number;
}

export interface TrendPoint extends AttendanceDay {
  date: string;
}

export interface HeadcountPoint {
  month: string;
  active: number;
  joiners: number;
  leavers: number;
}

export interface PayrollPoint {
  month: string;
  gross: number;
  net: number;
  payslips: number;
}

export interface DashboardData {
  role: Role;
  today: string;
  month: string;
  is_working_day: boolean;
  holiday: string | null;
  people: {
    active: number;
    separated: number;
    joiners_month: number;
    leavers_month: number;
    starting_soon: number;
    incomplete_profiles: number;
    no_portal_access: number;
  };
  departments: NamedCount[];
  headcount_trend: HeadcountPoint[];
  activity: DashboardActivity[];
  // owner / hr
  attendance_today?: AttendanceDay & { unmarked: number };
  attendance_trend?: TrendPoint[];
  approvals?: { leave: number; overtime: number; profile_updates: number; complaints: number };
  pending_leave?: LeaveItem[];
  upcoming_leave?: LeaveItem[];
  celebrations?: Celebration[];
  events?: EventItem[];
  hiring?: { total?: number; last_7_days?: number; by_status?: Record<string, number>; open_jobs?: number };
  // owner / finance
  payroll_month?: {
    month: string;
    payslips: number;
    employees: number;
    gross: number;
    net: number;
    deductions: number;
    overtime: number;
    by_status?: Record<string, number>;
  };
  payroll_trend?: PayrollPoint[];
  cost_by_department?: { month: string | null; rows: { name: string; net: number; gross: number; people: number }[] };
  salary_bill?: { monthly_total: number; with_salary: number; without_salary: number; changes_this_month: number };
  overtime_month?: { approved_hours: number; approved_entries: number; pending_entries: number };
  spending?: { month_total: number; previous_total: number; month_count: number; trend: { month: string; total: number }[] };
}

export function useDashboard() {
  const { companyId, role } = useAuth();
  return useQuery({
    queryKey: platformKeys.dashboard(companyId, role),
    enabled: !!companyId && !!role,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: () => rpc<DashboardData>("platform_dashboard"),
  });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type SaturdayPolicy = "working" | "off" | "alternate_1_3" | "alternate_2_4" | "seasonal";

export interface CompanySettings {
  saturday_policy: SaturdayPolicy;
  saturday_off_from: string | null;
  saturday_off_until: string | null;
  sunday_off: boolean;
  working_hours_per_day: number;
  hours_threshold_pct: number;
  require_push_notifications: boolean;
  self_service_edits: boolean;
  leave_requires_approval: boolean;
  letter_signatory_name: string | null;
  letter_signatory_title: string | null;
  letter_reference_prefix: string;
  require_staff_mfa: boolean;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name?: string | null;
}

export type SettingsPatch = Partial<Omit<CompanySettings, "updated_at" | "updated_by" | "updated_by_name">>;

export function useCompanySettings() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: platformKeys.settings(companyId),
    enabled: !!companyId,
    queryFn: () => rpc<CompanySettings>("platform_get_settings"),
  });
}

export function useUpdateSettings() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => rpc<CompanySettings>("platform_update_settings", { p_patch: patch }),
    onSuccess: (next) => {
      qc.setQueryData<CompanySettings>(platformKeys.settings(companyId), (prev) => ({ ...(prev ?? next), ...next }));
      void qc.invalidateQueries({ queryKey: platformKeys.settings(companyId) });
      void qc.invalidateQueries({ queryKey: platformKeys.dashboard(companyId, null).slice(0, 3) });
    },
  });
}

/** A calendar day that overrides the working week: a holiday or closure, or an extra working day. */
export interface CalendarException {
  date: string;
  end_date: string | null;
  type: "holiday" | "off_day" | "working_day";
  title: string;
}

/**
 * Holidays, closures and extra working days between two dates (yyyy-MM-dd), the same
 * rows public.working_dates() applies. Used to preview working days in Settings.
 */
export function useCalendarExceptions(from: string, to: string) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ["platform", companyId, "calendar-exceptions", from, to] as const,
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("events")
        .select("date, end_date, type, title, affects_attendance")
        .eq("company_id", companyId as string)
        .in("type", ["holiday", "off_day", "working_day"])
        .lte("date", to)
        .or(`end_date.gte.${from},and(end_date.is.null,date.gte.${from})`)
        .order("date", { ascending: true })
        .limit(200);
      if (error) throw toError(error);
      return ((data ?? []) as (CalendarException & { affects_attendance: boolean | null })[])
        .filter((e) => e.type === "working_day" || e.affects_attendance)
        .map(({ date, end_date, type, title }) => ({ date, end_date, type, title: (title ?? "").trim() }));
    },
  });
}

export interface CompanyPatch {
  name?: string;
  legal_name?: string | null;
  slug?: string | null;
  currency?: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  logo?: string | null;
  tax_id?: string | null;
  country?: string | null;
  timezone?: string;
  company_size?: string | null;
  company_type?: string | null;
}

export function useUpdateCompany() {
  const { refreshProfile, companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: CompanyPatch) => rpc<Record<string, unknown>>("platform_update_company", { p_patch: patch }),
    onSuccess: async () => {
      await refreshProfile();
      void qc.invalidateQueries({ queryKey: platformKeys.all(companyId) });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export interface AttendanceReportRow {
  employee_id: string;
  name: string;
  code: string | null;
  rank: string | null;
  department: string | null;
  working_days: number;
  present: number;
  short_leave: number;
  leave: number;
  absent: number;
  unmarked: number;
  days_worked: number;
  pct: number | null;
}

export interface AttendanceReport {
  month: string;
  through: string | null;
  working_days: number;
  rows: AttendanceReportRow[];
}

export interface LeaveReportType {
  id: string;
  name: string;
  days_per_year: number;
  is_paid: boolean;
}

export interface LeaveReportCell {
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface LeaveReportRow {
  employee_id: string;
  name: string;
  department: string | null;
  used: number;
  pending: number;
  by_type: Record<string, LeaveReportCell>;
}

export interface LeaveReport {
  year: number;
  types: LeaveReportType[];
  rows: LeaveReportRow[];
}

export interface OvertimeReportRow {
  employee_id: string;
  name: string;
  department: string | null;
  entries: number;
  approved: number;
  pending: number;
  rejected: number;
  regular: number;
  weekend: number;
  holiday: number;
}

export interface OvertimeReport {
  month: string;
  rows: OvertimeReportRow[];
}

export interface PersonMove {
  employee_id: string;
  name: string;
  department: string;
  rank: string | null;
  date: string;
}

export interface HeadcountReport {
  month: string;
  as_of: string;
  active: number;
  separated_total: number;
  incomplete_profiles: number;
  no_portal_access: number;
  by_department: NamedCount[];
  by_rank: NamedCount[];
  by_gender: NamedCount[];
  tenure: { under_1: number; one_to_3: number; three_to_5: number; over_5: number; unknown: number };
  joiners: PersonMove[];
  leavers: PersonMove[];
  trend: HeadcountPoint[];
}

export function useReport<T>(kind: "attendance" | "leave" | "overtime" | "headcount", period: string) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: platformKeys.report(companyId, kind, period),
    enabled: !!companyId && !!period,
    queryFn: () => {
      if (kind === "leave") return rpc<T>("platform_report_leave", { p_year: Number(period) });
      return rpc<T>(`platform_report_${kind}`, { p_month: period });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export interface ActivityFilters {
  area?: string;
  employee?: string;
  actor?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  area: string;
  description: string;
  details: Record<string, unknown>;
  created_at: string;
  actor: { id: string; name: string | null } | null;
  employee: { id: string; name: string } | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  /** Cursor of the next (older) page: the last entry's time and id. */
  next_before: string | null;
  next_before_id?: string | null;
}

/** Where the next page starts: entries older than this (time, id) pair. */
export interface ActivityCursor {
  before: string;
  id?: string | null;
}

export interface ActivityFacets {
  areas: { area: string; count: number }[];
  actors: { id: string; name: string; role: Role | null }[];
}

export function fetchActivityPage(filters: ActivityFilters, cursor?: ActivityCursor | null, limit = 50) {
  return rpc<ActivityPage>("platform_activity_feed", {
    p_before: cursor?.before ?? null,
    p_before_id: cursor?.id ?? null,
    p_area: filters.area || null,
    p_employee: filters.employee || null,
    p_actor: filters.actor || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_search: filters.search || null,
    p_limit: limit,
  });
}

/**
 * The latest entries of the activity feed, for the dashboard's digest (it folds repeats such as
 * a run of poll votes, so it reads further back than the dashboard's own last 8 entries).
 */
export function useRecentActivity(enabled = true, limit = 60) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: [...platformKeys.all(companyId), "activity-recent", limit] as const,
    enabled: !!companyId && enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => (await fetchActivityPage({}, null, limit)).items,
  });
}

export function useActivityFacets() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: platformKeys.facets(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: () => rpc<ActivityFacets>("platform_activity_facets"),
  });
}

/** Lightweight employee list for filters and pickers (no pay columns). */
export function usePeopleOptions() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: platformKeys.people(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("employees")
        .select("id, name, status")
        .eq("company_id", companyId!)
        .order("name", { ascending: true })
        .limit(2000);
      if (error) throw toError(error);
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Staff accounts (admin-users Edge Function) and access summary       */
/* ------------------------------------------------------------------ */

export interface StaffUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: Role | null;
  created_at: string;
  last_sign_in_at: string | null;
  disabled: boolean;
  is_self: boolean;
  is_creator: boolean;
}

export async function adminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.functions.invoke("admin-users", { body });
  if (error) {
    // FunctionsHttpError carries the response in `context`: the service's own message wins
    // (e.g. "Staff member not found"), so only a missing function or no connection is reworded.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      let serviceError: string | undefined;
      try {
        serviceError = ((await ctx.json()) as { error?: string })?.error;
      } catch {
        /* not JSON */
      }
      if (serviceError) throw new Error(serviceError);
      if (ctx.status === 404) {
        throw new Error("Staff account management is not available yet. The admin-users service has not been deployed.");
      }
    }
    if (/Failed to send a request/i.test(error.message)) {
      throw new Error("Could not reach the staff account service. Check your connection and try again.");
    }
    throw new Error(error.message);
  }
  const payload = data as T & { error?: string };
  if (payload && typeof payload === "object" && "error" in payload && payload.error) throw new Error(payload.error);
  return payload;
}

export function useStaffUsers() {
  const { companyId, isOwner } = useAuth();
  return useQuery({
    queryKey: platformKeys.staff(companyId),
    enabled: !!companyId && isOwner,
    retry: 0,
    queryFn: async () => (await adminUsers<{ users: StaffUser[] }>({ action: "list" })).users ?? [],
  });
}

export interface AccessSummary {
  staff: { owner: number; hr: number; finance: number; no_role: number; with_mfa: number };
  portal: {
    active_employees: number;
    with_password: number;
    without_password: number;
    must_change_password: number;
    signed_in_7_days: number;
    never_signed_in: number;
  };
  require_staff_mfa: boolean;
}

export function useAccessSummary() {
  const { companyId, isOwner } = useAuth();
  return useQuery({
    queryKey: platformKeys.access(companyId),
    enabled: !!companyId && isOwner,
    queryFn: () => rpc<AccessSummary>("platform_access_summary"),
  });
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

export type BackupScope = "hr" | "full";

export interface DataOverview {
  scope: BackupScope;
  tables: { name: string; rows: number }[];
  last_backup: { at: string; by: string | null; action: string } | null;
}

export function useDataOverview() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: platformKeys.dataOverview(companyId),
    enabled: !!companyId && isHR,
    queryFn: () => rpc<DataOverview>("platform_data_overview"),
  });
}

export interface BackupManifest {
  format: string;
  version: number;
  scope: BackupScope;
  generated_at: string;
  generated_by: string | null;
  company: Record<string, unknown>;
  tables: { name: string; rows: number; excluded_columns: string[] }[];
  left_out: string[];
}

const BACKUP_PAGE = 1000;

/**
 * Build a backup on the server, table by table, and return it as one JSON document.
 * `onProgress` receives (tablesDone, tablesTotal, currentTable).
 */
export async function buildBackup(scope: BackupScope, onProgress?: (done: number, total: number, table: string) => void) {
  const manifest = await rpc<BackupManifest>("platform_backup_start", { p_scope: scope });
  const data: Record<string, unknown[]> = {};
  let done = 0;
  for (const table of manifest.tables) {
    onProgress?.(done, manifest.tables.length, table.name);
    const rows: unknown[] = [];
    // Page until a short page rather than up to the counted rows: tables can grow while the backup
    // runs (this backup's own timeline entry, live punches), and a count on a page boundary would
    // otherwise drop the newest rows.
    for (let offset = 0; ; offset += BACKUP_PAGE) {
      const page = await rpc<unknown[]>("platform_backup_table", {
        p_scope: scope,
        p_table: table.name,
        p_offset: offset,
        p_limit: BACKUP_PAGE,
      });
      rows.push(...(page ?? []));
      if (!page || page.length < BACKUP_PAGE) break;
    }
    data[table.name] = rows;
    done += 1;
  }
  onProgress?.(done, manifest.tables.length, "");
  return { ...manifest, data };
}
