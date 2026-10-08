import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Hourglass, Loader2, Lock, Sparkles, Timer, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  ConfirmButton,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SectionCard,
  StatGrid,
  StatTile,
  StatusBadge,
  TableSkeleton,
  TabsNav,
  formatDate,
  formatDateTime,
  formatMonth,
  initials,
  useMoney,
  useTabParam,
  type DataColumn,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { errorMessage, useMonthParam, useOvertimePay, usePriceOvertime, usePriceWaiting } from "../lib/api";
import { MAX_HOURLY_RATE, MAX_MULTIPLIER, MAX_OVERTIME_AMOUNT, OVERTIME_TYPE_LABEL, overtimeAmount, parseAmount, round2 } from "../lib/calc";
import type { OvertimePayRow, PriceKind } from "../lib/types";
import { MonthSwitch, Notice, formatDay, formatHours, plural } from "../components/bits";
import { useWidth } from "../components/useWidth";

const PAYSLIP_LABEL: Record<string, string> = { draft: "Draft", final: "Final", paid: "Paid" };

const TABS = [
  { value: "waiting", label: "To price" },
  { value: "ready", label: "Priced" },
  { value: "month", label: "By month" },
];

export default function OvertimePayPage() {
  const [tab, setTab] = useTabParam(TABS);
  const scope = tab as "waiting" | "ready" | "month";
  const [month, setMonth] = useMonthParam();
  const q = useOvertimePay(scope, month);
  const priceAll = usePriceWaiting();
  const { format } = useMoney();
  const [search, setSearch] = useState("");
  const [pricing, setPricing] = useState<OvertimePayRow | null>(null);
  const [wrapRef, width] = useWidth<HTMLDivElement>();

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = q.data?.rows ?? [];
    return s ? list.filter((r) => [r.employee_name, r.employee_code, r.department, r.reason].some((v) => (v ?? "").toLowerCase().includes(s))) : list;
  }, [q.data, search]);
  const counts = q.data?.counts;
  // "Price all" prices every waiting entry on the server, whatever the search shows, so it counts them all.
  const suggestable = scope === "waiting" ? (q.data?.rows ?? []).filter((r) => r.suggested_rate > 0 && r.suggested_amount > 0) : [];
  const suggestedTotal = suggestable.reduce((s, r) => s + r.suggested_amount, 0);

  const columns: DataColumn<OvertimePayRow>[] = [
    {
      id: "employee",
      header: "Employee",
      className: "min-w-[170px]",
      cell: (r) => (
        <div className="flex min-w-0 items-start gap-2.5">
          {width >= 760 && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/[0.08] text-[11px] font-bold text-primary" aria-hidden>
              {initials(r.employee_name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold" title={r.employee_name}>
              {r.employee_name}
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground" title={[r.employee_code, r.rank, r.department].filter(Boolean).join(" · ")}>
              {[r.employee_code, r.rank, r.department].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "when",
      header: "Worked",
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p className="tabular">{formatDay(r.date)}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatHours(r.hours)} · {OVERTIME_TYPE_LABEL[r.overtime_type] ?? r.overtime_type}
          </p>
        </div>
      ),
    },
    ...(width >= 900
      ? [
          {
            id: "reason",
            header: "Reason",
            cell: (r: OvertimePayRow) => (
              <div className="max-w-[240px]">
                <p className="line-clamp-2 text-[12.5px] text-foreground/80" title={r.reason ?? undefined}>
                  {r.reason || "—"}
                </p>
                {r.reviewer_name && (
                  <p className="text-[11px] text-muted-foreground" title={r.reviewed_at ? formatDateTime(r.reviewed_at) : undefined}>
                    Approved by {r.reviewer_name}
                  </p>
                )}
              </div>
            ),
          } as DataColumn<OvertimePayRow>,
        ]
      : []),
    ...(width >= 700
      ? [
          {
            id: "suggested",
            header: "Suggested",
            align: "right",
            cell: (r: OvertimePayRow) =>
              r.suggested_rate > 0 ? (
                <div className="tabular whitespace-nowrap">
                  <p>{format(r.suggested_amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(r.suggested_rate)}/h × {r.suggested_multiplier}
                  </p>
                </div>
              ) : (
                <span className="text-[11px] font-semibold text-warning">No salary on file</span>
              ),
          } as DataColumn<OvertimePayRow>,
        ]
      : []),
    {
      id: "pay",
      header: "Pay",
      align: "right",
      cell: (r) => (
        <div className="sm:whitespace-nowrap">
          {r.pay_status === "unpriced" && <StatusBadge status="pending" label="To price" />}
          {r.pay_status === "no_pay" && <StatusBadge status="cancelled" label="No pay" />}
          {r.pay_status === "priced" && (
            <>
              <p className="tabular font-semibold">{format(r.amount)}</p>
              <p className="text-[11px] text-muted-foreground">{r.hourly_rate ? `${format(r.hourly_rate)}/h × ${r.multiplier}` : "Fixed amount"}</p>
            </>
          )}
          {r.payslip_month ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {r.locked && <Lock className="mr-0.5 inline h-3 w-3" aria-hidden />}
              {formatDate(r.payslip_month, "MMM yyyy")} payslip{r.payslip_status ? ` · ${PAYSLIP_LABEL[r.payslip_status]}` : ""}
            </p>
          ) : r.pay_status === "priced" ? (
            <p className="mt-0.5 text-[11px] text-info">Next draft payslip</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <Button size="sm" variant={r.pay_status === "unpriced" ? "default" : "outline"} className="h-9 rounded-xl sm:h-8" disabled={r.locked} onClick={() => setPricing(r)} title={r.locked ? "On a final payslip: reopen it to change the price" : undefined} aria-label={`${r.pay_status === "unpriced" ? "Price" : "Change the price of"} ${r.employee_name}'s overtime on ${formatDay(r.date)}`}>
          {r.pay_status === "unpriced" ? "Price" : r.locked ? "Locked" : "Change"}
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Pay"
        title="Overtime pay"
        icon={Timer}
        description="Price overtime HR has approved. Priced hours go onto the next draft payslip."
      />

      <StatGrid columns={3}>
        <StatTile label="To price" value={counts?.waiting ?? 0} icon={Clock} loading={q.isLoading} tone={counts?.waiting ? "warning" : "default"} hint={counts ? (counts.waiting ? `${formatHours(counts.waiting_hours)} approved, waiting for a rate` : "Nothing waiting") : undefined} />
        <StatTile label="Priced, not yet final" value={format(counts?.ready_amount ?? 0)} icon={Wallet} loading={q.isLoading} hint={counts ? `${plural(counts.ready, "entry", "entries")} for the next payslips` : undefined} />
        <StatTile label="Pending with HR" value={counts?.pending_with_hr ?? 0} icon={Hourglass} loading={q.isLoading} hint="Requests HR has not approved yet" className="col-span-2 lg:col-span-1" />
      </StatGrid>

      <SectionCard className="mt-4" flush>
        <div className="space-y-3 border-b border-border/60 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TabsNav tabs={TABS.map((t) => (t.value === "waiting" ? { ...t, badge: counts?.waiting } : t))} value={tab} onChange={setTab} />
            {scope === "month" && <MonthSwitch value={month} onChange={setMonth} />}
          </div>
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name, code, reason…" actions={
            scope === "waiting" && suggestable.length > 0 ? (
              <ConfirmButton
                size="sm"
                className="h-9 rounded-lg"
                destructive={false}
                title={`Price ${plural(suggestable.length, "entry", "entries")} at the suggested rates?`}
                description={`${format(suggestedTotal)} in all. You can change any of them afterwards. Entries of people with no salary on file are left for you to price by hand.`}
                confirmLabel="Price them"
                onConfirm={async () => {
                  try {
                    const r = await priceAll.mutateAsync();
                    toast.success(`Priced ${plural(r.priced, "entry", "entries")}, ${format(r.amount)} in all.${r.skipped ? ` ${plural(r.skipped, "entry was", "entries were")} left to price by hand.` : ""}`);
                  } catch (e) {
                    toast.error(errorMessage(e));
                    throw e;
                  }
                }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Price all (suggested)
              </ConfirmButton>
            ) : undefined
          } />
        </div>
        {q.isError && <Notice tone="danger" className="m-4">{errorMessage(q.error)}</Notice>}
        <div ref={wrapRef} className="min-w-0">
        {q.isLoading ? (
          <TableSkeleton rows={6} columns={5} className="rounded-none border-0 shadow-none" />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            pageSize={30}
            caption="Approved overtime"
            empty={
              q.isError ? (
                <EmptyState icon={Timer} title="Overtime could not load" description="Reload the page to try again." />
              ) : scope === "waiting" ? (
                <EmptyState icon={Timer} title="Nothing to price" description="Every approved entry has a price. New ones appear here as HR approves them." />
              ) : scope === "ready" ? (
                <EmptyState icon={Timer} title="No priced overtime" description="Priced entries stay here until a final payslip carries them." />
              ) : (
                <EmptyState icon={Timer} title={`No approved overtime in ${formatMonth(month)}`} description="Entries appear here once HR approves the hours." />
              )
            }
          />
        )}
        </div>
      </SectionCard>

      <p className="mt-3 text-[11px] text-muted-foreground">
        The suggestion uses the rules on <Link to="/payroll/rules" className="font-semibold text-primary hover:underline">Tax & structure</Link> and the salary in force on the day worked.
      </p>

      <PriceDialog row={pricing} onClose={() => setPricing(null)} />
    </div>
  );
}

function PriceDialog({ row, onClose }: { row: OvertimePayRow | null; onClose: () => void }) {
  const { format } = useMoney();
  const price = usePriceOvertime();
  const [kind, setKind] = useState<Exclude<PriceKind, "unpriced">>("rate");
  const [rate, setRate] = useState("");
  const [mult, setMult] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!row) return;
    const priced = row.pay_status === "priced";
    setKind(row.pay_status === "no_pay" ? "no_pay" : priced && !row.hourly_rate ? "fixed" : "rate");
    setRate(String(priced && row.hourly_rate ? row.hourly_rate : row.suggested_rate || ""));
    setMult(String(priced && row.hourly_rate ? row.multiplier : row.suggested_multiplier));
    setAmount(priced ? String(row.amount) : String(row.suggested_amount || ""));
  }, [row]);

  if (!row) return null;
  const r = parseAmount(rate);
  const m = parseAmount(mult);
  const a = parseAmount(amount);
  let error: string | null = null;
  let total = 0;
  if (kind === "rate") {
    if (Number.isNaN(r) || !(r > 0 && r < MAX_HOURLY_RATE)) error = "The hourly rate must be more than 0 and below 1,000,000.";
    else if (Number.isNaN(m) || !(m > 0 && m <= MAX_MULTIPLIER)) error = `The multiplier must be more than 0 and at most ${MAX_MULTIPLIER}.`;
    else {
      total = overtimeAmount(row.hours, round2(r), round2(m));
      if (total <= 0) error = "That rate gives less than one whole unit. Use a higher rate, a fixed amount, or no pay.";
    }
  } else if (kind === "fixed") {
    if (Number.isNaN(a) || !(Math.round(a) >= 1 && Math.round(a) < MAX_OVERTIME_AMOUNT)) error = "The amount must be a whole number, at least 1 and below 10,000,000.";
    else total = Math.round(a);
  }

  const submit = async (k: PriceKind) => {
    try {
      const res = await price.mutateAsync({ id: row.id, kind: k, rate: round2(r), multiplier: round2(m), amount: Math.round(a) });
      toast.success(
        k === "unpriced"
          ? "Price cleared; the entry is waiting for a rate again."
          : k === "no_pay"
            ? "Marked as not paid. It stays on record and off the payslip."
            : `Priced at ${format(res.amount)}.${res.on_draft ? " The draft that carries it now needs a refill." : " It goes onto the next draft payslip."}`,
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && !price.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Price {row.employee_name}'s overtime</DialogTitle>
          <DialogDescription>
            {formatDay(row.date)} · {formatHours(row.hours)} · {OVERTIME_TYPE_LABEL[row.overtime_type] ?? row.overtime_type}
            {row.reason ? ` · ${row.reason}` : ""}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={kind} onValueChange={(v) => setKind(v as typeof kind)} className="gap-2">
          {(
            [
              ["rate", "Hourly rate × multiplier", row.suggested_rate ? `Suggested ${format(row.suggested_rate)}/h × ${row.suggested_multiplier} = ${format(row.suggested_amount)}` : "No salary on file, so no suggestion."],
              ["fixed", "A fixed amount", "For a flat payment agreed for the work."],
              ["no_pay", "No pay", "Approved, but not paid: time off in lieu, or not paid by decision. It stays on record and off the payslip."],
            ] as const
          ).map(([value, title, hint]) => (
            <label key={value} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", kind === value ? "border-primary/40 bg-primary/[0.04]" : "border-border")}>
              <RadioGroupItem value={value} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{title}</span>
                <span className="block text-[11.5px] text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {kind === "rate" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ot-rate" className="micro-label">
                Rate an hour
              </Label>
              <Input id="ot-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="tabular h-10 rounded-xl text-right" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-mult" className="micro-label">
                Multiplier
              </Label>
              <Input id="ot-mult" inputMode="decimal" value={mult} onChange={(e) => setMult(e.target.value)} className="tabular h-10 rounded-xl text-right" />
            </div>
          </div>
        )}
        {kind === "fixed" && (
          <div className="space-y-1.5">
            <Label htmlFor="ot-amount" className="micro-label">
              Amount
            </Label>
            <Input id="ot-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular h-10 rounded-xl text-right" />
          </div>
        )}
        {kind !== "no_pay" && (
          <div className="flex items-baseline justify-between rounded-xl bg-primary/[0.06] px-3 py-2.5">
            <span className="micro-label text-primary">Pays</span>
            <span className="tabular text-lg font-bold text-primary">{error ? "—" : format(total)}</span>
          </div>
        )}
        {error && kind !== "no_pay" && (
          <p className="text-[12px] text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {row.pay_status !== "unpriced" ? (
            <Button variant="ghost" className="rounded-xl" disabled={price.isPending} onClick={() => submit("unpriced")}>
              Clear price
            </Button>
          ) : (
            <span />
          )}
          <Button className="rounded-xl" disabled={price.isPending || (kind !== "no_pay" && !!error)} onClick={() => submit(kind)}>
            {price.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
