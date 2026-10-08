import { useMemo } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Hourglass, ListChecks, Plus, Receipt, Repeat, Wallet, XCircle } from "lucide-react";
import { EmptyState, PageHeader, SectionCard, StatGrid, StatTile, TabsNav, formatMoney, useTabParam, type TabItem } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { usePortalExpenses } from "../portalApi";
import { CLOSED_STATUSES, DONE_STATUSES, OPEN_STATUSES, type ExpenseRow } from "../kinds";
import { ExpenseTable } from "../components/ExpenseTable";

type Tab = "all" | "open" | "courses" | "subscriptions" | "closed";

const PICK: Record<Tab, (x: ExpenseRow) => boolean> = {
  all: () => true,
  open: (x) => OPEN_STATUSES.includes(x.status),
  courses: (x) => x.category === "course" && !CLOSED_STATUSES.includes(x.status),
  subscriptions: (x) => x.category === "subscription" && !CLOSED_STATUSES.includes(x.status),
  closed: (x) => CLOSED_STATUSES.includes(x.status),
};

/** The employee's own courses, subscriptions and expenses. */
export default function PortalExpensesPage() {
  const { company } = useEmployeeAuth();
  const currency = (company?.currency || "USD").toUpperCase();
  const q = usePortalExpenses();
  const all = useMemo(() => q.data ?? [], [q.data]);

  const stats = useMemo(() => {
    const open = all.filter(PICK.open);
    const courses = all.filter((x) => x.category === "course" && DONE_STATUSES.includes(x.status));
    return {
      open: open.length,
      withHr: open.filter((x) => x.status === "pending").length,
      withFinance: open.filter((x) => x.status === "approved").length,
      courses: courses.length,
      completed: courses.filter((x) => x.completed_at).length,
      paid: all.reduce((s, x) => s + (x.paid_total ?? 0), 0),
    };
  }, [all]);

  const tabs: TabItem[] = [
    { value: "all", label: "All", icon: ListChecks },
    { value: "open", label: "Open", icon: Hourglass, badge: stats.open },
    { value: "courses", label: "Courses", icon: GraduationCap },
    { value: "subscriptions", label: "Subscriptions", icon: Repeat },
    { value: "closed", label: "Closed", icon: XCircle },
  ];
  const [tab] = useTabParam(tabs, "all");
  const rows = all.filter(PICK[tab as Tab]);

  const newButton = (
    <Button asChild>
      <Link to="/portal/expenses/new">
        <Plus className="h-4 w-4" aria-hidden />
        New request
      </Link>
    </Button>
  );

  return (
    <div className="min-w-0">
      <PageHeader
        icon={Receipt}
        eyebrow="My requests"
        title="Courses and expenses"
        description="Request a course, tool or reimbursement. HR reviews it, then Finance pays."
        actions={newButton}
      />
      <StatGrid columns={3} className="mb-5">
        <StatTile
          label="Open"
          value={stats.open}
          icon={Hourglass}
          tone={stats.open ? "warning" : "default"}
          loading={q.isLoading}
          hint={stats.open ? `${stats.withHr} with HR · ${stats.withFinance} with Finance` : "Nothing waiting"}
        />
        <StatTile label="Courses" value={stats.courses} icon={GraduationCap} tone="primary" loading={q.isLoading} hint={stats.courses ? `${stats.completed} completed` : "None yet"} />
        <StatTile
          label="Paid for you"
          value={formatMoney(stats.paid, currency)}
          icon={Wallet}
          loading={q.isLoading}
          hint="Courses, tools and reimbursements"
          className="col-span-2 lg:col-span-1"
        />
      </StatGrid>
      <TabsNav tabs={tabs} className="mb-4" />
      <SectionCard flush>
        {q.error ? (
          <EmptyState
            icon={Receipt}
            title="Your requests could not be loaded"
            description="Check your connection and try again."
            action={
              <Button variant="outline" onClick={() => void q.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <ExpenseTable
            rows={rows}
            basePath="/portal/expenses"
            who={false}
            money
            currency={currency}
            loading={q.isLoading}
            caption="Your courses and expenses"
            empty={
              <EmptyState
                icon={Receipt}
                title={tab === "all" ? "No requests yet" : "Nothing in this tab"}
                description={
                  tab === "all"
                    ? "Send a request for a course, a tool or something you bought for work."
                    : "Try another tab."
                }
                action={tab === "all" ? newButton : undefined}
                compact
              />
            }
          />
        )}
      </SectionCard>
    </div>
  );
}
