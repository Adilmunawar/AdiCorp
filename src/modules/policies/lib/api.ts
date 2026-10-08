import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import { todayIn } from "./letters";
import type {
  LetterEmployee,
  LetterKind,
  LetterSettings,
  LetterWithEmployee,
  PolicyListRow,
  PolicyRow,
  PolicyVersionRow,
  PortalLetter,
  PortalLetterListRow,
  PortalPendingSignature,
  PortalPolicyRow,
  PortalPolicyVersion,
  SignatureRecord,
  SignerRow,
} from "./types";

/* ------------------------------------------------------------------ keys */

export const policyKeys = {
  all: (companyId: string | null) => ["policies", companyId] as const,
  list: (companyId: string | null, archived: boolean) => ["policies", companyId, "list", archived] as const,
  unsigned: (companyId: string | null) => ["policies", companyId, "unsigned"] as const,
  detail: (companyId: string | null, id: string) => ["policies", companyId, "detail", id] as const,
  signers: (companyId: string | null, versionId: string) => ["policies", companyId, "signers", versionId] as const,
  signature: (companyId: string | null, id: string) => ["policies", companyId, "signature", id] as const,
  letters: (companyId: string | null) => ["policies", companyId, "letters"] as const,
  letter: (companyId: string | null, id: string) => ["policies", companyId, "letters", id] as const,
  letterSettings: (companyId: string | null) => ["policies", companyId, "letter-settings"] as const,
  overdue: (companyId: string | null) => ["policies", companyId, "letters-overdue"] as const,
  employees: (companyId: string | null) => ["policies", companyId, "employees"] as const,
  replyBy: (companyId: string | null) => ["policies", companyId, "reply-by"] as const,
  portal: (employeeId: string | null) => ["policies", "portal", employeeId] as const,
};

/** Turn a PostgREST error into an Error with the server's message. */
function fail(error: { message?: string } | null): never {
  throw new Error(error?.message || "Something went wrong. Please try again.");
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

/* ============================================================ staff: policies */

export function usePoliciesList(archived = false) {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.list(companyId, archived),
    enabled: !!companyId && isHR,
    queryFn: () => rpc<PolicyListRow[]>("policies_list", { p_archived: archived }),
  });
}

/** Outstanding signatures across live policies (sidebar badge). */
export function usePoliciesUnsignedCount(): number | undefined {
  const { companyId, isHR } = useAuth();
  const { data } = useQuery({
    queryKey: policyKeys.unsigned(companyId),
    enabled: !!companyId && isHR,
    staleTime: 60_000,
    queryFn: () => rpc<number>("policies_unsigned_count"),
  });
  return data ?? undefined;
}

export interface PolicyDetail {
  policy: PolicyRow;
  versions: PolicyVersionRow[];
  current: PolicyVersionRow | null;
  draft: PolicyVersionRow | null;
}

export function usePolicy(id: string | undefined) {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.detail(companyId, id ?? ""),
    enabled: !!companyId && isHR && !!id,
    queryFn: async (): Promise<PolicyDetail | null> => {
      const [p, v] = await Promise.all([
        db.from("policies").select("id, company_id, title, summary, requires_signature, archived_at, created_at, updated_at").eq("id", id!).maybeSingle(),
        db
          .from("policy_versions")
          .select("id, policy_id, version, body, body_sha256, status, change_note, published_at, published_by_name, created_at, updated_at")
          .eq("policy_id", id!)
          .order("version", { ascending: false }),
      ]);
      if (p.error) fail(p.error);
      if (v.error) fail(v.error);
      if (!p.data) return null;
      const versions = (v.data ?? []) as PolicyVersionRow[];
      return {
        policy: p.data as PolicyRow,
        versions,
        current: versions.find((x) => x.status === "published") ?? null,
        draft: versions.find((x) => x.status === "draft") ?? null,
      };
    },
  });
}

export function usePolicySigners(versionId: string | null | undefined) {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.signers(companyId, versionId ?? ""),
    enabled: !!companyId && isHR && !!versionId,
    queryFn: () => rpc<SignerRow[]>("policy_signers", { p_version: versionId }),
  });
}

interface SignatureQueryRow {
  id: string;
  policy_id: string;
  version_id: string;
  signed_name: string;
  signature_png: string;
  body_sha256: string;
  ip: string | null;
  user_agent: string | null;
  signed_at: string;
  version: { version: number; body: string; body_sha256: string | null; published_at: string | null } | null;
  policy: { title: string } | null;
  employee: { name: string; employee_code: string | null; rank: string | null; cnic: string | null } | null;
}

export function useStaffSignature(id: string | null) {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.signature(companyId, id ?? ""),
    enabled: !!companyId && isHR && !!id,
    queryFn: async (): Promise<SignatureRecord | null> => {
      const { data, error } = await db
        .from("policy_signatures")
        .select(
          "id, policy_id, version_id, signed_name, signature_png, body_sha256, ip, user_agent, signed_at, version:policy_versions(version, body, body_sha256, published_at), policy:policies(title), employee:employees(name, employee_code, rank, cnic)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) fail(error);
      if (!data) return null;
      const r = data as unknown as SignatureQueryRow;
      return {
        id: r.id,
        policy_id: r.policy_id,
        version_id: r.version_id,
        title: r.policy?.title ?? "Policy",
        version: r.version?.version ?? 0,
        body: r.version?.body ?? "",
        version_sha256: r.version?.body_sha256 ?? null,
        published_at: r.version?.published_at ?? null,
        signed_name: r.signed_name,
        signature_png: r.signature_png,
        body_sha256: r.body_sha256,
        ip: r.ip,
        user_agent: r.user_agent,
        signed_at: r.signed_at,
        employee_name: r.employee?.name ?? null,
        employee_code: r.employee?.employee_code ?? null,
        rank: r.employee?.rank ?? null,
        cnic: r.employee?.cnic ?? null,
      };
    },
  });
}

function useInvalidatePolicies() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return () => qc.invalidateQueries({ queryKey: policyKeys.all(companyId) });
}

export function useCreatePolicy() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (input: { title: string; summary: string; requiresSignature: boolean; body: string }) =>
      rpc<string>("policy_create", {
        p_title: input.title,
        p_summary: input.summary,
        p_requires_signature: input.requiresSignature,
        p_body: input.body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePolicyInfo() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (input: { id: string; title: string; summary: string; requiresSignature: boolean }) =>
      rpc<void>("policy_update_info", {
        p_policy: input.id,
        p_title: input.title,
        p_summary: input.summary,
        p_requires_signature: input.requiresSignature,
      }),
    onSuccess: invalidate,
  });
}

export function useSaveDraft() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (input: { id: string; body: string; changeNote: string }) =>
      rpc<{ id: string; version: number; created: boolean }>("policy_save_draft", {
        p_policy: input.id,
        p_body: input.body,
        p_change_note: input.changeNote,
      }),
    onSuccess: invalidate,
  });
}

export function useDiscardDraft() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (id: string) => rpc<boolean>("policy_discard_draft", { p_policy: id }),
    onSuccess: invalidate,
  });
}

export function usePublishPolicy() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (id: string) => rpc<{ version_id: string; version: number; asked: number; sha256: string }>("policy_publish", { p_policy: id }),
    onSuccess: invalidate,
  });
}

export function useArchivePolicy() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (input: { id: string; archived: boolean }) => rpc<void>("policy_set_archived", { p_policy: input.id, p_archived: input.archived }),
    onSuccess: invalidate,
  });
}

export function useRemindUnsigned() {
  return useMutation({
    mutationFn: (versionId: string) => rpc<number>("policy_remind_unsigned", { p_version: versionId }),
  });
}

/* ============================================================= staff: letters */

const LETTER_COLUMNS =
  "id, company_id, employee_id, ref, kind, subject, body, facts, period, reply_by, signatory_name, signatory_title, issued_by_name, issued_at, acknowledged_at, reply, replied_at, withdrawn_at, withdrawn_by_name, withdraw_reason";
const LETTER_EMPLOYEE = "employee:employees(id, name, employee_code, rank, status, cnic, joining_date, separation_date, department:departments(name))";

export function useLetters() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.letters(companyId),
    enabled: !!companyId && isHR,
    queryFn: async () => {
      const { data, error } = await db
        .from("hr_letters")
        .select(`${LETTER_COLUMNS}, ${LETTER_EMPLOYEE}`)
        .eq("company_id", companyId!)
        .order("issued_at", { ascending: false })
        .limit(1000);
      if (error) fail(error);
      return (data ?? []) as unknown as LetterWithEmployee[];
    },
  });
}

export function useLetter(id: string | undefined) {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.letter(companyId, id ?? ""),
    enabled: !!companyId && isHR && !!id,
    queryFn: async () => {
      const { data, error } = await db.from("hr_letters").select(`${LETTER_COLUMNS}, ${LETTER_EMPLOYEE}`).eq("id", id!).maybeSingle();
      if (error) fail(error);
      return (data ?? null) as unknown as LetterWithEmployee | null;
    },
  });
}

/** Letters past their reply-by date with no reply (sidebar badge). */
export function useOverdueLettersCount(): number | undefined {
  const { companyId, company, isHR } = useAuth();
  const timeZone = company?.timezone ?? null;
  const { data } = useQuery({
    queryKey: policyKeys.overdue(companyId),
    enabled: !!companyId && isHR,
    staleTime: 60_000,
    queryFn: async () => {
      // Reply-by dates are days in the company's calendar, not the browser's.
      const iso = todayIn(timeZone);
      const { count, error } = await db
        .from("hr_letters")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .is("withdrawn_at", null)
        .is("replied_at", null)
        .lt("reply_by", iso);
      if (error) fail(error);
      return count ?? 0;
    },
  });
  return data ?? undefined;
}

export function useLetterSettings() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.letterSettings(companyId),
    enabled: !!companyId && isHR,
    queryFn: () => rpc<LetterSettings>("letter_settings_get"),
  });
}

export function useDefaultReplyBy() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.replyBy(companyId),
    enabled: !!companyId && isHR,
    staleTime: 10 * 60_000,
    queryFn: () => rpc<string>("letter_default_reply_by", { p_days: 3 }),
  });
}

/** Employees HR can write to (no pay columns are read). */
export function useLetterEmployees() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: policyKeys.employees(companyId),
    enabled: !!companyId && isHR,
    queryFn: async () => {
      const { data, error } = await db
        .from("employees")
        .select("id, name, employee_code, rank, status, cnic, joining_date, separation_date, department:departments(name)")
        .eq("company_id", companyId!)
        .order("name");
      if (error) fail(error);
      return (data ?? []) as unknown as LetterEmployee[];
    },
  });
}

export interface IssueLetterInput {
  employeeId: string;
  kind: LetterKind;
  subject: string;
  body: string;
  replyBy: string | null;
  signatoryName: string;
  signatoryTitle: string;
}

export function useIssueLetter() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (i: IssueLetterInput) =>
      rpc<{ id: string; ref: string }>("letter_issue", {
        p_employee: i.employeeId,
        p_kind: i.kind,
        p_subject: i.subject,
        p_body: i.body,
        p_reply_by: i.replyBy,
        p_signatory_name: i.signatoryName,
        p_signatory_title: i.signatoryTitle,
      }),
    onSuccess: invalidate,
  });
}

export function useWithdrawLetter() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (input: { id: string; reason: string }) => rpc<void>("letter_withdraw", { p_letter: input.id, p_reason: input.reason }),
    onSuccess: invalidate,
  });
}

export function useSaveLetterSettings() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (input: { prefix: string; name: string; title: string }) =>
      rpc<void>("letter_settings_save", { p_ref_prefix: input.prefix, p_signatory_name: input.name, p_signatory_title: input.title }),
    onSuccess: invalidate,
  });
}

/* ==================================================================== portal */

function usePortalKey() {
  const { employee } = useEmployeeAuth();
  return { employeeId: employee?.id ?? null, base: policyKeys.portal(employee?.id ?? null) };
}

export function usePortalPendingSignatures() {
  const { employeeId, base } = usePortalKey();
  return useQuery({
    queryKey: [...base, "pending"],
    enabled: !!employeeId,
    staleTime: 60_000,
    queryFn: () => portalRpc<PortalPendingSignature[]>("portal_pending_signatures"),
  });
}

/** Portal nav badge: policies still to sign. */
export function usePortalPendingCount(): number | undefined {
  return usePortalPendingSignatures().data?.length;
}

export function usePortalPolicies() {
  const { employeeId, base } = usePortalKey();
  return useQuery({
    queryKey: [...base, "list"],
    enabled: !!employeeId,
    queryFn: () => portalRpc<PortalPolicyRow[]>("portal_policies"),
  });
}

export function usePortalPolicyVersion(versionId: string | undefined) {
  const { employeeId, base } = usePortalKey();
  return useQuery({
    queryKey: [...base, "version", versionId],
    enabled: !!employeeId && !!versionId,
    queryFn: () => portalRpc<PortalPolicyVersion>("portal_policy_version", { p_version: versionId }),
  });
}

export function usePortalSignature(id: string | undefined) {
  const { employeeId, base } = usePortalKey();
  return useQuery({
    queryKey: [...base, "signature", id],
    enabled: !!employeeId && !!id,
    queryFn: () => portalRpc<SignatureRecord>("portal_policy_signature", { p_signature: id }),
  });
}

export function usePortalSignPolicy() {
  const qc = useQueryClient();
  const { base } = usePortalKey();
  return useMutation({
    mutationFn: (i: { versionId: string; typedName: string; agreed: boolean; signaturePng: string }) =>
      portalRpc<{ id: string; already: boolean; next_version_id?: string | null }>("portal_sign_policy", {
        p_version: i.versionId,
        p_typed_name: i.typedName,
        p_agreed: i.agreed,
        p_signature_png: i.signaturePng,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: base }),
  });
}

export function usePortalLetters() {
  const { employeeId, base } = usePortalKey();
  return useQuery({
    queryKey: [...base, "letters"],
    enabled: !!employeeId,
    staleTime: 60_000,
    queryFn: () => portalRpc<PortalLetterListRow[]>("portal_letters"),
  });
}

/** Portal nav badge: letters not yet acknowledged. */
export function usePortalUnacknowledgedCount(): number | undefined {
  const { data } = usePortalLetters();
  return data?.filter((l) => !l.acknowledged_at && !l.withdrawn_at).length;
}

export function usePortalLetter(id: string | undefined) {
  const { employeeId, base } = usePortalKey();
  return useQuery({
    queryKey: [...base, "letter", id],
    enabled: !!employeeId && !!id,
    queryFn: () => portalRpc<PortalLetter>("portal_letter", { p_letter: id }),
  });
}

export function usePortalAcknowledgeLetter() {
  const qc = useQueryClient();
  const { base } = usePortalKey();
  return useMutation({
    mutationFn: (id: string) => portalRpc<{ acknowledged_at: string; already: boolean }>("portal_acknowledge_letter", { p_letter: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: base }),
  });
}

export function usePortalReplyLetter() {
  const qc = useQueryClient();
  const { base } = usePortalKey();
  return useMutation({
    mutationFn: (i: { id: string; reply: string }) => portalRpc<{ replied_at: string }>("portal_reply_letter", { p_letter: i.id, p_reply: i.reply }),
    onSuccess: () => qc.invalidateQueries({ queryKey: base }),
  });
}
