import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRightLeft, Briefcase, CloudOff, Download, Eye, FileText, KanbanSquare, List, PartyPopper, Plus, RotateCw, SearchX, Share2, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  RowActions,
  StatusBadge,
  TabsNav,
  downloadCsv,
  formatDate,
  formatDateTime,
  toDbDate,
  useTabParam,
  type DataColumn,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import { useMediaBelow } from "@/hooks/use-mobile";
import { openCv, useApplications, useDeleteApplication, useJobs, useSetApplicationStatus } from "../lib/api";
import { MOVABLE_STAGES, STAGES, stageOf, type Application, type ApplicationStatus } from "../lib/model";
import { ApplicantSheet } from "../components/ApplicantSheet";
import { HireDialog } from "../components/HireDialog";
import { PipelineBoard } from "../components/PipelineBoard";
import { RatingStars } from "../components/RatingStars";

const ALL = "all";
const VIEWS = [
  { value: "board", label: "Board", icon: KanbanSquare },
  { value: "table", label: "Table", icon: List },
];

function exportApplications(rows: Application[]) {
  downloadCsv(
    rows.map((a) => ({
      Name: a.name,
      Email: a.email,
      Phone: a.phone,
      Role: a.job?.title ?? "",
      Stage: stageOf(a.status).label,
      Rating: a.rating ?? "",
      Link: a.link,
      Applied: formatDateTime(a.created_at),
    })),
    // Local date: toISOString() is UTC and names the file after yesterday before 05:00 in Pakistan.
    `applicants-${toDbDate()}.csv`,
  );
}

function countByStatus(rows: Application[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const a of rows) c[a.status] = (c[a.status] ?? 0) + 1;
  return c;
}

export default function ApplicantsPage() {
  const [params, setParams] = useSearchParams();
  // Phones default to the list: a seven-column board is a lot of sideways swiping.
  const isPhone = useMediaBelow(640);
  const [view, setView] = useTabParam(VIEWS, isPhone ? "table" : "board", "view");
  const jobFilter = params.get("job") ?? ALL;
  const stageFilter = (params.get("stage") ?? ALL) as ApplicationStatus | typeof ALL;
  const openId = params.get("application");

  const { data: applications = [], isPending: isLoading, isError, refetch, isRefetching } = useApplications();
  const { data: jobs = [] } = useJobs();
  const setStatus = useSetApplicationStatus();
  const remove = useDeleteApplication();
  const [search, setSearch] = useState("");
  const [hiring, setHiring] = useState<Application | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (value === null || value === ALL) p.delete(key);
          else p.set(key, value);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  const byJob = useMemo(() => (jobFilter === ALL ? applications : applications.filter((a) => a.job_id === jobFilter)), [applications, jobFilter]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byJob;
    return byJob.filter((a) => [a.name, a.email, a.phone, a.job?.title].some((v) => v?.toLowerCase().includes(q)));
  }, [byJob, search]);

  // Stage chips follow the search; the header describes the whole role (or all roles).
  const counts = useMemo(() => countByStatus(searched), [searched]);
  const totals = useMemo(() => countByStatus(byJob), [byJob]);

  const tableRows = useMemo(() => (stageFilter === ALL ? searched : searched.filter((a) => a.status === stageFilter)), [searched, stageFilter]);

  const selected = useMemo(() => (openId ? applications.find((a) => a.id === openId) ?? null : null), [applications, openId]);
  const open = (a: Application) => setParam("application", a.id);
  const close = () => setParam("application", null);
  const move = (a: Application, status: ApplicationStatus) => setStatus.mutate({ ids: [a.id], status });
  const activeJob = jobs.find((j) => j.id === jobFilter);

  const columns: DataColumn<Application>[] = [
    {
      id: "name",
      header: "Candidate",
      sortValue: (a) => a.name.toLowerCase(),
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{a.name}</p>
          <p className="truncate text-xs text-muted-foreground">{a.email}</p>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      hideBelow: "md",
      sortValue: (a) => a.job?.title.toLowerCase() ?? "",
      cell: (a) => <span className="text-muted-foreground">{a.job?.title ?? "—"}</span>,
    },
    {
      id: "stage",
      header: "Stage",
      sortValue: (a) => STAGES.findIndex((s) => s.value === a.status),
      cell: (a) => {
        const s = stageOf(a.status);
        return <StatusBadge status={a.status} label={s.label} tone={s.tone} />;
      },
    },
    {
      id: "rating",
      header: "Rating",
      hideBelow: "lg",
      sortValue: (a) => a.rating ?? 0,
      cell: (a) => (a.rating ? <RatingStars value={a.rating} size="sm" /> : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "applied",
      header: "Applied",
      align: "right",
      hideBelow: "sm",
      sortValue: (a) => a.created_at,
      cell: (a) => (
        <span className="tabular text-muted-foreground" title={formatDateTime(a.created_at)}>
          {formatDate(a.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (a) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            label={`Actions for ${a.name}`}
            actions={[
              { label: "Open", icon: Eye, onSelect: () => open(a) },
              { label: "View CV", icon: FileText, hidden: !a.cv_path, onSelect: () => openCv(a.cv_path) },
              { label: "Shortlist", icon: ArrowRightLeft, hidden: a.status === "hired" || a.status === "shortlisted", onSelect: () => move(a, "shortlisted") },
              { label: "Move to interview", icon: ArrowRightLeft, hidden: a.status === "hired" || a.status === "interview", onSelect: () => move(a, "interview") },
              { label: "Hire", icon: PartyPopper, hidden: a.status === "hired", onSelect: () => setHiring(a) },
              { label: "Reject", icon: X, hidden: a.status === "hired" || a.status === "rejected", destructive: true, onSelect: () => move(a, "rejected") },
              {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                separated: true,
                onSelect: () => remove.mutateAsync(a.id),
                confirm: { title: `Delete ${a.name}'s application?`, description: "The application, its notes and the CV file are removed permanently.", confirmLabel: "Delete" },
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const hasAny = applications.length > 0;
  // A failed first load must not read as "no applications yet".
  const failed = isError && !hasAny;
  const showTools = isLoading || hasAny;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        icon={Users}
        eyebrow="Hiring"
        title={activeJob ? `Applicants · ${activeJob.title}` : "Applicants"}
        description={
          isLoading || !hasAny
            ? "Everyone who applied through your careers page."
            : `${byJob.length} ${byJob.length === 1 ? "applicant" : "applicants"} · ${totals.new ?? 0} new · ${(totals.shortlisted ?? 0) + (totals.interview ?? 0) + (totals.offered ?? 0)} in progress`
        }
        actions={
          showTools ? (
            <>
              <Button variant="outline" size="sm" className="h-[38px]" onClick={() => exportApplications(tableRows)} disabled={tableRows.length === 0}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
              <TabsNav tabs={VIEWS} value={view} onChange={setView} param="view" className="p-0.5" />
            </>
          ) : undefined
        }
      />

      {showTools && (
        <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name, e-mail or phone">
          <Select value={jobFilter} onValueChange={(v) => setParam("job", v)}>
            <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Filter by role">
              <span className="!flex min-w-0 items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  <SelectValue placeholder="All roles" />
                </span>
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.title}
                  {j.status === "closed" ? " (closed)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>
      )}

      {failed ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={CloudOff}
            title="Applicants could not be loaded"
            description="The hiring data did not come back from the server. Check your connection and try again."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                <RotateCw className={isRefetching ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} /> Try again
              </Button>
            }
          />
        </div>
      ) : !isLoading && !hasAny ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={Users}
            title="No applications yet"
            description="Applications sent from your public careers page land here, and HR is notified the moment one arrives."
            action={
              <Button asChild size="sm">
                <Link to={jobs.length ? "/hiring/jobs" : "/hiring/jobs/new"}>
                  {jobs.length ? <Share2 className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  {jobs.length ? "Share your roles" : "Post a job"}
                </Link>
              </Button>
            }
          />
        </div>
      ) : view === "board" ? (
        isLoading ? (
          <div className="flex gap-3 overflow-hidden">
            {STAGES.slice(0, 4).map((s) => (
              <div key={s.value} className="h-64 w-[264px] shrink-0 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : searched.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <EmptyState icon={SearchX} title="No applicants match" description="Try another search or role." compact />
          </div>
        ) : (
          <PipelineBoard applications={searched} onOpen={open} onMove={move} onHire={setHiring} singleJob={jobFilter !== ALL} />
        )
      ) : (
        <>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 hide-scrollbar" role="group" aria-label="Filter by stage">
            <StageChip label="All" count={searched.length} active={stageFilter === ALL} onClick={() => setParam("stage", null)} />
            {STAGES.map((s) => (
              <StageChip key={s.value} label={s.label} count={counts[s.value] ?? 0} active={stageFilter === s.value} onClick={() => setParam("stage", s.value)} />
            ))}
          </div>
          <DataTable
            columns={columns}
            rows={tableRows}
            getRowId={(a) => a.id}
            loading={isLoading}
            selectable
            pageSize={25}
            initialSort={{ column: "applied", direction: "desc" }}
            onRowClick={open}
            mobileTitle={(a) => a.name}
            caption="Applicants"
            bulkActions={(rows, clear) => <BulkActions rows={rows} clear={clear} />}
            empty={<EmptyState icon={SearchX} title="No applicants match" description="Try another stage, role or search." compact />}
          />
        </>
      )}

      <ApplicantSheet application={selected} onClose={close} onHire={setHiring} />
      <HireDialog application={hiring} onOpenChange={(v) => !v && setHiring(null)} />
      {!isLoading && openId && !selected && hasAny && <MissingApplication onDismiss={close} />}
    </div>
  );
}

function StageChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("tabular rounded-full px-1.5 text-[10px] font-bold", active ? "bg-primary-foreground/20" : "bg-muted")}>{count}</span>
    </button>
  );
}

function BulkActions({ rows, clear }: { rows: Application[]; clear: () => void }) {
  const setStatus = useSetApplicationStatus();
  const movable = rows.filter((r) => r.status !== "hired");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value=""
        onValueChange={(v) => setStatus.mutate({ ids: movable.map((r) => r.id), status: v as ApplicationStatus }, { onSuccess: clear })}
        disabled={movable.length === 0 || setStatus.isPending}
      >
        <SelectTrigger className="h-8 w-44 text-xs" aria-label="Move selected to stage">
          <SelectValue placeholder="Move to stage…" />
        </SelectTrigger>
        <SelectContent>
          {MOVABLE_STAGES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-8" onClick={() => exportApplications(rows)}>
        <Download className="mr-1.5 h-3.5 w-3.5" /> Export
      </Button>
    </div>
  );
}

function MissingApplication({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm shadow-lg">
      <span>That application no longer exists. It may have been deleted.</span>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}


