import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Menu, Search } from "lucide-react";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { homeForRole, matchNav, navForRole } from "@/modules/registry";
import { useAuth } from "@/context/AuthContext";
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

/** Thin top bar: where you are, global search (Ctrl/Cmd+K), notifications and account. */
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

  useEffect(() => {
    document.title = title ? `${title} · AdiCorp HR` : "AdiCorp HR";
  }, [title]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-card/90 px-2 backdrop-blur-md supports-[backdrop-filter]:bg-card/75 sm:gap-2 sm:px-6 lg:px-8">
      {isMobile && (
        <>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open navigation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link to={homeForRole(role)} className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg" aria-label="AdiCorp HR home">
            <img src={ADICORP_LOGO_PATH} alt="" className="h-7 w-7 object-contain" />
          </Link>
        </>
      )}

      {isMobile ? (
        <p className="min-w-0 flex-1 truncate pl-1 font-display text-[15px] font-semibold leading-tight tracking-tight text-foreground">
          {title || company?.name || "AdiCorp HR"}
        </p>
      ) : (
        /* Desktop: a quiet breadcrumb; the page's own header carries the big title. */
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5">
            {current ? (
              <>
                <li className="shrink-0 text-muted-foreground">{current.group}</li>
                <li aria-hidden className="shrink-0 text-muted-foreground/60">
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
                <li className="min-w-0 truncate">
                  {nested ? (
                    <Link
                      to={current.href}
                      className="rounded-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {title}
                    </Link>
                  ) : (
                    <span aria-current="page" className="font-semibold text-foreground">
                      {title}
                    </span>
                  )}
                </li>
              </>
            ) : (
              <li className="truncate font-semibold text-foreground">{company?.name || "AdiCorp HR"}</li>
            )}
          </ol>
        </nav>
      )}

      {isMobile ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-[18px] w-[18px]" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-keyshortcuts={MOD_KEY === "⌘" ? "Meta+K" : "Control+K"}
          className="group flex h-9 w-48 shrink-0 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-left text-[13px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-60 xl:w-80"
        >
          <Search className="h-3.5 w-3.5 shrink-0 group-hover:text-primary" aria-hidden />
          <span className="flex-1 truncate">
            <span className="xl:hidden">Search…</span>
            <span className="hidden xl:inline">Search people, pages and actions</span>
          </span>
          <kbd className="tabular shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-foreground">
            {MOD_KEY} K
          </kbd>
        </button>
      )}

      <NotificationBell className="h-10 w-10 sm:h-9 sm:w-9" />
      <UserMenu variant="topbar" />
    </header>
  );
}
