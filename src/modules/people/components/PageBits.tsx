import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, Skeleton } from "@/components/kit";
import { cn } from "@/lib/utils";

export interface QuickFilterOption {
  value: string;
  label: string;
  count?: number;
  /** Colours the count when it is not zero (e.g. overdue in danger). */
  tone?: "default" | "warning" | "danger";
}

const countTone = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

/**
 * One-tap filter chips with live counts (a pressed chip is the active filter).
 * Scrolls sideways inside itself on phones instead of wrapping into a wall.
 */
export function QuickFilters({ options, value, onChange, label, className }: { options: QuickFilterOption[]; value: string; onChange: (value: string) => void; label: string; className?: string }) {
  return (
    <div className={cn("-mx-1 min-w-0 overflow-x-auto px-1 hide-scrollbar", className)}>
      <div role="group" aria-label={label} className="flex w-max gap-1.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8",
                on ? "border-primary/30 bg-primary/[0.08] text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {o.label}
              {o.count !== undefined && (
                <span
                  className={cn(
                    "tabular min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-[18px]",
                    on ? "bg-primary/10 text-primary" : countTone[o.count > 0 ? o.tone ?? "default" : "default"],
                  )}
                >
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Inline error state with a retry, for lists and detail pages whose query failed. */
export function LoadError({ what, icon, onRetry, inline, className }: { what: string; icon: LucideIcon; onRetry?: () => void; inline?: boolean; className?: string }) {
  return (
    <div className={cn(!inline && "rounded-2xl border border-border bg-card shadow-sm", className)} role="alert">
      <EmptyState
        icon={icon}
        title={`${what} could not be loaded`}
        description="Check your connection and try again. Nothing was changed."
        compact={inline}
        action={
          onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

/** Loading state shaped like the asset and checklist pages: back link, header card with a fact strip, main column and side cards. */
export function DetailSkeleton({ sideCards = 2 }: { sideCards?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-3 h-5 w-24" />
      <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3.5 p-4 sm:p-5">
          <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-6 w-56 max-w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 bg-card px-4 py-3 sm:px-5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <CardSkeleton lines={6} />
        <div className="space-y-4">
          {Array.from({ length: sideCards }).map((_, i) => (
            <CardSkeleton key={i} lines={3} />
          ))}
        </div>
      </div>
    </div>
  );
}
