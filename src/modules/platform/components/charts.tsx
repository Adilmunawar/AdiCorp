import { lazy, Suspense } from "react";
import { formatNumber, Skeleton } from "@/components/kit";
import { cn } from "@/lib/utils";
import { CHART } from "./helpers";
import type { CountTrendChartProps, MonthBarsProps, StackedBarsProps } from "./charts-recharts";

/*
 * Dashboard and report charts. The CSS-only pieces (segment bar, ranked bars) live here; the
 * recharts-backed ones are loaded on demand from ./charts-recharts so the dashboard's first paint
 * never waits for recharts and its d3 modules. Each wrapper keeps the same props as before and
 * shows a skeleton of the chart's own height until the chunk arrives.
 */

const SERIES = [CHART.primary, CHART.sky, CHART.green, CHART.amber, CHART.violet, CHART.red, CHART.teal];

const load = () => import("./charts-recharts");
const MonthBarsImpl = lazy(() => load().then((m) => ({ default: m.MonthBars })));
const StackedBarsImpl = lazy(() => load().then((m) => ({ default: m.StackedBars })));
const CountTrendChartImpl = lazy(() => load().then((m) => ({ default: m.CountTrendChart })));

function ChartSkeleton({ height, legend, className }: { height: string; legend?: boolean; className?: string }) {
  return (
    <div aria-busy="true">
      {legend && <Skeleton className="mb-3 h-3 w-40 rounded-full" />}
      <Skeleton className={cn("w-full rounded-xl", height, className)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented bar (today's attendance, splits)                           */
/* ------------------------------------------------------------------ */

export interface Segment {
  label: string;
  value: number;
  className: string;
}

export function SegmentBar({ segments, total, className, percent = false }: { segments: Segment[]; total: number; className?: string; percent?: boolean }) {
  if (total <= 0) return null;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {segments.map((s) =>
          s.value > 0 ? <span key={s.label} className={cn("h-full", s.className)} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} /> : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.className)} aria-hidden />
            <span className="tabular font-semibold text-foreground">{s.value}</span> {s.label}
            {percent && <span className="tabular">({Math.round((s.value / total) * 100)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranked horizontal bars (departments, ranks)                         */
/* ------------------------------------------------------------------ */

export interface RankRow {
  name: string;
  value: number;
  /** Overrides the chart colour for this row (e.g. hired / rejected in a funnel). */
  color?: string;
  /** Text after the value, e.g. "21%". */
  note?: string;
}

/**
 * Ranked bars in one colour per chart: the length carries the meaning, so a rainbow would only
 * suggest categories that are not there. `colorIndex` picks the chart's colour from the series.
 * `scale` fixes the 100% length (e.g. 100 for percentages) instead of the largest row.
 */
export function RankBars({
  rows,
  format = (n) => formatNumber(n, 0),
  max = 6,
  colorIndex = 0,
  color,
  scale,
  moreLabel = "more",
  className,
}: {
  rows: RankRow[];
  format?: (n: number) => string;
  max?: number;
  colorIndex?: number;
  color?: string;
  scale?: number;
  moreLabel?: string;
  /** Classes for the list, e.g. a multi-column grid in a wide card. */
  className?: string;
}) {
  const fill = color ?? SERIES[colorIndex % SERIES.length];
  const shown = rows.slice(0, max);
  const rest = rows.slice(max);
  const list: RankRow[] = rest.length
    ? [...shown, { name: `${rest.length} ${moreLabel}`, value: rest.reduce((a, r) => a + r.value, 0), color: CHART.muted }]
    : shown;
  const top = scale ?? Math.max(1, ...list.map((r) => r.value));
  return (
    <ul className={cn("space-y-3", className)}>
      {list.map((r, i) => (
        <li key={`${r.name}-${i}`} className="min-w-0 space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
            <span className="min-w-0 truncate font-medium text-foreground" title={r.name}>
              {r.name}
            </span>
            <span className="tabular shrink-0 text-xs font-semibold text-foreground">
              {format(r.value)}
              {r.note && <span className="ml-1.5 font-normal text-muted-foreground">{r.note}</span>}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: r.value > 0 ? `${Math.min(100, Math.max(2, (r.value / top) * 100))}%` : 0, background: r.color ?? fill }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* recharts-backed charts, loaded on demand                             */
/* ------------------------------------------------------------------ */

/** Bars per month, stacked when there are several series; an unfinished month is drawn faded. */
export function MonthBars(props: MonthBarsProps) {
  return (
    <Suspense fallback={<ChartSkeleton height="h-[220px]" legend={props.legend ?? props.series.length > 1} className={props.className} />}>
      <MonthBarsImpl {...props} />
    </Suspense>
  );
}

/** Stacked (or side-by-side) bars per x value, e.g. attendance per day or headcount flow. */
export function StackedBars(props: StackedBarsProps) {
  return (
    <Suspense fallback={<ChartSkeleton height="h-[200px]" legend={props.legend} className={props.className} />}>
      <StackedBarsImpl {...props} />
    </Suspense>
  );
}

/** Area line of a plain count over months (headcount). */
export function CountTrendChart(props: CountTrendChartProps) {
  return (
    <Suspense fallback={<ChartSkeleton height="h-[180px]" className={props.className} />}>
      <CountTrendChartImpl {...props} />
    </Suspense>
  );
}
