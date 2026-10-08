import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, CheckCheck, ChevronDown, Download, FilePlus2, FileSpreadsheet, FileText, History, Loader2, RefreshCw, RotateCcw, Send, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import {
  ConfirmDialog,
  EmptyState,
  FilterBar,
  PageHeader,
  RowActions,
  SectionCard,
  Skeleton,
  StatGrid,
  StatGridSkeleton,
  StatTile,
  TableSkeleton,
  downloadCsv,
  exportTablePdf,
  formatDateTime,
  formatMonth,
  formatRelative,
  toDbDate,
  useCompany,
  useMoney,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage, useMonthParam, usePayrollActivity, usePayrollSheet } from "../lib/api";
import { round2 } from "../lib/calc";
import type { SheetOp, SheetRow } from "../lib/types";
import { MonthSwitch, Notice, formatDay, plural } from "../components/bits";
import { SheetGrid, needsRefill, sortSheet, statusOf, sumSheet, type SheetSortKey } from "../components/SheetGrid";
import { useRunSheetOp } from "../components/useRunOp";

type StatusFilter = "" | "none" | "draft" | "final" | "paid" | "refill" | "nosalary";

/** How a status reads in the CSV and PDF exports (never the raw value). */
const STATUS_TEXT = { none: "Not prepared", draft: "Draft", final: "Final", paid: "Paid" } as const;

const noSalary = (r: SheetRow) => !r.pay.has_salary || !r.pay.monthly_salary;

interface PendingConfirm {
  op: SheetOp;
  ids: string[] | null;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  needsDate?: boolean;
  /** Runs after the step succeeded (e.g. clear the ticked rows). */
  onDone?: () => void;
}

export default function PayrollSheetPage() {
  const [month, setMonth] = useMonthParam();
  const { format } = useMoney();
  const { company } = useCompany();
  const navigate = useNavigate();
  const sheet = usePayrollSheet(month);
  const activity = usePayrollActivity(8);
  const { run, pending } = useRunSheetOp();

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("");
  const [sort, setSort] = useState<SheetSortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [paidOn, setPaidOn] = useState(toDbDate());
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const label = formatMonth(month);
  const all = useMemo(() => sheet.data?.rows ?? [], [sheet.data]);
  const departments = useMemo(() => [...new Set(all.map((r) => r.employee.department).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)), [all]);

  // A new month starts with nothing ticked.
  useEffect(() => setSelected(new Set()), [month]);

  /** Search and department applied; the status chips count within this. */
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      const e = r.employee;
      if (q && ![e.name, e.code, e.rank, e.department].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
      if (dept !== "all" && (e.department ?? "") !== dept) return false;
      return true;
    });
  }, [all, search, dept]);

  const rows = useMemo(() => {
    const list = scoped.filter((r) => {
      if (status === "refill") return needsRefill(r);
      if (status === "nosalary") return noSalary(r);
      if (status && statusOf(r) !== status) return false;
      return true;
    });
    return sortSheet(list, sort, dir);
  }, [scoped, status, sort, dir]);

  const chipCounts = useMemo(() => {
    const c = { "": scoped.length, none: 0, draft: 0, final: 0, paid: 0, refill: 0, nosalary: 0 };
    for (const r of scoped) {
      c[statusOf(r)]++;
      if (needsRefill(r)) c.refill++;
      if (noSalary(r)) c.nosalary++;
    }
    return c;
  }, [scoped]);

  const totals = useMemo(() => {
    const t = { drafts: 0, finals: 0, paid: 0 };
    for (const r of all) {
      const s = r.payslip?.status;
      if (s === "draft") t.drafts++;
      else if (s === "final") t.finals++;
      else if (s === "paid") t.paid++;
    }
    return { ...t, ...sumSheet(all) };
  }, [all]);
  const sums = useMemo(() => sumSheet(rows), [rows]);

  const missing = all.length - totals.prepared;
  const missingNoSalary = all.filter((r) => !r.payslip && noSalary(r)).length;
  const stale = all.filter(needsRefill).length;
  const otWaiting = all.reduce((n, r) => n + r.overtime_waiting, 0);
  const openEvents = sheet.data?.open_events ?? 0;
  const filtered = !!(search || dept !== "all" || status);
  const selectedRows = useMemo(() => all.filter((r) => selected.has(r.employee.id)), [all, selected]);
  const allPaid = all.length > 0 && totals.paid === all.length;
  const paidDays = useMemo(() => [...new Set(all.map((r) => r.payslip?.paid_on).filter(Boolean) as string[])].sort(), [all]);

  const clearFilters = () => {
    setSearch("");
    setDept("all");
    setStatus("");
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const ask = (c: PendingConfirm) => {
    if (c.needsDate) setPaidOn(toDbDate());
    setConfirm(c);
  };

  const runRow = async (r: SheetRow, op: SheetOp) => {
    setBusyRow(r.employee.id);
    try {
      await run(month, op, [r.employee.id], op === "paid" ? paidOn : null);
    } catch {
      /* toasted */
    } finally {
      setBusyRow(null);
    }
  };

  const exportCsv = () =>
    downloadCsv(rows, `payroll-${month.slice(0, 7)}`, [
      { header: "Code", value: (r) => r.employee.code },
      { header: "Name", value: (r) => r.employee.name },
      { header: "Position", value: (r) => r.employee.rank },
      { header: "Department", value: (r) => r.employee.department },
      { header: "Salary in force", value: (r) => r.pay.monthly_salary },
      { header: "Other allowance", value: (r) => r.pay.other_allowance },
      { header: "Days paid", value: (r) => `${r.pay.paid_days}/${r.pay.month_days}` },
      { header: "Basic", value: (r) => r.payslip?.basic_salary ?? "" },
      { header: "Allowances", value: (r) => r.payslip?.allowances ?? "" },
      { header: "Other allowances", value: (r) => r.payslip?.other_allowances ?? "" },
      { header: "Overtime hours", value: (r) => r.payslip?.overtime_hours ?? r.overtime.hours },
      { header: "Overtime", value: (r) => r.payslip?.overtime_earnings ?? r.overtime.amount },
      { header: "Gross", value: (r) => r.payslip?.gross_salary ?? "" },
      { header: "Income tax", value: (r) => r.payslip?.income_tax ?? "" },
      { header: "Other deductions", value: (r) => (r.payslip ? round2(r.payslip.total_deductions - r.payslip.income_tax) : "") },
      { header: "Total deductions", value: (r) => r.payslip?.total_deductions ?? "" },
      { header: "Net pay", value: (r) => r.payslip?.net_salary ?? "" },
      { header: "Status", value: (r) => STATUS_TEXT[statusOf(r)] },
      { header: "Paid on", value: (r) => r.payslip?.paid_on ?? "" },
      { header: "Pay method", value: (r) => ((r.payslip?.pay_method ?? r.pay.pay_method) === "cash" ? "Cash" : "Bank transfer") },
    ]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportTablePdf({
        title: `Payroll, ${label}`,
        subtitle: `${plural(rows.length, "person", "people")}${filtered ? " (filtered)" : ""} · ${sums.prepared} prepared · generated ${formatDay(new Date())}`,
        company: { name: company?.name, logo: company?.logo },
        orientation: "landscape",
        filename: `payroll-${month.slice(0, 7)}`,
        columns: ["Employee", "Department", "Salary", "Overtime", "Gross", "Tax", "Deductions", "Net pay", "Status"],
        numericColumns: [2, 3, 4, 5, 6, 7],
        rows: rows.map((r) => [
          [r.employee.name, r.employee.code].filter(Boolean).join(" · "),
          r.employee.department ?? "",
          format(r.pay.monthly_salary),
          r.overtime.amount ? format(r.overtime.amount) : "",
          r.payslip ? format(r.payslip.gross_salary) : "",
          r.payslip ? format(r.payslip.income_tax) : "",
          r.payslip ? format(r.payslip.total_deductions) : "",
          r.payslip ? format(r.payslip.net_salary) : "",
          STATUS_TEXT[statusOf(r)],
        ]),
        foot: [["Total", "", format(sums.salary), format(sums.overtime), format(sums.gross), format(sums.tax), format(sums.deductions), format(sums.net), `${sums.prepared} of ${rows.length}`]],
      });
    } catch (e) {
      console.error(e);
      toast.error("The PDF could not be made. Try again, or export the spreadsheet instead.");
    } finally {
      setExporting(false);
    }
  };

  const loading = sheet.isLoading;
  const chips: Array<[StatusFilter, string]> = [
    ["", "Everyone"],
    ["none", "Not prepared"],
    ["draft", "Draft"],
    ["final", "Final"],
    ["paid", "Paid"],
    ...(chipCounts.refill ? ([["refill", "Needs refill"]] as Array<[StatusFilter, string]>) : []),
    ...(chipCounts.nosalary ? ([["nosalary", "No salary"]] as Array<[StatusFilter, string]>) : []),
  ];

  return (
    <div className={cn("mx-auto w-full max-w-7xl", selected.size > 0 && "pb-24")}>
      <PageHeader
        eyebrow="Pay"
        title="Payroll"
        icon={Wallet}
        description="Prepare, finalise and pay the month. Drafts use the salary in force, your tax table and priced overtime."
        actions={
          <>
            <MonthSwitch value={month} onChange={setMonth} className="w-full sm:w-auto" />
            {all.length > 0 && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 flex-1 rounded-xl px-3 sm:h-9 sm:flex-none" disabled={exporting}>
                    {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" aria-hidden />}
                    Export
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px] rounded-xl">
                  <DropdownMenuItem onSelect={exportCsv} className="gap-2.5 rounded-lg py-2">
                    <FileSpreadsheet className="h-4 w-4 text-success" aria-hidden />
                    <span className="flex flex-col">
                      <span className="text-[13px] font-medium">Spreadsheet (CSV)</span>
                      <span className="text-[11px] text-muted-foreground">Every figure, for Excel or your bank</span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportPdf()} className="gap-2.5 rounded-lg py-2">
                    <FileText className="h-4 w-4 text-destructive" aria-hidden />
                    <span className="flex flex-col">
                      <span className="text-[13px] font-medium">Payroll register (PDF)</span>
                      <span className="text-[11px] text-muted-foreground">Printable, with totals</span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {sheet.isError && (
        <Notice tone="danger" className="mb-4">
          <span className="font-semibold">The sheet could not load.</span> {errorMessage(sheet.error)}{" "}
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline" onClick={() => sheet.refetch()}>
            <RotateCcw className="h-3 w-3" aria-hidden />
            Try again
          </button>
        </Notice>
      )}

      <div className="mb-4 space-y-2 empty:hidden">
        {openEvents > 0 && (
          <Notice tone="warning" to="/payroll/updates" action="Review HR updates">
            {plural(openEvents, "change from HR", "changes from HR")} (joiners, leavers, promotions or unpaid leave) {openEvents === 1 ? "is" : "are"} waiting for you.
          </Notice>
        )}
        {otWaiting > 0 && (
          <Notice tone="warning" to="/payroll/overtime" action="Price overtime">
            {plural(otWaiting, "approved overtime entry", "approved overtime entries")} for people on this sheet {otWaiting === 1 ? "is" : "are"} waiting for a rate, so {otWaiting === 1 ? "it is" : "they are"} not on any payslip yet.
          </Notice>
        )}
        {missingNoSalary > 0 && (
          <Notice tone="warning" to="/payroll/salaries" action="Set salaries">
            {plural(missingNoSalary, "person")} on this sheet {missingNoSalary === 1 ? "has" : "have"} no salary on file, so {missingNoSalary === 1 ? "their draft would" : "their drafts would"} start at zero.
          </Notice>
        )}
      </div>

      {loading ? (
        <StatGridSkeleton />
      ) : (
        <StatGrid>
          <StatTile
            label="On the sheet"
            value={all.length}
            hint={!all.length ? "No one this month" : !missing ? "Everyone prepared" : !totals.prepared ? "None prepared yet" : `${totals.prepared} prepared · ${missing} to go`}
          />
          <StatTile label="Salaries in force" value={<TileMoney amount={totals.salary} />} hint={totals.other ? `+ ${format(totals.other)} other allowances` : `For ${label}`} />
          <StatTile
            label="Gross prepared"
            value={<TileMoney amount={totals.gross} />}
            hint={!totals.prepared ? "Nothing prepared yet" : !totals.deductions ? "No tax or deductions" : `${format(totals.tax)} tax · ${format(round2(totals.deductions - totals.tax))} other`}
          />
          <StatTile
            label={allPaid ? "Net paid" : "Net to pay"}
            value={<TileMoney amount={totals.net} />}
            tone={allPaid ? "success" : totals.net ? "primary" : "default"}
            hint={[totals.drafts && plural(totals.drafts, "draft"), totals.finals && `${totals.finals} final`, totals.paid && `${totals.paid} paid`].filter(Boolean).join(" · ") || "Nothing prepared yet"}
          />
        </StatGrid>
      )}

      {!loading && !sheet.isError && all.length === 0 ? (
        <SectionCard className="mt-4">
          <EmptyState
            icon={Wallet}
            title={`No one to pay in ${label}`}
            description="Active employees appear here from the month they join. HR adds people and their joining dates; Finance sets salaries."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/payroll/salaries">Open salaries</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <>
          {loading ? (
            <Skeleton className="mt-4 h-[188px] w-full rounded-2xl" />
          ) : allPaid ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-success/25 bg-success-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5" role="status">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground" aria-hidden>
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[15px] font-semibold text-foreground">{label} is paid</p>
                  <p className="tabular text-[13px] text-muted-foreground">
                    {plural(totals.paid, "payslip")}, {format(totals.net)} net
                    {paidDays.length ? `, paid ${paidDays.length === 1 ? `on ${formatDay(paidDays[0])}` : `between ${formatDay(paidDays[0])} and ${formatDay(paidDays[paidDays.length - 1])}`}` : ""}.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="h-9 shrink-0 self-start rounded-xl bg-card sm:self-auto">
                <Link to="/payroll/reports">Pay reports</Link>
              </Button>
            </div>
          ) : (
            <SectionCard className="mt-4" title={`Run ${label}`} description="Prepare drafts, check them, finalise so employees can see them, then record the payment.">
              <div className="grid gap-3 md:grid-cols-3">
                {(() => {
                  const n = all.length;
                  const finalised = totals.finals + totals.paid;
                  const done = [n > 0 && missing === 0, n > 0 && missing === 0 && totals.drafts === 0, n > 0 && totals.paid === n];
                  const current = done.findIndex((d) => !d);
                  return (
                    <>
                      <Step n={1} title="Prepare drafts" count={totals.prepared} total={n} done={done[0]} current={current === 0} text="One draft per person: the month's salary split and taxed, other allowance and priced overtime not yet paid.">
                        {missing > 0 ? (
                          <Button size="sm" variant={current === 0 ? "default" : "outline"} className="h-9 rounded-xl" disabled={pending} onClick={() => ask({ op: "prepare", ids: null, title: `Prepare ${plural(missing, "draft payslip")} for ${label}?`, description: "Each person without a payslip gets a draft. Nothing is shown to employees until you finalise.", confirmLabel: "Prepare drafts" })}>
                            <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                            Prepare {plural(missing, "draft")}
                          </Button>
                        ) : (
                          <span className="text-xs font-semibold text-success">Everyone has a payslip.</span>
                        )}
                        {stale > 0 && (
                          <Button size="sm" variant="outline" className="h-9 rounded-xl" disabled={pending} onClick={() => ask({ op: "refill_stale", ids: null, title: `Refill ${plural(stale, "draft")}?`, description: "Basic, allowances, other allowances, overtime and income tax are replaced from the salaries and priced overtime on file; extra lines, other deductions and notes stay.", confirmLabel: "Refill" })}>
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                            Refill {plural(stale, "changed draft")}
                          </Button>
                        )}
                      </Step>
                      <Step n={2} title="Finalise" count={finalised} total={n} done={done[1]} current={current === 1} text="Locks the figures and shows each payslip to its employee. Tick rows below to finalise only some.">
                        {totals.drafts ? (
                          <Button size="sm" variant={current === 1 ? "default" : "outline"} className="h-9 rounded-xl" disabled={pending} onClick={() => ask({ op: "finalise", ids: null, title: `Finalise ${plural(totals.drafts, "draft")} for ${label}?`, description: "Employees will see their payslips in the portal and be told they are ready.", confirmLabel: "Finalise" })}>
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                            Finalise {plural(totals.drafts, "draft")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{finalised ? "No drafts waiting." : "Prepare drafts first."}</span>
                        )}
                      </Step>
                      <Step n={3} title="Mark as paid" count={totals.paid} total={n} done={done[2]} current={current === 2} text="Records the transfer date on every final payslip, or tick rows to pay only some.">
                        {totals.finals ? (
                          <Button size="sm" variant={current === 2 ? "default" : "outline"} className="h-9 rounded-xl" disabled={pending} onClick={() => ask({ op: "paid", ids: null, title: `Mark ${plural(totals.finals, "final payslip")} for ${label} as paid?`, description: "Each employee is told their salary has been paid.", confirmLabel: "Mark paid", needsDate: true })}>
                            <Send className="h-3.5 w-3.5" aria-hidden />
                            Mark {totals.finals} paid
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{totals.paid && totals.paid === n ? "Everyone is paid." : "No final payslips waiting."}</span>
                        )}
                      </Step>
                    </>
                  );
                })()}
              </div>
            </SectionCard>
          )}

          {/* No overflow-hidden here: it would stop the table header from sticking while the page scrolls. */}
          <section className="mt-4 min-w-0 overflow-clip rounded-2xl border border-border bg-card shadow-sm" aria-label={`Payroll sheet for ${label}`}>
            <div className="space-y-3 border-b border-border/60 p-3 sm:p-4">
              <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name, code, position…">
                <Select value={dept} onValueChange={setDept}>
                  <SelectTrigger className="h-10 w-full rounded-xl text-[13px] sm:h-9 sm:w-48" aria-label="Department">
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
              </FilterBar>
              {loading ? (
                <div className="flex gap-1.5" aria-hidden>
                  {[64, 104, 64, 60, 56].map((w, i) => (
                    <Skeleton key={i} className="h-9 rounded-full" style={{ width: w }} />
                  ))}
                </div>
              ) : (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 hide-scrollbar" role="group" aria-label="Filter by payslip status">
                {chips.map(([k, l]) => {
                  const on = status === k;
                  const count = chipCounts[k || ""];
                  return (
                    <button
                      key={k || "all"}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setStatus(on && k ? "" : k)}
                      className={cn(
                        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.04]",
                        !on && count === 0 && "text-muted-foreground",
                        !on && (k === "refill" || k === "nosalary") && "border-warning/40 text-warning",
                      )}
                    >
                      {l}
                      <span className={cn("tabular rounded-full px-1.5 text-[11px] leading-4", on ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{count}</span>
                    </button>
                  );
                })}
              </div>
              )}
              {filtered && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Showing <span className="tabular font-semibold text-foreground">{rows.length}</span> of {all.length}.{" "}
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={clearFilters}>
                    Clear filters
                  </button>
                </p>
              )}
            </div>
            {loading ? (
              <TableSkeleton rows={8} columns={6} className="rounded-none border-0 shadow-none" />
            ) : (
              <SheetGrid
                rows={rows}
                caption={`Payroll sheet for ${label}`}
                sort={sort}
                dir={dir}
                onSort={(k, d) => {
                  setSort(k);
                  if (d) setDir(d);
                }}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                sums={sums}
                filtered={filtered}
                busyId={busyRow}
                actions={(r) => <RowButtons r={r} busy={busyRow === r.employee.id} disabled={pending} onRun={(op) => runRow(r, op)} onAsk={ask} label={label} onOpen={(id) => navigate(`/payroll/payslips/${id}`)} />}
                empty={
                  <EmptyState
                    compact
                    title="No one matches"
                    description="Try another name, department or status."
                    action={
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                }
              />
            )}
          </section>
        </>
      )}

      {(activity.data?.length ?? 0) > 0 && (
        <SectionCard className="mt-4" title="Recent payroll changes" icon={History} description="Visible to Finance and the owner only.">
          <ul className="divide-y divide-border/60">
            {activity.data!.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2.5 text-[13px] first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="min-w-0 text-foreground/90">{a.description}</span>
                <time dateTime={a.created_at} title={formatDateTime(a.created_at)} className="shrink-0 text-[11px] text-muted-foreground">
                  {formatRelative(a.created_at)}
                </time>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {selectedRows.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 flex justify-center pb-safe sm:inset-x-6">
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-2 pl-4 shadow-xl backdrop-blur" role="region" aria-label="Actions for ticked people">
            <span className="tabular text-[13px] font-semibold text-foreground">{plural(selectedRows.length, "person", "people")} ticked</span>
            <BulkBar selected={selectedRows} pending={pending} label={label} onAsk={(c) => ask({ ...c, onDone: () => setSelected(new Set()) })} />
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setSelected(new Set())} aria-label="Clear the ticks">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        destructive={!!confirm?.destructive}
        confirmDisabled={!!confirm?.needsDate && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)}
        onConfirm={async () => {
          if (!confirm) return;
          await run(month, confirm.op, confirm.ids, confirm.needsDate ? paidOn : null);
          confirm.onDone?.();
        }}
      >
        {confirm?.needsDate && (
          <div className="space-y-1.5">
            <Label htmlFor="paid-on" className="micro-label">
              Paid on
            </Label>
            <Input id="paid-on" type="date" value={paidOn} max={toDbDate(new Date(Date.now() + 62 * 864e5))} onChange={(e) => setPaidOn(e.target.value)} className="h-10 rounded-xl" />
            <p className="text-[11px] text-muted-foreground">The day the money left the account.</p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** One step of the month, with how far it has got. On phones the explanation is left out. */
function Step({ n, title, text, count, total, done, current, children }: { n: number; title: string; text: string; count: number; total: number; done: boolean; current: boolean; children: ReactNode }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className={cn("flex flex-col rounded-xl border p-3 sm:p-3.5", current ? "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/10" : "border-border/70 bg-muted/20")} aria-current={current ? "step" : undefined}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-foreground">
          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", done ? "bg-success text-success-foreground" : current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-hidden>
            {done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
          </span>
          <span className="truncate">{title}</span>
          {done && <span className="sr-only">(done)</span>}
        </p>
        <span className="tabular shrink-0 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{count}</span> of {total}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${title}: ${count} of ${total}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={count}>
        <div className={cn("h-full rounded-full transition-[width] duration-500", done ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 hidden flex-1 text-xs leading-5 text-muted-foreground sm:block">{text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Money in a stat tile: compact on phones (two tiles a row), in full from 640px up. */
function TileMoney({ amount }: { amount: number }) {
  const { format } = useMoney();
  return (
    <>
      <span className="sm:hidden" title={format(amount)}>
        {format(amount, amount >= 1_000_000 ? { compact: true } : { decimals: 0 })}
      </span>
      <span className="hidden sm:inline">{format(amount)}</span>
    </>
  );
}

/** What can be done with one row without opening it, by where its payslip is. */
function RowButtons({
  r,
  busy,
  disabled,
  label,
  onRun,
  onAsk,
  onOpen,
}: {
  r: SheetRow;
  busy: boolean;
  disabled: boolean;
  label: string;
  onRun: (op: SheetOp) => void;
  onAsk: (c: PendingConfirm) => void;
  onOpen: (id: string) => void;
}) {
  const p = r.payslip;
  const e = r.employee;
  if (busy) return <Loader2 className="ml-auto inline-block h-4 w-4 animate-spin text-muted-foreground" aria-label="Working" />;
  const btn = "h-9 rounded-xl px-3 sm:h-8";
  if (!p) {
    return (
      <Button size="sm" variant="outline" className={btn} disabled={disabled} onClick={() => onRun("prepare")} aria-label={`Prepare ${e.name}'s draft`}>
        Prepare
      </Button>
    );
  }
  const ids = [e.id];
  return (
    <div className="inline-flex items-center justify-end gap-1">
      {p.status === "draft" && (
        <Button size="sm" variant="outline" className={btn} disabled={disabled} onClick={() => onAsk({ op: "finalise", ids, title: `Finalise ${e.name}'s ${label} payslip?`, description: "They will see it in the portal and be told it is ready.", confirmLabel: "Finalise" })}>
          Finalise
        </Button>
      )}
      {p.status === "final" && (
        <Button size="sm" variant="outline" className={btn} disabled={disabled} onClick={() => onAsk({ op: "paid", ids, title: `Mark ${e.name}'s ${label} payslip as paid?`, description: "They are told their salary has been paid.", confirmLabel: "Mark paid", needsDate: true })}>
          Mark paid
        </Button>
      )}
      <RowActions
        label={`${e.name}: payslip actions`}
        className="h-9 w-9 sm:h-8 sm:w-8"
        actions={[
          { label: p.status === "draft" ? "Edit payslip" : "Open payslip", onSelect: () => onOpen(p.id) },
          {
            label: "Refill from salary on file",
            hidden: p.status !== "draft",
            onSelect: () => onRun("refill"),
            destructive: false,
            // It overwrites figures typed into the draft (including income tax set by hand), so it asks like the bulk refill does.
            confirm: { title: `Refill ${e.name}'s ${label} draft?`, description: "Basic, allowances, other allowances, overtime and income tax are replaced from the salary and priced overtime on file; extra lines, other deductions and notes stay.", confirmLabel: "Refill" },
          },
          {
            label: "Reopen as draft",
            hidden: p.status !== "final",
            onSelect: () => onRun("reopen"),
            destructive: false,
            confirm: { title: `Reopen ${e.name}'s ${label} payslip?`, description: "It disappears from their payslips until finalised again, and they are told it is being corrected.", confirmLabel: "Reopen" },
          },
          {
            label: "Undo paid",
            hidden: p.status !== "paid",
            onSelect: () => onRun("unpaid"),
            destructive: false,
            confirm: { title: `Undo the payment mark on ${e.name}'s ${label} payslip?`, description: "It goes back to final, not paid. The employee is not told.", confirmLabel: "Undo paid" },
          },
          {
            label: "Delete draft",
            destructive: true,
            separated: true,
            hidden: p.status !== "draft",
            onSelect: () => onRun("delete"),
            confirm: { title: `Delete ${e.name}'s ${label} draft?`, description: "Overtime it carried goes back for the next draft. This cannot be undone.", confirmLabel: "Delete" },
          },
        ]}
      />
    </div>
  );
}

/** The bar for ticked rows: each step shows how many of the ticked people it applies to. */
function BulkBar({ selected, pending, label, onAsk }: { selected: SheetRow[]; pending: boolean; label: string; onAsk: (c: PendingConfirm) => void }) {
  const count = (fn: (r: SheetRow) => boolean) => selected.filter(fn).length;
  const ids = selected.map((r) => r.employee.id);
  const n = {
    prepare: count((r) => !r.payslip),
    draft: count((r) => r.payslip?.status === "draft"),
    final: count((r) => r.payslip?.status === "final"),
    paid: count((r) => r.payslip?.status === "paid"),
  };
  const items: Array<{ op: SheetOp; label: string; n: number; title: string; description: string; destructive?: boolean; primary?: boolean; needsDate?: boolean }> = [
    { op: "prepare", label: "Prepare", n: n.prepare, primary: true, title: `Prepare ${plural(n.prepare, "draft payslip")} for ${label}?`, description: "Drafts are for Finance only until finalised." },
    { op: "finalise", label: "Finalise", n: n.draft, primary: true, title: `Finalise ${plural(n.draft, "payslip")} for ${label}?`, description: "Employees will see them in the portal." },
    { op: "paid", label: "Mark paid", n: n.final, primary: true, needsDate: true, title: `Mark ${plural(n.final, "payslip")} for ${label} as paid?`, description: "Each employee is told their salary has been paid." },
    { op: "refill", label: "Refill", n: n.draft, title: `Refill ${plural(n.draft, "draft")}?`, description: "Basic, allowances, other allowances, overtime and income tax are replaced; extra lines, other deductions and notes stay." },
    { op: "reopen", label: "Reopen", n: n.final, title: `Reopen ${plural(n.final, "payslip")} as drafts?`, description: "They disappear from the employees' payslips until finalised again." },
    { op: "unpaid", label: "Undo paid", n: n.paid, title: `Undo the payment mark on ${plural(n.paid, "payslip")}?`, description: "They go back to final, not paid." },
    { op: "delete", label: "Delete drafts", n: n.draft, destructive: true, title: `Delete ${plural(n.draft, "draft payslip")}?`, description: "Their overtime goes back for the next draft. This cannot be undone." },
  ];
  return (
    <>
      {items
        .filter((i) => i.n > 0)
        .map((i) => (
          <Button
            key={i.op}
            size="sm"
            variant={i.destructive ? "ghost" : i.primary ? "default" : "outline"}
            className={cn("h-9 rounded-xl", i.destructive && "text-destructive hover:bg-danger-soft hover:text-destructive")}
            disabled={pending}
            onClick={() => onAsk({ op: i.op, ids, title: i.title, description: i.description, confirmLabel: i.label, destructive: i.destructive, needsDate: i.needsDate })}
          >
            {i.label}
            <span className="tabular opacity-80">({i.n})</span>
          </Button>
        ))}
    </>
  );
}
