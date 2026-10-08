import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, subDays } from "date-fns";
import { Activity, AlertTriangle, BarChart3, ChevronDown, Clock, DoorOpen, Fingerprint, History, Moon, Plane, Radio, RefreshCw, Server, Settings2, TimerReset, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, SectionCard, Skeleton, StatGrid, StatTile, StatusBadge, TabsNav, formatDateTime, formatRelative, useTabParam } from "@/components/kit";
import { useMediaBelow } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useDailySummary, useDevices, usePunchesForDay, useTerminalIds, useTimeSettings } from "../api";
import { personState } from "../components/DailySummaryPanel";
import { DevicesPanel } from "../components/DevicesPanel";
import { TerminalLinksPanel } from "../components/TerminalLinksPanel";
import { RulesCard } from "../components/RulesCard";
import { Flag, LiveDot, PersonCell, useNow } from "../components/shared";
import { clock, companyToday, dayLabel, deviceHealth, formatMinutes, localDate, localHour } from "../lib";
import type { DailyPerson, PunchRow, TimeDevice } from "../types";

const TABS = [
  { value: "live", label: "Live", icon: Radio },
  { value: "setup", label: "Setup", icon: Settings2 },
];

/** Two taps of the same direction this close together are a repeat, not a new event. */
const REPEAT_WINDOW_MS = 5 * 60_000;
const FEED_PAGE = 40;

type FeedFilter = "all" | "in" | "out" | "late";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function LivePage() {
  const [tab] = useTabParam(TABS);
  return (
    <div className="min-w-0">
      <PageHeader title="Live attendance" eyebrow="Time" icon={Activity} description="Punches from your time clocks as they arrive, who is in, who is late and how each time clock is doing.">
        <TabsNav tabs={TABS} />
      </PageHeader>
      {tab === "live" ? <LiveView /> : <SetupView />}
    </div>
  );
}

function LiveView() {
  const { data: settings } = useTimeSettings();
  const tz = settings?.timezone;
  const now = useNow(15_000);
  // Follows the clock: a board left open overnight rolls over to the new day at midnight.
  const today = companyToday(settings?.today, tz, now);
  const yesterday = format(subDays(parseISO(today), 1), "yyyy-MM-dd");
  const [view, setView] = useState<"today" | "yesterday">("today");
  const isToday = view === "today";
  const date = isToday ? today : yesterday;
  const punchesQuery = usePunchesForDay(date);
  const dailyQuery = useDailySummary(date, { live: isToday });
  const devicesQuery = useDevices({ live: true });
  const { data: ids } = useTerminalIds();
  // Phone stat tiles are two to a row: drop the icon wells so labels and hints have room.
  const phone = useMediaBelow(640);

  const punches = useMemo(() => punchesQuery.data ?? [], [punchesQuery.data]);
  // The daily query keeps the previous day while the next loads; never mix two days on screen.
  const daily = dailyQuery.data && dailyQuery.data.date === date ? dailyQuery.data : undefined;
  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);
  const loadingDaily = !daily && !dailyQuery.isError;
  const grace = settings?.grace_minutes ?? daily?.grace_minutes ?? 15;

  const people = useMemo(() => daily?.people ?? [], [daily?.people]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  // Latest punch direction per person (punches come newest first): someone back from a break is in.
  const lastDirection = useMemo(() => {
    const m = new Map<string, PunchRow["direction"]>();
    for (const p of punches) if (p.employee_id && !m.has(p.employee_id)) m.set(p.employee_id, p.direction);
    return m;
  }, [punches]);

  const stats = useMemo(() => {
    const expected = people.filter((p) => p.working && !p.on_leave);
    const arrived = expected.filter((p) => p.punches > 0);
    const isIn = (p: DailyPerson) => {
      if (p.punches === 0) return false;
      const dir = isToday ? lastDirection.get(p.id) : undefined;
      return dir === "in" ? true : dir === "out" ? false : !p.last_out;
    };
    const inOffice = people.filter(isIn);
    const left = people.filter((p) => p.punches > 0 && !isIn(p));
    const firstIns = arrived
      .map((p) => (p.first_in ? clock(p.first_in, tz) : null))
      .filter((v): v is string => !!v && v !== "—")
      .map((v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)));
    const avg = firstIns.length ? Math.round(firstIns.reduce((a, b) => a + b, 0) / firstIns.length) : null;
    const late = people.filter((p) => p.late);
    const lateMinutes = late.map((p) => p.late_minutes ?? 0);
    const missing = daily ? people.filter((p) => p.working && !p.on_leave && ["not_in", "not_due", "absent"].includes(personState(p, daily))) : [];
    const sorted = [...missing].sort((a, b) => a.shift_start.localeCompare(b.shift_start) || a.name.localeCompare(b.name));
    return {
      inOffice: inOffice.length,
      left: left.length,
      arrived: arrived.length,
      expected: expected.length,
      avg: avg === null ? null : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
      late: late.length,
      avgLate: lateMinutes.length ? Math.round(lateMinutes.reduce((a, b) => a + b, 0) / lateMinutes.length) : null,
      // Shift already started (or the day is over) versus still to come.
      overdue: sorted.filter((p) => !isToday || new Date(p.shift_start).getTime() <= now),
      dueLater: isToday ? sorted.filter((p) => new Date(p.shift_start).getTime() > now) : [],
      onLeave: people.filter((p) => p.on_leave),
    };
  }, [people, daily, tz, isToday, now, lastDirection]);

  const health = useMemo(() => devices.map((d) => ({ device: d, health: deviceHealth(d, now) })), [devices, now]);
  const onlineCount = health.filter((h) => h.health.key === "online").length;
  const unmatched = ids?.unmatched.length ?? 0;
  const failing = health.filter((h) => h.health.key === "error" || (h.health.key === "online" && h.device.last_error));
  const updatedAt = Math.max(punchesQuery.dataUpdatedAt, dailyQuery.dataUpdatedAt);
  const fetching = punchesQuery.isFetching || dailyQuery.isFetching || devicesQuery.isFetching;
  const failed = punchesQuery.isError || dailyQuery.isError;
  const quietToday = isToday && !punchesQuery.isLoading && !failed && punches.length === 0;

  const refresh = () => {
    void punchesQuery.refetch();
    void dailyQuery.refetch();
    void devicesQuery.refetch();
  };

  if (!devicesQuery.isLoading && devices.length === 0 && !punchesQuery.isLoading && punches.length === 0 && isToday && !failed) {
    return (
      <SectionCard>
        <EmptyState
          icon={Fingerprint}
          title="No time clock connected yet"
          description="Add a terminal or bridge on the Setup tab. It gets its own secret key and sends punches here in real time; people are marked present automatically."
          action={
            <Button asChild className="rounded-xl">
              <Link to="/attendance/live?tab=setup">Set up a time clock</Link>
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const lateTile = {
    label: "Late",
    value: stats.late,
    hint: stats.avgLate !== null ? `Avg ${formatMinutes(stats.avgLate)} past grace` : `After ${grace} min grace`,
    tone: stats.late > 0 ? ("warning" as const) : ("default" as const),
    icon: TimerReset,
  };
  const tiles = isToday
    ? [
        { label: "In office", value: stats.inOffice, hint: stats.left > 0 ? `${stats.left} already left` : "Not punched out", tone: "success" as const, icon: DoorOpen },
        { label: "Arrived", value: `${stats.arrived}/${stats.expected}`, hint: stats.avg ? `Avg first in ${stats.avg}` : "No one yet", tone: "primary" as const, icon: UserCheck },
        lateTile,
        {
          label: "Not in yet",
          value: stats.overdue.length,
          hint: [stats.dueLater.length > 0 ? `${stats.dueLater.length} due later` : null, `${stats.onLeave.length} on leave`].filter(Boolean).join(" · "),
          tone: stats.overdue.length > 0 ? ("danger" as const) : ("default" as const),
          icon: UserX,
        },
      ]
    : [
        { label: "Present", value: `${stats.arrived}/${stats.expected}`, hint: stats.avg ? `Avg first in ${stats.avg}` : "Nobody punched", tone: "success" as const, icon: UserCheck },
        lateTile,
        {
          label: "No out-punch",
          value: stats.inOffice,
          hint: stats.left > 0 ? `${stats.left} punched out` : "Nobody punched out",
          tone: stats.inOffice > 0 ? ("warning" as const) : ("default" as const),
          icon: DoorOpen,
        },
        { label: "Did not come", value: stats.overdue.length, hint: `${stats.onLeave.length} on leave`, tone: stats.overdue.length > 0 ? ("danger" as const) : ("default" as const), icon: UserX },
      ];

  return (
    <div className="space-y-4">
      <LiveStatusBar
        tz={tz}
        date={date}
        isToday={isToday}
        view={view}
        onViewChange={setView}
        now={now}
        updatedAt={updatedAt}
        fetching={fetching}
        failed={failed}
        online={onlineCount}
        total={devices.length}
        onRefresh={refresh}
      />

      {failed && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            Live data could not be loaded. Check the connection and try again.
          </p>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={refresh}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </Button>
        </div>
      )}

      {quietToday && (
        <div className="flex flex-col gap-2 rounded-2xl border border-info/15 bg-info-soft p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-foreground">
            <Moon className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
            <span>
              No punches yet today{stats.dueLater[0] ? `; the first shift starts at ${clock(stats.dueLater[0].shift_start, tz)}` : ""}. Yesterday is one tap away.
            </span>
          </p>
          <Button size="sm" variant="outline" className="shrink-0 rounded-xl bg-card" onClick={() => setView("yesterday")}>
            <History className="h-4 w-4" aria-hidden /> Show yesterday
          </Button>
        </div>
      )}

      <StatGrid columns={4}>
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} hint={t.hint} tone={t.tone} icon={phone ? undefined : t.icon} loading={loadingDaily} />
        ))}
      </StatGrid>

      {isToday && (unmatched > 0 || failing.length > 0) && (
        <div className="flex flex-col gap-2 rounded-2xl border border-warning/20 bg-warning-soft p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>
              {[
                unmatched > 0 ? `${plural(unmatched, "terminal ID")} ${unmatched === 1 ? "is" : "are"} punching without being linked to anyone.` : null,
                failing.length > 0 ? `${failing.map((f) => f.device.name).join(", ")} reported ${failing.length === 1 ? "a problem" : "problems"}.` : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
          </p>
          <Button asChild size="sm" variant="outline" className="shrink-0 rounded-xl bg-card">
            <Link to="/attendance/live?tab=setup">Review in setup</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <PunchFeed key={date} punches={punches} loading={punchesQuery.isLoading} byId={byId} tz={tz} now={now} isToday={isToday} />

        <div className="min-w-0 space-y-4">
          <DeviceHealthCard health={health} punches={punches} loading={devicesQuery.isLoading} tz={tz} date={date} isToday={isToday} now={now} />
          <ArrivalsChart people={people} tz={tz} loading={loadingDaily} isToday={isToday} />
          <NotInCard overdue={stats.overdue} dueLater={stats.dueLater} onLeave={stats.onLeave} loading={loadingDaily} tz={tz} date={date} isToday={isToday} now={now} grace={grace} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LiveStatusBar({
  tz,
  date,
  isToday,
  view,
  onViewChange,
  now,
  updatedAt,
  fetching,
  failed,
  online,
  total,
  onRefresh,
}: {
  tz: string | undefined;
  date: string;
  isToday: boolean;
  view: "today" | "yesterday";
  onViewChange: (v: "today" | "yesterday") => void;
  now: number;
  updatedAt: number;
  fetching: boolean;
  failed: boolean;
  online: number;
  total: number;
  onRefresh: () => void;
}) {
  const localTime = clock(new Date(now).toISOString(), tz);
  const zone = tz ? tz.split("/").pop()?.replace(/_/g, " ") : null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
        {isToday ? (
          <>
            <LiveDot tone={failed ? "danger" : "success"} pulse={!failed} />
            <span className="shrink-0 font-semibold text-foreground">{failed ? "Connection lost" : "Live"}</span>
          </>
        ) : (
          <>
            <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="shrink-0 font-semibold text-foreground">Looking back</span>
          </>
        )}
        <span className="min-w-0 truncate text-muted-foreground">
          {format(parseISO(date), "EEEE d MMM")}
          {isToday && (
            <>
              {" · "}
              <span className="tabular">{localTime}</span>
              {zone ? ` ${zone} time` : ""}
            </>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Day">
          {(["today", "yesterday"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              aria-pressed={view === v}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-semibold transition-colors sm:h-7",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "today" ? "Today" : "Yesterday"}
            </button>
          ))}
        </div>
        {total > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" aria-hidden />
            {online} of {plural(total, "time clock")} online
          </span>
        )}
        {updatedAt > 0 && (
          <span title={formatDateTime(updatedAt)} className="tabular">
            Updated {now - updatedAt < 60_000 ? "just now" : formatRelative(updatedAt)}
          </span>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onRefresh} disabled={fetching} aria-label="Refresh now" title="Refresh now">
          <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin motion-reduce:animate-none")} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface FeedItem {
  punch: PunchRow;
  lateMinutes: number | null;
  earlyMinutes: number | null;
  repeat: boolean;
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function PunchFeed({
  punches,
  loading,
  byId,
  tz,
  now,
  isToday,
}: {
  punches: PunchRow[];
  loading: boolean;
  byId: Map<string, DailyPerson>;
  tz: string | undefined;
  now: number;
  isToday: boolean;
}) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [expanded, setExpanded] = useState(false);
  // Punches present on first load are history; anything after that arrived while watching.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null && !loading) seen.current = new Set(punches.map((p) => p.id));

  const items = useMemo<FeedItem[]>(() => {
    // punches come newest first; walk oldest first to spot repeats.
    const lastByKey = new Map<string, number>();
    const repeat = new Set<string>();
    for (let i = punches.length - 1; i >= 0; i--) {
      const p = punches[i];
      const key = `${p.employee_id ?? `id:${p.device_user_id}`}|${p.direction}`;
      const at = new Date(p.punch_at).getTime();
      const prev = lastByKey.get(key);
      if (prev !== undefined && at - prev < REPEAT_WINDOW_MS) repeat.add(p.id);
      lastByKey.set(key, at);
    }
    return punches.map((p) => {
      const person = p.employee_id ? byId.get(p.employee_id) : undefined;
      const isFirstIn = !!person && sameInstant(person.first_in, p.punch_at);
      const isLastOut = !!person && sameInstant(person.last_out, p.punch_at);
      return {
        punch: p,
        lateMinutes: isFirstIn && person?.late ? person.late_minutes : null,
        earlyMinutes: isLastOut && person?.left_early ? person.early_minutes : null,
        repeat: repeat.has(p.id),
      };
    });
  }, [punches, byId]);

  const counts = useMemo(
    () => ({
      all: items.length,
      in: items.filter((i) => i.punch.direction === "in").length,
      out: items.filter((i) => i.punch.direction === "out").length,
      late: items.filter((i) => i.lateMinutes !== null).length,
    }),
    [items],
  );

  const filtered = items.filter((i) => (filter === "all" ? true : filter === "late" ? i.lateMinutes !== null : i.punch.direction === filter));
  const visible = expanded ? filtered : filtered.slice(0, FEED_PAGE);
  const latest = punches[0];

  const FILTERS: { value: FeedFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "in", label: "In" },
    { value: "out", label: "Out" },
    { value: "late", label: "Late" },
  ];

  return (
    <SectionCard
      flush
      title="Punch feed"
      icon={Fingerprint}
      description={
        loading
          ? "Loading punches…"
          : latest
            ? `${plural(punches.length, "punch", "punches")} ${isToday ? "today" : "that day"} · last at ${clock(latest.punch_at, tz)}`
            : isToday
              ? "Waiting for the first punch of the day"
              : "No punches that day"
      }
      actions={
        <div className="flex rounded-xl border border-border p-0.5" role="group" aria-label="Show punches">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setFilter(f.value);
                setExpanded(false);
              }}
              aria-pressed={filter === f.value}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:h-7",
                filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className={cn("tabular text-[10.5px]", filter === f.value ? "text-primary-foreground/80" : "text-muted-foreground/80")}>{counts[f.value]}</span>
            </button>
          ))}
        </div>
      }
      footer={
        filtered.length > FEED_PAGE ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="tabular">
              Showing {visible.length} of {filtered.length}
            </span>
            <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show fewer" : "Show all"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="p-4 sm:p-5">
          <ListSkeleton rows={7} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon={Fingerprint}
          title={punches.length === 0 ? (isToday ? "No punches yet today" : "No punches that day") : "No punches match this filter"}
          description={
            punches.length === 0
              ? isToday
                ? "They appear here the moment a time clock sends them."
                : "Nobody punched on any time clock that day."
              : "Pick another filter to see the rest of the punches."
          }
        />
      ) : (
        <ol className="max-h-[34rem] divide-y divide-border/70 overflow-y-auto" aria-live="polite" aria-relevant="additions">
          {visible.map((item) => (
            <FeedRow key={item.punch.id} item={item} tz={tz} now={now} showAgo={isToday} fresh={isToday && !!seen.current && !seen.current.has(item.punch.id)} />
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function FeedRow({ item, tz, now, fresh, showAgo }: { item: FeedItem; tz: string | undefined; now: number; fresh: boolean; showAgo: boolean }) {
  const p = item.punch;
  const ago = now - new Date(p.punch_at).getTime();
  const sub = [p.time_devices?.name ?? (p.source === "correction" ? "Approved correction" : p.source === "manual" ? "Added by HR" : null), p.verify_type && p.source !== "correction" ? verifyLabel(p.verify_type) : null]
    .filter(Boolean)
    .join(" · ");
  const person = p.employees ? (
    <PersonCell name={p.employees.name} code={p.employees.employee_code} avatarUrl={p.employees.avatar_url} sub={sub || undefined} />
  ) : (
    <PersonCell name={`Terminal ID ${p.device_user_id}`} sub={sub || "Not linked to anyone"} />
  );
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-2.5 transition-colors sm:items-center sm:px-5",
        item.repeat && "bg-muted/30",
        fresh && "bg-primary/[0.05] duration-500 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none",
      )}
    >
      <div className="w-12 shrink-0 pt-1.5 sm:pt-0">
        <time dateTime={p.punch_at} title={formatDateTime(p.punch_at)} className={cn("tabular block text-[13px] font-semibold", item.repeat ? "text-muted-foreground" : "text-foreground")}>
          {clock(p.punch_at, tz)}
        </time>
        {showAgo && (
          <span className="tabular block text-[10.5px] text-muted-foreground">{ago < 60_000 ? "now" : ago < 3_600_000 ? `${Math.floor(ago / 60_000)}m ago` : `${Math.floor(ago / 3_600_000)}h ago`}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {p.employee_id ? (
          <Link
            to={`/attendance/${p.employee_id}?month=${p.punch_date.slice(0, 8)}01`}
            className="min-w-0 rounded-lg hover:[&_p:first-child]:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {person}
          </Link>
        ) : (
          person
        )}
        <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:justify-end">
          {item.lateMinutes !== null && (
            <Flag tone="warning" title="First punch after the grace period">
              Late {formatMinutes(item.lateMinutes)}
            </Flag>
          )}
          {item.earlyMinutes !== null && <Flag tone="warning">Left {formatMinutes(item.earlyMinutes)} early</Flag>}
          {item.repeat && <Flag title="Same direction again within 5 minutes; counted once">Repeat</Flag>}
          {p.source === "correction" && <Flag tone="primary">Correction</Flag>}
          {!p.employee_id && <Flag tone="warning">Not linked</Flag>}
          <StatusBadge
            status={p.direction}
            label={p.direction === "in" ? "In" : p.direction === "out" ? "Out" : "Punch"}
            tone={p.direction === "in" ? "success" : p.direction === "out" ? "info" : "neutral"}
            className="min-w-[3.25rem] justify-center"
          />
        </div>
      </div>
    </li>
  );
}

function verifyLabel(v: string): string {
  const key = v.toLowerCase();
  if (key.includes("finger")) return "Fingerprint";
  if (key.includes("face")) return "Face";
  if (key.includes("card") || key.includes("rfid")) return "Card";
  if (key.includes("pw") || key.includes("pass") || key.includes("pin")) return "PIN";
  if (key.includes("palm")) return "Palm";
  return v.charAt(0).toUpperCase() + v.slice(1).replace(/[_-]+/g, " ");
}

/* ------------------------------------------------------------------ */

function DeviceHealthCard({
  health,
  punches,
  loading,
  tz,
  date,
  isToday,
  now,
}: {
  health: { device: TimeDevice; health: ReturnType<typeof deviceHealth> }[];
  punches: PunchRow[];
  loading: boolean;
  tz: string | undefined;
  date: string;
  isToday: boolean;
  now: number;
}) {
  const online = health.filter((h) => h.health.key === "online").length;
  const countByDevice = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of punches) if (p.device_id) m.set(p.device_id, (m.get(p.device_id) ?? 0) + 1);
    return m;
  }, [punches]);

  return (
    <SectionCard
      title="Time clocks"
      icon={Radio}
      description={health.length === 0 ? "Online when heard from in the last 3 minutes" : `${online} of ${health.length} online · online when heard from in the last 3 minutes`}
      actions={
        <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg">
          <Link to="/attendance/live?tab=setup">Manage</Link>
        </Button>
      }
    >
      {loading ? (
        <ListSkeleton rows={2} />
      ) : health.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No time clocks yet. Add one on the Setup tab.</p>
      ) : (
        <ul className="space-y-2.5">
          {health.map(({ device: d, health: h }) => {
            const lastPunchToday = !!d.last_punch_at && localDate(d.last_punch_at, tz) === localDate(new Date(now).toISOString(), tz);
            return (
              <li key={d.id} className={cn("rounded-xl border p-3", h.tone === "danger" ? "border-danger/25" : "border-border")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <LiveDot tone={h.tone} pulse={h.key === "online"} label={h.label} className="mt-1" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground" title={d.name}>
                        {d.name}
                      </p>
                      {d.location && (
                        <p className="truncate text-[11px] text-muted-foreground" title={d.location}>
                          {d.location}
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={h.key} label={h.label} tone={h.tone} className="shrink-0" />
                </div>
                <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5 text-[11px]">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Last heard</dt>
                    <dd className="truncate font-semibold text-foreground" title={d.last_seen_at ? formatDateTime(d.last_seen_at) : undefined}>
                      {d.last_seen_at ? (now - new Date(d.last_seen_at).getTime() < 60_000 ? "Just now" : formatRelative(d.last_seen_at)) : "Never"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{isToday ? "Today" : format(parseISO(date), "EEE d MMM")}</dt>
                    <dd className="tabular font-semibold text-foreground">{plural(countByDevice.get(d.id) ?? 0, "punch", "punches")}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Last punch</dt>
                    <dd className="tabular truncate font-semibold text-foreground" title={d.last_punch_at ? formatDateTime(d.last_punch_at) : undefined}>
                      {d.last_punch_at ? (lastPunchToday ? clock(d.last_punch_at, tz) : dayLabel(localDate(d.last_punch_at, tz), "d MMM")) : "—"}
                    </dd>
                  </div>
                </dl>
                {d.last_error && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger-soft px-2 py-1.5 text-[11px] leading-4 text-danger">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{d.last_error}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */

function ArrivalsChart({ people, tz, loading, isToday }: { people: DailyPerson[]; tz: string | undefined; loading: boolean; isToday: boolean }) {
  const bars = useMemo(() => {
    const counts = new Map<number, { onTime: number; late: number }>();
    for (const p of people) {
      if (!p.first_in) continue;
      const h = localHour(p.first_in, tz);
      const c = counts.get(h) ?? { onTime: 0, late: 0 };
      if (p.late) c.late++;
      else c.onTime++;
      counts.set(h, c);
    }
    const hours = Array.from(counts.keys());
    if (hours.length === 0) return [];
    const lo = Math.min(...hours);
    const hi = Math.max(...hours);
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ hour: lo + i, ...(counts.get(lo + i) ?? { onTime: 0, late: 0 }) }));
  }, [people, tz]);
  const max = Math.max(1, ...bars.map((b) => b.onTime + b.late));
  const total = bars.reduce((n, b) => n + b.onTime + b.late, 0);
  const peak = bars.reduce<(typeof bars)[number] | null>((best, b) => (!best || b.onTime + b.late > best.onTime + best.late ? b : best), null);

  return (
    <SectionCard
      title="Arrivals by hour"
      icon={BarChart3}
      description={total > 0 && peak ? `First punch of each person · busiest ${String(peak.hour).padStart(2, "0")}:00–${String(peak.hour).padStart(2, "0")}:59` : `First punch of each person ${isToday ? "today" : "that day"}`}
    >
      {loading ? (
        <Skeleton className="h-36 w-full rounded-xl" />
      ) : bars.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{isToday ? "The chart fills in as people arrive." : "Nobody punched in that day."}</p>
      ) : (
        <figure>
          <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Arrivals by hour: ${bars.map((b) => `${String(b.hour).padStart(2, "0")}:00 ${b.onTime + b.late}`).join(", ")}`}>
            {bars.map((b) => {
              const n = b.onTime + b.late;
              return (
                <div
                  key={b.hour}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={`${String(b.hour).padStart(2, "0")}:00–${String(b.hour).padStart(2, "0")}:59 · ${b.onTime} on time${b.late ? `, ${b.late} late` : ""}`}
                >
                  <span className="tabular text-[10px] font-semibold text-muted-foreground">{n || ""}</span>
                  <div className="flex w-full max-w-[2.5rem] flex-col overflow-hidden rounded-t-md" style={{ height: `${(n / max) * 82}%`, minHeight: n ? 4 : 0 }}>
                    {b.late > 0 && <div className="w-full bg-warning" style={{ height: `${(b.late / n) * 100}%` }} />}
                    {b.onTime > 0 && <div className="w-full flex-1 bg-chart-1" />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5 border-t border-border pt-1.5" aria-hidden>
            {bars.map((b) => (
              <span key={b.hour} className="tabular min-w-0 flex-1 text-center text-[10px] text-muted-foreground">
                {String(b.hour).padStart(2, "0")}
              </span>
            ))}
          </div>
          <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-chart-1" aria-hidden /> On time
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-warning" aria-hidden /> Late
            </span>
            <span className="ml-auto">Hour of the day (company time)</span>
          </figcaption>
        </figure>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */

function NotInCard({
  overdue,
  dueLater,
  onLeave,
  loading,
  tz,
  date,
  isToday,
  now,
  grace,
}: {
  overdue: DailyPerson[];
  dueLater: DailyPerson[];
  onLeave: DailyPerson[];
  loading: boolean;
  tz: string | undefined;
  date: string;
  isToday: boolean;
  now: number;
  grace: number;
}) {
  const [showLater, setShowLater] = useState(false);
  const firstDue = dueLater[0];
  const month = `${date.slice(0, 8)}01`;

  const row = (p: DailyPerson, chip: JSX.Element) => (
    <li key={p.id}>
      <Link
        to={`/attendance/${p.id}?month=${month}`}
        className="flex min-w-0 items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <PersonCell name={p.name} code={p.code} avatarUrl={p.avatar_url} sub={`Shift ${clock(p.shift_start, tz)}–${clock(p.shift_end, tz)}${p.linked ? "" : " · no terminal ID"}`} />
        <span className="shrink-0">{chip}</span>
      </Link>
    </li>
  );

  const overdueChip = (p: DailyPerson) => {
    const start = new Date(p.shift_start).getTime();
    const end = new Date(p.shift_end).getTime();
    const late = Math.round((now - start) / 60_000);
    if (!isToday || now >= end) {
      return (
        <Flag tone="danger" title={`Shift ${clock(p.shift_start, tz)}–${clock(p.shift_end, tz)}`}>
          Missed shift
        </Flag>
      );
    }
    if (late <= grace) return <Flag tone="info">In grace period</Flag>;
    return (
      <Flag tone="danger" title={`Shift started ${clock(p.shift_start, tz)}`}>
        {formatMinutes(late)} overdue
      </Flag>
    );
  };

  return (
    <SectionCard
      title={isToday ? "Not in yet" : "Did not come in"}
      icon={UserX}
      description={
        loading
          ? "Loading…"
          : isToday
          ? [`${overdue.length} overdue`, dueLater.length > 0 ? `${dueLater.length} due later` : null].filter(Boolean).join(" · ")
          : `${format(parseISO(date), "EEEE d MMM")} · ${plural(overdue.length, "person", "people")} with no punch or mark`
      }
    >
      {loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          {overdue.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <UserCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />
              {isToday ? (dueLater.length > 0 ? "Nobody is late. Everyone else is due later today." : "Everyone expected today has arrived.") : "Everyone expected that day came in."}
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">{overdue.map((p) => row(p, overdueChip(p)))}</ul>
          )}

          {dueLater.length > 0 && firstDue && (
            <div className="border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={() => setShowLater((v) => !v)}
                aria-expanded={showLater}
                className="flex w-full items-center justify-between gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="micro-label flex items-center gap-1.5">
                  <Clock className="h-3 w-3" aria-hidden /> Due later today · {dueLater.length}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  {showLater ? "Hide" : `First at ${clock(firstDue.shift_start, tz)}`}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showLater && "rotate-180")} aria-hidden />
                </span>
              </button>
              {showLater && (
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {dueLater.map((p) => row(p, <Flag title={`Shift starts ${clock(p.shift_start, tz)}`}>Due {clock(p.shift_start, tz)}</Flag>))}
                </ul>
              )}
            </div>
          )}

          {onLeave.length > 0 && (
            <div className="border-t border-border/60 pt-3">
              <p className="micro-label mb-2 flex items-center gap-1.5">
                <Plane className="h-3 w-3" aria-hidden /> On leave {isToday ? "today" : "that day"}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {onLeave.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/attendance/${p.id}?month=${month}`}
                      className="inline-flex min-h-[1.75rem] items-center rounded-full border border-info/15 bg-info-soft px-2.5 py-1 text-[11px] font-medium text-info hover:underline"
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function SetupView() {
  return (
    <div className="space-y-4">
      <DevicesPanel />
      <TerminalLinksPanel />
      <RulesCard />
    </div>
  );
}
