import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarClock, Check, Download, FileCheck2, FileSignature, FolderOpen, GraduationCap, IdCard, Plus, Upload, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, EmptyState, FilterBar, PageHeader, SectionCard, StatusBadge, downloadCsv, formatDate, toDbDate, type DataColumn } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useDepartmentNames, useDepartments, useEmployees } from "../api/employees";
import { useDocumentStubs, useUploadDocument } from "../api/documents";
import type { Employee } from "../api/types";
import { REQUIRED_DOCUMENTS, documentTypeLabel, type DocumentType } from "../lib/constants";
import { daysUntil, matchesSearch } from "../lib/utils";
import { EmployeeChip, Field, ProgressBar, ProgressRing } from "../components/common";
import { DocumentUploadDialog } from "../components/DocumentUploadDialog";
import { EmployeePicker } from "../components/pickers";
import { LoadError, QuickFilters, type QuickFilterOption } from "../components/PageBits";

/** Documents within this many days of expiry (or already expired) need a renewed copy. */
const EXPIRY_WINDOW = 60;

const REQUIRED_ICONS: Record<string, LucideIcon> = { id_copy: IdCard, contract: FileSignature, certificate: GraduationCap };
const MISSING_LABELS: Record<string, string> = { id_copy: "Missing CNIC copy", contract: "Missing contract", certificate: "Missing certificate" };

type View = "attention" | "expiring" | "complete" | "all";
const VIEWS: View[] = ["attention", "expiring", "complete", "all"];

interface Row {
  employee: Employee;
  have: Set<string>;
  missing: DocumentType[];
  other: number;
  /** Required types whose copy on file expires within the window. */
  expiringTypes: Set<string>;
  expiring: number;
  /** Expiry date of each required type in `expiringTypes`. */
  expiryByType: Map<string, string>;
}

function RowStatus({ row }: { row: Row }) {
  if (row.missing.length === REQUIRED_DOCUMENTS.length) return <StatusBadge status="not_started" tone="neutral" label="Not started" />;
  if (row.missing.length > 0) return <StatusBadge status="pending" tone="warning" label={`${row.missing.length} missing`} />;
  if (row.expiring > 0) return <StatusBadge status="pending" tone="warning" label="Renew soon" />;
  return <StatusBadge status="complete" label="Complete" />;
}

function expiryPhrase(date: string | null): string {
  const d = daysUntil(date);
  if (d === null) return "";
  if (d < 0) return `expired ${formatDate(date)}`;
  if (d === 0) return "expires today";
  return `expires ${formatDate(date)}`;
}

/** One cell of the matrix: a tick when on file, a calendar when it expires soon, a dashed "+" to upload when missing. */
function DocCell({ row, type, onUpload }: { row: Row; type: DocumentType; onUpload: () => void }) {
  const label = documentTypeLabel(type);
  if (row.have.has(type)) {
    const soon = row.expiringTypes.has(type);
    const text = soon ? `${label} ${expiryPhrase(row.expiryByType.get(type) ?? null)}` : `${label} on file`;
    return (
      <span
        role="img"
        aria-label={text}
        title={text}
        className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-inset", soon ? "bg-warning-soft text-warning ring-warning/20" : "bg-success-soft text-success ring-success/15")}
      >
        {soon ? <CalendarClock className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onUpload();
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Upload ${label} for ${row.employee.name}`}
      title={`Missing. Upload ${label.toLowerCase()}`}
    >
      <Plus className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** Step one of "Upload document" from the header: whose file is it? */
function ChooseEmployeeDialog({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (employeeId: string) => void }) {
  const [emp, setEmp] = useState("");
  useEffect(() => {
    if (open) setEmp("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>Choose whose file this is. You pick the document type and the file next.</DialogDescription>
        </DialogHeader>
        <form
          id="choose-employee"
          onSubmit={(e) => {
            e.preventDefault();
            if (emp) onChoose(emp);
          }}
        >
          <Field id="doc-employee" label="Employee" required>
            <EmployeePicker id="doc-employee" value={emp} onChange={setEmp} />
          </Field>
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="choose-employee" disabled={!emp}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const employeesQuery = useEmployees();
  const stubsQuery = useDocumentStubs();
  const { data: employees = [] } = employeesQuery;
  const { data: stubs = [] } = stubsQuery;
  const loading = employeesQuery.isLoading || stubsQuery.isLoading;
  const failed = employeesQuery.isError || stubsQuery.isError;
  const { data: departments = [] } = useDepartments();
  const deptNames = useDepartmentNames();
  const upload = useUploadDocument();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const dept = params.get("dept") ?? "all";
  const rawView = params.get("view") ?? (params.get("all") === "1" ? "all" : "attention");
  const view: View = VIEWS.includes(rawView as View) ? (rawView as View) : "attention";
  const rawDoc = params.get("doc") ?? "any";
  const docFilter = REQUIRED_DOCUMENTS.some((r) => r.type === rawDoc) ? (rawDoc as DocumentType) : "any";
  const [target, setTarget] = useState<{ employee: Employee; type: DocumentType } | null>(null);
  const [choosing, setChoosing] = useState(false);

  const setParam = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("all");
        Object.entries(changes).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
        return p;
      },
      { replace: true },
    );

  const rows: Row[] = useMemo(() => {
    const byEmp = new Map<string, typeof stubs>();
    stubs.forEach((d) => byEmp.set(d.employee_id, [...(byEmp.get(d.employee_id) ?? []), d]));
    return employees
      .filter((e) => e.status === "active")
      .map((e) => {
        const docs = byEmp.get(e.id) ?? [];
        const have = new Set(docs.map((d) => d.document_type as string));
        const isRequired = (type: string) => REQUIRED_DOCUMENTS.some((r) => r.type === type);
        const due = (date: string | null) => {
          const n = daysUntil(date);
          return n !== null && n <= EXPIRY_WINDOW;
        };
        // A required document counts by its best copy on file: one without an expiry never lapses,
        // otherwise the latest expiry wins, so uploading a renewed CNIC clears the old copy's warning.
        const best = new Map<string, string | null>();
        docs.forEach((d) => {
          if (!isRequired(d.document_type)) return;
          const prev = best.get(d.document_type);
          if (prev === null) return;
          if (!d.expires_on) best.set(d.document_type, null);
          else if (prev === undefined || d.expires_on > prev) best.set(d.document_type, d.expires_on);
        });
        const expiryByType = new Map<string, string>();
        best.forEach((date, type) => {
          if (date && due(date)) expiryByType.set(type, date);
        });
        const otherDue = docs.filter((d) => !isRequired(d.document_type) && due(d.expires_on)).length;
        return {
          employee: e,
          have,
          missing: REQUIRED_DOCUMENTS.filter((r) => !have.has(r.type)).map((r) => r.type),
          other: docs.filter((d) => !isRequired(d.document_type)).length,
          expiringTypes: new Set(expiryByType.keys()),
          expiring: expiryByType.size + otherDue,
          expiryByType,
        };
      });
  }, [employees, stubs]);

  const coverage = useMemo(() => {
    const complete = rows.filter((r) => r.missing.length === 0).length;
    const byType = REQUIRED_DOCUMENTS.map((req) => {
      const have = rows.filter((r) => r.have.has(req.type)).length;
      return { type: req.type, have, missing: rows.length - have };
    });
    return { complete, ratio: rows.length ? complete / rows.length : 0, byType, expiringDocs: rows.reduce((n, r) => n + r.expiring, 0) };
  }, [rows]);

  // Department, search and document filters first; the quick-filter counts follow them.
  const base = rows.filter(
    (r) =>
      (dept === "all" || r.employee.department_id === dept) &&
      (docFilter === "any" || r.missing.includes(docFilter)) &&
      matchesSearch([r.employee.name, r.employee.employee_code, r.employee.rank], [r.employee.cnic], search),
  );
  const inView = (r: Row, v: View) =>
    v === "all" ? true : v === "complete" ? r.missing.length === 0 && r.expiring === 0 : v === "expiring" ? r.expiring > 0 : r.missing.length > 0 || r.expiring > 0;
  const visible = base.filter((r) => inView(r, view));
  const filtered = !!search || dept !== "all" || docFilter !== "any";

  // Counts appear once the data is in, so a loading page never claims "0".
  const countOf = (v: View) => (loading ? undefined : base.filter((r) => inView(r, v)).length);
  const viewOptions: QuickFilterOption[] = [
    { value: "attention", label: "Needs attention", count: countOf("attention"), tone: "warning" },
    ...(coverage.expiringDocs > 0 || view === "expiring" ? [{ value: "expiring", label: "Renew soon", count: countOf("expiring"), tone: "warning" as const }] : []),
    { value: "complete", label: "Complete", count: countOf("complete") },
    { value: "all", label: "Everyone", count: countOf("all") },
  ];

  const openUpload = (employee: Employee, type: DocumentType) => setTarget({ employee, type });

  const columns: DataColumn<Row>[] = [
    {
      id: "name",
      header: "Employee",
      sortValue: (r) => r.employee.name,
      hideOnCard: true,
      cell: (r) => <EmployeeChip id={r.employee.id} name={r.employee.name} avatar={r.employee.avatar_url} subtitle={[r.employee.employee_code, deptNames.get(r.employee.department_id ?? "")].filter(Boolean).join(" · ")} />,
    },
    ...REQUIRED_DOCUMENTS.map(
      (req): DataColumn<Row> => ({
        id: req.type,
        header: req.short,
        align: "center",
        hideOnCard: true,
        className: "w-[96px]",
        sortValue: (r) => r.have.has(req.type),
        cell: (r) => <DocCell row={r} type={req.type} onUpload={() => openUpload(r.employee, req.type)} />,
      }),
    ),
    {
      id: "other",
      header: "Other files",
      align: "center",
      hideBelow: "md",
      hideOnCard: true,
      className: "w-[104px]",
      sortValue: (r) => r.other,
      cell: (r) => <span className="tabular text-[12px] text-muted-foreground">{r.other || "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      hideOnCard: true,
      className: "w-[132px]",
      sortValue: (r) => r.missing.length * 10 + Math.min(r.expiring, 9),
      cell: (r) => <RowStatus row={r} />,
    },
  ];

  const exportCsv = () =>
    downloadCsv(visible, `document-tracking-${toDbDate()}`, [
      { header: "Employee", value: (r) => r.employee.name },
      { header: "Employee code", value: (r) => r.employee.employee_code },
      { header: "Department", value: (r) => deptNames.get(r.employee.department_id ?? "") },
      ...REQUIRED_DOCUMENTS.map((req) => ({ header: documentTypeLabel(req.type), value: (r: Row) => (r.have.has(req.type) ? (r.expiringTypes.has(req.type) ? "Expiring" : "On file") : "Missing") })),
      { header: "Missing", value: (r) => r.missing.length },
      { header: "Other files", value: (r) => r.other },
    ]);

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title="Documents"
        icon={FileCheck2}
        eyebrow="People"
        description="The CNIC copy, signed contract and education certificate every active employee needs on file."
        actions={
          <>
            <Button size="sm" variant="outline" disabled={loading || !visible.length} onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" disabled={loading || !rows.length} onClick={() => setChoosing(true)}>
              <Upload className="h-4 w-4" /> Upload document
            </Button>
          </>
        }
      />

      {failed ? (
        <LoadError
          what="Document tracking"
          icon={FileCheck2}
          onRetry={() => {
            employeesQuery.refetch();
            stubsQuery.refetch();
          }}
        />
      ) : (
        <>
          <SectionCard
            className="mb-4"
            flush
            footer={
              <p className="flex items-start gap-2 text-[12px] leading-5 text-muted-foreground">
                <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span>
                  Upload on someone&apos;s behalf from the list below, or ask employees to add their own copies under <span className="font-medium text-foreground">My documents</span> in the
                  employee portal. Their uploads appear here straight away.
                </span>
              </p>
            }
          >
            <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <div className="flex items-center gap-4 border-b border-border/60 p-4 sm:p-5 lg:border-b-0 lg:border-r">
                {loading ? (
                  <Skeleton className="h-[76px] w-[76px] shrink-0 rounded-full" />
                ) : (
                  <ProgressRing value={coverage.ratio} size={76} label={`${Math.round(coverage.ratio * 100)}% of files complete`} />
                )}
                <div className="min-w-0">
                  <p className="micro-label">Complete files</p>
                  {loading ? (
                    <Skeleton className="mt-2 h-5 w-40" />
                  ) : (
                    <p className="tabular mt-1 font-display text-[17px] font-semibold leading-snug tracking-tight">
                      {coverage.complete} of {rows.length} {rows.length === 1 ? "employee" : "employees"}
                    </p>
                  )}
                  <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">have every required document on file.</p>
                </div>
              </div>
              <ul className="divide-y divide-border/60" aria-label="Coverage by document">
                {REQUIRED_DOCUMENTS.map((req) => {
                  const c = coverage.byType.find((x) => x.type === req.type)!;
                  const Icon = REQUIRED_ICONS[req.type] ?? FileCheck2;
                  const active = docFilter === req.type;
                  return (
                    <li key={req.type} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", active && "bg-primary/[0.03]")}>
                      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-border/60 sm:flex" aria-hidden>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
                          <p className="truncate text-[13px] font-semibold">{documentTypeLabel(req.type)}</p>
                          {loading ? (
                            <Skeleton className="h-3 w-20" />
                          ) : (
                            <p className="tabular text-[12px] text-muted-foreground">
                              <span className="font-semibold text-foreground">{c.have}</span> of {rows.length} on file
                            </p>
                          )}
                        </div>
                        <ProgressBar value={rows.length ? c.have / rows.length : 0} tone={rows.length && c.have === rows.length ? "success" : "primary"} className="mt-2" />
                      </div>
                      {!loading &&
                        (c.missing > 0 ? (
                          <Button
                            size="sm"
                            variant={active ? "soft" : "ghost"}
                            className="h-10 shrink-0 px-2.5 sm:h-8"
                            aria-pressed={active}
                            aria-label={`${c.missing} ${c.missing === 1 ? "employee is" : "employees are"} missing the ${documentTypeLabel(req.type).toLowerCase().replace("cnic", "CNIC")}. Show them`}
                            onClick={() => setParam({ doc: active ? null : req.type, view: active ? null : "attention" })}
                          >
                            <span className="tabular">{c.missing}</span> missing <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <StatusBadge status="complete" label="All on file" className="shrink-0" />
                        ))}
                    </li>
                  );
                })}
              </ul>
            </div>
          </SectionCard>

          {coverage.expiringDocs > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning-soft p-3.5">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p className="text-[13px] text-foreground">
                <span className="font-semibold">
                  {coverage.expiringDocs} {coverage.expiringDocs === 1 ? "document expires" : "documents expire"} within {EXPIRY_WINDOW} days or already expired.
                </span>{" "}
                <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setParam({ view: "expiring" })}>
                  Show who needs a renewed copy
                </button>
              </p>
            </div>
          )}

          <SectionCard flush>
            <div className="space-y-3 border-b border-border/60 p-3 sm:p-4">
              <QuickFilters label="Show" options={viewOptions} value={view} onChange={(v) => setParam({ view: v === "attention" ? null : v })} />
              <FilterBar
                search={search}
                onSearchChange={(v) => setParam({ q: v || null })}
                placeholder="Search name, code or CNIC…"
                actions={
                  <p className="hidden items-center gap-3 text-[11px] text-muted-foreground lg:flex" aria-hidden>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-inset ring-success/15">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      On file
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-muted-foreground/50">
                        <Plus className="h-2.5 w-2.5" />
                      </span>
                      Missing, click to upload
                    </span>
                  </p>
                }
              >
                <Select value={dept} onValueChange={(v) => setParam({ dept: v === "all" ? null : v })}>
                  <SelectTrigger className="h-10 w-full rounded-xl text-xs sm:h-9 sm:w-[180px]" aria-label="Department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={docFilter} onValueChange={(v) => setParam({ doc: v === "any" ? null : v })}>
                  <SelectTrigger className="h-10 w-full rounded-xl text-xs sm:h-9 sm:w-[190px]" aria-label="Missing document">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any document</SelectItem>
                    {REQUIRED_DOCUMENTS.map((req) => (
                      <SelectItem key={req.type} value={req.type}>
                        {MISSING_LABELS[req.type] ?? `Missing ${documentTypeLabel(req.type).toLowerCase()}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar>
            </div>
            <DataTable
              columns={columns}
              rows={visible}
              getRowId={(r) => r.employee.id}
              loading={loading}
              initialSort={{ column: "status", direction: "desc" }}
              pageSize={25}
              onRowClick={(r) => navigate(`/employees/${r.employee.id}?tab=documents`)}
              mobileTitle={(r) => (
                <div className="font-normal">
                  <div className="flex items-start justify-between gap-2">
                    <EmployeeChip id={r.employee.id} name={r.employee.name} avatar={r.employee.avatar_url} subtitle={[r.employee.employee_code, deptNames.get(r.employee.department_id ?? "")].filter(Boolean).join(" · ")} />
                    <RowStatus row={r} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    {REQUIRED_DOCUMENTS.map((req) =>
                      r.have.has(req.type) ? (
                        <span
                          key={req.type}
                          className={cn(
                            "inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl text-[12px] font-medium",
                            r.expiringTypes.has(req.type) ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
                          )}
                        >
                          {r.expiringTypes.has(req.type) ? <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
                          <span className="truncate">{req.short}</span>
                        </span>
                      ) : (
                        <button
                          key={req.type}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openUpload(r.employee, req.type);
                          }}
                          className="inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border border-dashed border-muted-foreground/50 text-[12px] font-medium text-muted-foreground active:bg-primary/5"
                          aria-label={`Upload ${documentTypeLabel(req.type)} for ${r.employee.name}`}
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{req.short}</span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
              caption="Required documents per employee"
              empty={
                rows.length === 0 ? (
                  <EmptyState icon={FileCheck2} title="No active employees" description="Add employees first; their documents are tracked here." compact />
                ) : filtered ? (
                  <EmptyState
                    icon={FileCheck2}
                    title="Nobody matches these filters"
                    description="Try another name, department or document."
                    action={
                      <Button size="sm" variant="outline" onClick={() => setParam({ q: null, dept: null, doc: null })}>
                        Clear filters
                      </Button>
                    }
                    compact
                  />
                ) : view === "complete" ? (
                  <EmptyState
                    icon={FileCheck2}
                    title="No complete files yet"
                    description="People appear here once their CNIC copy, contract and certificate are all on file."
                    action={
                      <Button size="sm" variant="outline" onClick={() => setParam({ view: null })}>
                        Show who needs attention
                      </Button>
                    }
                    compact
                  />
                ) : (
                  <EmptyState
                    icon={Check}
                    title="Everyone's paperwork is in order"
                    description="Nobody is missing a required document or needs a renewed copy."
                    action={
                      <Button size="sm" variant="outline" onClick={() => setParam({ view: "all" })}>
                        Show everyone
                      </Button>
                    }
                    compact
                  />
                )
              }
            />
          </SectionCard>
        </>
      )}

      <ChooseEmployeeDialog
        open={choosing}
        onOpenChange={setChoosing}
        onChoose={(id) => {
          const row = rows.find((r) => r.employee.id === id);
          const employee = row?.employee ?? employees.find((e) => e.id === id);
          setChoosing(false);
          if (employee) openUpload(employee, row?.missing[0] ?? "other");
        }}
      />
      <DocumentUploadDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        defaultType={target?.type ?? "id_copy"}
        title={target ? `${documentTypeLabel(target.type)} for ${target.employee.name}` : "Upload a document"}
        onSubmit={(v) => upload.mutateAsync({ employeeId: target!.employee.id, employeeName: target!.employee.name, file: v.file, type: v.type, name: v.name, expiresOn: v.expiresOn })}
      />
    </div>
  );
}
