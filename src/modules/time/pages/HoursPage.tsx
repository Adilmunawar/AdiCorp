import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, startOfMonth } from "date-fns";
import { AlarmClockOff, Download, Gauge, Hourglass, Loader2, Timer, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, EmptyState, FilterBar, MonthPicker, PageHeader, SectionCard, StatGrid, StatTile, downloadCsv, type DataColumn } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useMediaBelow } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useCompanyToday, useHoursReport, useSaveTimeSettings } from "../api";
import { formatMinutes, monthStart, shiftLabel } from "../lib";
import type { HoursReportRow } from "../types";
import { DepartmentSelect, PersonCell, ShareBar } from "../components/shared";

export default function HoursPage() {
  const { isHR } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [department, setDepartment] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const monthStr = monthStart(month);
  const { data, isLoading } = useHoursReport(monthStr, department);
  const saveSettings = useSaveTimeSettings();
  const today = useCompanyToday();
  const [threshold, setThreshold] = useState<string>("");
  const phone = useMediaBelow(640);

  useEffect(() => {
    if (data) setThreshold(String(data.threshold));
  }, [data?.threshold]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = data?.threshold ?? 90;
  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (onlyFlagged && !(r.pct !== null && r.pct < t)) return false;
      if (!q) return true;
      return `${r.name} ${r.code ?? ""} ${r.department ?? ""}`.toLowerCase().includes(q);
    });
  }, [data?.rows, search, onlyFlagged, t]);

  const stats = useMemo(() => {
    const list = data?.rows ?? [];
    const measured = list.reduce((n, r) => n + r.measured_days, 0);
    const worked = list.reduce((n, r) => n + r.worked_minutes, 0);
    return {
      below: list.filter((r) => r.pct !== null && r.pct < t).length,
      avgDay: measured > 0 ? Math.round(worked / measured) : null,
      noOut: list.reduce((n, r) => n + r.no_out_days, 0),
      late: list.reduce((n, r) => n + r.late_days, 0),
      through: list.find((r) => r.through)?.through ?? null,
    };
  }, [data?.rows, t]);

  const columns: DataColumn<HoursReportRow>[] = [
    {
      id: "name",
      header: "Employee",
      sortValue: (r) => r.name,
      hideOnCard: true,
      cell: (r) => <PersonCell name={r.name} code={r.code} sub={r.department ?? shiftLabel(r.shift_type)} avatarUrl={r.avatar_url} />,
    },
    { id: "days", header: "Days", align: "right", sortValue: (r) => r.measured_days, cell: (r) => <span className="tabular text-xs" title={`${r.measured_days} measured of ${r.working_days} working days`}>{r.measured_days}/{r.working_days}</span> },
    { id: "target", header: "Expected", align: "right", hideBelow: "md", hideOnCard: true, sortValue: (r) => r.target_minutes, cell: (r) => <span className="tabular text-xs">{formatMinutes(r.target_minutes)}</span> },
    { id: "worked", header: "Worked", align: "right", sortValue: (r) => r.worked_minutes, cell: (r) => <span className="tabular text-xs font-semibold">{formatMinutes(r.worked_minutes)}</span> },
    { id: "short", header: "Short", align: "right", hideBelow: "lg", sortValue: (r) => r.short_minutes, cell: (r) => <span className={cn("tabular text-xs", r.short_minutes > 0 && "text-destructive")}>{formatMinutes(r.short_minutes)}</span> },
    { id: "share", header: "Share", sortValue: (r) => r.pct, cell: (r) => <ShareBar pct={r.pct} threshold={t} /> },
    { id: "late", header: "Late", align: "right", hideBelow: "md", sortValue: (r) => r.late_days, cell: (r) => <span className="tabular text-xs" title={`${r.late_minutes} minutes`}>{r.late_days}</span> },
    { id: "early", header: "Early", align: "right", hideBelow: "lg", hideOnCard: true, sortValue: (r) => r.early_days, cell: (r) => <span className="tabular text-xs" title={`${r.early_minutes} minutes`}>{r.early_days}</span> },
    { id: "noout", header: "No out", align: "right", hideBelow: "md", sortValue: (r) => r.no_out_days, cell: (r) => <span className={cn("tabular text-xs", r.no_out_days > 0 && "font-semibold text-info")}>{r.no_out_days}</span> },
    { id: "absent", header: "Absent", align: "right", hideBelow: "lg", sortValue: (r) => r.absent_days, cell: (r) => <span className={cn("tabular text-xs", r.absent_days > 0 && "text-destructive")}>{r.absent_days}</span> },
    { id: "leave", header: "Leave", align: "right", hideBelow: "lg", hideOnCard: true, sortValue: (r) => r.leave_days, cell: (r) => <span className="tabular text-xs">{r.leave_days}</span> },
  ];

  const exportCsv = () =>
    downloadCsv(rows, `hours-${monthStr.slice(0, 7)}.csv`, [
      { header: "Code", value: (r) => r.code },
      { header: "Name", value: (r) => r.name },
      { header: "Department", value: (r) => r.department },
      { header: "Measured days", value: (r) => r.measured_days },
      { header: "Working days", value: (r) => r.working_days },
      { header: "Expected hours", value: (r) => (r.target_minutes / 60).toFixed(2) },
      { header: "Worked hours", value: (r) => (r.worked_minutes / 60).toFixed(2) },
      { header: "Short hours", value: (r) => (r.short_minutes / 60).toFixed(2) },
      { header: "Share %", value: (r) => (r.pct ?? "") },
      { header: "Late days", value: (r) => r.late_days },
      { header: "Late minutes", value: (r) => r.late_minutes },
      { header: "Early days", value: (r) => r.early_days },
      { header: "No out-punch days", value: (r) => r.no_out_days },
      { header: "Absent days", value: (r) => r.absent_days },
      { header: "Leave days", value: (r) => r.leave_days },
      { header: "Marked without punches", value: (r) => r.unmeasured_days },
      { header: "Minutes on days off", value: (r) => r.offday_minutes },
    ]);

  const thresholdNum = Number(threshold);
  const thresholdValid = threshold === "" || (Number.isInteger(thresholdNum) && thresholdNum >= 50 && thresholdNum <= 100);
  const thresholdDirty = threshold !== "" && thresholdNum !== data?.threshold;
  const isFutureMonth = monthStr > `${today.slice(0, 8)}01`;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Hours"
        eyebrow="Time"
        icon={Hourglass}
        description="Worked time against each person's shift target. Only days with an in and an out punch are measured."
        actions={
          <>
            <MonthPicker selectedMonth={month} onMonthChange={setMonth} />
            <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </>
        }
      />

      <StatGrid columns={4}>
        <StatTile label="Below target" value={isLoading ? "—" : stats.below} hint={`Under ${t}% of target`} tone={stats.below > 0 ? "danger" : "success"} icon={phone ? undefined : TrendingDown} loading={isLoading} />
        <StatTile label="Average day" value={formatMinutes(stats.avgDay)} hint="Measured days" tone="primary" icon={phone ? undefined : Timer} loading={isLoading} />
        <StatTile label="No out-punch" value={stats.noOut} hint="Missing check-outs" tone={stats.noOut > 0 ? "warning" : "default"} icon={phone ? undefined : AlarmClockOff} href="/attendance/corrections" loading={isLoading} />
        <div className="flex h-full min-w-0 items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="micro-label truncate">Threshold</p>
            {isLoading ? (
              <Skeleton className="mt-2.5 h-7 w-24" />
            ) : (
              <form
                className="mt-1.5 flex flex-wrap items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (thresholdDirty && thresholdValid) saveSettings.mutate({ hours_threshold_pct: thresholdNum });
                }}
              >
                <div className="relative">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={50}
                    max={100}
                    value={threshold}
                    disabled={!isHR}
                    onChange={(e) => setThreshold(e.target.value)}
                    className={cn("tabular h-9 w-[4.75rem] rounded-xl pr-6 font-semibold", !thresholdValid && "border-destructive focus-visible:ring-destructive/40")}
                    aria-label="Hours threshold percent"
                    aria-invalid={!thresholdValid}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                {isHR && thresholdDirty && (
                  <Button type="submit" size="sm" className="h-9 rounded-xl px-3" disabled={!thresholdValid || saveSettings.isPending}>
                    {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                )}
              </form>
            )}
            {!isLoading && (
              <p className={cn("mt-1 truncate text-xs", thresholdValid ? "text-muted-foreground" : "text-danger")} role={thresholdValid ? undefined : "alert"}>
                {thresholdValid ? (isHR && thresholdDirty ? "Not saved yet" : "Flags anyone below it") : "Whole number, 50 to 100"}
              </p>
            )}
          </div>
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-border/60 lg:flex">
            <Gauge className="h-4 w-4" aria-hidden />
          </div>
        </div>
      </StatGrid>

      <SectionCard
        flush
        title="Hours by person"
        icon={Hourglass}
        description={
          stats.through
            ? `${format(month, "MMMM yyyy")} · measured up to ${format(parseISO(stats.through), "d MMM yyyy")}; today counts once it is over`
            : isFutureMonth
              ? `${format(month, "MMMM yyyy")} has not started yet`
              : `Nothing measured yet for ${format(month, "MMMM yyyy")}`
        }
      >
        <div className="border-b border-border/60 px-4 py-3 sm:px-5">
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name, code or department">
            <DepartmentSelect value={department} onChange={setDepartment} />
            <Button variant={onlyFlagged ? "default" : "outline"} size="sm" className="h-9 rounded-xl" onClick={() => setOnlyFlagged((v) => !v)} aria-pressed={onlyFlagged}>
              <TrendingDown className="h-4 w-4" aria-hidden /> Below {t}%{stats.below > 0 ? ` · ${stats.below}` : ""}
            </Button>
          </FilterBar>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.employee_id}
          loading={isLoading}
          pageSize={25}
          initialSort={{ column: "share", direction: "asc" }}
          onRowClick={(r) => navigate(`/attendance/${r.employee_id}?month=${monthStr}`)}
          rowClassName={(r) => (r.pct !== null && r.pct < t ? "bg-danger/[0.04]" : undefined)}
          mobileTitle={(r) => <PersonCell name={r.name} code={r.code} avatarUrl={r.avatar_url} />}
          empty={
            <EmptyState
              compact
              icon={Hourglass}
              title={(data?.rows.length ?? 0) === 0 ? "No hours to show yet" : "No matches"}
              description={
                (data?.rows.length ?? 0) === 0 ? (
                  <>
                    Hours come from time-clock punches. Connect a terminal on <Link className="font-semibold text-primary underline-offset-2 hover:underline" to="/attendance/live?tab=setup">Live attendance › Setup</Link>, or approve punch corrections.
                  </>
                ) : (
                  "No one matches these filters."
                )
              }
            />
          }
        />
      </SectionCard>
    </div>
  );
}
