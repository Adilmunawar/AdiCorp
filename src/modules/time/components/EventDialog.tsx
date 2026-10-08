import { useEffect, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSaveEvent, type EventInput } from "../api";
import { EVENT_META, EVENT_TYPES } from "../lib";
import type { EventType } from "../types";

export function EventDialog({ value, onClose }: { value: EventInput | null; onClose: () => void }) {
  const save = useSaveEvent();
  const [form, setForm] = useState<EventInput | null>(value);
  const [touchedAffects, setTouchedAffects] = useState(false);

  useEffect(() => {
    setForm(value);
    setTouchedAffects(!!value?.id);
  }, [value]);

  if (!form) return null;
  const set = (patch: Partial<EventInput>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const span = form.end_date ? differenceInCalendarDays(parseISO(form.end_date), parseISO(form.date)) : 0;
  const spanError = form.end_date && (span < 0 ? "The end must be on or after the start" : span > 59 ? "An event can last at most 60 days" : null);
  const valid = form.title.trim().length >= 2 && !!form.date && !spanError;

  const submit = async () => {
    if (!valid) return;
    await save.mutateAsync({ ...form, title: form.title.trim() });
    onClose();
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit().catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit event" : "Add to the calendar"}</DialogTitle>
            <DialogDescription>Holidays and off days remove working days for everyone; an extra working day turns a weekend into a working day.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} placeholder="Eid ul-Fitr" required className="rounded-xl" />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => {
                const type = v as EventType;
                set({ type, ...(touchedAffects ? {} : { affects_attendance: EVENT_META[type].affectsDefault }) });
              }}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{EVENT_META[form.type].help}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ev-date">Starts</Label>
              <Input id="ev-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">Ends (optional)</Label>
              <Input
                id="ev-end"
                type="date"
                value={form.end_date ?? ""}
                min={form.date}
                max={form.date ? format(addDays(parseISO(form.date), 59), "yyyy-MM-dd") : undefined}
                onChange={(e) => set({ end_date: e.target.value || null })}
                className="rounded-xl"
              />
            </div>
          </div>
          {spanError && <p className="text-xs text-destructive">{spanError}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Description</Label>
            <Textarea id="ev-desc" value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} maxLength={1000} rows={2} className="rounded-xl" placeholder="Optional" />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block text-sm font-semibold">Affects attendance</span>
              <span className="block text-[11px] text-muted-foreground">
                {form.type === "holiday" || form.type === "off_day"
                  ? "On: nobody is expected at work and the day is not counted."
                  : form.type === "working_day"
                    ? "Extra working days always override the weekend."
                    : "Shown on the register and the portal calendar."}
              </span>
            </span>
            <Switch
              checked={form.affects_attendance}
              onCheckedChange={(c) => {
                setTouchedAffects(true);
                set({ affects_attendance: c });
              }}
              aria-label="Affects attendance"
            />
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={!valid || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? "Save" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
