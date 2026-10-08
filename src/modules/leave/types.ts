/** Leave & overtime module: shapes returned by the leave_* / overtime_* / portal_* RPCs. */

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveKind = "annual" | "sick" | "casual" | "unpaid" | "maternity" | "paternity" | "other";

export const LEAVE_KINDS: LeaveKind[] = ["annual", "sick", "casual", "unpaid", "maternity", "paternity", "other"];
export const LEAVE_STATUSES: LeaveStatus[] = ["pending", "approved", "rejected", "cancelled"];

export interface LeaveType {
  id: string;
  name: string;
  type: LeaveKind;
  days_per_year: number;
  is_paid: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LeaveRequestRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string | null;
  department: string | null;
  avatar_url: string | null;
  leave_type_id: string;
  type_name: string;
  type_kind: LeaveKind;
  is_paid: boolean;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: LeaveStatus;
  review_notes: string | null;
  requested_via: "portal" | "staff";
  requester_name: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  /** A month in the range is closed by a final payslip: attendance cannot change. */
  locked: boolean;
}

export interface LeaveBalanceRow {
  employee_id: string;
  employee_name: string;
  employee_code: string | null;
  department: string | null;
  avatar_url: string | null;
  leave_type_id: string;
  type_name: string;
  type_kind: LeaveKind;
  is_paid: boolean;
  default_days: number;
  allowed: number;
  /** A per-person allowance for the year overrides the type's default. */
  custom: boolean;
  /** 0 days per year and no override: no yearly limit (e.g. unpaid). */
  unlimited: boolean;
  used: number;
  pending: number;
  remaining: number | null;
}

export interface LeaveSettings {
  requires_approval: boolean;
}

export type OvertimeStatus = "pending" | "approved" | "rejected";
export type OvertimeType = "regular" | "weekend" | "holiday";
/** Where approved hours stand with Finance, in words HR and the employee may see (never amounts). */
export type PayStage = "with_finance" | "ready" | "paid" | "no_pay";

export const OVERTIME_TYPES: OvertimeType[] = ["regular", "weekend", "holiday"];
export const OVERTIME_STATUSES: OvertimeStatus[] = ["pending", "approved", "rejected"];
export const MAX_OVERTIME_HOURS = 16;

export interface OvertimeHoursRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string | null;
  department: string | null;
  avatar_url: string | null;
  date: string;
  hours: number;
  claimed_hours: number | null;
  overtime_type: OvertimeType;
  reason: string | null;
  status: OvertimeStatus;
  review_notes: string | null;
  requested_via: "portal" | "staff";
  requester_name: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  pay_stage: PayStage | null;
  payslip_month: string | null;
  locked: boolean;
}

export interface EmployeeOption {
  id: string;
  name: string;
  employee_code: string | null;
  avatar_url: string | null;
}

/* ---------------------------------------------------------------- portal */

export interface PortalLeaveRequest {
  id: string;
  leave_type_id: string;
  type_name: string;
  type_kind: LeaveKind;
  is_paid: boolean;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: LeaveStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  filed_by_hr: boolean;
}

export interface PortalLeaveBalance {
  leave_type_id: string;
  type_name: string;
  type_kind: LeaveKind;
  is_paid: boolean;
  allowed: number;
  custom: boolean;
  unlimited: boolean;
  used: number;
  pending: number;
  remaining: number | null;
}

export interface PortalLeaveOverview {
  year: number;
  today: string;
  requires_approval: boolean;
  types: Array<Pick<LeaveType, "id" | "name" | "type" | "is_paid" | "days_per_year">>;
  balances: PortalLeaveBalance[];
  requests: PortalLeaveRequest[];
}

export interface PortalOvertimeRecord {
  id: string;
  date: string;
  hours: number;
  claimed_hours: number | null;
  overtime_type: OvertimeType;
  reason: string | null;
  status: OvertimeStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  filed_by_hr: boolean;
  pay_stage: PayStage | null;
  payslip_month: string | null;
  locked: boolean;
}

export interface PortalOvertimeOverview {
  month: string;
  today: string;
  summary: {
    approved_hours: number;
    approved_count: number;
    pending_hours: number;
    pending_count: number;
    rejected_count: number;
    paid_count: number;
    total: number;
  };
  records: PortalOvertimeRecord[];
}

export interface ActionReply {
  id: string;
  status: string;
  days?: number;
  message?: string;
}
