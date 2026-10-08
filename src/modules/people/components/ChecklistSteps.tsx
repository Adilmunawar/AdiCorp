import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ConfirmButton, formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useAddChecklistItem, useRemoveChecklistItem, useToggleChecklistItem } from "../api/checklists";
import type { ChecklistItem, ChecklistWithItems } from "../api/types";
import { AUTO_KEYS, autoKeyLabel } from "../lib/constants";
import { errorMessage, isOverdue } from "../lib/utils";

export function checklistProgress(list: Pick<ChecklistWithItems, "items">): { done: number; total: number; ratio: number } {
  const total = list.items.length;
  const done = list.items.filter((i) => i.done_at).length;
  return { done, total, ratio: total ? done / total : 0 };
}

export function nextStep(list: ChecklistWithItems): ChecklistItem | undefined {
  return [...list.items].sort((a, b) => a.position - b.position).find((i) => !i.done_at);
}

/** The steps of one checklist with tick, add and remove (only while open). */
export function ChecklistSteps({ list, compact = false }: { list: ChecklistWithItems; compact?: boolean }) {
  const toggle = useToggleChecklistItem();
  const add = useAddChecklistItem();
  const remove = useRemoveChecklistItem();
  const [title, setTitle] = useState("");
  const editable = list.status === "open";
  const items = [...list.items].sort((a, b) => a.position - b.position);

  const submit = async () => {
    // Enter in the field bypasses the disabled Add button.
    if (add.isPending) return;
    const t = title.trim();
    if (t.length < 3) return toast.error("Steps need at least 3 characters.");
    try {
      await add.mutateAsync({ checklist: list, title: t });
      setTitle("");
    } catch (e) {
      toast.error(errorMessage(e, "Could not add the step."));
    }
  };

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((item) => {
          const auto = autoKeyLabel(item.auto_key);
          const href = AUTO_KEYS.find((k) => k.value === item.auto_key)?.href?.(list.employee_id);
          const overdue = !item.done_at && isOverdue(item.due_date, list.status);
          return (
            <li key={item.id} className={cn("group flex items-start gap-3 py-2.5", compact ? "px-0" : "px-4 sm:px-5")}>
              <Checkbox
                id={`step-${item.id}`}
                checked={!!item.done_at}
                disabled={!editable || toggle.isPending}
                onCheckedChange={async (v) => {
                  try {
                    await toggle.mutateAsync({ item, done: v === true });
                  } catch (e) {
                    toast.error(errorMessage(e, "Could not update the step."));
                  }
                }}
                className="mt-0.5"
                aria-label={item.title}
              />
              <div className="min-w-0 flex-1">
                <label htmlFor={`step-${item.id}`} className={cn("block cursor-pointer text-[13px] font-medium leading-snug", item.done_at && "text-muted-foreground line-through")}>
                  {item.title}
                </label>
                {!compact && item.description && <p className="mt-0.5 text-[11px] text-muted-foreground">{item.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  {item.due_date && <span className={cn(overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>{overdue ? "Overdue · " : "Due "}{formatDate(item.due_date)}</span>}
                  {auto && (
                    <span className="inline-flex items-center gap-1 text-primary" title={item.touched ? "Set by hand: no longer follows live data" : "Ticks itself from live data"}>
                      <Sparkles className="h-3 w-3" />
                      {item.touched ? "Set by hand" : item.done_at ? "Detected" : "Auto"}
                    </span>
                  )}
                  {item.done_at && <span className="text-muted-foreground">Done {formatDate(item.done_at)}</span>}
                  {href && !item.done_at && editable && (
                    <Link to={href} className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
                      Do it <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
              {editable && !compact && (
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                  title="Remove this step?"
                  description={`"${item.title}" is removed from this checklist only. The template is not changed.`}
                  confirmLabel="Remove"
                  aria-label={`Remove ${item.title}`}
                  onConfirm={async () => {
                    try {
                      await remove.mutateAsync({ checklist: list, item });
                    } catch (e) {
                      toast.error(errorMessage(e));
                      throw e;
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
              )}
            </li>
          );
        })}
      </ul>
      {editable && !compact && (
        <div className="flex gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
          <Input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void submit())}
            placeholder="Add a step for this person only…"
            className="h-9 rounded-xl text-[13px]"
            aria-label="New step"
          />
          <Button size="sm" variant="soft" onClick={submit} disabled={add.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
