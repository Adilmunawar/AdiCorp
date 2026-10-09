import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Briefcase,
  CheckCheck,
  ClipboardCheck,
  Clock,
  FileSignature,
  Inbox,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquareWarning,
  Plane,
  Receipt,
  Timer,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { NotificationRow } from "@/types/supabase";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatRelative, toDate } from "@/components/kit/format";
import { cn } from "@/lib/utils";

export type StaffNotification = Pick<NotificationRow, "id" | "kind" | "title" | "body" | "href" | "read_at" | "created_at">;

const LIST_LIMIT = 12;

/** Query keys for staff notifications (other modules may invalidate them). */
export const notificationKeys = {
  all: (userId: string | undefined) => ["platform", "notifications", userId ?? "anon"] as const,
  latest: (userId: string | undefined) => ["platform", "notifications", userId ?? "anon", "latest"] as const,
  unread: (userId: string | undefined) => ["platform", "notifications", userId ?? "anon", "unread"] as const,
};

/** Unread count + latest 12, kept live with a realtime subscription on the user's rows. */
export function useStaffNotifications() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  // Unique per hook instance: supabase-js reuses channels by topic, and adding listeners to a
  // subscribed channel throws, so two mounted consumers must not share one.
  const instance = useRef(Math.random().toString(36).slice(2, 10));

  const unread = useQuery({
    queryKey: notificationKeys.unread(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const latest = useQuery({
    queryKey: notificationKeys.latest(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, href, read_at, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw error;
      return (data ?? []) as StaffNotification[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}:${instance.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) });
          if (payload.eventType === "INSERT") {
            const row = payload.new as StaffNotification;
            toast(row.title, { description: row.body ?? undefined });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return { unread: unread.data ?? 0, items: latest.data ?? [], loading: latest.isPending && !!userId };
}

/** Mark notifications read (one, many, or all when `ids` is omitted). Optimistic. */
export function useMarkNotificationsRead() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId!).is("read_at", null);
      if (ids && ids.length) q = q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all(userId) });
      const prevList = queryClient.getQueryData<StaffNotification[]>(notificationKeys.latest(userId));
      const prevCount = queryClient.getQueryData<number>(notificationKeys.unread(userId));
      const now = new Date().toISOString();
      const hit = (n: StaffNotification) => !n.read_at && (!ids || ids.includes(n.id));
      if (prevList) {
        const changed = prevList.filter(hit).length;
        queryClient.setQueryData(notificationKeys.latest(userId), prevList.map((n) => (hit(n) ? { ...n, read_at: now } : n)));
        if (typeof prevCount === "number") queryClient.setQueryData(notificationKeys.unread(userId), ids ? Math.max(0, prevCount - changed) : 0);
      }
      return { prevList, prevCount };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prevList) queryClient.setQueryData(notificationKeys.latest(userId), ctx.prevList);
      if (typeof ctx?.prevCount === "number") queryClient.setQueryData(notificationKeys.unread(userId), ctx.prevCount);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) }),
  });
}

const KIND_ICONS: Record<string, LucideIcon> = {
  leave: Plane,
  overtime: Timer,
  time: Clock,
  attendance: Clock,
  message: MessageCircle,
  messages: MessageCircle,
  expense: Receipt,
  expenses: Receipt,
  payroll: Wallet,
  payslip: Wallet,
  application: Briefcase,
  careers: Briefcase,
  profile: UserCog,
  complaint: MessageSquareWarning,
  letter: Mail,
  policy: FileSignature,
  policies: FileSignature,
  announcement: Megaphone,
  onboarding: ClipboardCheck,
  people: Users,
};

/** Icon for a notification kind ("time.correction" -> Clock); module prefixes share one icon. */
export function notificationIcon(kind: string | null | undefined): LucideIcon {
  if (!kind) return Bell;
  const head = kind.split(/[._]/)[0].toLowerCase();
  return KIND_ICONS[head] ?? Bell;
}

function dayBucket(value: string): "Today" | "Yesterday" | "Earlier" {
  const d = toDate(value);
  if (!d) return "Earlier";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return "Today";
  start.setDate(start.getDate() - 1);
  return d >= start ? "Yesterday" : "Earlier";
}

interface NotificationListProps {
  items: StaffNotification[];
  loading?: boolean;
  onOpen: (n: StaffNotification) => void;
}

export function NotificationList({ items, loading, onOpen }: NotificationListProps) {
  if (loading) {
    return (
      <div className="space-y-4 p-4" aria-busy="true" aria-label="Loading notifications">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.07] text-primary ring-1 ring-inset ring-primary/10">
          <Inbox className="h-4 w-4" aria-hidden />
        </div>
        <p className="text-[13px] font-semibold text-foreground">You're all caught up</p>
        <p className="mt-0.5 text-xs text-muted-foreground">New approvals and updates will appear here.</p>
      </div>
    );
  }

  const groups: { label: string; items: StaffNotification[] }[] = [];
  for (const n of items) {
    const label = dayBucket(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <p className="sticky top-0 z-[1] border-b border-border/60 bg-popover/95 px-4 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur">
            {group.label}
          </p>
          <ul className="divide-y divide-border/60">
            {group.items.map((n) => {
              const Icon = notificationIcon(n.kind);
              const unread = !n.read_at;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(n)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                      unread && "bg-primary/[0.03]",
                    )}
                  >
                    <span
                      className={cn(
                        "relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-popover bg-primary" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[13px]", unread ? "font-semibold text-foreground" : "font-medium text-foreground/80")} title={n.title}>
                        {n.title}
                        {unread && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{n.body}</span>}
                      <time dateTime={n.created_at} title={formatDateTime(n.created_at)} className="mt-1 block text-[11px] text-muted-foreground">
                        {formatRelative(n.created_at)}
                      </time>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Top-bar bell for staff: unread badge, latest 12, mark-read on click, link to /notifications. */
export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { unread, items, loading } = useStaffNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const hasUnread = useMemo(() => items.some((n) => !n.read_at) || unread > 0, [items, unread]);

  const openItem = (n: StaffNotification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.href) {
      setOpen(false);
      navigate(n.href);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn(
            "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-[color,border-color,box-shadow] hover:border-foreground/20 hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary/30 data-[state=open]:text-primary",
            className,
          )}
        >
          <Bell className="h-[17px] w-[17px]" aria-hidden />
          {unread > 0 && (
            <span className="tabular absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-2xl p-0 shadow-xl">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <p className="font-display text-[15px] font-semibold leading-5 text-foreground">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "Nothing new"}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            disabled={!hasUnread || markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
          <NotificationList items={items} loading={loading} onOpen={openItem} />
        </div>
        <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-border/70 px-4 py-2.5 text-center text-[13px] font-semibold text-primary hover:bg-primary/5">
          View all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}
