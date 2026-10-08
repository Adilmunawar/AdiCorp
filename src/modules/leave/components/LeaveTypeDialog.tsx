import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSaveLeaveType } from "../api";
import { LEAVE_KIND_LABELS } from "../lib";
import { LEAVE_KINDS, type LeaveKind, type LeaveType } from "../types";

export function LeaveTypeDialog({
  open,
  onOpenChange,
  editing,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LeaveType | null;
  existing: LeaveType[];
}) {
  const save = useSaveLeaveType();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LeaveKind>("annual");
  const [days, setDays] = useState("14");
  const [paid, setPaid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setKind(editing?.type ?? "annual");
    setDays(String(editing?.days_per_year ?? 14));
    setPaid(editing?.is_paid ?? true);
    setError(null);
  }, [open, editing]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = name.trim();
    const n = Number(days);
    if (clean.length < 2) return setError("Give the leave type a name.");
    if (existing.some((t) => t.id !== editing?.id && t.name.trim().toLowerCase() === clean.toLowerCase())) {
      return setError(`There is already a leave type called "${clean}".`);
    }
    // An emptied field is Number("") = 0, which would silently mean "no yearly limit".
    if (days.trim() === "" || !Number.isInteger(n) || n < 0 || n > 366) return setError("Days per year must be a whole number from 0 to 366 (0 means no yearly limit).");
    try {
      await save.mutateAsync({ id: editing?.id ?? null, name: clean, kind, daysPerYear: n, isPaid: paid });
      onOpenChange(false);
    } catch {
      /* shown as a toast */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : "Add a leave type"}</DialogTitle>
          <DialogDescription>Names are unique regardless of capitals. Changes apply to balances straight away.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="lt-name">Name</Label>
            <Input id="lt-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual" className="h-10 rounded-xl" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-kind">Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  const k = v as LeaveKind;
                  setKind(k);
                  if (k === "unpaid") {
                    setPaid(false);
                    setDays("0");
                  }
                }}
              >
                <SelectTrigger id="lt-kind" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {LEAVE_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-days">Days per year</Label>
              <Input id="lt-days" type="number" inputMode="numeric" min={0} max={366} step={1} value={days} onChange={(e) => setDays(e.target.value)} className="h-10 rounded-xl tabular" />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">0 days means no yearly limit (for example unpaid leave).</p>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block text-sm font-semibold">Paid leave</span>
              <span className="block text-xs text-muted-foreground">Unpaid leave is reported to Finance and comes off that month's pay.</span>
            </span>
            <Switch checked={paid} onCheckedChange={setPaid} aria-label="Paid leave" />
          </label>
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
