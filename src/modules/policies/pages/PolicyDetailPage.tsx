import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowLeft, Download, FileSignature, History, Loader2, PenLine, Settings2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ConfirmButton,
  EmptyState,
  PageHeader,
  PageSkeleton,
  SectionCard,
  StatusBadge,
  TabsNav,
  formatDate,
  formatDateTime,
  useTabParam,
} from "@/components/kit";
import { useArchivePolicy, usePoliciesList, usePolicy, useUpdatePolicyInfo, type PolicyDetail } from "../lib/api";
import { errorMessage, useStaffLetterhead } from "../lib/company";
import { exportPolicyPdf } from "../lib/pdf";
import type { PolicyVersionRow } from "../lib/types";
import { PolicyEditor } from "../components/PolicyEditor";
import { RichText } from "../components/RichText";
import { SignersPanel } from "../components/SignersPanel";

const TABS = [
  { value: "signatures", label: "Signatures", icon: Users },
  { value: "editor", label: "Text", icon: PenLine },
  { value: "versions", label: "Versions", icon: History },
  { value: "details", label: "Details", icon: Settings2 },
];

function usePdf() {
  const company = useStaffLetterhead();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (title: string, v: PolicyVersionRow) => {
    setBusy(v.id);
    try {
      await exportPolicyPdf({ company, title, version: v.version, status: v.status, publishedAt: v.published_at, body: v.body, sha256: v.body_sha256 });
    } catch (err) {
      toast.error("Could not create the PDF", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function VersionsPanel({ detail }: { detail: PolicyDetail }) {
  const [viewing, setViewing] = useState<PolicyVersionRow | null>(null);
  const pdf = usePdf();
  if (!detail.versions.length) {
    return (
      <SectionCard>
        <EmptyState compact icon={History} title="No versions" description="Write the text to start version 1." />
      </SectionCard>
    );
  }
  return (
    <SectionCard flush title="Versions" description="Every published version is kept with its signatures and fingerprint.">
      <ul className="divide-y divide-border/60">
        {detail.versions.map((v) => (
          <li key={v.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-foreground">Version {v.version}</span>
                <StatusBadge status={v.status} label={v.status === "published" ? "Current" : undefined} tone={v.status === "superseded" ? "neutral" : undefined} />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {v.published_at ? `Published ${formatDateTime(v.published_at)}${v.published_by_name ? ` by ${v.published_by_name}` : ""}` : `Last saved ${formatDateTime(v.updated_at)}`}
              </p>
              {v.change_note && <p className="mt-1 text-xs text-foreground/80">{v.change_note}</p>}
              {v.body_sha256 && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">SHA-256 {v.body_sha256}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setViewing(v)}>
                Read
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={() => pdf.run(detail.policy.title, v)} disabled={pdf.busy === v.id}>
                {pdf.busy === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
                PDF
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail.policy.title} · version {viewing?.version}
            </DialogTitle>
            <DialogDescription>{viewing?.published_at ? `Published ${formatDate(viewing.published_at)}` : "Draft"}</DialogDescription>
          </DialogHeader>
          {viewing && <RichText source={viewing.body} />}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function DetailsPanel({ detail }: { detail: PolicyDetail }) {
  const { policy } = detail;
  const update = useUpdatePolicyInfo();
  const [title, setTitle] = useState(policy.title);
  const [summary, setSummary] = useState(policy.summary);
  const [requires, setRequires] = useState(policy.requires_signature);

  useEffect(() => {
    setTitle(policy.title);
    setSummary(policy.summary);
    setRequires(policy.requires_signature);
  }, [policy.title, policy.summary, policy.requires_signature]);

  const dirty = title !== policy.title || summary !== policy.summary || requires !== policy.requires_signature;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync({ id: policy.id, title: title.trim(), summary: summary.trim(), requiresSignature: requires });
      toast.success("Details saved");
    } catch (err) {
      toast.error("Could not save", { description: errorMessage(err) });
    }
  };

  return (
    <SectionCard title="Details" description="What employees see in their list of policies.">
      <form onSubmit={save} className="max-w-xl space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="d-title">Title</Label>
          <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={!!policy.archived_at} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-summary">Summary</Label>
          <Textarea id="d-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} rows={3} disabled={!!policy.archived_at} />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
          <div>
            <Label htmlFor="d-sign" className="text-sm">
              Everyone must sign it
            </Label>
            <p className="text-[11px] text-muted-foreground">Turn off for policies that are for information only. Existing signatures are kept.</p>
          </div>
          <Switch id="d-sign" checked={requires} onCheckedChange={setRequires} disabled={!!policy.archived_at} />
        </div>
        <Button type="submit" disabled={!dirty || update.isPending || title.trim().length < 2 || !!policy.archived_at} className="rounded-xl">
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Save details
        </Button>
      </form>
    </SectionCard>
  );
}

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = usePolicy(id);
  const list = usePoliciesList(false);
  const archive = useArchivePolicy();
  const pdf = usePdf();
  const [tab, setTab] = useTabParam(TABS, undefined);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <EmptyState
        icon={FileSignature}
        title="Policy not found"
        description={error ? errorMessage(error) : "It may have been removed, or it belongs to another company."}
        action={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/policies">Back to policies</Link>
          </Button>
        }
      />
    );
  }

  const { policy, current, draft } = data;
  const activeTab = tab === "signatures" && !current ? "editor" : tab;
  // Nothing to sign until a version is published, so the Signatures tab would be a dead button.
  const tabs = current ? TABS : TABS.filter((t) => t.value !== "signatures");
  const signers = list.data?.find((p) => p.id === policy.id)?.required ?? 0;

  const toggleArchive = async () => {
    try {
      await archive.mutateAsync({ id: policy.id, archived: !policy.archived_at });
      toast.success(policy.archived_at ? "Policy restored" : "Policy archived");
    } catch (err) {
      toast.error("Could not update the policy", { description: errorMessage(err) });
      throw err;
    }
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground">
        <Link to="/policies">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Policies
        </Link>
      </Button>
      <PageHeader
        icon={FileSignature}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Policy
            {/* Badges keep their normal case inside the uppercase eyebrow. */}
            <span className="flex flex-wrap items-center gap-1.5 normal-case tracking-normal">
              {policy.archived_at ? (
                <StatusBadge status="archived" />
              ) : current ? (
                <StatusBadge status="published" label={`Published v${current.version}`} />
              ) : (
                <StatusBadge status="draft" label="Not published" />
              )}
              {draft && current && <StatusBadge status="draft" label={`Draft v${draft.version}`} dot={false} />}
            </span>
          </span>
        }
        title={<span className="whitespace-normal break-words">{policy.title}</span>}
        description={policy.summary || undefined}
        actions={
          <>
            {current && (
              <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => pdf.run(policy.title, current)} disabled={pdf.busy === current.id}>
                {pdf.busy === current.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
                PDF
              </Button>
            )}
            <ConfirmButton
              className="gap-1.5 rounded-xl"
              destructive={!policy.archived_at}
              variant="outline"
              title={policy.archived_at ? `Restore ${policy.title}?` : `Archive ${policy.title}?`}
              description={
                policy.archived_at
                  ? "It becomes live again. Employees who have not signed the current version will find it waiting in the portal."
                  : "Employees stop seeing it and are no longer asked to sign it. All signatures are kept, and you can restore it later."
              }
              confirmLabel={policy.archived_at ? "Restore" : "Archive"}
              onConfirm={toggleArchive}
            >
              {policy.archived_at ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
              {policy.archived_at ? "Restore" : "Archive"}
            </ConfirmButton>
          </>
        }
      >
        <TabsNav tabs={tabs} value={activeTab} onChange={setTab} />
      </PageHeader>

      {activeTab === "signatures" && current && <SignersPanel policy={policy} version={current} />}
      {activeTab === "editor" && <PolicyEditor detail={data} signers={signers} />}
      {activeTab === "versions" && <VersionsPanel detail={data} />}
      {activeTab === "details" && <DetailsPanel detail={data} />}
    </div>
  );
}
