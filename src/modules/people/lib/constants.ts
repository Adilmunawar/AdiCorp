/*
 * People module reference data: labels and option lists shared by staff and portal pages.
 */

export const EMPLOYEE_STATUSES = ["active", "separated"] as const;

export const SHIFT_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
] as const;

export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
] as const;

/** employees.weekend_saturday: null follows the company rule. */
export const SATURDAY_OPTIONS = [
  { value: "company", label: "Company rule" },
  { value: "off", label: "Saturday off" },
  { value: "working", label: "Saturday working" },
] as const;

export type SaturdayRule = (typeof SATURDAY_OPTIONS)[number]["value"];

export function saturdayRule(value: boolean | null | undefined): SaturdayRule {
  if (value === true) return "off";
  if (value === false) return "working";
  return "company";
}

export const DOCUMENT_TYPES = [
  { value: "id_copy", label: "CNIC / ID copy" },
  { value: "contract", label: "Employment contract" },
  { value: "certificate", label: "Education certificate" },
  { value: "resume", label: "CV / résumé" },
  { value: "other", label: "Other" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

/** The documents every active employee must have on file. */
export const REQUIRED_DOCUMENTS: { type: DocumentType; short: string }[] = [
  { type: "id_copy", short: "ID" },
  { type: "contract", short: "Contract" },
  { type: "certificate", short: "Certificate" },
];

export function documentTypeLabel(type: string | null | undefined): string {
  return DOCUMENT_TYPES.find((d) => d.value === type)?.label ?? "Other";
}

export const ASSET_CATEGORIES = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "monitor", label: "Monitor" },
  { value: "phone", label: "Phone" },
  { value: "tablet", label: "Tablet" },
  { value: "sim", label: "SIM card" },
  { value: "printer", label: "Printer" },
  { value: "network", label: "Network" },
  { value: "accessory", label: "Accessory" },
  { value: "furniture", label: "Furniture" },
  { value: "vehicle", label: "Vehicle" },
  { value: "other", label: "Other" },
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]["value"];

export function assetCategoryLabel(value: string | null | undefined): string {
  return ASSET_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export const ASSET_STATUSES = [
  { value: "available", label: "Available" },
  { value: "assigned", label: "Assigned" },
  { value: "repair", label: "In repair" },
  { value: "retired", label: "Retired" },
  { value: "lost", label: "Lost" },
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number]["value"];

export const ASSET_CONDITIONS = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "damaged", label: "Damaged" },
] as const;

export type AssetCondition = (typeof ASSET_CONDITIONS)[number]["value"];

export function assetConditionLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ASSET_CONDITIONS.find((c) => c.value === value)?.label ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export function assetStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ASSET_STATUSES.find((s) => s.value === value)?.label ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/** Badge props for a checklist: open ones read "In progress" (blue), not a green "Open". */
export function checklistBadge(status: string, overdue: boolean): { status: string; label: string; tone: "info" | "success" | "neutral" | "danger" } {
  if (overdue) return { status: "overdue", label: "Overdue", tone: "danger" };
  if (status === "done") return { status, label: "Completed", tone: "success" };
  if (status === "cancelled") return { status, label: "Cancelled", tone: "neutral" };
  return { status, label: "In progress", tone: "info" };
}

export const CHECKLIST_KINDS = [
  { value: "onboarding", label: "Onboarding" },
  { value: "offboarding", label: "Offboarding" },
] as const;

export type ChecklistKind = (typeof CHECKLIST_KINDS)[number]["value"];

/** Auto steps the database can tick from live data. */
export const AUTO_KEYS: { value: string; label: string; kind: ChecklistKind; href?: (employeeId: string) => string }[] = [
  { value: "doc_id_copy", label: "CNIC copy uploaded", kind: "onboarding", href: (id) => `/employees/${id}?tab=documents` },
  { value: "doc_contract", label: "Contract uploaded", kind: "onboarding", href: (id) => `/employees/${id}?tab=documents` },
  { value: "doc_certificate", label: "Certificate uploaded", kind: "onboarding", href: (id) => `/employees/${id}?tab=documents` },
  { value: "employment_set", label: "Position, department and joining date set", kind: "onboarding", href: (id) => `/employees/${id}/edit` },
  { value: "salary_set", label: "Salary set by Finance", kind: "onboarding" },
  { value: "portal_access", label: "Portal password set", kind: "onboarding", href: (id) => `/employees/${id}/edit#portal` },
  { value: "assets_issued", label: "Equipment handed over", kind: "onboarding", href: (id) => `/employees/${id}?tab=assets` },
  { value: "bank_details", label: "Bank details on file", kind: "onboarding", href: (id) => `/employees/${id}/edit` },
  { value: "profile_complete", label: "Profile complete", kind: "onboarding", href: (id) => `/employees/${id}/edit` },
  { value: "assets_returned", label: "All equipment returned", kind: "offboarding", href: (id) => `/employees/${id}?tab=assets` },
  { value: "access_disabled", label: "Portal access disabled", kind: "offboarding" },
  { value: "final_payslip", label: "Final payslip issued", kind: "offboarding" },
];

export function autoKeyLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return AUTO_KEYS.find((k) => k.value === key)?.label ?? null;
}

/** Field labels for profile-change requests and the activity diff. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Full name",
  cnic: "CNIC",
  email: "E-mail",
  phone: "Phone",
  father_name: "Father's name",
  date_of_birth: "Date of birth",
  gender: "Gender",
  emergency_contact: "Emergency contact",
  address: "Address",
  education: "Education",
  bank_name: "Bank",
  bank_account_number: "Account number",
  rank: "Position",
  department_id: "Department",
  joining_date: "Joining date",
  shift_type: "Shift",
  weekend_saturday: "Saturday",
  working_hours_per_day: "Hours per day",
  notes: "Notes",
  employee_code: "Employee code",
  avatar_url: "Profile photo",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

/** Fields counted for profile completeness (same rule as the profile_complete auto step). */
export const COMPLETENESS_FIELDS = ["name", "cnic", "father_name", "phone", "date_of_birth", "emergency_contact"] as const;

/** Badge tone for an asset status. */
export function assetStatusTone(status: string): "success" | "primary" | "warning" | "danger" | "neutral" {
  if (status === "available") return "success";
  if (status === "assigned") return "primary";
  if (status === "repair") return "warning";
  if (status === "lost") return "danger";
  return "neutral";
}
