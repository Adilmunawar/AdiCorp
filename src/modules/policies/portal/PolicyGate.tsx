import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, PenTool } from "lucide-react";
import { usePortalPendingSignatures } from "../lib/api";

/** Paths an employee can still open while a policy waits for their signature. */
const OPEN_PATHS = ["/portal/policies", "/portal/setup-password", "/portal/account", "/portal/settings"];

/**
 * Signing gate for the employee portal. Mount it once inside the portal shell: while a
 * published policy is unsigned, every portal page redirects to its signing page
 * (Policies and account settings stay reachable). Renders nothing.
 */
export function PortalPolicyGate() {
  const { data } = usePortalPendingSignatures();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const next = data?.[0];

  useEffect(() => {
    if (!next) return;
    if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;
    navigate(`/portal/policies/sign/${next.version_id}`, { replace: true });
  }, [next, pathname, navigate]);

  return null;
}

/** A compact call to action for the portal home page while policies wait to be signed. */
export function PendingPoliciesBanner() {
  const { data } = usePortalPendingSignatures();
  if (!data?.length) return null;
  const first = data[0];
  return (
    <Link
      to={`/portal/policies/sign/${first.version_id}`}
      className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <PenTool className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">
          {data.length === 1 ? `Please read and sign ${first.title}` : `${data.length} policies are waiting for your signature`}
        </span>
        <span className="block truncate text-xs text-muted-foreground">It takes a few minutes. Read it to the end, then sign.</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden />
    </Link>
  );
}
