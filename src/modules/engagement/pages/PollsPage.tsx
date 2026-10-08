import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Clock, Lock, LockOpen, Plus, Trash2, UserCheck, UserX, Users, Vote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  RowActions,
  StatGrid,
  StatTile,
  StatusBadge,
  TabsNav,
  formatDateTime,
  formatRelative,
  useTabParam,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import { errorMessage, useDeletePoll, usePollDetail, usePolls, useSetPollStatus } from "../lib/api";
import type { StaffPoll } from "../lib/types";
import { PersonAvatar } from "../components/PersonAvatar";
import { PollDialog } from "../components/PollDialog";
import { PollResults } from "../components/PollResults";
import { LoadError } from "../components/LoadError";
import { StaffExtras } from "../components/PageExtras";

const TABS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

function deadlineText(p: StaffPoll): string | null {
  if (p.status === "closed") return p.closed_at ? `Closed ${formatRelative(p.closed_at)}` : "Closed";
  if (p.expires_at) return `${new Date(p.expires_at).getTime() <= Date.now() ? "Closed" : "Closes"} ${formatRelative(p.expires_at)}`;
  return null;
}

function PollCard({ poll, onOpen }: { poll: StaffPoll; onOpen: () => void }) {
  const setStatus = useSetPollStatus();
  const remove = useDeletePoll();
  // Votes of people who have since left still count, while "eligible" is today's active staff: cap at 100%.
  const turnout = poll.eligible > 0 ? Math.min(100, Math.round((poll.total_votes / poll.eligible) * 100)) : 0;
  const deadline = deadlineText(poll);

  const change = async (status: "active" | "closed") => {
    try {
      await setStatus.mutateAsync({ id: poll.id, status });
      toast.success(status === "closed" ? "Poll closed. Employees can see the results." : "Poll reopened.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={poll.status === "open" ? "open" : "closed"} />
            {deadline && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden /> {deadline}
              </span>
            )}
          </div>
          <h2 className="font-display text-[15px] font-semibold leading-snug">{poll.question}</h2>
          {poll.description && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{poll.description}</p>}
        </div>
        <RowActions
          label={`Actions for ${poll.question}`}
          actions={[
            { label: "Who voted", icon: Users, onSelect: onOpen },
            poll.status === "open"
              ? {
                  label: "Close poll",
                  icon: Lock,
                  confirm: { title: "Close this poll?", description: "No more votes are taken and employees see the final results.", confirmLabel: "Close poll" },
                  onSelect: () => change("closed"),
                }
              : { label: "Reopen poll", icon: LockOpen, onSelect: () => change("active") },
            {
              label: "Delete",
              icon: Trash2,
              destructive: true,
              separated: true,
              confirm: { title: "Delete this poll?", description: "The poll and every vote in it are removed. This cannot be undone.", confirmLabel: "Delete" },
              onSelect: async () => {
                try {
                  await remove.mutateAsync(poll.id);
                  toast.success("Poll deleted.");
                } catch (e) {
                  toast.error(errorMessage(e));
                  throw e;
                }
              },
            },
          ]}
        />
      </div>
      <PollResults options={poll.options} showCounts className="mt-4" />
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-muted-foreground">
              {poll.total_votes} of {poll.eligible} voted
            </span>
            <span className="tabular font-bold">{turnout}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success transition-[width] duration-700" style={{ width: `${Math.min(100, turnout)}%` }} />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 rounded-xl text-xs" onClick={onOpen}>
          <Users className="h-3.5 w-3.5" /> Voters
        </Button>
      </div>
    </article>
  );
}

function PollDetailSheet({ pollId, onClose }: { pollId: string | null; onClose: () => void }) {
  const { data, isPending, isError, error } = usePollDetail(pollId);
  const byOption = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["voters"]>();
    for (const v of data?.voters ?? []) map.set(v.option_id, [...(map.get(v.option_id) ?? []), v]);
    return map;
  }, [data]);

  return (
    <Sheet open={!!pollId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/70 px-5 py-4 pr-12 text-left">
          <SheetTitle className="font-display text-base font-semibold">{data?.poll.question ?? "Poll"}</SheetTitle>
          <SheetDescription className="text-xs">
            {data ? `${data.poll.total_votes} of ${data.poll.eligible} employees voted · started ${formatDateTime(data.poll.created_at)}` : isError ? "Votes and voters" : "Loading…"}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-5 py-4">
          {isPending ? (
            <ListSkeleton rows={4} />
          ) : isError || !data ? (
            <EmptyState icon={Vote} title="This poll could not be loaded" description={errorMessage(error)} compact />
          ) : (
            <>
              <PollResults options={data.poll.options} showCounts />
              <section>
                <p className="micro-label mb-2 flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-success" /> Who voted for what
                </p>
                {data.voters.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nobody has voted yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.poll.options.map((o) => {
                      const voters = byOption.get(o.id) ?? [];
                      if (!voters.length) return null;
                      return (
                        <div key={o.id} className="rounded-xl border border-border">
                          <p className="border-b border-border/60 bg-muted/30 px-3 py-2 text-xs font-bold">
                            {o.text} <span className="font-semibold text-muted-foreground">· {voters.length}</span>
                          </p>
                          <ul className="divide-y divide-border/50">
                            {voters.map((v) => (
                              <li key={v.employee_id} className="flex items-center gap-2.5 px-3 py-2">
                                <PersonAvatar name={v.name} src={v.avatar_url} size="xs" />
                                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{v.name}</span>
                                <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(v.voted_at)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              <section>
                <p className="micro-label mb-2 flex items-center gap-1.5">
                  <UserX className="h-3.5 w-3.5 text-warning" /> Not voted yet ({data.not_voted.length})
                </p>
                {data.not_voted.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Everyone has voted.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {data.not_voted.map((p) => (
                      <li key={p.employee_id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-0.5 pr-2.5 text-[11px] font-semibold">
                        <PersonAvatar name={p.name} src={p.avatar_url} size="xs" className="h-5 w-5" />
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PollsPage() {
  const { data, isPending, isError, error, refetch } = usePolls();
  const [tab] = useTabParam(TABS);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const openId = params.get("poll");

  // Quick action from the command palette: /polls?new=1
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setCreating(true);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const polls = data ?? [];
  const open = polls.filter((p) => p.status === "open");
  const rows = tab === "all" ? polls : polls.filter((p) => p.status === tab);
  const votes = polls.reduce((n, p) => n + p.total_votes, 0);
  const avgTurnout = open.length
    ? Math.round((open.reduce((n, p) => n + (p.eligible ? Math.min(1, p.total_votes / p.eligible) : 0), 0) / open.length) * 100)
    : null;

  const setOpenId = (id: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("poll", id);
        else next.delete("poll");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div>
      <StaffExtras />
      <PageHeader
        title="Polls"
        eyebrow="Engagement"
        description="Ask the team and see the answers live. One vote per employee."
        icon={Vote}
        actions={
          <Button onClick={() => setCreating(true)} className="h-9 gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" /> New poll
          </Button>
        }
      >
        <TabsNav tabs={TABS.map((t) => ({ ...t, badge: t.value === "open" ? open.length : undefined }))} />
      </PageHeader>

      <StatGrid columns={4} className="mb-4">
        <StatTile label="Open polls" value={isError ? "—" : open.length} tone={isError ? "default" : "primary"} icon={Vote} loading={isPending} />
        <StatTile label="All polls" value={isError ? "—" : polls.length} icon={BarChart3} loading={isPending} />
        <StatTile label="Votes cast" value={isError ? "—" : votes} tone={isError ? "default" : "success"} icon={UserCheck} loading={isPending} />
        <StatTile label="Turnout" hint={avgTurnout === null ? undefined : "Average across open polls"} value={avgTurnout === null ? "—" : `${avgTurnout}%`} icon={Users} loading={isPending} />
      </StatGrid>

      {isPending ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <LoadError what="Polls" error={error} icon={Vote} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Vote}
            title={polls.length ? (tab === "open" ? "No open polls" : "No closed polls") : "No polls yet"}
            description={polls.length ? "Switch tabs to see the others." : "Start one to hear from everyone in a minute: lunch spots, event dates, quick feedback."}
            action={
              !polls.length && (
                <Button onClick={() => setCreating(true)} className="gap-1.5 rounded-xl">
                  <Plus className="h-4 w-4" /> New poll
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className={cn("grid gap-3", rows.length > 1 && "lg:grid-cols-2")}>
          {rows.map((p) => (
            <PollCard key={p.id} poll={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </div>
      )}

      <PollDialog open={creating} onOpenChange={setCreating} />
      <PollDetailSheet pollId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
