import type { AssetCategory, AssetCondition, AssetStatus, ChecklistKind, DocumentType } from "../lib/constants";

/**
 * Employee columns the People module reads. Never add wage_rate, password or
 * password_hash here: HR must not see pay or credentials.
 */
export const EMPLOYEE_COLUMNS = [
  "id",
  "company_id",
  "employee_code",
  "name",
  "rank",
  "department_id",
  "status",
  "joining_date",
  "separation_date",
  "email",
  "phone",
  "cnic",
  "father_name",
  "date_of_birth",
  "gender",
  "emergency_contact",
  "address",
  "education",
  "bank_name",
  "bank_account_number",
  "shift_type",
  "weekend_saturday",
  "working_hours_per_day",
  "notes",
  "avatar_url",
  "user_id",
  "created_at",
].join(",");

export interface Employee {
  id: string;
  company_id: string;
  employee_code: string | null;
  name: string;
  rank: string;
  department_id: string | null;
  status: string;
  joining_date: string | null;
  separation_date: string | null;
  email: string | null;
  phone: string | null;
  cnic: string | null;
  father_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  emergency_contact: string | null;
  address: string | null;
  education: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  shift_type: string | null;
  weekend_saturday: boolean | null;
  working_hours_per_day: number | null;
  notes: string | null;
  avatar_url: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  company_id: string;
  document_type: DocumentType;
  document_name: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  expires_on: string | null;
  created_at: string;
}

/** Light row for the tracking matrix and directory counts. */
export interface DocumentStub {
  id: string;
  employee_id: string;
  document_type: DocumentType;
  expires_on: string | null;
}

export type UpdateRequestStatus = "pending" | "approved" | "partially_approved" | "rejected" | "cancelled";

export interface UpdateRequest {
  id: string;
  employee_id: string | null;
  company_id: string | null;
  requested_changes: Record<string, string | null>;
  status: UpdateRequestStatus | null;
  note: string | null;
  review_note: string | null;
  decisions: Record<string, boolean> | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  action_type: string;
  description: string;
  details: Record<string, unknown> | null;
  user_id: string | null;
  employee_id: string | null;
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  company_id: string;
  kind: ChecklistKind;
  name: string;
  description: string | null;
  is_default: boolean;
  default_due_days: number;
  created_at: string;
}

export interface ChecklistTemplateStep {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  auto_key: string | null;
  due_offset_days: number;
  position: number;
}

export type ChecklistStatus = "open" | "done" | "cancelled";

export interface Checklist {
  id: string;
  company_id: string;
  employee_id: string;
  template_id: string | null;
  kind: ChecklistKind;
  title: string;
  status: ChecklistStatus;
  start_date: string;
  due_date: string | null;
  note: string | null;
  started_at: string;
  closed_at: string | null;
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  auto_key: string | null;
  position: number;
  due_date: string | null;
  done_at: string | null;
  done_by: string | null;
  touched: boolean;
}

export interface ChecklistWithItems extends Checklist {
  items: ChecklistItem[];
}

export interface Asset {
  id: string;
  company_id: string;
  tag: string;
  name: string;
  category: AssetCategory;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  specs: string | null;
  purchase_date: string | null;
  warranty_until: string | null;
  condition: AssetCondition;
  status: AssetStatus;
  location: string | null;
  notes: string | null;
  employee_id: string | null;
  assigned_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetAssignment {
  id: string;
  asset_id: string;
  employee_id: string;
  assigned_on: string;
  assigned_by: string | null;
  condition_out: string | null;
  note_out: string | null;
  returned_on: string | null;
  returned_by: string | null;
  condition_in: string | null;
  note_in: string | null;
  created_at: string;
}

export interface BadgeCounts {
  pending_updates: number;
  missing_documents: number;
  overdue_checklists: number;
}

export interface PortalAccess {
  has_password: boolean;
  must_change_password: boolean;
  can_sign_in: boolean;
  last_seen_at: string | null;
  active_sessions: number;
}

/** Payload of people_save_employee (all strings; blank clears). */
export interface EmployeeInput {
  name: string;
  cnic: string;
  father_name: string;
  date_of_birth: string;
  gender: string;
  email: string;
  phone: string;
  emergency_contact: string;
  address: string;
  education: string;
  rank: string;
  department_id: string;
  joining_date: string;
  shift_type: string;
  weekend_saturday: string;
  working_hours_per_day: string;
  bank_name: string;
  bank_account_number: string;
  notes: string;
  employee_code: string;
  portal_password: string;
}
