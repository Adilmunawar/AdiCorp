import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { BadgeCheck, Check, Clock3, Download, Hourglass, Info, Lock, Pencil, Plus, RotateCcw, Timer, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  downloadCsv,
  formatDate,
  formatRelative,
  humanize,
  toDate,
  toDbDate,
  type DataColumn,
  type RowAction,
} from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useCompanyToday, useOvertimeHours, useRemoveOvertime, useReviewOvertime } from "../api";
import { DecisionDialog, type Decision } from "../components/DecisionDialog";
import { AddOvertimeDialog, HoursDialog } from "../components/OvertimeDialogs";
import { MonthNav, PersonCell, SegmentedFilter } from "../components/shared";
import { OVERTIME_TYPE_LABELS, hoursLabel, parseMonthParam, payStageInfo, trimNumber } from "../lib";
import { OVERTIME_STATUSES, type OvertimeHoursRow, type OvertimeStatus } from "../types";

type StatusFilter = OvertimeStatus | "all";

/** HR's overtime page: hours only. Finance prices approved hours in Payroll. */
export default function OvertimePage() {
  const { isHR } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = useCompanyToday();
  const todayDate = toDate(today) ?? new Date();
  const month = parseMonthParam(params.get("month"), today);
  const rawStatus = params.get("status");
  const status: StatusFilter = rawStatus && (OVERTIME_STATUSES as string[]).includes(rawStatus) ? (rawStatus as OvertimeStatus) : "all";
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [fixing, setFixing] = useState<OvertimeHoursRow | null>(null);
  const [deciding, setDeciding] = useState<{ rows: OvertimeHoursRow[]; initial: Decision } | null>(null);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value === null) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );

  const from = toDbDate(startOfMonth(month));
  const to = toDbDate(endOfMonth(month));
  const query = useOvertimeHours({ from, to });
  // The sidebar badge counts every pending entry; those from other months are listed too, so none waits unseen.
  const pendingQuery = useOvertimeHours({ from: toDbDate(subDays(todayDate, 400)), to: today, status: "pending" });
  const review = useReviewOvertime();
  const remove = useRemoveOvertime();
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const otherPending = useMemo(() => (pendingQuery.data ?? []).filter((r) => r.date < from || r.date > to), [pendingQuery.data, from, to]);
  const listRows = useMemo(() => [...otherPending, ...rows], [otherPending, rows]);

  const summary = useMemo(() => {
    const s = { pending: 0, pendingHours: 0, approvedHours: 0, approved: 0, withFinance: 0, paid: 0, rejected: 0 };
    for (const r of rows) {
      if (r.status === "pending") {
        s.pending += 1;
        s.pendingHours += r.hours;
      } else if (r.status === "approved") {
        s.approved += 1;
        s.approvedHours += r.hours;
        if (r.pay_stage === "paid") s.paid += 1;
        else if (r.pay_stage === "with_finance" || r.pay_stage === "ready") s.withFinance += 1;
      } else s.rejected += 1;
    }
    for (const r of otherPending) {
      s.pending += 1;
      s.pendingHours += r.hours;
    }
    return s;
  }, [rows, otherPending]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listRows.filter(
      (r) => (status === "all" || r.status === status) && (!q || r.employee_name.toLowerCase().includes(q) || (r.employee_code ?? "").toLowerCase().includes(q)),
    );
  }, [listRows, search, status]);

  const decideMany = async (list: OvertimeHoursRow[], decision: Decision, note: string) => {
    const pending = list.filter((r) => r.status === "pending" && !r.locked);
    if (pending.length === 1) {
      await review.mutateAsync({ id: pending[0].id, status: decision, note });
      return;
    }
    let ok = 0;
    const failed: string[] = [];
    for (const r of pending) {
      try {
        await review.mutateAsync({ id: r.id, status: decision, note, silent: true });
        ok += 1;
      } catch {
        failed.push(r.employee_name);
      }
    }
    if (ok) toast.success(`${ok} ${ok === 1 ? "entry" : "entries"} ${decision}.${decision === "approved" ? " Finance sets the pay." : ""}`);
    if (failed.length) throw new Error(`Not decided: ${failed.join(", ")}`);
  };

  const columns: DataColumn<OvertimeHoursRow>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: (r) => <PersonCell name={r.employee_name} code={r.employee_code} avatarUrl={r.avatar_url} sub={r.department} employeeId={r.employee_id} />,
      sortValue: (r) => r.employee_name,
      hideOnCard: true,
    },
    {
      id: "date",
      header: "Date",
      cell: (r) => (
        <div>
          <p className="text-sm font-medium tabular">{formatDate(r.date, r.date < from || r.date > to ? "EEE d MMM yyyy" : "EEE d MMM")}</p>
          <p className="text-[11px] text-muted-foreground">{OVERTIME_TYPE_LABELS[r.overtime_type] ?? r.overtime_type}</p>
        </div>
      ),
      sortValue: (r) => r.date,
    },
    {
      id: "hours",
      header: "Hours",
      align: "right",
      cell: (r) => (
        <div className="text-right">
          <p className="text-sm font-bold tabular">{hoursLabel(r.hours)}</p>
          {r.claimed_hours !== null && r.claimed_hours !== r.hours && <p className="text-[11px] text-muted-foreground tabular">claimed {hoursLabel(r.claimed_hours)}</p>}
        </div>
      ),
      sortValue: (r) => r.hours,
    },
    {
      id: "reason",
      header: "Work done",
      hideBelow: "lg",
      hideOnCard: true,
      cell: (r) => <p className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground">{r.reason || "—"}</p>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => {
        const stage = payStageInfo(r.pay_stage, r.payslip_month);
        return (
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={r.status} />
              {stage && <StatusBadge status={r.pay_stage} label={stage.label} tone={stage.tone} dot={false} />}
              {r.locked && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Paid, locked" />}
            </div>
            {r.review_notes && <p className="line-clamp-2 max-w-[220px] text-[11px] text-muted-foreground">“{r.review_notes}”</p>}
          </div>
        );
      },
      sortValue: (r) => r.status,
    },
    {
      id: "filed",
      header: "Filed",
      hideBelow: "md",
      cell: (r) => (
        <div className="text-[11px] text-muted-foreground">
          <p>{formatRelative(r.created_at)}</p>
          <p>{r.requested_via === "portal" ? "claimed by the employee" : `added by ${r.requester_name ?? "HR"}`}</p>
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

  function renderActions(r: OvertimeHoursRow) {
    if (!isHR) return null;
    if (r.locked) return <span className="text-[11px] font-semibold text-muted-foreground">Paid, locked</span>;
    const actions: RowAction[] = [
      { label: "Approve", icon: Check, hidden: r.status !== "pending", onSelect: () => setDeciding({ rows: [r], initial: "approved" }) },
      { label: "Change hours", icon: Pencil, hidden: r.status !== "pending", onSelect: () => setFixing(r) },
      { label: "Reject", icon: X, hidden: r.status !== "pending", onSelect: () => setDeciding({ rows: [r], initial: "rejected" }) },
      {
        label: "Move back to pending",
        icon: RotateCcw,
        hidden: r.status === "pending",
        onSelect: () => review.mutateAsync({ id: r.id, status: "pending" }),
        confirm: {
          title: "Move back to pending?",
          description:
            r.status === "approved"
              ? "Finance's rate for this entry is cleared and it comes off any draft payslip. It is priced afresh if approved again. Finance and the employee are told."
              : "The entry goes back to the pending list.",
          confirmLabel: "Move back",
        },
      },
      {
        label: "Remove",
        icon: Trash2,
        destructive: true,
        separated: true,
        hidden: r.status === "approved",
        onSelect: () => remove.mutateAsync({ id: r.id }),
        confirm: { title: "Remove this overtime entry?", description: `${hoursLabel(r.hours)} for ${r.employee_name} on ${formatDate(r.date, "d MMM yyyy")} is deleted.`, confirmLabel: "Remove" },
      },
    ];
    return (
      <div className="flex items-center justify-end gap-1.5">
        {r.status === "pending" && (
          <Button size="sm" className="hidden h-8 rounded-lg px-2.5 lg:inline-flex" onClick={() => setDeciding({ rows: [r], initial: "approved" })}>
            Review
          </Button>
        )}
        <RowActions actions={actions} label={`Actions for ${r.employee_name}`} />
      </div>
    );
  }

  const exportCsv = () =>
    downloadCsv(
      rows.map((r) => ({
        Employee: r.employee_name,
        "Employee ID": r.employee_code ?? "",
        Department: r.department ?? "",
        Date: r.date,
        Type: OVERTIME_TYPE_LABELS[r.overtime_type] ?? r.overtime_type,
        Hours: r.hours,
        Claimed: r.claimed_hours ?? r.hours,
        Status: humanize(r.status),
        "Pay stage": payStageInfo(r.pay_stage, r.payslip_month)?.label ?? "",
        "Work done": r.reason ?? "",
        "HR note": r.review_notes ?? "",
      })),
      `overtime-hours-${format(month, "yyyy-MM")}`,
    );

  const single = deciding?.rows.length === 1 ? deciding.rows[0] : null;
  const statusOptions = [
    { value: "all" as const, label: "All", count: listRows.length },
    { value: "pending" as const, label: "Pending", count: summary.pending },
    { value: "approved" as const, label: "Approved", count: summary.approved },
    { value: "rejected" as const, label: "Rejected", count: summary.rejected },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="People"
        title="Overtime"
        description="Hours claimed by employees and recorded by HR. Finance sets the pay."
        icon={Timer}
        actions={
          <>
            <MonthNav month={month} max={todayDate} today={today} onChange={(m) => setParam("month", format(m, "yyyy-MM"))} />
            {isHR && (
              <Button size="sm" className="h-9 rounded-xl" onClick={() => setAdding(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add overtime
              </Button>
            )}
          </>
        }
      />

      <StatGrid columns={4}>
        <StatTile
          label="Pending"
          value={summary.pending}
          hint={summary.pending ? `${hoursLabel(summary.pendingHours)} to review` : "All reviewed"}
          tone={summary.pending ? "warning" : "default"}
          icon={Hourglass}
          href={summary.pending ? `/overtime-hours?month=${format(month, "yyyy-MM")}&status=pending` : undefined}
          loading={query.isLoading || query.isPlaceholderData || pendingQuery.isLoading}
        />
        <StatTile
          label="Approved"
          value={hoursLabel(summary.approvedHours)}
          hint={`${summary.approved} ${summary.approved === 1 ? "entry" : "entries"}`}
          tone="success"
          icon={BadgeCheck}
          loading={query.isLoading || query.isPlaceholderData}
        />
        <StatTile
          label="To be paid"
          value={summary.withFinance}
          hint={`${summary.withFinance === 1 ? "Entry" : "Entries"} with Finance`}
          tone="primary"
          icon={Clock3}
          loading={query.isLoading || query.isPlaceholderData}
        />
        <StatTile
          label="Paid"
          value={summary.paid}
          hint={`${summary.paid === 1 ? "Entry" : "Entries"} on a payslip`}
          icon={Wallet}
          loading={query.isLoading || query.isPlaceholderData}
        />
      </StatGrid>

      <div className="flex items-start gap-2.5 rounded-2xl border border-info/20 bg-info/5 px-4 py-3 text-xs text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
        <p>
          HR approves <strong>hours only</strong>. Each approval goes to Finance, who sets the rate and pays it with the salary. Correcting a claim keeps the employee's
          original figure on record.
        </p>
      </div>

      <SectionCard flush>
        <div className="flex flex-col gap-2 border-b border-border/60 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name or ID…" className="min-w-0 sm:flex-none" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <SegmentedFilter label="Filter by status" options={statusOptions} value={status} onChange={(v) => setParam("status", v === "all" ? null : v)} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-xl px-2.5 sm:px-3"
              onClick={exportCsv}
              disabled={!rows.length}
              aria-label={`Download ${format(month, "MMMM yyyy")} overtime as CSV`}
            >
              <Download className="h-4 w-4 sm:mr-1.5" aria-hidden />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        </div>
        {otherPending.length > 0 && (
          <p className="border-b border-border/60 bg-warning/5 px-3 py-2 text-[11px] font-medium text-foreground sm:px-4">
            {otherPending.length} pending {otherPending.length === 1 ? "entry" : "entries"} from other months {otherPending.length === 1 ? "is" : "are"} listed
            first, so nothing waits unseen.
          </p>
        )}
        <DataTable
          className={cn("transition-opacity", query.isPlaceholderData && "pointer-events-none opacity-50")}
          columns={columns}
          rows={visible}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          selectable={isHR && summary.pending > 0}
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
            if (!pending.length) return <span className="text-xs text-muted-foreground">Only pending entries can be decided together.</span>;
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
              icon={Timer}
              title={listRows.length ? "Nothing matches these filters" : `No overtime in ${format(month, "MMMM yyyy")}`}
              description={listRows.length ? "Try another status or clear the search." : "Claims from the employee portal and hours HR records appear here."}
              action={
                isHR && !listRows.length ? (
                  <Button size="sm" className="rounded-xl" onClick={() => setAdding(true)}>
                    Add overtime
                  </Button>
                ) : undefined
              }
            />
          }
          pageSize={20}
        />
      </SectionCard>

      {isHR && <AddOvertimeDialog open={adding} onOpenChange={setAdding} />}
      <HoursDialog row={fixing} onClose={() => setFixing(null)} />
      <DecisionDialog
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        initial={deciding?.initial}
        notePlaceholder="e.g. Approved. Thanks for staying late for the release."
        title={single ? `Overtime for ${single.employee_name}` : `Decide ${deciding?.rows.length ?? 0} entries`}
        description={single ? "Approved hours go to Finance for a rate. The employee is notified either way." : "The same decision and note apply to every selected entry."}
        onDecide={(decision, note) => decideMany(deciding?.rows ?? [], decision, note)}
      >
        {single ? (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="micro-label text-muted-foreground">Date</p>
              <p className="font-semibold tabular">{formatDate(single.date, "d MMM yyyy")}</p>
            </div>
            <div>
              <p className="micro-label text-muted-foreground">Hours</p>
              <p className="font-semibold tabular">
                {hoursLabel(single.hours)}
                {single.claimed_hours !== null && single.claimed_hours !== single.hours && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(claimed {hoursLabel(single.claimed_hours)})</span>
                )}
              </p>
            </div>
            <div>
              <p className="micro-label text-muted-foreground">Type</p>
              <p className="font-semibold">{OVERTIME_TYPE_LABELS[single.overtime_type] ?? humanize(single.overtime_type)}</p>
            </div>
            {single.reason && (
              <div className="col-span-full">
                <p className="micro-label text-muted-foreground">Work done</p>
                <p className="text-sm">{single.reason}</p>
              </div>
            )}
          </div>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {deciding?.rows.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="truncate font-semibold">{r.employee_name}</span>
                <span className="shrink-0 text-muted-foreground tabular">
                  {formatDate(r.date, "d MMM")} · {hoursLabel(r.hours)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DecisionDialog>
    </div>
  );
}
