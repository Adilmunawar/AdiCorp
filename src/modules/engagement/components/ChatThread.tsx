import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { CheckCheck, Loader2, MessageCircle, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, toDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { ChatMessage, SenderKind } from "../lib/types";

const MAX_LENGTH = 2000;

function dayLabel(iso: string): string {
  const d = toDate(iso);
  if (!d) return "";
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMMM yyyy");
}

function timeLabel(iso: string): string {
  const d = toDate(iso);
  return d ? format(d, "h:mm a") : "";
}

interface ChatThreadProps {
  messages: ChatMessage[];
  loading?: boolean;
  /** Whose side is "outgoing" (right-aligned). */
  viewer: SenderKind;
  onSend: (content: string) => Promise<unknown>;
  sending?: boolean;
  /** Shown instead of the composer (e.g. employee no longer active). */
  disabledReason?: string | null;
  header?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  placeholder?: string;
  className?: string;
}

/** A conversation: day chips, sender runs, read receipts and an Enter-to-send composer. */
export function ChatThread({
  messages,
  loading,
  viewer,
  onSend,
  sending,
  disabledReason,
  header,
  emptyTitle = "No messages yet",
  emptyDescription = "Say hello. Messages are private between you and HR.",
  placeholder = "Write a message…",
  className,
}: ChatThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: ChatMessage[] }> = [];
    for (const m of messages) {
      const day = dayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const lastOutgoingId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender_kind === viewer) return messages[i].id;
    return null;
  }, [messages, viewer]);

  // Stick to the newest message.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  // Grow the composer with its content (up to ~6 lines).
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [draft]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    try {
      await onSend(content);
    } catch {
      setDraft(content); // keep what they wrote so they can retry
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {header}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5" aria-live="polite">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                <Skeleton className={cn("h-12 rounded-2xl", i % 2 ? "w-1/2" : "w-2/3")} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon={MessageCircle} title={emptyTitle} description={emptyDescription} compact className="h-full" />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.day} aria-label={g.day} className="space-y-1.5">
                <div className="sticky top-0 z-10 flex justify-center py-1">
                  <span className="rounded-full border border-border/70 bg-background/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
                    {g.day}
                  </span>
                </div>
                {g.items.map((m, i) => {
                  const outgoing = m.sender_kind === viewer;
                  const prev = g.items[i - 1];
                  const startsRun = !prev || prev.sender_kind !== m.sender_kind || prev.sender_name !== m.sender_name;
                  return (
                    <div key={m.id} className={cn("flex flex-col", outgoing ? "items-end" : "items-start", startsRun && i > 0 && "pt-2")}>
                      {startsRun && m.sender_name && (
                        <span className="mb-0.5 px-1 text-[10px] font-bold text-muted-foreground">{outgoing && m.mine ? "You" : m.sender_name}</span>
                      )}
                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm sm:max-w-[70%]",
                          outgoing ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-foreground",
                          m.pending && "opacity-70",
                        )}
                      >
                        {m.content}
                      </div>
                      <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                        {m.pending ? (
                          <>
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sending
                          </>
                        ) : (
                          timeLabel(m.created_at)
                        )}
                        {outgoing && m.id === lastOutgoingId && m.read_at && (
                          <>
                            <CheckCheck className="h-3 w-3 text-primary" aria-hidden /> Seen
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border/70 bg-card/80 px-3 py-2.5 sm:px-4">
        {disabledReason ? (
          <p className="py-1.5 text-center text-xs text-muted-foreground">{disabledReason}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="chat-composer" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-composer"
              ref={textarea}
              rows={1}
              value={draft}
              maxLength={MAX_LENGTH}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="max-h-[148px] min-h-[40px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[13px] leading-snug outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-xl" disabled={!draft.trim() || sending} aria-label="Send message">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </Button>
          </form>
        )}
        {!disabledReason && (
          <p className="mt-1 hidden text-[10px] text-muted-foreground sm:block">
            Enter sends · Shift + Enter for a new line
            {draft.length > MAX_LENGTH * 0.8 && <span className="ml-2 font-semibold text-warning">{MAX_LENGTH - draft.length} characters left</span>}
          </p>
        )}
      </div>
    </div>
  );
}
