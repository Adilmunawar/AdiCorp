import { useRef, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowDownAZ, ArrowUp, ArrowUpAZ, ChevronsUpDown } from "lucide-react";
import { StatusBadge, initials, useMoney } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { round2 } from "../lib/calc";
import type { SheetRow } from "../lib/types";
import { useWidth } from "./useWidth";
import { PayslipStatusBadge, formatDay, formatHours, partMonthHint, plural } from "./bits";

export type SheetSortKey = "name" | "code" | "department" | "salary" | "overtime" | "gross" | "deductions" | "net" | "status";

export interface SheetSums {
  salary: number;
  other: number;
  overtime: number;
  hours: number;
  gross: number;
  tax: number;
  deductions: number;
  net: number;
  prepared: number;
}

const STATUS_ORDER = { none: 0, draft: 1, final: 2, paid: 3 } as const;

export const statusOf = (r: SheetRow) => r.payslip?.status ?? "none";
export const needsRefill = (r: SheetRow) => !!r.payslip && r.payslip.status === "draft" && (r.salary_stale || r.overtime_stale);
/** The payslip was filled from a different salary than the one in force for the month. */
const basisDiffers = (r: SheetRow) => !!r.payslip && !r.payslip.legacy && Math.round(r.payslip.salary_basis) !== Math.round(r.pay.monthly_salary);

export function sortSheet(rows: SheetRow[], sort: SheetSortKey, dir: "asc" | "desc"): SheetRow[] {
  const key: Record<SheetSortKey, (r: SheetRow) => string | number> = {
    name: (r) => r.employee.name.toLowerCase(),
    code: (r) => r.employee.code ?? "~",
    department: (r) => `${r.employee.department || "~"} ${r.employee.name}`.toLowerCase(),
    salary: (r) => r.pay.monthly_salary,
    overtime: (r) => r.overtime.amount,
    gross: (r) => r.payslip?.gross_salary ?? -1,
    deductions: (r) => r.payslip?.total_deductions ?? -1,
    net: (r) => r.payslip?.net_salary ?? -1,
    status: (r) => STATUS_ORDER[statusOf(r)],
  };
  const k = key[sort];
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = k(a);
    const y = k(b);
    return x < y ? -sign : x > y ? sign : a.employee.name.localeCompare(b.employee.name);
  });
}

export function sumSheet(rows: SheetRow[]): SheetSums {
  const s: SheetSums = { salary: 0, other: 0, overtime: 0, hours: 0, gross: 0, tax: 0, deductions: 0, net: 0, prepared: 0 };
  for (const r of rows) {
    s.salary += Number(r.pay.monthly_salary) || 0;
    s.other += Number(r.pay.other_allowance) || 0;
    s.overtime += r.overtime.amount;
    s.hours += r.overtime.hours;
    if (r.payslip) {
      s.prepared++;
      s.gross += r.payslip.gross_salary;
      s.tax += r.payslip.income_tax;
      s.deductions += r.payslip.total_deductions;
      s.net += r.payslip.net_salary;
    }
  }
  // Figures carry paisa (basic is a share of the salary): adding them as floats leaves dust like .0000001.
  return { ...s, salary: round2(s.salary), other: round2(s.other), overtime: round2(s.overtime), hours: round2(s.hours), gross: round2(s.gross), tax: round2(s.tax), deductions: round2(s.deductions), net: round2(s.net) };
}

type Mode = "cards" | "compact" | "medium" | "wide";
const modeFor = (w: number): Mode => (w < 640 ? "cards" : w < 880 ? "compact" : w < 1080 ? "medium" : "wide");

const SORT_LABEL: Array<[SheetSortKey, string]> = [
  ["name", "Name"],
  ["department", "Department"],
  ["salary", "Salary"],
  ["overtime", "Overtime"],
  ["gross", "Gross"],
  ["deductions", "Deductions"],
  ["net", "Net pay"],
  ["status", "Status"],
];

export interface SheetGridProps {
  rows: SheetRow[];
  /** Every row the filters allow, for the totals' "of" count. */
  caption: string;
  sort: SheetSortKey;
  dir: "asc" | "desc";
  onSort: (key: SheetSortKey, dir?: "asc" | "desc") => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  actions: (r: SheetRow) => ReactNode;
  sums: SheetSums;
  filtered: boolean;
  empty: ReactNode;
  busyId?: string | null;
}

/**
 * The payroll sheet. A real table whose columns fold away as the space narrows (so it never scrolls sideways),
 * with a sticky header and a totals row under the figures; below 640px of room, one card per person.
 */
export function SheetGrid({ rows, caption, sort, dir, onSort, selected, onToggle, onToggleAll, actions, sums, filtered, empty, busyId }: SheetGridProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const mode = modeFor(width);
  const { format } = useMoney();
  const ids = rows.map((r) => r.employee.id);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));

  const rowLinks = useRef(new Map<string, HTMLAnchorElement>());
  const money = (v: number | null | undefined, cls?: string) => <span className={cn("tabular whitespace-nowrap", cls)}>{format(v ?? 0)}</span>;
  const dash = <span className="text-muted-foreground">—</span>;

  /** Clicks on the row open the payslip, except on its own controls. */
  const rowClick = (r: SheetRow) => (e: MouseEvent) => {
    if (!r.payslip) return;
    // Menus and dialogs render in portals but still bubble through React: only clicks inside the row itself count.
    if (!(e.currentTarget as HTMLElement).contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest("button, a, input, label, [role=checkbox], [role=menuitem], [role=dialog], [role=alertdialog]")) return;
    rowLinks.current.get(r.employee.id)?.click();
  };
  const linkRef = (id: string) => (el: HTMLAnchorElement | null) => {
    if (el) rowLinks.current.set(id, el);
    else rowLinks.current.delete(id);
  };

  const name = (r: SheetRow, cls?: string) =>
    r.payslip ? (
      <Link ref={linkRef(r.employee.id)} to={`/payroll/payslips/${r.payslip.id}`} className={cn("rounded font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", cls)} title={`Open ${r.employee.name}'s payslip`}>
        {r.employee.name}
      </Link>
    ) : (
      <span className={cn("font-semibold text-foreground", cls)}>{r.employee.name}</span>
    );

  const meta = (r: SheetRow) => [r.employee.code, r.employee.rank, r.employee.department, r.pay.pay_method === "cash" ? "Paid in cash" : null].filter(Boolean).join(" · ") || "—";

  const salaryNotes = (r: SheetRow) => (
    <>
      {r.pay.other_allowance ? <span className="tabular block text-[11px] text-muted-foreground">+ {format(r.pay.other_allowance)} other</span> : null}
      {r.pay.prorated && (
        <span className="tabular block text-[11px] text-warning" title="Worked out from HR's dates, approved unpaid leave and salary changes">
          {r.pay.paid_days} of {r.pay.month_days} days · {partMonthHint(r.pay)}
        </span>
      )}
      {basisDiffers(r) && (
        <span className={cn("tabular block text-[11px]", r.payslip?.status === "draft" ? "font-semibold text-warning" : "text-muted-foreground")} title="The payslip was filled from this salary">
          Payslip used {format(r.payslip!.salary_basis)}
        </span>
      )}
    </>
  );

  const statusNote = (r: SheetRow) => {
    const p = r.payslip;
    if (p?.status === "paid" && p.paid_on) return <span className="text-muted-foreground">Paid {formatDay(p.paid_on).replace(/ \d{4}$/, "")}</span>;
    if (needsRefill(r)) return <span className="font-semibold text-warning">{r.salary_stale ? "Salary changed" : "Overtime changed"}</span>;
    if (p?.legacy) return <span className="text-muted-foreground">Earlier payroll</span>;
    if (p?.status === "final") return <span className="text-muted-foreground">{p.seen_at ? "Seen by employee" : "Not opened yet"}</span>;
    if (!p && (!r.pay.has_salary || !r.pay.monthly_salary)) return <span className="font-semibold text-destructive">No salary</span>;
    return null;
  };

  const otToPrice = (r: SheetRow) =>
    r.overtime_waiting > 0 ? (
      <Link to="/payroll/overtime" className="block rounded text-[11px] font-semibold text-warning hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {r.overtime_waiting} overtime to price
      </Link>
    ) : null;

  if (rows.length === 0) {
    return <div ref={ref}>{empty}</div>;
  }

  /* ------------------------------------------------------------------ cards */
  if (mode === "cards") {
    return (
      <div ref={ref} className="min-w-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
          <label className="flex h-10 items-center gap-2.5 text-xs font-medium text-muted-foreground">
            <Checkbox checked={all ? true : some ? "indeterminate" : false} onCheckedChange={() => onToggleAll(ids, !all)} aria-label="Select everyone shown" />
            Select all
          </label>
          <div className="flex items-center gap-1.5">
            <Select value={sort} onValueChange={(v) => onSort(v as SheetSortKey, v === "name" || v === "department" ? "asc" : "desc")}>
              <SelectTrigger className="h-10 w-[9.5rem] rounded-xl text-[13px]" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_LABEL.map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    Sort: {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => onSort(sort, dir === "asc" ? "desc" : "asc")} aria-label={dir === "asc" ? "Sorted ascending; sort descending" : "Sorted descending; sort ascending"}>
              {dir === "asc" ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-border/60" aria-label={caption}>
          {rows.map((r) => {
            const p = r.payslip;
            const on = selected.has(r.employee.id);
            return (
              <li key={r.employee.id} onClick={rowClick(r)} className={cn("px-4 py-3.5 transition-colors", p && "cursor-pointer active:bg-muted/50", on && "bg-primary/[0.04]", needsRefill(r) && !on && "bg-warning/[0.05]")}>
                <div className="flex items-start gap-2">
                  <label className="-ml-2.5 -mt-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
                    <Checkbox checked={on} onCheckedChange={() => onToggle(r.employee.id)} aria-label={`Select ${r.employee.name}`} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{name(r)}</p>
                        <p className="truncate text-[11.5px] text-muted-foreground" title={meta(r)}>
                          {meta(r)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <PayslipStatusBadge status={p?.status} />
                        {statusNote(r) && <p className="mt-0.5 text-[11px]">{statusNote(r)}</p>}
                      </div>
                    </div>
                    <dl className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <dt className="micro-label !text-[10px]">Salary</dt>
                        <dd className="tabular truncate text-[13px] text-foreground">{r.pay.monthly_salary ? format(r.pay.monthly_salary) : <span className="text-destructive">Not set</span>}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="micro-label !text-[10px]">Gross</dt>
                        <dd className="tabular truncate text-[13px] text-foreground">{p ? format(p.gross_salary) : dash}</dd>
                      </div>
                      <div className="min-w-0 text-right">
                        <dt className="micro-label !text-[10px]">Net</dt>
                        <dd className="tabular truncate text-[13px] font-bold text-foreground">{p ? format(p.net_salary) : dash}</dd>
                      </div>
                    </dl>
                    <div className="mt-1.5 space-y-0.5 text-[11px]">
                      {salaryNotes(r)}
                      {p && p.total_deductions > 0 && (
                        <span className="tabular block text-muted-foreground">
                          Deductions {format(p.total_deductions)}
                          {p.income_tax > 0 ? ` (tax ${format(p.income_tax)})` : ""}
                        </span>
                      )}
                      {otToPrice(r)}
                    </div>
                    <div className="mt-2.5 flex items-center justify-end gap-1.5">{actions(r)}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border bg-muted/40 px-4 py-3">
          <TotalItem label={filtered ? "Shown" : "Total"} value={plural(rows.length, "person", "people")} />
          <TotalItem label="Salaries" value={format(sums.salary)} />
          <TotalItem label="Gross" value={format(sums.gross)} hint={`${sums.prepared} of ${rows.length} prepared`} />
          <TotalItem label="Deductions" value={format(sums.deductions)} hint={sums.tax ? `Tax ${format(sums.tax)}` : undefined} />
          <TotalItem label="Net pay" value={format(sums.net)} strong className="col-span-2" />
        </dl>
      </div>
    );
  }

  /* ------------------------------------------------------------------ table */
  const showOvertime = mode === "wide";
  const showDeductions = mode === "wide";
  const showGross = mode !== "compact";
  const showStatusCol = mode !== "compact";

  const th = "sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
  const sortHead = (key: SheetSortKey, label: string, align: "left" | "right" = "right") => {
    const active = sort === key;
    return (
      <th scope="col" className={cn(th, align === "right" ? "text-right" : "text-left")} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
        <button
          type="button"
          onClick={() => onSort(key, active ? (dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc")}
          className={cn("inline-flex items-center gap-1 rounded uppercase tracking-[0.06em] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground", align === "right" && "flex-row-reverse")}
          title={`Sort by ${label.toLowerCase()}`}
        >
          {label}
          {active ? dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden /> : <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />}
        </button>
      </th>
    );
  };
  const td = "px-3 py-2.5 align-top";
  // Figures never break; the small notes under them may wrap when room is short.
  const num = "px-3 py-2.5 text-right align-top tabular text-[13px] [&>span.block]:text-balance";
  const tf = "whitespace-nowrap border-t-2 border-border bg-muted/60 px-3 py-3 text-right align-top tabular";

  return (
    <div ref={ref} className="min-w-0">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(th, "w-11 pl-4 pr-1")}>
              <Checkbox checked={all ? true : some ? "indeterminate" : false} onCheckedChange={() => onToggleAll(ids, !all)} aria-label="Select everyone shown" />
            </th>
            {sortHead("name", "Employee", "left")}
            {sortHead("salary", "Salary")}
            {showOvertime && sortHead("overtime", "Overtime")}
            {showGross && sortHead("gross", "Gross")}
            {showDeductions && sortHead("deductions", "Deductions")}
            {sortHead("net", "Net pay")}
            {showStatusCol && sortHead("status", "Status", "left")}
            <th scope="col" className={cn(th, "pr-4 text-right")}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.payslip;
            const on = selected.has(r.employee.id);
            const busy = busyId === r.employee.id;
            return (
              <tr key={r.employee.id} onClick={rowClick(r)} className={cn("group transition-colors [&>td]:border-b [&>td]:border-border/60", p && "cursor-pointer", on ? "bg-primary/[0.05]" : needsRefill(r) ? "bg-warning/[0.05] hover:bg-warning/[0.09]" : "hover:bg-muted/50", busy && "opacity-60")}>
                <td className={cn(td, "w-11 pl-4 pr-1")}>
                  <Checkbox checked={on} onCheckedChange={() => onToggle(r.employee.id)} aria-label={`Select ${r.employee.name}`} className="mt-0.5" />
                </td>
                <td className={cn(td, "w-full max-w-0")}>
                  <div className="flex min-w-0 items-start gap-2.5">
                    {mode !== "compact" && (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/[0.08] text-[11px] font-bold text-primary" aria-hidden>
                        {initials(r.employee.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{name(r)}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground" title={meta(r)}>
                        {meta(r)}
                      </p>
                      {r.employee.status !== "active" && <StatusBadge status={r.employee.status} className="mt-1" />}
                      {!showStatusCol && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                          <PayslipStatusBadge status={p?.status} />
                          {statusNote(r)}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className={num}>
                  {r.pay.monthly_salary ? money(r.pay.monthly_salary) : <span className="text-xs font-semibold text-destructive">Not set</span>}
                  {salaryNotes(r)}
                </td>
                {showOvertime && (
                  <td className={num}>
                    {r.overtime.amount || r.overtime.hours ? (
                      <>
                        {money(r.overtime.amount)}
                        <span className="block text-[11px] text-muted-foreground">{formatHours(r.overtime.hours)}</span>
                      </>
                    ) : !r.overtime_waiting ? (
                      dash
                    ) : null}
                    {otToPrice(r)}
                  </td>
                )}
                {showGross && (
                  <td className={num}>
                    {p ? money(p.gross_salary) : dash}
                    {!showOvertime && p && p.overtime_earnings > 0 && <span className="block text-[11px] text-muted-foreground">incl. {format(p.overtime_earnings)} overtime</span>}
                    {!showDeductions && p && p.total_deductions > 0 && (
                      <span className="block text-[11px] text-muted-foreground" title={p.income_tax ? `Income tax ${format(p.income_tax)}, other ${format(Math.max(0, p.total_deductions - p.income_tax))}` : undefined}>
                        less {format(p.total_deductions)}
                      </span>
                    )}
                    {!showOvertime && otToPrice(r)}
                  </td>
                )}
                {showDeductions && (
                  <td className={num}>
                    {p ? p.total_deductions ? money(p.total_deductions) : dash : dash}
                    {p && p.income_tax > 0 && <span className="block text-[11px] text-muted-foreground">tax {format(p.income_tax)}</span>}
                  </td>
                )}
                <td className={num}>
                  {p ? money(p.net_salary, "font-bold text-foreground") : dash}
                  {!showGross && p && <span className="block text-[11px] text-muted-foreground">of {format(p.gross_salary)} gross</span>}
                  {!showGross && otToPrice(r)}
                </td>
                {showStatusCol && (
                  <td className={cn(td, "whitespace-nowrap")}>
                    <PayslipStatusBadge status={p?.status} />
                    {statusNote(r) && <p className="mt-0.5 text-[11px]">{statusNote(r)}</p>}
                  </td>
                )}
                <td className={cn(td, "whitespace-nowrap pr-4 text-right")}>{actions(r)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className={cn(tf, "pl-4 pr-1")} />
            <th scope="row" className={cn(tf, "text-left font-sans")}>
              <span className="block text-[13px] font-bold text-foreground">{filtered ? "Shown" : "Total"}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">
                {plural(rows.length, "person", "people")} · {sums.prepared} prepared
              </span>
            </th>
            <td className={tf}>
              <span className="block font-semibold text-foreground">{format(sums.salary)}</span>
              {sums.other > 0 && <span className="block text-[11px] text-muted-foreground">+ {format(sums.other)} other</span>}
            </td>
            {showOvertime && (
              <td className={tf}>
                <span className="block font-semibold text-foreground">{sums.overtime ? format(sums.overtime) : "—"}</span>
                {sums.hours > 0 && <span className="block text-[11px] text-muted-foreground">{formatHours(sums.hours)}</span>}
              </td>
            )}
            {showGross && (
              <td className={tf}>
                <span className="block font-semibold text-foreground">{format(sums.gross)}</span>
                {!showDeductions && sums.deductions > 0 && <span className="block text-[11px] text-muted-foreground">less {format(sums.deductions)}</span>}
              </td>
            )}
            {showDeductions && (
              <td className={tf}>
                <span className="block font-semibold text-foreground">{format(sums.deductions)}</span>
                {sums.tax > 0 && <span className="block text-[11px] text-muted-foreground">tax {format(sums.tax)}</span>}
              </td>
            )}
            <td className={tf}>
              <span className="block font-bold text-primary">{format(sums.net)}</span>
              {!showGross && <span className="block text-[11px] text-muted-foreground">of {format(sums.gross)} gross</span>}
            </td>
            {showStatusCol && <td className={cn(tf, "text-left")} />}
            <td className={cn(tf, "pr-4")} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TotalItem({ label, value, hint, strong, className }: { label: string; value: string; hint?: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="micro-label">{label}</dt>
      <dd className={cn("tabular truncate", strong ? "text-base font-bold text-primary" : "text-[13px] font-semibold text-foreground")}>{value}</dd>
      {hint && <dd className="tabular truncate text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}
