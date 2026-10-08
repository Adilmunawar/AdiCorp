import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Calculator, Loader2, Percent, Plus, RotateCcw, Save, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageSkeleton, SectionCard, formatDateTime, formatPercent, formatRelative, useMoney } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage, usePayRules, useSaveRules } from "../lib/api";
import { MAX_MULTIPLIER, MAX_SLABS, breakdown, parseAmount, suggestedHourlyRate } from "../lib/calc";
import type { PayRules } from "../lib/types";
import { Notice, Row } from "../components/bits";
import { groupDigits } from "../components/useWidth";

interface SlabForm {
  key: number;
  from: string;
  fixed: string;
  rate: string;
}

interface RulesForm {
  basic_percent: string;
  medical_exempt_percent: string;
  label: string;
  slabs: SlabForm[];
  basis: "gross" | "basic";
  days: string;
  hours: string;
  regular: string;
  weekend: string;
  holiday: string;
}

let slabKey = 0;

function toForm(r: PayRules): RulesForm {
  return {
    basic_percent: String(r.basic_percent),
    medical_exempt_percent: String(r.medical_exempt_percent),
    label: r.label ?? "",
    slabs: r.slabs.map((s) => ({ key: ++slabKey, from: groupDigits(String(s.from)), fixed: groupDigits(String(s.fixed)), rate: String(s.rate) })),
    basis: r.overtime.basis,
    days: String(r.overtime.days_per_month),
    hours: String(r.overtime.hours_per_day),
    regular: String(r.overtime.multipliers.regular),
    weekend: String(r.overtime.multipliers.weekend),
    holiday: String(r.overtime.multipliers.holiday),
  };
}

/** The typed form as rules, or the first problem in words (the same checks the server makes). */
function readForm(f: RulesForm): { rules?: PayRules; error?: string } {
  const pct = (raw: string, label: string, min0 = true): number | string => {
    const v = parseAmount(raw);
    if (Number.isNaN(v)) return `${label} must be a number.`;
    if (v < 0) return `${label} cannot be negative.`;
    if (v > 100) return `${label} is a percentage, 100 at most.`;
    if (!min0 && v <= 0) return `${label} must be more than 0%.`;
    return v;
  };
  const basic = pct(f.basic_percent, "Basic share", false);
  if (typeof basic === "string") return { error: basic };
  const medical = pct(f.medical_exempt_percent, "Medical exemption");
  if (typeof medical === "string") return { error: medical };
  if (f.label.length > 80) return { error: "Keep the table name to 80 characters." };
  const slabs = [];
  const seen = new Set<number>();
  for (const [i, s] of f.slabs.entries()) {
    if (!s.from.trim() && !s.fixed.trim() && !s.rate.trim()) continue;
    const from = parseAmount(s.from);
    const fixed = parseAmount(s.fixed);
    const rate = parseAmount(s.rate);
    if (Number.isNaN(from) || from < 0 || from >= 1e10) return { error: `Row ${i + 1}: the yearly income must be 0 or more.` };
    if (Number.isNaN(fixed) || fixed < 0 || fixed >= 1e10) return { error: `Row ${i + 1}: the fixed tax must be 0 or more.` };
    if (Number.isNaN(rate) || rate < 0 || rate > 100) return { error: `Row ${i + 1}: the rate is a percentage between 0 and 100.` };
    if (seen.has(from)) return { error: "Two rows start at the same income. Each row needs its own starting amount." };
    seen.add(from);
    slabs.push({ from, fixed, rate });
  }
  if (!slabs.length) return { error: "The table needs at least one row." };
  const within = (raw: string, label: string, max: number): number | string => {
    const v = parseAmount(raw);
    if (Number.isNaN(v) || !(v > 0 && v <= max)) return `${label} must be more than 0 and at most ${max}.`;
    return v;
  };
  const days = within(f.days, "Days a month", 31);
  const hours = within(f.hours, "Hours a day", 24);
  const regular = within(f.regular, "The working-day multiplier", MAX_MULTIPLIER);
  const weekend = within(f.weekend, "The weekend multiplier", MAX_MULTIPLIER);
  const holiday = within(f.holiday, "The holiday multiplier", MAX_MULTIPLIER);
  for (const v of [days, hours, regular, weekend, holiday]) if (typeof v === "string") return { error: v };
  return {
    rules: {
      basic_percent: basic,
      medical_exempt_percent: medical,
      label: f.label.trim(),
      slabs: slabs.sort((a, b) => a.from - b.from),
      overtime: { basis: f.basis, days_per_month: days as number, hours_per_day: hours as number, multipliers: { regular: regular as number, weekend: weekend as number, holiday: holiday as number } },
    },
  };
}

export default function TaxStructurePage() {
  const q = usePayRules();
  const save = useSaveRules();
  const { format } = useMoney();
  const [form, setForm] = useState<RulesForm | null>(null);
  const [baseline, setBaseline] = useState("");
  const [trial, setTrial] = useState("150,000");

  useEffect(() => {
    if (q.data?.rules) {
      const f = toForm(q.data.rules);
      setForm(f);
      setBaseline(JSON.stringify(readForm(f).rules));
    }
  }, [q.data]);

  const parsed = useMemo(() => (form ? readForm(form) : {}), [form]);
  const dirty = !!parsed.rules && JSON.stringify(parsed.rules) !== baseline;
  const unsaved = dirty || !!parsed.error;
  const preview = useMemo(() => {
    const s = parseAmount(trial);
    if (!parsed.rules || Number.isNaN(s) || s <= 0) return null;
    return { b: breakdown(s, parsed.rules), rate: suggestedHourlyRate(s, parsed.rules) };
  }, [parsed.rules, trial]);

  if (q.isError && !form) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader eyebrow="Pay" title="Tax & structure" icon={Percent} description="Salary split, the yearly income tax table and suggested overtime rates." />
        <Notice tone="danger">
          {errorMessage(q.error)}{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => q.refetch()}>
            Try again
          </button>
        </Notice>
      </div>
    );
  }
  if (q.isLoading || !form) return <PageSkeleton />;

  const set = <K extends keyof RulesForm>(k: K, v: RulesForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setSlab = (key: number, patch: Partial<SlabForm>) => set("slabs", form.slabs.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const tidySlab = (key: number, k: "from" | "fixed") => set("slabs", form.slabs.map((s) => (s.key === key ? { ...s, [k]: groupDigits(s[k]) } : s)));

  const onSave = async () => {
    if (!parsed.rules) return;
    try {
      await save.mutateAsync(parsed.rules);
      toast.success("Saved. New drafts and overtime suggestions use these figures.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  /** Each row in plain words, from the figures as typed. */
  const meaning = (s: SlabForm): string | null => {
    if (!s.from.trim() && !s.fixed.trim() && !s.rate.trim()) return null;
    const from = parseAmount(s.from);
    const fixed = parseAmount(s.fixed);
    const rate = parseAmount(s.rate);
    if ([from, fixed, rate].some((v) => Number.isNaN(v))) return null;
    const starts = form.slabs.map((x) => parseAmount(x.from)).filter((v) => !Number.isNaN(v) && v > from);
    const next = starts.length ? Math.min(...starts) : null;
    const range = next !== null ? `${format(from)} to ${format(next)} a year` : `Above ${format(from)} a year`;
    if (!fixed && !rate) return `${range}: no tax`;
    const parts = [fixed ? format(fixed) : null, rate ? `${rate}% of the income above ${format(from)}` : null].filter(Boolean);
    return `${range}: ${parts.join(" + ")}`;
  };

  const saveButton = (cls: string) => (
    <Button size="sm" className={cls} disabled={!dirty || !!parsed.error || save.isPending} onClick={onSave}>
      {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" aria-hidden />}
      Save changes
    </Button>
  );

  return (
    <div className={cn("mx-auto w-full max-w-6xl pb-6", unsaved && "pb-24 sm:pb-6")}>
      <PageHeader
        eyebrow="Pay"
        title="Tax & structure"
        icon={Percent}
        description="Salary split, the yearly income tax table and suggested overtime rates."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-10 rounded-xl sm:h-9" onClick={() => q.data && setForm(toForm(q.data.defaults))}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset to defaults
            </Button>
            {saveButton("hidden h-9 rounded-xl sm:inline-flex")}
          </>
        }
      />

      {!q.data?.saved && (
        <Notice tone="info" className="mb-4">
          These are the default figures{q.data?.currency ? ` for ${q.data.currency} payrolls` : ""}. Check them against your tax rules, then save.
        </Notice>
      )}
      {q.data?.saved && q.data.updated_at && (
        <p className="mb-3 text-xs text-muted-foreground">
          Last saved{" "}
          <time dateTime={q.data.updated_at} title={formatDateTime(q.data.updated_at)}>
            {formatRelative(q.data.updated_at)}
          </time>
          {q.data.updated_by_name ? ` by ${q.data.updated_by_name}` : ""}.{dirty ? <span className="font-semibold text-warning"> You have unsaved changes.</span> : null}
        </p>
      )}
      {parsed.error && (
        <Notice tone="danger" className="mb-4">
          {parsed.error}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="Salary structure" description="How a salary splits into basic and allowances on the payslip.">
            <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
              <Field id="basic" label="Basic share" unit="%" value={form.basic_percent} onChange={(v) => set("basic_percent", v)} hint="Of the monthly salary. The rest shows as allowances." />
              <Field id="medical" label="Medical exemption" unit="%" value={form.medical_exempt_percent} onChange={(v) => set("medical_exempt_percent", v)} hint="Of basic pay, taken off the salary before tax." />
            </div>
          </SectionCard>

          <SectionCard
            title="Income tax table"
            description="Yearly slabs. Income above a row's start pays its fixed tax plus its rate on the amount above the start."
            actions={
              <Button variant="outline" size="sm" className="h-9 rounded-xl" disabled={form.slabs.length >= MAX_SLABS} onClick={() => set("slabs", [...form.slabs, { key: ++slabKey, from: "", fixed: "", rate: "" }])}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add row
              </Button>
            }
          >
            <div className="mb-4 space-y-1.5">
              <Label htmlFor="label" className="micro-label">
                Table name
              </Label>
              <Input id="label" maxLength={90} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Tax year 2026-27, salaried" className="h-10 rounded-xl sm:h-9" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_76px_40px] gap-2 px-0.5 pb-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px_40px]" aria-hidden>
              <span className="micro-label truncate text-right">
                <span className="sm:hidden">Income above</span>
                <span className="hidden sm:inline">Yearly income above</span>
              </span>
              <span className="micro-label truncate text-right">Fixed tax</span>
              <span className="micro-label truncate text-right">Rate</span>
              <span />
            </div>
            <ol className="space-y-2.5">
              {form.slabs.map((s, i) => {
                const words = meaning(s);
                return (
                  <li key={s.key}>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_76px_40px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px_40px]">
                      <UnitInput aria-label={`Row ${i + 1}: yearly income above`} value={s.from} onChange={(v) => setSlab(s.key, { from: v })} onBlur={() => tidySlab(s.key, "from")} />
                      <UnitInput aria-label={`Row ${i + 1}: fixed tax`} value={s.fixed} onChange={(v) => setSlab(s.key, { fixed: v })} onBlur={() => tidySlab(s.key, "fixed")} />
                      <UnitInput aria-label={`Row ${i + 1}: rate on the amount above, percent`} unit="%" value={s.rate} onChange={(v) => setSlab(s.key, { rate: v })} />
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-muted-foreground hover:text-destructive" aria-label={`Remove row ${i + 1}`} disabled={form.slabs.length <= 1} onClick={() => set("slabs", form.slabs.filter((x) => x.key !== s.key))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {words && <p className="tabular mt-1 px-0.5 text-[11px] leading-4 text-muted-foreground">{words}</p>}
                  </li>
                );
              })}
            </ol>
          </SectionCard>

          <SectionCard title="Overtime rates" icon={Timer} description="Suggested rates only. Finance can change the price of each entry.">
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="ot-basis" className="micro-label block truncate">
                  Hourly rate from
                </Label>
                <Select value={form.basis} onValueChange={(v) => set("basis", v as "gross" | "basic")}>
                  <SelectTrigger id="ot-basis" className="h-10 rounded-xl sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gross">Gross salary</SelectItem>
                    <SelectItem value="basic">Basic pay only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field id="days" label="Days a month" unit="days" value={form.days} onChange={(v) => set("days", v)} />
              <Field id="hours" label="Hours a day" unit="h" value={form.hours} onChange={(v) => set("hours", v)} />
              <Field id="regular" label="Working day" unit="×" value={form.regular} onChange={(v) => set("regular", v)} />
              <Field id="weekend" label="Weekend" unit="×" value={form.weekend} onChange={(v) => set("weekend", v)} />
              <Field id="holiday" label="Holiday" unit="×" value={form.holiday} onChange={(v) => set("holiday", v)} />
            </div>
            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
              Hourly rate = {form.basis === "basic" ? "basic pay" : "monthly salary"} ÷ days a month ÷ hours a day. Each hour pays that rate times the multiplier for its kind of day.
            </p>
          </SectionCard>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <SectionCard title="Try a salary" icon={Calculator} description="Uses the figures as typed, before saving.">
            <Label htmlFor="trial" className="micro-label">
              Monthly salary
            </Label>
            <div className="mt-1.5">
              <UnitInput id="trial" value={trial} onChange={setTrial} onBlur={() => setTrial(groupDigits(trial))} />
            </div>
            {preview ? (
              <div className="mt-3">
                <Row label="Basic" value={format(preview.b.basic)} />
                <Row label="Allowances" value={format(preview.b.allowances)} />
                <Row muted label="Medical exempt" value={format(preview.b.medical_exempt)} />
                <Row label="Taxable a month" value={format(preview.b.taxable)} />
                <Row muted label="Tax a year" value={format(preview.b.yearly_tax)} />
                <div className="mt-1 flex items-baseline justify-between rounded-lg bg-primary/[0.06] px-3 py-2">
                  <span className="micro-label !text-primary">Tax a month</span>
                  <span className="tabular font-bold text-primary">{format(preview.b.monthly_tax)}</span>
                </div>
                <Row className="mt-2" label="Effective tax rate" value={formatPercent(preview.b.gross ? preview.b.monthly_tax / preview.b.gross : 0)} />
                <Row label="Take-home before other items" value={format(preview.b.gross - preview.b.monthly_tax)} strong />
                <Row className="border-t border-border/60" label="Overtime rate an hour" value={format(preview.rate)} />
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Before other allowances, overtime and other deductions. Monthly tax is the yearly figure divided by twelve, rounded.</p>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-muted-foreground">Type a salary to see the split and the tax.</p>
            )}
          </SectionCard>
        </aside>
      </div>

      {unsaved && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur pb-safe sm:hidden">
          <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">{parsed.error ? "Fix the figures to save" : "Unsaved changes"}</p>
          {saveButton("h-10 shrink-0 rounded-xl")}
        </div>
      )}
    </div>
  );
}

/** A right-aligned figure with its unit (the currency by default) inside the field. */
function UnitInput({ unit, onChange, className, ...props }: Omit<ComponentProps<typeof Input>, "onChange"> & { unit?: string; onChange: (v: string) => void }) {
  const { currency } = useMoney();
  const u = unit ?? currency;
  // The currency leads the figure; other units (%, h, days, x) follow it.
  const prefix = unit === undefined;
  return (
    <div className="relative">
      <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground", prefix ? "left-2.5" : "right-3")} aria-hidden>
        {u}
      </span>
      <Input inputMode="decimal" {...props} onChange={(e) => onChange(e.target.value)} className={cn("tabular h-10 rounded-xl text-right sm:h-9", prefix ? "pl-11" : u.length > 1 ? "pr-12" : "pr-7", className)} />
    </div>
  );
}

function Field({ id, label, value, onChange, hint, unit }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; unit?: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="micro-label block truncate">
        {label}
      </Label>
      <UnitInput id={id} unit={unit} value={value} onChange={onChange} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && (
        <p id={`${id}-hint`} className="text-[11px] leading-4 text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
