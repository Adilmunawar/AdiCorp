import { useEffect, useState, type FormEvent } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetAllocation } from "../api";
import { dayWord, trimNumber } from "../lib";
import type { LeaveBalanceRow } from "../types";
import { Fact } from "./shared";

/** A person's allowance for one type and year; resetting returns them to the type's default. */
export function AllocationDialog({ row, year, onClose }: { row: LeaveBalanceRow | null; year: number; onClose: () => void }) {
  const set = useSetAllocation();
  const [days, setDays] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (row) {
      setDays(row.unlimited ? "" : trimNumber(row.allowed));
      setError(null);
    }
  }, [row]);

  if (!row) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(days);
    if (days.trim() === "" || !Number.isFinite(n) || n < 0 || n > 366 || Math.round(n * 2) !== n * 2) {
      return setError("Allowance must be from 0 to 366 days, in halves.");
    }
    try {
      await set.mutateAsync({ employeeId: row.employee_id, leaveTypeId: row.leave_type_id, year, days: n });
      onClose();
    } catch {
      /* shown as a toast */
    }
  };

  const reset = async () => {
    try {
      await set.mutateAsync({ employeeId: row.employee_id, leaveTypeId: row.leave_type_id, year, days: null });
      onClose();
    } catch {
      /* shown as a toast */
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && !set.isPending && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row.type_name} allowance · {year}
          </DialogTitle>
          <DialogDescription>{row.employee_name}. Used days always come from approved requests that start in the year.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <Fact label="Default">{row.default_days > 0 ? dayWord(row.default_days) : "No limit"}</Fact>
          <Fact label="Used">{dayWord(row.used)}</Fact>
          <Fact label="Pending">{dayWord(row.pending)}</Fact>
        </div>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="alloc-days">Allowance for {year} (days)</Label>
            <Input
              id="alloc-days"
              type="number"
              inputMode="decimal"
              min={0}
              max={366}
              step={0.5}
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setError(null);
              }}
              className="h-10 rounded-xl tabular"
              autoFocus
            />
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {row.custom && (
              <Button type="button" variant="ghost" className="rounded-xl sm:mr-auto" onClick={reset} disabled={set.isPending}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reset to default
              </Button>
            )}
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={set.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={set.isPending}>
              {set.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save allowance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
