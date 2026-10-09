import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { SectionCard, formatDate, formatDateTime } from "@/components/kit";
import { CATEGORY_LABELS, METHOD_LABELS, costLine, monthlyCost, quoted, type ExpenseFile, type ExpensePayment, type ExpenseRow } from "../kinds";
import { Facts, Quote } from "./bits";
import { FileButton, FileList } from "./FileList";
import { ProgressTimeline } from "./ProgressTimeline";

/** The request / details card, shared by the staff and portal detail pages. */
export function DetailsCard({ x, money, currency, showWho = true }: { x: ExpenseRow; money?: (n: number) => string; currency: string; showWho?: boolean }) {
  const perMonth = money && x.billing !== "once" ? monthlyCost(x, currency) : null;
  const dates = [x.start_date ? formatDate(x.start_date) : "", x.end_date ? formatDate(x.end_date) : ""].filter(Boolean).join(" to ");
  return (
    <SectionCard title={x.source === "request" ? "The request" : "Details"}>
      <Facts
        items={[
          showWho && {
            label: "For",
            value: x.employee ? `${x.employee.name}${x.employee.department?.name ? `, ${x.employee.department.name}` : ""}` : x.employee_id ? "" : "Whole company",
          },
          { label: "Kind", value: CATEGORY_LABELS[x.category] },
          { label: x.category === "course" ? "Offered by" : "Provider", value: x.provider },
          {
            label: "Link",
            value: x.link ? (
              <a href={x.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-2 hover:underline">
                <span className="truncate">{x.link.replace(/^https?:\/\//, "").slice(0, 60)}</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </a>
            ) : (
              ""
            ),
          },
          { label: "Cost", value: <span className="tabular">{costLine(x)}</span> },
          !!money &&
            x.billing !== "once" && {
              label: "Monthly cost",
              value: perMonth !== null ? <span className="tabular">about {money(perMonth)}</span> : `Known after the first ${currency} payment`,
            },
          !!dates && { label: "Dates", value: <span className="tabular">{dates}</span> },
          x.reimburse && { label: "Reimbursement", value: <span className="font-semibold text-warning">Paid by the employee, to be reimbursed</span> },
          { label: x.source === "request" ? "Asked" : "Added", value: x.requested_by_name ? `${x.requested_by_name} · ${formatDateTime(x.created_at)}` : formatDateTime(x.created_at) },
        ]}
      />
      {(x.purpose || x.benefit) && (
        <div className="mt-4 grid gap-3">
          {x.purpose && <Quote label={x.source === "request" ? "What they will do with it" : "Notes"} text={x.purpose} />}
          {x.benefit && <Quote label="How it helps the company" text={x.benefit} />}
        </div>
      )}
    </SectionCard>
  );
}

export function ProgressCard({ x, money, currency }: { x: ExpenseRow; money?: (n: number) => string; currency?: string }) {
  return (
    <SectionCard title="Progress">
      <ProgressTimeline x={x} money={money} currency={currency} />
    </SectionCard>
  );
}

export function PaymentsCard({
  payments,
  files,
  money,
  total,
  onOpen,
  undo,
  undoId,
}: {
  payments: ExpensePayment[];
  files: ExpenseFile[];
  money: (n: number) => string;
  /** "USD 360 in all (PKR 101,000)" or "PKR 101,000 in all": see paidTotalLabel. */
  total: string;
  onOpen: (path: string) => void;
  /** Rendered next to the payment it undoes (Finance's undo). */
  undo?: ReactNode;
  /** The payment `undo` acts on: the one recorded last, which is not always the latest paid day. */
  undoId?: string;
}) {
  if (!payments.length) return null;
  return (
    <SectionCard title="Payments" description={total} flush>
      <ul className="divide-y divide-border/60">
        {payments.map((p, i) => {
          const receipts = files.filter((f) => f.payment_id === p.id);
          return (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="tabular text-sm font-bold text-foreground">
                  {money(p.amount)}
                  {p.quoted_amount != null && p.quoted_currency && <span className="ml-1.5 text-xs font-medium text-muted-foreground">= {quoted(p.quoted_amount, p.quoted_currency)}</span>}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(p.paid_on)} · {METHOD_LABELS[p.method]}
                  {p.reference && <> · <span className="tabular">{p.reference}</span></>}
                  {p.created_by_name && <> · by {p.created_by_name}</>}
                </p>
                {p.note && <p className="mt-0.5 text-xs text-foreground/80">{p.note}</p>}
                {receipts.map((f) => (
                  <FileButton key={f.id} file={f} onOpen={onOpen} label="Receipt" />
                ))}
              </div>
              {(undoId ? p.id === undoId : i === 0) && undo}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

export function FilesCard({ files, onOpen }: { files: ExpenseFile[]; onOpen: (path: string) => void }) {
  const loose = files.filter((f) => !f.payment_id);
  if (!loose.length) return null;
  return (
    <SectionCard title="Files">
      <FileList files={loose} onOpen={onOpen} />
    </SectionCard>
  );
}
