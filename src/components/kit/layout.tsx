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
    <header
      className={cn(
        "relative isolate mb-5 overflow-hidden rounded-[20px] border border-border/70 bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] sm:mb-6",
        className,
      )}
    >
      {/* Brand light from the top-right and a fine dot grid that fades out: quiet, but no longer a bare white strip. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_140%_at_100%_0%,hsl(var(--brand-100)/0.75),transparent_70%)] dark:bg-[radial-gradient(55%_140%_at_100%_0%,hsl(var(--brand-800)/0.35),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(hsl(var(--brand-700)/0.09)_1px,transparent_1.2px)] [background-size:16px_16px] [mask-image:linear-gradient(to_left,black,transparent_50%)]"
      />
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          {Icon && (
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_8px_18px_-8px_hsl(var(--brand-700)/0.7)] sm:flex">
              <Icon className="h-[22px] w-[22px]" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>}
            <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-[26px]">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-[13.5px] leading-5 text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
      {/* Tabs sit flush on the header's bottom edge; anything else gets breathing room. */}
      {children && (
        <div className="border-t border-border/60 bg-card/60 px-5 pb-4 pt-3 sm:px-6 has-[[data-tabsnav]]:pb-0 has-[[data-tabsnav]]:pt-0 [&_[data-tabsnav]]:border-b-0">
          {children}
        </div>
      )}
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
    <section id={id} className={cn("min-w-0 overflow-hidden rounded-[18px] border border-border/70 bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-16px_hsl(var(--brand-950)/0.12)]", className)}>
      {hasHeader && (
        <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-primary ring-1 ring-inset ring-brand-100 dark:bg-primary/10 dark:ring-primary/20">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            )}
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
  default: "bg-gradient-to-br from-neutral-500 to-neutral-700 text-white",
  primary: "bg-gradient-to-br from-brand-500 to-brand-700 text-white",
  success: "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white",
  warning: "bg-gradient-to-br from-amber-400 to-amber-600 text-white",
  danger: "bg-gradient-to-br from-rose-500 to-rose-700 text-white",
};

const toneWash: Record<Tone, string> = {
  default: "from-neutral-200/60",
  primary: "from-brand-100",
  success: "from-emerald-100/80",
  warning: "from-amber-100/80",
  danger: "from-rose-100/80",
};

const toneValue: Record<Tone, string> = {
  default: "text-foreground",
  primary: "text-foreground",
  success: "text-foreground",
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
        "group relative isolate flex h-full min-w-0 items-start justify-between gap-3 overflow-hidden rounded-[18px] border border-border/70 bg-card p-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] transition-[border-color,box-shadow] sm:p-5",
        href && "hover:border-primary/25 hover:shadow-[0_10px_28px_-14px_hsl(var(--brand-800)/0.35)]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-muted-foreground" title={typeof label === "string" ? label : undefined}>
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24 sm:h-8" />
        ) : (
          <p className={cn("tabular mt-1.5 truncate font-display text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]", toneValue[tone])} title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}>{value}</p>
        )}
        {hint && !loading && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={typeof hint === "string" ? hint : undefined}>
            {hint}
          </p>
        )}
      </div>
      {Icon && (
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_6px_14px_-6px_hsl(var(--foreground)/0.3)]", toneIcon[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </div>
      )}
      {/* Last child on purpose: pages hide the icon on phones with [&>div:nth-child(2)]. */}
      <div aria-hidden className={cn("pointer-events-none absolute -right-10 -top-10 -z-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent opacity-80 dark:opacity-20", toneWash[tone])} />
    </div>
  );
  return href ? (
    <Link to={href} className="block min-w-0 rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
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
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary ring-1 ring-inset ring-brand-200/60 dark:from-primary/10 dark:to-primary/20 dark:ring-primary/20">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <p className="font-display text-[15px] font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
