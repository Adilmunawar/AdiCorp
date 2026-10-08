import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Activity, ArrowRight, Briefcase, CalendarDays, FileText, Laptop, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, SectionCard, formatDate, formatDateTime, formatMonth, formatRelative, humanize, toDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useEmployeeActivity, usePeopleContext, useStaffNames } from "../../api/employees";
import type { ActivityEntry } from "../../api/types";
import { GENDER_OPTIONS, SHIFT_OPTIONS, fieldLabel } from "../../lib/constants";
import { formatPhone } from "../../lib/utils";

interface Change {
  field: string;
  from: unknown;
  to: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const PAGE = 100;

/** Readable form of a recorded value: labels instead of raw codes, dates as dates. */
function show(field: string, v: unknown): string {
  if (field === "weekend_saturday") return v === true ? "Saturday off" : v === false ? "Saturday working" : "Company rule";
  if (v === null || v === undefined || v === "") return "Not set";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v);
  if (field === "gender") return GENDER_OPTIONS.find((g) => g.value === s)?.label ?? humanize(s);
  if (field === "shift_type") return SHIFT_OPTIONS.find((o) => o.value === s)?.label ?? humanize(s);
  if (field === "status") return humanize(s);
  if (field === "phone" || field === "emergency_contact") return formatPhone(s);
  if (ISO_DATE.test(s)) return formatDate(s);
  return s;
}

type Category = "employment" | "time" | "papers" | "assets" | "money" | "other";

const CATEGORY: Record<Category, { label: string; icon: LucideIcon; dot: string }> = {
  employment: { label: "Employment", icon: Briefcase, dot: "bg-primary/10 text-primary ring-primary/15" },
  time: { label: "Time and leave", icon: CalendarDays, dot: "bg-info-soft text-info ring-info/15" },
  papers: { label: "Letters and policies", icon: FileText, dot: "bg-highlight-soft text-highlight ring-highlight/15" },
  assets: { label: "Equipment", icon: Laptop, dot: "bg-muted text-muted-foreground ring-border" },
  money: { label: "Pay and expenses", icon: Wallet, dot: "bg-success-soft text-success ring-success/15" },
  other: { label: "Other", icon: Activity, dot: "bg-muted text-muted-foreground ring-border" },
};

function categoryOf(action: string): Category {
  if (/^(payroll|expense)\./.test(action)) return "money";
  if (/^(leave|overtime|correction|attendance|biometric)\./.test(action)) return "time";
  if (/^(letter|policy|document)\./.test(action)) return "papers";
  if (/^asset\./.test(action)) return "assets";
  if (/^(employee|onboarding|offboarding|careers|checklist)\./.test(action)) return "employment";
  return "other";
}

/** Profile edits are logged with raw column names ("Updated Ali: rank"); name the fields instead. */
function describe(a: ActivityEntry, changes: Change[]): string {
  if (a.action_type === "employee.updated" && changes.length > 0) {
    const fields = changes.map((c) => fieldLabel(c.field));
    const list = fields.length > 3 ? `${fields.slice(0, 3).join(", ")} and ${fields.length - 3} more` : fields.join(", ");
    return `Profile updated: ${list}`;
  }
  return a.description;
}

/** Recent entries read as "2 days ago"; older ones show the date (exact time on hover). */
function when(value: string): string {
  const d = toDate(value);
  if (!d) return "";
  return differenceInCalendarDays(new Date(), d) < 7 ? formatRelative(d) : formatDate(d, "d MMM yyyy, HH:mm");
}

/** Everything recorded about this person (pay entries are hidden from HR by RLS). */
export function TimelineTab({ employeeId }: { employeeId: string }) {
  const { isFinance } = usePeopleContext();
  const [limit, setLimit] = useState(PAGE);
  const { data = [], isLoading, isFetching, isError, refetch } = useEmployeeActivity(employeeId, limit);
  const staff = useStaffNames();
  const [filter, setFilter] = useState<Category | "all">("all");

  const counts = useMemo(() => {
    const c = new Map<Category, number>();
    data.forEach((a) => c.set(categoryOf(a.action_type), (c.get(categoryOf(a.action_type)) ?? 0) + 1));
    return c;
  }, [data]);

  const groups = useMemo(() => {
    const out: { month: string; items: ActivityEntry[] }[] = [];
    data
      .filter((a) => filter === "all" || categoryOf(a.action_type) === filter)
      .forEach((a) => {
        const month = formatMonth(a.created_at);
        const last = out[out.length - 1];
        if (last && last.month === month) last.items.push(a);
        else out.push({ month, items: [a] });
      });
    return out;
  }, [data, filter]);

  const chips = (Object.keys(CATEGORY) as Category[]).filter((c) => counts.get(c));
  const label = (c: Category) => (c === "money" && !isFinance ? "Expenses" : CATEGORY[c].label);

  return (
    <SectionCard
      title="Timeline"
      description={data.length ? `${data.length}${data.length === limit ? "+" : ""} recorded events, newest first` : "Every change made to this record, newest first"}
      icon={Activity}
    >
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : isError ? (
        <EmptyState
          icon={Activity}
          title="Could not load the timeline"
          description="Check the connection and try again."
          compact
          action={
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      ) : data.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing recorded yet" description="Changes to the profile, leave, letters and equipment show up here." compact />
      ) : (
        <>
          {chips.length > 1 && (
            <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-0.5 hide-scrollbar" role="group" aria-label="Filter the timeline">
              {(["all", ...chips] as const).map((c) => {
                const on = filter === c;
                const n = c === "all" ? data.length : counts.get(c) ?? 0;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(c)}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors sm:h-7 sm:text-[11px]",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                    )}
                  >
                    {c === "all" ? "All" : label(c)}
                    <span className={cn("tabular", on ? "opacity-80" : "text-foreground")}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.month}>
                <h3 className="micro-label mb-2.5">{g.month}</h3>
                <ol className="relative space-y-3.5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
                  {g.items.map((a) => {
                    const cat = CATEGORY[categoryOf(a.action_type)];
                    const Icon = cat.icon;
                    const details = a.details as { changes?: unknown } | null;
                    const changes = Array.isArray(details?.changes) ? (details!.changes as Change[]) : [];
                    const by = a.user_id ? staff.get(a.user_id) ?? "Staff" : "Employee, in the portal";
                    return (
                      <li key={a.id} className="relative flex gap-3">
                        <span className={cn("relative z-[1] mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", cat.dot)} aria-hidden>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="break-words text-[13px] font-medium leading-5 text-foreground">{describe(a, changes)}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>
                              {when(a.created_at)}
                            </time>
                            {" · "}
                            {by}
                          </p>
                          {changes.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 rounded-xl bg-muted/50 p-2.5 text-[11px]">
                              {changes.slice(0, 12).map((c) => (
                                <li key={c.field} className="flex flex-wrap items-center gap-1">
                                  <span className="font-semibold">{fieldLabel(c.field)}:</span>
                                  {c.field === "bank_account_number" || c.field === "department_id" ? (
                                    <span className="text-muted-foreground">changed</span>
                                  ) : (
                                    <>
                                      <span className="break-all text-muted-foreground line-through">{show(c.field, c.from)}</span>
                                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="to" />
                                      <span className="break-all">{show(c.field, c.to)}</span>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {groups.length === 0 && <EmptyState icon={Activity} title="Nothing in this category" compact />}
          </div>

          {data.length === limit && (
            <div className="mt-5 flex justify-center">
              <Button size="sm" variant="outline" disabled={isFetching} onClick={() => setLimit((l) => l + PAGE)}>
                {isFetching ? "Loading…" : "Show older events"}
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
