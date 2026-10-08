import { Link } from "react-router-dom";
import { ChevronRight, CloudOff, Mail, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { usePortalLetters } from "../lib/api";
import { errorMessage } from "../lib/company";
import { letterLabel, replyByHint } from "../lib/letters";
import type { PortalLetterListRow } from "../lib/types";

function statusOf(l: PortalLetterListRow): { label: string; tone: "warning" | "info" | "success" | "neutral" | "danger" } {
  if (l.withdrawn_at) return { label: "Withdrawn", tone: "neutral" };
  if (l.replied_at) return { label: "Replied", tone: "success" };
  if (!l.acknowledged_at) return { label: "New", tone: "warning" };
  if (l.reply_by && !l.replied_at) {
    const hint = replyByHint(l.reply_by);
    return { label: hint ?? "Reply requested", tone: hint?.includes("overdue") ? "danger" : "info" };
  }
  return { label: "Received", tone: "info" };
}

export default function PortalLettersPage() {
  const { data, isLoading, isError, error, refetch, isRefetching } = usePortalLetters();
  const list = data ?? [];
  const unread = list.filter((l) => !l.acknowledged_at && !l.withdrawn_at).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        icon={Mail}
        eyebrow="My portal"
        title="Letters from HR"
        description={unread ? `${unread} new ${unread === 1 ? "letter" : "letters"} to read and acknowledge.` : "Open a letter to read, acknowledge or reply."}
      />
      {isLoading ? (
        <SectionCard>
          <ListSkeleton rows={4} />
        </SectionCard>
      ) : list.length ? (
        <SectionCard flush>
          <ul className="divide-y divide-border/60">
            {list.map((l) => {
              const s = statusOf(l);
              const isNew = !l.acknowledged_at && !l.withdrawn_at;
              return (
                <li key={l.id}>
                  <Link to={`/portal/letters/${l.id}`} className={cn("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5", isNew && "bg-primary/[0.03]")}>
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                        isNew ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {isNew ? <Mail className="h-4 w-4" aria-hidden /> : <MailOpen className="h-4 w-4" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm text-foreground", isNew ? "font-semibold" : "font-medium")} title={l.subject}>{l.subject}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <span className="sm:hidden">{s.label} · </span>
                        {letterLabel(l.kind)} · <span className="font-mono">{l.ref}</span> · {formatDate(l.issued_at)}
                      </p>
                    </div>
                    <StatusBadge status={s.label} label={s.label} tone={s.tone} className="hidden sm:inline-flex" />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : isError ? (
        <SectionCard>
          <EmptyState
            icon={CloudOff}
            title="Your letters could not be loaded"
            description={errorMessage(error, "Check your connection and try again.")}
            action={
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refetch()} disabled={isRefetching}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <EmptyState icon={MailOpen} title="No letters" description="Letters from HR, such as appointment, appreciation or explanation letters, appear here." />
        </SectionCard>
      )}
    </div>
  );
}
