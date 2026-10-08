export const PERMISSION_ERROR_EVENT = "app:permission-error";

type PermissionEventDetail = {
  title: string;
  description: string;
  table?: string;
  signature: string;
};

type SupabaseErrorPayload = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const COMPANY_SETUP_TABLES = new Set([
  "employees",
  "attendance",
  "payslips",
  "leave_requests",
  "leave_balances",
  "leave_types",
  "overtime_records",
  "overtime_config",
  "events",
  "monthly_working_days",
  "working_days_config",
  "company_working_settings",
  "tier_config",
]);

const normalize = (value: string | undefined): string => (value || "").toLowerCase();

export const extractSupabaseTable = (url: string): string | undefined => {
  const match = url.match(/\/rest\/v1\/([^?/#]+)/i);
  return match?.[1];
};

export const parsePermissionError = (
  payload: SupabaseErrorPayload | null,
  table?: string,
): PermissionEventDetail | null => {
  if (!payload) return null;

  const message = normalize(payload.message);
  const details = normalize(payload.details);
  const hint = normalize(payload.hint);
  const code = payload.code || "";
  const full = `${message} ${details} ${hint}`;

  const isRlsOrPermissionError =
    code === "42501" ||
    full.includes("row-level security") ||
    full.includes("permission denied") ||
    full.includes("insufficient privilege");

  if (!isRlsOrPermissionError) return null;

  // Staff pages only open once the company exists (RequireStaff), so a refusal on a company table
  // means the role may not do this, not that setup is missing.
  const companyData =
    (table ? COMPANY_SETUP_TABLES.has(table) : false) ||
    full.includes("company_id") ||
    full.includes("company setup");

  const description = companyData
    ? "Your role can't make this change. If you need it, ask the workspace owner."
    : "You don't have permission for this action. If you need it, ask the workspace owner.";

  return {
    title: "Action blocked by permissions",
    description,
    table,
    signature: `${code}:${table || "unknown"}:${message}`,
  };
};

export const emitPermissionErrorEvent = (detail: PermissionEventDetail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PERMISSION_ERROR_EVENT, { detail }));
};
