import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type {
  AnnouncementInput,
  ChatMessage,
  ComingUp,
  ComplaintStatus,
  Department,
  DirectoryEntry,
  PollDetail,
  PollInput,
  StaffAnnouncement,
  StaffCelebrations,
  StaffComplaint,
  StaffPoll,
  Thread,
  ThreadDetail,
  WishResult,
} from "./types";

/* ------------------------------------------------------------------ keys */

export const engagementKeys = {
  all: (companyId: string | null | undefined) => ["engagement", companyId ?? "none"] as const,
  announcements: (c: string | null | undefined) => ["engagement", c ?? "none", "announcements"] as const,
  departments: (c: string | null | undefined) => ["engagement", c ?? "none", "departments"] as const,
  polls: (c: string | null | undefined) => ["engagement", c ?? "none", "polls"] as const,
  poll: (c: string | null | undefined, id: string) => ["engagement", c ?? "none", "polls", id] as const,
  complaints: (c: string | null | undefined) => ["engagement", c ?? "none", "complaints"] as const,
  pendingComplaints: (c: string | null | undefined) => ["engagement", c ?? "none", "complaints", "pending-count"] as const,
  threads: (c: string | null | undefined) => ["engagement", c ?? "none", "messages", "threads"] as const,
  thread: (c: string | null | undefined, employeeId: string) => ["engagement", c ?? "none", "messages", "thread", employeeId] as const,
  unreadMessages: (c: string | null | undefined) => ["engagement", c ?? "none", "messages", "unread"] as const,
  directory: (c: string | null | undefined) => ["engagement", c ?? "none", "messages", "directory"] as const,
  celebrations: (c: string | null | undefined) => ["engagement", c ?? "none", "celebrations"] as const,
  comingUp: (c: string | null | undefined) => ["engagement", c ?? "none", "coming-up"] as const,
};

/* --------------------------------------------------------------- helpers */

function rawMessage(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message ?? "";
  if (typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "";
}

/** True when the server does not have this feature's database functions or tables yet (an update is not applied). */
export function isMissingFeature(error: unknown): boolean {
  return /could not find the (function|table)|schema cache|PGRST20[25]|relation .* does not exist|function .* does not exist/i.test(rawMessage(error));
}

const NOT_SET_UP = "This feature is not set up on the server yet. Ask your administrator to apply the latest AdiCorp update.";

/**
 * Readable message from a Supabase / Postgres error. Our RPCs raise human sentences, which pass through;
 * technical errors (missing functions, network failures, expired sessions) become plain sentences.
 */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = rawMessage(error).trim();
  if (!raw) return fallback;
  if (isMissingFeature(error)) return NOT_SET_UP;
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(raw)) return "Could not reach the server. Check your connection and try again.";
  if (/jwt expired|invalid jwt|not authenticated/i.test(raw)) return "Your session has expired. Sign in again to continue.";
  if (/permission denied|row-level security/i.test(raw)) return "You do not have permission to do that.";
  return raw;
}

/** One calm sentence under a "could not be loaded" title. */
export function loadErrorHint(error: unknown): string {
  return isMissingFeature(error) ? NOT_SET_UP : "Check your connection and try again.";
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) throw new Error(error.message || "Request failed");
  if (data && typeof data === "object" && !Array.isArray(data) && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

function useCompanyId() {
  const { companyId } = useAuth();
  return companyId;
}

/* ---------------------------------------------------------- announcements */

export function useAnnouncements() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.announcements(companyId),
    enabled: !!companyId,
    queryFn: () => rpc<StaffAnnouncement[]>("engagement_announcements"),
  });
}

export function useDepartments() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.departments(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("departments").select("id, name").eq("company_id", companyId!).order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
}

export function useSaveAnnouncement() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnnouncementInput) =>
      rpc<string>("engagement_save_announcement", {
        p_id: input.id ?? null,
        p_title: input.title,
        p_content: input.content,
        p_pinned: input.pinned,
        p_audience: input.audience,
        p_department: input.audience === "department" ? input.department_id : null,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: engagementKeys.announcements(companyId) }),
  });
}

export function useSetAnnouncementActive() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  const key = engagementKeys.announcements(companyId);
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => rpc<void>("engagement_set_announcement_active", { p_id: id, p_active: active }),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StaffAnnouncement[]>(key);
      if (prev) qc.setQueryData(key, prev.map((a) => (a.id === id ? { ...a, is_active: active } : a)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteAnnouncement() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc<void>("engagement_delete_announcement", { p_id: id }),
    onSettled: () => qc.invalidateQueries({ queryKey: engagementKeys.announcements(companyId) }),
  });
}

/* ------------------------------------------------------------------ polls */

export function usePolls() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.polls(companyId),
    enabled: !!companyId,
    queryFn: () => rpc<StaffPoll[]>("engagement_polls"),
  });
}

export function usePollDetail(id: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.poll(companyId, id ?? ""),
    enabled: !!companyId && !!id,
    queryFn: () => rpc<PollDetail>("engagement_poll_detail", { p_id: id }),
  });
}

export function useCreatePoll() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PollInput) =>
      rpc<string>("engagement_create_poll", {
        p_question: input.question,
        p_description: input.description,
        p_options: input.options,
        p_expires_at: input.expires_at,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: engagementKeys.polls(companyId) }),
  });
}

export function useSetPollStatus() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  const key = engagementKeys.polls(companyId);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "closed" }) => rpc<void>("engagement_set_poll_status", { p_id: id, p_status: status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StaffPoll[]>(key);
      if (prev) qc.setQueryData(key, prev.map((p) => (p.id === id ? { ...p, status: status === "active" ? "open" : "closed" } : p)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeletePoll() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc<void>("engagement_delete_poll", { p_id: id }),
    onSettled: () => qc.invalidateQueries({ queryKey: engagementKeys.polls(companyId) }),
  });
}

/* ------------------------------------------------------------- complaints */

export function useComplaints() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.complaints(companyId),
    enabled: !!companyId,
    queryFn: () => rpc<StaffComplaint[]>("engagement_complaints"),
  });
}

export function usePendingComplaintsCount() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: engagementKeys.pendingComplaints(companyId),
    enabled: !!companyId && isHR,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("complaints")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useRespondComplaint() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, response }: { id: string; status: ComplaintStatus; response: string }) =>
      rpc<void>("engagement_respond_complaint", { p_id: id, p_status: status, p_response: response }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["engagement", companyId ?? "none", "complaints"] }),
  });
}

/* --------------------------------------------------------------- messages */

export function useThreads() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.threads(companyId),
    enabled: !!companyId,
    queryFn: () => rpc<Thread[]>("engagement_threads"),
  });
}

export function useThread(employeeId: string | null) {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useQuery({
    queryKey: engagementKeys.thread(companyId, employeeId ?? ""),
    enabled: !!companyId && !!employeeId,
    queryFn: async () => {
      const detail = await rpc<ThreadDetail>("engagement_thread", { p_employee: employeeId });
      // Opening the thread marked it read on the server.
      qc.setQueryData<Thread[]>(engagementKeys.threads(companyId), (prev) => prev?.map((t) => (t.employee_id === employeeId ? { ...t, unread: 0 } : t)));
      void qc.invalidateQueries({ queryKey: engagementKeys.unreadMessages(companyId) });
      return detail;
    },
  });
}

export function useMessageDirectory(enabled: boolean) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.directory(companyId),
    enabled: !!companyId && enabled,
    staleTime: 5 * 60_000,
    queryFn: () => rpc<DirectoryEntry[]>("engagement_message_directory"),
  });
}

export function useUnreadMessagesCount() {
  const { companyId, isHR } = useAuth();
  return useQuery({
    queryKey: engagementKeys.unreadMessages(companyId),
    enabled: !!companyId && isHR,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("sender_kind", "employee")
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/**
 * Send to one employee's thread. The recipient travels with each send (not in the hook's closure):
 * React Query hands a pending mutation the newest options when the page re-renders, so a send that
 * waits (offline, or still in onMutate) while HR opens another conversation would otherwise run with
 * the other employee's id and reach the wrong person.
 */
export function useSendMessage() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, content }: { employeeId: string; content: string }) =>
      rpc<ChatMessage>("engagement_send_message", { p_employee: employeeId, p_content: content }),
    onMutate: async ({ employeeId, content }) => {
      // The thread this message was written in; the key travels in the context for the same reason.
      const key = engagementKeys.thread(companyId, employeeId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ThreadDetail>(key);
      const temp: ChatMessage = {
        id: `pending-${Date.now()}`,
        content,
        sender_kind: "staff",
        sender_name: null,
        mine: true,
        created_at: new Date().toISOString(),
        read_at: null,
        pending: true,
      };
      if (prev) qc.setQueryData<ThreadDetail>(key, { ...prev, messages: [...prev.messages, temp] });
      return { prev, tempId: temp.id, key };
    },
    onSuccess: (message, _content, ctx) => {
      if (!ctx) return;
      qc.setQueryData<ThreadDetail>(ctx.key, (prev) =>
        prev
          ? { ...prev, messages: prev.messages.some((m) => m.id === message.id) ? prev.messages.filter((m) => m.id !== ctx.tempId) : prev.messages.map((m) => (m.id === ctx.tempId ? message : m)) }
          : prev,
      );
    },
    onError: (_e, _c, ctx) => {
      if (!ctx) return;
      if (ctx.prev) qc.setQueryData(ctx.key, ctx.prev);
      void qc.invalidateQueries({ queryKey: ctx.key });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: engagementKeys.threads(companyId) });
      void qc.invalidateQueries({ queryKey: engagementKeys.directory(companyId) });
    },
  });
}

/**
 * Live inbox: one realtime subscription on the company's messages (RLS limits it to HR).
 * New rows refresh the thread list, the open thread and the unread badge.
 */
export function useInboxRealtime(openEmployeeId: string | null) {
  const { companyId, isHR } = useAuth();
  const qc = useQueryClient();
  const openRef = useRef(openEmployeeId);
  openRef.current = openEmployeeId;
  const instance = useRef(Math.random().toString(36).slice(2, 10));

  useEffect(() => {
    if (!companyId || !isHR) return;
    const channel = db
      .channel(`engagement:messages:${companyId}:${instance.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `company_id=eq.${companyId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as { employee_id?: string } | null;
        void qc.invalidateQueries({ queryKey: engagementKeys.threads(companyId) });
        void qc.invalidateQueries({ queryKey: engagementKeys.unreadMessages(companyId) });
        if (row?.employee_id && row.employee_id === openRef.current) {
          void qc.invalidateQueries({ queryKey: engagementKeys.thread(companyId, row.employee_id) });
        }
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [companyId, isHR, qc]);
}

/* ----------------------------------------------------------- celebrations */

export function useCelebrations() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.celebrations(companyId),
    enabled: !!companyId,
    queryFn: () => rpc<StaffCelebrations>("engagement_celebrations", { p_days: 30 }),
  });
}

export function useSendWish() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  const key = engagementKeys.celebrations(companyId);
  return useMutation({
    mutationFn: ({ employeeId, kind, message }: { employeeId: string; kind: string; message?: string }) =>
      rpc<WishResult>("engagement_send_wish", { p_employee: employeeId, p_kind: kind, p_message: message ?? null }),
    onMutate: async ({ employeeId, kind }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StaffCelebrations>(key);
      if (prev) {
        qc.setQueryData<StaffCelebrations>(key, {
          ...prev,
          occasions: prev.occasions.map((o) =>
            o.employee_id === employeeId && o.kind === kind && !o.wished ? { ...o, wished: true, wishes: o.wishes + 1 } : o,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useComingUp(enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: engagementKeys.comingUp(companyId),
    enabled: !!companyId && enabled,
    staleTime: 5 * 60_000,
    queryFn: () => rpc<ComingUp>("engagement_coming_up"),
  });
}
