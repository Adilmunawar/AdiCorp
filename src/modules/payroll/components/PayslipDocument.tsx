import { Building2 } from "lucide-react";
import { formatMoney, formatMonth } from "@/components/kit";
import { cn } from "@/lib/utils";
import { computeTotals } from "../lib/calc";
import type { PayMethod, PayslipLine, PayslipStatus } from "../lib/types";
import { PayslipStatusBadge, amountInWords, formatDay, formatHours, payPeriod, payslipRef } from "./bits";
import { useWidth } from "./useWidth";

/** Everything a printed payslip shows; staff and portal payloads both map to this. */
export interface SlipData {
  /** Used for the printed reference when the person has no employee code. */
  id?: string;
  month: string;
  status: PayslipStatus;
  legacy: boolean;
  basic_salary: number;
  allowances: number;
  other_allowances: number;
  overtime_earnings: number;
  overtime_hours: number;
  income_tax: number;
  taxable_income: number;
  other_deductions: number;
  lines: PayslipLine[];
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  daily_rate: number;
  days_worked: number;
  present_days: number;
  short_leave_days: number;
  paid_leave_days: number;
  absent_days: number;
  paid_days: number | null;
  month_days: number | null;
  notes: string | null;
  paid_on: string | null;
  pay_method: PayMethod;
}

export interface SlipPerson {
  name: string;
  code: string | null;
  father_name: string | null;
  rank: string | null;
  department: string | null;
  cnic: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  joining_date: string | null;
}

export interface SlipCompany {
  name: string;
  logo: string | null;
  currency: string;
  address: string | null;
  phone: string | null;
  website: string | null;
}

export interface SlipLine {
  label: string;
  amount: number;
  hint?: string;
}

/** Earnings and deductions as they print, the same for screen and PDF. */
export function slipLines(s: SlipData, currency: string): { earnings: SlipLine[]; deductions: SlipLine[] } {
  const lines = Array.isArray(s.lines) ? s.lines : [];
  const earnings: SlipLine[] = [];
  const deductions: SlipLine[] = [];
  if (s.legacy) {
    const base = Math.max(0, (Number(s.gross_salary) || 0) - (Number(s.overtime_earnings) || 0));
    // Older payslips sometimes folded overtime or extras into gross; only show "N days at rate" when it adds up.
    const days = Number(s.days_worked) || 0;
    const rate = Number(s.daily_rate) || 0;
    const adds = days > 0 && rate > 0 && Math.abs(days * rate - base) < 1;
    earnings.push({ label: "Salary for days worked", amount: base, hint: adds ? `${days} ${days === 1 ? "day" : "days"} at ${formatMoney(rate, currency)}` : days > 0 ? `${days} ${days === 1 ? "day" : "days"} worked` : undefined });
  } else {
    earnings.push({ label: "Basic salary", amount: s.basic_salary });
    if (s.allowances) earnings.push({ label: "Allowances", amount: s.allowances });
    if (s.other_allowances) earnings.push({ label: "Other allowances", amount: s.other_allowances });
  }
  if (s.overtime_earnings) earnings.push({ label: "Overtime", amount: s.overtime_earnings, hint: s.overtime_hours ? formatHours(s.overtime_hours) : undefined });
  for (const l of lines) if (l.amount > 0) earnings.push({ label: l.label, amount: l.amount });

  if (s.legacy) {
    if (s.total_deductions) deductions.push({ label: "Deductions", amount: s.total_deductions });
  } else {
    if (s.income_tax) deductions.push({ label: "Income tax", amount: s.income_tax, hint: s.taxable_income ? `On taxable ${formatMoney(s.taxable_income, currency)}` : undefined });
    if (s.other_deductions) deductions.push({ label: "Other deductions", amount: s.other_deductions });
    for (const l of lines) if (l.amount < 0) deductions.push({ label: l.label, amount: -l.amount });
  }
  return { earnings, deductions };
}

/** Gross, deductions and net as the payslip shows them (recomputed for current payslips, stored for older ones). */
export function slipTotals(s: SlipData): { gross: number; deductions: number; net: number } {
  const totals = s.legacy ? null : computeTotals({ ...s, lines: Array.isArray(s.lines) ? s.lines : [] });
  return {
    gross: totals?.gross_salary ?? s.gross_salary,
    deductions: totals?.total_deductions ?? s.total_deductions,
    net: totals?.net_salary ?? s.net_salary,
  };
}

/** "20 present · 1 half day · 2 on leave · 1 absent", leaving out the parts that are zero. */
export function attendanceText(s: SlipData): string | null {
  const n = (v: number | null | undefined) => Number(v) || 0;
  const days = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const present = n(s.present_days);
  const half = n(s.short_leave_days);
  const leave = n(s.paid_leave_days);
  const absent = n(s.absent_days);
  if (!present && !half && !leave && !absent) return null;
  return [
    `${days(present)} present`,
    half ? `${days(half)} half ${half === 1 ? "day" : "days"}` : null,
    leave ? `${days(leave)} on leave` : null,
    absent ? `${days(absent)} absent` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function maskAccount(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/\s+/g, "");
  return t.length > 4 ? `•••• ${t.slice(-4)}` : t;
}

/** How and when the money moves, in words. */
export function paymentText(s: SlipData, person: SlipPerson): string {
  const how = s.pay_method === "cash" ? "In cash" : [person.bank_name, maskAccount(person.bank_account_number)].filter(Boolean).join(" ") || "Bank transfer";
  return how;
}

export function statusLine(s: SlipData): string {
  if (s.status === "paid") return s.paid_on ? `Paid on ${formatDay(s.paid_on)}` : "Paid";
  if (s.status === "final") return "Final, awaiting payment";
  return "Draft: figures may still change";
}

function Fact({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="micro-label">{label}</dt>
      <dd className={cn("mt-1 break-words text-[13px] font-medium leading-5 text-foreground", mono && "tabular")}>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function LinesTable({ title, rows, totalLabel, total, currency, empty, tone }: { title: string; rows: SlipLine[]; totalLabel: string; total: number; currency: string; empty?: string; tone: "earn" | "deduct" }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className={cn("micro-label py-2 pr-3 text-left", tone === "earn" ? "!text-success" : "!text-destructive")}>
            {title}
          </th>
          <th scope="col" className="micro-label py-2 text-right">
            Amount ({currency})
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr className="border-b border-border/60">
            <td colSpan={2} className="py-2.5 text-muted-foreground">
              {empty}
            </td>
          </tr>
        )}
        {rows.map((l, i) => (
          <tr key={`${l.label}-${i}`} className="border-b border-border/60 align-baseline">
            <td className="py-2 pr-3 text-foreground">
              {l.label}
              {l.hint && <span className="block text-[11px] leading-4 text-muted-foreground">{l.hint}</span>}
            </td>
            <td className="tabular whitespace-nowrap py-2 text-right font-medium text-foreground">{formatMoney(l.amount, currency).replace(`${currency} `, "")}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-2.5 text-left text-[13px] font-bold text-foreground">
            {totalLabel}
          </th>
          <td className="tabular whitespace-nowrap pt-2.5 text-right text-[13px] font-bold text-foreground">{formatMoney(total, currency).replace(`${currency} `, "")}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** The payslip as a printable document with the company letterhead. Shared by Finance and the employee portal. */
export function PayslipDocument({ slip, person, company, className }: { slip: SlipData; person: SlipPerson; company: SlipCompany; className?: string }) {
  const cur = (company.currency || "PKR").toUpperCase();
  const { earnings, deductions } = slipLines(slip, cur);
  const { gross, deductions: ded, net } = slipTotals(slip);
  const logo = company.logo || null;
  const contact = [company.address, company.phone, company.website?.replace(/^https?:\/\//i, "")].filter(Boolean) as string[];
  const attendance = attendanceText(slip);
  const daysPaid = slip.paid_days != null && slip.month_days ? `${slip.paid_days} of ${slip.month_days}` : slip.legacy && slip.days_worked ? `${slip.days_worked} worked` : null;
  const draft = slip.status === "draft";
  // Laid out by the room the document has (it sits beside a sidebar in Finance's editor), not by the screen.
  const [ref, width] = useWidth<HTMLElement>();
  const roomy = width >= 600;
  const split = width >= 480;

  return (
    <article ref={ref} className={cn("relative isolate overflow-hidden rounded-2xl border border-border bg-card shadow-sm", className)} aria-label={`Payslip for ${formatMonth(slip.month)}, ${person.name}`}>
      <div className="h-1.5 bg-primary" aria-hidden />
      {draft && (
        <div className="pointer-events-none absolute inset-0 -z-10 flex select-none items-center justify-center overflow-hidden" aria-hidden>
          <span className="-rotate-[24deg] font-display text-[clamp(64px,16vw,140px)] font-bold tracking-[0.2em] text-foreground/[0.045]">DRAFT</span>
        </div>
      )}

      <header className={cn("flex gap-5 border-b border-border px-5 pb-5 pt-6", split ? "flex-row items-start justify-between" : "flex-col", roomy && "px-8 pt-7")}>
        <div className="flex min-w-0 items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5">
            {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5 text-primary" aria-hidden />}
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight text-foreground">{company.name}</p>
            {contact.length > 0 && (
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                {contact.map((c, i) => (
                  <span key={c}>
                    {i > 0 && <span aria-hidden> · </span>}
                    {c}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
        <div className={cn("shrink-0", split && "text-right")}>
          <p className="micro-label !text-primary">Payslip</p>
          <p className="mt-0.5 font-display text-2xl font-bold leading-tight tracking-tight text-foreground">{formatMonth(slip.month)}</p>
          <p className="tabular mt-1 text-xs text-muted-foreground">Pay period {payPeriod(slip.month)}</p>
          <p className="tabular text-xs text-muted-foreground">Ref. {payslipRef(slip.month, person.code, slip.id)}</p>
        </div>
      </header>

      <div className={cn("space-y-6 px-5 py-6", roomy && "px-8 py-7")}>
        <dl className={cn("grid gap-x-6 gap-y-4", roomy ? "grid-cols-4" : "grid-cols-2")}>
          <div className="col-span-2 min-w-0">
            <dt className="micro-label">Employee</dt>
            <dd className="mt-1 min-w-0">
              <span className="block break-words text-[15px] font-bold leading-5 text-foreground">{person.name}</span>
              <span className="block break-words text-xs leading-5 text-muted-foreground">{[person.rank, person.department].filter(Boolean).join(", ") || "—"}</span>
            </dd>
          </div>
          <Fact label="Employee code" value={person.code} mono />
          <Fact label="CNIC" value={person.cnic} mono />
          <Fact label="Father's name" value={person.father_name} />
          <Fact label="Joined" value={person.joining_date ? formatDay(person.joining_date) : null} />
          <Fact label="Paid by" value={paymentText(slip, person)} />
          <Fact label="Days paid" value={daysPaid} mono />
        </dl>

        <div className={cn("grid gap-6", roomy && "grid-cols-2 gap-8")}>
          <LinesTable title="Earnings" rows={earnings} totalLabel="Gross pay" total={gross} currency={cur} tone="earn" />
          <LinesTable title="Deductions" rows={deductions} totalLabel="Total deductions" total={ded} currency={cur} tone="deduct" empty="No deductions this month." />
        </div>

        <section className={cn("flex gap-3 border-t-2 border-foreground pt-4", split ? "flex-row items-end justify-between" : "flex-col")} aria-label="Net pay">
          <div className="min-w-0">
            <p className="micro-label !text-foreground">Net pay</p>
            <p className="mt-1 max-w-md text-xs italic leading-5 text-muted-foreground">{amountInWords(net, cur)}</p>
          </div>
          <div className={cn("shrink-0", split && "text-right")}>
            <p className="tabular font-display text-3xl font-bold leading-none tracking-tight text-primary">{formatMoney(net, cur)}</p>
            <p className="tabular mt-1.5 text-[11px] text-muted-foreground">
              {formatMoney(gross, cur)} gross − {formatMoney(ded, cur)} deductions
            </p>
          </div>
        </section>

        {slip.notes && (
          <section className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
            <p className="micro-label">Notes</p>
            <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-5 text-foreground/85">{slip.notes}</p>
          </section>
        )}

        {attendance && <p className="tabular text-xs leading-5 text-muted-foreground">Attendance in {formatMonth(slip.month)}: {attendance}. Shown for reference.</p>}

        <footer className={cn("flex gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground", roomy ? "flex-row items-center justify-between" : "flex-col")}>
          <span>Computer-generated payslip from {company.name}; no signature is required.</span>
          <span className="flex items-center gap-2">
            <PayslipStatusBadge status={slip.status} />
            <span className="tabular">{statusLine(slip)}</span>
          </span>
        </footer>
      </div>
    </article>
  );
}
