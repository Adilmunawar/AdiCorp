import { format, parseISO } from "date-fns";
import type { AttendanceSource, AttendanceStatus, CorrectionKind, EventType, MarkableStatus, ShiftType, TimeDevice } from "./types";

/* ---------------- Status presentation ---------------- */

export interface StatusMeta {
  code: string;
  label: string;
  /** Cell fill on the register grid (tokens only). */
  cell: string;
  /** Small dot / legend swatch. */
  dot: string;
}

export const STATUS_META: Record<AttendanceStatus, StatusMeta> = {
  present: { code: "P", label: "Present", cell: "bg-success/15 text-success border-success/25", dot: "bg-success" },
  late: { code: "P", label: "Present (late)", cell: "bg-success/15 text-success border-success/25", dot: "bg-success" },
  half_day: { code: "H", label: "Half day", cell: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
  short_leave: { code: "S", label: "Short leave", cell: "bg-info/15 text-info border-info/25", dot: "bg-info" },
  leave: { code: "L", label: "On leave", cell: "bg-primary/10 text-primary border-primary/20", dot: "bg-primary" },
  absent: { code: "A", label: "Absent", cell: "bg-destructive/10 text-destructive border-destructive/25", dot: "bg-destructive" },
  holiday: { code: "–", label: "Holiday", cell: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/50" },
  weekend: { code: "–", label: "Weekend", cell: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/50" },
};

/** Click order on the register: P → H → S → A → clear. */
export const MARK_CYCLE: (MarkableStatus | null)[] = ["present", "half_day", "short_leave", "absent", null];

export function nextMark(current: AttendanceStatus | null | undefined): MarkableStatus | null {
  const normalised = current === "late" ? "present" : current;
  const i = MARK_CYCLE.indexOf((normalised ?? null) as MarkableStatus | null);
  return MARK_CYCLE[(i + 1) % MARK_CYCLE.length];
}

export const MARK_OPTIONS: { value: MarkableStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "short_leave", label: "Short leave" },
  { value: "absent", label: "Absent" },
];

/** Days worked weight: present 1, half day and short leave 0.5. */
export function dayWeight(status: AttendanceStatus | null | undefined): number {
  if (status === "present" || status === "late") return 1;
  if (status === "half_day" || status === "short_leave") return 0.5;
  return 0;
}

/** Where a register mark came from, in plain words. */
export const SOURCE_LABEL: Record<AttendanceSource, string> = {
  biometric: "Time clock",
  correction: "Correction",
  leave: "Approved leave",
  manual: "Marked by HR",
  bulk: "Marked by HR",
  import: "Imported",
};

/** Notes the system writes itself; the source chip already says this, so they are not repeated. */
const SYSTEM_NOTES = new Set(["Biometric punch", "Approved leave", "Approved punch correction"]);

/** A note worth showing to a person (null for the automatic ones). */
export function userNote(note: string | null | undefined): string | null {
  const n = note?.trim();
  return n && !SYSTEM_NOTES.has(n) ? n : null;
}

/* ---------------- Time clock health ---------------- */

export type DeviceHealthKey = "online" | "offline" | "error" | "paused" | "never";

export interface DeviceHealth {
  key: DeviceHealthKey;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}

/** A time clock counts as online when it was heard from in the last 3 minutes. */
export const ONLINE_WINDOW_MS = 3 * 60_000;

export function deviceHealth(d: Pick<TimeDevice, "is_active" | "last_seen_at" | "last_error">, now = Date.now()): DeviceHealth {
  if (!d.is_active) return { key: "paused", label: "Paused", tone: "neutral" };
  if (!d.last_seen_at) return { key: "never", label: "Never connected", tone: "neutral" };
  const online = now - new Date(d.last_seen_at).getTime() < ONLINE_WINDOW_MS;
  if (online) return { key: "online", label: "Online", tone: "success" };
  if (d.last_error) return { key: "error", label: "Needs attention", tone: "danger" };
  return { key: "offline", label: "Offline", tone: "warning" };
}

/* ---------------- Events ---------------- */

export const EVENT_META: Record<EventType, { label: string; tone: "danger" | "warning" | "success" | "info" | "primary" | "neutral"; affectsDefault: boolean; help: string }> = {
  holiday: { label: "Public holiday", tone: "danger", affectsDefault: true, help: "Day off for everyone" },
  off_day: { label: "Company off day", tone: "warning", affectsDefault: true, help: "Day off for everyone" },
  half_day: { label: "Half day", tone: "info", affectsDefault: true, help: "Shown on the register; attendance is still recorded" },
  working_day: { label: "Extra working day", tone: "success", affectsDefault: false, help: "Makes a weekend a working day" },
  meeting: { label: "Meeting", tone: "primary", affectsDefault: false, help: "For information" },
  training: { label: "Training", tone: "neutral", affectsDefault: false, help: "For information" },
};

export const EVENT_TYPES = Object.keys(EVENT_META) as EventType[];

/** Only holidays and off days that affect attendance remove a working day. */
export function isDayOffEvent(type: EventType, affects: boolean): boolean {
  return affects && (type === "holiday" || type === "off_day");
}

/* ---------------- Corrections ---------------- */

export const CORRECTION_KINDS: { value: CorrectionKind; label: string; needsIn: boolean; needsOut: boolean }[] = [
  { value: "missed_in", label: "Missed check-in", needsIn: true, needsOut: false },
  { value: "missed_out", label: "Missed check-out", needsIn: false, needsOut: true },
  { value: "missed_both", label: "Missed both punches", needsIn: true, needsOut: true },
  { value: "wrong_time", label: "Wrong time recorded", needsIn: true, needsOut: true },
];

export function correctionKindLabel(kind: CorrectionKind): string {
  return CORRECTION_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/* ---------------- Shifts ---------------- */

export const SHIFT_LABEL: Record<ShiftType, string> = { morning: "Morning", evening: "Evening", night: "Night" };

export function shiftLabel(shift: string | null | undefined): string {
  return SHIFT_LABEL[(shift as ShiftType) ?? "morning"] ?? "Morning";
}

/* ---------------- Time helpers ---------------- */

/** 125 → "2h 05m"; null → "—". */
export function formatMinutes(minutes: number | null | undefined, fallback = "—"): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return fallback;
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${sign}${rest}m`;
  return `${sign}${h}h ${String(rest).padStart(2, "0")}m`;
}

/** Hours with one decimal, e.g. 7.5h. */
export function formatHours(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  return `${(minutes / 60).toFixed(1)}h`;
}

/** Wall-clock HH:mm for a timestamp in the company timezone. */
export function clock(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);
  } catch {
    return format(d, "HH:mm");
  }
}

/** Seconds precision clock, for punch logs. */
export function clockSeconds(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "";
  const d = new Date(value);
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone }).format(d);
  } catch {
    return format(d, "HH:mm:ss");
  }
}

/** Company-local yyyy-MM-dd for a timestamp. */
export function localDate(value: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(new Date(value));
  } catch {
    return format(new Date(value), "yyyy-MM-dd");
  }
}

/**
 * The company's calendar day right now. It follows the clock, so a screen left open past midnight
 * (a wall display of the live board) moves on to the new day; it is never earlier than the server's
 * `today`, in case this device's clock runs behind.
 */
export function companyToday(serverToday: string | null | undefined, timeZone: string | null | undefined, now: number = Date.now()): string {
  const clockDay = localDate(new Date(now).toISOString(), timeZone ?? undefined);
  if (!timeZone) return serverToday ?? clockDay;
  return serverToday && serverToday > clockDay ? serverToday : clockDay;
}

/** Company-local hour (0–23) for a timestamp. */
export function localHour(value: string, timeZone?: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(new Date(value));
    return Number(h) % 24;
  } catch {
    return new Date(value).getHours();
  }
}

export function dayLabel(date: string, pattern = "EEE d MMM"): string {
  return format(parseISO(date), pattern);
}

export function monthStart(date: Date): string {
  return format(new Date(date.getFullYear(), date.getMonth(), 1), "yyyy-MM-dd");
}

/** "2026-10" style slug for file names. */
export function monthSlug(month: string): string {
  return month.slice(0, 7);
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

/** Share of target bar tone. */
export function shareTone(pct: number | null | undefined, threshold: number): "success" | "warning" | "danger" | "default" {
  if (pct === null || pct === undefined) return "default";
  if (pct >= threshold) return "success";
  if (pct >= threshold - 10) return "warning";
  return "danger";
}
