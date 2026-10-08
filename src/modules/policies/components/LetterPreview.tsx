import { format } from "date-fns";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { inZone, letterLabel } from "../lib/letters";
import type { LetterheadCompany } from "../lib/pdf";
import { RichText } from "./RichText";

export interface LetterPreviewProps {
  company: LetterheadCompany;
  refNo: string;
  kind: string;
  subject: string;
  body: string;
  issuedAt?: string | null;
  replyBy?: string | null;
  signatoryName: string;
  signatoryTitle: string;
  employeeName: string;
  employeeMeta?: string | null;
  withdrawnAt?: string | null;
  /** Shows "Draft" ribbon (composer). */
  draft?: boolean;
  className?: string;
}

/** A letter date in the company's time zone (today for a draft), like the PDF. */
const day = (iso: string | null | undefined, timeZone?: string | null) => format(inZone(iso || new Date(), timeZone), "dd MMMM yyyy");

/** The letter as it appears on the company letterhead (same layout as the PDF). */
export function LetterPreview(p: LetterPreviewProps) {
  const contact = [p.company.address, p.company.phone, p.company.website].filter(Boolean).join("  ·  ");
  const tz = p.company.timezone;
  return (
    <article className={cn("relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm", p.className)} aria-label="Letter preview">
      {p.draft && (
        <span className="absolute right-3 top-3 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
          Draft
        </span>
      )}
      <header className={cn("flex items-center gap-3 border-b-2 border-primary px-5 pb-4 pt-5 sm:px-8", p.draft && "pr-20 sm:pr-24")}>
        <img
          src={p.company.logo || ADICORP_LOGO_PATH}
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = ADICORP_LOGO_PATH;
          }}
        />
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold text-primary sm:text-lg">{p.company.name || "Company"}</p>
          {contact && <p className="break-words text-[11px] leading-snug text-muted-foreground sm:truncate">{contact}</p>}
        </div>
      </header>
      <div className="space-y-4 px-5 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11.5px] text-muted-foreground">
          <span className="font-mono">Ref: {p.refNo}</span>
          <span>{day(p.issuedAt, tz)}</span>
        </div>
        {p.withdrawnAt && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
            Withdrawn on {day(p.withdrawnAt, tz)}. This letter is kept on record only.
          </p>
        )}
        <div>
          <p className="text-sm font-bold text-foreground">
            {p.employeeName || <span className="font-medium italic text-muted-foreground">Choose an employee</span>}
          </p>
          {p.employeeMeta && <p className="text-[11.5px] text-muted-foreground">{p.employeeMeta}</p>}
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Subject: {p.subject || "—"}</p>
          <p className="micro-label mt-0.5 text-primary">{letterLabel(p.kind)}</p>
        </div>
        <RichText source={p.body} />
        {p.replyBy && <p className="text-[13.5px] font-semibold text-foreground">Please reply by {day(p.replyBy)}.</p>}
        <div className="pt-4">
          <p className="text-sm font-bold text-foreground">{p.signatoryName || "—"}</p>
          <p className="text-xs text-muted-foreground">{p.signatoryTitle || "—"}</p>
          <p className="text-xs text-muted-foreground">{p.company.name}</p>
        </div>
      </div>
    </article>
  );
}
