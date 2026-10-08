import { useMemo, useState } from "react";
import { Ban, Check, Download, Lock, RotateCcw, Plane, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  FilterBar,
  RowActions,
  SectionCard,
  StatusBadge,
  formatRelative,
  type DataColumn,
  type RowAction,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import { useCancelLeave, useReviewLeave, useUndoLeave } from "../api";
import { dayWord, leaveWhen, yearOptions } from "../lib";
import type { LeaveRequestRow, LeaveStatus } from "../types";
import { DecisionDialog, type Decision } from "./DecisionDialog";
import { FILTER_ROW, PersonCell, SegmentedFilter } from "./shared";

export type StatusFilter = LeaveStatus | "all";

interface Props {
  rows: LeaveRequestRow[];
  loading: boolean;
  /** Another year is loading; the old rows stay dimmed until it arrives. */
  refreshing?: boolean;
  year: number;
  onYearChange: (year: number) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  canDecide: boolean;
  onFile: () => void;
  /** CSV of the year's requests; the button is disabled when omitted. */
  onExport?: () => void;
}

export function RequestsPanel({ rows, loading, refreshing, year, onYearChange, status, onStatusChange, canDecide, onFile, onExport }: Props) {
  const [search, setSearch] = useState("");
  const [deciding, setDeciding] = useState<{ rows: LeaveRequestRow[]; initial: Decision } | null>(null);
  const review = useReviewLeave();
  const undo = useUndoLeave();
  const cancel = useCancelLeave();

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: rows.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    rows.forEach((r) => (c[r.status] += 1));
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!q || r.employee_name.toLowerCase().includes(q) || (r.employee_code ?? "").toLowerCase().includes(q) || r.type_name.toLowerCase().includes(q)),
    );
  }, [rows, search, status]);

  const decideMany = async (list: LeaveRequestRow[], decision: Decision, note: string) => {
    const pending = list.filter((r) => r.status === "pending");
    if (pending.length === 1) {
      await review.mutateAsync({ id: pending[0].id, decision, note });
      return;
    }
    let ok = 0;
    const failures: string[] = [];
    for (const r of pending) {
      try {
        await review.mutateAsync({ id: r.id, decision, note, silent: true });
        ok += 1;
      } catch {
        failures.push(r.employee_name);
      }
    }
    if (ok) toast.success(`${ok} ${ok === 1 ? "request" : "requests"} ${decision}.`);
    if (failures.length) throw new Error(`Not decided: ${failures.join(", ")}`);
  };

  const columns: DataColumn<LeaveRequestRow>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: (r) => <PersonCell name={r.employee_name} code={r.employee_code} avatarUrl={r.avatar_url} sub={r.department} employeeId={r.employee_id} />,
      sortValue: (r) => r.employee_name,
      hideOnCard: true,
    },
    {
      id: "type",
      header: "Type",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.type_name}</p>
          <p className="text-[11px] text-muted-foreground">{r.is_paid ? "Paid" : "Unpaid"}</p>
        </div>
      ),
      sortValue: (r) => r.type_name,
    },
    {
      id: "dates",
      header: "Dates",
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-medium tabular sm:whitespace-nowrap">{leaveWhen(r.start_date, r.end_date)}</p>
          <p className="text-[11px] text-muted-foreground tabular">{dayWord(r.days_count)} counted</p>
        </div>
      ),
      sortValue: (r) => r.start_date,
    },
    {
      id: "reason",
      header: "Reason",
      hideBelow: "lg",
      hideOnCard: true,
      cell: (r) => <p className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground">{r.reason || "—"}</p>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={r.status} />
            {r.locked && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground" title="A final payslip covers these dates">
                <Lock className="h-3 w-3" aria-hidden /> Month closed
              </span>
            )}
          </div>
          {r.review_notes && <p className="line-clamp-2 max-w-[240px] text-[11px] text-muted-foreground">“{r.review_notes}”</p>}
          {r.reviewer_name && r.status !== "pending" && <p className="text-[11px] text-muted-foreground">by {r.reviewer_name}</p>}
        </div>
      ),
      sortValue: (r) => r.status,
    },
    {
      id: "filed",
      header: "Filed",
      hideBelow: "md",
      cell: (r) => (
        <div className="text-[11px] text-muted-foreground">
          <p>{formatRelative(r.created_at)}</p>
          <p>{r.requested_via === "portal" ? "by the employee" : `by ${r.requester_name ?? "HR"}`}</p>
        </div>
      ),
      sortValue: (r) => r.created_at,
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      hideOnCard: true,
      cell: (r) => renderActions(r),
    },
  ];

  function renderActions(r: LeaveRequestRow) {
    if (!canDecide) return null;
    const actions: RowAction[] = [
      { label: "Approve", icon: Check, hidden: r.status !== "pending" || r.locked, onSelect: () => setDeciding({ rows: [r], initial: "approved" }) },
      { label: "Reject", icon: X, hidden: r.status !== "pending", onSelect: () => setDeciding({ rows: [r], initial: "rejected" }) },
      {
        label: "Move back to pending",
        icon: RotateCcw,
        hidden: (r.status !== "approved" && r.status !== "rejected") || r.locked,
        onSelect: () => undo.mutateAsync({ id: r.id }),
        confirm: {
          title: "Move back to pending?",
          description:
            r.status === "approved"
              ? `The leave marked in ${r.employee_name}'s attendance (${dayWord(r.days_count)}) is removed${r.is_paid ? "" : ", and Finance is told the unpaid leave was taken back"}.`
              : `${r.employee_name}'s request goes back to the pending list.`,
          confirmLabel: "Move back",
        },
      },
      {
        label: "Cancel request",
        icon: Ban,
        destructive: true,
        separated: true,
        hidden: r.status !== "pending",
        onSelect: () => cancel.mutateAsync({ id: r.id }),
        confirm: { title: "Cancel this request?", description: `${r.employee_name} is told HR cancelled it.`, confirmLabel: "Cancel request" },
      },
    ];
    if (actions.every((a) => a.hidden)) return null;
    return (
      <div className="flex items-center justify-end gap-1.5">
        {r.status === "pending" && !r.locked && (
          <Button size="sm" className="hidden h-8 rounded-lg px-2.5 lg:inline-flex" onClick={() => setDeciding({ rows: [r], initial: "approved" })}>
            Review
          </Button>
        )}
        <RowActions actions={actions} label={`Actions for ${r.employee_name}`} />
      </div>
    );
  }

  const statusOptions = [
    { value: "all" as const, label: "All", count: counts.all },
    { value: "pending" as const, label: "Pending", count: counts.pending },
    { value: "approved" as const, label: "Approved", count: counts.approved },
    { value: "rejected" as const, label: "Rejected", count: counts.rejected },
    { value: "cancelled" as const, label: "Cancelled", count: counts.cancelled },
  ];

  const single = deciding?.rows.length === 1 ? deciding.rows[0] : null;

  return (
    <SectionCard flush>
      <div className="flex flex-col gap-3 border-b border-border/60 p-3 sm:p-4">
        <FilterBar search={search} onSearchChange={setSearch} placeholder="Search people or type…" className={FILTER_ROW}>
          <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger className="h-9 w-[96px] rounded-xl" aria-label="Year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <SegmentedFilter label="Filter by status" options={statusOptions} value={status} onChange={onStatusChange} />
          </div>
          <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-xl px-2.5 sm:px-3" onClick={onExport} disabled={!onExport} aria-label={`Download ${year} requests as CSV`}>
            <Download className="h-4 w-4 sm:mr-1.5" aria-hidden />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      </div>
      <DataTable
        className={cn("transition-opacity", refreshing && "pointer-events-none opacity-50")}
        columns={columns}
        rows={visible}
        getRowId={(r) => r.id}
        loading={loading}
        selectable={canDecide && counts.pending > 0}
        rowClassName={(r) => (r.status === "cancelled" ? "opacity-60" : undefined)}
        mobileTitle={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <PersonCell name={r.employee_name} code={r.employee_code} avatarUrl={r.avatar_url} sub={r.department} employeeId={r.employee_id} />
              <div className="shrink-0">{renderActions(r)}</div>
            </div>
            {r.reason && <p className="line-clamp-2 text-xs font-normal text-muted-foreground">“{r.reason}”</p>}
          </div>
        )}
        bulkActions={(selected, clear) => {
          const pending = selected.filter((r) => r.status === "pending" && !r.locked);
          if (!pending.length) return <span className="text-xs text-muted-foreground">Only pending requests can be decided together.</span>;
          return (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 rounded-lg" onClick={() => setDeciding({ rows: pending, initial: "approved" })}>
                <Check className="mr-1 h-3.5 w-3.5" /> Approve {pending.length}
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setDeciding({ rows: pending, initial: "rejected" })}>
                <X className="mr-1 h-3.5 w-3.5" /> Reject {pending.length}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 rounded-lg" onClick={clear}>
                Clear
              </Button>
            </div>
          );
        }}
        empty={
          <EmptyState
            compact
            icon={Plane}
            title={rows.length ? "Nothing matches these filters" : `No leave requests in ${year}`}
            description={rows.length ? "Try another status or clear the search." : "Requests from the employee portal and requests HR files appear here."}
            action={
              canDecide && !rows.length ? (
                <Button size="sm" className="rounded-xl" onClick={onFile}>
                  File a request
                </Button>
              ) : undefined
            }
          />
        }
        pageSize={15}
      />

      <DecisionDialog
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        initial={deciding?.initial}
        title={single ? `Leave for ${single.employee_name}` : `Decide ${deciding?.rows.length ?? 0} requests`}
        description={
          single
            ? "Approving marks the counted days as leave in attendance. The employee is notified either way."
            : "The same decision and note apply to every selected request."
        }
        onDecide={(decision, note) => decideMany(deciding?.rows ?? [], decision, note)}
      >
        {single ? (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="micro-label text-muted-foreground">Type</p>
              <p className="font-semibold">
                {single.type_name} · {single.is_paid ? "paid" : "unpaid"}
              </p>
            </div>
            <div>
              <p className="micro-label text-muted-foreground">Dates</p>
              <p className="font-semibold tabular">
                {leaveWhen(single.start_date, single.end_date)} · {dayWord(single.days_count)}
              </p>
            </div>
            {single.reason && (
              <div className="col-span-full">
                <p className="micro-label text-muted-foreground">Reason</p>
                <p className="text-sm">{single.reason}</p>
              </div>
            )}
            {!single.is_paid && <p className="col-span-full text-xs text-warning">Unpaid: Finance is told so the days come off this month's pay.</p>}
          </div>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {deciding?.rows.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="truncate font-semibold">{r.employee_name}</span>
                <span className="shrink-0 text-muted-foreground tabular">
                  {r.type_name} · {leaveWhen(r.start_date, r.end_date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DecisionDialog>
    </SectionCard>
  );
}
