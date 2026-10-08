import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck2, Loader2, Lock, Save, Undo2, Users } from "lucide-react";
import { parseISO, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { EmptyState, TableSkeleton } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useMarkAttendance } from "../api";
import { STATUS_META, nextMark } from "../lib";
import type { AttendanceChange, AttendanceStatus, MarkableStatus, MonthRegister, RegisterDay, RegisterEmployee } from "../types";

const WEEKDAY = ["", "M", "T", "W", "T", "F", "S", "S"];
const KEY_TO_STATUS: Record<string, MarkableStatus | null> = { p: "present", h: "half_day", s: "short_leave", a: "absent" };

interface CellInfo {
  status: AttendanceStatus | null;
  editable: boolean;
  reason: string | null;
  off: boolean;
  outside: boolean;
  note: string | null;
  pending: boolean;
}

type Pending = Map<string, MarkableStatus | null>;
const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

function buildCell(emp: RegisterEmployee, day: RegisterDay, data: MonthRegister, working: Set<string>, leave: Set<string>, pending: Pending): CellInfo {
  const date = day.date;
  const outside = (!!emp.joining_date && date < emp.joining_date) || (!!emp.separation_date && date > emp.separation_date);
  const cell = emp.cells[date];
  const onLeave = leave.has(date) || (cell?.s === "leave" && cell.src === "leave");
  const future = date > data.today;
  const isWorking = working.has(date);
  const locked = emp.payslip_locked || (!!data.locked_through && date <= data.locked_through);
  const active = emp.status === "active" || emp.status === "on_leave";
  const key = cellKey(emp.id, date);
  const hasPending = pending.has(key);
  const status: AttendanceStatus | null = hasPending ? (pending.get(key) ?? null) : onLeave ? "leave" : (cell?.s ?? null);

  let reason: string | null = null;
  if (outside) reason = "Outside employment";
  else if (onLeave) reason = "On approved leave";
  else if (future) reason = "Future day";
  else if (!isWorking) reason = day.events.find((e) => e.affects && (e.type === "holiday" || e.type === "off_day"))?.title ?? "Day off";
  else if (locked) reason = emp.payslip_locked ? "Payslip final for this month" : "Month locked";
  else if (!active) reason = "Not active";
  else if (!data.can_edit) reason = "View only";

  return {
    status,
    editable: reason === null,
    reason,
    off: !isWorking && !outside,
    outside,
    note: cell?.n ?? null,
    pending: hasPending,
  };
}

/* ------------------------------------------------------------------ */

const GridCell = memo(function GridCell({
  info,
  row,
  col,
  isToday,
  onCycle,
  onSet,
  onMove,
}: {
  info: CellInfo;
  row: number;
  col: number;
  isToday: boolean;
  onCycle: (row: number, col: number) => void;
  onSet: (row: number, col: number, status: MarkableStatus | null) => void;
  onMove: (row: number, col: number, dr: number, dc: number) => void;
}) {
  const meta = info.status ? STATUS_META[info.status] : null;
  const label = info.outside ? "·" : meta ? meta.code : "";
  const title = [meta?.label ?? (info.outside ? "Outside employment" : info.off ? "Day off" : "Not marked"), info.note, !info.editable && info.reason !== meta?.label ? info.reason : null]
    .filter(Boolean)
    .join(" — ");

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key.toLowerCase();
    const moves: Record<string, [number, number]> = { arrowright: [0, 1], arrowleft: [0, -1], arrowdown: [1, 0], arrowup: [-1, 0] };
    if (moves[k]) {
      e.preventDefault();
      onMove(row, col, moves[k][0], moves[k][1]);
      return;
    }
    if (!info.editable) return;
    if (k in KEY_TO_STATUS) {
      e.preventDefault();
      onSet(row, col, KEY_TO_STATUS[k]);
    } else if (k === "backspace" || k === "delete") {
      e.preventDefault();
      onSet(row, col, null);
    }
  };

  return (
    <td className={cn("p-0.5 text-center", isToday && "bg-primary/[0.04]")}>
      <button
        type="button"
        data-r={row}
        data-c={col}
        aria-disabled={!info.editable}
        tabIndex={info.editable ? 0 : -1}
        aria-label={title}
        title={title}
        onClick={() => info.editable && onCycle(row, col)}
        onKeyDown={onKeyDown}
        className={cn(
          "relative mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          meta ? meta.cell : info.off || info.outside ? "border-transparent bg-muted/70 text-muted-foreground/60" : "border-dashed border-border bg-background text-muted-foreground",
          info.editable ? "cursor-pointer hover:border-primary/50" : "cursor-default",
          !info.editable && meta && "opacity-80",
          info.pending && "ring-2 ring-primary/60 ring-offset-1 ring-offset-card",
        )}
      >
        {label}
        {info.note && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-foreground/50" aria-hidden />}
      </button>
    </td>
  );
});

/* ------------------------------------------------------------------ */

export interface RegisterGridProps {
  data: MonthRegister | undefined;
  loading: boolean;
  search: string;
  /** Called with the number of unsaved changes (for the page to warn before switching months). */
  onDirtyChange?: (count: number) => void;
}

export function RegisterGrid({ data, loading, search, onDirtyChange }: RegisterGridProps) {
  const [pending, setPending] = useState<Pending>(() => new Map());
  const save = useMarkAttendance();
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset local edits when the month changes.
  const month = data?.month;
  useEffect(() => setPending(new Map()), [month]);
  useEffect(() => onDirtyChange?.(pending.size), [pending.size, onDirtyChange]);

  // Open the current month on today's column (a few days of context to its left), so phones
  // and narrow laptops do not start on the 1st and hide what matters now.
  const hasRows = (data?.employees.length ?? 0) > 0;
  useEffect(() => {
    const box = scrollRef.current;
    const table = tableRef.current;
    if (!box || !table || !data) return;
    const th = table.querySelector<HTMLElement>(`th[data-date="${data.today}"]`);
    const sticky = table.querySelector<HTMLElement>("thead th")?.offsetWidth ?? 0;
    box.scrollLeft = th ? Math.max(0, th.offsetLeft - sticky - th.offsetWidth * 3) : 0;
  }, [month, hasRows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pending.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending.size]);

  const employees = useMemo(() => {
    const list = data?.employees ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    const words = q.split(/\s+/);
    return list.filter((e) => {
      const hay = `${e.name} ${e.code ?? ""} ${e.department ?? ""} ${e.rank ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [data?.employees, search]);

  const sets = useMemo(
    () => new Map(employees.map((e) => [e.id, { working: new Set(e.working), leave: new Set(e.leave) }])),
    [employees],
  );

  const grid = useMemo(() => {
    if (!data) return [] as CellInfo[][];
    return employees.map((emp) => {
      const s = sets.get(emp.id)!;
      return data.days.map((day) => buildCell(emp, day, data, s.working, s.leave, pending));
    });
  }, [data, employees, sets, pending]);

  const setCell = useCallback(
    (row: number, col: number, status: MarkableStatus | null) => {
      if (!data) return;
      const emp = employees[row];
      const day = data.days[col];
      if (!emp || !day) return;
      const key = cellKey(emp.id, day.date);
      const original = emp.cells[day.date]?.s ?? null;
      setPending((prev) => {
        const next = new Map(prev);
        const normalisedOriginal = original === "late" ? "present" : original;
        if (status === normalisedOriginal) next.delete(key);
        else next.set(key, status);
        return next;
      });
    },
    [data, employees],
  );

  const cycle = useCallback(
    (row: number, col: number) => {
      const info = grid[row]?.[col];
      if (!info?.editable) return;
      setCell(row, col, nextMark(info.status));
    },
    [grid, setCell],
  );

  const move = useCallback((row: number, col: number, dr: number, dc: number) => {
    const table = tableRef.current;
    if (!table) return;
    let r = row + dr;
    let c = col + dc;
    for (let guard = 0; guard < 400; guard++) {
      const el = table.querySelector<HTMLButtonElement>(`button[data-r="${r}"][data-c="${c}"]`);
      if (!el) return;
      if (el.getAttribute("aria-disabled") !== "true") {
        el.focus();
        return;
      }
      r += dr;
      c += dc;
    }
  }, []);

  const totals = useMemo(() => {
    if (!data) return [] as { p: number; h: number; s: number; l: number; a: number; left: number }[];
    return grid.map((cells) => {
      const t = { p: 0, h: 0, s: 0, l: 0, a: 0, left: 0 };
      cells.forEach((c, i) => {
        if (c.status === "present" || c.status === "late") t.p++;
        else if (c.status === "half_day") t.h++;
        else if (c.status === "short_leave") t.s++;
        else if (c.status === "leave") t.l++;
        else if (c.status === "absent") t.a++;
        else if (c.editable && data.days[i].date <= data.today) t.left++;
      });
      return t;
    });
  }, [grid, data]);

  const dayTotals = useMemo(() => {
    if (!data) return [] as number[];
    return data.days.map((_, col) => grid.reduce((n, row) => n + (row[col]?.status === "present" || row[col]?.status === "late" ? 1 : 0), 0));
  }, [grid, data]);

  const onSave = async () => {
    const changes: AttendanceChange[] = Array.from(pending.entries()).map(([key, status]) => {
      const [employee_id, date] = key.split("|");
      return { employee_id, date, status };
    });
    try {
      for (let i = 0; i < changes.length; i += 3000) {
        await save.mutateAsync(changes.slice(i, i + 3000));
      }
      setPending(new Map());
    } catch {
      // The mutation shows the error; keep the edits so nothing clicked is lost.
    }
  };

  if (loading && !data) return <TableSkeleton rows={8} columns={10} />;
  if (!data) return null;
  if (data.employees.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No one to mark this month"
        description="People appear here once they have joined. Add employees from the People section, then mark attendance here."
        action={
          <Button asChild size="sm" variant="outline" className="rounded-xl">
            <Link to="/employees">Go to employees</Link>
          </Button>
        }
      />
    );
  }
  if (employees.length === 0) {
    return <EmptyState compact icon={Users} title="No matches" description="No one matches this search." />;
  }

  return (
    <div className="relative">
      <div ref={scrollRef} className="max-h-[calc(100dvh-19rem)] min-h-[16rem] overflow-auto overscroll-x-contain rounded-xl border border-border short:max-h-[calc(100dvh-16rem)]">
        <table ref={tableRef} className="w-max min-w-full border-separate border-spacing-0 text-xs" aria-label="Attendance register">
          <thead className="sticky top-0 z-20">
            <tr>
              <th scope="col" className="sticky left-0 z-30 w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem] border-b border-r border-border bg-muted px-2.5 py-2 text-left sm:w-56 sm:min-w-[14rem] sm:max-w-[14rem] sm:px-3">
                <span className="micro-label">Employee</span>
              </th>
              {data.days.map((day) => {
                const isToday = day.date === data.today;
                const hasEvent = day.events.length > 0;
                return (
                  <th
                    key={day.date}
                    scope="col"
                    data-date={day.date}
                    title={day.events.map((e) => e.title).join(", ") || undefined}
                    className={cn(
                      "border-b border-border px-0.5 py-1.5 text-center font-semibold backdrop-blur",
                      day.working ? "bg-muted/90" : "bg-muted",
                      isToday && "bg-primary/10 text-primary",
                    )}
                  >
                    <div className="flex w-7 flex-col items-center leading-tight">
                      <span className={cn("text-[9px] font-bold uppercase", day.working ? "text-muted-foreground" : "text-muted-foreground/60")}>{WEEKDAY[day.dow]}</span>
                      <span className={cn("tabular text-[11px]", isToday ? "font-bold text-primary" : day.working ? "text-foreground" : "text-muted-foreground/70")}>
                        {Number(day.date.slice(8, 10))}
                      </span>
                      <span className={cn("mt-0.5 h-1 w-1 rounded-full", hasEvent ? "bg-primary" : "bg-transparent")} aria-hidden />
                    </div>
                  </th>
                );
              })}
              <th scope="col" className="z-30 border-b border-l border-border bg-muted px-2 py-2 text-center sm:sticky sm:right-0">
                <span className="micro-label">Month</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, row) => {
              const t = totals[row];
              return (
                <tr key={emp.id} className="group">
                  <th scope="row" className="sticky left-0 z-10 w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem] border-b border-r border-border bg-card px-2.5 py-1.5 text-left font-normal group-hover:bg-muted sm:w-56 sm:min-w-[14rem] sm:max-w-[14rem] sm:px-3">
                    <Link to={`/attendance/${emp.id}?month=${data.month}`} className="block min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                      <span className="block truncate text-[12.5px] font-semibold text-foreground hover:text-primary" title={emp.name}>
                        {emp.name}
                      </span>
                      <span className="flex items-center gap-1 truncate text-[10.5px] text-muted-foreground">
                        {emp.code && <span>{emp.code}</span>}
                        {emp.payslip_locked && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 text-[9.5px] font-semibold">
                            <Lock className="h-2.5 w-2.5" aria-hidden /> Payslip final
                          </span>
                        )}
                        {emp.separation_date && emp.separation_date <= data.days[data.days.length - 1].date && (
                          <span className="rounded bg-muted px-1 text-[9.5px] font-semibold">Left {format(parseISO(emp.separation_date), "d MMM")}</span>
                        )}
                      </span>
                    </Link>
                  </th>
                  {grid[row].map((info, col) => (
                    <GridCell
                      key={data.days[col].date}
                      info={info}
                      row={row}
                      col={col}
                      isToday={data.days[col].date === data.today}
                      onCycle={cycle}
                      onSet={setCell}
                      onMove={move}
                    />
                  ))}
                  <td className="z-10 border-b border-l border-border bg-card px-2 py-1 group-hover:bg-muted sm:sticky sm:right-0">
                    <div className="tabular flex items-center justify-center gap-1.5 whitespace-nowrap text-[10.5px] font-semibold">
                      <span className="text-success" title="Present">{t.p}P</span>
                      {t.h + t.s > 0 && <span className="text-warning" title="Half days and short leave">{t.h + t.s}H</span>}
                      {t.l > 0 && <span className="text-primary" title="Leave">{t.l}L</span>}
                      {t.a > 0 && <span className="text-destructive" title="Absent">{t.a}A</span>}
                      {t.left > 0 && (
                        <span className="text-muted-foreground" title={`${t.left} past working day${t.left === 1 ? "" : "s"} not marked yet`}>
                          {t.left} to mark
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sticky bottom-0 left-0 z-20 border-r border-t border-border bg-muted px-2.5 py-1.5 text-left sm:px-3">
                <span className="micro-label">
                  <span className="sm:hidden">Present</span>
                  <span className="hidden sm:inline">Present per day</span>
                </span>
              </th>
              {dayTotals.map((n, i) => (
                <td key={data.days[i].date} className="sticky bottom-0 z-10 border-t border-border bg-muted px-0.5 py-1.5 text-center">
                  <span className={cn("tabular text-[10.5px] font-semibold", n > 0 ? "text-foreground" : "text-muted-foreground/50")}>{data.days[i].working ? n : ""}</span>
                </td>
              ))}
              <td className="sticky bottom-0 z-20 border-l border-t border-border bg-muted sm:right-0" />
            </tr>
          </tfoot>
        </table>
      </div>

      {data.can_edit && (
        <p className="mt-2 hidden text-[11px] text-muted-foreground sm:block">
          Click a day to cycle Present → Half day → Short leave → Absent → clear. With a day focused, use the arrow keys, or press P, H, S, A, or Delete.
        </p>
      )}

      {pending.size > 0 && (
        <div className="pb-safe sticky bottom-2 z-40 mt-3 flex flex-col items-stretch gap-2 rounded-2xl border border-primary/25 bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-foreground">
            <CalendarCheck2 className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden />
            {pending.size} change{pending.size === 1 ? "" : "s"} not saved
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 rounded-xl sm:flex-none" onClick={() => setPending(new Map())} disabled={save.isPending}>
              <Undo2 className="h-4 w-4" aria-hidden /> Discard
            </Button>
            <Button size="sm" className="flex-1 rounded-xl sm:flex-none" onClick={onSave} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
