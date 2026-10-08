import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EXPENSE_LIMITS as L, METHOD_LABELS, PAYMENT_METHODS, todayIso, type PaymentInput, type PaymentMethod } from "../kinds";
import { FieldLabel, FilePicker } from "./bits";

/** `today` is the company's day (see useCompanyToday); the browser's when left out. */
export const emptyPayment = (amount = "", reimburse = false, today = todayIso()): PaymentInput => ({
  amount,
  paid_on: today,
  method: reimburse ? "reimbursed" : "bank",
  reference: "",
  note: "",
});

/** Amount in the company currency, date, method, reference and a receipt. */
export function PaymentFields({
  value,
  onChange,
  currency,
  company,
  receipt,
  onReceiptChange,
  showNote = false,
  today = todayIso(),
}: {
  value: PaymentInput;
  onChange: (v: PaymentInput) => void;
  currency: string;
  /** A company-wide item: nobody to pay back. */
  company: boolean;
  receipt: File | null;
  onReceiptChange: (f: File | null) => void;
  showNote?: boolean;
  /** The latest date allowed: the company's today. */
  today?: string;
}) {
  const id = useId();
  const set = <K extends keyof PaymentInput>(k: K, v: PaymentInput[K]) => onChange({ ...value, [k]: v });
  const methods = PAYMENT_METHODS.filter((m) => !(company && m === "reimbursed"));
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-amount`} hint={`in ${currency}, what left the bank`}>
            Amount paid
          </FieldLabel>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            required
            value={value.amount}
            onChange={(e) => set("amount", e.target.value)}
            className="tabular"
            placeholder="28,000"
            autoComplete="off"
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-date`}>Paid on</FieldLabel>
          <Input id={`${id}-date`} type="date" required max={today} value={value.paid_on} onChange={(e) => set("paid_on", e.target.value)} className="tabular" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-method`}>How</FieldLabel>
          <Select value={value.method} onValueChange={(v) => set("method", v as PaymentMethod)}>
            <SelectTrigger id={`${id}-method`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {methods.map((m) => (
                <SelectItem key={m} value={m}>
                  {METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-ref`} hint="optional">
            Reference
          </FieldLabel>
          <Input
            id={`${id}-ref`}
            maxLength={L.reference}
            value={value.reference}
            onChange={(e) => set("reference", e.target.value)}
            placeholder="Transfer ID, card slip, invoice no."
            autoComplete="off"
          />
        </div>
      </div>
      {showNote && (
        <div>
          <FieldLabel htmlFor={`${id}-note`} hint="optional">
            Note
          </FieldLabel>
          <Input id={`${id}-note`} maxLength={L.note} value={value.note} onChange={(e) => set("note", e.target.value)} autoComplete="off" />
        </div>
      )}
      <FilePicker label="Receipt" file={receipt} onChange={onReceiptChange} />
    </div>
  );
}
