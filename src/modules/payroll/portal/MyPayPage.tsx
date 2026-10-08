import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, Clock, Hourglass, Wallet } from "lucide-react";
import { CardSkeleton, PageHeader, SectionCard, StatGrid, StatGridSkeleton, StatTile, formatDate, formatMoney, formatMonth } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import { errorMessage, thisMonthKey, useExpectedPay } from "../lib/api";
import { AttendanceLine, MonthSwitch, Notice, Row, formatHours, plural } from "../components/bits";

/**
 * The company's current month (yyyy-MM-01). The server decides "today" in the company's
 * timezone, so a viewer in another zone around the 1st still opens the month payroll is on
 * (the browser's month can be one ahead, which the server refuses, or one behind).
 */
function useCompanyMonth(): string | null {
  const { employee } = useEmployeeAuth();
  const { data } = useQuery({
    queryKey: ["portal", employee?.company_id ?? "none", "company-settings", employee?.id ?? "none"],
    enabled: !!employee?.id,
    staleTime: 5 * 60_000,
    queryFn: () => portalRpc<{ today?: string | null }>("portal_company_settings"),
  });
  const today = data?.today;
  return today && /^\d{4}-\d{2}-\d{2}/.test(today) ? `${today.slice(0, 7)}-01` : null;
}

/** The employee's own pay for a month: the payslip once final, an estimate worked out the same way before. */
export default function MyPayPage() {
  const companyMonth = useCompanyMonth();
  // null follows the company's current month; a month picked in the switch sticks.
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? companyMonth ?? thisMonthKey();
  const q = useExpectedPay(month);
  const d = q.data;
  const cur = d?.currency ?? "PKR";
  const money = (n: number) => formatMoney(n, cur);
  const label = formatMonth(month);
  // Once the payslip is final its figures are the pay; the estimate below only shows how it was worked out.
  const slip = d?.payslip ?? null;
  const headline = slip
    ? { label: "Net pay", net: slip.net_salary, gross: slip.gross_salary, deductions: Math.round((slip.gross_salary - slip.net_salary) * 100) / 100 }
    : d
      ? { label: "Expected net pay", net: d.totals.net_salary, gross: d.totals.gross_salary, deductions: d.totals.total_deductions }
      : null;
  // No day of the month on the books (before joining): nothing to pay, which is not a "part month".
  const offPayroll = !!d && !slip && d.pay.paid_days === 0 && !d.pay.unpaid_leave_days;
  const noSalary = !!d && !slip && !offPayroll && !d.pay.has_salary;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Self service"
        title="My pay"
        icon={Wallet}
        description={slip ? `Your pay for ${label}, as on your payslip.` : `Your expected pay for ${label}, worked out the way your payslip will be.`}
        actions={<MonthSwitch value={month} onChange={setPicked} max={companyMonth ?? undefined} />}
      />

      {q.isError && (
        <Notice tone="danger" className="mb-4">
          {errorMessage(q.error)}{" "}
          <button type="button" className="font-semibold text-primary underline" onClick={() => q.refetch()}>
            Try again
          </button>
        </Notice>
      )}
      {q.isLoading || !d || !headline ? (
        !q.isError && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading your pay">
            <StatGridSkeleton count={3} className="lg:grid-cols-3 [&>*:first-child]:col-span-2 lg:[&>*:first-child]:col-span-1" />
            <div className="grid gap-4 md:grid-cols-2">
              <CardSkeleton lines={6} />
              <CardSkeleton lines={4} />
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {d.payslip ? (
            <Notice tone="success">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Your {label} payslip is {d.payslip.status === "paid" ? `paid${d.payslip.paid_on ? ` (${formatDate(d.payslip.paid_on)})` : ""}` : "ready"}: net <span className="tabular font-bold">{money(d.payslip.net_salary)}</span>.
                </span>
                <Link to={`/portal/payslips/${d.payslip.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                  Open payslip
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </span>
            </Notice>
          ) : d.preparing ? (
            <Notice tone="info">Finance is preparing your {label} payslip. You will be told when it is ready.</Notice>
          ) : offPayroll ? (
            <Notice tone="info">You were not on the payroll in {label}, so there is no pay for that month.</Notice>
          ) : noSalary ? (
            <Notice tone="warning">Finance has not recorded your salary yet, so this estimate shows nothing. Ask Finance if that is unexpected.</Notice>
          ) : null}

          <StatGrid columns={3}>
            <StatTile
              className="col-span-2 lg:col-span-1"
              label={headline.label}
              value={money(headline.net)}
              tone="primary"
              hint={`${money(headline.gross)} gross · ${money(headline.deductions)} deductions`}
            />
            <StatTile label="Days paid" value={`${d.pay.paid_days} / ${d.pay.month_days}`} icon={CalendarCheck} hint={offPayroll ? "Not on the payroll" : d.pay.unpaid_leave_days ? `${plural(d.pay.unpaid_leave_days, "day")} of unpaid leave` : d.pay.prorated ? "Part month" : "Whole month"} />
            <StatTile label="Salary on file" value={money(d.salary_on_file)} hint="Monthly, before tax" />
          </StatGrid>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard
              title="The estimate"
              description={d.payslip ? "Worked out from your salary on file. Your payslip has the final figures, with any bonus or deduction." : "Finance may still add a bonus, an advance or a deduction."}
            >
              <Row label="Basic salary" value={money(d.figures.basic_salary)} />
              <Row label="Allowances" value={money(d.figures.allowances)} />
              {d.figures.other_allowances ? <Row label="Other allowances" value={money(d.figures.other_allowances)} /> : null}
              {d.figures.overtime_earnings ? <Row label="Overtime" value={money(d.figures.overtime_earnings)} /> : null}
              <Row strong label="Gross pay" value={money(d.totals.gross_salary)} className="border-t border-border/60" />
              <Row label="Income tax" value={money(d.figures.income_tax)} />
              <div className="mt-2 flex items-baseline justify-between rounded-xl bg-primary/[0.06] px-3 py-2.5">
                <span className="micro-label text-primary">{d.payslip ? "Estimated net pay" : "Net pay"}</span>
                <span className="tabular font-display text-xl font-bold text-primary">{money(d.totals.net_salary)}</span>
              </div>
              {d.pay.prorated && (
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  {[d.pay.joined ? `Joined ${formatDate(d.pay.joined)}.` : null, d.pay.left ? `Last day ${formatDate(d.pay.left)}.` : null, d.pay.salary_changed ? "Your salary changed during the month." : null, `Paid for ${d.pay.paid_days} of ${d.pay.month_days} days.`]
                    .filter(Boolean)
                    .join(" ")}
                </p>
              )}
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title="Overtime" description="Approved by HR, then priced by Finance.">
                <Stage icon={Wallet} title="On this month's pay" value={d.overtime.counted.entries ? `${formatHours(d.overtime.counted.hours)} · ${money(d.overtime.counted.amount)}` : "None yet"} />
                <Stage
                  icon={Hourglass}
                  title="Waiting for Finance's rate"
                  value={d.overtime.unpriced.entries ? `${formatHours(d.overtime.unpriced.hours)} · about ${money(d.overtime.unpriced.estimate)}` : "None"}
                  hint={d.overtime.unpriced.entries ? "Not in the estimate until Finance prices it." : undefined}
                />
                <Stage icon={Clock} title="Waiting for HR" value={d.overtime.pending.entries ? `${plural(d.overtime.pending.entries, "claim")} · ${formatHours(d.overtime.pending.hours)}` : "None"} />
              </SectionCard>
              <SectionCard title="Attendance" description="For reference; your pay follows your days on the books and unpaid leave.">
                <p className="text-[13px]">
                  <AttendanceLine a={d.attendance} />
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{plural(d.attendance.working_days_month, "working day")} in {label}.</p>
              </SectionCard>
            </div>
          </div>
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link to="/portal/payslips">All my payslips</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stage({ icon: Icon, title, value, hint }: { icon: typeof Wallet; title: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="micro-label">{title}</p>
        <p className="tabular text-[13px] font-semibold text-foreground">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
