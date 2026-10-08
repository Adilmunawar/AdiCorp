import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Loader2, PenLine, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, SectionCard, formatRelative } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useDiscardDraft, usePublishPolicy, useSaveDraft, type PolicyDetail } from "../lib/api";
import { errorMessage } from "../lib/company";
import { POLICY_MAX_CHARS, placeholders, publishProblem, readingMinutes } from "../lib/richText";
import { FormatHelp, RichText } from "./RichText";

interface Props {
  detail: PolicyDetail;
  /** Active employees who will be asked to sign. */
  signers: number;
}

/**
 * Text editor with live preview. Saving updates the open draft or starts a new
 * version after the published one; publishing makes it the version everyone signs.
 */
export function PolicyEditor({ detail, signers }: Props) {
  const { policy, draft, current } = detail;
  const base = draft?.body ?? current?.body ?? "";
  const [body, setBody] = useState(base);
  const [note, setNote] = useState(draft?.change_note ?? "");
  const [view, setView] = useState<"write" | "preview">("write");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const save = useSaveDraft();
  const publish = usePublishPolicy();
  const discard = useDiscardDraft();

  // Reload when the stored draft changes (after save/discard/publish).
  useEffect(() => {
    setBody(draft?.body ?? current?.body ?? "");
    setNote(draft?.change_note ?? "");
  }, [draft?.id, draft?.updated_at, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = body !== base || note !== (draft?.change_note ?? "");
  const left = useMemo(() => placeholders(body), [body]);
  const problem = useMemo(() => publishProblem(body), [body]);
  const nextVersion = draft?.version ?? (current ? current.version + 1 : 1);
  const archived = !!policy.archived_at;
  const sameAsPublished = !draft && current && body.trim() === current.body.trim();

  const doSave = async () => {
    try {
      const r = await save.mutateAsync({ id: policy.id, body, changeNote: note });
      toast.success(r.created ? `Version ${r.version} started` : "Draft saved");
      return true;
    } catch (err) {
      toast.error("Could not save the draft", { description: errorMessage(err) });
      return false;
    }
  };

  const doPublish = async () => {
    if (dirty || !draft) {
      const ok = await doSave();
      if (!ok) throw new Error("The draft could not be saved.");
    }
    try {
      const r = await publish.mutateAsync(policy.id);
      toast.success(`Version ${r.version} published`, {
        description: r.asked ? `${r.asked} ${r.asked === 1 ? "person was" : "people were"} asked to sign it.` : "Nobody needs to sign it.",
      });
    } catch (err) {
      toast.error("Could not publish", { description: errorMessage(err) });
      throw err;
    }
  };

  const doDiscard = async () => {
    try {
      await discard.mutateAsync(policy.id);
      toast.success("Draft discarded");
    } catch (err) {
      toast.error("Could not discard the draft", { description: errorMessage(err) });
      throw err;
    }
  };

  const busy = save.isPending || publish.isPending || discard.isPending;

  return (
    <div className="space-y-4">
      <SectionCard
        title={draft ? `Draft · version ${draft.version}` : current ? `Editing starts version ${nextVersion}` : "Draft"}
        description={
          draft
            ? current
              ? `Saved ${formatRelative(draft.updated_at)}. Employees keep signing version ${current.version} until you publish.`
              : `Saved ${formatRelative(draft.updated_at)}. Nobody sees it until you publish.`
            : current
              ? "The published text never changes. Saving starts a new draft version."
              : "Write the policy and publish it when it is ready."
        }
        icon={PenLine}
        actions={
          <div className="flex rounded-lg border border-border p-0.5 lg:hidden" role="tablist" aria-label="Editor view">
            {(["write", "preview"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-semibold capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cn("min-w-0 space-y-2", view === "preview" && "hidden lg:block")}>
            <Label htmlFor="policy-body" className="sr-only">
              Policy text
            </Label>
            <Textarea
              id="policy-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={archived}
              maxLength={POLICY_MAX_CHARS}
              spellCheck
              className="h-[52dvh] min-h-[280px] resize-none rounded-xl font-mono text-[12.5px] leading-relaxed"
              placeholder={"# Title\n\nAn opening paragraph.\n\n## 1. A section\n\n- A rule\n- Another rule"}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="tabular">
                {body.length.toLocaleString()} / {POLICY_MAX_CHARS.toLocaleString()} characters · about {readingMinutes(body)} min to read
              </span>
            </div>
            <FormatHelp />
          </div>
          <div className={cn("min-w-0", view === "write" && "hidden lg:block")}>
            <div className="mb-2 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="micro-label">Preview</span>
            </div>
            <div className="h-[52dvh] min-h-[280px] overflow-y-auto rounded-xl border border-border bg-background p-4 sm:p-5">
              <RichText source={body} />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {left.length > 0 ? (
            <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-foreground" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">
                  {left.length} {left.length === 1 ? "placeholder" : "placeholders"} to fill in before publishing
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {left.slice(0, 12).map((p) => (
                    <code key={p} className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">
                      {p}
                    </code>
                  ))}
                  {left.length > 12 && <span className="text-muted-foreground">and {left.length - 12} more</span>}
                </p>
              </div>
            </div>
          ) : !problem ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Ready to publish
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{problem}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="policy-note" className="text-xs">
              What changed in this version <span className="font-normal text-muted-foreground">(optional, shown in the version list)</span>
            </Label>
            <Input id="policy-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={archived} placeholder="e.g. Updated office hours for Ramadan" />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {draft && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDiscard(true)} disabled={busy || archived}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Discard draft
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="gap-1.5 rounded-xl" onClick={doSave} disabled={busy || archived || !dirty || !!sameAsPublished}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Save draft
              </Button>
              <Button
                type="button"
                className="gap-1.5 rounded-xl"
                onClick={() => setConfirmPublish(true)}
                disabled={busy || archived || !!problem || (!draft && !!sameAsPublished)}
              >
                {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {dirty || !draft ? "Save and publish" : "Publish"} v{nextVersion}
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        destructive={false}
        title={`Publish version ${nextVersion} of ${policy.title}?`}
        description={
          policy.requires_signature
            ? `${signers} active ${signers === 1 ? "employee" : "employees"} will be asked to read and sign it${current ? `, including everyone who signed version ${current.version}` : ""}. The published text cannot be changed afterwards.`
            : "It becomes the version employees read. The published text cannot be changed afterwards."
        }
        confirmLabel="Publish"
        onConfirm={doPublish}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this draft?"
        description={current ? `The changes are lost. Version ${current.version} stays published.` : "The draft text is lost. The policy stays, with no text."}
        confirmLabel="Discard"
        onConfirm={doDiscard}
      />
    </div>
  );
}
