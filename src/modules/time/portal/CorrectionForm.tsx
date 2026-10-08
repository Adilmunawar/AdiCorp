import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRequestCorrection } from "../api";
import { CORRECTION_KINDS } from "../lib";
import type { CorrectionKind } from "../types";

export function CorrectionDialog({ open, onOpenChange, today, initialDate }: { open: boolean; onOpenChange: (o: boolean) => void; today: string; initialDate?: string | null }) {
  const request = useRequestCorrection();
  const [date, setDate] = useState(initialDate ?? today);
  const [kind, setKind] = useState<CorrectionKind>("missed_out");
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(initialDate ?? today);
      setKind("missed_out");
      setReason("");
      setTimeIn("");
      setTimeOut("");
      setShowErrors(false);
    }
  }, [open, initialDate, today]);

  const meta = CORRECTION_KINDS.find((k) => k.value === kind)!;
  const min = format(subDays(new Date(`${today}T00:00:00`), 30), "yyyy-MM-dd");
  const errors: string[] = [];
  if (!date || date > today || date < min) errors.push("Pick a day within the last 30 days.");
  if (kind === "missed_in" && !timeIn) errors.push("Enter the time you arrived.");
  if (kind === "missed_out" && !timeOut) errors.push("Enter the time you left.");
  if (kind === "missed_both" && (!timeIn || !timeOut)) errors.push("Enter both times.");
  if (kind === "missed_both" && timeIn && timeOut && timeOut <= timeIn) errors.push("The time you left must be after the time you arrived.");
  if (kind === "wrong_time" && !timeIn && !timeOut) errors.push("Enter the correct arrival or leaving time.");
  if (reason.trim().length < 5) errors.push("Tell HR what happened (at least 5 characters).");
  const valid = errors.length === 0;

  const submit = async () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    await request.mutateAsync({
      date,
      kind,
      timeIn: meta.needsIn ? timeIn : null,
      timeOut: meta.needsOut ? timeOut : null,
      reason: reason.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit().catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>Ask for a punch correction</DialogTitle>
            <DialogDescription>Forgot to punch or the time clock missed you? HR reviews it and you get a notification.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pc-date">Day</Label>
              <Input id="pc-date" type="date" value={date} min={min} max={today} onChange={(e) => setDate(e.target.value)} className="rounded-xl" required />
            </div>
            <div className="space-y-1.5">
              <Label>What went wrong</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as CorrectionKind)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRECTION_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {meta.needsIn && (
              <div className="space-y-1.5">
                <Label htmlFor="pc-in">{kind === "wrong_time" ? "Correct arrival" : "Arrived at"}</Label>
                <Input id="pc-in" type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className="rounded-xl" />
              </div>
            )}
            {meta.needsOut && (
              <div className="space-y-1.5">
                <Label htmlFor="pc-out">{kind === "wrong_time" ? "Correct leaving" : "Left at"}</Label>
                <Input id="pc-out" type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className="rounded-xl" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pc-reason">Reason</Label>
            <Textarea id="pc-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="rounded-xl" placeholder="e.g. The terminal was offline when I left at 6 pm." />
            <p className="text-right text-[11px] text-muted-foreground">{reason.length}/500</p>
          </div>

          {showErrors && !valid && (
            <ul role="alert" className="space-y-0.5 rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={request.isPending}>
              {request.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to HR
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
