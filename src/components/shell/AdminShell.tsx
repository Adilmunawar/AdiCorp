import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { LogOut, RotateCcw, ShieldAlert, ShieldOff, WifiOff, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import BrandLoader from "@/components/common/BrandLoader";
import { EmptyState } from "@/components/kit/layout";
import { PageSkeleton } from "@/components/kit/Skeletons";
import { useIsMobile, useMediaBelow } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";
import { homeForRole, navForRole } from "@/modules/registry";
import { MfaGate } from "@/modules/platform/mfa";
import { cn } from "@/lib/utils";
import { CommandPalette, SearchProvider } from "./search";
import { NavBadgesProvider } from "./nav-badges";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const COLLAPSE_KEY = "sidebar_collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Signed-in staff with a company and a role; otherwise redirects (auth, onboarding) or explains. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading, profile, profileError, role, signOut, refreshProfile } = useAuth();
  const location = useLocation();

  if (loading) return <BrandLoader fullScreen />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (profileError && !profile) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={WifiOff}
            title="We couldn't load your workspace"
            description="Check your connection and try again. If this keeps happening, sign out and back in."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => void refreshProfile()}>
                  <RotateCcw /> Try again
                </Button>
                <Button variant="outline" size="sm" onClick={() => void signOut()}>
                  <LogOut /> Sign out
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }
  if (!profile?.company_id) {
    try {
      sessionStorage.setItem("post_onboarding_path", `${location.pathname}${location.search}${location.hash}`);
    } catch {
      /* storage unavailable */
    }
    return <Navigate to="/onboarding" replace />;
  }
  if (!role) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={ShieldOff}
            title="Your access is being set up"
            description="Your account belongs to a company but has no role yet. Ask the workspace owner to give you the HR or Finance role."
            action={
              <Button variant="outline" size="sm" onClick={() => void signOut()}>
                <LogOut /> Sign out
              </Button>
            }
          />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Shown inside the shell when the role may not open a page. */
export function Forbidden() {
  const { role } = useAuth();
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="This area belongs to another role. If you need it, ask the workspace owner."
        action={
          <Button asChild size="sm">
            <Link to={homeForRole(role)}>Go to my home</Link>
          </Button>
        }
      />
    </div>
  );
}

/** Staff app frame: registry sidebar (icon rail on tablets, drawer on phones), top bar, scrolling content area. Mounted once. */
export function AdminShell() {
  const isMobile = useIsMobile();
  // Tablets (768-1023px) get the icon rail by default so tables keep their width; the menu can still be opened.
  const isTablet = useMediaBelow(1024) && !isMobile;
  const location = useLocation();
  const { role } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [tabletOpen, setTabletOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navItems = useMemo(() => navForRole(role).flatMap((section) => section.items), [role]);
  const mainRef = useRef<HTMLElement | null>(null);
  // Phones only see badges inside the drawer, so their counts load the first time it opens.
  const [badgesWanted, setBadgesWanted] = useState(!isMobile);
  useEffect(() => {
    if (!isMobile || drawerOpen) setBadgesWanted(true);
  }, [isMobile, drawerOpen]);
  // A page that shows the counts itself (the dashboard's "Needs attention") asks for them straight away.
  const requestBadges = useCallback(() => setBadgesWanted(true), []);

  useEffect(() => {
    setDrawerOpen(false);
    setTabletOpen(false);
  }, [location.pathname]);

  // The content area is its own scroller, so the router never resets it: a new page starts at the top.
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  const toggleCollapsed = useCallback(() => {
    if (isTablet) {
      setTabletOpen((open) => !open);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, [isTablet]);

  const rail = isTablet ? !tabletOpen : collapsed;

  return (
    <SearchProvider>
      <NavBadgesProvider items={navItems} enabled={badgesWanted} onRequest={requestBadges}>
        <a
          href="#main-content"
          className="sr-only z-[60] rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <div className="flex h-[100dvh] w-full overflow-hidden bg-muted/30">
          {!isMobile && (
            <aside
              className={cn(
                "relative z-40 h-full shrink-0 overflow-hidden rounded-r-[22px] border-r border-border/70 bg-card shadow-[6px_0_28px_-8px_hsl(var(--brand-950)/0.12)] transition-[width] duration-200 ease-out motion-reduce:transition-none",
                rail ? "w-16" : "w-60",
              )}
            >
              <Sidebar collapsed={rail} onToggleCollapse={toggleCollapsed} />
            </aside>
          )}

          {isMobile && (
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetContent side="left" className="w-[288px] max-w-[85vw] p-0 [&>button:last-child]:hidden">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">Main menu</SheetDescription>
                <Sidebar mobile onNavigate={() => setDrawerOpen(false)} />
                <SheetClose
                  aria-label="Close menu"
                  className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-5 w-5" aria-hidden />
                </SheetClose>
              </SheetContent>
            </Sheet>
          )}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar isMobile={isMobile} onOpenMenu={() => setDrawerOpen(true)} />
            <main ref={mainRef} id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none">
              <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
                <RouteErrorBoundary resetKey={location.pathname}>
                  <Suspense fallback={<PageSkeleton />}>
                    <div key={location.pathname} className="animate-in fade-in duration-300 motion-reduce:animate-none">
                      {/* Two-step verification policy applies to every staff page, not only the platform ones. */}
                      <MfaGate>
                        <Outlet />
                      </MfaGate>
                    </div>
                  </Suspense>
                </RouteErrorBoundary>
              </div>
            </main>
          </div>
        </div>
        <CommandPalette />
      </NavBadgesProvider>
    </SearchProvider>
  );
}
