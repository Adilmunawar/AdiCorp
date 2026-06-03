import Dashboard from "@/components/layout/Dashboard";
import DashboardStats from "@/components/dashboard/DashboardStats";
import AnalyticsWidget from "@/components/dashboard/AnalyticsWidget";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import TodayAttendanceChart from "@/components/dashboard/TodayAttendanceChart";
import RecentDocumentsWidget from "@/components/dashboard/RecentDocumentsWidget";
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
      <div className="flex flex-col gap-5 p-4 lg:p-6 bg-background min-h-screen">
        {/* Command Bar: Plain Text Greeting + Professional Buttons */}
        <StaggerIn delay={0}>
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex flex-col">
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                Welcome, {userProfile?.name || 'Admin'}!
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 font-medium">
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
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted hover:border-border/80 transition-all shadow-sm hover:shadow-md"
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
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-5 items-start">
          <StaggerIn delay={300} className="w-full h-full flex flex-col gap-5">
            <AnalyticsWidget />
            <RecentDocumentsWidget />
          </StaggerIn>
          
          <StaggerIn delay={450} className="w-full h-full flex flex-col gap-5">
            <TodayAttendanceChart />
            <ActivityFeed />
          </StaggerIn>
        </div>
      </div>
    </Dashboard>
  );
}
