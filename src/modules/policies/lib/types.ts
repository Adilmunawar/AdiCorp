/** Row shapes for the policies & letters module (tables newer than the generated types). */

export type PolicyVersionStatus = "draft" | "published" | "superseded";

/** One row of `policies_list()`. */
export interface PolicyListRow {
  id: string;
  title: string;
  summary: string;
  requires_signature: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  current_version_id: string | null;
  current_version: number | null;
  published_at: string | null;
  draft_version_id: string | null;
  draft_version: number | null;
  draft_updated_at: string | null;
  required: number;
  signed: number;
}

export interface PolicyRow {
  id: string;
  company_id: string;
  title: string;
  summary: string;
  requires_signature: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyVersionRow {
  id: string;
  policy_id: string;
  version: number;
  body: string;
  body_sha256: string | null;
  status: PolicyVersionStatus;
  change_note: string;
  published_at: string | null;
  published_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of `policy_signers(version)`. */
export interface SignerRow {
  employee_id: string;
  name: string;
  employee_code: string | null;
  rank: string | null;
  department: string | null;
  status: string | null;
  required: boolean;
  signature_id: string | null;
  signed_at: string | null;
  signed_name: string | null;
}

/** A full signature record (staff: table read; portal: portal_policy_signature). */
export interface SignatureRecord {
  id: string;
  policy_id: string;
  version_id: string;
  title: string;
  version: number;
  body: string;
  version_sha256: string | null;
  published_at: string | null;
  signed_name: string;
  signature_png: string;
  body_sha256: string;
  ip: string | null;
  user_agent: string | null;
  signed_at: string;
  employee_name: string | null;
  employee_code: string | null;
  rank: string | null;
  cnic: string | null;
}

export type LetterKind =
  | "explanation"
  | "warning"
  | "final"
  | "appreciation"
  | "appointment"
  | "confirmation"
  | "promotion"
  | "increment"
  | "transfer"
  | "experience"
  | "relieving"
  | "general";

export interface LetterRow {
  id: string;
  company_id: string;
  employee_id: string;
  ref: string;
  kind: LetterKind;
  subject: string;
  body: string;
  facts: Record<string, unknown>;
  period: string | null;
  reply_by: string | null;
  signatory_name: string;
  signatory_title: string;
  issued_by_name: string | null;
  issued_at: string;
  acknowledged_at: string | null;
  reply: string;
  replied_at: string | null;
  withdrawn_at: string | null;
  withdrawn_by_name: string | null;
  withdraw_reason: string;
}

export interface LetterEmployee {
  id: string;
  name: string;
  employee_code: string | null;
  rank: string | null;
  status: string | null;
  cnic?: string | null;
  joining_date?: string | null;
  separation_date?: string | null;
  department: { name: string } | null;
}

export type LetterWithEmployee = LetterRow & { employee: LetterEmployee | null };

export interface LetterSettings {
  ref_prefix: string;
  default_prefix: string;
  signatory_name: string;
  signatory_title: string;
  next_ref: string;
  saved: boolean;
}

/* ------------------------------------------------------------------ portal */

export interface PortalPendingSignature {
  version_id: string;
  policy_id: string;
  title: string;
  summary: string;
  version: number;
  published_at: string | null;
}

export interface PortalPolicyRow {
  policy_id: string;
  title: string;
  summary: string;
  requires_signature: boolean;
  version_id: string;
  version: number;
  published_at: string | null;
  signature_id: string | null;
  signed_at: string | null;
  earlier: { signature_id: string; version_id: string; version: number; signed_at: string }[];
}

export interface PortalPolicyVersion {
  version_id: string;
  policy_id: string;
  title: string;
  summary: string;
  requires_signature: boolean;
  version: number;
  status: PolicyVersionStatus;
  body: string;
  body_sha256: string | null;
  published_at: string | null;
  signature_id: string | null;
  signed_at: string | null;
  employee_name: string;
}

export interface PortalLetterListRow {
  id: string;
  ref: string;
  kind: LetterKind;
  subject: string;
  issued_at: string;
  reply_by: string | null;
  acknowledged_at: string | null;
  replied_at: string | null;
  withdrawn_at: string | null;
}

export interface PortalLetter extends PortalLetterListRow {
  body: string;
  facts: Record<string, unknown>;
  period: string | null;
  signatory_name: string;
  signatory_title: string;
  reply: string;
  withdraw_reason: string;
  employee_name: string;
  employee_code: string | null;
  rank: string | null;
  department: string | null;
}
