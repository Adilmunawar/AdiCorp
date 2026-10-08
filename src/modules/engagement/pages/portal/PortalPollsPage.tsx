import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Vote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, StatusBadge, formatRelative } from "@/components/kit";
import { cn } from "@/lib/utils";
import { errorMessage } from "../../lib/api";
import { usePortalPolls, usePortalVote } from "../../lib/portalApi";
import type { PortalPoll } from "../../lib/types";
import { PollResults } from "../../components/PollResults";
import { LoadError } from "../../components/LoadError";
import { PortalExtras } from "../../components/PageExtras";

function PollCard({ poll }: { poll: PortalPoll }) {
  const vote = usePortalVote();
  const [choice, setChoice] = useState<string | null>(null);
  const open = poll.status === "open";
  const voted = !!poll.my_option_id;
  const showResults = poll.show_results || voted;

  const submit = async () => {
    if (!choice) return;
    try {
      await vote.mutateAsync({ pollId: poll.id, optionId: choice });
      toast.success("Thanks, your vote is in.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <article className={cn("rounded-2xl border bg-card p-4 shadow-sm sm:p-5", open && !voted ? "border-primary/25" : "border-border")}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {open ? (
          voted ? (
            <StatusBadge status="voted" label="You voted" tone="success" />
          ) : (
            <StatusBadge status="open" label="Waiting for your vote" tone="primary" />
          )
        ) : (
          <StatusBadge status="closed" />
        )}
        {open && poll.expires_at && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden /> Closes {formatRelative(poll.expires_at)}
          </span>
        )}
      </div>
      <h2 className="font-display text-[15px] font-semibold leading-snug">{poll.question}</h2>
      {poll.description && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{poll.description}</p>}

      {showResults ? (
        <>
          <PollResults options={poll.options} chosenId={poll.my_option_id} className="mt-4" />
          <p className="mt-3 text-[11px] text-muted-foreground">
            {voted ? (
              <span className="inline-flex items-center gap-1 font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Your vote is counted. Only HR can see who voted for what.
              </span>
            ) : (
              "This poll closed before you voted."
            )}
          </p>
        </>
      ) : (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="space-y-2" disabled={vote.isPending}>
            <legend className="sr-only">{poll.question}</legend>
            {poll.options.map((o) => {
              const on = choice === o.id;
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-[13px] font-semibold transition-colors",
                    on ? "border-primary bg-primary/[0.06] text-foreground" : "border-border hover:border-primary/30 hover:bg-muted/40",
                  )}
                >
                  <input type="radio" name={`poll-${poll.id}`} value={o.id} checked={on} onChange={() => setChoice(o.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  {o.text}
                </label>
              );
            })}
          </fieldset>
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">One vote per person. You see the results after voting.</p>
            <Button type="submit" className="h-9 shrink-0 rounded-xl" disabled={!choice || vote.isPending}>
              {vote.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Vote
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

export default function PortalPollsPage() {
  const { data, isPending, isError, error, refetch } = usePortalPolls();
  const polls = data ?? [];
  const waiting = polls.filter((p) => p.status === "open" && !p.my_option_id).length;
  return (
    <div>
      <PortalExtras />
      <PageHeader
        eyebrow="My portal"
        title="Polls"
        description={waiting ? `${waiting} ${waiting === 1 ? "poll is" : "polls are"} waiting for your vote.` : "Have your say on team decisions."}
        icon={Vote}
      />
      {isPending ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <LoadError what="Polls" error={error} icon={Vote} onRetry={() => refetch()} />
      ) : polls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState icon={Vote} title="No polls yet" description="When HR asks the team something, you can vote here." />
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((p) => (
            <PollCard key={p.id} poll={p} />
          ))}
        </div>
      )}
    </div>
  );
}
