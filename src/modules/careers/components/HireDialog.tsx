import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { existingEmployeeMatch, useDepartments, useHireApplication, type ExistingEmployeeMatch } from "../lib/api";
import { errorMessage, todayIn, type Application } from "../lib/model";

const NONE = "__none__";

function formatCnic(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

interface HireDialogProps {
  application: Application | null;
  onOpenChange: (open: boolean) => void;
  onHired?: (employeeId: string) => void;
}

/** Hire a candidate: creates the employee record (no pay; Finance is notified to set the salary). */
export function HireDialog({ application, onOpenChange, onHired }: HireDialogProps) {
  const navigate = useNavigate();
  const { company } = useAuth();
  const { data: departments = [] } = useDepartments();
  const hire = useHireApplication();
  const [rank, setRank] = useState("");
  // Default to today in the company's timezone (the server checks the date against company_today).
  const [joining, setJoining] = useState(() => todayIn(company?.timezone));
  const [department, setDepartment] = useState<string>(NONE);
  const [cnic, setCnic] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Someone with this email or CNIC is already on the books: offer to link instead of duplicating them.
  const [match, setMatch] = useState<ExistingEmployeeMatch | null>(null);

  useEffect(() => {
    if (!application) return;
    setRank(application.job?.title ?? "");
    setJoining(todayIn(company?.timezone));
    setDepartment(application.job?.department_id ?? NONE);
    setCnic("");
    setError(null);
    setMatch(null);
    // Reset only when a different candidate is opened, not when the company record refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application]);

  const run = (employeeId: string | null) => {
    if (!application) return;
    const digits = cnic.replace(/\D/g, "");
    if (!rank.trim()) return setError("Give the new hire a designation.");
    if (!joining) return setError("Pick a joining date.");
    if (digits && digits.length !== 13) return setError("A CNIC has 13 digits.");
    setError(null);
    const returning = !!employeeId;
    hire.mutate(
      { applicationId: application.id, rank: rank.trim(), joiningDate: joining, departmentId: department === NONE ? null : department, cnic: digits, employeeId },
      {
        onSuccess: (hiredId) => {
          toast.success(returning ? `${application.name} is back.` : `${application.name} is hired.`, {
            description: returning
              ? "Their existing employee record is active again. Finance has been asked to check the salary."
              : "Their employee record is ready. Finance has been asked to set the salary.",
            action: { label: "Open profile", onClick: () => navigate(`/employees/${hiredId}`) },
          });
          onOpenChange(false);
          onHired?.(hiredId);
        },
        onError: (err) => {
          const found = existingEmployeeMatch(err);
          if (found) {
            setMatch(found);
            setError(null);
          } else {
            setError(errorMessage(err));
          }
        },
      },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(null);
  };

  return (
    <Dialog open={Boolean(application)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <PartyPopper className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle>Hire {application?.name}</DialogTitle>
          <DialogDescription>
            Creates their employee record with the details from the application. Pay is set separately by Finance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="hire-rank">Designation</Label>
              <Input id="hire-rank" className="mt-1.5" maxLength={80} value={rank} onChange={(e) => setRank(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hire-joining">Joining date</Label>
              <Input id="hire-joining" className="mt-1.5" type="date" value={joining} onChange={(e) => setJoining(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hire-department">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger id="hire-department" className="mt-1.5">
                  <SelectValue placeholder="No department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="hire-cnic">CNIC</Label>
                <span className="text-[11px] text-muted-foreground">optional, needed for the employee portal</span>
              </div>
              <Input
                id="hire-cnic"
                className="mt-1.5"
                inputMode="numeric"
                placeholder="35202-1234567-1"
                value={cnic}
                onChange={(e) => setCnic(formatCnic(e.target.value))}
              />
            </div>
          </div>
          {application && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{application.name}</span> · {application.email}
              {application.phone ? ` · ${application.phone}` : ""}
            </div>
          )}
          {match && (
            <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              <p className="font-semibold">
                {match.name} is already on the books{match.status === "active" ? "" : ` (${match.status.replace("_", " ")})`}.
              </p>
              <p className="mt-1 text-muted-foreground">
                Same {match.matched_on === "cnic" ? "CNIC" : "email"}
                {match.rank ? ` · ${match.rank}` : ""}
                {match.joining_date ? ` · joined ${formatDate(match.joining_date)}` : ""}
                {match.separation_date ? ` · left ${formatDate(match.separation_date)}` : ""}. Hiring as a returning employee keeps their record and history
                {match.status === "active" ? " and only updates the designation and department" : " and makes it active again from the joining date"}.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {match ? (
              <Button type="button" disabled={hire.isPending} onClick={() => run(match.employee_id)}>
                {hire.isPending ? "Linking…" : "Hire as returning employee"}
              </Button>
            ) : (
              <Button type="submit" disabled={hire.isPending}>
                {hire.isPending ? "Creating employee…" : "Hire and create employee"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
