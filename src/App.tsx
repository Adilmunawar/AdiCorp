import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { EmployeeAuthProvider } from "@/context/EmployeeAuthContext";
import BiometricLockScreen from "@/components/auth/BiometricLockScreen";
import PermissionErrorToaster from "@/components/common/PermissionErrorToaster";
import BrandLoader from "@/components/common/BrandLoader";
import { RoleGate } from "@/components/auth/RoleGate";
import { AdminShell, Forbidden, RequireStaff } from "@/components/shell/AdminShell";
import { RouteErrorBoundary } from "@/components/shell/RouteErrorBoundary";
import { PortalGuard, PortalIndexRedirect, PortalShell } from "@/components/portal-shell/PortalShell";
import { adminRoutes, homeForRole, portalRoutes, publicRoutes } from "@/modules/registry";

const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const EmployeeLogin = lazy(() => import("./pages/portal/EmployeeLogin"));
const SetupPassword = lazy(() => import("./pages/portal/SetupPassword"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** `/`: staff home when signed in, otherwise the sign-in page. */
function HomeRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return <BrandLoader fullScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <Navigate to={homeForRole(role)} replace />;
}

/** Signed-in user (company not required): onboarding. */
function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <BrandLoader fullScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <RouteErrorBoundary fullScreen>
      <Suspense fallback={<BrandLoader fullScreen />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/employee-login" element={<EmployeeLogin />} />
          <Route path="/portal/setup-password" element={<SetupPassword />} />
          <Route path="/onboarding" element={<RequireUser><Onboarding /></RequireUser>} />
          {publicRoutes.map((r) => (
            <Route key={`public:${r.path}`} path={r.path} element={r.element} />
          ))}

          {/* Staff app: one persistent shell, every page guarded by role. */}
          <Route element={<RequireStaff><AdminShell /></RequireStaff>}>
            {adminRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={<RoleGate roles={r.roles} fallback={<Forbidden />}>{r.element}</RoleGate>} />
            ))}
          </Route>

          {/* Employee portal */}
          <Route path="/portal" element={<PortalGuard><PortalShell /></PortalGuard>}>
            <Route index element={<PortalIndexRedirect />} />
            {portalRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Route>

          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <AuthProvider>
          <EmployeeAuthProvider>
            <Toaster />
            <Sonner position="top-right" closeButton />
            <PermissionErrorToaster />
            <BiometricLockScreen />
            <AppRoutes />
          </EmployeeAuthProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
