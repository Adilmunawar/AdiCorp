import { useState } from "react";
import { endOfMonth, format, parseISO, startOfMonth, startOfWeek, startOfYear, subDays, subMonths } from "date-fns";
import { Download, FileSpreadsheet, FileText, Fingerprint, ListChecks, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MonthPicker, SectionCard, useCompany } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fetchDayLog, fetchPunchLog, useDepartments, useTimeSettings } from "../api";
import { exportDayLogCsv, exportPunchLogCsv, exportRegisterPdf, exportRegisterXlsx, exportSummaryCsv, logExport } from "../exports";
import { companyToday, errorMessage, monthStart } from "../lib";
import type { MonthRegister } from "../types";
import { DepartmentSelect } from "./shared";

type Kind = "daily" | "summary" | "punches";

const KINDS: { value: Kind; label: string; description: string; icon: typeof Sheet }[] = [
  { value: "daily", label: "Daily log", description: "One row per person per day: shift, first in, last out, hours, late and early minutes, status, notes.", icon: ListChecks },
  { value: "summary", label: "Summary", description: "One row per person: working days, present, absent, leave, late and early totals, hours, average first in, attendance %.", icon: Sheet },
  { value: "punches", label: "Punch log", description: "Every punch to the second: terminal ID, terminal, in/out, verified by and how it arrived.", icon: Fingerprint },
];

/** Quick ranges around the company's today (its timezone, not the viewer's); current periods end today. */
function ranges(todayStr: string) {
  const today = parseISO(todayStr);
  const d = (x: Date) => format(x, "yyyy-MM-dd");
  return [
    { label: "Today", from: todayStr, to: todayStr },
    { label: "Yesterday", from: d(subDays(today, 1)), to: d(subDays(today, 1)) },
    { label: "This week", from: d(startOfWeek(today, { weekStartsOn: 1 })), to: todayStr },
    { label: "This month", from: d(startOfMonth(today)), to: todayStr },
    { label: "Last month", from: d(startOfMonth(subMonths(today, 1))), to: d(endOfMonth(subMonths(today, 1))) },
    { label: "Year so far", from: d(startOfYear(today)), to: todayStr },
  ];
}

async function fetchRegister(month: string, department: string | null): Promise<MonthRegister> {
  const { data, error } = await db.rpc("time_month_register", { p_month: month, p_department: department });
  if (error) throw new Error(error.message);
  return data as MonthRegister;
}

export function ExportPanel() {
  const { company } = useCompany();
  const { companyId } = useAuth();
  const { data: departments = [] } = useDepartments();
  const { data: settings } = useTimeSettings();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [regDept, setRegDept] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const quick = ranges(companyToday(settings?.today, settings?.timezone));
  const [from, setFrom] = useState(quick[3].from);
  const [to, setTo] = useState(quick[3].to);
  const [kind, setKind] = useState<Kind>("daily");
  const [logDept, setLogDept] = useState<string | null>(null);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);

  const rangeInvalid = !!from && !!to && to < from;
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? null;

  const runRegister = async (formatKind: "xlsx" | "pdf") => {
    setBusy(`register-${formatKind}`);
    try {
      const monthStr = monthStart(month);
      const data = await fetchRegister(monthStr, regDept);
      if (data.employees.length === 0) {
        toast.info("Nothing to export", { description: "No one is on the register for that month." });
        return;
      }
      if (formatKind === "xlsx") await exportRegisterXlsx(data, { companyName: company?.name, department: deptName(regDept) });
      else await exportRegisterPdf(data, { company: { name: company?.name, logo: company?.logo }, department: deptName(regDept) });
      logExport("attendance.register_exported", `Exported the ${format(month, "MMMM yyyy")} attendance register (${formatKind.toUpperCase()})`, {
        month: monthStr,
        format: formatKind,
        department: regDept,
        people: data.employees.length,
      });
    } catch (e) {
      toast.error("Export failed", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const runLog = async () => {
    if (!companyId) return;
    if (!from || !to || to < from) {
      toast.error("Pick a valid range");
      return;
    }
    const days = (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000;
    if (kind !== "punches" && days > 92) {
      toast.error("Pick at most 93 days", { description: "Split longer periods into several exports." });
      return;
    }
    if (days > 366) {
      toast.error("Pick at most 366 days");
      return;
    }
    setBusy("log");
    try {
      const tz = settings?.timezone ?? "UTC";
      if (kind === "punches") {
        const rows = await fetchPunchLog(companyId, from, to);
        if (rows.length === 0) {
          toast.info("No punches in that range");
          return;
        }
        exportPunchLogCsv(rows, from, to, tz, includeUnlinked);
      } else {
        const rows = await fetchDayLog(from, to, logDept, null);
        if (rows.length === 0) {
          toast.info("Nothing to export for that range");
          return;
        }
        if (kind === "daily") exportDayLogCsv(rows, from, to, tz);
        else exportSummaryCsv(rows, from, to, settings?.grace_minutes ?? 15, tz);
      }
      logExport("attendance.exported", `Exported the ${KINDS.find((k) => k.value === kind)?.label.toLowerCase()} for ${from} to ${to}`, {
        kind,
        from,
        to,
        department: logDept,
      });
    } catch (e) {
      toast.error("Export failed", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Official register" description="One row per person, one column per day, totals and signatures." icon={FileSpreadsheet}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="micro-label">Month</Label>
              <MonthPicker selectedMonth={month} onMonthChange={setMonth} />
            </div>
            <div className="space-y-1.5">
              <Label className="micro-label">Department</Label>
              {departments.length > 0 ? (
                <DepartmentSelect value={regDept} onChange={setRegDept} className="sm:w-full" />
              ) : (
                <p className="flex h-9 items-center rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground">Everyone</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1 rounded-xl" onClick={() => runRegister("xlsx")} disabled={!!busy}>
              {busy === "register-xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Excel (.xlsx)
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => runRegister("pdf")} disabled={!!busy}>
              {busy === "register-pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              PDF with letterhead
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Excel totals are live COUNTIF formulas, so edits in the sheet recount. The PDF is A4 landscape with headers on every page, per-day totals, notes and signature lines.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Export logs" description="Daily log, summary or raw punches as CSV." icon={Download}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {quick.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => {
                  setFrom(r.from);
                  setTo(r.to);
                }}
                aria-pressed={from === r.from && to === r.to}
                className={cn(
                  "h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:h-7",
                  from === r.from && to === r.to ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exp-from" className="micro-label">From</Label>
              <Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-to" className="micro-label">To</Label>
              <Input id="exp-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-xl" aria-invalid={rangeInvalid} />
            </div>
          </div>
          {rangeInvalid && <p className="-mt-2 text-xs text-destructive">The end date must be on or after the start date.</p>}
          <div className="grid gap-2" role="radiogroup" aria-label="Kind of export">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  kind === k.value ? "border-primary bg-primary/[0.04] ring-1 ring-primary/25" : "border-border hover:border-primary/30",
                )}
              >
                <k.icon className={cn("mt-0.5 h-4 w-4 shrink-0", kind === k.value ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground">{k.label}</span>
                  <span className="block text-[11px] leading-relaxed text-muted-foreground">{k.description}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {kind === "punches" ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={includeUnlinked} onCheckedChange={setIncludeUnlinked} aria-label="Include unlinked terminal IDs" />
                Include unlinked terminal IDs
              </label>
            ) : (
              <DepartmentSelect value={logDept} onChange={setLogDept} />
            )}
            <Button className="ml-auto rounded-xl" onClick={runLog} disabled={!!busy || rangeInvalid}>
              {busy === "log" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download CSV
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
