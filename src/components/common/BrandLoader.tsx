import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { cn } from "@/lib/utils";
import "@/styles/loader.css";

interface BrandLoaderProps {
  message?: string;
  subtitle?: string;
  fullScreen?: boolean;
  /** Optional control under the loader (e.g. a "Reload now" link). */
  action?: ReactNode;
  className?: string;
}

/* One loop period that every animation divides (1.6s spin/bar, 3.2s halo, 6.4s orbit). */
const LOOP_MS = 6400;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const bootAt = now();
let lastUnmountAt = Number.NEGATIVE_INFINITY;
let mountedBefore = false;

/**
 * Phase-locks the loops to the page clock and skips the entrance fade when this
 * loader replaces another one (or the static splash in index.html), so the
 * hand-off between consecutive loading states is seamless.
 */
function useLoaderTiming() {
  const [timing] = useState(() => {
    const t = now();
    const seamless = t - lastUnmountAt < 600 || (!mountedBefore && t - bootAt < 400);
    mountedBefore = true;
    return { delay: -Math.round(t % LOOP_MS), seamless };
  });
  useEffect(
    () => () => {
      lastUnmountAt = now();
    },
    [],
  );
  return timing;
}

export default function BrandLoader({
  message = "Loading your workspace...",
  subtitle = "Please wait a moment",
  fullScreen = false,
  action,
  className,
}: BrandLoaderProps) {
  const { delay, seamless } = useLoaderTiming();
  const style = { "--adl-delay": `${delay}ms` } as CSSProperties;

  return (
    <div
      className={cn(
        "relative isolate flex w-full items-center justify-center overflow-hidden px-4",
        fullScreen ? "min-h-[100dvh] bg-background bg-gradient-surface" : "min-h-[36vh] py-10",
        className,
      )}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {fullScreen && <div aria-hidden className="adl-grid pointer-events-none absolute inset-0 -z-10" />}

      <div className={cn("flex w-full max-w-xs flex-col items-center text-center", !seamless && "adl-enter")}>
        <div
          aria-hidden
          data-size={fullScreen ? "lg" : "sm"}
          className={cn("adl-mark relative shrink-0", fullScreen ? "h-32 w-32" : "h-[76px] w-[76px]")}
        >
          <span className="adl-halo absolute -inset-[30%] rounded-full" />
          {fullScreen && <span className="adl-orbit absolute -inset-[10px] rounded-full" />}
          <span className="adl-track absolute inset-0 rounded-full" />
          <span className="adl-arc absolute inset-0 rounded-full" />
          <span className="adl-cap absolute inset-0 rounded-full" />
          <span className="adl-tile absolute inset-[17%] flex items-center justify-center rounded-full">
            <img
              src={ADICORP_LOGO_PATH}
              alt=""
              width={96}
              height={96}
              decoding="async"
              draggable={false}
              className="h-[56%] w-[56%] select-none object-contain"
            />
          </span>
        </div>

        {fullScreen && (
          <p className="mt-7 font-display text-lg font-semibold leading-7 tracking-[0.02em] text-foreground">
            AdiCorp <span className="text-primary">HR</span>
          </p>
        )}

        <p
          className={cn(
            "h-5 w-full truncate text-[13px] font-medium leading-5 text-foreground/80",
            fullScreen ? "mt-1.5" : "mt-5",
          )}
        >
          {message}
        </p>

        <div className="adl-bar relative mt-5 h-[3px] w-40 overflow-hidden rounded-full">
          <span className="adl-bar-fill absolute inset-y-0 left-0 w-2/5 rounded-full" />
        </div>

        {subtitle && <p className="mt-3 h-4 w-full truncate text-[11px] leading-4 tracking-wide text-muted-foreground">{subtitle}</p>}

        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
