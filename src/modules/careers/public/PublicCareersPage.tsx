import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Briefcase, Building2, Clock, Globe, MapPin, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { employmentTypeLabel, workplaceLabel, type PublicJobSummary } from "../lib/model";
import { usePublicCareers } from "./publicApi";
import { PublicLayout, usePageTitle, websiteUrl } from "./PublicLayout";

const ALL = "all";

/** /careers/:slug: the company's open roles. Public, no sign-in. */
export default function PublicCareersPage() {
  const { slug } = useParams<{ slug: string }>();
  // isPending (not isLoading) so a paused retry keeps the skeleton instead of flashing "not found".
  const { data, isPending: isLoading, isError, refetch, isRefetching } = usePublicCareers(slug);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState(ALL);
  usePageTitle(data ? `Careers at ${data.name}` : "Careers");

  const teams = useMemo(() => {
    const set = new Set<string>();
    data?.jobs.forEach((j) => j.department && set.add(j.department));
    return Array.from(set).sort();
  }, [data]);

  const jobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.jobs ?? [])
      .filter((j) => team === ALL || j.department === team)
      .filter((j) => !q || [j.title, j.department, j.location, j.summary].some((v) => v?.toLowerCase().includes(q)));
  }, [data, query, team]);

  if (isLoading) {
    return (
      <PublicLayout loading width="narrow">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-10 sm:px-6 sm:py-14">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <div className="space-y-3 pt-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (isError || !data) {
    return (
      <PublicLayout width="narrow">
        <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="font-display text-2xl font-bold">{isError ? "Careers are unavailable" : "Careers page not found"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isError ? "We could not load this page. Try again in a moment." : "Check the link you were given. The company may have changed its careers address."}
          </p>
          {isError && (
            <Button variant="outline" className="mt-5" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? "Trying again…" : "Try again"}
            </Button>
          )}
        </div>
      </PublicLayout>
    );
  }

  const total = data.jobs.length;
  const website = websiteUrl(data.website);

  return (
    <PublicLayout company={data} width="narrow">
      {/* The header already carries the logo and the "Careers" label, so the hero leads with the state. */}
      <section className="border-b border-border/70 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <p className={cn("micro-label", total > 0 ? "text-primary" : "text-muted-foreground")}>
            {total > 0 ? `${total} open ${total === 1 ? "role" : "roles"}` : "Not hiring right now"}
          </p>
          <h1 className="mt-2 max-w-2xl font-display text-2xl font-semibold tracking-tight sm:text-4xl">Join {data.name}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:text-base">
            {total === 0
              ? "There are no open roles at the moment."
              : "Every application is read by the people hiring for the role."}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {total > 0 && (
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search roles or locations" className="h-10 pl-9" aria-label="Search roles" />
            </div>
            {teams.length > 1 && (
              // Phones: the chip row bleeds to the screen edge so a half-shown chip reads as "scroll for more".
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 hide-scrollbar sm:mx-0 sm:px-0" role="group" aria-label="Filter by team">
                {[ALL, ...teams].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTeam(t)}
                    aria-pressed={team === t}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      team === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t === ALL ? "All teams" : t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {total === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Briefcase className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-4 font-display text-lg font-semibold">Check back soon</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">New roles appear on this page the moment they are posted.</p>
            {website && (
              <Button asChild variant="outline" size="sm" className="mt-5">
                <a href={website} target="_blank" rel="noreferrer noopener">
                  <Globe className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Visit {data.name}
                </a>
              </Button>
            )}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <SearchX className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">No roles match your search.</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                setQuery("");
                setTeam(ALL);
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard job={job} companySlug={data.slug} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PublicLayout>
  );
}

function JobCard({ job, companySlug }: { job: PublicJobSummary; companySlug: string }) {
  return (
    <Link
      to={`/careers/${companySlug}/${job.slug}`}
      className="group block rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {job.department && <p className="micro-label text-primary">{job.department}</p>}
          <h2 className="mt-0.5 font-display text-lg font-bold leading-snug group-hover:text-primary">{job.title}</h2>
          {job.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{job.summary}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {job.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {job.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" aria-hidden /> {employmentTypeLabel(job.employment_type)} · {workplaceLabel(job.workplace)}
            </span>
            {job.closes_on && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden /> Apply by {formatDate(job.closes_on)}
              </span>
            )}
          </div>
        </div>
        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
