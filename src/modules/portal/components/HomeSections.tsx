import { Link } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import {
  ArrowRight,
  Cake,
  CalendarDays,
  FileSignature,
  Megaphone,
  PartyPopper,
  Sparkles,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";
import { EmptyState, SectionCard, StatusBadge, formatDate, formatNumber, formatRelative, formatTime, humanize, toDate } from "@/components/kit";
import { Progress } from "@/components/ui/progress";
import { useMarkPortalNotificationsRead } from "@/components/portal-shell/PortalNotificationBell";
import { cn } from "@/lib/utils";
import type { HomeAttention, HomeCelebration, HomeLeaveBalance, PortalHome } from "../api";
import { FIELD_LABELS, type EditableField } from "../api";
import { portalHref, safePortalLink } from "../links";
import { PortalAvatar } from "./PortalAvatar";

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const TODAY_LABEL: Record<string, { label: string; tone: "success" | "danger" | "warning" | "primary" }> = {
  present: { label: "Present", tone: "success" },
  late: { label: "Late", tone: "warning" },
  half_day: { label: "Half day", tone: "warning" },
  short_leave: { label: "Short leave", tone: "warning" },
  leave: { label: "On leave", tone: "primary" },
  absent: { label: "Absent", tone: "danger" },
};

function pickTime(row: Record<string, unknown> | null, keys: string[]): string | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v) return v.length <= 8 ? v.slice(0, 5) : formatTime(v, "");
  }
  return null;
}

export function HomeHero({ data }: { data: PortalHome }) {
  const first = data.employee.name.split(" ")[0] || data.employee.name;
  const today = toDate(data.today) ?? new Date();
  const status = data.attendance_today?.status ?? null;
  const holidayToday = data.holidays.find((h) => h.date === data.today);
  const inAt = pickTime(data.attendance_today, ["check_in", "check_in_time", "first_in", "time_in"]);
  const outAt = pickTime(data.attendance_today, ["check_out", "check_out_time", "last_out", "time_out"]);
  // Punched in on the time clock but not in the register yet: still show that the day has started.
  const chip = status
    ? TODAY_LABEL[status] ?? { label: humanize(status), tone: "primary" as const }
    : inAt
      ? { label: "Clocked in", tone: "success" as const }
      : null;
  const attendanceHref = portalHref("attendance");

  const meta = [data.employee.rank, data.employee.department, data.employee.employee_code].filter(Boolean).join(" · ");

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <PortalAvatar name={data.employee.name} src={data.employee.avatar_url} className="h-12 w-12 text-sm sm:h-14 sm:w-14" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{formatDate(today, "EEEE, d MMMM")}</p>
            <h1 className="mt-0.5 truncate font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {greeting()}, {first}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground" title={meta || undefined}>
              {meta || "Welcome to your portal"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/30 px-3.5 py-2 sm:flex-none">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              {chip ? (
                <StatusBadge status={status ?? "clocked_in"} label={chip.label} tone={chip.tone} />
              ) : (
                <span>{holidayToday ? holidayToday.title : "Not marked yet"}</span>
              )}
              {(inAt || outAt) && (
                <span className="tabular text-xs font-medium text-muted-foreground">
                  {inAt ?? "--:--"} – {outAt ?? "now"}
                </span>
              )}
            </div>
          </div>
          {attendanceHref && (
            <Link
              to={attendanceHref}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              My attendance <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Banners: profile incomplete, letters / policies waiting             */
/* ------------------------------------------------------------------ */

function Banner({
  icon: Icon,
  tone,
  title,
  body,
  to,
  cta,
  onOpen,
}: {
  icon: LucideIcon;
  tone: "warning" | "primary";
  title: string;
  body: string;
  to?: string;
  cta?: string;
  onOpen?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
        tone === "warning" ? "border-warning/30 bg-warning/5" : "border-primary/20 bg-primary/5",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone === "warning" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary")}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
      </div>
      {to && cta && (
        <Link
          to={to}
          onClick={onOpen}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold hover:border-primary/30 hover:text-primary"
        >
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export function HomeBanners({ data }: { data: PortalHome }) {
  const markRead = useMarkPortalNotificationsRead();
  const missing = data.profile.missing.filter((f): f is EditableField => f in FIELD_LABELS);
  const profileHref = portalHref("profile");
  const items: JSX.Element[] = [];

  data.attention.forEach((a: HomeAttention) => {
    const link = safePortalLink(a.href) ?? portalHref("notifications");
    items.push(
      <Banner
        key={a.id}
        icon={FileSignature}
        tone="primary"
        title={a.title}
        body={a.body || `Sent to you ${formatRelative(a.created_at)}.`}
        to={link}
        cta="Open"
        // Opening the banner reads the notification, so it does not come back on every visit.
        onOpen={() => markRead.mutate([a.id])}
      />,
    );
  });

  if (missing.length > 0 && !data.profile.pending_request) {
    const names = missing.slice(0, 3).map((f) => FIELD_LABELS[f].toLowerCase());
    const more = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
    items.push(
      <Banner
        key="profile"
        icon={UserRoundPen}
        tone="warning"
        title="Your profile is incomplete"
        body={`Add your ${names.join(", ")}${more} so HR and Finance have what they need.`}
        to={profileHref}
        cta="Complete profile"
      />,
    );
  }

  if (items.length === 0) return null;
  return <div className="space-y-2">{items}</div>;
}

/* ------------------------------------------------------------------ */
/* Leave balances                                                      */
/* ------------------------------------------------------------------ */

export function LeaveBalances({ balances, pending, today }: { balances: HomeLeaveBalance[]; pending: number; today: string }) {
  const href = portalHref("leave");
  // The balances are for the company's current year (from `today`), not the browser's.
  const year = (toDate(today) ?? new Date()).getFullYear();
  return (
    <SectionCard
      title="Leave balance"
      description={`${year} allowance${pending ? ` · ${pending} request${pending === 1 ? "" : "s"} pending` : ""}`}
      icon={CalendarDays}
      actions={
        href ? (
          <Link to={href} className="text-xs font-semibold text-primary hover:underline">
            Request leave
          </Link>
        ) : undefined
      }
    >
      {balances.length === 0 ? (
        <EmptyState compact icon={CalendarDays} title="No leave allowance yet" description="HR has not set up your leave balances for this year." />
      ) : (
        <ul className="space-y-3.5">
          {balances.map((b) => {
            const total = Number(b.total) || 0;
            const used = Number(b.used) || 0;
            const remaining = Number(b.remaining) || 0;
            const over = !b.unlimited && remaining < 0;
            const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
            return (
              <li key={b.leave_type_id}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-semibold">{b.name}</span>
                    {b.is_paid === false && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">Unpaid</span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {b.unlimited ? (
                      <>
                        <span className="font-semibold text-foreground">{formatNumber(used)}</span> {used === 1 ? "day" : "days"} taken
                      </>
                    ) : over ? (
                      <>
                        <span className="font-semibold text-danger">{formatNumber(Math.abs(remaining))}</span> over the {formatNumber(total)}-day allowance
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">{formatNumber(remaining)}</span> of {formatNumber(total)} left
                      </>
                    )}
                  </span>
                </div>
                {!b.unlimited && (
                  <Progress
                    value={pct}
                    className="h-1.5"
                    indicatorClassName={over ? "bg-danger" : undefined}
                    aria-label={`${b.name}: ${formatNumber(used)} of ${formatNumber(total)} days used`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export function Announcements({ items }: { items: PortalHome["announcements"] }) {
  const href = portalHref("announcements");
  return (
    <SectionCard
      title="Announcements"
      icon={Megaphone}
      flush
      actions={
        href ? (
          <Link to={href} className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState compact icon={Megaphone} title="No announcements" description="Company news from HR will show up here." />
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((a) => (
            <li key={a.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold leading-snug">{a.title}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(a.created_at)}</span>
              </div>
              {a.content && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{a.content}</p>}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Celebrations                                                        */
/* ------------------------------------------------------------------ */

function celebrationText(c: HomeCelebration): string {
  const today = c.days_until === 0;
  if (c.kind === "birthday") return c.is_me ? (today ? "Happy birthday to you!" : "Your birthday") : "Birthday";
  if (c.kind === "welcome") {
    if (c.is_me) return today ? "Your first day with the team" : "Your first day";
    return today ? "Joins the team today" : "Joins the team";
  }
  const years = c.years ?? 1;
  return `${years} year${years === 1 ? "" : "s"} with the team`;
}

function whenText(daysUntil: number, date: string): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return formatDate(date, "EEE d MMM");
}

function myCelebrationMessage(c: HomeCelebration): string {
  if (c.kind === "birthday") return "Happy birthday! Everyone at the company is celebrating with you.";
  if (c.kind === "welcome") return "Welcome aboard! Today is your first day with the team.";
  const years = c.years ?? 1;
  return `Happy work anniversary! ${years} year${years === 1 ? "" : "s"} with the team today.`;
}

export function Celebrations({ items }: { items: HomeCelebration[] }) {
  const mine = items.find((c) => c.is_me && c.days_until === 0);
  const href = portalHref("celebrations");
  return (
    <SectionCard
      title="Celebrations"
      description="Today and the next 7 days"
      icon={PartyPopper}
      flush
      actions={
        href ? (
          <Link to={href} className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        ) : undefined
      }
    >
      {mine && (
        <div className="flex items-center gap-3 border-b border-border/60 bg-primary/5 px-4 py-3 sm:px-5">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="text-xs font-semibold text-primary">{myCelebrationMessage(mine)}</p>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState compact icon={Cake} title="Nothing to celebrate this week" description="Birthdays, work anniversaries and new joiners appear here." />
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((c) => (
            <li key={`${c.employee_id}-${c.kind}-${c.date}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <PortalAvatar name={c.name} src={c.avatar_url} className="h-8 w-8 text-[10px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {c.is_me ? "You" : c.name}
                  {c.rank && !c.is_me && <span className="ml-1.5 font-medium text-muted-foreground">{c.rank}</span>}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{celebrationText(c)}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  c.days_until === 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {whenText(c.days_until, c.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Coming up (holidays and events)                                     */
/* ------------------------------------------------------------------ */

export function ComingUp({ items, today }: { items: PortalHome["holidays"]; today: string }) {
  const base = toDate(today) ?? new Date();
  return (
    <SectionCard title="Coming up" description="Holidays and company events" icon={CalendarDays} flush>
      {items.length === 0 ? (
        <EmptyState compact icon={CalendarDays} title="No upcoming holidays" description="Public holidays and company events will be listed here." />
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((h) => {
            const d = toDate(h.date);
            const days = d ? differenceInCalendarDays(d, base) : null;
            return (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-primary/15 bg-primary/5 leading-none text-primary">
                  <span className="text-[10px] font-semibold uppercase">{formatDate(h.date, "MMM")}</span>
                  <span className="tabular text-sm font-bold">{formatDate(h.date, "d")}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{h.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatDate(h.date, "EEEE")}
                    {days !== null && (days === 0 ? " · today" : days === 1 ? " · tomorrow" : ` · in ${days} days`)}
                  </p>
                </div>
                {h.type && <StatusBadge status={h.type} label={humanize(h.type)} tone={h.type.toLowerCase().includes("holiday") ? "info" : "neutral"} />}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
