import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Activity, Clock, LogIn, UserPlus, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function ActivityFeed() {
  const { userProfile } = useAuth();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['recent-activity', userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return [];
      
      // We will mock this or fetch recent attendance and employees as "activity" since there isn't a dedicated activity table
      const { data: employees } = await supabase
        .from('employees')
        .select('id, name, created_at')
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false })
        .limit(3);

      const { data: attendance } = await supabase
        .from('attendance')
        .select(`id, status, created_at, employees (name)`)
        .eq('employees.company_id', userProfile.company_id)
        .order('created_at', { ascending: false })
        .limit(4);

      const items = [
        ...(employees?.map(e => ({
          id: `emp-${e.id}`,
          type: 'new_employee',
          title: 'New Employee Added',
          description: `${e.name} joined the company`,
          time: new Date(e.created_at || new Date()),
          icon: UserPlus,
          color: 'text-blue-500',
          bg: 'bg-blue-500/10'
        })) || []),
        ...(attendance?.map(a => ({
          id: `att-${a.id}`,
          type: 'attendance',
          title: `Attendance Marked: ${a.status}`,
          description: `${a.employees?.name || 'Employee'} marked as ${a.status}`,
          time: new Date(a.created_at || new Date()),
          icon: Clock,
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10'
        })) || [])
      ];

      return items.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 5);
    },
    enabled: !!userProfile?.company_id,
  });

  return (
    <Card className="border-border/60 bg-card shadow-sm h-full flex flex-col rounded-md overflow-hidden">
      <CardHeader className="p-3 border-b border-border/30 shrink-0">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto scrollbar-hide">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : activities?.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No recent activity found.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {activities?.map((activity) => {
              const Icon = activity.icon;
              return (
                <div key={activity.id} className="p-3.5 flex gap-3 hover:bg-muted/30 transition-colors">
                  <div className={`w-8 h-8 rounded-full ${activity.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <Icon className={`w-4 h-4 ${activity.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground truncate">{activity.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{activity.description}</p>
                    <p className="text-[9px] font-medium text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(activity.time, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
