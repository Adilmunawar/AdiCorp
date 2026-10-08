/*
 * The payroll arithmetic, mirrored from the server (supabase/migrations/20261007150100_payroll_engine.sql)
 * so the editor, the salaries page and Tax & structure can preview live while Finance types. The server
 * recomputes everything on save; these must stay identical to it.
 *
 *   basic = S x basic %, allowances = S - basic, medical exempt = basic x medical %,
 *   taxable = S - medical exempt, tax(year) = slabs on taxable x 12, tax(month) = tax(year) / 12 rounded.
 * Checked by hand (default PKR table): 250,000 -> taxable 235,000, 240,000 a year, 20,000 a month.
 */
import type { OvertimeType, PayRules, PayslipLine, TaxSlab } from "./types";

export const MONEY_LIMIT = 100_000_000;
export const MAX_LINES = 6;
export const LABEL_MAX = 40;
export const NOTES_MAX = 500;
export const REASON_MAX = 120;
export const MAX_SLABS = 12;
export const MAX_MULTIPLIER = 10;
export const MAX_HOURLY_RATE = 1_000_000;
export const MAX_OVERTIME_AMOUNT = 10_000_000;

/**
 * Postgres round() on numeric: half away from zero, on the decimal value. Binary floats store 1.005 as
 * 1.00499..., so plain Math.round(v * 100) gives 1.00 where the server gives 1.01; reading the scaled value
 * back at 15 significant digits first recovers the decimal the figure stands for.
 */
function roundAt(n: number, scale: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const r = Math.round(Number.parseFloat((Math.abs(v) * scale).toPrecision(15))) / scale;
  return v < 0 ? -r : r;
}

export function round2(n: number): number {
  return roundAt(n, 100);
}

/** Postgres round() on a positive or negative value: half away from zero. */
export function roundWhole(n: number): number {
  return roundAt(n, 1);
}

/** Yearly tax: the highest slab whose start is below the income; income exactly on a boundary stays lower. */
export function yearlyTax(taxableYear: number, slabs: TaxSlab[]): number {
  const income = Number(taxableYear) || 0;
  if (income <= 0) return 0;
  let slab: TaxSlab | null = null;
  for (const s of [...slabs].sort((a, b) => a.from - b.from)) if (income > s.from) slab = s;
  if (!slab) return 0;
  return round2(slab.fixed + ((income - slab.from) * slab.rate) / 100);
}

export interface SalaryBreakdown {
  gross: number;
  basic: number;
  allowances: number;
  medical_exempt: number;
  taxable: number;
  yearly_tax: number;
  monthly_tax: number;
}

export function breakdown(monthlySalary: number, rules: PayRules): SalaryBreakdown {
  const gross = round2(Math.max(0, Number(monthlySalary) || 0));
  const basic = round2((gross * rules.basic_percent) / 100);
  const medical = round2((basic * rules.medical_exempt_percent) / 100);
  const taxable = round2(Math.max(0, gross - medical));
  const yearly = yearlyTax(taxable * 12, rules.slabs);
  return { gross, basic, allowances: round2(gross - basic), medical_exempt: medical, taxable, yearly_tax: yearly, monthly_tax: roundWhole(yearly / 12) };
}

/** Tax from a payslip's own basic and allowances (after Finance changed them by hand). */
export function taxFromSplit(basic: number, allowances: number, rules: PayRules): { taxable: number; yearly_tax: number; monthly_tax: number } {
  const b = Math.max(0, Number(basic) || 0);
  const a = Math.max(0, Number(allowances) || 0);
  const taxable = round2(Math.max(0, b + a - (b * rules.medical_exempt_percent) / 100));
  const yearly = yearlyTax(taxable * 12, rules.slabs);
  return { taxable, yearly_tax: yearly, monthly_tax: roundWhole(yearly / 12) };
}

/** A salary split into basic and allowances by the rules. */
export function splitSalary(salary: number, rules: PayRules): { basic: number; allowances: number } {
  const s = round2(Math.max(0, Number(salary) || 0));
  const basic = round2((s * rules.basic_percent) / 100);
  return { basic, allowances: round2(s - basic) };
}

export interface PayslipFigures {
  basic_salary: number;
  allowances: number;
  other_allowances: number;
  overtime_earnings: number;
  income_tax: number;
  other_deductions: number;
  lines: PayslipLine[];
}

export interface PayslipTotals {
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  extra_earnings: number;
  extra_deductions: number;
}

/**
 * gross = basic + allowances + other allowances + overtime + positive lines
 * total deductions = income tax + other deductions + |negative lines|; net = gross - total deductions.
 */
export function computeTotals(f: PayslipFigures): PayslipTotals {
  let earn = 0;
  let ded = 0;
  for (const l of f.lines) {
    const a = Number(l.amount) || 0;
    if (a > 0) earn += a;
    else if (a < 0) ded += -a;
  }
  const n = (v: number) => Number(v) || 0;
  const gross = round2(n(f.basic_salary) + n(f.allowances) + n(f.other_allowances) + n(f.overtime_earnings) + earn);
  const total = round2(n(f.income_tax) + n(f.other_deductions) + ded);
  return { gross_salary: gross, total_deductions: total, net_salary: round2(gross - total), extra_earnings: round2(earn), extra_deductions: round2(ded) };
}

/** The hourly overtime rate the rules suggest for a monthly salary; 0 without one. */
export function suggestedHourlyRate(monthlySalary: number, rules: PayRules): number {
  const salary = Math.max(0, Number(monthlySalary) || 0);
  const base = rules.overtime.basis === "basic" ? (salary * rules.basic_percent) / 100 : salary;
  return round2(base / rules.overtime.days_per_month / rules.overtime.hours_per_day);
}

export function multiplierFor(type: OvertimeType | string, rules: PayRules): number {
  return rules.overtime.multipliers[type as OvertimeType] ?? rules.overtime.multipliers.regular;
}

/** Hours x rate x multiplier, to the whole unit. */
export function overtimeAmount(hours: number, hourlyRate: number, multiplier: number): number {
  return roundWhole((Number(hours) || 0) * (Number(hourlyRate) || 0) * (Number(multiplier) || 0));
}

/** Parse what someone typed into a money field: commas and spaces allowed, "+5000" or "-5000"; "" is 0; NaN when not a number. */
export function parseAmount(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return raw;
  const text = String(raw ?? "").trim().replace(/[,\s]/g, "");
  if (!text) return 0;
  if (!/^[-+]?\d+(\.\d+)?$/.test(text)) return Number.NaN;
  return Number(text);
}

export const OVERTIME_TYPE_LABEL: Record<OvertimeType, string> = {
  regular: "Working day",
  weekend: "Weekend",
  holiday: "Holiday",
};
