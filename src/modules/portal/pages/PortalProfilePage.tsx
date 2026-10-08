import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, Banknote, Briefcase, Clock3, Contact, Eye, EyeOff, History, PencilLine, RefreshCw, User, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CardSkeleton,
  ConfirmButton,
  EmptyState,
  PageHeader,
  SectionCard,
  Skeleton,
  StatusBadge,
  formatDate,
  formatRelative,
  humanize,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  EDITABLE_FIELDS,
  FIELD_LABELS,
  usePortalProfile,
  useProfileRequests,
  useWithdrawProfileRequest,
  type EditableField,
  type PortalProfile,
  type ProfileRequest,
} from "../api";
import { AvatarUploader } from "../components/AvatarUploader";
import { ProfileEditSheet } from "../components/ProfileEditSheet";

/* ------------------------------------------------------------------ */
/* Facts grid                                                          */
/* ------------------------------------------------------------------ */

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="micro-label">{label}</dt>
      <dd className={cn("mt-1 break-words text-sm font-semibold", empty && "font-medium text-muted-foreground/70")}>{empty ? "Not added" : children}</dd>
    </div>
  );
}

function FactsCard({ title, icon, children, actions }: { title: string; icon: LucideIcon; children: ReactNode; actions?: ReactNode }) {
  return (
    <SectionCard title={title} icon={icon} actions={actions}>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </SectionCard>
  );
}

function maskAccount(value: string | null): string | null {
  if (!value) return null;
  const v = value.replace(/\s/g, "");
  return v.length <= 4 ? v : `•••• ${v.slice(-4)}`;
}

function maskCnic(value: string | null): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, "");
  if (d.length !== 13) return value;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

const SATURDAY_PATTERN_LABEL: Record<string, string> = {
  alt_2_4: "2nd & 4th Saturdays",
  alt_1_3_5: "1st, 3rd & 5th Saturdays",
};

function weekendText(p: PortalProfile): string | null {
  if (p.weekend_saturday == null && p.weekend_sunday == null) return null;
  const saturday = p.weekend_saturday ? SATURDAY_PATTERN_LABEL[p.saturday_pattern ?? ""] ?? "Saturday" : null;
  const days = [saturday, p.weekend_sunday ? "Sunday" : null].filter(Boolean);
  return days.length ? days.join(" and ") : "No fixed weekend";
}

/* ------------------------------------------------------------------ */
/* Change requests                                                     */
/* ------------------------------------------------------------------ */

function displayValue(field: EditableField, value: string): string {
  if (field === "date_of_birth") return formatDate(value);
  if (field === "gender") return humanize(value);
  if (field === "bank_account_number") return maskAccount(value) ?? value;
  return value;
}

function RequestRow({ req }: { req: ProfileRequest }) {
  const withdraw = useWithdrawProfileRequest();
  const fields = EDITABLE_FIELDS.filter((f) => req.requested_changes?.[f] !== undefined);
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={req.status} label={req.status === "rejected" ? "Declined" : humanize(req.status)} />
          <span className="text-[11px] text-muted-foreground">
            Sent {formatRelative(req.created_at)}
            {req.reviewed_at && ` · reviewed ${formatRelative(req.reviewed_at)}`}
          </span>
        </div>
        {req.status === "pending" && (
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="h-7 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-destructive"
            disabled={withdraw.isPending}
            title="Withdraw this request?"
            description="HR will no longer see it. You can send a new request at any time."
            confirmLabel="Withdraw"
            onConfirm={async () => {
              try {
                await withdraw.mutateAsync(req.id);
                toast.success("Request withdrawn");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not withdraw the request");
              }
            }}
          >
            Withdraw
          </ConfirmButton>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <li key={f} className="max-w-full truncate rounded-lg border border-border bg-muted/40 px-2 py-1 text-[11px]">
            <span className="text-muted-foreground">{FIELD_LABELS[f]}:</span> <span className="font-semibold">{displayValue(f, String(req.requested_changes[f]))}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function RequestsCard() {
  const { data, isPending } = useProfileRequests();
  if (isPending) return <CardSkeleton lines={2} />;
  if (!data || data.length === 0) return null;
  return (
    <SectionCard title="Change requests" description="What you asked HR to update" icon={History} flush>
      <ul className="divide-y divide-border/60">
        {data.map((r) => (
          <RequestRow key={r.id} req={r} />
        ))}
      </ul>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={2} />
      </div>
    </div>
  );
}

/** My profile: photo, personal, contact, employment and bank facts; change requests to HR. */
export default function PortalProfilePage() {
  const { data: p, isPending, isError, error, refetch, isFetching } = usePortalProfile();
  const { data: requests } = useProfileRequests();
  const [editing, setEditing] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const pending = useMemo(() => requests?.find((r) => r.status === "pending") ?? null, [requests]);

  if (isPending) return <ProfileSkeleton />;
  if (isError || !p) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="We couldn't load your profile"
        description={error instanceof Error ? error.message : "Please try again."}
        action={
          <Button variant="outline" className="rounded-xl" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        }
      />
    );
  }

  const editButton = (
    <Button className="h-9 gap-1.5 rounded-xl" onClick={() => setEditing(true)}>
      <PencilLine className="h-4 w-4" /> {pending ? "Edit my request" : "Request changes"}
    </Button>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader eyebrow="My portal" title="My profile" description="Your record as HR keeps it. Ask HR to correct anything that is out of date." icon={User} actions={editButton} />

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
        <div className="shrink-0">
          <AvatarUploader name={p.name} src={p.avatar_url} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold tracking-tight" title={p.name}>{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">{[p.rank, p.department].filter(Boolean).join(" · ") || "Employee"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.employee_code && <span className="tabular rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{p.employee_code}</span>}
            {p.status && <StatusBadge status={p.status} />}
            {p.joining_date && <span className="text-[11px] text-muted-foreground">Joined {formatDate(p.joining_date)}</span>}
          </div>
        </div>
      </section>

      {pending && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/5 p-3.5 text-xs">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p>
            <span className="font-semibold">Waiting for HR.</span> You asked to update {Object.keys(pending.requested_changes ?? {}).length} field{Object.keys(pending.requested_changes ?? {}).length === 1 ? "" : "s"}{" "}
            {formatRelative(pending.created_at)}. You'll be notified when it is reviewed.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <FactsCard title="Personal" icon={User}>
          <Fact label="Full name">{p.name}</Fact>
          <Fact label="Father's name">{p.father_name}</Fact>
          <Fact label="Date of birth">{p.date_of_birth ? formatDate(p.date_of_birth) : null}</Fact>
          <Fact label="Gender">{p.gender ? humanize(p.gender) : null}</Fact>
          <Fact label="CNIC">{maskCnic(p.cnic)}</Fact>
          <Fact label="Education">{p.education}</Fact>
        </FactsCard>

        <FactsCard title="Contact" icon={Contact}>
          <Fact label="Email">{p.email}</Fact>
          <Fact label="Phone">{p.phone}</Fact>
          <Fact label="Emergency contact" wide>
            {p.emergency_contact}
          </Fact>
          <Fact label="Address" wide>
            {p.address}
          </Fact>
        </FactsCard>

        <FactsCard title="Employment" icon={Briefcase}>
          <Fact label="Employee code">{p.employee_code}</Fact>
          <Fact label="Position">{p.rank}</Fact>
          <Fact label="Department">{p.department}</Fact>
          <Fact label="Joining date">{p.joining_date ? formatDate(p.joining_date) : null}</Fact>
          <Fact label="Shift">{p.shift_type ? humanize(p.shift_type) : null}</Fact>
          <Fact label="Hours per day">{p.working_hours_per_day ? `${p.working_hours_per_day} hours` : null}</Fact>
          <Fact label="Weekend" wide>
            {weekendText(p)}
          </Fact>
        </FactsCard>

        <FactsCard
          title="Bank"
          icon={Banknote}
          actions={
            p.bank_account_number ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 rounded-lg px-2 text-[11px]"
                onClick={() => setShowBank((s) => !s)}
                aria-pressed={showBank}
              >
                {showBank ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showBank ? "Hide" : "Show"}
              </Button>
            ) : undefined
          }
        >
          <Fact label="Bank name">{p.bank_name}</Fact>
          <Fact label="Account number / IBAN">
            {p.bank_account_number ? <span className="tabular">{showBank ? p.bank_account_number : maskAccount(p.bank_account_number)}</span> : null}
          </Fact>
        </FactsCard>
      </div>

      <RequestsCard />

      <ProfileEditSheet open={editing} onOpenChange={setEditing} profile={p} pending={pending?.requested_changes ?? null} />
    </div>
  );
}
