import { MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { usePortalSendMessage, usePortalThread, usePortalThreadRealtime } from "../../lib/portalApi";
import { ChatThread } from "../../components/ChatThread";
import { LoadError } from "../../components/LoadError";
import { PortalExtras } from "../../components/PageExtras";

export default function PortalMessagesPage() {
  const thread = usePortalThread();
  const send = usePortalSendMessage();
  usePortalThreadRealtime(thread.data?.topic);

  return (
    <div className="flex h-[calc(100dvh-56px-8.25rem)] min-h-[380px] flex-col md:h-[calc(100dvh-56px-3.25rem)] lg:h-[calc(100dvh-56px-3.75rem)]">
      <PortalExtras />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {thread.isError ? (
          <div className="flex flex-1 items-center justify-center">
            <LoadError what="Messages" error={thread.error} icon={MessageCircle} onRetry={() => thread.refetch()} inline />
          </div>
        ) : (
          <ChatThread
            viewer="employee"
            messages={thread.data?.messages ?? []}
            loading={thread.isPending}
            placeholder="Write to HR…"
            emptyTitle="Message HR"
            emptyDescription="Ask about leave, pay, documents or anything else. Everyone in HR can see and answer this conversation."
            onSend={(content) =>
              send.mutateAsync(content).catch((e) => {
                toast.error(errorMessage(e));
                throw e;
              })
            }
            header={
              <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-display text-sm font-semibold">HR team</h1>
                  <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 shrink-0" /> Private between you and HR
                  </p>
                </div>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
