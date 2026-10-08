import { useMemo, useState } from "react";
import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays } from "lucide-react";
import { EmptyState, SectionCard, Skeleton, StatusBadge, toDate, toDbDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useCompanyToday, useLeaveRequests, useWorkingDates } from "../api";
import { dayWord, leaveWhen } from "../lib";
import type { LeaveRequestRow } from "../types";
import { MonthNav, PersonCell } from "./shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

/** Who is away when: approved leave solid, pending leave dashed. Grid on laptops, agenda on phones. */
export function LeaveCalendar() {
  const today = useCompanyToday();
  const [month, setMonth] = useState(() => startOfMonth(toDate(today) ?? new Date()));
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const query = useLeaveRequests({ from: toDbDate(first), to: toDbDate(last) });

  const requests = useMemo(
    () => (query.data ?? []).filter((r) => r.status === "approved" || r.status === "pending").sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [query.data],
  );

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }),
    [month],
  );
  // The company's own weekends and holidays (a six-day week keeps Saturday white), for the whole grid.
  const working = useWorkingDates(days.length ? toDbDate(days[0]) : "", days.length ? toDbDate(days[days.length - 1]) : "");

  const byDay = useMemo(() => {
    const map = new Map<string, LeaveRequestRow[]>();
    for (const r of requests) {
      let d = new Date(`${r.start_date}T00:00:00`);
      const end = new Date(`${r.end_date}T00:00:00`);
      let guard = 0;
      while (d <= end && guard++ < 400) {
        const key = toDbDate(d);
        const list = map.get(key);
        if (list) list.push(r);
        else map.set(key, [r]);
        d = addDays(d, 1);
      }
    }
    return map;
  }, [requests]);

  // While another month loads, the previous month's rows are kept on screen; dim them instead of mislabelling them.
  const switching = query.isPlaceholderData;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const pendingCount = requests.length - approvedCount;

  return (
    <SectionCard
      title="Leave calendar"
      description={
        query.isLoading || switching
          ? `Loading ${format(month, "MMMM")}…`
          : requests.length === 0
            ? `Nobody away in ${format(month, "MMMM")}`
            : `${approvedCount} approved · ${pendingCount} pending in ${format(month, "MMMM")}`
      }
      icon={CalendarDays}
      actions={<MonthNav month={month} onChange={setMonth} today={today} />}
      flush
    >
      {query.isLoading ? (
        <div className="p-4">
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </div>
      ) : (
        <div className={cn("transition-opacity", switching && "pointer-events-none opacity-50")} aria-busy={switching || undefined}>
          {/* Laptop and tablet: month grid, shown even for a quiet month so the dates stay in view */}
          <div className="hidden md:block">
            <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20">
              {WEEKDAYS.map((d) => (
                <div key={d} className="micro-label px-2 py-2 text-center text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = toDbDate(d);
                const list = byDay.get(key) ?? [];
                const inMonth = isSameMonth(d, month);
                const offDay = !!working.data && !working.data.has(key);
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[104px] border-b border-r border-border/50 p-1.5 short:min-h-[88px]",
                      !inMonth && "bg-muted/30 opacity-50",
                      inMonth && offDay && "bg-muted/15",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular",
                          key === today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                        )}
                      >
                        {format(d, "d")}
                      </span>
                      {list.length > 0 && <span className="text-[10px] font-semibold text-muted-foreground tabular">{list.length} away</span>}
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, MAX_CHIPS).map((r) => (
                        <div
                          key={r.id}
                          title={`${r.employee_name} · ${r.type_name} · ${leaveWhen(r.start_date, r.end_date)} (${r.status})`}
                          className={cn(
                            "truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                            r.status === "approved"
                              ? r.is_paid
                                ? "bg-primary/10 text-primary"
                                : "bg-warning/15 text-warning"
                              : "border border-dashed border-muted-foreground/40 text-muted-foreground",
                          )}
                        >
                          {r.employee_name.split(" ")[0]} · {r.type_name}
                        </div>
                      ))}
                      {list.length > MAX_CHIPS && <p className="px-1 text-[10px] font-semibold text-muted-foreground">+{list.length - MAX_CHIPS} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[11px] text-muted-foreground">
              {requests.length === 0 && !switching && <span className="mr-auto font-medium text-foreground">Nobody is away this month.</span>}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary/30" /> Paid, approved
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-warning/40" /> Unpaid, approved
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-muted-foreground/60" /> Pending
              </span>
            </div>
          </div>

          {/* Phones: agenda */}
          {requests.length === 0 && !switching && (
            <EmptyState
              compact
              icon={CalendarDays}
              title="Nobody is away this month"
              description="Approved and pending leave shows up here as soon as it is filed."
              className="md:hidden"
            />
          )}
          <ul className="divide-y divide-border/60 md:hidden">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <PersonCell name={r.employee_name} avatarUrl={r.avatar_url} sub={`${r.type_name} · ${leaveWhen(r.start_date, r.end_date)}`} employeeId={r.employee_id} />
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={r.status} />
                  <span className="text-[11px] text-muted-foreground tabular">{dayWord(r.days_count)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
