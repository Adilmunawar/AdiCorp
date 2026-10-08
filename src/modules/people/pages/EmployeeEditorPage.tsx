import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Banknote, Briefcase, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Phone, ShieldCheck, StickyNote, UserRound, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, PageSkeleton, SectionCard, formatDate } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useCompanyToday, useEmployee, usePortalAccess, useSaveEmployee } from "../api/employees";
import type { Employee, EmployeeInput } from "../api/types";
import { GENDER_OPTIONS, SATURDAY_OPTIONS, SHIFT_OPTIONS, saturdayRule } from "../lib/constants";
import { errorMessage, formatCnic } from "../lib/utils";
import { Field } from "../components/common";
import { DepartmentSelect } from "../components/pickers";

type Errors = Partial<Record<keyof EmployeeInput, string>>;

const EMPTY: EmployeeInput = {
  name: "",
  cnic: "",
  father_name: "",
  date_of_birth: "",
  gender: "",
  email: "",
  phone: "",
  emergency_contact: "",
  address: "",
  education: "",
  rank: "",
  department_id: "",
  joining_date: "",
  shift_type: "morning",
  weekend_saturday: "company",
  working_hours_per_day: "8",
  bank_name: "",
  bank_account_number: "",
  notes: "",
  employee_code: "",
  portal_password: "",
};

function fromEmployee(e: Employee): EmployeeInput {
  return {
    name: e.name ?? "",
    cnic: e.cnic ?? "",
    father_name: e.father_name ?? "",
    date_of_birth: e.date_of_birth ?? "",
    gender: e.gender ?? "",
    email: e.email ?? "",
    phone: e.phone ?? "",
    emergency_contact: e.emergency_contact ?? "",
    address: e.address ?? "",
    education: e.education ?? "",
    rank: e.rank ?? "",
    department_id: e.department_id ?? "",
    joining_date: e.joining_date ?? "",
    shift_type: e.shift_type ?? "morning",
    weekend_saturday: saturdayRule(e.weekend_saturday),
    working_hours_per_day: String(e.working_hours_per_day ?? 8),
    bank_name: e.bank_name ?? "",
    bank_account_number: e.bank_account_number ?? "",
    notes: e.notes ?? "",
    employee_code: e.employee_code ?? "",
    portal_password: "",
  };
}

/** Mirrors the server rules so most mistakes are caught before saving. */
function validate(v: EmployeeInput, existing?: Employee | null): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Enter the full name.";
  if (v.cnic.replace(/\D/g, "").length !== 13) e.cnic = "CNIC must have 13 digits.";
  if (v.rank.trim().length < 2) e.rank = "Enter the position (job title).";
  if (!v.joining_date) e.joining_date = "Joining date is required.";
  else if (existing?.separation_date && v.joining_date > existing.separation_date)
    e.joining_date = `Cannot be after the last working day (${formatDate(existing.separation_date)}).`;
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = "Enter a valid e-mail address.";
  if (v.phone && !/^\+?[0-9 ()-]{7,20}$/.test(v.phone.trim())) e.phone = "Enter a valid phone number.";
  if (v.date_of_birth) {
    const dob = new Date(v.date_of_birth);
    const limit = new Date();
    limit.setFullYear(limit.getFullYear() - 14);
    if (dob > limit || dob.getFullYear() < 1930) e.date_of_birth = "The date of birth looks wrong.";
  }
  if (v.employee_code && !/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(v.employee_code.trim())) e.employee_code = "Letters, digits and dashes (2 to 20).";
  if (v.bank_account_number && !/^[A-Za-z0-9 -]{4,34}$/.test(v.bank_account_number.trim())) e.bank_account_number = "Enter a valid account number or IBAN.";
  const hours = Number(v.working_hours_per_day);
  if (v.working_hours_per_day && (!Number.isInteger(hours) || hours < 1 || hours > 16)) e.working_hours_per_day = "Between 1 and 16.";
  if (v.portal_password && (v.portal_password.length < 8 || !/[A-Za-z]/.test(v.portal_password) || !/\d/.test(v.portal_password)))
    e.portal_password = "At least 8 characters with letters and digits.";
  return e;
}

function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const rand = new Uint32Array(10);
  crypto.getRandomValues(rand);
  const chars = Array.from(rand, (n, i) => (i === 0 ? letters : i === 1 ? digits : all)[n % (i === 0 ? letters.length : i === 1 ? digits.length : all.length)]);
  return chars.sort(() => 0.5 - Math.random()).join("");
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export default function EmployeeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useAuth();
  const { data: employee, isLoading, error: loadError } = useEmployee(id);
  const { data: access } = usePortalAccess(id);
  const save = useSaveEmployee();
  const today = useCompanyToday();
  // A new person joins today (the company's day) unless HR picks another date.
  const [blank] = useState<EmployeeInput>(() => ({ ...EMPTY, joining_date: today }));
  const [values, setValues] = useState<EmployeeInput>(blank);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; code: string | null; name: string; cnic: string; password: string } | null>(null);

  useEffect(() => {
    if (employee && loadedId !== employee.id) {
      setValues(fromEmployee(employee));
      setLoadedId(employee.id);
    }
  }, [employee, loadedId]);

  // "Set password" links point at #portal: bring the portal card into view once the form is on screen.
  useEffect(() => {
    if (location.hash !== "#portal" || (!isNew && !loadedId)) return;
    document.getElementById("portal")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("emp-portal_password")?.focus({ preventScroll: true });
  }, [location.hash, loadedId, isNew]);

  const initial = useMemo(() => (employee ? fromEmployee(employee) : blank), [employee, blank]);
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(initial), [values, initial]);

  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setServerError(null);
    const found = validate(values, employee);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      document.getElementById(`emp-${first}`)?.focus();
      toast.error("Please fix the highlighted fields.");
      return;
    }
    try {
      const payload: Partial<EmployeeInput> = { ...values, employee_code: values.employee_code.trim().toUpperCase() };
      if (!payload.portal_password) delete payload.portal_password;
      const res = await save.mutateAsync({ id: id ?? null, input: payload });
      if (isNew) {
        toast.success(`${values.name.trim()} added`, { description: res.employee_code ? `Employee code ${res.employee_code}. Finance has been asked to set a salary.` : undefined });
        if (values.portal_password) {
          setCreated({ id: res.id, code: res.employee_code, name: values.name.trim(), cnic: formatCnic(values.cnic), password: values.portal_password });
        } else {
          navigate(`/employees/${res.id}`, { replace: true });
        }
      } else {
        toast.success(res.changed ? "Changes saved" : "Nothing changed");
        navigate(`/employees/${res.id}`);
      }
    } catch (e) {
      const message = errorMessage(e, "Could not save the employee.");
      setServerError(message);
      toast.error(message);
    }
  };

  if (!isNew && isLoading && !employee) return <PageSkeleton />;
  if (!isNew && !isLoading && !employee) {
    return (
      <EmptyState
        icon={UserRound}
        title={loadError ? "Could not load this employee" : "Employee not found"}
        description={loadError ? errorMessage(loadError) : "They may belong to another company or the link is wrong."}
        action={
          <Button asChild size="sm">
            <Link to="/employees">Back to employees</Link>
          </Button>
        }
      />
    );
  }

  const input = (key: keyof EmployeeInput, props: React.ComponentProps<typeof Input> = {}) => (
    <Input
      id={`emp-${key}`}
      value={values[key]}
      onChange={(e) => set(key, e.target.value)}
      aria-invalid={!!errors[key]}
      aria-describedby={errors[key] ? `emp-${key}-error` : undefined}
      className="h-10 rounded-xl"
      {...props}
    />
  );

  const shareMessage = created
    ? `Welcome to ${company?.name ?? "the team"}, ${created.name}! Sign in to the employee portal at ${window.location.origin}/employee-login with your CNIC ${created.cnic} and the temporary password ${created.password}. You will be asked to choose your own password.`
    : "";

  return (
    <div className="animate-in fade-in pb-24 duration-300 md:pb-0">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-9 px-2 text-muted-foreground sm:h-8" asChild>
        <Link to={isNew ? "/employees" : `/employees/${id}`}>
          <ArrowLeft className="h-4 w-4" /> {isNew ? "Employees" : employee?.name ?? "Back"}
        </Link>
      </Button>
      <PageHeader
        eyebrow={isNew ? "New employee" : employee?.employee_code ?? "Edit employee"}
        title={isNew ? "Add an employee" : `Edit ${employee?.name}`}
        description={
          isNew
            ? "Fields marked * are required. Finance is asked to set the salary automatically; pay is never entered here."
            : "Fields marked * are required. Changes to the joining date, position or department are sent to Finance."
        }
        icon={UserRound}
      />

      <form onSubmit={submit} noValidate className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="Personal" icon={UserRound}>
            <Grid>
              <Field id="emp-name" label="Full name" required error={errors.name}>
                {input("name", { autoComplete: "off", maxLength: 120, placeholder: "As on the CNIC" })}
              </Field>
              <Field id="emp-cnic" label="CNIC" required error={errors.cnic} hint="Employees sign in to the portal with it.">
                {input("cnic", { inputMode: "numeric", placeholder: "12345-1234567-1", onChange: (e) => set("cnic", formatCnic(e.target.value)) })}
              </Field>
              <Field id="emp-father_name" label="Father's name" error={errors.father_name}>
                {input("father_name", { maxLength: 120 })}
              </Field>
              <Field id="emp-date_of_birth" label="Date of birth" error={errors.date_of_birth}>
                {input("date_of_birth", { type: "date" })}
              </Field>
              <Field id="emp-gender" label="Gender">
                <Select value={values.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
                  <SelectTrigger id="emp-gender" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="emp-education" label="Education" error={errors.education}>
                {input("education", { maxLength: 120, placeholder: "Highest qualification" })}
              </Field>
            </Grid>
          </SectionCard>

          <SectionCard title="Contact" icon={Phone}>
            <Grid>
              <Field id="emp-phone" label="Phone" error={errors.phone}>
                {input("phone", { type: "tel", inputMode: "tel", placeholder: "0300-1234567" })}
              </Field>
              <Field id="emp-email" label="E-mail" error={errors.email}>
                {input("email", { type: "email", autoComplete: "off", placeholder: "name@company.com" })}
              </Field>
              <Field id="emp-emergency_contact" label="Emergency contact" error={errors.emergency_contact} hint="Name and number">
                {input("emergency_contact", { maxLength: 120 })}
              </Field>
              <Field id="emp-address" label="Address" error={errors.address}>
                {input("address", { maxLength: 300 })}
              </Field>
            </Grid>
          </SectionCard>

          <SectionCard title="Employment" icon={Briefcase}>
            <Grid>
              <Field id="emp-rank" label="Position" required error={errors.rank}>
                {input("rank", { maxLength: 80, placeholder: "e.g. Product Designer" })}
              </Field>
              <Field id="emp-department_id" label="Department">
                <DepartmentSelect id="emp-department_id" value={values.department_id} onChange={(v) => set("department_id", v)} />
              </Field>
              <Field id="emp-joining_date" label="Joining date" required error={errors.joining_date}>
                {input("joining_date", { type: "date", max: employee?.separation_date ?? undefined })}
              </Field>
              <Field id="emp-employee_code" label="Employee code" error={errors.employee_code} hint={isNew ? "Leave blank to number automatically." : undefined}>
                {input("employee_code", { maxLength: 20, placeholder: "Automatic", className: "h-10 rounded-xl uppercase" })}
              </Field>
              <Field id="emp-shift_type" label="Shift">
                <Select value={values.shift_type} onValueChange={(v) => set("shift_type", v)}>
                  <SelectTrigger id="emp-shift_type" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFT_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="emp-weekend_saturday" label="Saturday" hint="Company rule follows Settings.">
                <Select value={values.weekend_saturday} onValueChange={(v) => set("weekend_saturday", v)}>
                  <SelectTrigger id="emp-weekend_saturday" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SATURDAY_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="emp-working_hours_per_day" label="Hours per day" error={errors.working_hours_per_day}>
                {input("working_hours_per_day", { type: "number", min: 1, max: 16, inputMode: "numeric" })}
              </Field>
            </Grid>
          </SectionCard>

          <SectionCard title="Bank" icon={Banknote} description="Where Finance sends the salary. HR never sees amounts.">
            <Grid>
              <Field id="emp-bank_name" label="Bank" error={errors.bank_name}>
                {input("bank_name", { maxLength: 120, placeholder: "e.g. Meezan Bank" })}
              </Field>
              <Field id="emp-bank_account_number" label="Account number or IBAN" error={errors.bank_account_number}>
                {input("bank_account_number", { maxLength: 34, autoComplete: "off", className: "h-10 rounded-xl uppercase" })}
              </Field>
            </Grid>
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-4">
          <SectionCard id="portal" title="Portal access" icon={KeyRound} description="Employees sign in with their CNIC and this password.">
            {!isNew && access && (
              <p className="mb-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-[12px]">
                <ShieldCheck className={access.has_password ? "h-4 w-4 text-success" : "h-4 w-4 text-warning"} />
                {access.has_password ? (access.must_change_password ? "Temporary password set; not changed yet." : "The employee has their own password.") : "No password yet: they cannot sign in."}
              </p>
            )}
            <Field
              id="emp-portal_password"
              label={isNew ? "Temporary password" : "Set a new password"}
              error={errors.portal_password}
              hint={
                isNew
                  ? "Optional. At least 8 characters with letters and digits; they choose their own at first sign-in."
                  : "Leave blank to keep the current one. A new password signs them out of other devices."
              }
            >
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  {input("portal_password", { type: showPassword ? "text" : "password", autoComplete: "new-password", maxLength: 72, className: "h-10 rounded-xl pr-10" })}
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted sm:right-1.5 sm:h-7 sm:w-7"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  aria-label="Generate a password"
                  onClick={() => {
                    set("portal_password", generatePassword());
                    setShowPassword(true);
                  }}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </Field>
          </SectionCard>

          <SectionCard title="Notes" icon={StickyNote} description="Internal. Not visible to the employee.">
            <Textarea id="emp-notes" value={values.notes} maxLength={2000} rows={5} onChange={(e) => set("notes", e.target.value)} className="rounded-xl" aria-label="Notes" />
          </SectionCard>

          {serverError && (
            <p role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
              {serverError}
            </p>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:sticky md:-mx-0 md:rounded-2xl md:border md:shadow-sm xl:col-span-2">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3">
            <p className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex" aria-live="polite">
              <span className={dirty ? "h-2 w-2 rounded-full bg-warning" : "h-2 w-2 rounded-full bg-muted-foreground/40"} aria-hidden />
              {dirty ? "You have unsaved changes." : isNew ? "Fill in the required fields to add this person." : "No changes yet."}
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => navigate(isNew ? "/employees" : `/employees/${id}`)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 sm:flex-none" disabled={save.isPending || (!isNew && !dirty)}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isNew ? "Add employee" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </form>

      <Dialog open={!!created} onOpenChange={(o) => !o && created && navigate(`/employees/${created.id}`, { replace: true })}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share the sign-in details</DialogTitle>
            <DialogDescription>This is the only time the temporary password is shown. Send it privately.</DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center">
                <p className="micro-label">Employee code</p>
                <p className="tabular mt-1 text-2xl font-bold tracking-wider text-primary">{created.code ?? "—"}</p>
              </div>
              <p className="rounded-xl bg-muted/60 p-3 text-[12px] leading-relaxed">{shareMessage}</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareMessage);
                  toast.success("Message copied");
                } catch {
                  toast.error("Copy failed. Select the text instead.");
                }
              }}
            >
              <Copy className="h-4 w-4" /> Copy message
            </Button>
            <Button onClick={() => created && navigate(`/employees/${created.id}`, { replace: true })}>Open profile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
