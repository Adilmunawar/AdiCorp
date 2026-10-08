import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Clock3, Database, Download, FileJson, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog, EmptyState, SectionCard, Skeleton, downloadBlob, formatDate, formatDateTime, formatNumber, formatRelative, humanize } from "@/components/kit";
import { cn } from "@/lib/utils";
import { buildBackup, platformKeys, useDataOverview, type BackupScope } from "../api";

interface Progressing {
  scope: BackupScope;
  done: number;
  total: number;
  table: string;
}

/** Table names read as words, with the usual acronyms kept upper case. */
function tableLabel(name: string): string {
  return humanize(name).replace(/\b(Hr|Ot|Id|Mfa|Pdf|Cnic)\b/g, (w) => w.toUpperCase());
}

/* Tables grouped the way people think about their records. Unknown tables fall into "Settings and other". */
const GROUPS: { key: string; label: string; tables: string[] }[] = [
  {
    key: "people",
    label: "People and documents",
    tables: ["employees", "departments", "profiles", "employee_documents", "employee_update_requests", "employee_checklists", "employee_checklist_items", "checklist_templates", "checklist_template_steps", "assets", "asset_assignments"],
  },
  {
    key: "time",
    label: "Attendance and time",
    tables: ["attendance", "time_punches", "punch_corrections", "time_devices", "time_device_keys", "time_terminal_links", "events", "working_days_config", "monthly_working_days", "company_working_settings", "time_settings"],
  },
  { key: "leave", label: "Leave and overtime hours", tables: ["leave_requests", "leave_balances", "leave_types", "leave_settings", "overtime_records", "overtime_config"] },
  { key: "pay", label: "Pay", tables: ["payslips", "salary_history", "pay_events", "payroll_settings", "tier_config"] },
  { key: "expenses", label: "Courses and expenses", tables: ["expenses", "expense_payments", "expense_files"] },
  { key: "engagement", label: "Engagement", tables: ["announcements", "messages", "complaints", "polls", "poll_options", "poll_votes", "celebration_greetings", "celebration_wishes"] },
  { key: "policies", label: "Policies and letters", tables: ["policies", "policy_versions", "policy_signatures", "hr_letters", "letter_settings"] },
  { key: "hiring", label: "Hiring", tables: ["job_postings", "job_applications", "job_application_notes"] },
  { key: "activity", label: "Timeline", tables: ["activity_logs"] },
];
const OTHER = { key: "other", label: "Settings and other" };

const STALE_DAYS = 30;

export function BackupsTab() {
  const { isOwner, company, companyId } = useAuth();
  const overview = useDataOverview();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<Progressing | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const run = async (scope: BackupScope) => {
    setProgress({ scope, done: 0, total: 0, table: "" });
    try {
      const backup = await buildBackup(scope, (done, total, table) => setProgress({ scope, done, total, table }));
      // Local date and time (toISOString is UTC, which named a backup taken after midnight with yesterday's date).
      const stamp = formatDate(new Date(), "yyyy-MM-dd-HH-mm");
      const slug = (company?.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      downloadBlob(blob, `${slug}-${scope === "full" ? "full" : "hr"}-backup-${stamp}.json`);
      toast.success("Backup downloaded", { description: `${backup.tables.length} tables. Keep the file somewhere safe.` });
      void qc.invalidateQueries({ queryKey: platformKeys.dataOverview(companyId) });
    } catch (e) {
      toast.error("The backup failed", { description: e instanceof Error ? e.message : undefined });
      throw e;
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const tables = useMemo(() => overview.data?.tables ?? [], [overview.data]);
  const totalRows = tables.reduce((a, t) => a + t.rows, 0);
  const last = overview.data?.last_backup ?? null;
  const lastAgeDays = last ? (Date.now() - new Date(last.at).getTime()) / 86_400_000 : null;
  const stale = !last || (lastAgeDays !== null && lastAgeDays > STALE_DAYS);

  const groups = useMemo(() => {
    const known = new Set(GROUPS.flatMap((g) => g.tables));
    const list = [...GROUPS, { ...OTHER, tables: tables.map((t) => t.name).filter((n) => !known.has(n)) }];
    return list
      .map((g) => {
        const rows = tables.filter((t) => g.tables.includes(t.name)).sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
        return { key: g.key, label: g.label, tables: rows, total: rows.reduce((a, t) => a + t.rows, 0) };
      })
      .filter((g) => g.tables.length > 0);
  }, [tables]);
  const maxGroup = Math.max(1, ...groups.map((g) => g.total));

  return (
    <div className="space-y-4">
      {/* Last backup status */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border px-4 py-3.5 sm:items-center sm:px-5",
          overview.isPending ? "border-border bg-card" : stale ? "border-warning/30 bg-warning-soft" : "border-success/25 bg-success-soft",
        )}
        role="status"
      >
        {overview.isPending ? (
          <Skeleton className="h-5 w-64" />
        ) : (
          <>
            {stale ? <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warning sm:mt-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success sm:mt-0" aria-hidden />}
            <p className="min-w-0 text-[13px] leading-5 text-foreground">
              {last ? (
                <>
                  <span className="font-semibold">
                    Last backup <span title={formatDateTime(last.at)}>{formatRelative(last.at)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {last.action === "settings.full_backup" ? "full" : "HR only"}
                    {last.by ? `, by ${last.by}` : ""}
                    {stale ? `. We suggest a fresh copy at least every ${STALE_DAYS} days.` : "."}
                  </span>
                </>
              ) : overview.isError ? (
                <span className="text-muted-foreground">The last backup date could not load.</span>
              ) : (
                <>
                  <span className="font-semibold">No backup downloaded yet.</span>
                  <span className="text-muted-foreground"> Keep a copy outside AdiCorp, and take a fresh one before any big change.</span>
                </>
              )}
            </p>
          </>
        )}
      </div>

      <div className={cn("grid gap-4", isOwner && "md:grid-cols-2")}>
        <SectionCard title="HR backup" description="People, time, leave, engagement and documents" icon={ShieldCheck} className="flex flex-col" contentClassName="flex flex-1 flex-col">
          <ul className="space-y-1.5 text-[13px] leading-5 text-muted-foreground">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden /> Every HR record in one readable JSON file
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden /> No pay data: salaries, payslips, payments and receipts are left out
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden /> No passwords or sessions. Safe to hand to HR
            </li>
          </ul>
          <div className="mt-auto pt-4">
            <Button onClick={() => void run("hr").catch(() => undefined)} disabled={busy} className="h-10 w-full sm:w-auto">
              {progress?.scope === "hr" ? <Loader2 className="animate-spin" /> : <Download />} Download HR backup
            </Button>
          </div>
        </SectionCard>
        {isOwner && (
          <SectionCard title="Full backup" description="Everything, including pay" icon={ShieldAlert} className="flex flex-col" contentClassName="flex flex-1 flex-col">
            <ul className="space-y-1.5 text-[13px] leading-5 text-muted-foreground">
              <li className="flex gap-2">
                <FileJson className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> Every company table, including salaries, payslips and expenses
              </li>
              <li className="flex gap-2">
                <FileJson className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> Passwords and sessions are never included
              </li>
              <li className="flex gap-2">
                <FileJson className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> Other owners are notified; at most 5 downloads an hour
              </li>
            </ul>
            <div className="mt-auto pt-4">
              <Button variant="outline" onClick={() => setConfirmFull(true)} disabled={busy} className="h-10 w-full sm:w-auto">
                {progress?.scope === "full" ? <Loader2 className="animate-spin" /> : <Download />} Download full backup
              </Button>
            </div>
          </SectionCard>
        )}
      </div>

      {progress && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" role="status" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold">{progress.table ? `Exporting ${tableLabel(progress.table)}…` : "Preparing…"}</span>
            <span className="tabular shrink-0 text-muted-foreground">{progress.total ? `${progress.done} of ${progress.total} tables` : "…"}</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

      <SectionCard
        title="What is stored"
        description={
          overview.data
            ? `${formatNumber(totalRows, 0)} records in ${formatNumber(tables.length, 0)} tables${overview.data.scope === "hr" ? ", HR view without pay" : ""}`
            : "Records stored for your company"
        }
        icon={Database}
        flush
      >
        {overview.isPending ? (
          <div className="space-y-3 p-4 sm:p-5" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : overview.isError ? (
          <EmptyState
            compact
            icon={Database}
            title="The record counts could not load"
            description={overview.error instanceof Error ? overview.error.message : "Please try again."}
            action={
              <Button size="sm" variant="outline" onClick={() => void overview.refetch()}>
                Try again
              </Button>
            }
          />
        ) : groups.length === 0 ? (
          <EmptyState compact icon={Database} title="Nothing stored yet" description="Record counts appear here once your team starts adding people and records." />
        ) : (
          <ul className="divide-y divide-border/60" aria-label="Records by area">
            {groups.map((g) => {
              const expanded = open === g.key;
              return (
                <li key={g.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : g.key)}
                    aria-expanded={expanded}
                    aria-controls={`backup-group-${g.key}`}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-semibold text-foreground">{g.label}</span>
                        <span className="tabular shrink-0 text-[13px] font-semibold text-foreground">{formatNumber(g.total, 0)}</span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-3">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, (g.total / maxGroup) * 100)}%` }} />
                        </span>
                        <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                          {g.tables.length} {g.tables.length === 1 ? "table" : "tables"}
                        </span>
                      </span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
                  </button>
                  {expanded && (
                    <ul id={`backup-group-${g.key}`} className="grid gap-x-8 bg-muted/20 px-4 pb-3 pt-1 sm:grid-cols-2 sm:px-5">
                      {g.tables.map((t) => (
                        <li key={t.name} className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-xs">
                          <span className="min-w-0 truncate text-muted-foreground" title={tableLabel(t.name)}>
                            {tableLabel(t.name)}
                          </span>
                          <span className="tabular shrink-0 font-semibold text-foreground">{formatNumber(t.rows, 0)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirmFull}
        onOpenChange={setConfirmFull}
        title="Download a full backup?"
        description="The file contains personal data and every salary. Store it encrypted and never share it by email or chat. Other owners are notified."
        confirmLabel="Download"
        destructive={false}
        onConfirm={() => {
          setConfirmFull(false);
          return run("full").catch(() => undefined);
        }}
      />
    </div>
  );
}
