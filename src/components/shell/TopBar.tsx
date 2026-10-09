import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, Menu, Search, type LucideIcon } from "lucide-react";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { homeForRole, matchNav, navForRole } from "@/modules/registry";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { MOD_KEY, useSearch } from "./search";
import { NotificationBell } from "./notifications";
import { UserMenu } from "./UserMenu";

/** Staff pages that are not in the sidebar but still deserve a name in the top bar. */
const OFF_MENU_PAGES: { href: string; label: string; group: string }[] = [
  { href: "/account", label: "My account", group: "Account" },
  { href: "/notifications", label: "Notifications", group: "Inbox" },
];

interface TopBarProps {
  /** Phone only: opens the navigation drawer. */
  onOpenMenu?: () => void;
  isMobile: boolean;
}

/** Top bar: the page title (with its section), global search (Ctrl/Cmd+K), notifications and the account capsule. */
export function TopBar({ onOpenMenu, isMobile }: TopBarProps) {
  const location = useLocation();
  const { setOpen } = useSearch();
  const { company, role } = useAuth();
  // Only this role's menu: another role's page (e.g. HR on a shared expense link) must not
  // show a money area's name or link back to a list this role cannot open.
  const navItems = useMemo(() => navForRole(role).flatMap((section) => section.items), [role]);
  const current = matchNav(navItems, location.pathname) ?? matchNav(OFF_MENU_PAGES, location.pathname);
  const title = current?.label ?? "";
  // A detail page under a list (e.g. one employee) shows the list it belongs to as a link.
  const nested = !!current && location.pathname !== current.href.split("?")[0];

  // Desktop: the page heading carries the title; once it scrolls away, the title moves into the bar.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 72);
    onScroll();
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, [location.pathname]);
  // Detail pages keep the way back to their list in view.
  const showTitle = isMobile || scrolled || !current || nested;

  useEffect(() => {
    document.title = title ? `${title} · AdiCorp HR` : "AdiCorp HR";
  }, [title]);

  const Icon = current && "icon" in current ? (current as { icon?: LucideIcon }).icon : undefined;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/85 px-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 sm:gap-2.5 sm:px-5 md:h-16 lg:px-7">
      {isMobile && (
        <>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open navigation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link to={homeForRole(role)} className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg" aria-label="AdiCorp HR home">
            <img src={ADICORP_LOGO_PATH} alt="" className="h-7 w-7 object-contain" />
          </Link>
        </>
      )}

      {/* Where you are. At the top of a page: the workspace (the page heading below carries the title).
          Scrolled, or on a phone: the section as a small eyebrow and the page as the title. */}
      <div className="relative min-w-0 flex-1 self-stretch overflow-hidden">
        {!isMobile && current && (
          <div
            aria-hidden={showTitle}
            className={cn(
              "absolute inset-0 flex min-w-0 items-center gap-3 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
              showTitle ? "pointer-events-none -translate-y-full opacity-0" : "opacity-100",
            )}
          >
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Workspace</p>
              <p className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground">{company?.name || "AdiCorp HR"}</p>
            </div>
          </div>
        )}
        <div
          aria-hidden={!showTitle}
          className={cn(
            "absolute inset-0 flex min-w-0 items-center gap-3 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
            showTitle ? "opacity-100" : "pointer-events-none translate-y-full opacity-0",
          )}
        >
          {Icon && !isMobile && (
            <span aria-hidden className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10 md:flex">
              <Icon className="h-[18px] w-[18px]" />
            </span>
          )}
          <div className="min-w-0 leading-tight">
            {current && !isMobile && (
              <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">{current.group}</p>
            )}
            {current && nested ? (
              <Link
                to={current.href}
                className="group flex min-w-0 items-center gap-1 rounded-sm font-display text-[15px] font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[17px]"
              >
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary" aria-hidden />
                <span className="truncate group-hover:text-primary">{title}</span>
              </Link>
            ) : (
              <p aria-current={current ? "page" : undefined} className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground md:text-[17px]">
                {title || company?.name || "AdiCorp HR"}
              </p>
            )}
          </div>
        </div>
      </div>

      {isMobile ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-[18px] w-[18px]" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-keyshortcuts={MOD_KEY === "⌘" ? "Meta+K" : "Control+K"}
          aria-label="Search"
          className="group flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 text-left text-[13px] text-muted-foreground shadow-sm transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-44 lg:w-56 xl:w-72"
        >
          <Search className="h-4 w-4 shrink-0 group-hover:text-primary" aria-hidden />
          <span className="hidden flex-1 truncate md:block">
            <span className="xl:hidden">Search…</span>
            <span className="hidden xl:inline">Search people, pages, actions</span>
          </span>
          <kbd className="tabular hidden shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-foreground lg:inline">
            {MOD_KEY} K
          </kbd>
        </button>
      )}

      <NotificationBell className="h-10 w-10 sm:h-9 sm:w-9" />
      <UserMenu variant="topbar" />
    </header>
  );
}
