import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { endOfMonth, format as formatFns, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { Activity, CalendarDays, ChevronDown, Download, FilterX, History, Layers, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useMediaBelow } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, FilterBar, PageHeader, SectionCard, Skeleton, downloadCsv, formatDate, formatDateTime, formatNumber, formatTime, humanize, toDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { MfaGate } from "../mfa";
import { fetchActivityPage, platformKeys, useActivityFacets, usePeopleOptions, type ActivityCursor, type ActivityFilters, type ActivityItem } from "../api";
import { areaMeta, groupActivity, navHref, tidyDescription, type ActivityLike } from "../components/helpers";

const ALL = "__all";

/** "Today", "Yesterday" or "Wednesday, 7 October 2026" for a yyyy-MM-dd day. */
function dayLabel(day: string): string {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === formatDate(now, "yyyy-MM-dd")) return "Today";
  if (day === formatDate(yesterday, "yyyy-MM-dd")) return "Yesterday";
  return formatDate(day, "EEEE, d MMMM yyyy");
}

/** 8 Oct 2026, 14:05 */
const exact = (v: string) => formatDate(v, "d MMM yyyy, HH:mm");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function asFromTo(v: unknown): { from?: unknown; to?: unknown } | null {
  return v && typeof v === "object" && !Array.isArray(v) && ("from" in v || "to" in v) ? (v as { from?: unknown; to?: unknown }) : null;
}

const isUuid = (x: unknown) => typeof x === "string" && UUID_RE.test(x);

/** Internal references (record ids) mean nothing to a reader: keep them out of the details. */
function isInternal(key: string, value: unknown): boolean {
  if (key === "id" || key.endsWith("_id") || key.endsWith("_ids")) return true;
  if (isUuid(value)) return true;
  if (Array.isArray(value) && value.length > 0 && value.every(isUuid)) return true;
  const fromTo = asFromTo(value);
  if (fromTo && (fromTo.from == null || isUuid(fromTo.from)) && (fromTo.to == null || isUuid(fromTo.to)) && (isUuid(fromTo.from) || isUuid(fromTo.to))) return true;
  return false;
}

function valueText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return formatNumber(v, 2);
  if (typeof v === "string") {
    if (DATE_RE.test(v)) return formatDate(v, "d MMM yyyy");
    if (DATETIME_RE.test(v)) return exact(v);
    return /^[a-z]+(_[a-z]+)+$/.test(v) ? humanize(v) : v;
  }
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" && x !== null ? JSON.stringify(x) : valueText(x))).join(", ") : "—";
  return JSON.stringify(v);
}

/** Readable details: {changes:{field:{from,to}}} as "from → to", other keys as key/value. */
function Details({ details }: { details: Record<string, unknown> }) {
  const changes =
    details?.changes && typeof details.changes === "object" && !Array.isArray(details.changes)
      ? Object.entries(details.changes as Record<string, unknown>).filter(([k, v]) => !isInternal(k, v))
      : [];
  const rest = Object.entries(details ?? {}).filter(([k, v]) => k !== "changes" && !isInternal(k, v));
  if (!changes.length && !rest.length) return null;
  return (
    <details className="group mt-1.5">
      <summary className="inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Details <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <dl className="mt-1 grid gap-1 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-5">
        {changes.map(([k, v]) => {
          const fromTo = asFromTo(v);
          return (
            <div key={`c-${k}`} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-2">
              <dt className="truncate text-muted-foreground" title={humanize(k)}>
                {humanize(k)}
              </dt>
              <dd className="min-w-0 break-words">
                {fromTo ? (
                  <>
                    <span className="text-muted-foreground line-through decoration-muted-foreground/40">{valueText(fromTo.from)}</span>
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span className="font-semibold">{valueText(fromTo.to)}</span>
                  </>
                ) : (
                  valueText(v)
                )}
              </dd>
            </div>
          );
        })}
        {rest.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-2">
            <dt className="truncate text-muted-foreground" title={humanize(k)}>
              {humanize(k)}
            </dt>
            <dd className="min-w-0 break-words">{valueText(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Area icon on the timeline rail. */
function AreaDot({ area }: { area: string }) {
  const meta = areaMeta(area);
  return (
    <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm" title={meta.label}>
      <meta.icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

/** "Polls · by Ayesha Khan · Rabia Butt" under an entry. */
function Meta({ item, peopleHref }: { item: ActivityItem; peopleHref: string }) {
  const meta = areaMeta(item.area);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      <span className={cn("rounded-full px-2 py-px text-[11px] font-medium", item.area === "payroll" ? "bg-info-soft text-info" : "bg-muted text-foreground/80")}>{meta.label}</span>
      <span>{item.actor ? `by ${item.actor.name ?? "a staff member"}` : "via the employee portal"}</span>
      {item.employee && (
        <>
          <span aria-hidden className="text-muted-foreground/60">
            ·
          </span>
          <Link to={`${peopleHref}/${item.employee.id}`} className="relative font-semibold text-primary after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:underline">
            {item.employee.name}
          </Link>
        </>
      )}
    </p>
  );
}

function Entry({ item, peopleHref, compact = false }: { item: ActivityItem; peopleHref: string; compact?: boolean }) {
  return (
    <li className={cn("relative grid grid-cols-[40px_32px_minmax(0,1fr)] gap-x-3 px-4 sm:grid-cols-[48px_32px_minmax(0,1fr)] sm:px-5", compact ? "py-2" : "py-3")}>
      <time dateTime={item.created_at} className="tabular pt-1.5 text-xs text-muted-foreground" title={exact(item.created_at)}>
        {formatTime(item.created_at)}
      </time>
      <AreaDot area={item.area} />
      <div className="min-w-0 pt-1">
        <p className="text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]">{tidyDescription(item.description || humanize(item.action.split(".").pop()))}</p>
        <Meta item={item} peopleHref={peopleHref} />
        <Details details={item.details} />
      </div>
    </li>
  );
}

/** Several people doing the same thing on one day, folded into one line that opens to every entry. */
function FoldedEntry({ items, text, peopleHref }: { items: ActivityItem[]; text: string; peopleHref: string }) {
  const [open, setOpen] = useState(false);
  const first = items[0];
  const last = items[items.length - 1];
  const meta = areaMeta(first.area);
  return (
    <li className="relative">
      <div className="grid grid-cols-[40px_32px_minmax(0,1fr)] gap-x-3 px-4 py-3 sm:grid-cols-[48px_32px_minmax(0,1fr)] sm:px-5">
        <time dateTime={first.created_at} className="tabular pt-1.5 text-xs text-muted-foreground" title={`${exact(last.created_at)} to ${exact(first.created_at)}`}>
          {formatTime(first.created_at)}
        </time>
        <span className="relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.06] text-primary shadow-sm" title={meta.label}>
          <Layers className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 pt-1">
          <p className="text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]">{text}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-px text-[11px] font-medium text-foreground/80">{meta.label}</span>
            <span className="tabular">
              {items.length} entries, {formatTime(last.created_at)}–{formatTime(first.created_at)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1 inline-flex min-h-8 items-center gap-1 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? "Hide entries" : `Show all ${items.length}`}
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>
      {open && (
        <ol className="relative z-[1] mb-3 ml-4 mr-4 divide-y divide-border/40 rounded-xl border border-border/60 bg-card sm:ml-[116px] sm:mr-5">
          {items.map((it) => (
            <Entry key={it.id} item={it} peopleHref={peopleHref} compact />
          ))}
        </ol>
      )}
    </li>
  );
}

/** Entries of one day, in order; three or more alike (a run of poll votes) fold into one line. */
function DayEntries({ items, peopleHref }: { items: ActivityItem[]; peopleHref: string }) {
  const rows = useMemo(() => {
    const like: (ActivityLike & { item: ActivityItem })[] = items.map((it) => ({
      id: it.id,
      action: it.action,
      description: it.description,
      created_at: it.created_at,
      actor: it.actor?.name ?? null,
      employee: it.employee?.name ?? null,
      item: it,
    }));
    const groups = groupActivity(like);
    const folded = new Map<string, { text: string; items: ActivityItem[] }>();
    const hidden = new Set<string>();
    for (const g of groups) {
      if (g.items.length < 3) continue;
      folded.set(g.first.id, { text: g.text, items: g.items.map((x) => x.item) });
      g.items.slice(1).forEach((x) => hidden.add(x.id));
    }
    return items.filter((it) => !hidden.has(it.id)).map((it) => ({ item: it, fold: folded.get(it.id) }));
  }, [items]);

  return (
    <ol className="relative divide-y divide-border/40 before:absolute before:bottom-0 before:left-[84px] before:top-0 before:w-px before:bg-border/70 sm:before:left-[96px]">
      {rows.map(({ item, fold }) =>
        fold ? <FoldedEntry key={item.id} items={fold.items} text={fold.text} peopleHref={peopleHref} /> : <Entry key={item.id} item={item} peopleHref={peopleHref} />,
      )}
    </ol>
  );
}

const ymd = (d: Date) => formatFns(d, "yyyy-MM-dd");

/** "8 Oct 2026", "1–8 Oct 2026", "28 Sep – 8 Oct 2026", "From 1 Oct 2026". */
function rangeText(from?: string, to?: string): string {
  const f = toDate(from);
  const t = toDate(to);
  if (f && t) {
    if (from === to) return formatFns(f, "d MMM yyyy");
    if (f.getFullYear() !== t.getFullYear()) return `${formatFns(f, "d MMM yyyy")} – ${formatFns(t, "d MMM yyyy")}`;
    if (f.getMonth() === t.getMonth()) return `${formatFns(f, "d")}–${formatFns(t, "d MMM yyyy")}`;
    return `${formatFns(f, "d MMM")} – ${formatFns(t, "d MMM yyyy")}`;
  }
  if (f) return `From ${formatFns(f, "d MMM yyyy")}`;
  if (t) return `Until ${formatFns(t, "d MMM yyyy")}`;
  return "Any date";
}

/** Date range with quick presets; dates read "8 Oct 2026" whatever the browser's locale. */
function DateRangeFilter({ from, to, onChange }: { from?: string; to?: string; onChange: (from?: string, to?: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = startOfDay(new Date());
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: subDays(today, 1), to: subDays(today, 1) },
    { label: "Last 7 days", from: subDays(today, 6), to: today },
    { label: "Last 30 days", from: subDays(today, 29), to: today },
    { label: "This month", from: startOfMonth(today), to: today },
    { label: "Last month", from: startOfMonth(subMonths(today, 1)), to: endOfMonth(subMonths(today, 1)) },
  ];
  const pick = (f?: string, t?: string) => {
    onChange(f, t);
    if (f && t) setOpen(false);
  };
  const active = !!(from || to);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 w-full justify-start rounded-xl text-xs font-normal sm:w-auto", active ? "border-primary/30 text-foreground" : "text-muted-foreground")}
          aria-label={`Date range: ${rangeText(from, to)}`}
        >
          <CalendarDays className="text-muted-foreground" /> {rangeText(from, to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-wrap gap-1 border-b border-border/60 p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
            {presets.map((p) => {
              const on = from === ymd(p.from) && to === ymd(p.to);
              return (
                <Button key={p.label} variant={on ? "secondary" : "ghost"} size="sm" className="h-8 justify-start text-xs" onClick={() => pick(ymd(p.from), ymd(p.to))}>
                  {p.label}
                </Button>
              );
            })}
            {active && (
              <Button variant="ghost" size="sm" className="h-8 justify-start text-xs text-muted-foreground" onClick={() => pick()}>
                Any date
              </Button>
            )}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={{ from: toDate(from) ?? undefined, to: toDate(to) ?? undefined }}
            defaultMonth={toDate(from) ?? today}
            disabled={{ after: today }}
            onSelect={(r) => pick(r?.from ? ymd(r.from) : undefined, r?.to ? ymd(r.to) : undefined)}
            className="rounded-none border-0 shadow-none"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimelineSkeleton() {
  return (
    <div className="divide-y divide-border/40" aria-busy="true" aria-label="Loading the timeline">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="grid grid-cols-[40px_32px_minmax(0,1fr)] gap-x-3 px-4 py-3 sm:grid-cols-[48px_32px_minmax(0,1fr)] sm:px-5">
          <Skeleton className="mt-1.5 h-3 w-9" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-2 pt-1">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineBody() {
  const { companyId } = useAuth();
  const [params, setParams] = useSearchParams();
  const facets = useActivityFacets();
  const people = usePeopleOptions();

  const filters: ActivityFilters = useMemo(
    () => ({
      area: params.get("area") ?? undefined,
      employee: params.get("employee") ?? undefined,
      actor: params.get("actor") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      search: params.get("q") ?? undefined,
    }),
    [params],
  );
  const active = Object.values(filters).some(Boolean);
  const pickedFilters = [filters.area, filters.employee, filters.actor, filters.from || filters.to].filter(Boolean).length;
  const phone = useMediaBelow(640);
  const [showFilters, setShowFilters] = useState(false);

  const setFilter = (key: string, value: string | undefined) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  };

  const setRange = (from?: string, to?: string) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [key, value] of [
          ["from", from],
          ["to", to],
        ] as const) {
          if (value) p.set(key, value);
          else p.delete(key);
        }
        return p;
      },
      { replace: true },
    );
  };

  const feed = useInfiniteQuery({
    queryKey: platformKeys.activity(companyId, filters),
    enabled: !!companyId,
    initialPageParam: null as ActivityCursor | null,
    queryFn: ({ pageParam }) => fetchActivityPage(filters, pageParam),
    getNextPageParam: (last): ActivityCursor | undefined => (last.next_before ? { before: last.next_before, id: last.next_before_id } : undefined),
  });

  const items = useMemo(() => {
    // Each entry once, even if a page is refetched while older pages are loaded.
    const seen = new Set<string>();
    return (feed.data?.pages.flatMap((p) => p.items) ?? []).filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
  }, [feed.data]);
  const groups = useMemo(() => {
    const out: { day: string; items: ActivityItem[] }[] = [];
    for (const item of items) {
      const day = formatDate(item.created_at, "yyyy-MM-dd");
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(item);
      else out.push({ day, items: [item] });
    }
    return out;
  }, [items]);

  const areas = facets.data?.areas ?? [];
  const total = areas.reduce((a, x) => a + x.count, 0);
  const topAreas = areas.slice(0, 6);

  const exportCsv = () => {
    downloadCsv(items, `timeline-${formatDate(new Date(), "yyyy-MM-dd")}`, [
      { header: "When", value: (r) => formatDateTime(r.created_at) },
      { header: "Area", value: (r) => areaMeta(r.area).label },
      { header: "Description", value: (r) => tidyDescription(r.description) },
      { header: "By", value: (r) => r.actor?.name ?? (r.actor ? "Staff member" : "Employee portal") },
      { header: "Employee", value: (r) => r.employee?.name ?? "" },
    ]);
    toast.success(`Exported ${formatNumber(items.length, 0)} ${items.length === 1 ? "entry" : "entries"}`, { description: "Load older entries first to include more." });
  };

  const peopleHref = navHref("people", "/employees");

  return (
    <>
      <PageHeader
        eyebrow="Audit"
        title="Timeline"
        description={total ? `Every change across the workspace, newest first. ${formatNumber(total, 0)} entries recorded.` : "Every change across the workspace, newest first."}
        icon={History}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!items.length} title="Exports the entries loaded below">
            <Download /> Export CSV
          </Button>
        }
      />

      {/* overflow-clip (not hidden) so the day headings can stick while the page scrolls. */}
      <SectionCard flush className="overflow-clip">
        <div className="space-y-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
          {/* Keep the text as typed (the server trims it): echoing a trimmed value back would delete the
              space after a word while the person is still typing ("Ayesha Khan" became "AyeshaKhan"). */}
          <FilterBar search={filters.search ?? ""} onSearchChange={(v) => setFilter("q", v.trim() ? v : undefined)} placeholder="Search descriptions">
            {phone && (
              <Button variant="outline" size="sm" className="h-9 w-full justify-between rounded-xl text-xs" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters || pickedFilters > 0}>
                <span className="flex items-center gap-2">
                  <SlidersHorizontal /> Filters{pickedFilters ? ` · ${pickedFilters}` : ""}
                </span>
                <ChevronDown className={cn("transition-transform", (showFilters || pickedFilters > 0) && "rotate-180")} />
              </Button>
            )}
            {(!phone || showFilters || pickedFilters > 0) && (
              <>
                <Select value={filters.area ?? ALL} onValueChange={(v) => setFilter("area", v === ALL ? undefined : v)}>
                  <SelectTrigger className="h-9 w-full rounded-xl text-xs sm:w-[170px]" aria-label="Filter by area">
                    <SelectValue placeholder="All areas" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={ALL}>All areas</SelectItem>
                    {areas.map((a) => (
                      <SelectItem key={a.area} value={a.area}>
                        {areaMeta(a.area).label} ({formatNumber(a.count, 0)})
                      </SelectItem>
                    ))}
                    {filters.area && !areas.some((a) => a.area === filters.area) && <SelectItem value={filters.area}>{areaMeta(filters.area).label}</SelectItem>}
                  </SelectContent>
                </Select>
                <Select value={filters.employee ?? ALL} onValueChange={(v) => setFilter("employee", v === ALL ? undefined : v)}>
                  <SelectTrigger className="h-9 w-full rounded-xl text-xs sm:w-[170px]" aria-label="Filter by employee">
                    <SelectValue placeholder="Any employee" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={ALL}>Any employee</SelectItem>
                    {(people.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.status === "active" ? "" : p.status === "separated" || p.status === "terminated" ? " (separated)" : ` (${humanize(p.status).toLowerCase()})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filters.actor ?? ALL} onValueChange={(v) => setFilter("actor", v === ALL ? undefined : v)}>
                  <SelectTrigger className="h-9 w-full rounded-xl text-xs sm:w-[160px]" aria-label="Filter by who acted">
                    <SelectValue placeholder="Anyone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={ALL}>Anyone</SelectItem>
                    {(facets.data?.actors ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.role ? ` (${a.role === "hr" ? "HR" : humanize(a.role)})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangeFilter from={filters.from} to={filters.to} onChange={setRange} />
              </>
            )}
            {active && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                <FilterX /> Clear
              </Button>
            )}
          </FilterBar>
          {topAreas.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 hide-scrollbar" role="group" aria-label="Quick area filters">
              {[{ area: "", count: total }, ...topAreas].map((a) => {
                const on = (filters.area ?? "") === a.area;
                const meta = a.area ? areaMeta(a.area) : { label: "Everything", icon: Activity };
                return (
                  <button
                    key={a.area || "all"}
                    type="button"
                    onClick={() => setFilter("area", a.area || undefined)}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary/30 bg-primary/[0.08] text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <meta.icon className="h-3.5 w-3.5" aria-hidden />
                    {meta.label}
                    <span className="tabular text-[11px] opacity-80">{formatNumber(a.count, 0)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {feed.isPending ? (
          <TimelineSkeleton />
        ) : feed.isError ? (
          <EmptyState
            icon={Activity}
            title="The timeline could not load"
            description={feed.error instanceof Error ? feed.error.message : "Please try again."}
            action={
              <Button size="sm" onClick={() => void feed.refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={History}
            title={active ? "Nothing matches these filters" : "No activity yet"}
            description={active ? "Try a wider date range or another area." : "Changes to people, time, leave and settings are recorded here as they happen."}
            action={
              active ? (
                <Button size="sm" variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  <FilterX /> Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-border/60">
            {groups.map((g) => (
              <section key={g.day} aria-label={formatDate(g.day, "EEEE d MMMM yyyy")}>
                <h3 className="sticky top-0 z-[2] flex items-baseline gap-2 border-b border-border/60 bg-muted/90 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur sm:px-5">
                  {dayLabel(g.day)}
                  <span className="tabular font-semibold normal-case tracking-normal">
                    {g.items.length} {g.items.length === 1 ? "entry" : "entries"}
                    {feed.hasNextPage && g === groups[groups.length - 1] ? " loaded" : ""}
                  </span>
                </h3>
                <DayEntries items={g.items} peopleHref={peopleHref} />
              </section>
            ))}
            <div className="flex flex-col items-center gap-1 p-4">
              {feed.hasNextPage ? (
                <Button variant="outline" size="sm" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
                  {feed.isFetchingNextPage ? <Loader2 className="animate-spin" /> : <ChevronDown />} Load older entries
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">That's everything{active ? " for these filters" : ""}.</p>
              )}
              <p className="tabular text-[11px] text-muted-foreground">{formatNumber(items.length, 0)} shown</p>
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}

export default function TimelinePage() {
  return (
    <MfaGate>
      <TimelineBody />
    </MfaGate>
  );
}
