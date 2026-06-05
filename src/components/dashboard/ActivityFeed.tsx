import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Activity, Clock, LogIn, UserPlus, FileText, CheckCircle, Upload, Download, Edit, Trash2, Settings, Calendar, Shield, RefreshCw, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const actionIcons: Record<string, any> = {
  'employee_import': Upload, 'employee_export': Download, 'employee_create': UserPlus,
  'employee_update': Edit, 'employee_delete': Trash2, 'settings_update': Settings,
  'working_days_update': Calendar, 'event_create': Shield, 'event_update': Shield,
  'event_delete': Shield, 'attendance_bulk_update': RefreshCw, 'attendance_save': CheckCircle,
  'company_setup': Settings, 'system_backup': Download, 'password_change': AlertCircle, 'leave_approved': CheckCircle, 'leave_rejected': AlertCircle, 'default': Activity,
};

const actionColors: Record<string, string> = {
  'employee_import': 'text-green-500 bg-green-500/10', 'employee_export': 'text-blue-500 bg-blue-500/10', 'employee_create': 'text-emerald-500 bg-emerald-500/10',
  'employee_update': 'text-yellow-500 bg-yellow-500/10', 'employee_delete': 'text-red-500 bg-red-500/10', 'settings_update': 'text-purple-500 bg-purple-500/10',
  'working_days_update': 'text-orange-500 bg-orange-500/10', 'event_create': 'text-cyan-500 bg-cyan-500/10', 'event_update': 'text-indigo-500 bg-indigo-500/10',
  'event_delete': 'text-pink-500 bg-pink-500/10', 'attendance_bulk_update': 'text-teal-500 bg-teal-500/10', 'attendance_save': 'text-emerald-600 bg-emerald-600/10',
  'company_setup': 'text-violet-500 bg-violet-500/10', 'system_backup': 'text-gray-500 bg-gray-500/10', 'password_change': 'text-red-600 bg-red-600/10', 
  'leave_approved': 'text-green-600 bg-green-600/10', 'leave_rejected': 'text-red-600 bg-red-600/10', 'default': 'text-slate-500 bg-slate-500/10',
};

export default function ActivityFeed() {
  const { userProfile } = useAuth();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['recent-activity', userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return [];
      
      const { data: logs, error } = await supabase
        .from('activity_logs')
        .select(`id, action_type, description, details, created_at, profiles (first_name, last_name)`)
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false })
        .limit(6);
        
      if (error) throw error;
      
      return logs?.map(log => {
        const Icon = actionIcons[log.action_type] || actionIcons.default;
        const colorClasses = actionColors[log.action_type] || actionColors.default;
        const [textColor, bgColor] = colorClasses.split(' ');
        
        let title = log.action_type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (log.action_type === 'attendance_save') title = "Attendance Marked";
        else if (log.action_type === 'leave_approved') title = "Leave Approved";
        else if (log.action_type === 'leave_rejected') title = "Leave Rejected";
        else if (log.action_type === 'employee_create') title = "New Employee Added";
        
        return {
          id: log.id,
          title,
          description: log.description,
          time: new Date(log.created_at || new Date()),
          icon: Icon,
          color: textColor,
          bg: bgColor
        };
      }) || [];
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
