import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/* PageHeader                                                          */
/* ------------------------------------------------------------------ */

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Buttons on the right (wrap below the title on phones). */
  actions?: ReactNode;
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode;
  /** Extra content under the header row (e.g. TabsNav). */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, actions, eyebrow, children, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-5 sm:mb-6", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="micro-label mb-1 !text-primary">{eyebrow}</p>}
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-2xl">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* SectionCard                                                         */
/* ------------------------------------------------------------------ */

export interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Remove body padding (for full-bleed tables and lists). */
  flush?: boolean;
  id?: string;
}

export function SectionCard({ title, description, icon: Icon, actions, children, footer, className, contentClassName, flush, id }: SectionCardProps) {
  const hasHeader = title || description || actions;
  return (
    <section id={id} className={cn("min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm", className)}>
      {hasHeader && (
        <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            <div className="min-w-0">
              {title && (
                <h2 className="truncate font-display text-[15px] font-semibold leading-5 tracking-tight text-foreground" title={typeof title === "string" ? title : undefined}>
                  {title}
                </h2>
              )}
              {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-4 sm:p-5", contentClassName)}>{children}</div>
      {footer && <div className="border-t border-border/60 bg-muted/30 px-4 py-3 sm:px-5">{footer}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* StatTile / StatGrid                                                 */
/* ------------------------------------------------------------------ */

export type Tone = "default" | "primary" | "success" | "warning" | "danger";

/* Icon wells use the palette's soft tints with a hairline ring; values keep the strong (AA) tone. */
const toneIcon: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground ring-1 ring-inset ring-border/60",
  primary: "bg-primary/[0.08] text-primary ring-1 ring-inset ring-primary/10",
  success: "bg-success-soft text-success ring-1 ring-inset ring-success/10",
  warning: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/15",
  danger: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/10",
};

const toneValue: Record<Tone, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  /** Makes the whole tile a link. */
  href?: string;
  loading?: boolean;
  className?: string;
}

export function StatTile({ label, value, hint, tone = "default", icon: Icon, href, loading, className }: StatTileProps) {
  const body = (
    <div
      className={cn(
        "group flex h-full min-w-0 items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors sm:p-5",
        href && "hover:border-primary/30 hover:shadow-md",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="micro-label truncate" title={typeof label === "string" ? label : undefined}>
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24 sm:h-8" />
        ) : (
          <p className={cn("tabular mt-1.5 truncate font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl", toneValue[tone])} title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}>{value}</p>
        )}
        {hint && !loading && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={typeof hint === "string" ? hint : undefined}>
            {hint}
          </p>
        )}
      </div>
      {Icon && (
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", toneIcon[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link to={href} className="block min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {body}
    </Link>
  ) : (
    body
  );
}

export interface StatGridProps {
  children: ReactNode;
  /** Max columns on wide screens (2 on phones, 3 on tablets). Default 4. */
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

const gridCols: Record<NonNullable<StatGridProps["columns"]>, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
};

export function StatGrid({ children, columns = 4, className }: StatGridProps) {
  return <div className={cn("grid gap-3 sm:gap-4", gridCols[columns], className)}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Smaller padding, for use inside cards and tables. */
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.07] text-primary ring-1 ring-inset ring-primary/10">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <p className="font-display text-[15px] font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
