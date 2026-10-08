import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Pencil, Plus, Settings2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CardSkeleton, ConfirmButton, ConfirmDialog, EmptyState, PageHeader, RowActions, SectionCard, StatusBadge, TabsNav, useTabParam, type TabItem } from "@/components/kit";
import {
  useChecklistTemplates,
  useDeleteTemplate,
  useDeleteTemplateStep,
  useSaveTemplate,
  useSaveTemplateStep,
  useSwapTemplateSteps,
  type TemplateWithSteps,
} from "../api/checklists";
import type { ChecklistTemplateStep } from "../api/types";
import { AUTO_KEYS, autoKeyLabel, type ChecklistKind } from "../lib/constants";
import { errorMessage } from "../lib/utils";
import { Field } from "../components/common";
import { LoadError } from "../components/PageBits";

const MANUAL = "__manual__";

/** "On the joining day", "3 days after joining" — plain words for a step's due offset. */
function dueLabel(days: number, kind: ChecklistKind): string {
  const anchor = kind === "onboarding" ? "joining" : "the last day";
  if (days <= 0) return kind === "onboarding" ? "Due on the joining day" : "Due on the last day";
  return `Due ${days} ${days === 1 ? "day" : "days"} after ${anchor}`;
}

function TemplateDialog({ kind, template, onClose }: { kind: ChecklistKind; template: TemplateWithSteps | null; onClose: () => void }) {
  const save = useSaveTemplate();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [days, setDays] = useState(String(template?.default_due_days ?? (kind === "onboarding" ? 14 : 7)));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const d = Number(days);
    if (name.trim().length < 2) return setError("Enter a name.");
    if (!Number.isInteger(d) || d < 0 || d > 365) return setError("Due within 0 to 365 days.");
    try {
      await save.mutateAsync({ id: template?.id, kind, name, description, default_due_days: d });
      toast.success(template ? "Template saved" : "Template created");
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save the template."));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : `New ${kind} template`}</DialogTitle>
          <DialogDescription>e.g. a separate onboarding for engineers or for field staff.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="tpl-name" label="Name" required>
            <Input id="tpl-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field id="tpl-desc" label="Description">
            <Textarea id="tpl-desc" value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} className="rounded-xl" />
          </Field>
          <Field id="tpl-days" label="Due after (days)" hint={kind === "onboarding" ? "Counted from the joining date." : "Counted from the last working day."}>
            <Input id="tpl-days" type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="h-10 rounded-xl" />
          </Field>
          {error && <p role="alert" className="text-[12px] font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepDialog({ kind, template, step, onClose }: { kind: ChecklistKind; template: TemplateWithSteps; step: ChecklistTemplateStep | null; onClose: () => void }) {
  const save = useSaveTemplateStep();
  const [title, setTitle] = useState(step?.title ?? "");
  const [description, setDescription] = useState(step?.description ?? "");
  const [autoKey, setAutoKey] = useState(step?.auto_key ?? MANUAL);
  const [offset, setOffset] = useState(String(step?.due_offset_days ?? 0));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [title, offset]);

  const submit = async () => {
    const o = Number(offset);
    if (title.trim().length < 3) return setError("Steps need at least 3 characters.");
    if (!Number.isInteger(o) || o < 0 || o > 365) return setError("Due offset is 0 to 365 days.");
    try {
      await save.mutateAsync({
        id: step?.id,
        template_id: template.id,
        title,
        description,
        auto_key: autoKey === MANUAL ? null : autoKey,
        due_offset_days: o,
        position: Math.max(0, ...template.steps.map((s) => s.position)) + 1,
      });
      toast.success(step ? "Step saved" : "Step added");
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save the step."));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{step ? "Edit step" : "Add a step"}</DialogTitle>
          <DialogDescription>Changes apply to checklists started from now on.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="step-title" label="Title" required>
            <Input id="step-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field id="step-desc" label="Description">
            <Textarea id="step-desc" value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} className="rounded-xl" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field id="step-auto" label="Ticks itself when" hint="Leave as manual to tick by hand.">
              <Select value={autoKey} onValueChange={setAutoKey}>
                <SelectTrigger id="step-auto" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MANUAL}>Manual step</SelectItem>
                  {AUTO_KEYS.filter((k) => k.kind === kind).map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="step-offset" label="Due (+days)">
              <Input id="step-offset" type="number" min={0} max={365} value={offset} onChange={(e) => setOffset(e.target.value)} className="h-10 rounded-xl" />
            </Field>
          </div>
          {error && <p role="alert" className="text-[12px] font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({ template, kind }: { template: TemplateWithSteps; kind: ChecklistKind }) {
  const removeTemplate = useDeleteTemplate();
  const removeStep = useDeleteTemplateStep();
  const swap = useSwapTemplateSteps();
  const [editing, setEditing] = useState(false);
  const [stepDialog, setStepDialog] = useState<ChecklistTemplateStep | null | "new">(null);
  const [removing, setRemoving] = useState<ChecklistTemplateStep | null>(null);
  const steps = [...template.steps].sort((a, b) => a.position - b.position);

  const move = async (i: number, dir: -1 | 1) => {
    const other = steps[i + dir];
    if (!other) return;
    try {
      await swap.mutateAsync({ a: steps[i], b: other });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {template.name}
          {template.is_default && <StatusBadge status="default" tone="primary" label="Default" dot={false} />}
        </span>
      }
      description={`${steps.length} ${steps.length === 1 ? "step" : "steps"} · finish within ${template.default_due_days} ${template.default_due_days === 1 ? "day" : "days"} of ${kind === "onboarding" ? "joining" : "the last day"}${template.description ? ` · ${template.description}` : ""}`}
      flush
      actions={
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-10 sm:h-8" onClick={() => setEditing(true)} aria-label={`Edit ${template.name}`}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {!template.is_default && (
            <ConfirmButton
              size="sm"
              variant="ghost"
              aria-label={`Delete ${template.name}`}
              className="h-10 w-10 p-0 text-destructive hover:text-destructive sm:h-8 sm:w-8"
              title={`Delete ${template.name}?`}
              description="Checklists already started from it are kept."
              confirmLabel="Delete"
              onConfirm={async () => {
                try {
                  await removeTemplate.mutateAsync(template);
                  toast.success("Template deleted");
                } catch (e) {
                  toast.error(errorMessage(e));
                  throw e;
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </ConfirmButton>
          )}
        </div>
      }
    >
      {steps.length === 0 ? (
        <EmptyState icon={Settings2} title="No steps" description="Add the first step below." compact />
      ) : (
        <ol className="divide-y divide-border/60">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
              <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{s.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{dueLabel(s.due_offset_days, kind)}</span>
                  {s.auto_key && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary"
                      title={`Ticks itself when: ${autoKeyLabel(s.auto_key) ?? "the data is in place"}`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {(autoKeyLabel(s.auto_key) ?? "").toLowerCase() === s.title.trim().toLowerCase() || !autoKeyLabel(s.auto_key) ? "Auto" : `Auto: ${autoKeyLabel(s.auto_key)}`}
                    </span>
                  )}
                </p>
              </div>
              <div className="-mr-2 shrink-0 sm:hidden">
                <RowActions
                  label={`Actions for ${s.title}`}
                  className="h-10 w-10"
                  actions={[
                    { label: "Move up", icon: ArrowUp, disabled: i === 0 || swap.isPending, onSelect: () => move(i, -1) },
                    { label: "Move down", icon: ArrowDown, disabled: i === steps.length - 1 || swap.isPending, onSelect: () => move(i, 1) },
                    { label: "Edit", icon: Pencil, onSelect: () => setStepDialog(s) },
                    { label: "Remove", icon: Trash2, destructive: true, separated: true, onSelect: () => setRemoving(s) },
                  ]}
                />
              </div>
              <div className="hidden shrink-0 items-center sm:flex">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0 || swap.isPending} onClick={() => move(i, -1)} aria-label={`Move ${s.title} up`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === steps.length - 1 || swap.isPending} onClick={() => move(i, 1)} aria-label={`Move ${s.title} down`}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setStepDialog(s)} aria-label={`Edit ${s.title}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <ConfirmButton
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Remove this step?"
                  description="Checklists already started keep it."
                  confirmLabel="Remove"
                  aria-label={`Remove ${s.title}`}
                  onConfirm={async () => {
                    try {
                      await removeStep.mutateAsync(s.id);
                    } catch (e) {
                      toast.error(errorMessage(e));
                      throw e;
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-border/60 px-4 py-2.5 sm:px-5">
        <Button size="sm" variant="soft" onClick={() => setStepDialog("new")}>
          <Plus className="h-4 w-4" /> Add step
        </Button>
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this step?"
        description="Checklists already started keep it."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeStep.mutateAsync(removing.id);
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      {editing && <TemplateDialog kind={kind} template={template} onClose={() => setEditing(false)} />}
      {stepDialog && <StepDialog kind={kind} template={template} step={stepDialog === "new" ? null : stepDialog} onClose={() => setStepDialog(null)} />}
    </SectionCard>
  );
}

export default function ChecklistTemplatesPage() {
  const { data: templates = [], isLoading, isError, refetch } = useChecklistTemplates();
  const tabs: TabItem[] = [
    { value: "onboarding", label: "Onboarding" },
    { value: "offboarding", label: "Offboarding" },
  ];
  const [kind] = useTabParam(tabs);
  const [creating, setCreating] = useState(false);
  const list = templates.filter((t) => t.kind === kind);

  return (
    <div className="animate-in fade-in duration-300">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-9 px-2 text-muted-foreground" asChild>
        <Link to={`/checklists?tab=${kind}`}>
          <ArrowLeft className="h-4 w-4" /> Onboarding &amp; offboarding
        </Link>
      </Button>
      <PageHeader
        title="Checklist templates"
        icon={Settings2}
        eyebrow="People"
        description="The steps copied into every new checklist. Due offsets count from the joining date or the last working day."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New {kind} template
          </Button>
        }
      />
      <TabsNav tabs={tabs} className="mb-4" />
      {isError ? (
        <LoadError what="Templates" icon={Settings2} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={6} />
        </div>
      ) : list.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Settings2}
            title={`No ${kind} templates yet`}
            description="A template lists the steps every new checklist starts with."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> New template
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {list.map((t) => (
            <TemplateCard key={t.id} template={t} kind={kind as ChecklistKind} />
          ))}
        </div>
      )}
      {creating && <TemplateDialog kind={kind as ChecklistKind} template={null} onClose={() => setCreating(false)} />}
    </div>
  );
}
