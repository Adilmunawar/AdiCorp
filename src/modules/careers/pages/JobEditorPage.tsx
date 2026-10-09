import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, CloudOff, Eye, RotateCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardSkeleton, EmptyState, PageHeader, SectionCard } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useCompanySlug, useDepartments, useJob, useSaveJob, type JobInput } from "../lib/api";
import {
  EMPLOYMENT_TYPES,
  WORKPLACES,
  careersUrl,
  errorMessage,
  isAccepting,
  lines,
  paragraphs,
  slugify,
  todayIn,
  type EmploymentType,
  type JobPosting,
  type JobStatus,
  type Workplace,
} from "../lib/model";

const NONE = "__none__";

const EMPTY: JobInput = {
  id: null,
  title: "",
  slug: "",
  department_id: null,
  location: "",
  employment_type: "full_time",
  workplace: "onsite",
  openings: 1,
  summary: "",
  description: "",
  requirements: "",
  status: "open",
  closes_on: null,
};

function fromJob(job: JobPosting): JobInput {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    department_id: job.department_id,
    location: job.location,
    employment_type: job.employment_type,
    workplace: job.workplace,
    openings: job.openings,
    summary: job.summary,
    description: job.description,
    requirements: job.requirements,
    status: job.status,
    closes_on: job.closes_on,
  };
}

function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * /hiring/jobs/new and /hiring/jobs/:id render the same component, so React would keep the form
 * when moving between them (e.g. "Post a job" from the command palette while editing a role):
 * the new form would still hold the old role's id and "Publish" would overwrite that role.
 */
export default function JobEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <JobEditor key={id ?? "new"} id={id} />;
}

function JobEditor({ id }: { id: string | undefined }) {
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { data: job, isPending: isLoading, isError, refetch, isRefetching } = useJob(isNew ? undefined : id);
  const { data: departments = [] } = useDepartments();
  const { data: companySlug } = useCompanySlug();
  const save = useSaveJob();
  const { company } = useAuth();

  const [form, setForm] = useState<JobInput>(EMPTY);
  // Kept as typed so the field can be cleared and retyped; parsed on save.
  const [openings, setOpenings] = useState(String(EMPTY.openings));
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (job) {
      setForm(fromJob(job));
      setOpenings(String(job.openings));
      setSlugTouched(true);
    }
  }, [job]);

  const set = <K extends keyof JobInput>(key: K, value: JobInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const effectiveSlug = slugTouched ? slugify(form.slug) : slugify(form.title);
  const reqCount = useMemo(() => lines(form.requirements).length, [form.requirements]);
  const paraCount = useMemo(() => paragraphs(form.description).length, [form.description]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const count = Number(openings);
    if (form.title.trim().length < 3) return setError("Give the role a title of at least 3 characters.");
    if (!/^\d+$/.test(openings.trim()) || count < 1 || count > 999) return setError("Openings must be a whole number between 1 and 999.");
    if (form.closes_on && !/^\d{4}-\d{2}-\d{2}$/.test(form.closes_on)) return setError("The closing date must be a date.");
    const listed = isAccepting(form, todayIn(company?.timezone));
    save.mutate(
      { ...form, openings: count, slug: slugTouched ? form.slug : "" },
      {
        onSuccess: () => {
          toast.success(isNew ? (form.status === "open" ? "Role published." : "Role saved.") : "Changes saved.", {
            description: listed
              ? "Open roles appear on the careers page straight away."
              : form.status === "open"
                ? "Its closing date has passed, so it stays off the careers page until you move the date."
                : "Closed roles stay hidden from the careers page.",
          });
          navigate("/hiring/jobs");
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  if (!isNew && isLoading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!isNew && isError && !job) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <EmptyState
          icon={CloudOff}
          title="This role could not be loaded"
          description="The hiring data did not come back from the server. Check your connection and try again."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/hiring/jobs">Back to jobs</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                <RotateCw className={isRefetching ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} /> Try again
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!isNew && !job) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <EmptyState
          icon={Briefcase}
          title="That role no longer exists"
          description="It may have been deleted by someone else."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/hiring/jobs">Back to jobs</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PageHeader
        icon={Briefcase}
        eyebrow={
          <Link to="/hiring/jobs" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Jobs
          </Link>
        }
        title={isNew ? "Post a job" : `Edit ${job?.title ?? "role"}`}
        description="Everything here is shown on your public careers page, except the status."
        actions={
          <>
            {!isNew && companySlug && job && (
              <Button type="button" variant="outline" asChild>
                <a href={careersUrl(companySlug, job.slug)} target="_blank" rel="noreferrer">
                  <Eye className="mr-1.5 h-4 w-4" /> Preview
                </a>
              </Button>
            )}
            <Button type="submit" disabled={save.isPending}>
              <Save className="mr-1.5 h-4 w-4" />
              {save.isPending ? "Saving…" : isNew ? (form.status === "open" ? "Publish role" : "Save role") : "Save changes"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="The role" description="Title, team and where the work happens.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="job-title" label="Title" className="sm:col-span-2">
                <Input id="job-title" required maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Senior frontend engineer" autoFocus={isNew} />
              </Field>
              <Field id="job-department" label="Department" hint="optional">
                <Select value={form.department_id ?? NONE} onValueChange={(v) => set("department_id", v === NONE ? null : v)}>
                  <SelectTrigger id="job-department">
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No department</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="job-location" label="Location" hint="optional">
                <Input id="job-location" maxLength={80} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Lahore, Karachi, remote…" />
              </Field>
              <Field id="job-type" label="Type">
                <Select value={form.employment_type} onValueChange={(v) => set("employment_type", v as EmploymentType)}>
                  <SelectTrigger id="job-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="job-workplace" label="Workplace">
                <Select value={form.workplace} onValueChange={(v) => set("workplace", v as Workplace)}>
                  <SelectTrigger id="job-workplace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKPLACES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="job-summary" label="Summary" hint={form.summary.length ? `${form.summary.length}/300` : "shown in the roles list"} className="sm:col-span-2">
                <Input
                  id="job-summary"
                  maxLength={300}
                  value={form.summary}
                  onChange={(e) => set("summary", e.target.value)}
                  placeholder="One or two sentences on why this role matters."
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Details" description="What candidates read before they apply.">
            <div className="grid gap-4">
              <Field id="job-description" label="About the role" hint={paraCount === 0 ? "leave a blank line between paragraphs" : `${paraCount} ${paraCount === 1 ? "paragraph" : "paragraphs"}`}>
                <Textarea
                  id="job-description"
                  rows={8}
                  maxLength={8000}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What the person will do, who they work with, what a good first six months looks like."
                />
              </Field>
              <Field id="job-requirements" label="What we are looking for" hint={reqCount === 0 ? "one per line" : `${reqCount} ${reqCount === 1 ? "item" : "items"}`}>
                <Textarea
                  id="job-requirements"
                  rows={6}
                  maxLength={4000}
                  value={form.requirements}
                  onChange={(e) => set("requirements", e.target.value)}
                  placeholder={"3+ years with React and TypeScript\nComfortable owning features end to end\nClear written English"}
                />
              </Field>
            </div>
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-4">
          <SectionCard title="Publishing">
            <div className="grid gap-4">
              <Field id="job-status" label="Status">
                <Select value={form.status} onValueChange={(v) => set("status", v as JobStatus)}>
                  <SelectTrigger id="job-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open, shown on the careers page</SelectItem>
                    <SelectItem value="closed">Closed, hidden</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="job-closes" label="Closing date" hint="optional">
                <Input id="job-closes" type="date" value={form.closes_on ?? ""} onChange={(e) => set("closes_on", e.target.value || null)} />
              </Field>
              <Field id="job-openings" label="Openings">
                <Input
                  id="job-openings"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={openings}
                  onChange={(e) => setOpenings(e.target.value)}
                />
              </Field>
              <Field id="job-slug" label="Web address" hint="from the title if blank">
                <Input
                  id="job-slug"
                  maxLength={60}
                  value={slugTouched ? form.slug : effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value);
                  }}
                  placeholder="senior-frontend-engineer"
                />
                {companySlug && effectiveSlug && (
                  <p className="mt-1.5 break-all text-[11px] text-muted-foreground">{careersUrl(companySlug, effectiveSlug).replace(/^https?:\/\//, "")}</p>
                )}
              </Field>
            </div>
          </SectionCard>

          {error && (
            <div role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" asChild>
              <Link to="/hiring/jobs">Cancel</Link>
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : isNew ? (form.status === "open" ? "Publish role" : "Save role") : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
