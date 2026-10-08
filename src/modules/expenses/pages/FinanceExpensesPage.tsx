import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChartPie, Download, GraduationCap, Plus, Receipt, Repeat, Wallet } from "lucide-react";
import {
  EmptyState,
  FilterBar,
  PageHeader,
  SectionCard,
  StatGrid,
  StatTile,
  TabsNav,
  downloadCsv,
  useMoney,
  useTabParam,
  type TabItem,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useCompanyToday, useExpenseRows } from "../api";
import {
  BILLING_LABELS,
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  DONE_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  STATUS_LABELS,
  dayIn,
  monthlyCost,
  renewalSoon,
  type ExpenseCategory,
  type ExpenseRow,
  type ExpenseStatus,
} from "../kinds";
import { ExpenseTable } from "../components/ExpenseTable";

type Tab = "todo" | "courses" | "subscriptions" | "all";
const ALL = "all";

/** Finance: everything the company pays for beyond salaries. */
export default function FinanceExpensesPage() {
  const { currency, format } = useMoney();
  const { company } = useAuth();
  const tz = company?.timezone;
  const { rows, payments, isLoading, error, refetch } = useExpenseRows(true);
  const today = useCompanyToday();

  const summary = useMemo(() => {
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);
    const toPay = rows.filter((x) => x.status === "approved");
    const subs = rows.filter((x) => x.status === "active");
    const category = new Map(rows.map((x) => [x.id, x.category] as const));
    const byCategory = new Map<ExpenseCategory, number>();
    let paidThisMonth = 0;
    let paidThisYear = 0;
    for (const p of payments) {
      if (p.paid_on.startsWith(year)) {
        paidThisYear += p.amount;
        const c = category.get(p.expense_id);
        if (c) byCategory.set(c, (byCategory.get(c) ?? 0) + p.amount);
      }
      if (p.paid_on.startsWith(month)) paidThisMonth += p.amount;
    }
    return {
      toPay: toPay.length,
      toPayHome: toPay.filter((x) => x.currency === currency).reduce((s, x) => s + x.amount, 0),
      toPayForeign: toPay.filter((x) => x.currency !== currency).length,
      renewalsDue: subs.filter((x) => renewalSoon(x, today)).length,
      paidThisMonth,
      paidThisYear,
      activeSubscriptions: subs.length,
      subscriptionsMonthly: subs.reduce((s, x) => s + (monthlyCost(x, currency) ?? 0), 0),
      // A start date is a calendar day; without one, the day it was added on the company's calendar (not UTC).
      coursesThisYear: rows.filter((x) => x.category === "course" && DONE_STATUSES.includes(x.status) && (x.start_date ?? dayIn(x.created_at, tz)).startsWith(year)).length,
      byCategory: [...byCategory.entries()].map(([c, amount]) => ({ category: c, amount })).sort((a, b) => b.amount - a.amount),
      year,
    };
  }, [rows, payments, currency, today, tz]);

  const tabs: TabItem[] = [
    { value: "todo", label: "To pay", icon: Wallet, badge: summary.toPay + summary.renewalsDue },
    { value: "courses", label: "Courses", icon: GraduationCap },
    { value: "subscriptions", label: "Subscriptions", icon: Repeat },
    { value: "all", label: "All spending", icon: Receipt },
  ];
  const [tab] = useTabParam(tabs, "todo");

  return (
    <div className="min-w-0">
      <PageHeader
        icon={Receipt}
        eyebrow="Finance"
        title="Expenses and courses"
        description="Courses, subscriptions, equipment, travel and reimbursements."
        actions={
          <Button asChild>
            <Link to="/expenses/new">
              <Plus className="h-4 w-4" aria-hidden />
              Add expense
            </Link>
          </Button>
        }
      />
      <StatGrid columns={4} className="mb-5">
        <StatTile
          label="To pay"
          value={summary.toPay}
          icon={Wallet}
          tone={summary.toPay ? "warning" : "default"}
          loading={isLoading}
          hint={summary.toPay ? `${format(summary.toPayHome)}${summary.toPayForeign ? ` + ${summary.toPayForeign} in other currencies` : ""}` : "Nothing waiting"}
        />
        <StatTile label="Paid this month" value={format(summary.paidThisMonth)} tone="primary" icon={Receipt} loading={isLoading} hint={`${format(summary.paidThisYear)} this year`} />
        <StatTile
          label="Subscriptions"
          value={summary.activeSubscriptions}
          icon={Repeat}
          tone={summary.renewalsDue ? "warning" : "default"}
          loading={isLoading}
          hint={summary.activeSubscriptions ? `About ${format(summary.subscriptionsMonthly)} a month${summary.renewalsDue ? ` · ${summary.renewalsDue} due` : ""}` : "None running"}
        />
        <StatTile label="Courses this year" value={summary.coursesThisYear} icon={GraduationCap} loading={isLoading} hint="Paid for, started this year" />
      </StatGrid>
      <TabsNav tabs={tabs} className="mb-4" />
      {error ? (
        <SectionCard>
          <EmptyState
            icon={Receipt}
            title="Spending could not be loaded"
            description="Check your connection and try again."
            action={
              <Button variant="outline" onClick={refetch}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : tab === "todo" ? (
        <TodoTab rows={rows} loading={isLoading} currency={currency} today={today} />
      ) : tab === "courses" ? (
        <CoursesTab rows={rows} loading={isLoading} currency={currency} format={format} today={today} />
      ) : tab === "subscriptions" ? (
        <SubscriptionsTab rows={rows} loading={isLoading} currency={currency} format={format} today={today} />
      ) : (
        <AllTab rows={rows} loading={isLoading} currency={currency} format={format} byCategory={summary.byCategory} year={summary.year} today={today} />
      )}
    </div>
  );
}

const open = (x: ExpenseRow, label = "Open") => (
  <Button asChild variant="ghost" size="sm">
    <Link to={`/expenses/${x.id}`}>{label}</Link>
  </Button>
);

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <SectionCard title={title} description={hint} flush>
      {children}
    </SectionCard>
  );
}

function TodoTab({ rows, loading, currency, today }: { rows: ExpenseRow[]; loading: boolean; currency: string; today: string }) {
  const toPay = rows.filter((x) => x.status === "approved").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const renewals = rows.filter((x) => renewalSoon(x, today)).sort((a, b) => (a.renews_on ?? "").localeCompare(b.renews_on ?? ""));
  if (!loading && !toPay.length && !renewals.length) {
    return (
      <SectionCard>
        <EmptyState
          icon={Wallet}
          title="Nothing to pay"
          description="Approved requests and renewals due this week appear here."
        />
      </SectionCard>
    );
  }
  return (
    <div className="grid gap-4">
      {(loading || toPay.length > 0) && (
        <Section title="Waiting to be paid" hint="Oldest first">
          <ExpenseTable rows={toPay} basePath="/expenses" loading={loading} currency={currency} today={today} actions={(x) => open(x, "Pay or decline")} />
        </Section>
      )}
      {renewals.length > 0 && (
        <Section title="Renewals due" hint="Overdue and the next 7 days">
          <ExpenseTable rows={renewals} basePath="/expenses" money currency={currency} today={today} actions={(x) => open(x, "Record renewal")} />
        </Section>
      )}
    </div>
  );
}

function CoursesTab({ rows, loading, currency, format, today }: { rows: ExpenseRow[]; loading: boolean; currency: string; format: (n: number) => string; today: string }) {
  const courses = rows.filter((x) => x.category === "course" && !["withdrawn", "rejected"].includes(x.status));
  const done = courses.filter((x) => x.completed_at).length;
  const running = courses.filter((x) => DONE_STATUSES.includes(x.status) && !x.completed_at).length;
  const spent = courses.reduce((s, x) => s + (x.paid_total ?? 0), 0);
  if (!loading && !courses.length) {
    return (
      <SectionCard>
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          description="Approved course requests and courses you add appear here."
          action={
            <Button asChild size="sm">
              <Link to="/expenses/new">
                <Plus className="h-4 w-4" aria-hidden />
                Add expense
              </Link>
            </Button>
          }
        />
      </SectionCard>
    );
  }
  return (
    <Section title="Courses" hint={`${courses.length} ${courses.length === 1 ? "course" : "courses"} · ${running} in progress · ${done} completed · ${format(spent)} paid in all`}>
      <ExpenseTable rows={courses} basePath="/expenses" loading={loading} money currency={currency} today={today} actions={(x) => open(x)} />
    </Section>
  );
}

function SubscriptionsTab({ rows, loading, currency, format, today }: { rows: ExpenseRow[]; loading: boolean; currency: string; format: (n: number) => string; today: string }) {
  const subs = rows.filter((x) => x.category === "subscription");
  const active = subs.filter((x) => x.status === "active").sort((a, b) => (a.renews_on ?? "9999").localeCompare(b.renews_on ?? "9999"));
  const waiting = subs.filter((x) => x.status === "approved");
  const ended = subs.filter((x) => x.status === "ended");
  const monthly = active.reduce((s, x) => s + (monthlyCost(x, currency) ?? 0), 0);
  const unknown = active.filter((x) => monthlyCost(x, currency) === null).length;
  if (!loading && !active.length && !waiting.length && !ended.length) {
    return (
      <SectionCard>
        <EmptyState
          icon={Repeat}
          title="No subscriptions yet"
          description="Add the tools the company pays for monthly or yearly, then record each renewal."
          action={
            <Button asChild size="sm">
              <Link to="/expenses/new">
                <Plus className="h-4 w-4" aria-hidden />
                Add expense
              </Link>
            </Button>
          }
        />
      </SectionCard>
    );
  }
  return (
    <div className="grid gap-4">
      {(loading || active.length > 0) && (
        <Section
          title="Running"
          hint={`${active.length} running · about ${format(monthly)} a month${unknown ? ` (plus ${unknown} not paid in ${currency} yet)` : ""} · ${format(monthly * 12)} a year`}
        >
          <ExpenseTable
            rows={active}
            basePath="/expenses"
            loading={loading}
            money
            currency={currency}
            today={today}
            actions={(x) => open(x, renewalSoon(x, today) ? "Record renewal" : "Open")}
          />
        </Section>
      )}
      {waiting.length > 0 && (
        <Section title="Approved, not paid yet">
          <ExpenseTable rows={waiting} basePath="/expenses" currency={currency} today={today} actions={(x) => open(x, "Pay")} />
        </Section>
      )}
      {ended.length > 0 && (
        <Section title="Ended">
          <ExpenseTable rows={ended} basePath="/expenses" money currency={currency} today={today} actions={(x) => open(x)} />
        </Section>
      )}
    </div>
  );
}

const BAR_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

function AllTab({
  rows,
  loading,
  currency,
  format,
  byCategory,
  year,
  today,
}: {
  rows: ExpenseRow[];
  loading: boolean;
  currency: string;
  format: (n: number) => string;
  byCategory: Array<{ category: ExpenseCategory; amount: number }>;
  year: string;
  today: string;
}) {
  const { company } = useAuth();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [dept, setDept] = useState<string>(ALL);
  const departments = useMemo(
    () => [...new Set(rows.map((x) => x.employee?.department?.name).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (x) =>
        (category === ALL || x.category === category) &&
        (status === ALL || x.status === status) &&
        (dept === ALL || x.employee?.department?.name === dept) &&
        (!needle ||
          [x.title, x.provider, x.employee?.name ?? "", x.employee?.employee_code ?? ""].some((s) => s.toLowerCase().includes(needle))),
    );
  }, [rows, q, category, status, dept]);
  const isFiltered = !!q.trim() || category !== ALL || status !== ALL || dept !== ALL;
  const paid = filtered.reduce((s, x) => s + (x.paid_total ?? 0), 0);
  const top = Math.max(1, ...byCategory.map((b) => b.amount));
  const total = byCategory.reduce((s, b) => s + b.amount, 0);

  const exportCsv = () =>
    downloadCsv(filtered, `expenses-${today}.csv`, [
      { header: "Title", value: (x) => x.title },
      { header: "Kind", value: (x) => CATEGORY_SHORT[x.category] },
      { header: "For", value: (x) => x.employee?.name ?? "Whole company" },
      { header: "Department", value: (x) => x.employee?.department?.name ?? "" },
      { header: "Provider", value: (x) => x.provider },
      { header: "Quoted amount", value: (x) => x.amount },
      { header: "Quote currency", value: (x) => x.currency },
      { header: "Billing", value: (x) => BILLING_LABELS[x.billing] },
      { header: "Status", value: (x) => STATUS_LABELS[x.status] },
      { header: `Paid (${currency})`, value: (x) => x.paid_total ?? 0 },
      { header: "Next renewal", value: (x) => x.renews_on ?? "" },
      { header: "Added", value: (x) => dayIn(x.created_at, company?.timezone) },
    ]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <SectionCard
        flush
        title="All spending"
        description={`${filtered.length} ${isFiltered ? "matching" : "in all"} · ${format(paid)} paid`}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </Button>
        }
      >
        <div className="border-b border-border/60 px-4 py-3 sm:px-5">
          <FilterBar search={q} onSearchChange={setQ} placeholder="Search title, provider or person">
            <FilterSelect label="Kind" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES.map((c) => [c, CATEGORY_SHORT[c]])} all="Every kind" />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={EXPENSE_STATUSES.map((s: ExpenseStatus) => [s, STATUS_LABELS[s]])} all="Every status" />
            {departments.length > 0 && <FilterSelect label="Department" value={dept} onChange={setDept} options={departments.map((d) => [d, d])} all="Every department" />}
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ("");
                  setCategory(ALL);
                  setStatus(ALL);
                  setDept(ALL);
                }}
              >
                Clear filters
              </Button>
            )}
          </FilterBar>
        </div>
        <ExpenseTable
          rows={filtered}
          basePath="/expenses"
          loading={loading}
          money
          currency={currency}
          today={today}
          actions={(x) => open(x)}
          empty={<EmptyState icon={Receipt} title={isFiltered ? "No matching expenses" : "No expenses yet"} description={isFiltered ? "Try removing a filter." : "Add the first expense, or wait for HR to approve a request."} compact />}
        />
      </SectionCard>

      <SectionCard title="Spent by kind" description={`${year} · ${format(total)}`} icon={ChartPie}>
        {byCategory.length ? (
          <ul className="grid gap-3" aria-label={`Spent by kind in ${year}`}>
            {byCategory.map((b, i) => (
              <li key={b.category}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-foreground">{CATEGORY_LABELS[b.category]}</span>
                  <span className="tabular shrink-0 font-semibold text-foreground">{format(b.amount)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div className={cn("h-full rounded-full transition-[width] duration-500", BAR_COLORS[i % BAR_COLORS.length])} style={{ width: `${(b.amount / top) * 100}%` }} />
                </div>
                <p className="tabular mt-0.5 text-[11px] text-muted-foreground">{total ? Math.round((b.amount / total) * 100) : 0}% of the year</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing paid yet this year.</p>
        )}
      </SectionCard>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>; all: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-9 w-full min-w-[9rem] flex-1 rounded-xl text-xs sm:w-40 sm:flex-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{all}</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
