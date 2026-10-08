import { useState } from "react";
import { ListChecks, Pencil, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DataTable, EmptyState, RowActions, SectionCard, StatusBadge, type DataColumn } from "@/components/kit";
import { useLeaveSettings, useLeaveTypes, useSaveLeaveSettings, useSeedLeaveTypes, useToggleLeaveType } from "../api";
import { LEAVE_KIND_LABELS } from "../lib";
import type { LeaveType } from "../types";
import { LeaveTypeDialog } from "./LeaveTypeDialog";

/** "Annual" under "Annual leave" says nothing; only show the kind when the name does not already. */
function kindNote(t: LeaveType): string | null {
  const kind = LEAVE_KIND_LABELS[t.type] ?? t.type;
  if (t.name.toLowerCase().includes(kind.toLowerCase())) return null;
  return `${kind} leave`;
}

export function TypesPanel({ canEdit }: { canEdit: boolean }) {
  const types = useLeaveTypes();
  const settings = useLeaveSettings();
  const toggle = useToggleLeaveType();
  const seed = useSeedLeaveTypes();
  const saveSettings = useSaveLeaveSettings();
  const [dialog, setDialog] = useState<{ open: boolean; editing: LeaveType | null }>({ open: false, editing: null });
  const rows = types.data ?? [];

  const columns: DataColumn<LeaveType>[] = [
    {
      id: "name",
      header: "Leave type",
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t.name}</p>
          {kindNote(t) && <p className="text-[11px] text-muted-foreground">{kindNote(t)}</p>}
        </div>
      ),
      sortValue: (t) => t.name,
      hideOnCard: true,
    },
    {
      id: "days",
      header: "Per year",
      cell: (t) => (
        <span className={t.days_per_year > 0 ? "text-sm font-medium tabular" : "text-sm text-muted-foreground"}>
          {t.days_per_year > 0 ? `${t.days_per_year} ${t.days_per_year === 1 ? "day" : "days"}` : "No limit"}
        </span>
      ),
      sortValue: (t) => t.days_per_year,
    },
    {
      id: "paid",
      header: "Pay",
      cell: (t) => <StatusBadge status={t.is_paid ? "paid" : "unpaid"} label={t.is_paid ? "Paid" : "Unpaid"} tone={t.is_paid ? "success" : "warning"} dot={false} />,
      sortValue: (t) => t.is_paid,
    },
    {
      id: "active",
      header: "In use",
      cell: (t) =>
        canEdit ? (
          <Switch
            checked={t.is_active}
            onCheckedChange={(v) => toggle.mutate({ id: t.id, active: v, name: t.name })}
            aria-label={`${t.is_active ? "Switch off" : "Switch on"} ${t.name}`}
          />
        ) : (
          <StatusBadge status={t.is_active ? "active" : "inactive"} />
        ),
      sortValue: (t) => t.is_active,
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (t) =>
        canEdit ? <RowActions label={`Actions for ${t.name}`} actions={[{ label: "Edit", icon: Pencil, onSelect: () => setDialog({ open: true, editing: t }) }]} /> : null,
    },
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <SectionCard
        title="Leave types"
        description="Switched-off types stay on past requests but cannot be picked for new ones."
        icon={ListChecks}
        flush
        actions={
          canEdit && rows.length > 0 ? (
            <Button size="sm" className="h-8 rounded-lg" onClick={() => setDialog({ open: true, editing: null })}>
              <Plus className="mr-1 h-4 w-4" /> Add type
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(t) => t.id}
          loading={types.isLoading}
          rowClassName={(t) => (t.is_active ? undefined : "opacity-60")}
          mobileTitle={(t) => (
            <div>
              <p className="text-sm font-semibold">{t.name}</p>
              {kindNote(t) && <p className="text-[11px] font-normal text-muted-foreground">{kindNote(t)}</p>}
            </div>
          )}
          pageSize={0}
          empty={
            <EmptyState
              compact
              icon={ListChecks}
              title="No leave types yet"
              description="Start with the standard set (Annual 14, Sick 8, Casual 10, Unpaid, Maternity 90, Paternity 7) or add your own."
              action={
                canEdit ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" className="rounded-xl" disabled={seed.isPending} onClick={() => seed.mutate()}>
                      <Sparkles className="mr-1.5 h-4 w-4" /> Add the standard set
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setDialog({ open: true, editing: null })}>
                      Add a type
                    </Button>
                  </div>
                ) : undefined
              }
            />
          }
        />
      </SectionCard>

      <SectionCard title="Approval" description="How employee requests from the portal are handled." icon={ShieldCheck}>
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold">Leave needs HR approval</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              When off, an employee's request is approved the moment it is filed and marked in attendance. HR is still notified.
            </span>
          </span>
          <Switch
            checked={settings.data?.requires_approval ?? true}
            disabled={!canEdit || settings.isLoading || saveSettings.isPending}
            onCheckedChange={(v) => saveSettings.mutate({ requiresApproval: v })}
            aria-label="Leave needs HR approval"
          />
        </label>
        <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p>Requests may start at most 30 days back and cover at most 200 days.</p>
          <p>Weekends, holidays and days outside employment are never counted.</p>
          <p>Months closed by a final payslip cannot change.</p>
        </div>
      </SectionCard>

      <LeaveTypeDialog open={dialog.open} editing={dialog.editing} existing={rows} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}
