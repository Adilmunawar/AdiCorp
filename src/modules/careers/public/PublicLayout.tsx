import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Globe } from "lucide-react";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { initials } from "@/components/kit";
import type { PublicCompany } from "../lib/model";

export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function CompanyMark({ company, size = "md" }: { company: Pick<PublicCompany, "name" | "logo">; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl text-base" : "h-9 w-9 rounded-xl text-xs";
  return company.logo ? (
    <img src={company.logo} alt={`${company.name} logo`} className={`${box} shrink-0 border border-border bg-card object-contain p-1`} />
  ) : (
    <div className={`${box} flex shrink-0 items-center justify-center bg-primary font-bold text-primary-foreground`} aria-hidden>
      {initials(company.name)}
    </div>
  );
}

/** Content column widths. The header and footer follow the page's column so every edge lines up. */
const COLUMN = { narrow: "max-w-4xl", wide: "max-w-6xl" } as const;

/** Normalises a stored website ("nexus.pk", "https://Nexus.pk") to an absolute URL, or null. */
export function websiteUrl(website: string | null | undefined): string | null {
  const w = website?.trim();
  if (!w) return null;
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

/** Public shell for /careers pages: company header, content, "Powered by" footer. No auth. */
export function PublicLayout({
  company,
  loading,
  width = "wide",
  children,
}: {
  company?: PublicCompany | null;
  loading?: boolean;
  /** Match the page's content column: the roles list is narrow, a role page is wide. */
  width?: keyof typeof COLUMN;
  children: ReactNode;
}) {
  const website = websiteUrl(company?.website);
  const column = COLUMN[width];
  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className={`mx-auto flex h-14 ${column} items-center justify-between gap-3 px-4 sm:px-6`}>
          {company ? (
            <Link to={`/careers/${company.slug}`} className="flex min-w-0 items-center gap-2.5">
              <CompanyMark company={company} />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold leading-tight">{company.name}</p>
                <p className="micro-label text-primary">Careers</p>
              </div>
            </Link>
          ) : loading ? (
            <span className="flex items-center gap-2.5" aria-hidden>
              <span className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
              <span className="h-3.5 w-28 animate-pulse rounded bg-muted" />
            </span>
          ) : (
            // No company (the address is wrong or the page failed): keep the bar branded instead of empty.
            <span className="flex min-w-0 items-center gap-2.5">
              <img src={ADICORP_LOGO_PATH} alt="" className="h-8 w-8 shrink-0 object-contain" />
              <span className="min-w-0">
                <span className="block truncate font-display text-sm font-bold leading-tight">AdiCorp HR</span>
                <span className="micro-label block text-primary">Careers</span>
              </span>
            </span>
          )}
          {website && (
            <a href={website} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Globe className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Company website</span>
            </a>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/70">
        <div className={`mx-auto flex ${column} flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6`}>
          <span>© {new Date().getFullYear()} {company?.name ?? "AdiCorp HR"}</span>
          <span className="inline-flex items-center gap-1.5">
            Hiring powered by
            <img src={ADICORP_LOGO_PATH} alt="" className="h-4 w-4 object-contain" />
            <span className="font-semibold text-foreground">AdiCorp HR</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
