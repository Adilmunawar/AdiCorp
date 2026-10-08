import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlarmClock, CalendarRange, CheckCircle2, ClipboardCheck, ListChecks, Play, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, FilterBar, PageHeader, SectionCard, StatGrid, StatTile, StatusBadge, TabsNav, formatDate, useTabParam, type DataColumn, type TabItem } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useChecklists } from "../api/checklists";
import { useEmployees } from "../api/employees";
import type { ChecklistWithItems, Employee } from "../api/types";
import type { ChecklistKind } from "../lib/constants";
import { daysUntil, isOverdue, matchesSearch } from "../lib/utils";
import { EmployeeChip, PHONE_TILE, ProgressBar } from "../components/common";
import { checklistProgress, nextStep } from "../components/ChecklistSteps";
import { StartChecklistDialog } from "../components/StartChecklistDialog";
import { LoadError, QuickFilters, type QuickFilterOption } from "../components/PageBits";

type Row = ChecklistWithItems & { employee?: Employee };
type StatusFilter = "open" | "overdue" | "done" | "cancelled" | "all";
const STATUS_FILTERS: StatusFilter[] = ["open", "overdue", "done", "cancelled", "all"];

/** "in 7 days", "tomorrow", "today" for an upcoming due date. */
function dueHint(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function matchesStatus(l: ChecklistWithItems, s: StatusFilter): boolean {
  if (s === "all") return true;
  if (s === "overdue") return isOverdue(l.due_date, l.status);
  return l.status === s;
}

export default function ChecklistsPage() {
  const navigate = useNavigate();
  const { data: lists = [], isLoading, isError, refetch } = useChecklists();
  const { data: employees = [] } = useEmployees();
  const tabs: TabItem[] = [
    { value: "onboarding", label: "Onboarding", badge: lists.filter((l) => l.kind === "onboarding" && isOverdue(l.due_date, l.status)).length },
    { value: "offboarding", label: "Offboarding", badge: lists.filter((l) => l.kind === "offboarding" && isOverdue(l.due_date, l.status)).length },
  ];
  const [kind] = useTabParam(tabs);
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status") ?? "open";
  const status: StatusFilter = STATUS_FILTERS.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : "open";
  const search = params.get("q") ?? "";
  const [starting, setStarting] = useState(false);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const kindLabel = kind === "onboarding" ? "onboarding" : "offboarding";

  const setParam = (k: string, v: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true },
    );

  const ofKind = useMemo(() => lists.filter((l) => l.kind === kind), [lists, kind]);
  const stats = useMemo(() => {
    const open = ofKind.filter((l) => l.status === "open");
    const quarter = Date.now() - 90 * 86400_000;
    return {
      open: open.length,
      overdue: open.filter((l) => isOverdue(l.due_date, l.status)).length,
      week: open.filter((l) => {
        const d = daysUntil(l.due_date);
        return d !== null && d >= 0 && d <= 7;
      }).length,
      completed: ofKind.filter((l) => l.status === "done" && l.closed_at && new Date(l.closed_at).getTime() >= quarter).length,
    };
  }, [ofKind]);

  const searched = ofKind
    .map((l) => ({ ...l, employee: byId.get(l.employee_id) }))
    .filter((l) => matchesSearch([l.employee?.name, l.employee?.employee_code, l.employee?.rank, l.title], [], search));
  const rows: Row[] = searched.filter((l) => matchesStatus(l, status));

  // Counts appear once the data is in, so a loading page never claims "0".
  const countOf = (s: StatusFilter) => (isLoading ? undefined : searched.filter((l) => matchesStatus(l, s)).length);
  const statusOptions: QuickFilterOption[] = [
    { value: "open", label: "In progress", count: countOf("open") },
    { value: "overdue", label: "Overdue", count: countOf("overdue"), tone: "danger" },
    { value: "done", label: "Completed", count: countOf("done") },
    { value: "cancelled", label: "Cancelled", count: countOf("cancelled") },
    { value: "all", label: "All", count: countOf("all") },
  ];

  const columns: DataColumn<Row>[] = [
    {
      id: "person",
      header: "Person",
      sortValue: (r) => r.employee?.name,
      cell: (r) =>
        r.employee ? (
          <EmployeeChip id={r.employee.id} name={r.employee.name} avatar={r.employee.avatar_url} subtitle={[r.employee.rank, r.title].filter(Boolean).join(" · ")} link={false} />
        ) : (
          <span className="text-muted-foreground">Former employee</span>
        ),
    },
    {
      id: "progress",
      header: "Progress",
      sortValue: (r) => checklistProgress(r).ratio,
      cell: (r) => {
        const p = checklistProgress(r);
        return (
          <div className="w-full min-w-[120px] max-w-[220px]">
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="tabular text-muted-foreground">
                {p.done} of {p.total} steps
              </span>
              <span className="tabular font-semibold">{Math.round(p.ratio * 100)}%</span>
            </div>
            <ProgressBar value={p.ratio} tone={p.ratio >= 1 ? "success" : isOverdue(r.due_date, r.status) ? "danger" : "primary"} />
          </div>
        );
      },
    },
    {
      id: "next",
      header: "Next step",
      hideBelow: "lg",
      cell: (r) => {
        if (r.status !== "open") return <span className="text-[12px] text-muted-foreground">—</span>;
        const step = nextStep(r);
        if (!step) return <span className="text-[12px] font-medium text-success">All steps done</span>;
        const late = isOverdue(step.due_date, r.status);
        return (
          <div className="min-w-0 text-[12px] sm:max-w-[280px]">
            <p className="break-words font-medium text-foreground sm:truncate" title={step.title}>
              {step.title}
            </p>
            {step.due_date && <p className={cn("tabular text-[11px]", late ? "font-medium text-danger" : "text-muted-foreground")}>{late ? `Was due ${formatDate(step.due_date)}` : `Due ${formatDate(step.due_date)}`}</p>}
          </div>
        );
      },
    },
    {
      id: "due",
      header: "Due",
      sortValue: (r) => r.due_date,
      cell: (r) => {
        if (r.status === "done")
          return (
            <div className="space-y-0.5">
              <StatusBadge status="done" label="Completed" />
              <p className="tabular text-[11px] text-muted-foreground">{formatDate(r.closed_at)}</p>
            </div>
          );
        if (r.status === "cancelled") return <StatusBadge status="cancelled" label="Cancelled" />;
        const d = daysUntil(r.due_date);
        if (d === null) return <span className="text-[12px] text-muted-foreground">No due date</span>;
        if (d < 0)
          return (
            <div className="space-y-0.5">
              <StatusBadge status="overdue" label={`${-d} ${-d === 1 ? "day" : "days"} overdue`} />
              <p className="tabular text-[11px] text-muted-foreground">Was due {formatDate(r.due_date)}</p>
            </div>
          );
        return (
          <div className="text-[12px]">
            <p className="tabular font-medium">{formatDate(r.due_date)}</p>
            <p className={cn("text-[11px]", d <= 2 ? "font-medium text-warning" : "text-muted-foreground")}>{dueHint(d)}</p>
          </div>
        );
      },
    },
  ];

  const emptyState = () => {
    if (!ofKind.length) {
      return (
        <EmptyState
          icon={ClipboardCheck}
          title={`No ${kindLabel} checklists yet`}
          description={
            kind === "onboarding"
              ? "New employees get an onboarding checklist automatically. You can also start one by hand."
              : "Separating an employee starts offboarding automatically. You can also start one by hand."
          }
          action={
            <Button size="sm" onClick={() => setStarting(true)}>
              <Play className="h-4 w-4" /> Start {kindLabel}
            </Button>
          }
          compact
        />
      );
    }
    if (search) {
      return (
        <EmptyState
          icon={ClipboardCheck}
          title="Nobody matches this search"
          description="Try another name, employee code or position."
          action={
            <Button size="sm" variant="outline" onClick={() => setParam("q", null)}>
              Clear search
            </Button>
          }
          compact
        />
      );
    }
    const titles: Record<StatusFilter, string> = {
      open: `No ${kindLabel} in progress`,
      overdue: "Nothing is overdue",
      done: `No completed ${kindLabel} yet`,
      cancelled: "Nothing was cancelled",
      all: `No ${kindLabel} checklists yet`,
    };
    return (
      <EmptyState
        icon={status === "overdue" ? CheckCircle2 : ClipboardCheck}
        title={titles[status]}
        description={
          status === "open"
            ? kind === "onboarding"
              ? "Every new joiner is settled in. A checklist starts automatically when someone joins."
              : "Nobody is leaving right now. Offboarding starts automatically when an employee is separated."
            : `There are ${ofKind.length} ${kindLabel} ${ofKind.length === 1 ? "checklist" : "checklists"} in other states.`
        }
        action={
          <Button size="sm" variant="outline" onClick={() => setParam("status", "all")}>
            Show all {ofKind.length}
          </Button>
        }
        compact
      />
    );
  };

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title="Onboarding & offboarding"
        icon={ClipboardCheck}
        eyebrow="People"
        description="Checklists that welcome new joiners and close out leavers. Auto steps tick themselves from live data."
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/checklists/templates?tab=${kind}`}>
                <Settings2 className="h-4 w-4" /> Templates
              </Link>
            </Button>
            <Button size="sm" onClick={() => setStarting(true)}>
              <Play className="h-4 w-4" /> Start {kindLabel}
            </Button>
          </>
        }
      />
      <TabsNav tabs={tabs} className="mb-4" />
      {isError ? (
        <LoadError what="Checklists" icon={ClipboardCheck} onRetry={() => refetch()} />
      ) : (
        <>
          <StatGrid columns={4} className="mb-4">
            <StatTile label="In progress" value={stats.open} hint={stats.open ? `Being ${kind === "onboarding" ? "onboarded" : "offboarded"}` : "Nothing open"} icon={ListChecks} tone={stats.open ? "primary" : "default"} loading={isLoading} className={PHONE_TILE} />
            <StatTile label="Overdue" value={stats.overdue} hint={stats.overdue ? "Past the due date" : "All on track"} icon={AlarmClock} tone={stats.overdue ? "danger" : "default"} loading={isLoading} className={PHONE_TILE} />
            <StatTile label="Due this week" value={stats.week} hint="Next 7 days" icon={CalendarRange} tone={stats.week ? "warning" : "default"} loading={isLoading} className={PHONE_TILE} />
            <StatTile label="Completed" value={stats.completed} hint="Last 90 days" icon={CheckCircle2} tone={stats.completed ? "success" : "default"} loading={isLoading} className={PHONE_TILE} />
          </StatGrid>
          <SectionCard flush>
            <div className="space-y-3 border-b border-border/60 p-3 sm:p-4">
              <FilterBar
                search={search}
                onSearchChange={(v) => setParam("q", v || null)}
                placeholder="Search people…"
                actions={<QuickFilters label="Status" options={statusOptions} value={status} onChange={(v) => setParam("status", v === "open" ? null : v)} />}
              />
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              getRowId={(r) => r.id}
              loading={isLoading}
              onRowClick={(r) => navigate(`/checklists/${r.id}`)}
              initialSort={{ column: "due" }}
              caption={`${kindLabel} checklists`}
              empty={emptyState()}
            />
          </SectionCard>
        </>
      )}
      {starting && <StartChecklistDialog open kind={kind as ChecklistKind} onOpenChange={(o) => !o && setStarting(false)} />}
    </div>
  );
}
