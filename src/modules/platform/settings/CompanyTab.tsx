import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Copy, ExternalLink, Globe2, ImagePlus, Loader2, MapPin, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton, ConfirmDialog, SectionCard, formatMoney, humanize, initials } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useUpdateCompany, type CompanyPatch } from "../api";
import { CONTROL, CONTROL_AREA, CONTROL_BUTTON, CURRENCIES, SaveBar, SettingRow, SettingsList, countryOptions, timezoneOptions } from "../components/form";
import { useReportDirty } from "../components/unsaved";

interface CompanyForm {
  name: string;
  legal_name: string;
  slug: string;
  currency: string;
  phone: string;
  website: string;
  address: string;
  logo: string;
  tax_id: string;
  country: string;
  timezone: string;
  company_size: string;
  company_type: string;
}

const SIZES: { value: string; label: string }[] = [
  { value: "1-10", label: "1–10 people" },
  { value: "11-50", label: "11–50 people" },
  { value: "51-200", label: "51–200 people" },
  { value: "201-500", label: "201–500 people" },
  // "500+" (the company setup form's top size) still shows for companies that chose it, via `sizes` below.
  { value: "501-1000", label: "501–1,000 people" },
  { value: "1000+", label: "1,000+ people" },
];

/* Same keys as the company setup form, plus a few more for international customers. */
const INDUSTRIES: { value: string; label: string }[] = [
  { value: "technology", label: "Technology & IT" },
  { value: "professional_services", label: "Professional services" },
  { value: "finance", label: "Finance & banking" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "retail", label: "Retail & e-commerce" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "construction", label: "Construction & real estate" },
  { value: "logistics", label: "Logistics & transport" },
  { value: "hospitality", label: "Hospitality & travel" },
  { value: "media", label: "Media & marketing" },
  { value: "agriculture", label: "Agriculture & food" },
  { value: "energy", label: "Energy & utilities" },
  { value: "nonprofit", label: "Non-profit" },
  { value: "government", label: "Government & public sector" },
  { value: "other", label: "Other" },
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const WEBSITE_RE = /^https?:\/\/[^\s/$.?#]+\.[^\s]{2,}$/i;

type CompanyRecord = Record<string, unknown> | null;

function fromCompany(c: CompanyRecord): CompanyForm {
  const s = (k: string) => (typeof c?.[k] === "string" ? (c[k] as string) : "");
  return {
    name: s("name"),
    legal_name: s("legal_name"),
    slug: s("slug"),
    currency: (s("currency") || "PKR").toUpperCase(),
    phone: s("phone"),
    website: s("website"),
    address: s("address"),
    logo: s("logo"),
    tax_id: s("tax_id"),
    country: s("country"),
    timezone: s("timezone") || "UTC",
    company_size: s("company_size"),
    company_type: s("company_type"),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** "GMT+5" style offset of a timezone right now, or "" when the browser cannot tell. */
function tzOffset(tz: string, at: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName");
    return part?.value === "GMT" ? "GMT+0" : part?.value ?? "";
  } catch {
    return "";
  }
}

function copyText(text: string, label: string) {
  if (!navigator.clipboard) {
    toast.error("Copying is not available in this browser");
    return;
  }
  void navigator.clipboard.writeText(text).then(
    () => toast.success(label),
    () => toast.error("Could not copy"),
  );
}

export function CompanyTab() {
  const { company, companyId } = useAuth();
  const initial = useMemo(() => fromCompany(company as unknown as CompanyRecord), [company]);
  const [form, setForm] = useState<CompanyForm>(initial);
  const [uploading, setUploading] = useState(false);
  const [confirmCurrency, setConfirmCurrency] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const update = useUpdateCompany();
  const countries = useMemo(countryOptions, []);
  const timezones = useMemo(() => {
    const now = new Date();
    return timezoneOptions().map((tz) => ({ tz, offset: tzOffset(tz, now) }));
  }, []);

  // When the saved company changes (a save, or a logo upload while other fields are being edited),
  // take the new values but keep the fields the person has changed and not saved yet.
  const previous = useRef(initial);
  useEffect(() => {
    const before = previous.current;
    previous.current = initial;
    if (before === initial) return;
    setForm((f) => {
      const next = { ...initial };
      (Object.keys(f) as (keyof CompanyForm)[]).forEach((k) => {
        if (f[k] !== before[k]) next[k] = f[k];
      });
      return next;
    });
  }, [initial]);

  const set = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const patch = useMemo(() => {
    const out: CompanyPatch = {};
    (Object.keys(form) as (keyof CompanyForm)[]).forEach((k) => {
      if (form[k].trim() !== initial[k].trim()) (out as Record<string, string | null>)[k] = form[k].trim() || null;
    });
    if (out.name === null) out.name = "";
    return out;
  }, [form, initial]);
  const dirty = Object.keys(patch).length > 0;
  useReportDirty(dirty);

  const errors = {
    name: form.name.trim().length < 2 ? "Enter the company name (at least 2 characters)." : null,
    slug:
      form.slug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) || form.slug.length < 2 || form.slug.length > 60)
        ? "Use 2–60 lowercase letters, digits and single hyphens."
        : null,
    website: form.website.trim() && !WEBSITE_RE.test(form.website.trim()) ? "Enter a full address, for example https://example.com." : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  // Show a problem as soon as the field changed, or after a save attempt.
  const errorFor = (k: keyof typeof errors) => (showErrors || form[k] !== initial[k] ? errors[k] : null);

  const save = async () => {
    try {
      await update.mutateAsync(patch);
      setShowErrors(false);
      toast.success("Company profile saved");
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  };

  const onSave = () => {
    if (hasErrors) {
      setShowErrors(true);
      toast.error("Check the highlighted fields");
      return;
    }
    if (patch.currency) setConfirmCurrency(true);
    else void save().catch(() => undefined);
  };

  const uploadLogo = async (file: File) => {
    if (!companyId) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPG or WebP image");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("The logo must be 2 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${companyId}/company/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await update.mutateAsync({ logo: data.publicUrl });
      toast.success("Logo updated");
    } catch (e) {
      toast.error("Could not upload the logo", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const savedSlug = initial.slug;
  const careersBase = `${window.location.origin}/careers/`;
  const careersUrl = savedSlug ? `${careersBase}${savedSlug}` : null;
  const industries = form.company_type && !INDUSTRIES.some((i) => i.value === form.company_type) ? [{ value: form.company_type, label: humanize(form.company_type) }, ...INDUSTRIES] : INDUSTRIES;
  const sizes = form.company_size && !SIZES.some((s) => s.value === form.company_size) ? [{ value: form.company_size, label: `${form.company_size} people` }, ...SIZES] : SIZES;
  const zoneList = timezones.some((z) => z.tz === form.timezone) ? timezones : [{ tz: form.timezone, offset: tzOffset(form.timezone, new Date()) }, ...timezones];
  const currencies = CURRENCIES.some((c) => c.code === form.currency) ? CURRENCIES : [{ code: form.currency, name: form.currency }, ...CURRENCIES];

  return (
    <div className="space-y-4">
      <SectionCard title="Brand" description="How your company appears to employees and on documents" icon={Building2} flush>
        <SettingsList>
          <SettingRow label="Logo" description="Shown on payslips, letters, exports and the employee portal. PNG, JPG or WebP up to 2 MB; a square image works best.">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40">
                {initial.logo ? (
                  <img src={initial.logo} alt={`${initial.name} logo`} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">{initials(initial.name)}</span>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={LOGO_TYPES.join(",")}
                  className="sr-only"
                  id="company-logo"
                  aria-label="Choose a logo image"
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadLogo(f);
                  }}
                />
                <Button variant="outline" size="sm" className={CONTROL_BUTTON} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} {initial.logo ? "Replace logo" : "Upload logo"}
                </Button>
                {initial.logo && (
                  <ConfirmButton
                    variant="ghost"
                    size="sm"
                    className={cn(CONTROL_BUTTON, "text-destructive hover:text-destructive")}
                    disabled={uploading || update.isPending}
                    title="Remove the company logo?"
                    description="Payslips, letters and the portal will show your initials instead."
                    confirmLabel="Remove logo"
                    onConfirm={() =>
                      update
                        .mutateAsync({ logo: null })
                        .then(() => toast.success("Logo removed"))
                        .catch((e: Error) => {
                          toast.error("Could not remove the logo", { description: e.message });
                          throw e;
                        })
                    }
                  >
                    <Trash2 /> Remove
                  </ConfirmButton>
                )}
              </div>
            </div>
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <SectionCard title="Company details" description="Your legal identity, printed on letters and payslips" icon={Building2} flush>
        <SettingsList>
          <SettingRow id="co-name" label="Company name" description="The name people know you by." required error={errorFor("name")}>
            <Input
              id="co-name"
              value={form.name}
              maxLength={120}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errorFor("name")}
              aria-describedby={errorFor("name") ? "co-name-error" : undefined}
              className={CONTROL}
            />
          </SettingRow>
          <SettingRow id="co-legal" label="Legal name" description="As registered, if different. Used on letters.">
            <Input id="co-legal" value={form.legal_name} maxLength={160} onChange={(e) => set("legal_name", e.target.value)} className={CONTROL} />
          </SettingRow>
          <SettingRow id="co-tax" label="Tax ID" description="NTN, VAT or EIN. Printed on letters only when set.">
            <Input id="co-tax" value={form.tax_id} maxLength={40} onChange={(e) => set("tax_id", e.target.value)} className={CONTROL} />
          </SettingRow>
          <SettingRow id="co-type" label="Industry" description="What your company does.">
            <Select value={form.company_type || undefined} onValueChange={(v) => set("company_type", v)}>
              <SelectTrigger id="co-type" className={CONTROL}>
                <SelectValue placeholder="Choose an industry" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {industries.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow id="co-size" label="Company size" description="Roughly how many people work for you.">
            <Select value={form.company_size || undefined} onValueChange={(v) => set("company_size", v)}>
              <SelectTrigger id="co-size" className={CONTROL}>
                <SelectValue placeholder="Choose a size" />
              </SelectTrigger>
              <SelectContent>
                {sizes.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <SectionCard title="Contact" description="How people reach your office" icon={MapPin} flush>
        <SettingsList>
          <SettingRow id="co-phone" label="Phone" description="Main office number, with the country code.">
            <Input id="co-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} maxLength={40} onChange={(e) => set("phone", e.target.value)} placeholder="+92 42 1234567" className={CONTROL} />
          </SettingRow>
          <SettingRow id="co-web" label="Website" error={errorFor("website")}>
            <Input
              id="co-web"
              type="url"
              inputMode="url"
              value={form.website}
              maxLength={200}
              onChange={(e) => set("website", e.target.value)}
              onBlur={() => {
                const v = form.website.trim();
                if (v && !/^https?:\/\//i.test(v) && /\.[a-z]{2,}/i.test(v)) set("website", `https://${v}`);
              }}
              placeholder="https://example.com"
              aria-invalid={!!errorFor("website")}
              aria-describedby={errorFor("website") ? "co-web-error" : undefined}
              className={CONTROL}
            />
          </SettingRow>
          <SettingRow id="co-address" label="Address" description="Registered or head-office address.">
            <Textarea id="co-address" value={form.address} maxLength={400} rows={3} onChange={(e) => set("address", e.target.value)} className={cn(CONTROL_AREA, "resize-none")} />
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <SectionCard title="Careers page" description="Your public job board, where candidates apply" icon={Globe2} flush>
        <SettingsList>
          <SettingRow
            id="co-slug"
            label="Web address"
            description="A short name for your public pages. Changing it breaks links you have already shared."
            error={errorFor("slug")}
            hint={careersUrl && form.slug === savedSlug ? <span className="break-all font-mono">{careersUrl}</span> : form.slug ? <span className="break-all font-mono">{`${careersBase}${form.slug}`}</span> : undefined}
          >
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                <span className="hidden shrink-0 items-center border-r border-input bg-muted/60 px-3 font-mono text-xs text-muted-foreground sm:flex">/careers/</span>
                <Input
                  id="co-slug"
                  value={form.slug}
                  maxLength={60}
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  aria-invalid={!!errorFor("slug")}
                  aria-describedby={errorFor("slug") ? "co-slug-error" : "co-slug-hint"}
                  className={cn(CONTROL, "min-w-0 rounded-none border-0 font-mono focus-visible:ring-0 focus-visible:ring-offset-0")}
                  placeholder="your-company"
                />
              </div>
              {!form.slug && form.name.trim().length >= 2 ? (
                <Button type="button" variant="outline" size="sm" className={CONTROL_BUTTON} onClick={() => set("slug", slugify(form.name))}>
                  Suggest
                </Button>
              ) : careersUrl && form.slug === savedSlug ? (
                <>
                  <Button type="button" variant="outline" size="sm" className={cn(CONTROL_BUTTON, "w-10 px-0 sm:w-9")} aria-label="Copy careers page link" title="Copy link" onClick={() => copyText(careersUrl, "Careers link copied")}>
                    <Copy />
                  </Button>
                  <Button asChild variant="outline" size="sm" className={cn(CONTROL_BUTTON, "w-10 px-0 sm:w-9")}>
                    <a href={careersUrl} target="_blank" rel="noreferrer" aria-label="Open the careers page in a new tab" title="Open careers page">
                      <ExternalLink />
                    </a>
                  </Button>
                </>
              ) : null}
            </div>
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <SectionCard title="Region and money" description="Dates follow the timezone; amounts use the currency" icon={Wallet} flush>
        <SettingsList>
          <SettingRow id="co-country" label="Country" description="Where the company is registered.">
            <Select value={form.country || undefined} onValueChange={(v) => set("country", v)}>
              <SelectTrigger id="co-country" className={CONTROL}>
                <SelectValue placeholder="Choose a country" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow id="co-tz" label="Timezone" description="Decides when 'today' starts for attendance, leave and dashboards.">
            <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger id="co-tz" className={CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zoneList.map(({ tz, offset }) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                    {offset ? ` (${offset})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow id="co-currency" label="Currency" description="Used for salaries, payslips and expenses." hint={`Amounts look like ${formatMoney(125000, form.currency)}.`}>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger id="co-currency" className={CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <SaveBar dirty={dirty} saving={update.isPending && !uploading} onSave={onSave} onReset={() => setForm(initial)} />

      <ConfirmDialog
        open={confirmCurrency}
        onOpenChange={setConfirmCurrency}
        title={`Change the currency to ${form.currency}?`}
        description="Salaries, payslips and expenses already recorded keep their numbers; they are not converted. Only the currency label changes everywhere."
        confirmLabel="Change currency"
        destructive={false}
        onConfirm={save}
      />
    </div>
  );
}
