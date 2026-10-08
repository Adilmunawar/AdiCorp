import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarCheck2, CalendarDays, Clock3, ListChecks, Plane, Plus, Scale, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatGrid, StatTile, TabsNav, downloadCsv, humanize, useTabParam } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useCompanyToday, useLeaveRequests } from "../api";
import { BalancesPanel } from "../components/BalancesPanel";
import { LeaveCalendar } from "../components/LeaveCalendar";
import { LeaveRequestDialog } from "../components/LeaveRequestDialog";
import { RequestsPanel, type StatusFilter } from "../components/RequestsPanel";
import { TypesPanel } from "../components/TypesPanel";
import { trimNumber } from "../lib";
import { LEAVE_STATUSES, type LeaveStatus } from "../types";

const TABS = [
  { value: "requests", label: "Requests", icon: ListChecks },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "balances", label: "Balances", icon: Scale },
  { value: "types", label: "Leave types", icon: Plane },
];

export default function LeavePage() {
  const { isHR } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab] = useTabParam(TABS);
  const today = useCompanyToday();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [filing, setFiling] = useState(false);

  const rawStatus = params.get("status");
  const status: StatusFilter = rawStatus && (LEAVE_STATUSES as string[]).includes(rawStatus) ? (rawStatus as LeaveStatus) : "all";
  const setStatus = (next: StatusFilter) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("status");
        else p.set("status", next);
        return p;
      },
      { replace: true },
    );

  const requests = useLeaveRequests({ year });
  const allPending = useLeaveRequests({ status: "pending" });
  const awayToday = useLeaveRequests({ status: "approved", from: today, to: today });

  const rows = useMemo(() => requests.data ?? [], [requests.data]);
  const stats = useMemo(() => {
    const approved = rows.filter((r) => r.status === "approved");
    return {
      approvedDays: approved.reduce((s, r) => s + r.days_count, 0),
      unpaidDays: approved.filter((r) => !r.is_paid).reduce((s, r) => s + r.days_count, 0),
      total: rows.length,
    };
  }, [rows]);
  const pendingCount = allPending.data?.length ?? 0;
  // The list shows the year plus anything still pending from another year, so nothing waits unseen.
  const listRows = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    return [...(allPending.data ?? []).filter((r) => !ids.has(r.id)), ...rows];
  }, [rows, allPending.data]);
  const away = awayToday.data ?? [];
  const awayHint = away.length
    ? away
        .slice(0, 2)
        .map((r) => r.employee_name.split(" ")[0])
        .join(", ") + (away.length > 2 ? ` +${away.length - 2}` : "")
    : "Everyone is in";

  const exportCsv = () =>
    downloadCsv(
      rows.map((r) => ({
        Employee: r.employee_name,
        "Employee ID": r.employee_code ?? "",
        Department: r.department ?? "",
        Type: r.type_name,
        Paid: r.is_paid ? "Yes" : "No",
        From: r.start_date,
        To: r.end_date,
        Days: r.days_count,
        Status: humanize(r.status),
        Reason: r.reason ?? "",
        "HR note": r.review_notes ?? "",
        "Decided by": r.reviewer_name ?? "",
        Filed: r.created_at,
      })),
      `leave-requests-${year}`,
    );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="People"
        title="Leave"
        description="Requests, balances, the team calendar and leave types."
        icon={Plane}
        actions={
          isHR ? (
            <Button size="sm" className="h-9 rounded-xl" onClick={() => setFiling(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> File a request
            </Button>
          ) : undefined
        }
      />

      {/* Labels stay short: on phones a tile has about 80px beside its icon. */}
      <StatGrid columns={4}>
        <StatTile
          label="Pending"
          value={pendingCount}
          hint={pendingCount ? "To decide" : "All decided"}
          tone={pendingCount ? "warning" : "default"}
          icon={Clock3}
          href={pendingCount ? "/leave?tab=requests&status=pending" : undefined}
          loading={allPending.isLoading}
        />
        <StatTile label="Out today" value={away.length} hint={awayHint} tone="primary" icon={Users} loading={awayToday.isLoading} />
        <StatTile
          label="Days taken"
          value={trimNumber(stats.approvedDays)}
          hint={`${year} · ${stats.unpaidDays ? `${trimNumber(stats.unpaidDays)} unpaid` : "all paid"}`}
          tone="success"
          icon={CalendarCheck2}
          loading={requests.isLoading || requests.isPlaceholderData}
        />
        <StatTile label="Requests" value={stats.total} hint={`Filed in ${year}`} icon={ListChecks} loading={requests.isLoading || requests.isPlaceholderData} />
      </StatGrid>

      <TabsNav tabs={TABS.map((t) => (t.value === "requests" ? { ...t, badge: pendingCount || undefined } : t))} />

      {tab === "requests" && (
        <RequestsPanel
          rows={listRows}
          loading={requests.isLoading}
          refreshing={requests.isPlaceholderData}
          year={year}
          onYearChange={setYear}
          status={status}
          onStatusChange={setStatus}
          canDecide={isHR}
          onFile={() => setFiling(true)}
          onExport={rows.length ? exportCsv : undefined}
        />
      )}
      {tab === "calendar" && <LeaveCalendar />}
      {tab === "balances" && <BalancesPanel canEdit={isHR} />}
      {tab === "types" && <TypesPanel canEdit={isHR} />}

      {isHR && <LeaveRequestDialog open={filing} onOpenChange={setFiling} />}
    </div>
  );
}
