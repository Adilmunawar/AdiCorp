
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
    <div className="w-64 h-screen bg-card border-r border-border fixed left-0 top-0 overflow-y-auto animate-slide-in flex flex-col shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src="/AdilMunawar-Uploads/31e3e556-6bb0-44a2-bd2d-6d5fa04f0ba9.png" 
              alt="AdiCorp Logo" 
              className="w-12 h-12 rounded-xl object-cover ring-2 ring-primary/20"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">AdiCorp</h1>
            <p className="text-xs text-muted-foreground">HR Solutions</p>
          </div>
        </div>
      </div>
      
      {/* Navigation Menu */}
      <div className="flex-1 px-3 py-6">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent animate-pulse-glow"></div>
                )}
                <item.icon size={20} className={cn(
                  "flex-shrink-0 transition-transform duration-300",
                  isActive ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-medium relative z-10">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      
      {/* User Profile and Logout */}
      <div className="border-t border-border p-4 mt-auto bg-muted/30">
        <div className="flex items-center gap-3 mb-4 px-2 p-3 rounded-xl bg-card/50 border border-border">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 shadow-lg">
            {loading ? (
              <Loader2 size={18} className="animate-spin text-primary-foreground" />
            ) : (
              <UserCog size={18} className="text-primary-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {loading ? "Loading..." : user?.email?.split('@')[0] || "Admin User"}
            </h3>
            <p className="text-xs text-muted-foreground">Administrator</p>
          </div>
        </div>
        
        <button 
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300 w-full group border border-transparent hover:border-destructive/20"
          onClick={handleSignOut}
        >
          <LogOut size={18} className="flex-shrink-0 transition-transform group-hover:scale-110" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
