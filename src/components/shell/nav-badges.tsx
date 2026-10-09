import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { ModuleNavItem } from "@/modules/types";

type Counts = Readonly<Record<string, number>>;

const NavBadgesContext = createContext<Counts>({});

/** Lets a page ask the shell for the counts where it would otherwise wait (phones load them when the drawer opens). */
const NavBadgesRequestContext = createContext<() => void>(() => undefined);

/**
 * Nav item keys whose count comes from the one `nav_badge_counts` RPC. Their `useBadge` hooks are
 * never mounted by the shell, so the sidebar costs one request on mount and one every two minutes
 * instead of a request per badge. A hook whose key is not here still runs on its own.
 */
const SERVER_BADGE_KEYS: ReadonlySet<string> = new Set([
  "careers.applicants",
  "engagement.messages",
  "engagement.complaints",
  "expenses.requests",
  "expenses.finance",
  "leave.requests",
  "leave.overtime",
  "payroll.updates",
  "payroll.overtime",
  "people.updates",
  "people.documents",
  "people.onboarding",
  "policies.policies",
  "policies.letters",
  "time.corrections",
]);

/** Realtime tables that should refresh the counts promptly (an employee message, a punch correction). */
const LIVE_TABLES = ["messages", "punch_corrections"] as const;

/** A badge hook that throws (for example a realtime channel clash) must never take the app frame down. */
class BadgeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn("[nav] a sidebar badge failed and is hidden", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function BadgeCollector({ item, report }: { item: ModuleNavItem; report: (key: string, count: number) => void }) {
  const count = item.useBadge?.() ?? 0;
  useEffect(() => {
    report(item.key, count);
  }, [item.key, count, report]);
  useEffect(() => () => report(item.key, 0), [item.key, report]);
  return null;
}

/** One request for every server-counted badge; null means "not for this role" and shows nothing. */
function useServerBadges(enabled: boolean): Counts {
  const { companyId, role } = useAuth();
  const qc = useQueryClient();
  const instance = useRef(Math.random().toString(36).slice(2, 10)).current;
  const queryKey = useMemo(() => ["nav-badges", companyId, role] as const, [companyId, role]);
  const { data } = useQuery({
    queryKey,
    enabled: enabled && !!companyId && !!role,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("nav_badge_counts");
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries((data ?? {}) as Record<string, unknown>)) {
        if (typeof value === "number") out[key] = value;
      }
      return out as Counts;
    },
  });

  // An employee message or a punch correction shows up within a few seconds rather than at the
  // next poll. The refetch is debounced (trailing, 3 s) so a burst of rows costs one request, and
  // the page-level queries the old per-badge hooks used to refresh are invalidated too.
  useEffect(() => {
    if (!enabled || !companyId || !role) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["engagement", companyId, "messages", "unread"] });
      void qc.invalidateQueries({ queryKey: ["time", companyId, "corrections"] });
      void qc.invalidateQueries({ queryKey: ["time", companyId, "correction-counts"] });
    };
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 3_000);
    };
    let channel = db.channel(`nav-badges:${companyId}:${instance}`);
    for (const table of LIVE_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `company_id=eq.${companyId}` }, bump);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [enabled, companyId, role, qc, queryKey, instance]);

  return data ?? {};
}

/**
 * Collects every nav badge count once, for the life of the shell, and shares them. Counts the
 * server can produce come from a single `nav_badge_counts` call; any other item's `useBadge` hook
 * runs here exactly once. The desktop sidebar and the phone drawer read from here, so opening the
 * drawer never opens a second subscription, and a failing badge only hides its own count.
 * `enabled` lets phones wait until the menu is first opened before asking for any counts.
 */
export function NavBadgesProvider({
  items,
  enabled = true,
  onRequest,
  children,
}: {
  items: ModuleNavItem[];
  enabled?: boolean;
  /** Called when a page needs the counts now (the dashboard's "Needs attention" card on a phone). */
  onRequest?: () => void;
  children: ReactNode;
}) {
  const [hookCounts, setHookCounts] = useState<Counts>({});
  const report = useCallback((key: string, count: number) => {
    setHookCounts((prev) => ((prev[key] ?? 0) === count ? prev : { ...prev, [key]: count }));
  }, []);
  const withHooks = useMemo(() => items.filter((item) => item.useBadge && !SERVER_BADGE_KEYS.has(item.key)), [items]);
  const serverCounts = useServerBadges(enabled);
  const counts = useMemo<Counts>(() => ({ ...hookCounts, ...serverCounts }), [hookCounts, serverCounts]);

  const request = useMemo(() => onRequest ?? (() => undefined), [onRequest]);

  return (
    <NavBadgesRequestContext.Provider value={request}>
      <NavBadgesContext.Provider value={counts}>
        {enabled &&
          withHooks.map((item) => (
            <BadgeBoundary key={item.key}>
              <BadgeCollector item={item} report={report} />
            </BadgeBoundary>
          ))}
        {children}
      </NavBadgesContext.Provider>
    </NavBadgesRequestContext.Provider>
  );
}

/**
 * Make sure the badge counts are being loaded while the calling component is mounted. On phones the
 * shell waits for the drawer to open before asking for them, which would leave a card built on the
 * counts (the dashboard's "Needs attention") empty until the menu was opened once.
 */
export function useRequestNavBadges(): void {
  const request = useContext(NavBadgesRequestContext);
  useEffect(() => {
    request();
  }, [request]);
}

/** Every nav badge count by item key (0 or missing means no badge). */
export function useNavBadges(): Counts {
  return useContext(NavBadgesContext);
}
