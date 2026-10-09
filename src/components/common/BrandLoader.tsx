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

/* One loop period that every animation divides (1.2s bar, 2.4s float). */
const LOOP_MS = 2400;
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

/** AdiCorp loading state: the logo, the wordmark and a slim progress bar; words appear only if it takes a moment. */
export default function BrandLoader({
  message = "Loading your workspace",
  subtitle,
  fullScreen = false,
  action,
  className,
}: BrandLoaderProps) {
  const { delay, seamless } = useLoaderTiming();
  const style = { "--adl-delay": `${delay}ms` } as CSSProperties;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-center px-4",
        fullScreen ? "min-h-[100dvh] bg-background bg-gradient-surface" : "min-h-[36vh] py-10",
        className,
      )}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn("flex w-full max-w-[18rem] flex-col items-center text-center", !seamless && "adl-enter")}>
        <img
          src={ADICORP_LOGO_PATH}
          alt=""
          width={64}
          height={64}
          decoding="async"
          draggable={false}
          className={cn(
            "adl-logo select-none object-contain",
            fullScreen ? "h-[clamp(2.75rem,8vh,4rem)] w-[clamp(2.75rem,8vh,4rem)]" : "h-11 w-11",
          )}
        />

        {fullScreen && (
          <p className="mt-[clamp(0.75rem,2.2vh,1.25rem)] font-display text-[17px] font-semibold leading-6 tracking-tight text-foreground">
            AdiCorp <span className="text-primary">HR</span>
          </p>
        )}

        <div className={cn("adl-bar relative h-[3px] w-28 overflow-hidden rounded-full", fullScreen ? "mt-4" : "mt-5")}>
          <span className="adl-bar-fill absolute inset-y-0 left-0 w-2/5 rounded-full" />
        </div>

        <p className={cn("mt-3 h-5 w-full truncate text-[12.5px] font-medium leading-5 text-muted-foreground", !seamless && "adl-late")}>
          {message}
        </p>
        {subtitle && <p className={cn("h-4 w-full truncate text-[11px] leading-4 text-muted-foreground/80", !seamless && "adl-late")}>{subtitle}</p>}

        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
