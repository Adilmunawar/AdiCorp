import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Inbox, MessageCircle, MessageSquarePlus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, StatusBadge, TabsNav, formatRelative } from "@/components/kit";
import { cn } from "@/lib/utils";
import { errorMessage, useInboxRealtime, useMessageDirectory, useSendMessage, useThread, useThreads } from "../lib/api";
import type { Thread } from "../lib/types";
import { ChatThread } from "../components/ChatThread";
import { PersonAvatar } from "../components/PersonAvatar";
import { LoadError } from "../components/LoadError";
import { StaffExtras } from "../components/PageExtras";

function matches(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function NewConversationDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (id: string) => void }) {
  const directory = useMessageDirectory(open);
  const [query, setQuery] = useState("");
  const people = (directory.data ?? []).filter((p) => matches(`${p.name} ${p.rank ?? ""} ${p.department ?? ""}`, query));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="font-display text-base font-semibold">New conversation</DialogTitle>
          <DialogDescription className="text-xs">Pick an employee. They get a notification when you write.</DialogDescription>
        </DialogHeader>
        <div className="px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, role or department" aria-label="Search employees" className="h-9 rounded-xl pl-8 text-xs" />
          </div>
        </div>
        <div className="max-h-[50dvh] overflow-y-auto px-2 pb-3">
          {directory.isPending ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : people.length === 0 ? (
            <EmptyState icon={UserRound} title="Nobody found" description={directory.data?.length ? "Try another name." : "Add employees first, then message them here."} compact />
          ) : (
            <ul>
              {people.map((p) => (
                <li key={p.employee_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p.employee_id);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <PersonAvatar name={p.name} src={p.avatar_url} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{p.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{[p.rank, p.department].filter(Boolean).join(" · ") || "Employee"}</span>
                    </span>
                    {p.has_thread && <span className="text-[10px] font-semibold text-muted-foreground">Open thread</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThreadRow({ t, active, onOpen }: { t: Thread; active: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active || undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
          active ? "bg-primary/[0.08]" : "hover:bg-muted/70",
        )}
      >
        <span className="relative">
          <PersonAvatar name={t.name} src={t.avatar_url} size="md" />
          {t.unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-xs", t.unread ? "font-bold text-foreground" : "font-semibold text-foreground/90")}>{t.name}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(t.last_at)}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-[11px]", t.unread ? "font-semibold text-foreground/80" : "text-muted-foreground")}>
              {t.last_from_staff && <span className="text-muted-foreground">You: </span>}
              {t.last_content}
            </span>
            {t.unread > 0 && (
              <span className="tabular min-w-[18px] shrink-0 rounded-full bg-primary px-1.5 py-px text-center text-[9px] font-bold text-primary-foreground">
                {t.unread > 99 ? "99+" : t.unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("employee");
  const threads = useThreads();
  const thread = useThread(selected);
  const send = useSendMessage();
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  useInboxRealtime(selected);

  const list = useMemo(
    () => (threads.data ?? []).filter((t) => (!unreadOnly || t.unread > 0) && matches(`${t.name} ${t.rank ?? ""} ${t.department ?? ""} ${t.last_content}`, query)),
    [threads.data, unreadOnly, query],
  );
  const unreadTotal = (threads.data ?? []).reduce((n, t) => n + t.unread, 0);

  const select = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("employee", id);
        else next.delete("employee");
        return next;
      },
      { replace: false },
    );

  const employee = thread.data?.employee;
  const inactive = employee && employee.status !== "active";

  return (
    <div className="flex h-[calc(100dvh-56px-2.5rem)] min-h-[420px] flex-col lg:h-[calc(100dvh-56px-3.5rem)]">
      <StaffExtras showComingUp={false} />
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Thread list */}
        <aside className={cn("flex min-h-0 w-full flex-col border-r border-border/70 md:w-[320px] md:shrink-0 lg:w-[340px]", selected && "hidden md:flex")}>
          <div className="space-y-2.5 border-b border-border/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="micro-label !text-primary">Engagement</p>
                <h1 className="truncate font-display text-base font-semibold">Messages</h1>
              </div>
              <Button size="sm" className="h-8 gap-1.5 rounded-xl text-xs" onClick={() => setCreating(true)}>
                <MessageSquarePlus className="h-3.5 w-3.5" /> New
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" className="h-9 rounded-xl pl-8 text-xs" />
            </div>
            <TabsNav
              tabs={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread", badge: unreadTotal || undefined },
              ]}
              value={unreadOnly ? "unread" : "all"}
              onChange={(v) => setUnreadOnly(v === "unread")}
              className="[&_button]:flex-1 [&_button]:justify-center"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {threads.isPending ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : threads.isError ? (
              <LoadError what="Conversations" error={threads.error} icon={Inbox} onRetry={() => threads.refetch()} inline />
            ) : list.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={(threads.data ?? []).length ? "Nothing here" : "No conversations yet"}
                description={(threads.data ?? []).length ? (unreadOnly ? "You have read everything." : "No conversation matches.") : "Employees can message HR from the portal, or start one yourself."}
                compact
              />
            ) : (
              <ul className="space-y-0.5">
                {list.map((t) => (
                  <ThreadRow key={t.employee_id} t={t} active={t.employee_id === selected} onOpen={() => select(t.employee_id)} />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversation */}
        <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !selected && "hidden md:flex")} aria-label="Conversation">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageCircle}
                title="Pick a conversation"
                description="Every employee has one private thread with HR. Everyone in HR shares this inbox."
                action={
                  <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => setCreating(true)}>
                    <MessageSquarePlus className="h-4 w-4" /> New conversation
                  </Button>
                }
              />
            </div>
          ) : thread.isError ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={UserRound} title="This conversation could not be opened" description={errorMessage(thread.error)} />
            </div>
          ) : (
            <ChatThread
              // One composer per conversation: a draft never follows HR into another employee's thread.
              key={selected}
              viewer="staff"
              messages={thread.data?.messages ?? []}
              loading={thread.isPending}
              disabledReason={inactive ? `${employee?.name} is no longer active, so new messages cannot be sent.` : null}
              emptyTitle="Start the conversation"
              emptyDescription="Your message reaches them in the portal and as a notification."
              onSend={(content) =>
                send.mutateAsync({ employeeId: selected, content }).catch((e) => {
                  toast.error(errorMessage(e));
                  throw e;
                })
              }
              header={
                <div className="flex items-center gap-3 border-b border-border/70 px-3 py-2.5 sm:px-4">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg md:hidden" aria-label="Back to conversations" onClick={() => select(null)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  {employee ? (
                    <>
                      <PersonAvatar name={employee.name} src={employee.avatar_url} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{employee.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{[employee.rank, employee.department].filter(Boolean).join(" · ") || "Employee"}</p>
                      </div>
                      {inactive && <StatusBadge status={employee.status} />}
                      <Button asChild variant="outline" size="sm" className="hidden h-8 rounded-xl text-xs sm:inline-flex">
                        <Link to={`/employees/${employee.id}`}>Profile</Link>
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <Skeleton className="h-3.5 w-40" />
                    </div>
                  )}
                </div>
              }
            />
          )}
        </section>
      </div>
      <NewConversationDialog open={creating} onOpenChange={setCreating} onPick={(id) => select(id)} />
    </div>
  );
}
