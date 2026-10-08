import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Banknote, Briefcase, Cake, CheckCircle2, CircleDashed, KeyRound, LogOut, PartyPopper, Phone, StickyNote, UserRound, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, SectionCard, Skeleton, StatusBadge, formatDate, formatDateTime, formatRelative, humanize } from "@/components/kit";
import { usePeopleContext, usePortalAccess, useRevokePortalSessions } from "../../api/employees";
import type { Employee } from "../../api/types";
import { COMPLETENESS_FIELDS, GENDER_OPTIONS, SHIFT_OPTIONS, fieldLabel, saturdayRule } from "../../lib/constants";
import { completeness, errorMessage, formatPhone, inDays, nextYearly, phoneHref, tenure, yearsSince } from "../../lib/utils";
import { InfoGrid, ProgressBar } from "../common";

const SATURDAY_VALUE = { company: "Company rule", off: "Off", working: "Working day" } as const;

/** A phone number as a tap-to-call link when it is dialable, plain text otherwise. */
function PhoneValue({ value }: { value: string | null }) {
  const text = formatPhone(value);
  if (!text) return null;
  const href = phoneHref(value);
  return href ? (
    <a className="tabular text-primary hover:underline" href={href}>
      {text}
    </a>
  ) : (
    <>{text}</>
  );
}

function maskAccount(value: string | null): string | null {
  if (!value) return null;
  const v = value.replace(/\s+/g, "");
  return v.length <= 4 ? v : `•••• ${v.slice(-4)}`;
}

export function OverviewTab({ employee, departmentName }: { employee: Employee; departmentName: string }) {
  const { isHR } = usePeopleContext();
  const { data: access } = usePortalAccess(employee.id);
  const revoke = useRevokePortalSessions();
  const comp = completeness(employee);
  const gender = GENDER_OPTIONS.find((g) => g.value === employee.gender)?.label ?? (employee.gender ? humanize(employee.gender) : null);
  const age = yearsSince(employee.date_of_birth);
  const active = employee.status === "active";
  const birthday = active ? nextYearly(employee.date_of_birth) : null;
  const anniversary = active ? nextYearly(employee.joining_date) : null;
  const upcoming: { key: string; icon: LucideIcon; title: string; days: number; detail: string }[] = [];
  if (birthday) upcoming.push({ key: "birthday", icon: Cake, title: "Birthday", days: birthday.days, detail: formatDate(birthday.date, "d MMMM") });
  if (anniversary && anniversary.years > 0) {
    upcoming.push({
      key: "anniversary",
      icon: PartyPopper,
      title: `${anniversary.years} ${anniversary.years === 1 ? "year" : "years"} at the company`,
      days: anniversary.days,
      detail: `Work anniversary · ${formatDate(anniversary.date, "d MMMM")}`,
    });
  }
  upcoming.sort((a, b) => a.days - b.days);
  const hasSide = comp.missing.length > 0 || upcoming.length > 0 || isHR;

  return (
    <div className={hasSide ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-4"}>
      <div className="min-w-0 space-y-4">
        <SectionCard title="Personal" icon={UserRound}>
          <InfoGrid
            columns={3}
            items={[
              { label: "Full name", value: employee.name },
              { label: "CNIC", value: employee.cnic ? <span className="tabular">{employee.cnic}</span> : null },
              { label: "Father's name", value: employee.father_name },
              {
                label: "Date of birth",
                value: employee.date_of_birth ? (
                  <>
                    {formatDate(employee.date_of_birth)}
                    {age !== null && age > 0 && <span className="font-normal text-muted-foreground"> · {age} years old</span>}
                  </>
                ) : null,
              },
              { label: "Gender", value: gender },
              { label: "Education", value: employee.education },
            ]}
          />
        </SectionCard>
        <SectionCard title="Contact" icon={Phone}>
          <InfoGrid
            columns={3}
            items={[
              { label: "Phone", value: employee.phone ? <PhoneValue value={employee.phone} /> : null },
              { label: "E-mail", value: employee.email ? <a className="text-primary hover:underline" href={`mailto:${employee.email}`}>{employee.email}</a> : null },
              { label: "Emergency contact", value: employee.emergency_contact ? <PhoneValue value={employee.emergency_contact} /> : null },
              { label: "Address", value: employee.address, wide: true },
            ]}
          />
        </SectionCard>
        <SectionCard title="Employment" icon={Briefcase}>
          <InfoGrid
            columns={3}
            items={[
              { label: "Employee code", value: employee.employee_code },
              { label: "Position", value: employee.rank },
              { label: "Department", value: departmentName || null },
              { label: "Joining date", value: formatDate(employee.joining_date) },
              { label: "Tenure", value: tenure(employee.joining_date, employee.separation_date) },
              { label: "Status", value: <StatusBadge status={employee.status} /> },
              ...(employee.separation_date ? [{ label: "Last working day", value: formatDate(employee.separation_date) }] : []),
              { label: "Shift", value: SHIFT_OPTIONS.find((s) => s.value === employee.shift_type)?.label ?? "Morning" },
              { label: "Saturday", value: SATURDAY_VALUE[saturdayRule(employee.weekend_saturday)] },
              { label: "Hours per day", value: `${employee.working_hours_per_day ?? 8} hours` },
            ]}
          />
        </SectionCard>
        <SectionCard title="Bank" icon={Banknote} description="Used by Finance to pay the salary.">
          <InfoGrid
            items={[
              { label: "Bank", value: employee.bank_name },
              { label: "Account number", value: maskAccount(employee.bank_account_number) },
            ]}
          />
        </SectionCard>
        {isHR && employee.notes && (
          <SectionCard title="Notes" icon={StickyNote} description="Internal">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{employee.notes}</p>
          </SectionCard>
        )}
      </div>

      <div className={hasSide ? "min-w-0 space-y-4" : "hidden"}>
        {/* The header already shows 100%; the checklist only earns its space while something is missing. */}
        {comp.missing.length > 0 && (
          <SectionCard title="Profile completeness" icon={CheckCircle2}>
            <div className="flex items-center justify-between">
              <span className="tabular font-display text-2xl font-semibold tracking-tight">{Math.round(comp.ratio * 100)}%</span>
              <span className="text-[11px] text-muted-foreground">
                {COMPLETENESS_FIELDS.length - comp.missing.length} of {COMPLETENESS_FIELDS.length} details
              </span>
            </div>
            <ProgressBar value={comp.ratio} tone={comp.ratio >= 1 ? "success" : comp.ratio >= 0.5 ? "primary" : "warning"} className="mt-2" />
            <ul className="mt-3 space-y-1.5">
              {[...COMPLETENESS_FIELDS].sort((a, b) => Number(comp.missing.includes(b)) - Number(comp.missing.includes(a))).map((f) => {
                const missing = comp.missing.includes(f);
                return (
                  <li key={f} className="flex items-center gap-2 text-[12px]">
                    {missing ? <CircleDashed className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Missing" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-label="On file" />}
                    <span className={missing ? "text-foreground" : "text-muted-foreground"}>{fieldLabel(f)}</span>
                    {missing && <span className="ml-auto text-[11px] font-medium text-warning">Missing</span>}
                  </li>
                );
              })}
            </ul>
            {isHR && comp.missing.length > 0 && (
              <Button size="sm" variant="soft" className="mt-3 w-full" asChild>
                <Link to={`/employees/${employee.id}/edit`}>Fill in the missing details</Link>
              </Button>
            )}
          </SectionCard>
        )}

        {upcoming.length > 0 && (
          <SectionCard title="Coming up" icon={PartyPopper}>
            <ul className="space-y-3">
              {upcoming.map((u) => (
                <li key={u.key} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary ring-1 ring-inset ring-primary/10">
                    <u.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{u.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{u.detail}</p>
                  </div>
                  <span className={u.days <= 7 ? "shrink-0 text-[12px] font-semibold text-primary" : "shrink-0 text-[12px] text-muted-foreground"}>
                    {inDays(u.days)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {isHR && (
          <SectionCard title="Portal access" icon={KeyRound}>
            {access ? (
              <div className="space-y-3">
                <StatusBadge
                  status={access.can_sign_in ? "active" : "disabled"}
                  label={access.can_sign_in ? (access.must_change_password ? "Temporary password" : "Can sign in") : access.has_password ? "Sign-in disabled" : "No password yet"}
                />
                <InfoGrid
                  columns={2}
                  items={[
                    {
                      label: "Last seen",
                      value: access.last_seen_at ? <span title={formatDateTime(access.last_seen_at)}>{formatRelative(access.last_seen_at)}</span> : "Not recorded yet",
                    },
                    { label: "Active devices", value: access.active_sessions },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  {active && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/employees/${employee.id}/edit#portal`}>{access.has_password ? "Reset password" : "Set password"}</Link>
                    </Button>
                  )}
                  {access.active_sessions > 0 && (
                    <ConfirmButton
                      size="sm"
                      title="Sign out of every device?"
                      description={`${employee.name} will need to sign in again on every phone and computer.`}
                      confirmLabel="Sign out"
                      onConfirm={async () => {
                        try {
                          const n = await revoke.mutateAsync(employee.id);
                          toast.success(`Signed out of ${n} device${n === 1 ? "" : "s"}`);
                        } catch (e) {
                          toast.error(errorMessage(e));
                          throw e;
                        }
                      }}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </ConfirmButton>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-5 w-28 rounded-full" />
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}
