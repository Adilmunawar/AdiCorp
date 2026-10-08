import { useMemo, useState } from "react";
import { CalendarHeart, Cake, Gift, Heart, Lock } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { CardSkeleton, EmptyState, PageHeader, SectionCard, formatRelative } from "@/components/kit";
import { errorMessage } from "../../lib/api";
import { greeting } from "../../lib/celebrations";
import { usePortalCelebrations, usePortalSendWish, usePortalShareBirthday } from "../../lib/portalApi";
import type { Occasion } from "../../lib/types";
import { TodayCards, UpcomingList } from "../../components/OccasionList";
import { PersonAvatar } from "../../components/PersonAvatar";
import { LoadError } from "../../components/LoadError";
import { PortalExtras } from "../../components/PageExtras";
import { WishDialog } from "../../components/WishDialog";

export default function PortalCelebrationsPage() {
  const { data, isPending, isError, error, refetch } = usePortalCelebrations();
  const sendWish = usePortalSendWish();
  const share = usePortalShareBirthday();
  const [wishing, setWishing] = useState<Occasion | null>(null);

  const today = useMemo(() => (data?.occasions ?? []).filter((o) => o.days_until === 0), [data]);
  const upcoming = useMemo(() => (data?.occasions ?? []).filter((o) => o.days_until > 0), [data]);
  const mine = today.find((o) => o.is_me) ?? null;
  const g = mine && data ? greeting(mine, data.company_name) : null;

  const send = async (message: string) => {
    if (!wishing) return;
    const target = wishing;
    try {
      const r = await sendWish.mutateAsync({ employeeId: target.employee_id, kind: target.kind, message });
      toast.success(r.already ? "You already sent your wishes." : `Wishes sent to ${target.name.split(/\s+/)[0]}.`);
      setWishing(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleShare = async (next: boolean) => {
    try {
      await share.mutateAsync(next);
      toast.success(next ? "Colleagues can see your birthday." : "Your birthday is private now. You still get your own greeting.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PortalExtras />
      <PageHeader eyebrow="My portal" title="Celebrations" description="Birthdays, work anniversaries and first days across the team." icon={Gift} />

      {isError ? (
        <LoadError what="Celebrations" error={error} icon={Gift} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          {g && (
            <section className="overflow-hidden rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm sm:p-5">
              <h2 className="font-display text-lg font-semibold">{g.title}</h2>
              <p className="mt-1 text-sm text-primary-foreground/85">{g.body}</p>
              {(data?.received.length ?? 0) > 0 && (
                <ul className="mt-4 space-y-2">
                  {data!.received.map((w) => (
                    <li key={w.id} className="flex items-start gap-2.5 rounded-xl bg-primary-foreground/10 px-3 py-2">
                      <PersonAvatar name={w.from_name} src={w.from_avatar} size="xs" className="border-primary-foreground/30 bg-primary-foreground/20 text-primary-foreground" />
                      <div className="min-w-0 text-xs">
                        <p className="font-bold">{w.from_name ?? "A colleague"}</p>
                        {w.message && <p className="text-primary-foreground/85">“{w.message}”</p>}
                        <p className="text-[10px] text-primary-foreground/70">{formatRelative(w.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <SectionCard title="Today" description="Send your wishes on the day." icon={Heart}>
            {isPending ? (
              <CardSkeleton />
            ) : today.length === 0 ? (
              <EmptyState icon={Gift} title="Nothing to celebrate today" description="See what is coming up below." compact />
            ) : (
              <TodayCards occasions={today} onWish={setWishing} />
            )}
          </SectionCard>

          <SectionCard title="Coming up" description="The next 30 days" icon={CalendarHeart}>
            {isPending ? (
              <CardSkeleton lines={5} />
            ) : upcoming.length === 0 ? (
              <EmptyState icon={CalendarHeart} title="No celebrations in the next 30 days" compact />
            ) : (
              <UpcomingList occasions={upcoming} />
            )}
          </SectionCard>

          {data?.has_birthday && (
            <SectionCard title="Your birthday" icon={Cake}>
              <label className="flex cursor-pointer items-start justify-between gap-3">
                <span>
                  <span className="block text-xs font-bold">Show my birthday to colleagues</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> Only the day and month are ever shown, never the year.
                  </span>
                </span>
                <Switch checked={data.share_birthday} disabled={share.isPending} onCheckedChange={toggleShare} aria-label="Show my birthday to colleagues" />
              </label>
            </SectionCard>
          )}
        </div>
      )}

      <WishDialog occasion={wishing} onOpenChange={(o) => !o && setWishing(null)} onSend={send} pending={sendWish.isPending} />
    </div>
  );
}
