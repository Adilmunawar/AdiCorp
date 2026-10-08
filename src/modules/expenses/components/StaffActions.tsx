import { useEffect, useId, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, RotateCcw, Trash2, XCircle } from "lucide-react";
import { ConfirmButton, ConfirmDialog, SectionCard, formatDate } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import {
  checkFile,
  useCompanyToday,
  useCompleteCourse,
  useDeleteExpense,
  useEndSubscription,
  useFinanceDecline,
  useFinanceReconsider,
  useHrDecide,
  useHrUndo,
  useRecordPayment,
} from "../api";
import { BILLING_LABELS, EXPENSE_LIMITS as L, checkPayment, costLine, quoted, type ExpenseRow, type PaymentInput } from "../kinds";
import { FieldLabel, FilePicker, FormError } from "./bits";
import { PaymentFields, emptyPayment } from "./PaymentFields";

function Card({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <SectionCard title={title} description={hint}>
      {children}
    </SectionCard>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="text-xs leading-5 text-muted-foreground">{children}</p>;

/** What the reader can do next, by role and status. */
export function StaffActions({ x, currency }: { x: ExpenseRow; currency: string }) {
  const { user, isHR, isFinance } = useAuth();
  const own = !!x.employee?.user_id && x.employee.user_id === user?.id;
  const courseDone = x.category === "course" && ["paid", "active", "ended"].includes(x.status);
  const cards: ReactNode[] = [];

  if (isHR && x.source === "request" && x.status === "pending") {
    cards.push(
      <Card key="decide" title="Your decision" hint="Approved requests go to Finance">
        {own ? <Muted>This is your own request: another HR administrator has to decide on it.</Muted> : <DecisionForm x={x} />}
      </Card>,
    );
  }
  if (isHR && x.source === "request" && x.status === "approved" && x.payments_count === 0) {
    cards.push(
      <Card key="undo" title="Approved by mistake?">
        <UndoApproval x={x} />
      </Card>,
    );
  }
  if (isFinance && ["approved", "active", "paid"].includes(x.status)) {
    const renewal = x.status === "active";
    cards.push(
      <Card
        key="pay"
        title={renewal ? "Record a renewal" : x.status === "paid" ? "Record another payment" : "Record payment"}
        hint={renewal ? (x.renews_on ? `Due ${formatDate(x.renews_on)}` : undefined) : x.status === "paid" ? "For a further instalment" : undefined}
      >
        <PaymentForm x={x} currency={currency} renewal={renewal} />
      </Card>,
    );
  }
  if (isFinance && x.status === "approved") {
    cards.push(
      <Card key="decline" title="Decline payment">
        <DeclineForm x={x} />
      </Card>,
    );
  }
  if (isFinance && x.status === "declined") {
    cards.push(
      <Card key="reconsider" title="Reconsider">
        <Reconsider x={x} />
      </Card>,
    );
  }
  if (isFinance && x.status === "active") {
    cards.push(
      <Card key="end" title="End the subscription">
        <EndForm x={x} />
      </Card>,
    );
  }
  if (isFinance && courseDone && x.employee_id) {
    cards.push(
      <Card key="complete" title={x.completed_at ? "Course completed" : "Finished the course?"} hint={x.completed_at ? `Completed ${formatDate(x.completed_at)}` : "HR is notified"}>
        <CompleteForm x={x} />
      </Card>,
    );
  } else if (isHR && x.completed_at) {
    cards.push(
      <Card key="outcome" title="Course completed" hint={formatDate(x.completed_at)}>
        <p className="whitespace-pre-line text-[13px] leading-6 text-foreground/90 [overflow-wrap:anywhere]">{x.outcome}</p>
      </Card>,
    );
  }
  if (isFinance && x.payments_count === 0 && !(x.source === "request" && ["pending", "approved"].includes(x.status))) {
    cards.push(
      <Card key="delete" title="Delete this expense">
        <DeleteItem x={x} />
      </Card>,
    );
  }
  if (!cards.length) {
    cards.push(
      <Card key="none" title="No action needed">
        <Muted>
          {x.status === "approved" ? "It is with Finance for payment." : x.status === "pending" ? "It is with HR." : "This one is settled."}
          {x.billing !== "once" && x.status === "active" ? ` ${BILLING_LABELS[x.billing]}; Finance records each renewal.` : ""}
        </Muted>
        {x.currency !== currency && <p className="mt-2 text-[11px] text-muted-foreground">Quoted as {quoted(x.amount, x.currency)}.</p>}
      </Card>,
    );
  }
  return <>{cards}</>;
}

/* ------------------------------------------------------------------ HR */

function DecisionForm({ x }: { x: ExpenseRow }) {
  const id = useId();
  const decide = useHrDecide();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const busy = decide.isPending;
  const reject = () => {
    if (note.trim().length < 5) return setError("Say why it is not approved; the employee is told.");
    setError(null);
    setConfirmReject(true);
  };
  return (
    <div className="grid gap-3">
      <Muted>
        Asked for <span className="tabular font-semibold text-foreground">{costLine(x)}</span>. Weigh the reason against the cost; Finance still checks the budget before paying.
      </Muted>
      <div>
        <FieldLabel htmlFor={`${id}-note`} hint="needed if you do not approve; the employee sees it">
          Note
        </FieldLabel>
        <Textarea
          id={`${id}-note`}
          rows={3}
          maxLength={L.note}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[80px]"
          placeholder="e.g. Approved, finish it by December. Or: not this quarter, ask again in January."
        />
      </div>
      <FormError>{error}</FormError>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={reject}>
          <XCircle className="h-4 w-4" aria-hidden />
          Do not approve
        </Button>
        <Button type="button" disabled={busy} onClick={() => decide.mutate({ id: x.id, decision: "approve", note: note.trim() })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
          Approve and send to Finance
        </Button>
      </div>
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title="Not approve this request?"
        description="The employee is told, with your note."
        confirmLabel="Do not approve"
        onConfirm={() => decide.mutateAsync({ id: x.id, decision: "reject", note: note.trim() })}
      />
    </div>
  );
}

function UndoApproval({ x }: { x: ExpenseRow }) {
  const undo = useHrUndo();
  return (
    <div className="grid gap-3">
      <Muted>You can take the approval back until Finance pays.</Muted>
      <div>
        <ConfirmButton
          title="Take the approval back?"
          description="It goes back to waiting for a decision."
          confirmLabel="Take approval back"
          destructive={false}
          variant="outline"
          disabled={undo.isPending}
          onConfirm={() => undo.mutateAsync(x.id)}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Take approval back
        </ConfirmButton>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Finance */

function PaymentForm({ x, currency, renewal }: { x: ExpenseRow; currency: string; renewal: boolean }) {
  const pay = useRecordPayment();
  const today = useCompanyToday();
  const suggested = x.last_payment ? String(x.last_payment) : x.currency === currency ? String(x.amount) : "";
  const [value, setValue] = useState<PaymentInput>(() => emptyPayment(suggested, x.reimburse, today));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The last payment loads after the item: offer it once known, unless something was typed.
  useEffect(() => {
    if (suggested) setValue((v) => (v.amount ? v : { ...v, amount: suggested }));
  }, [suggested]);
  const submit = () => {
    const problem = checkPayment(value, !!x.employee_id, currency, today) ?? checkFile(receipt);
    if (problem) return setError(problem);
    setError(null);
    pay.mutate(
      { id: x.id, owner: x.employee_id ?? "company", payment: { ...value }, receipt, renewal },
      {
        onSuccess: () => {
          setReceipt(null);
          setValue(emptyPayment(value.amount, x.reimburse, today));
        },
      },
    );
  };
  return (
    <div className="grid gap-3">
      <Muted>
        Quoted at <span className="tabular font-semibold text-foreground">{costLine(x)}</span>
        {x.currency !== currency ? `. Enter what it cost in ${currency}, as on the bank or card statement.` : "."}
        {x.reimburse ? " The employee paid for it: pay them back." : ""}
      </Muted>
      <PaymentFields value={value} onChange={setValue} currency={currency} company={!x.employee_id} receipt={receipt} onReceiptChange={setReceipt} showNote today={today} />
      <FormError>{error}</FormError>
      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={pay.isPending} className="w-full sm:w-auto">
          {pay.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {renewal ? "Record renewal" : "Record payment"}
        </Button>
      </div>
    </div>
  );
}

function DeclineForm({ x }: { x: ExpenseRow }) {
  const id = useId();
  const decline = useFinanceDecline();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-3">
      <div>
        <FieldLabel htmlFor={`${id}-why`} hint={x.source === "request" ? "the employee and HR see it" : "the employee sees it"}>
          Reason
        </FieldLabel>
        <Textarea id={`${id}-why`} rows={2} maxLength={L.note} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[64px]" placeholder="e.g. No training budget left this year." />
      </div>
      <FormError>{error}</FormError>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={decline.isPending}
          onClick={() => {
            if (note.trim().length < 5) return setError("Say why; the employee is told.");
            setError(null);
            setOpen(true);
          }}
        >
          Decline
        </Button>
      </div>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Decline it?" description="The employee is told why." confirmLabel="Decline" onConfirm={() => decline.mutateAsync({ id: x.id, note: note.trim() })} />
    </div>
  );
}

function Reconsider({ x }: { x: ExpenseRow }) {
  const reconsider = useFinanceReconsider();
  return (
    <div className="grid gap-3">
      <Muted>Put it back on the To pay list.</Muted>
      <div>
        <Button type="button" variant="outline" disabled={reconsider.isPending} onClick={() => reconsider.mutate(x.id)}>
          {reconsider.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
          Move back to To pay
        </Button>
      </div>
    </div>
  );
}

function EndForm({ x }: { x: ExpenseRow }) {
  const id = useId();
  const end = useEndSubscription();
  const today = useCompanyToday();
  const [on, setOn] = useState(today);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <FieldLabel htmlFor={`${id}-on`}>Ends on</FieldLabel>
          <Input id={`${id}-on`} type="date" value={on} onChange={(e) => setOn(e.target.value)} className="tabular" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={end.isPending}
          onClick={() => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return setError("Enter the date it ends.");
            setError(null);
            setOpen(true);
          }}
        >
          End subscription
        </Button>
      </div>
      <FormError>{error}</FormError>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="End this subscription?"
        description="No more renewals are expected. The employee is told."
        confirmLabel="End subscription"
        onConfirm={() => end.mutateAsync({ id: x.id, on })}
      />
    </div>
  );
}

function CompleteForm({ x }: { x: ExpenseRow }) {
  const id = useId();
  const complete = useCompleteCourse();
  const [outcome, setOutcome] = useState(x.outcome ?? "");
  const [cert, setCert] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (outcome.trim().length < L.minWhy) return setError("Say what was learned and how it will be used at work, in a sentence or two.");
    const problem = checkFile(cert);
    if (problem) return setError(problem);
    setError(null);
    complete.mutate({ id: x.id, owner: x.employee_id ?? "company", outcome: outcome.trim(), certificate: cert }, { onSuccess: () => setCert(null) });
  };
  return (
    <div className="grid gap-3">
      <div>
        <FieldLabel htmlFor={`${id}-outcome`} hint="HR sees it">
          What was learned, and how it will be used
        </FieldLabel>
        <Textarea id={`${id}-outcome`} rows={4} maxLength={L.text} value={outcome} onChange={(e) => setOutcome(e.target.value)} className="min-h-[96px]" />
      </div>
      <FilePicker label="Certificate" hint="optional · PDF or image" file={cert} onChange={setCert} accept=".pdf,.jpg,.jpeg,.png,.webp" />
      <FormError>{error}</FormError>
      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={complete.isPending}>
          {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {x.completed_at ? "Update" : "Mark as completed"}
        </Button>
      </div>
    </div>
  );
}

function DeleteItem({ x }: { x: ExpenseRow }) {
  const del = useDeleteExpense();
  const navigate = useNavigate();
  return (
    <div className="grid gap-3">
      <Muted>Nothing has been paid against it, so it can be removed (a duplicate, or a typing mistake).</Muted>
      <div>
        <ConfirmButton
          title={`Delete "${x.title}" for good?`}
          description="Its files are removed too. This cannot be undone."
          confirmLabel="Delete"
          disabled={del.isPending}
          onConfirm={async () => {
            await del.mutateAsync(x.id);
            navigate("/expenses", { replace: true });
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete
        </ConfirmButton>
      </div>
    </div>
  );
}
