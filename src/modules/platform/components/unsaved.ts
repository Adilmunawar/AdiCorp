import { createContext, useContext, useEffect } from "react";

/*
 * Unsaved-changes tracking for the settings console. Each tab reports whether its form
 * has unsaved edits; the page uses that to warn before switching sections and before the
 * browser tab is closed or reloaded.
 */

const DirtyContext = createContext<(dirty: boolean) => void>(() => undefined);

export const DirtyReporter = DirtyContext.Provider;

/** Report this form's unsaved state to the surrounding settings page. */
export function useReportDirty(dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(dirty);
  }, [dirty, report]);
  useEffect(() => () => report(false), [report]);
}

/** Ask the browser to confirm before closing or reloading while `active`. */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
