import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { peopleKeys } from "./keys";
import { usePeopleContext } from "./employees";
import type { BadgeCounts, UpdateRequest } from "./types";

export function useUpdateRequests() {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.updates(companyId),
    enabled: !!companyId && isHR,
    queryFn: async () => {
      const { data, error } = await db
        .from("employee_update_requests")
        .select("id,employee_id,company_id,requested_changes,status,note,review_note,decisions,reviewed_by,reviewed_at,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as UpdateRequest[];
    },
  });
}

export function useReviewUpdateRequest() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ id, approved, note }: { id: string; approved: string[]; note?: string }) => {
      const { data, error } = await db.rpc("people_review_update_request", { p_request: id, p_approved: approved, p_note: note || null });
      if (error) throw error;
      return data as { status: string; applied: string[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: peopleKeys.all(companyId) }),
  });
}

const EMPTY_BADGES: BadgeCounts = { pending_updates: 0, missing_documents: 0, overdue_checklists: 0 };

/** One shared query behind the three People sidebar badges. */
export function usePeopleBadges() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: peopleKeys.badges(companyId),
    enabled: !!companyId && isHR,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("people_badge_counts");
      if (error) throw error;
      return { ...EMPTY_BADGES, ...((data ?? {}) as Partial<BadgeCounts>) };
    },
  });
}

export function usePendingUpdatesBadge(): number | undefined {
  return usePeopleBadges().data?.pending_updates || undefined;
}

export function useMissingDocumentsBadge(): number | undefined {
  return usePeopleBadges().data?.missing_documents || undefined;
}

export function useOverdueChecklistsBadge(): number | undefined {
  return usePeopleBadges().data?.overdue_checklists || undefined;
}
