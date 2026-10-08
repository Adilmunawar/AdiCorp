import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, Download, Laptop, MapPin, PackageCheck, PackagePlus, Pencil, ShieldAlert, Trash2, Undo2, UserCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, EmptyState, FilterBar, PageHeader, RowActions, SectionCard, StatGrid, StatTile, StatusBadge, downloadCsv, formatDate, toDbDate, type DataColumn } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useAssets, useDeleteAsset, useSetAssetStatus } from "../api/assets";
import { useEmployees } from "../api/employees";
import type { Asset, Employee } from "../api/types";
import { ASSET_CATEGORIES, ASSET_STATUSES, assetCategoryLabel, assetConditionLabel, assetStatusLabel, assetStatusTone, type AssetStatus } from "../lib/constants";
import { errorMessage, matchesSearch } from "../lib/utils";
import { EmployeeChip, PHONE_TILE } from "../components/common";
import { AssetFormDialog, AssignAssetDialog, ReturnAssetDialog } from "../components/AssetDialogs";
import { AssetIcon, WarrantyText, warrantyState } from "../components/AssetBits";
import { LoadError } from "../components/PageBits";

type Row = Asset & { holder?: Employee };

function AssetStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} tone={assetStatusTone(status)} label={assetStatusLabel(status)} />;
}

function AssetTitle({ asset, className }: { asset: Asset; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <AssetIcon category={asset.category} />
      <div className="min-w-0">
        <p className="break-words text-[13px] font-semibold leading-snug text-foreground sm:truncate" title={asset.name}>
          {asset.name}
        </p>
        <p className="tabular truncate text-[11px] font-normal text-muted-foreground">
          {asset.tag} · {assetCategoryLabel(asset.category)}
        </p>
      </div>
    </div>
  );
}

const warrantyDue = (r: Asset) => warrantyState(r.warranty_until, r.status).state === "soon";

export default function AssetsPage() {
  const navigate = useNavigate();
  const { data: assets = [], isLoading, isError, refetch } = useAssets();
  const { data: employees = [] } = useEmployees();
  const setStatus = useSetAssetStatus();
  const remove = useDeleteAsset();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "all";
  const category = params.get("category") ?? "all";
  const search = params.get("q") ?? "";
  const [form, setForm] = useState<Asset | null | "new">(null);
  const [assigning, setAssigning] = useState<Asset | "pick" | null>(null);
  const [returning, setReturning] = useState<Row | null>(null);

  const setParam = (k: string, v: string, fallback: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!v || v === fallback) p.delete(k);
        else p.set(k, v);
        return p;
      },
      { replace: true },
    );
  const clearFilters = () => setParams(new URLSearchParams(), { replace: true });

  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const rows: Row[] = useMemo(() => assets.map((a) => ({ ...a, holder: a.employee_id ? byId.get(a.employee_id) : undefined })), [assets, byId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    ASSET_STATUSES.forEach((s) => (c[s.value] = rows.filter((r) => r.status === s.value).length));
    c.warranty = rows.filter(warrantyDue).length;
    return c;
  }, [rows]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + 1));
    return m;
  }, [rows]);
  const holders = useMemo(() => new Set(rows.filter((r) => r.status === "assigned" && r.employee_id).map((r) => r.employee_id)).size, [rows]);

  const visible = rows.filter(
    (r) =>
      (status === "all" || (status === "warranty" ? warrantyDue(r) : r.status === status)) &&
      (category === "all" || r.category === category) &&
      matchesSearch([r.tag, r.name, r.brand, r.model, r.serial_number, r.holder?.name, r.holder?.employee_code, r.location], [], search),
  );
  const filtered = status !== "all" || category !== "all" || !!search;

  const changeStatus = async (a: Asset, s: AssetStatus) => {
    try {
      await setStatus.mutateAsync({ asset: a, status: s });
      toast.success(`${a.tag} marked ${assetStatusLabel(s).toLowerCase()}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const actionsFor = (r: Row) => (
    <div onClick={(e) => e.stopPropagation()}>
      <RowActions
        label={`Actions for ${r.tag}`}
        className="h-10 w-10 sm:h-8 sm:w-8"
        actions={[
          { label: "Hand over", icon: UserCheck, hidden: r.status !== "available", onSelect: () => setAssigning(r) },
          { label: "Record return", icon: Undo2, hidden: r.status !== "assigned", onSelect: () => setReturning(r) },
          { label: "Edit", icon: Pencil, onSelect: () => setForm(r) },
          { label: "Send to repair", icon: Wrench, separated: true, hidden: r.status === "assigned" || r.status === "repair", onSelect: () => changeStatus(r, "repair") },
          { label: "Mark available", icon: PackageCheck, hidden: r.status === "assigned" || r.status === "available", onSelect: () => changeStatus(r, "available") },
          { label: "Retire", icon: Archive, hidden: r.status === "assigned" || r.status === "retired", onSelect: () => changeStatus(r, "retired") },
          { label: "Mark lost", icon: ShieldAlert, hidden: r.status === "assigned" || r.status === "lost", onSelect: () => changeStatus(r, "lost") },
          {
            label: "Delete",
            icon: Trash2,
            destructive: true,
            separated: true,
            hidden: r.status === "assigned",
            confirm: { title: `Delete ${r.tag}?`, description: "Only assets that were never handed over can be deleted. Otherwise retire it.", confirmLabel: "Delete" },
            onSelect: async () => {
              try {
                await remove.mutateAsync(r);
                toast.success("Asset deleted");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            },
          },
        ]}
      />
    </div>
  );

  const columns: DataColumn<Row>[] = [
    {
      id: "asset",
      header: "Asset",
      hideOnCard: true,
      sortValue: (r) => r.tag,
      cell: (r) => <AssetTitle asset={r} className="max-w-[200px] xl:max-w-[240px] 2xl:max-w-[300px]" />,
    },
    {
      id: "details",
      header: "Model / serial",
      // Wide screens only: on laptops and tablets the row keeps asset, holder, warranty and status.
      className: "hidden xl:table-cell",
      cell: (r) => {
        const model = [r.brand, r.model].filter(Boolean).join(" ");
        return (
          <div className="min-w-0 text-[12px] sm:max-w-[190px] 2xl:max-w-[260px]">
            <p className="break-words sm:truncate" title={model || undefined}>
              {model || <span className="text-muted-foreground">—</span>}
            </p>
            {r.serial_number && <p className="tabular break-all text-[11px] text-muted-foreground sm:truncate">S/N {r.serial_number}</p>}
          </div>
        );
      },
    },
    {
      id: "holder",
      header: "With",
      hideOnCard: true,
      sortValue: (r) => r.holder?.name ?? (r.location ? `~${r.location}` : undefined),
      cell: (r) => (
        <div className="max-w-[170px] xl:max-w-[200px] 2xl:max-w-[240px]">
          {r.holder ? (
            <EmployeeChip id={r.holder.id} name={r.holder.name} avatar={r.holder.avatar_url} subtitle={`Since ${formatDate(r.assigned_on)}`} />
          ) : (
            <span className="block truncate text-[12px] text-muted-foreground" title={r.location || undefined}>
              {r.location || "In store"}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "warranty",
      header: "Warranty",
      hideBelow: "lg",
      sortValue: (r) => r.warranty_until,
      cell: (r) => <WarrantyText until={r.warranty_until} status={r.status} className="text-[12px]" />,
    },
    { id: "status", header: "Status", hideOnCard: true, sortValue: (r) => assetStatusLabel(r.status), cell: (r) => <AssetStatusBadge status={r.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      hideOnCard: true,
      className: "w-12",
      cell: (r) => actionsFor(r),
    },
  ];

  const tiles: { key: string; label: string; hint: string; icon: typeof Laptop; tone: "default" | "primary" | "success" | "warning" | "danger" }[] = [
    { key: "all", label: "All assets", hint: `${categoryCounts.size} ${categoryCounts.size === 1 ? "category" : "categories"}`, icon: Laptop, tone: "default" },
    { key: "assigned", label: "Assigned", hint: `With ${holders} ${holders === 1 ? "person" : "people"}`, icon: UserCheck, tone: "primary" },
    { key: "available", label: "Available", hint: "Ready to hand over", icon: PackageCheck, tone: "success" },
    { key: "repair", label: "In repair", hint: "Out for fixing", icon: Wrench, tone: "warning" },
    { key: "warranty", label: "Warranty due", hint: "Ends within 60 days", icon: ShieldAlert, tone: "warning" },
  ];

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title="Assets"
        icon={Laptop}
        eyebrow="People"
        description="Company equipment, who has it and its full hand-over history."
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!visible.length}
              onClick={() =>
                downloadCsv(visible, `assets-${toDbDate()}`, [
                  { header: "Tag", value: (r) => r.tag },
                  { header: "Name", value: (r) => r.name },
                  { header: "Category", value: (r) => assetCategoryLabel(r.category) },
                  { header: "Brand", value: (r) => r.brand },
                  { header: "Model", value: (r) => r.model },
                  { header: "Serial", value: (r) => r.serial_number },
                  { header: "Status", value: (r) => assetStatusLabel(r.status) },
                  { header: "Condition", value: (r) => assetConditionLabel(r.condition) },
                  { header: "Holder", value: (r) => r.holder?.name },
                  { header: "Holder code", value: (r) => r.holder?.employee_code },
                  { header: "Assigned on", value: (r) => r.assigned_on },
                  { header: "Warranty until", value: (r) => r.warranty_until },
                  { header: "Location", value: (r) => r.location },
                ])
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" variant="outline" disabled={!counts.available} onClick={() => setAssigning("pick")}>
              <UserCheck className="h-4 w-4" /> Hand over
            </Button>
            <Button size="sm" onClick={() => setForm("new")}>
              <PackagePlus className="h-4 w-4" /> Add asset
            </Button>
          </>
        }
      />

      {isError ? (
        <LoadError what="Assets" icon={Laptop} onRetry={() => refetch()} />
      ) : (
        <>
          <StatGrid columns={5} className="mb-4">
            {tiles.map((t) => {
              const on = status === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setParam("status", on && t.key !== "all" ? "all" : t.key, "all")}
                  className="h-full rounded-2xl text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  aria-pressed={on}
                  aria-label={`${t.label}: ${counts[t.key] ?? 0}. ${on ? "Showing" : "Show"} these assets`}
                >
                  <StatTile
                    label={t.label}
                    value={counts[t.key] ?? 0}
                    hint={t.hint}
                    icon={t.icon}
                    tone={on ? "primary" : counts[t.key] ? t.tone : "default"}
                    loading={isLoading}
                    className={cn(PHONE_TILE, "hover:border-primary/30", on && "border-primary/40 ring-1 ring-primary/20")}
                  />
                </button>
              );
            })}
          </StatGrid>

          <SectionCard flush>
            <div className="border-b border-border/60 p-3 sm:p-4">
              <FilterBar
                search={search}
                onSearchChange={(v) => setParam("q", v, "")}
                placeholder="Tag, name, serial or holder…"
                actions={
                  !isLoading && (
                    <p className="tabular text-xs text-muted-foreground" aria-live="polite">
                      {filtered ? `${visible.length} of ${rows.length} assets` : `${rows.length} ${rows.length === 1 ? "asset" : "assets"}`}
                    </p>
                  )
                }
              >
                <Select value={category} onValueChange={(v) => setParam("category", v, "all")}>
                  <SelectTrigger className="h-10 w-full rounded-xl text-xs sm:h-9 sm:w-[170px]" aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {ASSET_CATEGORIES.filter((c) => categoryCounts.has(c.value) || c.value === category).map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label} ({categoryCounts.get(c.value) ?? 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setParam("status", v, "all")}>
                  <SelectTrigger className="h-10 w-full rounded-xl text-xs sm:h-9 sm:w-[170px]" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {ASSET_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label} ({counts[s.value] ?? 0})
                      </SelectItem>
                    ))}
                    <SelectItem value="warranty">Warranty due ({counts.warranty ?? 0})</SelectItem>
                  </SelectContent>
                </Select>
                {filtered && (
                  <Button size="sm" variant="ghost" className="h-10 text-xs text-muted-foreground sm:h-9" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </FilterBar>
            </div>
            <DataTable
              columns={columns}
              rows={visible}
              getRowId={(r) => r.id}
              loading={isLoading}
              initialSort={{ column: "asset" }}
              pageSize={25}
              onRowClick={(r) => navigate(`/assets/${r.id}`)}
              mobileTitle={(r) => (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <AssetTitle asset={r} />
                    <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-0.5">
                      <AssetStatusBadge status={r.status} />
                      {actionsFor(r)}
                    </div>
                  </div>
                  <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-muted-foreground">
                    {r.holder ? (
                      <>
                        <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">
                          With <span className="font-medium text-foreground">{r.holder.name}</span> since {formatDate(r.assigned_on)}
                        </span>
                      </>
                    ) : (
                      <>
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">{r.location || "In store"}</span>
                      </>
                    )}
                  </p>
                </div>
              )}
              caption="Assets"
              empty={
                <EmptyState
                  icon={Laptop}
                  title={rows.length ? "No assets match these filters" : "No assets yet"}
                  description={rows.length ? "Try another search, category or status." : "Add laptops, phones, SIMs and other equipment to track who has what."}
                  action={
                    rows.length ? (
                      <Button size="sm" variant="outline" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setForm("new")}>
                        <PackagePlus className="h-4 w-4" /> Add asset
                      </Button>
                    )
                  }
                  compact={!!rows.length}
                />
              }
            />
          </SectionCard>
        </>
      )}

      <AssetFormDialog open={!!form} onOpenChange={(o) => !o && setForm(null)} asset={form === "new" ? null : form} onSaved={(id) => form === "new" && navigate(`/assets/${id}`)} />
      {assigning && <AssignAssetDialog open asset={assigning === "pick" ? null : assigning} onOpenChange={(o) => !o && setAssigning(null)} />}
      {returning && <ReturnAssetDialog open asset={returning} holderName={returning.holder?.name} onOpenChange={(o) => !o && setReturning(null)} />}
    </div>
  );
}
