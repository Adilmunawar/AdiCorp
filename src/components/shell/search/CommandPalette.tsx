import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowRight, CornerDownLeft, Loader2, Search, Sparkles, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { navForRole, searchCommands, searchSources } from "@/modules/registry";
import type { SearchResult } from "@/modules/types";
import { useDebouncedValue } from "@/components/kit/FilterBar";
import { cn } from "@/lib/utils";
import { MOD_KEY, useSearch } from "./SearchProvider";

interface Entry {
  id: string;
  label: string;
  subtitle?: string;
  icon?: LucideIcon;
  keywords: string[];
  run: () => void;
}

interface Group {
  heading: string;
  entries: Entry[];
}

/**
 * Adds entries under `heading`, merging into an existing group of that name. An entry whose id
 * is already listed is skipped, so two sources that find the same record (same link) show it once.
 */
function addEntries(out: Group[], seen: Set<string>, heading: string, entries: Entry[]): void {
  const fresh = entries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  if (fresh.length === 0) return;
  const group = out.find((g) => g.heading === heading);
  if (group) group.entries.push(...fresh);
  else out.push({ heading, entries: fresh });
}

function matches(entry: Entry, q: string): boolean {
  if (!q) return true;
  const hay = [entry.label, entry.subtitle ?? "", ...entry.keywords].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/** Global staff palette (Ctrl/Cmd+K): pages, quick actions, page commands and module search sources. */
export function CommandPalette() {
  const { open, setOpen, commands: pageCommands } = useSearch();
  const { role, companyId } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  const sources = useMemo(() => (role ? searchSources.filter((s) => s.roles.includes(role)) : []), [role]);

  const remote = useQuery({
    queryKey: ["platform", companyId, "search", role, debounced],
    enabled: open && !!companyId && !!role && debounced.length >= 2 && sources.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const settled = await Promise.allSettled(
        sources.map(async (s) => ({ source: s, results: await s.search({ query: debounced, companyId: companyId!, role: role! }) })),
      );
      return settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    },
  });

  const groups = useMemo<Group[]>(() => {
    if (!role) return [];
    const q = query.trim();
    const out: Group[] = [];
    const seen = new Set<string>();

    const page = pageCommands.map<Entry & { group: string }>((c) => ({
      id: `cmd:${c.id}`,
      label: c.label,
      icon: c.icon,
      keywords: c.keywords ?? [],
      group: c.group ?? "This page",
      run: () => {
        setOpen(false);
        if (c.onSelect) c.onSelect();
        else if (c.href) navigate(c.href);
      },
    }));
    const pageGroups = new Map<string, Entry[]>();
    page.filter((e) => matches(e, q)).forEach((e) => pageGroups.set(e.group, [...(pageGroups.get(e.group) ?? []), e]));
    pageGroups.forEach((entries, heading) => addEntries(out, seen, heading, entries));

    const actions = searchCommands
      .filter((c) => c.roles.includes(role))
      .map<Entry & { group: string }>((c) => ({
        id: `action:${c.id}`,
        label: c.label,
        icon: c.icon ?? Sparkles,
        keywords: c.keywords ?? [],
        group: c.group ?? "Quick actions",
        run: () => go(c.href),
      }))
      .filter((e) => matches(e, q));
    const actionGroups = new Map<string, Entry[]>();
    actions.forEach((e) => actionGroups.set(e.group, [...(actionGroups.get(e.group) ?? []), e]));
    actionGroups.forEach((entries, heading) => addEntries(out, seen, heading, entries.slice(0, q ? 8 : 5)));

    if (q && remote.data) {
      remote.data.forEach(({ source, results }) => {
        addEntries(
          out,
          seen,
          source.label,
          // Keyed by destination: two modules searching the same table (e.g. employees) list each person once.
          results.slice(0, 8).map((r: SearchResult) => ({
            id: `result:${r.href}`,
            label: r.title,
            subtitle: r.subtitle,
            icon: r.icon,
            keywords: r.keywords ?? [],
            run: () => go(r.href),
          })),
        );
      });
    }

    const pages = navForRole(role)
      .flatMap((s) => s.items.map((i) => ({ ...i, group: s.group })))
      .map<Entry>((i) => ({
        id: `nav:${i.key}`,
        label: i.label,
        subtitle: i.group,
        icon: i.icon,
        keywords: [i.group, i.href],
        run: () => go(i.href),
      }))
      .filter((e) => matches(e, q));
    addEntries(out, seen, "Go to", pages);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, query, pageCommands, remote.data]);

  const searching = remote.isFetching && debounced.length >= 2;
  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12%] max-w-[calc(100vw-1.5rem)] translate-y-0 gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-2xl sm:max-w-xl [&>button]:hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search pages, people and actions</DialogDescription>
        <CommandPrimitive shouldFilter={false} loop className="flex max-h-[min(70vh,560px)] flex-col">
          <div className="flex items-center gap-2 border-b border-border/70 px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, people, actions…"
              className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-label="Searching" />}
            <kbd className="hidden shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline">Esc</kbd>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1 h-10 shrink-0 rounded-lg px-2 text-[13px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
            >
              Cancel
            </button>
          </div>
          <CommandPrimitive.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {total === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-foreground">{searching ? "Searching…" : "No results"}</p>
                {!searching && query && <p className="mt-1 text-xs text-muted-foreground">Try a name, an employee code or a page.</p>}
              </div>
            )}
            {groups.map((group) => (
              <CommandPrimitive.Group
                key={group.heading}
                heading={group.heading}
                className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {group.entries.map((entry) => {
                  const Icon = entry.icon ?? ArrowRight;
                  return (
                    <CommandPrimitive.Item
                      key={entry.id}
                      value={entry.id}
                      onSelect={entry.run}
                      className={cn(
                        "group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm outline-none",
                        "data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground",
                      )}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-data-[selected=true]:bg-primary-foreground/15 group-data-[selected=true]:text-primary-foreground">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{entry.label}</span>
                        {entry.subtitle && (
                          <span className="block truncate text-[11px] text-muted-foreground group-data-[selected=true]:text-primary-foreground/75">{entry.subtitle}</span>
                        )}
                      </span>
                      <CornerDownLeft className="hidden h-3.5 w-3.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-80 sm:block" aria-hidden />
                    </CommandPrimitive.Item>
                  );
                })}
              </CommandPrimitive.Group>
            ))}
          </CommandPrimitive.List>
          <div className="hidden items-center gap-3 border-t border-border/70 bg-muted/30 px-4 py-2 text-[10px] font-semibold text-muted-foreground sm:flex">
            <span>
              <kbd className="rounded border border-border bg-background px-1">↑</kbd> <kbd className="rounded border border-border bg-background px-1">↓</kbd> to move
            </span>
            <span>
              <kbd className="rounded border border-border bg-background px-1">Enter</kbd> to open
            </span>
            <span className="ml-auto">
              <kbd className="rounded border border-border bg-background px-1">{MOD_KEY}</kbd> <kbd className="rounded border border-border bg-background px-1">K</kbd> anywhere
            </span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
