import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CheckCircle2, Download, Loader2, Mail, MessageSquareReply, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, EmptyState, PageHeader, PageSkeleton, SectionCard, formatDate, formatDateTime } from "@/components/kit";
import { usePortalAcknowledgeLetter, usePortalLetter, usePortalReplyLetter } from "../lib/api";
import { errorMessage, usePortalLetterhead } from "../lib/company";
import { REPLY_MAX, REPLY_MIN, letterLabel, replyByHint } from "../lib/letters";
import { exportLetterPdf } from "../lib/pdf";
import { LetterPreview } from "../components/LetterPreview";

export default function PortalLetterPage() {
  const { id } = useParams<{ id: string }>();
  const { data: l, isLoading, error } = usePortalLetter(id);
  const company = usePortalLetterhead();
  const ack = usePortalAcknowledgeLetter();
  const reply = usePortalReplyLetter();
  const [text, setText] = useState("");
  const [confirmReply, setConfirmReply] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (isLoading) return <PageSkeleton />;
  if (error || !l) {
    return (
      <EmptyState
        icon={Mail}
        title="Letter not found"
        description={error ? errorMessage(error) : "It may have been removed. Your letters are listed under Letters from HR."}
        action={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/portal/letters">Back to letters</Link>
          </Button>
        }
      />
    );
  }

  const meta = [l.rank, l.department, l.employee_code ? `Employee ID ${l.employee_code}` : null].filter(Boolean).join(" · ");
  const canReply = !l.withdrawn_at && !l.replied_at;

  const acknowledge = async () => {
    try {
      await ack.mutateAsync(l.id);
      toast.success("Acknowledged", { description: "HR can see that you have received this letter." });
    } catch (err) {
      toast.error("Could not acknowledge", { description: errorMessage(err) });
    }
  };

  const sendReply = async () => {
    try {
      await reply.mutateAsync({ id: l.id, reply: text.trim() });
      toast.success("Reply sent to HR");
      setText("");
    } catch (err) {
      toast.error("Could not send the reply", { description: errorMessage(err) });
      throw err;
    }
  };

  const download = async () => {
    setExporting(true);
    try {
      await exportLetterPdf({
        company,
        ref: l.ref,
        kind: l.kind,
        subject: l.subject,
        body: l.body,
        issuedAt: l.issued_at,
        replyBy: l.reply_by,
        signatoryName: l.signatory_name,
        signatoryTitle: l.signatory_title,
        employeeName: l.employee_name,
        employeeCode: l.employee_code,
        rank: l.rank,
        department: l.department,
        acknowledgedAt: l.acknowledged_at,
        reply: l.reply,
        repliedAt: l.replied_at,
        withdrawnAt: l.withdrawn_at,
        withdrawReason: l.withdraw_reason,
      });
    } catch (err) {
      toast.error("Could not create the PDF", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground">
        <Link to="/portal/letters">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Letters
        </Link>
      </Button>
      <PageHeader
        icon={Mail}
        eyebrow={letterLabel(l.kind)}
        title={<span className="whitespace-normal break-words">{l.subject}</span>}
        description={`${l.ref} · ${formatDate(l.issued_at)}`}
        actions={
          <Button variant="outline" className="gap-1.5 rounded-xl" onClick={download} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            PDF
          </Button>
        }
      />

      {l.withdrawn_at ? (
        <div className="flex gap-2 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-semibold text-foreground">HR withdrew this letter on {formatDate(l.withdrawn_at)}.</p>
            {l.withdraw_reason && <p className="mt-0.5 text-xs text-muted-foreground">{l.withdraw_reason}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">It is kept on record only. There is nothing you need to do.</p>
          </div>
        </div>
      ) : !l.acknowledged_at ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">Please read the letter and confirm you have received it.</p>
            {l.reply_by && <p className="mt-0.5 text-xs text-muted-foreground">HR asks for your reply by {formatDate(l.reply_by)} ({replyByHint(l.reply_by)?.toLowerCase()}).</p>}
          </div>
          <Button className="shrink-0 gap-1.5 rounded-xl" onClick={acknowledge} disabled={ack.isPending}>
            {ack.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            I have received it
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs font-medium text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> You acknowledged this letter on {formatDateTime(l.acknowledged_at)}.
        </p>
      )}

      <LetterPreview
        company={company}
        refNo={l.ref}
        kind={l.kind}
        subject={l.subject}
        body={l.body}
        issuedAt={l.issued_at}
        replyBy={l.reply_by}
        signatoryName={l.signatory_name}
        signatoryTitle={l.signatory_title}
        employeeName={l.employee_name}
        employeeMeta={meta}
        withdrawnAt={l.withdrawn_at}
      />

      {l.replied_at ? (
        <SectionCard title="Your reply" description={`Sent ${formatDateTime(l.replied_at)}`} icon={MessageSquareReply}>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">{l.reply}</p>
        </SectionCard>
      ) : (
        canReply && (
          <SectionCard
            title="Reply to HR"
            description={l.reply_by ? `Requested by ${formatDate(l.reply_by)}. You can reply once.` : "Optional. You can reply once; replying also acknowledges the letter."}
            icon={MessageSquareReply}
          >
            <div className="space-y-2">
              <Label htmlFor="letter-reply" className="sr-only">
                Your reply
              </Label>
              <Textarea
                id="letter-reply"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={REPLY_MAX}
                rows={6}
                placeholder="Write your reply…"
                className="rounded-xl text-[13.5px]"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="tabular text-[11px] text-muted-foreground">
                  {text.trim().length.toLocaleString()} / {REPLY_MAX.toLocaleString()}
                </span>
                <Button className="gap-1.5 rounded-xl" onClick={() => setConfirmReply(true)} disabled={text.trim().length < REPLY_MIN || reply.isPending}>
                  {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  Send reply
                </Button>
              </div>
            </div>
          </SectionCard>
        )
      )}

      <ConfirmDialog
        open={confirmReply}
        onOpenChange={setConfirmReply}
        destructive={false}
        title="Send your reply?"
        description="You can reply only once, and the reply cannot be changed afterwards. HR is notified."
        confirmLabel="Send reply"
        onConfirm={sendReply}
      />
    </div>
  );
}
