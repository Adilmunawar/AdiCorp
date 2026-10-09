import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { homeForRole, matchNav, navForRole, type NavSection } from "@/modules/registry";
import type { ModuleNavItem, NavGroup } from "@/modules/types";
import { useNavBadges } from "./nav-badges";

const GROUPS_KEY = "sidebar_groups_collapsed";

function readClosedGroups(): NavGroup[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((g): g is NavGroup => typeof g === "string") : [];
  } catch {
    return [];
  }
}

function writeClosedGroups(groups: NavGroup[]) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch {
    /* storage unavailable */
  }
}

const countLabel = (n: number) => (n > 99 ? "99+" : String(n));

/** A one-item "Overview" group (Dashboard) reads better without a heading. */
const hasHeading = (section: NavSection) => !(section.group === "Overview" && section.items.length === 1);

interface NavRowProps {
  item: ModuleNavItem;
  active: boolean;
  compact: boolean;
  mobile: boolean;
  badge: number;
  onNavigate?: () => void;
}

const NavRow = memo(function NavRow({ item, active, compact, mobile, badge, onNavigate }: NavRowProps) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? (badge > 0 ? `${item.label}, ${badge} to review` : item.label) : undefined}
      className={cn(
        "group/item relative flex w-full items-center gap-2.5 rounded-[10px] px-2.5 font-medium outline-none transition-[background-color,color,box-shadow] duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        mobile ? "h-10 text-sm" : compact ? "h-10 justify-center px-0" : "h-8 text-[13px] tight:h-7",
        active
          ? "bg-gradient-to-r from-brand-600 to-brand-800 font-semibold text-white shadow-[0_8px_18px_-6px_hsl(var(--brand-700)/0.55)]"
          : "text-foreground/75 hover:bg-brand-50 hover:text-foreground dark:hover:bg-muted",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-100" : "text-muted-foreground group-hover/item:text-primary")} aria-hidden />
      {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {badge > 0 &&
        (compact ? (
          <span aria-hidden className={cn("absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2", active ? "bg-white ring-brand-700" : "bg-primary ring-card")} />
        ) : (
          <span
            className={cn(
              "tabular ml-auto inline-flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none",
              active ? "bg-white/20 text-white" : "bg-brand-100 text-brand-800 dark:bg-primary/15 dark:text-primary",
            )}
          >
            {countLabel(badge)}
          </span>
        ))}
    </Link>
  );

  if (!compact) return <li>{link}</li>;
  return (
    <li>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium">
          {item.label}
          {badge > 0 && <span className="tabular rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold leading-4 text-primary">{countLabel(badge)}</span>}
        </TooltipContent>
      </Tooltip>
    </li>
  );
});

interface SectionHeadingProps {
  section: NavSection;
  open: boolean;
  /** Sum of the group's badges, shown while the group is folded. */
  pending: number;
  mobile: boolean;
  listId: string;
  onToggle: () => void;
}

function SectionHeading({ section, open, pending, mobile, listId, onToggle }: SectionHeadingProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={listId}
      className={cn(
        "group/heading flex w-full items-center gap-1.5 rounded-md px-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        mobile ? "h-9" : "mb-0.5 h-7 tight:h-6",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{section.group}</span>
      {!open && pending > 0 && (
        <span className="tabular rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold normal-case leading-4 tracking-normal text-primary">
          {countLabel(pending)}
        </span>
      )}
      <ChevronDown
        aria-hidden
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-[transform,opacity] duration-200",
          !open && "-rotate-90",
          open && !mobile && "opacity-0 group-hover/heading:opacity-100 group-focus-visible/heading:opacity-100",
          open && mobile && "opacity-60",
        )}
      />
    </button>
  );
}

/** Fades the nav's top/bottom edge while there is more to scroll, so a long menu never looks cut off. */
function useScrollFade() {
  const ref = useRef<HTMLElement | null>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [update]);
  const style: CSSProperties | undefined =
    fade.top || fade.bottom
      ? (() => {
          const mask = `linear-gradient(to bottom, ${fade.top ? "transparent 0, #000 24px" : "#000 0"}, ${fade.bottom ? "#000 calc(100% - 24px), transparent 100%" : "#000 100%"})`;
          return { maskImage: mask, WebkitMaskImage: mask };
        })()
      : undefined;
  return { ref, onScroll: update, style };
}

export interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Rendered inside the phone drawer: full labels, 40px rows. */
  mobile?: boolean;
  onNavigate?: () => void;
}

/**
 * Staff sidebar built from the module registry and filtered by role. Groups have headings that
 * fold (remembered per browser); the group of the current page always opens. The list scrolls
 * inside itself with faded edges when it is taller than the window, and the current page is kept
 * in view. Collapsed, it is an icon rail with tooltips and badge dots.
 */
export function Sidebar({ collapsed = false, onToggleCollapse, mobile = false, onNavigate }: SidebarProps) {
  const { role, company } = useAuth();
  const location = useLocation();
  const badges = useNavBadges();
  const compact = collapsed && !mobile;
  const sections = useMemo(() => navForRole(role), [role]);
  // Matched against this role's own items, so a page from another role's area never highlights or opens a group.
  const active = useMemo(() => matchNav(sections.flatMap((s) => s.items), location.pathname), [sections, location.pathname]);
  const activeGroup = active?.group;
  const [closed, setClosed] = useState<NavGroup[]>(readClosedGroups);
  const { ref: navRef, onScroll, style: fadeStyle } = useScrollFade();

  // Arriving on a page opens its group, so the current page is never hidden.
  useEffect(() => {
    if (!activeGroup) return;
    setClosed((prev) => {
      if (!prev.includes(activeGroup)) return prev;
      const next = prev.filter((g) => g !== activeGroup);
      writeClosedGroups(next);
      return next;
    });
  }, [activeGroup]);

  const toggleGroup = useCallback((group: NavGroup) => {
    setClosed((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group];
      writeClosedGroups(next);
      return next;
    });
  }, []);

  // Keep the current page in view inside a scrolling menu (also once its group has just opened).
  const activeShown = !activeGroup || !closed.includes(activeGroup);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const box = nav.getBoundingClientRect();
    const row = current.getBoundingClientRect();
    if (row.top < box.top + 8 || row.bottom > box.bottom - 8) {
      nav.scrollTop += row.top - box.top - (box.height - row.height) / 2;
    }
  }, [active?.key, activeShown, compact, navRef]);

  const home = homeForRole(role);

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Brand */}
      <div className={cn("flex h-16 shrink-0 items-center", compact ? "justify-center px-2" : "px-4", mobile && "pr-14")}>
        <Link
          to={home}
          onClick={onNavigate}
          aria-label="AdiCorp HR home"
          className="flex min-w-0 items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px_11px_4px_11px] bg-card shadow-[0_6px_16px_-4px_hsl(var(--brand-700)/0.35)] ring-1 ring-brand-100 dark:ring-border">
            <img src={ADICORP_LOGO_PATH} alt="" className="h-6 w-6 object-contain" />
          </span>
          {!compact && (
            <span className="min-w-0 leading-none">
              <span className="block font-display text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
                AdiCorp <span className="text-primary">HR</span>
              </span>
              <span className="mt-1 block truncate text-[11px] font-medium text-muted-foreground" title={company?.name ?? undefined}>
                {company?.name ?? "Workspace"}
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav
        ref={navRef}
        aria-label="Main"
        onScroll={onScroll}
        style={fadeStyle}
        className={cn("scrollbar-subtle min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain", compact ? "px-2" : "px-3")}
      >
        <div className="pb-3 pt-1">
          {sections.map((section, gi) => {
            const heading = hasHeading(section) && !compact;
            const open = compact || !heading || !closed.includes(section.group);
            const listId = `nav-group-${section.group.toLowerCase()}`;
            const pending = section.items.reduce((n, item) => n + (badges[item.key] ?? 0), 0);
            return (
              <div key={section.group} className={cn(gi > 0 && (compact ? "mt-2 border-t border-border/60 pt-2" : "mt-4 tight:mt-2"))}>
                {heading && (
                  <SectionHeading
                    section={section}
                    open={open}
                    pending={pending}
                    mobile={mobile}
                    listId={listId}
                    onToggle={() => toggleGroup(section.group)}
                  />
                )}
                {open && (
                  <ul id={listId} className="flex flex-col gap-0.5">
                    {section.items.map((item) => (
                      <NavRow
                        key={item.key}
                        item={item}
                        active={active?.key === item.key}
                        compact={compact}
                        mobile={mobile}
                        badge={badges[item.key] ?? 0}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Footer: the account lives in the top bar; here only the collapse control. */}
      {!mobile && onToggleCollapse && (
        <div className={cn("shrink-0 pb-3 pt-1.5", compact ? "flex justify-center px-2" : "px-3")}>
          <Tooltip delayDuration={compact ? 0 : 600}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-[10px] border border-border/70 bg-muted/40 px-2.5 text-[12.5px] font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  compact && "w-10 justify-center px-0",
                )}
              >
                {collapsed ? <ChevronsRight className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronsLeft className="h-4 w-4 shrink-0" aria-hidden />}
                {!compact && <span>Collapse</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="px-2.5 py-1.5 text-xs font-medium">
              {collapsed ? "Expand menu" : "Collapse menu"}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
