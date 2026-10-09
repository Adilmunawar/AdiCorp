/*
 * Shapes returned by the payroll_* and portal payroll RPCs
 * (supabase/migrations/20261007150200_payroll_staff_rpcs.sql, 20261007150400_payroll_portal_rpcs.sql).
 * Dates are yyyy-MM-dd strings; months are first-of-month dates.
 */

export type PayslipStatus = "draft" | "final" | "paid";
export type PayMethod = "bank" | "cash";
export type OvertimeType = "regular" | "weekend" | "holiday";
export type OvertimePayStatus = "unpriced" | "priced" | "no_pay";

export interface TaxSlab {
  from: number;
  fixed: number;
  rate: number;
}

export interface OvertimeRules {
  basis: "gross" | "basic";
  days_per_month: number;
  hours_per_day: number;
  multipliers: Record<OvertimeType, number>;
}

export interface PayRules {
  basic_percent: number;
  medical_exempt_percent: number;
  slabs: TaxSlab[];
  label: string;
  overtime: OvertimeRules;
}

export interface PayslipLine {
  label: string;
  amount: number;
}

/** _payroll_month_pay without segments. */
export interface MonthPay {
  monthly_salary: number;
  other_allowance: number;
  pay_method: PayMethod;
  prorated: boolean;
  salary_changed: boolean;
  month_days: number;
  paid_days: number;
  unpaid_leave_days: number;
  joined: string | null;
  left: string | null;
  has_salary: boolean;
  segments?: Array<{ from: string; to: string; days: number; monthly_salary: number; other_allowance: number }>;
}

export interface AttendanceSummary {
  working_days: number;
  working_days_month: number;
  present: number;
  half: number;
  leave: number;
  absent: number;
  unmarked: number;
  days_worked: number;
}

export interface OvertimeSums {
  hours: number;
  amount: number;
  entries: number;
}

export interface SheetEmployee {
  id: string;
  code: string | null;
  name: string;
  rank: string | null;
  status: string;
  joining_date: string | null;
  separation_date: string | null;
  department_id: string | null;
  department: string | null;
  has_bank: boolean;
}

export interface SheetPayslip {
  id: string;
  status: PayslipStatus;
  legacy: boolean;
  basic_salary: number;
  allowances: number;
  other_allowances: number;
  overtime_earnings: number;
  overtime_hours: number;
  income_tax: number;
  taxable_income: number;
  tax_manual: boolean;
  other_deductions: number;
  salary_basis: number;
  other_basis: number;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  paid_on: string | null;
  published_at: string | null;
  seen_at: string | null;
  pay_method: PayMethod;
}

export interface SheetRow {
  employee: SheetEmployee;
  pay: MonthPay;
  attendance: AttendanceSummary;
  overtime: OvertimeSums;
  overtime_waiting: number;
  salary_stale: boolean;
  overtime_stale: boolean;
  payslip: SheetPayslip | null;
}

export interface PayrollSheet {
  month: string;
  rows: SheetRow[];
  open_events: number;
}

export type SheetOp = "prepare" | "refill" | "refill_stale" | "finalise" | "reopen" | "paid" | "unpaid" | "delete";

export interface SheetOpResult {
  op: SheetOp;
  done: Array<{ employee_id: string; name: string; payslip_id: string | null; net: number | null }>;
  skipped: number;
  negative: number;
  /** finalise: drafts left alone because the salary, unpaid leave or overtime behind them changed. */
  stale?: number;
  /** delete: drafts left alone because they were paid once (payslips.ever_paid). */
  locked?: number;
  /** What the server wants Finance to know about stale or locked rows. */
  message?: string | null;
  error?: string;
}

export interface PayslipRecord extends SheetPayslip {
  employee_id: string;
  company_id: string;
  month: string;
  daily_rate: number;
  days_worked: number;
  present_days: number;
  short_leave_days: number;
  paid_leave_days: number;
  absent_days: number;
  paid_days: number | null;
  month_days: number | null;
  /** True once the slip was ever marked paid; it can be reopened but never deleted. */
  ever_paid?: boolean;
  overtime_basis: number;
  lines: PayslipLine[];
  notes: string | null;
  notes_auto: boolean;
  generated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OvertimeEntry {
  id: string;
  date: string;
  hours: number;
  overtime_type: OvertimeType;
  reason: string | null;
  hourly_rate: number;
  multiplier: number;
  amount: number;
  pay_status: OvertimePayStatus;
}

export interface PayslipEmployee {
  id: string;
  code: string | null;
  name: string;
  father_name: string | null;
  rank: string | null;
  department: string | null;
  cnic: string | null;
  status: string;
  email: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  joining_date: string | null;
  separation_date: string | null;
}

export interface PayslipCompany {
  name: string;
  logo: string | null;
  currency: string;
  address: string | null;
  phone: string | null;
  website: string | null;
}

export interface PayslipDetail {
  payslip: PayslipRecord;
  employee: PayslipEmployee;
  company: PayslipCompany;
  pay: MonthPay;
  stale: { salary: boolean; overtime: boolean };
  attendance: AttendanceSummary;
  rules: PayRules;
  overtime: { on_slip: OvertimeEntry[]; unclaimed: OvertimeEntry[]; waiting: OvertimeEntry[] };
  prev_id: string | null;
  next_id: string | null;
  error?: string;
}

export interface PayslipInput {
  basic_salary: number;
  allowances: number;
  other_allowances: number;
  overtime_earnings: number;
  overtime_hours: number;
  income_tax: number;
  tax_manual: boolean;
  other_deductions: number;
  lines: PayslipLine[];
  notes: string;
}

export interface RulesBundle {
  rules: PayRules;
  defaults: PayRules;
  saved: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
  currency: string;
}

export interface SalaryEntry {
  id: string;
  monthly_salary: number;
  other_allowance: number;
  pay_method: PayMethod;
  effective_from: string;
  reason: string | null;
}

export interface SalaryRow {
  id: string;
  code: string | null;
  name: string;
  rank: string | null;
  status: string;
  department_id: string | null;
  department: string | null;
  joining_date: string | null;
  separation_date: string | null;
  has_bank: boolean;
  current: SalaryEntry | null;
  upcoming: SalaryEntry | null;
}

export interface SalaryChange {
  id: string;
  employee_id: string;
  employee_name: string;
  effective_from: string;
  monthly_salary: number;
  other_allowance: number;
  pay_method: PayMethod;
  reason: string | null;
  created_at: string;
  created_by_name: string | null;
  previous_salary: number | null;
  upcoming: boolean;
  can_undo: boolean;
}

export interface SalaryOverview {
  this_month: string;
  next_month: string;
  rows: SalaryRow[];
  changes: SalaryChange[];
}

export interface SalarySaveResult {
  ok?: boolean;
  error?: string;
  changed: Array<{ employee_id: string; name: string; effective_from: string; monthly_salary: number; other_allowance: number; pay_method: PayMethod }>;
  kept: string[];
  effective_from: string;
}

export interface OvertimePayRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string | null;
  rank: string | null;
  department: string | null;
  date: string;
  hours: number;
  overtime_type: OvertimeType;
  reason: string | null;
  reviewed_at: string | null;
  reviewer_name: string | null;
  pay_status: OvertimePayStatus;
  hourly_rate: number;
  multiplier: number;
  amount: number;
  priced_at: string | null;
  pricer_name: string | null;
  payslip_id: string | null;
  payslip_month: string | null;
  payslip_status: PayslipStatus | null;
  locked: boolean;
  monthly_salary: number;
  suggested_rate: number;
  suggested_multiplier: number;
  suggested_amount: number;
}

export interface OvertimePayList {
  scope: "waiting" | "month" | "ready";
  month: string;
  rows: OvertimePayRow[];
  counts: { waiting: number; waiting_hours: number; ready: number; ready_amount: number; pending_with_hr: number };
  rules: OvertimeRules;
}

export type PriceKind = "rate" | "fixed" | "no_pay" | "unpriced";

export type PayEventKind = "joined" | "joining_date" | "position" | "left" | "rejoined" | "unpaid_leave" | "unpaid_leave_undone";

export interface PayEventRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string | null;
  employee_status: string;
  kind: PayEventKind | string;
  title: string;
  detail: string | null;
  effective_date: string | null;
  created_at: string;
  created_by_name: string | null;
  done_at: string | null;
  done_by_name: string | null;
  effect: {
    month: string;
    pay: MonthPay;
    payslip_id: string | null;
    payslip_status: PayslipStatus | null;
    stale: { salary: boolean; overtime: boolean } | null;
    later_finals: number;
  } | null;
}

export interface PayrollCounts {
  open_events: number;
  overtime_waiting: number;
  no_salary: number;
}

export interface ReportMonth {
  month: string;
  payslips: number;
  drafts: number;
  finals: number;
  paid: number;
  basic: number;
  allowances: number;
  other_allowances: number;
  overtime: number;
  gross: number;
  tax: number;
  deductions: number;
  net: number;
  paid_net: number;
}

export interface ReportDepartment {
  department: string;
  people: number;
  payslips: number;
  gross: number;
  tax: number;
  overtime: number;
  net: number;
}

export interface PayrollReport {
  from: string;
  to: string;
  months: ReportMonth[];
  departments: ReportDepartment[];
  error?: string;
}

/* ------------------------------------------------------------- portal */

export interface PortalPayslipSummary {
  id: string;
  month: string;
  status: PayslipStatus;
  gross_salary: number;
  total_deductions: number;
  income_tax: number;
  net_salary: number;
  paid_on: string | null;
  pay_method: PayMethod;
  published_at: string | null;
  is_new: boolean;
}

export interface PortalPayslipDetail {
  payslip: Omit<PayslipRecord, "employee_id" | "company_id" | "salary_basis" | "other_basis" | "overtime_basis" | "tax_manual" | "notes_auto" | "generated_by" | "created_at" | "updated_at" | "seen_at">;
  employee: Omit<PayslipEmployee, "id" | "status" | "email" | "separation_date">;
  company: PayslipCompany;
}

export interface ExpectedPay {
  month: string;
  currency: string;
  salary_on_file: number;
  pay: MonthPay;
  figures: {
    basic_salary: number;
    allowances: number;
    other_allowances: number;
    overtime_earnings: number;
    income_tax: number;
    taxable_income: number;
  };
  totals: { gross_salary: number; total_deductions: number; net_salary: number };
  overtime: {
    counted: OvertimeSums;
    unpriced: { entries: number; hours: number; estimate: number };
    pending: { entries: number; hours: number };
  };
  attendance: AttendanceSummary;
  payslip: { id: string; status: PayslipStatus; gross_salary: number; net_salary: number; paid_on: string | null } | null;
  preparing: boolean;
}
