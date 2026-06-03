import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

export default function TodayAttendanceChart() {
  const { userProfile } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userProfile?.company_id) {
      fetchAttendanceData();
    }
  }, [userProfile?.company_id]);

  const fetchAttendanceData = async () => {
    try {
      setLoading(true);
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select(`status, employees!inner(company_id)`)
        .eq('employees.company_id', userProfile?.company_id)
        .eq('date', today)
        .neq('status', 'not_set');

      if (error) throw error;

      const counts = {
        present: 0,
        late: 0,
        leave: 0,
        absent: 0,
        short_leave: 0
      };

      attendanceData?.forEach(record => {
        if (record.status in counts) {
          counts[record.status as keyof typeof counts]++;
        }
      });

      const formattedData = [
        { name: 'Present', value: counts.present, color: '#10b981' }, // emerald-500
        { name: 'Late', value: counts.late, color: '#f59e0b' }, // amber-500
        { name: 'On Leave', value: counts.leave, color: '#8b5cf6' }, // violet-500
        { name: 'Short Leave', value: counts.short_leave, color: '#3b82f6' }, // blue-500
        { name: 'Absent', value: counts.absent, color: '#ef4444' }, // red-500
      ].filter(item => item.value > 0);

      // If no data for today, show an empty state placeholder
      if (formattedData.length === 0) {
        setData([{ name: 'No Data Yet', value: 1, color: '#e2e8f0' }]);
      } else {
        setData(formattedData);
      }

    } catch (error) {
      console.error("Error fetching attendance data for chart:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.name === 'No Data Yet') return null;
      return (
        <div className="bg-background border border-border p-2 rounded-lg shadow-lg">
          <p className="text-sm font-semibold flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }} />
            {data.name}: {data.value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border border-border/60 bg-card overflow-hidden rounded-xl shadow-sm h-[320px] flex flex-col">
      <CardHeader className="p-4 pb-2 border-b border-border/40">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          Today's Workforce Status
        </CardTitle>
        <p className="text-[10px] text-muted-foreground mt-0.5">Real-time attendance distribution</p>
      </CardHeader>
      <CardContent className="p-4 flex-1 flex items-center justify-center relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <span className="text-xs">Loading data...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                content={(props) => {
                  const { payload } = props;
                  if (data.length === 1 && data[0].name === 'No Data Yet') return null;
                  return (
                    <ul className="flex flex-wrap justify-center gap-3 text-[10px] font-medium pt-4">
                      {payload?.map((entry, index) => (
                        <li key={`item-${index}`} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="text-foreground">{entry.value}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
        {!loading && data.length === 1 && data[0].name === 'No Data Yet' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs font-medium text-muted-foreground">No records yet</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
