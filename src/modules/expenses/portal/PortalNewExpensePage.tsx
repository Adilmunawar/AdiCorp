import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { usePortalRequestExpense } from "../portalApi";
import { ExpenseForm } from "../components/ExpenseForm";

/** The employee asks the company to pay for something. */
export default function PortalNewExpensePage() {
  const navigate = useNavigate();
  const { company } = useEmployeeAuth();
  const currency = (company?.currency || "USD").toUpperCase();
  const request = usePortalRequestExpense();

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <PageHeader
        icon={Send}
        eyebrow="My requests"
        title="New request"
        description="Say what it is, what it costs and how it helps the company."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/portal/expenses">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Link>
          </Button>
        }
      />
      <ExpenseForm
        mode="request"
        currency={currency}
        submitting={request.isPending}
        onCancel={() => navigate("/portal/expenses")}
        onSubmit={(r) => request.mutate({ input: r.input, quote: r.quote }, { onSuccess: (id) => navigate(`/portal/expenses/${id}`, { replace: true }) })}
      />
    </div>
  );
}
