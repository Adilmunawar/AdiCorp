import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCheck,
  Clock,
  FileSignature,
  Megaphone,
  MessageSquare,
  Package,
  PartyPopper,
  Receipt,
  UserRoundPen,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, EmptyState, ListSkeleton, PageHeader, SectionCard, TabsNav, formatDate, formatRelative, useTabParam } from "@/components/kit";
import {
  portalNotificationKeys,
  useMarkPortalNotificationsRead,
  usePortalNotifications,
  type PortalNotification,
} from "@/components/portal-shell/PortalNotificationBell";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import { cn } from "@/lib/utils";
import { safePortalLink } from "../links";

const KIND_ICONS: [prefix: string, icon: LucideIcon][] = [
  ["leave", CalendarDays],
  ["attendance", Clock],
  ["correction", Clock],
  ["overtime", Clock],
  ["payroll", Wallet],
  ["payslip", Wallet],
  ["expense", Receipt],
  ["course", Receipt],
  ["policy", FileSignature],
  ["notice", FileSignature],
  ["letter", FileSignature],
  ["document", FileSignature],
  ["announcement", Megaphone],
  ["poll", Megaphone],
  ["message", MessageSquare],
  ["complaint", MessageSquare],
  ["asset", Package],
  ["celebration", PartyPopper],
  ["profile", UserRoundPen],
  ["update", UserRoundPen],
];

/** Icon for a kind; module-prefixed kinds match on any part ("people.asset", "time.correction"). */
function kindIcon(kind: string | null | undefined): LucideIcon {
  const parts = (kind ?? "").toLowerCase().split(/[._]/).filter(Boolean);
  return KIND_ICONS.find(([prefix]) => parts.some((p) => p.startsWith(prefix)))?.[1] ?? Bell;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return formatDate(d, "EEEE, d MMMM");
}

const PAGE = 20;
const TABS = [{ value: "all" }, { value: "unread" }];

/** All portal notifications: All / Unread, mark read, clear read ones. */
export default function PortalNotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { employee } = useEmployeeAuth();
  const { items, unread, loading } = usePortalNotifications();
  const markRead = useMarkPortalNotificationsRead();
  const [tab] = useTabParam(TABS, "all");
  const [limit, setLimit] = useState(PAGE);

  const clearRead = useMutation({
    mutationFn: () => portalRpc<number>("portal_clear_notifications", { p_ids: null }),
    onSuccess: (count) => {
      toast.success(count ? `Cleared ${count} notification${count === 1 ? "" : "s"}` : "Nothing to clear");
      queryClient.invalidateQueries({ queryKey: portalNotificationKeys.list(employee?.id) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not clear notifications"),
  });

  const visible = useMemo(() => (tab === "unread" ? items.filter((n) => !n.read_at) : items), [items, tab]);
  const groups = useMemo(() => {
    const out: { label: string; items: PortalNotification[] }[] = [];
    for (const n of visible.slice(0, limit)) {
      const label = dayLabel(n.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [visible, limit]);
  const readCount = items.length - unread;

  const open = (n: PortalNotification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    const link = safePortalLink(n.href);
    if (link) navigate(link);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="My portal"
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up"}
        icon={Bell}
        actions={
          <>
            <Button
              variant="outline"
              className="h-9 gap-1.5 rounded-xl text-xs"
              disabled={unread === 0 || markRead.isPending}
              onClick={() => markRead.mutate(items.filter((n) => !n.read_at).map((n) => n.id))}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
            {readCount > 0 && (
              <ConfirmButton
                className="h-9 rounded-xl text-xs"
                disabled={clearRead.isPending}
                title="Clear read notifications?"
                description={`This removes ${readCount} read notification${readCount === 1 ? "" : "s"} from your list. Unread ones stay.`}
                confirmLabel="Clear"
                onConfirm={() => clearRead.mutateAsync().catch(() => undefined)}
              >
                Clear read
              </ConfirmButton>
            )}
          </>
        }
      >
        <TabsNav
          className="w-full sm:w-max"
          tabs={[
            { value: "all", label: "All", badge: items.length || undefined },
            { value: "unread", label: "Unread", badge: unread || undefined },
          ]}
        />
      </PageHeader>

      <SectionCard flush>
        {loading ? (
          <ListSkeleton rows={6} className="p-4" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={tab === "unread" ? CheckCheck : BellOff}
            title={tab === "unread" ? "No unread notifications" : "No notifications yet"}
            description="Leave decisions, payslips, letters and company news will appear here."
          />
        ) : (
          <div>
            {groups.map((g) => (
              <div key={g.label}>
                <p className="micro-label sticky top-0 z-[1] border-b border-border/60 bg-muted/60 px-4 py-1.5 backdrop-blur sm:px-5">{g.label}</p>
                <ul className="divide-y divide-border/60">
                  {g.items.map((n) => {
                    const Icon = kindIcon(n.kind);
                    const unreadRow = !n.read_at;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => open(n)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 sm:px-5",
                            unreadRow && "bg-primary/[0.03]",
                          )}
                        >
                          <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", unreadRow ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-[13px] leading-snug", unreadRow ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>{n.title}</span>
                            {n.body && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>}
                            <span className="mt-1 block text-[11px] text-muted-foreground">{formatRelative(n.created_at)}</span>
                          </span>
                          {unreadRow && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {visible.length > limit && (
              <div className="border-t border-border/60 p-3 text-center">
                <Button variant="ghost" className="h-9 rounded-xl text-xs" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({visible.length - limit} older)
                </Button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
