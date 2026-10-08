/**
 * Courses & expenses: words, lists, types and pure helpers shared by the staff
 * pages and the portal. The database (expense_* RPCs) is the authority for every
 * rule; the client checks here mirror it so people get instant feedback.
 */
import { addDays, format } from "date-fns";

export type ExpenseCategory = "course" | "subscription" | "equipment" | "travel" | "other";
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["course", "subscription", "equipment", "travel", "other"];
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  course: "Course or training",
  subscription: "Subscription or software",
  equipment: "Equipment or books",
  travel: "Travel or event",
  other: "Other",
};
/** Short names for chips and tables. */
export const CATEGORY_SHORT: Record<ExpenseCategory, string> = {
  course: "Course",
  subscription: "Subscription",
  equipment: "Equipment",
  travel: "Travel",
  other: "Other",
};

export type Billing = "once" | "monthly" | "yearly";
export const BILLING_LABELS: Record<Billing, string> = { once: "One time", monthly: "Every month", yearly: "Every year" };

/** Quote currencies offered; the company currency is always first. */
const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "PKR", "INR", "CAD", "AUD"];
export function quoteCurrencies(companyCurrency: string): string[] {
  const home = (companyCurrency || "USD").toUpperCase();
  return [home, ...COMMON_CURRENCIES.filter((c) => c !== home)];
}

/**
 * pending   → with HR
 * rejected  ← HR said no;   withdrawn ← the employee took it back
 * approved  → with Finance, to pay (Finance's own entries start here)
 * declined  ← Finance said no (budget)
 * paid      a one-time cost, paid
 * active    a subscription, paid and running; ended once cancelled
 */
export type ExpenseStatus = "pending" | "rejected" | "withdrawn" | "approved" | "declined" | "paid" | "active" | "ended";
export const EXPENSE_STATUSES: ExpenseStatus[] = ["pending", "approved", "paid", "active", "ended", "rejected", "declined", "withdrawn"];
export const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: "With HR",
  rejected: "Not approved by HR",
  withdrawn: "Withdrawn",
  approved: "With Finance",
  declined: "Declined by Finance",
  paid: "Paid",
  active: "Active",
  ended: "Ended",
};
export const STATUS_TONES: Record<ExpenseStatus, "warning" | "info" | "success" | "danger" | "neutral" | "primary"> = {
  pending: "warning",
  approved: "info",
  paid: "success",
  active: "primary",
  ended: "neutral",
  rejected: "danger",
  declined: "danger",
  withdrawn: "neutral",
};

export const OPEN_STATUSES: ExpenseStatus[] = ["pending", "approved"];
export const DONE_STATUSES: ExpenseStatus[] = ["paid", "active", "ended"];
export const CLOSED_STATUSES: ExpenseStatus[] = ["rejected", "declined", "withdrawn"];

export type PaymentMethod = "bank" | "card" | "cash" | "reimbursed";
export const PAYMENT_METHODS: PaymentMethod[] = ["bank", "card", "cash", "reimbursed"];
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank: "Bank transfer to the provider",
  card: "Company card",
  cash: "Cash",
  reimbursed: "Paid back to the employee",
};

export type ExpenseFileKind = "quote" | "receipt" | "certificate";
export const FILE_KIND_LABELS: Record<ExpenseFileKind, string> = { quote: "Quote or invoice", receipt: "Receipt", certificate: "Certificate" };

export const EXPENSE_BUCKET = "expense-files";
export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Limits for what people type (same as the database). */
export const EXPENSE_LIMITS = { title: 120, provider: 80, link: 300, text: 1500, note: 500, reference: 80, amount: 100_000_000, minWhy: 20 } as const;

/* ------------------------------------------------------------------ types */

export interface ExpenseEmployee {
  id: string;
  name: string;
  employee_code: string | null;
  rank: string | null;
  user_id: string | null;
  avatar_url: string | null;
  department: { name: string } | null;
}

export interface ExpenseRow {
  id: string;
  company_id: string;
  employee_id: string | null;
  category: ExpenseCategory;
  title: string;
  provider: string;
  link: string;
  amount: number;
  currency: string;
  billing: Billing;
  purpose: string;
  benefit: string;
  start_date: string | null;
  end_date: string | null;
  reimburse: boolean;
  source: "request" | "finance";
  status: ExpenseStatus;
  hr_by_name: string | null;
  hr_at: string | null;
  hr_note: string;
  finance_by_name: string | null;
  finance_at: string | null;
  finance_note: string;
  renews_on: string | null;
  ended_on: string | null;
  payments_count: number;
  last_paid_on: string | null;
  completed_at: string | null;
  outcome: string;
  requested_by_name: string | null;
  created_at: string;
  updated_at: string;
  employee?: ExpenseEmployee | null;
  /** Finance and the employee only: what has been paid so far, in the company currency. */
  paid_total?: number;
  /** Finance only: the newest payment's amount. */
  last_payment?: number | null;
}

export interface ExpensePayment {
  id: string;
  expense_id?: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string;
  note: string;
  created_by_name?: string | null;
  created_at: string;
}

export interface ExpenseFile {
  id: string;
  expense_id?: string;
  payment_id: string | null;
  kind: ExpenseFileKind;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

/** File metadata handed to the RPCs after an upload. */
export interface UploadedFile {
  path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
}

/* ---------------------------------------------------------------- helpers */

/**
 * The calendar day (yyyy-MM-dd) of `value` in `timeZone` (the company's), or in the
 * browser's zone when none is known. A Finance user abroad still works on the
 * company's day: renewals due, "paid this month" and payment dates follow it.
 */
export function dayIn(value: Date | string, timeZone?: string | null): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const out = `${get("year")}-${get("month")}-${get("day")}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
    } catch {
      /* unknown zone: fall back to the browser's */
    }
  }
  return format(d, "yyyy-MM-dd");
}

/** Today in `timeZone` (the company's), or in the browser's zone. */
export const todayIso = (timeZone?: string | null) => dayIn(new Date(), timeZone);
export const isoPlusDays = (iso: string, days: number) => format(addDays(new Date(`${iso}T00:00:00`), days), "yyyy-MM-dd");

/** A quoted amount in its own currency: "PKR 15,000", "USD 99.50". */
export function quoted(amount: number, currency: string): string {
  const n = Number(amount);
  const text = n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return `${currency} ${text}`;
}

/** "USD 100 a month", "PKR 15,000". */
export function costLine(x: Pick<ExpenseRow, "amount" | "currency" | "billing">): string {
  return `${quoted(x.amount, x.currency)}${x.billing === "monthly" ? " a month" : x.billing === "yearly" ? " a year" : ""}`;
}

/** Company-currency cost a month while it runs: the last payment (or a home-currency quote), a yearly one spread over 12. */
export function monthlyCost(x: Pick<ExpenseRow, "billing" | "amount" | "currency" | "last_payment">, homeCurrency: string): number | null {
  const base = x.last_payment ?? (x.currency === homeCurrency ? Number(x.amount) : null);
  if (base === null || base === undefined) return null;
  return x.billing === "yearly" ? Math.round(base / 12) : base;
}

/** Renewals overdue or due within this many days are listed under "To pay". */
export const RENEWAL_WINDOW_DAYS = 7;

export function renewalSoon(x: Pick<ExpenseRow, "status" | "renews_on">, today = todayIso()): boolean {
  return x.status === "active" && !!x.renews_on && x.renews_on <= isoPlusDays(today, RENEWAL_WINDOW_DAYS);
}

/**
 * A typed amount: digits with an optional decimal part, commas and spaces allowed,
 * more than 0, rounded to two decimals. Same rule as the database, so "1e3", ".5"
 * or "5." are refused here instead of by the server.
 */
export function readAmount(raw: string | number): number | null {
  const text = String(raw ?? "").replace(/[, ]/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Checked after rounding: 99,999,999.999 rounds to the limit and the database refuses it.
  const r = Math.round(n * 100) / 100;
  return r > 0 && r < EXPENSE_LIMITS.amount ? r : null;
}

export interface ExpenseInput {
  category: ExpenseCategory;
  title: string;
  provider: string;
  link: string;
  amount: string;
  currency: string;
  billing: Billing;
  purpose: string;
  benefit: string;
  start_date: string;
  end_date: string;
  reimburse: boolean;
}

export const emptyExpenseInput = (currency: string): ExpenseInput => ({
  category: "course",
  title: "",
  provider: "",
  link: "",
  amount: "",
  currency,
  billing: "monthly",
  purpose: "",
  benefit: "",
  start_date: "",
  end_date: "",
  reimburse: false,
});

/** Mirrors public._expense_clean: returns the first problem, or null. */
export function checkExpense(v: ExpenseInput, explain: boolean): string | null {
  const title = v.title.trim().replace(/\s+/g, " ");
  if (!EXPENSE_CATEGORIES.includes(v.category)) return "Choose what it is for.";
  if (title.length < 3) return "Give it a name, e.g. the course or the tool.";
  if (readAmount(v.amount) === null) return "Enter the cost: a number more than 0.";
  if (!/^[A-Z]{3}$/.test(v.currency)) return "Choose a currency.";
  if (v.category === "subscription" && v.billing === "once") return "A subscription is paid every month or every year. For a one-off purchase pick another kind.";
  const link = v.link.trim();
  if (link && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(link)) return "The link must start with http:// or https://.";
  // Only the dates this kind asks for (and sends, see toRpcInput): a hidden one left from another kind does not count.
  const dates = DATE_LABELS[v.category];
  const start = dates ? v.start_date : "";
  const end = dates?.[1] ? v.end_date : "";
  if (start && end && end < start) return "The end date is before the start date.";
  if (explain) {
    if (v.purpose.trim().length < EXPENSE_LIMITS.minWhy) return "Say what you will do with it, in a sentence or two.";
    if (v.benefit.trim().length < EXPENSE_LIMITS.minWhy) return "Say how it helps your work or the company: what you can improve or do better after it.";
  }
  return null;
}

/** The payload the RPCs expect (dates only where the kind uses them). */
export function toRpcInput(v: ExpenseInput): Record<string, unknown> {
  const dates = DATE_LABELS[v.category];
  return {
    category: v.category,
    title: v.title,
    provider: v.provider,
    link: v.link,
    amount: v.amount,
    currency: v.currency,
    billing: v.category === "subscription" ? v.billing : "once",
    purpose: v.purpose,
    benefit: v.benefit,
    start_date: dates ? v.start_date : "",
    end_date: dates?.[1] ? v.end_date : "",
    reimburse: v.reimburse,
  };
}

export interface PaymentInput {
  amount: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string;
  note: string;
}

export function checkPayment(p: PaymentInput, hasEmployee: boolean, currency: string, today = todayIso()): string | null {
  if (readAmount(p.amount) === null) return `Enter the amount paid in ${currency}: a number more than 0.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.paid_on) || p.paid_on < "2000-01-01") return "Enter the date it was paid.";
  if (p.paid_on > today) return "The payment date is in the future. Record it once it is paid.";
  if (!PAYMENT_METHODS.includes(p.method)) return "Choose how it was paid.";
  if (p.method === "reimbursed" && !hasEmployee) return "There is no employee to pay back on a company-wide item.";
  return null;
}

/** What to ask, by kind: the questions HR decides on. */
export const PROMPTS: Record<ExpenseCategory, { title: string; purpose: [string, string]; benefit: [string, string] }> = {
  course: {
    title: "e.g. AWS Solutions Architect, Google Data Analytics",
    purpose: ["What will you learn, and what will you do with it?", "The skills it covers and the work you will use them on."],
    benefit: ["How does it help the company?", "What you can improve, build or take over after it. Be specific: a process, a cost, a tool, a client."],
  },
  subscription: {
    title: "e.g. Claude Max, Figma, GitHub Copilot",
    purpose: ["What will you use it for?", "The tasks it is for and how often you will use it."],
    benefit: ["What does it save or improve?", "Hours saved, quality, things you can do that you cannot today."],
  },
  equipment: {
    title: "e.g. External monitor, ergonomic chair, reference books",
    purpose: ["What is it, and why do you need it?", "What is missing or not working today."],
    benefit: ["How does it help your work?", "What gets faster, safer or better."],
  },
  travel: {
    title: "e.g. Industry conference, client visit",
    purpose: ["What is the trip or event for?", "Who you will meet or what you will attend."],
    benefit: ["What does the company gain?", "Leads, learning, a deal, a relationship."],
  },
  other: {
    title: "What the money is for",
    purpose: ["What is it for?", "Explain what you need and why."],
    benefit: ["How does it help the company?", "Why it is worth paying for."],
  },
};

export const DATE_LABELS: Partial<Record<ExpenseCategory, [string, string | null]>> = {
  course: ["Starts", "Finishes"],
  subscription: ["Starts", null],
  travel: ["From", "To"],
};

/** Where an item stands, in a few words, for its row. */
export function stageLine(x: ExpenseRow, today = todayIso()): { text: string; tone: "muted" | "warning" | "primary" | "danger" | "success" } {
  // A date column is that calendar day; a timestamp (completed_at) is read in local time, not cut to its UTC day.
  const day = (d: string | null) => {
    if (!d) return "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
    return Number.isNaN(date.getTime()) ? "" : format(date, "d MMM yyyy");
  };
  switch (x.status) {
    case "pending":
      return { text: "Waiting for HR", tone: "warning" };
    case "approved":
      return { text: x.source === "request" ? `Approved by ${x.hr_by_name ?? "HR"}, waiting for Finance` : "Waiting to be paid", tone: "warning" };
    case "rejected":
      return { text: `Not approved${x.hr_note ? `: ${x.hr_note}` : ""}`, tone: "danger" };
    case "declined":
      return { text: `Declined by Finance${x.finance_note ? `: ${x.finance_note}` : ""}`, tone: "danger" };
    case "withdrawn":
      return { text: "Withdrawn", tone: "muted" };
    case "paid":
      if (x.category === "course") return x.completed_at ? { text: `Completed ${day(x.completed_at)}`, tone: "success" } : { text: "Paid, in progress", tone: "primary" };
      return { text: x.last_paid_on ? `Paid ${day(x.last_paid_on)}` : "Paid", tone: "success" };
    case "active":
      if (x.renews_on && x.renews_on < today) return { text: `Renewal overdue since ${day(x.renews_on)}`, tone: "danger" };
      if (x.renews_on && x.renews_on <= isoPlusDays(today, RENEWAL_WINDOW_DAYS)) return { text: `Renews ${day(x.renews_on)}`, tone: "warning" };
      return { text: x.renews_on ? `Renews ${day(x.renews_on)}` : "Running", tone: "primary" };
    case "ended":
      return { text: x.ended_on ? `Ended ${day(x.ended_on)}` : "Ended", tone: "muted" };
  }
}

/** Human message from a Supabase/PostgREST error. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const m = (e as { message: string }).message.trim();
    if (m) return m;
  }
  return fallback;
}
