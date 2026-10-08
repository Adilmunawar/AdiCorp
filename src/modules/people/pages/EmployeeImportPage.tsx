import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Download, FileSpreadsheet, Loader2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, EmptyState, PageHeader, SectionCard, StatusBadge, formatDate, type DataColumn } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useImportEmployees, type ImportResult } from "../api/employees";
import { IMPORT_COLUMNS, downloadImportTemplate, parseImportFile, type DateOrder, type ParsedImport } from "../lib/spreadsheet";
import { errorMessage, formatCnic } from "../lib/utils";

interface PreviewRow {
  index: number;
  sourceRow: number;
  data: Record<string, string>;
  problems: string[];
}

function localProblems(row: Record<string, string>): string[] {
  const p: string[] = [];
  if (!row.name || row.name.length < 2) p.push("Name is missing.");
  if ((row.cnic ?? "").replace(/\D/g, "").length !== 13) p.push("CNIC must have 13 digits.");
  if (!row.rank || row.rank.length < 2) p.push("Position is missing.");
  if (!row.joining_date) p.push("Joining date is missing.");
  if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) p.push("E-mail looks wrong.");
  return p;
}

export default function EmployeeImportPage() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const importer = useImportEmployees();
  const [order, setOrder] = useState<DateOrder>("dmy");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [reading, setReading] = useState(false);
  const [startOnboarding, setStartOnboarding] = useState(true);
  const [serverErrors, setServerErrors] = useState<ImportResult["errors"]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const read = async (f: File, o: DateOrder) => {
    setReading(true);
    setServerErrors([]);
    try {
      setParsed(await parseImportFile(f, o));
    } catch (e) {
      setParsed(null);
      toast.error(errorMessage(e, "Could not read the file."));
    } finally {
      setReading(false);
    }
  };

  const preview: PreviewRow[] = (parsed?.rows ?? []).map((data, index) => ({
    index,
    sourceRow: parsed!.sourceRows[index],
    data,
    problems: [...(parsed!.problems.get(index) ?? []), ...localProblems(data), ...serverErrors.filter((s) => s.row === index + 1).map((s) => s.message)],
  }));
  const withProblems = preview.filter((r) => r.problems.length > 0).length;

  const run = async () => {
    if (!parsed) return;
    try {
      const res = await importer.mutateAsync({ rows: parsed.rows, startOnboarding });
      if (res.errors.length) {
        setServerErrors(res.errors);
        toast.error(`Nothing was imported: ${res.errors.length} row${res.errors.length === 1 ? " has a" : "s have"} problems.`);
        return;
      }
      setResult(res);
      toast.success(`Imported ${res.created.length} ${res.created.length === 1 ? "person" : "people"}`);
    } catch (e) {
      toast.error(errorMessage(e, "Import failed."));
    }
  };

  const columns: DataColumn<PreviewRow>[] = [
    { id: "row", header: "Row", className: "w-14", sortValue: (r) => r.sourceRow, cell: (r) => <span className="tabular text-muted-foreground">{r.sourceRow}</span>, hideBelow: "sm" },
    {
      id: "name",
      header: "Person",
      sortValue: (r) => r.data.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{r.data.name || "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.data.cnic ? formatCnic(r.data.cnic) : "No CNIC"}</p>
        </div>
      ),
    },
    {
      id: "role",
      header: "Position",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px]">{r.data.rank || "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.data.department || "No department"}</p>
        </div>
      ),
    },
    { id: "joined", header: "Joined", hideBelow: "md", cell: (r) => <span className="tabular text-[12px]">{formatDate(r.data.joining_date)}</span> },
    {
      id: "check",
      header: "Check",
      sortValue: (r) => r.problems.length,
      cell: (r) =>
        r.problems.length === 0 ? (
          <StatusBadge status="approved" label="Ready" />
        ) : (
          <div className="space-y-0.5">
            {r.problems.map((p) => (
              <p key={p} className="text-[11px] font-medium text-destructive">
                {p}
              </p>
            ))}
          </div>
        ),
    },
  ];

  if (result) {
    const allCodes = result.created.map((c) => `${c.employee_code}\t${c.name}`).join("\n");
    return (
      <div className="animate-in fade-in duration-300">
        <PageHeader title="Import complete" icon={CheckCircle2} eyebrow="Employees" description={`${result.created.length} people added${result.departments_created ? ` · ${result.departments_created} new departments` : ""}. Finance has been asked to set their salaries.`} />
        <SectionCard
          title="New employees"
          flush
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(allCodes);
                  toast.success("Codes copied");
                } catch {
                  toast.error("Copy failed. Select the list instead.");
                }
              }}
            >
              <Copy className="h-4 w-4" /> Copy all codes
            </Button>
          }
        >
          <ul className="divide-y divide-border/60">
            {result.created.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <Link to={`/employees/${c.id}`} className="truncate text-[13px] font-semibold hover:text-primary">
                  {c.name}
                </Link>
                <span className="tabular shrink-0 text-[12px] font-bold text-primary">{c.employee_code ?? "—"}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => navigate("/employees")}>
            <Users className="h-4 w-4" /> Open the directory
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setParsed(null);
              setFile(null);
            }}
          >
            Import more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-9 px-2 text-muted-foreground sm:h-8" asChild>
        <Link to="/employees">
          <ArrowLeft className="h-4 w-4" /> Employees
        </Link>
      </Button>
      <PageHeader
        title="Import employees"
        icon={FileSpreadsheet}
        eyebrow="Employees"
        description="Upload an Excel or CSV file. Everyone is checked first: if any row has a problem, nobody is added."
        actions={
          <Button variant="outline" size="sm" onClick={() => downloadImportTemplate(company?.name).catch((e) => toast.error(errorMessage(e)))}>
            <Download className="h-4 w-4" /> Download template
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="1. Choose the file">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              {reading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-primary" />}
              <span className="max-w-full break-all text-[13px] font-semibold">{file ? file.name : "Choose an .xlsx, .xls or .csv file"}</span>
              <span className="text-[11px] text-muted-foreground">{file ? "Choose another file to replace it" : "Up to 500 people and 5 MB per file"}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return toast.error("The file is larger than 5 MB.");
                setFile(f);
                void read(f, order);
              }}
            />
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="date-order" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Dates like 03/04/2026 mean
              </Label>
              <Select
                value={order}
                onValueChange={(v) => {
                  setOrder(v as DateOrder);
                  if (file) void read(file, v as DateOrder);
                }}
              >
                <SelectTrigger id="date-order" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dmy">3 April (day first)</SelectItem>
                  <SelectItem value="mdy">March 4 (month first)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SectionCard>

          <SectionCard title="Columns">
            <ul className="space-y-1 text-[12px]">
              {IMPORT_COLUMNS.map((c) => {
                const found = parsed?.mapped.find((m) => m.key === c.key);
                return (
                  <li key={c.key} className="flex items-center justify-between gap-2">
                    <span className={found ? "font-medium" : "text-muted-foreground"}>
                      {c.header}
                      {c.required && <span className="text-destructive"> *</span>}
                    </span>
                    {parsed && (found ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <span className="text-[10px] text-muted-foreground">not in file</span>)}
                  </li>
                );
              })}
            </ul>
            {!!parsed?.ignored.length && (
              <p className="mt-3 rounded-xl bg-muted/60 p-2.5 text-[11px] text-muted-foreground">Ignored columns: {parsed.ignored.join(", ")}</p>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="2. Check and import"
          description={parsed ? `${preview.length} people · ${withProblems ? `${withProblems} with problems` : "all ready"}` : "Nothing loaded yet"}
          flush
          actions={
            parsed ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[12px]">
                  <Checkbox checked={startOnboarding} onCheckedChange={(v) => setStartOnboarding(v === true)} />
                  Start onboarding for recent joiners
                </label>
                <Button size="sm" onClick={run} disabled={importer.isPending || withProblems > 0 || preview.length === 0}>
                  {importer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import {preview.length}
                </Button>
              </div>
            ) : undefined
          }
        >
          {withProblems > 0 && (
            <div className="flex items-start gap-2 border-b border-border/60 bg-destructive/5 px-4 py-2.5 text-[12px] text-destructive sm:px-5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Fix the rows marked below in your file and choose it again. Nothing has been saved.
            </div>
          )}
          <DataTable
            columns={columns}
            rows={preview}
            getRowId={(r) => String(r.index)}
            pageSize={50}
            initialSort={{ column: "check", direction: "desc" }}
            empty={<EmptyState icon={FileSpreadsheet} title="Upload a file to preview it" description="Download the template to see the expected columns." compact />}
          />
        </SectionCard>
      </div>
    </div>
  );
}
