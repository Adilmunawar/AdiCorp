import { useEffect, useState, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initials } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useDepartments } from "../api";
import { STATUS_META, shareTone } from "../lib";
import type { AttendanceStatus } from "../types";

/** Avatar + name + code/rank, used across time tables. */
export function PersonCell({
  name,
  code,
  sub,
  avatarUrl,
  className,
  trailing,
}: {
  name: string;
  code?: string | null;
  sub?: ReactNode;
  avatarUrl?: string | null;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar className="h-8 w-8 shrink-0 rounded-xl border border-border">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
        <AvatarFallback className="rounded-xl bg-primary/10 text-[11px] font-bold text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
        {(code || sub) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {code}
            {code && sub ? " · " : null}
            {sub}
          </p>
        )}
      </div>
      {trailing}
    </div>
  );
}

/** Department filter; "all" maps to null. Hidden when the company has no departments yet. */
export function DepartmentSelect({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
}) {
  const { data: departments = [] } = useDepartments();
  if (departments.length === 0) return null;
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : v)}>
      <SelectTrigger className={cn("h-9 w-full rounded-xl sm:w-48", className)} aria-label="Department">
        <SelectValue placeholder="All departments" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All departments</SelectItem>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Register legend. */
export function StatusLegend({ className, compact }: { className?: string; compact?: boolean }) {
  const items: AttendanceStatus[] = ["present", "half_day", "short_leave", "leave", "absent"];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground", className)}>
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded border text-[9px] font-bold", STATUS_META[s].cell)}>
            {STATUS_META[s].code}
          </span>
          {STATUS_META[s].label}
        </span>
      ))}
      {!compact && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded border border-border bg-muted" />
            Day off
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            Event
          </span>
        </>
      )}
    </div>
  );
}

/** Horizontal share-of-target bar with the threshold marker. */
export function ShareBar({ pct, threshold, className }: { pct: number | null | undefined; threshold: number; className?: string }) {
  const tone = shareTone(pct, threshold);
  const width = Math.max(0, Math.min(100, pct ?? 0));
  const bar = { success: "bg-success", warning: "bg-warning", danger: "bg-destructive", default: "bg-muted-foreground/40" }[tone];
  const text = { success: "text-success", warning: "text-warning", danger: "text-destructive", default: "text-muted-foreground" }[tone];
  return (
    <div className={cn("flex min-w-[110px] items-center gap-2", className)}>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${width}%` }} />
        <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${threshold}%` }} aria-hidden />
      </div>
      <span className={cn("tabular w-12 text-right text-xs font-bold", text)}>{pct === null || pct === undefined ? "—" : `${pct.toFixed(1)}%`}</span>
    </div>
  );
}

/** Current time, re-read every `intervalMs` so relative times and "due in" chips stay fresh. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Status dot; pulses while a time clock (or the live feed) is connected. */
export function LiveDot({ tone, pulse, label, className }: { tone: "success" | "warning" | "danger" | "neutral"; pulse?: boolean; label?: string; className?: string }) {
  const color = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", neutral: "bg-muted-foreground/50" }[tone];
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5 shrink-0", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none", color)} />}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}

/** Small inline flag chip. */
export function Flag({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "warning" | "danger" | "info" | "success" | "primary"; title?: string }) {
  const map = {
    neutral: "border-border bg-muted text-muted-foreground",
    warning: "border-warning/20 bg-warning-soft text-warning",
    danger: "border-danger/15 bg-danger-soft text-danger",
    info: "border-info/15 bg-info-soft text-info",
    success: "border-success/15 bg-success-soft text-success",
    primary: "border-primary/15 bg-primary/[0.08] text-primary",
  } as const;
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold leading-4", map[tone])}>
      {children}
    </span>
  );
}
