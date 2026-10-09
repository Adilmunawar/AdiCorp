import { Link, useParams } from "react-router-dom";
import { ArrowLeft, SearchX, Undo2 } from "lucide-react";
import { CardSkeleton, ConfirmButton, EmptyState, PageHeader, SectionCard, Skeleton, formatDate, useMoney } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { openExpenseFile, useCompanyToday, useExpense, useExpenseFiles, useExpensePayments, useUndoPayment } from "../api";
import { CATEGORY_LABELS, paidTotalLabel, quotedTotal, type ExpensePayment } from "../kinds";
import { CATEGORY_ICONS, ExpenseStatusBadge, Stage } from "../components/bits";
import { DetailsCard, FilesCard, PaymentsCard, ProgressCard } from "../components/ExpenseDetails";
import { StaffActions } from "../components/StaffActions";

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isFinance, isHR } = useAuth();
  const { currency, format } = useMoney();
  const expense = useExpense(id);
  const payments = useExpensePayments(id, isFinance);
  const files = useExpenseFiles(id);
  const undo = useUndoPayment();
  const today = useCompanyToday();
  const back = isFinance ? "/expenses" : "/expenses/requests";

  if (expense.isLoading) {
    return (
      <div className="min-w-0" aria-busy="true" aria-label="Loading">
        <div className="mb-5 space-y-2 sm:mb-6">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    );
  }
  const x = expense.data;
  if (!x) {
    return (
      <SectionCard>
        <EmptyState
          icon={SearchX}
          title="Expense not found"
          description={expense.error ? "It could not be loaded. Try again." : "It may have been deleted, or you do not have access to it."}
          action={
            <Button asChild variant="outline">
              <Link to={back}>Back to the list</Link>
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const paid = payments.data ?? [];
  const paidTotal = paid.reduce((s, p) => s + p.amount, 0);
  // Listed by paid day, newest first: the first one is the latest payment.
  const lastPayment = paid[0]?.amount ?? null;
  // Until the payments are in (or if they fail), show no total rather than "0 in all".
  // In the item's currency too, when every payment says what it equals there.
  const paidQuoted = quotedTotal(paid, x.currency, currency);
  const row = isFinance && payments.data ? { ...x, paid_total: paidTotal, paid_quoted_total: paidQuoted, last_payment: lastPayment } : x;
  const money = isFinance ? (n: number) => format(n) : undefined;
  // Undo removes the payment recorded last (expense_undo_payment orders by created_at, id),
  // which differs from the latest paid day when an older payment was added afterwards.
  const newest = paid.reduce<ExpensePayment | undefined>((a, p) => {
    if (!a) return p;
    const diff = Date.parse(p.created_at) - Date.parse(a.created_at);
    return diff > 0 || (diff === 0 && p.id > a.id) ? p : a;
  }, undefined);

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={CATEGORY_LABELS[x.category]}
        icon={CATEGORY_ICONS[x.category]}
        title={<span title={x.title} className="line-clamp-2 whitespace-normal [overflow-wrap:anywhere]">{x.title}</span>}
        description={
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ExpenseStatusBadge status={x.status} />
            <Stage x={row} today={today} className="text-xs" />
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={back}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <DetailsCard x={row} money={money} currency={currency} />
          <ProgressCard x={row} money={money} currency={currency} />
          {isFinance && payments.error && (
            <SectionCard title="Payments">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">The payments could not be loaded.</p>
                <Button variant="outline" size="sm" onClick={() => void payments.refetch()}>
                  Try again
                </Button>
              </div>
            </SectionCard>
          )}
          {isFinance && (
            <PaymentsCard
              payments={payments.data ?? []}
              files={files.data ?? []}
              money={format}
              total={paidTotalLabel(paidTotal, paidQuoted, x.currency, currency, format)}
              onOpen={openExpenseFile}
              undoId={newest?.id}
              undo={
                newest && (
                  <ConfirmButton
                    size="sm"
                    title={`Undo the payment of ${format(newest.amount)} on ${formatDate(newest.paid_on)}?`}
                    description="Its receipt is removed too, and the status and renewal date step back."
                    confirmLabel="Undo payment"
                    disabled={undo.isPending}
                    onConfirm={() => undo.mutateAsync(x.id)}
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    Undo
                  </ConfirmButton>
                )
              }
            />
          )}
          <FilesCard files={files.data ?? []} onOpen={openExpenseFile} />
        </div>
        <div className="grid min-w-0 gap-4">
          {(isFinance || isHR) && <StaffActions x={row} currency={currency} />}
        </div>
      </div>
    </div>
  );
}
