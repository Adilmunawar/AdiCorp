import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Flag as FlagIcon, History, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListSkeleton, MonthPicker, PageHeader, RowActions, SectionCard, StatusBadge, TabsNav, useCompany, useTabParam } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useAddStandardHolidays, useCompanyToday, useDeleteEvent, useEvents, useWorkingDates, type EventInput } from "../api";
import { EventDialog } from "../components/EventDialog";
import { WorkWeekCard } from "../components/WorkWeekCard";
import { EVENT_META, isDayOffEvent } from "../lib";
import type { CalendarEvent } from "../types";

const TABS = [
  { value: "upcoming", label: "Coming up", icon: CalendarDays },
  { value: "month", label: "Month", icon: CalendarRange },
  { value: "year", label: "Whole year", icon: FlagIcon },
  { value: "past", label: "Past", icon: History },
  { value: "week", label: "Working week", icon: CalendarPlus },
];

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

function newEvent(date: string): EventInput {
  return { title: "", type: "holiday", date, end_date: null, description: "", affects_attendance: true };
}

function toInput(e: CalendarEvent): EventInput {
  return { id: e.id, title: e.title, type: e.type, date: e.date, end_date: e.end_date, description: e.description, affects_attendance: e.affects_attendance };
}

export default function CalendarPage() {
  const { isHR } = useAuth();
  const [tab] = useTabParam(TABS);
  const [editing, setEditing] = useState<EventInput | null>(null);
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const today = useCompanyToday();

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Calendar"
        eyebrow="Time"
        icon={CalendarDays}
        description="Holidays, off days, extra working days and company events. Attendance, leave and payroll all count working days from here."
        actions={
          isHR ? (
            <>
              <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={() => setHolidaysOpen(true)}>
                <Sparkles className="h-4 w-4" /> Standard holidays
              </Button>
              <Button size="sm" className="h-9 rounded-xl" onClick={() => setEditing(newEvent(today))}>
                <CalendarPlus className="h-4 w-4" /> Add event
              </Button>
            </>
          ) : undefined
        }
      >
        <TabsNav tabs={TABS} />
      </PageHeader>

      {tab === "upcoming" && <ListView mode="upcoming" canEdit={isHR} onEdit={setEditing} onAdd={() => setEditing(newEvent(today))} />}
      {tab === "past" && <ListView mode="past" canEdit={isHR} onEdit={setEditing} onAdd={() => setEditing(newEvent(today))} />}
      {tab === "month" && <MonthView canEdit={isHR} onEdit={setEditing} />}
      {tab === "year" && <YearView canEdit={isHR} onEdit={setEditing} />}
      {tab === "week" && <WorkWeekCard canEdit={isHR} />}

      <EventDialog value={editing} onClose={() => setEditing(null)} />
      <StandardHolidaysDialog open={holidaysOpen} onOpenChange={setHolidaysOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EventItem({ event, canEdit, onEdit }: { event: CalendarEvent; canEdit: boolean; onEdit: (e: EventInput) => void }) {
  const remove = useDeleteEvent();
  const meta = EVENT_META[event.type];
  const start = parseISO(event.date);
  const end = event.end_date ? parseISO(event.end_date) : null;
  const dayOff = isDayOffEvent(event.type, event.affects_attendance);
  const today = useCompanyToday();
  const when = relativeWhen(start, end, parseISO(today));
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <div className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border", dayOff ? "border-danger/20 bg-danger-soft text-danger" : "border-primary/15 bg-primary/5 text-primary")}>
        <span className="text-[10px] font-bold uppercase leading-none tracking-wide">{format(start, "MMM")}</span>
        <span className="tabular text-base font-bold leading-tight">{format(start, "d")}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="min-w-0 max-w-full break-words text-sm font-semibold text-foreground">{event.title}</p>
          <StatusBadge status={event.type} label={meta.label} tone={meta.tone} dot={false} />
          {event.affects_attendance && (event.type === "holiday" || event.type === "off_day" || event.type === "half_day") && (
            <span className="text-[11px] font-semibold text-muted-foreground">{dayOff ? "Day off" : "On the register"}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {dateRangeLabel(start, end)}
          {when && <span className={cn("ml-1.5 font-semibold", when.now ? "text-primary" : "text-foreground/80")}>· {when.label}</span>}
        </p>
        {event.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={event.description}>
            {event.description}
          </p>
        )}
      </div>
      {canEdit && (
        <RowActions
          label={`Actions for ${event.title}`}
          actions={[
            { label: "Edit", icon: Pencil, onSelect: () => onEdit(toInput(event)) },
            {
              label: "Delete",
              icon: Trash2,
              destructive: true,
              separated: true,
              confirm: { title: `Delete "${event.title}"?`, description: dayOff ? "The day becomes a normal working day again for attendance, leave and payroll." : "It is removed from the calendar.", confirmLabel: "Delete" },
              onSelect: () => remove.mutateAsync(event.id),
            },
          ]}
        />
      )}
    </li>
  );
}

/** "Today", "Tomorrow", "In 5 days" for what is coming up in the next two weeks (`now`: the company's today). */
function relativeWhen(start: Date, end: Date | null, now: Date): { label: string; now: boolean } | null {
  const toStart = differenceInCalendarDays(start, now);
  const toEnd = differenceInCalendarDays(end ?? start, now);
  if (toStart <= 0 && toEnd >= 0) return { label: toStart === 0 && toEnd === 0 ? "Today" : "On now", now: true };
  if (toStart === 1) return { label: "Tomorrow", now: false };
  if (toStart > 1 && toStart <= 14) return { label: `In ${toStart} days`, now: false };
  return null;
}

/** "Monday 1 May 2026", or a range with the day count ("Mon 22 Dec – Fri 2 Jan 2027 · 12 days"). */
function dateRangeLabel(start: Date, end: Date | null): string {
  if (!end || differenceInCalendarDays(end, start) <= 0) return format(start, "EEEE d MMMM yyyy");
  const days = differenceInCalendarDays(end, start) + 1;
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${format(start, sameYear ? "EEE d MMM" : "EEE d MMM yyyy")} – ${format(end, "EEE d MMM yyyy")} · ${days} days`;
}

function groupByMonth(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = e.date.slice(0, 7);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return Array.from(map.entries());
}

function ListView({ mode, canEdit, onEdit, onAdd }: { mode: "upcoming" | "past"; canEdit: boolean; onEdit: (e: EventInput) => void; onAdd: () => void }) {
  const today = useCompanyToday();
  const from = mode === "upcoming" ? today : ymd(subMonths(parseISO(today), 12));
  const to = mode === "upcoming" ? ymd(addMonths(parseISO(today), 6)) : today;
  const { data = [], isLoading } = useEvents(from, to);
  const events = useMemo(() => {
    const list = mode === "upcoming" ? data.filter((e) => (e.end_date ?? e.date) >= today) : data.filter((e) => (e.end_date ?? e.date) < today);
    return mode === "past" ? [...list].reverse() : list;
  }, [data, mode, today]);
  const groups = groupByMonth(events);

  if (isLoading) {
    return (
      <SectionCard>
        <ListSkeleton rows={5} />
      </SectionCard>
    );
  }
  if (events.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          icon={CalendarDays}
          title={mode === "upcoming" ? "Nothing on the calendar for the next six months" : "No past events in the last year"}
          description={mode === "upcoming" ? "Add public holidays, company off days and events so attendance, leave and payroll count working days correctly." : undefined}
          action={
            canEdit && mode === "upcoming" ? (
              <Button size="sm" className="rounded-xl" onClick={onAdd}>
                <CalendarPlus className="h-4 w-4" /> Add event
              </Button>
            ) : undefined
          }
        />
      </SectionCard>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map(([month, list]) => (
        <SectionCard key={month} flush title={format(parseISO(`${month}-01`), "MMMM yyyy")} description={`${list.length} event${list.length === 1 ? "" : "s"}`}>
          <ul className="divide-y divide-border">
            {list.map((e) => (
              <EventItem key={e.id} event={e} canEdit={canEdit} onEdit={onEdit} />
            ))}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

function MonthView({ canEdit, onEdit }: { canEdit: boolean; onEdit: (e: EventInput) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const gridStart = startOfWeek(month, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const { data = [], isLoading, isPlaceholderData } = useEvents(ymd(gridStart), ymd(gridEnd));
  const { data: workingList } = useWorkingDates(ymd(gridStart), ymd(gridEnd));
  const working = useMemo(() => (workingList ? new Set(workingList) : null), [workingList]);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = useCompanyToday();
  const isCurrentMonth = isSameMonth(month, parseISO(today));

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of data) {
      const span = eachDayOfInterval({ start: parseISO(e.date), end: parseISO(e.end_date && e.end_date >= e.date ? e.end_date : e.date) });
      for (const d of span) {
        const k = ymd(d);
        map.set(k, [...(map.get(k) ?? []), e]);
      }
    }
    return map;
  }, [data]);

  const monthKey = format(month, "yyyy-MM");
  const monthEvents = data.filter((e) => e.date.slice(0, 7) <= monthKey && (e.end_date ?? e.date).slice(0, 7) >= monthKey);
  const workingInMonth = working ? days.filter((d) => isSameMonth(d, month) && working.has(ymd(d))).length : null;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <SectionCard
      flush
      title={format(month, "MMMM yyyy")}
      icon={CalendarRange}
      description={
        isLoading
          ? "Loading the month…"
          : [plural(monthEvents.length, "event"), workingInMonth !== null ? plural(workingInMonth, "working day") : null].filter(Boolean).join(" · ")
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" className="h-9 rounded-xl" onClick={() => setMonth(startOfMonth(parseISO(today)))}>
              Today
            </Button>
          )}
          <MonthPicker selectedMonth={month} onMonthChange={setMonth} />
        </div>
      }
    >
      <div className={cn("p-2 transition-opacity sm:p-3", (isLoading || isPlaceholderData) && "opacity-70")}>
        <div className="grid grid-cols-7 gap-1 pb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="micro-label text-center">
              <span className="sm:hidden">{d.slice(0, 2)}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const k = ymd(d);
            const events = byDay.get(k) ?? [];
            const inMonth = isSameMonth(d, month);
            const off = events.some((e) => isDayOffEvent(e.type, e.affects_attendance));
            const weekend = !!working && inMonth && !working.has(k) && !off;
            const label = `${format(d, "EEEE d MMMM")}${off ? ", day off" : weekend ? ", weekend" : ""}${events.length ? `: ${events.map((e) => e.title).join(", ")}` : ""}`;
            return (
              <div
                key={k}
                role={canEdit ? "button" : undefined}
                tabIndex={canEdit ? 0 : undefined}
                onClick={() => canEdit && onEdit(newEvent(k))}
                onKeyDown={(e) => canEdit && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onEdit(newEvent(k)))}
                aria-label={canEdit ? `${label}. Add an event` : label}
                title={canEdit ? `Add an event on ${format(d, "d MMM")}` : undefined}
                className={cn(
                  "group min-h-[3rem] min-w-0 rounded-xl border p-1 text-left transition-colors sm:min-h-[5.5rem] sm:p-1.5",
                  inMonth ? "border-border bg-card" : "border-transparent bg-muted/30 text-muted-foreground/60",
                  weekend && "bg-muted/60",
                  off && inMonth && "border-danger/20 bg-danger-soft/60",
                  canEdit && "cursor-pointer hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  k === today && "ring-2 ring-primary/60",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "tabular inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md text-[11px] font-bold",
                      k === today ? "bg-primary px-1 text-primary-foreground" : inMonth ? (weekend ? "text-muted-foreground" : "text-foreground") : "",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                  {canEdit && inMonth && <CalendarPlus className="hidden h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" aria-hidden />}
                </div>
                {/* Phone: coloured dots; the agenda under the grid has the details. */}
                {events.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                    {events.slice(0, 3).map((e) => (
                      <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", eventDot(e))} />
                    ))}
                  </div>
                )}
                <div className="mt-0.5 hidden space-y-0.5 sm:block">
                  {events.slice(0, 2).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (canEdit) onEdit(toInput(e));
                      }}
                      title={`${e.title} · ${EVENT_META[e.type].label}`}
                      className={cn("block w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-semibold", eventChip(e), canEdit ? "hover:opacity-80" : "cursor-default")}
                    >
                      {e.title}
                    </button>
                  ))}
                  {events.length > 2 && <span className="block px-1 text-[10.5px] text-muted-foreground">+{events.length - 2} more</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-danger" aria-hidden /> Holiday or day off
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-success" aria-hidden /> Extra working day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden /> Event
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-border bg-muted" aria-hidden /> Weekend
          </span>
        </div>
      </div>

      {/* Phone agenda: the grid is too small for titles. */}
      <div className="border-t border-border/60 sm:hidden">
        {monthEvents.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">Nothing on the calendar this month.</p>
        ) : (
          <ul className="divide-y divide-border">
            {monthEvents.map((e) => (
              <EventItem key={e.id} event={e} canEdit={canEdit} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function eventChip(e: CalendarEvent): string {
  if (isDayOffEvent(e.type, e.affects_attendance)) return "bg-danger-soft text-danger";
  if (e.type === "working_day") return "bg-success-soft text-success";
  return "bg-primary/10 text-primary";
}

function eventDot(e: CalendarEvent): string {
  if (isDayOffEvent(e.type, e.affects_attendance)) return "bg-danger";
  if (e.type === "working_day") return "bg-success";
  return "bg-primary";
}

function YearView({ canEdit, onEdit }: { canEdit: boolean; onEdit: (e: EventInput) => void }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data = [], isLoading } = useEvents(`${year}-01-01`, `${year}-12-31`);
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  // Count calendar days off inside this year (a three-day holiday is three days), not events.
  const dayOffCount = useMemo(() => {
    const days = new Set<string>();
    for (const e of data) {
      if (!isDayOffEvent(e.type, e.affects_attendance)) continue;
      const span = eachDayOfInterval({ start: parseISO(e.date), end: parseISO(e.end_date && e.end_date >= e.date ? e.end_date : e.date) });
      for (const d of span) if (d.getFullYear() === year) days.add(ymd(d));
    }
    return days.size;
  }, [data, year]);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <SectionCard
      title={String(year)}
      description={isLoading ? "Loading…" : `${plural(data.length, "event")} · ${plural(dayOffCount, "day")} off`}
      actions={
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular w-14 text-center text-sm font-bold">{year}</span>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {months.map((m) => {
            const key = format(m, "yyyy-MM");
            // Overlap, so an event running through a whole month (22 Dec to 2 Feb) shows in January too.
            const list = data.filter((e) => e.date.slice(0, 7) <= key && (e.end_date ?? e.date).slice(0, 7) >= key);
            return (
              <div key={key} className="rounded-2xl border border-border p-3">
                <p className="micro-label mb-2">{format(m, "MMMM")}</p>
                {list.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nothing planned</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => onEdit(toInput(e))}
                          className="flex w-full min-w-0 items-center gap-2 rounded-lg text-left enabled:hover:bg-muted/50"
                        >
                          <span className="tabular w-11 shrink-0 text-[11px] font-bold text-muted-foreground">{format(parseISO(e.date), "d MMM")}</span>
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", eventDot(e))} aria-hidden />
                          <span className="truncate text-xs font-medium">{e.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function StandardHolidaysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { currency } = useCompany();
  const add = useAddStandardHolidays();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [country, setCountry] = useState<"PK" | "INTL">(currency === "PKR" ? "PK" : "INTL");
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);
  // The company may load after this dialog mounts: pick the list for its currency each time it opens.
  useEffect(() => {
    if (open) setCountry(currency === "PKR" ? "PK" : "INTL");
  }, [open, currency]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add standard holidays</DialogTitle>
          <DialogDescription>Adds the fixed-date public holidays for a year and skips any already on the calendar. Holidays that follow the moon (such as Eid) are added by hand.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>List</Label>
            <Select value={country} onValueChange={(v) => setCountry(v as "PK" | "INTL")}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PK">Pakistan</SelectItem>
                <SelectItem value="INTL">International</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {country === "PK"
            ? "Kashmir Solidarity Day (5 Feb), Pakistan Day (23 Mar), Labour Day (1 May), Independence Day (14 Aug), Iqbal Day (9 Nov), Quaid-e-Azam Day (25 Dec)."
            : "New Year's Day (1 Jan), Labour Day (1 May), Christmas Day (25 Dec)."}
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={add.isPending}
            onClick={async () => {
              try {
                await add.mutateAsync({ year, country });
                onOpenChange(false);
              } catch {
                // The mutation shows the error; keep the dialog open to retry.
              }
            }}
          >
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add holidays
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
