import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Megaphone, Pencil, Pin, PinOff, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EmptyState,
  FilterBar,
  ListSkeleton,
  PageHeader,
  RowActions,
  StatGrid,
  StatTile,
  StatusBadge,
  formatDateTime,
  formatRelative,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import { errorMessage, useAnnouncements, useDeleteAnnouncement, useSaveAnnouncement, useSetAnnouncementActive } from "../lib/api";
import type { StaffAnnouncement } from "../lib/types";
import { AnnouncementDialog } from "../components/AnnouncementDialog";
import { RichText, plainText } from "../components/RichText";
import { LoadError } from "../components/LoadError";
import { StaffExtras } from "../components/PageExtras";

type Filter = "all" | "active" | "pinned" | "hidden";

function AnnouncementCard({ a, onEdit }: { a: StaffAnnouncement; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const setActive = useSetAnnouncementActive();
  const save = useSaveAnnouncement();
  const remove = useDeleteAnnouncement();
  const long = a.content.length > 360 || a.content.split("\n").length > 6;

  const togglePin = async () => {
    try {
      await save.mutateAsync({ id: a.id, title: a.title, content: a.content, pinned: !a.pinned, audience: a.audience, department_id: a.department_id });
      toast.success(a.pinned ? "Unpinned." : "Pinned to the top.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleActive = async () => {
    try {
      await setActive.mutateAsync({ id: a.id, active: !a.is_active });
      toast.success(a.is_active ? "Hidden from employees." : "Shown to employees again.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const audienceLabel =
    a.audience === "department" ? (a.department_name ? a.department_name : "Department removed") : "Everyone";

  return (
    <article
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-sm transition-colors sm:p-5",
        a.pinned ? "border-primary/25 bg-primary/[0.03]" : "border-border",
        !a.is_active && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {a.pinned && <StatusBadge status="pinned" label="Pinned" tone="primary" />}
            {!a.is_active && <StatusBadge status="hidden" label="Hidden" tone="neutral" />}
            <span
              className={cn(
                "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
                a.audience === "department" && !a.department_name ? "border-warning/20 bg-warning-soft text-warning" : "border-transparent bg-muted text-muted-foreground",
              )}
            >
              <Users className="h-3 w-3" aria-hidden /> {audienceLabel}
            </span>
          </div>
          <h2 className="font-display text-[15px] font-semibold leading-snug text-foreground">{a.title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {a.author_name ?? "HR"} · <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>{formatRelative(a.created_at)}</time>
            {a.edited_by_name && a.updated_at && a.updated_at !== a.created_at && <> · edited {formatRelative(a.updated_at)}</>}
          </p>
        </div>
        <RowActions
          label={`Actions for ${a.title}`}
          actions={[
            { label: "Edit", icon: Pencil, onSelect: onEdit },
            { label: a.pinned ? "Unpin" : "Pin to top", icon: a.pinned ? PinOff : Pin, onSelect: togglePin },
            { label: a.is_active ? "Hide from employees" : "Show to employees", icon: a.is_active ? EyeOff : Eye, onSelect: toggleActive },
            {
              label: "Delete",
              icon: Trash2,
              destructive: true,
              separated: true,
              confirm: { title: "Delete this announcement?", description: `"${a.title}" is removed for everyone. This cannot be undone.`, confirmLabel: "Delete" },
              onSelect: async () => {
                try {
                  await remove.mutateAsync(a.id);
                  toast.success("Announcement deleted.");
                } catch (e) {
                  toast.error(errorMessage(e));
                  throw e;
                }
              },
            },
          ]}
        />
      </div>
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

export default function AnnouncementsPage() {
  const { data, isPending, isError, error, refetch } = useAnnouncements();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<StaffAnnouncement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  // Quick action from the command palette: /announcements?new=1
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setEditing(null);
    setDialogOpen(true);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const all = data ?? [];
  const stats = useMemo(
    () => ({
      total: all.length,
      active: all.filter((a) => a.is_active).length,
      pinned: all.filter((a) => a.pinned && a.is_active).length,
      hidden: all.filter((a) => !a.is_active).length,
    }),
    [all],
  );

  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((a) => {
      if (filter === "active" && !a.is_active) return false;
      if (filter === "hidden" && a.is_active) return false;
      if (filter === "pinned" && !a.pinned) return false;
      if (!words.length) return true;
      const hay = `${a.title} ${plainText(a.content)} ${a.department_name ?? ""} ${a.author_name ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [all, search, filter]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div>
      <StaffExtras />
      <PageHeader
        title="Announcements"
        eyebrow="Engagement"
        description="Share news with everyone or one department. Pinned posts stay on top."
        icon={Megaphone}
        actions={
          <Button onClick={openNew} className="h-9 gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" /> New announcement
          </Button>
        }
      />

      <StatGrid columns={4} className="mb-4">
        <StatTile label="Total" value={isError ? "—" : stats.total} icon={Megaphone} loading={isPending} />
        <StatTile label="Visible" value={isError ? "—" : stats.active} tone={isError ? "default" : "success"} icon={Eye} loading={isPending} />
        <StatTile label="Pinned" value={isError ? "—" : stats.pinned} tone={isError ? "default" : "primary"} icon={Pin} loading={isPending} />
        <StatTile label="Hidden" value={isError ? "—" : stats.hidden} icon={EyeOff} loading={isPending} />
      </StatGrid>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search announcements…" className="mb-4">
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="h-9 w-[150px] rounded-xl text-xs" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Visible</SelectItem>
            <SelectItem value="pinned">Pinned</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {isPending ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <LoadError what="Announcements" error={error} icon={Megaphone} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Megaphone}
            title={all.length ? "No announcements match" : "No announcements yet"}
            description={all.length ? "Try another search or filter." : "Post the first one: office news, holidays, policy changes. Everyone it is for gets notified."}
            action={
              !all.length && (
                <Button onClick={openNew} className="gap-1.5 rounded-xl">
                  <Plus className="h-4 w-4" /> New announcement
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((a) => (
            <AnnouncementCard
              key={a.id}
              a={a}
              onEdit={() => {
                setEditing(a);
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <AnnouncementDialog open={dialogOpen} onOpenChange={setDialogOpen} announcement={editing} />
    </div>
  );
}
