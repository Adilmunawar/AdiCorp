import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { SectionCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { checkFile, type EmployeeOption } from "../api";
import {
  BILLING_LABELS,
  CATEGORY_LABELS,
  DATE_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_LIMITS as L,
  PROMPTS,
  checkExpense,
  checkPayment,
  emptyExpenseInput,
  quoteCurrencies,
  toRpcInput,
  todayIso,
  type Billing,
  type ExpenseCategory,
  type ExpenseInput,
  type PaymentInput,
} from "../kinds";
import { CATEGORY_ICONS, FieldLabel, FilePicker, FormError } from "./bits";
import { PaymentFields, emptyPayment } from "./PaymentFields";

export interface ExpenseFormResult {
  input: Record<string, unknown>;
  employeeId: string | null;
  tell: boolean;
  payment: Record<string, unknown> | null;
  quote: File | null;
  receipt: File | null;
}

const COMPANY = "company";

/**
 * The one form for asking (an employee, from the portal) and for recording
 * (Finance). The questions follow the kind chosen; Finance also picks who it is
 * for and can record that it is already paid.
 */
export function ExpenseForm({
  mode,
  currency,
  employees = [],
  preselect,
  submitting,
  onSubmit,
  onCancel,
  today = todayIso(),
}: {
  mode: "request" | "finance";
  currency: string;
  /** The company's today, for the payment date (Finance). */
  today?: string;
  employees?: EmployeeOption[];
  preselect?: string;
  submitting: boolean;
  onSubmit: (r: ExpenseFormResult) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const finance = mode === "finance";
  const [v, setV] = useState<ExpenseInput>(() => emptyExpenseInput(currency));
  const [who, setWho] = useState<string>(preselect ?? "");
  const [tell, setTell] = useState(true);
  const [paidNow, setPaidNow] = useState(false);
  const [payment, setPayment] = useState<PaymentInput>(() => emptyPayment("", false, today));
  const [quote, setQuote] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The company currency can arrive after the form opened (right after a portal
  // sign-in): follow it until someone picks a currency themselves.
  const homeRef = useRef(currency);
  useEffect(() => {
    const previous = homeRef.current;
    homeRef.current = currency;
    if (previous !== currency) setV((prev) => (prev.currency === previous ? { ...prev, currency } : prev));
  }, [currency]);

  const currencies = useMemo(() => quoteCurrencies(currency), [currency]);
  const set = <K extends keyof ExpenseInput>(k: K, value: ExpenseInput[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const p = PROMPTS[v.category];
  const dates = DATE_LABELS[v.category];
  const forPerson = !finance || (who !== "" && who !== COMPANY);

  // "Paid back to the employee" is not offered for a company-wide item: do not keep it hidden in the payment.
  useEffect(() => {
    if (!forPerson) setPayment((prev) => (prev.method === "reimbursed" ? { ...prev, method: "bank" } : prev));
  }, [forPerson]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (finance && !who) return setError("Choose who it is for, or the whole company.");
    const problem =
      checkExpense(v, !finance) ??
      checkFile(quote) ??
      (finance && paidNow ? checkPayment(payment, forPerson, currency, today) ?? checkFile(receipt) : null);
    if (problem) return setError(problem);
    setError(null);
    onSubmit({
      input: toRpcInput({ ...v, reimburse: forPerson && v.reimburse }),
      employeeId: finance ? (who === COMPANY ? null : who) : null,
      tell: forPerson && tell,
      payment: finance && paidNow ? { ...payment } : null,
      quote,
      receipt: finance && paidNow ? receipt : null,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {finance && (
        <SectionCard title="Who it is for">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <div>
              <FieldLabel htmlFor={`${id}-who`}>For</FieldLabel>
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger id={`${id}-who`}>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={COMPANY}>The whole company (no one person)</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                      {e.rank ? ` · ${e.rank}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {forPerson && (
              <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
                <Checkbox checked={tell} onCheckedChange={(c) => setTell(c === true)} className="mt-0.5" />
                <span>
                  <span className="font-semibold">Tell them</span>
                  <span className="block text-[11px] text-muted-foreground">
                    They get a notification. It is listed under their Courses &amp; expenses in the portal either way.
                  </span>
                </span>
              </label>
            )}
          </div>
        </SectionCard>
      )}

      <SectionCard title="What is it?" description={finance ? "The kind decides where it is listed." : "Pick the closest kind; the questions below follow it."}>
        <fieldset>
          <legend className="sr-only">Kind</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {EXPENSE_CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICONS[c];
              const on = v.category === c;
              return (
                <label
                  key={c}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-[11px] font-semibold leading-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                    on ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30",
                    c === "other" && "col-span-2 sm:col-span-1",
                  )}
                >
                  <input type="radio" name={`${id}-category`} value={c} checked={on} onChange={() => set("category", c as ExpenseCategory)} className="sr-only" />
                  <Icon className="h-4 w-4" aria-hidden />
                  {CATEGORY_LABELS[c]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3">
          <div>
            <FieldLabel htmlFor={`${id}-title`}>Name</FieldLabel>
            <Input id={`${id}-title`} required maxLength={L.title} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder={p.title} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor={`${id}-provider`} hint="optional">
                {v.category === "course" ? "Offered by" : "Provider or shop"}
              </FieldLabel>
              <Input
                id={`${id}-provider`}
                maxLength={L.provider}
                value={v.provider}
                onChange={(e) => set("provider", e.target.value)}
                placeholder={v.category === "course" ? "Coursera, Udemy, a university…" : "Who you pay"}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${id}-link`} hint="optional">
                Link
              </FieldLabel>
              <Input id={`${id}-link`} type="url" inputMode="url" maxLength={L.link} value={v.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" />
            </div>
          </div>
          <div className={cn("grid grid-cols-[minmax(0,1fr)_110px] gap-3", v.category === "subscription" && "sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)]")}>
            <div>
              <FieldLabel htmlFor={`${id}-amount`} hint={v.category === "subscription" ? "each time it is paid" : finance ? "quoted" : "what it costs"}>
                Cost
              </FieldLabel>
              <Input id={`${id}-amount`} inputMode="decimal" required value={v.amount} onChange={(e) => set("amount", e.target.value)} className="tabular" placeholder="15,000" autoComplete="off" />
            </div>
            <div>
              <FieldLabel htmlFor={`${id}-currency`}>Currency</FieldLabel>
              <Select value={v.currency} onValueChange={(c) => set("currency", c)}>
                <SelectTrigger id={`${id}-currency`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {v.category === "subscription" && (
              <div className="col-span-2 sm:col-span-1">
                <FieldLabel htmlFor={`${id}-billing`}>Paid</FieldLabel>
                <Select value={v.billing} onValueChange={(b) => set("billing", b as Billing)}>
                  <SelectTrigger id={`${id}-billing`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["monthly", "yearly"] as Billing[]).map((b) => (
                      <SelectItem key={b} value={b}>
                        {BILLING_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {dates && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor={`${id}-start`} hint="optional">
                  {dates[0]}
                </FieldLabel>
                <Input id={`${id}-start`} type="date" value={v.start_date} onChange={(e) => set("start_date", e.target.value)} className="tabular" />
              </div>
              {dates[1] && (
                <div>
                  <FieldLabel htmlFor={`${id}-end`} hint="optional">
                    {dates[1]}
                  </FieldLabel>
                  <Input id={`${id}-end`} type="date" min={v.start_date || undefined} value={v.end_date} onChange={(e) => set("end_date", e.target.value)} className="tabular" />
                </div>
              )}
            </div>
          )}
          {forPerson && (
            <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
              <Checkbox checked={v.reimburse} onCheckedChange={(c) => set("reimburse", c === true)} className="mt-0.5" />
              <span>
                <span className="font-semibold">{finance ? "They paid for it themselves and are to be paid back" : "I have already paid for it myself; please pay me back"}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {finance ? "Record the payment as “Paid back to the employee”." : "Attach the receipt below so Finance can check it."}
                </span>
              </span>
            </label>
          )}
        </div>
      </SectionCard>

      <SectionCard title={finance ? "Notes" : "Why it is worth it"} description={finance ? undefined : "This is what HR decides on. Be specific."}>
        <div className="grid gap-3">
          <div>
            <FieldLabel htmlFor={`${id}-purpose`} hint={finance ? "optional" : p.purpose[1]}>
              {finance ? "Notes" : p.purpose[0]}
            </FieldLabel>
            <Textarea id={`${id}-purpose`} rows={3} maxLength={L.text} value={v.purpose} onChange={(e) => set("purpose", e.target.value)} className="min-h-[88px]" />
            {!finance && <CharHint value={v.purpose} />}
          </div>
          {!finance && (
            <div>
              <FieldLabel htmlFor={`${id}-benefit`} hint={p.benefit[1]}>
                {p.benefit[0]}
              </FieldLabel>
              <Textarea id={`${id}-benefit`} rows={3} maxLength={L.text} value={v.benefit} onChange={(e) => set("benefit", e.target.value)} className="min-h-[88px]" />
              <CharHint value={v.benefit} />
            </div>
          )}
          <FilePicker label={v.reimburse && !finance ? "Receipt" : "Quote or invoice"} file={quote} onChange={setQuote} />
        </div>
      </SectionCard>

      {finance && (
        <SectionCard>
          <label className="flex items-start gap-3 text-[13px]">
            <Checkbox
              checked={paidNow}
              onCheckedChange={(c) => {
                const on = c === true;
                setPaidNow(on);
                if (on && !payment.amount) setPayment(emptyPayment(v.currency === currency ? v.amount : "", forPerson && v.reimburse, today));
              }}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">Already paid</span>
              <span className="block text-[11px] text-muted-foreground">Record the payment now. Leave it unticked and it waits under To pay.</span>
            </span>
          </label>
          {paidNow && (
            <div className="mt-4">
              <PaymentFields value={payment} onChange={setPayment} currency={currency} company={!forPerson} receipt={receipt} onReceiptChange={setReceipt} today={today} />
            </div>
          )}
        </SectionCard>
      )}

      <FormError>{error}</FormError>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-5 text-muted-foreground">
          {finance
            ? "It appears in the right tab at once: Courses, Subscriptions or All spending."
            : "HR decides first; once approved it goes to Finance for payment. You are told at each step."}
        </p>
        <div className="flex gap-2 sm:shrink-0">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {submitting ? "Saving…" : finance ? "Save" : "Send to HR"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CharHint({ value }: { value: string }) {
  const n = value.trim().length;
  if (n >= L.minWhy) return null;
  const left = L.minWhy - n;
  return <p className="mt-1 text-[11px] text-muted-foreground">{left} more {left === 1 ? "character" : "characters"}, at least.</p>;
}
