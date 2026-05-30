
import Dashboard from "@/components/layout/Dashboard";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Clock, Sparkles, Activity, ArrowUpRight, Zap } from "lucide-react";
import DashboardStats from "@/components/dashboard/DashboardStats";
import AnalyticsWidget from "@/components/dashboard/AnalyticsWidget";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function StaggerIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.98)",
      }}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const [greeting, setGreeting] = useState("Good day");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  return (
    <Dashboard title="Dashboard">
      <div className="space-y-4">
        {/* Welcome Section */}
        <StaggerIn delay={0}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/8 via-card to-card border border-border shadow-sm group hover:shadow-md hover:border-primary/20 transition-all duration-500">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.06),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(var(--primary)/0.03),transparent_60%)]" />
            <div className="absolute top-4 right-4 opacity-[0.03]">
              <Sparkles className="w-32 h-32 text-primary" />
            </div>
            
            {/* Animated accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            
            <div className="relative p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  {userProfile?.companies?.logo && (
                    <div className="relative">
                      <img 
                        src={userProfile.companies.logo} 
                        alt="Company Logo" 
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-primary/20 shadow-md transition-all duration-500 group-hover:scale-105 group-hover:ring-primary/30"
                      />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-card flex items-center justify-center shadow-sm">
                        <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full animate-pulse" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-primary" />
                      {greeting}
                    </p>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                      Welcome back{userProfile?.first_name ? `, ${userProfile.first_name}` : ''}!
                    </h1>
                    <p className="text-muted-foreground text-xs flex items-center gap-1.5">
                      {userProfile?.companies?.name ? (
                        <>
                          <span className="font-medium text-foreground/70">Managing</span>
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-semibold border border-primary/20 cursor-default">
                            {userProfile.companies.name}
                          </span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3 text-primary" />
                          Your HR management dashboard
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2.5 px-4 py-2 bg-card/80 backdrop-blur-sm rounded-lg border border-border shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/20 group/date cursor-default">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-300 group-hover/date:bg-primary/15 group-hover/date:scale-110 group-hover/date:rotate-3">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground font-medium">Today</p>
                    <p className="text-[11px] font-semibold text-foreground">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </StaggerIn>

        <StaggerIn delay={150}>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { label: "Mark Attendance", icon: Activity, href: "/attendance" },
              { label: "View Employees", icon: Sparkles, href: "/employees" },
              { label: "Run Payroll", icon: Zap, href: "/salary" },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  to={action.href}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-[11px] font-medium text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm transition-all duration-300 whitespace-nowrap group"
                >
                  <Icon className="w-3.5 h-3.5 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6" />
                  {action.label}
                  <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                </Link>
              );
            })}
          </div>
        </StaggerIn>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <StaggerIn delay={300}>
              <DashboardStats />
            </StaggerIn>

            <StaggerIn delay={450}>
              <AnalyticsWidget />
            </StaggerIn>
          </div>
          <div className="space-y-4">
            <StaggerIn delay={600}>
              <ActivityFeed />
            </StaggerIn>
          </div>
        </div>
      </div>
    </Dashboard>
  );
}
