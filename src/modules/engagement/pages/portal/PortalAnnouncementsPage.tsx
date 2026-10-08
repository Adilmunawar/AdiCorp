import { useState } from "react";
import { Megaphone, Users } from "lucide-react";
import { EmptyState, ListSkeleton, PageHeader, StatusBadge, formatDateTime, formatRelative } from "@/components/kit";
import { cn } from "@/lib/utils";
import { usePortalAnnouncements } from "../../lib/portalApi";
import type { PortalAnnouncement } from "../../lib/types";
import { RichText } from "../../components/RichText";
import { LoadError } from "../../components/LoadError";
import { PortalExtras } from "../../components/PageExtras";

function Card({ a }: { a: PortalAnnouncement }) {
  const long = a.content.length > 420 || a.content.split("\n").length > 7;
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
        a.pinned ? "border-primary/25 bg-primary/[0.03]" : "border-border",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {a.pinned && <StatusBadge status="pinned" label="Pinned" tone="primary" />}
        {a.department_name && (
          <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border border-transparent bg-muted px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
            <Users className="h-3 w-3" aria-hidden /> {a.department_name}
          </span>
        )}
      </div>
      <h2 className="font-display text-[15px] font-semibold leading-snug">{a.title}</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {a.author_name ?? "HR"} · <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>{formatRelative(a.created_at)}</time>
      </p>
      <div className="mt-3">
        <RichText source={a.content} clamp={long && !expanded} />
        {long && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1.5 text-[11px] font-bold text-primary hover:underline">
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    </article>
  );
}

export default function PortalAnnouncementsPage() {
  const { data, isPending, isError, error, refetch } = usePortalAnnouncements();
  const items = data ?? [];
  return (
    <div>
      <PortalExtras />
      <PageHeader eyebrow="My portal" title="Announcements" description="News and updates from HR." icon={Megaphone} />
      {isPending ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <LoadError what="Announcements" error={error} icon={Megaphone} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState icon={Megaphone} title="No announcements yet" description="When HR posts news, it shows up here and you get a notification." />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
