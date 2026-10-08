import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, useCreatePoll } from "../lib/api";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

function defaultDeadline(): string {
  return format(addDays(new Date(), 7), "yyyy-MM-dd'T'17:00");
}

export function PollDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreatePoll();
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion("");
    setDescription("");
    setOptions(["", ""]);
    setHasDeadline(false);
    setDeadline(defaultDeadline());
    setTried(false);
  }, [open]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const duplicate = new Set(filled.map((o) => o.toLowerCase())).size !== filled.length;
  const deadlineDate = hasDeadline ? new Date(deadline) : null;
  const errors = {
    question: question.trim().length < 5 ? "Ask a question of at least 5 characters." : question.trim().length > 200 ? "Keep the question under 200 characters." : null,
    options:
      filled.length < MIN_OPTIONS ? "Give at least two options." : duplicate ? "Each option must be different." : filled.some((o) => o.length > 120) ? "Keep each option under 120 characters." : null,
    deadline:
      hasDeadline && (!deadlineDate || Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now() + 5 * 60_000)
        ? "The closing time must be in the future."
        : null,
  };

  const submit = async () => {
    setTried(true);
    if (errors.question || errors.options || errors.deadline) return;
    try {
      await create.mutateAsync({
        question: question.trim(),
        description: description.trim(),
        options: filled,
        expires_at: deadlineDate ? deadlineDate.toISOString() : null,
      });
      toast.success("Poll started. Every employee has been asked to vote.");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">New poll</DialogTitle>
          <DialogDescription className="text-xs">One vote per employee. They see the results after voting; only HR sees who chose what.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="poll-question" className="micro-label">
              Question
            </Label>
            <Input
              id="poll-question"
              value={question}
              maxLength={200}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Where should we go for the team lunch?"
              className="h-10 rounded-xl"
              aria-invalid={(tried && !!errors.question) || undefined}
            />
            {tried && errors.question && <p className="text-[11px] font-semibold text-destructive">{errors.question}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="poll-description" className="micro-label">
              Details <span className="normal-case tracking-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="poll-description"
              value={description}
              maxLength={1000}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything people should know before voting"
              className="rounded-xl text-[13px]"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="micro-label mb-1.5">Options</legend>
            {options.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                <Input
                  value={value}
                  maxLength={120}
                  aria-label={`Option ${i + 1}`}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                  className="h-9 rounded-xl"
                />
                {options.length > MIN_OPTIONS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-xl text-xs" onClick={() => setOptions((prev) => [...prev, ""])}>
                <Plus className="h-3.5 w-3.5" /> Add option
              </Button>
            )}
            {tried && errors.options && <p className="text-[11px] font-semibold text-destructive">{errors.options}</p>}
          </fieldset>
          <div className="space-y-2 rounded-xl border border-border bg-muted/20 px-3.5 py-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-xs font-bold">Close automatically</span>
                <span className="block text-[11px] text-muted-foreground">Otherwise it stays open until you close it.</span>
              </span>
              <Switch checked={hasDeadline} onCheckedChange={setHasDeadline} aria-label="Close automatically" />
            </label>
            {hasDeadline && (
              <div className="space-y-1">
                <Label htmlFor="poll-deadline" className="micro-label">
                  Closes at
                </Label>
                <Input
                  id="poll-deadline"
                  type="datetime-local"
                  value={deadline}
                  min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="h-9 rounded-xl"
                  aria-invalid={(tried && !!errors.deadline) || undefined}
                />
                {tried && errors.deadline && <p className="text-[11px] font-semibold text-destructive">{errors.deadline}</p>}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" disabled={create.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Start poll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
