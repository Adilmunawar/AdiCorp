import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function query(maxWidth: number) {
  return `(max-width: ${maxWidth - 1}px)`;
}

/** True below `breakpoint` px. Reads matchMedia synchronously so the first render already has the right layout. */
export function useMediaBelow(breakpoint: number) {
  const [below, setBelow] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query(breakpoint)).matches : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query(breakpoint));
    const onChange = () => setBelow(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return below;
}

/** True on phones (below 768px). */
export function useIsMobile() {
  return useMediaBelow(MOBILE_BREAKPOINT);
}
