import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CalendarHeart, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { CardSkeleton, SectionCard, formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useComingUp } from "../lib/api";
import { whenLabel } from "../lib/celebrations";
import { KindIcon } from "./KindIcon";
import { store } from "../lib/push";
import type { ComingUp } from "../lib/types";

function dayDiff(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);
}

function Agenda({ data, onNavigate }: { data: ComingUp; onNavigate?: () => void }) {
  return (
    <div className="space-y-4">
      {data.waiting.length > 0 && (
        <div>
          <p className="micro-label mb-2">Waiting for you</p>
          <div className="flex flex-wrap gap-2">
            {data.waiting.map((w) => (
              <Link
                key={w.label}
                to={w.href}
                onClick={onNavigate}
                className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/[0.07] px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-warning/50"
              >
                <span className="tabular font-bold text-warning">{w.n}</span> {w.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="micro-label mb-2">This week</p>
        {data.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No holidays, events or celebrations in the next 7 days.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.items.map((item, i) => {
              const days = dayDiff(data.from, item.date);
              const celebration = item.kind === "birthday" || item.kind === "anniversary" || item.kind === "welcome";
              return (
                <li key={`${item.date}-${item.title}-${i}`}>
                  <Link
                    to={item.href}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm",
                        celebration ? "bg-primary/10 text-primary" : item.kind === "holiday" ? "bg-success/10 text-success" : "bg-info/10 text-info",
                      )}
                      aria-hidden
                    >
                      {celebration ? <KindIcon kind={item.kind} className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{item.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{item.detail}</span>
                    </span>
                    <span className={cn("shrink-0 text-[10px] font-bold uppercase tracking-wider", days === 0 ? "text-primary" : "text-muted-foreground")}>
                      {days <= 1 ? whenLabel(days) : formatDate(item.date, "EEE d MMM")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** HR's week ahead: holidays, events, celebrations and what is waiting. */
export function ComingUpCard({ className }: { className?: string }) {
  const { data, isPending, isError } = useComingUp();
  return (
    <SectionCard title="Coming up" description="The next 7 days, and what is waiting for you" icon={CalendarHeart} className={className}>
      {isPending ? (
        <CardSkeleton />
      ) : isError || !data ? (
        <p className="text-xs text-muted-foreground">The week ahead could not be loaded.</p>
      ) : (
        <Agenda data={data} />
      )}
    </SectionCard>
  );
}

const seenKey = (userId: string) => `adicorp.coming-up.seen.${userId}`;

/** Once a day, HR and the owner get the week ahead as a pop-up when there is something in it. */
export function ComingUpOnceADay() {
  const { user, isHR } = useAuth();
  const { data } = useComingUp(isHR);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !data) return;
    if (data.items.length === 0 && data.waiting.length === 0) return;
    if (store.get(seenKey(user.id)) === data.from) return;
    store.set(seenKey(user.id), data.from);
    setOpen(true);
  }, [user, data]);

  if (!data) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-base font-semibold">
            <PartyPopper className="h-4 w-4 text-primary" /> Your week ahead
          </DialogTitle>
          <DialogDescription className="text-xs">
            {formatDate(data.from, "EEE d MMM")} to {formatDate(data.to, "EEE d MMM")}
          </DialogDescription>
        </DialogHeader>
        <Agenda data={data} onNavigate={() => setOpen(false)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button asChild variant="outline" size="sm" className="rounded-xl" onClick={() => setOpen(false)}>
            <Link to="/celebrations">
              <CalendarHeart className="h-3.5 w-3.5" /> Celebrations
            </Link>
          </Button>
          <Button size="sm" className="rounded-xl" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
