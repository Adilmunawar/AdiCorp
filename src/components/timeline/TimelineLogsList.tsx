import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Clock, Users, Download, Upload, Settings, Calendar, Shield, UserPlus, Trash2, Edit, RefreshCw, Search, Filter, AlertCircle, Info, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface ActivityLog {
  id: string; action_type: string; description: string; details: any;
  user_id: string; company_id: string; created_at: string;
  profiles?: { first_name: string | null; last_name: string | null; } | null;
}

const actionIcons: Record<string, any> = {
  'employee_import': Upload, 'employee_export': Download, 'employee_create': UserPlus,
  'employee_update': Edit, 'employee_delete': Trash2, 'settings_update': Settings,
  'working_days_update': Calendar, 'event_create': Shield, 'event_update': Shield,
  'event_delete': Shield, 'attendance_bulk_update': RefreshCw, 'attendance_save': CheckCircle,
  'company_setup': Settings, 'system_backup': Download, 'password_change': AlertCircle, 'default': Clock,
};

const actionColors: Record<string, string> = {
  'employee_import': 'bg-green-500', 'employee_export': 'bg-blue-500', 'employee_create': 'bg-emerald-500',
  'employee_update': 'bg-yellow-500', 'employee_delete': 'bg-red-500', 'settings_update': 'bg-purple-500',
  'working_days_update': 'bg-orange-500', 'event_create': 'bg-cyan-500', 'event_update': 'bg-indigo-500',
  'event_delete': 'bg-pink-500', 'attendance_bulk_update': 'bg-teal-500', 'attendance_save': 'bg-green-600',
  'company_setup': 'bg-violet-500', 'system_backup': 'bg-gray-500', 'password_change': 'bg-red-600', 'default': 'bg-slate-500',
};

const getPriority = (actionType: string, details: any) => {
  if (details?.priority) return details.priority;
  switch (actionType) {
    case 'password_change': case 'employee_delete': case 'system_backup': return 'high';
    case 'employee_create': case 'employee_update': case 'settings_update': case 'working_days_update': return 'medium';
    case 'attendance_save': case 'attendance_bulk_update': case 'event_create': case 'event_update': return 'low';
    default: return 'medium';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'bg-red-500/20 text-red-600 border-red-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30';
    case 'low': return 'bg-green-500/20 text-green-600 border-green-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const getPriorityIcon = (priority: string) => {
  switch (priority) { case 'high': return AlertCircle; case 'medium': return Info; case 'low': return CheckCircle; default: return Info; }
};

export default function TimelineLogsList() {
  const { userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const ITEMS_PER_PAGE = 20;

  const { data: logs, isLoading, error, refetch } = useQuery({
    queryKey: ['timeline-logs', userProfile?.company_id, searchTerm, filterType, page],
    queryFn: async () => {
      if (!userProfile?.company_id) return [];
      let query = supabase.from('activity_logs').select(`id, action_type, description, details, user_id, company_id, created_at, profiles (first_name, last_name)`)
        .eq('company_id', userProfile.company_id).order('created_at', { ascending: false });
      if (filterType !== 'all') query = query.eq('action_type', filterType);
      if (searchTerm) query = query.ilike('description', `%${searchTerm}%`);
      const from = (page - 1) * ITEMS_PER_PAGE;
      query = query.range(from, from + ITEMS_PER_PAGE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data?.map(log => ({ ...log, user_name: log.profiles ? `${log.profiles.first_name || ''} ${log.profiles.last_name || ''}`.trim() || 'Unknown User' : 'System' })) || [];
    },
    enabled: !!userProfile?.company_id,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await queryClient.invalidateQueries({ queryKey: ['timeline-logs'] }); await refetch(); toast.success("Timeline logs refreshed!"); }
    catch { toast.error("Failed to refresh"); }
    finally { setIsRefreshing(false); }
  };

  const formatActionType = (actionType: string) => actionType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  if (isLoading) {
    return (<div className="space-y-4">{[...Array(5)].map((_, i) => (<Card key={i} className="glass-card"><CardContent className="p-4"><div className="flex items-start gap-4"><Skeleton className="w-10 h-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-4 w-20" /></div></CardContent></Card>))}</div>);
  }

  if (error) {
    return (<Card className="glass-card"><CardContent className="p-6 text-center"><p className="text-destructive">Error loading timeline logs</p><Button onClick={handleRefresh} className="mt-4">Try Again</Button></CardContent></Card>);
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-5 bg-muted/5 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> System Activity Timeline
              </h2>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Track all important changes and activities in your system.</p>
          </div>
          <Button onClick={handleRefresh} disabled={isRefreshing} className="h-9 text-xs rounded-lg shadow-sm font-semibold w-full sm:w-auto">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="Search logs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <div className="w-full sm:w-48">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Filter by type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  <SelectItem value="password_change">Password Changes</SelectItem>
                  <SelectItem value="employee_import">Employee Import</SelectItem>
                  <SelectItem value="employee_export">Employee Export</SelectItem>
                  <SelectItem value="employee_create">Employee Created</SelectItem>
                  <SelectItem value="employee_update">Employee Updated</SelectItem>
                  <SelectItem value="employee_delete">Employee Deleted</SelectItem>
                  <SelectItem value="attendance_save">Attendance Saved</SelectItem>
                  <SelectItem value="settings_update">Settings Changed</SelectItem>
                  <SelectItem value="working_days_update">Working Days Updated</SelectItem>
                  <SelectItem value="event_create">Event Created</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {logs && logs.length > 0 ? logs.map((log) => {
          const IconComponent = actionIcons[log.action_type] || actionIcons.default;
          const actionColor = actionColors[log.action_type] || actionColors.default;
          const priority = getPriority(log.action_type, log.details);
          const priorityColor = getPriorityColor(priority);
          const PriorityIcon = getPriorityIcon(priority);
          return (
            <Card key={log.id} className="glass-card hover:bg-muted/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-full ${actionColor} flex-shrink-0`}>
                    <IconComponent className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">{formatActionType(log.action_type)}</Badge>
                          <Badge className={`text-xs ${priorityColor}`}><PriorityIcon className="h-3 w-3 mr-1" />{priority.toUpperCase()}</Badge>
                          <span className="text-sm text-muted-foreground">by {log.user_name}</span>
                        </div>
                        <p className="text-foreground font-medium mb-2">{log.description}</p>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2 mt-2">
                            {Object.entries(log.details).map(([key, value]) => (
                              <div key={key} className="flex justify-between py-1">
                                <span className="capitalize">{key.replace(/_/g, ' ')}:</span>
                                <span className="text-foreground">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-sm text-muted-foreground flex-shrink-0">
                        <div>{format(new Date(log.created_at), 'MMM dd, yyyy')}</div>
                        <div>{format(new Date(log.created_at), 'HH:mm:ss')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }) : (
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Activity Yet</h3>
              <p className="text-muted-foreground">{searchTerm || filterType !== 'all' ? 'No activities match your current filters.' : 'System activities will appear here as they occur.'}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {logs && logs.length === ITEMS_PER_PAGE && (
        <div className="flex justify-center">
          <Button onClick={() => setPage(page + 1)} variant="outline">Load More</Button>
        </div>
      )}
    </div>
  );
}
