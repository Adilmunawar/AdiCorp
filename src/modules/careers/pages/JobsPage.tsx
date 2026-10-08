import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, CircleCheck, CloudOff, Copy, ExternalLink, Inbox, Lock, LockOpen, Pencil, Plus, RotateCw, Trash2, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  RowActions,
  StatGrid,
  StatTile,
  StatusBadge,
  formatDate,
  type DataColumn,
} from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useCompanySlug, useDeleteJob, useJobs, useSetJobStatus } from "../lib/api";
import { careersUrl, employmentTypeLabel, isAccepting, todayIn, workplaceLabel, type JobWithCounts } from "../lib/model";
import { CareersLinkCard, copyText } from "../components/CareersLinkCard";

type StatusFilter = "all" | "open" | "closed";

export default function JobsPage() {
  const navigate = useNavigate();
  const { company } = useAuth();
  // Closing dates flip at the company's midnight, the same moment the careers page drops the role.
  const today = todayIn(company?.timezone);
  const { data: jobs = [], isPending: isLoading, isError, refetch, isRefetching } = useJobs();
  // A failed first load must not masquerade as "no jobs yet".
  const failed = isError && jobs.length === 0;
  const { data: slug } = useCompanySlug();
  const setStatus = useSetJobStatus();
  const deleteJob = useDeleteJob();
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState<StatusFilter>("all");

  const stats = useMemo(() => {
    const listed = jobs.filter((j) => isAccepting(j, today)).length;
    return {
      listed,
      applicants: jobs.reduce((n, j) => n + j.total, 0),
      fresh: jobs.reduce((n, j) => n + j.fresh, 0),
      hired: jobs.reduce((n, j) => n + j.hired, 0),
      active: jobs.reduce((n, j) => n + j.active, 0),
    };
  }, [jobs, today]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .filter((j) => status === "all" || j.status === status)
      .filter((j) => !q || [j.title, j.department, j.location].some((v) => v?.toLowerCase().includes(q)))
      // Open roles first, then newest.
      .sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === "open" ? -1 : 1));
  }, [jobs, search, status]);

  const columns: DataColumn<JobWithCounts>[] = [
    {
      id: "title",
      header: "Role",
      sortValue: (j) => j.title.toLowerCase(),
      cell: (j) => (
        <div className="min-w-0">
          <Link to={`/hiring/jobs/${j.id}`} className="font-semibold text-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
            {j.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {[
              employmentTypeLabel(j.employment_type),
              j.workplace !== "onsite" ? workplaceLabel(j.workplace) : null,
              j.openings > 1 ? `${j.openings} openings` : null,
              j.closes_on ? `${j.status === "open" && !isAccepting(j, today) ? "closed" : "closes"} ${formatDate(j.closes_on)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ),
    },
    {
      id: "team",
      header: "Department · location",
      hideBelow: "md",
      sortValue: (j) => (j.department ?? "").toLowerCase(),
      cell: (j) => <span className="text-muted-foreground">{[j.department, j.location].filter(Boolean).join(" · ") || "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortValue: (j) => (isAccepting(j, today) ? 0 : 1),
      cell: (j) =>
        j.status === "open" && !isAccepting(j, today) ? (
          <StatusBadge status="expired" label="Past closing date" tone="warning" />
        ) : (
          <StatusBadge status={j.status} label={j.status === "open" ? "Open" : "Closed"} />
        ),
    },
    {
      id: "applicants",
      header: "Applicants",
      align: "right",
      sortValue: (j) => j.total,
      cell: (j) => (
        <div className="flex items-center justify-end gap-2">
          <Link to={`/hiring/applicants?job=${j.id}`} className="tabular font-semibold text-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
            {j.total}
          </Link>
          {j.fresh > 0 && <span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{j.fresh} new</span>}
        </div>
      ),
    },
    {
      id: "posted",
      header: "Posted",
      hideBelow: "lg",
      align: "right",
      sortValue: (j) => j.created_at,
      cell: (j) => <span className="tabular text-muted-foreground">{formatDate(j.created_at)}</span>,
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      hideOnCard: false,
      cell: (j) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            label={`Actions for ${j.title}`}
            actions={[
              { label: "View applicants", icon: Users, onSelect: () => navigate(`/hiring/applicants?job=${j.id}`) },
              { label: "Edit role", icon: Pencil, onSelect: () => navigate(`/hiring/jobs/${j.id}`) },
              { label: "Copy apply link", icon: Copy, hidden: !slug, onSelect: () => slug && copyText(careersUrl(slug, j.slug)) },
              {
                label: "Open public page",
                icon: ExternalLink,
                hidden: !slug,
                onSelect: () => slug && window.open(careersUrl(slug, j.slug), "_blank", "noopener,noreferrer"),
              },
              j.status === "open"
                ? {
                    label: "Close role",
                    icon: Lock,
                    separated: true,
                    onSelect: () => setStatus.mutate({ id: j.id, status: "closed" }),
                    confirm: { title: `Close ${j.title}?`, description: "It disappears from the careers page and stops taking applications. Candidates already in the pipeline stay.", confirmLabel: "Close role" },
                  }
                : { label: "Reopen role", icon: LockOpen, separated: true, onSelect: () => setStatus.mutate({ id: j.id, status: "open" }) },
              {
                // A disabled item needs its reason on screen; the confirm text that explains it never opens.
                label: j.total > 0 ? "Delete (has applicants)" : "Delete role",
                icon: Trash2,
                destructive: true,
                disabled: j.total > 0,
                onSelect: () => deleteJob.mutateAsync(j.id),
                confirm: { title: `Delete ${j.title}?`, description: "This removes the role permanently. Roles with applications cannot be deleted; close them instead.", confirmLabel: "Delete" },
              },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Briefcase}
        eyebrow="Hiring"
        title="Jobs"
        description={
          isLoading || failed || jobs.length === 0
            ? "Post roles to your public careers page and follow everyone who applies."
            : `${stats.listed} open ${stats.listed === 1 ? "role" : "roles"} on the careers page · ${
                stats.fresh === 0 ? "nothing new to review" : `${stats.fresh} new ${stats.fresh === 1 ? "application" : "applications"} to review`
              }.`
        }
        actions={
          <Button asChild>
            <Link to="/hiring/jobs/new">
              <Plus className="mr-1.5 h-4 w-4" /> Post a job
            </Link>
          </Button>
        }
      />

      {failed ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={CloudOff}
            title="Jobs could not be loaded"
            description="The hiring data did not come back from the server. Check your connection and try again."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                <RotateCw className={isRefetching ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} /> Try again
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <StatGrid columns={4}>
            <StatTile label="Open roles" value={stats.listed} icon={Briefcase} tone="primary" loading={isLoading} hint={`of ${jobs.length} posted`} />
            <StatTile label="To review" value={stats.fresh} icon={Inbox} tone={stats.fresh > 0 ? "warning" : "default"} loading={isLoading} hint="New applications" href="/hiring/applicants?view=table&stage=new" />
            <StatTile label="In pipeline" value={stats.active} icon={Users} loading={isLoading} hint={`${stats.applicants} applied`} href="/hiring/applicants" />
            <StatTile label="Hired" value={stats.hired} icon={UserCheck} tone="success" loading={isLoading} hint="Now employees" />
          </StatGrid>

          <CareersLinkCard openCount={stats.listed} />

          {(isLoading || jobs.length > 0) && (
            <FilterBar search={search} onSearchChange={setSearch} placeholder="Search title, team or location">
              <Select value={status} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar>
          )}

          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(j) => j.id}
            loading={isLoading}
            pageSize={20}
            onRowClick={(j) => navigate(`/hiring/applicants?job=${j.id}`)}
            mobileTitle={(j) => j.title}
            caption="Job postings"
            empty={
              jobs.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No jobs yet"
                  description="Post the first role and it appears on your public careers page the moment you save it."
                  action={
                    <Button asChild size="sm">
                      <Link to="/hiring/jobs/new">
                        <Plus className="mr-1.5 h-4 w-4" /> Post a job
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <EmptyState icon={CircleCheck} title="No roles match" description="Try another search or status." compact />
              )
            }
          />
        </>
      )}
    </div>
  );
}
