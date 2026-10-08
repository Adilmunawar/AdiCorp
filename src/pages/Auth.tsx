import { useEffect } from "react";
import { matchRoutes, useNavigate, useLocation } from "react-router-dom";
import AuthForm from "@/components/auth/AuthForm";
import { useAuth } from "@/context/AuthContext";
import BrandLoader from "@/components/common/BrandLoader";
import { adminRoutes } from "@/modules/registry";
import type { Role } from "@/modules/types";

const routePatterns = adminRoutes.map(({ path }) => ({ path }));

/** True unless `pathname` is a staff page that `role` may not open (it would land on "no access"). */
function canOpen(pathname: string, role: Role | null): boolean {
  const pattern = matchRoutes(routePatterns, pathname)?.[0]?.route.path;
  const route = pattern ? adminRoutes.find((r) => r.path === pattern) : undefined;
  return !route || (!!role && route.roles.includes(role));
}

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, role } = useAuth();
  // Back to the exact page that asked for sign-in, query and hash included (e.g. /messages?employee=…).
  const fromLocation = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const from = fromLocation?.pathname ? `${fromLocation.pathname}${fromLocation.search ?? ""}${fromLocation.hash ?? ""}` : "/";

  useEffect(() => {
    if (!loading && user) {
      // The page may belong to whoever was signed in before (an expired session on a shared computer):
      // a role that cannot open it starts on its own home instead.
      navigate(fromLocation?.pathname && !canOpen(fromLocation.pathname, role) ? "/" : from, { replace: true });
    }
  }, [user, loading, role, navigate, from, fromLocation?.pathname]);

  // Session check, and the brief moment between sign-in and the redirect: one branded loader.
  if (loading) return <BrandLoader fullScreen message="Authenticating..." subtitle="Securing your workspace" />;
  if (user) return <BrandLoader fullScreen message="Signing you in..." subtitle="Opening your workspace" />;

  return <AuthForm />;
}
