import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  FilePlus2,
  Hash,
  Laptop,
  Mail,
  Pencil,
  Phone,
  RotateCcw,
  Upload,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RowActions, Skeleton, StatusBadge, formatDate, formatRelative, type RowAction } from "@/components/kit";
import { cn } from "@/lib/utils";
import { adminRoutes } from "@/modules/registry";
import { useEmployeeDocuments } from "../../api/documents";
import { useEmployeeAssets } from "../../api/assets";
import { usePortalAccess } from "../../api/employees";
import type { Employee } from "../../api/types";
import { COMPLETENESS_FIELDS, REQUIRED_DOCUMENTS, SHIFT_OPTIONS } from "../../lib/constants";
import { completeness, formatPhone, isNewJoiner, phoneHref, tenure } from "../../lib/utils";
import { EmployeeAvatar, ProgressBar } from "../common";

const hasRoute = (path: string) => adminRoutes.some((r) => r.path === path);

interface FactProps {
  label: string;
  className?: string;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
  tone?: "default" | "success" | "warning";
  onClick?: () => void;
  children?: ReactNode;
}

/** One key fact in the strip under the header; a button when it leads to a tab. */
function Fact({ label, value, hint, loading, tone = "default", onClick, children, className }: FactProps) {
  const body = (
    <>
      <span className="micro-label block truncate">{label}</span>
      {loading ? (
        <Skeleton className="mt-1.5 h-5 w-16" />
      ) : (
        <span
          className={cn(
            "tabular mt-1 block truncate font-display text-[15px] font-semibold leading-5 tracking-tight",
            tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground",
          )}
        >
          {value}
        </span>
      )}
      {children}
      {hint && !loading && (
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={typeof hint === "string" ? hint : undefined}>
          {hint}
        </span>
      )}
    </>
  );
  const cls = cn("min-w-0 rounded-xl px-3 py-2.5 text-left", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export interface ProfileHeaderProps {
  employee: Employee;
  departmentName: string;
  isHR: boolean;
  /** Switch tab; "documents-upload" and "assets-handover" also open that tab's dialog. */
  onTab: (tab: string) => void;
  onSeparate: () => void;
  onRejoin: () => void;
}

/** Identity, quick actions and the key facts of one employee. */
export function ProfileHeader({ employee, departmentName, isHR, onTab, onSeparate, onRejoin }: ProfileHeaderProps) {
  const navigate = useNavigate();
  const active = employee.status === "active";
  const docs = useEmployeeDocuments(isHR ? employee.id : undefined);
  const assets = useEmployeeAssets(employee.id);
  const access = usePortalAccess(employee.id);

  const comp = completeness(employee);
  const filled = COMPLETENESS_FIELDS.length - comp.missing.length;
  const onFile = new Set((docs.data ?? []).map((d) => d.document_type));
  const requiredOnFile = REQUIRED_DOCUMENTS.filter((r) => onFile.has(r.type)).length;
  const equipment = assets.data?.current ?? [];
  const shift = SHIFT_OPTIONS.find((s) => s.value === employee.shift_type)?.label ?? "Morning";
  const tel = phoneHref(employee.phone);
  const newJoiner = isNewJoiner(employee);

  const moreActions: RowAction[] = [
    { label: "Issue a letter", icon: FilePlus2, hidden: !hasRoute("/letters/new"), onSelect: () => navigate(`/letters/new?employee=${employee.id}`) },
    { label: "Upload a document", icon: Upload, onSelect: () => onTab("documents-upload") },
    { label: "Hand over equipment", icon: Laptop, hidden: !active, onSelect: () => onTab("assets-handover") },
    { label: "Separate", icon: UserMinus, destructive: true, separated: true, hidden: !active, onSelect: onSeparate },
  ];

  const portal = access.data;
  const portalValue = !portal
    ? "—"
    : portal.can_sign_in
      ? portal.must_change_password
        ? "Temporary password"
        : "Can sign in"
      : portal.has_password
        ? "Sign-in off"
        : "No password";

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          <div className="relative shrink-0">
            <EmployeeAvatar
              name={employee.name}
              src={employee.avatar_url}
              className="h-14 w-14 rounded-2xl sm:h-[72px] sm:w-[72px]"
              fallbackClassName="rounded-2xl text-base sm:text-lg"
            />
            <span
              className={cn("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-card", active ? "bg-success" : "bg-muted-foreground/60")}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="min-w-0 break-words font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{employee.name}</h1>
              <StatusBadge status={employee.status} />
              {newJoiner && (
                <span className="inline-flex items-center rounded-full border border-highlight/20 bg-highlight-soft px-2 py-0.5 text-[11px] font-medium leading-4 text-highlight">
                  New joiner
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground sm:text-sm">
              <span className="font-medium text-foreground">{employee.rank}</span>
              {departmentName && (
                <>
                  {" · "}
                  {employee.department_id ? (
                    <Link to={`/employees?dept=${employee.department_id}`} className="hover:text-primary hover:underline">
                      {departmentName}
                    </Link>
                  ) : (
                    departmentName
                  )}
                </>
              )}
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
              {employee.employee_code && (
                <li className="inline-flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" aria-hidden />
                  <span className="tabular font-medium text-foreground">{employee.employee_code}</span>
                </li>
              )}
              <li className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {employee.separation_date ? `Left ${formatDate(employee.separation_date)}` : `Joined ${formatDate(employee.joining_date)}`}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {shift} shift · {employee.working_hours_per_day ?? 8} h a day
              </li>
              {employee.email && (
                <li className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <a href={`mailto:${employee.email}`} className="truncate hover:text-primary hover:underline" title={employee.email}>
                    {employee.email}
                  </a>
                </li>
              )}
              {employee.phone && (
                <li className="hidden items-center gap-1.5 sm:inline-flex">
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {tel ? (
                    <a href={tel} className="tabular hover:text-primary hover:underline">
                      {formatPhone(employee.phone)}
                    </a>
                  ) : (
                    <span className="tabular">{formatPhone(employee.phone)}</span>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:shrink-0">
          {tel && (
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl sm:h-9 sm:w-9" asChild>
              <a href={tel} aria-label={`Call ${employee.name}`} title={`Call ${formatPhone(employee.phone)}`}>
                <Phone className="h-4 w-4" />
              </a>
            </Button>
          )}
          {employee.email && (
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl sm:h-9 sm:w-9" asChild>
              <a href={`mailto:${employee.email}`} aria-label={`E-mail ${employee.name}`} title={`E-mail ${employee.email}`}>
                <Mail className="h-4 w-4" />
              </a>
            </Button>
          )}
          {isHR && (
            <>
              {active ? (
                <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 sm:flex-none" asChild>
                  <Link to={`/employees/${employee.id}/edit`}>
                    <Pencil className="h-4 w-4" /> Edit profile
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 sm:flex-none" asChild>
                    <Link to={`/employees/${employee.id}/edit`}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Link>
                  </Button>
                  <Button size="sm" className="h-10 flex-1 sm:h-9 sm:flex-none" onClick={onRejoin}>
                    <RotateCcw className="h-4 w-4" /> Reactivate
                  </Button>
                </>
              )}
              <RowActions
                label="More actions"
                actions={moreActions}
                className="h-10 w-10 shrink-0 rounded-xl border border-input/80 bg-background text-foreground sm:h-9 sm:w-9"
              />
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-1 border-t border-border/60 p-1.5 sm:p-2",
          isHR ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4",
        )}
      >
        <Fact
          label={active ? "Tenure" : "Served"}
          value={tenure(employee.joining_date, employee.separation_date)}
          hint={`Since ${formatDate(employee.joining_date)}`}
        />
        <Fact
          label="Profile"
          value={`${Math.round(comp.ratio * 100)}%`}
          tone={comp.ratio >= 1 ? "success" : "default"}
          hint={comp.missing.length ? `${comp.missing.length} of ${COMPLETENESS_FIELDS.length} details missing` : `All ${filled} key details on file`}
          onClick={() => onTab("overview")}
        >
          <ProgressBar value={comp.ratio} tone={comp.ratio >= 1 ? "success" : comp.ratio >= 0.5 ? "primary" : "warning"} className="mt-1.5 h-1" />
        </Fact>
        {isHR ? (
          <>
            <Fact
              label="Documents"
              loading={docs.isLoading}
              value={`${requiredOnFile} of ${REQUIRED_DOCUMENTS.length}`}
              tone={requiredOnFile === REQUIRED_DOCUMENTS.length ? "success" : active ? "warning" : "default"}
              hint={
                requiredOnFile === REQUIRED_DOCUMENTS.length
                  ? "Required files on record"
                  : active
                    ? `${REQUIRED_DOCUMENTS.length - requiredOnFile} required ${REQUIRED_DOCUMENTS.length - requiredOnFile === 1 ? "file" : "files"} missing`
                    : "No longer required"
              }
              onClick={() => onTab("documents")}
            />
            <Fact
              label="Equipment"
              loading={assets.isLoading}
              value={equipment.length ? `${equipment.length} ${equipment.length === 1 ? "item" : "items"}` : "None"}
              hint={equipment.length ? equipment.map((a) => a.name).join(", ") : active ? "Nothing handed over" : "Everything returned"}
              onClick={() => onTab("assets")}
            />
            <Fact
              label="Portal"
              className="hidden sm:block"
              loading={access.isLoading}
              value={portalValue}
              tone={portal?.can_sign_in && !portal.must_change_password ? "success" : "default"}
              hint={portal ? (portal.last_seen_at ? `Last seen ${formatRelative(portal.last_seen_at)}` : "No sign-in recorded yet") : undefined}
            />
          </>
        ) : (
          <>
            <Fact label="Shift" value={shift} hint={`${employee.working_hours_per_day ?? 8} hours a day`} />
            <Fact label="Employee code" value={employee.employee_code ?? "—"} hint={departmentName || "No department"} />
          </>
        )}
      </div>
    </section>
  );
}

/** Skeleton in the shape of the profile header, tabs and overview. */
export function ProfileSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-3 h-6 w-28 rounded-lg" />
      <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl sm:h-[72px] sm:w-[72px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border/60 pt-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="mb-4 h-10 w-full rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
