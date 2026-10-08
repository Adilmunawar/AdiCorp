import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2,
  Download,
  FileSpreadsheet,
  FileWarning,
  Hash,
  LayoutGrid,
  List,
  Pencil,
  RotateCcw,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  RowActions,
  SectionCard,
  Skeleton,
  StatGrid,
  StatTile,
  StatusBadge,
  downloadCsv,
  formatDate,
  toDbDate,
  type DataColumn,
} from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useAssignMissingCodes, useDepartments, useEmployees, usePeopleContext } from "../api/employees";
import { useDocumentStubs } from "../api/documents";
import type { Employee } from "../api/types";
import { REQUIRED_DOCUMENTS, SHIFT_OPTIONS, documentTypeLabel } from "../lib/constants";
import { completeness, errorMessage, formatPhone, isNewJoiner, matchesSearch, tenure } from "../lib/utils";
import { exportEmployeesXlsx } from "../lib/spreadsheet";
import { EmployeeAvatar, EmployeeChip, PHONE_TILE } from "../components/common";
import { MoveDepartmentDialog, RejoinDialog, SeparateDialog } from "../components/EmployeeDialogs";

const ALL = "all";
const GRID_PAGE = 24;
type Quick = "all" | "incomplete" | "docs" | "new" | "no_code";

/** Required documents on file as a small segmented meter plus a label. */
function DocsMeter({ have, missing }: { have: number; missing: string[] }) {
  const total = REQUIRED_DOCUMENTS.length;
  const complete = have >= total;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={complete ? "All required documents on file" : `Missing: ${missing.join(", ")}`}>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={cn("h-1.5 w-3 rounded-full", i < have ? "bg-success" : "bg-muted-foreground/25")} />
        ))}
      </span>
      <span className={cn("tabular text-[12px]", complete ? "font-medium text-success" : "text-muted-foreground")}>{complete ? "Complete" : `${have} of ${total}`}</span>
    </span>
  );
}

function NewPill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-highlight/20 bg-highlight-soft px-1.5 py-px text-[10px] font-semibold leading-4 text-highlight">
      New
    </span>
  );
}

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { isHR } = usePeopleContext();
  const { company } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: employees = [], isLoading, error, refetch } = useEmployees();
  const { data: departments = [] } = useDepartments();
  const { data: docStubs = [] } = useDocumentStubs();
  const assignCodes = useAssignMissingCodes();

  const search = params.get("q") ?? "";
  const status = params.get("status") ?? "active";
  const dept = params.get("dept") ?? ALL;
  const shift = params.get("shift") ?? ALL;
  const quick = (params.get("filter") as Quick) ?? "all";
  const view = params.get("view") === "grid" ? "grid" : "list";
  const [gridShown, setGridShown] = useState(GRID_PAGE);

  const setParam = (key: string, value: string, fallback: string) => {
    // A new filter starts the card grid from its first page again.
    setGridShown(GRID_PAGE);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!value || value === fallback) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );
  };

  const [separating, setSeparating] = useState<Employee | null>(null);
  const [rejoining, setRejoining] = useState<Employee | null>(null);
  const [moving, setMoving] = useState<{ ids: string[]; clear: () => void } | null>(null);

  const deptName = useMemo(() => {
    const m = new Map(departments.map((d) => [d.id, d.name]));
    return (id: string | null) => (id ? m.get(id) ?? "" : "");
  }, [departments]);

  const docsByEmployee = useMemo(() => {
    const m = new Map<string, Set<string>>();
    docStubs.forEach((d) => {
      const s = m.get(d.employee_id) ?? new Set<string>();
      s.add(d.document_type);
      m.set(d.employee_id, s);
    });
    return m;
  }, [docStubs]);

  const missingDocTypes = (e: Employee) => REQUIRED_DOCUMENTS.filter((r) => !docsByEmployee.get(e.id)?.has(r.type));
  const missingDocs = (e: Employee) => missingDocTypes(e).length;

  const byStatus = (e: Employee) => status === ALL || (status === "active" ? e.status === "active" : e.status !== "active");
  const byQuick = (e: Employee, q: Quick) => {
    if (q === "incomplete") return completeness(e).ratio < 1;
    if (q === "docs") return e.status === "active" && missingDocs(e) > 0;
    if (q === "new") return isNewJoiner(e);
    if (q === "no_code") return !e.employee_code;
    return true;
  };

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.status === "active");
    return {
      active: active.length,
      separated: employees.filter((e) => e.status !== "active").length,
      newJoiners: active.filter(isNewJoiner).length,
      incomplete: active.filter((e) => completeness(e).ratio < 1).length,
      docs: active.filter((e) => missingDocs(e) > 0).length,
      noCode: employees.filter((e) => !e.employee_code).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, docsByEmployee]);

  /** Everyone in the status, department and shift filters (before search and quick filter). */
  const scoped = useMemo(
    () =>
      employees.filter((e) => {
        if (!byStatus(e)) return false;
        if (dept !== ALL && (dept === "none" ? !!e.department_id : e.department_id !== dept)) return false;
        if (shift !== ALL && (e.shift_type ?? "morning") !== shift) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, status, dept, shift],
  );

  const rows = useMemo(
    () =>
      scoped.filter(
        (e) =>
          byQuick(e, quick) &&
          matchesSearch([e.name, e.father_name, e.rank, deptName(e.department_id), e.email, e.employee_code], [e.cnic, e.phone], search),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, quick, search, deptName, docsByEmployee],
  );

  const hasUnassigned = employees.some((e) => !e.department_id);

  const filtersOn = !!search || dept !== ALL || shift !== ALL || quick !== "all" || status !== "active";

  const exportRows = async (list: Employee[], kind: "xlsx" | "csv") => {
    const stamp = toDbDate();
    try {
      if (kind === "xlsx") await exportEmployeesXlsx(list, deptName, `employees-${stamp}`);
      else
        downloadCsv(list, `employees-${stamp}`, [
          { header: "Employee code", value: (e) => e.employee_code },
          { header: "Full name", value: (e) => e.name },
          { header: "CNIC", value: (e) => e.cnic },
          { header: "Position", value: (e) => e.rank },
          { header: "Department", value: (e) => deptName(e.department_id) },
          { header: "Status", value: (e) => (e.status === "active" ? "Active" : "Separated") },
          { header: "Joining date", value: (e) => e.joining_date },
          { header: "Phone", value: (e) => e.phone },
          { header: "E-mail", value: (e) => e.email },
        ]);
      toast.success(`Exported ${list.length} ${list.length === 1 ? "person" : "people"}`);
    } catch (e) {
      toast.error(errorMessage(e, "Export failed"));
    }
  };

  const actionsFor = (e: Employee) => (
    <div onClick={(ev) => ev.stopPropagation()}>
      <RowActions
        label={`Actions for ${e.name}`}
        className="h-10 w-10 sm:h-8 sm:w-8"
        actions={[
          { label: "Open profile", icon: Users, onSelect: () => navigate(`/employees/${e.id}`) },
          { label: "Edit", icon: Pencil, hidden: !isHR, onSelect: () => navigate(`/employees/${e.id}/edit`) },
          { label: "Separate", icon: UserMinus, destructive: true, separated: true, hidden: !isHR || e.status !== "active", onSelect: () => setSeparating(e) },
          { label: "Reactivate", icon: RotateCcw, separated: true, hidden: !isHR || e.status === "active", onSelect: () => setRejoining(e) },
        ]}
      />
    </div>
  );

  const docsCell = (e: Employee) => {
    const missing = missingDocTypes(e);
    return <DocsMeter have={REQUIRED_DOCUMENTS.length - missing.length} missing={missing.map((m) => documentTypeLabel(m.type))} />;
  };

  const columns: DataColumn<Employee>[] = [
    {
      id: "name",
      header: "Employee",
      hideOnCard: true,
      sortValue: (e) => e.name,
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-2">
          <EmployeeChip id={e.id} name={e.name} avatar={e.avatar_url} subtitle={e.employee_code ?? "No code yet"} />
          {isNewJoiner(e) && <NewPill />}
        </div>
      ),
    },
    {
      id: "position",
      header: "Position",
      hideOnCard: true,
      sortValue: (e) => e.rank,
      cell: (e) => (
        <div className="min-w-0 max-w-[260px]">
          <p className="truncate text-[13px] font-medium" title={e.rank}>
            {e.rank}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{deptName(e.department_id) || "No department"}</p>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      hideBelow: "lg",
      hideOnCard: true,
      cell: (e) => (
        <div className="min-w-0 max-w-[240px] text-[12px]">
          <p className="tabular truncate">{formatPhone(e.phone) || "—"}</p>
          <p className="truncate text-muted-foreground" title={e.email ?? undefined}>
            {e.email || ""}
          </p>
        </div>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      hideBelow: "md",
      hideOnCard: true,
      sortValue: (e) => e.joining_date,
      cell: (e) => (
        <div className="whitespace-nowrap text-[12px]">
          <p className="tabular">{formatDate(e.joining_date)}</p>
          <p className="text-muted-foreground">{e.status === "active" ? tenure(e.joining_date) : e.separation_date ? `Left ${formatDate(e.separation_date)}` : ""}</p>
        </div>
      ),
    },
    ...(isHR
      ? ([
          {
            id: "docs",
            header: "Documents",
            hideBelow: "lg",
            hideOnCard: true,
            sortValue: (e) => REQUIRED_DOCUMENTS.length - missingDocs(e),
            cell: docsCell,
          },
        ] as DataColumn<Employee>[])
      : []),
    ...(status !== "active"
      ? ([
          {
            id: "status",
            header: "Status",
            hideOnCard: true,
            sortValue: (e) => e.status,
            cell: (e) => <StatusBadge status={e.status} />,
          },
        ] as DataColumn<Employee>[])
      : []),
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      hideOnCard: true,
      cell: (e) => actionsFor(e),
    },
  ];

  const countIn = (q: Quick) => scoped.filter((e) => byQuick(e, q)).length;
  const quickChips: { value: Quick; label: string; count: number }[] = [
    { value: "all", label: status === "separated" ? "All separated" : status === ALL ? "Everyone" : "All active", count: scoped.length },
    ...(status !== "separated" ? [{ value: "new" as Quick, label: "New joiners", count: countIn("new") }] : []),
    { value: "incomplete", label: "Incomplete profiles", count: countIn("incomplete") },
    ...(isHR && status !== "separated" ? [{ value: "docs" as Quick, label: "Missing documents", count: countIn("docs") }] : []),
    ...(stats.noCode ? [{ value: "no_code" as Quick, label: "No code", count: countIn("no_code") }] : []),
  ];

  // Chips that would lead to an empty list stay out of the way (unless selected).
  const visibleChips = quickChips.filter((c) => c.value === "all" || c.count > 0 || c.value === quick);

  const emptyState = error ? (
    <EmptyState
      icon={UserX}
      title="Could not load employees"
      description={errorMessage(error)}
      compact
      action={
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      }
    />
  ) : employees.length === 0 ? (
    <EmptyState
      icon={Users}
      title="No employees yet"
      description="Add your first team member, or import everyone at once from Excel."
      action={
        isHR ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" asChild>
              <Link to="/employees/new">
                <UserPlus className="h-4 w-4" /> Add employee
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/employees/import">
                <Upload className="h-4 w-4" /> Import from Excel
              </Link>
            </Button>
          </div>
        ) : undefined
      }
    />
  ) : (
    <EmptyState
      icon={Users}
      title="Nobody matches these filters"
      description="Try another search or clear the filters."
      compact
      action={
        <Button size="sm" variant="outline" onClick={() => setParams(view === "grid" ? { view } : {}, { replace: true })}>
          Clear filters
        </Button>
      }
    />
  );

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title="Employees"
        icon={Users}
        eyebrow="People"
        description={`Everyone at ${company?.name ?? "your company"}: roles, contact details, documents and history.`}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!employees.length}>
                  <Download className="h-4 w-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onSelect={() => exportRows(rows, "xlsx")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel ({rows.length} shown)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportRows(rows, "csv")}>
                  <Download className="mr-2 h-4 w-4" /> CSV ({rows.length} shown)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isHR && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/employees/import">
                    <Upload className="h-4 w-4" /> Import
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/employees/new">
                    <UserPlus className="h-4 w-4" /> Add employee
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <StatGrid columns={isHR ? 4 : 3} className="mb-4">
        <StatTile
          label="Active"
          value={stats.active}
          icon={UserCheck}
          tone="primary"
          loading={isLoading}
          className={PHONE_TILE}
          href="/employees"
          hint={departments.length ? `In ${departments.length} ${departments.length === 1 ? "department" : "departments"}` : "No departments yet"}
        />
        <StatTile
          label="New joiners"
          value={stats.newJoiners}
          icon={UserPlus}
          tone={stats.newJoiners ? "success" : "default"}
          loading={isLoading}
          className={PHONE_TILE}
          href={stats.newJoiners ? "/employees?filter=new" : undefined}
          hint="Last 30 days"
        />
        {isHR && (
          <StatTile
            label="Missing documents"
            value={stats.docs}
            icon={FileWarning}
            tone={stats.docs ? "warning" : "default"}
            loading={isLoading}
            href="/documents"
            className={PHONE_TILE}
            hint={stats.docs ? `${stats.docs} of ${stats.active} active people` : "Every file complete"}
          />
        )}
        <StatTile
          label="Separated"
          value={stats.separated}
          icon={UserX}
          loading={isLoading}
          className={PHONE_TILE}
          href={stats.separated ? "/employees?status=separated" : undefined}
          hint="Kept for records"
        />
      </StatGrid>

      {isHR && stats.noCode > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Hash className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-[13px]">
              <span className="font-semibold">
                {stats.noCode} {stats.noCode === 1 ? "person has" : "people have"} no employee code.
              </span>{" "}
              <span className="text-muted-foreground">Codes appear on payslips, letters and exports.</span>
            </p>
          </div>
          <Button
            size="sm"
            variant="soft"
            disabled={assignCodes.isPending}
            onClick={async () => {
              try {
                const n = await assignCodes.mutateAsync();
                toast.success(`Assigned ${n} code${n === 1 ? "" : "s"}`);
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            Assign codes
          </Button>
        </div>
      )}

      <SectionCard flush>
        <div className="space-y-3 border-b border-border/60 p-3 sm:p-4">
          <FilterBar
            search={search}
            onSearchChange={(v) => setParam("q", v, "")}
            placeholder="Search name, code, CNIC, phone…"
            actions={
              <div className="hidden items-center rounded-xl border border-border/70 bg-muted/50 p-0.5 sm:flex" role="group" aria-label="Layout">
                {(
                  [
                    { value: "list", label: "Table", icon: List },
                    { value: "grid", label: "Cards", icon: LayoutGrid },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={view === v.value}
                    aria-label={`${v.label} view`}
                    title={`${v.label} view`}
                    onClick={() => setParam("view", v.value, "list")}
                    className={cn(
                      "flex h-8 w-9 items-center justify-center rounded-lg transition-colors",
                      view === v.value ? "bg-card text-foreground shadow-sm ring-1 ring-border/60" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <v.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            }
          >
            <Select value={status} onValueChange={(v) => setParam("status", v, "active")}>
              <SelectTrigger className="h-9 w-[calc(50%-4px)] rounded-xl text-xs sm:w-[132px]" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="separated">Separated</SelectItem>
                <SelectItem value={ALL}>All statuses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dept} onValueChange={(v) => setParam("dept", v, ALL)}>
              <SelectTrigger className="h-9 w-[calc(50%-4px)] rounded-xl text-xs sm:w-[180px]" aria-label="Department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
                {hasUnassigned || dept === "none" ? <SelectItem value="none">No department</SelectItem> : null}
              </SelectContent>
            </Select>
            <Select value={shift} onValueChange={(v) => setParam("shift", v, ALL)}>
              <SelectTrigger className="h-9 w-[calc(50%-4px)] rounded-xl text-xs sm:w-[124px]" aria-label="Shift">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All shifts</SelectItem>
                {SHIFT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label} shift
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar>
          <div className="flex items-center gap-3">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 hide-scrollbar" role="group" aria-label="Quick filters">
              {visibleChips.map((c) => {
                const on = quick === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setParam("filter", c.value, "all")}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors sm:h-7 sm:text-[11px]",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                    )}
                  >
                    {c.label}
                    <span className={cn("tabular", on ? "opacity-80" : c.count ? "text-foreground" : "text-muted-foreground")}>{c.count}</span>
                  </button>
                );
              })}
            </div>
            {!isLoading && (
              <p className="hidden shrink-0 text-[12px] text-muted-foreground md:block" aria-live="polite">
                {rows.length === scoped.length && !search ? `${rows.length} ${rows.length === 1 ? "person" : "people"}` : `${rows.length} of ${scoped.length} shown`}
                {filtersOn && (
                  <button type="button" onClick={() => setParams(view === "grid" ? { view } : {}, { replace: true })} className="ml-2 font-semibold text-primary hover:underline">
                    Reset
                  </button>
                )}
              </p>
            )}
          </div>
        </div>

        {view === "grid" ? (
          isLoading ? (
            <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[152px] rounded-2xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            emptyState
          ) : (
            <>
              <ul className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 2xl:grid-cols-4">
                {rows.slice(0, gridShown).map((e) => (
                  <li key={e.id} className="min-w-0">
                    <Link
                      to={`/employees/${e.id}`}
                      className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start gap-3">
                        <EmployeeAvatar name={e.name} src={e.avatar_url} className="h-11 w-11" fallbackClassName="text-[13px]" />
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary" title={e.name}>
                              {e.name}
                            </span>
                            {isNewJoiner(e) && <NewPill />}
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground" title={e.rank}>
                            {e.rank}
                          </p>
                        </div>
                        {e.status !== "active" && <StatusBadge status={e.status} />}
                      </div>
                      <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                        <div className="min-w-0">
                          <dt className="micro-label">Department</dt>
                          <dd className="mt-0.5 truncate font-medium">{deptName(e.department_id) || "—"}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="micro-label">{e.status === "active" ? "Tenure" : "Left"}</dt>
                          <dd className="tabular mt-0.5 truncate font-medium">{e.status === "active" ? tenure(e.joining_date) : formatDate(e.separation_date)}</dd>
                        </div>
                      </dl>
                      <div className="mt-auto pt-3.5">
                        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                          <span className="tabular truncate text-[12px] text-muted-foreground">{e.employee_code ?? "No code yet"}</span>
                          {isHR && e.status === "active" ? docsCell(e) : <span className="tabular text-[12px] text-muted-foreground">{formatPhone(e.phone)}</span>}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              {rows.length > gridShown && (
                <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Showing {gridShown} of {rows.length}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setGridShown((n) => n + GRID_PAGE)}>
                    Show {Math.min(GRID_PAGE, rows.length - gridShown)} more
                  </Button>
                </div>
              )}
            </>
          )
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(e) => e.id}
            loading={isLoading}
            initialSort={{ column: "name" }}
            pageSize={25}
            selectable={isHR}
            onRowClick={(e) => navigate(`/employees/${e.id}`)}
            mobileTitle={(e) => (
              <div className="flex items-start gap-3">
                <EmployeeAvatar name={e.name} src={e.avatar_url} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{e.name}</span>
                    {isNewJoiner(e) && <NewPill />}
                    {e.status !== "active" && <StatusBadge status={e.status} />}
                  </p>
                  <p className="break-words text-[12px] font-normal leading-4 text-muted-foreground">
                    {e.rank}
                    {deptName(e.department_id) && ` · ${deptName(e.department_id)}`}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-normal text-muted-foreground">
                    <span className="tabular">{e.employee_code ?? "No code yet"}</span>
                    <span>{e.status === "active" ? tenure(e.joining_date) : `Left ${formatDate(e.separation_date)}`}</span>
                    {isHR && e.status === "active" && docsCell(e)}
                  </p>
                </div>
                <div className="-mr-1.5 -mt-1 shrink-0">{actionsFor(e)}</div>
              </div>
            )}
            caption="Employee directory"
            bulkActions={
              isHR
                ? (selected, clear) => (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setMoving({ ids: selected.map((s) => s.id), clear })}>
                        <Building2 className="h-4 w-4" /> Move to department
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => exportRows(selected, "xlsx")}>
                        <FileSpreadsheet className="h-4 w-4" /> Export selected
                      </Button>
                    </>
                  )
                : undefined
            }
            empty={emptyState}
          />
        )}
      </SectionCard>

      {separating && <SeparateDialog employee={separating} open onOpenChange={(o) => !o && setSeparating(null)} />}
      {rejoining && <RejoinDialog employee={rejoining} open onOpenChange={(o) => !o && setRejoining(null)} />}
      {moving && <MoveDepartmentDialog ids={moving.ids} open onOpenChange={(o) => !o && setMoving(null)} onDone={() => moving.clear()} />}
    </div>
  );
}
