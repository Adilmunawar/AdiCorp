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
      <main className="p-4 pt-6 max-w-lg mx-auto">
        <Outlet />
      </main>

      {/* Floating Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-background/90 backdrop-blur-xl border border-border/50 rounded-full shadow-lg z-50 px-2 py-2 flex items-center justify-between">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center w-16 h-12 rounded-full transition-all duration-300 relative",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute inset-0 bg-primary/10 rounded-full scale-110 -z-10 animate-in zoom-in duration-200" />
              )}
              <Icon className={cn("w-5 h-5 mb-1 transition-transform", isActive && "scale-110")} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
