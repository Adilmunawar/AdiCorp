import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { addMonths, format, startOfMonth } from "date-fns";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Command, containsFilter, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials, toDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { EmployeeOption } from "../types";

/** FilterBar className that keeps the search and its selects on one line on phones too (the search grows). */
export const FILTER_ROW = "flex-row flex-wrap items-center [&>div:first-child]:min-w-[150px] [&>div:first-child]:flex-1 sm:[&>div:first-child]:flex-none";

/** Avatar + name + code, used as the first column of every list. `employeeId` links the name to the profile. */
export function PersonCell({
  name,
  code,
  avatarUrl,
  sub,
  employeeId,
}: {
  name: string;
  code?: string | null;
  avatarUrl?: string | null;
  sub?: ReactNode;
  employeeId?: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="h-8 w-8 shrink-0 rounded-xl border border-border">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
        <AvatarFallback className="rounded-xl bg-primary/10 text-[11px] font-bold text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        {employeeId ? (
          <Link
            to={`/employees/${employeeId}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate rounded-sm text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {name}
          </Link>
        ) : (
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        )}
        {(code || sub) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {code}
            {code && sub ? " · " : ""}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/** Searchable employee combobox. */
export function EmployeePicker({
  employees,
  value,
  onChange,
  id,
  disabled,
  placeholder = "Pick an employee",
}: {
  employees: EmployeeOption[];
  value: string | null;
  onChange: (id: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => employees.find((e) => e.id === value) ?? null, [employees, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between rounded-xl px-3 font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.name}${selected.employee_code ? ` · ${selected.employee_code}` : ""}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
        <Command filter={containsFilter}>
          <CommandInput placeholder="Search by name or ID…" />
          <CommandList>
            <CommandEmpty>No active employee matches.</CommandEmpty>
            <CommandGroup>
              {employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.name} ${e.employee_code ?? ""}`}
                  onSelect={() => {
                    onChange(e.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", e.id === value ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="truncate">{e.name}</span>
                  {e.employee_code && <span className="ml-auto pl-2 text-[11px] text-muted-foreground">{e.employee_code}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Compact pill filter (status chips). Scrolls sideways inside itself on phones. */
export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1 hide-scrollbar">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {typeof o.count === "number" && o.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[11px] tabular", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Allowance bar: remaining of allowed, red at 2 days or fewer. */
export function BalanceBar({ allowed, used, className }: { allowed: number; used: number; className?: string }) {
  const remaining = allowed - used;
  const pct = allowed > 0 ? Math.max(0, Math.min(100, (remaining / allowed) * 100)) : 0;
  const tone = remaining <= 2 ? "bg-destructive" : remaining <= allowed * 0.35 ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i);

/**
 * Compact month stepper: previous, a month/year jump menu, next. One 36px control, so it lines up
 * with the buttons beside it. `max` stops it at a month (overtime cannot be in the future); `today`
 * (yyyy-MM-dd, the company's day) decides which month "this month" is.
 */
export function MonthNav({
  month,
  onChange,
  max,
  today,
  className,
}: {
  month: Date;
  onChange: (month: Date) => void;
  max?: Date;
  today?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(month.getFullYear());
  const current = startOfMonth(month);
  const limit = max ? startOfMonth(max) : null;
  const canNext = !limit || current < limit;
  const thisMonth = startOfMonth(toDate(today) ?? new Date());
  const onThisMonth = current.getTime() === thisMonth.getTime();
  const go = (next: Date) => onChange(startOfMonth(next));

  return (
    <div className={cn("inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      <button
        type="button"
        onClick={() => go(addMonths(current, -1))}
        aria-label="Previous month"
        className="flex w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setYear(current.getFullYear());
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Pick a month (now ${format(current, "MMMM yyyy")})`}
            className="flex min-w-[112px] items-center justify-center gap-1.5 border-x border-border px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-w-[136px]"
          >
            <CalendarDays className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden />
            <span className="tabular">{format(current, "MMMM yyyy")}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 rounded-xl p-3" align="center">
          <div className="mb-2 flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold tabular">{year}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setYear((y) => y + 1)}
              disabled={!!limit && year >= limit.getFullYear()}
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((i) => {
              const m = new Date(year, i, 1);
              const selected = m.getTime() === current.getTime();
              const disabled = !!limit && m > limit;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    go(m);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-8 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
                    selected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                    !selected && m.getTime() === thisMonth.getTime() && "ring-1 ring-inset ring-primary/40",
                  )}
                >
                  {format(m, "MMM")}
                </button>
              );
            })}
          </div>
          {!onThisMonth && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-8 w-full rounded-lg"
              onClick={() => {
                go(thisMonth);
                setOpen(false);
              }}
            >
              Go to this month
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={() => go(addMonths(current, 1))}
        disabled={!canNext}
        aria-label="Next month"
        className="flex w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Small uppercase label + value pair for summaries inside dialogs. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="micro-label text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{children}</p>
    </div>
  );
}
