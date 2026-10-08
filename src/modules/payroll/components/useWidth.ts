import { useCallback, useLayoutEffect, useState } from "react";

/**
 * The width of an element, kept current. Measured before paint so the first frame already has the right layout.
 * Pages use it to fold table columns by the room they really have (the sidebar takes a share of the viewport).
 * Returns a callback ref, so it follows the element even when a page swaps what it renders.
 */
export function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? Math.min(window.innerWidth, 1200) : 1024));
  const ref = useCallback((node: T | null) => setEl(node), []);
  useLayoutEffect(() => {
    if (!el) return;
    // A page rendered while hidden has no boxes yet (width 0); keep the estimate until it does.
    const first = el.getBoundingClientRect().width;
    if (first) setWidth(first);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, width] as const;
}

/** "125000" -> "125,000" for money inputs; anything that is not a number is left as typed. */
export function groupDigits(raw: string): string {
  const text = raw.trim().replace(/[,\s]/g, "");
  if (!text || !/^[-+]?\d+(\.\d+)?$/.test(text)) return raw;
  return Number(text).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
