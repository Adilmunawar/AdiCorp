import { History, Laptop, ShieldCheck } from "lucide-react";
import { EmptyState, ListSkeleton, PageHeader, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { useMyAssets } from "../../api/portal";
import { assetCategoryLabel, assetConditionLabel } from "../../lib/constants";
import { InfoGrid } from "../../components/common";
import { LoadError } from "../../components/PageBits";

/** Portal: equipment in my care and what I returned. */
export default function MyAssetsPage() {
  const { data, isLoading, isError, refetch } = useMyAssets();
  const current = data?.current ?? [];
  const history = data?.history ?? [];

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader eyebrow="My portal" title="My equipment" icon={Laptop} description="Company assets assigned to you. Return them when HR asks." />

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <LoadError what="Your equipment" icon={Laptop} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          {current.length === 0 ? (
            <SectionCard>
              <EmptyState icon={Laptop} title="Nothing assigned to you" description="When HR hands you a laptop, phone or other equipment, it appears here." compact />
            </SectionCard>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {current.map((a) => (
                <SectionCard
                  key={a.id}
                  title={a.name}
                  description={`${a.tag} · ${assetCategoryLabel(a.category)}`}
                  icon={Laptop}
                  actions={<StatusBadge status="active" label="With you" />}
                >
                  <InfoGrid
                    items={[
                      { label: "Since", value: formatDate(a.assigned_on) },
                      { label: "Condition", value: assetConditionLabel(a.condition) },
                      { label: "Brand / model", value: [a.brand, a.model].filter(Boolean).join(" ") || null },
                      { label: "Serial number", value: a.serial_number },
                      ...(a.warranty_until
                        ? [{ label: "Warranty", value: <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-success" /> until {formatDate(a.warranty_until)}</span> }]
                        : []),
                    ]}
                  />
                </SectionCard>
              ))}
            </div>
          )}

          <SectionCard title="Returned" icon={History} flush>
            {history.length === 0 ? (
              <EmptyState icon={History} title="No returns yet" compact />
            ) : (
              <ul className="divide-y divide-border/60">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{h.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {h.tag} · {assetCategoryLabel(h.category)}
                      </p>
                    </div>
                    <p className="tabular shrink-0 text-right text-[11px] text-muted-foreground">
                      {formatDate(h.assigned_on)} – {formatDate(h.returned_on)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
