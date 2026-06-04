import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "@/components/layout/Dashboard";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, Edit, Mail, Phone, Calendar, TrendingUp,
  Clock, Award, Activity, CheckCircle2, XCircle, CreditCard, Building, User
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import DocumentManager from "@/components/employees/DocumentManager";
import EmployeeForm from "@/components/employees/EmployeeForm";

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { currency } = useCurrency();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const isAdmin = userProfile?.is_admin;

  const { data: employee, isLoading, refetch } = useQuery({
    queryKey: ['employee-profile', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: attendanceHistory } = useQuery({
    queryKey: ['employee-attendance', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('attendance').select('*').eq('employee_id', id).order('date', { ascending: false }).limit(30);
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
    setIsEditModalOpen(true);
  };

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    } catch { return `${currency || 'USD'} ${amount.toLocaleString()}`; }
  };

  if (isLoading) {
    return <Dashboard title="Employee Profile"><div className="space-y-6"><Skeleton className="h-48 w-full rounded-3xl" /><Skeleton className="h-96 w-full rounded-3xl" /></div></Dashboard>;
  }

  if (!employee) {
    return <Dashboard title="Employee Profile"><div className="text-center py-12"><p className="text-muted-foreground">Employee not found</p><Button onClick={() => navigate('/employees')} className="mt-4">Back to Employees</Button></div></Dashboard>;
  }

  const attendanceStats = attendanceHistory && attendanceHistory.length > 0 ? {
    present: attendanceHistory.filter(a => a.status === 'present').length,
    absent: attendanceHistory.filter(a => a.status === 'absent').length,
    leave: attendanceHistory.filter(a => a.status === 'leave').length,
    rate: Math.round((attendanceHistory.filter(a => a.status === 'present').length / attendanceHistory.length) * 100)
  } : null;

  return (
    <Dashboard title="Employee Profile">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/employees')} className="gap-2 rounded-xl">
            <ArrowLeft className="h-4 w-4" />Back to Directory
          </Button>
          {isAdmin && (
            <Button onClick={handleEdit} className="gap-2 rounded-xl shadow-sm">
              <Edit className="h-4 w-4" />Edit Profile
            </Button>
          )}
        </div>

        {/* Compact Header Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-5">
            <Avatar className="h-20 w-20 border-2 border-primary/10 shadow-sm bg-card">
              {employee.avatar_url && (
                <img src={employee.avatar_url} alt={employee.name} className="w-full h-full object-cover" />
              )}
              <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                {employee.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">{employee.name}</h1>
                <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className="capitalize shadow-sm px-2 py-0">
                  {employee.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs sm:text-sm font-medium">
                <span className="flex items-center gap-1 text-primary">
                  <Award className="h-3.5 w-3.5" /> {employee.rank}
                </span>
                {employee.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {employee.email}
                  </span>
                )}
                {employee.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {employee.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Separator className="mb-5 opacity-50" />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined</p>
              <p className="text-xs sm:text-sm font-semibold">{format(new Date(employee.created_at), 'MMM dd, yyyy')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Schedule</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5">
                <p className="text-xs sm:text-sm font-semibold">{employee.salary_divisor ? employee.salary_divisor === 26 ? '6 Days / Week' : employee.salary_divisor === 22 ? '5 Days / Week' : 'Custom' : 'Company Default'}</p>
                {employee.weekend_saturday === false && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">Sat ON</Badge>}
                {employee.weekend_saturday === true && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 bg-green-500/10 text-green-600 border-green-500/20">Sat OFF</Badge>}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Wage</p>
              <p className="text-xs sm:text-sm font-semibold text-primary">{formatCurrency(Number(employee.wage_rate))}</p>
            </div>
            {employee.cnic && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> ID</p>
                <p className="text-xs sm:text-sm font-semibold">{employee.cnic}</p>
              </div>
            )}
            {attendanceStats && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Attendance</p>
                <p className="text-xs sm:text-sm font-semibold text-green-600">{attendanceStats.rate}% Rate</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap w-full h-auto bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="overview" className="flex-1 rounded-lg text-xs py-1.5">Overview</TabsTrigger>
            <TabsTrigger value="attendance" className="flex-1 rounded-lg text-xs py-1.5">Attendance</TabsTrigger>
            <TabsTrigger value="documents" className="flex-1 rounded-lg text-xs py-1.5">Documents</TabsTrigger>
            <TabsTrigger value="activity" className="flex-1 rounded-lg text-xs py-1.5">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Financial & Bank Details */}
              <Card className="col-span-1 md:col-span-2 rounded-3xl border border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Building className="h-5 w-5 text-primary" /> Bank & Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Bank Name</p>
                      <p className="font-medium mt-1">{employee.bank_name || <span className="text-muted-foreground italic">Not provided</span>}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Account Number</p>
                      <p className="font-medium mt-1">{employee.bank_account_number || <span className="text-muted-foreground italic">Not provided</span>}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Shift Type</p>
                      <p className="font-medium mt-1 capitalize">{employee.shift_type || <span className="text-muted-foreground italic">Default</span>}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Emergency Contact</p>
                      <p className="font-medium mt-1">{employee.emergency_contact || <span className="text-muted-foreground italic">Not provided</span>}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Attendance Summary */}
              <Card className="rounded-3xl border border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> 30-Day Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {attendanceStats ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                        <span className="text-sm font-medium text-green-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Present</span>
                        <span className="font-bold text-green-700">{attendanceStats.present} days</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                        <span className="text-sm font-medium text-red-700 flex items-center gap-2"><XCircle className="h-4 w-4" /> Absent</span>
                        <span className="font-bold text-red-700">{attendanceStats.absent} days</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <span className="text-sm font-medium text-blue-700 flex items-center gap-2"><Calendar className="h-4 w-4" /> Leave</span>
                        <span className="font-bold text-blue-700">{attendanceStats.leave} days</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-muted-foreground text-sm">No attendance records found.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="mt-6 animate-in fade-in duration-300">
            <Card className="rounded-3xl border border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Clock className="h-5 w-5" /> Attendance History</CardTitle>
                <CardDescription>Chronological list of the last 30 days of attendance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {attendanceHistory?.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/40 hover:border-primary/20 hover:bg-muted/50 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full shadow-sm ${record.status === 'present' ? 'bg-green-500' : record.status === 'absent' ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <span className="font-medium text-foreground">{format(new Date(record.date), 'EEEE, MMMM dd, yyyy')}</span>
                      </div>
                      <Badge variant={record.status === 'present' ? 'default' : record.status === 'absent' ? 'destructive' : 'secondary'} className="capitalize shadow-sm">
                        {record.status}
                      </Badge>
                    </div>
                  ))}
                  {(!attendanceHistory || attendanceHistory.length === 0) && (
                    <div className="text-center py-10 border border-dashed rounded-2xl border-border">
                      <p className="text-muted-foreground">No attendance records yet.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-6 animate-in fade-in duration-300">
            {userProfile?.company_id && <DocumentManager employeeId={employee.id} companyId={userProfile.company_id} />}
          </TabsContent>

          <TabsContent value="activity" className="mt-6 animate-in fade-in duration-300">
            <Card className="rounded-3xl border border-border/50 shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5" />Activity Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {activityLogs?.map((log) => (
                    <div key={log.id} className="flex gap-4 p-5 rounded-2xl bg-muted/20 border border-border/40">
                      <div className="flex-shrink-0"><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Activity className="h-5 w-5 text-primary" /></div></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground leading-relaxed">{log.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-xs text-muted-foreground">{format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}</p>
                          {log.action_type && <Badge variant="outline" className="text-[10px] h-5 px-1.5">{log.action_type}</Badge>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!activityLogs || activityLogs.length === 0) && (
                    <div className="text-center py-10 border border-dashed rounded-2xl border-border">
                      <p className="text-muted-foreground">No activity logs found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modern Unified Form Modal instead of old barebones dialog */}
      <EmployeeForm 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => refetch()}
        employeeId={employee.id}
      />
    </Dashboard>
  );
}
