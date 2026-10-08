import { statusTone, type BadgeTone } from "./StatusBadge";

/*
 * Chart colours from src/styles/palette.css (see src/styles/PALETTE.md).
 * Series take slots in this fixed order and never cycle: an entity keeps its colour
 * even when filters change how many series are shown. Past 8 series, fold the rest
 * into "Other" (CHART_OTHER) or split into small multiples.
 */
export const CHART_SERIES = [
  "hsl(var(--chart-1))", // blue (brand)
  "hsl(var(--chart-2))", // sky
  "hsl(var(--chart-3))", // green
  "hsl(var(--chart-4))", // amber
  "hsl(var(--chart-5))", // violet
  "hsl(var(--chart-6))", // red
  "hsl(var(--chart-7))", // teal
  "hsl(var(--chart-8))", // magenta
] as const;

/** Colour for the "Other" bucket and for series past the eighth slot. */
export const CHART_OTHER = "hsl(var(--muted-foreground))";

/** Gridlines, axis ticks and baselines: recessive chart chrome. */
export const CHART_CHROME = {
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted-foreground))",
  cursor: "hsl(var(--muted))",
} as const;

/** Series colour by position (0-based). Index 8+ returns CHART_OTHER rather than repeating a hue. */
export function chartColor(index: number): string {
  return index >= 0 && index < CHART_SERIES.length ? CHART_SERIES[index] : CHART_OTHER;
}

/** Status colours for series that MEAN a state (present/absent, paid/overdue). Never mix with CHART_SERIES in one chart. */
export const STATUS_COLORS: Record<BadgeTone, string> = {
  default: "hsl(var(--muted-foreground))",
  neutral: "hsl(var(--muted-foreground))",
  primary: "hsl(var(--primary))",
  info: "hsl(var(--info))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--danger))",
};

/** Colour for a status string, matching the StatusBadge tone for the same status. */
export function statusColor(status: string | null | undefined): string {
  return STATUS_COLORS[statusTone(status)];
}

/**
 * Builds a shadcn/recharts ChartConfig with palette colours in slot order.
 * `chartConfig([{ key: "gross", label: "Gross" }, { key: "net", label: "Net" }])`
 */
export function chartConfig<K extends string>(series: ReadonlyArray<{ key: K; label: string; color?: string }>): Record<K, { label: string; color: string }> {
  const out = {} as Record<K, { label: string; color: string }>;
  series.forEach((s, i) => {
    out[s.key] = { label: s.label, color: s.color ?? chartColor(i) };
  });
  return out;
}
