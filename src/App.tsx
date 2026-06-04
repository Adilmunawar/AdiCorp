
import { Suspense, lazy } from "react";
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
const TimelineLogsPage = lazy(() => import("./pages/TimelineLogs"));
const LeaveManagement = lazy(() => import("./pages/LeaveManagement"));
const OvertimePage = lazy(() => import("./pages/Overtime"));
const OnboardingPage = lazy(() => import("./pages/Onboarding"));
const DocumentTracking = lazy(() => import("./pages/DocumentTracking"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Portal Pages
const EmployeeLogin = lazy(() => import("./pages/portal/EmployeeLogin"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));
const PortalAttendance = lazy(() => import("./pages/portal/PortalAttendance"));
const PortalPayroll = lazy(() => import("./pages/portal/PortalPayroll"));
const PortalReports = lazy(() => import("./pages/portal/PortalReports"));

const queryClient = new QueryClient();

const RouteLoader = () => (
  <BrandLoader
    fullScreen
    message="Preparing Adicorp workspace"
    subtitle="Applying secure data and UI modules"
  />
);

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div key={location.pathname}>
      <AnimatedRoute>
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
            <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
            <Route path="/timeline-logs" element={<PrivateRoute><TimelineLogsPage /></PrivateRoute>} />
            <Route path="/leave-management" element={<PrivateRoute><LeaveManagement /></PrivateRoute>} />
            <Route path="/overtime" element={<PrivateRoute><OvertimePage /></PrivateRoute>} />
            <Route path="/document-tracking" element={<PrivateRoute><DocumentTracking /></PrivateRoute>} />
            <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
            
            {/* Employee Portal Routes */}
            <Route path="/employee-login" element={<EmployeeLogin />} />
            <Route path="/portal" element={<EmployeePrivateRoute><EmployeePortalLayout /></EmployeePrivateRoute>}>
              <Route path="profile" element={<PortalProfile />} />
              <Route path="attendance" element={<PortalAttendance />} />
              <Route path="payroll" element={<PortalPayroll />} />
              <Route path="reports" element={<PortalReports />} />
            </Route>

            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </Suspense>
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
