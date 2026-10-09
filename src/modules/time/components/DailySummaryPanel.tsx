import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { AlarmClockOff, CalendarCheck2, ChevronLeft, ChevronRight, Clock, DoorOpen, Loader2, LogOut, Plane, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton, DataTable, EmptyState, SectionCard, StatGridSkeleton, type DataColumn } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useDailySummary, useMarkAllPresent, useTimeSettings } from "../api";
import { clock, companyToday, formatMinutes, shiftLabel } from "../lib";
import type { DailyPerson, DailySummary } from "../types";
import { DepartmentSelect, Flag, PersonCell, useNow } from "./shared";

export type PersonState = "present" | "not_in" | "absent" | "not_due" | "leave" | "off" | "worked_off";

export function personState(p: DailyPerson, s: Pick<DailySummary, "is_today" | "is_future">): PersonState {
  if (!p.working) return p.punches > 0 ? "worked_off" : "off";
  if (p.on_leave) return "leave";
  if (p.punches > 0 || (p.register && ["present", "half_day", "short_leave", "late"].includes(p.register))) return "present";
  if (p.register === "absent") return "absent";
  if (s.is_future || p.not_due) return "not_due";
  return s.is_today ? "not_in" : "absent";
}

type Filter = "all" | "attention" | "present" | "late" | "early" | "no_out" | "not_in" | "leave";

function minutesOfDay(value: string, tz: string): number | null {
  const t = clock(value, tz);
  const [h, m] = t.split(":").map(Number);
  return Number.isNaN(h) ? null : h * 60 + m;
}

export function DailySummaryPanel({ canEdit }: { canEdit: boolean }) {
  const { data: settings } = useTimeSettings();
  const now = useNow(60_000);
  // "Today" is the company's day (its timezone), not the viewer's: a demo from London at 22:00 is already tomorrow in Karachi.
  // It follows the clock, so a screen left open overnight moves on at midnight.
  const today = companyToday(settings?.today, settings?.timezone, now);
  const [picked, setDate] = useState<string | null>(null);
  const date = picked ?? today;
  const [filter, setFilter] = useState<Filter>("attention");
  const [department, setDepartment] = useState<string | null>(null);
  // Only today changes by the minute; past and planned days need no polling.
  const { data, isLoading, isFetching } = useDailySummary(date, { live: date === today });
  const markAll = useMarkAllPresent();
  const navigate = useNavigate();
  const tz = data?.timezone ?? "UTC";

  const people = useMemo(
    () => (data?.people ?? []).filter((p) => !department || p.department_id === department),
    [data?.people, department],
  );

  const stats = useMemo(() => {
    if (!data) return null;
    const expected = people.filter((p) => p.working && !p.on_leave);
    const states = new Map(people.map((p) => [p.id, personState(p, data)]));
    const present = expected.filter((p) => states.get(p.id) === "present");
    const arrivals = present.map((p) => (p.first_in ? minutesOfDay(p.first_in, tz) : null)).filter((n): n is number => n !== null);
    const avg = arrivals.length ? Math.round(arrivals.reduce((a, b) => a + b, 0) / arrivals.length) : null;
    return {
      expected: expected.length,
      present: present.length,
      avgArrival: avg === null ? null : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
      late: people.filter((p) => p.late).length,
      early: people.filter((p) => p.left_early).length,
      noOut: people.filter((p) => p.no_out).length,
      notIn: people.filter((p) => ["not_in", "absent"].includes(states.get(p.id) ?? "")).length,
      leave: people.filter((p) => p.on_leave).length,
      states,
    };
  }, [data, people, tz]);

  const rows = useMemo(() => {
    if (!data || !stats) return [];
    const st = stats.states;
    switch (filter) {
      case "attention":
        return people.filter((p) => p.late || p.left_early || p.no_out || p.pending_correction || ["not_in", "absent"].includes(st.get(p.id) ?? ""));
      case "present":
        return people.filter((p) => st.get(p.id) === "present");
      case "late":
        return people.filter((p) => p.late);
      case "early":
        return people.filter((p) => p.left_early);
      case "no_out":
        return people.filter((p) => p.no_out);
      case "not_in":
        return people.filter((p) => ["not_in", "absent"].includes(st.get(p.id) ?? ""));
      case "leave":
        return people.filter((p) => p.on_leave);
      default:
        return people.filter((p) => p.working || p.punches > 0);
    }
  }, [data, people, filter, stats]);

  const isPast = !!data && !data.is_today && !data.is_future;
  const tiles: { key: Filter; label: string; value: string; hint?: string; icon: typeof Clock; tone: string }[] = stats
    ? [
        { key: "present", label: "Present", value: `${stats.present}/${stats.expected}`, hint: stats.avgArrival ? `Avg arrival ${stats.avgArrival}` : "No punches yet", icon: UserCheck, tone: "text-success bg-success-soft" },
        { key: "late", label: "Late", value: String(stats.late), hint: `After ${data?.grace_minutes ?? 0} min grace`, icon: Clock, tone: "text-warning bg-warning-soft" },
        { key: "early", label: "Left early", value: String(stats.early), hint: "Before shift end", icon: LogOut, tone: "text-warning bg-warning-soft" },
        { key: "no_out", label: "No out-punch", value: String(stats.noOut), hint: "Shift over, no check-out", icon: AlarmClockOff, tone: "text-info bg-info-soft" },
        { key: "not_in", label: isPast ? "Absent" : "Not in", value: String(stats.notIn), hint: isPast ? "No punch, no mark" : "Expected, no punch yet", icon: UserX, tone: "text-danger bg-danger-soft" },
        { key: "leave", label: "On leave", value: String(stats.leave), hint: "Approved leave", icon: Plane, tone: "text-info bg-info-soft" },
      ]
    : [];

  const columns: DataColumn<DailyPerson>[] = [
    {
      id: "name",
      header: "Employee",
      cell: (p) => <PersonCell name={p.name} code={p.code} sub={p.department ?? p.rank} avatarUrl={p.avatar_url} />,
      sortValue: (p) => p.name,
    },
    {
      id: "shift",
      header: "Shift",
      hideBelow: "md",
      cell: (p) => (
        <span className="tabular whitespace-nowrap text-xs text-muted-foreground">
          {shiftLabel(p.shift_type)} · {clock(p.shift_start, tz)}–{clock(p.shift_end, tz)}
        </span>
      ),
    },
    {
      id: "in",
      header: "In",
      sortValue: (p) => p.first_in,
      cell: (p) => (
        <span className="tabular inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
          {p.first_in ? clock(p.first_in, tz) : "—"}
          {p.late && (
            <span className="rounded bg-warning-soft px-1 text-[10.5px] text-warning" title={`${p.late_minutes} minutes past the grace period`}>
              +{formatMinutes(p.late_minutes)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "out",
      header: "Out",
      sortValue: (p) => p.last_out,
      cell: (p) => (
        <span className="tabular inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
          {p.last_out ? clock(p.last_out, tz) : "—"}
          {p.left_early && (
            <span className="rounded bg-warning-soft px-1 text-[10.5px] text-warning" title={`Left ${p.early_minutes} minutes before the shift ended`}>
              −{formatMinutes(p.early_minutes)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "worked",
      header: "Worked",
      hideBelow: "sm",
      sortValue: (p) => p.worked_minutes,
      cell: (p) => <span className="tabular text-xs">{formatMinutes(p.worked_minutes)}</span>,
    },
    {
      id: "flags",
      header: "Status",
      cell: (p) => <PersonFlags person={p} summary={data!} />,
    },
  ];

  const go = (days: number) => setDate(format(addDays(parseISO(date), days), "yyyy-MM-dd"));

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => go(-1)} aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Input
                type="date"
                value={date}
                max={format(addDays(parseISO(today), 30), "yyyy-MM-dd")}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-9 w-[9.5rem] min-w-0 rounded-xl"
                aria-label="Day"
              />
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => go(1)} aria-label="Next day">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
              {date !== today && (
                <Button variant="ghost" size="sm" className="h-9 rounded-xl" onClick={() => setDate(null)}>
                  Today
                </Button>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold leading-5 tracking-tight text-foreground">
                <CalendarCheck2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {format(parseISO(data?.date ?? date), "EEEE, d MMMM yyyy")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {!data
                  ? "Loading the day…"
                  : data.is_today
                    ? "Live from the time clocks, refreshed every minute."
                    : data.is_future
                      ? "Planned day: leave and the calendar are known, punches are not."
                      : "What the time clocks and the register recorded for this day."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DepartmentSelect value={department} onChange={setDepartment} />
            {canEdit && data && !data.is_future && (
              <ConfirmButton
                size="sm"
                variant="outline"
                destructive={false}
                className="h-9 rounded-xl"
                disabled={markAll.isPending}
                title={department ? "Mark this department present?" : "Mark everyone present?"}
                description={`Everyone ${department ? "in this department " : ""}without a mark for ${format(parseISO(date), "EEEE d MMMM")} is marked present${stats?.notIn ? ` (${stats.notIn} ${stats.notIn === 1 ? "person" : "people"} not in yet)` : ""}. Days before today count towards pay, so check the register first.`}
                confirmLabel="Mark present"
                // With a department picked, only the people shown are marked.
                onConfirm={() => markAll.mutateAsync({ date, employeeIds: department ? people.map((p) => p.id) : undefined })}
              >
                {markAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <DoorOpen className="h-4 w-4" aria-hidden />}
                {department ? "Mark this department present" : "Mark everyone present"}
              </ConfirmButton>
            )}
          </div>
        </div>
        {isLoading || !stats ? (
          <StatGridSkeleton count={6} className="sm:grid-cols-3 xl:grid-cols-6" />
        ) : (
          <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6", isFetching && "opacity-90")}>
            {tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter((f) => (f === t.key ? "attention" : t.key))}
                aria-pressed={filter === t.key}
                className={cn(
                  "flex min-w-0 items-start justify-between gap-2 rounded-xl border p-3 text-left transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  filter === t.key ? "border-primary/50 bg-primary/[0.04]" : "border-border/70 bg-muted/20",
                )}
              >
                <div className="min-w-0">
                  <p className="micro-label truncate">{t.label}</p>
                  <p className="tabular mt-1 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">{t.value}</p>
                  {t.hint && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={t.hint}>
                      {t.hint}
                    </p>
                  )}
                </div>
                <span className={cn("hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex", t.tone)}>
                  <t.icon className="h-4 w-4" aria-hidden />
                </span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        flush
        title={filter === "attention" ? "Needs attention" : filter === "all" ? "Everyone" : tiles.find((t) => t.key === filter)?.label}
        description={isLoading || !data ? "Loading…" : `${rows.length} ${rows.length === 1 ? "person" : "people"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(data?.pending_corrections ?? 0) > 0 && (
              <Button asChild variant="outline" size="sm" className="h-8 rounded-xl">
                <Link to="/attendance/corrections">{data?.pending_corrections} punch correction{data?.pending_corrections === 1 ? "" : "s"} waiting</Link>
              </Button>
            )}
            <div className="flex rounded-xl border border-border p-0.5" role="group" aria-label="View">
              {(["attention", "all"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  aria-pressed={filter === v}
                  className={cn("h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:h-7", filter === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {v === "attention" ? "Needs attention" : "Everyone"}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(p) => p.id}
          loading={isLoading}
          pageSize={25}
          initialSort={{ column: "name" }}
          onRowClick={(p) => navigate(`/attendance/${p.id}?month=${date.slice(0, 8)}01`)}
          mobileTitle={(p) => <PersonCell name={p.name} code={p.code} avatarUrl={p.avatar_url} />}
          empty={
            <EmptyState
              compact
              icon={UserCheck}
              title={filter === "attention" ? "Nothing needs attention" : "No one here"}
              description={
                (data?.people.length ?? 0) === 0
                  ? "Once employees are added, today's arrivals, late starts and missing punches show up here."
                  : filter === "attention"
                    ? "Everyone expected is in on time, or the day has not started yet."
                    : "No one matches this filter for the day."
              }
            />
          }
        />
      </SectionCard>
    </div>
  );
}

/** Register mark as a chip label; punches without a mark read as present. */
function humanizeRegister(register: DailyPerson["register"]): string {
  if (register === "half_day") return "Half day";
  if (register === "short_leave") return "Short leave";
  return "Present";
}

function PersonFlags({ person: p, summary }: { person: DailyPerson; summary: DailySummary }) {
  const state = personState(p, summary);
  const chips: JSX.Element[] = [];
  const stateChip: Record<PersonState, JSX.Element> = {
    present: <Flag key="s" tone="success">{p.punches > 0 && !p.last_out && !p.no_out && summary.is_today ? "In the office" : humanizeRegister(p.register)}</Flag>,
    not_in: <Flag key="s" tone="danger">Not in</Flag>,
    absent: <Flag key="s" tone="danger">Absent</Flag>,
    not_due: <Flag key="s">Not due yet</Flag>,
    leave: <Flag key="s" tone="info">On leave</Flag>,
    off: <Flag key="s">Day off</Flag>,
    worked_off: <Flag key="s" tone="info">Worked a day off</Flag>,
  };
  chips.push(stateChip[state]);
  if (p.late) chips.push(<Flag key="late" tone="warning">Late {p.late_minutes}m</Flag>);
  if (p.left_early) chips.push(<Flag key="early" tone="warning">Left {p.early_minutes}m early</Flag>);
  if (p.no_out) chips.push(<Flag key="noout" tone="info">No out-punch</Flag>);
  if (p.marked_by_hr) chips.push(<Flag key="hr">Marked by HR</Flag>);
  if (p.corrected) chips.push(<Flag key="corr" tone="primary">Corrected</Flag>);
  if (p.pending_correction) chips.push(<Flag key="pc" tone="warning">Correction pending</Flag>);
  if (!p.linked) chips.push(<Flag key="nl" title="This person has no time-clock ID yet">No terminal ID</Flag>);
  return <div className="flex flex-wrap gap-1">{chips}</div>;
}
