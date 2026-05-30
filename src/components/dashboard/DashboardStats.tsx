
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Users, Calendar, DollarSign, TrendingUp, Clock, UserCheck, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";
import { useEffect, useState } from "react";

function AnimatedValue({ value, className = "" }: { value: string | number; className?: string }) {
  const [displayed, setDisplayed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <span className={`inline-block transition-all duration-700 ease-out ${className} ${displayed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
      {value}
    </span>
  );
}

function MiniProgressBar({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(max > 0 ? (value / max) * 100 : 0), 300);
    return () => clearTimeout(t);
  }, [value, max]);

  return (
    <div className={`h-1.5 w-full bg-muted rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
        style={{ width: `${Math.min(width, 100)}%` }}
      />
    </div>
  );
}

export default function DashboardStats() {
  const { userProfile } = useAuth();
  const { currency } = useCurrency();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return null;

      const today = new Date();
      const startOfToday = startOfDay(today);
      const endOfToday = endOfDay(today);

      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('id, wage_rate, status')
        .eq('company_id', userProfile.company_id);

      if (employeesError) throw employeesError;

      const { data: todayAttendance, error: attendanceError } = await supabase
        .from('attendance')
        .select(`id, employee_id, employees!inner(company_id)`)
        .eq('employees.company_id', userProfile.company_id)
        .gte('date', startOfToday.toISOString().split('T')[0])
        .lte('date', endOfToday.toISOString().split('T')[0]);

      if (attendanceError) throw attendanceError;

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const { data: monthlyAttendance, error: monthlyError } = await supabase
        .from('attendance')
        .select(`id, employees!inner(company_id)`)
        .eq('employees.company_id', userProfile.company_id)
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      if (monthlyError) throw monthlyError;

      const totalEmployees = employees?.length || 0;
      const activeEmployees = employees?.filter(emp => emp.status === 'active').length || 0;
      const totalWageRate = employees?.reduce((sum, emp) => sum + emp.wage_rate, 0) || 0;
      const todayAttendanceCount = todayAttendance?.length || 0;
      const monthlyAttendanceCount = monthlyAttendance?.length || 0;
      const attendanceRate = activeEmployees > 0 ? Math.round((todayAttendanceCount / activeEmployees) * 100) : 0;

      return { totalEmployees, activeEmployees, todayAttendance: todayAttendanceCount, monthlyAttendance: monthlyAttendanceCount, totalWageRate, attendanceRate };
    },
    enabled: !!userProfile?.company_id,
  });

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: currency || 'USD',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency || 'USD'} ${amount.toLocaleString()}`;
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="border-border/40 overflow-hidden bg-card/50">
            <CardContent className="p-4">
              <Skeleton className="h-2 w-20 mb-2" />
              <Skeleton className="h-5 w-14 mb-2" />
              <Skeleton className="h-1 w-full mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { title: "Total Employees", value: stats.totalEmployees, description: `${stats.activeEmployees} active`, icon: Users, accent: "from-teal-500/10 to-emerald-500/10", iconBg: "bg-teal-500/10", iconColor: "text-teal-600", trend: "up" as const, trendValue: "+12%", progress: stats.activeEmployees, progressMax: stats.totalEmployees },
    { title: "Today's Attendance", value: stats.todayAttendance, description: `${stats.attendanceRate}% rate`, icon: UserCheck, accent: "from-blue-500/10 to-cyan-500/10", iconBg: "bg-blue-500/10", iconColor: "text-blue-600", trend: "up" as const, trendValue: `${stats.attendanceRate}%`, progress: stats.todayAttendance, progressMax: stats.activeEmployees || 1 },
    { title: "Monthly Attendance", value: stats.monthlyAttendance, description: "This month", icon: Calendar, accent: "from-violet-500/10 to-purple-500/10", iconBg: "bg-violet-500/10", iconColor: "text-violet-600", trend: "up" as const, trendValue: "+5%", progress: 65, progressMax: 100 },
    { title: "Wage Budget", value: formatCurrency(stats.totalWageRate), description: "Combined rates", icon: DollarSign, accent: "from-green-500/10 to-lime-500/10", iconBg: "bg-green-500/10", iconColor: "text-green-600", trend: "up" as const, trendValue: "On Track", progress: 78, progressMax: 100 },
    { title: "Current Date", value: format(new Date(), "MMM dd"), description: format(new Date(), "yyyy"), icon: Clock, accent: "from-orange-500/10 to-amber-500/10", iconBg: "bg-orange-500/10", iconColor: "text-orange-600", trend: "neutral" as const, trendValue: format(new Date(), "EEEE"), progress: 0, progressMax: 0 },
    { title: "Attendance Rate", value: `${stats.attendanceRate}%`, description: "Today", icon: TrendingUp, accent: "from-pink-500/10 to-rose-500/10", iconBg: "bg-pink-500/10", iconColor: "text-pink-600", trend: stats.attendanceRate >= 80 ? "up" as const : "down" as const, trendValue: stats.attendanceRate >= 80 ? "Healthy" : "Low", progress: stats.attendanceRate, progressMax: 100 },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card
            key={index}
            className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden group cursor-default transition-all duration-500 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5 relative rounded-xl"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <CardContent className="p-3.5 relative">
              {/* Hover gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              
              {/* Accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="relative flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                    {stat.title}
                  </p>
                  <h3 className="text-lg md:text-xl font-bold text-foreground mb-1 tracking-tight">
                    <AnimatedValue value={stat.value} />
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] text-muted-foreground truncate">{stat.description}</p>
                    {stat.trend !== "neutral" && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${
                        stat.trend === "up" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                      }`}>
                        {stat.trend === "up" ? <ArrowUpRight className="w-2 h-2" /> : <ArrowDownRight className="w-2 h-2" />}
                        {stat.trendValue}
                      </span>
                    )}
                  </div>
                </div>
                <div className={`w-8 h-8 rounded-lg ${stat.iconBg} flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:shadow-md flex-shrink-0`}>
                  <Icon className={`h-4 w-4 ${stat.iconColor} transition-all duration-300`} />
                </div>
              </div>
              
              {/* Progress bar */}
              {stat.progressMax > 0 && (
                <div className="mt-2.5">
                  <MiniProgressBar value={stat.progress} max={stat.progressMax} className="h-1" />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
