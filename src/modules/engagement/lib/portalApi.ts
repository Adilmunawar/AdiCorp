import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc } from "@/lib/portal";
import type {
  ChatMessage,
  PortalAnnouncement,
  PortalCelebrations,
  PortalComplaint,
  PortalCounts,
  PortalPoll,
  PortalThread,
  WishResult,
} from "./types";

/* Portal query keys: module id, company, then "portal" and the employee. */
export const portalEngagementKeys = {
  all: (c: string | undefined, e: string | undefined) => ["engagement", c ?? "none", "portal", e ?? "anon"] as const,
  announcements: (c: string | undefined, e: string | undefined) => ["engagement", c ?? "none", "portal", e ?? "anon", "announcements"] as const,
  polls: (c: string | undefined, e: string | undefined) => ["engagement", c ?? "none", "portal", e ?? "anon", "polls"] as const,
  complaints: (c: string | undefined, e: string | undefined) => ["engagement", c ?? "none", "portal", e ?? "anon", "complaints"] as const,
  messages: (c: string | undefined, e: string | undefined) => ["engagement", c ?? "none", "portal", e ?? "anon", "messages"] as const,
  counts: (c: string | undefined, e: string | undefined) => ["engagement", c ?? "none", "portal", e ?? "anon", "counts"] as const,
  celebrations: (c: string | undefined, e: string | undefined) => ["engagement", c ?? "none", "portal", e ?? "anon", "celebrations"] as const,
};

function usePortalIds() {
  const { employee } = useEmployeeAuth();
  return { companyId: employee?.company_id, employeeId: employee?.id, ready: !!employee };
}

export function usePortalAnnouncements() {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalEngagementKeys.announcements(companyId, employeeId),
    enabled: ready,
    queryFn: () => portalRpc<PortalAnnouncement[]>("portal_announcements"),
  });
}

export function usePortalPolls() {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalEngagementKeys.polls(companyId, employeeId),
    enabled: ready,
    queryFn: () => portalRpc<PortalPoll[]>("portal_polls"),
  });
}

export function usePortalVote() {
  const { companyId, employeeId } = usePortalIds();
  const qc = useQueryClient();
  const key = portalEngagementKeys.polls(companyId, employeeId);
  return useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) => portalRpc<{ ok: boolean }>("portal_vote", { p_poll: pollId, p_option: optionId }),
    onMutate: async ({ pollId, optionId }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PortalPoll[]>(key);
      if (prev) qc.setQueryData<PortalPoll[]>(key, prev.map((p) => (p.id === pollId ? { ...p, my_option_id: optionId } : p)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: portalEngagementKeys.counts(companyId, employeeId) });
    },
  });
}

export function usePortalComplaints() {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalEngagementKeys.complaints(companyId, employeeId),
    enabled: ready,
    queryFn: () => portalRpc<PortalComplaint[]>("portal_complaints"),
  });
}

export function usePortalSubmitComplaint() {
  const { companyId, employeeId } = usePortalIds();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subject: string; description: string; anonymous: boolean }) =>
      portalRpc<{ ok: boolean; anonymous: boolean }>("portal_submit_complaint", {
        p_subject: input.subject,
        p_description: input.description,
        p_anonymous: input.anonymous,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: portalEngagementKeys.complaints(companyId, employeeId) }),
  });
}

export function usePortalCounts() {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalEngagementKeys.counts(companyId, employeeId),
    enabled: ready,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => portalRpc<PortalCounts>("portal_engagement_counts"),
  });
}

export function usePortalThread() {
  const { companyId, employeeId, ready } = usePortalIds();
  const qc = useQueryClient();
  return useQuery({
    queryKey: portalEngagementKeys.messages(companyId, employeeId),
    enabled: ready,
    queryFn: async () => {
      const thread = await portalRpc<PortalThread>("portal_messages");
      // Opening the thread marked HR's messages read.
      qc.setQueryData<PortalCounts>(portalEngagementKeys.counts(companyId, employeeId), (prev) => (prev ? { ...prev, unread_messages: 0 } : prev));
      return thread;
    },
  });
}

/**
 * Realtime for the portal thread: the database broadcasts a ping (message id only) on an
 * unguessable per-employee topic; the page then refetches through portal_messages.
 */
export function usePortalThreadRealtime(topic: string | null | undefined) {
  const { companyId, employeeId } = usePortalIds();
  const qc = useQueryClient();
  useEffect(() => {
    if (!topic) return;
    const channel = db
      .channel(topic, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "message" }, () => {
        void qc.invalidateQueries({ queryKey: portalEngagementKeys.messages(companyId, employeeId) });
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [topic, companyId, employeeId, qc]);
}

export function usePortalSendMessage() {
  const { companyId, employeeId, ready } = usePortalIds();
  const qc = useQueryClient();
  const key = portalEngagementKeys.messages(companyId, employeeId);
  return useMutation({
    mutationFn: (content: string) => {
      if (!ready) throw new Error("Your session has ended. Please sign in again.");
      return portalRpc<ChatMessage>("portal_send_message", { p_content: content });
    },
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PortalThread>(key);
      const temp: ChatMessage = {
        id: `pending-${Date.now()}`,
        content,
        sender_kind: "employee",
        sender_name: null,
        mine: true,
        created_at: new Date().toISOString(),
        read_at: null,
        pending: true,
      };
      if (prev) qc.setQueryData<PortalThread>(key, { ...prev, messages: [...prev.messages, temp] });
      return { prev, tempId: temp.id };
    },
    onSuccess: (message, _c, ctx) => {
      qc.setQueryData<PortalThread>(key, (prev) =>
        prev
          ? { ...prev, messages: prev.messages.some((m) => m.id === message.id) ? prev.messages.filter((m) => m.id !== ctx?.tempId) : prev.messages.map((m) => (m.id === ctx?.tempId ? message : m)) }
          : prev,
      );
    },
    onError: (_e, _c, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
  });
}

export function usePortalCelebrations() {
  const { companyId, employeeId, ready } = usePortalIds();
  return useQuery({
    queryKey: portalEngagementKeys.celebrations(companyId, employeeId),
    enabled: ready,
    queryFn: () => portalRpc<PortalCelebrations>("portal_celebrations", { p_days: 30 }),
  });
}

export function usePortalSendWish() {
  const { companyId, employeeId } = usePortalIds();
  const qc = useQueryClient();
  const key = portalEngagementKeys.celebrations(companyId, employeeId);
  return useMutation({
    mutationFn: ({ employeeId: to, kind, message }: { employeeId: string; kind: string; message?: string }) =>
      portalRpc<WishResult>("portal_send_wish", { p_employee: to, p_kind: kind, p_message: message ?? null }),
    onMutate: async ({ employeeId: to, kind }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PortalCelebrations>(key);
      if (prev) {
        qc.setQueryData<PortalCelebrations>(key, {
          ...prev,
          occasions: prev.occasions.map((o) => (o.employee_id === to && o.kind === kind && !o.wished ? { ...o, wished: true, wishes: o.wishes + 1 } : o)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: portalEngagementKeys.counts(companyId, employeeId) });
    },
  });
}

export function usePortalShareBirthday() {
  const { companyId, employeeId } = usePortalIds();
  const qc = useQueryClient();
  const key = portalEngagementKeys.celebrations(companyId, employeeId);
  return useMutation({
    mutationFn: (share: boolean) => portalRpc<{ ok: boolean; share_birthday: boolean }>("portal_set_share_birthday", { p_share: share }),
    onMutate: async (share) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PortalCelebrations>(key);
      if (prev) qc.setQueryData<PortalCelebrations>(key, { ...prev, share_birthday: share });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
