import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PollOption } from "../lib/types";

interface PollResultsProps {
  options: PollOption[];
  /** Highlight this option (the viewer's vote). */
  chosenId?: string | null;
  /** Show vote counts next to percentages (staff only). */
  showCounts?: boolean;
  className?: string;
}

/** Horizontal result bars; the leading option is emphasised. */
export function PollResults({ options, chosenId, showCounts, className }: PollResultsProps) {
  const top = Math.max(0, ...options.map((o) => o.percent ?? 0));
  return (
    <ul className={cn("space-y-2", className)}>
      {options.map((o) => {
        const pct = o.percent ?? 0;
        const leading = top > 0 && pct === top;
        const chosen = chosenId === o.id;
        return (
          <li key={o.id}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className={cn("flex min-w-0 items-center gap-1.5", leading ? "font-bold text-foreground" : "font-medium text-foreground/80")}>
                {chosen && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" title="Your vote">
                    <Check className="h-2.5 w-2.5" aria-hidden />
                    <span className="sr-only">Your vote:</span>
                  </span>
                )}
                <span className="truncate">{o.text}</span>
              </span>
              <span className="tabular shrink-0 font-bold text-foreground">
                {pct}%{showCounts && typeof o.votes === "number" && <span className="ml-1 font-semibold text-muted-foreground">({o.votes})</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700 ease-out", leading ? "bg-primary" : "bg-primary/40")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
