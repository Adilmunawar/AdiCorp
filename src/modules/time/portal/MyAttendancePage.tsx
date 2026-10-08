import { useMemo, useState } from "react";
import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { CalendarCheck2, ChevronLeft, ChevronRight, ClipboardEdit, Clock, Fingerprint, Plane, TrendingUp, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, EmptyState, ListSkeleton, PageHeader, PageSkeleton, SectionCard, StatGrid, StatTile, StatusBadge, formatRelative } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useMyAttendance, useMyCorrections, useWithdrawCorrection } from "../api";
import { EVENT_META, STATUS_META, clock, correctionKindLabel, formatMinutes, monthStart } from "../lib";
import type { MonthDay, PortalAttendance } from "../types";
import { StatusLegend } from "../components/shared";
import { CorrectionDialog } from "./CorrectionForm";

function streakOf(strip: PortalAttendance["strip"], today: string): number {
  // Consecutive working days present (half days count), walking back from yesterday; today counts once marked.
  let n = 0;
  for (let i = strip.length - 1; i >= 0; i--) {
    const d = strip[i];
    if (!d.working) continue;
    if (d.date === today && !d.status) continue;
    if (d.status === "present" || d.status === "late" || d.status === "half_day" || d.status === "short_leave") n++;
    else break;
  }
  return n;
}

export default function MyAttendancePage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const { data, isLoading, error, refetch, isFetching } = useMyAttendance(monthStart(month));
  const { data: corrections = [], isLoading: loadingCorrections } = useMyCorrections();
  const withdraw = useWithdrawCorrection();
  const [requestFor, setRequestFor] = useState<string | null | undefined>(undefined);
  const tz = data?.timezone;
  // The company's current month (server "today"), not the browser's.
  const isCurrent = format(month, "yyyy-MM") >= (data?.today ?? format(new Date(), "yyyy-MM-dd")).slice(0, 7);

  const streak = useMemo(() => (data ? streakOf(data.strip, data.today) : 0), [data]);

  if (isLoading && !data) return <PageSkeleton />;
  if (!data) {
    return (
      <EmptyState
        icon={CalendarCheck2}
        title="Attendance is not available"
        description={error instanceof Error ? error.message : "Please try again in a moment."}
        action={
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => refetch()} disabled={isFetching}>
            Try again
          </Button>
        }
      />
    );
  }

  const s = data.summary;
  const firstDow = data.days[0]?.dow ?? 1;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="My attendance"
        eyebrow="My time"
        icon={CalendarCheck2}
        description="Your register, time-clock punches and correction requests."
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular w-32 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={isCurrent} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" className="h-9 rounded-xl" onClick={() => setRequestFor(null)}>
              <ClipboardEdit className="h-4 w-4" aria-hidden /> Request a correction
            </Button>
          </>
        }
      />

      <StatGrid columns={5}>
        <StatTile label="Present" value={s.present} hint={`of ${s.working_days_so_far} working days so far`} tone="success" icon={UserCheck} />
        <StatTile label="Half / short" value={s.half_day + s.short_leave} tone="warning" icon={Clock} />
        <StatTile label="On leave" value={s.leave} tone="primary" icon={Plane} />
        <StatTile label="Absent" value={s.absent} hint={s.unmarked > 0 ? `${s.unmarked} not marked yet` : undefined} tone={s.absent > 0 ? "danger" : "default"} icon={UserX} />
        <StatTile label="Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} hint="Working days in a row" tone="primary" icon={TrendingUp} />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard title={format(month, "MMMM yyyy")} description={`${s.working_days} working days`} actions={<StatusLegend compact className="hidden sm:flex" />}>
          <div className="grid grid-cols-7 gap-1 pb-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} className="micro-label text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow - 1 }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {data.days.map((d) => (
              <DayCell key={d.date} day={d} today={data.today} tz={tz} onFix={() => setRequestFor(d.date)} />
            ))}
          </div>
          <StatusLegend compact className="mt-3 sm:hidden" />
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Today's punches" icon={Fingerprint} description={format(parseISO(data.today), "EEEE d MMMM")}>
            {data.today_punches.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No punches yet today.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.today_punches.map((p, i) => (
                  <li key={i} className="min-w-[4.5rem] rounded-xl border border-border bg-muted/20 px-2.5 py-1.5">
                    <p className="tabular text-sm font-bold">{p.time}</p>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {p.direction === "unknown" ? "Punch" : p.direction}
                      {p.source === "correction" ? " · corrected" : p.verify_type ? ` · ${p.verify_type}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Last 90 days" description="One square per day">
            <div className="flex flex-wrap gap-[3px]" role="img" aria-label="Attendance over the last 90 days">
              {data.strip.map((d) => {
                const meta = d.status ? STATUS_META[d.status] : null;
                return (
                  <span
                    key={d.date}
                    title={`${format(parseISO(d.date), "EEE d MMM")}: ${meta?.label ?? (d.working ? "Not marked" : "Day off")}`}
                    className={cn("h-3 w-3 rounded-[3px]", meta ? meta.dot : d.working ? "bg-muted-foreground/20" : "bg-muted")}
                  />
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        flush
        title="My correction requests"
        description={data.pending_corrections > 0 ? `${data.pending_corrections} waiting for HR` : "Requests from the last months"}
        icon={ClipboardEdit}
      >
        {loadingCorrections ? (
          <div className="p-4">
            <ListSkeleton rows={3} />
          </div>
        ) : corrections.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardEdit}
            title="No requests yet"
            description="If you forget to punch or the time clock misses you, ask for a correction here within 30 days."
            action={
              <Button size="sm" className="rounded-xl" onClick={() => setRequestFor(null)}>
                Request a correction
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {corrections.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">
                    {format(parseISO(c.date), "EEE d MMM")} · {correctionKindLabel(c.kind)}
                    <span className="tabular ml-1.5 font-normal text-muted-foreground">
                      {[c.time_in && `in ${c.time_in}`, c.time_out && `out ${c.time_out}`].filter(Boolean).join(", ")}
                    </span>
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{c.reason}</p>
                  {c.review_note && <p className="mt-0.5 text-xs text-foreground">HR: “{c.review_note}”</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{formatRelative(c.created_at)}</span>
                  <StatusBadge status={c.status} />
                  {c.status === "pending" && (
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-xl"
                      title="Withdraw this request?"
                      description="HR will no longer see it. You can send a new one."
                      confirmLabel="Withdraw"
                      onConfirm={() => withdraw.mutateAsync(c.id)}
                    >
                      Withdraw
                    </ConfirmButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <CorrectionDialog open={requestFor !== undefined} onOpenChange={(o) => !o && setRequestFor(undefined)} today={data.today} initialDate={requestFor} />
    </div>
  );
}

function DayCell({ day: d, today, tz, onFix }: { day: MonthDay; today: string; tz?: string; onFix: () => void }) {
  const meta = d.status ? STATUS_META[d.status] : null;
  const event = d.events[0];
  const canFix = d.working && !d.future && !d.outside && !d.locked && !d.on_leave && d.date >= format(new Date(new Date(`${today}T00:00:00`).getTime() - 30 * 86_400_000), "yyyy-MM-dd");
  const title = [
    format(parseISO(d.date), "EEEE d MMMM"),
    meta?.label ?? (d.outside ? "Outside employment" : !d.working ? "Day off" : d.future ? "" : "Not marked"),
    event && `${event.title} (${EVENT_META[event.type].label})`,
    d.first_in && `In ${clock(d.first_in, tz)}`,
    d.last_out && `Out ${clock(d.last_out, tz)}`,
    d.worked_minutes !== null && d.worked_minutes !== undefined && `Worked ${formatMinutes(d.worked_minutes)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => canFix && onFix()}
      className={cn(
        "flex min-h-[3.1rem] min-w-0 flex-col items-start rounded-xl border p-1 text-left transition-colors sm:min-h-[4.25rem] sm:p-1.5",
        meta ? meta.cell : !d.working || d.outside ? "border-transparent bg-muted/60 text-muted-foreground" : "border-border bg-card",
        d.date === today && "ring-2 ring-primary/50",
        canFix ? "cursor-pointer hover:border-primary/40" : "cursor-default",
      )}
    >
      <span className="tabular text-[11px] font-bold">{Number(d.date.slice(8))}</span>
      {meta && <span className="text-[10px] font-bold">{meta.code}</span>}
      {d.first_in && <span className="tabular hidden text-[9.5px] opacity-80 sm:block">{clock(d.first_in, tz)}{d.last_out ? `–${clock(d.last_out, tz)}` : ""}</span>}
      {event && <span className={cn("mt-auto h-1 w-full rounded-full", event.affects && (event.type === "holiday" || event.type === "off_day") ? "bg-destructive/60" : "bg-primary/60")} aria-hidden />}
    </button>
  );
}
