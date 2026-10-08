import { useEffect, useId, useRef, type ReactNode } from "react";
import { BookOpen, CreditCard, FileText, MoreHorizontal, Package, Paperclip, Plane, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/kit";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FILE_ACCEPT, STATUS_LABELS, STATUS_TONES, stageLine, type ExpenseCategory, type ExpenseRow, type ExpenseStatus } from "../kinds";

export const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  course: BookOpen,
  subscription: CreditCard,
  equipment: Package,
  travel: Plane,
  other: MoreHorizontal,
};

export function ExpenseStatusBadge({ status, className }: { status: ExpenseStatus; className?: string }) {
  return <StatusBadge status={status} label={STATUS_LABELS[status]} tone={STATUS_TONES[status]} className={className} />;
}

const STAGE_TONE = {
  muted: "text-muted-foreground",
  warning: "text-warning",
  primary: "text-primary",
  danger: "text-destructive",
  success: "text-success",
} as const;

/** Where an item stands, in a few words. `today` is the company's day (the browser's when left out). */
export function Stage({ x, today, className }: { x: ExpenseRow; today?: string; className?: string }) {
  const s = stageLine(x, today);
  return <span className={cn("text-[11px] font-medium leading-4 [overflow-wrap:anywhere]", STAGE_TONE[s.tone], className)}>{s.text}</span>;
}

export function CategoryIcon({ category, className }: { category: ExpenseCategory; className?: string }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary", className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

/** A quoted reason ("what they will do with it", "how it helps"). */
export function Quote({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <p className="micro-label">{label}</p>
      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-foreground/90 [overflow-wrap:anywhere]">{text}</p>
    </div>
  );
}

/** Label + hint row used by every field in this module. */
export function FieldLabel({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
      <Label htmlFor={htmlFor} className="text-xs font-semibold">
        {children}
      </Label>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Small key/value list for the details card. */
export function Facts({ items }: { items: Array<{ label: string; value: ReactNode } | null | false> }) {
  const rows = items.filter((i): i is { label: string; value: ReactNode } => !!i && i.value !== "" && i.value !== null && i.value !== undefined);
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="min-w-0">
          <dt className="micro-label">{r.label}</dt>
          <dd className="mt-0.5 text-[13px] text-foreground [overflow-wrap:anywhere]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A file input that shows the chosen file and can clear it. */
export function FilePicker({
  label,
  hint = "optional · PDF, image or Word, 8 MB",
  file,
  onChange,
  accept = FILE_ACCEPT,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  // Cleared by the form (after a save): empty the input too, so the same file can be picked again.
  useEffect(() => {
    if (!file && ref.current) ref.current.value = "";
  }, [file]);
  return (
    <div>
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      {file ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{file.name}</span>
          <span className="tabular shrink-0 text-[11px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (ref.current) ref.current.value = "";
            }}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${file.name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-within:ring-2 focus-within:ring-ring"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          <span>Choose a file</span>
        </label>
      )}
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

/** A plain-text error line under a form. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
      {children}
    </p>
  );
}
