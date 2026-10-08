import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Clock3,
  FileWarning,
  Info,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Plane,
  RefreshCcw,
  Rocket,
  Settings2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useStaffName } from "@/components/shell/UserMenu";
import { useMediaBelow } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  PageHeader,
  STATUS_COLORS,
  SectionCard,
  Skeleton,
  StatGrid,
  StatGridSkeleton,
  StatTile,
  formatDate,
  formatMonth,
  formatNumber,
  formatTime,
  useMoney,
  type StatTileProps,
} from "@/components/kit";
import { MfaGate } from "../mfa";
import { useDashboard, useRecentActivity, type DashboardData, type PayrollPoint } from "../api";
import { CountTrendChart, MonthBars, RankBars, SegmentBar, StackedBars, type RankRow } from "../components/charts";
import { CHART, compactNumber, greeting, navFind, navHref, pctChange, peopleText } from "../components/helpers";
import {
  ActivityMini,
  AttentionCard,
  CardLink,
  CardNote,
  CelebrationsCard,
  EventsCard,
  Fact,
  Headline,
  LeaveList,
  OutToday,
  type ExtraAttention,
} from "../components/widgets";

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the dashboard">
      <StatGridSkeleton />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * A kit stat tile tuned for the dashboard: on phones (two tiles per row) the icon is dropped so
 * the figure has room, and labels and hints wrap instead of being cut off mid-word.
 */
function Tile(props: StatTileProps) {
  const phone = useMediaBelow(640);
  return <StatTile {...props} icon={phone ? undefined : props.icon} className={cn("[&_p]:whitespace-normal", props.className)} />;
}

/** Wide card on the left, narrow card on the right (stacked on phones and tablets). */
function Pair({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">{children}</div>;
}

/* Span of the last card so the 2- and 3-column card grid never leaves a hole. */
const LAST_SPAN_MD = ["md:col-span-1", "md:col-span-2"] as const;
const LAST_SPAN_XL = ["xl:col-span-1", "xl:col-span-3", "xl:col-span-2"] as const;

/** Cards in a 1 / 2 / 3 column grid; the last card widens to fill its row. */
function CardGrid({ children, last }: { children: ReactNode[]; last: (wide: boolean) => ReactNode }) {
  const n = children.filter(Boolean).length + 1;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {children}
      <div className={cn("min-w-0", LAST_SPAN_MD[n % 2], LAST_SPAN_XL[n % 3])}>{last(n % 3 === 1)}</div>
    </div>
  );
}

/** "4 leave · 2 overtime", leaving out the zeros. */
function countsText(parts: [number | undefined, string][], none: string): string {
  // A no-break space keeps each count with its word, so a wrap never strands a lone "1".
  const shown = parts.filter(([n]) => (n ?? 0) > 0).map(([n, label]) => `${n}\u00a0${label}`);
  return shown.length ? shown.join(" · ") : none;
}

/** "a, b and c". */
function listText(parts: string[]): string {
  return parts.length <= 1 ? parts[0] ?? "" : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** One line under the greeting about what makes today different. */
function todayLine(d: DashboardData): string | null {
  const parts: string[] = [];
  if (!d.is_working_day) parts.push(d.holiday ? `${d.holiday} (a day off)` : "a day off for everyone");
  // Events on today, including multi-day ones that started earlier.
  const events = (d.events ?? []).filter((e) => e.date <= d.today && (e.end_date ?? e.date) >= d.today);
  if (events.length) parts.push(events.length === 1 ? `${events[0].title} is today` : `${events.length} events today`);
  const celebrating = (d.celebrations ?? []).filter((c) => c.date === d.today).length;
  if (celebrating) parts.push(`${peopleText(celebrating)} to celebrate`);
  if (d.role !== "finance") {
    const a = d.approvals;
    const waiting = (a?.leave ?? 0) + (a?.overtime ?? 0) + (a?.profile_updates ?? 0);
    if (waiting) parts.push(`${waiting} ${waiting === 1 ? "request is" : "requests are"} waiting for a decision`);
  } else if (d.payroll_month?.payslips) {
    const statuses = Object.keys(d.payroll_month.by_status ?? {});
    if (statuses.includes("draft")) parts.push(`${formatDate(d.month, "MMMM")} payroll is in draft`);
  }
  if (!parts.length) return null;
  const text = listText(parts);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/* ------------------------------------------------------------------ */
/* Payroll month helpers                                               */
/* ------------------------------------------------------------------ */

/** Months up to the latest payroll run: a month that has not been started is left off the chart. */
function runMonths<T extends { payslips: number }>(trend: T[]): T[] {
  let end = trend.length;
  while (end > 0 && !trend[end - 1].payslips) end--;
  return end > 1 ? trend.slice(0, end) : trend;
}

/** "PKR 12.96M": two decimals for headline figures, where "PKR 13M" would hide a 2% change. */
function preciseCompact(amount: number | string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(Number(amount) || 0)}`;
}

/** The current month while its payroll is still being prepared (drafts, or not everyone paid yet). */
function payrollInProgress(data: DashboardData): string | null {
  const pm = data.payroll_month;
  if (!pm?.payslips) return null;
  const draft = (pm.by_status?.draft ?? 0) > 0;
  return draft || pm.payslips < data.people.active ? data.month : null;
}

/* ------------------------------------------------------------------ */
/* Shared sections                                                     */
/* ------------------------------------------------------------------ */

const ATTENDANCE_SERIES = [
  { key: "present", label: "Present", color: STATUS_COLORS.success },
  { key: "short_leave", label: "Half day", color: STATUS_COLORS.warning },
  { key: "leave", label: "On leave", color: STATUS_COLORS.info },
  { key: "absent", label: "Absent", color: STATUS_COLORS.danger },
];

function TodayCard({ data }: { data: DashboardData }) {
  const t = data.attendance_today;
  const register = navHref("time", "/attendance");
  const marked = t ? t.expected - t.unmarked : 0;
  return (
    <SectionCard
      title="Today"
      description={t && data.is_working_day && t.expected ? `${formatDate(data.today, "EEEE d MMMM")} · ${marked} of ${t.expected} marked` : formatDate(data.today, "EEEE d MMMM")}
      icon={CalendarCheck}
      actions={<CardLink to={register}>Open the register</CardLink>}
    >
      {!data.is_working_day ? (
        <CardNote icon={CalendarCheck}>
          {data.holiday ? `${data.holiday}. ` : "A weekend or a day off. "}
          Nobody is expected in, so there is nothing to mark.
        </CardNote>
      ) : !t || t.expected === 0 ? (
        <CardNote icon={Users}>No active employees yet. Add people and the register fills in.</CardNote>
      ) : (
        <SegmentBar
          total={t.expected}
          segments={[
            { label: "present", value: t.present, className: "bg-success" },
            { label: "half day", value: t.short_leave, className: "bg-warning" },
            { label: "on leave", value: t.leave, className: "bg-info" },
            { label: "absent", value: t.absent, className: "bg-danger" },
            { label: "not marked", value: t.unmarked, className: "bg-muted-foreground/30" },
          ]}
        />
      )}
      <OutToday items={data.upcoming_leave ?? []} today={data.today} />
      {data.attendance_trend && data.attendance_trend.length > 1 && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="micro-label mb-2">Last {data.attendance_trend.length} working days</p>
          <StackedBars
            data={data.attendance_trend.map((d) => ({ ...d }))}
            xKey="date"
            xFormat={(v) => formatDate(v, "d MMM")}
            titleFormat={(v) => formatDate(v, "EEEE d MMMM")}
            series={ATTENDANCE_SERIES}
            legend
            className="h-[180px]"
          />
        </div>
      )}
    </SectionCard>
  );
}

/** Headcount trend; the chart grows to match a taller card beside it. */
function HeadcountCard({ data, description = "Active people, last 12 months" }: { data: DashboardData; description?: string }) {
  const trend = data.headcount_trend;
  const first = trend[0];
  const change = first ? data.people.active - first.active : 0;
  return (
    <SectionCard
      title="Headcount"
      description={description}
      icon={Users}
      actions={<CardLink to="/reports">Report</CardLink>}
      className="flex flex-col"
      contentClassName="flex flex-1 flex-col"
    >
      {trend.some((h) => h.active > 0) ? (
        <>
          <Headline
            label="Active today"
            value={formatNumber(data.people.active, 0)}
            delta={first ? { change, text: `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)} since ${formatDate(first.month, "MMM yyyy")}` } : null}
          >
            <Fact label="Joined this month" value={formatNumber(data.people.joiners_month, 0)} />
            <Fact label="Left this month" value={formatNumber(data.people.leavers_month, 0)} />
          </Headline>
          <CountTrendChart data={trend.map((h) => ({ ...h }))} dataKey="active" label="Active people" className="h-auto min-h-[180px] flex-1" />
        </>
      ) : (
        <CardNote icon={Users}>No employees yet.</CardNote>
      )}
    </SectionCard>
  );
}

function DepartmentsCard({ data }: { data: DashboardData }) {
  const total = data.departments.reduce((a, d) => a + d.count, 0);
  return (
    <SectionCard
      title="By department"
      description={`${peopleText(total)} in ${data.departments.length} ${data.departments.length === 1 ? "department" : "departments"}`}
      icon={Building2}
      actions={<CardLink to={navFind(/department/i, "/departments")}>Departments</CardLink>}
    >
      {data.departments.length ? (
        <RankBars
          rows={data.departments.map((d) => ({ name: d.name, value: d.count, note: total ? `${Math.round((d.count / total) * 100)}%` : undefined }))}
          moreLabel="more departments"
        />
      ) : (
        <CardNote icon={Building2}>Departments appear once people are added.</CardNote>
      )}
    </SectionCard>
  );
}

function PayrollCostCard({ data }: { data: DashboardData }) {
  const { format, currency } = useMoney();
  const trend = runMonths(data.payroll_trend ?? []);
  const partial = payrollInProgress(data);
  const done = trend.filter((p) => p.payslips > 0 && p.month !== partial);
  const last: PayrollPoint | undefined = done[done.length - 1];
  const prev: PayrollPoint | undefined = done[done.length - 2];
  const pm = data.payroll_month;
  const delta = last && prev ? pctChange(Number(last.gross), Number(prev.gross)) : null;
  const rows = trend.map((p) => ({ month: p.month, net: Number(p.net), deductions: Math.max(0, Number(p.gross) - Number(p.net)) }));
  const partialMonth = formatDate(data.month, "MMMM");
  const progress = pm ? `${formatNumber(pm.payslips, 0)} of ${formatNumber(data.people.active, 0)} payslips prepared so far` : "";
  return (
    <SectionCard
      title="Payroll cost"
      description={`Gross pay by month, in ${currency}`}
      icon={Banknote}
      actions={<CardLink to={navHref("payroll", "/payroll")}>Payroll</CardLink>}
    >
      {trend.some((p) => p.payslips > 0) ? (
        <>
          {last && (
            <Headline
              label={`${formatMonth(last.month)} · gross`}
              value={preciseCompact(last.gross, currency)}
              delta={delta && prev ? { ...delta, text: `${delta.text} vs ${formatDate(prev.month, "MMM")}` } : null}
            >
              <Fact label="Net pay" value={preciseCompact(last.net, currency)} />
              <Fact label="Deductions and tax" value={preciseCompact(Math.max(0, Number(last.gross) - Number(last.net)), currency)} />
              <Fact label="Payslips" value={formatNumber(last.payslips, 0)} />
            </Headline>
          )}
          <MonthBars
            data={rows}
            series={[
              { key: "net", label: "Net pay", color: CHART.primary },
              { key: "deductions", label: "Deductions and tax", color: CHART.sky },
            ]}
            total="Gross pay"
            format={(n) => format(n)}
            axisFormat={compactNumber}
            partial={partial}
            partialLabel="Draft"
            partialNote={progress ? `Draft: ${progress}.` : undefined}
          />
          {partial && pm && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {partialMonth} is still a draft ({progress}), so its bar is not a full month yet.
              </span>
            </p>
          )}
        </>
      ) : (
        <EmptyState compact icon={Banknote} title="No payroll yet" description="Prepare payslips for a month and the cost trend appears here." />
      )}
    </SectionCard>
  );
}

function SpendingCard({ data, spending }: { data: DashboardData; spending: NonNullable<DashboardData["spending"]> }) {
  const { format, currency } = useMoney();
  const previous = spending.trend.length > 1 ? spending.trend[spending.trend.length - 2] : undefined;
  return (
    <SectionCard
      title="Spending"
      description={`Expenses and courses, in ${currency}`}
      icon={Wallet}
      actions={<CardLink to={navFind(/^expenses\.finance$/, "/expenses")}>Expenses</CardLink>}
    >
      {spending.trend.some((t) => Number(t.total) > 0) ? (
        <>
          <Headline label={`${formatDate(data.month, "MMMM")} so far`} value={format(spending.month_total, { compact: true })}>
            <Fact label="Items" value={formatNumber(spending.month_count, 0)} />
            {previous && <Fact label={formatDate(previous.month, "MMMM")} value={format(previous.total, { compact: true })} />}
          </Headline>
          <MonthBars
            data={spending.trend.map((t) => ({ month: t.month, total: Number(t.total) }))}
            series={[{ key: "total", label: "Spent", color: CHART.violet }]}
            format={(n) => format(n)}
            partial={data.month}
            partialLabel="So far"
            partialNote="The month is not over yet."
            className="h-[170px]"
          />
        </>
      ) : (
        <CardNote icon={Wallet}>No spending recorded yet.</CardNote>
      )}
    </SectionCard>
  );
}

function StartHere({ isOwner }: { isOwner: boolean }) {
  const steps = [
    { icon: Settings2, title: "Set your working week", text: "Saturdays, Sundays and daily hours drive attendance and pay.", href: "/settings?tab=workweek" },
    { icon: UserPlus, title: "Add your people", text: "Create departments and employee records, then give each a portal password.", href: navHref("people", "/employees") },
    { icon: CalendarClock, title: "Add holidays", text: "Public holidays and company off days keep the register honest.", href: navFind(/calendar|events|holiday/i, "/events") },
    ...(isOwner ? [{ icon: KeyRound, title: "Invite HR and Finance", text: "Give each person their own account and role.", href: "/users" }] : []),
  ];
  return (
    <SectionCard title="Start here" description="A few steps to bring your workspace to life" icon={Rocket}>
      <ol className={cn("grid gap-3 sm:grid-cols-2", steps.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link to={s.href} className="flex h-full gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/30 hover:bg-muted/40">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="micro-label text-primary">Step {i + 1}</span>
                <span className="mt-0.5 block text-[13px] font-semibold text-foreground">{s.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{s.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

/* Careers pipeline stages, in funnel order (unknown stages follow, then the closed ones). */
const STAGE_ORDER = ["new", "submitted", "received", "reviewed", "screening", "shortlisted", "interview", "offered", "offer", "hired", "rejected", "withdrawn"];
const STAGE_COLOR: Record<string, string> = { hired: CHART.green, rejected: CHART.muted, withdrawn: CHART.muted };

function HiringCard({ data }: { data: DashboardData }) {
  const h = data.hiring;
  const careers = navHref("careers", "/hiring/jobs");
  const rank = (s: string) => {
    const i = STAGE_ORDER.indexOf(s);
    return i === -1 ? STAGE_ORDER.indexOf("hired") - 0.5 : i;
  };
  const rows: RankRow[] = Object.entries(h?.by_status ?? {})
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([name, value]) => ({ name: stageLabel(name), value, color: STAGE_COLOR[name] }));
  const description =
    h?.open_jobs !== undefined
      ? `${h.open_jobs} open ${h.open_jobs === 1 ? "role" : "roles"}${h.last_7_days ? ` · ${h.last_7_days} applied this week` : ""}`
      : "Applications by stage";
  return (
    <SectionCard title="Hiring" description={description} icon={Briefcase} actions={<CardLink to={careers}>Careers</CardLink>}>
      {rows.length === 0 ? (
        <CardNote icon={Briefcase}>No applications yet. Publish a role and share your careers page.</CardNote>
      ) : (
        <RankBars rows={rows} max={8} />
      )}
    </SectionCard>
  );
}

function stageLabel(s: string): string {
  const words = s.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Active people with no salary set: payroll cannot pay them. Only in the owner's and finance's data. */
function salaryExtra(data: DashboardData): ExtraAttention {
  return { key: "no_salary", label: "Active people without a salary", count: data.salary_bill?.without_salary ?? 0, href: navFind(/^payroll\.salaries$/, navHref("payroll", "/payroll")), icon: Wallet, kind: "decide" };
}

function hrExtras(data: DashboardData): ExtraAttention[] {
  const people = navHref("people", "/employees");
  return [
    { key: "profile_updates", label: "Profile changes to review", count: data.approvals?.profile_updates ?? 0, href: navFind(/^people\.updates$|employee-updates/, "/employee-updates"), icon: ClipboardList, kind: "decide" },
    { key: "incomplete", label: "Incomplete profiles", count: data.people.incomplete_profiles, href: people, icon: FileWarning },
    { key: "no_portal", label: "No portal password yet", count: data.people.no_portal_access, href: people, icon: KeyRound },
    salaryExtra(data),
  ];
}

/** "5 of 6 pending · soonest first". */
function leaveDescription(data: DashboardData): string {
  const shown = data.pending_leave?.length ?? 0;
  const total = Math.max(shown, data.approvals?.leave ?? 0);
  if (!total) return "Pending requests";
  return `${shown < total ? `${shown} of ${total}` : total} pending · soonest first`;
}

const pendingLeaveHref = () => `${navHref("leave", "/leave")}?tab=requests&status=pending`;

/** Recent activity: owner and HR read the wider feed (folded into a digest), Finance its own areas. */
function ActivityCard({ data, wide }: { data: DashboardData; wide: boolean }) {
  const feed = useRecentActivity(data.role !== "finance");
  const items =
    data.role !== "finance" && feed.data
      ? feed.data.map((a) => ({ id: a.id, action: a.action, description: a.description, created_at: a.created_at, actor: a.actor?.name ?? null, employee: a.employee?.name ?? null }))
      : data.activity;
  return <ActivityMini items={items} loading={data.role !== "finance" && feed.isPending} columns={wide} />;
}

/* ------------------------------------------------------------------ */
/* Role dashboards                                                     */
/* ------------------------------------------------------------------ */

function PeopleTiles({ data }: { data: DashboardData }) {
  const t = data.attendance_today;
  const a = data.approvals;
  const approvals = (a?.leave ?? 0) + (a?.overtime ?? 0) + (a?.profile_updates ?? 0);
  const p = data.people;
  const expected = t?.expected ?? 0;
  const present = (t?.present ?? 0) + (t?.short_leave ?? 0);
  return (
    <>
      <Tile
        label="Active employees"
        value={formatNumber(p.active, 0)}
        icon={Users}
        tone="primary"
        href={navHref("people", "/employees")}
        hint={
          p.joiners_month
            ? `${p.joiners_month} joined this month`
            : p.starting_soon
              ? `${p.starting_soon} starting soon`
              : p.separated
                ? `${p.separated} separated`
                : "No one added yet"
        }
      />
      <Tile
        label="Present today"
        value={!data.is_working_day ? "Day off" : expected === 0 ? "—" : `${present}/${expected}`}
        icon={CalendarCheck}
        tone={!data.is_working_day || expected === 0 ? "default" : (t?.unmarked ?? 0) > 0 ? "warning" : "success"}
        href={navHref("time", "/attendance")}
        hint={
          !data.is_working_day
            ? data.holiday ?? "No one is expected in"
            : expected === 0
              ? "No one is expected yet"
              : t?.unmarked
                ? `${t.unmarked} not marked yet`
                : "Everyone is marked"
        }
      />
      <Tile
        label="Pending approvals"
        value={formatNumber(approvals, 0)}
        icon={ListChecks}
        tone={approvals ? "warning" : "default"}
        href={pendingLeaveHref()}
        hint={countsText(
          [
            [a?.leave, "leave"],
            [a?.overtime, "overtime"],
            [a?.profile_updates, "profile"],
          ],
          "Nothing waiting",
        )}
      />
    </>
  );
}

function OwnerDashboard({ data }: { data: DashboardData }) {
  const { format } = useMoney();
  const empty = data.people.active === 0 && data.people.separated === 0;
  const cards = [
    <SectionCard
      key="leave"
      title="Leave to decide"
      description={leaveDescription(data)}
      icon={ListChecks}
      actions={<CardLink to={pendingLeaveHref()}>All requests</CardLink>}
      contentClassName="px-4 py-1 sm:px-5"
    >
      <LeaveList items={data.pending_leave ?? []} today={data.today} empty="No pending requests." href={pendingLeaveHref()} />
    </SectionCard>,
    <EventsCard key="events" items={data.events ?? []} today={data.today} />,
    <CelebrationsCard key="celebrations" items={data.celebrations ?? []} today={data.today} />,
    data.hiring ? <HiringCard key="hiring" data={data} /> : null,
    <DepartmentsCard key="departments" data={data} />,
    data.spending ? <SpendingCard key="spending" data={data} spending={data.spending} /> : null,
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      {empty && <StartHere isOwner />}
      <StatGrid columns={4}>
        <PeopleTiles data={data} />
        <Tile
          label="Salary bill"
          value={format(data.salary_bill?.monthly_total ?? 0, { compact: true })}
          icon={Wallet}
          href={navFind(/^payroll\.salaries$/, navHref("payroll", "/payroll"))}
          hint={data.salary_bill?.without_salary ? `${data.salary_bill.without_salary} without a salary` : "Monthly, at current pay"}
        />
      </StatGrid>

      <Pair>
        <AttentionCard wide extra={hrExtras(data)} />
        <TodayCard data={data} />
      </Pair>

      <Pair>
        <PayrollCostCard data={data} />
        <HeadcountCard data={data} />
      </Pair>

      <CardGrid last={(wide) => <ActivityCard data={data} wide={wide} />}>{cards}</CardGrid>
    </div>
  );
}

function HrDashboard({ data }: { data: DashboardData }) {
  const empty = data.people.active === 0 && data.people.separated === 0;
  const apps = data.hiring?.by_status ?? {};
  const newApps = (apps.new ?? 0) + (apps.submitted ?? 0) + (apps.received ?? 0);
  const cards = [
    <CelebrationsCard key="celebrations" items={data.celebrations ?? []} today={data.today} />,
    <EventsCard key="events" items={data.events ?? []} today={data.today} />,
    data.hiring ? <HiringCard key="hiring" data={data} /> : null,
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      {empty && <StartHere isOwner={false} />}
      <StatGrid columns={4}>
        <PeopleTiles data={data} />
        {data.hiring ? (
          <Tile
            label="New applicants"
            value={formatNumber(newApps || data.hiring.last_7_days || 0, 0)}
            icon={Briefcase}
            tone={newApps ? "primary" : "default"}
            href={navHref("careers", "/hiring/jobs")}
            hint={data.hiring.open_jobs !== undefined ? `${data.hiring.open_jobs} open ${data.hiring.open_jobs === 1 ? "role" : "roles"}` : `${data.hiring.total ?? 0} in total`}
          />
        ) : (
          <Tile
            label="Incomplete profiles"
            value={formatNumber(data.people.incomplete_profiles, 0)}
            icon={FileWarning}
            tone={data.people.incomplete_profiles ? "warning" : "default"}
            href={navHref("people", "/employees")}
            hint={data.people.incomplete_profiles ? "Missing CNIC, phone, dates or department" : "Every profile is complete"}
          />
        )}
      </StatGrid>

      <Pair>
        <AttentionCard wide extra={hrExtras(data)} />
        <TodayCard data={data} />
      </Pair>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          title="Leave to decide"
          description={leaveDescription(data)}
          icon={ListChecks}
          actions={<CardLink to={pendingLeaveHref()}>All requests</CardLink>}
          contentClassName="px-4 py-1 sm:px-5"
        >
          <LeaveList items={data.pending_leave ?? []} today={data.today} empty="No pending requests." href={pendingLeaveHref()} />
        </SectionCard>
        <SectionCard
          title="Upcoming leave"
          description="Approved, next 14 days"
          icon={Plane}
          actions={<CardLink to={`${navHref("leave", "/leave")}?tab=calendar`}>Calendar</CardLink>}
          contentClassName="px-4 py-1 sm:px-5"
        >
          <LeaveList items={data.upcoming_leave ?? []} today={data.today} empty="Nobody is away in the next two weeks." href={`${navHref("leave", "/leave")}?tab=calendar`} />
        </SectionCard>
      </div>

      <Pair>
        <HeadcountCard data={data} />
        <DepartmentsCard data={data} />
      </Pair>

      <CardGrid last={(wide) => <ActivityCard data={data} wide={wide} />}>{cards}</CardGrid>
    </div>
  );
}

function FinanceDashboard({ data }: { data: DashboardData }) {
  const { format } = useMoney();
  const pm = data.payroll_month;
  const trend = data.payroll_trend ?? [];
  const prev = [...trend].reverse().find((p) => p.month !== data.month && p.payslips > 0);
  const cost = data.cost_by_department;
  const statuses = Object.entries(pm?.by_status ?? {}).filter(([, v]) => v > 0);
  const active = data.people.active;
  const costTotal = cost?.rows.reduce((a, r) => a + Number(r.net), 0) ?? 0;
  return (
    <div className="space-y-4">
      <StatGrid columns={4}>
        <Tile
          label={`Payroll ${formatDate(data.month, "MMMM")}`}
          value={pm?.payslips ? `${pm.payslips}/${active}` : "Not started"}
          icon={ClipboardList}
          tone={pm?.payslips ? (pm.payslips >= active && !pm.by_status?.draft ? "success" : "warning") : "default"}
          href={navHref("payroll", "/payroll")}
          hint={
            pm?.payslips
              ? statuses.length
                ? statuses.map(([k, v]) => `${v} ${stageLabel(k).toLowerCase()}`).join(" · ")
                : "Payslips prepared so far"
              : `${peopleText(active)} to pay`
          }
        />
        {/* A draft month is not comparable yet, so the last finished run is the headline. */}
        <Tile
          label={prev?.payslips ? `Net pay ${formatDate(prev.month, "MMMM")}` : "Net pay this month"}
          value={prev?.payslips ? format(prev.net, { compact: true }) : pm?.payslips ? format(pm.net, { compact: true }) : "—"}
          icon={Banknote}
          tone={pm?.payslips || prev?.payslips ? "primary" : "default"}
          href={navFind(/^payroll\.reports$/, navHref("payroll", "/payroll"))}
          hint={prev?.payslips ? `Gross ${format(prev.gross, { compact: true })} · ${prev.payslips} payslips` : pm?.payslips ? `Gross ${format(pm.gross, { compact: true })} so far` : "No payslips yet"}
        />
        <Tile
          label="Salary bill"
          value={format(data.salary_bill?.monthly_total ?? 0, { compact: true })}
          icon={Wallet}
          href={navFind(/^payroll\.salaries$/, navHref("payroll", "/payroll"))}
          hint={
            data.salary_bill?.without_salary
              ? `${data.salary_bill.without_salary} active without a salary`
              : countsText([[data.salary_bill?.changes_this_month, data.salary_bill?.changes_this_month === 1 ? "pay change this month" : "pay changes this month"]], "No pay changes this month")
          }
        />
        <Tile
          label="Overtime approved"
          value={`${formatNumber(data.overtime_month?.approved_hours ?? 0, 1)} h`}
          icon={Clock3}
          hint={countsText(
            [
              [data.overtime_month?.approved_entries, data.overtime_month?.approved_entries === 1 ? "entry" : "entries"],
              [data.overtime_month?.pending_entries, "waiting on HR"],
            ],
            "None this month",
          )}
        />
      </StatGrid>

      <Pair>
        <PayrollCostCard data={data} />
        <AttentionCard title="To do in Finance" extra={[salaryExtra(data)]} />
      </Pair>

      <CardGrid last={(wide) => <ActivityCard data={data} wide={wide} />}>
        {[
          <SectionCard
            key="cost"
            title="Cost by department"
            description={cost?.month ? `Net pay, ${formatMonth(cost.month)}${cost.month === payrollInProgress(data) ? " (draft so far)" : ""}` : "Net pay of the latest payroll"}
            icon={Building2}
          >
            {cost?.rows.length ? (
              <RankBars
                rows={cost.rows.map((r) => ({ name: r.name, value: Number(r.net), note: costTotal ? `${Math.round((Number(r.net) / costTotal) * 100)}%` : undefined }))}
                format={(n) => format(n, { compact: true })}
                moreLabel="more departments"
              />
            ) : (
              <CardNote icon={Banknote}>No payslips yet.</CardNote>
            )}
          </SectionCard>,
          data.spending ? <SpendingCard key="spending" data={data} spending={data.spending} /> : <HeadcountCard key="headcount" data={data} description="People on payroll, last 12 months" />,
        ]}
      </CardGrid>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function DashboardBody() {
  const { role } = useAuth();
  const name = useStaffName();
  const query = useDashboard();
  const first = name.split(/\s+/)[0];
  // The company's today (its timezone), so the date above matches the Today card for viewers abroad.
  const today = query.data?.today;
  const eyebrow = useMemo(() => formatDate(today ?? new Date(), "EEEE, d MMMM yyyy"), [today]);
  const lede =
    (query.data && todayLine(query.data)) ??
    (role === "finance"
      ? "Payroll, pay changes and spending at a glance."
      : role === "hr"
        ? "People, time and approvals in one place."
        : "Your company's health: people, time, pay and hiring.");
  const updated = query.dataUpdatedAt ? formatTime(query.dataUpdatedAt) : null;

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={first ? `${greeting()}, ${first}.` : `${greeting()}.`}
        description={lede}
        icon={LayoutDashboard}
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground sm:inline-flex"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label={updated ? `Refresh the dashboard, last updated at ${updated}` : "Refresh the dashboard"}
            title="Refresh"
          >
            <RefreshCcw className={query.isFetching ? "animate-spin" : undefined} />
            {query.isFetching ? "Updating…" : updated ? `Updated ${updated}` : "Refresh"}
          </Button>
        }
      />
      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError || !query.data ? (
        <SectionCard>
          <EmptyState
            icon={LayoutDashboard}
            title="The dashboard could not load"
            description="Your numbers could not be fetched just now. Check your connection and try again."
            action={
              <Button size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : query.data.role === "finance" ? (
        <FinanceDashboard data={query.data} />
      ) : query.data.role === "hr" ? (
        <HrDashboard data={query.data} />
      ) : (
        <OwnerDashboard data={query.data} />
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <MfaGate>
      <DashboardBody />
    </MfaGate>
  );
}
