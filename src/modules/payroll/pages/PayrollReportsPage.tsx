import { useMemo, useState } from "react";
import { BarChart3, Building2, ChevronDown, Download, FileSpreadsheet, FileText, Landmark, Loader2, Receipt, Scale, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  CHART_CHROME,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatGrid,
  StatTile,
  StatusBadge,
  TableSkeleton,
  chartColor,
  downloadCsv,
  exportTablePdf,
  formatDate,
  formatMonth,
  formatNumber,
  useCompany,
  useMoney,
  type DataColumn,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage, shiftMonthKey, thisMonthKey, usePayrollReport } from "../lib/api";
import { round2 } from "../lib/calc";
import type { ReportDepartment, ReportMonth } from "../lib/types";
import { Notice, formatDay, plural } from "../components/bits";
import { useWidth } from "../components/useWidth";

const RANGES = [
  ["6", "Last 6 months"],
  ["12", "Last 12 months"],
  ["24", "Last 24 months"],
  ["ytd", "This year so far"],
] as const;

/** Net, tax and other deductions stack up to gross; colours from the chart palette. */
const SERIES = [
  { key: "net", label: "Net pay", color: chartColor(0) },
  { key: "tax", label: "Income tax", color: chartColor(3) },
  { key: "other", label: "Other deductions", color: chartColor(4) },
] as const;

/** 12,500,000 -> "12.5M" for axis ticks; the unit sits in the chart's description. */
function compact(v: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

function monthState(m: ReportMonth): { label: string; tone: "success" | "primary" | "warning" | "neutral" } | null {
  if (!m.payslips) return null;
  if (m.paid === m.payslips) return { label: "Paid", tone: "success" };
  if (m.drafts) return { label: m.drafts === m.payslips ? "Draft" : `${m.drafts} draft`, tone: "warning" };
  if (m.paid) return { label: `${m.paid} of ${m.payslips} paid`, tone: "primary" };
  return { label: "Final, not paid", tone: "primary" };
}

export default function PayrollReportsPage() {
  const [range, setRange] = useState<string>("12");
  const to = thisMonthKey();
  const from = range === "ytd" ? `${to.slice(0, 4)}-01-01` : shiftMonthKey(to, -(Number(range) - 1));
  const q = usePayrollReport(from, to);
  const { format } = useMoney();
  const { company } = useCompany();
  const [monthsRef, monthsWidth] = useWidth<HTMLDivElement>();
  const [deptRef, deptWidth] = useWidth<HTMLDivElement>();
  const [exporting, setExporting] = useState(false);

  const months = useMemo(() => q.data?.months ?? [], [q.data]);
  const depts = useMemo(() => q.data?.departments ?? [], [q.data]);
  const withPay = months.filter((m) => m.payslips > 0);
  const total = useMemo(() => {
    const t = months.reduce(
      (s, m) => ({ gross: s.gross + m.gross, tax: s.tax + m.tax, net: s.net + m.net, paidNet: s.paidNet + m.paid_net, overtime: s.overtime + m.overtime, deductions: s.deductions + m.deductions, payslips: s.payslips + m.payslips }),
      { gross: 0, tax: 0, net: 0, paidNet: 0, overtime: 0, deductions: 0, payslips: 0 },
    );
    // Monthly sums carry paisa; adding them as floats would print dust like .0000001 in the totals.
    return { ...t, gross: round2(t.gross), tax: round2(t.tax), net: round2(t.net), paidNet: round2(t.paidNet), overtime: round2(t.overtime), deductions: round2(t.deductions) };
  }, [months]);
  const unpaidNet = round2(total.net - total.paidNet);
  const average = withPay.length ? round2(total.gross / withPay.length) : 0;
  const deptGross = depts.reduce((s, d) => s + d.gross, 0);
  const chart = months.map((m) => ({
    label: formatDate(m.month, "MMM ’yy"),
    month: m.month,
    net: m.net,
    tax: m.tax,
    other: Math.max(0, round2(m.deductions - m.tax)),
    gross: m.gross,
  }));
  const rangeLabel = `${formatMonth(from)} to ${formatMonth(to)}`;

  /** Money cell that reads as a quiet dash for months with no payslips. */
  const amount = (m: ReportMonth, v: number, strong = false) => (m.payslips ? <span className={strong ? "tabular font-semibold" : "tabular"}>{format(v)}</span> : <span className="text-muted-foreground">—</span>);

  const mWide = monthsWidth >= 600;
  const mRoomy = monthsWidth >= 740;
  const monthCols: DataColumn<ReportMonth>[] = [
    {
      id: "month",
      header: "Month",
      cell: (m) => (
        <div>
          <span className={m.payslips ? "font-semibold" : "font-semibold text-muted-foreground"}>{formatMonth(m.month)}</span>
          {!m.payslips && <span className="block text-[11px] text-muted-foreground">No payroll</span>}
          {m.payslips > 0 && !mRoomy && <span className="tabular block text-[11px] text-muted-foreground">{plural(m.payslips, "payslip")}</span>}
        </div>
      ),
      sortValue: (m) => m.month,
    },
    ...(mRoomy ? [{ id: "payslips", header: "Payslips", align: "right", cell: (m: ReportMonth) => (m.payslips ? <span className="tabular">{m.payslips}</span> : <span className="text-muted-foreground">—</span>), sortValue: (m: ReportMonth) => m.payslips } as DataColumn<ReportMonth>] : []),
    { id: "gross", header: "Gross", align: "right", cell: (m) => amount(m, m.gross), sortValue: (m) => m.gross },
    ...(monthsWidth >= 860 ? [{ id: "overtime", header: "Overtime", align: "right", cell: (m: ReportMonth) => amount(m, m.overtime), sortValue: (m: ReportMonth) => m.overtime } as DataColumn<ReportMonth>] : []),
    ...(mWide ? [{ id: "tax", header: "Tax", align: "right", cell: (m: ReportMonth) => amount(m, m.tax), sortValue: (m: ReportMonth) => m.tax } as DataColumn<ReportMonth>] : []),
    { id: "net", header: "Net", align: "right", cell: (m) => amount(m, m.net, true), sortValue: (m) => m.net },
    {
      id: "state",
      header: "Status",
      align: "right",
      cell: (m) => {
        const s = monthState(m);
        return s ? <StatusBadge status={s.label} label={s.label} tone={s.tone} /> : <span className="text-muted-foreground">—</span>;
      },
    },
  ];

  const dWide = deptWidth >= 520;
  const deptCols: DataColumn<ReportDepartment>[] = [
    {
      id: "department",
      header: "Department",
      cell: (d) => {
        const share = deptGross ? (d.gross / deptGross) * 100 : 0;
        return (
          <div className="min-w-0">
            <p className="truncate font-semibold" title={d.department}>
              {d.department}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: chartColor(0) }} />
              </div>
              <span className="tabular text-[11px] text-muted-foreground">{formatNumber(share, 1)}%</span>
            </div>
          </div>
        );
      },
      sortValue: (d) => d.department,
    },
    { id: "people", header: "People", align: "right", cell: (d) => <span className="tabular">{d.people}</span>, sortValue: (d) => d.people },
    { id: "gross", header: "Gross", align: "right", cell: (d) => <span className="tabular">{format(d.gross)}</span>, sortValue: (d) => d.gross },
    ...(dWide ? [{ id: "tax", header: "Tax", align: "right", cell: (d: ReportDepartment) => <span className="tabular">{format(d.tax)}</span>, sortValue: (d: ReportDepartment) => d.tax } as DataColumn<ReportDepartment>] : []),
    ...(dWide ? [{ id: "net", header: "Net", align: "right", cell: (d: ReportDepartment) => <span className="tabular font-semibold">{format(d.net)}</span>, sortValue: (d: ReportDepartment) => d.net } as DataColumn<ReportDepartment>] : []),
  ];

  const exportCsv = () =>
    downloadCsv(months, `payroll-cost-${from.slice(0, 7)}-to-${to.slice(0, 7)}`, [
      { header: "Month", value: (m) => m.month.slice(0, 7) },
      { header: "Payslips", value: (m) => m.payslips },
      { header: "Draft", value: (m) => m.drafts },
      { header: "Final", value: (m) => m.finals },
      { header: "Paid", value: (m) => m.paid },
      { header: "Basic", value: (m) => m.basic },
      { header: "Allowances", value: (m) => m.allowances },
      { header: "Other allowances", value: (m) => m.other_allowances },
      { header: "Overtime", value: (m) => m.overtime },
      { header: "Gross", value: (m) => m.gross },
      { header: "Income tax", value: (m) => m.tax },
      { header: "Total deductions", value: (m) => m.deductions },
      { header: "Net", value: (m) => m.net },
      { header: "Net paid", value: (m) => m.paid_net },
    ]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportTablePdf({
        title: "Payroll cost report",
        subtitle: `${rangeLabel} · generated ${formatDay(new Date())}`,
        company: { name: company?.name, logo: company?.logo },
        orientation: "landscape",
        filename: `payroll-cost-${from.slice(0, 7)}-to-${to.slice(0, 7)}`,
        columns: ["Month", "Payslips", "Gross", "Overtime", "Income tax", "Deductions", "Net", "Net paid", "Status"],
        numericColumns: [1, 2, 3, 4, 5, 6, 7],
        rows: [...months].reverse().map((m) => [formatMonth(m.month), m.payslips || "", m.payslips ? format(m.gross) : "", m.payslips ? format(m.overtime) : "", m.payslips ? format(m.tax) : "", m.payslips ? format(m.deductions) : "", m.payslips ? format(m.net) : "", m.payslips ? format(m.paid_net) : "", monthState(m)?.label ?? "No payroll"]),
        foot: [["Total", total.payslips, format(total.gross), format(total.overtime), format(total.tax), format(total.deductions), format(total.net), format(total.paidNet), ""]],
      });
    } catch (e) {
      console.error(e);
      toast.error("The PDF could not be made. Try again, or export the spreadsheet instead.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Pay"
        title="Pay reports"
        icon={BarChart3}
        description="Payroll cost by month, tax withheld and spend by department."
        actions={
          <>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl sm:h-9 sm:w-44 sm:flex-none" aria-label="Range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 shrink-0 rounded-xl sm:h-9" disabled={!withPay.length || exporting}>
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" aria-hidden />}
                  Export
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[210px] rounded-xl">
                <DropdownMenuItem onSelect={exportCsv} className="gap-2.5 rounded-lg py-2">
                  <FileSpreadsheet className="h-4 w-4 text-success" aria-hidden />
                  <span className="text-[13px] font-medium">Spreadsheet (CSV)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportPdf()} className="gap-2.5 rounded-lg py-2">
                  <FileText className="h-4 w-4 text-destructive" aria-hidden />
                  <span className="text-[13px] font-medium">Report (PDF)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
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

      <StatGrid>
        <StatTile label="Gross pay" value={format(total.gross)} icon={Wallet} loading={q.isLoading} tone="primary" hint={`${total.payslips.toLocaleString("en-US")} payslips, drafts included`} />
        <StatTile label="Tax withheld" value={format(total.tax)} icon={Landmark} loading={q.isLoading} hint={total.gross ? `${formatNumber((total.tax / total.gross) * 100, 1)}% of gross` : "Income tax on payslips"} />
        <StatTile label="Net paid out" value={format(total.paidNet)} icon={Receipt} loading={q.isLoading} tone="success" hint={unpaidNet > 0 ? `${format(unpaidNet)} still to pay` : "Everything is paid"} />
        <StatTile label="Average a month" value={format(average)} icon={Scale} loading={q.isLoading} hint={withPay.length ? `Gross, over ${plural(withPay.length, "month")} with payroll` : "No payroll in range"} />
      </StatGrid>

      <SectionCard
        className="mt-4"
        title="Payroll cost by month"
        description={`${rangeLabel} · figures in ${company?.currency || "PKR"}`}
        actions={
          withPay.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
              {SERIES.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </li>
              ))}
            </ul>
          ) : undefined
        }
      >
        {q.isLoading ? (
          <div className="h-60 animate-pulse rounded-xl bg-muted/40 sm:h-72" />
        ) : !withPay.length ? (
          <EmptyState compact icon={BarChart3} title="No payslips in this range" description="Prepare a month on the payroll sheet and it shows here." />
        ) : (
          <div className="h-60 w-full sm:h-72" role="img" aria-label="Stacked bars of net pay, income tax and other deductions by month, adding up to gross pay; the table below has the figures">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="26%">
                <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} strokeOpacity={0.7} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART_CHROME.axis }} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: CHART_CHROME.axis }} tickFormatter={(v: number) => compact(v)} />
                <Tooltip
                  cursor={{ fill: CHART_CHROME.cursor, opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chart)[number];
                    return (
                      <div className="min-w-[200px] rounded-xl border border-border bg-popover px-3 py-2.5 text-xs shadow-lg">
                        <p className="mb-1.5 font-semibold text-foreground">{formatMonth(p.month)}</p>
                        {SERIES.map((s) => (
                          <p key={s.key} className="flex items-center justify-between gap-4 py-0.5">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                              {s.label}
                            </span>
                            <span className="tabular font-medium text-foreground">{format(p[s.key])}</span>
                          </p>
                        ))}
                        <p className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1.5">
                          <span className="font-semibold text-foreground">Gross</span>
                          <span className="tabular font-semibold text-foreground">{format(p.gross)}</span>
                        </p>
                      </div>
                    );
                  }}
                />
                {SERIES.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} stackId="cost" fill={s.color} radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={40} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard title="Monthly cost" description="Newest first" flush>
          <div ref={monthsRef} className="min-w-0">
            {q.isLoading ? <TableSkeleton rows={6} columns={5} className="rounded-none border-0 shadow-none" /> : <DataTable columns={monthCols} rows={[...months].reverse()} getRowId={(m) => m.month} pageSize={12} caption="Monthly payroll cost" />}
          </div>
        </SectionCard>
        <SectionCard title="By department" icon={Building2} description="Share of gross across the range" flush>
          <div ref={deptRef} className="min-w-0">
            {q.isLoading ? (
              <TableSkeleton rows={4} columns={3} className="rounded-none border-0 shadow-none" />
            ) : (
              <DataTable columns={deptCols} rows={depts} getRowId={(d) => d.department} pageSize={0} caption="Payroll by department" empty={<EmptyState compact icon={Building2} title="No payslips in this range" description="Department totals appear once a month is prepared." />} />
            )}
          </div>
        </SectionCard>
      </div>
      <p className={cn("mt-3 text-[11px] text-muted-foreground", !withPay.length && "hidden")}>Gross includes drafts and final payslips not yet paid; net paid out counts only payslips marked paid.</p>
    </div>
  );
}
