import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/components/kit";
import { useBulkSetDepartment, useCompanyToday, useRejoinEmployee, useSeparateEmployee } from "../api/employees";
import type { Employee } from "../api/types";
import { errorMessage } from "../lib/utils";
import { Field } from "./common";
import { DepartmentSelect } from "./pickers";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Separate (offboard) an employee with a last working day and an optional reason. */
export function SeparateDialog({ employee, open, onOpenChange }: BaseProps & { employee: Pick<Employee, "id" | "name" | "joining_date"> }) {
  const navigate = useNavigate();
  const separate = useSeparateEmployee();
  const today = useCompanyToday();
  const [lastDay, setLastDay] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLastDay(today);
      setReason("");
      setError(null);
    }
  }, [open, today]);

  const submit = async () => {
    if (!lastDay) return setError("Choose the last working day.");
    if (employee.joining_date && lastDay < employee.joining_date) {
      return setError(`The last day cannot be before the joining date (${formatDate(employee.joining_date)}).`);
    }
    try {
      const res = await separate.mutateAsync({ id: employee.id, lastDay, reason: reason.trim() });
      onOpenChange(false);
      toast.success(`${employee.name} is separated`, {
        description: res.assets_out
          ? `${res.assets_out} asset${res.assets_out === 1 ? " is" : "s are"} still with them. The offboarding checklist tracks the return.`
          : "Finance has been told, and the offboarding checklist is ready.",
        action: res.checklist_id ? { label: "Open checklist", onClick: () => navigate(`/checklists/${res.checklist_id}`) } : undefined,
      });
    } catch (e) {
      setError(errorMessage(e, "Could not separate this employee."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !separate.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Separate {employee.name}?</DialogTitle>
          <DialogDescription>
            Their portal access ends, Finance is told to prepare the final payslip, and an offboarding checklist starts. You can reactivate them later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="sep-last-day" label="Last working day" required error={error}>
            <Input
              id="sep-last-day"
              type="date"
              value={lastDay}
              min={employee.joining_date ?? undefined}
              onChange={(e) => {
                setLastDay(e.target.value);
                setError(null);
              }}
              className="h-10 rounded-xl"
              aria-invalid={!!error}
            />
          </Field>
          <Field id="sep-reason" label="Reason" hint="Kept in the timeline. Not shown to the employee.">
            <Textarea id="sep-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} rows={3} className="rounded-xl" placeholder="Resigned, contract ended…" />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={separate.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={separate.isPending}>
            {separate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Separate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reactivate a separated employee. */
export function RejoinDialog({ employee, open, onOpenChange }: BaseProps & { employee: Pick<Employee, "id" | "name" | "separation_date"> }) {
  const rejoin = useRejoinEmployee();
  const today = useCompanyToday();
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate(today);
      setError(null);
    }
  }, [open, today]);

  const submit = async () => {
    if (!date) return setError("Choose the rejoining date.");
    if (employee.separation_date && date <= employee.separation_date) {
      return setError(`The rejoining date must be after the last working day (${formatDate(employee.separation_date)}).`);
    }
    try {
      await rejoin.mutateAsync({ id: employee.id, date });
      onOpenChange(false);
      toast.success(`${employee.name} is active again`, { description: "Finance has been told to check the salary." });
    } catch (e) {
      setError(errorMessage(e, "Could not reactivate this employee."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !rejoin.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reactivate {employee.name}?</DialogTitle>
          <DialogDescription>
            They become active again and can sign in to the portal with their existing password. Any open offboarding checklist is cancelled.
          </DialogDescription>
        </DialogHeader>
        <Field id="rejoin-date" label="Rejoining date" required error={error} hint={employee.separation_date ? `Last working day was ${formatDate(employee.separation_date)}.` : undefined}>
          <Input
            id="rejoin-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            className="h-10 rounded-xl"
            aria-invalid={!!error}
          />
        </Field>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rejoin.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={rejoin.isPending}>
            {rejoin.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Move several employees to one department. */
export function MoveDepartmentDialog({ ids, open, onOpenChange, onDone }: BaseProps & { ids: string[]; onDone?: () => void }) {
  const move = useBulkSetDepartment();
  const [dept, setDept] = useState("");

  useEffect(() => {
    if (open) setDept("");
  }, [open]);

  const submit = async () => {
    try {
      const count = await move.mutateAsync({ ids, departmentId: dept || null });
      onOpenChange(false);
      onDone?.();
      toast.success(count ? `Moved ${count} ${count === 1 ? "person" : "people"}` : "Nobody needed moving");
    } catch (e) {
      toast.error(errorMessage(e, "Could not move these people."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !move.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Move {ids.length} {ids.length === 1 ? "person" : "people"}
          </DialogTitle>
          <DialogDescription>Finance gets one note to review salaries that change with the role.</DialogDescription>
        </DialogHeader>
        <Field id="move-dept" label="Department">
          <DepartmentSelect id="move-dept" value={dept} onChange={setDept} />
        </Field>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={move.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={move.isPending}>
            {move.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
