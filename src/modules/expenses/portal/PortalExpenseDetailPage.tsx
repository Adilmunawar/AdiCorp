import { useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, SearchX, Undo2 } from "lucide-react";
import { CardSkeleton, ConfirmButton, EmptyState, PageHeader, SectionCard, Skeleton, formatDate, formatMoney } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { checkFile } from "../api";
import { openPortalExpenseFile, usePortalCompleteCourse, usePortalExpense, usePortalWithdrawExpense } from "../portalApi";
import { BILLING_LABELS, CATEGORY_LABELS, EXPENSE_LIMITS as L, errorMessage, type ExpenseRow } from "../kinds";
import { CATEGORY_ICONS, ExpenseStatusBadge, FieldLabel, FilePicker, FormError, Stage } from "../components/bits";
import { DetailsCard, FilesCard, PaymentsCard, ProgressCard } from "../components/ExpenseDetails";

export default function PortalExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { company } = useEmployeeAuth();
  const currency = (company?.currency || "USD").toUpperCase();
  const q = usePortalExpense(id);
  const money = (n: number) => formatMoney(n, currency);

  if (q.isLoading) {
    return (
      <div className="min-w-0" aria-busy="true" aria-label="Loading">
        <div className="mb-5 space-y-2 sm:mb-6">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    );
  }
  if (!q.data) {
    return (
      <SectionCard>
        <EmptyState
          icon={SearchX}
          title="Request not found"
          description={q.error ? errorMessage(q.error, "It could not be loaded. Try again.") : "It may have been removed, or it is not yours."}
          action={
            <Button asChild variant="outline">
              <Link to="/portal/expenses">Back to the list</Link>
            </Button>
          }
        />
      </SectionCard>
    );
  }
  const { expense: x, payments, files } = q.data;
  const row: ExpenseRow = { ...x, last_payment: payments[0]?.amount ?? null };

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={CATEGORY_LABELS[x.category]}
        icon={CATEGORY_ICONS[x.category]}
        title={<span title={x.title} className="line-clamp-2 whitespace-normal [overflow-wrap:anywhere]">{x.title}</span>}
        description={
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ExpenseStatusBadge status={x.status} />
            <Stage x={row} className="text-xs" />
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/portal/expenses">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <DetailsCard x={row} money={money} currency={currency} showWho={false} />
          <ProgressCard x={row} money={money} />
          <PaymentsCard payments={payments} files={files} money={money} total={x.paid_total ?? 0} onOpen={openPortalExpenseFile} />
          <FilesCard files={files} onOpen={openPortalExpenseFile} />
        </div>
        <div className="grid min-w-0 gap-4">
          <PortalActions x={row} />
        </div>
      </div>
    </div>
  );
}

function PortalActions({ x }: { x: ExpenseRow }) {
  const withdraw = usePortalWithdrawExpense();
  const courseDone = x.category === "course" && ["paid", "active", "ended"].includes(x.status);
  if (x.source === "request" && x.status === "pending") {
    return (
      <SectionCard title="Changed your mind?">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">You can take the request back until HR decides.</p>
        <ConfirmButton title="Withdraw this request?" description="HR will no longer see it as waiting." confirmLabel="Withdraw request" disabled={withdraw.isPending} onConfirm={() => withdraw.mutateAsync(x.id)}>
          <Undo2 className="h-4 w-4" aria-hidden />
          Withdraw request
        </ConfirmButton>
      </SectionCard>
    );
  }
  if (courseDone) {
    return (
      <SectionCard title={x.completed_at ? "Course completed" : "Finished the course?"} description={x.completed_at ? `Completed ${formatDate(x.completed_at)}` : "HR is notified"}>
        <CompleteCourse x={x} />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="No action needed">
      <p className="text-xs leading-5 text-muted-foreground">
        {x.status === "approved"
          ? "It is with Finance for payment. You are told when it is paid."
          : x.status === "active"
            ? `${BILLING_LABELS[x.billing]}; Finance records each renewal.`
            : "This one is settled."}
      </p>
    </SectionCard>
  );
}

function CompleteCourse({ x }: { x: ExpenseRow }) {
  const id = useId();
  const complete = usePortalCompleteCourse();
  const [outcome, setOutcome] = useState(x.outcome ?? "");
  const [cert, setCert] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (outcome.trim().length < L.minWhy) return setError("Say what you learned and how you will use it at work, in a sentence or two.");
    const problem = checkFile(cert);
    if (problem) return setError(problem);
    setError(null);
    complete.mutate({ id: x.id, outcome: outcome.trim(), certificate: cert }, { onSuccess: () => setCert(null) });
  };
  return (
    <div className="grid gap-3">
      <div>
        <FieldLabel htmlFor={`${id}-outcome`} hint="HR sees it">
          What did you learn, and how will you use it?
        </FieldLabel>
        <Textarea id={`${id}-outcome`} rows={4} maxLength={L.text} value={outcome} onChange={(e) => setOutcome(e.target.value)} className="min-h-[96px]" />
      </div>
      <FilePicker label="Certificate" hint="optional · PDF or image" file={cert} onChange={setCert} accept=".pdf,.jpg,.jpeg,.png,.webp" />
      <FormError>{error}</FormError>
      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={complete.isPending} className="w-full sm:w-auto">
          {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {x.completed_at ? "Update" : "Mark as completed"}
        </Button>
      </div>
    </div>
  );
}
