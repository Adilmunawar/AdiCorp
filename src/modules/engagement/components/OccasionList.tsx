import { Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { occasionLabel, whenLabel } from "../lib/celebrations";
import { KindIcon } from "./KindIcon";
import type { Occasion } from "../lib/types";
import { PersonAvatar } from "./PersonAvatar";

/** Today's celebrations as cards with a wish button. */
export function TodayCards({ occasions, onWish }: { occasions: Occasion[]; onWish?: (o: Occasion) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
      {occasions.map((o) => (
        <article
          key={`${o.kind}-${o.employee_id}`}
          className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-center gap-3">
            <PersonAvatar name={o.name} src={o.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" title={o.name}>{o.name}</p>
              <p className="truncate text-[11px] text-muted-foreground" title={[o.rank, o.department].filter(Boolean).join(" · ") || undefined}>
                {[o.rank, o.department].filter(Boolean).join(" · ") || "Employee"}
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <KindIcon kind={o.kind} /> {occasionLabel(o)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {o.wishes} {o.wishes === 1 ? "wish" : "wishes"} so far
            </span>
            {o.is_me ? (
              <span className="text-[11px] font-bold text-primary">That's you</span>
            ) : onWish ? (
              o.wished ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success">
                  <Check className="h-3.5 w-3.5" /> Wished
                </span>
              ) : (
                <Button size="sm" className="h-8 gap-1.5 rounded-xl text-xs" onClick={() => onWish(o)}>
                  <Heart className="h-3.5 w-3.5" /> Send wishes
                </Button>
              )
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Upcoming occasions as a compact dated list. */
export function UpcomingList({ occasions }: { occasions: Occasion[] }) {
  return (
    <ul className="divide-y divide-border/60">
      {occasions.map((o) => (
        <li key={`${o.kind}-${o.employee_id}-${o.date}`} className="flex items-center gap-3 py-2.5">
          <div className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-border bg-background py-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-primary">{formatDate(o.date, "MMM")}</span>
            <span className="tabular text-sm font-bold leading-tight">{formatDate(o.date, "d")}</span>
          </div>
          <PersonAvatar name={o.name} src={o.avatar_url} />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-xs font-bold", o.is_me && "text-primary")}>{o.is_me ? `${o.name} (you)` : o.name}</p>
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <KindIcon kind={o.kind} className="h-3 w-3" /> {occasionLabel(o)}
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{whenLabel(o.days_until)}</span>
        </li>
      ))}
    </ul>
  );
}
