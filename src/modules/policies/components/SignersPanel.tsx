import { useMemo, useState } from "react";
import { BellRing, CheckCircle2, Download, Hourglass, Loader2, PenTool, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  CardSkeleton,
  DataTable,
  EmptyState,
  FilterBar,
  SectionCard,
  StatGrid,
  StatTile,
  StatusBadge,
  downloadCsv,
  formatDateTime,
  formatPercent,
  type DataColumn,
} from "@/components/kit";
import { usePolicySigners, useRemindUnsigned, useStaffSignature } from "../lib/api";
import { errorMessage, useStaffLetterhead } from "../lib/company";
import type { PolicyRow, PolicyVersionRow, SignerRow } from "../lib/types";
import { SignatureEvidence } from "./SignatureView";

type Filter = "all" | "unsigned" | "signed";

interface Props {
  policy: PolicyRow;
  version: PolicyVersionRow;
}

/** Who has and hasn't signed the current version, with reminders and the evidence of each signature. */
export function SignersPanel({ policy, version }: Props) {
  const { data, isLoading } = usePolicySigners(version.id);
  const remind = useRemindUnsigned();
  const company = useStaffLetterhead();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openSignature, setOpenSignature] = useState<string | null>(null);
  const signature = useStaffSignature(openSignature);

  // For-information policies ask nobody to sign: active people without a signature are not "waiting".
  const mustSign = policy.requires_signature;
  const all = data ?? [];
  const active = all.filter((r) => r.required);
  const signed = active.filter((r) => r.signed_at).length;
  const waiting = mustSign ? active.length - signed : 0;
  const unsignedLabel = mustSign ? "Not signed" : "Not required";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === "signed" && !r.signed_at) return false;
      if (filter === "unsigned" && (r.signed_at || !r.required)) return false;
      if (!q) return true;
      return [r.name, r.employee_code, r.department, r.rank].some((v) => v?.toLowerCase().includes(q));
    });
  }, [all, filter, search]);

  const doRemind = async () => {
    try {
      const n = await remind.mutateAsync(version.id);
      toast.success(n ? `Reminded ${n} ${n === 1 ? "person" : "people"}` : "Everyone has signed");
    } catch (err) {
      toast.error("Could not send reminders", { description: errorMessage(err) });
    }
  };

  const exportCsv = () =>
    downloadCsv(
      all.map((r) => ({
        Employee: r.name,
        "Employee ID": r.employee_code ?? "",
        Department: r.department ?? "",
        Designation: r.rank ?? "",
        Status: r.signed_at ? "Signed" : r.required ? unsignedLabel : "Left",
        "Signed at": r.signed_at ? formatDateTime(r.signed_at) : "",
        "Typed name": r.signed_name ?? "",
      })),
      `${policy.title} v${version.version} signatures`,
    );

  const columns: DataColumn<SignerRow>[] = [
    {
      id: "name",
      header: "Employee",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{r.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{[r.employee_code, r.rank].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      ),
      hideOnCard: true,
    },
    { id: "department", header: "Department", hideBelow: "md", sortValue: (r) => r.department, cell: (r) => <span className="text-xs">{r.department || "—"}</span> },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => (r.signed_at ? 2 : r.required ? 0 : 1),
      cell: (r) =>
        r.signed_at ? (
          <StatusBadge status="signed" label={r.required ? "Signed" : "Signed · left"} />
        ) : r.required ? (
          <StatusBadge status={mustSign ? "pending" : "inactive"} label={unsignedLabel} tone={mustSign ? undefined : "neutral"} />
        ) : (
          <StatusBadge status="separated" label="Left" />
        ),
    },
    {
      id: "signed_at",
      header: "Signed at",
      hideBelow: "sm",
      sortValue: (r) => r.signed_at,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.signed_at ? formatDateTime(r.signed_at) : "—"}</span>,
    },
    {
      id: "view",
      header: <span className="sr-only">Signature</span>,
      align: "right",
      // On phones the whole card opens the signature; the title shows a "View" hint instead.
      hideOnCard: true,
      cell: (r) =>
        r.signature_id ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setOpenSignature(r.signature_id);
            }}
          >
            <PenTool className="h-3.5 w-3.5" aria-hidden /> View
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <StatGrid columns={3}>
        <StatTile label="Signed" value={signed} icon={CheckCircle2} tone={signed ? "success" : "default"} loading={isLoading} hint={`of ${active.length} active`} />
        <StatTile
          label="Waiting"
          value={waiting}
          icon={Hourglass}
          tone={waiting ? "warning" : mustSign ? "success" : "default"}
          loading={isLoading}
          hint={mustSign ? "Still to sign" : "Signing not required"}
        />
        <StatTile
          label="Completion"
          value={mustSign ? formatPercent(active.length ? signed / active.length : 0, 0) : "—"}
          icon={Users}
          tone="primary"
          loading={isLoading}
          hint={mustSign ? `Version ${version.version}` : "For information only"}
          className="col-span-2 lg:col-span-1"
        />
      </StatGrid>

      <SectionCard
        flush
        title={`Signatures · version ${version.version}`}
        description={
          mustSign
            ? "Active employees sign each published version. People who signed and have since left are kept on record."
            : "This policy is for information only, so nobody is asked to sign it. Signatures given earlier are kept on record."
        }
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={exportCsv} disabled={!all.length}>
              <Download className="h-3.5 w-3.5" aria-hidden /> CSV
            </Button>
            {policy.requires_signature && !policy.archived_at && (
              <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={doRemind} disabled={remind.isPending || waiting === 0}>
                {remind.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <BellRing className="h-3.5 w-3.5" aria-hidden />}
                {waiting > 0 ? `Remind ${waiting} unsigned` : "Everyone signed"}
              </Button>
            )}
          </>
        }
      >
        <div className="border-b border-border/60 p-3 sm:p-4">
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search employees…">
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="h-9 w-full rounded-xl sm:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="unsigned">{unsignedLabel}</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.employee_id}
          loading={isLoading}
          mobileTitle={(r) => (
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate">{r.name}</p>
                <p className="truncate text-[11px] font-normal text-muted-foreground">{[r.employee_code, r.rank].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              {r.signature_id && (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">
                  <PenTool className="h-3 w-3" aria-hidden /> View
                </span>
              )}
            </div>
          )}
          pageSize={25}
          caption="Signatures"
          onRowClick={(r) => r.signature_id && setOpenSignature(r.signature_id)}
          empty={
            <EmptyState
              compact
              icon={Users}
              title={all.length ? "Nobody matches" : "No active employees"}
              description={all.length ? "Try another search or filter." : "Add employees and they will be asked to sign the published version."}
            />
          }
        />
      </SectionCard>

      <Sheet open={!!openSignature} onOpenChange={(o) => !o && setOpenSignature(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Signature</SheetTitle>
            <SheetDescription>
              {policy.title}, version {version.version}
            </SheetDescription>
          </SheetHeader>
          {signature.isLoading ? (
            <CardSkeleton lines={5} />
          ) : signature.data ? (
            <SignatureEvidence record={signature.data} company={company} />
          ) : (
            <EmptyState compact title="Signature not found" />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
