import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { differenceInCalendarDays, differenceInMonths } from "date-fns";
import { Building2, Loader2, Pencil, Plus, Trash2, UserCheck, Users, UsersRound, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, EmptyState, PageHeader, RowActions, SectionCard, StatGrid, StatTile, formatNumber, formatPercent, toDate, type DataColumn } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useDepartments, useEmployees } from "../api/employees";
import { useCreateDepartment, useDeleteDepartment, useRenameDepartment, validateDepartmentName } from "../api/departments";
import type { Department, Employee } from "../api/types";
import { errorMessage } from "../lib/utils";
import { EmployeeAvatar, Field, PHONE_TILE } from "../components/common";

interface Row extends Department {
  active: number;
  total: number;
  /** First few active members, for the avatar stack. */
  members: Employee[];
  /** Active people who joined in the last 90 days. */
  recent: number;
  /** Average tenure of active people, in months. */
  avgMonths: number | null;
}

const NONE = "__none__";

function NameDialog({
  open,
  onOpenChange,
  department,
  departments,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  department: Department | null;
  departments: Department[];
}) {
  const create = useCreateDepartment();
  const rename = useRenameDepartment();
  const [name, setName] = useState(department?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || rename.isPending;

  const submit = async () => {
    // Enter in the field bypasses the disabled button.
    if (pending) return;
    const problem = validateDepartmentName(name, departments, department?.id);
    if (problem) return setError(problem);
    try {
      if (department) await rename.mutateAsync({ id: department.id, name, previous: department.name });
      else await create.mutateAsync(name);
      toast.success(department ? "Department renamed" : "Department created");
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Could not save the department."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{department ? "Rename department" : "New department"}</DialogTitle>
          <DialogDescription>Names are unique within your company.</DialogDescription>
        </DialogHeader>
        <Field id="dept-name" label="Name" required error={error}>
          <Input
            id="dept-name"
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            className="h-10 rounded-xl"
            placeholder="e.g. Engineering"
          />
        </Field>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {department ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ department, departments, headcount, onOpenChange }: { department: Department; departments: Department[]; headcount: number; onOpenChange: (o: boolean) => void }) {
  const remove = useDeleteDepartment();
  const [moveTo, setMoveTo] = useState(NONE);
  const submit = async () => {
    try {
      const moved = await remove.mutateAsync({ id: department.id, moveTo: moveTo === NONE ? null : moveTo });
      toast.success(`${department.name} deleted`, { description: moved ? `${moved} ${moved === 1 ? "person" : "people"} moved.` : undefined });
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete the department."));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !remove.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {department.name}?</DialogTitle>
          <DialogDescription>
            {headcount
              ? `${headcount} ${headcount === 1 ? "person is" : "people are"} in this department (including separated). Choose where they go.`
              : "Nobody is in this department."}
          </DialogDescription>
        </DialogHeader>
        {headcount > 0 && (
          <Field id="dept-move" label="Move people to">
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger id="dept-move" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No department</SelectItem>
                {departments
                  .filter((d) => d.id !== department.id)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 26 -> "2 yrs 2 mos" */
function formatMonths(months: number): string {
  const total = Math.round(months);
  if (total < 1) return "Under a month";
  const y = Math.floor(total / 12);
  const m = total % 12;
  return [y ? `${y} yr${y === 1 ? "" : "s"}` : "", m ? `${m} mo${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

function AvatarStack({ people, extra }: { people: Pick<Employee, "id" | "name" | "avatar_url">[]; extra: number }) {
  if (people.length === 0) return <span className="text-[12px] text-muted-foreground">Nobody yet</span>;
  return (
    <span className="flex items-center" aria-label={`${people.length + extra} active people`}>
      {people.map((p, i) => (
        <span key={p.id} className={cn("rounded-full ring-2 ring-card", i > 0 && "-ml-2")} title={p.name}>
          <EmployeeAvatar name={p.name} src={p.avatar_url} className="h-7 w-7 rounded-full border-0" fallbackClassName="rounded-full text-[10px]" />
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      )}
    </span>
  );
}

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const { data: departments = [], isLoading, error, refetch } = useDepartments();
  const { data: employees = [], isLoading: loadingPeople } = useEmployees();
  const [editing, setEditing] = useState<Department | null | "new">(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const activeTotal = employees.filter((e) => e.status === "active").length;

  const rows: Row[] = useMemo(() => {
    const now = new Date();
    return departments.map((d) => {
      const people = employees.filter((e) => e.department_id === d.id);
      const active = people.filter((e) => e.status === "active");
      const months = active.map((e) => {
        const joined = toDate(e.joining_date);
        return joined ? Math.max(0, differenceInMonths(now, joined)) : 0;
      });
      return {
        ...d,
        active: active.length,
        total: people.length,
        members: active.slice(0, 4),
        recent: active.filter((e) => {
          const j = toDate(e.joining_date);
          return !!j && j <= now && differenceInCalendarDays(now, j) <= 90;
        }).length,
        avgMonths: months.length ? months.reduce((a, b) => a + b, 0) / months.length : null,
      };
    });
  }, [departments, employees]);
  const unassigned = employees.filter((e) => e.status === "active" && !e.department_id).length;
  const largest = [...rows].sort((a, b) => b.active - a.active)[0];
  const placed = rows.filter((r) => r.active > 0);
  const average = placed.length ? placed.reduce((a, r) => a + r.active, 0) / placed.length : 0;
  const loading = isLoading || loadingPeople;

  const actionsFor = (r: Row) => (
    <div onClick={(e) => e.stopPropagation()}>
      <RowActions
        label={`Actions for ${r.name}`}
        className="h-10 w-10 sm:h-8 sm:w-8"
        actions={[
          { label: "View people", icon: Users, onSelect: () => navigate(`/employees?dept=${r.id}`) },
          { label: "Rename", icon: Pencil, onSelect: () => setEditing(r) },
          { label: "Delete", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(r) },
        ]}
      />
    </div>
  );

  const nameCell = (r: Row) => (
    <Link to={`/employees?dept=${r.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2.5 rounded-lg hover:text-primary">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Building2 className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold">{r.name}</span>
        <span className="block truncate text-[11px] font-normal text-muted-foreground">
          {r.active} active {r.active === 1 ? "person" : "people"}
        </span>
      </span>
    </Link>
  );

  const share = (r: Row) => (activeTotal ? r.active / activeTotal : 0);

  const columns: DataColumn<Row>[] = [
    { id: "name", header: "Department", hideOnCard: true, sortValue: (r) => r.name, cell: nameCell },
    {
      id: "people",
      header: "People",
      hideBelow: "md",
      hideOnCard: true,
      cell: (r) => <AvatarStack people={r.members} extra={Math.max(0, r.active - r.members.length)} />,
    },
    {
      id: "active",
      header: "Headcount",
      align: "right",
      hideOnCard: true,
      sortValue: (r) => r.active,
      cell: (r) => (
        <div className="flex items-center justify-end gap-3">
          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted lg:block" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(share(r) * 100)}%` }} />
          </div>
          <span className="tabular w-7 text-right font-semibold">{r.active}</span>
          <span className="tabular w-10 text-right text-[12px] text-muted-foreground">{formatPercent(share(r), 0)}</span>
        </div>
      ),
    },
    {
      id: "tenure",
      header: "Avg. tenure",
      align: "right",
      hideBelow: "lg",
      hideOnCard: true,
      sortValue: (r) => r.avgMonths,
      cell: (r) => <span className="text-[12px]">{r.avgMonths === null ? "—" : formatMonths(r.avgMonths)}</span>,
    },
    {
      id: "recent",
      header: "New, 90 days",
      align: "right",
      hideBelow: "lg",
      hideOnCard: true,
      sortValue: (r) => r.recent,
      cell: (r) => <span className={cn("tabular text-[12px]", r.recent ? "font-semibold text-success" : "text-muted-foreground")}>{r.recent ? `+${r.recent}` : "—"}</span>,
    },
    {
      id: "separated",
      header: "Separated",
      align: "right",
      hideBelow: "md",
      hideOnCard: true,
      sortValue: (r) => r.total - r.active,
      cell: (r) => <span className="tabular text-[12px] text-muted-foreground">{r.total - r.active || "—"}</span>,
    },
    { id: "actions", header: <span className="sr-only">Actions</span>, align: "right", hideOnCard: true, cell: actionsFor },
  ];

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title="Departments"
        icon={Building2}
        eyebrow="People"
        description="How the team is organised. Departments drive filters, reports and payroll groups."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New department
          </Button>
        }
      />
      <StatGrid columns={4} className="mb-4">
        <StatTile
          label="Departments"
          value={departments.length}
          icon={Building2}
          tone="primary"
          loading={loading}
          className={PHONE_TILE}
          hint={`${activeTotal} active ${activeTotal === 1 ? "person" : "people"} in total`}
        />
        <StatTile
          label="Largest"
          value={largest?.active ? largest.name : "—"}
          hint={largest?.active ? `${largest.active} active ${largest.active === 1 ? "person" : "people"}` : "Nobody assigned yet"}
          icon={Users}
          loading={loading}
          href={largest?.active ? `/employees?dept=${largest.id}` : undefined}
          className={PHONE_TILE}
        />
        <StatTile
          label="Average size"
          value={placed.length ? formatNumber(average, 1) : "—"}
          hint="Active people per department"
          icon={UsersRound}
          loading={loading}
          className={PHONE_TILE}
        />
        <StatTile
          label="Unassigned"
          value={unassigned}
          tone={unassigned ? "warning" : "success"}
          href={unassigned ? "/employees?dept=none" : undefined}
          hint={unassigned ? "Active, no department" : "Everyone is placed"}
          icon={unassigned ? UserX : UserCheck}
          loading={loading}
          className={PHONE_TILE}
        />
      </StatGrid>
      <SectionCard flush>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          loading={loading}
          initialSort={{ column: "active", direction: "desc" }}
          pageSize={0}
          onRowClick={(r) => navigate(`/employees?dept=${r.id}`)}
          mobileTitle={(r) => (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {nameCell(r)}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-[46px] text-[11px] font-normal text-muted-foreground">
                  <AvatarStack people={r.members} extra={Math.max(0, r.active - r.members.length)} />
                  <span>{formatPercent(share(r), 0)} of the company</span>
                  {r.avgMonths !== null && <span>avg. {formatMonths(r.avgMonths)}</span>}
                </div>
              </div>
              <div className="-mr-1.5 shrink-0">{actionsFor(r)}</div>
            </div>
          )}
          caption="Departments"
          empty={
            error ? (
              <EmptyState
                icon={Building2}
                title="Could not load departments"
                description={errorMessage(error)}
                compact
                action={
                  <Button size="sm" variant="outline" onClick={() => refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Building2}
                title="No departments yet"
                description="Create departments like Engineering, Sales or Operations to group your team."
                action={
                  <Button size="sm" onClick={() => setEditing("new")}>
                    <Plus className="h-4 w-4" /> New department
                  </Button>
                }
              />
            )
          }
        />
      </SectionCard>
      {editing && <NameDialog open department={editing === "new" ? null : editing} departments={departments} onOpenChange={(o) => !o && setEditing(null)} />}
      {deleting && <DeleteDialog department={deleting} departments={departments} headcount={deleting.total} onOpenChange={(o) => !o && setDeleting(null)} />}
    </div>
  );
}
