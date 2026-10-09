import { format, formatDistanceToNowStrict, isValid, parseISO, startOfMonth } from "date-fns";

export type DateInput = Date | string | number | null | undefined;

/**
 * Parse a DB value into a Date. Plain `yyyy-MM-dd` strings are read as local dates
 * (not UTC midnight), so they never shift a day in negative-offset timezones.
 */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "number") {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** 7 Oct 2026 */
export function formatDate(value: DateInput, pattern = "d MMM yyyy", fallback = "—"): string {
  const d = toDate(value);
  return d ? format(d, pattern) : fallback;
}

/** 7 Oct 2026, 14:05 */
export function formatDateTime(value: DateInput, fallback = "—"): string {
  return formatDate(value, "d MMM yyyy, HH:mm", fallback);
}

/** 14:05 */
export function formatTime(value: DateInput, fallback = "—"): string {
  return formatDate(value, "HH:mm", fallback);
}

/** October 2026 */
export function formatMonth(value: DateInput, fallback = "—"): string {
  return formatDate(value, "MMMM yyyy", fallback);
}

/** "3 minutes ago" */
export function formatRelative(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  // Server timestamps can sit a few seconds ahead of the browser clock; "in 0 seconds" reads as a bug.
  const ahead = d.getTime() - Date.now();
  if (ahead > 0 && ahead < 60_000) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

/* The signed-in company's IANA timezone (set by AuthContext). "Today" follows the company's clock,
   which is also what the database uses (company_today), not the clock of a viewer abroad. */
let companyTimeZone: string | null = null;

/** Called by AuthContext when the company loads (null on sign-out). */
export function setCompanyTimeZone(timeZone: string | null | undefined): void {
  companyTimeZone = timeZone || null;
}

/** Today as `yyyy-MM-dd` in the company's timezone (the browser's until a company is known). */
export function companyToday(now = new Date()): string {
  if (companyTimeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: companyTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
      const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
      const iso = `${get("year")}-${get("month")}-${get("day")}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    } catch {
      /* unknown zone: fall back to the browser's day */
    }
  }
  return format(now, "yyyy-MM-dd");
}

const isEmpty = (value: DateInput) => value === null || value === undefined || value === "";

/** Date -> `yyyy-MM-dd` for DB date columns. No value: today in the company's timezone. */
export function toDbDate(value?: DateInput): string {
  const d = isEmpty(value) ? null : toDate(value);
  return d ? format(d, "yyyy-MM-dd") : companyToday();
}

/** Date -> first-of-month `yyyy-MM-01` for DB month columns. No value: the company's current month. */
export function toDbMonth(value?: DateInput): string {
  const d = isEmpty(value) ? null : toDate(value);
  return d ? format(startOfMonth(d), "yyyy-MM-dd") : `${companyToday().slice(0, 7)}-01`;
}

/** 1234.5 -> "1,234.5" (no currency). */
export function formatNumber(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

/** 0.256 -> "25.6%" */
export function formatPercent(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits }).format(value);
}

/** "short_leave" -> "Short leave" */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** "Adil Munawar" -> "AM" */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? "?";
  return letters.toUpperCase();
}
