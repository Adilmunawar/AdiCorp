import { useMemo, useState } from "react";
import { Download, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, EmptyState, FilterBar, SectionCard, downloadCsv, type DataColumn } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useLeaveBalances } from "../api";
import { trimNumber, yearOptions } from "../lib";
import type { LeaveBalanceRow } from "../types";
import { AllocationDialog } from "./AllocationDialog";
import { BalanceBar, FILTER_ROW, PersonCell } from "./shared";

interface PersonBalances {
  id: string;
  name: string;
  code: string | null;
  department: string | null;
  avatarUrl: string | null;
  byType: Map<string, LeaveBalanceRow>;
}

function BalanceCell({ b, onEdit }: { b: LeaveBalanceRow | undefined; onEdit?: (b: LeaveBalanceRow) => void }) {
  if (!b) return <span className="text-xs text-muted-foreground">—</span>;
  const content = b.unlimited ? (
    <div className="min-w-[112px] text-left">
      <p className="text-sm font-semibold tabular">{trimNumber(b.used)} used</p>
      <p className="text-[11px] text-muted-foreground">No yearly limit{b.pending > 0 ? ` · ${trimNumber(b.pending)} pending` : ""}</p>
    </div>
  ) : (
    <div className="min-w-[112px] space-y-1 text-left">
      <p className="flex items-baseline gap-1.5">
        <span className={cn("text-sm font-semibold tabular", (b.remaining ?? 0) <= 2 && "text-destructive")}>
          {trimNumber(b.remaining)}
          <span className="text-[11px] font-medium text-muted-foreground"> / {trimNumber(b.allowed)} left</span>
        </span>
        {b.custom && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-semibold text-primary" title="A custom allowance for this year">
            Custom
          </span>
        )}
      </p>
      <BalanceBar allowed={b.allowed} used={b.used} />
      <p className="text-[11px] text-muted-foreground tabular">
        {trimNumber(b.used)} used{b.pending > 0 ? ` · ${trimNumber(b.pending)} pending` : ""}
      </p>
    </div>
  );
  if (!onEdit) return content;
  return (
    <button
      type="button"
      onClick={() => onEdit(b)}
      className="rounded-lg p-1 -m-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Change ${b.type_name} allowance for ${b.employee_name}`}
    >
      {content}
    </button>
  );
}

/** People x active leave types for a year: remaining of the allowance, used and pending. */
export function BalancesPanel({ canEdit }: { canEdit: boolean }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<LeaveBalanceRow | null>(null);
  const query = useLeaveBalances(year);

  const { people, types } = useMemo(() => {
    const map = new Map<string, PersonBalances>();
    const typeMap = new Map<string, { id: string; name: string; unlimited: boolean }>();
    for (const b of query.data ?? []) {
      if (!typeMap.has(b.leave_type_id)) typeMap.set(b.leave_type_id, { id: b.leave_type_id, name: b.type_name, unlimited: b.default_days === 0 });
      let p = map.get(b.employee_id);
      if (!p) {
        p = { id: b.employee_id, name: b.employee_name, code: b.employee_code, department: b.department, avatarUrl: b.avatar_url, byType: new Map() };
        map.set(b.employee_id, p);
      }
      p.byType.set(b.leave_type_id, b);
    }
    return { people: [...map.values()], types: [...typeMap.values()] };
  }, [query.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q) || (p.department ?? "").toLowerCase().includes(q));
  }, [people, search]);

  const columns: DataColumn<PersonBalances>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: (p) => <PersonCell name={p.name} code={p.code} avatarUrl={p.avatarUrl} sub={p.department} employeeId={p.id} />,
      sortValue: (p) => p.name,
      hideOnCard: true,
    },
    ...types.map<DataColumn<PersonBalances>>((t) => ({
      id: t.id,
      header: t.name,
      cell: (p) => <BalanceCell b={p.byType.get(t.id)} onEdit={canEdit ? setEditing : undefined} />,
      sortValue: (p) => {
        const b = p.byType.get(t.id);
        return b ? (b.unlimited ? b.used : (b.remaining ?? 0)) : null;
      },
    })),
  ];

  const exportCsv = () => {
    downloadCsv(
      (query.data ?? []).map((b) => ({
        Employee: b.employee_name,
        "Employee ID": b.employee_code ?? "",
        Department: b.department ?? "",
        "Leave type": b.type_name,
        Paid: b.is_paid ? "Yes" : "No",
        Allowance: b.unlimited ? "No limit" : b.allowed,
        Custom: b.custom ? "Yes" : "No",
        Used: b.used,
        Pending: b.pending,
        Remaining: b.remaining ?? "",
      })),
      `leave-balances-${year}`,
    );
  };

  return (
    <SectionCard flush>
      <div className="border-b border-border/60 p-3 sm:p-4">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search people…"
          className={FILTER_ROW}
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl px-2.5 sm:px-3"
              onClick={exportCsv}
              disabled={!query.data?.length}
              aria-label={`Download ${year} balances as CSV`}
            >
              <Download className="h-4 w-4 sm:mr-1.5" aria-hidden />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          }
        >
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Days left of each {year} allowance after approved leave. Pending days are listed, not deducted.
          {canEdit ? " Click a balance to set a different allowance for someone." : ""}
        </p>
      </div>
      <DataTable
        className={cn("transition-opacity", query.isPlaceholderData && "pointer-events-none opacity-50")}
        columns={columns}
        rows={visible}
        getRowId={(p) => p.id}
        loading={query.isLoading}
        mobileTitle={(p) => <PersonCell name={p.name} code={p.code} avatarUrl={p.avatarUrl} sub={p.department} employeeId={p.id} />}
        empty={
          <EmptyState
            compact
            icon={Scale}
            title={people.length ? "No one matches the search" : "No balances yet"}
            description={people.length ? "Clear the search to see everyone." : "Balances appear once there are active employees and active leave types."}
          />
        }
        pageSize={20}
      />
      <AllocationDialog row={editing} year={year} onClose={() => setEditing(null)} />
    </SectionCard>
  );
}
