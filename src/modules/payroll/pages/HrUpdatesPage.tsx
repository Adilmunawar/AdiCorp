import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, CalendarMinus, CalendarPlus, Check, Inbox, LogOut, RotateCcw, UserCog, UserPlus, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton, EmptyState, ListSkeleton, PageHeader, SectionCard, StatusBadge, TabsNav, formatDateTime, formatMonth, formatRelative, humanize, initials, useMoney, useTabParam } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage, usePayEvents, usePayrollCounts, useSetEventsDone } from "../lib/api";
import type { PayEventRow } from "../lib/types";
import { Notice, PayslipStatusBadge, formatDay, plural } from "../components/bits";

const KIND_LABEL: Record<string, string> = {
  joined: "New joiner",
  joining_date: "Joining date changed",
  position: "New position",
  left: "Leaving",
  rejoined: "Rejoined",
  unpaid_leave: "Unpaid leave",
  unpaid_leave_undone: "Unpaid leave taken back",
};
const KIND_TONE: Record<string, "info" | "warning" | "success" | "primary" | "neutral"> = {
  joined: "success",
  rejoined: "success",
  left: "warning",
  joining_date: "info",
  position: "primary",
  unpaid_leave: "warning",
  unpaid_leave_undone: "info",
};
const KIND_ICON: Record<string, LucideIcon> = {
  joined: UserPlus,
  rejoined: UserPlus,
  left: LogOut,
  joining_date: CalendarPlus,
  position: Briefcase,
  unpaid_leave: CalendarMinus,
  unpaid_leave_undone: CalendarPlus,
};
const ICON_WELL: Record<string, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  primary: "bg-primary/[0.08] text-primary",
  neutral: "bg-muted text-muted-foreground",
};

/** Quick filters: which kinds of change each one covers. */
const GROUPS: Array<{ key: string; label: string; kinds: string[] }> = [
  { key: "all", label: "All", kinds: [] },
  { key: "joiners", label: "Joiners", kinds: ["joined", "rejoined", "joining_date"] },
  { key: "leavers", label: "Leavers", kinds: ["left"] },
  { key: "positions", label: "Positions", kinds: ["position"] },
  { key: "leave", label: "Unpaid leave", kinds: ["unpaid_leave", "unpaid_leave_undone"] },
];

const TABS = [
  { value: "open", label: "Waiting" },
  { value: "done", label: "Done" },
];

export default function HrUpdatesPage() {
  const [tab, setTab] = useTabParam(TABS);
  const open = tab === "open";
  const q = usePayEvents(open);
  const done = useSetEventsDone();
  const counts = usePayrollCounts();
  const [group, setGroup] = useState("all");
  const rows = useMemo(() => q.data ?? [], [q.data]);
  // The waiting count shows on its tab from either tab, not only while it is open.
  const waiting = open && q.data ? rows.length : counts.data?.open_events;

  const groupCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const g of GROUPS.slice(1)) c[g.key] = rows.filter((r) => g.kinds.includes(String(r.kind))).length;
    return c;
  }, [rows]);
  const kinds = GROUPS.find((g) => g.key === group)?.kinds ?? [];
  const shown = kinds.length ? rows.filter((r) => kinds.includes(String(r.kind))) : rows;

  const mark = async (ids: string[] | null, value: boolean) => {
    try {
      const n = await done.mutateAsync({ ids, done: value });
      toast.success(value ? `${plural(n, "update")} marked done.` : `${plural(n, "update")} reopened.`);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Pay"
        title="HR updates"
        icon={UserCog}
        description="Changes HR made that affect pay, and what each one means for that month's payslip."
        actions={
          open && rows.length > 1 ? (
            <ConfirmButton size="sm" className="h-10 rounded-xl sm:h-9" destructive={false} title={`Mark all ${rows.length} updates as done?`} description="They move to the Done tab, where you can reopen any of them." confirmLabel="Mark all done" onConfirm={() => mark(rows.map((r) => r.id), true)}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Mark all done
            </ConfirmButton>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsNav
            className="w-fit max-w-full"
            tabs={TABS.map((t) => (t.value === "open" ? { ...t, badge: waiting } : t))}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setGroup("all");
            }}
          />
          {rows.length > 0 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 hide-scrollbar" role="group" aria-label="Filter by kind of change">
              {GROUPS.filter((g) => g.key === "all" || groupCounts[g.key] > 0).map((g) => {
                const on = group === g.key;
                return (
                  <button
                    key={g.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGroup(g.key)}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40",
                    )}
                  >
                    {g.label}
                    <span className={cn("tabular rounded-full px-1.5 text-[11px] leading-4", on ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{groupCounts[g.key]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PageHeader>

      {q.isError && (
        <Notice tone="danger" className="mb-4">
          {errorMessage(q.error)}{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => q.refetch()}>
            Try again
          </button>
        </Notice>
      )}
      {q.isLoading ? (
        <SectionCard>
          <ListSkeleton rows={4} />
        </SectionCard>
      ) : q.isError ? null : shown.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Inbox}
            title={open ? "You are all caught up" : "Nothing marked done yet"}
            description={open ? "New joiners, leavers, promotions and unpaid leave appear here, and in the bell, as HR records them." : "Updates you mark as done are kept here."}
            action={
              open ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/payroll">Open the payroll sheet</Link>
                </Button>
              ) : undefined
            }
          />
        </SectionCard>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <EventCard key={r.id} r={r} onDone={() => mark([r.id], open).catch(() => undefined)} pending={done.isPending} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventCard({ r, onDone, pending }: { r: PayEventRow; onDone: () => void; pending: boolean }) {
  const { format } = useMoney();
  const e = r.effect;
  const label = KIND_LABEL[r.kind] ?? humanize(r.kind);
  const tone = KIND_TONE[r.kind] ?? "neutral";
  const Icon = KIND_ICON[r.kind] ?? UserCog;
  const staleDraft = e?.payslip_status === "draft" && !!e.stale && (e.stale.salary || e.stale.overtime);
  return (
    <li className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative shrink-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground" aria-hidden>
              {initials(r.employee_name)}
            </span>
            <span className={cn("absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-card", ICON_WELL[tone])} aria-hidden>
              <Icon className="h-3 w-3" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-foreground">{r.employee_name}</p>
              {r.employee_code && <span className="tabular text-[11px] text-muted-foreground">{r.employee_code}</span>}
              <StatusBadge status={r.kind} label={label} tone={tone} />
              {r.employee_status !== "active" && <StatusBadge status={r.employee_status} />}
            </div>
            {r.detail && <p className="mt-1 text-[13px] leading-5 text-foreground/85">{r.detail}</p>}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {r.effective_date && <span className="tabular">Effective {formatDay(r.effective_date)} · </span>}
              {r.created_by_name ? `Recorded by ${r.created_by_name} ` : "Recorded "}
              <time dateTime={r.created_at} title={formatDateTime(r.created_at)}>
                {formatRelative(r.created_at)}
              </time>
              {r.done_at && (
                <>
                  {" · done "}
                  <time dateTime={r.done_at} title={formatDateTime(r.done_at)}>
                    {formatRelative(r.done_at)}
                  </time>
                  {r.done_by_name ? ` by ${r.done_by_name}` : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <Button size="sm" variant={r.done_at ? "outline" : "default"} className="h-9 shrink-0 self-end rounded-xl sm:self-auto" disabled={pending} onClick={onDone} aria-label={`${r.done_at ? "Reopen" : "Mark done"}: ${label}, ${r.employee_name}`}>
          {r.done_at ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
          {r.done_at ? "Reopen" : "Mark done"}
        </Button>
      </div>

      {e && (
        <div className={cn("mt-3 grid gap-3 rounded-xl border p-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", staleDraft || e.payslip_status === "final" || e.payslip_status === "paid" ? "border-warning/30 bg-warning-soft/60" : "border-border/60 bg-muted/40")}>
          <div className="min-w-0 space-y-0.5">
            <p className="micro-label">Effect on {formatMonth(e.month)}</p>
            <p className="text-foreground/85">
              {e.pay.has_salary ? (
                <>
                  Pays <span className="tabular font-semibold text-foreground">{format(e.pay.monthly_salary)}</span> for {e.pay.paid_days} of {e.pay.month_days} days
                  {e.pay.unpaid_leave_days ? `, ${plural(e.pay.unpaid_leave_days, "unpaid day")}` : ""}.
                </>
              ) : (
                <span className="font-semibold text-warning">No salary on file yet.</span>
              )}
            </p>
            {e.payslip_status === "draft" && (
              <p className={staleDraft ? "font-semibold text-warning" : "text-success"}>{staleDraft ? "The draft was filled before this change; refill it." : "The draft already matches."}</p>
            )}
            {!e.payslip_status && <p className="text-muted-foreground">No payslip yet; the draft will include this.</p>}
            {(e.payslip_status === "final" || e.payslip_status === "paid") && <p className="font-semibold text-warning">Its payslip is already {e.payslip_status}; reopen it to correct the figures.</p>}
            {e.later_finals > 0 && <p className="text-warning">{plural(e.later_finals, "later payslip is", "later payslips are")} already final too.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PayslipStatusBadge status={e.payslip_status} />
            {!e.pay.has_salary && (
              <Button asChild size="sm" className="h-9 rounded-xl">
                <Link to="/payroll/salaries">Set salary</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="h-9 rounded-xl">
              <Link to={e.payslip_id ? `/payroll/payslips/${e.payslip_id}` : `/payroll?month=${e.month.slice(0, 7)}`}>
                {e.payslip_id ? "Open payslip" : "Payroll sheet"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
