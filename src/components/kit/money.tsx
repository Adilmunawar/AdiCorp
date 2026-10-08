import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

/** The signed-in staff member's company (from AuthContext). */
export function useCompany() {
  const { company, companyId, loading } = useAuth();
  return {
    company,
    companyId,
    currency: (company?.currency || "PKR").toUpperCase(),
    loading,
  };
}

export interface MoneyFormatOptions {
  /** Override the company currency (ISO 4217 code). */
  currency?: string;
  /** Default 0 for whole amounts, up to 2 otherwise. */
  decimals?: number;
  /** 1.2M style. */
  compact?: boolean;
  /** Prefix positive numbers with "+". */
  signed?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, decimals: number | undefined, compact: boolean, fractional: boolean) {
  const key = `${currency}|${decimals}|${compact}|${fractional}`;
  let f = formatterCache.get(key);
  if (!f) {
    const max = decimals ?? (fractional ? 2 : 0);
    try {
      f = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "code",
        notation: compact ? "compact" : "standard",
        minimumFractionDigits: compact ? 0 : Math.min(decimals ?? (fractional ? 2 : 0), max),
        maximumFractionDigits: compact ? 1 : max,
      });
    } catch {
      // Unknown currency code: fall back to a plain number with the code in front.
      f = new Intl.NumberFormat("en-US", { maximumFractionDigits: max, notation: compact ? "compact" : "standard" });
    }
    formatterCache.set(key, f);
  }
  return f;
}

/** Intl inserts no-break (U+00A0) and narrow no-break (U+202F) spaces; plain spaces keep PDFs and CSVs readable. */
const NON_BREAKING_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");

/** Format an amount in `currency` (e.g. "PKR 125,000"). */
export function formatMoney(amount: number | string | null | undefined, currency = "PKR", opts: MoneyFormatOptions = {}): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const code = (opts.currency || currency).toUpperCase();
  const f = getFormatter(code, opts.decimals, !!opts.compact, !Number.isInteger(n));
  let text = f.format(n).replace(NON_BREAKING_SPACES, " ");
  if (!f.resolvedOptions().currency) text = `${code} ${text}`;
  if (opts.signed && n > 0) text = `+${text}`;
  return text;
}

/** Company-currency money formatter. */
export function useMoney() {
  const { currency } = useCompany();
  const format = useCallback((amount: number | string | null | undefined, opts?: MoneyFormatOptions) => formatMoney(amount, currency, opts), [currency]);
  return useMemo(() => ({ currency, format }), [currency, format]);
}

export interface MoneyProps extends MoneyFormatOptions {
  amount: number | string | null | undefined;
  className?: string;
  /** Colour negatives red and positives green. */
  tone?: boolean;
}

/** Inline money amount in the company currency, tabular numerals. */
export function Money({ amount, className, tone, ...opts }: MoneyProps) {
  const { format } = useMoney();
  const n = typeof amount === "string" ? Number(amount) : amount;
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        tone && typeof n === "number" && n < 0 && "text-destructive",
        tone && typeof n === "number" && n > 0 && "text-success",
        className,
      )}
    >
      {format(amount, opts)}
    </span>
  );
}
