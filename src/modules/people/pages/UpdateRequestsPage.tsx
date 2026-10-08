import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, CheckCheck, Clock3, Inbox, Loader2, MessageSquareText, UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState, FilterBar, ListSkeleton, PageHeader, SectionCard, StatusBadge, TabsNav, formatDate, formatDateTime, formatRelative, useTabParam, type TabItem } from "@/components/kit";
import { differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useEmployees, useStaffNames } from "../api/employees";
import { useReviewUpdateRequest, useUpdateRequests } from "../api/updates";
import type { Employee, UpdateRequest } from "../api/types";
import { GENDER_OPTIONS, SHIFT_OPTIONS, fieldLabel } from "../lib/constants";
import { errorMessage, formatPhone, matchesSearch } from "../lib/utils";
import { EmployeeChip } from "../components/common";

const REVIEWABLE = new Set(["phone", "email", "date_of_birth", "father_name", "emergency_contact", "address", "gender", "education", "bank_name", "bank_account_number"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Readable value: formatted phones and dates, labels for codes, a thumbnail for a photo. */
function display(field: string, value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") return <span className="font-normal italic text-muted-foreground">Not set</span>;
  const s = String(value);
  if (field === "avatar_url") {
    return /^https:\/\//.test(s) ? (
      <a href={s} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-primary" title="Open the new photo">
        <img src={s} alt="New profile photo" className="h-9 w-9 rounded-xl border border-border object-cover" loading="lazy" />
        <span className="text-[12px] font-medium">New photo</span>
      </a>
    ) : (
      "New photo"
    );
  }
  if (field === "phone" || field === "emergency_contact") return formatPhone(s);
  if (field === "gender") return GENDER_OPTIONS.find((g) => g.value === s)?.label ?? s;
  if (field === "shift_type") return SHIFT_OPTIONS.find((o) => o.value === s)?.label ?? s;
  if (ISO_DATE.test(s)) return formatDate(s);
  return s;
}

function maskAccount(value: string | null | undefined): string {
  const v = (value ?? "").replace(/\s+/g, "");
  if (!v) return "Not set";
  return v.length <= 4 ? v : `•••• ${v.slice(-4)}`;
}

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  partially_approved: "Partly approved",
  rejected: "Declined",
  cancelled: "Withdrawn",
  pending: "Pending",
};

function RequestCard({ request, employee, reviewer }: { request: UpdateRequest; employee?: Employee; reviewer?: string }) {
  const review = useReviewUpdateRequest();
  const fields = Object.keys(request.requested_changes ?? {});
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(fields.filter((f) => REVIEWABLE.has(f))));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const pending = request.status === "pending";

  const submit = async (approved: string[], kind: "approve" | "decline") => {
    setBusy(kind);
    try {
      const res = await review.mutateAsync({ id: request.id, approved, note });
      toast.success(STATUS_LABEL[res.status] ?? "Reviewed", { description: `${employee?.name ?? "The employee"} has been notified.` });
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the review."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard flush>
      <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        {employee ? (
          <EmployeeChip id={employee.id} name={employee.name} avatar={employee.avatar_url} subtitle={[employee.employee_code, employee.rank].filter(Boolean).join(" · ")} />
        ) : (
          <span className="text-[13px] font-semibold text-muted-foreground">Former employee</span>
        )}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span title={formatDateTime(request.created_at)}>Sent {formatRelative(request.created_at)}</span>
          <StatusBadge status={request.status ?? "pending"} label={STATUS_LABEL[request.status ?? "pending"] ?? "Pending"} />
        </div>
      </div>

      {request.note && (
        <p className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5 text-[12px] sm:px-5">
          <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{request.note}</span>
        </p>
      )}

      <ul className="divide-y divide-border/60">
        {fields.map((f) => {
          const allowed = REVIEWABLE.has(f);
          const decided = request.decisions?.[f];
          const current = employee ? (employee as unknown as Record<string, unknown>)[f] : undefined;
          return (
            <li key={f} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-4 py-3 sm:grid-cols-[auto_140px_minmax(0,1fr)] sm:px-5">
              {pending ? (
                // The padded wrapper gives the 16px box a 40px tap target without moving it.
                <label
                  htmlFor={`req-${request.id}-${f}`}
                  className={cn("-mx-3 -mb-3 -mt-2.5 flex h-10 w-10 items-center justify-center", allowed && "cursor-pointer")}
                >
                  <Checkbox
                    id={`req-${request.id}-${f}`}
                    checked={chosen.has(f)}
                    disabled={!allowed}
                    onCheckedChange={(v) =>
                      setChosen((s) => {
                        const next = new Set(s);
                        if (v === true) next.add(f);
                        else next.delete(f);
                        return next;
                      })
                    }
                    aria-label={`Approve ${fieldLabel(f)}`}
                  />
                </label>
              ) : decided === true ? (
                <Check className="mt-0.5 h-4 w-4 text-success" aria-label="Approved" />
              ) : (
                <X className="mt-0.5 h-4 w-4 text-destructive" aria-label="Declined" />
              )}
              <label
                htmlFor={pending && allowed ? `req-${request.id}-${f}` : undefined}
                className={cn("micro-label sm:pt-0.5", pending && allowed && "cursor-pointer")}
              >
                {fieldLabel(f)}
              </label>
              <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] sm:col-span-1">
                {pending && f !== "avatar_url" && (
                  <>
                    <span className="break-words text-muted-foreground line-through decoration-muted-foreground/40">{display(f, current)}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="changes to" />
                  </>
                )}
                <span className={cn("break-words font-semibold", !pending && decided === false && "text-muted-foreground line-through")}>
                  {/* Once reviewed, account numbers are history: keep only the last digits on screen. */}
                  {!pending && f === "bank_account_number" ? maskAccount(request.requested_changes[f]) : display(f, request.requested_changes[f])}
                </span>
                {pending && !allowed && <span className="w-full text-[11px] text-muted-foreground">Change this on the profile instead.</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {pending ? (
        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note to the employee (optional)" className="h-9 rounded-xl text-[13px]" aria-label="Note to the employee" />
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" className="flex-1 text-destructive hover:text-destructive sm:flex-none" onClick={() => submit([], "decline")} disabled={!!busy}>
              {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Decline all
            </Button>
            <Button size="sm" className="flex-1 sm:flex-none" onClick={() => submit([...chosen], "approve")} disabled={!!busy || chosen.size === 0}>
              {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              {chosen.size === fields.length ? "Approve all" : `Approve ${chosen.size}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[12px] sm:px-5">
          <p className="text-muted-foreground">
            {STATUS_LABEL[request.status ?? "pending"] ?? "Reviewed"}
            {reviewer ? ` by ${reviewer}` : ""}
            {request.reviewed_at && (
              <>
                {" · "}
                <span title={formatDateTime(request.reviewed_at)}>{formatRelative(request.reviewed_at)}</span>
              </>
            )}
          </p>
          {request.review_note && (
            <p className="flex items-start gap-2 text-foreground">
              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>{request.review_note}</span>
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

export default function UpdateRequestsPage() {
  const { data: requests = [], isLoading, isError, refetch } = useUpdateRequests();
  const { data: employees = [] } = useEmployees();
  const staff = useStaffNames();
  const [search, setSearch] = useState("");
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");
  const tabs: TabItem[] = [
    { value: "pending", label: "Waiting", badge: pending.length },
    { value: "reviewed", label: `Reviewed${reviewed.length ? ` (${reviewed.length})` : ""}` },
  ];
  const [tab] = useTabParam(tabs);
  const list = (tab === "pending" ? pending : reviewed).filter((r) => {
    const e = r.employee_id ? byId.get(r.employee_id) : undefined;
    return matchesSearch([e?.name, e?.employee_code], [e?.cnic], search);
  });
  const oldest = pending.length ? Math.max(...pending.map((r) => differenceInCalendarDays(new Date(), new Date(r.created_at)))) : 0;
  const summary = isLoading
    ? "Employees ask from the portal; you approve each field."
    : pending.length
      ? `${pending.length} ${pending.length === 1 ? "request is" : "requests are"} waiting${oldest > 0 ? `, the oldest for ${oldest} ${oldest === 1 ? "day" : "days"}` : ""}. Approved values update the profile at once.`
      : "Nothing is waiting. Employees ask from the portal; you approve each field and the profile updates at once.";

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader title="Profile updates" icon={UserCog} eyebrow="People" description={summary} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsNav tabs={tabs} />
        <FilterBar search={search} onSearchChange={setSearch} placeholder="Search by name or code…" />
      </div>
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <SectionCard>
          <EmptyState
            icon={Inbox}
            title="Could not load the requests"
            description="Check the connection and try again."
            compact
            action={
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : list.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={search ? Inbox : tab === "pending" ? CheckCheck : Clock3}
            title={search ? "No requests match this search" : tab === "pending" ? "You're all caught up" : "No reviewed requests yet"}
            description={
              search
                ? "Try another name or employee code."
                : tab === "pending"
                  ? "When an employee asks to update their phone, address or bank details, it shows up here."
                  : "Requests you approve or decline are kept here."
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.slice(0, 100).map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              employee={r.employee_id ? byId.get(r.employee_id) : undefined}
              reviewer={r.reviewed_by ? staff.get(r.reviewed_by) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
