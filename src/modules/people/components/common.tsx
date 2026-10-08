import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { initials } from "@/components/kit";
import { cn } from "@/lib/utils";

/**
 * StatTile className for two-up tiles on phones: drops the tile icon below 640px so the
 * label gets the full width instead of truncating. Only for tiles that pass an icon.
 */
export const PHONE_TILE = "[&>div:nth-child(2)]:hidden sm:[&>div:nth-child(2)]:flex";

export function EmployeeAvatar({ name, src, className, fallbackClassName }: { name: string; src?: string | null; className?: string; fallbackClassName?: string }) {
  return (
    <Avatar className={cn("h-9 w-9 shrink-0 rounded-xl border border-border", className)}>
      {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
      <AvatarFallback className={cn("rounded-xl bg-primary/10 text-[11px] font-bold text-primary", fallbackClassName)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Avatar + name (+ code/position) that links to the profile. */
export function EmployeeChip({
  id,
  name,
  avatar,
  subtitle,
  link = true,
  className,
}: {
  id: string;
  name: string;
  avatar?: string | null;
  subtitle?: ReactNode;
  link?: boolean;
  className?: string;
}) {
  const body = (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <EmployeeAvatar name={name} src={avatar} className="h-8 w-8" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-foreground">{name}</span>
        {subtitle && <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  );
  if (!link) return body;
  return (
    <Link to={`/employees/${id}`} className="min-w-0 rounded-lg hover:opacity-90" onClick={(e) => e.stopPropagation()}>
      {body}
    </Link>
  );
}

export interface InfoItem {
  label: string;
  value: ReactNode;
  /** Span the full row. */
  wide?: boolean;
}

/** Label/value pairs in a responsive grid. Empty values show a dash. */
export function InfoGrid({ items, columns = 2, className }: { items: InfoItem[]; columns?: 2 | 3; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3.5", columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-full")}>
          <dt className="micro-label">{item.label}</dt>
          <dd className="mt-0.5 break-words text-[13px] font-medium text-foreground">
            {item.value === null || item.value === undefined || item.value === "" ? <span className="text-muted-foreground">—</span> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Form field shell: label, control, hint and error with ARIA wiring. */
export function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Thin progress bar with an accessible value. */
export function ProgressBar({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "success" | "warning" | "danger" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const bar = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-destructive" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Circular progress for checklist headers. */
export function ProgressRing({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct * 100)}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="fill-none stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cn("fill-none transition-[stroke-dashoffset] duration-700", pct >= 1 ? "stroke-success" : "stroke-primary")}
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{Math.round(pct * 100)}%</span>
    </div>
  );
}
