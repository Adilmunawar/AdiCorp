import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, BellRing, Building2, CalendarRange, Database, History, Settings, ShieldCheck, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { CardSkeleton, ConfirmDialog, EmptyState, PageHeader, SectionCard, TabsNav, formatDateTime, formatRelative, useTabParam, type TabItem } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { Role } from "@/modules/types";
import { MfaGate } from "../mfa";
import { useCompanySettings } from "../api";
import { DirtyReporter, useBeforeUnload } from "../components/unsaved";
import { CompanyTab } from "../settings/CompanyTab";
import { WorkweekTab } from "../settings/WorkweekTab";
import { PreferencesTab } from "../settings/PreferencesTab";
import { SecurityTab } from "../settings/SecurityTab";
import { BackupsTab } from "../settings/BackupsTab";

interface SettingsSection extends TabItem {
  icon: LucideIcon;
  /** One line under the label in the section nav. */
  summary: string;
  /** Shown under the section title. */
  description: string;
  roles: Role[];
  needsSettings: boolean;
}

const SECTIONS: SettingsSection[] = [
  {
    value: "company",
    label: "Company",
    icon: Building2,
    summary: "Brand, legal details and region",
    description: "Your logo, legal identity, contact details, timezone and currency. They appear on payslips, letters, exports and the employee portal.",
    roles: ["owner"],
    needsSettings: false,
  },
  {
    value: "workweek",
    label: "Working week",
    icon: CalendarRange,
    summary: "Weekends and daily hours",
    description: "Which days count as working days for attendance, leave and pay, and how many hours make a full day.",
    roles: ["owner", "hr"],
    needsSettings: true,
  },
  {
    value: "preferences",
    label: "Portal & letters",
    icon: BellRing,
    summary: "Self-service, leave approval, letters",
    description: "What employees can do in the portal, whether leave needs approval, and how HR letters are signed and numbered.",
    roles: ["owner", "hr"],
    needsSettings: true,
  },
  {
    value: "security",
    label: "Security",
    icon: ShieldCheck,
    summary: "Two-step verification and access",
    description: "Sign-in rules for staff accounts and an overview of who can access AdiCorp.",
    roles: ["owner"],
    needsSettings: true,
  },
  {
    value: "backups",
    label: "Backups & data",
    icon: Database,
    summary: "Exports and stored records",
    description: "Download a copy of your company's records and see what is stored.",
    roles: ["owner", "hr"],
    needsSettings: false,
  },
];

function SectionNav({
  sections,
  active,
  dirty,
  onSelect,
  onLeave,
  isOwner,
}: {
  sections: SettingsSection[];
  active: string;
  dirty: boolean;
  onSelect: (value: string) => void;
  /** Called instead of following a related link while there are unsaved changes. */
  onLeave: (href: string) => void;
  isOwner: boolean;
}) {
  const related = [
    isOwner && { href: "/users", label: "Users & access", icon: UsersRound },
    { href: "/account", label: "My account", icon: UserRound },
    { href: "/timeline?area=settings", label: "History of changes", icon: History },
  ].filter(Boolean) as { href: string; label: string; icon: LucideIcon }[];

  return (
    <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
      <nav aria-label="Settings sections" className="space-y-1">
        {sections.map((s) => {
          const on = s.value === active;
          const Icon = s.icon;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onSelect(s.value)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "group relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-muted/60",
              )}
            >
              {on && <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden />}
              <span
                className={cn(
                  "mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                  on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-2 text-[13px] font-semibold leading-5", on ? "text-foreground" : "text-foreground/85")}>
                  {s.label}
                  {on && dirty && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
                      Unsaved
                    </span>
                  )}
                </span>
                <span className="block text-xs leading-4 text-muted-foreground">{s.summary}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-border/70 pt-4">
        <p className="micro-label px-3">Related</p>
        <ul className="mt-2 space-y-0.5">
          {related.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.href}>
                <Link
                  to={r.href}
                  onClick={(e) => {
                    if (!dirty) return;
                    e.preventDefault();
                    onLeave(r.href);
                  }}
                  className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SettingsBody() {
  const { role, isOwner } = useAuth();
  const sections = useMemo(() => SECTIONS.filter((t) => role && t.roles.includes(role)), [role]);
  const [tab, setTab] = useTabParam(sections);
  const current = sections.find((t) => t.value === tab) ?? sections[0];
  const settings = useCompanySettings();
  const [dirty, setDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const navigate = useNavigate();
  const reportDirty = useCallback((d: boolean) => setDirty(d), []);
  useBeforeUnload(dirty);

  const select = (next: string) => {
    if (next === current?.value) return;
    if (dirty) setPendingTab(next);
    else setTab(next);
  };

  const body = () => {
    if (!current) return null;
    if (current.value === "company") return <CompanyTab />;
    if (current.value === "backups") return <BackupsTab />;
    if (settings.isPending) {
      return (
        <div className="space-y-4">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
        </div>
      );
    }
    if (settings.isError || !settings.data) {
      return (
        <SectionCard>
          <EmptyState
            icon={Settings}
            title="Settings could not load"
            description={settings.error instanceof Error ? settings.error.message : "Please try again."}
            action={
              <Button size="sm" onClick={() => void settings.refetch()}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      );
    }
    if (current.value === "workweek") return <WorkweekTab settings={settings.data} />;
    if (current.value === "preferences") return <PreferencesTab settings={settings.data} />;
    return <SecurityTab settings={settings.data} />;
  };

  const updatedAt = current?.needsSettings ? settings.data?.updated_at : null;
  const updatedBy = settings.data?.updated_by_name;
  const pending = sections.find((s) => s.value === pendingTab);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description={
          isOwner
            ? "Everything that shapes how AdiCorp works for your company, in one place."
            : "The working week, employee portal, HR letters and HR backups."
        }
        icon={Settings}
      />

      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[256px_minmax(0,1fr)]">
        <SectionNav sections={sections} active={current?.value ?? ""} dirty={dirty} onSelect={select} onLeave={setPendingHref} isOwner={isOwner} />

        <div className="min-w-0 max-w-[960px]">
          <TabsNav tabs={sections} value={current?.value} onChange={select} className="mb-4 lg:hidden" />

          {current && (
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold leading-7 tracking-tight text-foreground">{current.label}</h2>
                <p className="max-w-2xl text-[13px] leading-5 text-muted-foreground">{current.description}</p>
              </div>
              {updatedAt && (
                <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                  Last saved here <span title={formatDateTime(updatedAt)}>{formatRelative(updatedAt)}</span>
                  {updatedBy ? ` by ${updatedBy}` : ""}
                </p>
              )}
            </div>
          )}

          <DirtyReporter value={reportDirty}>
            <div key={current?.value} className="animate-in fade-in-0 duration-200">
              {body()}
            </div>
          </DirtyReporter>
        </div>
      </div>

      <ConfirmDialog
        open={pendingTab !== null || pendingHref !== null}
        onOpenChange={(o) => {
          if (o) return;
          setPendingTab(null);
          setPendingHref(null);
        }}
        title="Discard unsaved changes?"
        description={`You have changes in ${current?.label ?? "this section"} that are not saved. Leave without saving${pending ? ` and open ${pending.label}` : ""}?`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const nextTab = pendingTab;
          const nextHref = pendingHref;
          setDirty(false);
          setPendingTab(null);
          setPendingHref(null);
          if (nextHref) navigate(nextHref);
          else if (nextTab) setTab(nextTab);
        }}
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <MfaGate>
      <SettingsBody />
    </MfaGate>
  );
}
