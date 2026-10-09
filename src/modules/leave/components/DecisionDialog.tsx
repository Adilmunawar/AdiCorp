import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type Decision = "approved" | "rejected";

export interface DecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Summary of what is being decided. */
  children?: ReactNode;
  /** Preselects the primary button; both remain available. */
  initial?: Decision;
  noteLabel?: string;
  notePlaceholder?: string;
  onDecide: (decision: Decision, note: string) => Promise<unknown>;
  /**
   * When an approval fails for a reason the reviewer may override (the error matches), the dialog
   * shows the reason and an "Approve anyway" button that calls this instead.
   */
  canOverride?: (error: unknown) => boolean;
  onApproveAnyway?: (note: string) => Promise<unknown>;
  overrideLabel?: string;
}

/** Approve or reject with an optional note the employee sees. */
export function DecisionDialog({ open, onOpenChange, title, description, children, initial = "approved", noteLabel = "Note for the employee (optional)", notePlaceholder = "e.g. Approved. Please hand over the client calls before you go.", onDecide, canOverride, onApproveAnyway, overrideLabel = "Approve anyway" }: DecisionDialogProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Decision | "override" | null>(null);
  const [overridable, setOverridable] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setBusy(null);
      setOverridable(null);
    }
  }, [open]);

  const decide = async (d: Decision) => {
    setBusy(d);
    setOverridable(null);
    try {
      await onDecide(d, note.trim());
      onOpenChange(false);
    } catch (error) {
      /* the mutation already showed the error; an overridable approval refusal is kept on screen */
      if (d === "approved" && onApproveAnyway && canOverride?.(error)) {
        setOverridable(error instanceof Error && error.message ? error.message : "The balance does not cover this request.");
      }
    } finally {
      setBusy(null);
    }
  };

  const approveAnyway = async () => {
    if (!onApproveAnyway) return;
    setBusy("override");
    try {
      await onApproveAnyway(note.trim());
      onOpenChange(false);
    } catch {
      /* the mutation already showed the error */
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="rounded-xl border border-border bg-muted/30 p-3">{children}</div>}
        <div className="space-y-1.5">
          <Label htmlFor="decision-note">{noteLabel}</Label>
          <Textarea
            id="decision-note"
            value={note}
            maxLength={300}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder={notePlaceholder}
            className="resize-none rounded-xl"
          />
          <p className="text-right text-[11px] text-muted-foreground tabular">{note.length}/300</p>
        </div>
        {overridable && (
          <div role="alert" className="space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-3">
            <p className="text-xs font-medium text-warning">{overridable}</p>
            <p className="text-xs text-muted-foreground">Approving anyway takes the balance below zero; the override is recorded in the activity log.</p>
            <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={approveAnyway} className="rounded-xl">
              {busy === "override" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
              {overrideLabel}
            </Button>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant={initial === "rejected" ? "destructive" : "outline"}
            disabled={!!busy}
            onClick={() => decide("rejected")}
            className="rounded-xl"
          >
            {busy === "rejected" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <X className="mr-1.5 h-4 w-4" />}
            Reject
          </Button>
          <Button
            type="button"
            variant={initial === "approved" ? "default" : "outline"}
            disabled={!!busy}
            onClick={() => decide("approved")}
            className="rounded-xl"
          >
            {busy === "approved" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
