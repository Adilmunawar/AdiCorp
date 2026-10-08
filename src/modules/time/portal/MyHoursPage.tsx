import { useState } from "react";
import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { AlarmClockOff, ChevronLeft, ChevronRight, Clock, Hourglass, Timer, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageSkeleton, SectionCard, StatGrid, StatTile } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useMyHours } from "../api";
import { clock, formatMinutes, monthStart, shareTone } from "../lib";
import type { DayKind } from "../types";
import { Flag, ShareBar } from "../components/shared";

const KIND: Record<DayKind, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" | "primary" }> = {
  measured: { label: "Measured", tone: "success" },
  no_out: { label: "No out-punch", tone: "info" },
  unmeasured: { label: "Marked by HR", tone: "neutral" },
  absent: { label: "Absent", tone: "danger" },
  leave: { label: "Leave", tone: "primary" },
  off: { label: "Day off", tone: "neutral" },
  off_day: { label: "Worked a day off", tone: "info" },
  pending: { label: "In progress", tone: "neutral" },
};

export default function MyHoursPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const { data, isLoading, error, refetch, isFetching } = useMyHours(monthStart(month));
  // The company's current month (server "today"), not the browser's.
  const isCurrent = format(month, "yyyy-MM") >= (data?.today ?? format(new Date(), "yyyy-MM-dd")).slice(0, 7);

  if (isLoading && !data) return <PageSkeleton />;
  if (!data && error) {
    return (
      <EmptyState
        icon={Hourglass}
        title="Your hours are not available"
        description={error instanceof Error ? error.message : "Please try again in a moment."}
        action={
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => refetch()} disabled={isFetching}>
            Try again
          </Button>
        }
      />
    );
  }
  const s = data?.summary;
  const tz = data?.timezone;
  const threshold = data?.threshold ?? 90;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="My hours"
        eyebrow="My time"
        icon={Hourglass}
        description="Time worked against your shift target. Days with an in and an out punch are measured; today counts once it is over."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-32 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={isCurrent} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <SectionCard>
        <div className="flex items-start justify-between gap-4 sm:items-center">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="micro-label">Share of target</p>
            <ShareBar pct={s?.pct ?? null} threshold={threshold} className="max-w-xl [&>span]:hidden" />
            <p className="text-xs text-muted-foreground">
              {s?.pct === null || s?.pct === undefined
                ? "No measured days yet this month."
                : s.pct >= threshold
                  ? `You are above the company's ${threshold}% threshold.`
                  : `Below the company's ${threshold}% threshold. Late starts and early finishes add up.`}
            </p>
          </div>
          <p
            className={cn(
              "tabular shrink-0 font-display text-2xl font-semibold tracking-tight sm:text-3xl",
              { success: "text-success", warning: "text-warning", danger: "text-destructive", default: "text-muted-foreground" }[shareTone(s?.pct, threshold)],
            )}
          >
            {s?.pct !== null && s?.pct !== undefined ? `${s.pct.toFixed(1)}%` : "—"}
          </p>
        </div>
      </SectionCard>

      <StatGrid columns={4}>
        <StatTile label="Worked" value={formatMinutes(s?.worked_minutes ?? 0)} hint={`of ${formatMinutes(s?.target_minutes ?? 0)} expected`} tone="primary" icon={TrendingUp} />
        <StatTile label="Short" value={formatMinutes(s?.short_minutes ?? 0)} tone={(s?.short_minutes ?? 0) > 0 ? "warning" : "success"} icon={Timer} />
        <StatTile label="Late days" value={s?.late_days ?? 0} hint={`${s?.late_minutes ?? 0} minutes in total`} tone={(s?.late_days ?? 0) > 0 ? "warning" : "default"} icon={Clock} />
        <StatTile label="No out-punch" value={s?.no_out_days ?? 0} hint="Ask for a correction" tone={(s?.no_out_days ?? 0) > 0 ? "danger" : "default"} icon={AlarmClockOff} href="/portal/attendance" />
      </StatGrid>

      <SectionCard flush title="Day by day" description={s?.through ? `Measured up to ${format(parseISO(s.through), "d MMM")}` : undefined}>
        {!data || data.days.length === 0 ? (
          <EmptyState compact icon={Hourglass} title="Nothing to show for this month" description="Your days appear here as you punch in and out." />
        ) : (
          <ul className="divide-y divide-border">
            {data.days.map((d) => {
              const k = KIND[d.kind];
              return (
                <li key={d.date} className={cn("grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 sm:px-5", !d.working && "bg-muted/30")}>
                  <span className="text-[13px] font-semibold">{format(parseISO(d.date), "EEE d MMM")}</span>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Flag tone={k.tone}>{k.label}</Flag>
                    {(d.late_minutes ?? 0) > 0 && <Flag tone="warning">Late {d.late_minutes}m</Flag>}
                    {(d.early_minutes ?? 0) > 0 && <Flag tone="warning">Left {d.early_minutes}m early</Flag>}
                    {d.half && <Flag>Half day</Flag>}
                    {d.corrected && <Flag tone="primary">Corrected</Flag>}
                  </div>
                  <div className="tabular text-right text-xs">
                    {d.first_in ? (
                      <>
                        <p className="font-semibold text-foreground">{formatMinutes(d.worked_minutes)}</p>
                        <p className="text-muted-foreground">
                          {clock(d.first_in, tz)} – {d.last_out ? clock(d.last_out, tz) : "no out"}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">{d.working ? `Target ${formatMinutes(d.target_minutes)}` : ""}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
