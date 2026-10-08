import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useCreatePolicy } from "../lib/api";
import { errorMessage } from "../lib/company";
import { POLICY_TEMPLATES } from "../lib/templates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselect a template id. */
  initialTemplate?: string | null;
}

/** Create a policy with its first draft, blank or from a starting text. */
export function NewPolicyDialog({ open, onOpenChange, initialTemplate }: Props) {
  const navigate = useNavigate();
  const { company } = useAuth();
  const create = useCreatePolicy();
  const [template, setTemplate] = useState<string>(initialTemplate ?? "blank");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(true);

  const pick = (id: string) => {
    const prev = POLICY_TEMPLATES.find((x) => x.id === template);
    const next = POLICY_TEMPLATES.find((x) => x.id === id);
    setTemplate(id);
    // Swap the prefilled title and summary, but never overwrite what HR typed.
    if (!title.trim() || title === prev?.title) setTitle(next?.title ?? "");
    if (!summary.trim() || summary === prev?.summary) setSummary(next?.summary ?? "");
  };

  const reset = () => {
    setTemplate("blank");
    setTitle("");
    setSummary("");
    setRequiresSignature(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = POLICY_TEMPLATES.find((x) => x.id === template);
    try {
      const id = await create.mutateAsync({
        title: title.trim(),
        summary: summary.trim(),
        requiresSignature,
        body: t ? t.body(company?.name || "the company") : "",
      });
      toast.success("Policy created", { description: "Finish the text and publish it when it is ready." });
      onOpenChange(false);
      reset();
      navigate(`/policies/${id}?tab=editor`);
    } catch (err) {
      toast.error("Could not create the policy", { description: errorMessage(err) });
    }
  };

  const titleOk = title.trim().length >= 2 && title.trim().length <= 120;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New policy</DialogTitle>
            <DialogDescription>It starts as a draft. Nobody sees it until you publish it.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <p className="micro-label">Start from</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[{ id: "blank", title: "Blank", summary: "Write it yourself." }, ...POLICY_TEMPLATES].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    template === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                  )}
                  aria-pressed={template === t.id}
                >
                  <p className="text-xs font-bold text-foreground">{t.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{t.summary}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="policy-title">Title</Label>
            <Input id="policy-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Code of Conduct" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policy-summary">Summary</Label>
            <Textarea
              id="policy-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="One sentence employees see in the list."
            />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <Label htmlFor="policy-sign" className="text-sm">
                Everyone must sign it
              </Label>
              <p className="text-[11px] text-muted-foreground">Active employees are asked to read and sign each published version.</p>
            </div>
            <Switch id="policy-sign" checked={requiresSignature} onCheckedChange={setRequiresSignature} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!titleOk || create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
