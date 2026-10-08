import { cn } from "@/lib/utils";
import { humanize } from "./format";
import type { Tone } from "./layout";

export type BadgeTone = Tone | "info" | "neutral";

const STATUS_TONES: Record<string, BadgeTone> = {
  // positive
  active: "success",
  approved: "success",
  present: "success",
  paid: "success",
  completed: "success",
  complete: "success",
  done: "success",
  resolved: "success",
  signed: "success",
  hired: "success",
  published: "success",
  open: "success",
  reimbursed: "success",
  finalized: "success",
  issued: "success",
  // waiting
  pending: "warning",
  draft: "warning",
  submitted: "warning",
  in_review: "warning",
  review: "warning",
  awaiting: "warning",
  short_leave: "warning",
  half_day: "warning",
  late: "warning",
  processing: "warning",
  scheduled: "info",
  interview: "info",
  shortlisted: "info",
  in_progress: "info",
  leave: "info",
  on_leave: "info",
  holiday: "info",
  weekend: "neutral",
  // negative
  rejected: "danger",
  absent: "danger",
  cancelled: "neutral",
  canceled: "neutral",
  separated: "neutral",
  terminated: "neutral",
  inactive: "neutral",
  closed: "neutral",
  archived: "neutral",
  expired: "danger",
  overdue: "danger",
  failed: "danger",
  declined: "danger",
  disabled: "neutral",
};

/* Soft tint + strong text from src/styles/palette.css: every pair is WCAG AA (>= 5:1). */
const toneClass: Record<BadgeTone, string> = {
  default: "border-border/70 bg-muted text-foreground",
  neutral: "border-transparent bg-muted text-muted-foreground",
  primary: "border-primary/15 bg-primary/[0.08] text-primary",
  info: "border-info/15 bg-info-soft text-info",
  success: "border-success/15 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-danger/15 bg-danger-soft text-danger",
};

const dotClass: Record<BadgeTone, string> = {
  default: "bg-foreground/50",
  neutral: "bg-muted-foreground/60",
  primary: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Tone the kit uses for a status string (exported so charts and legends can match). */
export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  return STATUS_TONES[status.toLowerCase().replace(/[\s-]+/g, "_")] ?? "default";
}

export interface StatusBadgeProps {
  status: string | null | undefined;
  /** Text to show instead of the humanized status. */
  label?: string;
  tone?: BadgeTone;
  className?: string;
  /** Show the leading dot (default true). */
  dot?: boolean;
}

export function StatusBadge({ status, label, tone, className, dot = true }: StatusBadgeProps) {
  const t = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        toneClass[t],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass[t])} aria-hidden />}
      <span className="truncate">{label ?? humanize(status ?? "unknown")}</span>
    </span>
  );
}
