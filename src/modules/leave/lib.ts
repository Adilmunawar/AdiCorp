import { differenceInCalendarDays, format } from "date-fns";
import { formatMonth, toDate } from "@/components/kit";
import type { BadgeTone } from "@/components/kit";
import type { LeaveKind, OvertimeType, PayStage } from "./types";

/** "12 Oct 2026", "12–15 Oct 2026", "28 Sep – 2 Oct 2026" or "29 Dec 2026 – 2 Jan 2027". */
export function leaveWhen(start: string, end: string): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return "—";
  if (start === end) return format(s, "d MMM yyyy");
  if (s.getFullYear() !== e.getFullYear()) return `${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`;
  if (s.getMonth() === e.getMonth()) return `${format(s, "d")}–${format(e, "d MMM yyyy")}`;
  return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
}

export function dayWord(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${trimNumber(v)} ${v === 1 ? "day" : "days"}`;
}

/** Calendar days in an inclusive range (0 when invalid). */
export function calendarDays(start: string, end: string): number {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e || e < s) return 0;
  return differenceInCalendarDays(e, s) + 1;
}

export function trimNumber(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

/** "2.5 h" */
export function hoursLabel(n: number | null | undefined): string {
  return `${trimNumber(n)} h`;
}

export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  annual: "Annual",
  sick: "Sick",
  casual: "Casual",
  unpaid: "Unpaid",
  maternity: "Maternity",
  paternity: "Paternity",
  other: "Other",
};

export const OVERTIME_TYPE_LABELS: Record<OvertimeType, string> = {
  regular: "After hours",
  weekend: "Weekend",
  holiday: "Holiday",
};

export function payStageInfo(stage: PayStage | null, payslipMonth: string | null): { label: string; tone: BadgeTone } | null {
  switch (stage) {
    case "no_pay":
      return { label: "Not paid (Finance)", tone: "neutral" };
    case "paid":
      return { label: payslipMonth ? `Paid · ${formatMonth(payslipMonth)}` : "Paid", tone: "success" };
    case "with_finance":
      return { label: "With Finance", tone: "warning" };
    case "ready":
      return { label: "Ready for payroll", tone: "info" };
    default:
      return null;
  }
}

/** The message the database raised (our RPCs raise friendly sentences), else a fallback. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

/**
 * Today as `yyyy-MM-dd` in the company's timezone, not the viewer's: at 22:00 in London it is
 * already tomorrow in Karachi. Falls back to the browser's day when the zone is unknown.
 */
export function companyToday(timeZone?: string | null): string {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch {
      /* unknown zone: use the browser's day */
    }
  }
  return format(new Date(), "yyyy-MM-dd");
}

/** yyyy-MM from ?month=, falling back to the month of `today` (yyyy-MM-dd, default the browser's day). */
export function parseMonthParam(raw: string | null, today?: string): Date {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return new Date(y, m - 1, 1);
  }
  const now = toDate(today) ?? new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function yearOptions(around = new Date().getFullYear()): number[] {
  return [around + 1, around, around - 1, around - 2, around - 3];
}
