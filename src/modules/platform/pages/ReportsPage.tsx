import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { endOfMonth, format as formatFns, startOfMonth } from "date-fns";
import {
  Ban,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  CircleDashed,
  Clock3,
  Download,
  FileText,
  Gauge,
  Hourglass,
  Plane,
  Search,
  TrendingDown,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  MonthPicker,
  PageHeader,
  STATUS_COLORS,
  SectionCard,
  Skeleton,
  StatGrid,
  StatGridSkeleton,
  StatTile,
  TabsNav,
  TableSkeleton,
  downloadCsv,
  exportTablePdf,
  formatDate,
  formatMonth,
  formatNumber,
  toDate,
  toDbMonth,
  useTabParam,
  type DataColumn,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import { MfaGate } from "../mfa";
import {
  useReport,
  type AttendanceReport,
  type AttendanceReportRow,
  type HeadcountReport,
  type LeaveReport,
  type LeaveReportRow,
  type OvertimeReport,
  type OvertimeReportRow,
  type PersonMove,
} from "../api";
import { CountTrendChart, RankBars, SegmentBar, StackedBars } from "../components/charts";
import { CHART, navHref, peopleText } from "../components/helpers";
import { CardNote, Fact, Headline } from "../components/widgets";

const TABS = [
  { value: "headcount", label: "Headcount", icon: Users },
  { value: "attendance", label: "Attendance", icon: CalendarCheck },
  { value: "leave", label: "Leave", icon: Plane },
  { value: "overtime", label: "Overtime hours", icon: Clock3 },
];

const ALL = "__all";

/** 8 Oct 2026 */
const day = (v: string | null | undefined) => formatDate(v, "d MMM yyyy");

function pctTone(p: number | null): string {
  if (p === null) return "text-muted-foreground";
  if (p >= 90) return "text-success";
  if (p >= 75) return "text-warning";
  return "text-danger";
}

/**
 * "1–8 Oct 2026, month to date" for the current month, "September 2026" otherwise. `through` is the
 * server's last day counted (the company's today), so the text follows the company timezone.
 */
function periodText(month: string, through?: string | null): string {
  const m = toDate(month);
  if (!m) return formatMonth(month);
  const end = through !== undefined ? toDate(through) : formatFns(m, "yyyy-MM") === formatFns(new Date(), "yyyy-MM") ? new Date() : null;
  if (end && formatFns(end, "yyyy-MM-dd") < formatFns(endOfMonth(m), "yyyy-MM-dd")) return `1–${formatFns(end, "d MMM yyyy")}, month to date`;
  return formatMonth(month);
}

function ReportError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <SectionCard>
      <EmptyState
        icon={BarChart3}
        title="This report could not load"
        description={error instanceof Error ? error.message : "Please try again."}
        action={
          <Button size="sm" onClick={retry}>
            Try again
          </Button>
        }
      />
    </SectionCard>
  );
}

function ExportButtons({ onCsv, onPdf, disabled }: { onCsv: () => void; onPdf: () => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onCsv();
          toast.success("CSV downloaded");
        }}
        disabled={disabled}
      >
        <Download /> CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => {
          setBusy(true);
          onPdf()
            .then(() => toast.success("PDF downloaded"))
            .catch((e: Error) => toast.error("Could not create the PDF", { description: e.message }))
            .finally(() => setBusy(false));
        }}
      >
        <FileText /> {busy ? "Preparing…" : "PDF"}
      </Button>
    </div>
  );
}

/** What the report covers on the left, its exports on the right. */
function ReportToolbar({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <CalendarRange className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">{summary}</span>
      </p>
      {children}
    </div>
  );
}

/** Search box and department filter above a report table. */
function TableFilters({
  search,
  onSearch,
  department,
  onDepartment,
  departments,
  shown,
  total,
}: {
  search: string;
  onSearch: (v: string) => void;
  department: string;
  onDepartment: (v: string) => void;
  departments: string[];
  shown: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <div className="relative min-w-0 sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-9 rounded-lg bg-card pl-8 pr-8 text-[13px]" />
        {search && (
          <button
            type="button"
            onClick={() => onSearch("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {departments.length > 1 && (
        <Select value={department} onValueChange={onDepartment}>
          <SelectTrigger className="h-9 w-full rounded-lg bg-card text-[13px] sm:w-[190px]" aria-label="Filter by department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="tabular text-xs text-muted-foreground sm:ml-auto">{shown === total ? peopleText(total) : `${shown} of ${peopleText(total)}`}</p>
    </div>
  );
}

/** Client-side search and department filter for the per-person tables. */
function usePeopleFilter<T extends { name: string; department: string | null; code?: string | null }>(rows: T[]) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState(ALL);
  const departments = useMemo(() => [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort(), [rows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) => (department === ALL || r.department === department) && (!q || r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q) || (r.department ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search, department]);
  return { search, setSearch, department, setDepartment, departments, filtered };
}

function NameCell({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold" title={name}>
        {name}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{sub || "—"}</p>
    </div>
  );
}

function TabSkeleton({ table = true }: { table?: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-14 rounded-2xl" />
      <StatGridSkeleton />
      {table ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Headcount                                                           */
/* ------------------------------------------------------------------ */

function MovesList({ rows, empty }: { rows: PersonMove[]; empty: string }) {
  const people = navHref("people", "/employees");
  if (!rows.length) return <CardNote icon={Users}>{empty}</CardNote>;
  return (
    <ul className="-mx-2 divide-y divide-border/60">
      {rows.map((r) => (
        <li key={`${r.employee_id}-${r.date}`}>
          <Link to={`${people}/${r.employee_id}`} className="group flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 text-[13px] hover:bg-muted/50">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground group-hover:text-primary">{r.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{[r.rank, r.department].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="tabular shrink-0 text-xs text-muted-foreground">{day(r.date)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Ranks are only worth a chart when several people share one (not when every title is unique). */
function informative(rows: { count: number }[]): boolean {
  return rows.length > 1 && rows.some((r) => r.count > 1) && rows.length <= rows.reduce((a, r) => a + r.count, 0) * 0.6;
}

function HeadcountTab({ month }: { month: string }) {
  const { company } = useAuth();
  const q = useReport<HeadcountReport>("headcount", month);
  if (q.isPending) return <TabSkeleton table={false} />;
  if (q.isError || !q.data) return <ReportError error={q.error} retry={() => void q.refetch()} />;
  const r = q.data;
  const t = r.tenure;
  const prev = r.trend.length > 1 ? r.trend[r.trend.length - 2] : undefined;
  const first = r.trend[0];
  const leavers12 = r.trend.reduce((a, m) => a + m.leavers, 0);
  const joiners12 = r.trend.reduce((a, m) => a + m.joiners, 0);
  const avgActive = r.trend.length ? r.trend.reduce((a, m) => a + m.active, 0) / r.trend.length : 0;
  const attrition = avgActive ? (leavers12 / avgActive) * 100 : null;
  const genderTotal = r.by_gender.reduce((a, g) => a + g.count, 0);
  const deptTotal = r.by_department.reduce((a, d) => a + d.count, 0);
  const genderClass = ["bg-chart-1", "bg-chart-5", "bg-chart-7", "bg-muted-foreground/40"];
  const showRank = informative(r.by_rank);

  const csv = () =>
    downloadCsv(
      [
        ["Headcount", formatMonth(r.month)],
        ["Active on", day(r.as_of), r.active],
        ["Joiners", "", r.joiners.length],
        ["Leavers", "", r.leavers.length],
        ["Attrition, last 12 months (%)", "", attrition === null ? "" : Number(attrition.toFixed(1))],
        ["Profiles to finish", "", r.incomplete_profiles],
        ["Without portal access", "", r.no_portal_access],
        [],
        ["Department", "People"],
        ...r.by_department.map((d) => [d.name, d.count]),
        [],
        ["Rank", "People"],
        ...r.by_rank.map((d) => [d.name, d.count]),
        [],
        ["Gender", "People"],
        ...r.by_gender.map((d) => [d.name, d.count]),
        [],
        ["Month", "Active", "Joiners", "Leavers"],
        ...r.trend.map((m) => [formatMonth(m.month), m.active, m.joiners, m.leavers]),
      ],
      `headcount-${month.slice(0, 7)}`,
    );
  const pdf = () =>
    exportTablePdf({
      title: "Headcount report",
      subtitle: `${formatMonth(r.month)} · ${r.active} active on ${day(r.as_of)}`,
      company: { name: company?.name, logo: company?.logo },
      columns: ["Department", "People", "Share"],
      rows: r.by_department.map((d) => [d.name, String(d.count), deptTotal ? `${Math.round((d.count / deptTotal) * 100)}%` : ""]),
      numericColumns: [1, 2],
      filename: `headcount-${month.slice(0, 7)}.pdf`,
    });

  return (
    <div className="space-y-4">
      <ReportToolbar
        summary={
          <>
            <span className="font-semibold text-foreground">{formatMonth(r.month)}</span> · {formatNumber(r.active, 0)} active on {day(r.as_of)}
          </>
        }
      >
        <ExportButtons onCsv={csv} onPdf={pdf} />
      </ReportToolbar>
      <StatGrid columns={4}>
        <StatTile
          label="Active"
          value={formatNumber(r.active, 0)}
          icon={Users}
          tone="primary"
          hint={prev ? `${r.active - prev.active >= 0 ? "+" : "−"}${Math.abs(r.active - prev.active)} vs ${formatDate(prev.month, "MMMM")}` : `On ${day(r.as_of)}`}
        />
        <StatTile
          label="Joiners"
          value={formatNumber(r.joiners.length, 0)}
          icon={UserPlus}
          tone={r.joiners.length ? "success" : "default"}
          hint={prev ? `${prev.joiners} in ${formatDate(prev.month, "MMMM")}` : formatMonth(r.month)}
        />
        <StatTile
          label="Leavers"
          value={formatNumber(r.leavers.length, 0)}
          icon={UserMinus}
          tone={r.leavers.length ? "warning" : "default"}
          hint={prev ? `${prev.leavers} in ${formatDate(prev.month, "MMMM")}` : formatMonth(r.month)}
        />
        <StatTile
          label="Attrition, 12 months"
          value={attrition === null ? "—" : `${formatNumber(attrition, 1)}%`}
          icon={TrendingDown}
          tone={attrition !== null && attrition > 15 ? "warning" : "default"}
          hint={`${leavers12} ${leavers12 === 1 ? "leaver" : "leavers"} ÷ average headcount`}
        />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Active people" description="End of each month, last 12 months" className="flex flex-col" contentClassName="flex flex-1 flex-col">
          <Headline
            label="Change over 12 months"
            value={first ? `${r.active - first.active >= 0 ? "+" : "−"}${Math.abs(r.active - first.active)}` : "—"}
          >
            <Fact label={first ? `${formatDate(first.month, "MMM yyyy")}` : "Start"} value={first ? formatNumber(first.active, 0) : "—"} />
            <Fact label="Now" value={formatNumber(r.active, 0)} />
          </Headline>
          <CountTrendChart data={r.trend.map((m) => ({ ...m }))} dataKey="active" label="Active people" className="h-auto min-h-[200px] flex-1" />
        </SectionCard>
        <SectionCard title="Joiners and leavers" description="People who joined or left each month">
          <Headline label="Last 12 months" value={`${joiners12 - leavers12 >= 0 ? "+" : "−"}${Math.abs(joiners12 - leavers12)} net`}>
            <Fact label="Joined" value={formatNumber(joiners12, 0)} />
            <Fact label="Left" value={formatNumber(leavers12, 0)} />
          </Headline>
          <StackedBars
            data={r.trend.map((m) => ({ ...m }))}
            xKey="month"
            xFormat={(v) => formatDate(v, "MMM")}
            titleFormat={(v) => formatMonth(v)}
            stacked={false}
            legend
            series={[
              { key: "joiners", label: "Joiners", color: STATUS_COLORS.success },
              { key: "leavers", label: "Leavers", color: STATUS_COLORS.danger },
            ]}
          />
        </SectionCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionCard title="By department" description={`${r.by_department.length} departments`} icon={Building2}>
            {r.by_department.length ? (
              <RankBars
                rows={r.by_department.map((d) => ({ name: d.name, value: d.count, note: deptTotal ? `${Math.round((d.count / deptTotal) * 100)}%` : undefined }))}
                max={8}
                moreLabel="more departments"
              />
            ) : (
              <CardNote icon={Building2}>No one yet.</CardNote>
            )}
          </SectionCard>
          {showRank && (
            <SectionCard title="By rank">
              <RankBars rows={r.by_rank.map((d) => ({ name: d.name, value: d.count }))} max={8} colorIndex={2} moreLabel="more ranks" />
            </SectionCard>
          )}
        </div>
        <div className="space-y-4">
          <SectionCard title="By gender" description={peopleText(genderTotal)} icon={Users}>
            {r.by_gender.length ? (
              <SegmentBar
                total={genderTotal}
                percent
                segments={r.by_gender.map((g, i) => ({ label: g.name, value: g.count, className: genderClass[Math.min(i, genderClass.length - 1)] }))}
              />
            ) : (
              <CardNote icon={Users}>No one yet.</CardNote>
            )}
          </SectionCard>
          <SectionCard title="Tenure" description="Time since joining" icon={CalendarRange}>
            <RankBars
              rows={[
                { name: "Under 1 year", value: t.under_1 },
                { name: "1–3 years", value: t.one_to_3 },
                { name: "3–5 years", value: t.three_to_5 },
                { name: "Over 5 years", value: t.over_5 },
                ...(t.unknown ? [{ name: "No joining date", value: t.unknown }] : []),
              ].map((x) => ({ ...x, note: r.active ? `${Math.round((x.value / Math.max(1, t.under_1 + t.one_to_3 + t.three_to_5 + t.over_5 + t.unknown)) * 100)}%` : undefined }))}
              colorIndex={1}
            />
          </SectionCard>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title={`Joined in ${formatDate(r.month, "MMMM")}`} description={peopleText(r.joiners.length)} icon={UserPlus} contentClassName="px-4 py-2 sm:px-5">
          <MovesList rows={r.joiners} empty="Nobody joined this month." />
        </SectionCard>
        <SectionCard title={`Left in ${formatDate(r.month, "MMMM")}`} description={peopleText(r.leavers.length)} icon={UserMinus} contentClassName="px-4 py-2 sm:px-5">
          <MovesList rows={r.leavers} empty="Nobody left this month." />
        </SectionCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Share of the marked working days that were worked. Days nobody has marked yet (today, early
 * in the morning) are left out instead of counting as missed; they are reported on their own.
 */
function attendanceRate(x: Pick<AttendanceReportRow, "working_days" | "unmarked" | "days_worked">): number | null {
  const marked = x.working_days - x.unmarked;
  return marked > 0 ? (Number(x.days_worked) / marked) * 100 : null;
}

function AttendanceTab({ month }: { month: string }) {
  const { company } = useAuth();
  const navigate = useNavigate();
  const people = navHref("people", "/employees");
  const q = useReport<AttendanceReport>("attendance", month);
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const filter = usePeopleFilter(rows);

  const columns: DataColumn<AttendanceReportRow>[] = [
    { id: "name", header: "Employee", sortValue: (r) => r.name.toLowerCase(), cell: (r) => <NameCell name={r.name} sub={[r.code, r.department].filter(Boolean).join(" · ")} /> },
    { id: "wd", header: "Working days", align: "right", hideBelow: "lg", sortValue: (r) => r.working_days, cell: (r) => r.working_days },
    { id: "present", header: "Present", align: "right", sortValue: (r) => r.present, cell: (r) => r.present },
    { id: "half", header: "Half day", align: "right", hideBelow: "md", sortValue: (r) => r.short_leave, cell: (r) => r.short_leave },
    { id: "leave", header: "Leave", align: "right", hideBelow: "md", sortValue: (r) => r.leave, cell: (r) => r.leave },
    { id: "absent", header: "Absent", align: "right", sortValue: (r) => r.absent, cell: (r) => <span className={cn(r.absent > 0 && "font-semibold text-danger")}>{r.absent}</span> },
    { id: "unmarked", header: "Unmarked", align: "right", hideBelow: "lg", sortValue: (r) => r.unmarked, cell: (r) => <span className={cn(r.unmarked > 0 && "text-warning")}>{r.unmarked}</span> },
    {
      id: "pct",
      header: "Attendance",
      align: "right",
      sortValue: (r) => attendanceRate(r) ?? -1,
      cell: (r) => {
        const p = attendanceRate(r);
        return (
          <span className={cn("font-bold", pctTone(p))} title={`${formatNumber(Number(r.days_worked), 1)} of ${r.working_days - r.unmarked} marked working days`}>
            {p === null ? "—" : `${formatNumber(p, 1)}%`}
          </span>
        );
      },
    },
  ];

  if (q.isPending) return <TabSkeleton />;
  if (q.isError || !q.data) return <ReportError error={q.error} retry={() => void q.refetch()} />;
  const r = q.data;
  const totals = r.rows.reduce(
    (a, x) => ({ wd: a.wd + x.working_days, worked: a.worked + Number(x.days_worked), absent: a.absent + x.absent, unmarked: a.unmarked + x.unmarked, leave: a.leave + x.leave }),
    { wd: 0, worked: 0, absent: 0, unmarked: 0, leave: 0 },
  );
  const overall = attendanceRate({ working_days: totals.wd, unmarked: totals.unmarked, days_worked: totals.worked });
  const byDept = Object.values(
    r.rows.reduce<Record<string, { name: string; working_days: number; unmarked: number; days_worked: number }>>((acc, x) => {
      const k = x.department ?? "No department";
      acc[k] = acc[k] ?? { name: k, working_days: 0, unmarked: 0, days_worked: 0 };
      acc[k].working_days += x.working_days;
      acc[k].unmarked += x.unmarked;
      acc[k].days_worked += Number(x.days_worked);
      return acc;
    }, {}),
  )
    .map((d) => ({ name: d.name, value: attendanceRate(d) }))
    .filter((d): d is { name: string; value: number } => d.value !== null)
    .sort((a, b) => b.value - a.value);
  const header = ["Employee", "Code", "Department", "Working days", "Present", "Half day", "Leave", "Absent", "Unmarked", "Days worked", "Attendance %"];
  const asRow = (x: AttendanceReportRow) => {
    const p = attendanceRate(x);
    return [x.name, x.code ?? "", x.department ?? "", x.working_days, x.present, x.short_leave, x.leave, x.absent, x.unmarked, Number(x.days_worked), p === null ? "" : Number(p.toFixed(1))];
  };

  return (
    <div className="space-y-4">
      <ReportToolbar
        summary={
          <>
            <span className="font-semibold text-foreground">{periodText(r.month, r.through)}</span> · {r.working_days} working {r.working_days === 1 ? "day" : "days"} · {peopleText(r.rows.length)}
          </>
        }
      >
        <ExportButtons
          disabled={!r.rows.length}
          onCsv={() => downloadCsv([header, ...r.rows.map(asRow)], `attendance-${month.slice(0, 7)}`)}
          onPdf={() =>
            exportTablePdf({
              title: "Attendance report",
              subtitle: `${formatMonth(r.month)} · ${r.working_days} working days${r.through ? ` up to ${day(r.through)}` : ""}`,
              company: { name: company?.name, logo: company?.logo },
              orientation: "landscape",
              columns: header.filter((h) => h !== "Code"),
              rows: r.rows.map((x) => asRow(x).filter((_, i) => i !== 1).map((c) => (typeof c === "number" ? formatNumber(c, 1) : String(c)))),
              numericColumns: [2, 3, 4, 5, 6, 7, 8, 9],
              filename: `attendance-${month.slice(0, 7)}.pdf`,
            })
          }
        />
      </ReportToolbar>
      <StatGrid columns={4}>
        <StatTile label="Attendance" value={overall === null ? "—" : `${formatNumber(overall, 1)}%`} icon={CalendarCheck} tone={overall === null ? "default" : overall >= 90 ? "success" : overall >= 75 ? "warning" : "danger"} hint="Days worked ÷ marked working days" />
        <StatTile label="Working days" value={formatNumber(r.working_days, 0)} icon={CalendarDays} hint={r.through ? `Up to ${day(r.through)}` : "Month not started"} />
        <StatTile label="Absences" value={formatNumber(totals.absent, 0)} icon={CalendarX2} tone={totals.absent ? "danger" : "default"} hint={`${formatNumber(totals.leave, 0)} days on approved leave`} />
        <StatTile label="Not marked" value={formatNumber(totals.unmarked, 0)} icon={CircleDashed} tone={totals.unmarked ? "warning" : "success"} hint="Working days with no entry yet" />
      </StatGrid>
      <div className="space-y-4">
        <SectionCard title="By department" description="Attendance rate, highest first" icon={Building2}>
          {byDept.length ? (
            <RankBars rows={byDept} format={(n) => `${formatNumber(n, 1)}%`} scale={100} max={12} color={CHART.green} moreLabel="more departments" className="grid gap-x-8 gap-y-3 space-y-0 sm:grid-cols-2 xl:grid-cols-3" />
          ) : (
            <CardNote icon={Building2}>No working days yet.</CardNote>
          )}
        </SectionCard>
        <SectionCard title={`Attendance by person, ${formatMonth(r.month)}`} description="Attendance is days worked out of marked working days. Approved leave on an unmarked day counts as leave; each person counts only their own working days (personal weekends, joining and leaving dates)." flush>
          {r.rows.length > 0 && (
            <TableFilters
              search={filter.search}
              onSearch={filter.setSearch}
              department={filter.department}
              onDepartment={filter.setDepartment}
              departments={filter.departments}
              shown={filter.filtered.length}
              total={r.rows.length}
            />
          )}
          <DataTable
            columns={columns}
            rows={filter.filtered}
            getRowId={(x) => x.employee_id}
            pageSize={25}
            initialSort={{ column: "name" }}
            caption="Attendance by employee"
            onRowClick={(x) => navigate(`${people}/${x.employee_id}`)}
            empty={
              r.rows.length ? (
                <EmptyState compact icon={Search} title="No one matches" description="Try another name or department." />
              ) : (
                <EmptyState compact icon={CalendarCheck} title="No one to report" description="Active employees appear here once they have joined." />
              )
            }
          />
        </SectionCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leave                                                               */
/* ------------------------------------------------------------------ */

function LeaveTab({ year }: { year: string }) {
  const { company } = useAuth();
  const navigate = useNavigate();
  const people = navHref("people", "/employees");
  const q = useReport<LeaveReport>("leave", year);
  const r = q.data;
  const types = useMemo(() => r?.types ?? [], [r?.types]);
  const rows = useMemo(() => r?.rows ?? [], [r?.rows]);
  const filter = usePeopleFilter(rows);

  const columns = useMemo<DataColumn<LeaveReportRow>[]>(
    () => [
      { id: "name", header: "Employee", sortValue: (x) => x.name.toLowerCase(), cell: (x) => <NameCell name={x.name} sub={x.department ?? ""} /> },
      ...types.map<DataColumn<LeaveReportRow>>((t, i) => ({
        id: `t-${t.id}`,
        header: t.name,
        align: "right",
        hideBelow: i > 1 ? "lg" : i > 0 ? "md" : undefined,
        sortValue: (x) => x.by_type[t.id]?.used ?? 0,
        cell: (x) => {
          const c = x.by_type[t.id];
          if (!c) return "—";
          const capped = Number(c.allowance) > 0;
          const title = `${t.name}: ${formatNumber(c.used, 1)} used${capped ? ` of ${formatNumber(c.allowance, 1)}` : ""}${c.pending > 0 ? `, ${formatNumber(c.pending, 1)} pending` : ""}`;
          return (
            <span className="whitespace-nowrap" title={title}>
              <span className={cn("font-semibold", Number(c.used) === 0 && "font-normal text-muted-foreground")}>{formatNumber(c.used, 1)}</span>
              {capped && <span className="text-muted-foreground">/{formatNumber(c.allowance, 1)}</span>}
              {c.pending > 0 && <span className="ml-1 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">+{formatNumber(c.pending, 1)}</span>}
            </span>
          );
        },
      })),
      { id: "used", header: "Used", align: "right", sortValue: (x) => x.used, cell: (x) => <span className="font-bold">{formatNumber(x.used, 1)}</span> },
      { id: "pending", header: "Pending", align: "right", hideBelow: "sm", sortValue: (x) => x.pending, cell: (x) => <span className={cn(x.pending > 0 ? "font-semibold text-warning" : "text-muted-foreground")}>{formatNumber(x.pending, 1)}</span> },
    ],
    [types],
  );

  if (q.isPending) return <TabSkeleton />;
  if (q.isError || !r) return <ReportError error={q.error} retry={() => void q.refetch()} />;

  const header = ["Employee", "Department", ...types.flatMap((t) => [`${t.name} used`, `${t.name} allowance`, `${t.name} pending`, `${t.name} remaining`]), "Total used", "Total pending"];
  const asRow = (x: LeaveReportRow) => [
    x.name,
    x.department ?? "",
    ...types.flatMap((t) => {
      const c = x.by_type[t.id];
      return [c?.used ?? 0, c?.allowance ?? 0, c?.pending ?? 0, c?.remaining ?? 0];
    }),
    x.used,
    x.pending,
  ];
  const totalUsed = r.rows.reduce((a, x) => a + Number(x.used), 0);
  const totalPending = r.rows.reduce((a, x) => a + Number(x.pending), 0);
  const byType = types
    .map((t) => ({ name: t.name, value: r.rows.reduce((a, x) => a + Number(x.by_type[t.id]?.used ?? 0), 0) }))
    .sort((a, b) => b.value - a.value);
  const takers = r.rows.filter((x) => Number(x.used) > 0).length;
  const days = (n: number) => `${formatNumber(n, 1)} ${n === 1 ? "day" : "days"}`;

  return (
    <div className="space-y-4">
      <ReportToolbar
        summary={
          <>
            <span className="font-semibold text-foreground">{r.year}</span> · approved leave starting in the year · {peopleText(r.rows.length)}
          </>
        }
      >
        <ExportButtons
          disabled={!r.rows.length}
          onCsv={() => downloadCsv([header, ...r.rows.map(asRow)], `leave-${r.year}`)}
          onPdf={() =>
            exportTablePdf({
              title: "Leave report",
              subtitle: `${r.year} · used / allowance per type`,
              company: { name: company?.name, logo: company?.logo },
              orientation: types.length > 3 ? "landscape" : "portrait",
              columns: ["Employee", ...types.map((t) => t.name), "Used", "Pending"],
              rows: r.rows.map((x) => [
                x.name,
                ...types.map((t) => {
                  const c = x.by_type[t.id];
                  if (!c) return "—";
                  return Number(c.allowance) > 0 ? `${formatNumber(c.used, 1)}/${formatNumber(c.allowance, 1)}` : formatNumber(c.used, 1);
                }),
                formatNumber(x.used, 1),
                formatNumber(x.pending, 1),
              ]),
              numericColumns: types.map((_, i) => i + 1).concat([types.length + 1, types.length + 2]),
              filename: `leave-${r.year}.pdf`,
            })
          }
        />
      </ReportToolbar>
      <StatGrid columns={4}>
        <StatTile label="Days taken" value={formatNumber(totalUsed, 1)} icon={Plane} tone="primary" hint={`Approved, starting in ${r.year}`} />
        <StatTile label="Days pending" value={formatNumber(totalPending, 1)} icon={Hourglass} tone={totalPending ? "warning" : "default"} hint="Waiting for a decision" />
        <StatTile label="Average per person" value={r.rows.length ? formatNumber(totalUsed / r.rows.length, 1) : "—"} icon={Gauge} hint={`Across ${peopleText(r.rows.length)}`} />
        <StatTile label="People who took leave" value={formatNumber(takers, 0)} icon={UserCheck} hint={r.rows.length ? `${Math.round((takers / r.rows.length) * 100)}% of everyone` : "—"} />
      </StatGrid>
      <div className="space-y-4">
        <SectionCard title="By type" description="Days taken, most first" icon={Plane}>
          {byType.length ? (
            <RankBars rows={byType} format={days} max={9} colorIndex={1} moreLabel="more types" className="grid gap-x-8 gap-y-3 space-y-0 sm:grid-cols-2 xl:grid-cols-3" />
          ) : (
            <CardNote icon={Plane}>No active leave types.</CardNote>
          )}
        </SectionCard>
        <SectionCard title={`Leave by person, ${r.year}`} description="Days used / allowance per type; amber shows days waiting for a decision" flush>
          {r.rows.length > 0 && (
            <TableFilters
              search={filter.search}
              onSearch={filter.setSearch}
              department={filter.department}
              onDepartment={filter.setDepartment}
              departments={filter.departments}
              shown={filter.filtered.length}
              total={r.rows.length}
            />
          )}
          <DataTable
            columns={columns}
            rows={filter.filtered}
            getRowId={(x) => x.employee_id}
            pageSize={25}
            initialSort={{ column: "name" }}
            caption="Leave usage by employee"
            onRowClick={(x) => navigate(`${people}/${x.employee_id}`)}
            empty={
              r.rows.length ? (
                <EmptyState compact icon={Search} title="No one matches" description="Try another name or department." />
              ) : (
                <EmptyState compact icon={Plane} title="No one to report" description="Active employees and active leave types appear here." />
              )
            }
          />
        </SectionCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overtime                                                            */
/* ------------------------------------------------------------------ */

function OvertimeTab({ month }: { month: string }) {
  const { company } = useAuth();
  const navigate = useNavigate();
  const people = navHref("people", "/employees");
  const q = useReport<OvertimeReport>("overtime", month);
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const filter = usePeopleFilter(rows);
  const hours = (n: number) => `${formatNumber(n, 1)} h`;

  const columns: DataColumn<OvertimeReportRow>[] = [
    { id: "name", header: "Employee", sortValue: (r) => r.name.toLowerCase(), cell: (r) => <NameCell name={r.name} sub={r.department ?? ""} /> },
    { id: "approved", header: "Approved", align: "right", sortValue: (r) => r.approved, cell: (r) => <span className="font-bold">{hours(r.approved)}</span> },
    { id: "regular", header: "Working day", align: "right", hideBelow: "lg", sortValue: (r) => r.regular, cell: (r) => hours(r.regular) },
    { id: "weekend", header: "Weekend", align: "right", hideBelow: "lg", sortValue: (r) => r.weekend, cell: (r) => hours(r.weekend) },
    { id: "holiday", header: "Holiday", align: "right", hideBelow: "lg", sortValue: (r) => r.holiday, cell: (r) => hours(r.holiday) },
    { id: "pending", header: "Pending", align: "right", sortValue: (r) => r.pending, cell: (r) => <span className={cn(r.pending > 0 ? "font-semibold text-warning" : "text-muted-foreground")}>{hours(r.pending)}</span> },
    { id: "rejected", header: "Rejected", align: "right", hideBelow: "md", sortValue: (r) => r.rejected, cell: (r) => <span className="text-muted-foreground">{hours(r.rejected)}</span> },
  ];

  if (q.isPending) return <TabSkeleton />;
  if (q.isError || !q.data) return <ReportError error={q.error} retry={() => void q.refetch()} />;
  const r = q.data;
  const sum = (k: keyof OvertimeReportRow) => r.rows.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const approved = sum("approved");
  const withOvertime = r.rows.filter((x) => x.approved > 0).length;
  const byDept = Object.values(
    r.rows.reduce<Record<string, { name: string; value: number }>>((acc, x) => {
      const k = x.department ?? "No department";
      acc[k] = acc[k] ?? { name: k, value: 0 };
      acc[k].value += Number(x.approved);
      return acc;
    }, {}),
  )
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const header = ["Employee", "Department", "Approved hours", "Working day", "Weekend", "Holiday", "Pending", "Rejected", "Entries"];
  const asRow = (x: OvertimeReportRow) => [x.name, x.department ?? "", x.approved, x.regular, x.weekend, x.holiday, x.pending, x.rejected, x.entries];

  return (
    <div className="space-y-4">
      <ReportToolbar
        summary={
          <>
            <span className="font-semibold text-foreground">{periodText(r.month)}</span> · hours only, overtime pay is priced by Finance in Payroll
          </>
        }
      >
        <ExportButtons
          disabled={!r.rows.length}
          onCsv={() => downloadCsv([header, ...r.rows.map(asRow)], `overtime-hours-${month.slice(0, 7)}`)}
          onPdf={() =>
            exportTablePdf({
              title: "Overtime hours",
              subtitle: formatMonth(r.month),
              company: { name: company?.name, logo: company?.logo },
              columns: ["Employee", "Approved", "Working day", "Weekend", "Holiday", "Pending", "Rejected"],
              rows: r.rows.map((x) => [x.name, ...[x.approved, x.regular, x.weekend, x.holiday, x.pending, x.rejected].map((n) => formatNumber(n, 1))]),
              numericColumns: [1, 2, 3, 4, 5, 6],
              filename: `overtime-hours-${month.slice(0, 7)}.pdf`,
            })
          }
        />
      </ReportToolbar>
      <StatGrid columns={4}>
        <StatTile label="Approved" value={hours(approved)} icon={Clock3} tone="primary" hint={peopleText(withOvertime)} />
        <StatTile label="Average per person" value={withOvertime ? hours(approved / withOvertime) : "—"} icon={Gauge} hint="Among people with overtime" />
        <StatTile label="Pending" value={hours(sum("pending"))} icon={Hourglass} tone={sum("pending") ? "warning" : "default"} hint="Waiting for HR" />
        <StatTile label="Rejected" value={hours(sum("rejected"))} icon={Ban} hint={`${formatNumber(sum("entries"), 0)} ${sum("entries") === 1 ? "entry" : "entries"} in total`} />
      </StatGrid>
      <div className="space-y-4">
        <SectionCard title="By department" description="Approved hours, most first" icon={Building2}>
          {byDept.length ? (
            <RankBars rows={byDept} format={hours} max={9} colorIndex={3} moreLabel="more departments" className="grid gap-x-8 gap-y-3 space-y-0 sm:grid-cols-2 xl:grid-cols-3" />
          ) : (
            <CardNote icon={Clock3}>No approved overtime in this month.</CardNote>
          )}
        </SectionCard>
        <SectionCard title={`Overtime by person, ${formatMonth(r.month)}`} description="Approved, pending and rejected hours" flush>
          {r.rows.length > 0 && (
            <TableFilters
              search={filter.search}
              onSearch={filter.setSearch}
              department={filter.department}
              onDepartment={filter.setDepartment}
              departments={filter.departments}
              shown={filter.filtered.length}
              total={r.rows.length}
            />
          )}
          <DataTable
            columns={columns}
            rows={filter.filtered}
            getRowId={(x) => x.employee_id}
            pageSize={25}
            initialSort={{ column: "approved", direction: "desc" }}
            caption="Overtime hours by employee"
            onRowClick={(x) => navigate(`${people}/${x.employee_id}`)}
            empty={
              r.rows.length ? (
                <EmptyState compact icon={Search} title="No one matches" description="Try another name or department." />
              ) : (
                <EmptyState compact icon={Clock3} title="No overtime this month" description="Overtime entries recorded by HR appear here. Pick an earlier month to see past hours." />
              )
            }
          />
        </SectionCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/** Month (`?month=2026-09`) and year (`?year=2026`) live in the URL, so a report link opens the same period. */
function usePeriod() {
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const thisYear = now.getFullYear();
  const rawMonth = params.get("month");
  const parsed = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? toDate(`${rawMonth}-01`) : null;
  const month = parsed && parsed <= now ? parsed : startOfMonth(now);
  const rawYear = Number(params.get("year"));
  const year = String(rawYear >= 2000 && rawYear <= thisYear ? rawYear : thisYear);
  const set = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  return {
    month,
    year,
    thisYear,
    setMonth: (d: Date) => set("month", d > now ? null : formatFns(d, "yyyy-MM")),
    setYear: (y: string) => set("year", y === String(thisYear) ? null : y),
  };
}

function ReportsBody() {
  const [tab] = useTabParam(TABS);
  const period = usePeriod();
  const dbMonth = toDbMonth(period.month);

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="Headcount, attendance, leave and overtime hours. Pay reports live in Payroll."
        icon={BarChart3}
        actions={
          tab === "leave" ? (
            <Select value={period.year} onValueChange={period.setYear}>
              <SelectTrigger className="h-9 w-[120px] rounded-xl text-[13px]" aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* The last six years, plus an older year opened from a shared link. */}
                {[...new Set([...Array.from({ length: 6 }, (_, i) => String(period.thisYear - i)), period.year])].map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <MonthPicker selectedMonth={period.month} onMonthChange={period.setMonth} />
          )
        }
      >
        <TabsNav tabs={TABS} />
      </PageHeader>
      {tab === "attendance" ? (
        <AttendanceTab month={dbMonth} />
      ) : tab === "leave" ? (
        <LeaveTab year={period.year} />
      ) : tab === "overtime" ? (
        <OvertimeTab month={dbMonth} />
      ) : (
        <HeadcountTab month={dbMonth} />
      )}
    </>
  );
}

export default function ReportsPage() {
  return (
    <MfaGate>
      <ReportsBody />
    </MfaGate>
  );
}
