import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/kit";
import { cn } from "@/lib/utils";
import { isMissingFeature, loadErrorHint } from "../lib/api";

interface LoadErrorProps {
  /** What failed, e.g. "Announcements" ("Announcements could not be loaded"). */
  what: string;
  error: unknown;
  icon: LucideIcon;
  onRetry?: () => void;
  /** Inside an existing card: no frame of its own, tighter padding. */
  inline?: boolean;
  className?: string;
}

/** The one error state for engagement lists: a framed card with a plain reason and a retry. */
export function LoadError({ what, error, icon, onRetry, inline, className }: LoadErrorProps) {
  const missing = isMissingFeature(error);
  return (
    <div className={cn(!inline && "rounded-2xl border border-border bg-card shadow-sm", className)} role="alert">
      <EmptyState
        icon={icon}
        title={missing ? `${what} are not available yet` : `${what} could not be loaded`}
        description={loadErrorHint(error)}
        compact={inline}
        action={
          onRetry && !missing ? (
            <Button variant="outline" size={inline ? "sm" : "default"} className="gap-1.5 rounded-xl" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
