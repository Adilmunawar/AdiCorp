import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  LogIn,
  Minus,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserPlus,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { roleLabel, useAuth } from "@/context/AuthContext";
import { useMediaBelow } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  RowActions,
  SectionCard,
  StatGrid,
  StatTile,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  initials,
  type DataColumn,
  type RowAction,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import type { Role } from "@/modules/types";
import { MfaGate } from "../mfa";
import { adminUsers, platformKeys, useAccessSummary, useStaffUsers, type StaffUser } from "../api";
import { CONTROL, CONTROL_BUTTON, Field } from "../components/form";

const ROLE_HELP: { role: Role; title: string; text: string }[] = [
  { role: "owner", title: "Owner", text: "Everything, including pay, settings, backups and who has access." },
  { role: "hr", title: "HR Manager", text: "People, attendance, leave, approvals, engagement, policies, letters, assets and hiring. Never sees salaries, payslips or payments." },
  { role: "finance", title: "Finance", text: "Payroll, salaries, tax and pay rules, overtime pricing, expense payments and finance reports, with a read-only view of employees." },
];

/*
 * What each staff role can open, mirroring the route roles in the module manifests and the
 * database rules (HR never sees money; Finance sees employees read-only).
 */
type Access = "full" | "none" | { kind: "partial" | "view"; note: string };
const STAFF_ROLES: Role[] = ["owner", "hr", "finance"];
const PERMISSIONS: { area: string; detail?: string; access: Record<"owner" | "hr" | "finance", Access> }[] = [
  { area: "Employees", detail: "Profiles, job details and contacts", access: { owner: "full", hr: "full", finance: { kind: "view", note: "Read-only" } } },
  { area: "Departments, documents, onboarding and assets", access: { owner: "full", hr: "full", finance: "none" } },
  { area: "Attendance, hours and calendar", access: { owner: "full", hr: "full", finance: "none" } },
  { area: "Leave and overtime hours", access: { owner: "full", hr: "full", finance: "none" } },
  { area: "Announcements, polls, messages and complaints", access: { owner: "full", hr: "full", finance: "none" } },
  { area: "Policies and HR letters", access: { owner: "full", hr: "full", finance: "none" } },
  { area: "Hiring", detail: "Jobs and applicants", access: { owner: "full", hr: "full", finance: "none" } },
  { area: "Course and expense requests", detail: "Approving what employees ask for", access: { owner: "full", hr: "full", finance: "none" } },
  { area: "Expenses, payments and receipts", access: { owner: "full", hr: "none", finance: "full" } },
  { area: "Payroll, salaries and payslips", access: { owner: "full", hr: "none", finance: "full" } },
  { area: "Tax, pay rules and overtime pay", access: { owner: "full", hr: "none", finance: "full" } },
  { area: "Reports and timeline", access: { owner: "full", hr: { kind: "partial", note: "No pay" }, finance: "full" } },
  { area: "Settings", detail: "Company, working week, portal, letters", access: { owner: "full", hr: { kind: "partial", note: "No company or security" }, finance: "none" } },
  { area: "Users, two-step policy and full backups", access: { owner: "full", hr: "none", finance: "none" } },
];

function AccessCell({ access, role }: { access: Access; role: string }) {
  if (access === "full") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success-soft text-success" title={`${role}: full access`}>
        <Check className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Full access</span>
      </span>
    );
  }
  if (access === "none") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground/60" title={`${role}: no access`}>
        <Minus className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">No access</span>
      </span>
    );
  }
  const Icon = access.kind === "view" ? Eye : SlidersHorizontal;
  return (
    <span className="inline-flex flex-col items-center gap-0.5" title={`${role}: ${access.note}`}>
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-info-soft text-info">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="max-w-[88px] text-center text-[10px] font-medium leading-3 text-muted-foreground">{access.note}</span>
    </span>
  );
}

function PermissionsCard() {
  return (
    <SectionCard
      title="Roles and permissions"
      description="What each staff role can see and do. Employees use the portal and see only their own records."
      icon={ShieldCheck}
      flush
      footer={
        <ul className="grid gap-1.5 text-xs leading-5 text-muted-foreground md:grid-cols-2 md:gap-x-8">
          <li>Employees sign in to the portal with their CNIC and a password HR sets on their profile; they do not get staff accounts.</li>
          <li>A new role applies to what that person can open straight away; disabling an account stops them signing in again.</li>
          <li>The founder of the workspace always stays an owner, and you cannot change or disable your own account here.</li>
          <li>Every change to access is recorded on the timeline.</li>
        </ul>
      }
    >
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid gap-px border-b border-border/60 bg-border/60 sm:grid-cols-3 xl:grid-cols-1 xl:content-start xl:border-b-0 xl:border-r">
          {ROLE_HELP.map((r) => (
            <div key={r.role} className="bg-card px-4 py-3.5 sm:px-5">
              <RoleBadge role={r.role} />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-[13px]">
            <caption className="sr-only">Access by role</caption>
            <thead>
              <tr className="border-b border-border/70 bg-muted/30">
                <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:px-5">
                  Area
                </th>
                {STAFF_ROLES.map((r) => (
                  <th key={r} scope="col" className="w-[72px] px-1 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:w-[120px]">
                    {r === "hr" ? "HR" : roleLabel(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {PERMISSIONS.map((p) => (
                <tr key={p.area} className="transition-colors hover:bg-muted/30">
                  <th scope="row" className="px-4 py-2.5 font-normal sm:px-5">
                    <span className="block font-medium leading-5 text-foreground">{p.area}</span>
                    {p.detail && <span className="block text-xs leading-4 text-muted-foreground">{p.detail}</span>}
                  </th>
                  {STAFF_ROLES.map((r) => (
                    <td key={r} className="px-1 py-2.5 text-center align-middle">
                      <AccessCell access={p.access[r as "owner" | "hr" | "finance"]} role={roleLabel(r)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(length = 14): string {
  const bytes = new Uint32Array(length);
  for (;;) {
    crypto.getRandomValues(bytes);
    const pw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}

function passwordError(pw: string): string | null {
  if (pw.length < 8) return "At least 8 characters.";
  if (pw.length > 72) return "At most 72 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letters and digits.";
  return null;
}

function displayName(u: StaffUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Staff member";
}

function PersonCell({ user: u }: { user: StaffUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/10 text-[11px] font-bold text-primary">
        {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(displayName(u))}
      </span>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-5 text-foreground">
          <span className="truncate" title={displayName(u)}>
            {displayName(u)}
          </span>
          {u.is_self && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">You</span>}
          {u.is_creator && !u.is_self && <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">Founder</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={u.email ?? undefined}>
          {u.email ?? "No email"}
        </p>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role | null | undefined }) {
  if (!role) return <StatusBadge status="no_role" label="No role" tone="warning" />;
  return <StatusBadge status={role} label={roleLabel(role)} tone={role === "owner" ? "primary" : role === "finance" ? "info" : "default"} dot={false} />;
}

function copy(text: string, label = "Copied") {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(label),
    () => toast.error("Could not copy"),
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

function CredentialsNotice({ email, password }: { email: string; password: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-success/25 bg-success/[0.06] p-3">
      <p className="flex items-center gap-2 text-xs font-bold text-foreground">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Share these details privately
      </p>
      <dl className="grid gap-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="min-w-0 truncate font-semibold">{email}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Temporary password</dt>
          <dd className="flex items-center gap-1.5">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{password}</code>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg" aria-label="Copy password" onClick={() => copy(password, "Password copied")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </dd>
        </div>
      </dl>
      <p className="text-[11px] leading-4 text-muted-foreground">This password is shown only once. Ask them to change it under My account after signing in.</p>
    </div>
  );
}

function AddMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role: "hr" as Role, password: generatePassword() });
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [touched, setTouched] = useState(false);

  const reset = () => {
    setForm({ first_name: "", last_name: "", email: "", role: "hr", password: generatePassword() });
    setCreated(null);
    setTouched(false);
  };

  const errors = {
    first_name: form.first_name.trim() ? null : "Required.",
    last_name: form.last_name.trim() ? null : "Required.",
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) ? null : "Enter a valid email address.",
    password: passwordError(form.password),
  };
  const invalid = Object.values(errors).some(Boolean);

  const create = useMutation({
    mutationFn: () =>
      adminUsers<{ user: StaffUser }>({
        action: "create",
        email: form.email.trim().toLowerCase(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
      }),
    onSuccess: ({ user }) => {
      qc.setQueryData<StaffUser[]>(platformKeys.staff(companyId), (prev) => (prev ? [...prev, user] : [user]));
      void qc.invalidateQueries({ queryKey: platformKeys.staff(companyId) });
      void qc.invalidateQueries({ queryKey: platformKeys.access(companyId) });
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
      toast.success(`${form.first_name.trim()} can now sign in`, { description: `${roleLabel(form.role)} account created.` });
    },
    onError: (e: Error) => toast.error("Could not add the team member", { description: e.message }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (create.isPending) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>They sign in at the staff login with their email and the temporary password.</DialogDescription>
        </DialogHeader>
        {created ? (
          <CredentialsNotice email={created.email} password={created.password} />
        ) : (
          <form
            id="add-member"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!invalid) create.mutate();
            }}
          >
            <Field id="m-first" label="First name" required error={touched ? errors.first_name : null}>
              <Input id="m-first" value={form.first_name} maxLength={60} autoFocus onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className={CONTROL} />
            </Field>
            <Field id="m-last" label="Last name" required error={touched ? errors.last_name : null}>
              <Input id="m-last" value={form.last_name} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className={CONTROL} />
            </Field>
            <Field id="m-email" label="Work email" required error={touched ? errors.email : null} hint="They sign in with this address." className="sm:col-span-2">
              <Input id="m-email" type="email" autoComplete="off" value={form.email} maxLength={254} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={CONTROL} />
            </Field>
            <Field id="m-role" label="Role" hint={ROLE_HELP.find((r) => r.role === form.role)?.text} className="sm:col-span-2">
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
                <SelectTrigger id="m-role" className={CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hr">HR Manager</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="m-password" label="Temporary password" required error={touched ? errors.password : null} hint="At least 8 characters with letters and digits. They can change it after signing in." className="sm:col-span-2">
              <div className="flex gap-2">
                <Input
                  id="m-password"
                  value={form.password}
                  maxLength={72}
                  autoComplete="new-password"
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className={`${CONTROL} font-mono`}
                />
                <Button type="button" variant="outline" size="sm" className={CONTROL_BUTTON} onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>
                  <Wand2 /> New
                </Button>
              </div>
            </Field>
          </form>
        )}
        <DialogFooter className="gap-2">
          {created ? (
            <>
              <Button variant="outline" onClick={reset}>
                Add another
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" form="add-member" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Create account
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>(user?.role ?? "hr");
  const change = useMutation({
    mutationFn: () => adminUsers<{ user: StaffUser }>({ action: "set_role", user_id: user!.id, role }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: platformKeys.staff(companyId) });
      const prev = qc.getQueryData<StaffUser[]>(platformKeys.staff(companyId));
      qc.setQueryData<StaffUser[]>(platformKeys.staff(companyId), (list) => list?.map((u) => (u.id === user!.id ? { ...u, role } : u)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(platformKeys.staff(companyId), ctx.prev);
      toast.error("Could not change the role", { description: e.message });
    },
    onSuccess: () => {
      toast.success(`${user ? displayName(user) : "They"} is now ${roleLabel(role)}`, { description: "The new access applies straight away. They may need to reload AdiCorp to see it." });
      onClose();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.staff(companyId) });
      void qc.invalidateQueries({ queryKey: platformKeys.access(companyId) });
    },
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !change.isPending && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user?.role ? "Change role" : "Assign a role"}</DialogTitle>
          <DialogDescription>{user ? [displayName(user), user.email].filter(Boolean).join(" · ") : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ROLE_HELP.map((r) => (
            <label
              key={r.role}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                role === r.role ? "border-primary/40 bg-primary/[0.04]" : "border-border hover:bg-muted/40",
              )}
            >
              <input type="radio" name="role" value={r.role} checked={role === r.role} onChange={() => setRole(r.role)} className="mt-1 accent-[hsl(var(--primary))]" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-5">
                  {r.title}
                  {user?.role === r.role && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">Current</span>}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{r.text}</span>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={change.isPending}>
            Cancel
          </Button>
          <Button onClick={() => change.mutate()} disabled={change.isPending || role === user?.role}>
            {change.isPending ? <Loader2 className="animate-spin" /> : <UserCog />} Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword());
  const [done, setDone] = useState(false);
  const reset = useMutation({
    mutationFn: () => adminUsers<{ success: boolean }>({ action: "reset_password", user_id: user!.id, password }),
    onSuccess: () => {
      setDone(true);
      toast.success("Password reset", { description: "Share the new password with them privately." });
    },
    onError: (e: Error) => toast.error("Could not reset the password", { description: e.message }),
  });
  const err = passwordError(password);
  const close = () => {
    if (reset.isPending) return;
    onClose();
    setDone(false);
    setPassword(generatePassword());
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>{user ? `Set a new temporary password for ${displayName(user)}.` : ""}</DialogDescription>
        </DialogHeader>
        {done && user?.email ? (
          <CredentialsNotice email={user.email} password={password} />
        ) : (
          <Field id="reset-pw" label="New temporary password" required error={err} hint="Their old password stops working as soon as you reset it.">
            <div className="flex gap-2">
              <Input id="reset-pw" value={password} maxLength={72} onChange={(e) => setPassword(e.target.value)} className={`${CONTROL} font-mono`} />
              <Button type="button" variant="outline" size="sm" className={CONTROL_BUTTON} onClick={() => setPassword(generatePassword())}>
                <Wand2 /> New
              </Button>
            </div>
          </Field>
        )}
        <DialogFooter className="gap-2">
          {done ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={reset.isPending}>
                Cancel
              </Button>
              <Button onClick={() => reset.mutate()} disabled={reset.isPending || !!err}>
                {reset.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Reset password
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function UsersBody() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const staff = useStaffUsers();
  const access = useAccessSummary();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [adding, setAdding] = useState(false);
  const [roleFor, setRoleFor] = useState<StaffUser | null>(null);
  const [resetFor, setResetFor] = useState<StaffUser | null>(null);
  // On phones the stat tiles are narrow: drop their icons so labels and hints are not cut off.
  const phone = useMediaBelow(640);

  const toggle = useMutation({
    mutationFn: (u: StaffUser) => adminUsers<{ user: StaffUser }>({ action: u.disabled ? "enable" : "disable", user_id: u.id }),
    onMutate: async (u) => {
      await qc.cancelQueries({ queryKey: platformKeys.staff(companyId) });
      const prev = qc.getQueryData<StaffUser[]>(platformKeys.staff(companyId));
      qc.setQueryData<StaffUser[]>(platformKeys.staff(companyId), (list) => list?.map((x) => (x.id === u.id ? { ...x, disabled: !u.disabled } : x)));
      return { prev };
    },
    onError: (e: Error, _u, ctx) => {
      if (ctx?.prev) qc.setQueryData(platformKeys.staff(companyId), ctx.prev);
      toast.error("Could not update the account", { description: e.message });
    },
    onSuccess: (_d, u) => toast.success(u.disabled ? `${displayName(u)} can sign in again` : `${displayName(u)} is disabled`, { description: u.disabled ? undefined : "They can no longer sign in." }),
    onSettled: () => void qc.invalidateQueries({ queryKey: platformKeys.staff(companyId) }),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff.data ?? []).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && u.disabled) return false;
      if (statusFilter === "disabled" && !u.disabled) return false;
      if (!q) return true;
      return [displayName(u), u.email ?? "", roleLabel(u.role)].join(" ").toLowerCase().includes(q);
    });
  }, [staff.data, search, roleFilter, statusFilter]);

  const counts = useMemo(() => {
    const list = staff.data ?? [];
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      total: list.length,
      active: list.filter((u) => !u.disabled).length,
      disabled: list.filter((u) => u.disabled).length,
      noRole: list.filter((u) => !u.role).length,
      thisWeek: list.filter((u) => !u.disabled && u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= weekAgo).length,
      never: list.filter((u) => !u.disabled && !u.last_sign_in_at).length,
      byRole: (r: Role) => list.filter((u) => u.role === r).length,
    };
  }, [staff.data]);

  const renderActions = (u: StaffUser) => {
    if (u.is_self) {
      return (
        <Button asChild variant="outline" size="sm" className="h-10 text-xs sm:h-9">
          <Link to="/account">My account</Link>
        </Button>
      );
    }
    const actions: RowAction[] = [
      { label: u.role ? "Change role" : "Assign a role", icon: UserCog, onSelect: () => setRoleFor(u), hidden: u.is_creator },
      { label: "Reset password", icon: KeyRound, onSelect: () => setResetFor(u) },
      u.disabled
        ? // No confirm step: mutate (not mutateAsync) so a failure is only the error toast, not an unhandled rejection.
          { label: "Enable account", icon: CheckCircle2, onSelect: () => toggle.mutate(u), separated: true }
        : {
            label: "Disable account",
            icon: Ban,
            destructive: true,
            separated: true,
            hidden: u.is_creator,
            onSelect: () => toggle.mutateAsync(u),
            confirm: {
              title: `Disable ${displayName(u)}?`,
              description: "They cannot sign in until you enable the account again. Their history stays.",
              confirmLabel: "Disable",
            },
          },
    ];
    return <RowActions actions={actions} label={`Actions for ${displayName(u)}`} />;
  };

  const columns: DataColumn<StaffUser>[] = [
    {
      id: "name",
      header: "Person",
      sortValue: (u) => displayName(u).toLowerCase(),
      cell: (u) => <PersonCell user={u} />,
      hideOnCard: true,
    },
    { id: "role", header: "Role", sortValue: (u) => u.role ?? "", cell: (u) => <RoleBadge role={u.role} /> },
    { id: "status", header: "Status", sortValue: (u) => (u.disabled ? 1 : 0), cell: (u) => <StatusBadge status={u.disabled ? "disabled" : "active"} /> },
    {
      id: "last",
      header: "Last sign-in",
      hideBelow: "md",
      sortValue: (u) => u.last_sign_in_at ?? "",
      cell: (u) =>
        u.last_sign_in_at ? (
          <span className="whitespace-nowrap" title={formatDateTime(u.last_sign_in_at)}>
            {formatRelative(u.last_sign_in_at)}
          </span>
        ) : (
          <span className="whitespace-nowrap text-muted-foreground">Not yet</span>
        ),
    },
    {
      id: "created",
      header: "Added",
      hideBelow: "lg",
      sortValue: (u) => u.created_at,
      cell: (u) => (
        <span className="whitespace-nowrap text-muted-foreground" title={formatDateTime(u.created_at)}>
          {formatDate(u.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: renderActions,
      hideOnCard: true,
    },
  ];

  const a = access.data;
  const accessHint = access.isError ? "Not available right now" : undefined;
  const staffHint = staff.data
    ? [
        counts.byRole("owner") && `${counts.byRole("owner")} owner`,
        counts.byRole("hr") && `${counts.byRole("hr")} HR`,
        counts.byRole("finance") && `${counts.byRole("finance")} Finance`,
        counts.noRole && `${counts.noRole} without a role`,
        counts.disabled && `${counts.disabled} disabled`,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  const mfaTotal = a ? a.staff.owner + a.staff.hr + a.staff.finance : 0;
  const filtered = !!search || roleFilter !== "all" || statusFilter !== "all";
  const withTitle = (text: string | undefined) => (text ? <span title={text}>{text}</span> : undefined);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users & access"
        description="Staff accounts, their roles, and who can sign in to AdiCorp and the employee portal."
        icon={Users}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 px-0 sm:h-9 sm:w-9"
              onClick={() => void staff.refetch()}
              disabled={staff.isFetching}
              aria-label="Refresh the list"
              title="Refresh"
            >
              <RefreshCcw className={staff.isFetching ? "animate-spin" : undefined} />
            </Button>
            <Button size="sm" className="h-10 flex-1 sm:h-9 sm:flex-none" onClick={() => setAdding(true)}>
              <UserPlus /> Add team member
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <StatGrid columns={4}>
          <StatTile
            label="Staff accounts"
            value={staff.data ? formatNumber(counts.total, 0) : "—"}
            loading={staff.isPending}
            icon={phone ? undefined : Users}
            tone={counts.noRole ? "warning" : "default"}
            hint={withTitle(staffHint)}
          />
          <StatTile
            label="Active this week"
            value={staff.data ? formatNumber(counts.thisWeek, 0) : "—"}
            loading={staff.isPending}
            icon={phone ? undefined : LogIn}
            hint={withTitle(staff.data ? (counts.never ? `${counts.never} not signed in yet` : "Everyone has signed in") : undefined)}
          />
          <StatTile
            label="2-step verification"
            value={a ? `${a.staff.with_mfa} of ${mfaTotal}` : "—"}
            loading={access.isPending}
            icon={phone ? undefined : ShieldCheck}
            tone={a ? (mfaTotal > 0 && a.staff.with_mfa === mfaTotal ? "success" : a.require_staff_mfa ? "warning" : "default") : "default"}
            hint={withTitle(a ? (a.require_staff_mfa ? "Required for all staff" : "Optional · change in Settings") : accessHint)}
            href="/settings?tab=security"
          />
          <StatTile
            label="Employee portal"
            value={a ? `${a.portal.with_password} of ${a.portal.active_employees}` : "—"}
            loading={access.isPending}
            icon={phone ? undefined : KeyRound}
            tone={a?.portal.without_password ? "warning" : "default"}
            hint={withTitle(
              a ? (a.portal.without_password ? `${a.portal.without_password} without a password` : `${a.portal.signed_in_7_days} signed in this week`) : accessHint,
            )}
          />
        </StatGrid>

        <SectionCard
          title={staff.data ? `Team · ${formatNumber(filtered ? rows.length : counts.total, 0)}${filtered ? ` of ${formatNumber(counts.total, 0)}` : ""}` : "Team"}
          description="People who sign in at the staff login"
          flush
          actions={
            <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name or email" className="w-full sm:w-auto">
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
                <SelectTrigger className="h-10 w-[150px] rounded-xl text-xs sm:h-9" aria-label="Filter by role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles ({counts.total})</SelectItem>
                  <SelectItem value="owner">Owner ({counts.byRole("owner")})</SelectItem>
                  <SelectItem value="hr">HR Manager ({counts.byRole("hr")})</SelectItem>
                  <SelectItem value="finance">Finance ({counts.byRole("finance")})</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="h-10 w-[140px] rounded-xl text-xs sm:h-9" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status ({counts.total})</SelectItem>
                  <SelectItem value="active">Active ({counts.active})</SelectItem>
                  <SelectItem value="disabled">Disabled ({counts.disabled})</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar>
          }
        >
          {staff.isError ? (
            <EmptyState
              icon={Users}
              title="The team list could not load"
              description={staff.error instanceof Error ? staff.error.message : "Please try again."}
              action={
                <Button size="sm" onClick={() => void staff.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              getRowId={(u) => u.id}
              loading={staff.isPending}
              pageSize={25}
              initialSort={{ column: "name" }}
              caption="Staff accounts"
              rowClassName={(u) => (u.disabled ? "opacity-70" : undefined)}
              mobileTitle={(u) => (
                <div className="flex items-start justify-between gap-2">
                  <PersonCell user={u} />
                  <div className="shrink-0">{renderActions(u)}</div>
                </div>
              )}
              empty={
                filtered ? (
                  <EmptyState
                    compact
                    icon={Users}
                    title="No one matches these filters"
                    description="Try another name, role or status."
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSearch("");
                          setRoleFilter("all");
                          setStatusFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    compact
                    icon={UserPlus}
                    title="Only you so far"
                    description="Add HR and Finance so each person has their own sign-in and a role that fits their work."
                    action={
                      <Button size="sm" onClick={() => setAdding(true)}>
                        <UserPlus /> Add team member
                      </Button>
                    }
                  />
                )
              }
            />
          )}
        </SectionCard>

        <PermissionsCard />
      </div>

      <AddMemberDialog open={adding} onOpenChange={setAdding} />
      <RoleDialog key={roleFor?.id ?? "none"} user={roleFor} onClose={() => setRoleFor(null)} />
      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
    </>
  );
}

export default function UsersPage() {
  return (
    <MfaGate>
      <UsersBody />
    </MfaGate>
  );
}
