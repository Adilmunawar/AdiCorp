import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfDay, startOfMonth } from "date-fns";
import { CalendarDays, CalendarRange, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { SectionCard, Skeleton, formatMonth, formatNumber, toDate, toDbDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useCalendarExceptions, useUpdateSettings, type CalendarException, type CompanySettings, type SaturdayPolicy, type SettingsPatch } from "../api";
import { CONTROL, SaveBar, SettingRow, SettingsList, ToggleRow } from "../components/form";
import { useReportDirty } from "../components/unsaved";

const POLICIES: { value: SaturdayPolicy; title: string; text: string; short: string; tiny: string }[] = [
  { value: "working", title: "Every Saturday is a working day", text: "A six-day week.", short: "Working", tiny: "Work" },
  { value: "off", title: "Every Saturday is off", text: "A five-day week.", short: "Off", tiny: "Off" },
  { value: "alternate_1_3", title: "1st, 3rd and 5th Saturdays off", text: "The 2nd and 4th Saturdays are working days.", short: "Alternate", tiny: "Alt." },
  { value: "alternate_2_4", title: "2nd and 4th Saturdays off", text: "The other Saturdays are working days.", short: "Alternate", tiny: "Alt." },
  { value: "seasonal", title: "Off for part of the year", text: "Off between two dates (for example in summer), working otherwise.", short: "Seasonal", tiny: "Season" },
];

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface WeekForm {
  saturday_policy: SaturdayPolicy;
  saturday_off_from: string;
  saturday_off_until: string;
  sunday_off: boolean;
  working_hours_per_day: string;
  hours_threshold_pct: string;
}

function fromSettings(s: CompanySettings): WeekForm {
  return {
    saturday_policy: s.saturday_policy,
    saturday_off_from: s.saturday_off_from ?? "",
    saturday_off_until: s.saturday_off_until ?? "",
    sunday_off: s.sunday_off,
    working_hours_per_day: String(s.working_hours_per_day),
    hours_threshold_pct: String(s.hours_threshold_pct),
  };
}

const SATURDAYS_OFF: SaturdayPolicy[] = ["off", "alternate_1_3", "alternate_2_4"];

/**
 * First Saturday the off rule applies to, like public.working_dates() (saturday_off_from bounds every
 * rule). Turning Saturdays off starts today, so Saturdays already worked stay working days; a rule
 * that was already off keeps its saved start.
 */
function offRuleStart(form: WeekForm, saved: WeekForm, today: Date): Date | null {
  if (!SATURDAYS_OFF.includes(form.saturday_policy)) return null;
  return SATURDAYS_OFF.includes(saved.saturday_policy) ? toDate(saved.saturday_off_from) : today;
}

/** Same rule as public.working_dates() (company_working_settings), for the preview. */
function saturdayOff(form: WeekForm, d: Date, start: Date | null): boolean {
  const nth = Math.floor((d.getDate() - 1) / 7) + 1;
  if (form.saturday_policy !== "seasonal" && start && d < start) return false;
  switch (form.saturday_policy) {
    case "off":
      return true;
    case "alternate_1_3":
      return nth === 1 || nth === 3 || nth === 5;
    case "alternate_2_4":
      return nth === 2 || nth === 4;
    case "seasonal": {
      const from = toDate(form.saturday_off_from);
      const until = toDate(form.saturday_off_until);
      return !!from && !!until && d >= from && d <= until;
    }
    default:
      return false;
  }
}

function weekPatternWorking(form: WeekForm, d: Date, start: Date | null): boolean {
  const dow = getDay(d);
  if (dow === 0) return !form.sunday_off;
  if (dow === 6) return !saturdayOff(form, d, start);
  return true;
}

interface MonthPreview {
  month: Date;
  pattern: number;
  total: number;
  closures: { title: string; date: Date }[];
  extra: { title: string; date: Date }[];
}

function covers(e: CalendarException, d: Date): boolean {
  const key = toDbDate(d);
  return !!key && e.date <= key && (e.end_date ?? e.date) >= key;
}

/** Working days in a month: the week pattern, minus holidays and closures, plus extra working days. */
function previewMonth(form: WeekForm, month: Date, exceptions: CalendarException[], start: Date | null): MonthPreview {
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  let pattern = 0;
  let total = 0;
  const closures: MonthPreview["closures"] = [];
  const extra: MonthPreview["extra"] = [];
  for (const d of days) {
    const base = weekPatternWorking(form, d, start);
    if (base) pattern += 1;
    const closed = exceptions.find((e) => e.type !== "working_day" && covers(e, d));
    const added = exceptions.find((e) => e.type === "working_day" && covers(e, d));
    const working = !closed && (base || !!added);
    if (working) total += 1;
    if (closed && base) closures.push({ title: closed.title || "Holiday", date: d });
    if (!closed && added && !base) extra.push({ title: added.title || "Extra working day", date: d });
  }
  return { month, pattern, total, closures, extra };
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${formatNumber(n, 0)} ${n === 1 ? one : many}`;
}

export function WorkweekTab({ settings }: { settings: CompanySettings }) {
  const initial = useMemo(() => fromSettings(settings), [settings]);
  const [form, setForm] = useState<WeekForm>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const update = useUpdateSettings();
  useEffect(() => setForm(initial), [initial]);

  const set = <K extends keyof WeekForm>(key: K, value: WeekForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const hours = Number(form.working_hours_per_day);
  const threshold = Number(form.hours_threshold_pct);
  const errors = {
    season:
      form.saturday_policy === "seasonal" && (!form.saturday_off_from || !form.saturday_off_until || form.saturday_off_from > form.saturday_off_until)
        ? "Give the first and the last Saturday off, in order."
        : null,
    // Same rule as the server and the Time settings: 1 to 16 hours, in half hours.
    hours: form.working_hours_per_day.trim() === "" || !Number.isFinite(hours) || hours < 1 || hours > 16 || hours * 2 !== Math.trunc(hours * 2) ? "Between 1 and 16, in half hours (for example 7.5)." : null,
    threshold: form.hours_threshold_pct.trim() === "" || !Number.isInteger(threshold) || threshold < 50 || threshold > 100 ? "A whole percentage between 50 and 100." : null,
  };

  const patch = useMemo<SettingsPatch>(() => {
    const p: SettingsPatch = {};
    if (form.saturday_policy !== initial.saturday_policy) p.saturday_policy = form.saturday_policy;
    if (form.saturday_off_from !== initial.saturday_off_from) p.saturday_off_from = form.saturday_off_from || null;
    if (form.saturday_off_until !== initial.saturday_off_until) p.saturday_off_until = form.saturday_off_until || null;
    if (form.sunday_off !== initial.sunday_off) p.sunday_off = form.sunday_off;
    if (Number(form.working_hours_per_day) !== Number(initial.working_hours_per_day) || form.working_hours_per_day.trim() === "") p.working_hours_per_day = Number(form.working_hours_per_day);
    if (Number(form.hours_threshold_pct) !== Number(initial.hours_threshold_pct) || form.hours_threshold_pct.trim() === "") p.hours_threshold_pct = Number(form.hours_threshold_pct);
    return p;
  }, [form, initial]);
  const dirty = Object.keys(patch).length > 0;
  useReportDirty(dirty);

  const save = async () => {
    if (errors.season || errors.hours || errors.threshold) {
      setShowErrors(true);
      toast.error("Check the highlighted fields");
      return;
    }
    try {
      await update.mutateAsync(patch);
      setShowErrors(false);
      toast.success("Working week saved", { description: "Changes apply from today; past attendance is not recalculated." });
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
    }
  };

  // Live preview for this month and the next, with the calendar's holidays applied.
  const today = startOfDay(new Date());
  const rangeFrom = toDbDate(startOfMonth(today)) ?? "";
  const rangeTo = toDbDate(endOfMonth(addMonths(today, 1))) ?? "";
  const exceptions = useCalendarExceptions(rangeFrom, rangeTo);
  const offStart = offRuleStart(form, initial, today);
  const previews = [today, addMonths(today, 1)].map((m) => previewMonth(form, m, exceptions.data ?? [], offStart));

  // Average week over the coming 52 weeks, so alternate and seasonal Saturdays are reflected.
  const weekDays = useMemo(() => {
    const start = startOfDay(new Date());
    let n = 0;
    for (let i = 0; i < 364; i += 1) if (weekPatternWorking(form, addDays(start, i), null)) n += 1;
    return n / 52;
  }, [form]);
  const evenWeek = Number.isInteger(weekDays);
  const weekDaysLabel = formatNumber(weekDays, 1);
  const weeklyHours = Math.round(hours * weekDays * 2) / 2;

  const sat = POLICIES.find((p) => p.value === form.saturday_policy) ?? POLICIES[0];
  const WORK = { state: "work" as const, label: "Working", tiny: "Work" };
  const OFF = { state: "off" as const, label: "Off", tiny: "Off" };
  const strip = WEEK.map((d, i) => {
    if (i < 5) return { day: d, ...WORK };
    if (i === 6) return { day: d, ...(form.sunday_off ? OFF : WORK) };
    if (form.saturday_policy === "working") return { day: d, ...WORK };
    if (form.saturday_policy === "off") return { day: d, ...OFF };
    return { day: d, state: "some" as const, label: sat.short, tiny: sat.tiny };
  });

  return (
    <div className="space-y-4">
      <SectionCard title="Weekly schedule" description="Which days count as working days for attendance, leave and pay" icon={CalendarRange} flush>
        <div className="border-b border-border/60 px-4 py-4 sm:px-5">
          <ol className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="Your working week">
            {strip.map((s) => (
              <li
                key={s.day}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors",
                  s.state === "work" && "border-primary/25 bg-primary/[0.06]",
                  s.state === "off" && "border-dashed border-border bg-muted/40",
                  s.state === "some" && "border-warning/30 bg-warning-soft",
                )}
              >
                <span className={cn("text-xs font-semibold", s.state === "off" ? "text-muted-foreground" : "text-foreground")}>{s.day}</span>
                <span
                  className={cn(
                    "max-w-full truncate text-[10px] font-medium leading-3 sm:text-[11px]",
                    s.state === "work" && "text-primary",
                    s.state === "off" && "text-muted-foreground",
                    s.state === "some" && "text-warning",
                  )}
                  title={s.label}
                >
                  <span className="sm:hidden" aria-hidden>
                    {s.tiny}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sr-only sm:hidden">{s.label}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2.5 text-xs text-muted-foreground">
            {weekDaysLabel} working days a week{evenWeek ? "" : " on average"}
            {Number.isFinite(weeklyHours) && !errors.hours ? `, ${evenWeek ? "" : "about "}${formatNumber(weeklyHours, 1)} hours` : ""}, before holidays.
          </p>
        </div>

        <SettingsList>
          <SettingRow label="Saturdays" description="Pick the rule that matches your office. Employees on a personal weekend keep their own.">
            <RadioGroup value={form.saturday_policy} onValueChange={(v) => set("saturday_policy", v as SaturdayPolicy)} className="grid gap-2" aria-label="Saturdays">
              {POLICIES.map((p) => (
                <Label
                  key={p.value}
                  htmlFor={`sat-${p.value}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    form.saturday_policy === p.value ? "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20" : "border-border hover:bg-muted/40",
                  )}
                >
                  <RadioGroupItem id={`sat-${p.value}`} value={p.value} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-5 text-foreground">{p.title}</span>
                    <span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{p.text}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </SettingRow>

          {form.saturday_policy === "seasonal" && (
            <SettingRow label="Season" description="Saturdays between these dates are off; the rest of the year they are working days." error={showErrors || form.saturday_off_from || form.saturday_off_until ? errors.season : null}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sat-from" className="text-xs font-medium text-muted-foreground">
                    First Saturday off
                  </Label>
                  <Input id="sat-from" type="date" value={form.saturday_off_from} onChange={(e) => set("saturday_off_from", e.target.value)} className={CONTROL} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sat-until" className="text-xs font-medium text-muted-foreground">
                    Last Saturday off
                  </Label>
                  <Input id="sat-until" type="date" value={form.saturday_off_until} onChange={(e) => set("saturday_off_until", e.target.value)} className={CONTROL} />
                </div>
              </div>
            </SettingRow>
          )}

          <ToggleRow
            id="sunday-off"
            label="Sundays are off"
            description="Turn this off only if your teams work on Sundays."
            checked={form.sunday_off}
            onChange={(v) => set("sunday_off", v)}
          />
        </SettingsList>
      </SectionCard>

      <SectionCard title="Working days ahead" description="What this rule means for the next two months, with holidays from the calendar" icon={CalendarDays}>
        <div className="grid gap-3 sm:grid-cols-2">
          {previews.map((p) => (
            <div key={p.month.toISOString()} className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3.5">
              <p className="micro-label">{formatMonth(p.month)}</p>
              {exceptions.isPending ? (
                <Skeleton className="mt-2 h-7 w-32" />
              ) : (
                <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="tabular font-display text-2xl font-semibold leading-8 text-foreground">{p.total}</span>
                  <span className="text-[13px] text-muted-foreground">working days</span>
                </p>
              )}
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {p.closures.length === 0 && p.extra.length === 0
                  ? exceptions.isError
                    ? "Before public holidays (the calendar could not load)."
                    : "No holidays on working days this month."
                  : [
                      `${p.pattern} by the weekly schedule`,
                      p.closures.length ? `minus ${plural(p.closures.length, "holiday")}` : null,
                      p.extra.length ? `plus ${plural(p.extra.length, "extra working day")}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ") + "."}
              </p>
              {(p.closures.length > 0 || p.extra.length > 0) && (
                <ul className="mt-2.5 space-y-1 border-t border-border/60 pt-2.5">
                  {[...p.closures.map((c) => ({ ...c, kind: "off" as const })), ...p.extra.map((c) => ({ ...c, kind: "work" as const }))]
                    .sort((a, b) => a.date.getTime() - b.date.getTime())
                    .map((c) => (
                      <li key={`${c.kind}-${c.date.toISOString()}`} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-foreground" title={c.title}>
                          {c.title}
                          {c.kind === "work" && <span className="text-muted-foreground"> · working</span>}
                        </span>
                        <span className="tabular shrink-0 text-muted-foreground">{format(c.date, "EEE d MMM")}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Hours" description="Expected hours and the threshold used in hours tracking" icon={Clock3} flush>
        <SettingsList>
          <SettingRow
            id="hours-day"
            label="Working hours per day"
            description="A full day, used for expected hours and overtime."
            error={showErrors || form.working_hours_per_day !== initial.working_hours_per_day ? errors.hours : null}
          >
            <div className="relative max-w-[200px]">
              <Input
                id="hours-day"
                type="number"
                inputMode="decimal"
                min={1}
                max={16}
                step={0.5}
                value={form.working_hours_per_day}
                onChange={(e) => set("working_hours_per_day", e.target.value)}
                aria-invalid={!!errors.hours}
                className={cn(CONTROL, "tabular pr-14")}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">hours</span>
            </div>
          </SettingRow>
          <SettingRow
            id="hours-threshold"
            label="Hours threshold"
            description="People below this share of their expected hours are flagged in hours tracking."
            error={showErrors || form.hours_threshold_pct !== initial.hours_threshold_pct ? errors.threshold : null}
            hint={!errors.threshold && !errors.hours ? `${threshold}% of a ${formatNumber(hours, 2)}-hour day is ${formatNumber((hours * threshold) / 100, 2)} hours.` : undefined}
          >
            <div className="relative max-w-[200px]">
              <Input
                id="hours-threshold"
                type="number"
                inputMode="numeric"
                min={50}
                max={100}
                step={1}
                value={form.hours_threshold_pct}
                onChange={(e) => set("hours_threshold_pct", e.target.value)}
                aria-invalid={!!errors.threshold}
                className={cn(CONTROL, "tabular pr-9")}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <SaveBar dirty={dirty} saving={update.isPending} onSave={() => void save()} onReset={() => setForm(initial)} />
    </div>
  );
}
