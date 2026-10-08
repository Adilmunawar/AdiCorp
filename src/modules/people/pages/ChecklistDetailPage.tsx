import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, ClipboardCheck, Laptop, Loader2, PartyPopper, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton, EmptyState, SectionCard, StatusBadge, formatDate, humanize } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useChecklist, useSetChecklistStatus, useUpdateChecklistDetails } from "../api/checklists";
import { useEmployee } from "../api/employees";
import { useEmployeeAssets } from "../api/assets";
import { assetCategoryLabel, checklistBadge } from "../lib/constants";
import { daysUntil, errorMessage, isOverdue } from "../lib/utils";
import { EmployeeChip, Field, ProgressRing } from "../components/common";
import { ChecklistSteps, checklistProgress, nextStep } from "../components/ChecklistSteps";
import { AssetIcon } from "../components/AssetBits";
import { DetailSkeleton, LoadError } from "../components/PageBits";

function Fact({ label, children, hint, hintClassName }: { label: string; children: ReactNode; hint?: ReactNode; hintClassName?: string }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3 sm:px-5">
      <dt className="micro-label">{label}</dt>
      <dd className="mt-1 truncate text-[13px] font-semibold text-foreground">{children}</dd>
      {hint && <dd className={cn("mt-0.5 text-[11px] leading-4 text-muted-foreground", hintClassName)}>{hint}</dd>}
    </div>
  );
}

function BackLink({ kind }: { kind?: string }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-9 px-2 text-muted-foreground" asChild>
      <Link to={kind ? `/checklists?tab=${kind}` : "/checklists"}>
        <ArrowLeft className="h-4 w-4" /> {kind ? humanize(kind) : "Onboarding"}
      </Link>
    </Button>
  );
}

export default function ChecklistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: list, isLoading, isError, refetch } = useChecklist(id);
  const { data: employee, isLoading: loadingEmployee } = useEmployee(list?.employee_id);
  const { data: assets, isLoading: loadingAssets } = useEmployeeAssets(list?.employee_id);
  const setStatus = useSetChecklistStatus();
  const update = useUpdateChecklistDetails();
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (list) {
      setDue(list.due_date ?? "");
      setNote(list.note ?? "");
    }
  }, [list?.id, list?.due_date, list?.note]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading && !list) return <DetailSkeleton sideCards={3} />;
  if (isError && !list) {
    return (
      <div className="animate-in fade-in duration-300">
        <BackLink />
        <LoadError what="This checklist" icon={ClipboardCheck} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!list) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Checklist not found"
        description="It may have been removed, or the link is incomplete."
        action={
          <Button size="sm" asChild>
            <Link to="/checklists">Back to onboarding</Link>
          </Button>
        }
      />
    );
  }

  const p = checklistProgress(list);
  const overdue = isOverdue(list.due_date, list.status);
  const open = list.status === "open";
  const dueIn = daysUntil(list.due_date);
  const next = open ? nextStep(list) : undefined;
  const remaining = p.total - p.done;
  const current = assets?.current ?? [];
  const dirty = due !== (list.due_date ?? "") || note !== (list.note ?? "");
  const dueHint =
    !open || dueIn === null ? undefined : dueIn < 0 ? `${-dueIn} ${-dueIn === 1 ? "day" : "days"} overdue` : dueIn === 0 ? "Due today" : `In ${dueIn} ${dueIn === 1 ? "day" : "days"}`;

  const change = async (status: "open" | "done" | "cancelled", message: string) => {
    try {
      await setStatus.mutateAsync({ id: list.id, status });
      toast.success(message);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  const saveDetails = async () => {
    if (due && due < list.start_date) return toast.error("The due date cannot be before the start date.");
    try {
      await update.mutateAsync({ id: list.id, due: due || null, note: note.trim() || null });
      toast.success("Details saved");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="animate-in fade-in duration-300">
      <BackLink kind={list.kind} />

      <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <ProgressRing value={p.ratio} size={72} label={`${p.done} of ${p.total} steps done`} />
          <div className="min-w-0 flex-1">
            <p className="micro-label !text-primary">
              {humanize(list.kind)} · {list.title}
            </p>
            {employee ? (
              <>
                <h1 className="truncate font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                  <Link to={`/employees/${employee.id}`} className="-my-2 inline-block max-w-full truncate rounded py-2 align-top hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Open profile">
                    {employee.name}
                  </Link>
                </h1>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{[employee.employee_code, employee.rank].filter(Boolean).join(" · ")}</p>
              </>
            ) : loadingEmployee ? (
              <div aria-busy="true" aria-label="Loading">
                <Skeleton className="mt-1 h-7 w-48" />
                <Skeleton className="mt-2 h-3.5 w-36" />
              </div>
            ) : (
              <h1 className="truncate font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Former employee</h1>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <StatusBadge {...checklistBadge(list.status, overdue)} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60 lg:grid-cols-4">
          <Fact label="Started">{formatDate(list.start_date)}</Fact>
          <Fact label="Due" hint={dueHint} hintClassName={cn(overdue && "font-medium text-danger")}>
            {list.due_date ? formatDate(list.due_date) : <span className="text-muted-foreground">No due date</span>}
          </Fact>
          <Fact label={open ? "Left to do" : list.status === "done" ? "Completed" : "Cancelled"} hint={open ? `${p.done} done` : undefined}>
            {open ? `${remaining} ${remaining === 1 ? "step" : "steps"}` : formatDate(list.closed_at)}
          </Fact>
          <Fact label="Next step" hint={next?.due_date ? `${isOverdue(next.due_date, list.status) ? "Was due" : "Due"} ${formatDate(next.due_date)}` : undefined}>
            {next ? <span title={next.title}>{next.title}</span> : <span className="text-muted-foreground">{open ? "All steps done" : "—"}</span>}
          </Fact>
        </dl>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <SectionCard
            title="Steps"
            description={open ? "Tick steps as you go. Auto steps update from live data until you set them by hand." : "This checklist is closed. Reopen it to change steps."}
            actions={
              <span className="tabular text-[12px] text-muted-foreground">
                {remaining > 0 ? `${remaining} to do · ${p.done} done` : `All ${p.total} done`}
              </span>
            }
            flush
          >
            {list.items.length === 0 ? <EmptyState icon={ClipboardCheck} title="No steps yet" description={open ? "Add the first step below." : undefined} compact /> : null}
            <ChecklistSteps list={list} />
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-4">
          <SectionCard title="Finish">
            {open ? (
              <div className="space-y-2">
                {remaining === 0 && p.total > 0 && (
                  <p className="mb-1 flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2 text-[12px] font-medium text-success">
                    <PartyPopper className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Every step is done. Complete the checklist to close it.
                  </p>
                )}
                <ConfirmButton
                  className="h-10 w-full"
                  destructive={false}
                  title={remaining > 0 ? `Complete with ${remaining} ${remaining === 1 ? "step" : "steps"} still open?` : "Mark as complete?"}
                  description="The checklist is frozen. You can reopen it later."
                  confirmLabel="Complete"
                  onConfirm={() => change("done", "Checklist completed")}
                >
                  <CheckCircle2 className="h-4 w-4" /> Complete
                </ConfirmButton>
                <ConfirmButton
                  className="h-10 w-full"
                  variant="outline"
                  title="Cancel this checklist?"
                  description={list.kind === "onboarding" ? "Use this when the person never joined." : "Use this when the person stays after all."}
                  confirmLabel="Cancel checklist"
                  cancelLabel="Keep it"
                  onConfirm={() => change("cancelled", "Checklist cancelled")}
                >
                  <Ban className="h-4 w-4" /> Cancel checklist
                </ConfirmButton>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">
                  {list.status === "done" ? "Completed" : "Cancelled"} on <span className="font-medium text-foreground">{formatDate(list.closed_at)}</span>.
                </p>
                <Button variant="outline" className="h-10 w-full" disabled={setStatus.isPending} onClick={() => change("open", "Checklist reopened").catch(() => undefined)}>
                  {setStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reopen
                </Button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Details">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (open && dirty && !update.isPending) void saveDetails();
              }}
            >
              <Field id="cl-due" label="Due date" hint={open ? undefined : "Reopen the checklist to change it."}>
                <Input id="cl-due" type="date" min={list.start_date} value={due} disabled={!open} onChange={(e) => setDue(e.target.value)} className="h-10 rounded-xl" />
              </Field>
              <Field id="cl-note" label="Note">
                <Textarea id="cl-note" value={note} disabled={!open} maxLength={1000} rows={3} placeholder={open ? "Anything the team should know" : undefined} onChange={(e) => setNote(e.target.value)} className="rounded-xl" />
              </Field>
              {open && (
                <Button type="submit" size="sm" variant="soft" disabled={update.isPending || !dirty}>
                  {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save details
                </Button>
              )}
            </form>
          </SectionCard>

          <SectionCard
            title={list.kind === "offboarding" ? "Equipment to collect" : "Their equipment"}
            icon={Laptop}
            description={current.length ? `${current.length} ${current.length === 1 ? "item" : "items"} with them now` : undefined}
            flush
          >
            {loadingAssets ? (
              <div className="space-y-2 px-4 py-4 sm:px-5" aria-busy="true" aria-label="Loading">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : current.length === 0 ? (
              <p className="px-4 py-4 text-[12px] text-muted-foreground sm:px-5">{list.kind === "offboarding" ? "Nothing to collect. Everything is back in store." : "No assets with them right now."}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {current.map((a) => (
                  <li key={a.id}>
                    <Link to={`/assets/${a.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40 sm:px-5">
                      <AssetIcon category={a.category} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">{a.name}</span>
                        <span className="tabular block truncate text-[11px] text-muted-foreground">
                          {a.tag} · {assetCategoryLabel(a.category)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
