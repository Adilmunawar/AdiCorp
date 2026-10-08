import { useState } from "react";
import { EyeOff, Loader2, MessageSquareWarning, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ListSkeleton, PageHeader, formatDateTime, formatRelative } from "@/components/kit";
import { errorMessage } from "../../lib/api";
import { usePortalComplaints, usePortalSubmitComplaint } from "../../lib/portalApi";
import { ComplaintBadge, ComplaintProgress } from "../../components/ComplaintProgress";
import { LoadError } from "../../components/LoadError";
import { PortalExtras } from "../../components/PageExtras";

function ComplaintForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const submit = usePortalSubmitComplaint();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [tried, setTried] = useState(false);

  const errors = {
    subject: subject.trim().length < 3 ? "Give it a subject of at least 3 characters." : null,
    description: description.trim().length < 10 ? "Describe what happened in at least 10 characters." : null,
  };

  const reset = () => {
    setSubject("");
    setDescription("");
    setAnonymous(false);
    setTried(false);
  };

  const send = async () => {
    setTried(true);
    if (errors.subject || errors.description) return;
    try {
      const r = await submit.mutateAsync({ subject: subject.trim(), description: description.trim(), anonymous });
      toast.success(r.anonymous ? "Sent anonymously. HR will look into it." : "Complaint sent. You will be told when HR responds.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submit.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">Raise a complaint</DialogTitle>
          <DialogDescription className="text-xs">Tell HR what happened. It is handled confidentially.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="complaint-subject" className="micro-label">
              Subject
            </Label>
            <Input
              id="complaint-subject"
              value={subject}
              maxLength={120}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="In a few words"
              className="h-10 rounded-xl"
              aria-invalid={(tried && !!errors.subject) || undefined}
            />
            {tried && errors.subject && <p className="text-[11px] font-semibold text-destructive">{errors.subject}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="complaint-description" className="micro-label">
              What happened
            </Label>
            <Textarea
              id="complaint-description"
              value={description}
              maxLength={3000}
              rows={6}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When, where, who was involved, and what you would like to happen"
              className="rounded-xl text-[13px]"
              aria-invalid={(tried && !!errors.description) || undefined}
            />
            <div className="flex justify-between text-[10px]">
              <span className="font-semibold text-destructive">{tried && errors.description}</span>
              <span className="text-muted-foreground">{description.length}/3000</span>
            </div>
          </div>
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3.5 py-3">
            <span>
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <EyeOff className="h-3.5 w-3.5" /> Send anonymously
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                Your name is not stored and only the date is kept. You will not see it in your list or hear back about it.
              </span>
            </span>
            <Switch checked={anonymous} onCheckedChange={setAnonymous} aria-label="Send anonymously" />
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" disabled={submit.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {anonymous ? "Send anonymously" : "Send to HR"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PortalComplaintsPage() {
  const { data, isPending, isError, error, refetch } = usePortalComplaints();
  const [open, setOpen] = useState(false);
  const items = data ?? [];
  return (
    <div>
      <PortalExtras />
      <PageHeader
        eyebrow="My portal"
        title="Complaints"
        description="Raise a concern with HR, under your name or anonymously."
        icon={MessageSquareWarning}
        actions={
          <Button className="h-9 gap-1.5 rounded-xl" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Raise a complaint
          </Button>
        }
      />
      <p className="mb-4 flex items-start gap-2 rounded-2xl border border-border bg-card px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        Only HR can read complaints. Anonymous ones carry no name, so they are not listed here.
      </p>
      {isPending ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <LoadError what="Complaints" error={error} icon={MessageSquareWarning} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState icon={MessageSquareWarning} title="No complaints raised" description="If something is wrong at work, let HR know. Complaints under your name show their progress here." />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <article key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-display text-[15px] font-semibold leading-snug">{c.subject}</h2>
                  <p className="text-[11px] text-muted-foreground" title={formatDateTime(c.created_at)}>
                    Raised {formatRelative(c.created_at)}
                  </p>
                </div>
                <ComplaintBadge status={c.status} />
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{c.description}</p>
              <ComplaintProgress status={c.status} className="mt-4" />
              {c.response && (
                <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.04] px-3.5 py-3">
                  <p className="micro-label mb-1 text-primary">HR's response</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">{c.response}</p>
                  {c.responded_at && <p className="mt-1 text-[10px] text-muted-foreground">{formatRelative(c.responded_at)}</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <ComplaintForm open={open} onOpenChange={setOpen} />
    </div>
  );
}
