import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

/**
 * Read and write the active tab from the URL (`?tab=`), so tabs are linkable and
 * survive reloads. Unknown values fall back to the first tab (or `fallback`).
 */
export function useTabParam(tabs: Pick<TabItem, "value">[], fallback?: string, param = "tab") {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const value = tabs.some((t) => t.value === raw) ? (raw as string) : fallback ?? tabs[0]?.value ?? "";
  const setValue = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set(param, next);
          return p;
        },
        { replace: true },
      );
    },
    [param, setParams],
  );
  return [value, setValue] as const;
}

export interface TabsNavProps {
  tabs: TabItem[];
  /** Controlled value; defaults to the URL param. */
  value?: string;
  onChange?: (value: string) => void;
  param?: string;
  className?: string;
}

/** Fades whichever edge has more tabs hidden behind it, so a sideways-scrolling bar never looks cut off. */
function useEdgeFade(active: string, layoutKey: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  // Keep the selected tab in view: centred when it changes, nudged just enough when tab widths change
  // (for example when a count badge arrives after the data loads).
  const reveal = useCallback(
    (center: boolean) => {
      const el = ref.current;
      const current = el?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!el || !current) return;
      if (el.scrollWidth > el.clientWidth) {
        const box = el.getBoundingClientRect();
        const tab = current.getBoundingClientRect();
        if (center && (tab.left < box.left || tab.right > box.right)) el.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2;
        else if (tab.left < box.left) el.scrollLeft -= box.left - tab.left;
        else if (tab.right > box.right) el.scrollLeft += tab.right - box.right;
      }
      update();
    },
    [update],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => reveal(false));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [reveal]);
  useEffect(() => reveal(true), [active, reveal]);
  useEffect(() => reveal(false), [layoutKey, reveal]);
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? "transparent 0, #000 24px" : "#000 0"}, ${edges.end ? "#000 calc(100% - 24px), transparent 100%" : "#000 100%"})`
      : undefined;
  const style: CSSProperties | undefined = mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined;
  return { ref, onScroll: update, style };
}

/** Pill tab bar driven by `?tab=`. Scrolls sideways inside itself on phones, with faded edges. */
export function TabsNav({ tabs, value, onChange, param = "tab", className }: TabsNavProps) {
  const [urlValue, setUrlValue] = useTabParam(tabs, undefined, param);
  const active = value ?? urlValue;
  const fade = useEdgeFade(active, tabs.map((t) => `${t.value}:${t.label}:${t.badge ?? 0}`).join("|"));
  const select = (next: string) => {
    if (onChange) onChange(next);
    else setUrlValue(next);
  };

  return (
    <div className={cn("min-w-0 rounded-xl border border-border/70 bg-muted/50 p-1", className)}>
      <div ref={fade.ref} onScroll={fade.onScroll} style={fade.style} className="hide-scrollbar min-w-0 overflow-x-auto rounded-lg">
        <div role="tablist" className="flex w-max min-w-full gap-1">
          {tabs.map((tab) => {
            const on = tab.value === active;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => select(tab.value)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-8",
                  on ? "bg-card text-foreground shadow-sm ring-1 ring-border/60" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                {Icon && <Icon className={cn("h-3.5 w-3.5", on && "text-primary")} aria-hidden />}
                {tab.label}
                {!!tab.badge && (
                  <span
                    className={cn(
                      "tabular min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] font-semibold leading-[14px]",
                      on ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                    )}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
