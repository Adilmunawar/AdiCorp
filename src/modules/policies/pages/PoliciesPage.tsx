import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, CheckCircle2, FilePen, FileSignature, Hourglass, Plus, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SectionCard,
  StatGrid,
  StatTile,
  StatusBadge,
  TabsNav,
  formatDate,
  formatRelative,
  useTabParam,
  type DataColumn,
} from "@/components/kit";
import { usePoliciesList } from "../lib/api";
import type { PolicyListRow } from "../lib/types";
import { NewPolicyDialog } from "../components/NewPolicyDialog";

const TABS = [
  { value: "live", label: "Live", icon: ScrollText },
  { value: "archived", label: "Archived", icon: Archive },
];

function stateOf(p: PolicyListRow): { status: string; label: string } {
  if (p.archived_at) return { status: "archived", label: "Archived" };
  if (p.current_version) return { status: "published", label: `Published v${p.current_version}` };
  return { status: "draft", label: "Draft only" };
}

export default function PoliciesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(TABS, "live");
  const archived = tab === "archived";
  const live = usePoliciesList(false);
  const archivedList = usePoliciesList(true);
  const { data, isLoading } = archived ? archivedList : live;
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => !q || p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q));
  }, [data, search]);

  // Short labels and hints: stat tiles sit two to a row on phones.
  const stats = useMemo(() => {
    const list = live.data ?? [];
    const published = list.filter((p) => p.current_version && p.requires_signature);
    const waiting = published.reduce((n, p) => n + Math.max(0, p.required - p.signed), 0);
    const complete = published.filter((p) => p.required > 0 && p.signed >= p.required).length;
    return {
      live: list.filter((p) => p.current_version).length,
      waiting,
      complete,
      published: published.length,
      drafts: list.filter((p) => p.draft_version).length,
    };
  }, [live.data]);

  const columns: DataColumn<PolicyListRow>[] = [
    {
      id: "title",
      header: "Policy",
      sortValue: (p) => p.title,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground" title={p.title}>{p.title}</p>
          {p.summary && <p className="truncate text-[11px] text-muted-foreground">{p.summary}</p>}
        </div>
      ),
      className: "max-w-[340px]",
      hideOnCard: true,
    },
    {
      id: "state",
      header: "Status",
      sortValue: (p) => stateOf(p).status,
      cell: (p) => {
        const s = stateOf(p);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={s.status} label={s.label} />
            {p.draft_version && p.current_version && <StatusBadge status="draft" label={`Draft v${p.draft_version}`} dot={false} />}
          </div>
        );
      },
    },
    {
      id: "progress",
      header: "Signatures",
      sortValue: (p) => (p.required ? p.signed / p.required : -1),
      cell: (p) =>
        !p.requires_signature ? (
          <span className="text-xs text-muted-foreground">For information</span>
        ) : !p.current_version ? (
          <span className="text-xs text-muted-foreground">Not published</span>
        ) : (
          <div className="w-36 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="tabular font-semibold text-foreground">
                {p.signed}/{p.required}
              </span>
              <span className="tabular text-muted-foreground">{p.required ? Math.round((p.signed / p.required) * 100) : 0}%</span>
            </div>
            <Progress value={p.required ? (p.signed / p.required) * 100 : 0} className="h-1.5" aria-label={`${p.signed} of ${p.required} signed`} />
          </div>
        ),
    },
    {
      id: "published",
      header: "Published",
      hideBelow: "md",
      sortValue: (p) => p.published_at,
      cell: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.published_at)}</span>,
    },
    {
      id: "updated",
      header: "Updated",
      hideBelow: "lg",
      sortValue: (p) => p.updated_at,
      cell: (p) => <span className="text-xs text-muted-foreground">{formatRelative(p.updated_at)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={FileSignature}
        eyebrow="People"
        title="Policies"
        description="Publish policies and track who has signed. A new version asks everyone to sign again."
        actions={
          <Button onClick={() => setCreating(true)} className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" aria-hidden /> New policy
          </Button>
        }
      />

      <StatGrid columns={4}>
        <StatTile label="Published" value={stats.live} icon={ScrollText} tone="primary" loading={live.isLoading} hint="Live for staff" />
        <StatTile
          label="Pending"
          value={stats.waiting}
          icon={Hourglass}
          tone={stats.waiting ? "warning" : "default"}
          loading={live.isLoading}
          hint="Awaiting staff"
        />
        <StatTile
          label="Complete"
          value={stats.complete}
          icon={CheckCircle2}
          tone={stats.complete ? "success" : "default"}
          loading={live.isLoading}
          hint={stats.published ? `of ${stats.published} to sign` : "None to sign"}
        />
        <StatTile label="Drafts" value={stats.drafts} icon={FilePen} loading={live.isLoading} hint="Unpublished" />
      </StatGrid>

      <SectionCard flush>
        <div className="space-y-3 border-b border-border/60 p-3 sm:p-4">
          <TabsNav tabs={TABS} value={tab} onChange={setTab} />
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search policies…" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(p) => p.id}
          loading={isLoading}
          onRowClick={(p) => navigate(`/policies/${p.id}`)}
          mobileTitle={(p) => (
            <div className="min-w-0">
              <p className="truncate">{p.title}</p>
              {p.summary && <p className="line-clamp-2 text-xs font-normal text-muted-foreground">{p.summary}</p>}
            </div>
          )}
          initialSort={{ column: "title", direction: "asc" }}
          caption="Policies"
          empty={
            archived ? (
              <EmptyState compact icon={Archive} title="Nothing archived" description="Archived policies are kept here with all their signatures." />
            ) : (
              <EmptyState
                icon={FileSignature}
                title={search ? "No policies match" : "No policies yet"}
                description={
                  search
                    ? "Try a different search."
                    : "Start from a template, fill in the blanks and publish. Employees sign it in the portal."
                }
                action={
                  !search && (
                    <Button onClick={() => setCreating(true)} className="gap-1.5 rounded-xl">
                      <Plus className="h-4 w-4" aria-hidden /> Create a policy
                    </Button>
                  )
                }
              />
            )
          }
        />
      </SectionCard>

      <NewPolicyDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
