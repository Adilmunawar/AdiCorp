import { useMemo, useState } from "react";
import { Cake, CalendarHeart, Gift, Heart, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { CardSkeleton, EmptyState, PageHeader, SectionCard, StatGrid, StatTile, formatRelative } from "@/components/kit";
import { errorMessage, useCelebrations, useSendWish } from "../lib/api";
import { KindIcon } from "../components/KindIcon";
import type { Occasion } from "../lib/types";
import { ComingUpCard } from "../components/ComingUp";
import { TodayCards, UpcomingList } from "../components/OccasionList";
import { LoadError } from "../components/LoadError";
import { StaffExtras } from "../components/PageExtras";
import { WishDialog } from "../components/WishDialog";

export default function CelebrationsPage() {
  const { data, isPending, isError, error, refetch } = useCelebrations();
  const sendWish = useSendWish();
  const [wishing, setWishing] = useState<Occasion | null>(null);

  const today = useMemo(() => (data?.occasions ?? []).filter((o) => o.days_until === 0), [data]);
  const upcoming = useMemo(() => (data?.occasions ?? []).filter((o) => o.days_until > 0), [data]);
  const birthdays = (data?.occasions ?? []).filter((o) => o.kind === "birthday").length;
  const anniversaries = (data?.occasions ?? []).filter((o) => o.kind === "anniversary").length;

  const send = async (message: string) => {
    if (!wishing) return;
    const target = wishing;
    try {
      const r = await sendWish.mutateAsync({ employeeId: target.employee_id, kind: target.kind, message });
      toast.success(r.already ? `You already sent ${target.name.split(/\s+/)[0]} your wishes.` : `Wishes sent to ${target.name.split(/\s+/)[0]}.`);
      setWishing(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <StaffExtras showComingUp={false} />
      <PageHeader
        title="Celebrations"
        eyebrow="Engagement"
        description="Birthdays, work anniversaries and first days. Everyone celebrating gets a greeting at 9 am, and colleagues can send wishes."
        icon={PartyPopper}
      />

      <StatGrid columns={4} className="mb-4">
        <StatTile label="Today" value={isError ? "—" : today.length} tone={today.length ? "primary" : "default"} icon={Gift} loading={isPending} />
        <StatTile label="Next 30 days" value={isError ? "—" : (data?.occasions ?? []).length} icon={CalendarHeart} loading={isPending} />
        <StatTile label="Birthdays" value={isError ? "—" : birthdays} icon={Cake} loading={isPending} />
        <StatTile label="Anniversaries" value={isError ? "—" : anniversaries} icon={PartyPopper} loading={isPending} />
      </StatGrid>

      {isError ? (
        <LoadError what="Celebrations" error={error} icon={PartyPopper} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <SectionCard title="Today" description="Send wishes on the day: they arrive in the portal and on their phone." icon={Gift}>
              {isPending ? (
                <CardSkeleton />
              ) : today.length === 0 ? (
                <EmptyState icon={Gift} title="Nothing to celebrate today" description="Upcoming birthdays and anniversaries are listed below." compact />
              ) : (
                <TodayCards occasions={today} onWish={setWishing} />
              )}
            </SectionCard>
            <SectionCard title="Coming up" description="The next 30 days. Private birthdays are not shown." icon={CalendarHeart}>
              {isPending ? (
                <CardSkeleton lines={5} />
              ) : upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarHeart}
                  title="No celebrations in the next 30 days"
                  description="Add dates of birth and joining dates to employee profiles to see them here."
                  compact
                />
              ) : (
                <UpcomingList occasions={upcoming} />
              )}
            </SectionCard>
          </div>
          <div className="min-w-0 space-y-4">
            <ComingUpCard />
            <SectionCard title="Recent wishes" description="The last 7 days" icon={Heart}>
              {isPending ? (
                <CardSkeleton />
              ) : (data?.recent_wishes ?? []).length === 0 ? (
                <EmptyState icon={Heart} title="No wishes this week" description="Wishes colleagues send show up here." compact />
              ) : (
                <ul className="space-y-2.5">
                  {(data?.recent_wishes ?? []).map((w) => (
                    <li key={w.id} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background px-3 py-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                        <KindIcon kind={w.kind} className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug">
                          <strong className="font-semibold">{w.from_name ?? "A colleague"}</strong>
                          <span className="text-muted-foreground"> to </span>
                          <strong className="font-semibold">{w.to_name ?? "a colleague"}</strong>
                        </p>
                        {w.message && <p className="mt-0.5 break-words text-[11px] italic text-muted-foreground">“{w.message}”</p>}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatRelative(w.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      <WishDialog occasion={wishing} onOpenChange={(o) => !o && setWishing(null)} onSend={send} pending={sendWish.isPending} />
    </div>
  );
}
