import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import { portalKeys } from "@/modules/portal/api";
import { NotificationList, type StaffNotification } from "@/components/shell/notifications";
import { cn } from "@/lib/utils";

export type PortalNotification = StaffNotification;

export const portalNotificationKeys = {
  list: (employeeId: string | undefined) => ["portal", employeeId ?? "anon", "notifications"] as const,
};

function normalise(data: unknown): PortalNotification[] {
  if (Array.isArray(data)) return data as PortalNotification[];
  if (data && typeof data === "object") {
    const d = data as { items?: unknown; notifications?: unknown };
    if (Array.isArray(d.items)) return d.items as PortalNotification[];
    if (Array.isArray(d.notifications)) return d.notifications as PortalNotification[];
  }
  return [];
}

/** Portal notifications (portal_notifications), polled every minute and on focus. */
export function usePortalNotifications() {
  const { employee } = useEmployeeAuth();
  const query = useQuery({
    queryKey: portalNotificationKeys.list(employee?.id),
    enabled: !!employee,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => normalise(await portalRpc("portal_notifications")),
  });
  const items = query.data ?? [];
  return { items, unread: items.filter((n) => !n.read_at).length, loading: query.isPending && !!employee };
}

export function useMarkPortalNotificationsRead() {
  const { employee } = useEmployeeAuth();
  const queryClient = useQueryClient();
  const key = portalNotificationKeys.list(employee?.id);
  return useMutation({
    mutationFn: (ids: string[]) => portalRpc("portal_mark_notifications_read", { p_ids: ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<PortalNotification[]>(key);
      const now = new Date().toISOString();
      if (prev) queryClient.setQueryData(key, prev.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)));
      return { prev };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // Home shows the unread count and the "needs your attention" banners.
      queryClient.invalidateQueries({ queryKey: portalKeys.home(employee?.company_id, employee?.id) });
    },
  });
}

export function PortalNotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items, unread, loading } = usePortalNotifications();
  const markRead = useMarkPortalNotificationsRead();
  const latest = items.slice(0, 12);

  const openItem = (n: PortalNotification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    // Only links inside the portal: a staff route would bounce the employee to the staff sign-in.
    if (n.href && n.href.startsWith("/portal")) {
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
            "relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            className,
          )}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl p-0 shadow-xl">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <p className="font-display text-[15px] font-semibold leading-5 text-foreground">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            disabled={unread === 0 || markRead.isPending}
            onClick={() => markRead.mutate(items.filter((n) => !n.read_at).map((n) => n.id))}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
          <NotificationList items={latest} loading={loading} onOpen={openItem} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
