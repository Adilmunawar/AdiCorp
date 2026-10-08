import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { BadgeCheck, Hourglass, Loader2, Send, Timer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSkeleton, ConfirmButton, EmptyState, PageHeader, SectionCard, StatGrid, StatTile, StatusBadge, formatDate, toDate, toDbMonth } from "@/components/kit";
import { usePortalClaimOvertime, usePortalOvertime, usePortalWithdrawOvertime } from "../../portal-api";
import { OVERTIME_TYPE_LABELS, hoursLabel, payStageInfo, trimNumber } from "../../lib";
import type { OvertimeType } from "../../types";
import { HOURS_ERROR, OvertimeFields, parseHours } from "../../components/OvertimeDialogs";
import { MonthNav } from "../../components/shared";

export default function MyOvertimePage() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const query = usePortalOvertime(toDbMonth(month));
  const claim = usePortalClaimOvertime();
  const withdraw = usePortalWithdrawOvertime();
  const data = query.data;
  const today = data?.today ?? format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState("");
  const [hours, setHours] = useState("2");
  const [type, setType] = useState<OvertimeType>("regular");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date && data?.today) setDate(data.today);
  }, [data?.today, date]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const h = parseHours(hours);
    if (!date) return setError("Pick the date the overtime was worked.");
    if (date > today) return setError("Overtime is recorded after it is worked; the date cannot be in the future.");
    if (h === null) return setError(HOURS_ERROR);
    try {
      await claim.mutateAsync({ date, hours: h, type, reason: reason.trim() });
      setReason("");
      setHours("2");
    } catch {
      /* shown as a toast */
    }
  };

  const s = data?.summary;
  const records = data?.records ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Self-service"
        title="My overtime"
        description="Claim extra hours. HR approves the hours; approved overtime is paid with your salary."
        icon={Timer}
        actions={<MonthNav month={month} max={toDate(today) ?? new Date()} today={today} onChange={setMonth} />}
      />

      <StatGrid columns={3}>
        <StatTile
          label="Approved"
          value={hoursLabel(s?.approved_hours ?? 0)}
          hint={`${s?.approved_count ?? 0} ${s?.approved_count === 1 ? "entry" : "entries"}`}
          tone="success"
          icon={BadgeCheck}
          loading={query.isLoading || query.isPlaceholderData}
        />
        <StatTile
          label="Pending"
          value={hoursLabel(s?.pending_hours ?? 0)}
          hint={s?.pending_count ? "With HR" : "All clear"}
          tone={s?.pending_count ? "warning" : "default"}
          icon={Hourglass}
          loading={query.isLoading || query.isPlaceholderData}
        />
        <StatTile
          label="Paid"
          value={s?.paid_count ?? 0}
          hint={s?.paid_count === 1 ? "Entry on a payslip" : "Entries on a payslip"}
          tone="primary"
          icon={Wallet}
          loading={query.isLoading || query.isPlaceholderData}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <SectionCard title="Claim overtime" description="Hours in halves, up to 16 for one day." icon={Send}>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <OvertimeFields
              idPrefix="my-ot"
              date={date}
              setDate={setDate}
              hours={hours}
              setHours={setHours}
              type={type}
              setType={setType}
              reason={reason}
              setReason={setReason}
              maxDate={today}
            />
            {error && (
              <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full rounded-xl" disabled={claim.isPending}>
              {claim.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Send claim
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title={`Overtime in ${format(month, "MMMM yyyy")}`}
          description={query.isLoading || query.isPlaceholderData ? "Loading…" : `${trimNumber(s?.total ?? 0)} ${s?.total === 1 ? "entry" : "entries"}`}
          flush
        >
          {query.isLoading || query.isPlaceholderData ? (
            <div className="p-4">
              <CardSkeleton />
            </div>
          ) : records.length === 0 ? (
            <EmptyState compact icon={Timer} title="No overtime this month" description="Claims you send and hours HR records for you appear here." />
          ) : (
            <ul className="divide-y divide-border/60">
              {records.map((r) => {
                const stage = payStageInfo(r.pay_stage, r.payslip_month);
                return (
                  <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold tabular">{formatDate(r.date, "EEE d MMM")}</p>
                        <StatusBadge status={r.status} />
                        {stage && <StatusBadge status={r.pay_stage} label={stage.label} tone={stage.tone} dot={false} />}
                      </div>
                      <p className="text-xs tabular">
                        <strong>{hoursLabel(r.hours)}</strong> · {OVERTIME_TYPE_LABELS[r.overtime_type] ?? r.overtime_type}
                        {r.claimed_hours !== null && r.claimed_hours !== r.hours && <span className="text-muted-foreground"> · you claimed {hoursLabel(r.claimed_hours)}</span>}
                      </p>
                      {r.reason && <p className="line-clamp-2 text-[11px] text-muted-foreground">{r.reason}</p>}
                      {r.review_notes && (
                        <p className="text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">HR:</span> {r.review_notes}
                        </p>
                      )}
                      {r.filed_by_hr && <p className="text-[11px] text-muted-foreground">Recorded by HR</p>}
                    </div>
                    {r.status === "pending" && !r.locked && (
                      <ConfirmButton
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 self-start rounded-lg"
                        title="Withdraw this claim?"
                        description={`${hoursLabel(r.hours)} on ${formatDate(r.date, "d MMM yyyy")} is removed.`}
                        confirmLabel="Withdraw"
                        destructive
                        onConfirm={() => withdraw.mutateAsync({ id: r.id })}
                      >
                        Withdraw
                      </ConfirmButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
