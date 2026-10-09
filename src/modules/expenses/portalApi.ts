/**
 * Employee portal data access for Courses & expenses: portal_expense* RPCs with
 * the session token, uploads through the portal-files Edge Function.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { portalRpc, portalSignedUrl, portalUpload } from "@/lib/portal";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { checkFile } from "./api";
import { EXPENSE_BUCKET, errorMessage, type ExpenseFile, type ExpenseFileKind, type ExpensePayment, type ExpenseRow, type UploadedFile } from "./kinds";

export interface PortalExpenseDetail {
  expense: ExpenseRow;
  payments: ExpensePayment[];
  files: ExpenseFile[];
}

function usePortalIds() {
  const { employee } = useEmployeeAuth();
  return { companyId: employee?.company_id ?? null, employeeId: employee?.id ?? null };
}

export const portalExpenseKeys = {
  all: (companyId: string | null, employeeId: string | null) => ["expenses", companyId, "portal", employeeId] as const,
  list: (companyId: string | null, employeeId: string | null) => ["expenses", companyId, "portal", employeeId, "list"] as const,
  detail: (companyId: string | null, employeeId: string | null, id: string) => ["expenses", companyId, "portal", employeeId, "detail", id] as const,
};

const num = (x: ExpenseRow): ExpenseRow => ({
  ...x,
  amount: Number(x.amount),
  paid_total: Number(x.paid_total ?? 0),
  paid_quoted_total: x.paid_quoted_total == null ? null : Number(x.paid_quoted_total),
  payments_count: Number(x.payments_count ?? 0),
});

export function usePortalExpenses() {
  const { companyId, employeeId } = usePortalIds();
  return useQuery({
    queryKey: portalExpenseKeys.list(companyId, employeeId),
    enabled: !!employeeId,
    queryFn: async () => ((await portalRpc<ExpenseRow[] | null>("portal_expenses")) ?? []).map(num),
  });
}

export function usePortalExpense(id: string | undefined) {
  const { companyId, employeeId } = usePortalIds();
  return useQuery({
    queryKey: portalExpenseKeys.detail(companyId, employeeId, id ?? ""),
    enabled: !!employeeId && !!id,
    retry: false,
    queryFn: async () => {
      // A mistyped link: the same answer as the server's, not "invalid input syntax for type uuid".
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id!)) throw new Error("That item is not yours or no longer exists.");
      const d = await portalRpc<PortalExpenseDetail>("portal_expense", { p_id: id });
      return {
        expense: num(d.expense),
        payments: (d.payments ?? []).map((p) => ({ ...p, amount: Number(p.amount), quoted_amount: p.quoted_amount == null ? null : Number(p.quoted_amount) })),
        files: d.files ?? [],
      } satisfies PortalExpenseDetail;
    },
  });
}

async function upload(file: File | null, kind: ExpenseFileKind): Promise<UploadedFile | null> {
  if (!file) return null;
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  const { path } = await portalUpload(file, EXPENSE_BUCKET, kind);
  return { path, file_name: file.name.slice(0, 200), mime_type: file.type, file_size: file.size };
}

function usePortalMutation<V, R>(run: (v: V) => Promise<R>, success: string) {
  const qc = useQueryClient();
  const { companyId, employeeId } = usePortalIds();
  return useMutation({
    mutationFn: run,
    onSuccess: () => toast.success(success),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: portalExpenseKeys.all(companyId, employeeId) }),
  });
}

export function usePortalRequestExpense() {
  return usePortalMutation(async (v: { input: Record<string, unknown>; quote: File | null }) => {
    const quote = await upload(v.quote, "quote");
    return portalRpc<string>("portal_expense_request", { p_input: v.input, p_quote: quote });
  }, "Sent to HR. You will be told when they decide.");
}

export function usePortalWithdrawExpense() {
  return usePortalMutation((id: string) => portalRpc<void>("portal_expense_withdraw", { p_id: id }), "Request withdrawn.");
}

export function usePortalCompleteCourse() {
  return usePortalMutation(async (v: { id: string; outcome: string; certificate: File | null }) => {
    const cert = await upload(v.certificate, "certificate");
    return portalRpc<void>("portal_expense_complete", { p_id: v.id, p_outcome: v.outcome, p_certificate: cert });
  }, "Course marked as completed.");
}

export async function openPortalExpenseFile(path: string) {
  const win = window.open("about:blank", "_blank");
  try {
    const url = await portalSignedUrl(EXPENSE_BUCKET, path);
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (e) {
    win?.close();
    toast.error(errorMessage(e, "That file could not be opened."));
  }
}
