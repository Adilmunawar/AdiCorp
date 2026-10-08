import { differenceInCalendarDays, differenceInMonths } from "date-fns";
import { toDate, toDbDate } from "@/components/kit";
import { COMPLETENESS_FIELDS } from "./constants";
import type { Employee } from "../api/types";

/**
 * Today (`yyyy-MM-dd`) in the company's time zone: the day the People RPCs check dates against
 * (company_today in SQL). The browser's own day can be a day ahead or behind it.
 */
export function companyToday(timeZone?: string | null, now = new Date()): string {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    } catch {
      /* unknown zone: use the browser's day */
    }
  }
  return toDbDate(now);
}

/** Readable message from a Supabase / Postgres / JS error. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  const e = error as { message?: string; code?: string; details?: string };
  if (e.code === "42501" && !e.message) return "You do not have permission to do that.";
  if (e.code === "23505" && e.message?.includes("duplicate key")) return "That value is already in use.";
  return e.message?.trim() || fallback;
}

/** Postgres error code when present. */
export function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/**
 * Directory search: every word must match one of the text fields; a word with 3+
 * digits also matches CNIC and phone by digits only (spaces, dashes ignored).
 */
export function matchesSearch(fields: (string | null | undefined)[], digitFields: (string | null | undefined)[], query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" \u0001 ").toLowerCase();
  const digits = digitFields.map((d) => (d ?? "").replace(/\D/g, "")).filter(Boolean);
  return words.every((w) => {
    if (haystack.includes(w)) return true;
    const wd = w.replace(/\D/g, "");
    return wd.length >= 3 && wd.length === w.replace(/[\s()+-]/g, "").length && digits.some((d) => d.includes(wd));
  });
}

/** "12345-1234567-1" while typing; leaves anything that is not digits alone. */
export function formatCnic(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/**
 * Display form of a phone number: "0300 1234567" for Pakistani mobiles (putting back the
 * leading 0 that spreadsheets drop), "+92 300 1234567" for the international form, and
 * anything else (landlines, "Name 0300…") exactly as typed.
 */
export function formatPhone(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw || /[^\d\s()+-]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (/^3\d{9}$/.test(d)) return `0${d.slice(0, 3)} ${d.slice(3)}`;
  if (/^03\d{9}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4)}`;
  if (/^923\d{9}$/.test(d)) return `+92 ${d.slice(2, 5)} ${d.slice(5)}`;
  return raw;
}

/** `tel:` link for a phone number, or null when the value is not dialable. */
export function phoneHref(value: string | null | undefined): string | null {
  const f = formatPhone(value);
  if (!f || /[^\d\s()+-]/.test(f)) return null;
  const d = f.replace(/[^\d+]/g, "");
  return d.replace(/\D/g, "").length >= 7 ? `tel:${d}` : null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "2 yrs 3 mos", "5 mos", "12 days" from the joining date to today (or the last day). */
export function tenure(joining: string | null | undefined, until?: string | null): string {
  const from = toDate(joining);
  if (!from) return "—";
  const to = toDate(until) ?? new Date();
  if (to < from) {
    const days = Math.max(0, differenceInCalendarDays(from, to));
    return days <= 1 ? "Starts tomorrow" : `Starts in ${days} days`;
  }
  const months = differenceInMonths(to, from);
  if (months < 1) {
    const days = differenceInCalendarDays(to, from);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr${y === 1 ? "" : "s"}` : "", m ? `${m} mo${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

/** Active and joined within the last 30 days (not in the future). */
export function isNewJoiner(e: { status: string; joining_date: string | null }): boolean {
  const joined = toDate(e.joining_date);
  if (!joined || e.status !== "active") return false;
  const days = differenceInCalendarDays(new Date(), joined);
  return days >= 0 && days < 30;
}

/** Whole years between a date and today (for ages and anniversaries). */
export function yearsSince(value: string | null | undefined): number | null {
  const d = toDate(value);
  if (!d) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years -= 1;
  return years;
}

/** The next yearly occurrence (birthday, work anniversary) of a date, today included. */
export function nextYearly(value: string | null | undefined): { date: Date; days: number; years: number } | null {
  const d = toDate(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 29 Feb falls on 28 Feb in common years.
  const on = (year: number) => {
    const last = new Date(year, d.getMonth() + 1, 0).getDate();
    return new Date(year, d.getMonth(), Math.min(d.getDate(), last));
  };
  let next = on(today.getFullYear());
  if (next < today) next = on(today.getFullYear() + 1);
  return { date: next, days: differenceInCalendarDays(next, today), years: next.getFullYear() - d.getFullYear() };
}

/** "today", "tomorrow", "in 12 days". */
export function inDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** Share of the completeness fields that are filled (0..1) and the missing ones. */
export function completeness(e: Pick<Employee, (typeof COMPLETENESS_FIELDS)[number]>): { ratio: number; missing: string[] } {
  const missing = COMPLETENESS_FIELDS.filter((f) => !String(e[f] ?? "").trim());
  return { ratio: (COMPLETENESS_FIELDS.length - missing.length) / COMPLETENESS_FIELDS.length, missing };
}

/** Storage-safe file name: ascii letters, digits, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return `${base || "file"}${ext ? "." + ext : ""}`;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * The file's MIME type, taken from the extension when the browser reports none (Word files on
 * a PC without Office). The bucket only accepts the listed types, so an empty type would fail.
 */
export function uploadMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? "application/octet-stream";
}

/** Client-side file check that mirrors the bucket limits. Returns an error message or null. */
export function checkUpload(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return "Files can be 8 MB at most.";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okExt = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"].includes(ext);
  if (!okExt || (file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type))) return "Upload a PDF, image (JPG, PNG, WebP) or Word file.";
  return null;
}

export function isOverdue(due: string | null | undefined, status = "open"): boolean {
  const d = toDate(due);
  if (!d || status !== "open") return false;
  return differenceInCalendarDays(d, new Date()) < 0;
}

export function daysUntil(date: string | null | undefined): number | null {
  const d = toDate(date);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}
