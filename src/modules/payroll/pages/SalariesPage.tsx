import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Banknote, CalendarClock, Download, History, Loader2, RotateCcw, Save, Undo2, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import {
  ConfirmButton,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SectionCard,
  StatGrid,
  StatTile,
  StatusBadge,
  TableSkeleton,
  downloadCsv,
  formatDate,
  formatDateTime,
  formatMonth,
  formatRelative,
  initials,
  useMoney,
  type DataColumn,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { errorMessage, usePayRules, useSalaryOverview, useSaveSalaries, useTakeBackSalary } from "../lib/api";
import { MONEY_LIMIT, REASON_MAX, breakdown, parseAmount, round2 } from "../lib/calc";
import type { PayMethod, SalaryChange, SalaryRow } from "../lib/types";
import { Notice, formatDay, plural } from "../components/bits";
import { groupDigits, useWidth } from "../components/useWidth";

interface Edit {
  salary: string;
  other: string;
  method: PayMethod;
}

type SortKey = "name" | "code" | "department" | "salary";

const editOf = (r: SalaryRow): Edit => ({
  salary: r.current ? groupDigits(String(round2(r.current.monthly_salary))) : "",
  other: r.current?.other_allowance ? groupDigits(String(round2(r.current.other_allowance))) : "",
  method: r.current?.pay_method ?? (r.has_bank ? "bank" : "cash"),
});

/** +10.5% style change between two salaries; null when there is no earlier one. */
function changePct(before: number | null | undefined, after: number): number | null {
  if (!before || before <= 0) return null;
  return Math.round(((after - before) / before) * 1000) / 10;
}

function ChangeChip({ pct, className }: { pct: number | null; className?: string }) {
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-semibold", up ? "bg-success-soft text-success" : "bg-danger-soft text-danger", className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

export default function SalariesPage() {
  const q = useSalaryOverview();
  const rulesQ = usePayRules();
  const save = useSaveSalaries();
  const takeBack = useTakeBackSalary();
  const { format, currency } = useMoney();
  const [wrapRef, width] = useWidth<HTMLDivElement>();

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [showLeft, setShowLeft] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [effective, setEffective] = useState<string>("");
  const [reason, setReason] = useState("");

  const data = q.data;
  const rules = rulesQ.data?.rules;
  useEffect(() => {
    if (data && !effective) setEffective(data.this_month);
  }, [data, effective]);

  const all = useMemo(() => data?.rows ?? [], [data]);
  const departments = useMemo(() => [...new Set(all.map((r) => r.department).filter(Boolean) as string[])].sort(), [all]);

  const valueOf = (r: SalaryRow): Edit => edits[r.id] ?? editOf(r);
  const isChanged = (r: SalaryRow) => {
    const e = edits[r.id];
    if (!e) return false;
    const base = editOf(r);
    const n = (s: string) => round2(parseAmount(s) || 0);
    return n(e.salary) !== n(base.salary) || n(e.other) !== n(base.other) || e.method !== base.method;
  };
  const changed = all.filter(isChanged);
  const invalid = changed.find((r) => {
    const e = valueOf(r);
    const s = parseAmount(e.salary);
    const o = parseAmount(e.other);
    return Number.isNaN(s) || s < 0 || s >= MONEY_LIMIT || Number.isNaN(o) || o < 0 || o >= MONEY_LIMIT;
  });

  const rows = useMemo(() => {
    const qq = search.trim().toLowerCase();
    const list = all.filter((r) => {
      if (!showLeft && r.status !== "active" && !isChanged(r)) return false;
      if (dept !== "all" && (r.department ?? "") !== dept) return false;
      if (qq && ![r.name, r.code, r.rank, r.department].some((v) => (v ?? "").toLowerCase().includes(qq))) return false;
      return true;
    });
    const key: Record<SortKey, (r: SalaryRow) => string | number> = {
      name: (r) => r.name.toLowerCase(),
      code: (r) => r.code ?? "~",
      department: (r) => `${r.department ?? "~"} ${r.name}`.toLowerCase(),
      salary: (r) => -(r.current?.monthly_salary ?? -1),
    };
    return [...list].sort((a, b) => {
      const x = key[sort](a);
      const y = key[sort](b);
      return x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, dept, showLeft, sort, edits]);

  const active = all.filter((r) => r.status === "active");
  const budget = round2(active.reduce((s, r) => s + (r.current?.monthly_salary ?? 0), 0));
  const otherBudget = round2(active.reduce((s, r) => s + (r.current?.other_allowance ?? 0), 0));
  const noSalary = active.filter((r) => !r.current || !r.current.monthly_salary).length;
  const upcoming = all.filter((r) => r.upcoming).length;
  const leftCount = all.length - active.length;
  const changedTotal = round2(changed.reduce((s, r) => s + round2(parseAmount(valueOf(r).salary) || 0) - (r.current?.monthly_salary ?? 0), 0));

  const setEdit = (r: SalaryRow, patch: Partial<Edit>) => setEdits((m) => ({ ...m, [r.id]: { ...valueOf(r), ...patch } }));
  const tidy = (r: SalaryRow, k: "salary" | "other") => {
    const v = valueOf(r)[k];
    const t = groupDigits(v);
    if (t !== v) setEdit(r, { [k]: t });
  };

  const onSave = async () => {
    if (!changed.length || invalid || !effective) return;
    try {
      const res = await save.mutateAsync({
        effectiveMonth: effective,
        reason: reason.trim(),
        rows: changed.map((r) => {
          const e = valueOf(r);
          return { employee_id: r.id, monthly_salary: round2(parseAmount(e.salary) || 0), other_allowance: round2(parseAmount(e.other) || 0), pay_method: e.method };
        }),
      });
      setEdits({});
      setReason("");
      if (!res.changed.length) toast.info("Nothing had changed.");
      else toast.success(`Saved ${plural(res.changed.length, "salary", "salaries")} from ${formatDay(res.effective_from)}.`);
      if (res.kept.length) {
        toast.warning(`${res.kept.slice(0, 6).join(", ")}${res.kept.length > 6 ? ` and ${res.kept.length - 6} more` : ""} already ${res.kept.length === 1 ? "has a final payslip" : "have final payslips"} for ${formatMonth(res.effective_from)}. Reopen and refill to apply the new salary.`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const exportCsv = () =>
    downloadCsv(rows, "salaries", [
      { header: "Code", value: (r) => r.code },
      { header: "Name", value: (r) => r.name },
      { header: "Position", value: (r) => r.rank },
      { header: "Department", value: (r) => r.department },
      { header: "Status", value: (r) => (r.status === "active" ? "Active" : "Left") },
      { header: "Monthly salary", value: (r) => r.current?.monthly_salary ?? "" },
      { header: "Other allowance", value: (r) => r.current?.other_allowance ?? "" },
      { header: "Paid by", value: (r) => (r.current?.pay_method === "cash" ? "Cash" : r.current ? "Bank transfer" : "") },
      { header: "In force since", value: (r) => r.current?.effective_from ?? "" },
      { header: "Upcoming salary", value: (r) => r.upcoming?.monthly_salary ?? "" },
      { header: "Upcoming from", value: (r) => r.upcoming?.effective_from ?? "" },
    ]);

  /* Columns fold by the room the table really has (the sidebar takes part of the screen). */
  const wide = width >= 900;
  const roomy = width >= 700;

  const moneyInput = (r: SalaryRow, k: "salary" | "other", label: string, placeholder: string, warn?: boolean) => {
    const v = valueOf(r)[k];
    const n = parseAmount(v);
    const bad = Number.isNaN(n) || n < 0;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground" aria-hidden>
          {currency}
        </span>
        <Input
          aria-label={label}
          aria-invalid={bad || undefined}
          inputMode="decimal"
          placeholder={placeholder}
          value={v}
          onChange={(ev) => setEdit(r, { [k]: ev.target.value })}
          onBlur={() => tidy(r, k)}
          className={cn("tabular h-10 rounded-xl pl-11 text-right sm:h-9", bad && "border-destructive", warn && !bad && "border-warning")}
        />
      </div>
    );
  };

  const columns: DataColumn<SalaryRow>[] = [
    {
      id: "name",
      header: "Employee",
      className: "min-w-[180px]",
      cell: (r) => (
        <div className="flex min-w-0 items-start gap-2.5">
          {wide && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/[0.08] text-[11px] font-bold text-primary" aria-hidden>
              {initials(r.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground" title={r.name}>
              {r.name}
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground" title={[r.code, r.rank, r.department].filter(Boolean).join(" · ")}>
              {[r.code, r.rank, r.department].filter(Boolean).join(" · ") || "—"}
            </p>
            {r.status !== "active" && <StatusBadge status={r.status} className="mt-1" />}
            {isChanged(r) && <p className="mt-0.5 text-[11px] font-semibold text-warning">Changed, not saved yet</p>}
          </div>
        </div>
      ),
    },
    {
      id: "salary",
      header: roomy ? "Monthly salary" : "Salary",
      headerClassName: "text-right",
      cell: (r) => {
        const e = valueOf(r);
        const n = parseAmount(e.salary);
        const pct = isChanged(r) && !Number.isNaN(n) ? changePct(r.current?.monthly_salary, n) : null;
        return (
          <div className="w-full min-w-[140px] sm:w-40">
            {moneyInput(r, "salary", `${r.name}'s monthly salary`, "Not set", isChanged(r))}
            {!roomy && <div className="mt-1.5">{moneyInput(r, "other", `${r.name}'s other allowance`, "Other allowance")}</div>}
            <div className="mt-1 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right text-[11px]">
              {pct !== null && <ChangeChip pct={pct} />}
              {r.current ? <span className="text-muted-foreground">Since {formatDate(r.current.effective_from, "MMM yyyy")}</span> : <span className="font-semibold text-warning">No salary yet</span>}
            </div>
            {r.upcoming && (
              <p className="mt-0.5 text-right text-[11px] text-info">
                From {formatDate(r.upcoming.effective_from, "MMM yyyy")}: <span className="tabular font-semibold">{format(r.upcoming.monthly_salary)}</span>
              </p>
            )}
          </div>
        );
      },
    },
    ...(roomy
      ? [
          {
            id: "other",
            header: "Other allowance",
            headerClassName: "text-right",
            cell: (r: SalaryRow) => <div className="w-full min-w-[120px] sm:w-32">{moneyInput(r, "other", `${r.name}'s other allowance`, "0")}</div>,
          } as DataColumn<SalaryRow>,
        ]
      : []),
    {
      id: "method",
      header: "Paid by",
      cell: (r) => {
        const e = valueOf(r);
        return (
          <div className="w-full sm:w-28">
            <Select value={e.method} onValueChange={(v) => setEdit(r, { method: v as PayMethod })}>
              <SelectTrigger className="h-10 rounded-xl sm:h-9" aria-label={`${r.name} is paid by`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
            {e.method === "bank" && !r.has_bank && <p className="mt-1 text-[11px] leading-4 text-warning">No bank account on the profile</p>}
          </div>
        );
      },
    },
    ...(wide
      ? [
          {
            id: "split",
            header: "Basic / allowances",
            align: "right",
            cell: (r: SalaryRow) => {
              if (!rules) return null;
              const s = parseAmount(valueOf(r).salary);
              if (!s || Number.isNaN(s)) return <span className="text-muted-foreground">—</span>;
              const b = breakdown(s, rules);
              return (
                <div className="tabular text-[12px]">
                  <p className="text-foreground">
                    {format(b.basic)} <span className="text-muted-foreground">/</span> {format(b.allowances)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Tax {format(b.monthly_tax)} a month</p>
                </div>
              );
            },
          } as DataColumn<SalaryRow>,
        ]
      : []),
  ];

  const changes = data?.changes ?? [];

  return (
    <div className={cn("mx-auto w-full max-w-6xl", changed.length > 0 ? "pb-48 md:pb-32" : "pb-6")}>
      <PageHeader
        eyebrow="Pay"
        title="Salaries"
        icon={Banknote}
        description="Set monthly pay. Changes apply from the start of a month and are kept in history."
        actions={
          all.length > 0 ? (
            <Button variant="outline" size="sm" className="h-10 rounded-xl sm:h-9" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {q.isError && (
        <Notice tone="danger" className="mb-4">
          {errorMessage(q.error)}{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => q.refetch()}>
            Try again
          </button>
        </Notice>
      )}
      {noSalary > 0 && (
        <Notice tone="warning" className="mb-4">
          {plural(noSalary, "active person has", "active people have")} no salary on file. Their drafts would start at zero.
        </Notice>
      )}

      <StatGrid>
        <StatTile label="Active people" value={active.length} icon={Users} loading={q.isLoading} hint={leftCount ? `${leftCount} who left kept in history` : "On the payroll today"} />
        <StatTile label="Monthly salaries" value={format(budget)} icon={Banknote} loading={q.isLoading} tone="primary" hint={otherBudget ? `+ ${format(otherBudget)} other allowances` : `${format(budget * 12, { compact: true })} a year`} />
        <StatTile label="No salary yet" value={noSalary} icon={UserX} loading={q.isLoading} tone={noSalary ? "warning" : "default"} hint={noSalary ? "Drafts would start at zero" : "Everyone is set"} />
        <StatTile label="Upcoming changes" value={upcoming} icon={CalendarClock} loading={q.isLoading} hint={data ? `From ${formatMonth(data.next_month)}` : "Dated next month"} />
      </StatGrid>

      <SectionCard className="mt-4" flush>
        <div className="border-b border-border/60 p-3 sm:p-4">
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name, code, position…">
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] rounded-xl text-[13px] sm:h-9 sm:w-44" aria-label="Department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] rounded-xl text-[13px] sm:h-9 sm:w-40" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort: Name</SelectItem>
                <SelectItem value="code">Sort: Code</SelectItem>
                <SelectItem value="department">Sort: Department</SelectItem>
                <SelectItem value="salary">Sort: Highest salary</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-muted-foreground sm:h-9">
              <Switch checked={showLeft} onCheckedChange={setShowLeft} aria-label="Show people who left" />
              People who left{leftCount ? ` (${leftCount})` : ""}
            </label>
          </FilterBar>
          {!q.isLoading && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="tabular font-semibold text-foreground">{rows.length}</span> {rows.length === 1 ? "person" : "people"}. Type a new figure in any row, then save them together.
            </p>
          )}
        </div>
        <div ref={wrapRef} className="min-w-0">
          {q.isLoading ? (
            <TableSkeleton rows={8} columns={5} className="rounded-none border-0 shadow-none" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              getRowId={(r) => r.id}
              pageSize={0}
              caption="Salaries"
              rowClassName={(r) => (isChanged(r) ? "bg-warning/[0.06]" : undefined)}
              empty={
                q.isError ? (
                  <EmptyState compact icon={Banknote} title="Salaries could not load" description="Try again in a moment." />
                ) : (
                  <EmptyState compact icon={Banknote} title={all.length ? "No one matches" : "No employees yet"} description={all.length ? "Try another name or department." : "People appear here once HR adds them."} />
                )
              }
            />
          )}
        </div>
      </SectionCard>

      <SectionCard className="mt-4" title="Salary history" icon={History} description="Recent changes, newest first. A change not yet on a final payslip can be taken back.">
        {q.isLoading ? (
          <TableSkeleton rows={3} columns={3} className="rounded-none border-0 shadow-none" />
        ) : q.isError ? (
          <p className="text-[12px] text-muted-foreground">The history could not load. Try again in a moment.</p>
        ) : changes.length === 0 ? (
          <EmptyState compact icon={History} title="No changes yet" description="Salary changes appear here after the opening salaries." />
        ) : (
          <ul className="divide-y divide-border/60">
            {changes.map((c) => (
              <ChangeItem key={c.id} c={c} onTakeBack={async () => {
                try {
                  await takeBack.mutateAsync(c.id);
                  toast.success(`${c.employee_name}'s change taken back.`);
                } catch (err) {
                  toast.error(errorMessage(err));
                  throw err;
                }
              }} />
            ))}
          </ul>
        )}
      </SectionCard>

      {changed.length > 0 && data && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur pb-safe md:inset-x-auto md:bottom-6 md:right-6 md:w-[min(46rem,calc(100vw-3rem))] md:rounded-2xl md:border">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-[13px] font-bold text-foreground">{plural(changed.length, "salary", "salaries")} changed</p>
              {invalid ? (
                <p className="text-[11px] text-destructive" role="alert">
                  {invalid.name}'s figures must be numbers, 0 or more and below {MONEY_LIMIT.toLocaleString("en-US")}.
                </p>
              ) : (
                <p className="tabular text-[11px] text-muted-foreground">
                  {changedTotal === 0 ? "No change to the monthly total" : `${changedTotal > 0 ? "+" : "−"}${format(Math.abs(changedTotal))} a month in total`}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:items-end">
              <div className="space-y-1">
                <Label htmlFor="effective" className="micro-label">
                  Applies from
                </Label>
                <Select value={effective} onValueChange={setEffective}>
                  <SelectTrigger id="effective" className="h-10 rounded-xl md:h-9 md:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={data.this_month}>{formatMonth(data.this_month)}</SelectItem>
                    <SelectItem value={data.next_month}>{formatMonth(data.next_month)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reason" className="micro-label">
                  Reason <span className="font-normal normal-case tracking-normal">(optional)</span>
                </Label>
                <Input id="reason" maxLength={REASON_MAX} placeholder="Promotion, annual raise" value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 rounded-xl md:h-9 md:w-48" />
              </div>
              <Button variant="outline" className="h-10 rounded-xl md:h-9" onClick={() => setEdits({})}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Discard
              </Button>
              <Button className="h-10 rounded-xl md:h-9" disabled={!!invalid || save.isPending} onClick={onSave}>
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                Save {changed.length > 1 ? `all ${changed.length}` : ""}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeItem({ c, onTakeBack }: { c: SalaryChange; onTakeBack: () => Promise<void> }) {
  const { format } = useMoney();
  const pct = changePct(c.previous_salary, c.monthly_salary);
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground" aria-hidden>
          {initials(c.employee_name)}
        </span>
        <div className="min-w-0 text-[13px]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground">{c.employee_name}</span>
            <span className="tabular text-foreground">
              {c.previous_salary != null && <span className="text-muted-foreground">{format(c.previous_salary)} → </span>}
              <span className="font-semibold">{format(c.monthly_salary)}</span>
              {c.other_allowance ? <span className="text-muted-foreground"> + {format(c.other_allowance)} other</span> : null}
            </span>
            <ChangeChip pct={pct} />
            {c.upcoming && <StatusBadge status="scheduled" label="Upcoming" />}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            From {formatDay(c.effective_from)}
            {c.reason ? ` · ${c.reason}` : ""}
            {` · ${c.pay_method === "cash" ? "Paid in cash" : "Paid by bank"}`}
            {c.created_by_name ? ` · by ${c.created_by_name}` : ""} ·{" "}
            <time dateTime={c.created_at} title={formatDateTime(c.created_at)}>
              {formatRelative(c.created_at)}
            </time>
          </p>
        </div>
      </div>
      {c.can_undo && (
        <ConfirmButton
          variant="outline"
          size="sm"
          className="h-9 shrink-0 self-end rounded-xl sm:self-auto"
          title={`Take back ${c.employee_name}'s change to ${format(c.monthly_salary)}?`}
          description="The salary before it applies again from that date. Drafts using it will show they need a refill."
          confirmLabel="Take back"
          onConfirm={onTakeBack}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Take back
        </ConfirmButton>
      )}
    </li>
  );
}
