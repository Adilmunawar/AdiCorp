import { differenceInCalendarDays } from "date-fns";
import {
  Banknote,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Cpu,
  FileSignature,
  FileText,
  Fingerprint,
  History,
  KeyRound,
  Laptop,
  ListChecks,
  LogOut,
  Mail,
  Megaphone,
  MessageSquareWarning,
  Plane,
  Receipt,
  Settings,
  ShieldCheck,
  Timer,
  UserRound,
  UsersRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { adminNav } from "@/modules/registry";
import { formatDate, formatNumber, humanize, toDate } from "@/components/kit";

/*
 * Plain helpers for the dashboard, reports and timeline. They live apart from the component
 * files so those stay Fast Refresh boundaries (a file that mixes components and helpers makes
 * every edit reload its importers).
 */

/** Brand chart colours (tokens from src/styles/palette.css). */
export const CHART = {
  primary: "hsl(var(--chart-1))",
  sky: "hsl(var(--chart-2))",
  green: "hsl(var(--chart-3))",
  amber: "hsl(var(--chart-4))",
  violet: "hsl(var(--chart-5))",
  red: "hsl(var(--chart-6))",
  teal: "hsl(var(--chart-7))",
  muted: "hsl(var(--muted-foreground) / 0.35)",
} as const;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

/** "1.5M", "250K", "900" for a y-axis. */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Href of a module's first nav item (keys start with the module id), so links follow each module's routes. */
export function navHref(moduleId: string, fallback: string): string {
  return adminNav.find((n) => n.key.startsWith(`${moduleId}.`))?.href ?? fallback;
}

/** Href of the first nav item whose key or href matches `pattern`. */
export function navFind(pattern: RegExp, fallback: string): string {
  return adminNav.find((n) => pattern.test(n.key) || pattern.test(n.href))?.href ?? fallback;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "Today", "Tomorrow", or "Fri 10 Oct". */
export function dayLabel(value: string, today: string): string {
  const d = toDate(value);
  const t = toDate(today);
  if (!d || !t) return formatDate(value, "d MMM yyyy");
  const diff = differenceInCalendarDays(d, t);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return formatDate(d, "EEE d MMM");
}

/**
 * Short enough for a narrow card line: "Today", "Tue 20 Oct", "Tomorrow – 10 Oct", "13–17 Oct",
 * "28 Oct – 3 Nov". The day count sits beside it, so weekday names are left out of ranges.
 */
export function rangeLabel(start: string, end: string, today: string): string {
  if (!end || end === start) return dayLabel(start, today);
  const s = toDate(start);
  const e = toDate(end);
  const first = dayLabel(start, today);
  if (!s || !e) return `${first} – ${formatDate(end, "d MMM")}`;
  if (first === "Today" || first === "Tomorrow") return `${first} – ${formatDate(e, "d MMM")}`;
  if (s < (toDate(today) ?? s)) return `Until ${formatDate(e, "d MMM")}`;
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  return sameMonth ? `${formatDate(s, "d")}–${formatDate(e, "d MMM")}` : `${formatDate(s, "d MMM")} – ${formatDate(e, "d MMM")}`;
}

export function daysText(n: number | string): string {
  const v = Number(n);
  if (v === 0.5) return "Half day";
  return `${formatNumber(v, v % 1 ? 1 : 0)} ${v === 1 ? "day" : "days"}`;
}

/** "1 person", "3 people". */
export function peopleText(n: number): string {
  return `${formatNumber(n, 0)} ${n === 1 ? "person" : "people"}`;
}

export interface Delta {
  /** Signed change; only its sign is used for the arrow. */
  change: number;
  text: string;
  /** Colour the chip only when up or down clearly means good or bad. */
  tone?: "neutral" | "good" | "bad";
}

/** Percentage change, e.g. "+2.3%"; null when there is no base to compare with. */
export function pctChange(now: number, before: number | null | undefined): Delta | null {
  if (!before) return null;
  const change = ((now - before) / before) * 100;
  const rounded = Math.abs(change) < 0.05 ? 0 : change;
  return { change: rounded, text: `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${formatNumber(Math.abs(rounded), 1)}%` };
}


/* ------------------------------------------------------------------ */
/* Activity: areas, readable text and grouping                         */
/* ------------------------------------------------------------------ */

const AREAS: Record<string, { label: string; icon: LucideIcon }> = {
  "2fa": { label: "Two-step verification", icon: ShieldCheck },
  account: { label: "Account and sign-in", icon: KeyRound },
  announcement: { label: "Announcements", icon: Megaphone },
  asset: { label: "Assets", icon: Laptop },
  attendance: { label: "Attendance", icon: CalendarCheck },
  biometric: { label: "Biometric devices", icon: Fingerprint },
  careers: { label: "Hiring", icon: Briefcase },
  checklist: { label: "Checklists", icon: ClipboardCheck },
  complaint: { label: "Complaints", icon: MessageSquareWarning },
  correction: { label: "Punch corrections", icon: Clock3 },
  department: { label: "Departments", icon: Building2 },
  employee: { label: "People", icon: UserRound },
  events: { label: "Calendar", icon: CalendarDays },
  expense: { label: "Expenses", icon: Receipt },
  leave: { label: "Leave", icon: Plane },
  letter: { label: "Letters", icon: Mail },
  offboarding: { label: "Offboarding", icon: LogOut },
  onboarding: { label: "Onboarding", icon: ListChecks },
  overtime: { label: "Overtime", icon: Timer },
  payroll: { label: "Payroll", icon: Banknote },
  policy: { label: "Policies", icon: FileSignature },
  poll: { label: "Polls", icon: Vote },
  settings: { label: "Settings", icon: Settings },
  staff: { label: "Staff accounts", icon: UsersRound },
  system: { label: "System", icon: Cpu },
  time: { label: "Time settings", icon: Clock3 },
  general: { label: "General", icon: History },
};

/** Readable name and icon of an activity area ("correction" → "Punch corrections"). */
export function areaMeta(area: string | null | undefined): { label: string; icon: LucideIcon } {
  const key = (area || "general").toLowerCase();
  return AREAS[key] ?? { label: humanize(key), icon: FileText };
}

/** Area of an action such as "leave.approved" or "attendance_save". */
export function actionArea(action: string): string {
  return action.split(/[._]/)[0] || "general";
}

/** Tidies stored wording for display: "1 day(s)" → "1 day", "3 day(s)" → "3 days". */
export function tidyDescription(text: string): string {
  return text.replace(/\b1 ([a-z]+)\(s\)/gi, "1 $1").replace(/(\d+(?:\.\d+)?) ([a-z]+)\(s\)/gi, "$1 $2s");
}

/** "Rabia Butt" / "Rabia Butt and Saboor Aly" / "Rabia Butt, Saboor Aly and 5 others". */
function namesText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

export interface ActivityLike {
  id: string;
  action: string;
  description: string;
  created_at: string;
  actor: string | null;
  employee: string | null;
}

export interface ActivityGroup<T extends ActivityLike> {
  key: string;
  first: T;
  items: T[];
  /** Combined sentence for a group of people doing the same thing, or the first entry's description. */
  text: string;
  /** Entries folded in that the sentence does not already name. */
  more: number;
}

/**
 * Folds entries that say the same thing about different people ("Rabia Butt voted in the poll X",
 * "Saboor Aly voted in the poll X") into one line: "Rabia Butt, Saboor Aly and 5 others voted in
 * the poll X". `consecutive` only folds neighbours (an audit trail keeps its order); otherwise
 * matching entries anywhere in the list join the newest one (a digest).
 */
export function groupActivity<T extends ActivityLike>(items: T[], consecutive = false): ActivityGroup<T>[] {
  const groups: (ActivityGroup<T> & { predicate: string | null; names: string[] })[] = [];
  const byKey = new Map<string, number>();
  for (const it of items) {
    const description = tidyDescription(it.description || humanize(it.action.split(".").pop()));
    const predicate = it.employee && description.startsWith(`${it.employee} `) ? description.slice(it.employee.length) : null;
    const key = `${it.action}|${predicate ?? description}|${predicate ? "" : it.employee ?? ""}`;
    const last = groups[groups.length - 1];
    const index = consecutive ? (last && last.key === key ? groups.length - 1 : -1) : byKey.get(key) ?? -1;
    if (index >= 0) {
      const g = groups[index];
      g.items.push(it);
      if (it.employee && !g.names.includes(it.employee)) g.names.push(it.employee);
      continue;
    }
    byKey.set(key, groups.length);
    groups.push({ key, first: it, items: [it], predicate, names: it.employee ? [it.employee] : [], text: description, more: 0 });
  }
  return groups.map(({ predicate, names, ...g }) =>
    predicate && names.length > 1 ? { ...g, text: `${namesText(names)}${predicate}`, more: Math.max(0, g.items.length - names.length) } : { ...g, more: g.items.length - 1 },
  );
}

