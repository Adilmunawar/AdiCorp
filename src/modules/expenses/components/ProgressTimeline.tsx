import { formatDate, formatDateTime } from "@/components/kit";
import { cn } from "@/lib/utils";
import { quoted, type ExpenseRow } from "../kinds";

type Tone = "danger" | "primary" | "warning" | "success" | undefined;

interface Step {
  when: string | null;
  title: string;
  body?: string;
  tone?: Tone;
  pending?: boolean;
}

const DOT: Record<NonNullable<Tone>, string> = {
  danger: "bg-destructive",
  primary: "bg-primary",
  warning: "bg-warning",
  success: "bg-success",
};

/**
 * Who did what, in order. `money` adds what was paid (Finance and the employee);
 * HR sees that it was paid and when, not how much.
 */
export function ProgressTimeline({ x, money, currency }: { x: ExpenseRow; money?: (amount: number) => string; currency?: string }) {
  const steps: Step[] = [];
  steps.push({
    when: x.created_at,
    title: x.source === "request" ? `Asked by ${x.requested_by_name ?? x.employee?.name ?? "the employee"}` : `Added by ${x.requested_by_name ?? "Finance"}`,
  });
  if (x.status === "withdrawn") steps.push({ when: x.updated_at, title: "Withdrawn by the employee" });
  if (x.source === "request") {
    if (x.hr_at) {
      const rejected = x.status === "rejected";
      steps.push({
        when: x.hr_at,
        title: rejected ? `Not approved by ${x.hr_by_name ?? "HR"}` : `Approved by ${x.hr_by_name ?? "HR"}`,
        body: x.hr_note || undefined,
        tone: rejected ? "danger" : "primary",
      });
    } else if (x.status === "pending") {
      steps.push({ when: null, title: "Waiting for HR", tone: "warning", pending: true });
    }
  }
  if (x.status === "approved") steps.push({ when: null, title: "Waiting for Finance to pay", tone: "warning", pending: true });
  if (x.status === "declined") steps.push({ when: x.finance_at, title: `Declined by ${x.finance_by_name ?? "Finance"}`, body: x.finance_note || undefined, tone: "danger" });
  if (x.payments_count > 0) {
    // Only the lead word changes case mid-sentence; the date keeps its "12 Oct 2026" form.
    const renewalDay = x.renews_on ? formatDate(x.renews_on) : "";
    steps.push({
      when: x.last_paid_on,
      title: x.billing === "once" ? (x.payments_count > 1 ? `Paid in ${x.payments_count} instalments` : "Paid") : `Paid ${x.payments_count} ${x.payments_count === 1 ? "time" : "times"}`,
      body:
        money && x.paid_total !== undefined
          ? `${x.paid_quoted_total != null && currency && x.currency !== currency ? `${quoted(x.paid_quoted_total, x.currency)} in all (${money(x.paid_total)})` : `${money(x.paid_total)} in all`}${renewalDay ? `; next renewal ${renewalDay}` : ""}`
          : renewalDay
            ? `Next renewal ${renewalDay}`
            : undefined,
      tone: "success",
    });
  }
  if (x.status === "ended") steps.push({ when: x.ended_on, title: "Subscription ended" });
  if (x.completed_at) steps.push({ when: x.completed_at, title: "Course completed", body: x.outcome || undefined, tone: "success" });

  return (
    <ol className="relative ml-1.5 grid gap-4 border-l border-border pl-5">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card",
              s.tone ? DOT[s.tone] : "bg-muted-foreground/40",
              s.pending && "animate-pulse motion-reduce:animate-none",
            )}
            aria-hidden
          />
          <p className="text-[13px] font-semibold text-foreground">{s.title}</p>
          {s.when && <p className="tabular text-[11px] text-muted-foreground">{s.when.length > 10 ? formatDateTime(s.when) : formatDate(s.when)}</p>}
          {s.body && <p className="mt-1 whitespace-pre-line text-xs leading-5 text-foreground/80 [overflow-wrap:anywhere]">{s.body}</p>}
        </li>
      ))}
    </ol>
  );
}
