import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, GraduationCap, Hourglass, Inbox, Wallet, XCircle } from "lucide-react";
import { ConfirmButton, EmptyState, PageHeader, SectionCard, StatGrid, StatTile, TabsNav, useTabParam, type TabItem } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useCompanyToday, useExpenseRows, useHrDecide } from "../api";
import { CLOSED_STATUSES, DONE_STATUSES, dayIn, type ExpenseRow } from "../kinds";
import { ExpenseTable } from "../components/ExpenseTable";

type Tab = "waiting" | "finance" | "paid" | "courses" | "closed";

const PICK: Record<Tab, (x: ExpenseRow) => boolean> = {
  waiting: (x) => x.status === "pending",
  finance: (x) => x.status === "approved",
  paid: (x) => DONE_STATUSES.includes(x.status),
  courses: (x) => x.category === "course" && !CLOSED_STATUSES.includes(x.status),
  closed: (x) => CLOSED_STATUSES.includes(x.status),
};

/** HR: what employees ask the company to pay for. Finance's own spending is never shown here. */
export default function HrRequestsPage() {
  const { user, company } = useAuth();
  const tz = company?.timezone;
  // HR judges requests: what Finance paid is not shown here, even to the owner.
  const { rows: all, isLoading, error, refetch } = useExpenseRows(false);
  const requests = useMemo(() => all.filter((x) => x.source === "request"), [all]);
  const decide = useHrDecide();
  const today = useCompanyToday();

  const counts = useMemo(() => {
    const year = today.slice(0, 4);
    return {
      waiting: requests.filter(PICK.waiting).length,
      finance: requests.filter(PICK.finance).length,
      completed: requests.filter((x) => x.category === "course" && !!x.completed_at && dayIn(x.completed_at, tz).startsWith(year)).length,
      inProgress: requests.filter((x) => x.category === "course" && DONE_STATUSES.includes(x.status) && !x.completed_at).length,
      year,
    };
  }, [requests, today, tz]);

  const tabs: TabItem[] = [
    { value: "waiting", label: "Waiting", icon: Hourglass, badge: counts.waiting },
    { value: "finance", label: "With Finance", icon: Wallet },
    { value: "paid", label: "Paid", icon: CheckCircle2 },
    { value: "courses", label: "Courses", icon: GraduationCap },
    { value: "closed", label: "Not approved", icon: XCircle },
  ];
  const [tab] = useTabParam(tabs, "waiting");
  const rows = requests.filter(PICK[tab as Tab]);

  return (
    <div className="min-w-0">
      <PageHeader
        icon={ClipboardList}
        eyebrow="People"
        title="Courses and requests"
        description="Review what employees ask the company to pay for. Approved requests go to Finance."
      />
      <StatGrid columns={3} className="mb-5">
        <StatTile label="Waiting for you" value={counts.waiting} tone={counts.waiting ? "warning" : "default"} icon={Hourglass} hint={counts.waiting ? "Needs your decision" : "Nothing waiting"} loading={isLoading} />
        <StatTile label="With Finance" value={counts.finance} icon={Wallet} hint="Approved, not paid yet" loading={isLoading} />
        <StatTile
          label={`Courses completed in ${counts.year}`}
          value={counts.completed}
          tone="primary"
          icon={GraduationCap}
          hint={`${counts.inProgress} in progress`}
          loading={isLoading}
          className="col-span-2 lg:col-span-1"
        />
      </StatGrid>
      <TabsNav tabs={tabs} className="mb-4" />
      <SectionCard flush>
        {error ? (
          <EmptyState
            icon={Inbox}
            title="Requests could not be loaded"
            description="Check your connection and try again."
            action={
              <Button variant="outline" onClick={refetch}>
                Try again
              </Button>
            }
          />
        ) : (
          <ExpenseTable
            rows={rows}
            basePath="/expenses"
            loading={isLoading}
            today={today}
            caption="Employee requests"
            empty={
              <EmptyState
                icon={Inbox}
                title={tab === "waiting" ? "No requests waiting" : "Nothing in this tab"}
                description={tab === "waiting" ? "New course and expense requests appear here and in your notifications." : "Try another tab."}
                compact
              />
            }
            actions={(x) =>
              x.status === "pending" ? (
                <div className="flex items-center gap-1.5">
                  <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                    <Link to={`/expenses/${x.id}`}>Review</Link>
                  </Button>
                  {x.employee?.user_id !== user?.id && (
                    <ConfirmButton
                      size="sm"
                      destructive={false}
                      title={`Approve "${x.title}"?`}
                      description={`For ${x.employee?.name ?? "the employee"}. It goes to Finance, and the employee is told.`}
                      confirmLabel="Approve"
                      disabled={decide.isPending}
                      onConfirm={() => decide.mutateAsync({ id: x.id, decision: "approve", note: "" })}
                    >
                      Approve
                    </ConfirmButton>
                  )}
                </div>
              ) : (
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/expenses/${x.id}`}>Open</Link>
                </Button>
              )
            }
          />
        )}
      </SectionCard>
    </div>
  );
}
