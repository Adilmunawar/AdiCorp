import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, Laptop, PackagePlus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { useEmployeeAssets } from "../../api/assets";
import type { Asset, Employee } from "../../api/types";
import { assetCategoryLabel, assetConditionLabel } from "../../lib/constants";
import { AssignAssetDialog, ReturnAssetDialog } from "../AssetDialogs";

export function AssetsTab({
  employee,
  openHandover,
  onHandoverOpened,
}: {
  employee: Pick<Employee, "id" | "name" | "status">;
  /** Open the hand-over dialog on arrival (from the profile's "Hand over equipment"). */
  openHandover?: boolean;
  onHandoverOpened?: () => void;
}) {
  const { data, isLoading } = useEmployeeAssets(employee.id);
  const [assigning, setAssigning] = useState(false);
  const [returning, setReturning] = useState<Asset | null>(null);
  const current = data?.current ?? [];
  const past = (data?.history ?? []).filter((h) => h.returned_on);

  useEffect(() => {
    if (!openHandover) return;
    if (employee.status === "active") setAssigning(true);
    onHandoverOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openHandover]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard
        title="With them now"
        description={isLoading ? undefined : current.length ? `${current.length} ${current.length === 1 ? "item" : "items"} assigned` : "Nothing assigned"}
        icon={Laptop}
        flush
        actions={
          employee.status === "active" ? (
            <Button size="sm" onClick={() => setAssigning(true)}>
              <PackagePlus className="h-4 w-4" /> Hand over
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <ListSkeleton rows={2} className="p-4" />
        ) : current.length === 0 ? (
          <EmptyState icon={Laptop} title="No equipment" description="Laptops, phones and other company assets handed to this person appear here." compact />
        ) : (
          <ul className="divide-y divide-border/60">
            {current.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link to={`/assets/${a.id}`} className="block truncate text-[13px] font-semibold hover:text-primary">
                    {a.name}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {a.tag} · {assetCategoryLabel(a.category)} · since {formatDate(a.assigned_on)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-10 shrink-0 sm:h-8" onClick={() => setReturning(a)}>
                  <Undo2 className="h-4 w-4" /> Return
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Returned" description={isLoading || !past.length ? undefined : `${past.length} earlier ${past.length === 1 ? "hand-over" : "hand-overs"}`} icon={History} flush>
        {isLoading ? (
          <ListSkeleton rows={2} className="p-4" />
        ) : past.length === 0 ? (
          <EmptyState icon={History} title="Nothing returned yet" compact />
        ) : (
          <ul className="divide-y divide-border/60">
            {past.map((h) => (
              <li key={h.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/assets/${h.asset_id}`} className="truncate text-[13px] font-semibold hover:text-primary">
                    {h.asset?.name ?? "Asset"}
                  </Link>
                  {h.condition_in && <StatusBadge status={h.condition_in} label={`${assetConditionLabel(h.condition_in)} condition`} tone="neutral" />}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {h.asset?.tag} · {formatDate(h.assigned_on)} – {formatDate(h.returned_on)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <AssignAssetDialog open={assigning} onOpenChange={setAssigning} employeeId={employee.id} />
      {returning && <ReturnAssetDialog open asset={returning} holderName={employee.name} onOpenChange={(o) => !o && setReturning(null)} />}
    </div>
  );
}
