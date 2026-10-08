import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Building2, CalendarClock, Check, MapPin, Send, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/components/kit";
import { employmentTypeLabel, lines, paragraphs, workplaceLabel } from "../lib/model";
import { copyText } from "../components/CareersLinkCard";
import { usePublicJob } from "./publicApi";
import { PublicLayout, usePageTitle } from "./PublicLayout";
import { ApplyForm } from "./ApplyForm";

/** /careers/:slug/:jobSlug: role details and the application form. Public, no sign-in. */
export default function PublicJobPage() {
  const { slug, jobSlug } = useParams<{ slug: string; jobSlug: string }>();
  const { data, isPending: isLoading, isError, refetch, isRefetching } = usePublicJob(slug, jobSlug);
  usePageTitle(data ? `${data.job.title} · ${data.company.name} careers` : "Careers");

  if (isLoading) {
    return (
      <PublicLayout loading>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </PublicLayout>
    );
  }

  if (isError || !data) {
    return (
      <PublicLayout>
        <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="font-display text-2xl font-bold">{isError ? "This role is unavailable" : "Role not found"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isError ? "We could not load this page. Try again in a moment." : "The link may be out of date, or the role was removed."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {isError && (
              <Button onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? "Trying again…" : "Try again"}
              </Button>
            )}
            {slug && (
              <Button asChild variant="outline">
                <Link to={`/careers/${slug}`}>See open roles</Link>
              </Button>
            )}
          </div>
        </div>
      </PublicLayout>
    );
  }

  const { company, job } = data;
  const about = paragraphs(job.description);
  const wants = lines(job.requirements);

  return (
    <PublicLayout company={company}>
      <section className="relative border-b border-border/70 bg-muted/30">
        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pb-12 sm:pt-12">
          <Link to={`/careers/${company.slug}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All roles
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {job.department && <p className="micro-label text-primary">{job.department}</p>}
            {!job.is_open && <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">Closed</span>}
          </div>
          <h1 className="mt-2 max-w-3xl font-display text-2xl font-semibold tracking-tight sm:text-3xl">{job.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {job.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden /> {job.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="h-4 w-4" aria-hidden /> {employmentTypeLabel(job.employment_type)} · {workplaceLabel(job.workplace)}
            </span>
            {job.openings > 1 && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" aria-hidden /> {job.openings} openings
              </span>
            )}
            {job.closes_on && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" aria-hidden /> Apply by {formatDate(job.closes_on)}
              </span>
            )}
          </div>
          {job.summary && <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground/80">{job.summary}</p>}
          {/* Below lg the form sits under the whole description; give phones a way straight to it. */}
          {job.is_open && (
            <Button
              size="lg"
              className="mt-6 w-full sm:w-auto lg:hidden"
              onClick={() => {
                // Scroll instead of a #hash link so "Share this role" keeps copying a clean address.
                document.getElementById("apply")?.scrollIntoView({ behavior: "smooth", block: "start" });
                // Focusing also brings the field into view if the smooth scroll was cut short.
                window.setTimeout(() => document.getElementById("apply-name")?.focus(), 450);
              }}
            >
              <Send className="mr-2 h-4 w-4" aria-hidden /> Apply for this role
            </Button>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
          <div className="min-w-0 space-y-10">
            {about.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-bold">About the role</h2>
                <div className="mt-3 space-y-4 text-[15px] leading-7 text-foreground/80">
                  {about.map((p, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {wants.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-bold">What we are looking for</h2>
                <ul className="mt-4 space-y-2.5">
                  {wants.map((w, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-6 text-foreground/80">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-muted/30 p-5">
              <p className="font-display text-base font-bold">How we hire</p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Send your CV with the short form. We read every application, reply by e-mail or phone, and keep the process to two or three conversations. Your CV is seen only by the people hiring for this role.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => copyText(window.location.href)}>
              <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share this role
            </Button>
          </div>

          <div id="apply" className="scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
            {job.is_open ? (
              <ApplyForm jobId={job.id} jobTitle={job.title} companyName={company.name} />
            ) : (
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <p className="font-display text-xl font-bold">This role is closed.</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  It no longer takes applications. Have a look at the{" "}
                  <Link to={`/careers/${company.slug}`} className="font-semibold text-primary hover:underline">
                    open roles
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
