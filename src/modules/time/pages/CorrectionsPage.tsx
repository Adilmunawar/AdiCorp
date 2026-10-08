import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ClipboardCheck, Fingerprint, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, EmptyState, FilterBar, PageHeader, SectionCard, StatusBadge, TabsNav, formatDateTime, formatRelative, useTabParam, type DataColumn } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useCorrectionCounts, useCorrections, useDayPunches, useReviewCorrection } from "../api";
import { CORRECTION_KINDS, correctionKindLabel } from "../lib";
import type { CorrectionRow, CorrectionStatus } from "../types";
import { PersonCell } from "../components/shared";

const STATUSES: (CorrectionStatus | "all")[] = ["pending", "approved", "rejected", "withdrawn", "all"];
const LABEL: Record<CorrectionStatus | "all", string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn", all: "All" };

function times(r: Pick<CorrectionRow, "time_in" | "time_out">) {
  const t = (v: string | null) => (v ? v.slice(0, 5) : null);
  return [t(r.time_in) && `In ${t(r.time_in)}`, t(r.time_out) && `Out ${t(r.time_out)}`].filter(Boolean).join(" · ") || "—";
}

export default function CorrectionsPage() {
  const { isHR } = useAuth();
  const { data: counts } = useCorrectionCounts();
  const tabs = STATUSES.map((s) => ({ value: s, label: LABEL[s], badge: counts?.[s] || undefined }));
  const [status] = useTabParam(tabs);
  const { data: rows = [], isLoading } = useCorrections(status as CorrectionStatus | "all");
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<CorrectionRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.employees?.name ?? ""} ${r.employees?.employee_code ?? ""} ${r.reason}`.toLowerCase().includes(q));
  }, [rows, search]);

  const columns: DataColumn<CorrectionRow>[] = [
    {
      id: "name",
      header: "Employee",
      sortValue: (r) => r.employees?.name,
      hideOnCard: true,
      cell: (r) => <PersonCell name={r.employees?.name ?? "Former employee"} code={r.employees?.employee_code} sub={r.employees?.rank} avatarUrl={r.employees?.avatar_url} />,
    },
    { id: "date", header: "Day", sortValue: (r) => r.date, cell: (r) => <span className="whitespace-nowrap text-xs font-semibold">{format(parseISO(r.date), "EEE d MMM yyyy")}</span> },
    { id: "kind", header: "What happened", cell: (r) => <span className="text-xs">{correctionKindLabel(r.kind)}</span> },
    { id: "times", header: "Times", hideBelow: "md", cell: (r) => <span className="tabular whitespace-nowrap text-xs">{times(r)}</span> },
    {
      id: "reason",
      header: "Reason",
      hideBelow: "lg",
      cell: (r) => (
        <p className="line-clamp-2 max-w-xs text-xs text-muted-foreground" title={r.reason}>
          {r.reason}
        </p>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={r.status} />
          {/* Phone cards hide the actions column, so the HR note shows here instead. */}
          {r.review_note && <span className="line-clamp-2 text-[11px] text-muted-foreground sm:hidden">“{r.review_note}”</span>}
        </div>
      ),
    },
    {
      id: "created",
      header: "Asked",
      hideBelow: "md",
      sortValue: (r) => r.created_at,
      cell: (r) => (
        <time dateTime={r.created_at} title={formatDateTime(r.created_at)} className="whitespace-nowrap text-xs text-muted-foreground">
          {formatRelative(r.created_at)}
        </time>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      hideOnCard: true,
      cell: (r) =>
        r.status === "pending" && isHR ? (
          <Button size="sm" className="h-8 rounded-xl" onClick={(e) => { e.stopPropagation(); setReviewing(r); }}>
            Review
          </Button>
        ) : r.review_note ? (
          <span className="line-clamp-1 max-w-[12rem] text-[11px] text-muted-foreground" title={r.review_note}>
            “{r.review_note}”
          </span>
        ) : null,
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Punch corrections"
        eyebrow="Time"
        icon={ClipboardCheck}
        description="Employees ask from the portal when a punch is missing or wrong. Approving adds the punches and marks the day."
      >
        <TabsNav tabs={tabs} />
      </PageHeader>

      <SectionCard
        flush
        title={`${LABEL[status as CorrectionStatus | "all"]} requests`}
        description={
          isLoading
            ? "Loading requests…"
            : `${filtered.length} ${filtered.length === 1 ? "request" : "requests"}${search ? " match the search" : ""}${status === "pending" && filtered.length > 0 && isHR ? " · select one to review" : ""}`
        }
        actions={<FilterBar search={search} onSearchChange={setSearch} placeholder="Search name or reason" />}
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowId={(r) => r.id}
          loading={isLoading}
          pageSize={20}
          initialSort={{ column: "created", direction: "desc" }}
          onRowClick={(r) => r.status === "pending" && isHR && setReviewing(r)}
          mobileTitle={(r) => (
            <PersonCell
              name={r.employees?.name ?? "Former employee"}
              code={r.employees?.employee_code}
              avatarUrl={r.employees?.avatar_url}
              trailing={
                r.status === "pending" && isHR ? (
                  <Button size="sm" className="ml-auto h-9 shrink-0 rounded-xl" onClick={(e) => { e.stopPropagation(); setReviewing(r); }}>
                    Review
                  </Button>
                ) : undefined
              }
            />
          )}
          empty={
            <EmptyState
              compact
              icon={ClipboardCheck}
              title={status === "pending" ? "Nothing waiting" : "No requests here"}
              description={status === "pending" ? "When someone misses a punch they can ask for a correction from the employee portal; it will appear here." : "No requests match this view."}
            />
          }
        />
      </SectionCard>

      <ReviewDialog correction={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}

function ReviewDialog({ correction, onClose }: { correction: CorrectionRow | null; onClose: () => void }) {
  const review = useReviewCorrection();
  const { data: punches = [], isLoading } = useDayPunches(correction?.employee_id ?? null, correction?.date ?? null);
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setTimeIn(correction?.time_in?.slice(0, 5) ?? "");
    setTimeOut(correction?.time_out?.slice(0, 5) ?? "");
    setNote("");
  }, [correction]);

  if (!correction) return null;
  const kind = CORRECTION_KINDS.find((k) => k.value === correction.kind);
  // Same rules the server applies: a wrong time needs at least one of the two.
  const wrongTime = correction.kind === "wrong_time";
  const missingIn = wrongTime ? !timeIn && !timeOut : !!kind?.needsIn && !timeIn;
  const missingOut = wrongTime ? false : !!kind?.needsOut && !timeOut;
  const outBeforeIn = correction.kind === "missed_both" && !!timeIn && !!timeOut && timeOut <= timeIn;
  const canApprove = !missingIn && !missingOut && !outBeforeIn;
  const act = async (decision: "approve" | "reject") => {
    try {
      await review.mutateAsync({ id: correction.id, decision, timeIn: kind?.needsIn ? timeIn : null, timeOut: kind?.needsOut ? timeOut : null, note });
      onClose();
    } catch {
      // The mutation already shows an error toast; keep the dialog open so HR can retry.
    }
  };

  return (
    <Dialog open={!!correction} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review punch correction</DialogTitle>
          <DialogDescription>
            {correction.employees?.name ?? "Former employee"} · {format(parseISO(correction.date), "EEEE d MMMM yyyy")} · {kind?.label ?? correctionKindLabel(correction.kind)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="micro-label mb-1">Their reason</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{correction.reason}</p>
          </div>

          <div>
            <p className="micro-label mb-1.5 flex items-center gap-1.5">
              <Fingerprint className="h-3 w-3" aria-hidden /> What the time clocks recorded
            </p>
            {isLoading ? (
              <div className="flex gap-1.5" aria-busy="true">
                <Skeleton className="h-7 w-24 rounded-lg" />
                <Skeleton className="h-7 w-24 rounded-lg" />
              </div>
            ) : punches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No punches that day.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {punches.map((p, i) => (
                  // Two terminals can record the same second: the time alone is not a unique key.
                  <li key={`${p.punch_at}-${i}`} className="tabular rounded-lg border border-border bg-card px-2 py-1 text-xs">
                    <b>{p.local_time.slice(0, 5)}</b> <span className="text-muted-foreground">{p.direction !== "unknown" ? p.direction.toUpperCase() : ""} {p.device ?? (p.source === "correction" ? "Correction" : "")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {kind?.needsIn && (
              <div className="space-y-1.5">
                <Label htmlFor="rv-in">Arrived at</Label>
                <Input id="rv-in" type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className="h-9 rounded-xl" aria-invalid={missingIn} required={!wrongTime} />
              </div>
            )}
            {kind?.needsOut && (
              <div className="space-y-1.5">
                <Label htmlFor="rv-out">Left at</Label>
                <Input id="rv-out" type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className="h-9 rounded-xl" aria-invalid={missingOut || outBeforeIn} required={!wrongTime} />
              </div>
            )}
          </div>

          {(missingIn || missingOut || outBeforeIn) && (
            <p className="-mt-2 text-xs text-danger" role="alert">
              {outBeforeIn
                ? "The leaving time must be after the arrival time."
                : wrongTime
                  ? "Enter the correct arrival or leaving time to approve."
                  : `Enter the ${missingIn && missingOut ? "arrival and leaving times" : missingIn ? "arrival time" : "leaving time"} to approve.`}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rv-note">Note to the employee (optional)</Label>
            <Textarea id="rv-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-xl" placeholder="Shown with the decision" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive" disabled={review.isPending} onClick={() => act("reject")}>
            <XCircle className="h-4 w-4" /> Reject
          </Button>
          <Button className="rounded-xl" disabled={review.isPending || !canApprove} onClick={() => act("approve")}>
            {review.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
