import { Link } from "react-router-dom";
import { BadgeCheck, BookOpen, ChevronRight, CloudOff, FileSignature, History, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { usePortalPolicies } from "../lib/api";
import { errorMessage } from "../lib/company";
import type { PortalPolicyRow } from "../lib/types";

function PolicyCard({ p }: { p: PortalPolicyRow }) {
  const needsSign = p.requires_signature && !p.signature_id;
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground" title={p.title}>{p.title}</p>
            {needsSign ? (
              <StatusBadge status="pending" label="Please sign" />
            ) : p.signature_id ? (
              <StatusBadge status="signed" label={`Signed ${formatDate(p.signed_at, "dd MMM yyyy")}`} />
            ) : (
              <StatusBadge status="info" label="For information" tone="info" />
            )}
          </div>
          {p.summary && <p className="mt-1 text-xs text-muted-foreground">{p.summary}</p>}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Version {p.version}
            {p.published_at ? ` · published ${formatDate(p.published_at)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {p.signature_id && (
            <Button asChild variant="outline" size="sm" className="h-9 rounded-xl text-xs">
              <Link to={`/portal/policies/signatures/${p.signature_id}`}>Signed copy</Link>
            </Button>
          )}
          <Button asChild size="sm" variant={needsSign ? "default" : "outline"} className="h-9 gap-1.5 rounded-xl text-xs">
            <Link to={`/portal/policies/sign/${p.version_id}`}>
              {needsSign ? <PenTool className="h-3.5 w-3.5" aria-hidden /> : <BookOpen className="h-3.5 w-3.5" aria-hidden />}
              {needsSign ? "Read and sign" : "Read"}
            </Link>
          </Button>
        </div>
      </div>
      {p.earlier.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="micro-label mb-1.5 flex items-center gap-1">
            <History className="h-3 w-3" aria-hidden /> Earlier signatures
          </p>
          <ul className="flex flex-wrap gap-2">
            {p.earlier.map((e) => (
              <li key={e.signature_id}>
                <Link
                  to={`/portal/policies/signatures/${e.signature_id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  v{e.version} · {formatDate(e.signed_at, "dd MMM yyyy")}
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function PortalPoliciesPage() {
  const { data, isLoading, isError, error, refetch, isRefetching } = usePortalPolicies();
  const list = data ?? [];
  const pending = list.filter((p) => p.requires_signature && !p.signature_id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader icon={FileSignature} eyebrow="My portal" title="Policies" description="Read each policy and sign when asked. Signed copies are always available." />

      {pending.length > 0 && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <PenTool className="h-4 w-4 text-primary" aria-hidden />
            {pending.length === 1 ? "One policy is waiting for your signature" : `${pending.length} policies are waiting for your signature`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Read it to the end, then sign with your finger or mouse.</p>
          <Button asChild size="sm" className="mt-3 h-9 max-w-full gap-1.5 rounded-xl">
            <Link to={`/portal/policies/sign/${pending[0].version_id}`}>
              <span className="truncate">Start with {pending[0].title}</span> <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      {isLoading ? (
        <SectionCard>
          <ListSkeleton rows={3} />
        </SectionCard>
      ) : list.length ? (
        <ul className="space-y-3">
          {list.map((p) => (
            <PolicyCard key={p.policy_id} p={p} />
          ))}
        </ul>
      ) : isError ? (
        <SectionCard>
          <EmptyState
            icon={CloudOff}
            title="Policies could not be loaded"
            description={errorMessage(error, "Check your connection and try again.")}
            action={
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refetch()} disabled={isRefetching}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <EmptyState icon={BadgeCheck} title="No policies yet" description="When HR publishes a policy, it appears here for you to read and sign." />
        </SectionCard>
      )}
    </div>
  );
}
