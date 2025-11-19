
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Users, Calendar, DollarSign, TrendingUp, Clock, UserCheck } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";

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

      // Get total employees
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('id, wage_rate, status')
        .eq('company_id', userProfile.company_id);

      if (employeesError) throw employeesError;

      // Get today's attendance by joining with employees table
      const { data: todayAttendance, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          id, 
          employee_id,
          employees!inner(company_id)
        `)
        .eq('employees.company_id', userProfile.company_id)
        .gte('date', startOfToday.toISOString().split('T')[0])
        .lte('date', endOfToday.toISOString().split('T')[0]);

      if (attendanceError) throw attendanceError;

      // Get this month's attendance count
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const { data: monthlyAttendance, error: monthlyError } = await supabase
        .from('attendance')
        .select(`
          id,
          employees!inner(company_id)
        `)
        .eq('employees.company_id', userProfile.company_id)
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      if (monthlyError) throw monthlyError;

      // Calculate stats
      const totalEmployees = employees?.length || 0;
      const activeEmployees = employees?.filter(emp => emp.status === 'active').length || 0;
      const totalWageRate = employees?.reduce((sum, emp) => sum + emp.wage_rate, 0) || 0;
      const todayAttendanceCount = todayAttendance?.length || 0;
      const monthlyAttendanceCount = monthlyAttendance?.length || 0;
      const attendanceRate = activeEmployees > 0 ? Math.round((todayAttendanceCount / activeEmployees) * 100) : 0;

      return {
        totalEmployees,
        activeEmployees,
        todayAttendance: todayAttendanceCount,
        monthlyAttendance: monthlyAttendanceCount,
        totalWageRate,
        attendanceRate
      };
    },
    enabled: !!userProfile?.company_id,
  });

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch (error) {
      return `${currency || 'USD'} ${amount.toLocaleString()}`;
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="border border-border bg-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-12 w-12 rounded-xl" />
              </div>
              <Skeleton className="h-1 w-full rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: "Total Employees",
      value: stats.totalEmployees,
      description: `${stats.activeEmployees} active`,
      icon: Users,
      gradient: "from-blue-500/20 to-blue-600/20",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500"
    },
    {
      title: "Today's Attendance",
      value: stats.todayAttendance,
      description: `${stats.attendanceRate}% attendance rate`,
      icon: UserCheck,
      gradient: "from-green-500/20 to-emerald-600/20",
      iconBg: "bg-green-500/10",
      iconColor: "text-green-500"
    },
    {
      title: "Monthly Attendance",
      value: stats.monthlyAttendance,
      description: "Total this month",
      icon: Calendar,
      gradient: "from-purple-500/20 to-violet-600/20",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-500"
    },
    {
      title: "Total Wage Budget",
      value: formatCurrency(stats.totalWageRate),
      description: "Combined wage rates",
      icon: DollarSign,
      gradient: "from-yellow-500/20 to-amber-600/20",
      iconBg: "bg-yellow-500/10",
      iconColor: "text-yellow-600"
    },
    {
      title: "Current Date",
      value: format(new Date(), "MMM dd"),
      description: format(new Date(), "yyyy"),
      icon: Clock,
      gradient: "from-cyan-500/20 to-teal-600/20",
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-500"
    },
    {
      title: "Attendance Rate",
      value: `${stats.attendanceRate}%`,
      description: "Today's rate",
      icon: TrendingUp,
      gradient: "from-pink-500/20 to-rose-600/20",
      iconBg: "bg-pink-500/10",
      iconColor: "text-pink-500"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {statCards.map((stat, index) => {
        const IconComponent = stat.icon;
        return (
          <Card 
            key={index} 
            className="relative overflow-hidden border border-border bg-card hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 group"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
            
            <CardContent className="p-6 relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {stat.title}
                  </p>
                  <h3 className="text-3xl font-bold text-foreground mb-1 tracking-tight">
                    {stat.value}
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {stat.description}
                  </p>
                </div>
                
                <div className={`${stat.iconBg} p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <IconComponent className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
              </div>
              
              <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r ${stat.gradient.replace('/20', '')} animate-pulse-glow`}
                  style={{ width: '75%' }}
                ></div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
