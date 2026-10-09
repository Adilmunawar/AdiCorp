import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { CardSkeleton, ConfirmDialog, EmptyState, PageHeader, SectionCard, useMoney } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useCompanyToday, useEmployeeOptions, useFinanceAdd, type FinanceAddVars } from "../api";
import { confirmMessage } from "../kinds";
import { ExpenseForm } from "../components/ExpenseForm";

/** Finance records spending itself: for one employee or for the whole company. */
export default function NewExpensePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currency } = useMoney();
  const employees = useEmployeeOptions();
  const add = useFinanceAdd();
  const today = useCompanyToday();
  const preselect = params.get("employee") ?? undefined;
  // The server asked "add it anyway?" (the person has left): keep what was sent and resend with force.
  const [confirm, setConfirm] = useState<{ message: string; vars: FinanceAddVars } | null>(null);
  const save = (vars: FinanceAddVars) => add.mutateAsync(vars).then((id) => navigate(`/expenses/${id}`, { replace: true }));

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <PageHeader
        icon={Plus}
        eyebrow="Finance"
        title="Add an expense"
        description="Record spending for an employee or the whole company."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/expenses">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Link>
          </Button>
        }
      />
      {employees.isLoading ? (
        <CardSkeleton lines={8} />
      ) : employees.error ? (
        <SectionCard>
          <EmptyState
            icon={Users}
            title="The employee list could not be loaded"
            description="It is needed to choose who the expense is for. Check your connection and try again."
            action={
              <Button variant="outline" onClick={() => void employees.refetch()}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <ExpenseForm
          mode="finance"
          currency={currency}
          today={today}
          employees={employees.data ?? []}
          preselect={preselect && employees.data?.some((e) => e.id === preselect) ? preselect : undefined}
          submitting={add.isPending}
          onCancel={() => navigate("/expenses")}
          onSubmit={(r) => {
            const vars: FinanceAddVars = { employeeId: r.employeeId, input: r.input, tell: r.tell, payment: r.payment, quote: r.quote, receipt: r.receipt };
            save(vars).catch((e: unknown) => {
              const ask = confirmMessage(e);
              if (ask) setConfirm({ message: ask, vars });
            });
          }}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Add it anyway?"
        description={confirm?.message}
        confirmLabel="Add anyway"
        destructive={false}
        onConfirm={() => (confirm ? save({ ...confirm.vars, force: true }) : undefined)}
      />
    </div>
  );
}
