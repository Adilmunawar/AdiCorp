import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Inbox, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { notificationKeys } from "@/components/shell/notifications";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton, EmptyState, FilterBar, ListSkeleton, PageHeader, SectionCard, StatusBadge, TabsNav, formatDateTime, formatRelative, humanize, useTabParam } from "@/components/kit";
import { cn } from "@/lib/utils";
import { errorMessage } from "../lib/api";
import { LoadError } from "../components/LoadError";
import { PushDevicesCard } from "../components/PushDevicesCard";

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

const LOAD_LIMIT = 500;
const PAGE_SIZE = 25;

/** Group label for a notification kind ("leave.approved" -> "Leave"). */
function kindGroup(kind: string): string {
  // "module.action" kinds group by module (which may itself contain "_"); older "module_action" kinds by their first word.
  return (kind.includes(".") ? kind.split(".")[0] : kind.split("_")[0]) || "general";
}

function useNotificationCenter() {
  const { user, companyId } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const key = ["engagement", companyId ?? "none", "notifications", userId ?? "anon"] as const;
  const instance = useRef(Math.random().toString(36).slice(2, 10));

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db
        .from("notifications")
        .select("id, kind, title, body, href, read_at, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(LOAD_LIMIT);
      if (error) throw error;
      return (data ?? []) as NotificationItem[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = db
      .channel(`engagement:notifications:${userId}:${instance.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        void qc.invalidateQueries({ queryKey: key });
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companyId, qc]);

  const syncShell = () => qc.invalidateQueries({ queryKey: notificationKeys.all(userId) });

  const markRead = useMutation({
    mutationFn: async (ids: string[] | null) => {
      let q = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId!).is("read_at", null);
      if (ids) q = q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationItem[]>(key);
      const now = new Date().toISOString();
      if (prev) qc.setQueryData<NotificationItem[]>(key, prev.map((n) => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void syncShell();
    },
  });

  const remove = useMutation({
    mutationFn: async (ids: string[] | "read") => {
      let q = db.from("notifications").delete().eq("user_id", userId!);
      q = ids === "read" ? q.not("read_at", "is", null) : q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationItem[]>(key);
      if (prev) qc.setQueryData<NotificationItem[]>(key, prev.filter((n) => (ids === "read" ? !n.read_at : !ids.includes(n.id))));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void syncShell();
    },
  });

  return { ...query, markRead, remove };
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch, markRead, remove } = useNotificationCenter();
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  const tabs = [
    { value: "all", label: "All", badge: undefined as number | undefined },
    { value: "unread", label: "Unread", badge: unread || undefined },
  ];
  const [tab] = useTabParam(tabs);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);

  const kinds = useMemo(() => Array.from(new Set(items.map((n) => kindGroup(n.kind)))).sort(), [items]);
  // A type whose last notification was cleared falls back to "All types" instead of an empty list.
  const activeKind = kind === "all" || kinds.includes(kind) ? kind : "all";
  const filtered = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((n) => {
      if (tab === "unread" && n.read_at) return false;
      if (activeKind !== "all" && kindGroup(n.kind) !== activeKind) return false;
      if (!words.length) return true;
      const hay = `${n.title} ${n.body ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, tab, activeKind, search]);

  useEffect(() => setPage(0), [tab, activeKind, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Dismissing the last rows of the last page (or marking read on the Unread tab) shrinks the list:
  // stay on the last page that still has rows instead of showing an empty one.
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const open = (n: NotificationItem) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.href && n.href.startsWith("/") && !n.href.startsWith("//")) navigate(n.href);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Everything AdiCorp has told you: approvals, messages, announcements and updates."
        icon={Bell}
        actions={
          <>
            <Button
              variant="outline"
              className="h-9 gap-1.5 rounded-xl"
              disabled={!unread || markRead.isPending}
              onClick={() =>
                markRead.mutate(null, {
                  onSuccess: () => toast.success("All caught up."),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
            <ConfirmButton
              className="h-9 gap-1.5 rounded-xl"
              disabled={items.length === unread}
              title="Clear read notifications?"
              description="Notifications you have already read are removed from this list. Unread ones stay."
              confirmLabel="Clear"
              onConfirm={() =>
                remove.mutateAsync("read").then(
                  () => toast.success("Read notifications cleared."),
                  (e) => {
                    toast.error(errorMessage(e));
                    throw e;
                  },
                )
              }
            >
              <Trash2 className="h-4 w-4" /> Clear read
            </ConfirmButton>
          </>
        }
      >
        <TabsNav tabs={tabs} />
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-3">
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search notifications…">
            <Select value={activeKind} onValueChange={setKind}>
              <SelectTrigger className="h-9 w-[160px] rounded-xl text-xs" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {humanize(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar>

          <SectionCard flush>
            {isPending ? (
              <div className="p-4">
                <ListSkeleton rows={6} />
              </div>
            ) : isError ? (
              <LoadError what="Notifications" error={error} icon={Inbox} onRetry={() => refetch()} inline />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={items.length ? "Nothing matches" : "You're all caught up"}
                description={items.length ? "Try another tab, type or search." : "New approvals and updates will appear here."}
                compact
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {visible.map((n) => (
                  <li key={n.id} className={cn("group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40", !n.read_at && "bg-primary/[0.03]")}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={cn("text-[13px] leading-5", n.read_at ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>{n.title}</span>
                        <StatusBadge status={kindGroup(n.kind)} label={humanize(kindGroup(n.kind))} tone="neutral" dot={false} className="px-1.5 py-0 text-[10px]" />
                      </span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-muted-foreground" title={formatDateTime(n.created_at)}>
                        {formatRelative(n.created_at)}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      {!n.read_at && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" aria-label="Mark read" title="Mark read" onClick={() => markRead.mutate([n.id])}>
                          <CheckCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                        aria-label="Dismiss"
                        title="Dismiss"
                        onClick={() => remove.mutate([n.id], { onError: (e) => toast.error(errorMessage(e)) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground">
                <span>
                  {current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of {filtered.length}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
        <PushDevicesCard audience="staff" className="h-fit" />
      </div>
    </div>
  );
}
