import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/components/kit";
import { useActiveEmployees, useAddOvertime, useCompanyTimeZone, useSetOvertimeHours } from "../api";
import { OVERTIME_TYPE_LABELS, companyToday, hoursLabel } from "../lib";
import { MAX_OVERTIME_HOURS, OVERTIME_TYPES, type OvertimeHoursRow, type OvertimeType } from "../types";
import { EmployeePicker, Fact } from "./shared";

/** Hours in halves, more than 0, at most 16; null when invalid. */
export function parseHours(raw: string): number | null {
  const h = Number(raw);
  if (!raw.trim() || !Number.isFinite(h) || h <= 0 || h > MAX_OVERTIME_HOURS) return null;
  return Math.round(h * 2) / 2 === h ? h : null;
}

export const HOURS_ERROR = `Hours go in halves, from 0.5 to ${MAX_OVERTIME_HOURS}.`;

/** Fields shared by HR's entry form and the employee's claim form. */
export function OvertimeFields({
  idPrefix,
  date,
  setDate,
  hours,
  setHours,
  type,
  setType,
  reason,
  setReason,
  maxDate,
}: {
  idPrefix: string;
  date: string;
  setDate: (v: string) => void;
  hours: string;
  setHours: (v: string) => void;
  type: OvertimeType;
  setType: (v: OvertimeType) => void;
  reason: string;
  setReason: (v: string) => void;
  maxDate: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-date`}>Date worked</Label>
          <Input id={`${idPrefix}-date`} type="date" min="2015-01-01" max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-hours`}>Hours</Label>
          <Input
            id={`${idPrefix}-hours`}
            type="number"
            inputMode="decimal"
            min={0.5}
            max={MAX_OVERTIME_HOURS}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="h-10 rounded-xl tabular"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-type`}>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as OvertimeType)}>
          <SelectTrigger id={`${idPrefix}-type`} className="h-10 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OVERTIME_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {OVERTIME_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-reason`}>What was the work? (optional)</Label>
        <Textarea id={`${idPrefix}-reason`} value={reason} maxLength={500} rows={2} onChange={(e) => setReason(e.target.value)} className="resize-none rounded-xl" />
      </div>
    </>
  );
}

/** HR records hours for anyone, approved at once by default. */
export function AddOvertimeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const employees = useActiveEmployees();
  const add = useAddOvertime();
  // The company's day: the server refuses dates after it, whatever the viewer's clock says.
  const timeZone = useCompanyTimeZone();
  const today = companyToday(timeZone);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("2");
  const [type, setType] = useState<OvertimeType>("regular");
  const [reason, setReason] = useState("");
  const [approveNow, setApproveNow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset when the dialog opens (not when the day rolls over while it is open).
  useEffect(() => {
    if (open) {
      setEmployeeId(null);
      setDate(companyToday(timeZone));
      setHours("2");
      setType("regular");
      setReason("");
      setApproveNow(true);
      setError(null);
    }
  }, [open, timeZone]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const h = parseHours(hours);
    if (!employeeId) return setError("Pick an employee.");
    if (!date) return setError("Pick the date the overtime was worked.");
    if (date > today) return setError("Overtime is recorded after it is worked; the date cannot be in the future.");
    if (h === null) return setError(HOURS_ERROR);
    try {
      await add.mutateAsync({ employeeId, date, hours: h, type, reason: reason.trim(), approveNow });
      onOpenChange(false);
    } catch {
      /* shown as a toast */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !add.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add overtime</DialogTitle>
          <DialogDescription>Hours only. Finance sets what approved hours are worth.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="ot-employee">Employee</Label>
            <EmployeePicker id="ot-employee" employees={employees.data ?? []} value={employeeId} onChange={setEmployeeId} disabled={employees.isLoading} />
          </div>
          <OvertimeFields
            idPrefix="ot"
            date={date}
            setDate={setDate}
            hours={hours}
            setHours={setHours}
            type={type}
            setType={setType}
            reason={reason}
            setReason={setReason}
            maxDate={today}
          />
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
            <Checkbox checked={approveNow} onCheckedChange={(v) => setApproveNow(v === true)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-semibold">Approve now</span>
              <span className="block text-xs text-muted-foreground">Sends the hours straight to Finance for a rate.</span>
            </span>
          </label>
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={add.isPending}>
              {add.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {approveNow ? "Add and approve" : "Add as pending"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** HR corrects the hours on a pending entry; the original claim is kept. */
export function HoursDialog({ row, onClose }: { row: OvertimeHoursRow | null; onClose: () => void }) {
  const set = useSetOvertimeHours();
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (row) {
      setHours(String(row.hours));
      setError(null);
    }
  }, [row]);

  if (!row) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const h = parseHours(hours);
    if (h === null) return setError(HOURS_ERROR);
    try {
      await set.mutateAsync({ id: row.id, hours: h });
      onClose();
    } catch {
      /* shown as a toast */
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && !set.isPending && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change hours</DialogTitle>
          <DialogDescription>
            {row.employee_name}, {formatDate(row.date, "d MMM yyyy")}. The employee's original claim stays on record.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <Fact label="Claimed">{hoursLabel(row.claimed_hours ?? row.hours)}</Fact>
          <Fact label="Type">{OVERTIME_TYPE_LABELS[row.overtime_type]}</Fact>
        </div>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="ot-fix-hours">Hours to approve</Label>
            <Input
              id="ot-fix-hours"
              type="number"
              inputMode="decimal"
              min={0.5}
              max={MAX_OVERTIME_HOURS}
              step={0.5}
              value={hours}
              onChange={(e) => {
                setHours(e.target.value);
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
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={set.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={set.isPending}>
              {set.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save hours
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
