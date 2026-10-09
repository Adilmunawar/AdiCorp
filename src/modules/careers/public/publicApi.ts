import { useQuery } from "@tanstack/react-query";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, db } from "@/integrations/supabase/client";
import type { PublicCareers, PublicCompany, PublicJobDetail } from "../lib/model";

export const publicCareersKeys = {
  company: (slug: string) => ["careers", "public", slug] as const,
  job: (slug: string, jobSlug: string) => ["careers", "public", slug, jobSlug] as const,
};

export function usePublicCareers(slug: string | undefined) {
  return useQuery({
    queryKey: publicCareersKeys.company(slug ?? ""),
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: async (): Promise<PublicCareers | null> => {
      const { data, error } = await db.rpc("careers_public_company", { p_slug: slug });
      if (error) throw error;
      return (data as PublicCareers | null) ?? null;
    },
  });
}

export function usePublicJob(slug: string | undefined, jobSlug: string | undefined) {
  return useQuery({
    queryKey: publicCareersKeys.job(slug ?? "", jobSlug ?? ""),
    enabled: Boolean(slug && jobSlug),
    staleTime: 60_000,
    queryFn: async (): Promise<{ company: PublicCompany; job: PublicJobDetail } | null> => {
      const { data, error } = await db.rpc("careers_public_job", { p_company_slug: slug, p_job_slug: jobSlug });
      if (error) throw error;
      return (data as { company: PublicCompany; job: PublicJobDetail } | null) ?? null;
    },
  });
}

/** Sends the application form (with the CV) to the careers-apply Edge Function. */
export async function submitApplication(form: FormData): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/careers-apply`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
      body: form,
    });
  } catch {
    throw new Error("Your application could not be sent. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || "Your application could not be sent.");
}
