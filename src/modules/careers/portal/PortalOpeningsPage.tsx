import { useQuery } from "@tanstack/react-query";
import { Briefcase, CalendarClock, CloudOff, Copy, ExternalLink, MapPin, Megaphone, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionCard, Skeleton, formatDate } from "@/components/kit";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import { careersUrl, employmentTypeLabel, workplaceLabel, type PublicJobSummary } from "../lib/model";
import { copyText } from "../components/CareersLinkCard";

interface Openings {
  company_slug: string | null;
  jobs: PublicJobSummary[];
}

/** Portal: the company's open roles, so employees can apply internally or refer people they know. */
export default function PortalOpeningsPage() {
  const { employee } = useEmployeeAuth();
  const { data, isPending: isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["careers", employee?.company_id ?? null, "portal-openings", employee?.id ?? null],
    enabled: Boolean(employee),
    queryFn: () => portalRpc<Openings>("portal_careers_openings"),
  });
  const jobs = data?.jobs ?? [];
  const slug = data?.company_slug ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Briefcase}
        eyebrow="Careers"
        title="Open roles"
        description={
          !isLoading && !isError && jobs.length > 0
            ? `${jobs.length} open ${jobs.length === 1 ? "role" : "roles"}. Know someone great? Share the link. You can apply yourself too.`
            : "Know someone great? Share the link. You can apply for a role yourself too."
        }
        actions={
          slug && jobs.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => copyText(careersUrl(slug), "Careers page link copied.")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy careers link
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <ul className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading open roles">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="space-y-2.5 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-8 flex-1 rounded-lg" />
                <Skeleton className="h-8 flex-1 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      ) : isError ? (
        <SectionCard flush>
          <EmptyState
            icon={CloudOff}
            title="Open roles could not be loaded"
            description="Check your connection and try again."
            action={
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                <RotateCw className={isRefetching ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} /> Try again
              </Button>
            }
          />
        </SectionCard>
      ) : jobs.length === 0 ? (
        <SectionCard flush>
          <EmptyState icon={Megaphone} title="No open roles right now" description="When HR posts a new role it shows up here." />
        </SectionCard>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
              {job.department && <p className="micro-label text-primary">{job.department}</p>}
              <h2 className="mt-0.5 font-display text-base font-semibold leading-snug">{job.title}</h2>
              {job.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{job.summary}</p>}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Apply by {formatDate(job.closes_on)}
                  </span>
                )}
              </div>
              {slug && (
                // mt-auto keeps the buttons on one line across cards whose summaries differ in length.
                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => copyText(careersUrl(slug, job.slug), "Role link copied. Share it with your referral.")}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Refer
                  </Button>
                  <Button size="sm" className="flex-1" asChild>
                    <a href={careersUrl(slug, job.slug)} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View role
                    </a>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
