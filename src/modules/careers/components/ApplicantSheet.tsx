import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, ExternalLink, FileText, Link2, Mail, MessageSquarePlus, Phone, PartyPopper, Trash2, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmButton, ListSkeleton, StatusBadge, formatDate, formatDateTime, formatRelative, initials } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  openCv,
  useAddNote,
  useApplicationNotes,
  useDeleteApplication,
  useDeleteNote,
  useRateApplication,
  useSetApplicationStatus,
} from "../lib/api";
import { MOVABLE_STAGES, formatBytes, stageOf, type Application, type ApplicationStatus } from "../lib/model";
import { RatingStars } from "./RatingStars";

interface ApplicantSheetProps {
  application: Application | null;
  onClose: () => void;
  onHire: (application: Application) => void;
}

export function ApplicantSheet({ application, onClose, onHire }: ApplicantSheetProps) {
  return (
    <Sheet open={Boolean(application)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {application && <ApplicantDetail key={application.id} application={application} onClose={onClose} onHire={onHire} />}
      </SheetContent>
    </Sheet>
  );
}

function ApplicantDetail({ application: a, onClose, onHire }: { application: Application; onClose: () => void; onHire: (a: Application) => void }) {
  const setStatus = useSetApplicationStatus();
  const rate = useRateApplication();
  const remove = useDeleteApplication();
  const stage = stageOf(a.status);
  const hired = a.status === "hired";
  const markedRef = useRef(false);

  // Opening a new application marks it reviewed (clears it from the "new" badge).
  useEffect(() => {
    if (a.status === "new" && !markedRef.current) {
      markedRef.current = true;
      setStatus.mutate({ ids: [a.id], status: "reviewed", silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id]);

  const move = (status: ApplicationStatus) => setStatus.mutate({ ids: [a.id], status });

  return (
    <>
      <SheetHeader className="space-y-0 border-b border-border p-4 text-left sm:p-5">
        <div className="flex items-start gap-3 pr-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">{initials(a.name)}</div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base">{a.name}</SheetTitle>
            <SheetDescription className="truncate text-xs">
              {a.job?.title ?? "Role removed"} · applied {formatRelative(a.created_at)}
            </SheetDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={a.status} label={stage.label} tone={stage.tone} />
              <RatingStars value={a.rating} onChange={(rating) => rate.mutate({ id: a.id, rating })} size="sm" />
            </div>
          </div>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {/* Contact and CV */}
        <div className="grid gap-2 sm:grid-cols-2">
          <ContactRow icon={Mail} label="E-mail" value={a.email} href={`mailto:${a.email}`} />
          <ContactRow icon={Phone} label="Phone" value={a.phone || "—"} href={a.phone ? `tel:${a.phone.replace(/[^\d+]/g, "")}` : undefined} />
          {a.link && <ContactRow icon={Link2} label="Link" value={a.link.replace(/^https?:\/\//, "")} href={a.link} external className="sm:col-span-2" />}
        </div>

        <button
          type="button"
          onClick={() => openCv(a.cv_path)}
          disabled={!a.cv_path}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{a.cv_name || "No CV attached"}</p>
            <p className="text-xs text-muted-foreground">{a.cv_path ? `${formatBytes(a.cv_size)} · opens in a new tab for 5 minutes` : "The candidate did not attach a file."}</p>
          </div>
          {a.cv_path && <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        </button>

        {a.cover_letter && (
          <section>
            <p className="micro-label mb-1.5 text-muted-foreground">Note from the candidate</p>
            <p className="whitespace-pre-line rounded-2xl border border-border bg-muted/30 p-3 text-sm leading-relaxed">{a.cover_letter}</p>
          </section>
        )}

        {/* Stage */}
        <section className="rounded-2xl border border-border p-3">
          <p className="micro-label mb-2 text-muted-foreground">Stage</p>
          {hired ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <UserCheck className="mr-1.5 inline h-4 w-4 text-success" aria-hidden />
                Hired {formatDate(a.status_changed_at)}. They are now an employee.
              </p>
              {a.employee_id && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/employees/${a.employee_id}`}>Open profile</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={a.status} onValueChange={(v) => move(v as ApplicationStatus)}>
                <SelectTrigger className="h-9 sm:w-48" aria-label="Move to stage">
                  <span className="!flex min-w-0 items-center gap-2">
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">
                      <SelectValue />
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {MOVABLE_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-1 gap-2">
                <Button size="sm" className="flex-1 sm:flex-none" onClick={() => onHire(a)}>
                  <PartyPopper className="mr-1.5 h-3.5 w-3.5" /> Hire
                </Button>
                {a.status !== "rejected" && (
                  <Button size="sm" variant="outline" className="flex-1 text-destructive hover:text-destructive sm:flex-none" onClick={() => move("rejected")}>
                    <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>

        <NotesTimeline applicationId={a.id} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3 sm:px-5">
        <ConfirmButton
          size="sm"
          title={`Delete ${a.name}'s application?`}
          description="The application, its notes and the CV file are removed permanently."
          confirmLabel="Delete"
          onConfirm={() => remove.mutateAsync(a.id).then(onClose)}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </ConfirmButton>
        <p className="text-[11px] text-muted-foreground">Received {formatDateTime(a.created_at)}</p>
      </div>
    </>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  external,
  className,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="micro-label text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium" title={value}>
          {value}
        </p>
      </div>
    </>
  );
  const cls = cn("flex min-w-0 items-center gap-2.5 rounded-xl border border-border px-3 py-2", href && "hover:border-primary/40", className);
  return href ? (
    <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function NotesTimeline({ applicationId }: { applicationId: string }) {
  const { user, isOwner } = useAuth();
  const { data: notes = [], isLoading } = useApplicationNotes(applicationId);
  const add = useAddNote(applicationId);
  const del = useDeleteNote(applicationId);
  const [body, setBody] = useState("");

  return (
    <section>
      <p className="micro-label mb-2 text-muted-foreground">Notes and history</p>
      <form
        className="mb-4 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = body.trim();
          if (!text) return;
          add.mutate(text, { onSuccess: () => setBody("") });
        }}
      >
        <Textarea
          rows={3}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Interview feedback, salary expectations, next steps…"
          aria-label="Add a note"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="secondary" disabled={!body.trim() || add.isPending}>
            <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
            {add.isPending ? "Adding…" : "Add note"}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <ListSkeleton />
      ) : notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No notes yet. Stage changes are recorded here too.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {notes.map((n) => (
            <li key={n.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background",
                  n.kind === "note" ? "bg-primary" : n.kind === "hire" ? "bg-success" : "bg-muted-foreground/50",
                )}
                aria-hidden
              />
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs">
                  <span className="font-semibold">{n.author_name || "HR"}</span>
                  <span className="text-muted-foreground"> · {n.kind === "note" ? "note" : n.kind === "hire" ? "hired" : "stage change"}</span>
                </p>
                <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={n.created_at} title={formatDateTime(n.created_at)}>
                  {formatRelative(n.created_at)}
                </time>
              </div>
              <p className={cn("mt-0.5 whitespace-pre-line text-sm", n.kind !== "note" && "text-muted-foreground")}>{n.body}</p>
              {n.kind === "note" && (n.author_id === user?.id || isOwner) && (
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  className="mt-0.5 h-auto px-0 py-0 text-[11px] font-medium text-muted-foreground hover:bg-transparent hover:text-destructive"
                  title="Delete this note?"
                  description="The note is removed from the timeline for everyone."
                  confirmLabel="Delete note"
                  disabled={del.isPending}
                  onConfirm={() => del.mutateAsync(n.id)}
                >
                  Delete
                </ConfirmButton>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
