/**
 * Staff data access for Courses & expenses. Reads go straight to the tables (RLS
 * decides what each role sees: HR never gets payments, receipts or Finance's own
 * entries); every change goes through an expense_* SECURITY DEFINER RPC.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  EXPENSE_BUCKET,
  MAX_FILE_BYTES,
  RENEWAL_WINDOW_DAYS,
  confirmMessage,
  errorMessage,
  isoPlusDays,
  todayIso,
  type ExpenseFile,
  type ExpenseFileKind,
  type ExpensePayment,
  type ExpenseRow,
  type UploadedFile,
} from "./kinds";

const EXPENSE_SELECT =
  "*, employee:employees(id, name, employee_code, rank, user_id, avatar_url, department:departments(name))";

export const expenseKeys = {
  all: (companyId: string | null) => ["expenses", companyId] as const,
  list: (companyId: string | null) => ["expenses", companyId, "list"] as const,
  payments: (companyId: string | null) => ["expenses", companyId, "payments"] as const,
  detail: (companyId: string | null, id: string) => ["expenses", companyId, "detail", id] as const,
  detailPayments: (companyId: string | null, id: string) => ["expenses", companyId, "detail", id, "payments"] as const,
  detailFiles: (companyId: string | null, id: string) => ["expenses", companyId, "detail", id, "files"] as const,
  badge: (companyId: string | null, which: "hr" | "finance") => ["expenses", companyId, "badge", which] as const,
  employees: (companyId: string | null) => ["expenses", companyId, "employee-options"] as const,
};

function normalise(row: Record<string, unknown>): ExpenseRow {
  const r = row as unknown as ExpenseRow;
  return { ...r, amount: Number(r.amount), payments_count: Number(r.payments_count ?? 0) };
}

/** Today (yyyy-MM-dd) on the company's calendar, not the browser's. */
export function useCompanyToday(): string {
  const { company } = useAuth();
  return todayIso(company?.timezone);
}

/* ------------------------------------------------------------------ reads */

/** PostgREST returns at most max-rows (1000 on Supabase) per request: lists are read a page at a time. */
const PAGE = 1000;
const MAX_ROWS = 50_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every item the signed-in staff member may see, newest first. */
export function useExpenseList() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: expenseKeys.list(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const rows: ExpenseRow[] = [];
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
        const { data, error } = await db
          .from("expenses")
          .select(EXPENSE_SELECT)
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          // A unique tie-breaker, so rows added in the same instant never shift between pages.
          .order("id", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []).map(normalise));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
  });
}

interface PaymentSlim {
  expense_id: string;
  amount: number;
  paid_on: string;
  created_at: string;
}

/** Finance only: every payment (slim) so lists can show what was paid, oldest paid first. */
export function useAllExpensePayments(enabled: boolean) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: expenseKeys.payments(companyId),
    enabled: !!companyId && enabled,
    queryFn: async () => {
      const rows: PaymentSlim[] = [];
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
        const { data, error } = await db
          .from("expense_payments")
          .select("expense_id, amount, paid_on, created_at")
          .eq("company_id", companyId!)
          .order("paid_on", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as PaymentSlim[]).map((p) => ({ ...p, amount: Number(p.amount) })));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
  });
}

/** Rows with paid_total / last_payment filled in when the viewer may see money. */
export function useExpenseRows(withMoney: boolean) {
  const list = useExpenseList();
  const payments = useAllExpensePayments(withMoney);
  const rows = useMemo(() => {
    const base = list.data ?? [];
    if (!withMoney) return base;
    const totals = new Map<string, { total: number; last: number }>();
    for (const p of payments.data ?? []) {
      const t = totals.get(p.expense_id) ?? { total: 0, last: 0 };
      t.total += p.amount;
      t.last = p.amount; // ordered by paid day, oldest first, so the latest paid one wins (as on the detail page)
      totals.set(p.expense_id, t);
    }
    return base.map((x) => {
      const t = totals.get(x.id);
      return { ...x, paid_total: t?.total ?? 0, last_payment: t ? t.last : null };
    });
  }, [list.data, payments.data, withMoney]);
  return {
    rows,
    payments: payments.data ?? [],
    isLoading: list.isLoading || (withMoney && payments.isLoading),
    error: list.error ?? payments.error,
    refetch: () => {
      void list.refetch();
      if (withMoney) void payments.refetch();
    },
  };
}

export function useExpense(id: string | undefined) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: expenseKeys.detail(companyId, id ?? ""),
    enabled: !!companyId && !!id,
    queryFn: async () => {
      // A mistyped link is "not found", not a database error.
      if (!UUID.test(id!)) return null;
      const { data, error } = await db.from("expenses").select(EXPENSE_SELECT).eq("company_id", companyId!).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? normalise(data as Record<string, unknown>) : null;
    },
  });
}

export function useExpensePayments(id: string | undefined, enabled: boolean) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: expenseKeys.detailPayments(companyId, id ?? ""),
    enabled: !!companyId && !!id && UUID.test(id) && enabled,
    queryFn: async () => {
      const { data, error } = await db
        .from("expense_payments")
        .select("id, expense_id, amount, quoted_amount, quoted_currency, paid_on, method, reference, note, created_by_name, created_at")
        .eq("expense_id", id!)
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as ExpensePayment[]).map((p) => ({ ...p, amount: Number(p.amount), quoted_amount: p.quoted_amount == null ? null : Number(p.quoted_amount) }));
    },
  });
}

export function useExpenseFiles(id: string | undefined) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: expenseKeys.detailFiles(companyId, id ?? ""),
    enabled: !!companyId && !!id && UUID.test(id),
    queryFn: async () => {
      const { data, error } = await db
        .from("expense_files")
        .select("id, expense_id, payment_id, kind, storage_path, file_name, mime_type, file_size, created_at")
        .eq("expense_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExpenseFile[];
    },
  });
}

export interface EmployeeOption {
  id: string;
  name: string;
  rank: string | null;
  employee_code: string | null;
}

export function useEmployeeOptions() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: expenseKeys.employees(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("employees")
        .select("id, name, rank, employee_code")
        .eq("company_id", companyId!)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as EmployeeOption[];
    },
  });
}

/* ----------------------------------------------------------------- badges */

/** HR: requests waiting for a decision. */
export function useHrPendingBadge(): number | undefined {
  const { companyId, isHR } = useAuth();
  const q = useQuery({
    queryKey: expenseKeys.badge(companyId, "hr"),
    enabled: !!companyId && isHR,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("source", "request")
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
  return q.data || undefined;
}

/**
 * Finance: approved items to pay plus renewals overdue or due in the next 7 days, the
 * same count as the "To pay" tab (see renewalSoon).
 */
export function useFinanceTodoBadge(): number | undefined {
  const { companyId, isFinance } = useAuth();
  const today = useCompanyToday();
  const q = useQuery({
    queryKey: [...expenseKeys.badge(companyId, "finance"), today],
    enabled: !!companyId && isFinance,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .or(`status.eq.approved,and(status.eq.active,renews_on.lte.${isoPlusDays(today, RENEWAL_WINDOW_DAYS)})`);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return q.data || undefined;
}

/* ------------------------------------------------------------------ files */

const EXT_OK = /\.(pdf|jpe?g|png|webp|docx?)$/i;

/** The bucket only takes these types; a browser that reports no type (common for Word files) would send text/plain. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Checks a chosen file before upload; returns a problem or null. */
export function checkFile(file: File | null | undefined): string | null {
  if (!file) return null;
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return "Files can be 8 MB at most.";
  if (!EXT_OK.test(file.name)) return "Use a PDF, an image (JPG, PNG, WebP) or a Word file.";
  return null;
}

/** Staff upload into expense-files: <company>/<kind>/<employee id | company>/<file>. */
export async function uploadExpenseFile(companyId: string, kind: ExpenseFileKind, owner: string, file: File): Promise<UploadedFile> {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${companyId}/${kind}/${owner}/${Date.now()}-${rand}.${ext}`;
  const contentType = file.type || MIME_BY_EXT[ext] || "application/octet-stream";
  const { error } = await db.storage.from(EXPENSE_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw new Error(error.message || "Upload failed. Please try again.");
  return { path, file_name: file.name.slice(0, 200), mime_type: contentType, file_size: file.size };
}

/** Best effort: storage objects left behind by a failed save or an undo/delete. */
export async function removeExpenseObjects(paths: (string | null | undefined)[]) {
  const clean = paths.filter((p): p is string => !!p);
  if (!clean.length) return;
  await db.storage.from(EXPENSE_BUCKET).remove(clean);
}

/** Opens a private file in a new tab through a 5-minute signed link. */
export async function openExpenseFile(path: string) {
  const win = window.open("about:blank", "_blank");
  try {
    const { data, error } = await db.storage.from(EXPENSE_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) throw error ?? new Error("File not found");
    if (win) {
      win.opener = null;
      win.location.href = data.signedUrl;
    } else {
      window.location.assign(data.signedUrl);
    }
  } catch (e) {
    win?.close();
    toast.error(errorMessage(e, "That file could not be opened."));
  }
}

/* -------------------------------------------------------------- mutations */

function invalidateAll(qc: QueryClient, companyId: string | null) {
  return qc.invalidateQueries({ queryKey: expenseKeys.all(companyId) });
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/** One RPC-backed action with toasts and cache refresh. */
function useExpenseMutation<V, R = unknown>(run: (v: V, companyId: string) => Promise<R>, success: string | ((v: V, r: R) => string)) {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: (v: V) => {
      if (!companyId) throw new Error("Your company could not be loaded.");
      return run(v, companyId);
    },
    onSuccess: (r, v) => {
      toast.success(typeof success === "function" ? success(v, r) : success);
    },
    onError: (e) => {
      // A "record it anyway?" answer from the server is shown as a confirm by the caller, not as an error.
      if (!confirmMessage(e)) toast.error(errorMessage(e));
    },
    onSettled: () => invalidateAll(qc, companyId),
  });
}

export function useHrDecide() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject"; note: string }) =>
      rpc<void>("expense_hr_decide", { p_id: v.id, p_decision: v.decision, p_note: v.note }),
    // Quick approve from the list feels instant; the server still has the last word.
    onMutate: async (v) => {
      const key = expenseKeys.list(companyId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ExpenseRow[]>(key);
      if (previous) {
        qc.setQueryData<ExpenseRow[]>(
          key,
          previous.map((x) => (x.id === v.id ? { ...x, status: v.decision === "approve" ? "approved" : "rejected", hr_note: v.note } : x)),
        );
      }
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(expenseKeys.list(companyId), ctx.previous);
      toast.error(errorMessage(e));
    },
    onSuccess: (_r, v) =>
      toast.success(v.decision === "approve" ? "Approved. Finance has been told, and so has the employee." : "Not approved. The employee has been told why."),
    onSettled: () => invalidateAll(qc, companyId),
  });
}

export function useHrUndo() {
  return useExpenseMutation((id: string) => rpc<void>("expense_hr_undo", { p_id: id }), "Approval taken back; it is waiting for a decision again.");
}

export interface FinanceAddVars {
  employeeId: string | null;
  input: Record<string, unknown>;
  tell: boolean;
  payment: Record<string, unknown> | null;
  quote: File | null;
  receipt: File | null;
  /** Go ahead after the server asked (the person has left). */
  force?: boolean;
}

export function useFinanceAdd() {
  return useExpenseMutation(async (v: FinanceAddVars, companyId) => {
    const owner = v.employeeId ?? "company";
    const uploaded: UploadedFile[] = [];
    try {
      const quote = v.quote ? await uploadExpenseFile(companyId, "quote", owner, v.quote) : null;
      if (quote) uploaded.push(quote);
      const receipt = v.payment && v.receipt ? await uploadExpenseFile(companyId, "receipt", owner, v.receipt) : null;
      if (receipt) uploaded.push(receipt);
      return await rpc<string>("expense_finance_add", {
        p_employee: v.employeeId,
        p_input: v.input,
        p_tell: v.tell,
        p_payment: v.payment,
        p_quote: quote,
        p_receipt: receipt,
        p_force: !!v.force,
      });
    } catch (e) {
      await removeExpenseObjects(uploaded.map((u) => u.path)).catch(() => undefined);
      throw e;
    }
  }, "Saved.");
}

export interface PaymentVars {
  id: string;
  owner: string;
  payment: Record<string, unknown>;
  receipt: File | null;
  renewal: boolean;
  /** Go ahead after the server asked (already paid, more than quoted, or the person has left). */
  force?: boolean;
}

export function useRecordPayment() {
  return useExpenseMutation(
    async (v: PaymentVars, companyId) => {
      const receipt = v.receipt ? await uploadExpenseFile(companyId, "receipt", v.owner, v.receipt) : null;
      try {
        return await rpc<string>("expense_record_payment", { p_id: v.id, p_payment: v.payment, p_receipt: receipt, p_force: !!v.force });
      } catch (e) {
        if (receipt) await removeExpenseObjects([receipt.path]).catch(() => undefined);
        throw e;
      }
    },
    (v) => (v.renewal ? "Renewal recorded." : "Payment recorded."),
  );
}

export function useUndoPayment() {
  return useExpenseMutation(async (id: string) => {
    const paths = await rpc<string[] | null>("expense_undo_payment", { p_id: id });
    await removeExpenseObjects(paths ?? []).catch(() => undefined);
  }, "The latest payment was undone.");
}

export function useFinanceDecline() {
  return useExpenseMutation(
    (v: { id: string; note: string }) => rpc<void>("expense_finance_decline", { p_id: v.id, p_note: v.note }),
    "Declined. The employee (and HR, for a request) has been told why.",
  );
}

export function useFinanceReconsider() {
  return useExpenseMutation((id: string) => rpc<void>("expense_finance_reconsider", { p_id: id }), "Back on the list to pay.");
}

export function useEndSubscription() {
  return useExpenseMutation(
    (v: { id: string; on: string }) => rpc<void>("expense_end_subscription", { p_id: v.id, p_on: v.on }),
    "Subscription ended. No more renewals are expected.",
  );
}

export function useCompleteCourse() {
  return useExpenseMutation(async (v: { id: string; owner: string; outcome: string; certificate: File | null }, companyId) => {
    const cert = v.certificate ? await uploadExpenseFile(companyId, "certificate", v.owner, v.certificate) : null;
    try {
      await rpc<void>("expense_complete_course", { p_id: v.id, p_outcome: v.outcome, p_certificate: cert });
    } catch (e) {
      if (cert) await removeExpenseObjects([cert.path]).catch(() => undefined);
      throw e;
    }
  }, "Course marked as completed.");
}

export function useDeleteExpense() {
  return useExpenseMutation(async (id: string) => {
    const paths = await rpc<string[] | null>("expense_delete", { p_id: id });
    await removeExpenseObjects(paths ?? []).catch(() => undefined);
  }, "Deleted.");
}
