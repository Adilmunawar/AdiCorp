import type { LucideIcon } from "lucide-react";
import { Armchair, Car, Headphones, Laptop, Microchip, Monitor, Package, PcCase, Printer, Router, Smartphone, Tablet } from "lucide-react";
import { differenceInCalendarDays, differenceInMonths } from "date-fns";
import { formatDate, toDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { assetConditionLabel } from "../lib/constants";
import { daysUntil } from "../lib/utils";

/*
 * Small presentational pieces for the asset register and the asset page:
 * a category icon, a condition tag and the warranty wording.
 */

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  laptop: Laptop,
  desktop: PcCase,
  monitor: Monitor,
  phone: Smartphone,
  tablet: Tablet,
  sim: Microchip,
  printer: Printer,
  network: Router,
  accessory: Headphones,
  furniture: Armchair,
  vehicle: Car,
  other: Package,
};

export function assetCategoryIcon(category: string | null | undefined): LucideIcon {
  return CATEGORY_ICONS[category ?? ""] ?? Package;
}

/** Category icon in a soft brand well. */
export function AssetIcon({ category, size = "md", className }: { category: string; size?: "md" | "lg"; className?: string }) {
  const Icon = assetCategoryIcon(category);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary/[0.08] text-primary ring-1 ring-inset ring-primary/10",
        size === "lg" ? "h-11 w-11 rounded-xl" : "h-8 w-8 rounded-lg",
        className,
      )}
      aria-hidden
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  );
}

const CONDITION_DOT: Record<string, string> = {
  new: "bg-success",
  good: "bg-success",
  fair: "bg-warning",
  poor: "bg-warning",
  damaged: "bg-danger",
};

/** Coloured dot plus the condition word (the word carries the meaning, the dot only helps scanning). */
export function ConditionTag({ condition, className }: { condition: string | null | undefined; className?: string }) {
  if (!condition) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", CONDITION_DOT[condition] ?? "bg-muted-foreground/50")} aria-hidden />
      {assetConditionLabel(condition)}
    </span>
  );
}

export type WarrantyState = "none" | "expired" | "soon" | "active";

/** Days left on a warranty and how to treat it: "soon" is within 60 days. Retired assets never count as due. */
export function warrantyState(until: string | null | undefined, status?: string): { state: WarrantyState; days: number | null } {
  const days = daysUntil(until);
  if (days === null) return { state: "none", days };
  if (days < 0) return { state: "expired", days };
  if (days <= 60 && status !== "retired") return { state: "soon", days };
  return { state: "active", days };
}

function daysPhrase(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** Warranty cell: date, "Ends in 23 days" when close, "Ended …" when over. */
export function WarrantyText({ until, status, className }: { until: string | null | undefined; status?: string; className?: string }) {
  const { state, days } = warrantyState(until, status);
  if (state === "none") return <span className={cn("text-muted-foreground", className)}>—</span>;
  if (state === "expired") {
    return (
      <span className={cn("tabular whitespace-nowrap text-muted-foreground", className)} title={`Warranty ended ${formatDate(until)}`}>
        Ended {formatDate(until, "MMM yyyy")}
      </span>
    );
  }
  if (state === "soon") {
    return (
      <span className={cn("tabular whitespace-nowrap font-semibold text-warning", className)} title={`Warranty until ${formatDate(until)}`}>
        Ends {daysPhrase(days ?? 0)}
      </span>
    );
  }
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatDate(until)}</span>;
}

/** "3 years 7 months", "2 months", "12 days" between two dates (to defaults to today). */
export function durationLabel(from: string | null | undefined, to?: string | null): string {
  const start = toDate(from);
  if (!start) return "—";
  const end = toDate(to) ?? new Date();
  if (end < start) return "Not started";
  const months = differenceInMonths(end, start);
  if (months < 1) {
    const days = differenceInCalendarDays(end, start);
    return days === 0 ? "Less than a day" : `${days} ${days === 1 ? "day" : "days"}`;
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} ${y === 1 ? "year" : "years"}` : "", m ? `${m} ${m === 1 ? "month" : "months"}` : ""].filter(Boolean).join(" ");
}
