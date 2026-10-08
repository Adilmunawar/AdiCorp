import { Check } from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { ComplaintStatus } from "../lib/types";

const COMPLAINT_TONE: Record<ComplaintStatus, BadgeTone> = { pending: "warning", investigating: "info", resolved: "success" };

/** Complaint status pill: pending (amber), investigating (blue), resolved (green). */
export function ComplaintBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  return <StatusBadge status={status} tone={COMPLAINT_TONE[status] ?? "neutral"} className={className} />;
}

const STEPS: Array<{ status: ComplaintStatus; label: string }> = [
  { status: "pending", label: "Received" },
  { status: "investigating", label: "Investigating" },
  { status: "resolved", label: "Resolved" },
];

/** Three-step progress: received, investigating, resolved. */
export function ComplaintProgress({ status, className }: { status: ComplaintStatus; className?: string }) {
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className={cn("flex items-center", className)} aria-label={`Progress: ${STEPS[current]?.label ?? status}`}>
      {STEPS.map((step, i) => {
        const done = i < current || status === "resolved";
        const active = i === current && status !== "resolved";
        return (
          <li key={step.status} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
            <span className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors",
                  done ? "border-success bg-success text-success-foreground" : active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
              </span>
              <span className={cn("whitespace-nowrap text-[10px] font-bold uppercase tracking-wider", done || active ? "text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </span>
            {i < STEPS.length - 1 && <span className={cn("mx-1.5 mb-4 h-0.5 flex-1 rounded-full", i < current || status === "resolved" ? "bg-success" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
