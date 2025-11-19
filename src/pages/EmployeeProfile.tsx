import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "@/components/layout/Dashboard";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Edit, 
  Mail, 
  Phone, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Clock,
  Award,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { currency } = useCurrency();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", rank: "", wage_rate: 0, status: "active" });

  const isAdmin = userProfile?.is_admin;

  const { data: employee, isLoading, refetch } = useQuery({
    queryKey: ['employee-profile', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: attendanceHistory } = useQuery({
    queryKey: ['employee-attendance', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', id)
        .order('date', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: activityLogs } = useQuery({
    queryKey: ['employee-activities', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*, profiles(first_name, last_name)')
        .eq('company_id', userProfile?.company_id || '')
        .ilike('description', `%${employee?.name}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: !!id && !!employee && !!userProfile?.company_id,
  });

  const handleEdit = () => {
    if (employee) {
      setEditForm({
        name: employee.name,
        rank: employee.rank,
        wage_rate: Number(employee.wage_rate),
        status: employee.status,
      });
      setIsEditModalOpen(true);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase
        .from('employees')
        .update(editForm)
        .eq('id', id);

      if (error) throw error;

      toast.success("Employee updated successfully");
      setIsEditModalOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to update employee");
    }
  };

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
      <Dashboard title="Employee Profile">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Dashboard>
    );
  }

  if (!employee) {
    return (
      <Dashboard title="Employee Profile">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Employee not found</p>
          <Button onClick={() => navigate('/employees')} className="mt-4">
            Back to Employees
          </Button>
        </div>
      </Dashboard>
    );
  }

  const attendanceStats = attendanceHistory ? {
    present: attendanceHistory.filter(a => a.status === 'present').length,
    absent: attendanceHistory.filter(a => a.status === 'absent').length,
    leave: attendanceHistory.filter(a => a.status === 'leave').length,
    rate: Math.round((attendanceHistory.filter(a => a.status === 'present').length / attendanceHistory.length) * 100)
  } : null;

  return (
    <Dashboard title="Employee Profile">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/employees')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Employees
          </Button>
          {isAdmin && (
            <Button onClick={handleEdit} className="gap-2">
              <Edit className="h-4 w-4" />
              Edit Employee
            </Button>
          )}
        </div>

        {/* Profile Card */}
        <Card className="border border-border bg-gradient-to-br from-card to-card/50 shadow-xl">
          <CardContent className="p-8">
            <div className="flex items-start gap-8">
              <Avatar className="h-24 w-24 border-4 border-primary/20">
                <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                  {employee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">{employee.name}</h1>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                        {employee.status}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <Award className="h-3 w-3" />
                        {employee.rank}
                      </Badge>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground font-medium">Wage Rate</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(Number(employee.wage_rate))}</p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Joined</p>
                      <p className="text-sm font-semibold text-foreground">
                        {format(new Date(employee.created_at), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                  {attendanceStats && (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Attendance Rate</p>
                        <p className="text-sm font-semibold text-foreground">{attendanceStats.rate}%</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Section */}
        <Tabs defaultValue="attendance" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="attendance">Attendance History</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Last 30 Days Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attendanceStats && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                      <p className="text-sm text-muted-foreground">Present</p>
                      <p className="text-2xl font-bold text-green-600">{attendanceStats.present}</p>
                    </div>
                    <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                      <p className="text-sm text-muted-foreground">Absent</p>
                      <p className="text-2xl font-bold text-red-600">{attendanceStats.absent}</p>
                    </div>
                    <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
                      <p className="text-sm text-muted-foreground">Leave</p>
                      <p className="text-2xl font-bold text-blue-600">{attendanceStats.leave}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {attendanceHistory?.map((record) => (
                    <div 
                      key={record.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          record.status === 'present' ? 'bg-green-500' :
                          record.status === 'absent' ? 'bg-red-500' : 'bg-blue-500'
                        }`} />
                        <span className="font-medium text-foreground">
                          {format(new Date(record.date), 'EEEE, MMMM dd, yyyy')}
                        </span>
                      </div>
                      <Badge variant={
                        record.status === 'present' ? 'default' :
                        record.status === 'absent' ? 'destructive' : 'secondary'
                      } className="capitalize">
                        {record.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-muted/30 p-4 rounded-xl">
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">Overall Attendance</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground">{attendanceStats?.rate}%</span>
                        <span className="text-sm text-muted-foreground">attendance rate</span>
                      </div>
                    </div>

                    <div className="bg-muted/30 p-4 rounded-xl">
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">Status</h3>
                      <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className="text-lg py-1 px-3">
                        {employee.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-muted/30 p-4 rounded-xl">
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">Position</h3>
                      <p className="text-xl font-bold text-foreground">{employee.rank}</p>
                    </div>

                    {isAdmin && (
                      <div className="bg-primary/10 p-4 rounded-xl border border-primary/20">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Monthly Wage</h3>
                        <p className="text-2xl font-bold text-primary">{formatCurrency(Number(employee.wage_rate))}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {activityLogs?.map((log) => (
                    <div key={log.id} className="flex gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Activity className="h-5 w-5 text-primary" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{log.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                        </p>
                        {log.action_type && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            {log.action_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!activityLogs || activityLogs.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">No activity logs found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="rank">Rank</Label>
              <Input
                id="rank"
                value={editForm.rank}
                onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="wage_rate">Wage Rate</Label>
              <Input
                id="wage_rate"
                type="number"
                value={editForm.wage_rate}
                onChange={(e) => setEditForm({ ...editForm, wage_rate: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-md"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dashboard>
  );
}
