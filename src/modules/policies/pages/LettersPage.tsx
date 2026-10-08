import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, Download, Inbox, Mail, MailCheck, MessageSquareReply, PenSquare, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SectionCard,
  StatGrid,
  StatTile,
  StatusBadge,
  downloadCsv,
  formatDate,
  formatDateTime,
  type DataColumn,
} from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useLetters } from "../lib/api";
import { useCompanyToday } from "../lib/company";
import {
  LETTER_GROUPS,
  LETTER_KINDS,
  LETTER_STATUS_LABEL,
  LETTER_STATUS_TONE,
  inZone,
  kindTone,
  letterLabel,
  letterStatus,
  replyByHint,
  type LetterStatus,
} from "../lib/letters";
import type { LetterWithEmployee } from "../lib/types";
import { LetterSettingsDialog } from "../components/LetterSettingsDialog";

type StatusFilter = "all" | LetterStatus;

export default function LettersPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useLetters();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<string>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { company } = useAuth();
  const timeZone = company?.timezone ?? null;
  const today = useCompanyToday();

  const all = useMemo(() => (data ?? []).map((l) => ({ ...l, status: letterStatus(l, today) })), [data, today]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (kind !== "all" && l.kind !== kind) return false;
      if (!q) return true;
      return [l.ref, l.subject, l.employee?.name, l.employee?.employee_code].some((v) => v?.toLowerCase().includes(q));
    });
  }, [all, search, status, kind]);

  const stats = useMemo(() => {
    const year = Number(today.slice(0, 4));
    return {
      year: all.filter((l) => !l.withdrawn_at && inZone(l.issued_at, timeZone).getFullYear() === year).length,
      unread: all.filter((l) => l.status === "unread").length,
      overdue: all.filter((l) => l.status === "overdue").length,
      replied: all.filter((l) => l.status === "replied").length,
    };
  }, [all, today, timeZone]);

  const exportCsv = () =>
    downloadCsv(
      rows.map((l) => ({
        Reference: l.ref,
        Employee: l.employee?.name ?? "",
        "Employee ID": l.employee?.employee_code ?? "",
        Kind: letterLabel(l.kind),
        Subject: l.subject,
        Issued: formatDateTime(l.issued_at),
        "Issued by": l.issued_by_name ?? "",
        "Reply by": l.reply_by ? formatDate(l.reply_by) : "",
        Status: LETTER_STATUS_LABEL[l.status],
        Acknowledged: l.acknowledged_at ? formatDateTime(l.acknowledged_at) : "",
        Replied: l.replied_at ? formatDateTime(l.replied_at) : "",
        Withdrawn: l.withdrawn_at ? formatDateTime(l.withdrawn_at) : "",
      })),
      "letters",
    );

  type Row = LetterWithEmployee & { status: LetterStatus };
  const columns: DataColumn<Row>[] = [
    {
      id: "ref",
      header: "Reference",
      sortValue: (l) => l.ref,
      cell: (l) => <span className="whitespace-nowrap font-mono text-[11.5px] font-semibold text-foreground">{l.ref}</span>,
      hideOnCard: true,
    },
    {
      id: "employee",
      header: "Employee",
      sortValue: (l) => l.employee?.name,
      cell: (l) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{l.employee?.name ?? "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{[l.employee?.employee_code, l.employee?.department?.name].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      ),
      hideOnCard: true,
    },
    {
      id: "subject",
      header: "Letter",
      sortValue: (l) => l.subject,
      className: "max-w-[320px]",
      cell: (l) => (
        <div className="min-w-0 space-y-1">
          <StatusBadge status={l.kind} label={letterLabel(l.kind)} tone={kindTone(l.kind)} dot={false} />
          {/* The phone card shows the subject in its title. */}
          <p className="hidden truncate text-xs text-foreground/80 sm:block" title={l.subject}>{l.subject}</p>
        </div>
      ),
    },
    {
      id: "issued",
      header: "Issued",
      hideBelow: "md",
      sortValue: (l) => l.issued_at,
      cell: (l) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(inZone(l.issued_at, timeZone))}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortValue: (l) => l.status,
      cell: (l) => (
        <div className="space-y-0.5">
          <StatusBadge status={l.status} label={LETTER_STATUS_LABEL[l.status]} tone={LETTER_STATUS_TONE[l.status]} />
          {l.reply_by && !l.replied_at && !l.withdrawn_at && <p className="text-[10.5px] text-muted-foreground">{replyByHint(l.reply_by, today)}</p>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Mail}
        eyebrow="People"
        title="Letters"
        description="Issue letters to employees and track acknowledgements and replies."
        actions={
          <>
            <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" aria-hidden /> Settings
            </Button>
            <Button asChild className="gap-1.5 rounded-xl">
              <Link to="/letters/new">
                <PenSquare className="h-4 w-4" aria-hidden /> Write letter
              </Link>
            </Button>
          </>
        }
      />

      <StatGrid columns={4}>
        <StatTile label="This year" value={stats.year} icon={Mail} tone="primary" loading={isLoading} hint="Letters issued" />
        <StatTile label="Unread" value={stats.unread} icon={Inbox} tone={stats.unread ? "warning" : "default"} loading={isLoading} hint="Not received" />
        <StatTile label="Overdue" value={stats.overdue} icon={AlarmClock} tone={stats.overdue ? "danger" : "default"} loading={isLoading} hint="Reply is late" />
        <StatTile label="Replied" value={stats.replied} icon={MessageSquareReply} tone={stats.replied ? "success" : "default"} loading={isLoading} hint="All time" />
      </StatGrid>

      <SectionCard flush>
        <div className="border-b border-border/60 p-3 sm:p-4">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search name, ref or subject…"
            actions={
              <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl" onClick={exportCsv} disabled={!rows.length}>
                <Download className="h-3.5 w-3.5" aria-hidden /> CSV
              </Button>
            }
          >
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-full rounded-xl sm:w-44" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {(Object.keys(LETTER_STATUS_LABEL) as LetterStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {LETTER_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-9 w-full rounded-xl sm:w-48" aria-label="Filter by kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any kind</SelectItem>
                {LETTER_GROUPS.map((g) => (
                  <SelectGroup key={g}>
                    <SelectLabel className="micro-label">{g}</SelectLabel>
                    {LETTER_KINDS.filter((k) => k.group === g).map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </FilterBar>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(l) => l.id}
          loading={isLoading}
          onRowClick={(l) => navigate(`/letters/${l.id}`)}
          mobileTitle={(l) => (
            <div className="min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{l.employee?.name ?? "—"}</span>
                <span className="shrink-0 font-mono text-[10.5px] font-medium text-muted-foreground">{l.ref}</span>
              </span>
              <p className="line-clamp-2 text-xs font-normal text-muted-foreground">{l.subject}</p>
            </div>
          )}
          initialSort={{ column: "issued", direction: "desc" }}
          pageSize={25}
          caption="Letters"
          empty={
            <EmptyState
              icon={MailCheck}
              title={all.length ? "No letters match" : "No letters yet"}
              description={
                all.length
                  ? "Try a different search or filter."
                  : "Each letter gets a reference number and the employee is notified in the portal."
              }
              action={
                !all.length && (
                  <Button asChild className="gap-1.5 rounded-xl">
                    <Link to="/letters/new">
                      <PenSquare className="h-4 w-4" aria-hidden /> Write the first letter
                    </Link>
                  </Button>
                )
              }
            />
          }
        />
      </SectionCard>

      <LetterSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
