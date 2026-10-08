import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarRange, Loader2, Plane, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CardSkeleton, ConfirmButton, EmptyState, PageHeader, SectionCard, StatusBadge, formatRelative, toDbDate, useDebouncedValue } from "@/components/kit";
import { cn } from "@/lib/utils";
import { usePortalCancelLeave, usePortalLeave, usePortalLeaveCountDays, usePortalRequestLeave } from "../../portal-api";
import { calendarDays, dayWord, leaveWhen, trimNumber, yearOptions } from "../../lib";
import type { PortalLeaveBalance } from "../../types";
import { BalanceBar } from "../../components/shared";

function BalanceCard({ b }: { b: PortalLeaveBalance }) {
  const low = !b.unlimited && (b.remaining ?? 0) <= 2;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="micro-label truncate text-muted-foreground">{b.type_name}</p>
        {!b.is_paid && <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">Unpaid</span>}
      </div>
      {b.unlimited ? (
        <>
          <p className="mt-1 text-xl font-bold tracking-tight tabular">{trimNumber(b.used)}</p>
          <p className="text-[11px] text-muted-foreground">days used · no yearly limit</p>
        </>
      ) : (
        <>
          <p className={cn("mt-1 text-xl font-bold tracking-tight tabular", low && "text-destructive")}>
            {trimNumber(b.remaining)}
            <span className="text-sm font-medium text-muted-foreground"> / {trimNumber(b.allowed)}</span>
          </p>
          <p className="mb-2 text-[11px] text-muted-foreground">days left</p>
          <BalanceBar allowed={b.allowed} used={b.used} />
        </>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground tabular">
        {trimNumber(b.used)} used{b.pending > 0 ? ` · ${trimNumber(b.pending)} pending` : ""}
      </p>
    </div>
  );
}

export default function MyLeavePage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const query = usePortalLeave(year);
  const request = usePortalRequestLeave();
  const cancel = usePortalCancelLeave();
  const data = query.data;
  const today = data?.today ?? toDbDate();

  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!start && data?.today) {
      setStart(data.today);
      setEnd(data.today);
    }
  }, [data?.today, start]);

  const range = useDebouncedValue(`${start}|${end}`, 250);
  const [dStart, dEnd] = range.split("|");
  const count = usePortalLeaveCountDays(dStart, dEnd);
  const span = calendarDays(start, end);
  const selectedBalance = useMemo(() => data?.balances.find((b) => b.leave_type_id === typeId) ?? null, [data?.balances, typeId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!typeId) return setError("Pick a leave type.");
    if (!start || !end) return setError("Pick a start and an end date.");
    if (end < start) return setError("The end date is before the start date.");
    try {
      await request.mutateAsync({ leaveTypeId: typeId, start, end, reason: reason.trim() });
      setReason("");
      setTypeId("");
    } catch {
      /* shown as a toast */
    }
  };

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Self-service"
        title="My leave"
        description="Your balances, a new request and everything you have asked for."
        icon={Plane}
        actions={
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-[110px] rounded-xl" aria-label="Year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {query.isLoading || query.isPlaceholderData ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : data && data.balances.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.balances.map((b) => (
            <BalanceCard key={b.leave_type_id} b={b} />
          ))}
        </div>
      ) : (
        <SectionCard>
          <EmptyState compact icon={Plane} title="No leave types yet" description="HR has not set up leave types. Ask HR if you need time off." />
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <SectionCard title="Request leave" description={data?.requires_approval === false ? "Approved straight away: no HR approval is needed." : "HR reviews it and you are notified."} icon={Send}>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="my-leave-type">Leave type</Label>
              <Select value={typeId} onValueChange={setTypeId} disabled={!data?.types.length}>
                <SelectTrigger id="my-leave-type" className="h-10 rounded-xl">
                  <SelectValue placeholder="Pick a leave type" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.types ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.is_paid ? "" : " · unpaid"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBalance && !selectedBalance.unlimited && (
                <p className={cn("text-[11px]", (selectedBalance.remaining ?? 0) <= 2 ? "text-destructive" : "text-muted-foreground")}>
                  {dayWord(selectedBalance.remaining ?? 0)} left in {data?.year ?? year}.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="my-leave-start">From</Label>
                <Input
                  id="my-leave-start"
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (!end || end < e.target.value) setEnd(e.target.value);
                  }}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="my-leave-end">To</Label>
                <Input id="my-leave-end" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-xl" />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs" aria-live="polite">
              <CalendarRange className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {span === 0 ? (
                <span className="text-muted-foreground">Pick a valid range.</span>
              ) : count.isError ? (
                <span className="text-muted-foreground">{dayWord(span)} picked. Weekends and holidays are not counted.</span>
              ) : count.data === undefined ? (
                <span className="text-muted-foreground">Counting your working days…</span>
              ) : count.data === 0 ? (
                <span className="text-warning">Every day in that range is a weekend or holiday for you.</span>
              ) : (
                <span>
                  <strong className="tabular">{dayWord(count.data)}</strong> of leave ({dayWord(span)} picked; weekends and holidays are not counted).
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-leave-reason">Reason (optional)</Label>
              <Textarea id="my-leave-reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} className="resize-none rounded-xl" />
            </div>
            {error && (
              <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full rounded-xl" disabled={request.isPending || !data?.types.length}>
              {request.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Send request
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">Leave can start at most 30 days back. Today is {leaveWhen(today, today)}.</p>
          </form>
        </SectionCard>

        <SectionCard title="My requests" description={`${year} and anything still pending`} flush>
          {query.isLoading || query.isPlaceholderData ? (
            <div className="p-4">
              <CardSkeleton />
            </div>
          ) : requests.length === 0 ? (
            <EmptyState compact icon={Plane} title="No requests yet" description="Requests you send appear here with HR's decision." />
          ) : (
            <ul className="divide-y divide-border/60">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{r.type_name}</p>
                      <StatusBadge status={r.status} />
                      {!r.is_paid && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">Unpaid</span>}
                    </div>
                    <p className="text-xs text-foreground tabular">
                      {leaveWhen(r.start_date, r.end_date)} · {dayWord(r.days_count)}
                    </p>
                    {r.reason && <p className="line-clamp-2 text-[11px] text-muted-foreground">{r.reason}</p>}
                    {r.review_notes && (
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">HR:</span> {r.review_notes}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {r.filed_by_hr ? "Filed by HR" : "Sent"} {formatRelative(r.created_at)}
                    </p>
                  </div>
                  {r.status === "pending" && (
                    <ConfirmButton
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 self-start rounded-lg"
                      title="Cancel this request?"
                      description={`${r.type_name}, ${leaveWhen(r.start_date, r.end_date)}. You can send a new one any time.`}
                      confirmLabel="Cancel request"
                      destructive
                      onConfirm={() => cancel.mutateAsync({ id: r.id })}
                    >
                      Cancel
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
