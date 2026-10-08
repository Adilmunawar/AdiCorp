import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format as fmt } from "date-fns";
import { AlertTriangle, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { StatusBadge, formatDate } from "@/components/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { monthDate, monthKey, shiftMonthKey, thisMonthKey } from "../lib/api";
import type { AttendanceSummary, MonthPay, PayslipStatus } from "../lib/types";

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function formatHours(h: number | null | undefined): string {
  const v = Number(h) || 0;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} h`;
}

/** 8 Oct 2026: the one day format payroll uses on screen, in PDFs and in exports. */
export function formatDay(value: string | Date | null | undefined, fallback = "—"): string {
  return formatDate(value, "d MMM yyyy", fallback);
}

/** 1 – 31 Oct 2026, the pay period of a month key. */
export function payPeriod(month: string, separator = " – "): string {
  const d = monthDate(month);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `1${separator}${fmt(last, "d MMM yyyy")}`;
}

/** A reference printed on the payslip: one per person and month, e.g. PS-202610-NOP0005. */
export function payslipRef(month: string, code: string | null | undefined, fallbackId?: string | null): string {
  const ym = month.slice(0, 7).replace("-", "");
  const who = (code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || (fallbackId ?? "").replace(/-/g, "").slice(0, 6).toUpperCase();
  return who ? `PS-${ym}-${who}` : `PS-${ym}`;
}

const STATUS_LABEL: Record<PayslipStatus, string> = { draft: "Draft", final: "Final", paid: "Paid" };

export function PayslipStatusBadge({ status, className }: { status: PayslipStatus | null | undefined; className?: string }) {
  if (!status) return <StatusBadge status="none" label="Not prepared" tone="neutral" className={className} />;
  return <StatusBadge status={status} label={STATUS_LABEL[status]} tone={status === "final" ? "primary" : undefined} className={className} />;
}

type NoticeTone = "info" | "warning" | "success" | "danger";

const noticeTone: Record<NoticeTone, string> = {
  info: "border-primary/20 bg-primary/[0.04] text-foreground",
  warning: "border-warning/30 bg-warning-soft text-foreground",
  success: "border-success/25 bg-success-soft text-foreground",
  danger: "border-destructive/25 bg-danger-soft text-foreground",
};
const noticeIcon: Record<NoticeTone, string> = { info: "text-primary", warning: "text-warning", success: "text-success", danger: "text-destructive" };

/** A one-line banner with an optional link, for things Finance should act on. */
export function Notice({ tone = "info", children, to, action, className }: { tone?: NoticeTone; children: ReactNode; to?: string; action?: string; className?: string }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-5 sm:flex-row sm:items-start sm:gap-2.5", noticeTone[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", noticeIcon[tone])} aria-hidden />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {to && action && (
        <Link to={to} className="inline-flex shrink-0 items-center gap-1 self-end whitespace-nowrap rounded-md py-0.5 text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto">
          {action}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Month picker bound to a yyyy-MM-01 key: previous and next buttons around a month grid.
 * Months after `max` (default this month) cannot be picked.
 */
export function MonthSwitch({ value, onChange, className, max }: { value: string; onChange: (key: string) => void; className?: string; max?: string }) {
  const [open, setOpen] = useState(false);
  const current = monthDate(value);
  const maxKey = max ?? thisMonthKey();
  const [year, setYear] = useState(current.getFullYear());
  useEffect(() => {
    if (open) setYear(monthDate(value).getFullYear());
  }, [open, value]);

  const prev = shiftMonthKey(value, -1);
  const next = shiftMonthKey(value, 1);
  const canNext = next <= maxKey;
  const maxYear = monthDate(maxKey).getFullYear();
  const thisMonth = thisMonthKey();
  const arrow =
    "flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9";

  return (
    <div role="group" aria-label="Month" className={cn("inline-flex h-10 items-stretch overflow-hidden rounded-xl border border-input/80 bg-background shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] sm:h-9", className)}>
      <button type="button" className={arrow} onClick={() => onChange(prev)} aria-label={`Previous month, ${fmt(monthDate(prev), "MMMM yyyy")}`} title="Previous month">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 border-x border-input/80 px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-[9.5rem] sm:flex-none"
            aria-label={`Choose month, ${fmt(current, "MMMM yyyy")} selected`}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{fmt(current, "MMMM yyyy")}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[17rem] rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setYear((y) => y - 1)} aria-label={`Show ${year - 1}`}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="tabular text-sm font-semibold">{year}</span>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" onClick={() => setYear((y) => y + 1)} disabled={year >= maxYear} aria-label={`Show ${year + 1}`}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((m, i) => {
              const key = monthKey(new Date(year, i, 1));
              const selected = key === value;
              const disabled = key > maxKey;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-9 rounded-lg text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35",
                    selected ? "bg-primary text-primary-foreground" : key === thisMonth ? "text-primary ring-1 ring-inset ring-primary/30 hover:bg-primary/[0.06]" : "text-foreground hover:bg-accent",
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {value !== thisMonth && thisMonth <= maxKey && (
            <button
              type="button"
              className="mt-2 h-8 w-full rounded-lg text-xs font-semibold text-primary hover:bg-primary/[0.06]"
              onClick={() => {
                onChange(thisMonth);
                setOpen(false);
              }}
            >
              Go to this month
            </button>
          )}
        </PopoverContent>
      </Popover>
      <button type="button" className={arrow} onClick={() => onChange(next)} disabled={!canNext} aria-label={`Next month, ${fmt(monthDate(next), "MMMM yyyy")}`} title={canNext ? "Next month" : "This is the latest month"}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Present, half, leave, absent in one short line. Reference only. */
export function AttendanceLine({ a, className }: { a: AttendanceSummary; className?: string }) {
  if (!a.working_days) return <span className={cn("text-muted-foreground", className)}>No working days yet</span>;
  const label = [
    `${a.present} present`,
    a.half ? `${a.half} half ${a.half === 1 ? "day" : "days"}` : null,
    a.leave ? `${a.leave} on leave` : null,
    a.absent ? `${a.absent} absent` : null,
    a.unmarked ? `${a.unmarked} unmarked` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span className={cn("tabular whitespace-nowrap", className)} title={`${label}, of ${plural(a.working_days, "working day")} so far`} aria-label={`Attendance: ${label}, of ${plural(a.working_days, "working day")} so far`}>
      <span className="font-semibold text-success">{a.present}P</span>
      {a.half ? <span className="text-warning"> · {a.half}H</span> : null}
      {a.leave ? <span className="text-info"> · {a.leave}L</span> : null}
      {a.absent ? <span className="text-destructive"> · {a.absent}A</span> : null}
      {a.unmarked ? <span className="text-muted-foreground"> · {a.unmarked} unmarked</span> : null}
      <span className="text-muted-foreground"> / {a.working_days}</span>
    </span>
  );
}

/** Why a month is a part month: joined, left, unpaid leave, salary changed. */
export function partMonthHint(pay: MonthPay): string {
  const short = (d: string) => formatDate(d, "d MMM");
  const parts = [
    pay.joined ? `joined ${short(pay.joined)}` : null,
    pay.left ? `left ${short(pay.left)}` : null,
    pay.unpaid_leave_days ? `${pay.unpaid_leave_days}d unpaid` : null,
    pay.salary_changed ? "salary changed" : null,
  ].filter(Boolean);
  return parts.join(" · ") || "part month";
}

/** Label + value row used in summaries. */
export function Row({ label, value, strong, muted, className }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-[13px]", className)}>
      <span className={cn("min-w-0", muted ? "text-muted-foreground" : "text-foreground/80")}>{label}</span>
      <span className={cn("tabular shrink-0 text-right", strong ? "font-bold text-foreground" : "font-medium text-foreground")}>{value}</span>
    </div>
  );
}

const FLOW: PayslipStatus[] = ["draft", "final", "paid"];

/**
 * Where a payslip is in Draft > Final > Paid, with the date each step happened.
 * Done steps carry a tick, the current one is filled, the rest are outlined; the words say it too.
 */
export function StatusFlow({
  status,
  preparedOn,
  finalOn,
  paidOn,
  className,
}: {
  status: PayslipStatus;
  preparedOn?: string | null;
  finalOn?: string | null;
  paidOn?: string | null;
  className?: string;
}) {
  const at = FLOW.indexOf(status);
  const steps = [
    { label: "Draft", hint: preparedOn ? `Prepared ${formatDay(preparedOn)}` : "Finance only" },
    { label: "Final", hint: at >= 1 ? (finalOn ? `Shown to employee ${formatDay(finalOn)}` : "Shown to employee") : "Employee sees it" },
    { label: "Paid", hint: at >= 2 ? (paidOn ? `Paid ${formatDay(paidOn)}` : "Paid") : "Payment recorded" },
  ];
  return (
    <ol className={cn("flex min-w-0 items-start", className)} aria-label="Payslip progress">
      {steps.map((s, i) => {
        const done = i < at || (i === at && status === "paid");
        const current = i === at;
        return (
          <li key={s.label} className="flex min-w-0 flex-1 items-start last:flex-none" aria-current={current ? "step" : undefined}>
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={cn(
                  "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  done ? "bg-success text-success-foreground" : current ? "bg-primary text-primary-foreground ring-4 ring-primary/15" : "border border-border bg-card text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[13px] font-semibold leading-5", current || done ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                  <span className="sr-only">{done ? " (done)" : current ? " (current)" : " (to do)"}</span>
                </span>
                <span className="block truncate text-[11px] leading-4 text-muted-foreground" title={s.hint}>
                  {s.hint}
                </span>
              </span>
            </div>
            {i < steps.length - 1 && <span className={cn("mx-2 mt-[10px] h-px min-w-[12px] flex-1 sm:mx-3", i < at ? "bg-success/50" : "bg-border")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ in words */

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function underThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  return parts.join(" ");
}

function wholeInWords(n: number): string {
  if (n === 0) return "zero";
  const groups: string[] = [];
  let rest = n;
  let scale = 0;
  while (rest > 0 && scale < SCALES.length) {
    const chunk = rest % 1000;
    if (chunk) groups.unshift(`${underThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    rest = Math.floor(rest / 1000);
    scale++;
  }
  return groups.join(" ");
}

const CURRENCY_WORDS: Record<string, [string, string]> = {
  PKR: ["Pakistani rupee", "Pakistani rupees"],
  INR: ["Indian rupee", "Indian rupees"],
  USD: ["US dollar", "US dollars"],
  EUR: ["euro", "euros"],
  GBP: ["pound sterling", "pounds sterling"],
  AED: ["UAE dirham", "UAE dirhams"],
  SAR: ["Saudi riyal", "Saudi riyals"],
  QAR: ["Qatari riyal", "Qatari riyals"],
  CAD: ["Canadian dollar", "Canadian dollars"],
  AUD: ["Australian dollar", "Australian dollars"],
};

/** 382602 PKR -> "Three hundred eighty-two thousand six hundred two Pakistani rupees only". */
export function amountInWords(amount: number, currency = "PKR"): string {
  const v = Math.abs(Number(amount) || 0);
  const whole = Math.floor(v + 1e-9);
  const cents = Math.round((v - whole) * 100);
  const [one, many] = CURRENCY_WORDS[currency.toUpperCase()] ?? [currency.toUpperCase(), currency.toUpperCase()];
  let text = `${wholeInWords(whole)} ${whole === 1 ? one : many}`;
  if (cents) text += ` and ${cents}/100`;
  text += " only";
  if (amount < 0) text = `minus ${text}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
