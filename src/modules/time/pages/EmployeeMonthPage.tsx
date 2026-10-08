import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { format, parseISO, startOfMonth } from "date-fns";
import { ArrowLeft, CalendarDays, Clock, Hourglass, Loader2, Lock, Plane, Save, UserCheck, UserRound, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, MonthPicker, PageHeader, PageSkeleton, SectionCard, StatGrid, StatTile } from "@/components/kit";
import { useMediaBelow } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useEmployeeMonth, useMarkAttendance, useTimeSettings } from "../api";
import { EVENT_META, MARK_OPTIONS, SOURCE_LABEL, STATUS_META, clock, formatMinutes, monthStart, shiftLabel, userNote } from "../lib";
import type { AttendanceChange, EmployeeMonth, MarkableStatus, MonthDay } from "../types";
import { Flag, ShareBar } from "../components/shared";

type Draft = { status: MarkableStatus | null; note: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayReason(d: MonthDay, canEdit: boolean, active: boolean): string | null {
  if (d.outside) return "Outside employment";
  if (d.on_leave) return "On approved leave";
  if (d.future) return "Future day";
  if (!d.working) return d.events.find((e) => e.affects && (e.type === "holiday" || e.type === "off_day"))?.title ?? "Day off";
  if (d.locked) return "Month locked";
  if (!active) return "Not active";
  if (!canEdit) return "View only";
  return null;
}

export default function EmployeeMonthPage() {
  const { employeeId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const month = useMemo(() => {
    const raw = params.get("month");
    const d = raw ? parseISO(raw) : new Date();
    return startOfMonth(Number.isNaN(d.getTime()) ? new Date() : d);
  }, [params]);
  const monthStr = monthStart(month);
  const { data, isLoading, error, isPlaceholderData } = useEmployeeMonth(employeeId, monthStr);
  const { data: settings } = useTimeSettings();
  const tz = data?.timezone ?? settings?.timezone;
  const save = useMarkAttendance();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const phone = useMediaBelow(640);

  useEffect(() => setDrafts({}), [monthStr, employeeId]);

  const canEdit = !!data?.can_edit;
  const active = data ? ["active", "on_leave"].includes(data.employee.status) : false;

  const changed = useMemo(() => {
    if (!data) return [] as AttendanceChange[];
    return Object.entries(drafts)
      .map(([date, draft]) => {
        const day = data.days.find((d) => d.date === date);
        if (!day) return null;
        const original = (day.status === "late" ? "present" : day.status) as MarkableStatus | null;
        if (draft.status === original && (draft.note || "") === (userNote(day.note) ?? "")) return null;
        return { employee_id: data.employee.id, date, status: draft.status, note: draft.note.trim() || null } as AttendanceChange;
      })
      .filter((c): c is AttendanceChange => c !== null);
  }, [drafts, data]);

  if (isLoading && !data) return <PageSkeleton />;
  if (error || !data) {
    return (
      <EmptyState
        icon={UserX}
        title="Employee not found"
        description="This person is not in your company, or the link is out of date."
        action={
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link to="/attendance?tab=register">Back to the register</Link>
          </Button>
        }
      />
    );
  }

  const s = data.summary;
  const e = data.employee;
  const halfDays = s.half_day + s.short_leave;
  const pct = data.hours?.pct ?? null;
  const lockedDays = data.days.filter((d) => d.locked && !d.outside).length;
  const onSave = async () => {
    try {
      await save.mutateAsync(changed);
      setDrafts({});
    } catch {
      // The mutation shows the error; keep the drafts so nothing typed is lost.
    }
  };

  return (
    <div className={cn("min-w-0 space-y-4 transition-opacity", isPlaceholderData && "opacity-70")} aria-busy={isPlaceholderData || undefined}>
      <PageHeader
        eyebrow={
          <Link to="/attendance?tab=register" className="inline-flex items-center gap-1 rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <ArrowLeft className="h-3 w-3" aria-hidden /> Attendance register
          </Link>
        }
        title={e.name}
        description={[e.code, e.rank, e.department, `${shiftLabel(e.shift_type)} shift from ${e.shift_start}, ${Number(e.hours_per_day)}h a day`].filter(Boolean).join(" · ")}
        icon={CalendarDays}
        actions={
          <>
            <MonthPicker selectedMonth={month} onMonthChange={(m) => setParams({ month: monthStart(m) }, { replace: true })} />
            <Button asChild variant="outline" size="sm" className="h-9 rounded-xl">
              <Link to={`/employees/${e.id}`}>
                <UserRound className="h-4 w-4" aria-hidden /> Profile
              </Link>
            </Button>
          </>
        }
      />

      {s.locked && lockedDays > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-warning/20 bg-warning-soft p-3 text-sm text-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p>
            {lockedDays === data.days.filter((d) => !d.outside).length ? "This month is locked" : `${lockedDays} days this month are locked`} because the payslip is final or the month was closed, so
            the marks can no longer be changed.
          </p>
        </div>
      )}

      <StatGrid columns={4}>
        <StatTile
          label="Present"
          value={s.present}
          hint={`of ${s.working_days_so_far} working days so far`}
          tone="success"
          icon={phone ? undefined : UserCheck}
        />
        <StatTile
          label="Leave"
          value={s.leave}
          hint={halfDays > 0 ? `${halfDays} half or short day${halfDays === 1 ? "" : "s"}` : "No half days"}
          tone="primary"
          icon={phone ? undefined : Plane}
        />
        <StatTile
          label="Absent"
          value={s.absent}
          hint={s.unmarked > 0 ? `${s.unmarked} day${s.unmarked === 1 ? "" : "s"} not marked` : "All days marked"}
          tone={s.absent > 0 ? "danger" : s.unmarked > 0 ? "warning" : "default"}
          icon={phone ? undefined : UserX}
        />
        <StatTile
          label="Hours share"
          value={pct !== null ? `${pct.toFixed(1)}%` : "—"}
          hint={data.hours ? `${formatMinutes(data.hours.worked_minutes)} of ${formatMinutes(data.hours.target_minutes)}` : "No measured days yet"}
          tone={pct !== null ? (pct >= data.threshold ? "success" : "danger") : "default"}
          icon={phone ? undefined : Hourglass}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <MonthGlance data={data} />
        <HoursCard data={data} />
      </div>

      <SectionCard
        flush
        title="Day by day"
        icon={Clock}
        description={`${s.working_days} working days in ${format(month, "MMMM")}${canEdit ? " · change a mark, then save" : ""}`}
        actions={
          canEdit && changed.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setDrafts({})} disabled={save.isPending}>
                Discard
              </Button>
              <Button size="sm" className="rounded-xl" disabled={save.isPending} onClick={onSave}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Save {changed.length} change{changed.length === 1 ? "" : "s"}
              </Button>
            </div>
          ) : undefined
        }
      >
        <ul className="divide-y divide-border/70">
          {data.days.map((d) => {
            const reason = dayReason(d, canEdit, active);
            const editable = reason === null;
            const draft = drafts[d.date];
            const current = draft ? draft.status : ((d.status === "late" ? "present" : d.status) as MarkableStatus | null);
            const meta = d.status ? STATUS_META[d.status] : null;
            const isToday = d.date === data.today;
            const note = userNote(d.note);
            const source = d.source ? SOURCE_LABEL[d.source] : null;
            return (
              <li
                key={d.date}
                id={`day-${d.date}`}
                className={cn(
                  "grid scroll-mt-24 grid-cols-1 gap-2 px-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-5",
                  (!d.working || d.outside) && "bg-muted/30",
                  d.future && !isToday && "py-2",
                  isToday && "bg-primary/[0.04]",
                )}
              >
                <div className="flex items-center justify-between gap-2 sm:block">
                  <p className={cn("text-[13px] font-semibold", isToday ? "text-primary" : d.working ? "text-foreground" : "text-muted-foreground")}>
                    {format(parseISO(d.date), "EEE d MMM")}
                    {isToday && <span className="ml-1.5 text-[11px] font-semibold">· Today</span>}
                  </p>
                  {d.events.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1 sm:mt-0.5 sm:justify-start">
                      {d.events.map((ev, i) => (
                        <Flag key={i} tone={EVENT_META[ev.type].tone} title={EVENT_META[ev.type].label}>
                          <span className="max-w-[11rem] truncate">{ev.title}</span>
                        </Flag>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  {editable ? (
                    <>
                      <Select
                        value={current ?? "none"}
                        onValueChange={(v) => setDrafts((prev) => ({ ...prev, [d.date]: { status: v === "none" ? null : (v as MarkableStatus), note: prev[d.date]?.note ?? note ?? "" } }))}
                      >
                        <SelectTrigger className={cn("h-9 w-full rounded-xl sm:w-40", draft && "border-primary/60 ring-1 ring-primary/30")} aria-label={`Mark for ${format(parseISO(d.date), "EEEE d MMMM")}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not marked</SelectItem>
                          {MARK_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        // Automatic notes ("Biometric punch") are not the user's text: the source chip says it.
                        value={draft?.note ?? note ?? ""}
                        maxLength={200}
                        placeholder="Note (optional)"
                        aria-label={`Note for ${format(parseISO(d.date), "EEEE d MMMM")}`}
                        className="h-9 rounded-xl sm:max-w-xs"
                        onChange={(ev) => setDrafts((prev) => ({ ...prev, [d.date]: { status: prev[d.date]?.status ?? current, note: ev.target.value } }))}
                      />
                    </>
                  ) : (
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {meta ? (
                        <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold", meta.cell)}>
                          {meta.label}
                          {d.locked && <Lock className="h-3 w-3 opacity-70" aria-label="Locked" />}
                        </span>
                      ) : d.future && d.working ? (
                        <span className="text-xs text-muted-foreground/70">Upcoming</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{reason}</span>
                      )}
                      {/* Time-clock marks are the norm (the punches show on the right); only call out the others. */}
                      {meta && source && d.source !== "leave" && d.source !== "biometric" && <span className="text-[11px] text-muted-foreground">{source}</span>}
                      {meta && reason && !d.locked && reason !== "On approved leave" && <span className="text-[11px] text-muted-foreground">{reason}</span>}
                      {note && (
                        <span className="min-w-0 max-w-full truncate text-[11px] text-muted-foreground" title={note}>
                          “{note}”
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end">
                  {d.punches > 0 ? (
                    <>
                      <span>
                        In <b className="font-semibold text-foreground">{clock(d.first_in, tz)}</b>
                      </span>
                      <span>
                        Out <b className={cn("font-semibold", d.last_out ? "text-foreground" : "text-warning")}>{d.last_out ? clock(d.last_out, tz) : "missing"}</b>
                      </span>
                      <span className="min-w-[3.5rem] text-right font-semibold text-foreground">{formatMinutes(d.worked_minutes)}</span>
                      {d.corrected && <Flag tone="primary">Corrected</Flag>}
                    </>
                  ) : d.working && !d.future && !d.outside && !d.on_leave ? (
                    <span>{isToday ? "No punches yet" : "No punches"}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function glanceTone(d: MonthDay): { cell: string; label: string } {
  if (d.outside) return { cell: "border-transparent bg-transparent text-muted-foreground/50", label: "Outside employment" };
  if (d.status) return { cell: STATUS_META[d.status].cell, label: STATUS_META[d.status].label };
  if (d.on_leave) return { cell: STATUS_META.leave.cell, label: STATUS_META.leave.label };
  if (!d.working) return { cell: "border-transparent bg-muted text-muted-foreground", label: d.events[0]?.title ?? "Day off" };
  if (d.future) return { cell: "border-border bg-card text-muted-foreground", label: "Coming up" };
  return { cell: "border-dashed border-warning/50 bg-card text-warning", label: "Not marked" };
}

/** Calendar of the month, one colour per mark; a day jumps to its row below. */
function MonthGlance({ data }: { data: EmployeeMonth }) {
  const first = data.days[0];
  const lead = first ? first.dow - 1 : 0;
  const counts = {
    present: data.summary.present,
    half: data.summary.half_day + data.summary.short_leave,
    leave: data.summary.leave,
    absent: data.summary.absent,
  };
  return (
    <SectionCard title="Month at a glance" icon={CalendarDays} description="Select a day to jump to it">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {data.days.map((d) => {
          const t = glanceTone(d);
          const isToday = d.date === data.today;
          return (
            <a
              key={d.date}
              href={`#day-${d.date}`}
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(`day-${d.date}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              title={`${format(parseISO(d.date), "EEE d MMM")} · ${t.label}`}
              aria-label={`${format(parseISO(d.date), "EEEE d MMMM")}: ${t.label}`}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:hover:scale-100 sm:h-10",
                t.cell,
                isToday && "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
            >
              <span className="tabular">{Number(d.date.slice(8, 10))}</span>
              {d.events.length > 0 && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-current opacity-70" aria-hidden />}
            </a>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        <LegendSwatch className={STATUS_META.present.cell} label={`Present ${counts.present}`} />
        <LegendSwatch className={STATUS_META.half_day.cell} label={`Half or short ${counts.half}`} />
        <LegendSwatch className={STATUS_META.leave.cell} label={`Leave ${counts.leave}`} />
        <LegendSwatch className={STATUS_META.absent.cell} label={`Absent ${counts.absent}`} />
        <LegendSwatch className="border-transparent bg-muted" label="Day off" />
      </div>
    </SectionCard>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="tabular inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-3 rounded border", className)} aria-hidden />
      {label}
    </span>
  );
}

function HoursCard({ data }: { data: EmployeeMonth }) {
  const h = data.hours;
  return (
    <SectionCard
      title="Hours this month"
      icon={Hourglass}
      description={h?.through ? `Measured up to ${format(parseISO(h.through), "d MMM yyyy")} · only days with an in and an out punch count` : "Only days with an in and an out punch count"}
    >
      {!h || h.measured_days === 0 ? (
        <EmptyState compact icon={Hourglass} title="No measured days yet" description="Hours appear once a day has both an in and an out punch." className="py-6" />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Share of target</span>
              <span className="text-muted-foreground">
                Threshold <b className="tabular font-semibold text-foreground">{data.threshold}%</b>
              </span>
            </div>
            <ShareBar pct={h.pct} threshold={data.threshold} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {[
              ["Worked", formatMinutes(h.worked_minutes), `${h.measured_days} measured day${h.measured_days === 1 ? "" : "s"}`],
              ["Target", formatMinutes(h.target_minutes), "Shift hours of the measured days"],
              ["Short", formatMinutes(h.short_minutes), h.short_minutes > 0 ? "Below the shift target" : "None"],
              ["Late days", String(h.late_days), h.late_minutes > 0 ? `${formatMinutes(h.late_minutes)} in total` : "Always on time"],
              ["Left early", String(h.early_days), h.early_minutes > 0 ? `${formatMinutes(h.early_minutes)} in total` : "Never"],
              ["No out-punch", String(h.no_out_days), h.no_out_days > 0 ? "Days to correct" : "None"],
            ].map(([k, v, hint]) => (
              <div key={k} className="min-w-0">
                <dt className="micro-label">{k}</dt>
                <dd className="tabular mt-0.5 text-[15px] font-semibold text-foreground">{v}</dd>
                <dd className="truncate text-[11px] text-muted-foreground" title={hint}>
                  {hint}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </SectionCard>
  );
}
