import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLoader from "@/components/common/BrandLoader";

function isChunkError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  const msg = e?.message ?? "";
  return (
    e?.name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

const RELOAD_KEY = "adicorp.chunk-reload-at";

interface Props {
  children: React.ReactNode;
  /** Changing this (e.g. the pathname) clears the error. */
  resetKey?: string;
  /** Full-screen fallback instead of an inline card. */
  fullScreen?: boolean;
}

interface State {
  error: unknown;
  chunk: boolean;
}

/**
 * Catches render errors. After a deploy, old lazy chunks disappear: that case reloads
 * the page once (guarded against loops); anything else shows a retry card.
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, chunk: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, chunk: isChunkError(error) };
  }

  componentDidCatch(error: unknown) {
    if (isChunkError(error)) {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* storage unavailable */
      }
      if (Date.now() - last > 10_000) window.location.reload();
    } else if (import.meta.env.DEV) {
      console.error(error);
    }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, chunk: false });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const wrap = this.props.fullScreen ? "min-h-[100dvh] flex items-center justify-center bg-background p-4" : "flex items-center justify-center py-16";
    if (this.state.chunk) {
      return (
        <BrandLoader
          fullScreen={this.props.fullScreen}
          message="Applying updates..."
          subtitle="Loading the latest version of AdiCorp HR"
          action={
            <Button variant="link" size="sm" onClick={() => window.location.reload()}>
              Reload now
            </Button>
          }
        />
      );
    }
    return (
      <div className={wrap} role="alert">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger ring-1 ring-inset ring-danger/10">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <h2 className="font-display text-base font-semibold text-foreground">Something went wrong</h2>
          <p className="mt-1 text-sm text-muted-foreground">This screen hit an unexpected error. Your data is safe.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Button size="sm" onClick={() => this.setState({ error: null, chunk: false })}>
              <RotateCcw aria-hidden /> Try again
            </Button>
          </div>
          {import.meta.env.DEV && this.state.error instanceof Error && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Technical details</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">{this.state.error.message}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
