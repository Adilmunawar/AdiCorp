import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { engagementKeys, usePendingComplaintsCount, useUnreadMessagesCount } from "./api";
import { usePortalCounts } from "./portalApi";

/* Nav badge hooks (called once per rendered nav row). */

export function usePendingComplaintsBadge(): number | undefined {
  return usePendingComplaintsCount().data || undefined;
}

/** Unread messages from employees, kept live with a realtime subscription. */
export function useUnreadMessagesBadge(): number | undefined {
  const { companyId, isHR } = useAuth();
  const qc = useQueryClient();
  const instance = useRef(Math.random().toString(36).slice(2, 10));
  const count = useUnreadMessagesCount().data;

  useEffect(() => {
    if (!companyId || !isHR) return;
    const channel = db
      .channel(`engagement:badge:${companyId}:${instance.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `company_id=eq.${companyId}` }, () => {
        void qc.invalidateQueries({ queryKey: engagementKeys.unreadMessages(companyId) });
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [companyId, isHR, qc]);

  return count || undefined;
}

export function usePortalUnreadMessagesBadge(): number | undefined {
  return usePortalCounts().data?.unread_messages || undefined;
}

export function usePortalOpenPollsBadge(): number | undefined {
  return usePortalCounts().data?.open_polls || undefined;
}

export function usePortalCelebrationsBadge(): number | undefined {
  return usePortalCounts().data?.celebrations_today || undefined;
}
