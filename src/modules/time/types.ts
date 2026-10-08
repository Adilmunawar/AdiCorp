/* Shapes returned by the time module RPCs (see supabase/migrations/2026100713*). */

export type AttendanceStatus =
  | "present"
  | "absent"
  | "leave"
  | "short_leave"
  | "half_day"
  | "late"
  | "holiday"
  | "weekend";

/** Statuses HR can set on the register. Leave only comes from approved leave requests. */
export type MarkableStatus = "present" | "half_day" | "short_leave" | "absent";

export type AttendanceSource = "manual" | "bulk" | "biometric" | "correction" | "leave" | "import";

export type EventType = "holiday" | "working_day" | "half_day" | "off_day" | "meeting" | "training";

export type ShiftType = "morning" | "evening" | "night";

export interface DayEvent {
  id?: string;
  title: string;
  type: EventType;
  affects: boolean;
}

export interface CalendarEvent {
  id: string;
  company_id: string;
  title: string;
  type: EventType;
  date: string;
  end_date: string | null;
  description: string | null;
  affects_attendance: boolean;
  created_at: string;
}

export interface TimeSettings {
  timezone: string;
  morning_start: string;
  evening_start: string;
  night_start: string;
  hours_per_day: number;
  grace_minutes: number;
  auto_present: boolean;
  hours_threshold_pct: number;
  locked_through: string | null;
  weekend_sunday: boolean;
  weekend_saturday: boolean;
  saturday_pattern: "all" | "alt_2_4" | "alt_1_3_5";
  saturday_off_from: string | null;
  saturday_off_until: string | null;
  today: string;
}

/* ---------------- Register ---------------- */

export interface RegisterDay {
  date: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  dow: number;
  /** Company-level working day (no per-person overrides). */
  working: boolean;
  events: DayEvent[];
}

export interface RegisterCell {
  s: AttendanceStatus;
  n: string | null;
  src: AttendanceSource;
}

export interface RegisterEmployee {
  id: string;
  name: string;
  code: string | null;
  rank: string | null;
  status: string;
  department_id: string | null;
  department: string | null;
  avatar_url: string | null;
  shift_type: ShiftType | null;
  joining_date: string | null;
  separation_date: string | null;
  payslip_locked: boolean;
  working: string[];
  leave: string[];
  cells: Record<string, RegisterCell>;
}

export interface MonthRegister {
  month: string;
  today: string;
  locked_through: string | null;
  can_edit: boolean;
  days: RegisterDay[];
  employees: RegisterEmployee[];
}

export interface AttendanceChange {
  employee_id: string;
  date: string;
  status: MarkableStatus | null;
  note?: string | null;
}

export interface MarkResult {
  marked: number;
  cleared: number;
  skipped: { employee_id: string; date: string; reason: string }[];
}

/* ---------------- Daily summary ---------------- */

export type DayKind = "leave" | "measured" | "no_out" | "unmeasured" | "absent" | "off" | "off_day" | "pending";

export interface DailyPerson {
  id: string;
  name: string;
  code: string | null;
  rank: string | null;
  department: string | null;
  department_id: string | null;
  avatar_url: string | null;
  shift_type: ShiftType;
  working: boolean;
  kind: DayKind;
  register: AttendanceStatus | null;
  register_source: AttendanceSource | null;
  first_in: string | null;
  last_out: string | null;
  punches: number;
  corrected: boolean;
  shift_start: string;
  shift_end: string;
  worked_minutes: number | null;
  late_minutes: number | null;
  early_minutes: number | null;
  late: boolean;
  left_early: boolean;
  no_out: boolean;
  on_leave: boolean;
  not_due: boolean;
  marked_by_hr: boolean;
  worked_day_off: boolean;
  linked: boolean;
  pending_correction: boolean;
}

export interface DailySummary {
  date: string;
  today: string;
  is_today: boolean;
  is_future: boolean;
  grace_minutes: number;
  timezone: string;
  pending_corrections: number;
  people: DailyPerson[];
}

/* ---------------- Hours ---------------- */

export interface HoursRow {
  employee_id: string;
  working_days: number;
  measured_days: number;
  target_minutes: number;
  worked_minutes: number;
  short_minutes: number;
  pct: number | null;
  late_days: number;
  late_minutes: number;
  early_days: number;
  early_minutes: number;
  no_out_days: number;
  absent_days: number;
  leave_days: number;
  unmeasured_days: number;
  offday_minutes: number;
  through: string | null;
}

export interface HoursReportRow extends HoursRow {
  name: string;
  code: string | null;
  rank: string | null;
  department: string | null;
  department_id: string | null;
  avatar_url: string | null;
  shift_type: ShiftType;
}

export interface HoursReport {
  month: string;
  threshold: number;
  grace_minutes: number;
  rows: HoursReportRow[];
}

/* ---------------- One person's month ---------------- */

export interface MonthDay {
  date: string;
  dow: number;
  working: boolean;
  outside: boolean;
  future: boolean;
  on_leave: boolean;
  status: AttendanceStatus | null;
  note: string | null;
  source: AttendanceSource | null;
  first_in: string | null;
  last_out: string | null;
  worked_minutes: number | null;
  punches: number;
  corrected: boolean;
  locked: boolean;
  events: DayEvent[];
}

export interface MonthSummary {
  working_days: number;
  working_days_so_far: number;
  present: number;
  half_day: number;
  short_leave: number;
  leave: number;
  absent: number;
  unmarked: number;
  locked: boolean | null;
}

export interface EmployeeMonth {
  month: string;
  today: string;
  timezone: string;
  employee: {
    id: string;
    name: string;
    code: string | null;
    rank: string | null;
    status: string;
    shift_type: ShiftType;
    joining_date: string | null;
    separation_date: string | null;
    avatar_url: string | null;
    department: string | null;
    shift_start: string;
    hours_per_day: number;
  };
  days: MonthDay[];
  summary: MonthSummary;
  hours: HoursRow | null;
  threshold: number;
  can_edit?: boolean;
}

/* ---------------- Day log (exports) ---------------- */

export interface DayLogRow {
  employee_id: string;
  work_date: string;
  working: boolean;
  kind: DayKind;
  register: AttendanceStatus | null;
  register_source: AttendanceSource | null;
  first_in: string | null;
  last_out: string | null;
  punches: number;
  corrected: boolean;
  shift_start: string;
  shift_end: string;
  target_minutes: number;
  worked_minutes: number | null;
  late_minutes: number | null;
  early_minutes: number | null;
  half: boolean;
  name: string;
  code: string | null;
  rank: string | null;
  department: string | null;
  shift_type: ShiftType;
  note: string | null;
}

/* ---------------- Time clock ---------------- */

export interface TimeDevice {
  id: string;
  company_id: string;
  name: string;
  serial: string | null;
  location: string | null;
  direction: "in" | "out" | "both";
  is_active: boolean;
  key_prefix: string;
  last_seen_at: string | null;
  last_punch_at: string | null;
  last_ip: string | null;
  firmware: string | null;
  last_error: string | null;
  created_at: string;
}

export interface PunchRow {
  id: string;
  employee_id: string | null;
  device_id: string | null;
  device_user_id: string;
  punch_at: string;
  punch_date: string;
  direction: "in" | "out" | "unknown";
  verify_type: string | null;
  source: "live" | "sync" | "correction" | "manual";
  employees?: { name: string; employee_code: string | null; avatar_url: string | null } | null;
  time_devices?: { name: string } | null;
}

export interface TerminalIds {
  linked: { device_user_id: string; employee_id: string; name: string; code: string | null; auto: boolean; linked_at: string; last_punch: string | null }[];
  unmatched: {
    device_user_id: string;
    punches: number;
    last_punch: string;
    suggestion: { employee_id: string; name: string; code: string | null } | null;
  }[];
  not_linked: { employee_id: string; name: string; code: string | null }[];
}

/* ---------------- Corrections ---------------- */

export type CorrectionKind = "missed_in" | "missed_out" | "missed_both" | "wrong_time";
export type CorrectionStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface CorrectionRow {
  id: string;
  employee_id: string;
  date: string;
  kind: CorrectionKind;
  time_in: string | null;
  time_out: string | null;
  reason: string;
  status: CorrectionStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  employees?: { name: string; employee_code: string | null; avatar_url: string | null; rank: string | null } | null;
}

export interface DayPunch {
  punch_at: string;
  local_time: string;
  direction: "in" | "out" | "unknown";
  verify_type: string | null;
  source: string;
  device: string | null;
}

/* ---------------- Portal ---------------- */

export interface PortalAttendance extends EmployeeMonth {
  strip: { date: string; working: boolean; status: AttendanceStatus | null }[];
  today_punches: { time: string; direction: string; verify_type: string | null; source: string }[];
  pending_corrections: number;
}

export interface PortalHoursDay {
  date: string;
  working: boolean;
  kind: DayKind;
  register: AttendanceStatus | null;
  first_in: string | null;
  last_out: string | null;
  target_minutes: number;
  worked_minutes: number | null;
  late_minutes: number | null;
  early_minutes: number | null;
  half: boolean;
  corrected: boolean;
}

export interface PortalHours {
  month: string;
  today?: string;
  timezone?: string;
  threshold: number;
  grace_minutes?: number;
  summary: HoursRow | null;
  days: PortalHoursDay[];
}

export interface PortalCorrection {
  id: string;
  date: string;
  kind: CorrectionKind;
  time_in: string | null;
  time_out: string | null;
  reason: string;
  status: CorrectionStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
}
