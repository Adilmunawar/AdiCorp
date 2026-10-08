import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toDate } from "@/components/kit";
import { useChecklistTemplates, useChecklists, useStartChecklist } from "../api/checklists";
import { useCompanyToday, useEmployees } from "../api/employees";
import type { ChecklistKind } from "../lib/constants";
import { errorMessage } from "../lib/utils";
import { Field } from "./common";
import { EmployeePicker } from "./pickers";

export function StartChecklistDialog({
  open,
  onOpenChange,
  kind,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ChecklistKind;
  employeeId?: string;
}) {
  const navigate = useNavigate();
  const { data: templates = [] } = useChecklistTemplates();
  const { data: employees = [] } = useEmployees();
  const { data: lists = [] } = useChecklists();
  const start = useStartChecklist();
  const today = useCompanyToday();
  const [emp, setEmp] = useState(employeeId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = templates.filter((t) => t.kind === kind);
  const template = options.find((t) => t.id === templateId) ?? options.find((t) => t.is_default) ?? options[0];
  const person = employees.find((e) => e.id === emp);

  // Onboarding is offered to people who joined in the last 90 days; offboarding to anyone without an open one.
  const exclude = useMemo(() => {
    const busy = new Set(lists.filter((l) => l.kind === kind && l.status === "open").map((l) => l.employee_id));
    const cutoff = addDays(new Date(), -90);
    return employees
      .filter((e) => busy.has(e.id) || (kind === "onboarding" && (!e.joining_date || (toDate(e.joining_date) ?? new Date(0)) < cutoff)))
      .map((e) => e.id);
  }, [employees, lists, kind]);

  useEffect(() => {
    if (open) {
      setEmp(employeeId ?? "");
      setTemplateId("");
      setNote("");
      setError(null);
    }
  }, [open, employeeId]);

  useEffect(() => {
    const base = kind === "onboarding" ? person?.joining_date : person?.separation_date;
    setStartDate(base || today);
  }, [person, kind, today]);

  useEffect(() => {
    const s = toDate(startDate);
    if (s && template) setDue(format(addDays(s, template.default_due_days), "yyyy-MM-dd"));
  }, [startDate, template]);

  const submit = async () => {
    if (!emp) return setError("Choose a person.");
    if (!template) return setError("Create a template first.");
    if (due && due < startDate) return setError("The due date cannot be before the start date.");
    try {
      const id = await start.mutateAsync({ employeeId: emp, kind, templateId: template.id, start: startDate, due, note });
      toast.success(`${kind === "onboarding" ? "Onboarding" : "Offboarding"} started`);
      onOpenChange(false);
      navigate(`/checklists/${id}`);
    } catch (e) {
      setError(errorMessage(e, "Could not start the checklist."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !start.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start {kind}</DialogTitle>
          <DialogDescription>The template is copied. Later template edits will not change this checklist.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!employeeId && (
            <Field id="start-employee" label="Person" required hint={kind === "onboarding" ? "People who joined in the last 90 days without an open onboarding." : undefined}>
              <EmployeePicker id="start-employee" value={emp} onChange={setEmp} includeSeparated={kind === "offboarding"} exclude={exclude} />
            </Field>
          )}
          <Field id="start-template" label="Template" required>
            <Select value={template?.id ?? ""} onValueChange={setTemplateId}>
              <SelectTrigger id="start-template" className="h-10 rounded-xl">
                <SelectValue placeholder="No templates" />
              </SelectTrigger>
              <SelectContent>
                {options.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.steps.length} steps)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="start-date" label="Start">
              <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 rounded-xl" />
            </Field>
            <Field id="start-due" label="Due">
              <Input id="start-due" type="date" min={startDate} value={due} onChange={(e) => setDue(e.target.value)} className="h-10 rounded-xl" />
            </Field>
          </div>
          <Field id="start-note" label="Note">
            <Textarea id="start-note" value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} className="rounded-xl" />
          </Field>
          {error && (
            <p role="alert" className="text-[12px] font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={start.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={start.isPending}>
            {start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
