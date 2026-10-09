import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isOverBalanceError, useActiveEmployees, useCompanyTimeZone, useCreateLeaveRequest, useLeaveCountDays, useLeaveTypes } from "../api";
import { calendarDays, companyToday, dayWord } from "../lib";
import { EmployeePicker } from "./shared";

/** HR files leave on someone's behalf, optionally approving it in the same step. */
export function LeaveRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const employees = useActiveEmployees();
  const types = useLeaveTypes();
  const create = useCreateLeaveRequest();
  const timeZone = useCompanyTimeZone();
  const today = companyToday(timeZone);

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState("");
  const [approveNow, setApproveNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The server's balance refusal, kept on screen so HR can file anyway. */
  const [overBalance, setOverBalance] = useState<string | null>(null);

  // Reset when the dialog opens (not when the day rolls over while it is open).
  useEffect(() => {
    if (open) {
      const day = companyToday(timeZone);
      setEmployeeId(null);
      setTypeId("");
      setStart(day);
      setEnd(day);
      setReason("");
      setApproveNow(true);
      setError(null);
      setOverBalance(null);
    }
  }, [open, timeZone]);

  const activeTypes = useMemo(() => (types.data ?? []).filter((t) => t.is_active), [types.data]);
  const count = useLeaveCountDays(employeeId, start, end);
  const span = calendarDays(start, end);

  const file = async (force: boolean) => {
    setError(null);
    setOverBalance(null);
    if (!employeeId) return setError("Pick an employee.");
    if (!typeId) return setError("Pick a leave type.");
    if (!start || !end) return setError("Pick a start and an end date.");
    if (end < start) return setError("The end date is before the start date.");
    try {
      await create.mutateAsync({ employeeId, leaveTypeId: typeId, start, end, reason: reason.trim(), approveNow, force });
      onOpenChange(false);
    } catch (err) {
      /* the server's reason is shown as a toast; the form stays open to correct it */
      if (!force && isOverBalanceError(err)) setOverBalance(err instanceof Error ? err.message : "The balance does not cover this request.");
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void file(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>File a leave request</DialogTitle>
          <DialogDescription>For any active employee. Weekends and holidays in the range are not counted.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="lr-employee">Employee</Label>
            <EmployeePicker id="lr-employee" employees={employees.data ?? []} value={employeeId} onChange={setEmployeeId} disabled={employees.isLoading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lr-type">Leave type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger id="lr-type" className="h-10 rounded-xl">
                <SelectValue placeholder={activeTypes.length ? "Pick a leave type" : "No active leave types yet"} />
              </SelectTrigger>
              <SelectContent>
                {activeTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · {t.is_paid ? "paid" : "unpaid"}
                    {t.days_per_year > 0 ? ` · ${dayWord(t.days_per_year)} a year` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lr-start">From</Label>
              <Input
                id="lr-start"
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end < e.target.value) setEnd(e.target.value);
                }}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lr-end">To</Label>
              <Input id="lr-end" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-foreground" aria-live="polite">
            <CalendarRange className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            {span === 0 ? (
              <span className="text-muted-foreground">Pick a valid range.</span>
            ) : !employeeId ? (
              <span>{dayWord(span)} picked. Pick the employee to see the working days counted.</span>
            ) : count.isError ? (
              <span className="text-muted-foreground">{dayWord(span)} picked. The working days could not be counted; the server checks them when you file.</span>
            ) : count.data === undefined ? (
              <span className="text-muted-foreground">Counting working days…</span>
            ) : (
              <span>
                <strong className="tabular">{dayWord(count.data ?? 0)}</strong> of leave counted ({dayWord(span)} picked).
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lr-reason">Reason (optional)</Label>
            <Textarea id="lr-reason" value={reason} maxLength={500} rows={2} onChange={(e) => setReason(e.target.value)} className="resize-none rounded-xl" />
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
            <Checkbox checked={approveNow} onCheckedChange={(v) => setApproveNow(v === true)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-semibold">Approve now</span>
              <span className="block text-xs text-muted-foreground">Marks the days as leave in attendance straight away.</span>
            </span>
          </label>
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          {overBalance && (
            <div role="alert" className="space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-3">
              <p className="text-xs font-medium text-warning">{overBalance}</p>
              <p className="text-xs text-muted-foreground">Filing anyway takes the year's balance below zero; the override is recorded in the activity log.</p>
              <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={create.isPending} onClick={() => void file(true)}>
                {approveNow ? "File and approve anyway" : "File anyway"}
              </Button>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {approveNow ? "File and approve" : "File request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
