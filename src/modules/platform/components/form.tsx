import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Control sizing for platform forms: 40px tall with 16px text on phones (a comfortable
 * hit target, and iOS does not zoom into the field), the compact 36px desktop size from `sm` up.
 */
export const CONTROL = "h-10 rounded-xl text-base sm:h-9 sm:text-sm";
/** Same as CONTROL for multi-line inputs (no fixed height). */
export const CONTROL_AREA = "rounded-xl text-base sm:text-sm";
/** Buttons that sit next to a CONTROL. */
export const CONTROL_BUTTON = "h-10 shrink-0 sm:h-9";

/** Label, control and hint, stacked. */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-semibold leading-5 text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium leading-4 text-destructive [overflow-wrap:anywhere]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One setting in an admin-console layout: the name and an explanation on the left, the
 * control on the right (stacked on phones). Put several in a `SettingsList`.
 */
export function SettingRow({
  id,
  label,
  description,
  hint,
  error,
  required,
  children,
  className,
}: {
  /** The control's id, so clicking the label focuses it. Omit for groups (radios, previews). */
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  /** Small text under the control (e.g. an example). Replaced by `error`. */
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const name = (
    <>
      {label}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden>
          *
        </span>
      )}
    </>
  );
  return (
    <div className={cn("grid gap-2.5 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8", className)}>
      <div className="min-w-0">
        {id ? (
          <Label htmlFor={id} className="text-[13px] font-semibold leading-5 text-foreground">
            {name}
          </Label>
        ) : (
          <p className="text-[13px] font-semibold leading-5 text-foreground">{name}</p>
        )}
        {description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 space-y-1.5">
        {children}
        {error ? (
          <p id={id ? `${id}-error` : undefined} className="text-xs font-medium leading-4 text-destructive [overflow-wrap:anywhere]" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p id={id ? `${id}-hint` : undefined} className="text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Divided list of SettingRow / ToggleRow inside a SectionCard (use `flush` on the card). */
export function SettingsList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border/60 px-4 sm:px-5", className)}>{children}</div>;
}

/** A labelled on/off setting with an explanation, as a row of a SettingsList. */
export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  status,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Optional text next to the switch, e.g. "Required" / "Optional". Defaults to On / Off. */
  status?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-[13px] font-semibold leading-5 text-foreground">
          {label}
        </Label>
        {description && <p className="mt-0.5 max-w-prose text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
        <span className={cn("hidden w-14 text-right text-xs font-medium sm:inline", checked ? "text-foreground" : "text-muted-foreground")} aria-hidden>
          {status ?? (checked ? "On" : "Off")}
        </span>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Save bar for a settings form. Place it as the last child of the tab's container
 * (outside the cards): it floats at the bottom of the screen while there are unsaved
 * changes, so it is reachable from every card of the form, and briefly confirms a save.
 * Ctrl+S (Cmd+S on a Mac) saves while there are changes.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  label = "You have unsaved changes",
  savedLabel = "All changes saved",
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  label?: string;
  savedLabel?: string;
}) {
  const [justSaved, setJustSaved] = useState(false);
  const wasSaving = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Saving finished with nothing left to save: confirm it for a moment.
  useEffect(() => {
    if (wasSaving.current && !saving && !dirty) {
      setJustSaved(true);
      const t = window.setTimeout(() => setJustSaved(false), 2400);
      wasSaving.current = saving;
      return () => window.clearTimeout(t);
    }
    if (dirty) setJustSaved(false);
    wasSaving.current = saving;
  }, [saving, dirty]);

  useEffect(() => {
    if (!dirty || saving) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving]);

  if (!dirty && !saving && !justSaved) return null;

  if (justSaved && !dirty && !saving) {
    return (
      <div className="sticky bottom-3 z-20 flex justify-center sm:bottom-4 sm:justify-end" role="status" aria-live="polite">
        <p className="flex items-center gap-2 rounded-full border border-success/25 bg-card px-4 py-2 text-[13px] font-semibold text-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          {savedLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="sticky bottom-3 z-20 sm:bottom-4" role="region" aria-label="Unsaved changes">
      <div className="flex flex-col gap-2.5 rounded-2xl border border-primary/20 bg-card/95 px-4 py-3 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-bottom-2 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground" aria-live="polite">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", saving ? "animate-pulse bg-primary" : "bg-warning")} aria-hidden />
          {saving ? "Saving…" : label}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <span className="mr-1 hidden text-[11px] text-muted-foreground lg:inline">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">{isMac ? "⌘" : "Ctrl"}</kbd>{" "}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">S</kbd> to save
          </span>
          <Button variant="outline" size="sm" className="h-10 sm:h-9" onClick={onReset} disabled={saving}>
            <RotateCcw /> Discard
          </Button>
          <Button size="sm" className="h-10 sm:h-9" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

export const CURRENCIES: { code: string; name: string }[] = [
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "INR", name: "Indian Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "ZAR", name: "South African Rand" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
];

const COUNTRY_CODES = [
  "PK", "AE", "SA", "QA", "KW", "BH", "OM", "IN", "BD", "LK", "AF", "TR", "EG", "NG", "KE", "ZA", "GB", "IE", "US", "CA",
  "AU", "NZ", "SG", "MY", "ID", "PH", "CN", "JP", "KR", "DE", "FR", "NL", "BE", "ES", "IT", "PT", "CH", "AT", "SE", "NO",
  "DK", "FI", "PL", "BR", "MX", "AR",
];

export function countryOptions(): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = null;
  }
  return COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
}

const FALLBACK_TIMEZONES = [
  "UTC", "Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kolkata", "Asia/Dhaka", "Asia/Singapore",
  "Asia/Kuala_Lumpur", "Asia/Shanghai", "Asia/Tokyo", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Istanbul",
  "Africa/Cairo", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo", "Australia/Sydney", "Pacific/Auckland",
];

export function timezoneOptions(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.("timeZone");
    if (all && all.length) return all.includes("UTC") ? all : ["UTC", ...all];
  } catch {
    /* older browser */
  }
  return FALLBACK_TIMEZONES;
}
