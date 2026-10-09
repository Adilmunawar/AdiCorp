import { memo, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, KeyRound, LayoutGrid, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import BrandLoader from "@/components/common/BrandLoader";
import { PageSkeleton } from "@/components/kit/Skeletons";
import { initials } from "@/components/kit/format";
import { RouteErrorBoundary } from "@/components/shell/RouteErrorBoundary";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { matchNav, portalNav } from "@/modules/registry";
import type { PortalNavItem } from "@/modules/types";
import { cn } from "@/lib/utils";
import { PortalPolicyGate } from "@/modules/policies/portal/PolicyGate";
import { PortalNotificationBell } from "./PortalNotificationBell";

/** Requires a valid portal session; forces the password change first. */
export function PortalGuard({ children }: { children: ReactNode }) {
  const { employee, loading } = useEmployeeAuth();
  if (loading) return <BrandLoader fullScreen message="Opening your portal..." subtitle="Checking your session" />;
  if (!employee) return <Navigate to="/employee-login" replace />;
  if (employee.needs_password_change) return <Navigate to="/portal/setup-password" replace />;
  return <>{children}</>;
}

/** Where /portal lands: the first portal nav item. */
export function PortalIndexRedirect() {
  const first = portalNav[0];
  return first ? <Navigate to={first.href} replace /> : <BrandLoader fullScreen message="Your portal is being prepared" subtitle="Please check back soon" />;
}

const noBadge = () => undefined;

function Badge({ count, active }: { count: number; active?: boolean }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "tabular min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] font-semibold leading-[14px]",
        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-destructive text-destructive-foreground",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

const SideRow = memo(function SideRow({ item, active }: { item: PortalNavItem; active: boolean }) {
  const useBadge = item.useBadge ?? noBadge;
  const count = useBadge() ?? 0;
  const Icon = item.icon;
  return (
    <li className="flex min-h-[24px] flex-[0_1_2.25rem]">
      <Link
        to={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
          active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/75 hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", !active && "text-muted-foreground group-hover:text-primary")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Badge count={count} active={active} />
      </Link>
    </li>
  );
});

const BottomTab = memo(function BottomTab({ item, active }: { item: PortalNavItem; active: boolean }) {
  const useBadge = item.useBadge ?? noBadge;
  const count = useBadge() ?? 0;
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} aria-hidden />
      <span className="max-w-full truncate px-1">{item.label}</span>
      {count > 0 && <span className="absolute right-[calc(50%-18px)] top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" aria-label={`${count} new`} />}
    </Link>
  );
});

/** "More" sheet row for items that do not fit the phone tab bar. */
const MoreRow = memo(function MoreRow({ item, active, onNavigate }: { item: PortalNavItem; active: boolean; onNavigate: () => void }) {
  const useBadge = item.useBadge ?? noBadge;
  const count = useBadge() ?? 0;
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-[11px] font-semibold transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/30",
      )}
    >
      <span className="relative">
        <Icon className="h-5 w-5" aria-hidden />
        {count > 0 && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-destructive" />}
      </span>
      <span className="line-clamp-2 leading-tight">{item.label}</span>
    </Link>
  );
});

function EmployeeAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/10 text-[10px] font-bold text-primary", className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

function AvatarMenu() {
  const { employee, logout } = useEmployeeAuth();
  const navigate = useNavigate();
  if (!employee) return null;
  const signOut = async () => {
    await logout();
    navigate("/employee-login", { replace: true });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card p-0.5 shadow-sm transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-md lg:py-1 lg:pl-1 lg:pr-2.5"
        >
          <EmployeeAvatar name={employee.name} src={employee.avatar_url} className="h-8 w-8 lg:h-7 lg:w-7" />
          <span className="hidden min-w-0 text-left leading-tight lg:block">
            <span className="block max-w-[150px] truncate text-[12px] font-semibold text-foreground">{employee.name}</span>
            <span className="block max-w-[150px] truncate text-[11px] text-muted-foreground">{employee.rank || "Employee"}</span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground lg:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
          <EmployeeAvatar name={employee.name} src={employee.avatar_url} className="h-9 w-9" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{employee.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{employee.rank || "Employee"}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 rounded-lg text-[13px] font-medium" onSelect={() => navigate("/portal/setup-password")}>
          <KeyRound className="h-4 w-4 text-muted-foreground" /> Change password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 rounded-lg text-[13px] font-medium text-destructive focus:text-destructive" onSelect={signOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const MAX_TABS = 4;

/** Titles for portal pages that are reached from inside another page rather than from the nav. */
const PAGE_TITLES: Record<string, string> = {
  "/portal/devices": "Device notifications",
};

/** Employee portal frame: left sidebar on desktop, bottom tab bar (+ More) on phones. */
export function PortalShell() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = matchNav(portalNav, location.pathname);
  const pageTitle = active?.label ?? PAGE_TITLES[location.pathname.replace(/\/+$/, "")] ?? "Employee portal";
  const tabs = portalNav.length > MAX_TABS + 1 ? portalNav.slice(0, MAX_TABS) : portalNav;
  const overflow = portalNav.length > MAX_TABS + 1 ? portalNav.slice(MAX_TABS) : [];
  const overflowActive = overflow.some((i) => i.key === active?.key);

  useEffect(() => setMoreOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = active || pageTitle !== "Employee portal" ? `${pageTitle} · Employee Portal` : "Employee Portal · AdiCorp HR";
  }, [active, pageTitle]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden h-full w-[240px] shrink-0 flex-col border-r border-border bg-card px-3 pb-3 pt-4 md:flex">
        <Link to="/portal" className="flex shrink-0 items-center gap-2.5 px-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/5 bg-card shadow-sm">
            <img src={ADICORP_LOGO_PATH} alt="" className="h-full w-full object-contain p-0.5" />
          </span>
          <span className="leading-none">
            <span className="block font-display text-[14px] font-bold tracking-tight">AdiCorp HR</span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Employee portal</span>
          </span>
        </Link>
        <nav aria-label="Portal" className="no-scrollbar mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ul className="flex min-h-0 shrink flex-col gap-0.5">
            {portalNav.map((item) => (
              <SideRow key={item.key} item={item} active={active?.key === item.key} />
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/90 px-3 backdrop-blur-md sm:px-6 lg:px-8">
          <Link to="/portal" className="shrink-0 md:hidden" aria-label="Portal home">
            <img src={ADICORP_LOGO_PATH} alt="" className="h-7 w-7 object-contain" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="hidden text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-muted-foreground md:block">Employee portal</p>
            <p className="truncate font-display text-[15px] font-semibold leading-tight tracking-tight md:mt-1">{pageTitle}</p>
          </div>
          <PortalNotificationBell />
          <AvatarMenu />
        </header>

        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pb-28 md:pb-8 lg:px-8 lg:pt-7">
            {/* While a published policy is unsigned, portal pages redirect to its signing page. */}
            <PortalPolicyGate />
            <RouteErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<PageSkeleton />}>
                <div key={location.pathname} className="animate-in fade-in duration-300 motion-reduce:animate-none">
                  <Outlet />
                </div>
              </Suspense>
            </RouteErrorBoundary>
          </div>
        </main>
      </div>

      {/* Phone tab bar */}
      {portalNav.length > 0 && (
        <nav
          aria-label="Portal"
          className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-2 pt-1.5 backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto flex max-w-md items-center gap-1 pb-1.5">
            {tabs.map((item) => (
              <BottomTab key={item.key} item={item} active={active?.key === item.key} />
            ))}
            {overflow.length > 0 && (
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-medium transition-colors",
                  overflowActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <LayoutGrid className="h-5 w-5" aria-hidden />
                More
              </button>
            )}
          </div>
        </nav>
      )}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-8 pt-5">
          <SheetHeader className="pb-3 text-left">
            <SheetTitle className="text-sm font-bold">More</SheetTitle>
            <SheetDescription className="sr-only">Other portal pages</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2">
            {overflow.map((item) => (
              <MoreRow key={item.key} item={item} active={active?.key === item.key} onNavigate={() => setMoreOpen(false)} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
