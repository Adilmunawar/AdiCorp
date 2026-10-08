import type { BadgeTone } from "@/components/kit";

/* ------------------------------------------------------------------ jobs */

export type JobStatus = "open" | "closed";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "temporary";
export type Workplace = "onsite" | "hybrid" | "remote";

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "temporary", label: "Temporary" },
];

export const WORKPLACES: { value: Workplace; label: string }[] = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

export const employmentTypeLabel = (v: string | null | undefined) => EMPLOYMENT_TYPES.find((t) => t.value === v)?.label ?? "Full-time";
export const workplaceLabel = (v: string | null | undefined) => WORKPLACES.find((t) => t.value === v)?.label ?? "On-site";

export interface JobPosting {
  id: string;
  company_id: string;
  slug: string;
  title: string;
  department_id: string | null;
  location: string;
  employment_type: EmploymentType;
  workplace: Workplace;
  openings: number;
  summary: string;
  description: string;
  requirements: string;
  status: JobStatus;
  closes_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobWithCounts extends JobPosting {
  department: string | null;
  total: number;
  fresh: number;
  active: number;
  hired: number;
}

/**
 * Today's date (`yyyy-MM-dd`) in the company's timezone, so closing dates flip at the company's
 * midnight like the careers page does (company_today in SQL), not at UTC midnight.
 */
export function todayIn(timeZone: string | null | undefined, now = new Date()): string {
  const fallback = () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (!timeZone) return fallback();
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return fallback();
  }
}

/** A role is accepting applications when it is open and its closing date (`today` is `yyyy-MM-dd`) has not passed. */
export function isAccepting(job: { status: string; closes_on: string | null }, today: string): boolean {
  if (job.status !== "open") return false;
  if (!job.closes_on) return true;
  return job.closes_on >= today;
}

/* ---------------------------------------------------------- applications */

export type ApplicationStatus = "new" | "reviewed" | "shortlisted" | "interview" | "offered" | "hired" | "rejected";

export interface StageDef {
  value: ApplicationStatus;
  label: string;
  tone: BadgeTone;
  hint: string;
}

export const STAGES: StageDef[] = [
  { value: "new", label: "New", tone: "primary", hint: "Not opened yet" },
  { value: "reviewed", label: "Reviewed", tone: "warning", hint: "Read, no decision" },
  { value: "shortlisted", label: "Shortlisted", tone: "info", hint: "Worth a conversation" },
  { value: "interview", label: "Interview", tone: "info", hint: "Interviews in progress" },
  { value: "offered", label: "Offered", tone: "success", hint: "Offer sent" },
  { value: "hired", label: "Hired", tone: "success", hint: "Employee record created" },
  { value: "rejected", label: "Rejected", tone: "danger", hint: "Not moving forward" },
];

export const stageOf = (s: string) => STAGES.find((x) => x.value === s) ?? STAGES[0];

/** Stages HR can pick directly; Hired goes through the hire dialog. */
export const MOVABLE_STAGES = STAGES.filter((s) => s.value !== "hired");

export interface Application {
  id: string;
  company_id: string;
  job_id: string;
  name: string;
  email: string;
  phone: string;
  link: string;
  cover_letter: string;
  cv_path: string | null;
  cv_name: string | null;
  cv_size: number | null;
  status: ApplicationStatus;
  rating: number | null;
  employee_id: string | null;
  status_changed_at: string;
  created_at: string;
  job: { id: string; title: string; slug: string; department_id: string | null } | null;
}

export interface ApplicationNote {
  id: string;
  application_id: string;
  author_id: string | null;
  author_name: string;
  kind: "note" | "status" | "hire";
  body: string;
  created_at: string;
}

/* --------------------------------------------------------------- public */

export interface PublicJobSummary {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string;
  employment_type: EmploymentType;
  workplace: Workplace;
  openings: number;
  summary: string;
  closes_on: string | null;
  created_at: string;
}

export interface PublicCompany {
  name: string;
  slug: string;
  logo: string | null;
  website: string | null;
  industry?: string | null;
}

export interface PublicCareers extends PublicCompany {
  jobs: PublicJobSummary[];
}

export interface PublicJobDetail extends PublicJobSummary {
  description: string;
  requirements: string;
  is_open: boolean;
}

/* ---------------------------------------------------------------- text */

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
export const LINK_RE = /^https?:\/\/[^\s]+$/i;

/** Letters NFKD does not decompose; careers_slugify in SQL folds the same ones. */
const SLUG_FOLD: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", þ: "th", ĳ: "ij", ø: "o", đ: "d", ð: "d", ħ: "h", ı: "i", ł: "l", ŧ: "t", ŀ: "l", ŉ: "n", ĸ: "k" };

/** URL slug, identical to careers_slugify in SQL: accents folded (é -> e), max 60 chars, no edge dashes. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ßæœþĳøđðħıłŧŀŉĸ]/g, (c) => SLUG_FOLD[c] ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Split a description into paragraphs; blank lines separate them. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** One requirement per line, with list bullets stripped. */
export function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function careersUrl(companySlug: string, jobSlug?: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/careers/${companySlug}${jobSlug ? `/${jobSlug}` : ""}`;
}

export function jobMeta(job: { department?: string | null; location?: string; employment_type?: string; workplace?: string }): string {
  return [job.department, job.location, employmentTypeLabel(job.employment_type), job.workplace && job.workplace !== "onsite" ? workplaceLabel(job.workplace) : null]
    .filter(Boolean)
    .join(" · ");
}

/** Supabase/PostgREST error to a readable sentence (RPCs raise friendly messages). */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = String((err as { message: unknown }).message || "");
    if (m) return m;
  }
  return fallback;
}
