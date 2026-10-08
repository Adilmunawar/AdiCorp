import { useState, type DragEvent } from "react";
import { FileText, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { formatRelative, initials } from "@/components/kit";
import { cn } from "@/lib/utils";
import { STAGES, type Application, type ApplicationStatus } from "../lib/model";
import { RatingStars } from "./RatingStars";

interface PipelineBoardProps {
  applications: Application[];
  onOpen: (application: Application) => void;
  onMove: (application: Application, status: ApplicationStatus) => void;
  onHire: (application: Application) => void;
  /** Hide the job title on cards when the board is filtered to one job. */
  singleJob?: boolean;
}

const TONE_BAR: Record<string, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
  danger: "bg-destructive",
};

/** Kanban of the hiring pipeline. Drag a card to another column (desktop) or open it to change stage. */
export function PipelineBoard({ applications, onOpen, onMove, onHire, singleJob }: PipelineBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ApplicationStatus | null>(null);

  const drop = (e: DragEvent, status: ApplicationStatus) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    const app = applications.find((a) => a.id === id);
    if (!app || app.status === status) return;
    if (app.status === "hired") {
      toast.error(`${app.name} is already hired and has an employee record.`);
      return;
    }
    if (status === "hired") onHire(app);
    else onMove(app, status);
  };

  return (
    <div
      className="-mx-1 overflow-x-auto pb-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5"
      role="region"
      aria-label="Hiring pipeline"
      tabIndex={0}
    >
      <div className="flex min-w-max snap-x snap-mandatory gap-3 px-1">
        {STAGES.map((stage) => {
          const items = applications.filter((a) => a.status === stage.value);
          return (
            <section
              key={stage.value}
              aria-label={`${stage.label}: ${items.length}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (over !== stage.value) setOver(stage.value);
              }}
              onDragLeave={() => setOver((o) => (o === stage.value ? null : o))}
              onDrop={(e) => drop(e, stage.value)}
              className={cn(
                "flex w-[264px] shrink-0 snap-start flex-col rounded-2xl border border-border bg-muted/40 transition-colors",
                over === stage.value && "border-primary/50 bg-primary/[0.05]",
              )}
            >
              <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_BAR[stage.tone] ?? "bg-muted-foreground")} aria-hidden />
                  <h3 className="micro-label truncate text-foreground">{stage.label}</h3>
                </div>
                <span className="tabular rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{items.length}</span>
              </header>
              <div className="flex max-h-[calc(100dvh-20rem)] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
                {items.length === 0 ? (
                  <p className="m-1 rounded-xl border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">{stage.hint}</p>
                ) : (
                  items.map((a) => (
                    <article
                      key={a.id}
                      draggable={a.status !== "hired"}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", a.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(a.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      className={cn(
                        "group rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
                        dragId === a.id && "opacity-50",
                      )}
                    >
                      <button type="button" onClick={() => onOpen(a)} className="block w-full text-left focus-visible:outline-none">
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{initials(a.name)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{a.name}</p>
                            {!singleJob && <p className="truncate text-xs text-muted-foreground">{a.job?.title ?? "Role removed"}</p>}
                          </div>
                          {a.status !== "hired" && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/40" aria-hidden />}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">{formatRelative(a.created_at)}</span>
                          <span className="flex items-center gap-1.5">
                            <RatingStars value={a.rating} size="sm" />
                            {a.cv_path && <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-label="CV attached" />}
                          </span>
                        </div>
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
