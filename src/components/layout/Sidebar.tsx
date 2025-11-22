
import { Link, useLocation } from "react-router-dom";
import { 
  Calendar,
  Users,
  BarChart,
  Settings,
  Clock,
  ChartPie,
  UserCog,
  LogOut,
  Home,
  Shield,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

const navItems = [
  { name: "Dashboard", icon: Home, path: "/dashboard" },
  { name: "Employees", icon: Users, path: "/employees" },
  { name: "Attendance", icon: Clock, path: "/attendance" },
  { name: "Salary", icon: BarChart, path: "/salary" },
  { name: "Reports", icon: ChartPie, path: "/reports" },
  { name: "Working Days", icon: Calendar, path: "/working-days" },
  { name: "Events", icon: Shield, path: "/events" },
  { name: "Timeline Logs", icon: FileText, path: "/timeline-logs" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const { signOut, user, loading } = useAuth();
  
  const handleSignOut = () => {
    signOut();
  };
  
  return (
    <div className="w-64 h-screen bg-card border-r border-border fixed left-0 top-0 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src="/AdilMunawar-Uploads/31e3e556-6bb0-44a2-bd2d-6d5fa04f0ba9.png" 
              alt="AdiCorp Logo" 
              className="w-10 h-10 rounded-lg object-cover border border-border"
            />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">AdiCorp HR</h1>
            <p className="text-xs text-muted-foreground">Management System</p>
          </div>
        </div>
      </div>
      
      {/* Navigation Menu */}
      <div className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <item.icon size={18} className="flex-shrink-0" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      
      {/* User Profile and Logout */}
      <div className="border-t border-border p-3 mt-auto">
        <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg bg-muted/30">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            {loading ? (
              <Loader2 size={16} className="animate-spin text-primary-foreground" />
            ) : (
              <UserCog size={16} className="text-primary-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground truncate">
              {loading ? "Loading..." : user?.email?.split('@')[0] || "Admin"}
            </h3>
            <p className="text-xs text-muted-foreground">Administrator</p>
          </div>
        </div>
        
        <button 
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-150 w-full"
          onClick={handleSignOut}
        >
          <LogOut size={16} className="flex-shrink-0" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
