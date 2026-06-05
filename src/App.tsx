
import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import PrivateRoute from "@/components/layout/PrivateRoute";
import AnimatedRoute from "@/components/layout/AnimatedRoute";
import BiometricLockScreen from "./components/auth/BiometricLockScreen";
import PermissionErrorToaster from "./components/common/PermissionErrorToaster";
import BrandLoader from "./components/common/BrandLoader";
import { Loader2 } from "lucide-react";
import { EmployeeAuthProvider } from "@/context/EmployeeAuthContext";
import { EmployeePrivateRoute, EmployeePortalLayout } from "@/components/layout/EmployeePortalLayout";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeProfile = lazy(() => import("./pages/EmployeeProfile"));
const Attendance = lazy(() => import("./pages/Attendance"));
const WorkingDays = lazy(() => import("./pages/WorkingDays"));
const Events = lazy(() => import("./pages/Events"));
const Salary = lazy(() => import("./pages/Salary"));
const Settings = lazy(() => import("./pages/Settings"));
const Reports = lazy(() => import("./pages/Reports"));
const EmployeeUpdates = lazy(() => import("./pages/EmployeeUpdates"));
const TimelineLogsPage = lazy(() => import("./pages/TimelineLogs"));
const LeaveManagement = lazy(() => import("./pages/LeaveManagement"));
const OvertimePage = lazy(() => import("./pages/Overtime"));
const OnboardingPage = lazy(() => import("./pages/Onboarding"));
const DocumentTracking = lazy(() => import("./pages/DocumentTracking"));
const Engagement = lazy(() => import("./pages/Engagement"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Portal Pages
const EmployeeLogin = lazy(() => import("./pages/portal/EmployeeLogin"));
const SetupPassword = lazy(() => import("./pages/portal/SetupPassword"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));
const PortalRecords = lazy(() => import("./pages/portal/PortalRecords"));
const PortalEngagement = lazy(() => import("./pages/portal/PortalEngagement"));
const PortalSettings = lazy(() => import("./pages/portal/PortalSettings"));

const queryClient = new QueryClient();

class ChunkErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    const isChunkLoadFailed = error?.name === 'ChunkLoadError' || 
                              error?.message?.includes('Failed to fetch dynamically imported module') ||
                              error?.message?.includes('Importing a module script failed');
    
    if (isChunkLoadFailed) {
      // If a deployment happened, old chunks disappear. Force a hard reload to fetch the new index.html.
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-4 max-w-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <h2 className="text-lg font-bold">Applying Updates...</h2>
            <p className="text-muted-foreground text-sm">We are loading the latest version of the application.</p>
            <button onClick={() => window.location.reload()} className="text-primary hover:underline text-xs mt-4">
              Click here if it doesn't load automatically
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const RouteLoader = () => (
  <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
    <div className="bg-background/80 backdrop-blur-md px-4 py-2 rounded-full border border-border/50 shadow-lg flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span className="text-xs font-semibold tracking-tight text-foreground">Loading...</span>
    </div>
  </div>
);

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div key={location.pathname}>
      <AnimatedRoute>
        <ChunkErrorBoundary>
          <Suspense fallback={<RouteLoader />}>
            <Routes location={location}>
              <Route path="/" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/employees" element={<PrivateRoute><Employees /></PrivateRoute>} />
              <Route path="/employees/:id" element={<PrivateRoute><EmployeeProfile /></PrivateRoute>} />
              <Route path="/attendance" element={<PrivateRoute><Attendance /></PrivateRoute>} />
              <Route path="/working-days" element={<PrivateRoute><WorkingDays /></PrivateRoute>} />
              <Route path="/events" element={<PrivateRoute><Events /></PrivateRoute>} />
              <Route path="/salary" element={<PrivateRoute><Salary /></PrivateRoute>} />
              <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="/employee-updates" element={<PrivateRoute><EmployeeUpdates /></PrivateRoute>} />
              <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
              <Route path="/timeline-logs" element={<PrivateRoute><TimelineLogsPage /></PrivateRoute>} />
              <Route path="/leave-management" element={<PrivateRoute><LeaveManagement /></PrivateRoute>} />
              <Route path="/overtime" element={<PrivateRoute><OvertimePage /></PrivateRoute>} />
              <Route path="/document-tracking" element={<PrivateRoute><DocumentTracking /></PrivateRoute>} />
              <Route path="/engagement" element={<PrivateRoute><Engagement /></PrivateRoute>} />
              <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
              
              {/* Employee Portal Routes */}
              <Route path="/employee-login" element={<EmployeeLogin />} />
              <Route path="/portal/setup-password" element={<SetupPassword />} />
              <Route path="/portal" element={<EmployeePrivateRoute><EmployeePortalLayout /></EmployeePrivateRoute>}>
                <Route path="profile" element={<PortalProfile />} />
                <Route path="records" element={<PortalRecords />} />
                <Route path="engagement" element={<PortalEngagement />} />
                <Route path="settings" element={<PortalSettings />} />
              </Route>

              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </Suspense>
        </ChunkErrorBoundary>
      </AnimatedRoute>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PermissionErrorToaster />
        <BiometricLockScreen />
        <EmployeeAuthProvider>
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </EmployeeAuthProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
