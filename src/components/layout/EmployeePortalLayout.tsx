import React from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { User, FileText, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmployeePrivateRoute({ children }: { children?: React.ReactNode }) {
  const { employee, isLoading } = useEmployeeAuth();
  const location = useLocation();
  
  if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><div className="animate-pulse flex flex-col items-center"><div className="w-10 h-10 bg-primary/20 rounded-full mb-2"></div><div className="text-sm text-muted-foreground">Loading...</div></div></div>;
  if (!employee) return <Navigate to="/employee-login" replace />;
  
  if (employee.needs_password_change && location.pathname !== "/portal/setup-password") {
    return <Navigate to="/portal/setup-password" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export function EmployeePortalLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useEmployeeAuth();

  const navItems = [
    { path: "/portal/profile", label: "Profile", icon: User },
    { path: "/portal/records", label: "Records", icon: FileText },
    { path: "/portal/settings", label: "Settings", icon: SettingsIcon },
  ];

  const handleLogout = () => {
    logout();
    navigate("/employee-login");
  };

  return (
    <div className="min-h-[100dvh] bg-muted/20 relative pb-24">
      {/* Main Content Area */}
      <main className="p-4 md:p-8 pt-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Floating Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md md:max-w-2xl bg-background/90 backdrop-blur-xl border border-border/50 rounded-full shadow-lg z-50 px-2 md:px-6 py-2 flex items-center justify-between">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center w-20 h-[52px] rounded-full transition-all duration-300 relative z-10",
                isActive ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              {isActive && (
                <span className="absolute inset-0 bg-primary rounded-full -z-10 shadow-lg shadow-primary/30 animate-in zoom-in duration-300" />
              )}
              <Icon className={cn("w-5 h-5 mb-0.5", isActive ? "stroke-[2.5px]" : "")} />
              <span className="text-[10px] uppercase tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
