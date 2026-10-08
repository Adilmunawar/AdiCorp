import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArrowLeft, History, Laptop, MapPin, PackageCheck, Pencil, ShieldAlert, Trash2, Undo2, UserCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, EmptyState, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useAsset, useDeleteAsset, useSetAssetStatus } from "../api/assets";
import { useEmployees } from "../api/employees";
import { assetCategoryLabel, assetStatusLabel, assetStatusTone, type AssetStatus } from "../lib/constants";
import { errorMessage } from "../lib/utils";
import { EmployeeChip, InfoGrid } from "../components/common";
import { AssetFormDialog, AssignAssetDialog, ReturnAssetDialog } from "../components/AssetDialogs";
import { AssetIcon, ConditionTag, WarrantyText, durationLabel, warrantyState } from "../components/AssetBits";
import { DetailSkeleton, LoadError } from "../components/PageBits";

function Fact({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3 sm:px-5">
      <dt className="micro-label">{label}</dt>
      <dd className="mt-1 truncate text-[13px] font-semibold text-foreground">{children}</dd>
      {hint && <dd className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-9 px-2 text-muted-foreground" asChild>
      <Link to="/assets">
        <ArrowLeft className="h-4 w-4" /> Assets
      </Link>
    </Button>
  );
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useAsset(id);
  const { data: employees = [] } = useEmployees();
  const setStatus = useSetAssetStatus();
  const remove = useDeleteAsset();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [returning, setReturning] = useState(false);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  if (isLoading && !data) return <DetailSkeleton sideCards={2} />;
  if (isError && !data) {
    return (
      <div className="animate-in fade-in duration-300">
        <BackLink />
        <LoadError what="This asset" icon={Laptop} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!data) {
    return (
      <EmptyState
        icon={Laptop}
        title="Asset not found"
        description="It may have been deleted, or the link is incomplete."
        action={
          <Button size="sm" asChild>
            <Link to="/assets">Back to assets</Link>
          </Button>
        }
      />
    );
  }

  const { asset, history } = data;
  const holder = asset.employee_id ? byId.get(asset.employee_id) : undefined;
  const warranty = warrantyState(asset.warranty_until, asset.status);
  const model = [asset.brand, asset.model].filter(Boolean).join(" ");

  const change = async (s: AssetStatus) => {
    try {
      await setStatus.mutateAsync({ asset, status: s });
      toast.success(`${asset.tag} marked ${assetStatusLabel(s).toLowerCase()}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const statusOptions: { value: AssetStatus; label: string; icon: typeof Wrench }[] = [
    { value: "available", label: "Available", icon: PackageCheck },
    { value: "repair", label: "In repair", icon: Wrench },
    { value: "retired", label: "Retired", icon: Archive },
    { value: "lost", label: "Lost", icon: ShieldAlert },
  ];

  return (
    <div className="animate-in fade-in duration-300">
      <BackLink />

      <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <AssetIcon category={asset.category} size="lg" />
            <div className="min-w-0">
              <p className="tabular micro-label !text-primary">{asset.tag}</p>
              <h1 className="truncate font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl" title={asset.name}>
                {asset.name}
              </h1>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{[assetCategoryLabel(asset.category), model].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={asset.status} tone={assetStatusTone(asset.status)} label={assetStatusLabel(asset.status)} className="mr-1" />
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            {asset.status === "available" && (
              <Button size="sm" onClick={() => setAssigning(true)}>
                <UserCheck className="h-4 w-4" /> Hand over
              </Button>
            )}
            {asset.status === "assigned" && (
              <Button size="sm" onClick={() => setReturning(true)}>
                <Undo2 className="h-4 w-4" /> Record return
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60 lg:grid-cols-4">
          <Fact label={holder ? "With" : "Where"} hint={holder ? `Since ${formatDate(asset.assigned_on)} · ${durationLabel(asset.assigned_on)}` : assetStatusLabel(asset.status)}>
            {holder ? holder.name : asset.location || "In store"}
          </Fact>
          <Fact label="Condition">
            <ConditionTag condition={asset.condition} />
          </Fact>
          <Fact label="Warranty" hint={warranty.state === "none" ? "Not recorded" : warranty.state === "expired" ? `Ended ${formatDate(asset.warranty_until)}` : `Until ${formatDate(asset.warranty_until)}`}>
            {warranty.state === "none" ? <span className="text-muted-foreground">—</span> : warranty.state === "expired" ? "Expired" : <WarrantyText until={asset.warranty_until} status={asset.status} />}
          </Fact>
          <Fact label="Age" hint={asset.purchase_date ? `Bought ${formatDate(asset.purchase_date)}` : "Purchase date not recorded"}>
            {asset.purchase_date ? durationLabel(asset.purchase_date) : <span className="text-muted-foreground">—</span>}
          </Fact>
        </dl>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="Details">
            <InfoGrid
              columns={3}
              items={[
                { label: "Brand", value: asset.brand },
                { label: "Model", value: asset.model },
                { label: "Serial number", value: asset.serial_number ? <span className="tabular">{asset.serial_number}</span> : null },
                { label: "Purchased", value: asset.purchase_date ? formatDate(asset.purchase_date) : null },
                { label: "Warranty until", value: asset.warranty_until ? <span className={cn(warranty.state === "soon" && "font-semibold text-warning")}>{formatDate(asset.warranty_until)}</span> : null },
                { label: "Store location", value: asset.location },
                { label: "Specs", value: asset.specs, wide: true },
                { label: "Notes", value: asset.notes, wide: true },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Hand-over history"
            icon={History}
            description={history.length ? `${history.length} ${history.length === 1 ? "hand-over" : "hand-overs"}, newest first` : undefined}
            flush
          >
            {history.length === 0 ? (
              <EmptyState
                icon={History}
                title="Never handed over"
                description={asset.status === "available" ? "Hand it to an employee and every hand-over and return is recorded here." : "Every hand-over and return is recorded here."}
                action={
                  asset.status === "available" ? (
                    <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>
                      <UserCheck className="h-4 w-4" /> Hand over
                    </Button>
                  ) : undefined
                }
                compact
              />
            ) : (
              <ol className="relative px-4 py-2 sm:px-5">
                {history.map((h, i) => {
                  const e = byId.get(h.employee_id);
                  const current = !h.returned_on;
                  const note = [h.note_out, h.note_in].filter(Boolean).join(" · ");
                  return (
                    <li key={h.id} className="relative flex gap-3 py-3">
                      {i < history.length - 1 && <span className="absolute left-[15px] top-12 h-[calc(100%-2.5rem)] w-px bg-border" aria-hidden />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          {e ? (
                            <EmployeeChip id={e.id} name={e.name} avatar={e.avatar_url} subtitle={[e.employee_code, e.rank].filter(Boolean).join(" · ")} />
                          ) : (
                            <span className="pl-[42px] text-[13px] text-muted-foreground">Former employee</span>
                          )}
                          <div className="pl-[42px] text-[12px] sm:shrink-0 sm:pl-0 sm:text-right">
                            <p className="tabular font-medium text-foreground">
                              {formatDate(h.assigned_on)} – {current ? "now" : formatDate(h.returned_on)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{durationLabel(h.assigned_on, h.returned_on)}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[42px] text-[11px] text-muted-foreground">
                          {current && <StatusBadge status="current" tone="primary" label="Current holder" />}
                          <span className="inline-flex items-center gap-1">
                            Out: <ConditionTag condition={h.condition_out} className="text-foreground" />
                          </span>
                          {h.returned_on && (
                            <span className="inline-flex items-center gap-1">
                              In: <ConditionTag condition={h.condition_in} className="text-foreground" />
                            </span>
                          )}
                        </div>
                        {note && <p className="mt-1.5 pl-[42px] text-[12px] leading-5 text-muted-foreground">{note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-4">
          <SectionCard title={holder ? "Current holder" : "Location"}>
            {holder ? (
              <div className="space-y-3">
                <EmployeeChip id={holder.id} name={holder.name} avatar={holder.avatar_url} subtitle={[holder.employee_code, holder.rank].filter(Boolean).join(" · ")} />
                <p className="text-[12px] text-muted-foreground">
                  Since {formatDate(asset.assigned_on)} ({durationLabel(asset.assigned_on)})
                </p>
                <p className="rounded-xl bg-muted/50 px-3 py-2 text-[12px] leading-5 text-muted-foreground">Record the return before sending it to repair, retiring it or marking it lost.</p>
              </div>
            ) : asset.status === "assigned" ? (
              <p className="text-[12px] text-muted-foreground">The holder is no longer on record. Record the return to put it back in store.</p>
            ) : (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-[13px] font-medium">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {asset.location || "In store, no location recorded"}
                </p>
                {asset.status === "available" && (
                  <Button size="sm" className="w-full" onClick={() => setAssigning(true)}>
                    <UserCheck className="h-4 w-4" /> Hand over
                  </Button>
                )}
              </div>
            )}
          </SectionCard>

          {asset.status !== "assigned" && (
            <SectionCard title="Change status" description="Take it out of service or put it back in store.">
              <div className="grid grid-cols-2 gap-2">
                {statusOptions
                  .filter((o) => o.value !== asset.status)
                  .map((o) => (
                    <Button key={o.value} size="sm" variant="outline" className="h-10 justify-start sm:h-9" disabled={setStatus.isPending} onClick={() => change(o.value)}>
                      <o.icon className="h-4 w-4" /> {o.label}
                    </Button>
                  ))}
              </div>
              {history.length === 0 && (
                <ConfirmButton
                  className="mt-3 h-10 w-full sm:h-9"
                  size="sm"
                  title={`Delete ${asset.tag}?`}
                  description="It was never handed over, so it can be deleted. This cannot be undone."
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    try {
                      await remove.mutateAsync(asset);
                      toast.success("Asset deleted");
                      navigate("/assets", { replace: true });
                    } catch (e) {
                      toast.error(errorMessage(e));
                      throw e;
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete asset
                </ConfirmButton>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      <AssetFormDialog open={editing} onOpenChange={setEditing} asset={asset} />
      <AssignAssetDialog open={assigning} onOpenChange={setAssigning} asset={asset} />
      {returning && <ReturnAssetDialog open asset={asset} holderName={holder?.name} onOpenChange={setReturning} />}
    </div>
  );
}
