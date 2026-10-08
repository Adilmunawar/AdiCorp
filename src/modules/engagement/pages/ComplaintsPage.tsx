import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, EyeOff, Loader2, MessageSquareWarning, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  StatGrid,
  StatTile,
  StatusBadge,
  TabsNav,
  formatDate,
  formatDateTime,
  formatRelative,
  useTabParam,
  type DataColumn,
} from "@/components/kit";
import { errorMessage, useComplaints, useRespondComplaint } from "../lib/api";
import type { ComplaintStatus, StaffComplaint } from "../lib/types";
import { ComplaintBadge, ComplaintProgress } from "../components/ComplaintProgress";
import { PersonAvatar } from "../components/PersonAvatar";
import { LoadError } from "../components/LoadError";
import { StaffExtras } from "../components/PageExtras";

const STATUS_ORDER: ComplaintStatus[] = ["pending", "investigating", "resolved"];
const TAB_VALUES = ["all", ...STATUS_ORDER] as const;

/**
 * An anonymous complaint keeps only its date, stored as midnight UTC of the company's date.
 * Read that calendar date as it is: shifted into a browser west of UTC it would show the day before.
 */
function anonymousDate(createdAt: string): string {
  return formatDate(/^\d{4}-\d{2}-\d{2}/.exec(createdAt)?.[0] ?? createdAt);
}

function Sender({ c }: { c: StaffComplaint }) {
  if (c.is_anonymous) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
          <EyeOff className="h-3 w-3" aria-hidden />
        </span>
        Anonymous
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <PersonAvatar name={c.employee_name} src={c.employee_avatar} size="xs" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{c.employee_name ?? "Former employee"}</span>
        {c.employee_rank && <span className="block truncate text-[10px] text-muted-foreground">{c.employee_rank}</span>}
      </span>
    </span>
  );
}

function ComplaintSheet({ complaint, onClose }: { complaint: StaffComplaint | null; onClose: () => void }) {
  const respond = useRespondComplaint();
  const [status, setStatus] = useState<ComplaintStatus>("pending");
  const [response, setResponse] = useState("");
  // Start from the saved values when a complaint is opened, not on every refetch of the list: a failed
  // save (or a reconnect) refetches complaints, and resetting then would wipe the response being written.
  const openId = complaint?.id ?? null;
  const [formFor, setFormFor] = useState<string | null>(null);
  if (openId !== formFor) {
    setFormFor(openId);
    if (complaint) {
      setStatus(complaint.status);
      setResponse(complaint.response ?? "");
    }
  }

  const dirty = !!complaint && (status !== complaint.status || response.trim() !== (complaint.response ?? "").trim());

  const save = async () => {
    if (!complaint) return;
    try {
      await respond.mutateAsync({ id: complaint.id, status, response });
      toast.success(complaint.is_anonymous ? "Saved. Anonymous complaints get no notification." : "Saved. The employee has been told.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Sheet open={!!complaint} onOpenChange={(open) => !open && !respond.isPending && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {complaint && (
          <>
            <SheetHeader className="border-b border-border/70 px-5 py-4 pr-12 text-left">
              <div className="flex flex-wrap items-center gap-1.5">
                <ComplaintBadge status={complaint.status} />
                {complaint.is_anonymous && <StatusBadge status="anonymous" label="Anonymous" tone="neutral" />}
              </div>
              <SheetTitle className="font-display text-base font-semibold leading-snug">{complaint.subject}</SheetTitle>
              <SheetDescription className="text-xs">
                Raised {complaint.is_anonymous ? `on ${anonymousDate(complaint.created_at)}` : formatDateTime(complaint.created_at)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-5 py-4">
              <ComplaintProgress status={complaint.status} />
              <section className="space-y-2">
                <p className="micro-label">From</p>
                <div className="flex items-center justify-between gap-3">
                  <Sender c={complaint} />
                  {!complaint.is_anonymous && complaint.employee_id && (
                    <Button asChild variant="outline" size="sm" className="h-8 rounded-xl text-xs">
                      <Link to={`/messages?employee=${complaint.employee_id}`}>Message them</Link>
                    </Button>
                  )}
                </div>
                {complaint.is_anonymous && (
                  <p className="flex items-start gap-1.5 rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Nothing in this complaint points back at the person: no name, and only the date it was sent. They are not notified of your response.
                  </p>
                )}
              </section>
              <section className="space-y-1.5">
                <p className="micro-label">What happened</p>
                <p className="whitespace-pre-wrap rounded-xl border border-border bg-muted/20 px-3.5 py-3 text-[13px] leading-relaxed">{complaint.description}</p>
              </section>
              <form
                className="space-y-3 rounded-2xl border border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div className="space-y-1.5">
                  <Label className="micro-label">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ComplaintStatus)}>
                    <SelectTrigger className="h-10 rounded-xl" aria-label="Status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="complaint-response" className="micro-label">
                    Response to the employee
                  </Label>
                  <Textarea
                    id="complaint-response"
                    value={response}
                    maxLength={2000}
                    rows={5}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder={complaint.is_anonymous ? "Notes on how this was handled (kept with the complaint)" : "What was done, and what happens next"}
                    className="rounded-xl text-[13px]"
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{response.length}/2000</p>
                  {complaint.responder_name && complaint.responded_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Last response by {complaint.responder_name}, {formatRelative(complaint.responded_at)}
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" className="rounded-xl" disabled={respond.isPending} onClick={onClose}>
                    Close
                  </Button>
                  <Button type="submit" className="rounded-xl" disabled={!dirty || respond.isPending}>
                    {respond.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function ComplaintsPage() {
  const { data, isPending, isError, error, refetch } = useComplaints();
  const [params, setParams] = useSearchParams();
  const counts = useMemo(() => {
    const out: Record<string, number> = { all: data?.length ?? 0, pending: 0, investigating: 0, resolved: 0 };
    for (const c of data ?? []) out[c.status] = (out[c.status] ?? 0) + 1;
    return out;
  }, [data]);
  const tabs = TAB_VALUES.map((v) => ({ value: v, label: v === "all" ? "All" : v[0].toUpperCase() + v.slice(1), badge: v === "pending" ? counts.pending : undefined }));
  const [tab] = useTabParam(tabs, "all");
  const [search, setSearch] = useState("");
  const openId = params.get("id");
  const open = (data ?? []).find((c) => c.id === openId) ?? null;

  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (data ?? []).filter((c) => {
      if (tab !== "all" && c.status !== tab) return false;
      if (!words.length) return true;
      const hay = `${c.subject} ${c.description} ${c.is_anonymous ? "" : c.employee_name ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [data, tab, search]);

  const setOpen = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("id", id);
        else next.delete("id");
        return next;
      },
      { replace: true },
    );

  const columns: DataColumn<StaffComplaint>[] = [
    {
      id: "subject",
      header: "Complaint",
      sortValue: (c) => c.subject,
      cell: (c) => (
        <div className="min-w-0 max-w-[420px]">
          <p className="truncate text-xs font-bold">{c.subject}</p>
          <p className="truncate text-[11px] text-muted-foreground">{c.description}</p>
        </div>
      ),
    },
    { id: "from", header: "From", cell: (c) => <Sender c={c} />, sortValue: (c) => (c.is_anonymous ? "" : c.employee_name), hideBelow: "md" },
    {
      id: "status",
      header: "Status",
      cell: (c) => <ComplaintBadge status={c.status} />,
      sortValue: (c) => STATUS_ORDER.indexOf(c.status),
    },
    {
      id: "response",
      header: "Response",
      hideBelow: "lg",
      cell: (c) =>
        c.response ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Responded
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">Not yet</span>
        ),
    },
    {
      id: "created",
      header: "Raised",
      align: "right",
      sortValue: (c) => c.created_at,
      cell: (c) => <span className="whitespace-nowrap text-[11px] text-muted-foreground">{c.is_anonymous ? anonymousDate(c.created_at) : formatRelative(c.created_at)}</span>,
    },
  ];

  return (
    <div>
      <StaffExtras />
      <PageHeader
        title="Complaints"
        eyebrow="Engagement"
        description="Concerns raised by employees, named or anonymous. Respond and track each one to resolution."
        icon={MessageSquareWarning}
      >
        <TabsNav tabs={tabs} />
      </PageHeader>

      <StatGrid columns={4} className="mb-4">
        <StatTile label="Pending" value={isError ? "—" : counts.pending} tone={counts.pending ? "warning" : "default"} icon={Clock} loading={isPending} />
        <StatTile label="Investigating" value={isError ? "—" : counts.investigating} tone={isError ? "default" : "primary"} icon={Search} loading={isPending} />
        <StatTile label="Resolved" value={isError ? "—" : counts.resolved} tone={isError ? "default" : "success"} icon={CheckCircle2} loading={isPending} />
        <StatTile label="Anonymous" value={isError ? "—" : (data ?? []).filter((c) => c.is_anonymous).length} icon={EyeOff} loading={isPending} />
      </StatGrid>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search subject, details or name…" className="mb-4" />

      {isError ? (
        <LoadError what="Complaints" error={error} icon={MessageSquareWarning} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          loading={isPending}
          onRowClick={(c) => setOpen(c.id)}
          caption="Complaints"
          empty={
            <EmptyState
              icon={MessageSquareWarning}
              title={(data ?? []).length ? "No complaints match" : "No complaints"}
              description={(data ?? []).length ? "Try another tab or search." : "When employees raise a concern from the portal, it shows up here."}
              compact
            />
          }
        />
      )}

      <ComplaintSheet complaint={open} onClose={() => setOpen(null)} />
    </div>
  );
}
