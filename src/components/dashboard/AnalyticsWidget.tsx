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
  ReferenceArea,
  Label,
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
        .select(`date, status, employee_id, employees!inner(company_id)`)
        .eq('employees.company_id', userProfile.company_id)
        .gte('date', last30Days[0])
        .lte('date', last30Days[last30Days.length - 1]);

      const { data: leaveRequestsData } = await supabase
        .from('leave_requests')
        .select('employee_id, start_date, end_date')
        .eq('company_id', userProfile.company_id)
        .eq('status', 'approved')
        .lte('start_date', last30Days[last30Days.length - 1])
        .gte('end_date', last30Days[0]);

      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, rank, wage_rate, status')
        .eq('company_id', userProfile.company_id)
        .eq('status', 'active');

      const { data: eventsData } = await supabase
        .from('events')
        .select('date, title, type, affects_attendance')
        .eq('company_id', userProfile.company_id)
        .eq('affects_attendance', true)
        .gte('date', last30Days[0])
        .lte('date', last30Days[last30Days.length - 1]);

      const attendanceTrends = last30Days.map(dateStr => {
        const dayAttendance = attendanceData?.filter(a => a.date === dateStr) || [];
        const activeEmployees = employeesData || [];
        
        let present = 0;
        let shortLeave = 0;
        let leave = 0;
        let absent = 0;

        const dateObj = new Date(dateStr);
        const isSunday = dateObj.getDay() === 0;

        activeEmployees.forEach(emp => {
          const record = dayAttendance.find(a => a.employee_id === emp.id);
          if (record?.status === 'present') {
            present++;
          } else if (record?.status === 'short_leave') {
            shortLeave++;
          } else {
            // Check if there is an approved leave request for this date
            const isLeaveApproved = leaveRequestsData?.some(l => l.employee_id === emp.id && dateStr >= l.start_date && dateStr <= l.end_date);
            const isEventHoliday = eventsData?.some(e => e.date === dateStr);

            if (isLeaveApproved || isEventHoliday) {
              leave++;
            } else if (!isSunday) {
              // Only count as absent if it's a working day (not Sunday)
              absent++;
            }
          }
        });

        const eventForDay = eventsData?.find(e => e.date === dateStr);

        return {
          date: format(dateObj, 'MMM dd'),
          present,
          shortLeave,
          leave,
          absent,
          eventTitle: eventForDay ? eventForDay.title : null
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

  const trends = analyticsData?.attendanceTrends || [];
  const eventPeriods: any[] = [];
  let currentPeriod: any = null;
  
  trends.forEach((day: any, i: number) => {
    if (day.eventTitle) {
      if (!currentPeriod || currentPeriod.title !== day.eventTitle) {
        if (currentPeriod) eventPeriods.push(currentPeriod);
        const startIdx = Math.max(0, i - 1);
        const endIdx = Math.min(trends.length - 1, i + 1);
        currentPeriod = { 
          start: trends[startIdx].date, 
          end: trends[endIdx].date, 
          title: day.eventTitle 
        };
      } else {
        const endIdx = Math.min(trends.length - 1, i + 1);
        currentPeriod.end = trends[endIdx].date;
      }
    } else {
      if (currentPeriod) {
        eventPeriods.push(currentPeriod);
        currentPeriod = null;
      }
    }
  });
  if (currentPeriod) eventPeriods.push(currentPeriod);

  return (
    <Card className="border-border/60 bg-card shadow-sm overflow-hidden h-full flex flex-col rounded-xl">
      <CardHeader className="pb-2 p-4 shrink-0 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-foreground">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 shadow-sm border border-primary/20">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="text-base font-black leading-none block tracking-tight">Analytics Command Center</span>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mt-1.5">Live Workforce Insights</span>
            </div>
          </CardTitle>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-extrabold text-green-600 uppercase tracking-widest">Live Sync</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 flex-1 overflow-y-auto scrollbar-hide space-y-6">
        
        {/* Main Chart: Attendance Trends */}
        <div className="bg-gradient-to-b from-muted/20 to-transparent p-4 rounded-xl border border-border/50 h-[300px] flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
          <div className="flex items-center justify-between mb-4 shrink-0 relative z-10">
            <div>
              <h3 className="text-sm font-black text-foreground">30-Day Attendance Velocity</h3>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Historical presence vs absence</p>
            </div>
            <div className="flex items-center gap-3 bg-background/50 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-border/50 shadow-sm">
              {[
                { label: "Present", color: '#10b981' },
                { label: "Short Leave", color: '#3b82f6' },
                { label: "Paid Leave", color: '#a855f7' },
                { label: "Absent", color: '#ef4444' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-foreground font-bold">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData.attendanceTrends} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorShortLeave" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPaidLeave" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="present" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPresent)" name="Present" activeDot={{ r: 6, strokeWidth: 0, fill: "#10b981" }} />
                <Area type="monotone" dataKey="shortLeave" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorShortLeave)" name="Short Leave" activeDot={{ r: 6, strokeWidth: 0, fill: "#3b82f6" }} />
                <Area type="monotone" dataKey="leave" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorPaidLeave)" name="Paid Leave" activeDot={{ r: 6, strokeWidth: 0, fill: "#a855f7" }} />
                <Area type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorAbsent)" name="Absent" activeDot={{ r: 6, strokeWidth: 0, fill: "#ef4444" }} />
                
                {eventPeriods.map((period: any, idx: number) => (
                  <ReferenceArea 
                    key={`event-${idx}`} 
                    x1={period.start} 
                    x2={period.end} 
                    strokeOpacity={0.3} 
                    fill="#eab308" 
                    fillOpacity={0.15}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Secondary Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Salary Distribution */}
          <div className="bg-gradient-to-b from-muted/20 to-transparent p-4 rounded-xl border border-border/50 h-[220px] flex flex-col">
            <div className="mb-3 shrink-0 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-foreground">Salary Distribution</h3>
                <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wider">Average wage by rank</p>
              </div>
              <DollarSign className="w-4 h-4 text-primary/50" />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.salaryDistribution} margin={{ left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                  <XAxis dataKey="rank" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} dy={5} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} dx={-5} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted)/0.5)' }} />
                  <Bar dataKey="avgWage" fill={COLORS[0]} radius={[4, 4, 0, 0]} name="Avg Wage" maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance/Weekly Rate */}
          <div className="bg-gradient-to-b from-muted/20 to-transparent p-4 rounded-xl border border-border/50 h-[220px] flex flex-col">
            <div className="mb-3 shrink-0 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-foreground">Weekly Pulse</h3>
                <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wider">Attendance % by day</p>
              </div>
              <Users className="w-4 h-4 text-primary/50" />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.weeklyData} margin={{ left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} dy={5} />
                  <YAxis stroke="hsl(var(--muted-foreground))" unit="%" fontSize={9} tickLine={false} axisLine={false} dx={-5} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke={COLORS[3]}
                    strokeWidth={3}
                    dot={{ fill: COLORS[3], r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    activeDot={{ r: 6, stroke: COLORS[3], strokeWidth: 0 }}
                    name="Attendance %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </CardContent>
    </Card>
  );
}
