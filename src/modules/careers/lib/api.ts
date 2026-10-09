import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  errorMessage,
  isAccepting,
  todayIn,
  type Application,
  type ApplicationNote,
  type ApplicationStatus,
  type EmploymentType,
  type JobPosting,
  type JobStatus,
  type JobWithCounts,
  type Workplace,
} from "./model";

/* ------------------------------------------------------------------ keys */

export const careersKeys = {
  all: (companyId: string | null) => ["careers", companyId] as const,
  jobs: (companyId: string | null) => ["careers", companyId, "jobs"] as const,
  job: (companyId: string | null, id: string) => ["careers", companyId, "job", id] as const,
  applications: (companyId: string | null) => ["careers", companyId, "applications"] as const,
  notes: (companyId: string | null, applicationId: string) => ["careers", companyId, "notes", applicationId] as const,
  newCount: (companyId: string | null) => ["careers", companyId, "new-count"] as const,
  departments: (companyId: string | null) => ["careers", companyId, "departments"] as const,
  slug: (companyId: string | null) => ["careers", companyId, "company-slug"] as const,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPLICATION_COLUMNS =
  "id, company_id, job_id, name, email, phone, link, cover_letter, cv_path, cv_name, cv_size, status, rating, employee_id, status_changed_at, created_at, job:job_postings(id, title, slug, department_id)";

/* --------------------------------------------------------------- queries */

type JobRow = JobPosting & { department: { name: string } | null; applications: { status: ApplicationStatus }[] | null };

export function useJobs() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: careersKeys.jobs(companyId),
    enabled: Boolean(companyId && isHR),
    queryFn: async (): Promise<JobWithCounts[]> => {
      const { data, error } = await db
        .from("job_postings")
        .select("*, department:departments(name), applications:job_applications(status)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JobRow[]).map(({ department, applications, ...job }) => {
        const apps = applications ?? [];
        return {
          ...job,
          department: department?.name ?? null,
          total: apps.length,
          fresh: apps.filter((a) => a.status === "new").length,
          active: apps.filter((a) => a.status !== "rejected" && a.status !== "hired").length,
          hired: apps.filter((a) => a.status === "hired").length,
        };
      });
    },
  });
}

export function useJob(id: string | undefined) {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: careersKeys.job(companyId, id ?? "new"),
    enabled: Boolean(companyId && isHR && id),
    queryFn: async (): Promise<JobPosting | null> => {
      // A mistyped /hiring/jobs/:id is "not found", not a failed load (Postgres rejects a non-uuid id).
      if (!UUID_RE.test(id ?? "")) return null;
      const { data, error } = await db.from("job_postings").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
      if (error) throw error;
      return (data as JobPosting | null) ?? null;
    },
  });
}

export function useApplications() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: careersKeys.applications(companyId),
    enabled: Boolean(companyId && isHR),
    queryFn: async (): Promise<Application[]> => {
      const { data, error } = await db
        .from("job_applications")
        .select(APPLICATION_COLUMNS)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Application[];
    },
  });
}

export function useApplicationNotes(applicationId: string | null) {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: careersKeys.notes(companyId, applicationId ?? "none"),
    enabled: Boolean(companyId && isHR && applicationId),
    queryFn: async (): Promise<ApplicationNote[]> => {
      const { data, error } = await db
        .from("job_application_notes")
        .select("id, application_id, author_id, author_name, kind, body, created_at")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApplicationNote[];
    },
  });
}

/** Sidebar badge: applications nobody has opened yet. */
export function useNewApplicationsCount(): number | undefined {
  const { companyId, isHR } = useAuth();
  const { data } = useQuery({
    queryKey: careersKeys.newCount(companyId),
    enabled: Boolean(companyId && isHR),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("job_applications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data;
}

export interface Department {
  id: string;
  name: string;
}

export function useDepartments() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: careersKeys.departments(companyId),
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await db.from("departments").select("id, name").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
}

export function useCompanySlug() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: careersKeys.slug(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await db.from("companies").select("slug").eq("id", companyId).maybeSingle();
      if (error) throw error;
      return ((data as { slug?: string | null } | null)?.slug as string | null) ?? null;
    },
  });
}

export async function openCv(path: string | null) {
  if (!path) {
    toast.error("This application has no CV attached.");
    return;
  }
  // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const { data, error } = await db.storage.from("cvs").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    tab?.close();
    toast.error("The CV could not be opened. It may have been removed.");
    return;
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.assign(data.signedUrl);
}

/* ------------------------------------------------------------- mutations */

function useInvalidate() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return () => qc.invalidateQueries({ queryKey: careersKeys.all(companyId) });
}

export interface JobInput {
  id?: string | null;
  title: string;
  slug: string;
  department_id: string | null;
  location: string;
  employment_type: EmploymentType;
  workplace: Workplace;
  openings: number;
  summary: string;
  description: string;
  requirements: string;
  status: JobStatus;
  closes_on: string | null;
}

export function useSaveJob() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: JobInput) => {
      const { data, error } = await db.rpc("careers_save_job", {
        p_id: input.id ?? null,
        p_title: input.title,
        p_slug: input.slug,
        p_department: input.department_id,
        p_location: input.location,
        p_employment_type: input.employment_type,
        p_workplace: input.workplace,
        p_openings: input.openings,
        p_summary: input.summary,
        p_description: input.description,
        p_requirements: input.requirements,
        p_status: input.status,
        p_closes_on: input.closes_on,
      });
      if (error) throw error;
      return data as { id: string; slug: string };
    },
    onSuccess: () => invalidate(),
  });
}

export function useSetJobStatus() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { companyId, company } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const { error } = await db.rpc("careers_set_job_status", { p_id: id, p_status: status });
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      const key = careersKeys.jobs(companyId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<JobWithCounts[]>(key);
      qc.setQueryData<JobWithCounts[]>(key, (old) => old?.map((j) => (j.id === id ? { ...j, status } : j)));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(careersKeys.jobs(companyId), ctx.previous);
      toast.error(errorMessage(err));
    },
    onSuccess: (_d, { id, status }) => {
      if (status === "closed") return toast.success("Role closed. It no longer takes applications.");
      const job = qc.getQueryData<JobWithCounts[]>(careersKeys.jobs(companyId))?.find((j) => j.id === id);
      // A reopened role whose closing date has passed stays off the careers page; say so instead of claiming it is listed.
      if (job && !isAccepting({ status, closes_on: job.closes_on }, todayIn(company?.timezone))) {
        return toast.warning("Role reopened, but its closing date has passed.", {
          description: "Edit the role and move the closing date to list it on the careers page again.",
        });
      }
      toast.success("Role reopened. It is back on the careers page.");
    },
    onSettled: () => invalidate(),
  });
}

export function useDeleteJob() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("careers_delete_job", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role deleted.");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useSetApplicationStatus() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ ids, status, note }: { ids: string[]; status: ApplicationStatus; note?: string; silent?: boolean }) => {
      const { data, error } = await db.rpc("careers_set_application_status", { p_ids: ids, p_status: status, p_note: note ?? null });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onMutate: async ({ ids, status }) => {
      const key = careersKeys.applications(companyId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Application[]>(key);
      const set = new Set(ids);
      qc.setQueryData<Application[]>(key, (old) =>
        old?.map((a) => (set.has(a.id) && a.status !== "hired" ? { ...a, status, status_changed_at: new Date().toISOString() } : a)),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(careersKeys.applications(companyId), ctx.previous);
      toast.error(errorMessage(err));
    },
    onSuccess: (count, { silent, ids }) => {
      if (silent) return;
      if (ids.length > 1) toast.success(`${count} ${count === 1 ? "application" : "applications"} moved.`);
      else if (count > 0) toast.success("Stage updated.");
    },
    onSettled: () => invalidate(),
  });
}

export function useRateApplication() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: async ({ id, rating }: { id: string; rating: number }) => {
      const { error } = await db.rpc("careers_rate_application", { p_id: id, p_rating: rating });
      if (error) throw error;
    },
    onMutate: async ({ id, rating }) => {
      const key = careersKeys.applications(companyId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Application[]>(key);
      qc.setQueryData<Application[]>(key, (old) => old?.map((a) => (a.id === id ? { ...a, rating: rating || null } : a)));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(careersKeys.applications(companyId), ctx.previous);
      toast.error(errorMessage(err));
    },
  });
}

export function useAddNote(applicationId: string) {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await db.rpc("careers_add_note", { p_application: applicationId, p_body: body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: careersKeys.notes(companyId, applicationId) }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteNote(applicationId: string) {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await db.rpc("careers_delete_note", { p_note: noteId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note deleted.");
      qc.invalidateQueries({ queryKey: careersKeys.notes(companyId, applicationId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteApplication() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.rpc("careers_delete_application", { p_id: id });
      if (error) throw error;
      const path = data as string | null;
      if (path) {
        const { error: removeError } = await db.storage.from("cvs").remove([path]);
        if (removeError) console.warn("[careers] CV file could not be removed", removeError.message);
      }
    },
    onSuccess: () => {
      toast.success("Application and CV deleted.");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export interface HireInput {
  applicationId: string;
  rank: string;
  joiningDate: string;
  departmentId: string | null;
  cnic: string;
  /** Link the application to this existing employee (a returning person) instead of creating one. */
  employeeId?: string | null;
}

/** The server found someone already on the books with the applicant's email or CNIC (SQLSTATE P0E01). */
export const EXISTING_EMPLOYEE_CODE = "P0E01";

export interface ExistingEmployeeMatch {
  employee_id: string;
  name: string;
  status: string;
  email: string | null;
  rank: string | null;
  joining_date: string | null;
  separation_date: string | null;
  matched_on: "email" | "cnic";
}

export function existingEmployeeMatch(err: unknown): ExistingEmployeeMatch | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: unknown; details?: unknown };
  if (e.code !== EXISTING_EMPLOYEE_CODE || typeof e.details !== "string") return null;
  try {
    const d = JSON.parse(e.details) as Partial<ExistingEmployeeMatch>;
    if (!d.employee_id || !d.name) return null;
    return {
      employee_id: d.employee_id,
      name: d.name,
      status: d.status ?? "active",
      email: d.email ?? null,
      rank: d.rank ?? null,
      joining_date: d.joining_date ?? null,
      separation_date: d.separation_date ?? null,
      matched_on: d.matched_on === "cnic" ? "cnic" : "email",
    };
  } catch {
    return null;
  }
}

export function useHireApplication() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HireInput) => {
      const { data, error } = await db.rpc("careers_hire_application", {
        p_id: input.applicationId,
        p_rank: input.rank,
        p_joining_date: input.joiningDate,
        p_department: input.departmentId,
        p_cnic: input.cnic || null,
        p_employee_id: input.employeeId ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidate();
      // The people module lists employees; make sure the new hire shows up there.
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith("people") });
    },
  });
}

export function useSetCompanySlug() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await db.rpc("careers_set_company_slug", { p_slug: slug });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (slug) => {
      qc.setQueryData(careersKeys.slug(companyId), slug);
      toast.success("Careers page address updated.");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
