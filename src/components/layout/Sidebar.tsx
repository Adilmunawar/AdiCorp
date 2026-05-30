import { Link, useLocation } from "react-router-dom";
import { 
  Calendar, Users, BarChart, Settings, Clock, ChartPie,
  UserCog, LogOut, Home, Shield, FileText, ChevronLeft,
  ChevronRight, Lock, CalendarDays, Timer
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { useAuth } from "@/context/AuthContext";
import { useBiometric } from "@/hooks/useBiometric";
import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { name: "Dashboard", icon: Home, path: "/dashboard", group: "main" },
  { name: "Employees", icon: Users, path: "/employees", group: "main" },
  { name: "Attendance", icon: Clock, path: "/attendance", group: "main" },
  { name: "Leave Management", icon: CalendarDays, path: "/leave-management", group: "hr" },
  { name: "Salary", icon: BarChart, path: "/salary", group: "finance" },
  { name: "Overtime", icon: Timer, path: "/overtime", group: "finance" },
  { name: "Reports", icon: ChartPie, path: "/reports", group: "finance" },
  { name: "Working Days", icon: Calendar, path: "/working-days", group: "config" },
  { name: "Events", icon: Shield, path: "/events", group: "config" },
  { name: "Timeline Logs", icon: FileText, path: "/timeline-logs", group: "system" },
  { name: "Settings", icon: Settings, path: "/settings", group: "system" },
];

const groupLabels: Record<string, string> = {
  main: "Overview",
  hr: "HR",
  finance: "Finance",
  config: "Configuration", 
  system: "System",
};

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, mobileOpen, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { signOut, user, loading } = useAuth();
  const { isLockEnabled, isRegistered, lockApp } = useBiometric();
  const isMobile = useIsMobile();
  const compact = !isMobile && collapsed;

  const groups = Object.keys(groupLabels);

  const NavItem = ({ item }: { item: typeof navItems[0] }) => {
    const isActive = item.path === "/dashboard"
      ? location.pathname === item.path
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    const content = (
      <Link
        to={item.path}
        data-active={isActive ? "true" : "false"}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 group transition-all duration-200",
          compact && "justify-center px-2",
          isActive
            ? "bg-primary text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-black/5"
        )}
      >
        <item.icon size={15} className={cn(
          "flex-shrink-0 transition-colors duration-200",
          !isActive && "group-hover:text-primary"
        )} />
        {!compact && (
          <span className="text-[12px] font-medium tracking-tight truncate">{item.name}</span>
        )}
      </Link>
    );

    if (compact) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="font-semibold text-[10px] px-2 py-1">
            {item.name}
          </TooltipContent>
        </Tooltip>
      );
    }
    return content;
  };

  return (
    <div className={cn(
      "fixed left-0 top-0 flex flex-col z-40 bg-white border-r border-border/40 shadow-[10px_0_40px_-15px_rgba(0,0,0,0.05)] transition-[width,transform] duration-300",
      "h-screen sm:h-[calc(100vh-2rem)] sm:my-4 sm:rounded-r-3xl",
      isMobile
        ? cn("w-[240px]", mobileOpen ? "translate-x-0" : "-translate-x-full", "h-screen rounded-none my-0")
        : collapsed ? "w-[60px]" : "w-[220px]"
    )}>
      {/* Brand */}
      <div className={cn(
        "flex items-center gap-2.5 border-b border-border/40 transition-all duration-300",
        compact ? "px-2 py-3 justify-center" : "px-4 py-3"
      )}>
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-lg shadow-sm border border-black/5">
            <img 
              src={ADICORP_LOGO_PATH}
              alt="AdiCorp Logo" 
              className="w-full h-full object-contain p-0.5"
            />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-primary" />
        </div>
        {!compact && (
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-extrabold text-foreground tracking-tight leading-none">AdiCorp HR</h1>
            <p className="text-[9px] text-muted-foreground font-bold tracking-[0.15em] uppercase mt-0.5">Workspace</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      {!isMobile && (
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-[50px] z-50 w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-all shadow-sm"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={12} strokeWidth={3} /> : <ChevronLeft size={12} strokeWidth={3} />}
        </button>
      )}
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2.5 px-2" style={{ scrollbarWidth: 'none' }}>
        {groups.map((group, gi) => {
          const items = navItems.filter(i => i.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className={cn(gi > 0 && "mt-3")}>
              {!compact ? (
                <p className="px-2 mb-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                  {groupLabels[group]}
                </p>
              ) : (
                gi > 0 && <div className="w-4 mx-auto mb-2 border-t border-border/50" />
              )}
              <nav className="space-y-0.5">
                {items.map((item) => (
                  <NavItem key={item.name} item={item} />
                ))}
              </nav>
            </div>
          );
        })}
      </div>
      
      {/* Quick Actions */}
      {isRegistered && isLockEnabled && (
        <div className={cn("px-2 pb-1", compact && "px-1.5")}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button 
                onClick={lockApp}
                className={cn(
                  "flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200 text-[12px] font-medium",
                  compact && "justify-center px-2"
                )}
              >
                <Lock size={14} />
                {!compact && <span>Lock App</span>}
              </button>
            </TooltipTrigger>
            {compact && <TooltipContent side="right" sideOffset={8} className="text-[10px] py-1 px-2 font-semibold">Lock App</TooltipContent>}
          </Tooltip>
        </div>
      )}

      {/* User & Logout */}
      <div className={cn(
        "border-t border-border/40 mt-auto transition-all duration-300",
        compact ? "p-1.5" : "p-2"
      )}>
        <div className={cn(
          "flex items-center gap-2.5 p-2 rounded-xl transition-all duration-200 bg-black/5 border border-black/5",
          compact && "justify-center p-1.5"
        )}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white shadow-sm border border-black/5">
            {loading ? (
              <Loader2 size={12} className="animate-spin text-primary" />
            ) : (
              <UserCog size={12} className="text-primary" />
            )}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <h3 className="text-[11px] font-bold text-foreground truncate leading-none">
                {loading ? "Loading..." : user?.email?.split('@')[0] || "Admin"}
              </h3>
              <p className="text-[9px] text-muted-foreground font-semibold mt-0.5 uppercase tracking-wider">Administrator</p>
            </div>
          )}
        </div>
        
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button 
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 w-full mt-1 text-[12px] font-medium",
                compact && "justify-center px-2"
              )}
              onClick={() => signOut()}
              type="button"
            >
              <LogOut size={14} className="flex-shrink-0" />
              {!compact && <span>Logout</span>}
            </button>
          </TooltipTrigger>
          {compact && <TooltipContent side="right" sideOffset={8} className="text-[10px] py-1 px-2 font-semibold">Logout</TooltipContent>}
        </Tooltip>
      </div>
    </div>
  );
}
