import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { History, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CardSkeleton, ConfirmButton, SectionCard } from "@/components/kit";
import { useFillFromPunches, useSaveTimeSettings, useTimeSettings } from "../api";
import type { TimeSettings } from "../types";

const COMMON_ZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Africa/Cairo",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

type Form = Pick<TimeSettings, "timezone" | "morning_start" | "evening_start" | "night_start" | "grace_minutes" | "hours_per_day" | "auto_present">;

export function RulesCard() {
  const { data, isLoading } = useTimeSettings();
  const save = useSaveTimeSettings();
  const fill = useFillFromPunches();
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        timezone: data.timezone,
        morning_start: data.morning_start,
        evening_start: data.evening_start,
        night_start: data.night_start,
        grace_minutes: data.grace_minutes,
        hours_per_day: Number(data.hours_per_day),
        auto_present: data.auto_present,
      });
    }
  }, [data]);

  const zones = useMemo(() => {
    let all: string[] = COMMON_ZONES;
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      if (fn) all = fn("timeZone");
    } catch {
      /* older browsers: common list */
    }
    return Array.from(new Set([...(data?.timezone ? [data.timezone] : []), ...all, "UTC"]));
  }, [data?.timezone]);

  if (isLoading || !form || !data) return <CardSkeleton lines={5} />;

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const dirty =
    form.timezone !== data.timezone ||
    form.morning_start !== data.morning_start ||
    form.evening_start !== data.evening_start ||
    form.night_start !== data.night_start ||
    form.grace_minutes !== data.grace_minutes ||
    form.hours_per_day !== Number(data.hours_per_day) ||
    form.auto_present !== data.auto_present;
  // A cleared time box would reach the server as "" and fail there with a raw error.
  const valid =
    !!form.morning_start &&
    !!form.evening_start &&
    !!form.night_start &&
    Number.isInteger(form.grace_minutes) &&
    form.grace_minutes >= 0 &&
    form.grace_minutes <= 180 &&
    form.hours_per_day >= 1 &&
    form.hours_per_day <= 16;

  // "This month" is the company's month (its timezone), the same one the server fills.
  const todayStr = data.today;
  const monthFrom = `${todayStr.slice(0, 8)}01`;

  return (
    <SectionCard title="Attendance rules" description="Shift start times, grace and automatic marking. Changes apply from now on." icon={Settings2}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["morning_start", "Morning starts"],
                ["evening_start", "Evening starts"],
                ["night_start", "Night starts"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`rule-${key}`} className="text-xs">{label}</Label>
                <Input id={`rule-${key}`} type="time" value={form[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)} className="h-9 rounded-xl" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-grace" className="text-xs">Grace (minutes)</Label>
              <Input id="rule-grace" type="number" min={0} max={180} value={form.grace_minutes} onChange={(e) => set({ grace_minutes: Number(e.target.value) })} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-hours" className="text-xs">Hours per day</Label>
              <Input id="rule-hours" type="number" min={1} max={16} step={0.5} value={form.hours_per_day} onChange={(e) => set({ hours_per_day: Number(e.target.value) })} className="h-9 rounded-xl" />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Late counts from the end of the grace period: with 10 minutes of grace, 09:10:59 is on time. A shift ends start + hours per day (a person's own hours are used when set on their profile).
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Company timezone</Label>
            <Select value={form.timezone} onValueChange={(v) => set({ timezone: v })}>
              <SelectTrigger className="h-9 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block text-sm font-semibold">Mark present from punches</span>
              <span className="block text-[11px] text-muted-foreground">A punch marks the person present on a working day. It never overwrites a mark HR made.</span>
            </span>
            <Switch checked={form.auto_present} onCheckedChange={(c) => set({ auto_present: c })} aria-label="Mark present from punches" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConfirmButton
              size="sm"
              variant="outline"
              className="rounded-xl"
              destructive={false}
              title="Fill the register from stored punches?"
              description={`Every day this month (${format(parseISO(monthFrom), "d MMM")} to today) where someone punched but nothing is marked becomes Present. Existing marks, leave and locked months are left alone.`}
              confirmLabel="Fill register"
              onConfirm={() => fill.mutateAsync({ from: monthFrom, to: todayStr })}
            >
              <History className="h-4 w-4" /> Fill register from punches
            </ConfirmButton>
            <Button className="rounded-xl" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate(form)}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save rules
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
