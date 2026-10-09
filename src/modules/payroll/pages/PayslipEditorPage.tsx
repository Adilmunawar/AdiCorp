import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCheck, ChevronLeft, ChevronRight, Download, Eye, FileText, Loader2, MoreHorizontal, PencilLine, Plus, Printer, RefreshCw, RotateCcw, Save, Send, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { CardSkeleton, ConfirmDialog, EmptyState, PageHeader, SectionCard, Skeleton, TabsNav, formatDateTime, formatMonth, formatRelative, toDbDate, useMoney } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { errorMessage, usePayslipDetail, useUpdatePayslip } from "../lib/api";
import { LABEL_MAX, MAX_LINES, MONEY_LIMIT, NOTES_MAX, OVERTIME_TYPE_LABEL, computeTotals, parseAmount, round2, splitSalary, taxFromSplit } from "../lib/calc";
import { payslipPdf } from "../lib/pdf";
import type { PayslipDetail, SheetOp } from "../lib/types";
import { AttendanceLine, Notice, Row, StatusFlow, formatDay, formatHours, plural } from "../components/bits";
import { PayslipDocument, type SlipCompany, type SlipData, type SlipPerson } from "../components/PayslipDocument";
import { useRunPayslipOp } from "../components/useRunOp";
import { groupDigits, useWidth } from "../components/useWidth";

interface FormLine {
  key: number;
  label: string;
  amount: string;
}

interface FormState {
  salary: string;
  basic_salary: string;
  allowances: string;
  other_allowances: string;
  overtime_earnings: string;
  overtime_hours: string;
  income_tax: string;
  tax_manual: boolean;
  other_deductions: string;
  lines: FormLine[];
  notes: string;
}

type PayslipOp = Exclude<SheetOp, "prepare" | "refill_stale">;

interface PendingConfirm {
  op: PayslipOp;
  title: string;
  description: string;
  label: string;
  destructive?: boolean;
  date?: boolean;
}

const MONEY_FIELDS = [
  ["basic_salary", "Basic salary"],
  ["allowances", "Allowances"],
  ["other_allowances", "Other allowances"],
  ["overtime_earnings", "Overtime earnings"],
  ["income_tax", "Income tax"],
  ["other_deductions", "Other deductions"],
] as const;

const VIEW_TABS = [
  { value: "edit", label: "Figures", icon: PencilLine },
  { value: "preview", label: "Preview", icon: Eye },
];

let lineKey = 0;
const str = (n: number | null | undefined) => (n ? groupDigits(String(round2(n))) : "0");

function toForm(d: PayslipDetail): FormState {
  const p = d.payslip;
  return {
    salary: str(round2((p.basic_salary || 0) + (p.allowances || 0))),
    basic_salary: str(p.basic_salary),
    allowances: str(p.allowances),
    other_allowances: str(p.other_allowances),
    overtime_earnings: str(p.overtime_earnings),
    overtime_hours: str(p.overtime_hours),
    income_tax: str(p.income_tax),
    tax_manual: !!p.tax_manual,
    other_deductions: str(p.other_deductions),
    lines: (Array.isArray(p.lines) ? p.lines : []).map((l) => ({ key: ++lineKey, label: l.label, amount: groupDigits(String(l.amount)) })),
    notes: p.notes ?? "",
  };
}

const snapshot = (f: FormState) => JSON.stringify({ ...f, lines: f.lines.map(({ label, amount }) => ({ label, amount })) });

function toSlip(d: PayslipDetail): { slip: SlipData; person: SlipPerson; company: SlipCompany } {
  const p = d.payslip;
  return {
    slip: { ...p, lines: Array.isArray(p.lines) ? p.lines : [] },
    person: { ...d.employee },
    company: d.company,
  };
}

export default function PayslipEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const q = usePayslipDetail(id);
  const { format } = useMoney();
  const save = useUpdatePayslip();
  const { run, pending: opPending } = useRunPayslipOp();
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(toDbDate());
  const [pdfBusy, setPdfBusy] = useState<"download" | "print" | null>(null);
  const [view, setView] = useState("edit");
  const [colRef, colWidth] = useWidth<HTMLDivElement>();

  const d = q.data;
  useEffect(() => {
    if (d?.payslip) {
      const f = toForm(d);
      setForm(f);
      setBaseline(snapshot(f));
    }
  }, [d]);

  // A different payslip (previous / next person) starts on the figures.
  useEffect(() => setView("edit"), [id]);

  const rules = d?.rules;
  const live = useMemo(() => {
    if (!form || !rules) return null;
    const num = (k: (typeof MONEY_FIELDS)[number][0]) => parseAmount(form[k]);
    const errors: string[] = [];
    for (const [k, label] of MONEY_FIELDS) {
      const v = num(k);
      if (Number.isNaN(v)) errors.push(`${label} must be a number.`);
      else if (v < 0) errors.push(`${label} cannot be negative.`);
      else if (v >= MONEY_LIMIT) errors.push(`${label} is too large.`);
    }
    const hours = parseAmount(form.overtime_hours);
    if (Number.isNaN(hours) || hours < 0 || hours >= 1000) errors.push("Overtime hours must be a number between 0 and 1,000.");
    const lines: Array<{ label: string; amount: number }> = [];
    form.lines.forEach((l, i) => {
      const label = l.label.trim();
      const amount = parseAmount(l.amount);
      if (!label && (!l.amount.trim() || amount === 0)) return;
      if (label.length > LABEL_MAX) errors.push(`Line ${i + 1}: keep the label to ${LABEL_MAX} characters.`);
      else if (Number.isNaN(amount)) errors.push(`Line ${i + 1} amount must be a number.`);
      else if (!label) errors.push(`Line ${i + 1} needs a label.`);
      else if (amount === 0) errors.push(`Line ${i + 1} (${label}) needs an amount. Use a minus sign for a deduction.`);
      else if (Math.abs(amount) >= MONEY_LIMIT) errors.push(`Line ${i + 1} amount is too large.`);
      else lines.push({ label, amount: round2(amount) });
    });
    if (form.notes.length > NOTES_MAX) errors.push(`Keep notes to ${NOTES_MAX} characters.`);
    const safe = (v: number) => (Number.isFinite(v) && v > 0 ? round2(v) : 0);
    const basic = safe(num("basic_salary"));
    const allowances = safe(num("allowances"));
    // A part-month slip pays its share of the full month's tax, as the server does on save.
    const auto = taxFromSplit(basic, allowances, rules, d?.payslip.paid_days, d?.payslip.month_days);
    const income_tax = form.tax_manual ? safe(num("income_tax")) : auto.monthly_tax;
    const figures = {
      basic_salary: basic,
      allowances,
      other_allowances: safe(num("other_allowances")),
      overtime_earnings: safe(num("overtime_earnings")),
      income_tax,
      other_deductions: safe(num("other_deductions")),
      lines,
    };
    const totals = computeTotals(figures);
    if (!errors.length && totals.net_salary < 0) errors.push(`Deductions (${format(totals.total_deductions)}) are more than earnings (${format(totals.gross_salary)}). Check the figures.`);
    return { figures, totals, auto, errors, hours: safe(hours) };
  }, [form, rules, format]);

  const dirty = !!form && snapshot(form) !== baseline;

  // Leaving the tab or reloading with unsaved figures asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (q.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl" aria-busy="true" aria-label="Loading payslip">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="mb-4 h-14 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <CardSkeleton lines={10} />
          <div className="space-y-4">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={2} />
          </div>
        </div>
      </div>
    );
  }
  if (q.isError || !d?.payslip) {
    return (
      <EmptyState
        icon={FileText}
        title="Payslip not available"
        description={q.error ? errorMessage(q.error) : "It may have been deleted."}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {q.isError && (
              <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </Button>
            )}
            <Button asChild size="sm">
              <Link to="/payroll">Back to payroll</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const p = d.payslip;
  const e = d.employee;
  const monthLabel = formatMonth(p.month);
  const isDraft = p.status === "draft";
  const sheetHref = `/payroll?month=${p.month.slice(0, 7)}`;
  const base = toSlip(d);
  const firstName = e.name.split(" ")[0];

  // What the employee will see once finalised, from the figures as typed.
  const previewSlip: SlipData =
    isDraft && live && form
      ? {
          ...base.slip,
          ...live.figures,
          overtime_hours: live.hours,
          taxable_income: live.auto.taxable,
          gross_salary: live.totals.gross_salary,
          total_deductions: live.totals.total_deductions,
          net_salary: live.totals.net_salary,
          notes: form.notes.trim() || null,
        }
      : base.slip;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setSalary = (raw: string) => {
    if (!rules) return;
    const v = parseAmount(raw);
    setForm((f) => {
      if (!f) return f;
      if (Number.isNaN(v) || v < 0) return { ...f, salary: raw };
      const s = splitSalary(v, rules);
      return { ...f, salary: raw, basic_salary: groupDigits(String(s.basic)), allowances: groupDigits(String(s.allowances)) };
    });
  };
  const setPart = (k: "basic_salary" | "allowances", raw: string) =>
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [k]: raw };
      const b = parseAmount(next.basic_salary);
      const a = parseAmount(next.allowances);
      if (!Number.isNaN(b) && !Number.isNaN(a)) next.salary = groupDigits(String(round2(b + a)));
      return next;
    });
  const discard = () => d && setForm(toForm(d));

  const onSave = async () => {
    if (!form || !live || live.errors.length) return;
    try {
      await save.mutateAsync({
        id: p.id,
        input: {
          ...live.figures,
          overtime_hours: live.hours,
          tax_manual: form.tax_manual,
          notes: form.notes.trim(),
        },
      });
      toast.success(`Saved ${e.name}'s ${monthLabel} payslip.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const go = (to: string) => (dirty ? setLeaveTo(to) : navigate(to));

  const doOp = async (op: PayslipOp, date?: string) => {
    const r = await run(p.id, op, date ?? null);
    if (op === "delete" && r.done.length) navigate(sheetHref);
  };

  const pdf = async (mode: "download" | "print") => {
    setPdfBusy(mode);
    try {
      // The saved payslip, never unsaved figures.
      await payslipPdf(base.slip, base.person, base.company, mode);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPdfBusy(null);
    }
  };

  const askFinalise = () => setConfirm({ op: "finalise", title: `Finalise ${e.name}'s ${monthLabel} payslip?`, description: `${firstName} will see it in the portal and be told it is ready. The figures lock until you reopen it.`, label: "Finalise" });
  const askPaid = () => {
    setPaidOn(toDbDate());
    setConfirm({ op: "paid", title: `Mark ${e.name}'s ${monthLabel} payslip as paid?`, description: `${firstName} is told the salary has been paid.`, label: "Mark paid", date: true });
  };
  const more: Array<{ label: string; icon: typeof RefreshCw; onSelect: () => void; destructive?: boolean; separated?: boolean; disabled?: boolean }> = [];
  if (isDraft) {
    // Refilling reloads the saved draft, so typed changes would vanish: save or discard them first (as for Finalise).
    more.push({ label: dirty ? "Refill (save or discard first)" : "Refill from salary on file", icon: RefreshCw, disabled: dirty, onSelect: () => setConfirm({ op: "refill", title: "Refill from the salary on file?", description: "Basic, allowances, other allowances, overtime and income tax are replaced; extra lines, other deductions and typed notes stay.", label: "Refill" }) });
    more.push({ label: "Delete draft", icon: Trash2, destructive: true, separated: true, onSelect: () => setConfirm({ op: "delete", title: `Delete ${e.name}'s ${monthLabel} draft?`, description: "Overtime it carried goes back for the next draft. This cannot be undone.", label: "Delete", destructive: true }) });
  }
  if (p.status === "final") more.push({ label: "Reopen as draft", icon: Undo2, onSelect: () => setConfirm({ op: "reopen", title: `Reopen ${e.name}'s ${monthLabel} payslip?`, description: "It disappears from their payslips until finalised again, and they are told it is being corrected.", label: "Reopen" }) });
  if (p.status === "paid") more.push({ label: "Undo paid", icon: Undo2, onSelect: () => setConfirm({ op: "unpaid", title: "Undo the payment mark?", description: "It goes back to final, not paid. The employee is not told.", label: "Undo paid" }) });

  const otWaiting = d.overtime.waiting.length;
  const otUnclaimed = d.overtime.unclaimed.length;
  const saveDisabled = !dirty || (live?.errors.length ?? 0) > 0 || save.isPending;

  return (
    <div className={cn("mx-auto w-full max-w-6xl", isDraft && dirty && "pb-24 lg:pb-0")}>
      <PageHeader
        eyebrow={
          <button type="button" onClick={() => go(sheetHref)} className="inline-flex items-center gap-1 rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Payroll · {monthLabel}
          </button>
        }
        title={e.name}
        description={[`${monthLabel} payslip`, e.code, e.rank, e.department].filter(Boolean).join(" · ")}
        actions={
          <>
            <div className="flex items-center gap-1" role="group" aria-label="Other people this month">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" disabled={!d.prev_id} onClick={() => d.prev_id && go(`/payroll/payslips/${d.prev_id}`)} aria-label="Previous person's payslip" title="Previous person (A to Z)">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" disabled={!d.next_id} onClick={() => d.next_id && go(`/payroll/payslips/${d.next_id}`)} aria-label="Next person's payslip" title="Next person (A to Z)">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="h-9 rounded-xl px-3" onClick={() => pdf("download")} disabled={!!pdfBusy} aria-label="Download PDF">
              {pdfBusy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" aria-hidden />}
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" size="sm" className="h-9 rounded-xl px-3" onClick={() => pdf("print")} disabled={!!pdfBusy} aria-label="Print">
              {pdfBusy === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" aria-hidden />}
              <span className="hidden sm:inline">Print</span>
            </Button>
            {isDraft && (
              <Button size="sm" className="h-9 rounded-xl" disabled={opPending || dirty} title={dirty ? "Save or discard your changes first" : undefined} onClick={askFinalise}>
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Finalise
              </Button>
            )}
            {p.status === "final" && (
              <Button size="sm" className="h-9 rounded-xl" disabled={opPending} onClick={askPaid}>
                <Send className="h-3.5 w-3.5" aria-hidden />
                Mark paid
              </Button>
            )}
            {more.length > 0 && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label="More payslip actions" disabled={opPending}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px] rounded-xl">
                  {more.map((m, i) => (
                    <div key={m.label}>
                      {m.separated && i > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem onSelect={m.onSelect} disabled={m.disabled} className={cn("gap-2 rounded-lg text-[13px] font-medium", m.destructive && "text-destructive focus:text-destructive")}>
                        <m.icon className="h-3.5 w-3.5" aria-hidden />
                        {m.label}
                      </DropdownMenuItem>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      >
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:px-5">
          <StatusFlow status={p.status} preparedOn={p.created_at} finalOn={p.published_at} paidOn={p.paid_on} />
        </div>
      </PageHeader>

      <div className="mb-4 space-y-2 empty:hidden">
        {d.stale.salary && isDraft && (
          <Notice tone="warning">
            This draft was filled from a salary of {format(p.salary_basis)}; the salary for {monthLabel} is now {format(d.pay.monthly_salary)}. Refill it to take the new figures.
          </Notice>
        )}
        {d.stale.overtime && isDraft && <Notice tone="warning">Priced overtime changed since this draft was filled. Refill it to take what is payable now.</Notice>}
        {otWaiting > 0 && (
          <Notice tone="info" to="/payroll/overtime" action="Price overtime">
            {plural(otWaiting, "approved overtime entry", "approved overtime entries")} worked by month end {otWaiting === 1 ? "is" : "are"} waiting for a rate, so {otWaiting === 1 ? "it is" : "they are"} not on this payslip.
          </Notice>
        )}
        {p.legacy && <Notice tone="info">Made by the earlier payroll: paid by days worked at a daily rate. Reopening turns it into an ordinary draft you can refill.</Notice>}
        {p.status === "final" && <Notice tone="success">{firstName} can see this payslip. Reopen it from the menu to change the figures.</Notice>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={colRef} className="min-w-0 space-y-4">
          {isDraft && form && live && rules ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsNav tabs={VIEW_TABS} value={view} onChange={setView} className="w-fit" />
                <p className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : `Saved ${formatRelative(p.updated_at)}`}</p>
              </div>
              {view === "preview" ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">How {firstName} will see it once finalised{dirty ? ", with your unsaved figures" : ""}. The draft mark is not shown to employees.</p>
                  <PayslipDocument slip={previewSlip} person={base.person} company={base.company} />
                </div>
              ) : (
                <>
                  <SectionCard title="Earnings" description={`Split by your rules: ${rules.basic_percent}% basic, the rest allowances.`}>
                    <div className={cn("grid gap-x-3 gap-y-4", colWidth >= 600 ? "grid-cols-3" : colWidth >= 400 ? "grid-cols-2" : "grid-cols-1")}>
                      <MoneyField id="salary" label="Salary" value={form.salary} onChange={setSalary} hint={`Basic + allowances. In force for ${monthLabel}: ${format(d.pay.monthly_salary)}${d.pay.prorated ? ` (${d.pay.paid_days} of ${d.pay.month_days} days)` : ""}`} />
                      <MoneyField id="basic" label="Basic salary" value={form.basic_salary} onChange={(v) => setPart("basic_salary", v)} />
                      <MoneyField id="allowances" label="Allowances" value={form.allowances} onChange={(v) => setPart("allowances", v)} />
                      <MoneyField id="other" label="Other allowances" value={form.other_allowances} onChange={(v) => set("other_allowances", v)} hint="Paid on top, outside the tax." />
                      <MoneyField id="ot" label="Overtime earnings" value={form.overtime_earnings} onChange={(v) => set("overtime_earnings", v)} hint={p.overtime_basis ? `Filled from ${format(p.overtime_basis)} of priced overtime` : "No priced overtime when filled"} />
                      <MoneyField id="oth" label="Overtime hours" unit="h" value={form.overtime_hours} onChange={(v) => set("overtime_hours", v)} />
                    </div>
                  </SectionCard>

                  <SectionCard title="Tax and deductions" description={`Taxable ${format(live.auto.taxable)} a month (salary less ${rules.medical_exempt_percent}% of basic as medical); ${format(live.auto.yearly_tax)} tax a year.`}>
                    <div className={cn("grid gap-x-3 gap-y-4", colWidth >= 400 ? "grid-cols-2" : "grid-cols-1")}>
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="tax" className="micro-label block truncate">
                          Income tax
                        </Label>
                        <AmountInput id="tax" value={form.tax_manual ? form.income_tax : groupDigits(String(live.auto.monthly_tax))} disabled={!form.tax_manual} onChange={(v) => set("income_tax", v)} describedBy="tax-hint" />
                        <div className="flex items-start justify-between gap-3">
                          <p id="tax-hint" className="text-[11px] leading-4 text-muted-foreground">
                            {form.tax_manual ? `Set by hand. The tax table gives ${format(live.auto.monthly_tax)}.` : "From basic and allowances with the tax table."}
                          </p>
                          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] font-medium text-foreground/80">
                            Set by hand
                            {/* Either way the field starts from the figure on screen (the tax table's), never an older saved amount. */}
                            <Switch checked={form.tax_manual} onCheckedChange={(v) => setForm((f) => (f ? { ...f, tax_manual: v, income_tax: groupDigits(String(live.auto.monthly_tax)) } : f))} aria-label="Set income tax by hand" />
                          </label>
                        </div>
                      </div>
                      <MoneyField id="ded" label="Other deductions" value={form.other_deductions} onChange={(v) => set("other_deductions", v)} />
                    </div>

                    <div className="mt-5 border-t border-border/60 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="micro-label">Extra lines</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs"
                          disabled={form.lines.length >= MAX_LINES}
                          onClick={() => set("lines", [...form.lines, { key: ++lineKey, label: "", amount: "" }])}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          Add line
                        </Button>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">A bonus, arrears or one-off allowance as a positive amount; an advance, loan instalment or fine as a negative amount, for example -5000. Up to {MAX_LINES} lines.</p>
                      {form.lines.length === 0 ? (
                        <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">No extra lines on this payslip.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {form.lines.map((l, i) => {
                            const amt = parseAmount(l.amount);
                            return (
                              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_112px_40px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_150px_40px]">
                                <Input aria-label={`Line ${i + 1} label`} placeholder="Label, for example Eid bonus" maxLength={LABEL_MAX + 10} value={l.label} className="h-10 rounded-xl" onChange={(ev) => set("lines", form.lines.map((x) => (x.key === l.key ? { ...x, label: ev.target.value } : x)))} />
                                <Input
                                  aria-label={`Line ${i + 1} amount`}
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={l.amount}
                                  className={cn("tabular h-10 rounded-xl text-right", amt < 0 ? "text-destructive" : amt > 0 ? "text-success" : undefined)}
                                  onChange={(ev) => set("lines", form.lines.map((x) => (x.key === l.key ? { ...x, amount: ev.target.value } : x)))}
                                  onBlur={() => set("lines", form.lines.map((x) => (x.key === l.key ? { ...x, amount: groupDigits(x.amount) } : x)))}
                                />
                                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-muted-foreground hover:text-destructive" aria-label={`Remove line ${i + 1}`} onClick={() => set("lines", form.lines.filter((x) => x.key !== l.key))}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 space-y-1.5 border-t border-border/60 pt-4">
                      <Label htmlFor="notes" className="micro-label">
                        Notes on the payslip
                      </Label>
                      <Textarea id="notes" rows={3} maxLength={NOTES_MAX + 50} placeholder={`Anything ${firstName} should know about this month.`} value={form.notes} onChange={(ev) => set("notes", ev.target.value)} className="rounded-xl" />
                      <p className={cn("text-right text-[11px] tabular", form.notes.length > NOTES_MAX ? "text-destructive" : "text-muted-foreground")}>
                        {form.notes.length}/{NOTES_MAX}
                      </p>
                    </div>
                  </SectionCard>
                </>
              )}
            </>
          ) : (
            <PayslipDocument slip={base.slip} person={base.person} company={base.company} />
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
          {isDraft && live && (
            <SectionCard title="Totals" description="Updates as you type.">
              <Row label="Gross pay" value={format(live.totals.gross_salary)} />
              {live.totals.extra_earnings > 0 && <Row muted label="Includes extra earnings" value={format(live.totals.extra_earnings)} />}
              <Row label="Income tax" value={format(live.figures.income_tax)} />
              <Row label="Other deductions" value={format(live.figures.other_deductions + live.totals.extra_deductions)} />
              <Row label="Total deductions" value={format(live.totals.total_deductions)} className="border-t border-border/60" />
              <div className="mt-2 flex items-baseline justify-between gap-3 rounded-xl bg-primary/[0.06] px-3 py-2.5">
                <span className="micro-label !text-primary">Net pay</span>
                <span className={cn("tabular font-display text-xl font-bold", live.totals.net_salary < 0 ? "text-destructive" : "text-primary")}>{format(live.totals.net_salary)}</span>
              </div>
              {live.totals.net_salary !== p.net_salary && !live.errors.length && (
                <p className="tabular mt-1.5 text-right text-[11px] text-muted-foreground">Saved: {format(p.net_salary)}</p>
              )}
              {live.errors.length > 0 && (
                <ul className="mt-3 space-y-1 text-[12px] leading-4 text-destructive" role="alert">
                  {live.errors.slice(0, 3).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 hidden gap-2 lg:flex">
                <Button className="h-10 flex-1 rounded-xl" disabled={saveDisabled} onClick={onSave}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" aria-hidden />}
                  Save payslip
                </Button>
                {dirty && (
                  <Button variant="outline" className="h-10 rounded-xl" onClick={discard}>
                    Discard
                  </Button>
                )}
              </div>
            </SectionCard>
          )}

          <SectionCard title={`Pay for ${monthLabel}`}>
            <Row label="Salary in force" value={format(d.pay.monthly_salary)} />
            {d.pay.other_allowance ? <Row label="Other allowance" value={format(d.pay.other_allowance)} /> : null}
            <Row label="Days paid" value={`${d.pay.paid_days} of ${d.pay.month_days}`} />
            {d.pay.joined && <Row muted label="Joined" value={formatDay(d.pay.joined)} />}
            {d.pay.left && <Row muted label="Last day" value={formatDay(d.pay.left)} />}
            {d.pay.unpaid_leave_days ? <Row muted label="Unpaid leave" value={plural(d.pay.unpaid_leave_days, "working day")} /> : null}
            {(d.pay.segments?.length ?? 0) > 1 && (
              <div className="mt-2 space-y-0.5 rounded-lg bg-muted/40 p-2.5 text-[11.5px] text-muted-foreground">
                {d.pay.segments!.map((s) => (
                  <p key={s.from} className="tabular">
                    {formatDay(s.from).replace(/ \d{4}$/, "")} – {formatDay(s.to).replace(/ \d{4}$/, "")}: {format(s.monthly_salary)} for {plural(s.days, "day")}
                  </p>
                ))}
              </div>
            )}
            {!d.pay.has_salary && (
              <Notice tone="warning" className="mt-2" to="/payroll/salaries" action="Set salary">
                No salary on file.
              </Notice>
            )}
            {p.status === "paid" && (
              <Row className="mt-1 border-t border-border/60" label="Paid" value={`${formatDay(p.paid_on)}${p.pay_method === "cash" ? ", cash" : ", bank"}`} />
            )}
          </SectionCard>

          <SectionCard title="Attendance" description="For reference only; pay does not come from it.">
            <p className="text-[13px]">
              <AttendanceLine a={d.attendance} />
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              P present · H half day · L leave · A absent, of {plural(d.attendance.working_days, "working day")} so far ({d.attendance.working_days_month} in the month).
            </p>
          </SectionCard>

          <SectionCard title="Overtime" description={d.overtime.on_slip.length ? `${plural(d.overtime.on_slip.length, "entry", "entries")} on this payslip` : "None on this payslip"}>
            {d.overtime.on_slip.length + d.overtime.unclaimed.length + d.overtime.waiting.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No approved overtime for this month.</p>
            ) : (
              <ul className="divide-y divide-border/60 text-[12.5px]">
                {d.overtime.on_slip.map((o) => (
                  <OvertimeItem key={o.id} date={o.date} hours={o.hours} note={OVERTIME_TYPE_LABEL[o.overtime_type] ?? "Overtime"} right={<span className="tabular font-medium text-foreground">{format(o.amount)}</span>} />
                ))}
                {d.overtime.unclaimed.map((o) => (
                  <OvertimeItem
                    key={o.id}
                    date={o.date}
                    hours={o.hours}
                    tone="warning"
                    note={isDraft ? "Priced, not on this draft" : "Priced, not on this payslip"}
                    right={<span className="tabular font-medium text-warning">{format(o.amount)}</span>}
                  />
                ))}
                {d.overtime.waiting.map((o) => (
                  <OvertimeItem
                    key={o.id}
                    date={o.date}
                    hours={o.hours}
                    tone="muted"
                    note="Waiting for a rate"
                    right={
                      <Link to="/payroll/overtime" className="rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Price
                      </Link>
                    }
                  />
                ))}
              </ul>
            )}
            {otUnclaimed > 0 && isDraft && <p className="mt-2 text-[11px] text-warning">Refill to add the priced entries.</p>}
          </SectionCard>

          <p className="px-1 text-[11px] text-muted-foreground" title={formatDateTime(p.updated_at)}>
            Last changed {formatRelative(p.updated_at)}.
          </p>
        </aside>
      </div>

      {isDraft && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur pb-safe lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">{live?.errors.length ? "Fix the figures to save" : "Unsaved changes"}</p>
              {live && <p className="tabular truncate text-[11px] text-muted-foreground">Net {format(live.totals.net_salary)}</p>}
            </div>
            <Button variant="outline" className="h-10 shrink-0 rounded-xl" onClick={discard}>
              Discard
            </Button>
            <Button className="h-10 shrink-0 rounded-xl" disabled={saveDisabled} onClick={onSave}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" aria-hidden />}
              Save
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        destructive={!!confirm?.destructive}
        confirmDisabled={!!confirm?.date && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)}
        onConfirm={async () => {
          if (!confirm) return;
          await doOp(confirm.op, confirm.date ? paidOn : undefined);
        }}
      >
        {confirm?.date && (
          <div className="space-y-1.5">
            <Label htmlFor="paid-on-one" className="micro-label">
              Paid on
            </Label>
            <Input id="paid-on-one" type="date" value={paidOn} max={toDbDate(new Date(Date.now() + 62 * 864e5))} onChange={(ev) => setPaidOn(ev.target.value)} className="h-10 rounded-xl" />
            <p className="text-[11px] text-muted-foreground">The day the money left the account.</p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!leaveTo}
        onOpenChange={(o) => !o && setLeaveTo(null)}
        title="Leave without saving?"
        description={`Your changes to ${firstName}'s payslip will be lost.`}
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const to = leaveTo;
          setLeaveTo(null);
          discard();
          if (to) navigate(to);
        }}
      />
    </div>
  );
}

/** A money (or hours) input: right-aligned figures with the unit inside the field. */
function AmountInput({ id, value, onChange, disabled, unit, invalid, describedBy }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean; unit?: string; invalid?: boolean; describedBy?: string }) {
  const { currency } = useMoney();
  const u = unit ?? currency;
  // The currency leads the figure; other units (hours) follow it.
  const prefix = unit === undefined;
  return (
    <div className="relative">
      <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground", prefix ? "left-3" : "right-3")} aria-hidden>
        {u}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(ev) => onChange(ev.target.value)}
        onBlur={() => {
          const tidy = groupDigits(value);
          if (tidy !== value) onChange(tidy);
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn("tabular h-10 rounded-xl text-right", prefix ? "pl-12" : "pr-8", invalid && "border-destructive focus-visible:ring-destructive")}
      />
    </div>
  );
}

function MoneyField({ id, label, value, onChange, hint, unit }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; unit?: string }) {
  const n = parseAmount(value);
  const bad = Number.isNaN(n) || n < 0;
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="micro-label block truncate" title={label}>
        {label}
      </Label>
      <AmountInput id={id} value={value} onChange={onChange} unit={unit} invalid={bad} describedBy={hint || bad ? `${id}-hint` : undefined} />
      {/* Hints carry figures (the month's salary, priced overtime), so they wrap rather than get cut off. */}
      {bad ? (
        <p id={`${id}-hint`} className="text-[11px] leading-4 text-destructive">
          Enter a number, 0 or more.
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-[11px] leading-4 text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** One overtime entry: date and hours, what it is or where it stands, and its amount (or what to do). */
function OvertimeItem({ date, hours, note, right, tone }: { date: string; hours: number; note: string; right: React.ReactNode; tone?: "warning" | "muted" }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="tabular font-medium text-foreground">
          {formatDay(date).replace(/ \d{4}$/, "")} · {formatHours(hours)}
        </p>
        <p className={cn("text-[11px]", tone === "warning" ? "text-warning" : "text-muted-foreground")}>{note}</p>
      </div>
      <div className="shrink-0 pt-px text-right">{right}</div>
    </li>
  );
}
