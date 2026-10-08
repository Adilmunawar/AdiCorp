import { Component, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ModuleNavItem } from "@/modules/types";

type Counts = Readonly<Record<string, number>>;

const NavBadgesContext = createContext<Counts>({});

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

/**
 * Runs every nav item's `useBadge` hook once, for the life of the shell, and shares the counts.
 * The desktop sidebar and the phone drawer read from here, so opening the drawer never opens a
 * second subscription, and a failing badge only hides its own count. `enabled` lets phones wait
 * until the menu is first opened before asking for any counts.
 */
export function NavBadgesProvider({ items, enabled = true, children }: { items: ModuleNavItem[]; enabled?: boolean; children: ReactNode }) {
  const [counts, setCounts] = useState<Counts>({});
  const report = useCallback((key: string, count: number) => {
    setCounts((prev) => ((prev[key] ?? 0) === count ? prev : { ...prev, [key]: count }));
  }, []);
  const withBadges = useMemo(() => items.filter((item) => item.useBadge), [items]);

  return (
    <NavBadgesContext.Provider value={counts}>
      {enabled &&
        withBadges.map((item) => (
          <BadgeBoundary key={item.key}>
            <BadgeCollector item={item} report={report} />
          </BadgeBoundary>
        ))}
      {children}
    </NavBadgesContext.Provider>
  );
}

/** Every nav badge count by item key (0 or missing means no badge). */
export function useNavBadges(): Counts {
  return useContext(NavBadgesContext);
}
