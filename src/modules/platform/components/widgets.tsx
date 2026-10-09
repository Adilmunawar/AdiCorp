import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Cake,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Inbox,
  Minus,
  PartyPopper,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMediaBelow } from "@/hooks/use-mobile";
import { adminNav } from "@/modules/registry";
import { useNavBadges, useRequestNavBadges } from "@/components/shell/nav-badges";
import { EmptyState, SectionCard, Skeleton, StatusBadge, formatDate, formatDateTime, formatNumber, formatRelative, initials, toDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { Celebration, EventItem, LeaveItem } from "../api";
import { actionArea, areaMeta, dayLabel, daysText, groupActivity, navFind, navHref, rangeLabel, type ActivityLike, type Delta } from "./helpers";

/**
 * Text link in a card header. The visible text stays small; an invisible box around it makes
 * the tap target at least 40px tall on phones.
 */
export function CardLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="relative inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded text-xs font-medium text-primary after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:underline"
    >
      {children} <ArrowRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

/** Quiet, consistent empty line for small dashboard cards. */
export function CardNote({ icon: Icon = Inbox, children, className }: { icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-3", className)}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <p className="text-[13px] leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Headline figure above a chart                                        */
/* ------------------------------------------------------------------ */

export function DeltaChip({ delta, className }: { delta: Delta; className?: string }) {
  const Icon = delta.change > 0 ? ArrowUpRight : delta.change < 0 ? ArrowDownRight : Minus;
  const tone = delta.tone ?? "neutral";
  return (
    <span
      className={cn(
        "tabular inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "good" && "bg-success-soft text-success",
        tone === "bad" && "bg-danger-soft text-danger",
        tone === "neutral" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {delta.text}
    </span>
  );
}

/** Big figure, its label and change on the left; supporting facts on the right (below on phones). */
export function Headline({ label, value, delta, children, className }: { label: React.ReactNode; value: React.ReactNode; delta?: Delta | null; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0">
        <p className="micro-label">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tabular whitespace-nowrap font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">{value}</span>
          {delta && <DeltaChip delta={delta} />}
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

/** "Label value" pair beside a headline. */
export function Fact({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular whitespace-nowrap text-[13px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Needs attention: every module's nav badge, for the current role     */
/* ------------------------------------------------------------------ */

export interface ExtraAttention {
  key: string;
  label: string;
  count: number;
  href: string;
  icon: LucideIcon;
  kind?: AttentionKind;
}

type AttentionKind = "decide" | "follow";

/**
 * What a module's sidebar badge counts, in words, and whether it waits on a decision or is a
 * follow-up. The sidebar only has room for the page name ("Documents 37"); here there is room
 * to say what the number means. Unknown keys fall back to the nav label as a follow-up.
 */
const ATTENTION: Record<string, { label: string; kind: AttentionKind; href?: string }> = {
  "leave.requests": { label: "Leave requests to decide", kind: "decide", href: "/leave?tab=requests&status=pending" },
  "leave.overtime": { label: "Overtime to approve", kind: "decide", href: "/overtime-hours?status=pending" },
  "time.corrections": { label: "Punch corrections to review", kind: "decide" },
  "people.updates": { label: "Profile changes to review", kind: "decide" },
  "expenses.requests": { label: "Expense requests to decide", kind: "decide" },
  "expenses.finance": { label: "Expenses to pay or renew", kind: "decide" },
  "payroll.updates": { label: "HR updates to process", kind: "decide" },
  "payroll.overtime": { label: "Approved overtime to price", kind: "decide" },
  "careers.applicants": { label: "New applicants", kind: "follow", href: "/hiring/applicants?stage=new" },
  "engagement.messages": { label: "Unread messages", kind: "follow" },
  "engagement.complaints": { label: "Open complaints", kind: "follow", href: "/complaints?tab=pending" },
  "people.documents": { label: "Missing documents", kind: "follow" },
  "people.onboarding": { label: "Overdue onboarding tasks", kind: "follow", href: "/checklists?status=overdue" },
  "policies.policies": { label: "Policy signatures outstanding", kind: "follow" },
  "policies.letters": { label: "Letters past their reply date", kind: "follow" },
};

interface AttentionItem {
  key: string;
  label: string;
  count: number;
  href: string;
  icon: LucideIcon;
  kind: AttentionKind;
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const decide = item.kind === "decide";
  return (
    <li className="min-w-0">
      <Link
        to={item.href}
        className="group flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-10"
      >
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", decide ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
          <item.icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-foreground">{item.label}</span>
        <span
          className={cn(
            "tabular min-w-[1.75rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold",
            decide ? "bg-warning-soft text-warning" : "bg-muted text-foreground",
          )}
        >
          {item.count > 99 ? "99+" : item.count}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

function AttentionGroup({ title, items, total, wide }: { title: string; items: AttentionItem[]; total: number; wide: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="micro-label flex items-center gap-2 px-2.5 pb-1 pt-2">
        {title}
        <span className="tabular rounded-full bg-muted px-1.5 py-px text-[10px] normal-case tracking-normal text-foreground">{formatNumber(total, 0)}</span>
      </p>
      <ul className={cn("grid gap-0.5", wide && "sm:grid-cols-2 sm:gap-x-2")}>
        {items.map((x) => (
          <AttentionRow key={x.key} item={x} />
        ))}
      </ul>
    </div>
  );
}

const PHONE_LIMIT = 6;

/**
 * Pending work across modules, split into decisions and follow-ups and sorted by size. Each
 * module's sidebar badge (shared by the shell) is the source of truth, so new modules appear here automatically;
 * `extra` adds dashboard-only items (skipped when a module badge already links to the same
 * page, so nothing is listed twice). `wide` lays rows out in two columns from 640px up.
 */
export function AttentionCard({ extra = [], title = "Needs attention", wide = false }: { extra?: ExtraAttention[]; title?: string; wide?: boolean }) {
  const { role } = useAuth();
  const phone = useMediaBelow(640);
  const [showAll, setShowAll] = useState(false);
  // The shell runs every badge hook once and shares the counts, so no module query or realtime
  // subscription is opened twice. Phones only load them when the drawer opens, so ask for them here.
  useRequestNavBadges();
  const counts = useNavBadges();
  const [settled, setSettled] = useState(false);

  const navItems = useMemo(() => adminNav.filter((n) => n.useBadge && role && n.roles.includes(role) && !n.key.startsWith("platform.")), [role]);

  // Badge hooks report 0 while loading, so give them a moment before saying "All clear".
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  const covered = new Set(navItems.map((n) => n.href));
  const all: AttentionItem[] = [
    ...navItems.map((n) => ({
      key: n.key,
      label: ATTENTION[n.key]?.label ?? n.label,
      kind: ATTENTION[n.key]?.kind ?? ("follow" as const),
      count: counts[n.key] ?? 0,
      // The badge counts one state (pending, overdue, new); land on that filter, not the whole page.
      href: ATTENTION[n.key]?.href ?? n.href,
      icon: n.icon,
    })),
    ...extra.filter((x) => !covered.has(x.href)).map((x) => ({ ...x, kind: x.kind ?? ("follow" as const) })),
  ]
    .filter((x) => x.count > 0)
    .sort((a, b) => (a.kind === b.kind ? b.count - a.count : a.kind === "decide" ? -1 : 1));

  const limit = phone && !showAll ? PHONE_LIMIT : all.length;
  const shown = all.slice(0, limit);
  const decide = shown.filter((x) => x.kind === "decide");
  const follow = shown.filter((x) => x.kind === "follow");
  const sum = (kind: AttentionKind) => all.filter((x) => x.kind === kind).reduce((a, x) => a + x.count, 0);
  const loading = all.length === 0 && !settled;

  return (
    <SectionCard
      title={title}
      description={all.length ? `${all.length} ${all.length === 1 ? "area" : "areas"} waiting on you or your team` : "Waiting on you or your team"}
      icon={Inbox}
      className="flex flex-col"
      contentClassName="flex flex-1 flex-col p-2 sm:p-2.5"
    >
      {loading ? (
        <div className={cn("grid gap-2 p-2", wide && "sm:grid-cols-2")} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 rounded-xl" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState compact icon={CheckCircle2} title="All clear" description="Nothing is waiting for a decision right now." />
        </div>
      ) : (
        <div className="space-y-1">
          <AttentionGroup title="To decide" items={decide} total={sum("decide")} wide={wide} />
          <AttentionGroup title="To follow up" items={follow} total={sum("follow")} wide={wide} />
          {all.length > PHONE_LIMIT && phone && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl text-xs font-semibold text-primary hover:bg-muted/60"
              aria-expanded={showAll}
            >
              {showAll ? "Show fewer" : `Show all ${all.length}`}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} aria-hidden />
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

function Avatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/[0.08] text-[10px] font-semibold text-primary", className)} aria-hidden>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

/** Leave requests as rows; each row opens `href` (the pending list or the calendar). */
export function LeaveList({ items, today, empty, href }: { items: LeaveItem[]; today: string; empty: string; href: string }) {
  if (!items.length) return <div className="py-3"><CardNote icon={CalendarDays}>{empty}</CardNote></div>;
  return (
    <ul className="-mx-2 divide-y divide-border/60">
      {items.map((r) => (
        <li key={r.id}>
          <Link to={href} className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50">
            <Avatar name={r.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-5 text-foreground group-hover:text-primary" title={r.name}>
                {r.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {r.type_name ?? "Leave"} · <span className="tabular">{rangeLabel(r.start_date, r.end_date, today)}</span>
              </p>
            </div>
            <span className="tabular shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{daysText(r.days_count)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Small avatars of people away today, with their leave type on hover. */
export function OutToday({ items, today }: { items: LeaveItem[]; today: string }) {
  const away = items.filter((l) => l.start_date <= today && l.end_date >= today);
  if (!away.length) return null;
  const people = navHref("people", "/employees");
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="micro-label">Away today</p>
      <ul className="flex flex-wrap gap-2">
        {away.slice(0, 6).map((l) => (
          <li key={l.id}>
            <Link
              to={`${people}/${l.employee_id}`}
              className="relative flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-foreground transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] hover:border-primary/30 hover:text-primary"
              title={`${l.name}: ${l.type_name ?? "Leave"}, ${rangeLabel(l.start_date, l.end_date, today).toLowerCase()}`}
            >
              <Avatar name={l.name} className="h-6 w-6 text-[9px]" />
              {l.name.split(/\s+/)[0]}
              <span className="text-muted-foreground">· {l.type_name ?? "Leave"}</span>
            </Link>
          </li>
        ))}
        {away.length > 6 && <li className="self-center text-xs text-muted-foreground">+{away.length - 6} more</li>}
      </ul>
    </div>
  );
}

const CELEBRATION_META: Record<Celebration["kind"], { icon: LucideIcon; label: (c: Celebration) => string; tone: string }> = {
  birthday: { icon: Cake, label: () => "Birthday", tone: "bg-chart-5/10 text-chart-5" },
  anniversary: { icon: PartyPopper, label: (c) => `${c.years} ${c.years === 1 ? "year" : "years"} with us`, tone: "bg-primary/10 text-primary" },
  joining: { icon: Sparkles, label: () => "Joins the team", tone: "bg-success-soft text-success" },
};

export function CelebrationsCard({ items, today }: { items: Celebration[]; today: string }) {
  const people = navHref("people", "/employees");
  const todayCount = items.filter((c) => c.date === today).length;
  return (
    <SectionCard
      title="Celebrations"
      description={todayCount ? `${todayCount} today · next 7 days` : "Next 7 days"}
      icon={PartyPopper}
      contentClassName="p-3 sm:p-4"
    >
      {items.length === 0 ? (
        <CardNote icon={Cake}>Nothing to celebrate in the next 7 days.</CardNote>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 8).map((c) => {
            const meta = CELEBRATION_META[c.kind];
            const isToday = c.date === today;
            return (
              <li key={`${c.kind}-${c.employee_id}-${c.date}`}>
                <Link
                  to={`${people}/${c.employee_id}`}
                  className={cn("group flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/50", isToday && "bg-primary/[0.04] ring-1 ring-primary/15")}
                >
                  <Avatar name={c.name} url={c.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-5 text-foreground group-hover:text-primary" title={c.name}>
                      {c.name}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <meta.icon className="h-3 w-3 shrink-0" aria-hidden /> {meta.label(c)}
                    </p>
                  </div>
                  <span className={cn("tabular shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", isToday ? meta.tone : "text-muted-foreground")}>
                    {dayLabel(c.date, today)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/** "Today", "Tomorrow", "Friday · in 8 days", or "On now · until Fri 16 Oct" for an event that started earlier. */
function whenText(value: string, today: string, end?: string | null): string {
  const d = toDate(value);
  const t = toDate(today);
  if (!d || !t) return formatDate(value, "d MMM yyyy");
  const diff = differenceInCalendarDays(d, t);
  if (diff < 0) return end && end !== today ? `On now · until ${formatDate(end, "EEE d MMM")}` : "On now · ends today";
  if (diff === 0) return end && end !== value ? `Today · until ${formatDate(end, "EEE d MMM")}` : "Today";
  if (diff === 1) return "Tomorrow";
  return `${formatDate(d, "EEEE")} · in ${diff} days`;
}

export function EventsCard({ items, today }: { items: EventItem[]; today: string }) {
  return (
    <SectionCard
      title="Coming up"
      description="Holidays and events, next 30 days"
      icon={CalendarDays}
      actions={<CardLink to={navFind(/calendar|events|holiday/i, "/events")}>Calendar</CardLink>}
      contentClassName="p-3 sm:p-4"
    >
      {items.length === 0 ? (
        <CardNote icon={CalendarDays}>Nothing on the calendar for the next 30 days.</CardNote>
      ) : (
        <ul className="space-y-3">
          {items.map((ev) => {
            const d = toDate(ev.date);
            const isToday = ev.date <= today && (ev.end_date ?? ev.date) >= today;
            return (
              <li key={ev.id} className="flex items-center gap-3" title={ev.description ?? undefined}>
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border",
                    isToday ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-muted/40",
                  )}
                >
                  <span className="text-[9px] font-bold uppercase leading-3 text-primary">{d ? formatDate(d, "MMM") : ""}</span>
                  <span className="tabular text-sm font-bold leading-4 text-foreground">{d ? formatDate(d, "d") : ""}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-foreground">{ev.title}</p>
                  <p className={cn("text-xs", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{whenText(ev.date, today, ev.end_date)}</p>
                </div>
                <StatusBadge status={ev.type} className="shrink-0" />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

/** Latest activity, folded into a digest. `columns` lays it out in two columns on wide screens. */
export function ActivityMini({ items, loading, columns = false }: { items: ActivityLike[]; loading?: boolean; columns?: boolean }) {
  const groups = useMemo(() => groupActivity(items).slice(0, columns ? 8 : 6), [items, columns]);
  return (
    <SectionCard
      title="Recent activity"
      description="Across the workspace, similar entries folded together"
      icon={Activity}
      actions={<CardLink to="/timeline">Timeline</CardLink>}
      contentClassName="p-3 sm:p-4"
    >
      {loading ? (
        <div className={cn("grid gap-3", columns && "lg:grid-cols-2 lg:gap-x-8")} aria-busy="true">
          {Array.from({ length: columns ? 8 : 5 }, (_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <CardNote icon={Activity}>Nothing yet. Actions across the workspace appear here.</CardNote>
      ) : (
        <ol className={cn("grid gap-3", columns && "lg:grid-cols-2 lg:gap-x-8")}>
          {groups.map((g) => {
            const area = areaMeta(actionArea(g.first.action));
            const by = g.first.actor ?? (g.first.employee ? "Employee portal" : null);
            return (
              <li key={g.first.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <span className="relative flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground" title={area.label}>
                  <area.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="line-clamp-3 text-[13px] leading-5 text-foreground sm:line-clamp-2" title={g.text}>
                    {g.text}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {[area.label, g.more > 0 ? `+${g.more} more` : null, by].filter(Boolean).join(" · ")}
                    {" · "}
                    <time dateTime={g.first.created_at} title={formatDateTime(g.first.created_at)}>
                      {formatRelative(g.first.created_at)}
                    </time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
