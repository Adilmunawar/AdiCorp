import { AlertTriangle, Bell, CalendarCheck, Clock, Plane, ReceiptText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, StatGrid, StatGridSkeleton, StatTile, formatMoney, formatMonth, formatNumber, Skeleton } from "@/components/kit";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { usePortalHome, type PortalHome } from "../api";
import { portalHref } from "../links";
import { Announcements, Celebrations, ComingUp, HomeBanners, HomeHero, LeaveBalances } from "../components/HomeSections";

/** Life-event leave (maternity, paternity) is not part of the everyday "leave left" figure. */
const EVENT_LEAVE_KINDS = new Set(["maternity", "paternity"]);

function HomeStats({ data, currency }: { data: PortalHome; currency: string }) {
  const m = data.month;
  const remaining = data.leave.balances
    .filter((b) => !b.unlimited && !EVENT_LEAVE_KINDS.has(String(b.kind ?? "").toLowerCase()))
    .reduce((sum, b) => sum + (Number(b.remaining) || 0), 0);
  const ratio = m.working_days_so_far > 0 ? m.present / m.working_days_so_far : null;
  const presentTone = ratio === null ? "default" : ratio >= 0.9 ? "success" : ratio >= 0.75 ? "warning" : "danger";
  const hoursPct = m.hours !== null && m.expected_hours > 0 ? Math.round((m.hours / m.expected_hours) * 100) : null;

  return (
    <StatGrid columns={4} className="[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
      <StatTile
        label="Present this month"
        value={m.working_days_so_far > 0 ? `${m.present}/${m.working_days_so_far}` : "—"}
        hint={
          m.working_days_so_far === 0
            ? "No working days yet"
            : m.absent
              ? `${m.absent} absent · ${m.leave} on leave`
              : m.leave
                ? `${m.leave} on leave`
                : "working days so far"
        }
        tone={presentTone}
        icon={CalendarCheck}
        href={portalHref("attendance")}
      />
      {m.hours !== null ? (
        <StatTile
          label="My hours"
          value={`${formatNumber(m.hours, 1)} h`}
          hint={hoursPct !== null ? `${hoursPct}% of ${formatNumber(m.expected_hours, 0)} h expected` : undefined}
          tone={hoursPct === null ? "default" : hoursPct >= 95 ? "success" : hoursPct >= 80 ? "warning" : "danger"}
          icon={Clock}
          href={portalHref("attendance")}
        />
      ) : (
        <StatTile
          label="Short leave"
          value={m.short_leave}
          hint="this month"
          icon={Clock}
          href={portalHref("attendance")}
        />
      )}
      <StatTile
        label="Leave left"
        value={`${formatNumber(remaining, 1)} ${remaining === 1 ? "day" : "days"}`}
        hint={data.leave.pending ? `${data.leave.pending} request${data.leave.pending === 1 ? "" : "s"} pending` : "this year"}
        tone={data.leave.pending ? "warning" : "primary"}
        icon={Plane}
        href={portalHref("leave")}
      />
      {data.payslip ? (
        <StatTile
          label="Latest payslip"
          value={formatMoney(data.payslip.net_salary, currency)}
          hint={`${formatMonth(data.payslip.month)} · net pay`}
          tone="success"
          icon={ReceiptText}
          href={portalHref("payslips")}
        />
      ) : (
        <StatTile
          label="Unread from HR"
          value={data.unread_notifications}
          hint={data.unread_notifications ? "notifications waiting" : "you're all caught up"}
          tone={data.unread_notifications ? "primary" : "default"}
          icon={Bell}
          href={portalHref("notifications")}
        />
      )}
    </StatGrid>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your home page">
      <Skeleton className="h-[132px] w-full rounded-2xl" />
      <StatGridSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}

/** Employee home: greeting, today, this month, leave, pay, announcements, celebrations, holidays. */
export default function PortalHomePage() {
  const { company } = useEmployeeAuth();
  const { data, isPending, isError, error, refetch, isFetching } = usePortalHome();
  const currency = (company?.currency || "PKR").toUpperCase();

  if (isPending) return <HomeSkeleton />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="We couldn't load your home page"
        description={error instanceof Error ? error.message : "Please check your connection and try again."}
        action={
          <Button variant="outline" className="rounded-xl" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <HomeHero data={data} />
      <HomeBanners data={data} />
      <HomeStats data={data} currency={currency} />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-3">
          <Announcements items={data.announcements} />
          <LeaveBalances balances={data.leave.balances} pending={data.leave.pending} today={data.today} />
        </div>
        <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-2">
          <Celebrations items={data.celebrations} />
          <ComingUp items={data.holidays} today={data.today} />
        </div>
      </div>
    </div>
  );
}
