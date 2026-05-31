import Dashboard from "@/components/layout/Dashboard";
import DashboardStats from "@/components/dashboard/DashboardStats";
import AnalyticsWidget from "@/components/dashboard/AnalyticsWidget";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Clock, Users, DollarSign } from "lucide-react";
import StaggerIn from "@/components/animations/StaggerIn";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

export default function DashboardPage() {
  const { userProfile } = useAuth();

  return (
    <Dashboard title="">
      <div className="h-[calc(100vh-40px)] flex flex-col gap-4 p-4 overflow-hidden bg-background">
        {/* Command Bar: Plain Text Greeting + Professional Buttons */}
        <StaggerIn delay={0}>
          <div className="flex items-center justify-between pb-2">
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-foreground">
                Welcome, {userProfile?.first_name || 'Admin'}!
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <Clock className="w-3.5 h-3.5" />
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {[
                { label: "Attendance", icon: Clock, href: "/attendance" },
                { label: "Employees", icon: Users, href: "/employees" },
                { label: "Payroll", icon: DollarSign, href: "/salary" },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    to={action.href}
                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-card border border-border text-xs font-medium text-foreground hover:bg-muted hover:border-border/80 transition-colors shadow-sm"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    {action.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </StaggerIn>

        {/* Dashboard Stats Micro-Grid */}
        <StaggerIn delay={150}>
          <DashboardStats />
        </StaggerIn>

        {/* Analytics & Activity Split */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 min-h-0">
          <StaggerIn delay={300} className="h-full min-h-0">
            <AnalyticsWidget />
          </StaggerIn>
          
          <StaggerIn delay={450} className="h-full min-h-0">
            <ActivityFeed />
          </StaggerIn>
        </div>
      </div>
    </Dashboard>
  );
}
