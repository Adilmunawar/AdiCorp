import { useEffect, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CalendarCog, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CardSkeleton, SectionCard } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/integrations/supabase/client";
import { timeKeys, useSaveTimeSettings, useTimeSettings } from "../api";
import type { TimeSettings } from "../types";

type Form = Pick<TimeSettings, "weekend_sunday" | "weekend_saturday" | "saturday_pattern" | "saturday_off_from" | "saturday_off_until">;

const PATTERNS: { value: Form["saturday_pattern"]; label: string }[] = [
  { value: "all", label: "Every Saturday" },
  { value: "alt_2_4", label: "2nd and 4th Saturdays" },
  { value: "alt_1_3_5", label: "1st, 3rd and 5th Saturdays" },
];

function useWorkingDaysPreview(month: Date) {
  const { companyId } = useAuth();
  const from = format(startOfMonth(month), "yyyy-MM-dd");
  const to = format(endOfMonth(month), "yyyy-MM-dd");
  return useQuery({
    queryKey: [...timeKeys.all(companyId), "working-preview", from],
    queryFn: async () => {
      const { data, error } = await db.rpc("working_dates", { p_company: companyId, p_from: from, p_to: to });
      if (error) throw error;
      return (data as string[] | null)?.length ?? 0;
    },
    enabled: !!companyId,
  });
}

export function WorkWeekCard({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useTimeSettings();
  const save = useSaveTimeSettings();
  const [form, setForm] = useState<Form | null>(null);
  const preview = useWorkingDaysPreview(new Date());

  useEffect(() => {
    if (data) {
      setForm({
        weekend_sunday: data.weekend_sunday,
        weekend_saturday: data.weekend_saturday,
        saturday_pattern: data.saturday_pattern,
        saturday_off_from: data.saturday_off_from,
        saturday_off_until: data.saturday_off_until,
      });
    }
  }, [data]);

  if (isLoading || !form || !data) return <CardSkeleton lines={5} />;
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => (form[k] ?? null) !== (data[k] ?? null));
  const rangeError = form.saturday_off_from && form.saturday_off_until && form.saturday_off_until < form.saturday_off_from;

  return (
    <SectionCard
      title="Working week"
      description="Weekends for everyone. A person's own Saturday or Sunday rule on their profile wins over this."
      icon={CalendarCog}
      actions={
        <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {preview.isLoading ? "…" : `${preview.data ?? 0} working days in ${format(new Date(), "MMMM")}`}
        </span>
      }
    >
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span>
            <span className="block text-sm font-semibold">Sunday is off</span>
            <span className="block text-[11px] text-muted-foreground">Sundays are not working days.</span>
          </span>
          <Switch checked={form.weekend_sunday} disabled={!canEdit} onCheckedChange={(c) => set({ weekend_sunday: c })} aria-label="Sunday is off" />
        </label>

        <div className="rounded-xl border border-border p-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">Saturdays off</span>
              <span className="block text-[11px] text-muted-foreground">
                Switching this on starts today unless you pick a start date, so Saturdays already worked stay working days.
              </span>
            </span>
            <Switch checked={form.weekend_saturday} disabled={!canEdit} onCheckedChange={(c) => set({ weekend_saturday: c })} aria-label="Saturdays off" />
          </label>
          {form.weekend_saturday && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Which Saturdays</Label>
                <Select value={form.saturday_pattern} disabled={!canEdit} onValueChange={(v) => set({ saturday_pattern: v as Form["saturday_pattern"] })}>
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PATTERNS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sat-from" className="text-xs">First Saturday off</Label>
                <Input id="sat-from" type="date" disabled={!canEdit} value={form.saturday_off_from ?? ""} onChange={(e) => set({ saturday_off_from: e.target.value || null })} className="h-9 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sat-until" className="text-xs">Last Saturday off</Label>
                <Input id="sat-until" type="date" disabled={!canEdit} value={form.saturday_off_until ?? ""} onChange={(e) => set({ saturday_off_until: e.target.value || null })} className="h-9 rounded-xl" />
              </div>
            </div>
          )}
          {rangeError && <p className="mt-2 text-xs text-destructive">The last Saturday off must be after the first.</p>}
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button className="rounded-xl" disabled={!dirty || !!rangeError || save.isPending} onClick={() => save.mutate(form)}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save working week
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
