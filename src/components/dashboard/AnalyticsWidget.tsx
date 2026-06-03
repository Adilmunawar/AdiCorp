import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Calendar, DollarSign, Sparkles } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { useState } from "react";

const COLORS = ['hsl(168, 65%, 38%)', 'hsl(142, 76%, 36%)', 'hsl(280, 87%, 65%)', 'hsl(45, 93%, 47%)', 'hsl(346, 77%, 49%)'];

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '12px',
  color: 'hsl(var(--foreground))',
  boxShadow: '0 8px 32px -4px hsl(var(--foreground) / 0.1)',
  padding: '12px 16px',
};

export default function AnalyticsWidget() {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("attendance");

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics', userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return null;

      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(new Date(), 29 - i);
        return format(startOfDay(date), 'yyyy-MM-dd');
      });

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select(`date, status, employees!inner(company_id)`)
        .eq('employees.company_id', userProfile.company_id)
        .gte('date', last30Days[0])
        .lte('date', last30Days[last30Days.length - 1]);

      const { data: employeesData } = await supabase
        .from('employees')
        .select('rank, wage_rate, status')
        .eq('company_id', userProfile.company_id)
        .eq('status', 'active');

      const attendanceTrends = last30Days.map(date => {
        const dayAttendance = attendanceData?.filter(a => a.date === date) || [];
        return {
          date: format(new Date(date), 'MMM dd'),
          present: dayAttendance.filter(a => a.status === 'present').length,
          absent: dayAttendance.filter(a => a.status === 'absent').length,
          leave: dayAttendance.filter(a => a.status === 'leave').length,
        };
      });

      const salaryByRank = employeesData?.reduce((acc: any, emp) => {
        const rank = emp.rank || 'Unassigned';
        if (!acc[rank]) acc[rank] = { rank, totalWage: 0, count: 0 };
        acc[rank].totalWage += Number(emp.wage_rate);
        acc[rank].count += 1;
        return acc;
      }, {});

      const salaryDistribution = Object.values(salaryByRank || {}).map((item: any) => ({
        rank: item.rank,
        avgWage: Math.round(item.totalWage / item.count),
        employees: item.count,
      }));

      const last7Days = last30Days.slice(-7);
      const weeklyData = last7Days.map(date => {
        const dayAttendance = attendanceData?.filter(a => a.date === date) || [];
        const totalEmployees = employeesData?.length || 1;
        const presentCount = dayAttendance.filter(a => a.status === 'present').length;
        return {
          day: format(new Date(date), 'EEE'),
          rate: Math.round((presentCount / totalEmployees) * 100),
        };
      });

      return { attendanceTrends, salaryDistribution, weeklyData };
    },
    enabled: !!userProfile?.company_id,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="border border-border bg-card overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Analytics Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!analyticsData) return null;

  const tabs = [
    { value: "attendance", label: "Attendance", icon: Calendar },
    { value: "salary", label: "Salary", icon: DollarSign },
    { value: "performance", label: "Performance", icon: Users },
  ];

  return (
    <Card className="border border-border/60 bg-card shadow-sm overflow-hidden h-full flex flex-col rounded-md">
      <CardHeader className="pb-2 p-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <span className="text-sm font-bold leading-none block">Analytics Overview</span>
              <span className="text-[9px] text-muted-foreground font-normal leading-none block mt-1">Workforce insights</span>
            </div>
          </CardTitle>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted border border-border/50 shrink-0">
            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Live</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 mb-2 bg-muted/40 p-1 rounded-lg h-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 rounded-md data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all duration-300 text-[10px]"
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="flex-1 min-h-0 relative">
            <TabsContent value="attendance" className="absolute inset-0 m-0 border-none p-0 outline-none">
              <div className="bg-muted/5 p-3 rounded-md border border-border/40 h-full flex flex-col">
                <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 className="text-sm font-bold text-foreground">30-Day Attendance Trends</h3>
                <div className="flex items-center gap-3">
                  {[
                    { label: "Present", color: COLORS[1] },
                    { label: "Absent", color: COLORS[4] },
                    { label: "Leave", color: COLORS[2] },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                      <span className="text-[10px] text-muted-foreground font-medium">{l.label}</span>
                    </div>
                  ))}
                </div>
                </div>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analyticsData.attendanceTrends}>
                  <defs>
                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[1]} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={COLORS[1]} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[4]} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={COLORS[4]} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLeave" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[2]} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS[2]} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="present" stroke={COLORS[1]} strokeWidth={2} fillOpacity={1} fill="url(#colorPresent)" name="Present" />
                  <Area type="monotone" dataKey="absent" stroke={COLORS[4]} strokeWidth={2} fillOpacity={1} fill="url(#colorAbsent)" name="Absent" />
                    <Area type="monotone" dataKey="leave" stroke={COLORS[2]} strokeWidth={2} fillOpacity={1} fill="url(#colorLeave)" name="Leave" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="salary" className="absolute inset-0 m-0 border-none p-0 outline-none">
            <div className="bg-muted/5 p-3 rounded-md border border-border/40 h-full flex flex-col">
              <h3 className="text-xs font-bold text-foreground mb-2 shrink-0">Salary Distribution by Rank</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.salaryDistribution} barGap={4} margin={{ left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="rank" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="avgWage" fill={COLORS[0]} radius={[8, 8, 0, 0]} name="Avg Wage" />
                  <Bar dataKey="employees" fill={COLORS[2]} radius={[8, 8, 0, 0]} name="Employees" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="absolute inset-0 m-0 border-none p-0 outline-none">
            <div className="bg-muted/5 p-3 rounded-md border border-border/40 h-full flex flex-col">
              <h3 className="text-xs font-bold text-foreground mb-2 shrink-0">Weekly Attendance Rate</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analyticsData.weeklyData} margin={{ left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" unit="%" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke={COLORS[0]}
                    strokeWidth={3}
                    dot={{ fill: COLORS[0], r: 5, strokeWidth: 3, stroke: "hsl(var(--card))" }}
                    activeDot={{ r: 8, stroke: COLORS[0], strokeWidth: 2, fill: "hsl(var(--card))" }}
                    name="Attendance %"
                  />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </CardContent>
  </Card>
  );
}
