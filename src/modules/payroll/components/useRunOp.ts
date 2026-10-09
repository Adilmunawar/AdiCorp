import { useCallback } from "react";
import { toast } from "sonner";
import { errorMessage, usePayslipAction, useSheetOp } from "../lib/api";
import type { SheetOp, SheetOpResult } from "../lib/types";
import { plural } from "./bits";

const DONE_WORDS: Record<SheetOp, [string, string]> = {
  prepare: ["draft payslip prepared", "draft payslips prepared"],
  refill: ["draft refilled", "drafts refilled"],
  refill_stale: ["draft refilled from the salaries and priced overtime on file", "drafts refilled from the salaries and priced overtime on file"],
  finalise: ["payslip finalised; the employee can see it", "payslips finalised; employees can see them"],
  reopen: ["payslip reopened as a draft", "payslips reopened as drafts"],
  paid: ["payslip marked as paid", "payslips marked as paid"],
  unpaid: ["payment mark undone", "payment marks undone"],
  delete: ["draft deleted", "drafts deleted"],
};

/** What happened, in words, the way the sheet reports it. */
export function describeResult(r: SheetOpResult): { text: string; ok: boolean } {
  const n = r.done.length;
  const [one, many] = DONE_WORDS[r.op] ?? ["done", "done"];
  let text = n ? `${n} ${n === 1 ? one : many}.` : "Nothing changed.";
  if (r.skipped) text += ` ${plural(r.skipped, "person was", "people were")} left as they were: the step does not apply to where their payslip is.`;
  if (r.negative) text += ` ${plural(r.negative, "draft")} would go below zero with the new figures; open ${r.negative === 1 ? "it" : "them"} to adjust by hand.`;
  if (r.message) text += ` ${r.message}`;
  return { text, ok: n > 0 };
}

function report(r: SheetOpResult) {
  const { text, ok } = describeResult(r);
  if (ok && !r.negative && !r.stale && !r.locked) toast.success(text);
  else if (ok) toast.warning(text);
  else toast.info(text);
}

/** Runs a sheet step and toasts the outcome. Re-throws so confirm dialogs stay open on failure. */
export function useRunSheetOp() {
  const m = useSheetOp();
  const run = useCallback(
    async (month: string, op: SheetOp, ids: string[] | null, paidOn?: string | null) => {
      try {
        const r = await m.mutateAsync({ month, op, ids, paidOn });
        report(r);
        return r;
      } catch (e) {
        toast.error(errorMessage(e));
        throw e;
      }
    },
    [m],
  );
  return { run, pending: m.isPending, variables: m.variables };
}

export function useRunPayslipOp() {
  const m = usePayslipAction();
  const run = useCallback(
    async (id: string, op: Exclude<SheetOp, "prepare" | "refill_stale">, paidOn?: string | null) => {
      try {
        const r = await m.mutateAsync({ id, op, paidOn });
        report(r);
        return r;
      } catch (e) {
        toast.error(errorMessage(e));
        throw e;
      }
    },
    [m],
  );
  return { run, pending: m.isPending };
}
