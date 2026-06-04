import React from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { User, Clock, DollarSign, FileText, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmployeePrivateRoute({ children }: { children?: React.ReactNode }) {
  const { employee, isLoading } = useEmployeeAuth();
  
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;
  if (!employee) return <Navigate to="/employee-login" replace />;
  
  return children ? <>{children}</> : <Outlet />;
}

export function EmployeePortalLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useEmployeeAuth();

  const navItems = [
    { path: "/portal/profile", label: "Profile", icon: User },
    { path: "/portal/attendance", label: "Attendance", icon: Clock },
    { path: "/portal/payroll", label: "Payroll", icon: DollarSign },
    { path: "/portal/reports", label: "Reports", icon: FileText },
  ];

  const handleLogout = () => {
    logout();
    navigate("/employee-login");
  };

  return (
    <div className="min-h-[100dvh] bg-muted/20 relative pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            AC
          </div>
          <span className="font-bold text-sm">Employee Portal</span>
        </div>
        <button 
          onClick={handleLogout}
          className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="p-4 max-w-lg mx-auto">
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
