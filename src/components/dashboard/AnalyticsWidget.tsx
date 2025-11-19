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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Calendar, DollarSign } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(142, 76%, 36%)', 'hsl(280, 87%, 65%)', 'hsl(45, 93%, 47%)', 'hsl(346, 77%, 49%)'];

export default function AnalyticsWidget() {
  const { userProfile } = useAuth();

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics', userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return null;

      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(new Date(), 29 - i);
        return format(startOfDay(date), 'yyyy-MM-dd');
      });

      // Fetch attendance trends
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select(`
          date,
          status,
          employees!inner(company_id)
        `)
        .eq('employees.company_id', userProfile.company_id)
        .gte('date', last30Days[0])
        .lte('date', last30Days[last30Days.length - 1]);

      // Fetch employees for salary distribution
      const { data: employeesData } = await supabase
        .from('employees')
        .select('rank, wage_rate, status')
        .eq('company_id', userProfile.company_id)
        .eq('status', 'active');

      // Process attendance trends
      const attendanceTrends = last30Days.map(date => {
        const dayAttendance = attendanceData?.filter(a => a.date === date) || [];
        return {
          date: format(new Date(date), 'MMM dd'),
          present: dayAttendance.filter(a => a.status === 'present').length,
          absent: dayAttendance.filter(a => a.status === 'absent').length,
          leave: dayAttendance.filter(a => a.status === 'leave').length,
        };
      });

      // Process salary distribution by rank
      const salaryByRank = employeesData?.reduce((acc: any, emp) => {
        const rank = emp.rank || 'Unassigned';
        if (!acc[rank]) {
          acc[rank] = { rank, totalWage: 0, count: 0 };
        }
        acc[rank].totalWage += Number(emp.wage_rate);
        acc[rank].count += 1;
        return acc;
      }, {});

      const salaryDistribution = Object.values(salaryByRank || {}).map((item: any) => ({
        rank: item.rank,
        avgWage: Math.round(item.totalWage / item.count),
        employees: item.count,
      }));

      // Calculate weekly attendance rate
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

      return {
        attendanceTrends,
        salaryDistribution,
        weeklyData,
      };
    },
    enabled: !!userProfile?.company_id,
    refetchInterval: 60000, // Refetch every minute for real-time updates
  });

  if (isLoading) {
    return (
      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Analytics Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analyticsData) return null;

  return (
    <Card className="border border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <TrendingUp className="h-5 w-5 text-primary" />
          Analytics Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="attendance" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Attendance
            </TabsTrigger>
            <TabsTrigger value="salary" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Salary
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="space-y-4">
            <div className="bg-muted/30 p-4 rounded-xl">
              <h3 className="text-sm font-semibold text-foreground mb-4">30-Day Attendance Trends</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={analyticsData.attendanceTrends}>
                  <defs>
                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[1]} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS[1]} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[4]} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS[4]} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="present" 
                    stroke={COLORS[1]} 
                    fillOpacity={1} 
                    fill="url(#colorPresent)"
                    name="Present"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="absent" 
                    stroke={COLORS[4]} 
                    fillOpacity={1} 
                    fill="url(#colorAbsent)"
                    name="Absent"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="leave" 
                    stroke={COLORS[2]} 
                    fill={COLORS[2]}
                    fillOpacity={0.3}
                    name="Leave"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="salary" className="space-y-4">
            <div className="bg-muted/30 p-4 rounded-xl">
              <h3 className="text-sm font-semibold text-foreground mb-4">Salary Distribution by Rank</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analyticsData.salaryDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="rank" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="avgWage" fill={COLORS[2]} radius={[8, 8, 0, 0]} name="Avg Wage" />
                  <Bar dataKey="employees" fill={COLORS[0]} radius={[8, 8, 0, 0]} name="Employees" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="bg-muted/30 p-4 rounded-xl">
              <h3 className="text-sm font-semibold text-foreground mb-4">Weekly Attendance Rate</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analyticsData.weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" unit="%" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="rate" 
                    stroke={COLORS[0]} 
                    strokeWidth={3}
                    dot={{ fill: COLORS[0], r: 6 }}
                    activeDot={{ r: 8 }}
                    name="Attendance %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
