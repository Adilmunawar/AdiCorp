import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, ArrowLeft, Ban, CheckCircle2, Clock, Download, FileText, Loader2, Mail, MessageSquareReply, PenSquare, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, EmptyState, PageHeader, PageSkeleton, SectionCard, StatusBadge, formatDate, formatDateTime } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useLetter, useLetters, useWithdrawLetter } from "../lib/api";
import { errorMessage, useCompanyToday, useStaffLetterhead } from "../lib/company";
import { LETTER_STATUS_LABEL, LETTER_STATUS_TONE, inZone, kindTone, letterLabel, letterStatus, replyByHint } from "../lib/letters";
import { exportLetterPdf } from "../lib/pdf";
import { LetterPreview } from "../components/LetterPreview";

interface Step {
  label: string;
  at: string | null;
  detail?: string | null;
  icon: typeof Mail;
  tone: "done" | "waiting" | "danger" | "muted";
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s) => (
        <li key={s.label} className="flex gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
              s.tone === "done" && "border-success/30 bg-success/10 text-success",
              s.tone === "waiting" && "border-warning/30 bg-warning/10 text-warning",
              s.tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
              s.tone === "muted" && "border-border bg-muted text-muted-foreground",
            )}
          >
            <s.icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{s.label}</p>
            <p className="text-[11px] text-muted-foreground">{s.at ? formatDateTime(s.at) : s.detail ?? "—"}</p>
            {s.at && s.detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function LetterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: letter, isLoading, error } = useLetter(id);
  const all = useLetters();
  const withdraw = useWithdrawLetter();
  const company = useStaffLetterhead();
  const today = useCompanyToday();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [exporting, setExporting] = useState(false);

  if (isLoading) return <PageSkeleton />;
  if (error || !letter) {
    return (
      <EmptyState
        icon={Mail}
        title="Letter not found"
        description={error ? errorMessage(error) : "The link may be wrong, or the letter belongs to another company."}
        action={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/letters">Back to letters</Link>
          </Button>
        }
      />
    );
  }

  const status = letterStatus(letter, today);
  const emp = letter.employee;
  const others = (all.data ?? []).filter((l) => l.employee_id === letter.employee_id && l.id !== letter.id).slice(0, 6);
  const meta = [emp?.rank, emp?.department?.name, emp?.employee_code ? `Employee ID ${emp.employee_code}` : null].filter(Boolean).join(" · ");

  const download = async () => {
    setExporting(true);
    try {
      await exportLetterPdf({
        company,
        ref: letter.ref,
        kind: letter.kind,
        subject: letter.subject,
        body: letter.body,
        issuedAt: letter.issued_at,
        replyBy: letter.reply_by,
        signatoryName: letter.signatory_name,
        signatoryTitle: letter.signatory_title,
        employeeName: emp?.name ?? "",
        employeeCode: emp?.employee_code,
        rank: emp?.rank,
        department: emp?.department?.name,
        acknowledgedAt: letter.acknowledged_at,
        reply: letter.reply,
        repliedAt: letter.replied_at,
        withdrawnAt: letter.withdrawn_at,
        withdrawReason: letter.withdraw_reason,
      });
    } catch (err) {
      toast.error("Could not create the PDF", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const doWithdraw = async () => {
    try {
      await withdraw.mutateAsync({ id: letter.id, reason: reason.trim() });
      toast.success(`${letter.ref} withdrawn`, { description: "The employee has been told. The letter stays on record." });
      setReason("");
    } catch (err) {
      toast.error("Could not withdraw the letter", { description: errorMessage(err) });
      throw err;
    }
  };

  const steps: Step[] = [
    { label: "Issued", at: letter.issued_at, detail: letter.issued_by_name ? `by ${letter.issued_by_name}` : null, icon: Send, tone: "done" },
    {
      label: "Received",
      at: letter.acknowledged_at,
      detail: letter.acknowledged_at ? null : letter.withdrawn_at ? "Not acknowledged" : "Waiting for the employee to acknowledge",
      icon: CheckCircle2,
      tone: letter.acknowledged_at ? "done" : letter.withdrawn_at ? "muted" : "waiting",
    },
  ];
  if (letter.reply_by || letter.replied_at) {
    steps.push({
      label: "Reply",
      at: letter.replied_at,
      detail: letter.replied_at ? null : letter.reply_by ? `Due ${formatDate(letter.reply_by)} · ${replyByHint(letter.reply_by, today)}` : "Not replied",
      icon: letter.replied_at ? MessageSquareReply : Clock,
      tone: letter.replied_at ? "done" : status === "overdue" ? "danger" : letter.withdrawn_at ? "muted" : "waiting",
    });
  }
  if (letter.withdrawn_at) {
    steps.push({
      label: "Withdrawn",
      at: letter.withdrawn_at,
      detail: [letter.withdrawn_by_name ? `by ${letter.withdrawn_by_name}` : null, letter.withdraw_reason].filter(Boolean).join(" · "),
      icon: Ban,
      tone: "danger",
    });
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground">
        <Link to="/letters">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Letters
        </Link>
      </Button>
      <PageHeader
        icon={FileText}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
            <span className="font-mono">{letter.ref}</span>
            <StatusBadge status={status} label={LETTER_STATUS_LABEL[status]} tone={LETTER_STATUS_TONE[status]} />
          </span>
        }
        title={<span className="whitespace-normal break-words">{letter.subject}</span>}
        description={`${letterLabel(letter.kind)} to ${emp?.name ?? "an employee"} · issued ${formatDate(inZone(letter.issued_at, company.timezone))}`}
        actions={
          <>
            <Button variant="outline" className="gap-1.5 rounded-xl" onClick={download} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              PDF
            </Button>
            {!letter.withdrawn_at && (
              <Button variant="outline" className="gap-1.5 rounded-xl text-destructive hover:text-destructive" onClick={() => setWithdrawOpen(true)}>
                <Ban className="h-4 w-4" aria-hidden /> Withdraw
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <LetterPreview
            company={company}
            refNo={letter.ref}
            kind={letter.kind}
            subject={letter.subject}
            body={letter.body}
            issuedAt={letter.issued_at}
            replyBy={letter.reply_by}
            signatoryName={letter.signatory_name}
            signatoryTitle={letter.signatory_title}
            employeeName={emp?.name ?? ""}
            employeeMeta={meta}
            withdrawnAt={letter.withdrawn_at}
          />
          {letter.replied_at && (
            <SectionCard title="Employee's reply" description={formatDateTime(letter.replied_at)} icon={MessageSquareReply}>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">{letter.reply}</p>
            </SectionCard>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <SectionCard title="Progress" icon={Activity}>
            <Timeline steps={steps} />
          </SectionCard>
          <SectionCard title="Employee" icon={UserRound}>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-bold text-foreground">{emp?.name ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">{meta || "—"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {emp && (
                  <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                    <Link to={`/employees/${emp.id}`}>Profile</Link>
                  </Button>
                )}
                {emp?.status === "active" && (
                  <Button asChild size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
                    <Link to={`/letters/new?employee=${emp.id}`}>
                      <PenSquare className="h-3.5 w-3.5" aria-hidden /> New letter
                    </Link>
                  </Button>
                )}
              </div>
              {others.length > 0 && (
                <div className="border-t border-border/60 pt-3">
                  <p className="micro-label mb-2">Other letters</p>
                  <ul className="space-y-1.5">
                    {others.map((o) => (
                      <li key={o.id}>
                        <Link to={`/letters/${o.id}`} className="flex items-center justify-between gap-2 text-xs hover:text-primary">
                          <span className="min-w-0 truncate">
                            <span className="font-mono text-[10.5px] text-muted-foreground">{o.ref}</span> {o.subject}
                          </span>
                          {o.withdrawn_at ? (
                            <StatusBadge status="withdrawn" label="Withdrawn" tone="neutral" dot={false} />
                          ) : (
                            <StatusBadge status={o.kind} label={letterLabel(o.kind)} tone={kindTone(o.kind)} dot={false} />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={withdrawOpen}
        onOpenChange={(o) => {
          setWithdrawOpen(o);
          if (!o) setReason("");
        }}
        title={`Withdraw ${letter.ref}?`}
        description="Use this for a letter issued in error. It stays on record, marked withdrawn, the employee is told and can no longer reply to it."
        confirmLabel="Withdraw letter"
        confirmDisabled={reason.trim().length < 5}
        onConfirm={doWithdraw}
      >
        <div className="space-y-1.5">
          <Label htmlFor="withdraw-reason">Reason</Label>
          <Textarea id="withdraw-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="Why is it withdrawn? (at least 5 characters)" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
