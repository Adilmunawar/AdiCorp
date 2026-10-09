import { useId, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/components/kit";
import { CHART, compactNumber, type ChartSeries } from "./helpers";

/*
 * The recharts-backed charts. This file is only ever reached through the lazy wrappers in
 * ./charts.tsx, so recharts (and the d3 modules behind it) stay out of the first paint and load
 * in their own vendor-charts chunk when a dashboard or report actually draws a chart.
 */

export type Row = Record<string, string | number>;

/**
 * At most ~6 evenly spaced x-axis ticks, counted back from the latest point so the newest
 * label is always shown and the gaps never vary (recharts' own thinning skips unevenly).
 */
function evenTicks(data: Row[], key: string, maxTicks = 6): (string | number)[] {
  const step = Math.max(1, Math.ceil(data.length / maxTicks));
  return data.filter((_, i) => (data.length - 1 - i) % step === 0).map((d) => d[key]);
}

/**
 * Round y-axis ticks (0, 100K, 200K, 300K rather than recharts' 0, 65K, 130K, 195K): about four
 * steps of 1, 2, 2.5 or 5 times a power of ten, from zero up past the largest value.
 * `stacked` measures the tallest stack instead of the tallest single series.
 */
function niceTicks(data: Row[], keys: string[], steps = 4, stacked = false): number[] | undefined {
  const values = data.map((d) => (stacked ? keys.reduce((a, k) => a + (Number(d[k]) || 0), 0) : Math.max(0, ...keys.map((k) => Number(d[k]) || 0))));
  const max = Math.max(0, ...values);
  if (max <= 0) return undefined;
  const raw = max / steps;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Small colour key above a multi-series chart. */
export function ChartKey({ items, className }: { items: { label: string; color: string; faded?: boolean }[]; className?: string }) {
  return (
    <ul className={cn("mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span
            className={cn("h-2 w-2 rounded-full", s.faded && "border border-dashed")}
            style={s.faded ? { borderColor: s.color, background: "transparent" } : { background: s.color }}
            aria-hidden
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

interface TipProps {
  active?: boolean;
  payload?: { payload?: Row }[];
  series: ChartSeries[];
  title: (row: Row) => string;
  format: (n: number) => string;
  /** Adds a total line (for stacked series). */
  total?: string;
  note?: (row: Row) => ReactNode;
}

/** One tooltip for every dashboard and report chart: every series shows, zeros included, in the chart's units. */
function ChartTip({ active, payload, series, title, format, total, note }: TipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const sum = series.reduce((a, s) => a + (Number(row[s.key]) || 0), 0);
  const extra = note?.(row);
  return (
    <div className="min-w-[10rem] max-w-[16rem] rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="mb-1.5 font-semibold">{title(row)}</p>
      <ul className="space-y-1">
        {series.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
            <span className="tabular font-semibold">{format(Number(row[s.key]) || 0)}</span>
          </li>
        ))}
      </ul>
      {total && (
        <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-border/60 pt-1.5 font-semibold">
          <span>{total}</span>
          <span className="tabular">{format(sum)}</span>
        </div>
      )}
      {extra && <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{extra}</p>}
    </div>
  );
}

function configOf(series: ChartSeries[]): ChartConfig {
  return Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) as ChartConfig;
}

/* ------------------------------------------------------------------ */
/* Monthly bars (pay, spending): an unfinished month is drawn faded     */
/* ------------------------------------------------------------------ */

function MonthTick({ x = 0, y = 0, payload, partial, partialLabel }: { x?: number; y?: number; payload?: { value: string }; partial?: string | null; partialLabel: string }) {
  const value = payload?.value ?? "";
  const isPartial = !!partial && value === partial;
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={12} textAnchor="middle" fontSize={12} className="fill-muted-foreground">
        {formatDate(value, "MMM")}
      </text>
      {isPartial && (
        <text dy={26} textAnchor="middle" fontSize={10} fontWeight={600} className="fill-muted-foreground">
          {partialLabel}
        </text>
      )}
    </g>
  );
}

export interface MonthBarsProps {
  data: Row[];
  series: ChartSeries[];
  /** Full value format for the tooltip (e.g. PKR 1,234,567). */
  format: (n: number) => string;
  /** Short y-axis format (e.g. 1.2M). */
  axisFormat?: (n: number) => string;
  partial?: string | null;
  partialLabel?: string;
  /** Extra line in the tooltip of the partial month. */
  partialNote?: string;
  /** Label of a total line in the tooltip (stacked series). */
  total?: string;
  legend?: boolean;
  className?: string;
}

/**
 * Bars per month, stacked when there are several series. `partial` names a month that is still
 * in progress (a draft payroll, spending so far): its bars are faded with a dashed outline and
 * labelled under the axis, so a short bar never reads as a real drop.
 */
export function MonthBars({
  data,
  series,
  format,
  axisFormat = compactNumber,
  partial,
  partialLabel = "So far",
  partialNote,
  total,
  legend = series.length > 1,
  className,
}: MonthBarsProps) {
  const yTicks = niceTicks(
    data,
    series.map((s) => s.key),
    4,
    series.length > 1,
  );
  const hasPartial = !!partial && data.some((d) => d.month === partial);
  return (
    <div>
      {legend && <ChartKey items={[...series, ...(hasPartial ? [{ label: `${partialLabel}: month not finished`, color: CHART.muted, faded: true }] : [])]} />}
      <ChartContainer config={configOf(series)} className={cn("aspect-auto h-[220px] w-full", className)}>
        <BarChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            interval={0}
            height={hasPartial ? 34 : 24}
            tick={<MonthTick partial={partial} partialLabel={partialLabel} />}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            ticks={yTicks}
            domain={yTicks ? [0, yTicks[yTicks.length - 1]] : undefined}
            interval={0}
            tickFormatter={(v: number) => axisFormat(v)}
          />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
            content={
              <ChartTip
                series={series}
                format={format}
                total={total}
                title={(row) => `${formatDate(String(row.month), "MMMM yyyy")}${row.month === partial ? ` · ${partialLabel.toLowerCase()}` : ""}`}
                note={(row) => (row.month === partial ? partialNote : undefined)}
              />
            }
          />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId="m" fill={s.color} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36}>
              {data.map((d) => {
                const isPartial = d.month === partial;
                return (
                  <Cell
                    key={String(d.month)}
                    fillOpacity={isPartial ? 0.28 : 1}
                    stroke={isPartial ? s.color : undefined}
                    strokeDasharray={isPartial ? "3 2" : undefined}
                    strokeWidth={isPartial ? 1 : 0}
                  />
                );
              })}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked bars (attendance per day, headcount flow)                    */
/* ------------------------------------------------------------------ */

export interface StackedBarsProps {
  data: Row[];
  xKey: string;
  series: ChartSeries[];
  xFormat: (v: string) => string;
  /** Tooltip title (defaults to the axis format). */
  titleFormat?: (v: string) => string;
  className?: string;
  /** Show a colour key above the bars. */
  legend?: boolean;
  /** Label of a total line in the tooltip. */
  total?: string;
  /** Side-by-side bars instead of a stack (for opposite flows such as joiners and leavers). */
  stacked?: boolean;
}

export function StackedBars({ data, xKey, series, xFormat, titleFormat, className, legend = false, total, stacked = true }: StackedBarsProps) {
  return (
    <div>
      {legend && <ChartKey items={series} />}
      <ChartContainer config={configOf(series)} className={cn("aspect-auto h-[200px] w-full", className)}>
        <BarChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xFormat} ticks={evenTicks(data, xKey)} interval={0} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
            content={<ChartTip series={series} format={(n) => formatNumber(n, 1)} total={total} title={(row) => (titleFormat ?? xFormat)(String(row[xKey] ?? ""))} />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId={stacked ? "a" : undefined}
              fill={s.color}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={stacked ? 28 : 14}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Line of headcount (area, plain numbers)                              */
/* ------------------------------------------------------------------ */

export interface CountTrendChartProps {
  data: Row[];
  dataKey: string;
  label: string;
  className?: string;
}

export function CountTrendChart({ data, dataKey, label, className }: CountTrendChartProps) {
  const uid = useId().replace(/:/g, "");
  const series = [{ key: dataKey, label, color: CHART.primary }];
  return (
    <ChartContainer config={configOf(series)} className={cn("aspect-auto h-[180px] w-full", className)}>
      <AreaChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-count-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART.primary} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART.primary} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} ticks={evenTicks(data, "month")} interval={0} tickFormatter={(v: string) => formatDate(v, "MMM")} />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip content={<ChartTip series={series} format={(n) => formatNumber(n, 0)} title={(row) => formatDate(String(row.month ?? ""), "MMMM yyyy")} />} />
        <Area type="monotone" dataKey={dataKey} stroke={CHART.primary} strokeWidth={2} fill={`url(#fill-count-${uid})`} />
      </AreaChart>
    </ChartContainer>
  );
}
