import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Home, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { useAuth } from "@/context/AuthContext";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { homeForRole, navForRole } from "@/modules/registry";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const { employee, loading: portalLoading } = useEmployeeAuth();

  useEffect(() => {
    document.title = "Page not found · AdiCorp HR";
  }, []);

  const staff = !!user && !!role;
  const home = staff ? homeForRole(role) : employee ? "/portal" : "/auth";
  const homeLabel = staff ? "Go to dashboard" : employee ? "Go to my portal" : "Sign in";
  const HomeIcon = staff || employee ? Home : LogIn;
  // React Router marks the entry a visitor landed on directly with the key "default": nothing to go back to.
  const canGoBack = location.key !== "default";
  const ready = !loading && !portalLoading;

  // A few useful places for signed-in staff: the first page of each area they can open.
  const suggestions = staff
    ? navForRole(role)
        .filter((section) => section.group !== "Overview")
        .map((section) => ({ ...section.items[0], group: section.group }))
        .slice(0, 4)
    : [];

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background bg-gradient-surface px-4 py-10">
      <main className="w-full max-w-md text-center">
        <Link
          to={home}
          aria-label="AdiCorp HR home"
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <img src={ADICORP_LOGO_PATH} alt="" className="h-full w-full object-contain p-2" />
        </Link>

        <p className="micro-label mt-7 !text-primary">Error 404</p>
        <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">We couldn't find that page</h1>
        <p className="mx-auto mt-2 max-w-sm text-balance text-sm leading-6 text-muted-foreground">
          The link may be out of date, or the page has moved. Check the address, or carry on from somewhere below.
        </p>

        <p className="mx-auto mt-4 w-fit max-w-full truncate rounded-lg border border-border bg-muted/50 px-2.5 py-1 font-mono text-xs text-muted-foreground" title={location.pathname}>
          {location.pathname}
        </p>

        <div className="mt-7 flex min-h-10 flex-col-reverse justify-center gap-2 sm:flex-row">
          {ready && (
            <>
              {canGoBack && (
                <Button variant="outline" onClick={() => navigate(-1)}>
                  <ArrowLeft aria-hidden /> Go back
                </Button>
              )}
              <Button asChild>
                <Link to={home}>
                  <HomeIcon aria-hidden /> {homeLabel}
                </Link>
              </Button>
            </>
          )}
        </div>

        {ready && suggestions.length > 0 && (
          <nav aria-label="Popular pages" className="mt-9 text-left">
            <p className="micro-label mb-2 px-1">Or jump to</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {suggestions.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <Link
                      to={item.href}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm outline-none transition-colors hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-foreground">{item.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{item.group}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </main>
    </div>
  );
}
