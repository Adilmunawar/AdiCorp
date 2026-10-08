import { useMemo, useState } from "react";
import { Link2, Link2Off, Loader2, Sparkles, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton, EmptyState, ListSkeleton, SectionCard, TabsNav, formatRelative } from "@/components/kit";
import { useLinkTerminal, useTerminalIds, useUnlinkTerminal } from "../api";
import { PersonCell } from "./shared";

const TABS = [
  { value: "unmatched", label: "Unlinked IDs" },
  { value: "people", label: "People without an ID" },
  { value: "linked", label: "Linked" },
];

export function TerminalLinksPanel() {
  const { data, isLoading } = useTerminalIds();
  const link = useLinkTerminal();
  const unlink = useUnlinkTerminal();
  const [view, setView] = useState("unmatched");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<Record<string, string>>({});

  const tabs = TABS.map((t) => ({
    ...t,
    badge: t.value === "unmatched" ? data?.unmatched.length : t.value === "people" ? data?.not_linked.length : data?.linked.length,
  }));
  // Certain only when no other unlinked ID points at the same person: linking a second ID to someone
  // moves their link, so two IDs matching one person (code and CNIC) are left for HR to pick.
  const suggestions = useMemo(() => {
    const unmatched = data?.unmatched ?? [];
    const perPerson = new Map<string, number>();
    for (const u of unmatched) if (u.suggestion) perPerson.set(u.suggestion.employee_id, (perPerson.get(u.suggestion.employee_id) ?? 0) + 1);
    return unmatched.filter((u) => !!u.suggestion && perPerson.get(u.suggestion.employee_id) === 1);
  }, [data?.unmatched]);

  const linkAllSuggested = async () => {
    try {
      for (const u of suggestions) {
        if (u.suggestion) await link.mutateAsync({ pin: u.device_user_id, employeeId: u.suggestion.employee_id });
      }
    } catch {
      // The mutation shows the error; the ones linked so far stay linked.
    }
  };

  return (
    <SectionCard
      title="Terminal IDs"
      description="Link the ID each person uses on the time clock. Stored punches count as soon as the ID is linked."
      icon={Users}
      actions={
        suggestions.length > 0 ? (
          <Button size="sm" variant="outline" className="rounded-xl" disabled={link.isPending} onClick={linkAllSuggested}>
            {link.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Link {suggestions.length} certain match{suggestions.length === 1 ? "" : "es"}
          </Button>
        ) : undefined
      }
    >
      <TabsNav tabs={tabs} value={view} onChange={setView} className="mb-3" />
      {isLoading || !data ? (
        <ListSkeleton rows={3} />
      ) : view === "unmatched" ? (
        data.unmatched.length === 0 ? (
          <EmptyState compact icon={Link2} title="Every punching ID is linked" description="New IDs show up here the first time they punch." />
        ) : (
          <ul className="divide-y divide-border">
            {data.unmatched.map((u) => {
              const selected = choice[u.device_user_id] ?? u.suggestion?.employee_id ?? "";
              return (
                <li key={u.device_user_id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">
                      ID <span className="font-mono">{u.device_user_id}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {u.punches} punch{u.punches === 1 ? "" : "es"} · last {formatRelative(u.last_punch)}
                      {u.suggestion && <span className="ml-1 font-semibold text-success">· matches {u.suggestion.name}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selected} onValueChange={(v) => setChoice((c) => ({ ...c, [u.device_user_id]: v }))}>
                      <SelectTrigger className="h-9 w-full rounded-xl sm:w-56" aria-label={`Employee for ID ${u.device_user_id}`}>
                        <SelectValue placeholder="Choose a person" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...(u.suggestion ? [u.suggestion] : []), ...data.not_linked.filter((p) => p.employee_id !== u.suggestion?.employee_id)].map((p) => (
                          <SelectItem key={p.employee_id} value={p.employee_id}>
                            {p.name}
                            {p.code ? ` (${p.code})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-9 rounded-xl" disabled={!selected || link.isPending} onClick={() => link.mutate({ pin: u.device_user_id, employeeId: selected })}>
                      Link
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : view === "people" ? (
        data.not_linked.length === 0 ? (
          <EmptyState compact icon={UserPlus} title="Everyone has a terminal ID" />
        ) : (
          <ul className="divide-y divide-border">
            {data.not_linked.map((p) => {
              const pin = pins[p.employee_id] ?? "";
              // Linking an ID that is already someone's moves it, and their punches and marks with it:
              // never let a typo do that silently.
              const owner = data.linked.find((l) => l.device_user_id === pin.trim());
              const valid = /^[A-Za-z0-9_.-]{1,32}$/.test(pin.trim()) && !owner;
              return (
                <li key={p.employee_id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <PersonCell name={p.name} code={p.code} />
                  <div className="flex flex-col gap-1 sm:items-end">
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (valid) link.mutate({ pin: pin.trim(), employeeId: p.employee_id }, { onSuccess: () => setPins((x) => ({ ...x, [p.employee_id]: "" })) });
                      }}
                    >
                      <Input
                        value={pin}
                        onChange={(e) => setPins((x) => ({ ...x, [p.employee_id]: e.target.value }))}
                        placeholder="Terminal ID"
                        maxLength={32}
                        className="h-9 w-full rounded-xl font-mono sm:w-36"
                        aria-label={`Terminal ID for ${p.name}`}
                        aria-invalid={!!owner}
                      />
                      <Button type="submit" size="sm" className="h-9 rounded-xl" disabled={!valid || link.isPending}>
                        Link
                      </Button>
                    </form>
                    {owner && (
                      <p className="text-[11px] text-danger" role="alert">
                        ID {owner.device_user_id} belongs to {owner.name}. Unlink it on the Linked tab first.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : data.linked.length === 0 ? (
        <EmptyState compact icon={Link2} title="No one is linked yet" />
      ) : (
        <ul className="divide-y divide-border">
          {data.linked.map((l) => (
            <li key={l.device_user_id} className="flex items-center justify-between gap-3 py-2.5">
              <PersonCell
                name={l.name}
                code={l.code}
                sub={
                  <>
                    ID <span className="font-mono">{l.device_user_id}</span>
                    {l.auto ? " · linked automatically" : ""}
                    {l.last_punch ? ` · last punch ${formatRelative(l.last_punch)}` : " · no punches yet"}
                  </>
                }
              />
              <ConfirmButton
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 rounded-xl"
                title={`Unlink ID ${l.device_user_id} from ${l.name}?`}
                description="Their punches become unlinked again, and days marked present only from those punches are cleared (locked months are kept)."
                confirmLabel="Unlink"
                onConfirm={() => unlink.mutateAsync(l.device_user_id)}
              >
                <Link2Off className="h-4 w-4" /> Unlink
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
