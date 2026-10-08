import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  selectedMonth: Date;
  onMonthChange: (month: Date) => void;
  className?: string;
  /**
   * true: any month (calendars, planning). false: nothing after the current month (history).
   * Left out: the original behaviour (the next arrow stops at the current month, the picker allows any month).
   */
  allowFuture?: boolean;
}

const monthKey = (d: Date) => format(d, "yyyy-MM");

/** Month stepper: previous / month picker / next, as one segmented control. */
export default function MonthSelector({ selectedMonth, onMonthChange, className, allowFuture }: MonthSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [year, setYear] = useState(selectedMonth.getFullYear());
  const current = monthKey(new Date());
  const historyOnly = allowFuture === false;
  const isFuture = (d: Date) => historyOnly && monthKey(d) > current;
  const canGoNext = allowFuture === true ? true : historyOnly ? !isFuture(addMonths(selectedMonth, 1)) : monthKey(selectedMonth) !== current;
  const thisYear = new Date().getFullYear();

  const pick = (month: Date) => {
    onMonthChange(startOfMonth(month));
    setIsOpen(false);
  };

  return (
    <div className={cn("inline-flex items-center rounded-xl border border-input/80 bg-background shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]", className)}>
      <button
        type="button"
        onClick={() => onMonthChange(startOfMonth(subMonths(selectedMonth, 1)))}
        aria-label="Previous month"
        className="flex h-10 w-10 items-center justify-center rounded-l-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-9 sm:w-9"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) setYear(selectedMonth.getFullYear());
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Month: ${format(selectedMonth, "MMMM yyyy")}. Choose a month`}
            className="flex h-10 min-w-[148px] items-center justify-center gap-2 border-x border-input/80 px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-9"
          >
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="tabular">{format(selectedMonth, "MMMM yyyy")}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="center">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <ChevronLeft aria-hidden />
            </Button>
            <span className="tabular text-sm font-semibold text-foreground">{year}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setYear((y) => y + 1)}
              disabled={historyOnly && year >= thisYear}
              aria-label="Next year"
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => {
              const month = new Date(year, i, 1);
              const selected = monthKey(month) === monthKey(selectedMonth);
              const now = monthKey(month) === current;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isFuture(month)}
                  onClick={() => pick(month)}
                  aria-pressed={selected}
                  className={cn(
                    "h-9 rounded-lg text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
                    selected ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-muted",
                    !selected && now && "ring-1 ring-inset ring-primary/40",
                  )}
                >
                  {format(month, "MMM")}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={() => onMonthChange(startOfMonth(addMonths(selectedMonth, 1)))}
        disabled={!canGoNext}
        aria-label="Next month"
        className="flex h-10 w-10 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
