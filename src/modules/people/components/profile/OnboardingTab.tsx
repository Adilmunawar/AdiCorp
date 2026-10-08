import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ClipboardCheck, ExternalLink, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, ListSkeleton, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useEmployeeChecklists } from "../../api/checklists";
import type { ChecklistWithItems, Employee } from "../../api/types";
import { checklistBadge } from "../../lib/constants";
import { isOverdue } from "../../lib/utils";
import { ChecklistSteps, checklistProgress } from "../ChecklistSteps";
import { ProgressBar } from "../common";
import { StartChecklistDialog } from "../StartChecklistDialog";

const KIND_LABEL = { onboarding: "Onboarding", offboarding: "Offboarding" } as const;

function ChecklistCard({ list }: { list: ChecklistWithItems }) {
  const p = checklistProgress(list);
  const overdue = isOverdue(list.due_date, list.status);
  // Finished lists are history: collapsed until asked for.
  const [open, setOpen] = useState(list.status === "open");
  const closedOn = list.closed_at ? formatDate(list.closed_at) : null;

  return (
    <SectionCard
      title={list.title}
      description={[
        KIND_LABEL[list.kind] ?? "Checklist",
        `started ${formatDate(list.start_date)}`,
        list.status === "open" && list.due_date ? `due ${formatDate(list.due_date)}` : null,
        list.status === "done" && closedOn ? `completed ${closedOn}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      icon={ClipboardCheck}
      flush
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge {...checklistBadge(list.status, overdue)} />
          <Button size="sm" variant="ghost" className="h-9 sm:h-8" asChild>
            <Link to={`/checklists/${list.id}`}>
              <ExternalLink className="h-4 w-4" /> Open
            </Link>
          </Button>
        </div>
      }
    >
      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {p.done} of {p.total} {p.total === 1 ? "step" : "steps"} done
          </span>
          <span className="tabular font-semibold text-foreground">{Math.round(p.ratio * 100)}%</span>
        </div>
        <ProgressBar value={p.ratio} tone={p.ratio >= 1 ? "success" : overdue ? "danger" : "primary"} className="mt-1.5" />
      </div>
      {open ? (
        <div className="border-t border-border/60">
          <ChecklistSteps list={list} />
        </div>
      ) : null}
      {list.status !== "open" && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-border/60 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {open ? "Hide steps" : `Show all ${p.total} steps`}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      )}
    </SectionCard>
  );
}

export function OnboardingTab({ employee }: { employee: Pick<Employee, "id" | "name" | "status" | "joining_date"> }) {
  const { data: lists = [], isLoading } = useEmployeeChecklists(employee.id);
  const [starting, setStarting] = useState<"onboarding" | "offboarding" | null>(null);
  const openKinds = new Set(lists.filter((l) => l.status === "open").map((l) => l.kind));
  const canStart = {
    onboarding: employee.status === "active" && !openKinds.has("onboarding"),
    offboarding: !openKinds.has("offboarding"),
  };
  const openCount = lists.filter((l) => l.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Onboarding and offboarding</h2>
          <p className="text-[12px] text-muted-foreground">
            {isLoading
              ? "Loading checklists…"
              : lists.length === 0
                ? "No checklists for this person yet."
                : `${lists.length} ${lists.length === 1 ? "checklist" : "checklists"}${openCount ? ` · ${openCount} in progress` : ""}`}
          </p>
        </div>
        {(canStart.onboarding || canStart.offboarding) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-10 self-start sm:h-9">
                <Play className="h-4 w-4" /> Start a checklist <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              {canStart.onboarding && <DropdownMenuItem onSelect={() => setStarting("onboarding")}>Onboarding</DropdownMenuItem>}
              {canStart.offboarding && <DropdownMenuItem onSelect={() => setStarting("offboarding")}>Offboarding</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : lists.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={ClipboardCheck}
            title="No checklists yet"
            description="Onboarding starts automatically for new joiners; offboarding starts when someone is separated."
            compact
          />
        </SectionCard>
      ) : (
        lists.map((list) => <ChecklistCard key={list.id} list={list} />)
      )}

      {starting && <StartChecklistDialog open kind={starting} employeeId={employee.id} onOpenChange={(o) => !o && setStarting(null)} />}
    </div>
  );
}
