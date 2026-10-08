import { Link } from "react-router-dom";
import { ChevronRight, FileText } from "lucide-react";
import { EmptyState, ListSkeleton, PageHeader, SectionCard, formatDate, formatMoney, formatMonth } from "@/components/kit";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { cn } from "@/lib/utils";
import { errorMessage, usePortalPayslips } from "../lib/api";
import { Notice, PayslipStatusBadge } from "../components/bits";

export default function MyPayslipsPage() {
  const q = usePortalPayslips();
  const { company } = useEmployeeAuth();
  const cur = (company?.currency || "PKR").toUpperCase();
  const rows = q.data ?? [];
  const fresh = rows.filter((r) => r.is_new).length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader eyebrow="Self service" title="My payslips" icon={FileText} description="Every finalised payslip, newest first." />
      {q.isError && (
        <Notice tone="danger" className="mb-4">
          {errorMessage(q.error)}{" "}
          <button type="button" className="font-semibold text-primary underline" onClick={() => q.refetch()}>
            Try again
          </button>
        </Notice>
      )}
      {fresh > 0 && (
        <Notice tone="info" className="mb-3">
          {fresh === 1 ? "One payslip is new or changed since you last opened it." : `${fresh} payslips are new or changed since you last opened them.`}
        </Notice>
      )}
      <SectionCard flush>
        {q.isLoading ? (
          <ListSkeleton rows={4} className="p-4" />
        ) : rows.length === 0 ? (
          q.isError ? (
            <EmptyState icon={FileText} title="Your payslips could not be loaded" description="Check your connection and try again." />
          ) : (
            <EmptyState icon={FileText} title="No payslips yet" description="Your payslips appear here once Finance finalises them. You are told in the bell when one is ready." />
          )
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/portal/payslips/${r.id}`} className={cn("flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5", r.is_new && "bg-primary/[0.03]")}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[14px] font-semibold text-foreground">
                      {formatMonth(r.month)}
                      {r.is_new && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">New</span>}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {r.status === "paid"
                        ? `Paid${r.paid_on ? ` ${formatDate(r.paid_on)}` : ""}${r.pay_method === "cash" ? " in cash" : ""}`
                        : "Final, payment follows"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[14px] font-bold text-foreground">{formatMoney(r.net_salary, cur)}</p>
                    <PayslipStatusBadge status={r.status} />
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
